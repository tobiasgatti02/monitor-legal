import "server-only";
import type { ApiContext } from "@/lib/api/context";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";
import { artifact } from "./storage";
import type { Citation } from "./contracts";
export async function verifyAgentCitations(
  c: ApiContext,
  citations: Citation[],
) {
  const documents = citations.filter((s) => s.documentId),
    ids = [...new Set(documents.map((s) => s.documentId!))];
  if (ids.length > 64)
    throw new ApiError(
      422,
      "CITATION_SCOPE_LIMIT",
      "Consultá las fuentes en grupos más pequeños.",
    );
  if (ids.length) {
    const rows = await db().query(
      "select d.id,d.content_hash,k.source_version,k.artifact_key from documents d join knowledge_documents k on k.document_id=d.id and k.tenant_id=d.tenant_id where d.tenant_id=$1 and d.id=any($2::uuid[]) and d.deleted_at is null",
      [c.tenantId, ids],
    );
    for (const id of ids) {
      const doc = rows.find((d) => d.id === id),
        refs = documents.filter((s) => s.documentId === id);
      if (
        !doc ||
        refs.some(
          (s) =>
            (s.sourceChecksum && s.sourceChecksum !== doc.content_hash) ||
            (s.sourceVersion && s.sourceVersion !== doc.source_version),
        )
      )
        throw new ApiError(
          409,
          "SOURCE_CHANGED",
          "La fuente cambió o ya no es accesible.",
        );
      if (
        !doc.artifact_key ||
        refs.some((s) => !s.sourceChecksum || !s.sourceVersion)
      )
        throw new ApiError(
          409,
          "LEGACY_CITATION_REINDEX",
          "Reindexá el documento para verificar referencias estables.",
        );
      // Process one artifact at a time; never retain all originals/pages/vectors in a cache.
      const pages = (await artifact(doc.artifact_key)) as {
        page: number;
        text: string;
      }[];
      for (const source of refs) {
        const text = pages
          .find((p) => p.page === source.pageStart)
          ?.text.replace(/\u0000|\r/g, "")
          .trim();
        if (!text?.includes(source.excerpt))
          throw new ApiError(
            422,
            "PASSAGE_NOT_VERIFIED",
            "El pasaje citado no está en la fuente versionada.",
          );
      }
    }
  }
  for (const table of ["cases", "clients"] as const) {
    const values = [
      ...new Set(
        citations
          .map((s) => (table === "cases" ? s.caseId : s.clientId))
          .filter((x): x is string => Boolean(x)),
      ),
    ];
    if (!values.length) continue;
    const rows = await db().query(
      `select id from ${table} where tenant_id=$1 and id=any($2::uuid[]) and deleted_at is null`,
      [c.tenantId, values],
    );
    if (rows.length !== values.length)
      throw new ApiError(
        403,
        "SOURCE_REVOKED",
        "La fuente ya no es accesible.",
      );
  }
}
