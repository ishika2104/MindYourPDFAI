import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { Loader2, Sparkles, Volume2, Pause, Play, Square, RefreshCw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { generateSummary, SUMMARY_KINDS, type SummaryKind } from "@/lib/intelligence.functions";

const LABELS: Record<SummaryKind, string> = {
  quick: "Quick",
  detailed: "Detailed",
  executive: "Executive",
  bullet: "Bullet",
  academic: "Academic",
  business: "Business",
};

type SpeechState = "idle" | "playing" | "paused";

export function SummariesPanel({ documentId, ready }: { documentId: string; ready: boolean }) {
  const [kind, setKind] = useState<SummaryKind>("quick");
  const [byKind, setByKind] = useState<Partial<Record<SummaryKind, string>>>({});
  const [speech, setSpeech] = useState<SpeechState>("idle");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState<string>("");
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  const runSummary = useServerFn(generateSummary);
  const mut = useMutation({
    mutationFn: async (vars: { kind: SummaryKind; force?: boolean }) => {
      const res = await runSummary({ data: { documentId, kind: vars.kind, force: vars.force } });
      return { kind: vars.kind, summary: res.summary };
    },
    onSuccess: ({ kind, summary }) => setByKind((prev) => ({ ...prev, [kind]: summary })),
    onError: (err: Error) => toast.error(err.message ?? "Summary failed"),
  });

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const load = () => {
      const v = window.speechSynthesis.getVoices();
      setVoices(v);
      if (!voiceURI && v.length) {
        const preferred =
          v.find((x) => x.lang.startsWith("en") && /female|samantha|zira|jenny/i.test(x.name)) ??
          v.find((x) => x.lang.startsWith("en")) ??
          v[0];
        setVoiceURI(preferred.voiceURI);
      }
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      window.speechSynthesis.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stop() {
    window.speechSynthesis.cancel();
    utterRef.current = null;
    setSpeech("idle");
  }

  function play() {
    const text = byKind[kind];
    if (!text) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      toast.error("Speech not supported in this browser");
      return;
    }
    window.speechSynthesis.cancel();
    // strip markdown chars for cleaner speech
    const clean = text.replace(/[#*_`>|]/g, "").replace(/\[(.*?)\]\(.*?\)/g, "$1");
    const u = new SpeechSynthesisUtterance(clean);
    const v = voices.find((x) => x.voiceURI === voiceURI);
    if (v) u.voice = v;
    u.rate = rate;
    u.pitch = pitch;
    u.onend = () => setSpeech("idle");
    u.onerror = () => setSpeech("idle");
    utterRef.current = u;
    window.speechSynthesis.speak(u);
    setSpeech("playing");
  }

  function togglePause() {
    if (speech === "playing") {
      window.speechSynthesis.pause();
      setSpeech("paused");
    } else if (speech === "paused") {
      window.speechSynthesis.resume();
      setSpeech("playing");
    }
  }

  const current = byKind[kind];
  const loading = mut.isPending && mut.variables?.kind === kind;

  return (
    <div className="glass rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <h3 className="font-display font-semibold">One-click summaries</h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {SUMMARY_KINDS.map((k) => (
          <Button
            key={k}
            size="sm"
            variant={kind === k ? "default" : "outline"}
            disabled={!ready || mut.isPending}
            onClick={() => {
              stop();
              setKind(k);
              if (!byKind[k]) mut.mutate({ kind: k });
            }}
            className={kind === k ? "bg-gradient-primary text-primary-foreground shadow-glow-purple" : ""}
          >
            {LABELS[k]}
          </Button>
        ))}
      </div>

      {!ready && <p className="text-xs text-muted-foreground">Waiting for indexing to finish…</p>}

      {ready && (
        <div className="glass-strong rounded-xl p-4 min-h-[120px]">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Generating {LABELS[kind].toLowerCase()} summary…
            </div>
          ) : current ? (
            <>
              <div className="prose prose-sm max-w-none prose-p:my-2">
                <ReactMarkdown>{current}</ReactMarkdown>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 items-center">
                {speech === "idle" ? (
                  <Button size="sm" variant="ghost" onClick={play}>
                    <Volume2 className="size-3.5 mr-1" /> Listen
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="ghost" onClick={togglePause}>
                      {speech === "playing" ? (
                        <><Pause className="size-3.5 mr-1" /> Pause</>
                      ) : (
                        <><Play className="size-3.5 mr-1" /> Resume</>
                      )}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={stop}>
                      <Square className="size-3.5 mr-1" /> Stop
                    </Button>
                  </>
                )}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="ghost" title="Voice settings">
                      <Settings2 className="size-3.5 mr-1" /> Voice
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 space-y-4">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">Voice</label>
                      <Select value={voiceURI} onValueChange={setVoiceURI}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Pick a voice" />
                        </SelectTrigger>
                        <SelectContent className="max-h-64">
                          {voices.map((v) => (
                            <SelectItem key={v.voiceURI} value={v.voiceURI} className="text-xs">
                              {v.name} — {v.lang}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                        <span>Speed</span><span className="tabular-nums">{rate.toFixed(2)}×</span>
                      </div>
                      <Slider min={0.5} max={2} step={0.05} value={[rate]} onValueChange={(v) => setRate(v[0])} />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                        <span>Pitch</span><span className="tabular-nums">{pitch.toFixed(2)}</span>
                      </div>
                      <Slider min={0.5} max={2} step={0.05} value={[pitch]} onValueChange={(v) => setPitch(v[0])} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">Changes apply on next play.</p>
                  </PopoverContent>
                </Popover>
                <Button size="sm" variant="ghost" onClick={() => { stop(); mut.mutate({ kind, force: true }); }}>
                  <RefreshCw className="size-3.5 mr-1" /> Regenerate
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Pick a summary style above to generate it.</p>
          )}
        </div>
      )}
    </div>
  );
}
