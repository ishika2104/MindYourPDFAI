import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import iconUrl from "@/assets/mypdf-icon.png";

export function Navbar() {
  return (
    <header className="fixed top-0 inset-x-0 z-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 mt-4">
        <nav className="glass rounded-2xl px-4 sm:px-6 py-3 flex items-center justify-between shadow-card">
          <Link to="/" className="flex items-center gap-2 group">
            <img
              src={iconUrl}
              alt="mypdf logo"
              width={36}
              height={36}
              className="size-9 drop-shadow-[0_4px_12px_rgba(168,85,247,0.45)] group-hover:animate-wiggle"
            />
            <span className="font-display font-bold text-lg tracking-tight">
              mypdf<span className="text-purple"> :MindYourPDF</span> AI
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#how" className="hover:text-foreground transition-colors">How it works</a>
            <a href="#testimonials" className="hover:text-foreground transition-colors">Testimonials</a>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild size="sm" className="bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow-purple">
              <Link to="/auth" search={{ mode: "signup" }}>Get started</Link>
            </Button>
          </div>
        </nav>
      </div>
    </header>
  );
}
