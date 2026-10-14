import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Send, X, Sparkles } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * Floating "MyPDF Buddy" — cute googly-eyed assistant in the bottom-right.
 * Uses the lightweight /api/assistant endpoint (no document context).
 */
export function CuteBot() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const eyesRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();


  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/assistant" }),
  });

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [messages, reducedMotion]);

  // Googly-eye tracking (pupils follow the cursor, rAF-smoothed).
  // Disabled entirely when the user prefers reduced motion.
  useEffect(() => {
    if (reducedMotion) return;
    let rafId = 0;
    let targetX = 0;
    let targetY = 0;
    const state = new WeakMap<HTMLElement, { x: number; y: number }>();

    function onMove(e: MouseEvent) {
      targetX = e.clientX;
      targetY = e.clientY;
    }

    function tick() {
      const root = eyesRef.current;
      if (root) {
        const pupils = root.querySelectorAll<HTMLElement>("[data-pupil]");
        pupils.forEach((p) => {
          const rect = p.parentElement!.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dx = targetX - cx;
          const dy = targetY - cy;
          const dist = Math.min(3, Math.hypot(dx, dy) / 40);
          const ang = Math.atan2(dy, dx);
          const nx = Math.cos(ang) * dist;
          const ny = Math.sin(ang) * dist;
          const prev = state.get(p) ?? { x: 0, y: 0 };
          // ease toward target for buttery movement
          const x = prev.x + (nx - prev.x) * 0.18;
          const y = prev.y + (ny - prev.y) * 0.18;
          state.set(p, { x, y });
          p.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        });
      }
      rafId = requestAnimationFrame(tick);
    }

    window.addEventListener("mousemove", onMove, { passive: true });
    rafId = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(rafId);
    };
  }, [reducedMotion]);


  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || status === "streaming" || status === "submitted") return;
    sendMessage({ text });
    setInput("");
  }

  const busy = status === "streaming" || status === "submitted";

  return (
    <>
      {/* Kawaii glass mascot */}
      <button
        type="button"
        aria-label={open ? "Close MyPDF Buddy" : "Open MyPDF Buddy"}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-[60] group"
      >
        {/* Outer glow */}
        <div className="absolute -inset-6 rounded-full bg-cyan-400/20 blur-3xl opacity-70 group-hover:opacity-100 transition-opacity duration-500" />

        {/* Mascot body */}
        <div className="relative grid place-items-center size-[4.5rem] bg-gradient-to-br from-cyan-300/40 to-cyan-500/30 backdrop-blur-2xl border border-white/60 rounded-[45%_55%_50%_50%/50%_50%_50%_50%] shadow-[0_20px_40px_-15px_oklch(0.55_0.16_210/0.35),inset_0_-8px_16px_rgba(255,255,255,0.4)] overflow-hidden transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-2 active:scale-95 active:rotate-0">
          {/* Mesh gradient highlights */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.6)_0%,transparent_50%)]" />
          <div className="absolute bottom-0 right-0 w-16 h-16 bg-cyan-300/40 rounded-full blur-2xl translate-x-6 translate-y-6" />

          <div ref={eyesRef} className="relative z-10 flex flex-col items-center gap-0.5 mt-1">
            {open ? (
              <X className="size-6 text-white drop-shadow-sm" />
            ) : (
              <>
                {/* Googly eyes */}
                <div className="flex gap-2">
                  <span className="relative grid place-items-center size-5 rounded-full bg-white shadow-[inset_0_-2px_4px_rgba(0,0,0,0.08)]">
                    <span data-pupil className="block size-[0.55rem] rounded-full bg-slate-800 transition-transform duration-75" />
                  </span>
                  <span className="relative grid place-items-center size-5 rounded-full bg-white shadow-[inset_0_-2px_4px_rgba(0,0,0,0.08)]">
                    <span data-pupil className="block size-[0.55rem] rounded-full bg-slate-800 transition-transform duration-75" />
                  </span>
                </div>
                {/* Smile */}
                <svg className="w-5 h-2 text-cyan-800/60" viewBox="0 0 20 8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M2 3c4 5 12 5 16 0" />
                </svg>
              </>
            )}
          </div>
        </div>

        {/* Floating badge */}
        {!open && (
          <span className="absolute -top-1 -right-1 bg-white/90 backdrop-blur-sm border border-cyan-100 px-2 py-1 rounded-2xl shadow-sm flex gap-1">
            <span className="size-1.5 rounded-full bg-cyan-400 animate-bounce" />
            <span className="size-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.2s]" />
            <span className="size-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:0.4s]" />
          </span>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="clay-panel fixed bottom-24 right-5 z-[60] w-[min(92vw,360px)] h-[min(70vh,520px)] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
            {/* Mini kawaii mascot avatar */}
            <div className="relative grid place-items-center size-10 bg-gradient-to-br from-cyan-300/50 to-cyan-500/30 backdrop-blur-xl border border-white/50 rounded-[45%_55%_50%_50%/50%_50%_50%_50%] shadow-md shrink-0">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.55)_0%,transparent_50%)]" />
              <div className="relative flex flex-col items-center gap-0.5 mt-0.5">
                <div className="flex gap-1">
                  <span className="grid place-items-center size-3 rounded-full bg-white shadow-[inset_0_-1px_2px_rgba(0,0,0,0.08)]">
                    <span className="block size-[0.35rem] rounded-full bg-slate-800" />
                  </span>
                  <span className="grid place-items-center size-3 rounded-full bg-white shadow-[inset_0_-1px_2px_rgba(0,0,0,0.08)]">
                    <span className="block size-[0.35rem] rounded-full bg-slate-800" />
                  </span>
                </div>
                <svg className="w-3.5 h-1.5 text-cyan-800/60" viewBox="0 0 20 8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M2 3c4 5 12 5 16 0" />
                </svg>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display font-semibold text-sm">MyPDF Buddy</p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <span className="inline-flex gap-1">
                  <span className="size-1 rounded-full bg-cyan-400 animate-bounce" />
                  <span className="size-1 rounded-full bg-cyan-400 animate-bounce [animation-delay:150ms]" />
                  <span className="size-1 rounded-full bg-cyan-400 animate-bounce [animation-delay:300ms]" />
                </span>
                Always here to help
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-6">
                {/* Kawaii empty-state mascot */}
                <div className="relative grid place-items-center size-20 mx-auto mb-3 bg-gradient-to-br from-cyan-300/40 to-cyan-500/30 backdrop-blur-xl border border-white/50 rounded-[45%_55%_50%_50%/50%_50%_50%_50%] shadow-lg">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.55)_0%,transparent_50%)]" />
                  <div className="relative flex flex-col items-center gap-1 mt-1">
                    <div className="flex gap-2">
                      <span className="grid place-items-center size-6 rounded-full bg-white shadow-[inset_0_-2px_4px_rgba(0,0,0,0.08)]">
                        <span className="block size-2.5 rounded-full bg-slate-800" />
                      </span>
                      <span className="grid place-items-center size-6 rounded-full bg-white shadow-[inset_0_-2px_4px_rgba(0,0,0,0.08)]">
                        <span className="block size-2.5 rounded-full bg-slate-800" />
                      </span>
                    </div>
                    <svg className="w-7 h-3 text-cyan-800/60" viewBox="0 0 20 8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                      <path d="M2 3c4 5 12 5 16 0" />
                    </svg>
                  </div>
                </div>
                <p className="text-sm font-medium">Hi! I&apos;m MyPDF Buddy 👋</p>
                <p className="text-xs text-muted-foreground mt-1 px-2">
                  Ask me how to upload, chat with, or listen to your PDFs.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                  {[
                    "How do I upload a PDF?",
                    "What can I do here?",
                    "Is my data private?",
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage({ text: q })}
                      className="clay-chip text-[11px] px-2.5 py-1"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => {
              const text = m.parts
                ?.map((p) => (p.type === "text" ? p.text : ""))
                .join("") ?? "";
              const isUser = m.role === "user";
              return (
                <div
                  key={m.id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                      isUser ? "clay-bubble-user" : "clay-bubble-bot"
                    }`}
                  >
                    {text || (busy && !isUser ? "…" : "")}
                  </div>
                </div>
              );
            })}
            {busy && messages.at(-1)?.role === "user" && (
              <div className="flex justify-start">
                <div className="clay-bubble-bot rounded-2xl px-3 py-2 text-sm">
                  <span className="inline-flex gap-1">
                    <span className="size-1.5 rounded-full bg-current animate-bounce" />
                    <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:120ms]" />
                    <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:240ms]" />
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="p-3 border-t border-white/10 flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me anything…"
              className="clay-input flex-1 h-10 px-3 text-sm outline-none"
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="clay-send grid place-items-center size-10 shrink-0 disabled:opacity-40"
              aria-label="Send"
            >
              {busy ? <Sparkles className="size-4 animate-pulse" /> : <Send className="size-4" />}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
