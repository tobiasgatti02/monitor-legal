import { describe, it, expect, vi } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
vi.mock("server-only", () => ({}));
import { parseDocument } from "./ingestion";
const suite =
  process.env.LEGAL_TEST_PDF_MEMORY === "true" ? describe : describe.skip;
suite("native PDF parser bounded sequential fixture", () => {
  it("destroys ten parser instances and records peak sampled RSS", async () => {
    const file = readFileSync(
        resolve(
          process.cwd(),
          "src/lib/agent/fixtures/three-page-synthetic.pdf",
        ),
      ),
      start = process.memoryUsage(),
      samples: { job: number; rss: number; heap: number; ms: number }[] = [];
    let peak = start.rss;
    const timer = setInterval(() => {
      peak = Math.max(peak, process.memoryUsage().rss);
    }, 10);
    try {
      for (let i = 0; i < 10; i++) {
        const began = performance.now();
        const pages = await parseDocument(
          file,
          "application/pdf",
          "synthetic.pdf",
        );
        expect(pages).toHaveLength(3);
        expect(pages.every((p) => p.text.length > 40)).toBe(true);
        const m = process.memoryUsage();
        peak = Math.max(peak, m.rss);
        samples.push({
          job: i + 1,
          rss: m.rss,
          heap: m.heapUsed,
          ms: performance.now() - began,
        });
      }
    } finally {
      clearInterval(timer);
    }
    expect(peak - start.rss).toBeLessThan(256 * 1024 * 1024);
    const times = samples.map((s) => s.ms).sort((a, b) => a - b);
    writeFileSync(
      resolve(
        process.cwd(),
        "../../docs/operations/agent-pdf-memory-validation.json",
      ),
      JSON.stringify(
        {
          host: process.version + " " + process.platform + "/" + process.arch,
          fixture:
            "3 synthetic text pages exported from tested DOCX; not maximum 5MB/200page admission",
          bytes: file.length,
          jobs: 10,
          providerCallsReal: 0,
          startRss: start.rss,
          peakSampledRss: peak,
          rssDelta: peak - start.rss,
          finalRss: samples.at(-1)!.rss,
          p50Ms: times[4],
          p95Ms: times[9],
          samples,
        },
        null,
        2,
      ) + "\n",
    );
  }, 30000);
});
