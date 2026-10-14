import { ArrowRight, Upload } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function CTA() {
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl glass-strong p-12 sm:p-16 text-center shadow-elegant">
          <div className="absolute -top-32 left-1/3 w-[400px] h-[400px] bg-primary/30 rounded-full blur-[120px]" />
          <div className="absolute -top-24 right-0 w-[400px] h-[400px] rounded-full blur-[120px]" style={{ background: "color-mix(in oklch, var(--brand-purple) 40%, transparent)" }} />
          <div className="relative">
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">
              Stop reading. <span className="text-gradient">Start understanding.</span>
            </h2>
            <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
              Join thousands of researchers, professionals, and students turning PDFs into conversations.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button asChild size="lg" className="bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow-purple h-12 px-6 group">
                <Link to="/auth" search={{ mode: "signup" }}>
                  <Upload className="size-4 mr-2" />
                  Upload your first PDF
                  <ArrowRight className="size-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
