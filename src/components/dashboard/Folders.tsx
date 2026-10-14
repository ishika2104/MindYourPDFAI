import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Folder, FolderPlus, MoreHorizontal, Pencil, Trash2, FolderInput, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface FolderRow {
  id: string;
  name: string;
  color: string | null;
}

export function useFolders() {
  return useQuery({
    queryKey: ["folders"],
    queryFn: async (): Promise<FolderRow[]> => {
      const { data, error } = await supabase
        .from("folders")
        .select("id, name, color")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Horizontal folder chips with create / rename / delete. */
export function FoldersBar({
  selected,
  onSelect,
}: {
  selected: string | null | "all";
  onSelect: (id: string | null | "all") => void;
}) {
  const qc = useQueryClient();
  const { data: folders = [] } = useFolders();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<FolderRow | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["folders"] });
    qc.invalidateQueries({ queryKey: ["documents-list"] });
    qc.invalidateQueries({ queryKey: ["documents"] });
  }

  async function createFolder() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    const { data: sess } = await supabase.auth.getUser();
    const userId = sess.user?.id;
    if (!userId) {
      setBusy(false);
      toast.error("Not signed in");
      return;
    }
    const { error } = await supabase.from("folders").insert({ name, user_id: userId });
    setBusy(false);
    if (error) return toast.error("Could not create folder");
    setNewName("");
    setCreating(false);
    toast.success(`Folder “${name}” created`);
    refresh();
  }

  async function saveRename() {
    if (!renaming) return;
    const name = renameValue.trim();
    if (!name) return;
    setBusy(true);
    const { error } = await supabase.from("folders").update({ name }).eq("id", renaming.id);
    setBusy(false);
    if (error) return toast.error("Could not rename folder");
    setRenaming(null);
    toast.success("Folder renamed");
    refresh();
  }

  async function deleteFolder(f: FolderRow) {
    setBusy(true);
    // Detach documents first so the FK doesn't block deletion.
    await supabase.from("documents").update({ folder_id: null }).eq("folder_id", f.id);
    const { error } = await supabase.from("folders").delete().eq("id", f.id);
    setBusy(false);
    if (error) return toast.error("Could not delete folder");
    if (selected === f.id) onSelect("all");
    toast.success("Folder deleted — its documents were kept");
    refresh();
  }

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 h-9 pl-3 pr-2.5 rounded-full text-sm transition-all whitespace-nowrap ${
      active
        ? "bg-primary/12 text-foreground ring-1 ring-primary/30"
        : "glass text-muted-foreground hover:text-foreground"
    }`;

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <button className={chip(selected === "all")} onClick={() => onSelect("all")}>
          All documents
        </button>
        <button className={chip(selected === null)} onClick={() => onSelect(null)}>
          Unfiled
        </button>

        {folders.map((f) => (
          <div key={f.id} className={chip(selected === f.id)}>
            <button className="flex items-center gap-1.5" onClick={() => onSelect(f.id)}>
              <Folder className="size-3.5" />
              {f.name}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="p-0.5 rounded-md opacity-60 hover:opacity-100"
                  aria-label={`Folder options for ${f.name}`}
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem
                  onClick={() => {
                    setRenaming(f);
                    setRenameValue(f.name);
                  }}
                >
                  <Pencil className="size-3.5 mr-2" /> Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => deleteFolder(f)}
                >
                  <Trash2 className="size-3.5 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}

        {creating ? (
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createFolder();
                if (e.key === "Escape") setCreating(false);
              }}
              placeholder="Folder name"
              className="h-9 w-40"
            />
            <Button size="sm" className="h-9" disabled={busy} onClick={createFolder}>
              <Check className="size-4" />
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-full"
            onClick={() => setCreating(true)}
          >
            <FolderPlus className="size-4 mr-1.5" /> New folder
          </Button>
        )}
      </div>

      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename folder</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveRename()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button onClick={saveRename} disabled={busy}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Per-document "move to folder" menu. */
export function MoveToFolderMenu({
  documentId,
  folderId,
}: {
  documentId: string;
  folderId: string | null;
}) {
  const qc = useQueryClient();
  const { data: folders = [] } = useFolders();

  async function move(target: string | null) {
    const { error } = await supabase
      .from("documents")
      .update({ folder_id: target })
      .eq("id", documentId);
    if (error) return toast.error("Could not move document");
    toast.success(target ? "Moved to folder" : "Removed from folder");
    qc.invalidateQueries({ queryKey: ["documents-list"] });
    qc.invalidateQueries({ queryKey: ["documents"] });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground opacity-70 hover:opacity-100"
          aria-label="Move to folder"
          title="Move to folder"
        >
          <FolderInput className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel>Move to folder</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => move(null)}>
          {folderId === null && <Check className="size-3.5 mr-2" />} Unfiled
        </DropdownMenuItem>
        {folders.length === 0 && (
          <DropdownMenuItem disabled>No folders yet</DropdownMenuItem>
        )}
        {folders.map((f) => (
          <DropdownMenuItem key={f.id} onClick={() => move(f.id)}>
            {folderId === f.id ? (
              <Check className="size-3.5 mr-2" />
            ) : (
              <Folder className="size-3.5 mr-2" />
            )}
            {f.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
