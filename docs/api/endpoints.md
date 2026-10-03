# API del MVP

Todas las rutas, salvo `/api/health`, `/api/openapi` y Better Auth, requieren una sesión.
El backend resuelve `tenant_id` desde la membresía del usuario; nunca lo acepta del body ni
de query params.

Las colecciones soportan `page` y `limit` (máximo 100), y devuelven:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 25,
    "total": 0,
    "pages": 1,
    "hasNext": false,
    "hasPrevious": false
  }
}
```

## Rutas

| Dominio | Rutas |
| --- | --- |
| Hoy | `GET /api/today` |
| Causas | `GET/POST /api/cases`, `GET/PATCH/DELETE /api/cases/:id` |
| Relaciones de causa | `GET /api/cases/:id/events`, `GET/POST /api/cases/:id/tasks`, `GET/POST /api/cases/:id/communications` |
| Novedades | `GET /api/events`, `POST /api/events/:id/review` |
| Clientes | `GET/POST /api/clients`, `GET/PATCH/DELETE /api/clients/:id`, `POST /api/clients/:id/contact` |
| Leads | `GET/POST /api/leads`, `GET/PATCH/DELETE /api/leads/:id`, `GET/POST /api/leads/:id/activities`, `POST /api/leads/:id/convert` |
| Tareas | `GET/POST /api/tasks`, `GET/PATCH/DELETE /api/tasks/:id` |
| Plazos | `GET/POST /api/deadlines`, `GET/PATCH/DELETE /api/deadlines/:id` |
| Calendario | `GET/POST /api/calendar`, `GET/PATCH/DELETE /api/calendar/:id` |
| Documentos | `GET/POST /api/documents`, `GET/DELETE /api/documents/:id`, `GET /api/documents/:id/download` |
| Comunicaciones | `GET/POST /api/communications`, `GET/PATCH/DELETE /api/communications/:id`, `POST /api/communications/:id/action` |
| Honorarios | `GET/POST /api/fees`, `GET/PATCH/DELETE /api/fees/:id` |
| Pagos | `GET/POST /api/payments`, `GET/PATCH/DELETE /api/payments/:id` |
| Integraciones | `GET/POST /api/integrations`, `GET/PATCH /api/integrations/:id`, `POST /api/integrations/:id/test`, `POST /api/integrations/:id/sync` |
| Operación | `GET /api/sync-runs`, `GET/PATCH /api/alerts`, `GET /api/audit` |
| Administración | `GET/POST /api/team`, `GET/PATCH /api/settings`, `GET/POST /api/client-portal` |

El documento OpenAPI legible por herramientas se sirve en `GET /api/openapi`.

## Comunicaciones

Las acciones son `SUBMIT`, `APPROVE`, `REJECT` y `SEND`. Los emails salen por Gmail SMTP
con App Password. WhatsApp devuelve un link `wa.me`; no usa API paga. Una comunicación
judicial no puede enviarse sin pasar por `PENDING_APPROVAL` y `APPROVED`.

## Sincronizaciones

`sync` y `test` crean un job idempotente. Si existen `GITHUB_DISPATCH_TOKEN` y
`GITHUB_REPOSITORY`, también despachan `monitor.yml`; de otro modo el job queda visible en
la cola para un worker.

## Documentos

El MVP guarda archivos de hasta 5 MB en `document_blobs` de Neon y conserva hash SHA-256.
La API nunca devuelve el contenido en listados; la descarga utiliza un endpoint autenticado
con `Cache-Control: no-store`.
