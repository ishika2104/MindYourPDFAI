import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { FileText, LayoutDashboard, Search, Upload } from "lucide-react";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { data: docs = [] } = useQuery({
    queryKey: ["cmdk-docs"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("documents")
        .select("id, title")
        .order("created_at", { ascending: false })
        .limit(30);
      return data ?? [];
    },
  });

  function go(fn: () => void) {
    setOpen(false);
    setTimeout(fn, 0);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search actions, documents, or pages…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => go(() => navigate({ to: "/dashboard" }))}>
            <Upload className="size-4 mr-2" /> New upload
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate({ to: "/dashboard" }))}>
            <LayoutDashboard className="size-4 mr-2" /> Overview
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate({ to: "/dashboard/search" }))}>
            <Search className="size-4 mr-2" /> Universal search
          </CommandItem>
        </CommandGroup>
        {docs.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Documents">
              {docs.map((d) => (
                <CommandItem
                  key={d.id}
                  onSelect={() => go(() =>
                    navigate({ to: "/dashboard/$documentId", params: { documentId: d.id } })
                  )}
                >
                  <FileText className="size-4 mr-2" /> {d.title}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
