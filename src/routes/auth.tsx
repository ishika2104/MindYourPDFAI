import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Sparkles, Mail, Lock, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

const search = z.object({ mode: z.enum(["signin", "signup"]).optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Sign in — MindYourPDF AI" },
      { name: "description", content: "Sign in or create a free MindYourPDF AI account to chat with your PDFs." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode: initial } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(initial ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/dashboard", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        toast.success("Account created — you're in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/dashboard",
    });
    if (result.error) {
      toast.error(result.error.message ?? "Google sign-in failed");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen relative flex items-center justify-center px-4 py-12">
      <div className="absolute inset-0 grid-bg pointer-events-none" />
      <div className="absolute top-20 left-1/3 w-[480px] h-[480px] bg-primary/25 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-[420px] h-[420px] rounded-full blur-[120px] pointer-events-none" style={{ background: "color-mix(in oklch, var(--brand-purple) 35%, transparent)" }} />

      <div className="relative w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-8 group">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-primary rounded-lg blur-md opacity-70 group-hover:opacity-100 transition-opacity" />
            <div className="relative bg-gradient-primary rounded-lg p-1.5">
              <Sparkles className="size-4 text-primary-foreground" />
            </div>
          </div>
          <span className="font-display font-bold text-lg tracking-tight">
            MindYourPDF<span className="text-purple"> AI</span>
          </span>
        </Link>

        <div className="glass-strong rounded-3xl p-8 shadow-elegant">
          <h1 className="text-2xl font-bold tracking-tight text-center">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-sm text-muted-foreground text-center mt-1">
            {mode === "signin" ? "Sign in to continue with your documents" : "Start reading smarter in seconds"}
          </p>

          <Button
            type="button"
            variant="outline"
            onClick={handleGoogle}
            disabled={loading}
            className="w-full mt-6 h-11 glass border-border"
          >
            <svg className="size-4 mr-2" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 11v3.2h4.5c-.2 1.2-1.4 3.6-4.5 3.6-2.7 0-4.9-2.2-4.9-5s2.2-5 4.9-5c1.6 0 2.6.7 3.2 1.2l2.2-2.1C15.9 5.5 14.1 4.7 12 4.7 7.9 4.7 4.6 8 4.6 12s3.3 7.3 7.4 7.3c4.3 0 7.1-3 7.1-7.2 0-.5 0-.8-.1-1.2H12z"/></svg>
            Continue with Google
          </Button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
            <span className="relative flex justify-center text-[11px] uppercase tracking-widest text-muted-foreground">
              <span className="bg-card/80 px-3 rounded">or with email</span>
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="pl-9 h-11" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="pl-9 h-11" />
              </div>
            </div>

            <Button type="submit" disabled={loading} className="w-full h-11 bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow-purple group">
              {loading ? <Loader2 className="size-4 animate-spin" /> : (
                <>
                  {mode === "signin" ? "Sign in" : "Create account"}
                  <ArrowRight className="size-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
            <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="text-purple font-medium hover:underline">
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          By continuing, you agree to our Terms and Privacy Policy.
        </p>
      </div>
    </main>
  );
}
