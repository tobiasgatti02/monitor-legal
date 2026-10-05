import { afterEach, describe, expect, it, vi } from "vitest";

const lifecycle = vi.hoisted(() => ({ cleanups: [] as (() => void)[] }));
vi.mock("react", () => ({
  useState: (value: unknown) => [value, vi.fn()],
  useRef: (current: unknown) => ({ current }),
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) lifecycle.cleanups.push(cleanup);
  },
}));
import { useAgentAudio } from "./use-agent-audio";

class FakeRecognition {
  static latest: FakeRecognition;
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: ((event: { results: { 0: { transcript: string }; length: number; isFinal: boolean }[] }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
  constructor() { FakeRecognition.latest = this; }
  result(text: string) { this.onresult?.({ results: [{ 0: { transcript: text }, length: 1, isFinal: true }] }); }
}
function AudioHarness() {
  const synth = { cancel: vi.fn(), speak: vi.fn(), getVoices: () => [] };
  vi.stubGlobal("window", { SpeechRecognition: FakeRecognition, isSecureContext: true, speechSynthesis: synth });
  vi.stubGlobal("SpeechSynthesisUtterance", class { constructor(public text: string) {} });
  const update = vi.fn();
  const send = vi.fn();
  return { audio: useAgentAudio(update, send), update, send, synth };
}
afterEach(() => {
  lifecycle.cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
});
describe("agent audio lifecycle", () => {
  it("appends dictation without duplicating interim results and waits for final results before sending", () => {
    const { audio, update, send } = AudioHarness();
    audio.startListening("Consultá");
    const mic = FakeRecognition.latest;
    expect(mic.lang).toBe("es-AR");
    mic.result("mis");
    mic.result("mis tareas");
    expect(update).toHaveBeenLastCalledWith("Consultá mis tareas");
    audio.finishListening(true);
    expect(send).not.toHaveBeenCalled();
    mic.result("mis tareas pendientes");
    mic.onend?.();
    expect(send).toHaveBeenCalledExactlyOnceWith("Consultá mis tareas pendientes");
  });
  it("leaves stopped dictation available for review", () => {
    const { audio, send } = AudioHarness();
    audio.startListening("");
    FakeRecognition.latest.result("Revisá mis causas");
    audio.finishListening();
    FakeRecognition.latest.onend?.();
    expect(send).not.toHaveBeenCalled();
  });
  it("does not send a failed or canceled recording", () => {
    const { audio, send } = AudioHarness();
    audio.startListening("");
    const mic = FakeRecognition.latest;
    mic.result("consulta incompleta");
    audio.finishListening(true);
    mic.onerror?.({ error: "not-allowed" });
    mic.onend?.();
    expect(send).not.toHaveBeenCalled();
    audio.startListening("");
    const canceled = FakeRecognition.latest;
    audio.cancelListening();
    expect(canceled.abort).toHaveBeenCalledOnce();
    expect(canceled.onresult).toBeNull();
  });
  it("stops the microphone before reading and cancels playback on unmount", () => {
    const { audio, synth } = AudioHarness();
    audio.startListening("");
    const mic = FakeRecognition.latest;
    audio.speak("answer", "**Hola** [S1]");
    expect(mic.abort).toHaveBeenCalledOnce();
    expect(synth.speak.mock.calls[0]?.[0]).toMatchObject({ text: "Hola ", lang: "es-AR" });
    synth.cancel.mockClear();
    lifecycle.cleanups.splice(0).forEach((cleanup) => cleanup());
    expect(synth.cancel).toHaveBeenCalledOnce();
  });
});
