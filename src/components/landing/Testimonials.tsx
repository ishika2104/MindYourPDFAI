const quotes = [
  { q: "I burned through a 300-page thesis in an afternoon. The citation jumps are gold.", name: "Dr. Amara Okafor", role: "Research Lead, BioGen" },
  { q: "The text-to-speech feature changed how I review contracts on commutes. Genuinely brilliant.", name: "Marcus Chen", role: "Corporate Lawyer" },
  { q: "Notion-level polish with Perplexity-level intelligence. My new default reader.", name: "Lina Hoffmann", role: "Product Designer" },
  { q: "Multi-PDF comparison saved my literature review. Felt like having three TAs.", name: "Jordan Reyes", role: "PhD Candidate, MIT" },
];

export function Testimonials() {
  return (
    <section id="testimonials" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center mb-16">
          <p className="text-sm font-medium text-primary mb-3">Loved by readers</p>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Built for those who <span className="text-gradient">read deeply</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-4 max-w-5xl mx-auto">
          {quotes.map((t) => (
            <figure key={t.name} className="glass rounded-2xl p-7">
              <blockquote className="text-lg leading-relaxed">"{t.q}"</blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                <div className="size-10 rounded-full bg-gradient-primary flex items-center justify-center text-primary-foreground font-semibold">
                  {t.name[0]}
                </div>
                <div>
                  <div className="font-medium text-sm">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.role}</div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
