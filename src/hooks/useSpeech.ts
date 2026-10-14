import { useCallback, useEffect, useRef, useState } from "react";

export type SpeechState = "idle" | "speaking" | "paused";

/** Browser Text-to-Speech with voice / rate / pitch control and sentence chunking. */
export function useSpeech() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState<string>("");
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [state, setState] = useState<SpeechState>("idle");
  const [chunkIndex, setChunkIndex] = useState(0);
  const [chunkCount, setChunkCount] = useState(0);
  const chunksRef = useRef<string[]>([]);
  const idxRef = useRef(0);
  const cancelledRef = useRef(false);

  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!supported) return;
    const load = () => {
      const list = window.speechSynthesis.getVoices();
      if (list.length) {
        setVoices(list);
        setVoiceURI((cur) => cur || (list.find((v) => v.lang.startsWith("en")) ?? list[0]).voiceURI);
      }
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.speechSynthesis.cancel();
    };
  }, [supported]);

  const speakChunk = useCallback(() => {
    if (!supported) return;
    const chunks = chunksRef.current;
    if (cancelledRef.current || idxRef.current >= chunks.length) {
      setState("idle");
      setChunkIndex(0);
      return;
    }
    const u = new SpeechSynthesisUtterance(chunks[idxRef.current]);
    const v = voices.find((x) => x.voiceURI === voiceURI);
    if (v) u.voice = v;
    u.rate = rate;
    u.pitch = pitch;
    u.onend = () => {
      idxRef.current += 1;
      setChunkIndex(idxRef.current);
      speakChunk();
    };
    u.onerror = () => setState("idle");
    window.speechSynthesis.speak(u);
  }, [supported, voices, voiceURI, rate, pitch]);

  const stop = useCallback(() => {
    if (!supported) return;
    cancelledRef.current = true;
    window.speechSynthesis.cancel();
    idxRef.current = 0;
    setChunkIndex(0);
    setState("idle");
  }, [supported]);

  const speak = useCallback(
    (text: string) => {
      if (!supported) return;
      const clean = text.replace(/\s+/g, " ").trim();
      if (!clean) return;
      window.speechSynthesis.cancel();
      const chunks = clean.match(/[^.!?]+[.!?]*\s*/g)?.reduce<string[]>((acc, s) => {
        const last = acc[acc.length - 1];
        if (last && last.length + s.length < 220) acc[acc.length - 1] = last + s;
        else acc.push(s);
        return acc;
      }, []) ?? [clean];
      chunksRef.current = chunks;
      idxRef.current = 0;
      cancelledRef.current = false;
      setChunkCount(chunks.length);
      setChunkIndex(0);
      setState("speaking");
      speakChunk();
    },
    [supported, speakChunk],
  );

  const pause = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.pause();
    setState("paused");
  }, [supported]);

  const resume = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.resume();
    setState("speaking");
  }, [supported]);

  return {
    supported,
    voices,
    voiceURI,
    setVoiceURI,
    rate,
    setRate,
    pitch,
    setPitch,
    state,
    chunkIndex,
    chunkCount,
    speak,
    pause,
    resume,
    stop,
  };
}
