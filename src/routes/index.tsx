import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Pricing } from "@/components/landing/Pricing";
import { Testimonials } from "@/components/landing/Testimonials";
import { CTA } from "@/components/landing/CTA";
import { Footer } from "@/components/landing/Footer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MindYourPDF AI — Understand any PDF instantly with AI" },
      { name: "description", content: "Upload, chat, summarize, search, and listen to PDFs with AI. RAG-powered answers with cited sources, smart summaries, and text-to-speech." },
      { property: "og:title", content: "MindYourPDF AI — Understand any PDF instantly with AI" },
      { property: "og:description", content: "AI-powered document intelligence. Chat with your PDFs, get cited answers, and listen to documents." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      <Pricing />
      <Testimonials />
      <CTA />
      <Footer />
    </main>
  );
}
