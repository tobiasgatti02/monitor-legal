import { NextResponse } from "next/server";

const operations = {
  "/api/today": ["get"],
  "/api/cases": ["get", "post"],
  "/api/cases/{id}": ["get", "patch", "delete"],
  "/api/cases/{id}/events": ["get"],
  "/api/cases/{id}/tasks": ["get", "post"],
  "/api/cases/{id}/communications": ["get", "post"],
  "/api/events": ["get"],
  "/api/events/{id}/review": ["post"],
  "/api/clients": ["get", "post"],
  "/api/clients/{id}": ["get", "patch", "delete"],
  "/api/clients/{id}/contact": ["post"],
  "/api/leads": ["get", "post"],
  "/api/leads/{id}": ["get", "patch", "delete"],
  "/api/leads/{id}/activities": ["get", "post"],
  "/api/leads/{id}/convert": ["post"],
  "/api/tasks": ["get", "post"],
  "/api/tasks/{id}": ["get", "patch", "delete"],
  "/api/deadlines": ["get", "post"],
  "/api/deadlines/{id}": ["get", "patch", "delete"],
  "/api/calendar": ["get", "post"],
  "/api/calendar/{id}": ["get", "patch", "delete"],
  "/api/documents": ["get", "post"],
  "/api/documents/{id}": ["get", "delete"],
  "/api/documents/{id}/download": ["get"],
  "/api/communications": ["get", "post"],
  "/api/communications/{id}": ["get", "patch", "delete"],
  "/api/communications/{id}/action": ["post"],
  "/api/fees": ["get", "post"],
  "/api/fees/{id}": ["get", "patch", "delete"],
  "/api/payments": ["get", "post"],
  "/api/payments/{id}": ["get", "patch", "delete"],
  "/api/integrations": ["get", "post"],
  "/api/integrations/{id}": ["get", "patch"],
  "/api/integrations/{id}/test": ["post"],
  "/api/integrations/{id}/sync": ["post"],
  "/api/sync-runs": ["get"],
  "/api/alerts": ["get", "patch"],
  "/api/audit": ["get"],
  "/api/client-portal": ["get", "post"],
  "/api/team": ["get", "post"],
  "/api/settings": ["get", "patch"],
} as const;

function paths() {
  return Object.fromEntries(
    Object.entries(operations).map(([path, methods]) => [
      path,
      Object.fromEntries(
        methods.map((method) => [
          method,
          {
            responses: {
              "200": { description: "Operación correcta" },
              "401": { description: "Sesión requerida" },
              "403": { description: "Permisos insuficientes" },
              "422": { description: "Validación fallida" },
            },
          },
        ]),
      ),
    ]),
  );
}

export function GET() {
  return NextResponse.json({
    openapi: "3.1.0",
    info: {
      title: "Monitor Legal API",
      version: "0.2.0",
      description:
        "API multi-tenant para el dashboard de Agustín Gatti. Autenticación por cookie; sin OAuth.",
    },
    servers: [{ url: "/" }],
    security: [{ sessionCookie: [] }],
    components: {
      securitySchemes: {
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "better-auth.session_token",
        },
      },
    },
    paths: paths(),
  });
}
