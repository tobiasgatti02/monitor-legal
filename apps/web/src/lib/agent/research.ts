import "server-only";
import { request as httpsRequest } from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireWrite, audit, type ApiContext } from "@/lib/api/context";
import { ApiError } from "@/lib/api/errors";
import { loadFolder } from "./folder";
import { requireCapability } from "./flags";
const hosts = new Set([
  "www.scba.gov.ar",
  "scba.gov.ar",
  "juba.scba.gov.ar",
  "servicios.infoleg.gob.ar",
  "www.saij.gob.ar",
]);
export function allowedSource(url: string) {
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    (u.port && u.port !== "443") ||
    u.username ||
    u.password ||
    !hosts.has(u.hostname) ||
    isIP(u.hostname)
  )
    throw new ApiError(
      422,
      "SOURCE_NOT_ALLOWED",
      "Usá una fuente oficial HTTPS permitida.",
    );
  return u;
}
export function publicAddress(address: string) {
  if (address.includes(":"))
    return /^2[0-9a-f]{3}:/i.test(address) && !/^2001:(db8|0):/i.test(address); // conservative global IPv6 allow; mapped/private addresses rejected
  const n = address.split(".").map(Number);
  if (n.length !== 4 || n.some((x) => !Number.isInteger(x) || x < 0 || x > 255))
    return false;
  return (
    ![0, 10, 127].includes(n[0]!) &&
    n[0]! < 224 &&
    !(n[0] === 169 && n[1] === 254) &&
    !(n[0] === 172 && n[1]! >= 16 && n[1]! <= 31) &&
    !(n[0] === 192 && [0, 168].includes(n[1]!)) &&
    !(n[0] === 100 && n[1]! >= 64 && n[1]! <= 127) &&
    !(n[0] === 198 && [18, 19, 51].includes(n[1]!)) &&
    !(n[0] === 203 && n[1] === 0 && n[2] === 113)
  );
}
export function cleanSource(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) =>
      Number(n) > 0 && Number(n) <= 0x10ffff
        ? String.fromCodePoint(Number(n))
        : "",
    )
    .replace(/\s+/g, " ")
    .trim();
}
export async function fetchOfficial(
  sourceUrl: string,
  redirects = 0,
): Promise<{ url: string; text: string }> {
  const url = allowedSource(sourceUrl),
    addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new ApiError(
      422,
      "UNSAFE_SOURCE_ADDRESS",
      "La fuente resolvió a una dirección no permitida.",
    );
  // Pin validated DNS result for this request. TLS still validates the original host.
  const selected = addresses[0]!;
  const result = await new Promise<{ location?: string; body?: string }>(
    (resolve, reject) => {
      const request = httpsRequest(
        url,
        {
          lookup: (_name, _options, callback) =>
            callback(null, selected.address, selected.family),
          signal: AbortSignal.timeout(8000),
          headers: {
            Accept: "text/html,text/plain",
            "User-Agent": "MonitorLegal/1.0 official-source-reader",
          },
          timeout: 8000,
        },
        (res) => {
          if (
            res.statusCode &&
            [301, 302, 303, 307, 308].includes(res.statusCode)
          ) {
            res.resume();
            resolve({ location: res.headers.location });
            return;
          }
          if (
            res.statusCode !== 200 ||
            !/^(text\/html|text\/plain)/i.test(
              res.headers["content-type"] ?? "",
            )
          ) {
            res.resume();
            reject(
              new ApiError(
                422,
                "SOURCE_TEXT_UNAVAILABLE",
                "No se verificó texto completo en esta URL. Podés importar una fuente manualmente.",
              ),
            );
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > 400000) {
              res.destroy();
              reject(
                new ApiError(
                  413,
                  "SOURCE_TOO_LARGE",
                  "La fuente excede el límite de lectura.",
                ),
              );
            } else chunks.push(chunk);
          });
          res.on("end", () =>
            resolve({ body: Buffer.concat(chunks).toString("utf8") }),
          );
          res.on("error", reject);
        },
      );
      request.on("timeout", () => request.destroy(new Error("SOURCE_TIMEOUT")));
      request.on("error", reject);
      request.end();
    },
  );
  if (result.location) {
    if (redirects >= 2)
      throw new ApiError(
        422,
        "REDIRECT_LIMIT",
        "La fuente excede el límite de redirecciones.",
      );
    return fetchOfficial(new URL(result.location, url).href, redirects + 1);
  }
  const text = cleanSource(result.body ?? "");
  if (text.length < 40 || text.length > 100000)
    throw new ApiError(
      422,
      "SOURCE_TEXT_UNAVAILABLE",
      "No se verificó un pasaje útil dentro de los límites.",
    );
  return { url: url.href, text };
}
export const sourceSchema = z
  .object({
    url: z.url(),
    title: z.string().min(1).max(300),
    court: z.string().min(1).max(200),
    decisionDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    jurisdiction: z.string().min(1).max(200),
    sourceKind: z.enum(["SUMMARY", "FULL_TEXT", "NORM"]),
    content: z.string().min(40).max(100000).optional(),
    fragment: z.string().min(1).max(4000),
    position: z
      .enum(["FAVORABLE", "ADVERSE", "UNASSESSED"])
      .default("UNASSESSED"),
  })
  .strict();
