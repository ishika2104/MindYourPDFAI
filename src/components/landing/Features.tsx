import { MessageSquare, FileSearch, Volume2, Sparkles, Repeat, Quote, Download, BarChart3 } from "lucide-react";

const features = [
  { icon: MessageSquare, title: "Chat with your PDF", desc: "Ask anything in natural language. RAG-powered answers with cited sources from the exact page." },
  { icon: Sparkles, title: "Smart summaries", desc: "Short, detailed, or key-point summaries generated in seconds with GPT-grade reasoning." },
  { icon: FileSearch, title: "Semantic search", desc: "Search by concept, not keywords. Find ‘neural networks’ when you typed ‘machine learning’." },
  { icon: Volume2, title: "Text-to-Speech", desc: "Listen to any selection, summary, answer, or the whole document. Adjust voice and speed." },
  { icon: Repeat, title: "File conversion", desc: "PDF to Word and back, plus text, Markdown, HTML and page images — converted instantly in your browser." },
  { icon: Quote, title: "Source citations", desc: "Every AI answer links back to the page and paragraph. Click to jump." },
  { icon: Download, title: "Export anything", desc: "Download summaries, chats, and insights as PDF, DOCX, or TXT." },
  { icon: BarChart3, title: "Analytics dashboard", desc: "See documents read, questions asked, and the reading hours you saved." },
];

export function Features() {
  return (
    <section id="features" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center mb-16">
          <p className="text-sm font-medium text-primary mb-3">Features</p>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Everything you need to <span className="text-gradient">read smarter</span>
          </h2>
          <p className="mt-4 text-muted-foreground">
            A complete document intelligence suite — built for researchers, students, lawyers, and curious minds.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f, i) => {
            const purple = i % 2 === 1;
            return (
              <div
                key={f.title}
                className="group relative glass rounded-2xl p-6 hover:bg-card/80 transition-all hover:-translate-y-1 hover:shadow-glow"
              >
                <div className="absolute inset-0 rounded-2xl bg-gradient-primary opacity-0 group-hover:opacity-5 transition-opacity" />
                <div className="relative">
                  <div
                    className="inline-flex size-11 items-center justify-center rounded-xl mb-4"
                    style={{
                      background: purple
                        ? "color-mix(in oklch, var(--brand-purple) 14%, transparent)"
                        : "color-mix(in oklch, var(--primary) 12%, transparent)",
                      boxShadow: `inset 0 0 0 1px ${purple ? "color-mix(in oklch, var(--brand-purple) 35%, transparent)" : "color-mix(in oklch, var(--primary) 30%, transparent)"}`,
                    }}
                  >
                    <f.icon className="size-5" style={{ color: purple ? "var(--brand-purple-glow)" : "var(--primary)" }} />
                  </div>
                  <h3 className="font-semibold text-base mb-2">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
