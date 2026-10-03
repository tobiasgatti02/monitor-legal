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
