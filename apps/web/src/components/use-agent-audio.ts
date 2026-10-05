"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const subscribe = () => () => {};
const serverCapabilities = () => 0;
function browserCapabilities() {
  const w = window as VoiceWindow;
  return ((w.SpeechRecognition || w.webkitSpeechRecognition) && window.isSecureContext ? 1 : 0) | ("speechSynthesis" in window ? 2 : 0);
}

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type VoiceWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export function useAgentAudio(updateText: (text: string) => void, send: (text: string) => void) {
  const capabilities = useSyncExternalStore(subscribe, browserCapabilities, serverCapabilities);
  const supported = { input: !!(capabilities & 1), output: !!(capabilities & 2) };
  const [listening, setListening] = useState(false);
  const [speakingId, setSpeakingId] = useState<string>();
  const [audioError, setAudioError] = useState("");
  const [readReplies, setReadReplies] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const callbacks = useRef({ updateText, send });
  const draft = useRef("");
  const sendOnEnd = useRef(false);

  useEffect(() => { callbacks.current = { updateText, send }; });
  useEffect(() => {
    return () => {
      const active = recognition.current;
      if (active) {
        active.onresult = active.onerror = active.onend = null;
        active.abort();
      }
      if (utterance.current) window.speechSynthesis.cancel();
    };
  }, []);

  function stopSpeaking() {
    utterance.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeakingId(undefined);
  }

  function cancelListening() {
    const active = recognition.current;
    recognition.current = null;
    sendOnEnd.current = false;
    if (active) {
      active.onresult = active.onerror = active.onend = null;
      active.abort();
    }
    setListening(false);
  }

  function startListening(text: string) {
    if (recognition.current) return;
    const w = window as VoiceWindow;
    const Constructor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Constructor || !window.isSecureContext) {
      setAudioError("El dictado no está disponible en este navegador. Probá Chrome o Safari con HTTPS y permiso de micrófono.");
      return;
    }
    stopSpeaking();
    setAudioError("");
    sendOnEnd.current = false;
    draft.current = text;
    const active = new Constructor();
    active.lang = "es-AR";
    active.continuous = true;
    active.interimResults = true;
    recognition.current = active;
    active.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ");
      draft.current = [text.trim(), transcript.trim()].filter(Boolean).join(" ").slice(0, 4000);
      callbacks.current.updateText(draft.current);
    };
    active.onerror = (event) => {
      sendOnEnd.current = false;
      const errors: Record<string, string> = {
        "not-allowed": "Permití el acceso al micrófono para hablar con el agente.",
        "service-not-allowed": "El navegador no permite el reconocimiento de voz.",
        "audio-capture": "No encontramos un micrófono disponible.",
        "no-speech": "No se detectó voz. Volvé a intentar.",
        network: "No se pudo conectar al servicio de dictado. Revisá tu conexión.",
      };
      if (event.error !== "aborted") setAudioError(errors[event.error] ?? "No se pudo completar el dictado. Podés revisar el texto e intentar otra vez.");
    };
    active.onend = () => {
      recognition.current = null;
      setListening(false);
      if (sendOnEnd.current && draft.current.trim()) callbacks.current.send(draft.current);
      sendOnEnd.current = false;
    };
    try {
      active.start();
      setListening(true);
    } catch {
      cancelListening();
      setAudioError("No se pudo iniciar el micrófono. Revisá los permisos e intentá otra vez.");
    }
  }

  function finishListening(sendWhenDone = false) {
    sendOnEnd.current = sendWhenDone;
    recognition.current?.stop();
  }

  function speak(id: string, content: string) {
    cancelListening();
    stopSpeaking();
    if (!("speechSynthesis" in window)) return;
    const speech = new SpeechSynthesisUtterance(content.replace(/\[([SR]\d+)\]/g, "").replace(/[#*_`>]/g, ""));
    speech.lang = "es-AR";
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find((v) => v.lang === "es-AR") ?? voices.find((v) => v.lang.startsWith("es"));
    if (voice) speech.voice = voice;
    speech.onend = () => {
      if (utterance.current === speech) { utterance.current = null; setSpeakingId(undefined); }
    };
    speech.onerror = (event) => {
      if (utterance.current !== speech) return;
      utterance.current = null;
      setSpeakingId(undefined);
      if (event.error !== "canceled" && event.error !== "interrupted") setAudioError("No se pudo reproducir la respuesta. Presioná Escuchar para volver a intentar.");
    };
    utterance.current = speech;
    setSpeakingId(id);
    window.speechSynthesis.speak(speech);
  }

  return { supported, listening, speakingId, audioError, readReplies, setReadReplies, startListening, finishListening, cancelListening, speak, stopSpeaking };
}
