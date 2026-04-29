import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  DollarSign,
  FolderOpen,
  Sun,
  Moon,
  Users,
} from "lucide-react";

/** Helper: format Date to YYYY-MM-DD */
function toDateStr(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().split("T")[0];
}

/** Helper: format number with commas */
function formatYen(n: number | null | undefined): string {
  if (n == null) return "\u2014";
  return `\u00a5${n.toLocaleString()}`;
}

// ═══════════════════════════════════════════════════════
// CLIENTS TAB
// ═══════════════════════════════════════════════════════

function ClientsTab() {
  const utils = trpc.useUtils();
  const { data: clients, isLoading } = trpc.clientInfo.list.useQuery();
  const createClient = trpc.clientInfo.create.useMutation({
    onSuccess: () => { utils.clientInfo.list.invalidate(); toast.success("取引先を追加しました"); setShowCreate(false); resetForm(); },
    onError: (e) => toast.error(e.message),
  });
  const updateClient = trpc.clientInfo.update.useMutation({
    onSuccess: () => { utils.clientInfo.list.invalidate(); toast.success("取引先を更新しました"); setEditId(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteClient = trpc.clientInfo.delete.useMutation({
    onSuccess: () => { utils.clientInfo.list.invalidate(); toast.success("取引先を削除しました"); },
    onError: (e) => toast.error(e.message),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", postalCode: "", address: "", phone: "", email: "", contactPerson: "", notes: "" });

  const resetForm = () => setForm({ name: "", postalCode: "", address: "", phone: "", email: "", contactPerson: "", notes: "" });

  const filtered = useMemo(() => {
    if (!clients) return [];
    if (!search) return clients;
    const q = search.toLowerCase();
    return clients.filter(c => c.name.toLowerCase().includes(q) || c.contactPerson?.toLowerCase().includes(q));
  }, [clients, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="取引先を検索..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-gold text-background hover:bg-gold/90"><Plus className="h-4 w-4 mr-1" />取引先追加</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>取引先を追加</DialogTitle>
              <DialogDescription>取引先の情報を入力してください</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div><Label>会社名<span className="text-red-500">*</span></Label><Input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} placeholder="株式会社〇〇" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>担当者名</Label><Input value={form.contactPerson} onChange={(e) => setForm(p => ({ ...p, contactPerson: e.target.value }))} /></div>
                <div><Label>電話番号</Label><Input value={form.phone} onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
              </div>
              <div><Label>メール</Label><Input value={form.email} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>郵便番号</Label><Input value={form.postalCode} onChange={(e) => setForm(p => ({ ...p, postalCode: e.target.value }))} /></div>
                <div className="col-span-2"><Label>住所</Label><Input value={form.address} onChange={(e) => setForm(p => ({ ...p, address: e.target.value }))} /></div>
              </div>
              <div><Label>備考</Label><Input value={form.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>キャンセル</Button>
              <Button className="bg-gold text-background hover:bg-gold/90" disabled={!form.name || createClient.isPending} onClick={() => createClient.mutate(form)}>
                {createClient.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "追加"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>取引先が登録されていません</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <Card key={c.id} className="hover:border-gold/30 transition-colors">
              <CardContent className="p-4">
                {editId === c.id ? (
                  <EditClientForm
                    client={c}
                    onSave={(data) => updateClient.mutate({ id: c.id, ...data })}
                    onCancel={() => setEditId(null)}
                    isPending={updateClient.isPending}
                  />
                ) : (
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-sm">{c.name}</h3>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                        {c.contactPerson && <span>担当: {c.contactPerson}</span>}
                        {c.phone && <span>TEL: {c.phone}</span>}
                        {c.email && <span>{c.email}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => { setEditId(c.id); setForm({ name: c.name, postalCode: c.postalCode || "", address: c.address || "", phone: c.phone || "", email: c.email || "", contactPerson: c.contactPerson || "", notes: c.notes || "" }); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => { if (confirm("この取引先を削除しますか？")) deleteClient.mutate({ id: c.id }); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
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

function EditClientForm({ client, onSave, onCancel, isPending }: { client: any; onSave: (d: any) => void; onCancel: () => void; isPending: boolean }) {
  const [f, setF] = useState({
    name: client.name || "", postalCode: client.postalCode || "", address: client.address || "",
    phone: client.phone || "", email: client.email || "", contactPerson: client.contactPerson || "", notes: client.notes || "",
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><Label>会社名</Label><Input value={f.name} onChange={(e) => setF(p => ({ ...p, name: e.target.value }))} /></div>
        <div><Label>担当者</Label><Input value={f.contactPerson} onChange={(e) => setF(p => ({ ...p, contactPerson: e.target.value }))} /></div>
        <div><Label>電話</Label><Input value={f.phone} onChange={(e) => setF(p => ({ ...p, phone: e.target.value }))} /></div>
        <div><Label>メール</Label><Input value={f.email} onChange={(e) => setF(p => ({ ...p, email: e.target.value }))} /></div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel}>キャンセル</Button>
        <Button size="sm" className="bg-gold text-background hover:bg-gold/90" disabled={isPending} onClick={() => onSave(f)}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存"}
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// PROJECTS TAB (unchanged from before)
// ═══════════════════════════════════════════════════════

function ProjectsTab() {
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
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", clientId: "", address: "", status: "active" as string, startDate: "", endDate: "", notes: "" });

  const resetForm = () => setForm({ name: "", clientId: "", address: "", status: "active", startDate: "", endDate: "", notes: "" });

  const statusLabel: Record<string, string> = { active: "進行中", completed: "完了", cancelled: "中止" };
  const statusColor: Record<string, string> = { active: "bg-green-500/10 text-green-500", completed: "bg-blue-500/10 text-blue-500", cancelled: "bg-red-500/10 text-red-500" };

  const filtered = useMemo(() => {
    if (!projects) return [];
    if (!search) return projects;
    const q = search.toLowerCase();
    return projects.filter((p: any) => p.name.toLowerCase().includes(q) || p.client?.name?.toLowerCase().includes(q));
  }, [projects, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="現場を検索..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
                      {clients?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
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

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>現場が登録されていません</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p: any) => (
            <Card key={p.id} className="hover:border-gold/30 transition-colors">
              <CardContent className="p-4">
                {editId === p.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div><Label>現場名</Label><Input value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} /></div>
                      <div>
                        <Label>取引先</Label>
                        <Select value={form.clientId || "none"} onValueChange={(v) => setForm(prev => ({ ...prev, clientId: v === "none" ? "" : v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">未選択</SelectItem>
                            {clients?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
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
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm">{p.name}</h3>
                        <Badge variant="outline" className={statusColor[p.status] || ""}>{statusLabel[p.status] || p.status}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                        {p.client && <span>取引先: {p.client.name}</span>}
                        {p.address && <span>{p.address}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => {
                        setEditId(p.id);
                        setForm({ name: p.name, clientId: p.clientId ? String(p.clientId) : "", address: p.address || "", status: p.status, startDate: toDateStr(p.startDate), endDate: toDateStr(p.endDate), notes: p.notes || "" });
                      }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => { if (confirm("この現場を削除しますか？")) deleteProject.mutate({ id: p.id }); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
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

// ═══════════════════════════════════════════════════════
// RATES TAB (with shift type & uniform/individual toggle)
// ═══════════════════════════════════════════════════════

function RatesTab() {
  const utils = trpc.useUtils();
  const { data: rates, isLoading } = trpc.rate.listAll.useQuery();
  const { data: employees } = trpc.employee.list.useQuery();
  const { data: projects } = trpc.project.list.useQuery();
  const { data: clients } = trpc.clientInfo.list.useQuery();

  const createRate = trpc.rate.create.useMutation({
    onSuccess: () => { utils.rate.listAll.invalidate(); toast.success("単価を登録しました"); setShowCreate(false); resetForm(); },
    onError: (e) => toast.error(e.message),
  });
  const updateRate = trpc.rate.update.useMutation({
    onSuccess: () => { utils.rate.listAll.invalidate(); toast.success("単価を更新しました"); setEditId(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteRate = trpc.rate.delete.useMutation({
    onSuccess: () => { utils.rate.listAll.invalidate(); toast.success("単価を削除しました"); },
    onError: (e) => toast.error(e.message),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [rateType, setRateType] = useState<"individual" | "uniform">("individual");
  const [uniformScope, setUniformScope] = useState<"project" | "client">("project");
  const [form, setForm] = useState({
    employeeId: "", projectId: "", clientId: "", shiftType: "day" as "day" | "night",
    clientRate: "", workerRate: "", effectiveFrom: "", effectiveUntil: "", notes: "",
  });
  const [editForm, setEditForm] = useState({
    shiftType: "day" as "day" | "night",
    clientRate: "", workerRate: "", effectiveFrom: "", effectiveUntil: "", notes: "",
  });

  const resetForm = () => setForm({
    employeeId: "", projectId: "", clientId: "", shiftType: "day",
    clientRate: "", workerRate: "", effectiveFrom: "", effectiveUntil: "", notes: "",
  });

  const filtered = useMemo(() => {
    if (!rates) return [];
    if (!search) return rates;
    const q = search.toLowerCase();
    return rates.filter((r: any) =>
      r.employee?.nameKanji?.toLowerCase().includes(q) ||
      r.employee?.nameKana?.toLowerCase().includes(q) ||
      r.project?.name?.toLowerCase().includes(q)
    );
  }, [rates, search]);

  const shiftLabel = (s: string) => s === "night" ? "夜勤" : "昼勤";
  const ShiftIcon = ({ shift }: { shift: string }) => shift === "night"
    ? <Moon className="h-3 w-3" />
    : <Sun className="h-3 w-3" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="作業員名・現場名で検索..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) { resetForm(); setRateType("individual"); setUniformScope("project"); } }}>
          <DialogTrigger asChild>
            <Button className="bg-gold text-background hover:bg-gold/90"><Plus className="h-4 w-4 mr-1" />単価登録</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>単価を登録</DialogTitle>
              <DialogDescription>現場の単価を設定してください</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* Rate type toggle */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={rateType === "uniform" ? "default" : "outline"}
                  size="sm"
                  className={rateType === "uniform" ? "bg-gold text-background hover:bg-gold/90" : ""}
                  onClick={() => { setRateType("uniform"); setForm(p => ({ ...p, employeeId: "" })); }}
                >
                  <Users className="h-3.5 w-3.5 mr-1" />一律単価
                </Button>
                <Button
                  type="button"
                  variant={rateType === "individual" ? "default" : "outline"}
                  size="sm"
                  className={rateType === "individual" ? "bg-gold text-background hover:bg-gold/90" : ""}
                  onClick={() => setRateType("individual")}
                >
                  <DollarSign className="h-3.5 w-3.5 mr-1" />個別単価
                </Button>
              </div>

              {rateType === "uniform" && (
                <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                  一律単価：この現場の全作業員に適用されるデフォルト単価です。個別単価が設定されている作業員はそちらが優先されます。
                </p>
              )}

              {rateType === "uniform" && (
                <div>
                  <Label>適用範囲</Label>
                  <Select value={uniformScope} onValueChange={(v) => setUniformScope(v as "project" | "client")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="project">現場別</SelectItem>
                      <SelectItem value="client">取引先別</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {rateType === "individual" && (
                  <div>
                    <Label>作業員<span className="text-red-500">*</span></Label>
                    <Select value={form.employeeId || "none"} onValueChange={(v) => setForm(p => ({ ...p, employeeId: v === "none" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">選択してください</SelectItem>
                        {employees?.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.nameKanji}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {(rateType === "individual" || uniformScope === "project") && <div>
                  <Label>現場<span className="text-red-500">*</span></Label>
                  <Select value={form.projectId || "none"} onValueChange={(v) => setForm(p => ({ ...p, projectId: v === "none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">選択してください</SelectItem>
                      {projects?.map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>}
                {rateType === "uniform" && uniformScope === "client" && <div>
                  <Label>取引先<span className="text-red-500">*</span></Label>
                  <Select value={form.clientId || "none"} onValueChange={(v) => setForm(p => ({ ...p, clientId: v === "none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">選択してください</SelectItem>
                      {clients?.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>}
                <div>
                  <Label>勤務区分</Label>
                  <Select value={form.shiftType} onValueChange={(v) => setForm(p => ({ ...p, shiftType: v as "day" | "night" }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day"><span className="flex items-center gap-1.5"><Sun className="h-3 w-3" />昼勤</span></SelectItem>
                      <SelectItem value="night"><span className="flex items-center gap-1.5"><Moon className="h-3 w-3" />夜勤</span></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>先方単価（日額）<span className="text-red-500">*</span></Label>
                  <Input type="number" value={form.clientRate} onChange={(e) => setForm(p => ({ ...p, clientRate: e.target.value }))} placeholder="25000" />
                </div>
                <div>
                  <Label>支払単価（日額）<span className="text-red-500">*</span></Label>
                  <Input type="number" value={form.workerRate} onChange={(e) => setForm(p => ({ ...p, workerRate: e.target.value }))} placeholder="18000" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>適用開始日</Label><Input type="date" value={form.effectiveFrom} onChange={(e) => setForm(p => ({ ...p, effectiveFrom: e.target.value }))} /></div>
                <div><Label>適用終了日</Label><Input type="date" value={form.effectiveUntil} onChange={(e) => setForm(p => ({ ...p, effectiveUntil: e.target.value }))} /></div>
              </div>
              <div><Label>備考</Label><Input value={form.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>キャンセル</Button>
              <Button className="bg-gold text-background hover:bg-gold/90"
                disabled={((rateType === "uniform" && uniformScope === "project" && !form.projectId)
                  || (rateType === "uniform" && uniformScope === "client" && !form.clientId)
                  || (rateType === "individual" && (!form.employeeId || !form.projectId))
                  || !form.clientRate || !form.workerRate || createRate.isPending)}
                onClick={() => {
                  createRate.mutate({
                    employeeId: rateType === "uniform" ? null : Number(form.employeeId),
                    scopeType: rateType === "uniform" ? uniformScope : "project",
                    projectId: (rateType === "uniform" && uniformScope === "client") ? undefined : Number(form.projectId),
                    clientId: (rateType === "uniform" && uniformScope === "client") ? Number(form.clientId) : undefined,
                    shiftType: form.shiftType,
                    clientRate: Number(form.clientRate),
                    workerRate: Number(form.workerRate),
                    effectiveFrom: form.effectiveFrom || undefined,
                    effectiveUntil: form.effectiveUntil || undefined,
                    notes: form.notes || undefined,
                  });
                }}>
                {createRate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "登録"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary cards */}
      {rates && rates.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">登録件数</p>
              <p className="text-2xl font-bold text-gold">{rates.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">平均先方単価</p>
              <p className="text-2xl font-bold">{formatYen(Math.round(rates.reduce((s: number, r: any) => s + r.clientRate, 0) / rates.length))}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">平均支払単価</p>
              <p className="text-2xl font-bold">{formatYen(Math.round(rates.reduce((s: number, r: any) => s + r.workerRate, 0) / rates.length))}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>単価が登録されていません</p>
        </div>
      ) : (
        <>
        <div className="block sm:hidden space-y-2">
          {filtered.map((r: any) => (
            <Card key={r.id}><CardContent className="p-3 space-y-2">
              <div className="flex justify-between"><div className="font-medium">{r.employee?.nameKanji || "一律単価"}</div><Badge variant="outline">{r.scopeType === "client" ? "取引先別" : "現場別"}</Badge></div>
              <div className="text-xs text-muted-foreground">{r.project?.name || r.client?.name || "—"} / {shiftLabel(r.shiftType || "day")}</div>
              <div className="grid grid-cols-2 gap-2 text-sm"><div>先方: {formatYen(r.clientRate)}</div><div>支払: {formatYen(r.workerRate)}</div></div>
              {r.hasOverlapWarning && <div className="text-xs text-amber-500">⚠️ 重複期間の単価があります（優先順位ルールで自動選択されます）</div>}
            </CardContent></Card>
          ))}
        </div>
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 px-3 font-medium text-muted-foreground">作業員</th>
                <th className="py-2 px-3 font-medium text-muted-foreground">現場</th>
                <th className="py-2 px-3 font-medium text-muted-foreground">区分</th>
                <th className="py-2 px-3 font-medium text-muted-foreground text-right">先方単価</th>
                <th className="py-2 px-3 font-medium text-muted-foreground text-right">支払単価</th>
                <th className="py-2 px-3 font-medium text-muted-foreground text-right">差額</th>
                <th className="py-2 px-3 font-medium text-muted-foreground">期間</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r: any) => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                  {editId === r.id ? (
                    <>
                      <td className="py-2 px-3">{r.employee?.nameKanji || <Badge variant="outline" className="text-xs">一律</Badge>}</td>
                      <td className="py-2 px-3">{r.project?.name || r.client?.name || "\u2014"}</td>
                      <td className="py-2 px-3">
                        <Select value={editForm.shiftType} onValueChange={(v) => setEditForm(p => ({ ...p, shiftType: v as "day" | "night" }))}>
                          <SelectTrigger className="w-20 h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="day">昼勤</SelectItem>
                            <SelectItem value="night">夜勤</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-3"><Input type="number" className="w-24 text-right" value={editForm.clientRate} onChange={(e) => setEditForm(p => ({ ...p, clientRate: e.target.value }))} /></td>
                      <td className="py-2 px-3"><Input type="number" className="w-24 text-right" value={editForm.workerRate} onChange={(e) => setEditForm(p => ({ ...p, workerRate: e.target.value }))} /></td>
                      <td className="py-2 px-3 text-right">{formatYen(Number(editForm.clientRate) - Number(editForm.workerRate))}</td>
                      <td className="py-2 px-3">
                        <div className="flex gap-1">
                          <Input type="date" className="w-32 text-xs" value={editForm.effectiveFrom} onChange={(e) => setEditForm(p => ({ ...p, effectiveFrom: e.target.value }))} />
                          <span className="self-center text-muted-foreground">\u301C</span>
                          <Input type="date" className="w-32 text-xs" value={editForm.effectiveUntil} onChange={(e) => setEditForm(p => ({ ...p, effectiveUntil: e.target.value }))} />
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => setEditId(null)}>取消</Button>
                          <Button size="sm" className="bg-gold text-background hover:bg-gold/90" disabled={updateRate.isPending} onClick={() => {
                            updateRate.mutate({
                              id: r.id,
                              shiftType: editForm.shiftType,
                              clientRate: Number(editForm.clientRate),
                              workerRate: Number(editForm.workerRate),
                              effectiveFrom: editForm.effectiveFrom || undefined,
                              effectiveUntil: editForm.effectiveUntil || undefined,
                              notes: editForm.notes || undefined,
                            });
                          }}>保存</Button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 px-3 font-medium">
                        {r.employee?.nameKanji || <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-500 border-amber-500/30">一律</Badge>}
                      </td>
                      <td className="py-2 px-3">{r.project?.name || r.client?.name || "\u2014"}</td>
                      <td className="py-2 px-3">
                        <Badge variant="outline" className={`text-xs ${r.shiftType === "night" ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/30" : "bg-yellow-500/10 text-yellow-500 border-yellow-500/30"}`}>
                          <ShiftIcon shift={r.shiftType || "day"} />
                          <span className="ml-1">{shiftLabel(r.shiftType || "day")}</span>
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-right font-mono">{formatYen(r.clientRate)}</td>
                      <td className="py-2 px-3 text-right font-mono">{formatYen(r.workerRate)}</td>
                      <td className="py-2 px-3 text-right font-mono text-green-500">{formatYen(r.clientRate - r.workerRate)}</td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">
                        {r.effectiveFrom ? toDateStr(r.effectiveFrom) : "\u2014"} \u301C {r.effectiveUntil ? toDateStr(r.effectiveUntil) : "現在"}
                      </td>
                      <td className="py-2 px-3">
                        {r.hasOverlapWarning && <div className="text-[10px] text-amber-500 mb-1">⚠️重複あり</div>}
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => {
                            setEditId(r.id);
                            setEditForm({
                              shiftType: r.shiftType || "day",
                              clientRate: String(r.clientRate),
                              workerRate: String(r.workerRate),
                              effectiveFrom: toDateStr(r.effectiveFrom),
                              effectiveUntil: toDateStr(r.effectiveUntil),
                              notes: r.notes || "",
                            });
                          }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => { if (confirm("この単価を削除しますか？")) deleteRate.mutate({ id: r.id }); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════

export default function AppRates() {
  const [activeTab, setActiveTab] = useState("rates");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">単価管理</h1>
        <p className="text-muted-foreground text-sm mt-1">取引先・作業員単価の管理</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="rates" className="flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5" />
            単価一覧
          </TabsTrigger>
          <TabsTrigger value="clients" className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            取引先
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rates"><RatesTab /></TabsContent>
        <TabsContent value="clients"><ClientsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
