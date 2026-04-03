import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  FolderOpen,
  Users,
  UserPlus,
  UserMinus,
  ChevronDown,
  ChevronRight,
  MapPin,
  Calendar,
  Building2,
} from "lucide-react";

function toDateStr(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().split("T")[0];
}

function toDisplayDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("ja-JP");
}

const statusLabel: Record<string, string> = { active: "進行中", completed: "完了", cancelled: "中止" };
const statusColor: Record<string, string> = {
  active: "bg-green-500/10 text-green-500 border-green-500/20",
  completed: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  cancelled: "bg-red-500/10 text-red-500 border-red-500/20",
};

/** Project Members Management */
function ProjectMembers({ projectId }: { projectId: number }) {
  const utils = trpc.useUtils();
  const { data: members, isLoading } = trpc.project.members.useQuery({ projectId });
  const { data: allEmployees } = trpc.employee.list.useQuery();
  const addMember = trpc.project.addMember.useMutation({
    onSuccess: () => {
      utils.project.members.invalidate({ projectId });
      toast.success("作業員を追加しました");
      setShowAdd(false);
      setSelectedEmployeeId("");
    },
    onError: (e) => toast.error(e.message),
  });
  const removeMember = trpc.project.removeMember.useMutation({
    onSuccess: () => {
      utils.project.members.invalidate({ projectId });
      toast.success("作業員を除外しました");
    },
    onError: (e) => toast.error(e.message),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [memberSearch, setMemberSearch] = useState("");

  // Active members only
  const activeMembers = useMemo(() => {
    return (members || []).filter((m: any) => m.isActive);
  }, [members]);

  // Available employees (not already active members)
  const availableEmployees = useMemo(() => {
    if (!allEmployees) return [];
    const memberEmpIds = new Set(activeMembers.map((m: any) => m.employeeId));
    return allEmployees.filter((e: any) => !memberEmpIds.has(e.id));
  }, [allEmployees, activeMembers]);

  // Filter available employees by search
  const filteredAvailable = useMemo(() => {
    if (!memberSearch) return availableEmployees;
    const q = memberSearch.toLowerCase();
    return availableEmployees.filter((e: any) =>
      (e.nameKanji || "").toLowerCase().includes(q) ||
      (e.nameKana || "").toLowerCase().includes(q) ||
      (e.nameRomaji || "").toLowerCase().includes(q)
    );
  }, [availableEmployees, memberSearch]);

  return (
    <div className="mt-3 pt-3 border-t border-border/50">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-gold/70" />
          <span className="text-sm font-medium">作業員 ({activeMembers.length}名)</span>
        </div>
        <Dialog open={showAdd} onOpenChange={(o) => { setShowAdd(o); if (!o) { setSelectedEmployeeId(""); setMemberSearch(""); } }}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs">
              <UserPlus className="h-3 w-3 mr-1" />追加
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>作業員を追加</DialogTitle>
              <DialogDescription>この現場に配属する作業員を選択してください</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="作業員を検索..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1 border rounded-md p-2">
                {filteredAvailable.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">追加可能な作業員がいません</p>
                ) : (
                  filteredAvailable.map((emp: any) => (
                    <button
                      key={emp.id}
                      onClick={() => setSelectedEmployeeId(String(emp.id))}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        selectedEmployeeId === String(emp.id)
                          ? "bg-gold/10 text-gold border border-gold/30"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <span className="font-medium">{emp.nameKanji || emp.nameRomaji || `ID:${emp.id}`}</span>
                      {emp.nameKana && <span className="text-xs text-muted-foreground ml-2">{emp.nameKana}</span>}
                    </button>
                  ))
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAdd(false)}>キャンセル</Button>
              <Button
                className="bg-gold text-background hover:bg-gold/90"
                disabled={!selectedEmployeeId || addMember.isPending}
                onClick={() => addMember.mutate({ projectId, employeeId: Number(selectedEmployeeId) })}
              >
                {addMember.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "追加"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : activeMembers.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">作業員が配属されていません</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {activeMembers.map((m: any) => (
            <div
              key={m.id}
              className="flex items-center gap-1.5 bg-muted/50 rounded-full px-3 py-1 text-xs"
            >
              <span>{m.employee?.nameKanji || m.employee?.nameRomaji || `ID:${m.employeeId}`}</span>
              <button
                onClick={() => {
                  if (confirm(`${m.employee?.nameKanji || "この作業員"}をこの現場から除外しますか？`)) {
                    removeMember.mutate({ projectId, employeeId: m.employeeId });
                  }
                }}
                className="text-muted-foreground hover:text-red-500 transition-colors ml-1"
              >
                <UserMinus className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AppProjects() {
  const utils = trpc.useUtils();
  const { data: projects, isLoading } = trpc.project.list.useQuery();
  const { data: clients } = trpc.clientInfo.list.useQuery();
  const createProject = trpc.project.create.useMutation({
    onSuccess: () => { utils.project.list.invalidate(); toast.success("現場を追加しました"); setShowCreate(false); resetForm(); },
    onError: (e) => toast.error(e.message),
  });
  const updateProject = trpc.project.update.useMutation({
    onSuccess: () => { utils.project.list.invalidate(); toast.success("現場を更新しました"); setEditId(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteProject = trpc.project.delete.useMutation({
    onSuccess: () => { utils.project.list.invalidate(); toast.success("現場を削除しました"); },
    onError: (e) => toast.error(e.message),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({ name: "", clientId: "", address: "", status: "active" as string, startDate: "", endDate: "", notes: "" });

  const resetForm = () => setForm({ name: "", clientId: "", address: "", status: "active", startDate: "", endDate: "", notes: "" });

  const filtered = useMemo(() => {
    if (!projects) return [];
    let list = projects;
    if (statusFilter !== "all") {
      list = list.filter((p: any) => p.status === statusFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p: any) => p.name.toLowerCase().includes(q) || p.client?.name?.toLowerCase().includes(q) || (p.address || "").toLowerCase().includes(q));
    }
    return list;
  }, [projects, search, statusFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">現場管理</h1>
        <p className="text-muted-foreground text-sm mt-1">現場の登録・編集と作業員の配属管理</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="flex flex-1 gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="現場を検索..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全て</SelectItem>
              <SelectItem value="active">進行中</SelectItem>
              <SelectItem value="completed">完了</SelectItem>
              <SelectItem value="cancelled">中止</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-gold text-background hover:bg-gold/90"><Plus className="h-4 w-4 mr-1" />現場追加</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>現場を追加</DialogTitle>
              <DialogDescription>現場の情報を入力してください</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div><Label>現場名<span className="text-red-500">*</span></Label><Input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} placeholder="〇〇ビル新築工事" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>取引先</Label>
                  <Select value={form.clientId || "none"} onValueChange={(v) => setForm(p => ({ ...p, clientId: v === "none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">未選択</SelectItem>
                      {clients?.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>ステータス</Label>
                  <Select value={form.status} onValueChange={(v) => setForm(p => ({ ...p, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">進行中</SelectItem>
                      <SelectItem value="completed">完了</SelectItem>
                      <SelectItem value="cancelled">中止</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>住所</Label><Input value={form.address} onChange={(e) => setForm(p => ({ ...p, address: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>開始日</Label><Input type="date" value={form.startDate} onChange={(e) => setForm(p => ({ ...p, startDate: e.target.value }))} /></div>
                <div><Label>終了日</Label><Input type="date" value={form.endDate} onChange={(e) => setForm(p => ({ ...p, endDate: e.target.value }))} /></div>
              </div>
              <div><Label>備考</Label><Input value={form.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>キャンセル</Button>
              <Button className="bg-gold text-background hover:bg-gold/90" disabled={!form.name || createProject.isPending} onClick={() => {
                createProject.mutate({
                  name: form.name,
                  clientId: form.clientId ? Number(form.clientId) : undefined,
                  address: form.address || undefined,
                  status: form.status as any,
                  startDate: form.startDate || undefined,
                  endDate: form.endDate || undefined,
                  notes: form.notes || undefined,
                });
              }}>
                {createProject.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "追加"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Project List */}
      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>現場が登録されていません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p: any) => (
            <Card key={p.id} className="hover:border-gold/30 transition-colors">
              <CardContent className="p-4">
                {editId === p.id ? (
                  /* Edit mode */
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div><Label>現場名</Label><Input value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} /></div>
                      <div>
                        <Label>取引先</Label>
                        <Select value={form.clientId || "none"} onValueChange={(v) => setForm(prev => ({ ...prev, clientId: v === "none" ? "" : v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">未選択</SelectItem>
                            {clients?.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div><Label>住所</Label><Input value={form.address} onChange={(e) => setForm(prev => ({ ...prev, address: e.target.value }))} /></div>
                      <div>
                        <Label>ステータス</Label>
                        <Select value={form.status} onValueChange={(v) => setForm(prev => ({ ...prev, status: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">進行中</SelectItem>
                            <SelectItem value="completed">完了</SelectItem>
                            <SelectItem value="cancelled">中止</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div><Label>備考</Label><Input value={form.notes} onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>開始日</Label><Input type="date" value={form.startDate} onChange={(e) => setForm(prev => ({ ...prev, startDate: e.target.value }))} /></div>
                      <div><Label>終了日</Label><Input type="date" value={form.endDate} onChange={(e) => setForm(prev => ({ ...prev, endDate: e.target.value }))} /></div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setEditId(null)}>キャンセル</Button>
                      <Button size="sm" className="bg-gold text-background hover:bg-gold/90" disabled={updateProject.isPending} onClick={() => {
                        updateProject.mutate({
                          id: p.id, name: form.name,
                          clientId: form.clientId ? Number(form.clientId) : null,
                          address: form.address || undefined, status: form.status as any,
                          startDate: form.startDate || undefined, endDate: form.endDate || undefined,
                          notes: form.notes || undefined,
                        });
                      }}>
                        {updateProject.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* View mode */
                  <div>
                    <div className="flex items-start justify-between">
                      <button
                        onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                        className="flex items-start gap-2 text-left flex-1 min-w-0"
                      >
                        {expandedId === p.id ? (
                          <ChevronDown className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-sm">{p.name}</h3>
                            <Badge variant="outline" className={statusColor[p.status] || ""}>{statusLabel[p.status] || p.status}</Badge>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                            {p.client && (
                              <span className="flex items-center gap-1">
                                <Building2 className="h-3 w-3" />{p.client.name}
                              </span>
                            )}
                            {p.address && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />{p.address}
                              </span>
                            )}
                            {(p.startDate || p.endDate) && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {toDisplayDate(p.startDate)} ~ {toDisplayDate(p.endDate)}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                      <div className="flex gap-1 shrink-0 ml-2">
                        <Button variant="ghost" size="sm" onClick={() => {
                          setEditId(p.id);
                          setExpandedId(null);
                          setForm({ name: p.name, clientId: p.clientId ? String(p.clientId) : "", address: p.address || "", status: p.status, startDate: toDateStr(p.startDate), endDate: toDateStr(p.endDate), notes: p.notes || "" });
                        }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => { if (confirm("この現場を削除しますか？")) deleteProject.mutate({ id: p.id }); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Expanded: Show members */}
                    {expandedId === p.id && <ProjectMembers projectId={p.id} />}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
