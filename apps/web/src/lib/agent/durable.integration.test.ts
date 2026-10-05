import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
vi.mock("server-only", () => ({}));
const harness = vi.hoisted(() => ({
  database: "",
  actor: "fixture-owner",
  artifacts: new Map<string, unknown>(),
  fetches: 0,
  queries: 0,
  bytes: 0,
}));
function literal(v: unknown): string {
  if (v == null) return "null";
  if (Array.isArray(v))
    return (
      "'" +
      ("{" + v.map((x) => JSON.stringify(x)).join(",") + "}").replaceAll(
        "'",
        "''",
      ) +
      "'"
    );
  return typeof v === "number" || typeof v === "boolean"
    ? String(v)
    : "'" + String(v).replaceAll("'", "''") + "'";
}
function sqlRun(sql: string, actor = false) {
  return execFileSync(
    "psql",
    [
      "-X",
      "-h",
      "127.0.0.1",
      "-p",
      "55439",
      "-U",
      "neondb_owner",
      "-d",
      harness.database,
      "-v",
      "ON_ERROR_STOP=1",
      "-Atq",
    ],
    {
      input: actor
        ? `begin;set local role monitor_runtime;select set_config('request.jwt.claim.sub','${harness.actor}',true);${sql};commit;`
        : sql,
      encoding: "utf8",
    },
  );
}
function resultStatement(sql: string, params: unknown[] = []) {
  sql = sql.replace(/\$(\d+)/g, (_, i) => literal(params[Number(i) - 1]));
  if (/^\s*with\b/i.test(sql)) {
    let depth = 0,
      quoted = false,
      pos = -1;
    for (let i = 4; i < sql.length; i++) {
      const ch = sql[i];
      if (ch === "'") {
        if (quoted && sql[i + 1] === "'") {
          i++;
          continue;
        }
        quoted = !quoted;
        continue;
      }
      if (quoted) continue;
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (
        depth === 0 &&
        /^(?:select|update|insert|delete)\b/i.test(sql.slice(i))
      ) {
        pos = i;
        break;
      }
    }
    if (pos < 0) throw Error("Unsupported fixture CTE");
    let main = sql.slice(pos);
    if (!/^select/i.test(main) && !/returning/i.test(main))
      main += " returning 1 as affected";
    return (
      sql.slice(0, pos) +
      `, test_result as (${main}) select coalesce(jsonb_agg(test_result),'[]') from test_result`
    );
  }
  if (/^\s*(update|insert|delete)/i.test(sql) && !/returning/i.test(sql))
    sql += " returning 1 as affected";
  return `with test_result as (${sql}) select coalesce(jsonb_agg(test_result),'[]') from test_result`;
}
function sqlBatch(statements: { statement: string; parameters?: unknown[] }[]) {
  harness.queries += statements.length;
  const output = sqlRun(
    statements
      .map((s) => resultStatement(s.statement, s.parameters) + ";")
      .join("\n"),
    true,
  );
  return output
    .split("\n")
    .filter((l) => l.startsWith("["))
    .map((l) => {
      harness.bytes += Buffer.byteLength(l);
      return JSON.parse(l);
    });
}
function sqlResult(sql: string, params: unknown[] = []) {
  return sqlBatch([{ statement: sql, parameters: params }])[0] ?? [];
}
vi.mock("@/lib/db", () => ({
  db: () => ({
    query: async (sql: string, params: unknown[]) => sqlResult(sql, params),
    transaction: async (
      statements: { statement: string; parameters: unknown[] }[],
    ) => sqlBatch(statements),
  }),
}));
vi.mock("./storage", () => ({
  artifact: async (key: string, value?: unknown) => {
    if (value !== undefined) {
      harness.artifacts.set(key, value);
      return;
    }
    if (!harness.artifacts.has(key)) throw Error("artifact missing");
    return harness.artifacts.get(key);
  },
  storedFile: vi.fn(),
}));
import { enqueueDocument, runDocumentStep } from "./jobs";
import { saveTemplate, approveTemplate, draftMutation } from "./drafts";
import { manualImport } from "./imports";
import { proposeClientDraft } from "./communication-drafts";
import { decideApproval } from "./approvals";
import { saveResearchSource } from "./research";
import { loadFolder, folderMutation } from "./folder";
import { agentTools } from "./tools";
import { askAgent } from "./service";
import { createAgentDocument, readAgentDocument } from "./study-documents";
const root = resolve(process.cwd(), "../..");
const c = {
  actorId: "fixture-owner",
  actorName: "Fixture",
  tenantId: "10000000-0000-4000-8000-000000000010",
  tenantName: "SYNTHETIC",
  role: "OWNER" as const,
};
const cause = "20000000-0000-4000-8000-000000000010";
const suite =
  process.env.LEGAL_TEST_PG_LOCAL === "true" ? describe : describe.skip;
