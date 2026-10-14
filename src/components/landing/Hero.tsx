import { ArrowRight, Upload, Play, FileText, MessageSquare, Volume2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import heroImg from "@/assets/hero-pdf.jpg";

export function Hero() {
  return (
    <section className="relative pt-36 pb-24 overflow-hidden">
      <div className="absolute inset-0 grid-bg pointer-events-none" />
      <div className="absolute top-20 left-1/3 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-32 right-1/4 w-[420px] h-[420px] rounded-full blur-[120px] pointer-events-none" style={{ background: "color-mix(in oklch, var(--brand-purple) 30%, transparent)" }} />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 text-xs font-medium mb-8">
            <span className="size-1.5 rounded-full animate-pulse" style={{ background: "var(--brand-purple)" }} />
            <span className="text-muted-foreground">Your PDFs finally have opinions 💬</span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight">
            Understand any PDF{" "}
            <span className="text-gradient">instantly with AI</span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
            Upload, chat, summarize, search, and listen to documents using artificial intelligence.
            Turn hours of reading into minutes of understanding.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild size="lg" className="bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow-purple group h-12 px-6">
              <Link to="/auth" search={{ mode: "signup" }}>
                <Upload className="size-4 mr-2" />
                Upload PDF
                <ArrowRight className="size-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="glass h-12 px-6 border-border">
              <Play className="size-4 mr-2" />
              Try demo
            </Button>
          </div>

          <div className="mt-8 flex items-center justify-center gap-6 text-xs text-muted-foreground">
            <span>✓ No credit card</span>
            <span>✓ Free forever tier</span>
            <span>✓ SOC2 ready</span>
          </div>
        </div>

        {/* Hero visual */}
        <div className="relative mt-20 max-w-5xl mx-auto">
          <div className="absolute -inset-4 bg-gradient-primary rounded-3xl blur-3xl opacity-20 animate-pulse-glow" />
          <div className="relative glass-strong rounded-3xl p-3 shadow-elegant">
            <div className="relative rounded-2xl overflow-hidden aspect-video bg-card">
              <img
                src={heroImg}
                alt="AI analyzing a PDF document"
                width={1536}
                height={1152}
                className="w-full h-full object-cover"
              />
              {/* Floating chips */}
              <div className="absolute top-6 left-6 glass-strong rounded-xl px-3 py-2 flex items-center gap-2 text-sm animate-float">
                <FileText className="size-4 text-primary" />
                <span className="font-medium">research-paper.pdf</span>
                <span className="text-xs text-muted-foreground">· 42 pages</span>
              </div>
              <div className="absolute bottom-6 right-6 glass-strong rounded-xl px-3 py-2 flex items-center gap-2 text-sm animate-float" style={{ animationDelay: "1s" }}>
                <MessageSquare className="size-4" style={{ color: "var(--brand-purple-glow)" }} />
                <span className="font-medium">3 sources cited</span>
              </div>
              <div className="absolute top-1/2 right-6 -translate-y-1/2 glass-strong rounded-full p-3 animate-float" style={{ animationDelay: "2s", boxShadow: "var(--shadow-glow-purple)" }}>
                <Volume2 className="size-5" style={{ color: "var(--brand-purple-glow)" }} />
              </div>
            </div>
          </div>
        </div>

        {/* Logo strip */}
        <div className="mt-20 text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-6">
            Trusted by teams at
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4 opacity-50">
            {["Stanford", "MIT Labs", "Anthropic", "Notion", "Linear", "Vercel"].map((n) => (
              <span key={n} className="font-display font-semibold text-lg">{n}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
