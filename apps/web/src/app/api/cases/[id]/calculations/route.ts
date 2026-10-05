import { z } from "zod";
import { apiContext, requireWrite } from "@/lib/api/context";
import { api, jsonBody, response } from "@/lib/api/http";
import { loadFolder } from "@/lib/agent/folder";
import { arithmeticScenario } from "@/lib/agent/calculations";
import { db } from "@/lib/db";
export const POST = api(async (r, route) => {
  const c = await apiContext(r);
  requireWrite(c);
  const id = z
    .string()
    .uuid()
    .parse((await route?.params)?.id);
  await loadFolder(c, id);
  const input = await jsonBody(
      r,
      z
        .object({
          amounts: z
            .array(z.string().regex(/^-?\d{1,18}(?:\.\d{1,2})?$/))
            .min(1)
            .max(100),
          rateBasisPoints: z.number().int().min(0).max(100000),
        })
        .strict(),
    ),
    result = arithmeticScenario(input.amounts, input.rateBasisPoints);
  await db().query(
    "insert into case_outputs(tenant_id,case_id,kind,title,body,metadata,created_by) values($1,$2,'ARITHMETIC','Escenario aritmético para revisión',$3,$4::jsonb,$5)",
    [
      c.tenantId,
      id,
      `Suma: ${result.total}. Porcentaje: ${result.rateAmount}. No es una liquidación jurídica.`,
      JSON.stringify(result),
      c.actorId,
    ],
  );
  return response(result);
});
