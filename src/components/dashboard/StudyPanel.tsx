import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, GraduationCap, RefreshCw, Check, X, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { generateStudyItems, STUDY_KINDS, type StudyKind } from "@/lib/study.functions";

const LABELS: Record<StudyKind, string> = {
  flashcards: "Flashcards",
  mcq: "Multiple choice",
  true_false: "True / False",
  short_answer: "Short answer",
};

interface Flashcard { front: string; back: string }
interface MCQ { question: string; options: string[]; answer_index: number; explanation?: string }
interface TF { statement: string; answer: boolean; explanation?: string }
interface SA { question: string; model_answer: string }

export function StudyPanel({ documentId, ready }: { documentId: string; ready: boolean }) {
  const generate = useServerFn(generateStudyItems);
  const [kind, setKind] = useState<StudyKind>("flashcards");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [items, setItems] = useState<unknown[] | null>(null);

  const gen = useMutation({
    mutationFn: async () =>
      generate({ data: { documentId, kind, difficulty, count: 8 } }) as Promise<{ items: unknown[] }>,
    onSuccess: (r) => setItems(r.items),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Generation failed"),
  });

  if (!ready) {
    return (
      <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
        Study materials will unlock once indexing finishes.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="glass-strong rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow-purple shrink-0">
            <GraduationCap className="size-5 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-semibold">Study Mode</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Turn this document into flashcards, quizzes, and drills.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {STUDY_KINDS.map((k) => (
            <button
              key={k}
              onClick={() => { setKind(k); setItems(null); }}
              className={`px-3 py-1.5 rounded-full text-xs transition-all ${
                kind === k
                  ? "bg-primary text-primary-foreground shadow-glow-purple"
                  : "glass hover:bg-card/80 text-muted-foreground"
              }`}
            >
              {LABELS[k]}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-1.5">
            {(["easy", "medium", "hard"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`px-2.5 py-1 rounded-md text-[11px] uppercase tracking-wider transition-colors ${
                  difficulty === d ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:bg-card/60"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            onClick={() => gen.mutate()}
            disabled={gen.isPending}
            className="h-9 bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow-purple"
          >
            {gen.isPending ? (
              <><Loader2 className="size-4 mr-1.5 animate-spin" /> Generating…</>
            ) : items ? (
              <><RefreshCw className="size-4 mr-1.5" /> Regenerate</>
            ) : (
              <>Generate {LABELS[kind].toLowerCase()}</>
            )}
          </Button>
        </div>
      </div>

      {items && items.length > 0 && (
        <div className="space-y-3">
          {kind === "flashcards" && (items as Flashcard[]).map((c, i) => (
            <Flashcard key={i} idx={i + 1} card={c} />
          ))}
          {kind === "mcq" && (items as MCQ[]).map((q, i) => (
            <MCQItem key={i} idx={i + 1} q={q} />
          ))}
          {kind === "true_false" && (items as TF[]).map((t, i) => (
            <TFItem key={i} idx={i + 1} t={t} />
          ))}
          {kind === "short_answer" && (items as SA[]).map((s, i) => (
            <SAItem key={i} idx={i + 1} s={s} />
          ))}
        </div>
      )}

      {items && items.length === 0 && (
        <div className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">
          No items generated. Try a different type or difficulty.
        </div>
      )}
    </div>
  );
}

function Flashcard({ idx, card }: { idx: number; card: Flashcard }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <button
      onClick={() => setFlipped((v) => !v)}
      className="glass rounded-2xl p-5 w-full text-left hover:bg-card/80 transition-all group"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Card {idx}</span>
        <span className="text-[10px] text-primary">{flipped ? "Answer" : "Question · tap to flip"}</span>
      </div>
      <p className="text-sm text-foreground/90 leading-relaxed">
        {flipped ? card.back : card.front}
      </p>
    </button>
  );
}

function MCQItem({ idx, q }: { idx: number; q: MCQ }) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <div className="glass rounded-2xl p-5">
      <p className="text-sm font-medium mb-3">
        <span className="text-muted-foreground mr-2">{idx}.</span>
        {q.question}
      </p>
      <div className="space-y-1.5">
        {q.options.map((o, i) => {
          const correct = i === q.answer_index;
          const active = picked === i;
          return (
            <button
              key={i}
              onClick={() => setPicked(i)}
              disabled={picked !== null}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center gap-2 ${
                picked === null
                  ? "hover:bg-card/80 bg-card/40"
                  : active && correct
                    ? "bg-emerald-500/15 ring-1 ring-emerald-500/40"
                    : active && !correct
                      ? "bg-destructive/15 ring-1 ring-destructive/40"
                      : correct
                        ? "bg-emerald-500/10"
                        : "opacity-60"
              }`}
            >
              <span className="text-[11px] font-mono text-muted-foreground">{String.fromCharCode(65 + i)}</span>
              <span className="flex-1">{o}</span>
              {picked !== null && correct && <Check className="size-4 text-emerald-500" />}
              {active && !correct && <X className="size-4 text-destructive" />}
            </button>
          );
        })}
      </div>
      {picked !== null && q.explanation && (
        <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
          <span className="font-medium text-foreground/80">Why:</span> {q.explanation}
        </p>
      )}
    </div>
  );
}

function TFItem({ idx, t }: { idx: number; t: TF }) {
  const [picked, setPicked] = useState<boolean | null>(null);
  return (
    <div className="glass rounded-2xl p-5">
      <p className="text-sm font-medium mb-3">
        <span className="text-muted-foreground mr-2">{idx}.</span>
        {t.statement}
      </p>
      <div className="flex gap-2">
        {[true, false].map((v) => {
          const correct = v === t.answer;
          const active = picked === v;
          return (
            <button
              key={String(v)}
              onClick={() => setPicked(v)}
              disabled={picked !== null}
              className={`flex-1 py-2 rounded-lg text-sm transition-all ${
                picked === null
                  ? "bg-card/40 hover:bg-card/80"
                  : active && correct
                    ? "bg-emerald-500/15 ring-1 ring-emerald-500/40"
                    : active && !correct
                      ? "bg-destructive/15 ring-1 ring-destructive/40"
                      : correct
                        ? "bg-emerald-500/10"
                        : "opacity-60"
              }`}
            >
              {v ? "True" : "False"}
            </button>
          );
        })}
      </div>
      {picked !== null && t.explanation && (
        <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
          <span className="font-medium text-foreground/80">Why:</span> {t.explanation}
        </p>
      )}
    </div>
  );
}

function SAItem({ idx, s }: { idx: number; s: SA }) {
  const [show, setShow] = useState(false);
  return (
    <div className="glass rounded-2xl p-5">
      <p className="text-sm font-medium mb-2">
        <span className="text-muted-foreground mr-2">{idx}.</span>
        {s.question}
      </p>
      <button
        onClick={() => setShow((v) => !v)}
        className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
      >
        <ChevronRight className={`size-3 transition-transform ${show ? "rotate-90" : ""}`} />
        {show ? "Hide" : "Show"} model answer
      </button>
      {show && (
        <p className="text-sm text-muted-foreground mt-2 pt-2 border-t border-border">
          {s.model_answer}
        </p>
      )}
    </div>
  );
}
