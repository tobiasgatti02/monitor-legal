import "server-only";
import { createHash } from "node:crypto";
import type { ApiContext } from "@/lib/api/context";
import { db } from "@/lib/db";
import { rrf } from "./core";
import type { Chunk } from "./contracts";
import { budgetScope } from "./budgets";
import { gateway } from "./gateway";

const select = `k.id, k.document_id as "documentId", d.name as title, k.content,
  k.source_version as "sourceVersion",d.content_hash as "sourceChecksum",k.page_start as "pageStart", k.page_end as "pageEnd"`;
export async function retrieve(
  context: ApiContext,
  query: string,
  caseId?: string,
) {
  // Runtime role enforces document + matter RLS before either ranking sees text.
  const conditions =
    "k.tenant_id=$1 and exists(select 1 from knowledge_documents kd where kd.document_id=d.id and kd.checksum=d.content_hash and kd.source_version=k.source_version and kd.artifact_key is not null and kd.status in('READY','PARTIAL')) and d.deleted_at is null and ($3::uuid is null or d.case_id=$3::uuid)";
  const lexical = (await db().query(
    `select ${select} from knowledge_chunks k join documents d on d.id=k.document_id and d.tenant_id=k.tenant_id
    where ${conditions} and (k.search @@ websearch_to_tsquery('spanish',$2) or k.content ilike '%'||$2||'%')
    order by ts_rank_cd(k.search,websearch_to_tsquery('spanish',$2)) desc limit 40`,
    [context.tenantId, query, caseId ?? null],
  )) as Chunk[];
  let semantic: Chunk[] = [];
  let mode = "lexical";
  try {
    if (!budgetScope()) return { chunks: lexical.slice(0, 8), mode };
    const key = createHash("sha256")
      .update(
        `query-vector:bge-m3-v1:${context.tenantId}:${context.actorId}:${query}`,
      )
      .digest("hex");
    const cached = await db().query(
      "select payload from agent_cache where key=$1 and tenant_id=$2 and user_id=$3 and expires_at>now()",
      [key, context.tenantId, context.actorId],
    );
    const saved = cached[0]?.payload?.vector as unknown;
    const valid =
      Array.isArray(saved) &&
      saved.length === 1024 &&
      saved.every((x) => typeof x === "number" && Number.isFinite(x));
    const vector = valid ? saved : (await gateway.embed([query]))[0]!;
    if (!valid)
      await db().query(
        "insert into agent_cache(key,tenant_id,user_id,payload,expires_at) values($1,$2,$3,$4::jsonb,now()+interval '1 day') on conflict(key) do update set payload=excluded.payload,expires_at=excluded.expires_at",
        [key, context.tenantId, context.actorId, JSON.stringify({ vector })],
      );
    // Cache only vectors, never evidence text or answers: authorization runs again below.

    semantic = (await db().query(
      `select ${select} from knowledge_chunks k join documents d on d.id=k.document_id and d.tenant_id=k.tenant_id
      where ${conditions} and k.embedding is not null order by k.embedding <=> $2::vector limit 40`,
      [context.tenantId, JSON.stringify(vector), caseId ?? null],
    )) as Chunk[];
    mode = "hybrid";
  } catch {
    /* lexical retrieval remains available, reported explicitly */
  }
  let chunks = rrf(lexical, semantic);
  if (chunks.length > 1 && mode === "hybrid") {
    try {
      const result = await gateway.rerank(query, chunks);
      const ranked = result.response
        .filter((r) => Number.isInteger(r.id) && chunks[r.id])
        .map((r) => ({ ...chunks[r.id]!, score: r.score }));
      if (ranked.length) {
        chunks = ranked;
        mode = "hybrid-reranked";
      }
    } catch {
      /* preserve fusion order */
    }
  }
  return { chunks: chunks.slice(0, 8), mode };
}
