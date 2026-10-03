import { createHash } from "node:crypto";
import type { Chunk, Citation } from "./contracts";

export function rrf(lexical: Chunk[], semantic: Chunk[], limit = 25): Chunk[] {
  const hits = new Map<string, Chunk & { score: number }>();
  for (const list of [lexical, semantic])
    list.forEach((item, index) => {
      const old = hits.get(item.id);
      hits.set(item.id, {
        ...item,
        score: (old?.score ?? 0) + 1 / (60 + index + 1),
      });
    });
  return [...hits.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
export function chunkPages(
  pages: { page: number; text: string }[],
  size = 2200,
  overlap = 250,
) {
  if (size <= overlap || overlap < 0)
    throw new Error("Invalid chunk configuration");
  const chunks: {
    ordinal: number;
    pageStart: number;
    pageEnd: number;
    content: string;
    checksum: string;
  }[] = [];
  for (const page of pages) {
    const text = page.text
      .replace(/\u0000/g, "")
      .replace(/\r/g, "")
      .trim();
    for (let offset = 0; offset < text.length; ) {
      let end = Math.min(offset + size, text.length);
      if (end < text.length) {
        const boundary = text.lastIndexOf(" ", end);
        if (boundary > offset + size / 2) end = boundary;
      }
      const content = text.slice(offset, end).trim();
      if (content)
        chunks.push({
          ordinal: chunks.length,
          pageStart: page.page,
          pageEnd: page.page,
          content,
          checksum: createHash("sha256").update(content).digest("hex"),
        });
      if (end === text.length) break;
      offset = Math.max(offset + 1, end - overlap);
    }
  }
  return chunks;
}
export function citedSources(answer: string, sources: Citation[]) {
  const ids = [...answer.matchAll(/\[([SR]\d+)\]/g)].map((m) => m[1]!);
  const allowed = new Map(sources.map((s) => [s.id, s]));
  if (ids.some((id) => !allowed.has(id))) throw new Error("INVALID_CITATION");
  return [...new Set(ids)].map((id) => allowed.get(id)!);
}
export function boundedText(value: unknown, size = 14000) {
  const text = JSON.stringify(value);
  return text.length <= size
    ? text
    : JSON.stringify({ truncated: true, text: text.slice(0, size) });
}
export function stripThinking(text: string) {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}
