type Stored = {
  body: ReadableStream;
  customMetadata?: Record<string, string>;
  size: number;
  etag: string;
};
type Bucket = {
  get: (key: string) => Promise<Stored | null>;
  head: (key: string) => Promise<Stored | null>;
  put: (key: string, body: ArrayBuffer, options: unknown) => Promise<unknown>;
};
type Env = {
  AI: {
    run: (model: string, input: unknown) => Promise<Record<string, unknown>>;
  };
  DOCUMENTS: Bucket;
  SERVICE_KEY: string;
  ALERT_CRON_KEY: string;
  ALERT_CRON_URL: string;
  INGESTION_CRON_URL?: string;
  INGESTION_CRON_KEY?: string;
};
const allowed = new Set([
  "@cf/qwen/qwen3-30b-a3b-fp8",
  "@cf/baai/bge-m3",
  "@cf/baai/bge-reranker-base",
]);
const uuid = "[0-9a-f-]{36}";
const storagePath = new RegExp(`^/files/(${uuid})/(${uuid})$`);
async function verifyTicket(token: string, key: string) {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) throw new Error("Invalid ticket");
  const bytes = Uint8Array.from(
    atob(encoded.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const mac = new Uint8Array(
    (signature.match(/.{2}/g) ?? []).map((v) => parseInt(v, 16)),
  );
  if (
    !(await crypto.subtle.verify(
      "HMAC",
      cryptoKey,
      mac,
      new TextEncoder().encode(encoded),
    ))
  )
    throw new Error("Invalid ticket");
  const ticket = JSON.parse(new TextDecoder().decode(bytes));
  if (ticket.exp < Date.now() || ticket.exp > Date.now() + 6 * 60 * 1000)
    throw new Error("Expired ticket");
  if (
    !new RegExp(`^${uuid}/${uuid}$`).test(ticket.key) ||
    ticket.size < 1 ||
    ticket.size > 5 * 1024 * 1024
  )
    throw new Error("Invalid ticket");
  return ticket as {
    key: string;
    size: number;
    name: string;
    mime: string;
    origin: string;
    exp: number;
  };
}
async function readLimited(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error("Payload too large");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result.buffer;
}
export default {
  async scheduled(_event: unknown, env: Env) {
    if (!env.ALERT_CRON_URL || !env.ALERT_CRON_KEY)
      throw new Error("Scheduler not configured");
    const result = await fetch(env.ALERT_CRON_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.ALERT_CRON_KEY}` },
      signal: AbortSignal.timeout(115000),
    });
    if (!result.ok) throw new Error("Scheduled alerts failed");
    if (env.INGESTION_CRON_URL && env.INGESTION_CRON_KEY) {
      const ingestion = await fetch(env.INGESTION_CRON_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.INGESTION_CRON_KEY}` },
        signal: AbortSignal.timeout(115000),
      });
      if (!ingestion.ok) throw new Error("Scheduled ingestion failed");
    }
  },
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url),
      path = url.pathname,
      headers = {
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
      };
    if (path === "/upload") {
      try {
        const ticket = await verifyTicket(
          url.searchParams.get("ticket") ?? "",
          env.SERVICE_KEY,
        );
        const origin = request.headers.get("Origin");
        if (origin && origin !== ticket.origin)
          return Response.json(
            { error: "Origin denied" },
            { status: 403, headers },
          );
        const cors = {
          ...headers,
          "Access-Control-Allow-Origin": ticket.origin,
          "Access-Control-Allow-Methods": "PUT, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          Vary: "Origin",
        };
        if (request.method === "OPTIONS")
          return new Response(null, { status: 204, headers: cors });
        if (request.method !== "PUT")
          return Response.json(
            { error: "Method not allowed" },
            { status: 405, headers: cors },
          );
        const content = await readLimited(request, ticket.size);
        if (content.byteLength !== ticket.size) throw new Error("Invalid size");
        const digest = await crypto.subtle.digest("SHA-256", content),
          checksum = Array.from(new Uint8Array(digest))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
        const result = await env.DOCUMENTS.put(ticket.key, content, {
          onlyIf: { etagDoesNotMatch: "*" },
          customMetadata: { checksum, name: ticket.name, mime: ticket.mime },
          httpMetadata: { contentType: ticket.mime },
        });
        if (!result)
          return Response.json(
            { error: "Original already exists" },
            { status: 409, headers: cors },
          );
        return Response.json({ uploaded: true }, { headers: cors });
      } catch {
        return Response.json(
          { error: "Upload rejected" },
          { status: 403, headers },
        );
      }
    }
    if (
      !env.SERVICE_KEY ||
      request.headers.get("Authorization") !== `Bearer ${env.SERVICE_KEY}`
    )
      return Response.json({ error: "Unauthorized" }, { status: 401, headers });
    const derived = path.match(
      new RegExp(`^/artifacts/(${uuid})/(${uuid})/([a-f0-9]{64})$`),
    );
    if (derived) {
      const key = `derived/${derived[1]}/${derived[2]}/${derived[3]}`;
      if (request.method === "PUT") {
        try {
          const content = await readLimited(request, 4 * 1024 * 1024);
          const checksum = Array.from(
            new Uint8Array(await crypto.subtle.digest("SHA-256", content)),
          )
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          if (checksum !== derived[3])
            return Response.json(
              { error: "Artifact checksum mismatch" },
              { status: 422, headers },
            );
          await env.DOCUMENTS.put(key, content, {
            onlyIf: { etagDoesNotMatch: "*" },
            httpMetadata: { contentType: "application/json" },
            customMetadata: { checksum },
          });
          return Response.json({ stored: true }, { headers });
        } catch {
          return Response.json(
            { error: "Artifact rejected" },
            { status: 422, headers },
          );
        }
      }
      if (request.method !== "GET")
        return Response.json(
          { error: "Method not allowed" },
          { status: 405, headers },
        );
      const obj = await env.DOCUMENTS.get(key);
      return obj
        ? new Response(obj.body, { headers })
        : Response.json({ error: "Not found" }, { status: 404, headers });
    }
    const file = path.match(storagePath);
    if (file) {
      const key = `${file[1]}/${file[2]}`;
      if (request.method === "HEAD" || url.searchParams.has("metadata")) {
        const obj = await env.DOCUMENTS.head(key);
        return obj
          ? Response.json(
              { size: obj.size, ...obj.customMetadata },
              { headers },
            )
          : Response.json({ error: "Not found" }, { status: 404, headers });
      }
      if (request.method !== "GET")
        return Response.json(
          { error: "Method not allowed" },
          { status: 405, headers },
        );
      const obj = await env.DOCUMENTS.get(key);
      if (!obj)
        return Response.json({ error: "Not found" }, { status: 404, headers });
      return new Response(obj.body, {
        headers: {
          "Cache-Control": "no-store",
          "Content-Type":
            obj.customMetadata?.mime ?? "application/octet-stream",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (request.method !== "POST")
      return Response.json(
        { error: "Method not allowed" },
        { status: 405, headers },
      );
    try {
      const raw = new TextDecoder().decode(await readLimited(request, 180000)),
        input = JSON.parse(raw);
      const model =
        path === "/chat/completions"
          ? input.model
          : decodeURIComponent(path.replace(/^\/run\//, ""));
      if (!allowed.has(model))
        return Response.json(
          { error: "Model not allowed" },
          { status: 422, headers },
        );
      if (path === "/chat/completions") {
        const profiles: Record<string, number> = {
          study: 600,
          classification: 128,
          brief: 600,
          document: 600,
          extraction: 600,
          draft: 1200,
          research: 600,
        };
        const profile = request.headers.get("X-Legal-Profile") ?? "";
        if (
          !profiles[profile] ||
          !Number.isInteger(input.max_tokens) ||
          input.max_tokens < 1 ||
          input.max_tokens > profiles[profile]
        )
          return Response.json(
            { error: "Invalid trusted profile" },
            { status: 422, headers },
          );
        input.max_tokens = Math.min(input.max_tokens, profiles[profile]);
        input.stream = false;
        delete input.model;
        const result = await env.AI.run(model, input);
        if (result.choices) return Response.json(result, { headers });
        const calls = (
          result.tool_calls as
            { name: string; arguments: unknown }[] | undefined
        )?.map((c) => ({
          id: crypto.randomUUID(),
          type: "function",
          function: {
            name: c.name,
            arguments:
              typeof c.arguments === "string"
                ? c.arguments
                : JSON.stringify(c.arguments),
          },
        }));
        return Response.json(
          {
            choices: [
              {
                message: {
                  role: "assistant",
                  content: result.response ?? null,
                  tool_calls: calls,
                },
              },
            ],
            usage: result.usage ?? {},
          },
          { headers },
        );
      }
      return Response.json(
        { success: true, result: await env.AI.run(model, input) },
        { headers },
      );
    } catch {
      return Response.json(
        { error: "AI unavailable" },
        { status: 503, headers },
      );
    }
  },
};
