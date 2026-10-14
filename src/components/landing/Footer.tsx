import { Sparkles } from "lucide-react";

export function Footer() {
  return (
    <footer className="relative border-t border-border/50 py-12 mt-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col md:flex-row justify-between gap-8">
          <div className="max-w-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="bg-gradient-primary rounded-lg p-1.5">
                <Sparkles className="size-4 text-primary-foreground" />
              </div>
              <span className="font-display font-bold">MindYourPDF<span className="text-primary"> AI</span></span>
            </div>
            <p className="text-sm text-muted-foreground">
              AI-powered document intelligence. Built for those who read deeply and think clearly.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-12 text-sm">
            <div>
              <div className="font-medium mb-3">Product</div>
              <ul className="space-y-2 text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground">Features</a></li>
                <li><a href="#how" className="hover:text-foreground">How it works</a></li>
                <li><a href="#" className="hover:text-foreground">Pricing</a></li>
              </ul>
            </div>
            <div>
              <div className="font-medium mb-3">Company</div>
              <ul className="space-y-2 text-muted-foreground">
                <li><a href="#" className="hover:text-foreground">About</a></li>
                <li><a href="#" className="hover:text-foreground">Blog</a></li>
                <li><a href="#" className="hover:text-foreground">Careers</a></li>
              </ul>
            </div>
            <div>
              <div className="font-medium mb-3">Legal</div>
              <ul className="space-y-2 text-muted-foreground">
                <li><a href="#" className="hover:text-foreground">Privacy</a></li>
                <li><a href="#" className="hover:text-foreground">Terms</a></li>
                <li><a href="#" className="hover:text-foreground">Security</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-10 pt-6 border-t border-border/50 flex flex-col sm:flex-row justify-between gap-4 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} MindYourPDF AI. All rights reserved.</span>
          <span>Crafted with intention.</span>
        </div>
      </div>
    </footer>
  );
}
