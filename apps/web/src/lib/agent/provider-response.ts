// Qwen sometimes emits a complete tool envelope in reasoning instead of tool_calls.
// Recover only explicit, well-formed calls to tools offered in this request.
export function normalizeToolResponse(
  result: Record<string, unknown>,
  tools: { function: { name: string } }[] = [],
) {
  const choices = result.choices as { message?: Record<string, unknown> }[] | undefined;
  const message = choices?.[0]?.message;
  if (!message || (message.tool_calls as unknown[] | undefined)?.length) return result;
  const raw = message.reasoning_content ?? message.reasoning;
  if (typeof raw !== "string" || raw.length > 12000) return result;
  const allowed = new Set(tools.map((tool) => tool.function.name));
  const matches = [...raw.matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g)];
  if (!matches.length || matches.length > 4) return result;
  const calls: { id: string; type: string; function: { name: string; arguments: string } }[] = [];
  for (const match of matches) {
    let value;
    try { value = JSON.parse(match[1]!); } catch { return result; }
    if (!value || typeof value.name !== "string" || !allowed.has(value.name) ||
        !value.arguments || typeof value.arguments !== "object" || Array.isArray(value.arguments)) return result;
    calls.push({ id: crypto.randomUUID(), type: "function", function: {
      name: value.name, arguments: JSON.stringify(value.arguments),
    } });
  }
  return { ...result, choices: choices!.map((choice, index) => index === 0
    ? { ...choice, message: { ...message, content: message.content ?? "", tool_calls: calls } }
    : choice) };
}
