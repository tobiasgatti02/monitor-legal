#!/usr/bin/env bash
# Creates its own disposable loopback cluster. Does not read DATABASE_URL or .env files.
set -euo pipefail
cd "$(dirname "$0")/.."
config_bin="${PG_CONFIG:-$(command -v pg_config)}"
pg_bin="$($config_bin --bindir)"
shared_dir="$($config_bin --sharedir)"
if [[ ! -f "$shared_dir/extension/vector.control" ]]; then
  echo "pgvector is required in this local PostgreSQL installation; no external database will be used." >&2
  exit 1
fi
task_dir="$(mktemp -d "${TMPDIR:-/tmp}/monitor-agent-local.XXXXXX")"
cleanup() {
  "$pg_bin/pg_ctl" -D "$task_dir/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf -- "$task_dir"
}
trap cleanup EXIT INT TERM
"$pg_bin/initdb" -D "$task_dir/data" --auth=trust --no-locale >/dev/null
"$pg_bin/pg_ctl" -D "$task_dir/data" -o "-h 127.0.0.1 -p 55439 -k $task_dir" -l "$task_dir/postgres.log" -w start >/dev/null
"$pg_bin/createuser" -h 127.0.0.1 -p 55439 --superuser neondb_owner
PATH="$pg_bin:$PATH" python3 scripts/agent-isolated-db.py
PATH="$pg_bin:$PATH" LEGAL_TEST_PG_LOCAL=true LEGAL_TEST_PDF_MEMORY=true npm --workspace @monitor-legal/web run test
npm run typecheck
npm run lint:web
npm run build
