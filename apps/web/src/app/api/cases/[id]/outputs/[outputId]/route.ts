import { z } from "zod";
import { apiContext } from "@/lib/api/context";
import { api } from "@/lib/api/http";
import { loadFolder, verifyFacts } from "@/lib/agent/folder";
import { exportDocx } from "@/lib/agent/docx";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import type { FolderFact } from "@/lib/agent/procedures";
export const GET = api(async (r, route) => {
  const c = await apiContext(r),
    params = await route?.params,
    id = z.string().uuid().parse(params?.id),
    outputId = z.string().uuid().parse(params?.outputId),
    folder = await loadFolder(c, id),
    output = folder.outputs.find((o) => o.id === outputId);
  if (!output || output.stale)
    throw new ApiError(
      409,
      "OUTPUT_STALE",
      "El resultado cambió o no es accesible.",
    );
  const refs: string[] = [];
  const ids = (output.metadata.evidence ?? []).map(
    (ref: { factId: string }) => ref.factId,
  );
  const facts = (await db().query(
    "select * from case_facts where tenant_id=$1 and case_id=$2 and id=any($3::uuid[])",
    [c.tenantId, id, ids],
  )) as unknown as FolderFact[];
  if (facts.length !== ids.length)
    throw new ApiError(409, "SOURCE_CHANGED", "La fuente no es accesible.");
  await verifyFacts(c, facts);
  for (const f of facts)
    refs.push(
      `${f.label}: ${f.passage}. Documento ${f.document_id}, versión ${f.source_version}, página/sección ${f.page}.`,
    );
  const docx = exportDocx(output.title, output.body, refs);
  return new Response(new Uint8Array(docx), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="borrador-${output.id}.docx"`,
    },
  });
});
