import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const Chart = lazy(() => import("./AnalyticsChart"));

export function LazyAnalyticsChart({ data }: { data: { name: string; pages: number }[] }) {
  return (
    <Suspense
      fallback={
        <div className="h-full flex items-center justify-center text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      }
    >
      <Chart data={data} />
    </Suspense>
  );
}