suite(
  "Node ingestion with real isolated Postgres and synthetic provider/storage",
  () => {
    it("reports today's shared allowance, retains usage and blocks over 10,000 under RLS", () => {
      sqlRun(`begin;
        insert into ai_buckets(scope,scope_key,day,neurons) values
          ('app','app',(now() at time zone 'UTC')::date,9995),
          ('tenant','${c.tenantId}',(now() at time zone 'UTC')::date,9992),
          ('actor','${c.actorId}',(now() at time zone 'UTC')::date,9990)
          on conflict(scope,scope_key,day) do update set neurons=excluded.neurons;
        insert into ai_buckets(scope,scope_key,day,neurons) values
          ('app','app',(now() at time zone 'UTC')::date-1,10000)
          on conflict(scope,scope_key,day) do update set neurons=excluded.neurons;
        set local role monitor_runtime;
        select set_config('request.jwt.claim.sub','${c.actorId}',true);
        do $$declare u jsonb; w uuid;begin
          u:=app.daily_ai_usage('${c.tenantId}');
          if (u->>'limit')::numeric<>10000 or (u->>'used')::numeric<>9995 or
             (u->>'actorUsed')::numeric<>9990 or (u->>'remaining')::numeric<>5 then
            raise exception 'BAD_DAILY_USAGE';end if;
          if (u->>'resetsAt')::timestamptz<>(date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')+interval '1 day' then
            raise exception 'BAD_RESET';end if;
          begin
            perform app.daily_ai_usage('10000000-0000-4000-8000-000000000099');
            raise exception 'FOREIGN_TENANT_ALLOWED';
          exception when others then if sqlerrm<>'TENANT_NOT_ACCESSIBLE' then raise;end if;end;
          insert into ai_work(tenant_id,user_id,profile) values('${c.tenantId}','${c.actorId}','study') returning id into w;
          begin
            perform app.reserve_ai_attempt(w,'quota-check','cloudflare','@cf/qwen/qwen3-30b-a3b-fp8','test','test','https://example.test',1000,128);
            raise exception 'OVER_LIMIT_ALLOWED';
          exception when others then if sqlerrm<>'DAILY_BUDGET_EXCEEDED' then raise;end if;end;
          if (app.daily_ai_usage('${c.tenantId}')->>'used')::numeric<>9995 then raise exception 'REJECTED_ATTEMPT_CHANGED_USAGE';end if;
        end$$;
        rollback;`);
    });
    it("allows another chat after 100 earlier queries when the daily neuron allowance remains", async () => {
      const legacy = crypto.randomUUID();
      sqlRun(`insert into agent_threads(id,tenant_id,user_id,title) values('${legacy}','${c.tenantId}','${c.actorId}','Previous synthetic queries');
        insert into agent_runs(tenant_id,user_id,thread_id,status,created_at)
        select '${c.tenantId}','${c.actorId}','${legacy}','FAILED',now()-interval '2 hours' from generate_series(1,100);`);
      const answer = await askAgent(c, { message: '/tareas', mode: 'operations' });
      expect(answer.metadata.provider).toBe('deterministic');
      expect(answer.content.length).toBeGreaterThan(0);
    });
    beforeAll(() => {
      harness.database =
        "agent_node_" + crypto.randomUUID().replaceAll("-", "").slice(0, 10);
      execFileSync("createdb", [
        "-h",
        "127.0.0.1",
        "-p",
        "55439",
        "-U",
        "neondb_owner",
        harness.database,
      ]);
      for (const file of readdirSync(resolve(root, "neon/migrations"))
        .filter((f) => f.endsWith(".sql"))
        .sort())
        sqlRun(readFileSync(resolve(root, "neon/migrations", file), "utf8"));
      sqlRun(
        `insert into "user"(id,name,email) values('fixture-owner','Fixture','fixture@synthetic.test');insert into tenants(id,name,created_by) values('${c.tenantId}','SYNTHETIC','fixture-owner');insert into tenant_members(tenant_id,user_id,role_code,created_by) values('${c.tenantId}','fixture-owner','OWNER','fixture-owner');insert into cases(id,tenant_id,title,created_by,specialty,jurisdiction,forum,court) values('${cause}','${c.tenantId}','Fixture','fixture-owner','WORK_ACCIDENT','Sintética','Sintético','Sintético');`,
      );
      vi.stubEnv("LEGAL_DURABLE_INGESTION", "true");
      vi.stubEnv("LEGAL_LIVE_FOLDER", "true");
      vi.stubEnv("LEGAL_FACT_EXTRACTION", "true");
      vi.stubEnv("LEGAL_AI_URL", "https://synthetic.invalid");
      vi.stubEnv("LEGAL_AI_KEY", "synthetic-only");
      // Use an explicit request-shaped fake for model APIs. No real endpoint is contacted.
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init: RequestInit) => {
          harness.fetches++;
          const body = JSON.parse(String(init.body));
          return url.includes("bge-m3")
            ? Response.json({
                success: true,
                result: { data: body.text.map(() => Array(1024).fill(0.01)) },
              })
            : Response.json({
                choices: [
                  {
                    message: {
                      role: "assistant",
                      content: JSON.stringify({
                        facts: [
                          {
                            kind: "EVENT",
                            label: "Atención",
                            value: "atención",
                            passage: "Hubo atención el 03/10/2026.",
                            date: "2026-10-03",
                          },
                        ],
                      }),
                    },
                  },
                ],
                usage: { prompt_tokens: 250, completion_tokens: 80 },
              });
        }),
      );
    }, 30000);
    afterAll(() => {
      if (harness.database)
        execFileSync("dropdb", [
          "-h",
          "127.0.0.1",
          "-p",
          "55439",
          "-U",
          "neondb_owner",
          harness.database,
        ]);
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    });
    it("operates clients, causes, tasks, histories and PDF files through real RLS and shared API validation", async () => {
      const tools = agentTools(c, crypto.randomUUID());
      const created = await tools.execute("createStudyRecord", JSON.stringify({ module: "clients", data: { fullName: "Cliente sintético agente", notes: "Historia inicial reportada por el usuario." } })) as { records: { id: string }[] };
      const client = created.records[0]!.id;
      const createdCase = await tools.execute("createStudyRecord", JSON.stringify({ module: "cases", data: { title: "Causa sintética agente", clientId: client, jurisdiction: "Prueba" } })) as { records: { id: string }[] };
      const caseId = createdCase.records[0]!.id;
      await tools.execute("updateStudyRecord", JSON.stringify({ module: "clients", id: client, data: { notes: "Historia ampliada solicitada por el usuario." } }));
      const createdTask = await tools.execute("createStudyRecord", JSON.stringify({ module: "tasks", data: { title: "Llamar a Luis", dueAt: "2027-01-02T19:00:00-03:00" } })) as { records: { id: string; caseId: string | null }[] };
      expect(createdTask.records[0]!.caseId).toBeNull();
      await tools.execute("updateStudyRecord", JSON.stringify({ module: "tasks", id: createdTask.records[0]!.id, data: { status: "DONE" } }));
      expect(sqlResult("select completed_at is not null as completed from tasks where id=$1", [createdTask.records[0]!.id])[0]!.completed).toBe(true);
      const pdf = await createAgentDocument(c, { title: "Historia sintética", body: "Historia reportada. El señor Pérez pidió una llamada a las 19 hs.", format: "pdf", caseId });
      const pages = await readAgentDocument(c, pdf.id, caseId, 1, 2);
      expect(pages.pages[0]!.text).toContain("Pérez");
      expect(pages.needsOcr).toBe(false);
      writeFileSync(resolve(root, ".private/agent-generated-pdf-validation.pdf"), Buffer.from(sqlResult("select encode(content,'base64') as content from document_blobs where document_id=$1", [pdf.id])[0]!.content, "base64"));
      await expect(readAgentDocument(c, pdf.id, cause, 1, 1)).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(sqlResult("select count(*)::int as n from audit_logs where action='AGENT_DOCUMENT_CREATED' and entity_id=$1", [pdf.id])[0]!.n).toBe(1);
    }, 30000);
    it("persists steps, extracts once, preserves originals and reuses unchanged units", async () => {
      const id = crypto.randomUUID(),
        text =
          "Hubo atención el 03/10/2026. Documento sintético para prueba de cobertura.",
        hash = createHash("sha256").update(text).digest("hex");
      sqlRun(
        `insert into documents(id,tenant_id,case_id,name,storage_provider,storage_key,mime_type,size_bytes,content_hash,created_by) values('${id}','${c.tenantId}','${cause}','fixture.txt','NEON','${id}','text/plain',${Buffer.byteLength(text)},'${hash}','fixture-owner');insert into document_blobs(document_id,tenant_id,content) values('${id}','${c.tenantId}',decode('${Buffer.from(text).toString("base64")}','base64'));insert into document_versions(tenant_id,document_id,version,storage_key,content_hash,size_bytes,created_by) values('${c.tenantId}','${id}',1,'${id}','${hash}',${Buffer.byteLength(text)},'fixture-owner');`,
      );
      const queued = await enqueueDocument(c, id);
      const job = queued.job!.id;
      expect(harness.fetches).toBe(0);
      const first = await runDocumentStep(c, job);
      expect(first).toMatchObject({
        processed: true,
        checkpoint: { stage: "index" },
      });
      const second = await runDocumentStep(c, job);
      expect(second).toMatchObject({ checkpoint: { stage: "facts" } });
      const third = await runDocumentStep(c, job);
      expect(third).toMatchObject({ done: true });
      const folder = await loadFolder(c, cause);
      expect(folder.partial).toBe(false);
      expect(folder.facts).toHaveLength(1);
      expect(folder.facts[0]).toMatchObject({
        status: "EXTRACTED",
        event_date: "2026-10-03",
        passage: "Hubo atención el 03/10/2026.",
      });
      expect(
        sqlResult(
          "select status from knowledge_documents where document_id=$1",
          [id],
        )[0].status,
      ).toBe("READY");
      expect(sqlResult("select count(*)::int as n from ai_attempts")[0].n).toBe(
        2,
      );
      const before = harness.fetches;
      await enqueueDocument(c, id);
      expect(harness.fetches).toBe(before);
      sqlRun(
        `update jobs set status='QUEUED',attempt_count=0,checkpoint='{}' where id='${job}'`,
      );
      await runDocumentStep(c, job);
      await runDocumentStep(c, job);
      expect(harness.fetches).toBe(before);
      await folderMutation(c, cause, {
        action: "REVIEW_FACT",
        id: folder.facts[0]!.id,
        status: "CONFIRMED",
        value: "Atención revisada",
        reason: "Fixture",
      });
      expect((await loadFolder(c, cause)).facts[0]!.original_value).toBe(
        "atención",
      );
      await folderMutation(c, cause, { action: "INIT_CHECKLIST" });
      await folderMutation(c, cause, { action: "PROCEDURE" });
      const prepared = await loadFolder(c, cause);
      expect(prepared.outputs[0]!.body).toContain("Atención revisada");
      expect(harness.fetches).toBe(before);
      const report = {
        environment:
          "synthetic PostgreSQL16 + Node22; provider and R2 simulated",
        providerCallsReal: 0,
        providerCallsSimulated: harness.fetches,
        queries: harness.queries,
        logicalResponseBytes: harness.bytes,
        rss: process.memoryUsage().rss,
        heap: process.memoryUsage().heapUsed,
        coverage: prepared.partial ? "partial" : "complete",
      };
      writeFileSync(
        resolve(root, "docs/operations/agent-node-validation.json"),
        JSON.stringify(report, null, 2) + "\n",
      );
    }, 30000);
    it("writes approved template sections, imports, research and communication drafts with no real sends", async () => {
      vi.stubEnv("LEGAL_DRAFTS", "true");
      vi.stubEnv("LEGAL_RESEARCH", "true");
      const folder = await loadFolder(c, cause),
        fact = folder.facts[0]!;
      expect(folder.partial).toBe(false);
      const template = await saveTemplate(c, {
        title: "Modelo sintético",
        specialty: "WORK_ACCIDENT",
        jurisdiction: "Sintética",
        purpose: "Fixture",
        body: "Modelo de prueba. Usar sólo datos documentados.",
        sourceKind: "SYNTHETIC",
        sections: [{ key: "HECHOS", title: "Hechos" }],
      });
      await approveTemplate(c, template!.id);
      const fetcher = vi.fn(async () => {
        harness.fetches++;
        return Response.json({
          choices: [
            {
              message: {
                role: "assistant",
                content: JSON.stringify({
                  text: "Consta atención documentada.",
                  claims: [
                    {
                      text: "Consta atención documentada.",
                      factIds: [fact.id],
                      importance: "FACTUAL",
                    },
                  ],
                }),
              },
            },
          ],
          usage: { prompt_tokens: 300, completion_tokens: 80 },
        });
      });
      vi.stubGlobal("fetch", fetcher);
      const draft = await draftMutation(c, cause, {
        action: "GENERATE_SECTION",
        templateId: template!.id,
        section: "HECHOS",
      });
      expect(draft!.id).toBeTruthy();
      expect(fetcher).toHaveBeenCalledOnce();
      const edited = await draftMutation(c, cause, {
        action: "SAVE_EDIT",
        id: draft!.id,
        body: "Consta atención para revisar con el original.",
        reason: "Edición sintética de causa",
      });
      expect(edited!.id).not.toBe(draft!.id);
      expect(
        (await loadFolder(c, cause)).outputs.filter((o) => o.kind === "DRAFT"),
      ).toHaveLength(2);
      const letter = await draftMutation(c, cause, {
        action: "PREPARE_LETTER",
      });
      const letterOutput = (await loadFolder(c, cause)).outputs.find(
        (o) => o.id === letter!.id,
      );
      expect(letterOutput?.body).toContain("CARTA DOCUMENTO");
      expect(letterOutput?.body).toContain("Atención revisada");
      expect(letterOutput?.metadata.coverage.totalDocuments).toBe(1);
      expect(fetcher).toHaveBeenCalledOnce();
      const notice = {
        source: "MEV_SCBA" as const,
        title: "Movimiento sintético",
        text: "Texto aportado para revisión, sin plazo confirmado.",
      };
      const first = await manualImport(c, cause, notice),
        replay = await manualImport(c, cause, notice);
      expect(first.id).toBeTruthy();
      expect(replay.duplicate).toBe(true);
      expect(first.liveConnection).toBe(false);
      await saveResearchSource(c, cause, {
        url: "https://www.scba.gov.ar/paginas.asp?id=46951",
        title: "Autoridad sintética",
        court: "Sintético",
        jurisdiction: "Sintética",
        sourceKind: "SUMMARY",
        content:
          "Texto jurídico sintético aportado para validar conservación, sin vigencia verificada.",
        fragment: "Texto jurídico sintético",
        position: "ADVERSE",
      });
      const prepared = (await loadFolder(c, cause)).outputs.find(
        (o) => o.kind === "PROCEDURE",
      )!;
      await folderMutation(c, cause, {
        action: "REVIEW_OUTPUT",
        id: prepared.id,
      });
      const proposed = await proposeClientDraft(c, cause);
      expect(proposed.sent).toBe(false);
      const approved = await decideApproval(c, proposed.id, "APPROVE");
      expect(approved!.resultId).toBeTruthy();
      await expect(
        decideApproval(c, proposed.id, "APPROVE"),
      ).rejects.toMatchObject({ code: "APPROVAL_UNAVAILABLE" });
      expect(
        sqlResult(
          "select count(*)::int as n from communications where status='SENT'",
        )[0].n,
      ).toBe(0);
      expect(sqlResult("select status from communications")[0].status).toBe(
        "DRAFT",
      );
      await folderMutation(c, cause, {
        action: "CONFIGURE",
        specialty: "HEALTH",
        jurisdiction: "Sintética",
        forum: "Sintético",
        court: "Sintético",
        stage: "Seguimiento",
      });
      await folderMutation(c, cause, {
        action: "REGISTER_OBLIGATION",
        factId: fact.id,
        title: "Revisar obligación sintética",
        dueAt: "2026-10-05T12:00:00-03:00",
      });
      expect((await loadFolder(c, cause)).obligations).toHaveLength(1);
      expect(
        sqlResult("select due_at::text as date from tasks where title='Revisar obligación sintética'")[0].date,
      ).toContain("2026-10-05");
      const report = {
        environment:
          "synthetic PostgreSQL16 + Node22; provider and R2 simulated",
        providerCallsReal: 0,
        providerCallsSimulated: harness.fetches,
        queries: harness.queries,
        logicalResponseBytes: harness.bytes,
        rss: process.memoryUsage().rss,
        heap: process.memoryUsage().heapUsed,
        coverage: "complete for one synthetic source; no legal evaluation",
        communicationSends: 0,
        journey:
          "ingestion, replay, fact correction, checklist, procedure, template, draft/edit, event dedupe, research, client draft/approval, health obligation",
      };
      writeFileSync(
        resolve(root, "docs/operations/agent-node-validation.json"),
        JSON.stringify(report, null, 2) + "\n",
      );
    }, 30000);

    it("records ten sequential synthetic jobs without overlapping PDF buffers", async () => {
      const samples: {
          job: number;
          rss: number;
          heap: number;
          durationMs: number;
        }[] = [],
        start = process.memoryUsage().rss;
      const text =
          "Hubo atención el 03/10/2026. Diez trabajos secuenciales sintéticos, no PDFs representativos.",
        hash = createHash("sha256").update(text).digest("hex");
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init: RequestInit) => {
          harness.fetches++;
          const body = JSON.parse(String(init.body));
          return url.includes("bge-m3")
            ? Response.json({
                success: true,
                result: { data: body.text.map(() => Array(1024).fill(0.01)) },
              })
            : Response.json({
                choices: [
                  {
                    message: {
                      role: "assistant",
                      content: JSON.stringify({
                        facts: [
                          {
                            kind: "EVENT",
                            label: "Atención",
                            value: "atención",
                            passage: "Hubo atención el 03/10/2026.",
                            date: "2026-10-03",
                          },
                        ],
                      }),
                    },
                  },
                ],
                usage: { prompt_tokens: 250, completion_tokens: 80 },
              });
        }),
      );
      for (let i = 0; i < 10; i++) {
        const id = crypto.randomUUID(),
          began = Date.now();
        sqlRun(
          `insert into documents(id,tenant_id,case_id,name,storage_provider,storage_key,mime_type,size_bytes,content_hash,created_by) values('${id}','${c.tenantId}','${cause}','memory-${i}.txt','NEON','${id}','text/plain',${Buffer.byteLength(text)},'${hash}','fixture-owner');insert into document_blobs(document_id,tenant_id,content) values('${id}','${c.tenantId}',decode('${Buffer.from(text).toString("base64")}','base64'));insert into document_versions(tenant_id,document_id,version,storage_key,content_hash,size_bytes,created_by) values('${c.tenantId}','${id}',1,'${id}','${hash}',${Buffer.byteLength(text)},'fixture-owner');`,
        );
        const job = (await enqueueDocument(c, id)).job!.id;
        await runDocumentStep(c, job);
        await runDocumentStep(c, job);
        expect(await runDocumentStep(c, job)).toMatchObject({ done: true });
        samples.push({
          job: i + 1,
          ...process.memoryUsage(),
          heap: process.memoryUsage().heapUsed,
          durationMs: Date.now() - began,
        });
      }
      const times = samples.map((s) => s.durationMs).sort((a, b) => a - b),
        peak = Math.max(start, ...samples.map((s) => s.rss));
      expect(peak - start).toBeLessThan(256 * 1024 * 1024);
      const ledger = sqlResult(
        "select count(*)::int as attempts,sum(neurons)::text as estimatedTariffNeurons,sum(usd)::text as estimatedTariffUSD,count(*) filter(where usage_origin='reported')::int as reported,count(*) filter(where usage_origin<>'reported')::int as estimated from ai_attempts",
      )[0];
      writeFileSync(
        resolve(root, "docs/operations/agent-memory-validation.json"),
        JSON.stringify(
          {
            host: process.version + " " + process.platform + "/" + process.arch,
            fixtures:
              "10 sequential small text fixtures; synthetic provider and R2; excludes admitted PDF maximum, browser and Worker",
            providerCallsReal: 0,
            providerCallsSimulated: harness.fetches,
            startRss: start,
            peakRss: peak,
            rssDelta: peak - start,
            finalRss: samples.at(-1)!.rss,
            p50Ms: times[4],
            p95Ms: times[9],
            queries: harness.queries,
            logicalResponseBytes: harness.bytes,
            ledger,
            samples,
          },
          null,
          2,
        ) + "\n",
      );
    }, 60000);
  },
);
