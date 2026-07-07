import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Loader2, HardHat, Link2, Pencil, FolderOpen } from "lucide-react";
import FloorWorkspace from "@/components/genba/FloorWorkspace";

/**
 * 現場ビジョン (genba) — 現場一覧 + 図面ワークスペース(M2-A)。
 * 現場の作成/リネーム/Driveリンク設定(M1) + 現場を開いて図面を管理(M2-A)。
 * エリア・作業は M2-B / M2-C。
 */
export default function AppGenba() {
  const utils = trpc.useUtils();

  const { data: me, isLoading: meLoading, error: meError } = trpc.genba.me.useQuery(undefined, { retry: false });
  const { data: sites, isLoading: sitesLoading } = trpc.genba.sites.list.useQuery(undefined, { retry: false, enabled: !!me });

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [editSiteId, setEditSiteId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDriveUrl, setEditDriveUrl] = useState("");
  const [openSiteId, setOpenSiteId] = useState<string | null>(null);

  const createSite = trpc.genba.sites.create.useMutation({
    onSuccess: () => {
      utils.genba.sites.list.invalidate();
      setCreateOpen(false);
      setNewName("");
      toast.success("現場を作成しました");
    },
    onError: (e) => toast.error(e.message),
  });

  const renameSite = trpc.genba.sites.rename.useMutation({
    onSuccess: () => {
      utils.genba.sites.list.invalidate();
      toast.success("現場名を変更しました");
    },
    onError: (e) => toast.error(e.message),
  });

  const setDriveUrl = trpc.genba.sites.setDriveUrl.useMutation({
    onSuccess: () => {
      utils.genba.sites.list.invalidate();
      setEditSiteId(null);
      toast.success("Driveリンクを更新しました");
    },
    onError: (e) => toast.error(e.message),
  });

  if (meLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (meError || !me) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          現場ビジョンは現在利用できません。
        </CardContent>
      </Card>
    );
  }

  const canEdit = me.genbaRole !== "worker";
  const genbaRoleLabel: Record<string, string> = { admin: "管理者", leader: "リーダー", worker: "作業員" };

  const openEdit = (site: { id: string; name: string; driveUrl: string | null }) => {
    setEditSiteId(site.id);
    setEditName(site.name);
    setEditDriveUrl(site.driveUrl || "");
  };

  const editingSite = (sites || []).find((s) => s.id === editSiteId) || null;
  const openSite = (sites || []).find((s) => s.id === openSiteId) || null;

  if (openSite) {
    return (
      <FloorWorkspace
        siteId={openSite.id}
        siteName={openSite.name}
        driveUrl={openSite.driveUrl}
        canEdit={canEdit}
        onBack={() => setOpenSiteId(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HardHat className="h-6 w-6 text-gold" />
            現場ビジョン
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {me.name || "ユーザー"} さん（{genbaRoleLabel[me.genbaRole] || me.genbaRole}） — 現場を開いて図面を管理（エリア・作業は順次追加）
          </p>
        </div>
        {canEdit && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-1" />
                現場
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新しい現場を作成</DialogTitle>
                <DialogDescription>現場名を入力してください（後から変更できます）。</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="genba-new-name">現場名</Label>
                <Input
                  id="genba-new-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="例: ○○ビル新築工事"
                  maxLength={120}
                />
              </div>
              <DialogFooter>
                <Button
                  onClick={() => createSite.mutate({ name: newName.trim() })}
                  disabled={!newName.trim() || createSite.isPending}
                >
                  {createSite.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  作成
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {sitesLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (sites || []).length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            まだ現場がありません。{canEdit ? "「＋現場」から作成してください。" : "管理者またはリーダーが現場を作成すると表示されます。"}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(sites || []).map((site) => (
            <Card key={site.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between gap-2">
                  <span className="truncate">{site.name}</span>
                  {canEdit && (
                    <Button variant="ghost" size="sm" onClick={() => openEdit(site)} title="編集">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                {site.projectId && <Badge variant="outline">工事案件 #{site.projectId} 連携</Badge>}
                {site.driveUrl ? (
                  <a
                    href={site.driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-gold hover:underline break-all"
                  >
                    <Link2 className="h-3.5 w-3.5 shrink-0" />
                    共有フォルダ
                  </a>
                ) : (
                  <p className="text-xs">共有フォルダ未設定</p>
                )}
                <Button variant="outline" size="sm" className="w-full" onClick={() => setOpenSiteId(site.id)}>
                  <FolderOpen className="h-4 w-4 mr-1" />
                  図面を開く
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 編集ダイアログ (リネーム + Driveリンク) */}
      <Dialog open={!!editSiteId} onOpenChange={(open) => !open && setEditSiteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>現場を編集</DialogTitle>
            <DialogDescription>現場名とDrive共有リンクを変更できます。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="genba-edit-name">現場名</Label>
              <Input
                id="genba-edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="genba-edit-drive">Drive共有リンク（空欄で解除）</Label>
              <Input
                id="genba-edit-drive"
                value={editDriveUrl}
                onChange={(e) => setEditDriveUrl(e.target.value)}
                placeholder="https://drive.google.com/..."
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (!editSiteId || !editName.trim()) return;
                renameSite.mutate({ id: editSiteId, name: editName.trim() });
              }}
              disabled={!editName.trim() || editName.trim() === editingSite?.name || renameSite.isPending}
            >
              {renameSite.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              名前を保存
            </Button>
            <Button
              onClick={() => {
                if (!editSiteId) return;
                setDriveUrl.mutate({ id: editSiteId, driveUrl: editDriveUrl.trim() });
              }}
              disabled={setDriveUrl.isPending}
            >
              {setDriveUrl.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              リンクを保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
