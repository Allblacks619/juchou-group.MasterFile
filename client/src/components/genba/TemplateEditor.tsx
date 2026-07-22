import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Pencil } from "lucide-react";
import { dispName } from "@/lib/genbaRomaji";
import { useGenbaT } from "@/lib/genbaLang";

type EditNode = { key: string; name: string; children: EditNode[] };

let _k = 0;
const keyOf = () => `n${++_k}`;

function toEdit(nodes: { name: string; children?: any[] }[]): EditNode[] {
  return nodes.map((n) => ({ key: keyOf(), name: n.name, children: toEdit(n.children || []) }));
}
function toTree(nodes: EditNode[]): { name: string; children?: any[] }[] {
  return nodes.map((n) => ({ name: n.name, ...(n.children.length ? { children: toTree(n.children) } : {}) }));
}

/** 作業テンプレート編集 (プロトタイプ TemplateEditor 移植・簡易版)。エリア作成時に自動適用される標準作業ツリー。 */
export default function TemplateEditor({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useGenbaT();
  const { data, isLoading } = trpc.genba.templates.get.useQuery(undefined, { enabled: open, retry: false });
  const utils = trpc.useUtils();
  const [nodes, setNodes] = useState<EditNode[]>([]);

  useEffect(() => {
    if (data?.tree) setNodes(toEdit(data.tree as any));
  }, [data]);

  const save = trpc.genba.templates.saveTree.useMutation({
    onSuccess: () => { utils.genba.templates.get.invalidate(); toast.success(t("テンプレートを保存しました")); onOpenChange(false); },
    onError: (e) => toast.error(e.message),
  });

  function mutateAt(list: EditNode[], key: string, fn: (n: EditNode) => EditNode | null): EditNode[] {
    const out: EditNode[] = [];
    for (const n of list) {
      if (n.key === key) {
        const r = fn(n);
        if (r) out.push(r);
      } else {
        out.push({ ...n, children: mutateAt(n.children, key, fn) });
      }
    }
    return out;
  }

  const rename = (key: string, name: string) => setNodes((ns) => mutateAt(ns, key, (n) => ({ ...n, name })));
  const remove = (key: string) => setNodes((ns) => mutateAt(ns, key, () => null));
  const addChild = (key: string, name: string) => setNodes((ns) => mutateAt(ns, key, (n) => ({ ...n, children: [...n.children, { key: keyOf(), name, children: [] }] })));
  const addRoot = (name: string) => setNodes((ns) => [...ns, { key: keyOf(), name, children: [] }]);

  const renderNode = (n: EditNode, depth: number): React.ReactNode => (
    <div key={n.key} style={{ paddingLeft: depth * 16 }}>
      <div className="flex items-center gap-1 py-1">
        <span className="text-sm flex-1 truncate">{dispName(n.name)}</span>
        <Button variant="ghost" size="sm" className="px-1 h-7" title={t("名前変更")} onClick={() => { const v = window.prompt(t("名前を変更"), n.name); if (v && v.trim()) rename(n.key, v.trim()); }}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        {depth < 2 && (
          <Button variant="ghost" size="sm" className="px-1 h-7" title={t("子を追加")} onClick={() => { const v = window.prompt(t("子作業名を入力")); if (v && v.trim()) addChild(n.key, v.trim()); }}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button variant="ghost" size="sm" className="px-1 h-7 text-destructive hover:text-destructive" onClick={() => remove(n.key)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {n.children.map((c) => renderNode(c, depth + 1))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("作業テンプレート")} {data?.isDefault && <span className="text-xs text-muted-foreground">{t("(既定)")}</span>}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{t("エリアを作成すると、このテンプレートの作業が自動で展開されます。")}</p>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="border border-border rounded-md p-2">
            {nodes.map((n) => renderNode(n, 0))}
            <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => { const v = window.prompt(t("作業名を入力")); if (v && v.trim()) addRoot(v.trim()); }}>
              <Plus className="h-4 w-4 mr-1" /> {t("作業を追加")}
            </Button>
          </div>
        )}
        <DialogFooter>
          <Button onClick={() => save.mutate({ tree: toTree(nodes) })} disabled={save.isPending || isLoading}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} {t("保存")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
