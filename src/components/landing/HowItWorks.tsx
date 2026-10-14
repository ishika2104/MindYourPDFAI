import { Upload, Brain, MessageCircle } from "lucide-react";

const steps = [
  { icon: Upload, n: "01", title: "Upload your PDF", desc: "Drag and drop any document. We extract text, preserve structure, and chunk it intelligently." },
  { icon: Brain, n: "02", title: "AI indexes it", desc: "Embeddings are generated and stored in a vector index — ready for instant semantic retrieval." },
  { icon: MessageCircle, n: "03", title: "Ask, summarize, listen", desc: "Chat naturally, get cited answers, generate summaries, or have the document read aloud to you." },
];

export function HowItWorks() {
  return (
    <section id="how" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center mb-16">
          <p className="text-sm font-medium text-primary mb-3">How it works</p>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">
            From upload to insight in <span className="text-gradient">three steps</span>
          </h2>
        </div>

        <div className="relative grid md:grid-cols-3 gap-6">
          <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          {steps.map((s) => (
            <div key={s.n} className="relative glass rounded-2xl p-8 text-center">
              <div className="relative mx-auto mb-5">
                <div className="absolute inset-0 bg-primary/30 rounded-full blur-2xl" />
                <div className="relative mx-auto size-16 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-glow">
                  <s.icon className="size-7 text-primary-foreground" />
                </div>
              </div>
              <div className="text-xs font-mono text-primary mb-2">{s.n}</div>
              <h3 className="font-semibold text-lg mb-2">{s.title}</h3>
              <p className="text-sm text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
