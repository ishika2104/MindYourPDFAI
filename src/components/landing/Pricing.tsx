import { Check, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

const tiers = [
  {
    name: "Free",
    price: "₹0",
    period: "forever",
    desc: "For curious minds getting started.",
    cta: "Start free",
    to: "/auth" as const,
    search: { mode: "signup" as const },
    highlight: false,
    features: [
      "5 PDF uploads / month",
      "AI chat with citations",
      "Smart summaries (short)",
      "Semantic search",
      "Text-to-speech",
    ],
  },
  {
    name: "Pro",
    price: "₹25",
    period: "/mo",
    desc: "For power users and researchers.",
    cta: "Go Pro",
    to: "/auth" as const,
    search: { mode: "signup" as const },
    highlight: true,
    features: [
      "Unlimited PDF uploads",
      "Detailed & key-point summaries",
      "AI Insights & Study Mode",
      "PDF ⇄ Word file conversion",
      "Export to PDF / DOCX / TXT",
      "Analytics dashboard",
      "Priority processing",
    ],
  },
  {
    name: "Team",
    price: "₹50",
    period: "/mo",
    desc: "For teams that read together.",
    cta: "Start with Team",
    to: "/auth" as const,
    search: { mode: "signup" as const },
    highlight: false,
    features: [
      "Everything in Pro",
      "Shared workspace folders",
      "Collaborative document library",
      "Usage analytics for the team",
      "Onboarding & support",
      "Centralized billing",
    ],
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="relative py-24">
      <div className="absolute top-1/3 left-1/4 w-[420px] h-[420px] bg-primary/20 rounded-full blur-[140px] pointer-events-none" />
      <div
        className="absolute top-1/4 right-1/4 w-[380px] h-[380px] rounded-full blur-[140px] pointer-events-none"
        style={{ background: "color-mix(in oklch, var(--brand-purple) 28%, transparent)" }}
      />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center mb-16">
          <p className="text-sm font-medium text-primary mb-3">Pricing</p>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Plans that <span className="text-gradient">scale with you</span>
          </h2>
          <p className="mt-4 text-muted-foreground">
            Start free, upgrade when you're ready. No credit card required to begin.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 items-stretch">
          {tiers.map((tier) => {
            const isPro = tier.highlight;
            return (
              <div
                key={tier.name}
                className={`group relative flex flex-col rounded-3xl p-8 transition-all hover:-translate-y-1 ${
                  isPro
                    ? "glass-strong shadow-glow-purple ring-1 ring-primary/40 md:-mt-4 md:mb-4"
                    : "glass hover:bg-card/80 hover:shadow-glow"
                }`}
              >
                {isPro && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-gradient-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground shadow-glow-purple">
                    <Sparkles className="size-3" />
                    Most popular
                  </div>
                )}

                <div className="relative">
                  <h3 className="text-lg font-semibold">{tier.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground h-10">{tier.desc}</p>

                  <div className="mt-4 flex items-baseline gap-1.5">
                    <span className="text-5xl font-bold tracking-tight">{tier.price}</span>
                    <span className="text-sm text-muted-foreground">{tier.period}</span>
                  </div>

                  <Button
                    asChild
                    size="lg"
                    className={`mt-6 w-full h-11 ${
                      isPro
                        ? "bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow-purple"
                        : "glass border-border hover:bg-card/80"
                    }`}
                  >
                    <Link to={tier.to} search={tier.search}>
                      {tier.cta}
                    </Link>
                  </Button>
                </div>

                <ul className="relative mt-8 space-y-3 text-sm">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <span
                        className="mt-0.5 inline-flex size-4.5 shrink-0 items-center justify-center rounded-full"
                        style={{
                          background: isPro
                            ? "color-mix(in oklch, var(--brand-purple) 18%, transparent)"
                            : "color-mix(in oklch, var(--primary) 14%, transparent)",
                        }}
                      >
                        <Check
                          className="size-3"
                          style={{ color: isPro ? "var(--brand-purple-glow)" : "var(--primary)" }}
                        />
                      </span>
                      <span className="text-foreground/80">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Prices in INR (₹). Taxes may apply. Cancel anytime.
        </p>
      </div>
    </section>
  );
}