export async function researchSources(
  c: ApiContext,
  caseId: string,
  query = "",
) {
  requireCapability("research");
  await loadFolder(c, caseId);
  return db().query(
    `select id,url,title,court,decision_date,jurisdiction,source_kind,fragment,checksum,position,access_origin,consulted_at,current_validity,reviewed_by from legal_research_sources where tenant_id=$1 and case_id=$2 and (title ilike '%'||$3||'%' or content ilike '%'||$3||'%') order by consulted_at desc limit 6`,
    [c.tenantId, caseId, query],
  );
}
export async function saveResearchSource(
  c: ApiContext,
  caseId: string,
  input: z.infer<typeof sourceSchema>,
) {
  requireCapability("research");
  requireWrite(c);
  const folder = await loadFolder(c, caseId);
  allowedSource(input.url);
  if (input.jurisdiction !== folder.cause.jurisdiction)
    throw new ApiError(
      422,
      "JURISDICTION_MISMATCH",
      "La autoridad debe identificar la jurisdicción registrada; comparaciones requieren revisión específica.",
    );
  const current = await researchSources(c, caseId);
  if (current.length >= 6)
    throw new ApiError(
      422,
      "SOURCE_COUNT_LIMIT",
      "La investigación acotada admite hasta seis fuentes.",
    );
  const source = input.content
    ? { text: input.content, url: input.url }
    : await fetchOfficial(input.url);
  if (!source.text.includes(input.fragment))
    throw new ApiError(
      422,
      "SOURCE_FRAGMENT_INVALID",
      "El pasaje no aparece en el texto consultado.",
    );
  const checksum = createHash("sha256").update(source.text).digest("hex");
  const results = await db().transaction([
    {
      statement: "select id from cases where tenant_id=$1 and id=$2 for update",
      parameters: [c.tenantId, caseId],
    },
    {
      statement: `insert into legal_research_sources(tenant_id,case_id,url,title,court,decision_date,jurisdiction,source_kind,content,checksum,fragment,position,access_origin,created_by) select $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14 where (select count(*) from legal_research_sources where tenant_id=$1 and case_id=$2)<6 on conflict do nothing returning id`,
      parameters: [
        c.tenantId,
        caseId,
        source.url,
        input.title,
        input.court,
        input.decisionDate ?? null,
        input.jurisdiction,
        input.sourceKind,
        source.text,
        checksum,
        input.fragment,
        input.position,
        input.content ? "MANUAL" : "FETCH",
        c.actorId,
      ],
    },
  ]);
  const rows = results[1]!;
  if (
    !rows.length &&
    !(
      await db().query(
        "select id from legal_research_sources where tenant_id=$1 and case_id=$2 and checksum=$3",
        [c.tenantId, caseId, checksum],
      )
    ).length
  )
    throw new ApiError(
      422,
      "SOURCE_COUNT_LIMIT",
      "La investigación acotada admite hasta seis fuentes.",
    );
  await audit(c, "RESEARCH_SOURCE_SAVED", "case", caseId, {
    checksum,
    sourceKind: input.sourceKind,
    origin: input.content ? "MANUAL" : "FETCH",
  });
  return {
    id: rows[0]?.id,
    duplicate: !rows.length,
    currentValidity: "UNVERIFIED",
    metadataOrigin: "Aportada por el usuario, pendiente de revisión",
    liveSearch: false,
  };
}
