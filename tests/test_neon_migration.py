from __future__ import annotations

import re
from pathlib import Path

MIGRATION = Path(__file__).parents[1] / "neon" / "migrations" / "202607270001_foundation.sql"

REQUIRED_TABLES = {
    "tenants",
    "users",
    "tenant_members",
    "roles",
    "clients",
    "client_contacts",
    "leads",
    "lead_activities",
    "cases",
    "case_parties",
    "case_sources",
    "case_assignments",
    "judicial_events",
    "event_reviews",
    "deadlines",
    "calendar_events",
    "tasks",
    "task_checklist_items",
    "communications",
    "communication_templates",
    "communication_approvals",
    "documents",
    "document_versions",
    "fees",
    "payments",
    "expenses",
    "connectors",
    "connector_credentials",
    "connector_sessions",
    "sync_runs",
    "raw_artifacts",
    "jobs",
    "notifications",
    "notification_preferences",
    "audit_logs",
    "client_portal_access",
    "tags",
    "entity_tags",
}


def _sql() -> str:
    return MIGRATION.read_text(encoding="utf-8")


def test_foundation_contains_every_required_domain_table() -> None:
    created = set(re.findall(r"create table public\.([a-z_]+)", _sql(), flags=re.IGNORECASE))

    assert created >= REQUIRED_TABLES


def test_business_tables_are_tenant_scoped() -> None:
    sql = _sql()
    global_tables = {"tenants", "users", "roles"}

    for table in REQUIRED_TABLES - global_tables:
        match = re.search(
            rf"create table public\.{table}\s*\((.*?)\n\);",
            sql,
            flags=re.IGNORECASE | re.DOTALL,
        )
        assert match is not None, table
        assert "tenant_id" in match.group(1), table


def test_migration_has_rls_idempotency_and_encrypted_credentials() -> None:
    sql = _sql().lower()

    assert "enable row level security" in sql
    assert "app.current_user_id()" in sql
    assert "judicial_events_idempotency_idx" in sql
    assert "encrypted_payload bytea not null" in sql
    assert "encrypted_state bytea not null" in sql
    assert "password" not in re.sub(r"--.*", "", sql)
