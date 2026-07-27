from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
import re
from uuid import UUID, uuid5

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


CASE_NAMESPACE = UUID("496f1723-287e-4f3b-8937-838c8468d91b")
DOCKET_PATTERN = re.compile(r"\b([A-Z]{1,6}\s+\d{1,7}(?:[-.]\d{1,7})?/\d{2,4})\b")


def _validated_uuid(value: str, variable_name: str) -> UUID:
    try:
        return UUID(value)
    except ValueError as exc:
        raise NeonPersistenceError(f"{variable_name} debe ser un UUID existente en Neon") from exc


def _event_parameters(
    event: JudicialEvent,
    *,
    tenant_id: UUID,
    case_id: UUID | None,
    connector_id: UUID,
    sync_run_id: UUID,
) -> tuple[object, ...]:
    return (
        UUID(event.id),
        tenant_id,
        case_id,
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


def _new_case_identity(event: JudicialEvent) -> tuple[UUID, str | None]:
    docket_match = DOCKET_PATTERN.search(event.normalized_text.upper())
    docket_number = docket_match.group(1) if docket_match else None
    return uuid5(CASE_NAMESPACE, event.id), docket_number


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
                    select t.created_by
                      from public.tenants t
                      join public.users u on u.id = t.created_by
                     where t.id = %s
                     limit 1
                    """,
                    (self._tenant_id,),
                )
                actor_row = cursor.fetchone()
                if actor_row is None:
                    raise NeonPersistenceError(
                        "El tenant no tiene un usuario propietario válido para el worker"
                    )
                system_actor = str(actor_row[0])

                cursor.execute(
                    """
                        insert into public.sync_runs (
                          tenant_id, connector_id, status, trigger,
                          started_at, completed_at, cases_checked, events_detected,
                          created_by
                        )
                        values (%s, %s, 'SUCCEEDED', %s, %s, %s, %s, %s, %s)
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
                        system_actor,
                    ),
                )
                row = cursor.fetchone()
                if row is None:
                    raise NeonPersistenceError("Neon no devolvió el identificador de sync")
                sync_run_id = UUID(str(row[0]))

                inserted_events = 0
                for event in sync_result.events:
                    case_id: UUID | None = None
                    if event.event_type.value == "NEW_CASE":
                        case_id, docket_number = _new_case_identity(event)
                        cursor.execute(
                            """
                            insert into public.cases (
                              id, tenant_id, docket_number, title, jurisdiction,
                              status, priority, last_movement_at, created_by
                            )
                            values (%s, %s, %s, %s, 'PJN', 'ACTIVE', 'MEDIUM', %s, %s)
                            on conflict (id) do update
                              set title = excluded.title,
                                  docket_number = coalesce(
                                    public.cases.docket_number,
                                    excluded.docket_number
                                  ),
                                  last_movement_at = greatest(
                                    public.cases.last_movement_at,
                                    excluded.last_movement_at
                                  )
                            """,
                            (
                                case_id,
                                self._tenant_id,
                                docket_number,
                                event.normalized_text,
                                event.detected_at,
                                system_actor,
                            ),
                        )
                        cursor.execute(
                            """
                            insert into public.case_sources (
                              tenant_id, case_id, connector_id, source,
                              source_case_id, source_url, last_synced_at,
                              content_hash, created_by
                            )
                            values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                            on conflict (tenant_id, connector_id, source_case_id)
                            do update set
                              case_id = excluded.case_id,
                              source_url = excluded.source_url,
                              last_synced_at = excluded.last_synced_at,
                              content_hash = excluded.content_hash
                            """,
                            (
                                self._tenant_id,
                                case_id,
                                self._connector_id,
                                event.source.value,
                                docket_number or event.content_hash,
                                event.source_url,
                                event.detected_at,
                                event.content_hash,
                                system_actor,
                            ),
                        )

                    cursor.execute(
                        """
                            insert into public.judicial_events (
                              id, tenant_id, case_id, connector_id, sync_run_id, source,
                              source_event_id, source_url, event_type, source_date,
                              detected_at, title, original_text, normalized_text,
                              content_hash, severity, review_status,
                              requires_lawyer_review, possible_deadline, metadata
                            )
                            values (
                              %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                              %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                            )
                            on conflict do nothing
                            """,
                        _event_parameters(
                            event,
                            tenant_id=self._tenant_id,
                            case_id=case_id,
                            connector_id=self._connector_id,
                            sync_run_id=sync_run_id,
                        ),
                    )
                    event_inserted = cursor.rowcount
                    inserted_events += event_inserted
                    if event_inserted:
                        cursor.execute(
                            """
                            insert into public.notifications (
                              tenant_id, user_id, event_id, channel, priority,
                              title, body, idempotency_key, created_by
                            )
                            select %s, tm.user_id, %s, 'DASHBOARD', %s,
                                   %s, %s, %s, %s
                              from public.tenant_members tm
                             where tm.tenant_id = %s and tm.active
                            on conflict (tenant_id, user_id, idempotency_key)
                            do nothing
                            """,
                            (
                                self._tenant_id,
                                UUID(event.id),
                                event.severity.value,
                                event.title,
                                event.original_text,
                                f"judicial-event:{event.id}",
                                system_actor,
                                self._tenant_id,
                            ),
                        )

                cursor.execute(
                    """
                    update public.connectors
                       set status = 'CONNECTED',
                           last_attempt_at = %s,
                           last_success_at = %s,
                           last_error_code = null,
                           last_error_message = null
                     where tenant_id = %s and id = %s
                    """,
                    (now, now, self._tenant_id, self._connector_id),
                )

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
