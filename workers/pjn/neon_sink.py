from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

from workers.common.contracts import JudicialEvent
from workers.pjn.connector import PjnSyncResult


class NeonPersistenceError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class NeonPersistResult:
    sync_run_id: str
    inserted_events: int


def _validated_uuid(value: str, variable_name: str) -> UUID:
    try:
        return UUID(value)
    except ValueError as exc:
        raise NeonPersistenceError(f"{variable_name} debe ser un UUID existente en Neon") from exc


def _event_parameters(
    event: JudicialEvent,
    *,
    tenant_id: UUID,
    connector_id: UUID,
    sync_run_id: UUID,
) -> tuple[object, ...]:
    return (
        UUID(event.id),
        tenant_id,
        connector_id,
        sync_run_id,
        event.source.value,
        event.source_event_id,
        event.source_url,
        event.event_type.value,
        event.source_date,
        event.detected_at,
        event.title,
        event.original_text,
        event.normalized_text,
        event.content_hash,
        event.severity.value,
        event.review_status.value,
        event.requires_lawyer_review,
        event.possible_deadline,
        Jsonb(event.metadata),
    )


class NeonEventSink:
    """Escritura dual de confianza; la credencial nunca se expone a la web."""

    def __init__(
        self,
        *,
        database_url: str,
        tenant_id: str,
        connector_id: str,
        trigger: str = "SCHEDULE",
    ) -> None:
        self._database_url = database_url
        self._tenant_id = _validated_uuid(tenant_id, "MONITOR_TENANT_ID")
        self._connector_id = _validated_uuid(connector_id, "PJN_CONNECTOR_ID")
        self._trigger = trigger

    def persist(self, sync_result: PjnSyncResult) -> NeonPersistResult:
        now = datetime.now(UTC)
        try:
            with (
                psycopg.connect(
                    self._database_url,
                    connect_timeout=10,
                    application_name="monitor-legal-pjn",
                ) as connection,
                connection.cursor() as cursor,
            ):
                cursor.execute(
                    """
                        insert into public.sync_runs (
                          tenant_id, connector_id, status, trigger,
                          started_at, completed_at, cases_checked, events_detected
                        )
                        values (%s, %s, 'SUCCEEDED', %s, %s, %s, %s, %s)
                        returning id
                        """,
                    (
                        self._tenant_id,
                        self._connector_id,
                        self._trigger,
                        now,
                        now,
                        len(sync_result.current_cases),
                        len(sync_result.events),
                    ),
                )
                row = cursor.fetchone()
                if row is None:
                    raise NeonPersistenceError("Neon no devolvió el identificador de sync")
                sync_run_id = UUID(str(row[0]))

                inserted_events = 0
                for event in sync_result.events:
                    cursor.execute(
                        """
                            insert into public.judicial_events (
                              id, tenant_id, connector_id, sync_run_id, source,
                              source_event_id, source_url, event_type, source_date,
                              detected_at, title, original_text, normalized_text,
                              content_hash, severity, review_status,
                              requires_lawyer_review, possible_deadline, metadata
                            )
                            values (
                              %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                              %s, %s, %s, %s, %s, %s, %s, %s, %s
                            )
                            on conflict do nothing
                            """,
                        _event_parameters(
                            event,
                            tenant_id=self._tenant_id,
                            connector_id=self._connector_id,
                            sync_run_id=sync_run_id,
                        ),
                    )
                    inserted_events += cursor.rowcount

                cursor.execute(
                    """
                        insert into public.audit_logs (
                          tenant_id, action, entity_type, entity_id, metadata
                        )
                        values (%s, 'PJN_SYNC_PERSISTED', 'sync_run', %s, %s)
                        """,
                    (
                        self._tenant_id,
                        str(sync_run_id),
                        Jsonb(
                            {
                                "cases_checked": len(sync_result.current_cases),
                                "events_received": len(sync_result.events),
                                "events_inserted": inserted_events,
                            }
                        ),
                    ),
                )
        except NeonPersistenceError:
            raise
        except (psycopg.Error, OSError) as exc:
            raise NeonPersistenceError(f"No se pudo persistir la corrida en Neon: {exc}") from exc

        return NeonPersistResult(
            sync_run_id=str(sync_run_id),
            inserted_events=inserted_events,
        )
