import { describe, expect, it } from 'vitest';
import { normalizeToolResponse } from './provider-response';
const tools = [{ function: { name: 'createStudyRecord' } }];
const response = (reasoning: string) => ({ choices: [{ message: { role: 'assistant', content: '', reasoning } }] });
describe('Qwen tool response normalization', () => {
  it('recovers the observed full call envelope without exposing reasoning', () => {
    const r = normalizeToolResponse(response('<tool_call>\n{"name":"createStudyRecord","arguments":{"module":"clients","data":{"fullName":"Synthetic"}}}\n</tool_call>'), tools);
    expect((r.choices as { message: { tool_calls: { function: { name: string; arguments: string } }[] } }[])[0].message.tool_calls[0].function).toEqual({ name: 'createStudyRecord', arguments: '{"module":"clients","data":{"fullName":"Synthetic"}}' });
  });
  it.each(['<tool_call>{"name":"executeSql","arguments":{}}</tool_call>', '<tool_call>{invalid}</tool_call>', '<tool_call>{"name":"createStudyRecord","arguments":[]}</tool_call>', '<tool_call>{"name":"createStudyRecord","arguments":{}}'])('ignores unoffered or incomplete envelopes', (raw) => {
    const r = response(raw); expect(normalizeToolResponse(r, tools)).toBe(r);
  });
  it('preserves native calls', () => {
    const r = { choices: [{ message: { tool_calls: [{ id: 'original' }] } }] };
    expect(normalizeToolResponse(r, tools)).toBe(r);
  });
});
