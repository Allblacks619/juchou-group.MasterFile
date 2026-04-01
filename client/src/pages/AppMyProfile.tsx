import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  User,
  MapPin,
  Phone,
  Shield,
  Heart,
  Banknote,
  AlertCircle,
  CheckCircle,
  Save,
  Loader2,
  FileText,
  Award,
  Upload,
  Trash2,
  Globe,
} from "lucide-react";

/** Helper: format Date to YYYY-MM-DD string for input[type=date] */
function toDateStr(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export default function AppMyProfile() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: profile, isLoading: profileLoading } = trpc.employee.getMyProfile.useQuery();
  const { data: missingInfo } = trpc.employee.getMyMissingFields.useQuery();

  const updateProfile = trpc.employee.updateMyProfile.useMutation({
    onSuccess: () => {
      toast.success("プロフィールを保存しました");
      utils.employee.getMyProfile.invalidate();
      utils.employee.getMyMissingFields.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "保存に失敗しました");
    },
  });

  // ── Form state ──
  const [form, setForm] = useState<Record<string, any>>({});
  const [activeTab, setActiveTab] = useState("basic");

  // Initialize form when profile loads
  useEffect(() => {
    if (profile) {
      setForm({
        nameKanji: profile.nameKanji || "",
        nameKana: profile.nameKana || "",
        nameRomaji: profile.nameRomaji || "",
        dateOfBirth: toDateStr(profile.dateOfBirth),
        bloodType: profile.bloodType || "",
        gender: profile.gender || "",
        nationality: profile.nationality || "日本",
        experienceYears: profile.experienceYears ?? "",
        height: profile.height ?? "",
        weight: profile.weight ?? "",
        // Residence
        residenceStatus: profile.residenceStatus || "",
        residenceCardNumber: profile.residenceCardNumber || "",
        residenceCardExpiry: toDateStr(profile.residenceCardExpiry),
        passportNumber: profile.passportNumber || "",
        passportExpiry: toDateStr(profile.passportExpiry),
        // Address
        postalCode: profile.postalCode || "",
        address: profile.address || "",
        phone: profile.phone || "",
        email: profile.email || "",
        // Insurance
        healthCheckDate: toDateStr(profile.healthCheckDate),
        healthInsuranceNumber: profile.healthInsuranceNumber || "",
        insuranceType: profile.insuranceType || "",
        workersCompNumber: profile.workersCompNumber || "",
        pensionNumber: profile.pensionNumber || "",
        careerUpNumber: profile.careerUpNumber || "",
        employmentType: profile.employmentType || "",
        // Emergency
        emergencyNameKana: profile.emergencyNameKana || "",
        emergencyNameKanji: profile.emergencyNameKanji || "",
        emergencyRelationship: profile.emergencyRelationship || "",
        emergencyPostalCode: profile.emergencyPostalCode || "",
        emergencyAddress: profile.emergencyAddress || "",
        emergencyPhone: profile.emergencyPhone || "",
        // Bank
        bankName: profile.bankName || "",
        branchName: profile.branchName || "",
        accountType: profile.accountType || "ordinary",
        accountNumber: profile.accountNumber || "",
        accountHolder: profile.accountHolder || "",
        // Invoice
        isInvoiceIssuer: profile.isInvoiceIssuer || false,
        invoiceIssuerNumber: profile.invoiceIssuerNumber || "",
      });
    }
  }, [profile]);

  const set = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    const data: any = { ...form };
    // Convert empty strings to undefined for optional fields
    for (const key of Object.keys(data)) {
      if (data[key] === "") data[key] = undefined;
    }
    // Convert numeric fields
    if (data.experienceYears !== undefined) data.experienceYears = data.experienceYears ? Number(data.experienceYears) : undefined;
    if (data.height !== undefined) data.height = data.height ? Number(data.height) : undefined;
    if (data.weight !== undefined) data.weight = data.weight ? Number(data.weight) : undefined;
    // Handle nullable enums
    if (data.bloodType === undefined) data.bloodType = null;
    if (data.gender === undefined) data.gender = null;
    if (data.insuranceType === undefined) data.insuranceType = null;
    if (data.employmentType === undefined) data.employmentType = null;
    if (data.accountType === undefined) data.accountType = null;

    updateProfile.mutate(data);
  };

  // ── Qualifications ──
  const employeeId = profile?.id;
  const { data: qualifications, isLoading: qualsLoading } = trpc.qualification.list.useQuery(
    { employeeId: employeeId! },
    { enabled: !!employeeId }
  );
  const createQual = trpc.qualification.create.useMutation({
    onSuccess: () => {
      toast.success("資格を追加しました");
      utils.qualification.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteQual = trpc.qualification.delete.useMutation({
    onSuccess: () => {
      toast.success("資格を削除しました");
      utils.qualification.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const [newQual, setNewQual] = useState({ name: "", obtainedDate: "", certificateNumber: "" });

  // ── Documents ──
  const { data: documents, isLoading: docsLoading } = trpc.document.list.useQuery(
    { employeeId: employeeId! },
    { enabled: !!employeeId }
  );
  const uploadFile = trpc.employee.uploadFile.useMutation({
    onSuccess: () => {
      toast.success("ファイルをアップロードしました");
      utils.document.list.invalidate();
      utils.employee.getMyProfile.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteDoc = trpc.document.delete.useMutation({
    onSuccess: () => {
      toast.success("書類を削除しました");
      utils.document.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const [uploadType, setUploadType] = useState<string>("other");

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !employeeId) return;
    if (file.size > 16 * 1024 * 1024) {
      toast.error("ファイルサイズは16MB以下にしてください");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadFile.mutate({
        employeeId,
        type: uploadType as any,
        base64,
        mimeType: file.type,
        fileName: file.name,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Sections with missing field counts
  const missingSections = useMemo(() => {
    if (!missingInfo?.missingFields) return {};
    const counts: Record<string, number> = {};
    for (const f of missingInfo.missingFields) {
      counts[f.section] = (counts[f.section] || 0) + 1;
    }
    return counts;
  }, [missingInfo]);

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
        <span className="ml-2 text-muted-foreground">読み込み中...</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto py-10">
        <Card>
          <CardContent className="py-10 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium">プロフィールが見つかりません</p>
            <p className="text-muted-foreground mt-2">管理者にお問い合わせください</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">マイプロフィール</h1>
          <p className="text-muted-foreground text-sm mt-1">
            必須情報を入力してください。現場への提出書類に使用されます。
          </p>
        </div>
        <div className="flex items-center gap-3">
          {missingInfo && (
            <div className="flex items-center gap-2">
              {missingInfo.completionPercent === 100 ? (
                <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  完了
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {missingInfo.completionPercent}%
                </Badge>
              )}
            </div>
          )}
          <Button onClick={handleSave} disabled={updateProfile.isPending} className="bg-gold text-background hover:bg-gold/90">
            {updateProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            保存
          </Button>
        </div>
      </div>

      {/* Missing fields alert */}
      {missingInfo && missingInfo.missingFields.length > 0 && (
        <Card className="mb-6 border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-500">未記入の必須項目があります</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {missingInfo.missingFields.map((f) => (
                    <Badge key={f.key} variant="outline" className="text-xs">
                      {f.label}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full flex-wrap h-auto gap-1 bg-muted/50 p-1">
          <TabsTrigger value="basic" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <User className="h-3.5 w-3.5" />
            基本情報
            {missingSections["基本情報"] && <Badge variant="destructive" className="h-4 px-1 text-[10px]">{missingSections["基本情報"]}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="residence" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Globe className="h-3.5 w-3.5" />
            在留情報
          </TabsTrigger>
          <TabsTrigger value="address" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <MapPin className="h-3.5 w-3.5" />
            住所・連絡先
            {(missingSections["住所"] || missingSections["連絡先"]) && (
              <Badge variant="destructive" className="h-4 px-1 text-[10px]">{(missingSections["住所"] || 0) + (missingSections["連絡先"] || 0)}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="insurance" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Shield className="h-3.5 w-3.5" />
            保険・雇用
          </TabsTrigger>
          <TabsTrigger value="emergency" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Heart className="h-3.5 w-3.5" />
            緊急連絡先
            {missingSections["緊急連絡先"] && <Badge variant="destructive" className="h-4 px-1 text-[10px]">{missingSections["緊急連絡先"]}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="bank" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Banknote className="h-3.5 w-3.5" />
            振込先
            {missingSections["振込先"] && <Badge variant="destructive" className="h-4 px-1 text-[10px]">{missingSections["振込先"]}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="qualifications" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Award className="h-3.5 w-3.5" />
            資格
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <FileText className="h-3.5 w-3.5" />
            書類
          </TabsTrigger>
        </TabsList>

        {/* ── 基本情報 ── */}
        <TabsContent value="basic">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">基本情報</CardTitle>
              <CardDescription>氏名、生年月日、血液型などの基本的な個人情報</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="nameKanji">氏名（漢字）<span className="text-red-500">*</span></Label>
                  <Input id="nameKanji" value={form.nameKanji || ""} onChange={(e) => set("nameKanji", e.target.value)} placeholder="山田 太郎" />
                </div>
                <div>
                  <Label htmlFor="nameKana">氏名（カナ）<span className="text-red-500">*</span></Label>
                  <Input id="nameKana" value={form.nameKana || ""} onChange={(e) => set("nameKana", e.target.value)} placeholder="ヤマダ タロウ" />
                </div>
                <div>
                  <Label htmlFor="nameRomaji">氏名（ローマ字）<span className="text-red-500">*</span></Label>
                  <Input id="nameRomaji" value={form.nameRomaji || ""} onChange={(e) => set("nameRomaji", e.target.value)} placeholder="Taro Yamada" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="dateOfBirth">生年月日<span className="text-red-500">*</span></Label>
                  <Input id="dateOfBirth" type="date" value={form.dateOfBirth || ""} onChange={(e) => set("dateOfBirth", e.target.value)} />
                </div>
                <div>
                  <Label>血液型<span className="text-red-500">*</span></Label>
                  <Select value={form.bloodType || "none"} onValueChange={(v) => set("bloodType", v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">未選択</SelectItem>
                      <SelectItem value="A">A型</SelectItem>
                      <SelectItem value="B">B型</SelectItem>
                      <SelectItem value="AB">AB型</SelectItem>
                      <SelectItem value="O">O型</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>性別</Label>
                  <Select value={form.gender || "none"} onValueChange={(v) => set("gender", v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">未選択</SelectItem>
                      <SelectItem value="male">男性</SelectItem>
                      <SelectItem value="female">女性</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="nationality">国籍</Label>
                  <Input id="nationality" value={form.nationality || ""} onChange={(e) => set("nationality", e.target.value)} placeholder="日本" />
                </div>
                <div>
                  <Label htmlFor="experienceYears">経験年数</Label>
                  <Input id="experienceYears" type="number" value={form.experienceYears ?? ""} onChange={(e) => set("experienceYears", e.target.value)} placeholder="5" />
                </div>
                <div>
                  <Label htmlFor="height">身長 (cm)</Label>
                  <Input id="height" type="number" value={form.height ?? ""} onChange={(e) => set("height", e.target.value)} placeholder="170" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="weight">体重 (kg)</Label>
                  <Input id="weight" type="number" value={form.weight ?? ""} onChange={(e) => set("weight", e.target.value)} placeholder="65" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 在留情報 ── */}
        <TabsContent value="residence">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">在留情報</CardTitle>
              <CardDescription>外国籍の方は在留資格・在留カード情報を入力してください</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="residenceStatus">在留資格</Label>
                  <Input id="residenceStatus" value={form.residenceStatus || ""} onChange={(e) => set("residenceStatus", e.target.value)} placeholder="技能実習 等" />
                </div>
                <div>
                  <Label htmlFor="residenceCardNumber">在留カード番号</Label>
                  <Input id="residenceCardNumber" value={form.residenceCardNumber || ""} onChange={(e) => set("residenceCardNumber", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="residenceCardExpiry">在留カード有効期限</Label>
                  <Input id="residenceCardExpiry" type="date" value={form.residenceCardExpiry || ""} onChange={(e) => set("residenceCardExpiry", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="passportNumber">パスポート番号</Label>
                  <Input id="passportNumber" value={form.passportNumber || ""} onChange={(e) => set("passportNumber", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="passportExpiry">パスポート有効期限</Label>
                  <Input id="passportExpiry" type="date" value={form.passportExpiry || ""} onChange={(e) => set("passportExpiry", e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 住所・連絡先 ── */}
        <TabsContent value="address">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">住所・連絡先</CardTitle>
              <CardDescription>現住所と連絡先情報</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="postalCode">郵便番号<span className="text-red-500">*</span></Label>
                  <Input id="postalCode" value={form.postalCode || ""} onChange={(e) => set("postalCode", e.target.value)} placeholder="123-4567" />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="address">住所<span className="text-red-500">*</span></Label>
                  <Input id="address" value={form.address || ""} onChange={(e) => set("address", e.target.value)} placeholder="埼玉県〇〇市〇〇町1-2-3" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="phone">電話番号<span className="text-red-500">*</span></Label>
                  <Input id="phone" value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} placeholder="090-1234-5678" />
                </div>
                <div>
                  <Label htmlFor="email">メールアドレス</Label>
                  <Input id="email" type="email" value={form.email || ""} onChange={(e) => set("email", e.target.value)} placeholder="example@email.com" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 保険・雇用 ── */}
        <TabsContent value="insurance">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">保険・雇用情報</CardTitle>
              <CardDescription>健康保険、年金、雇用形態などの情報</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="healthCheckDate">健康診断日</Label>
                  <Input id="healthCheckDate" type="date" value={form.healthCheckDate || ""} onChange={(e) => set("healthCheckDate", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="healthInsuranceNumber">健康保険番号</Label>
                  <Input id="healthInsuranceNumber" value={form.healthInsuranceNumber || ""} onChange={(e) => set("healthInsuranceNumber", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>保険種別</Label>
                  <Select value={form.insuranceType || "none"} onValueChange={(v) => set("insuranceType", v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">未選択</SelectItem>
                      <SelectItem value="national">国民健康保険</SelectItem>
                      <SelectItem value="social">社会保険</SelectItem>
                      <SelectItem value="construction">建設国保</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="workersCompNumber">労災保険番号</Label>
                  <Input id="workersCompNumber" value={form.workersCompNumber || ""} onChange={(e) => set("workersCompNumber", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="pensionNumber">基礎年金番号</Label>
                  <Input id="pensionNumber" value={form.pensionNumber || ""} onChange={(e) => set("pensionNumber", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="careerUpNumber">建設キャリアアップ番号</Label>
                  <Input id="careerUpNumber" value={form.careerUpNumber || ""} onChange={(e) => set("careerUpNumber", e.target.value)} />
                </div>
                <div>
                  <Label>雇用形態</Label>
                  <Select value={form.employmentType || "none"} onValueChange={(v) => set("employmentType", v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">未選択</SelectItem>
                      <SelectItem value="sole_proprietor">個人事業主</SelectItem>
                      <SelectItem value="employee">従業員</SelectItem>
                      <SelectItem value="other">その他</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="border-t border-border pt-4 mt-4">
                <h3 className="text-sm font-medium mb-3">適格請求書発行事業者</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="isInvoiceIssuer"
                      checked={form.isInvoiceIssuer || false}
                      onChange={(e) => set("isInvoiceIssuer", e.target.checked)}
                      className="h-4 w-4"
                    />
                    <Label htmlFor="isInvoiceIssuer" className="cursor-pointer">インボイス対応事業者</Label>
                  </div>
                  {form.isInvoiceIssuer && (
                    <div>
                      <Label htmlFor="invoiceIssuerNumber">登録番号（T+13桁）</Label>
                      <Input id="invoiceIssuerNumber" value={form.invoiceIssuerNumber || ""} onChange={(e) => set("invoiceIssuerNumber", e.target.value)} placeholder="T1234567890123" />
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 緊急連絡先 ── */}
        <TabsContent value="emergency">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">緊急連絡先</CardTitle>
              <CardDescription>緊急時に連絡する方の情報</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="emergencyNameKanji">氏名（漢字）<span className="text-red-500">*</span></Label>
                  <Input id="emergencyNameKanji" value={form.emergencyNameKanji || ""} onChange={(e) => set("emergencyNameKanji", e.target.value)} placeholder="山田 花子" />
                </div>
                <div>
                  <Label htmlFor="emergencyNameKana">氏名（カナ）</Label>
                  <Input id="emergencyNameKana" value={form.emergencyNameKana || ""} onChange={(e) => set("emergencyNameKana", e.target.value)} placeholder="ヤマダ ハナコ" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="emergencyRelationship">続柄<span className="text-red-500">*</span></Label>
                  <Input id="emergencyRelationship" value={form.emergencyRelationship || ""} onChange={(e) => set("emergencyRelationship", e.target.value)} placeholder="配偶者" />
                </div>
                <div>
                  <Label htmlFor="emergencyPhone">電話番号<span className="text-red-500">*</span></Label>
                  <Input id="emergencyPhone" value={form.emergencyPhone || ""} onChange={(e) => set("emergencyPhone", e.target.value)} placeholder="090-1234-5678" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="emergencyPostalCode">郵便番号</Label>
                  <Input id="emergencyPostalCode" value={form.emergencyPostalCode || ""} onChange={(e) => set("emergencyPostalCode", e.target.value)} placeholder="123-4567" />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="emergencyAddress">住所</Label>
                  <Input id="emergencyAddress" value={form.emergencyAddress || ""} onChange={(e) => set("emergencyAddress", e.target.value)} placeholder="埼玉県〇〇市〇〇町1-2-3" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 振込先 ── */}
        <TabsContent value="bank">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">振込先情報</CardTitle>
              <CardDescription>給与振込先の銀行口座情報</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="bankName">銀行名<span className="text-red-500">*</span></Label>
                  <Input id="bankName" value={form.bankName || ""} onChange={(e) => set("bankName", e.target.value)} placeholder="三菱UFJ銀行" />
                </div>
                <div>
                  <Label htmlFor="branchName">支店名<span className="text-red-500">*</span></Label>
                  <Input id="branchName" value={form.branchName || ""} onChange={(e) => set("branchName", e.target.value)} placeholder="渋谷支店" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>口座種別</Label>
                  <Select value={form.accountType || "ordinary"} onValueChange={(v) => set("accountType", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ordinary">普通</SelectItem>
                      <SelectItem value="checking">当座</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="accountNumber">口座番号<span className="text-red-500">*</span></Label>
                  <Input id="accountNumber" value={form.accountNumber || ""} onChange={(e) => set("accountNumber", e.target.value)} placeholder="1234567" />
                </div>
                <div>
                  <Label htmlFor="accountHolder">口座名義<span className="text-red-500">*</span></Label>
                  <Input id="accountHolder" value={form.accountHolder || ""} onChange={(e) => set("accountHolder", e.target.value)} placeholder="ヤマダ タロウ" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 資格 ── */}
        <TabsContent value="qualifications">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">保有資格</CardTitle>
              <CardDescription>保有する資格を登録してください</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add qualification form */}
              <div className="border border-border rounded-lg p-4 bg-muted/20">
                <h3 className="text-sm font-medium mb-3">資格を追加</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Input
                    placeholder="資格名"
                    value={newQual.name}
                    onChange={(e) => setNewQual((p) => ({ ...p, name: e.target.value }))}
                  />
                  <Input
                    type="date"
                    placeholder="取得日"
                    value={newQual.obtainedDate}
                    onChange={(e) => setNewQual((p) => ({ ...p, obtainedDate: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <Input
                      placeholder="証明書番号"
                      value={newQual.certificateNumber}
                      onChange={(e) => setNewQual((p) => ({ ...p, certificateNumber: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      disabled={!newQual.name || createQual.isPending}
                      onClick={() => {
                        if (!employeeId) return;
                        createQual.mutate({
                          employeeId,
                          name: newQual.name,
                          obtainedDate: newQual.obtainedDate || undefined,
                          certificateNumber: newQual.certificateNumber || undefined,
                        });
                        setNewQual({ name: "", obtainedDate: "", certificateNumber: "" });
                      }}
                      className="bg-gold text-background hover:bg-gold/90 shrink-0"
                    >
                      追加
                    </Button>
                  </div>
                </div>
              </div>

              {/* Qualification list */}
              {qualsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : qualifications && qualifications.length > 0 ? (
                <div className="space-y-2">
                  {qualifications.map((q) => (
                    <div key={q.id} className="flex items-center justify-between border border-border rounded-lg p-3">
                      <div>
                        <p className="font-medium text-sm">{q.name}</p>
                        <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                          {q.obtainedDate && <span>取得日: {toDateStr(q.obtainedDate)}</span>}
                          {q.certificateNumber && <span>番号: {q.certificateNumber}</span>}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteQual.mutate({ id: q.id })}
                        className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-6 text-sm">登録された資格はありません</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 書類 ── */}
        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">書類管理</CardTitle>
              <CardDescription>在留カード、パスポート、健康診断書などの書類をアップロード</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Upload form */}
              <div className="border border-border rounded-lg p-4 bg-muted/20">
                <h3 className="text-sm font-medium mb-3">書類をアップロード</h3>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Select value={uploadType} onValueChange={setUploadType}>
                    <SelectTrigger className="w-full sm:w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="residence_card">在留カード</SelectItem>
                      <SelectItem value="passport">パスポート</SelectItem>
                      <SelectItem value="health_check">健康診断書</SelectItem>
                      <SelectItem value="qualification_cert">資格証明書</SelectItem>
                      <SelectItem value="id_document">身分証明書</SelectItem>
                      <SelectItem value="other">その他</SelectItem>
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-2 cursor-pointer bg-gold text-background hover:bg-gold/90 px-4 py-2 rounded-md text-sm font-medium">
                    <Upload className="h-4 w-4" />
                    ファイルを選択
                    <input type="file" className="hidden" accept="image/*,.pdf" onChange={handleFileUpload} disabled={uploadFile.isPending} />
                  </label>
                  {uploadFile.isPending && <Loader2 className="h-5 w-5 animate-spin text-gold self-center" />}
                </div>
              </div>

              {/* Document list */}
              {docsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : documents && documents.length > 0 ? (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between border border-border rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div>
                          <p className="font-medium text-sm">{doc.fileName}</p>
                          <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                            <span>{docTypeLabel(doc.documentType)}</span>
                            {doc.fileSize && <span>{(doc.fileSize / 1024).toFixed(0)} KB</span>}
                            <Badge variant="outline" className="text-[10px]">{doc.docStatus}</Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="sm" className="text-xs">表示</Button>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-6 text-sm">アップロードされた書類はありません</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function docTypeLabel(type: string): string {
  const map: Record<string, string> = {
    residence_card: "在留カード",
    passport: "パスポート",
    health_check: "健康診断書",
    qualification_cert: "資格証明書",
    id_document: "身分証明書",
    stamp: "印鑑",
    invoice: "請求書",
    receipt: "領収書",
    other: "その他",
  };
  return map[type] || type;
}
