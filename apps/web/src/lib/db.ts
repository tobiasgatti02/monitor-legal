import "server-only";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { dbActor } from "@/lib/db-scope";

let queryClient: NeonQueryFunction<false, false> | undefined;
let roleChecked: Promise<void> | undefined;

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function db() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL no está configurada");
  }

  queryClient ??= neon(connectionString);
  const sql = queryClient;
  const checkRole = () =>
    (roleChecked ??= (async () => {
      const rows = await sql.query(
        "select rolbypassrls,rolsuper from pg_roles where rolname=current_user",
      );
      if (!rows[0] || rows[0].rolbypassrls || rows[0].rolsuper)
        throw new Error("Runtime database role must enforce RLS");
    })());
  return {
    async transaction(
      statements: { statement: string; parameters?: unknown[] }[],
    ) {
      await checkRole();
      const results = await sql.transaction([
        sql.query("select set_config('request.jwt.claim.sub', $1, true)", [
          dbActor(),
        ]),
        ...statements.map((s) => sql.query(s.statement, s.parameters ?? [])),
      ]);
      return results.slice(1);
    },
    async query(statement: string, parameters: unknown[] = []) {
      await checkRole();
      const actorId = dbActor();
      const results = await sql.transaction([
        sql.query("select set_config('request.jwt.claim.sub', $1, true)", [
          actorId,
        ]),
        sql.query(statement, parameters),
      ]);
      return results[1]!;
    },
  };
}
