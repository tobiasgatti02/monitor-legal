import "server-only";
import { createHmac } from "node:crypto";
import { ApiError } from "@/lib/api/errors";
export function uploadTicket(
  key: string,
  size: number,
  name: string,
  mime: string,
) {
  if (!process.env.LEGAL_AI_URL || !process.env.LEGAL_AI_KEY)
    throw new ApiError(
      503,
      "STORAGE_NOT_CONFIGURED",
      "El almacenamiento no está conectado.",
    );
  const claims = {
    key,
    size,
    name,
    mime,
    origin: new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000")
      .origin,
    exp: Date.now() + 5 * 60 * 1000,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url"),
    mac = createHmac("sha256", process.env.LEGAL_AI_KEY)
      .update(payload)
      .digest("hex");
  return `${process.env.LEGAL_AI_URL}/upload?ticket=${payload}.${mac}`;
}
export async function storedFile(key: string, metadata = false) {
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(key))
    throw new ApiError(
      422,
      "INVALID_STORAGE_KEY",
      "Referencia de archivo inválida.",
    );
  const res = await fetch(
    `${process.env.LEGAL_AI_URL}/files/${key}${metadata ? "?metadata=1" : ""}`,
    {
      headers: { Authorization: `Bearer ${process.env.LEGAL_AI_KEY}` },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!res.ok)
    throw new ApiError(
      503,
      "STORAGE_UNAVAILABLE",
      "El archivo no está disponible temporalmente.",
    );
  return res;
}

// Derivatives have a separate, private contract. This never accepts original keys.
export async function artifact(key: string, value?: unknown) {
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[a-f0-9]{64}$/.test(key))
    throw new ApiError(
      422,
      "INVALID_ARTIFACT_KEY",
      "Referencia de derivado inválida.",
    );
  if (!process.env.LEGAL_AI_URL || !process.env.LEGAL_AI_KEY)
    throw new ApiError(
      503,
      "STORAGE_NOT_CONFIGURED",
      "Falta almacenamiento privado para derivados.",
    );
  const res = await fetch(`${process.env.LEGAL_AI_URL}/artifacts/${key}`, {
    method: value === undefined ? "GET" : "PUT",
    headers: {
      Authorization: `Bearer ${process.env.LEGAL_AI_KEY}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15000),
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
  });
  if (!res.ok)
    throw new ApiError(
      503,
      "ARTIFACT_UNAVAILABLE",
      "El derivado privado no está disponible.",
    );
  return value === undefined ? res.json() : undefined;
}
