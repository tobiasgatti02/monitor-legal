/** Local workerd/R2 contract and heap samples. No Cloudflare credentials, AI binding or cron. */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
if (!process.env.LEGAL_TEST_MINIFLARE_MODULE)
  throw Error(
    "Provide the installed local Miniflare module path. This script never installs dependencies.",
  );
const { Miniflare, convertV4MiniflareOptions } = await import(
  pathToFileURL(resolve(process.env.LEGAL_TEST_MINIFLARE_MODULE)).href
);
const dir = mkdtempSync(join(tmpdir(), "monitor-agent-worker-"));
let mf, ws;
try {
  execFileSync(resolve(root, "node_modules/.bin/tsc"), [
    resolve(root, "services/ai-gateway/src/index.ts"),
    "--outDir",
    dir,
    "--module",
    "esnext",
    "--target",
    "es2022",
    "--lib",
    "es2022,dom",
    "--skipLibCheck",
    "--ignoreConfig",
  ]);
  const options = {
    name: "fixture",
    modules: true,
    script: readFileSync(join(dir, "index.js"), "utf8"),
    compatibilityDate: "2026-09-23",
    r2Buckets: ["DOCUMENTS"],
    bindings: { SERVICE_KEY: "synthetic-only" },
    inspectorPort: 0,
  };
  mf = new Miniflare(
    convertV4MiniflareOptions ? convertV4MiniflareOptions(options) : options,
  );
  const inspector = await mf.getInspectorURL(),
    httpUrl = new URL("/json/list", inspector);
  httpUrl.protocol = "http:";
  const targets = await (await fetch(httpUrl)).json();
  const target = targets.find(
    (t) =>
      String(t.title).includes("fixture") || String(t.id).includes("fixture"),
  );
  if (!target?.webSocketDebuggerUrl)
    throw Error("Local worker inspector target not found");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, bad) => {
    ws.addEventListener("open", ok, { once: true });
    ws.addEventListener("error", bad, { once: true });
  });
  let next = 0;
  const waiting = new Map();
  ws.addEventListener("message", (e) => {
    const value = JSON.parse(e.data);
    if (waiting.has(value.id)) {
      const { ok, bad, timer } = waiting.get(value.id);
      clearTimeout(timer);
      waiting.delete(value.id);
      value.error ? bad(Error(value.error.message)) : ok(value.result);
    }
  });
  function command(method) {
    return new Promise((ok, bad) => {
      const id = ++next,
        timer = setTimeout(() => {
          waiting.delete(id);
          bad(Error("Inspector timeout"));
        }, 5000);
      waiting.set(id, { ok, bad, timer });
      ws.send(JSON.stringify({ id, method }));
    });
  }
  const samples = [await command("Runtime.getHeapUsage")],
    body = JSON.stringify({ fixture: "x".repeat(4 * 1024 * 1024 - 100) }),
    hash = createHash("sha256").update(body).digest("hex"),
    url =
      "https://synthetic.invalid/artifacts/10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/" +
      hash;
  assert.equal((await mf.dispatchFetch(url)).status, 401);
  for (let i = 0; i < 10; i++) {
    const r = await mf.dispatchFetch(url, {
      method: "PUT",
      headers: { Authorization: "Bearer synthetic-only" },
      body,
    });
    assert.equal(r.status, 200);
    const read = await mf.dispatchFetch(url, {
      headers: { Authorization: "Bearer synthetic-only" },
    });
    assert.equal(read.status, 200);
    assert.equal(await read.text(), body);
    samples.push(await command("Runtime.getHeapUsage"));
  }
  const invalid = await mf.dispatchFetch(url.replace(hash, "a".repeat(64)), {
    method: "PUT",
    headers: { Authorization: "Bearer synthetic-only" },
    body,
  });
  assert.equal(invalid.status, 422);
  writeFileSync(
    resolve(root, "docs/operations/agent-worker-validation.json"),
    JSON.stringify(
      {
        runtime: "local Miniflare/workerd",
        compatibilityDateTest: "2026-09-23",
        compatibilityDateTarget: "2026-10-03",
        caveat:
          "Installed runtime supports an older date; heap is sampled after requests, excludes peak/native/R2 isolates and remote AI. Not a guarantee of 128MB production isolate limit.",
        providerCallsReal: 0,
        remoteR2Calls: 0,
        requests: 22,
        artifactBytes: Buffer.byteLength(body),
        samples,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "PASS local workerd: private artifact, immutable replay, checksum, auth, ten maximum-size writes/reads, inspector heap samples",
  );
} finally {
  ws?.close();
  await mf?.dispose();
  rmSync(dir, { recursive: true, force: true });
}
