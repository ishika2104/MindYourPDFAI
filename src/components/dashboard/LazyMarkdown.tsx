import { lazy, Suspense } from "react";

const ReactMarkdown = lazy(() => import("react-markdown"));

export function LazyMarkdown({ children }: { children: string }) {
  return (
    <Suspense fallback={<p className="text-sm whitespace-pre-wrap">{children}</p>}>
      <ReactMarkdown>{children}</ReactMarkdown>
    </Suspense>
  );
}
