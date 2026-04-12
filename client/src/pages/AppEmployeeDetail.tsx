import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Upload, Plus, Trash2, User, Shield, Heart, Banknote, Award, FileText, FileDown, Loader2, DollarSign } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation, useParams } from "wouter";
import { format } from "date-fns";

/** PDF Roster download button */
function RosterPdfButton({ employeeId }: { employeeId: number }) {
  const generatePdf = trpc.pdf.rosterSingle.useMutation({
    onSuccess: (data) => {
      window.open(data.url, "_blank");
      toast.success("名簿PDFを生成しました");
    },
    onError: (e) => toast.error(`PDF生成エラー: ${e.message}`),
  });

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={generatePdf.isPending}
      onClick={() => generatePdf.mutate({ employeeId })}
      className="gap-1.5"
    >
      {generatePdf.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
      名簿PDF
    </Button>
  );
}

export default function AppEmployeeDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user: authUser } = useAuth();
  const isAdmin = (authUser as any)?.appRole === "admin" || (authUser as any)?.appRole === "leader";
  const isNew = params.id === "new";
  const employeeId = isNew ? undefined : parseInt(params.id!);

  // Rates for this employee (admin/leader only)
  const ratesQuery = trpc.rate.listAll.useQuery(undefined, { enabled: isAdmin && !!employeeId });
  const employeeRates = (ratesQuery.data ?? []).filter((r: any) => r.employeeId === employeeId);

  const employeeQuery = trpc.employee.get.useQuery(
    { id: employeeId! },
    { enabled: !!employeeId }
  );
  const qualificationsQuery = trpc.qualification.list.useQuery(
    { employeeId: employeeId! },
    { enabled: !!employeeId }
  );
  const documentsQuery = trpc.document.list.useQuery(
    { employeeId: employeeId! },
    { enabled: !!employeeId }
  );

  const createMutation = trpc.employee.create.useMutation({
    onSuccess: (data) => {
      toast.success("従業員を登録しました");
      setLocation(`/app/employees/${(data as any).id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.employee.update.useMutation({
    onSuccess: () => {
      toast.success("保存しました");
      employeeQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const uploadMutation = trpc.employee.uploadFile.useMutation({
    onSuccess: () => {
      toast.success("ファイルをアップロードしました");
      employeeQuery.refetch();
      documentsQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.employee.delete.useMutation({
    onSuccess: () => {
      toast.success("従業員を削除しました");
      setLocation("/app/employees");
    },
    onError: (e) => toast.error(e.message),
  });

  // Form state
  const [form, setForm] = useState({
    nameKanji: "",
    nameKana: "",
    nameRomaji: "",
    experienceYears: 0,
    dateOfBirth: "",
    bloodType: "" as "" | "A" | "B" | "AB" | "O",
    gender: "" as "" | "male" | "female",
    nationality: "日本",
    residenceStatus: "",
    residenceCardNumber: "",
    residenceCardExpiry: "",
    passportNumber: "",
    passportExpiry: "",
    postalCode: "",
    address: "",
    phone: "",
    email: "",
    healthCheckDate: "",
    healthInsuranceNumber: "",
    insuranceType: "" as "" | "national" | "social" | "construction",
    workersCompNumber: "",
    pensionNumber: "",
    careerUpNumber: "",
    employmentType: "" as "" | "sole_proprietor" | "employee" | "other",
    emergencyNameKana: "",
    emergencyNameKanji: "",
    emergencyRelationship: "",
    emergencyPostalCode: "",
    emergencyAddress: "",
    emergencyPhone: "",
    bankName: "",
    branchName: "",
    accountType: "ordinary" as "ordinary" | "checking",
    accountNumber: "",
    accountHolder: "",
    isInvoiceIssuer: false,
    invoiceIssuerNumber: "",

    bloodPressureHigh: 0,
    bloodPressureLow: 0,
    insuredNumber: "",
    employmentInsuranceNumber: "",
  });

  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (employeeQuery.data && !initialized) {
      const emp = employeeQuery.data;
      setForm({
        nameKanji: emp.nameKanji || "",
        nameKana: emp.nameKana || "",
        nameRomaji: emp.nameRomaji || "",
        experienceYears: emp.experienceYears || 0,
        dateOfBirth: emp.dateOfBirth ? format(new Date(emp.dateOfBirth), "yyyy-MM-dd") : "",
        bloodType: (emp.bloodType as any) || "",
        gender: (emp.gender as any) || "",
        nationality: emp.nationality || "日本",
        residenceStatus: emp.residenceStatus || "",
        residenceCardNumber: emp.residenceCardNumber || "",
        residenceCardExpiry: emp.residenceCardExpiry ? format(new Date(emp.residenceCardExpiry), "yyyy-MM-dd") : "",
        passportNumber: emp.passportNumber || "",
        passportExpiry: emp.passportExpiry ? format(new Date(emp.passportExpiry), "yyyy-MM-dd") : "",
        postalCode: emp.postalCode || "",
        address: emp.address || "",
        phone: emp.phone || "",
        email: emp.email || "",
        healthCheckDate: emp.healthCheckDate ? format(new Date(emp.healthCheckDate), "yyyy-MM-dd") : "",
        healthInsuranceNumber: emp.healthInsuranceNumber || "",
        insuranceType: (emp.insuranceType as any) || "",
        workersCompNumber: emp.workersCompNumber || "",
        pensionNumber: emp.pensionNumber || "",
        careerUpNumber: emp.careerUpNumber || "",
        employmentType: (emp.employmentType as any) || "",
        emergencyNameKana: emp.emergencyNameKana || "",
        emergencyNameKanji: emp.emergencyNameKanji || "",
        emergencyRelationship: emp.emergencyRelationship || "",
        emergencyPostalCode: emp.emergencyPostalCode || "",
        emergencyAddress: emp.emergencyAddress || "",
        emergencyPhone: emp.emergencyPhone || "",
        bankName: emp.bankName || "",
        branchName: emp.branchName || "",
        accountType: (emp.accountType as any) || "ordinary",
        accountNumber: emp.accountNumber || "",
        accountHolder: emp.accountHolder || "",
        isInvoiceIssuer: emp.isInvoiceIssuer || false,
        invoiceIssuerNumber: emp.invoiceIssuerNumber || "",

        bloodPressureHigh: (emp as any).bloodPressureHigh || 0,
        bloodPressureLow: (emp as any).bloodPressureLow || 0,
        insuredNumber: (emp as any).insuredNumber || "",
        employmentInsuranceNumber: (emp as any).employmentInsuranceNumber || "",
      });
      setInitialized(true);
    }
  }, [employeeQuery.data, initialized]);

  const updateField = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    if (!form.nameKanji) {
      toast.error("氏名（漢字）は必須です");
      return;
    }

    const data: any = { ...form };
    // Clean empty strings
    Object.keys(data).forEach((key) => {
      if (data[key] === "") data[key] = undefined;
    });
    if (data.experienceYears === 0) data.experienceYears = undefined;

    if (data.bloodPressureHigh === 0) data.bloodPressureHigh = undefined;
    if (data.bloodPressureLow === 0) data.bloodPressureLow = undefined;


    if (isNew) {
      createMutation.mutate(data);
    } else {
      updateMutation.mutate({ id: employeeId!, ...data });
    }
  };

  const handleFileUpload = (type: string) => {
    if (!employeeId) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,.pdf";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        toast.error("ファイルサイズは10MB以下にしてください");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        uploadMutation.mutate({
          employeeId: employeeId!,
          type: type as any,
          base64,
          mimeType: file.type,
          fileName: file.name,
        });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  // Qualification management
  const [qualName, setQualName] = useState("");
  const [qualDate, setQualDate] = useState("");
  const [qualCertNum, setQualCertNum] = useState("");
  const [qualDialogOpen, setQualDialogOpen] = useState(false);

  const createQualMutation = trpc.qualification.create.useMutation({
    onSuccess: () => {
      toast.success("資格を追加しました");
      qualificationsQuery.refetch();
      setQualName("");
      setQualDate("");
      setQualCertNum("");
      setQualDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteQualMutation = trpc.qualification.delete.useMutation({
    onSuccess: () => {
      toast.success("資格を削除しました");
      qualificationsQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!isNew && employeeQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/app/employees")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            戻る
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {isNew ? "新規従業員登録" : form.nameKanji || "従業員詳細"}
            </h1>
          </div>
        </div>
        {!isNew && employeeId && <RosterPdfButton employeeId={employeeId} />}
      </div>

      <Tabs defaultValue="basic" className="space-y-4">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="basic"><User className="h-4 w-4 mr-1" />基本</TabsTrigger>
          <TabsTrigger value="residence"><Shield className="h-4 w-4 mr-1" />在留</TabsTrigger>
          <TabsTrigger value="insurance"><Heart className="h-4 w-4 mr-1" />保険</TabsTrigger>
          <TabsTrigger value="emergency"><Shield className="h-4 w-4 mr-1" />緊急連絡</TabsTrigger>
          <TabsTrigger value="bank"><Banknote className="h-4 w-4 mr-1" />振込先</TabsTrigger>
          {!isNew && <TabsTrigger value="qualifications"><Award className="h-4 w-4 mr-1" />資格</TabsTrigger>}
          {!isNew && <TabsTrigger value="documents"><FileText className="h-4 w-4 mr-1" />書類</TabsTrigger>}
          {!isNew && isAdmin && <TabsTrigger value="rates"><DollarSign className="h-4 w-4 mr-1" />単価</TabsTrigger>}
        </TabsList>

        {/* Basic Info */}
        <TabsContent value="basic">
          <Card>
            <CardHeader>
              <CardTitle>基本情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>氏名（漢字）*</Label>
                  <Input value={form.nameKanji} onChange={(e) => updateField("nameKanji", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>フリガナ</Label>
                  <Input value={form.nameKana} onChange={(e) => updateField("nameKana", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>ローマ字</Label>
                  <Input value={form.nameRomaji} onChange={(e) => updateField("nameRomaji", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>生年月日</Label>
                  <Input type="date" value={form.dateOfBirth} onChange={(e) => updateField("dateOfBirth", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>性別</Label>
                  <Select value={form.gender || "none"} onValueChange={(v) => updateField("gender", v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">未選択</SelectItem>
                      <SelectItem value="male">男性</SelectItem>
                      <SelectItem value="female">女性</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>血液型</Label>
                  <Select value={form.bloodType || "none"} onValueChange={(v) => updateField("bloodType", v === "none" ? "" : v)}>
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
                <div className="space-y-2">
                  <Label>国籍</Label>
                  <Input value={form.nationality} onChange={(e) => updateField("nationality", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>経験年数</Label>
                  <Input type="number" value={form.experienceYears || ""} onChange={(e) => updateField("experienceYears", parseInt(e.target.value) || 0)} />
                </div>
                <div className="space-y-2">
                  <Label>雇用形態</Label>
                  <Select value={form.employmentType || "none"} onValueChange={(v) => updateField("employmentType", v === "none" ? "" : v)}>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>郵便番号</Label>
                  <Input value={form.postalCode} onChange={(e) => updateField("postalCode", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>電話番号</Label>
                  <Input value={form.phone} onChange={(e) => updateField("phone", e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>住所</Label>
                  <Input value={form.address} onChange={(e) => updateField("address", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>メールアドレス</Label>
                  <Input type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} />
                </div>
              </div>

              {/* Photo & Stamp upload */}
              {!isNew && (
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div className="space-y-2">
                    <Label>顔写真</Label>
                    <div className="w-32 h-32 border border-dashed rounded-lg flex items-center justify-center bg-muted/20 overflow-hidden">
                      {employeeQuery.data?.photoUrl ? (
                        <img src={employeeQuery.data.photoUrl} alt="顔写真" className="w-full h-full object-cover" />
                      ) : (
                        <User className="h-8 w-8 text-muted-foreground/30" />
                      )}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleFileUpload("photo")}>
                      <Upload className="h-3 w-3 mr-1" />アップロード
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label>印鑑画像</Label>
                    <div className="w-32 h-32 border border-dashed rounded-lg flex items-center justify-center bg-muted/20 overflow-hidden">
                      {employeeQuery.data?.stampUrl ? (
                        <img src={employeeQuery.data.stampUrl} alt="印鑑" className="w-full h-full object-contain p-2" />
                      ) : (
                        <FileText className="h-8 w-8 text-muted-foreground/30" />
                      )}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleFileUpload("stamp")}>
                      <Upload className="h-3 w-3 mr-1" />アップロード
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} className="bg-gold text-background hover:bg-gold-dim">
                  {(createMutation.isPending || updateMutation.isPending) ? "保存中..." : "保存"}
                </Button>
                {!isNew && (
                  <Button
                    variant="destructive"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (window.confirm("本当に従業員を削除しますか？")) {
                        deleteMutation.mutate({ id: employeeId! });
                      }
                    }}
                  >
                    {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
                    削除
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Residence Info */}
        <TabsContent value="residence">
          <Card>
            <CardHeader>
              <CardTitle>在留情報</CardTitle>
              <CardDescription>外国籍の従業員の在留カード・パスポート情報</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>在留資格</Label>
                  <Input value={form.residenceStatus} onChange={(e) => updateField("residenceStatus", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>在留カード番号</Label>
                  <Input value={form.residenceCardNumber} onChange={(e) => updateField("residenceCardNumber", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>在留カード有効期限</Label>
                  <Input type="date" value={form.residenceCardExpiry} onChange={(e) => updateField("residenceCardExpiry", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>パスポート番号</Label>
                  <Input value={form.passportNumber} onChange={(e) => updateField("passportNumber", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>パスポート有効期限</Label>
                  <Input type="date" value={form.passportExpiry} onChange={(e) => updateField("passportExpiry", e.target.value)} />
                </div>
              </div>

              {!isNew && (
                <div className="pt-4 border-t space-y-2">
                  <Label>書類アップロード</Label>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleFileUpload("residence_card")}>
                      <Upload className="h-3 w-3 mr-1" />在留カード
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleFileUpload("passport")}>
                      <Upload className="h-3 w-3 mr-1" />パスポート
                    </Button>
                  </div>
                </div>
              )}

              <Button onClick={handleSave} disabled={updateMutation.isPending} className="bg-gold text-background hover:bg-gold-dim">
                {updateMutation.isPending ? "保存中..." : "保存"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Insurance Info */}
        <TabsContent value="insurance">
          <Card>
            <CardHeader>
              <CardTitle>保険・健康情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>最終健康診断日</Label>
                  <Input type="date" value={form.healthCheckDate} onChange={(e) => updateField("healthCheckDate", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>健康保険番号</Label>
                  <Input value={form.healthInsuranceNumber} onChange={(e) => updateField("healthInsuranceNumber", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>保険種別</Label>
                  <Select value={form.insuranceType || "none"} onValueChange={(v) => updateField("insuranceType", v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">未選択</SelectItem>
                      <SelectItem value="national">国民健康保険</SelectItem>
                      <SelectItem value="social">社会保険</SelectItem>
                      <SelectItem value="construction">建設国保</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>労災保険番号</Label>
                  <Input value={form.workersCompNumber} onChange={(e) => updateField("workersCompNumber", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>年金番号</Label>
                  <Input value={form.pensionNumber} onChange={(e) => updateField("pensionNumber", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>建設キャリアアップ番号</Label>
                  <Input value={form.careerUpNumber} onChange={(e) => updateField("careerUpNumber", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>被保険者番号</Label>
                  <Input value={form.insuredNumber} onChange={(e) => updateField("insuredNumber", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>雇用保険番号</Label>
                  <Input value={form.employmentInsuranceNumber} onChange={(e) => updateField("employmentInsuranceNumber", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>血圧（上）</Label>
                  <Input type="number" value={form.bloodPressureHigh || ""} onChange={(e) => updateField("bloodPressureHigh", e.target.value ? Number(e.target.value) : 0)} placeholder="120" />
                </div>
                <div className="space-y-2">
                  <Label>血圧（下）</Label>
                  <Input type="number" value={form.bloodPressureLow || ""} onChange={(e) => updateField("bloodPressureLow", e.target.value ? Number(e.target.value) : 0)} placeholder="80" />
                </div>
              </div>

              {!isNew && (
                <div className="pt-4 border-t space-y-2">
                  <Button variant="outline" size="sm" onClick={() => handleFileUpload("health_check")}>
                    <Upload className="h-3 w-3 mr-1" />健康診断書アップロード
                  </Button>
                </div>
              )}

              <Button onClick={handleSave} disabled={updateMutation.isPending} className="bg-gold text-background hover:bg-gold-dim">
                {updateMutation.isPending ? "保存中..." : "保存"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Emergency Contact */}
        <TabsContent value="emergency">
          <Card>
            <CardHeader>
              <CardTitle>緊急連絡先</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>氏名（漢字）</Label>
                  <Input value={form.emergencyNameKanji} onChange={(e) => updateField("emergencyNameKanji", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>フリガナ</Label>
                  <Input value={form.emergencyNameKana} onChange={(e) => updateField("emergencyNameKana", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>続柄</Label>
                  <Input value={form.emergencyRelationship} onChange={(e) => updateField("emergencyRelationship", e.target.value)} placeholder="例: 妻、母" />
                </div>
                <div className="space-y-2">
                  <Label>電話番号</Label>
                  <Input value={form.emergencyPhone} onChange={(e) => updateField("emergencyPhone", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>郵便番号</Label>
                  <Input value={form.emergencyPostalCode} onChange={(e) => updateField("emergencyPostalCode", e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>住所</Label>
                  <Input value={form.emergencyAddress} onChange={(e) => updateField("emergencyAddress", e.target.value)} />
                </div>
              </div>
              <Button onClick={handleSave} disabled={updateMutation.isPending} className="bg-gold text-background hover:bg-gold-dim">
                {updateMutation.isPending ? "保存中..." : "保存"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bank Info */}
        <TabsContent value="bank">
          <Card>
            <CardHeader>
              <CardTitle>振込先口座</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>銀行名</Label>
                  <Input value={form.bankName} onChange={(e) => updateField("bankName", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>支店名</Label>
                  <Input value={form.branchName} onChange={(e) => updateField("branchName", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>口座種別</Label>
                  <Select value={form.accountType} onValueChange={(v) => updateField("accountType", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ordinary">普通</SelectItem>
                      <SelectItem value="checking">当座</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>口座番号</Label>
                  <Input value={form.accountNumber} onChange={(e) => updateField("accountNumber", e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>口座名義</Label>
                  <Input value={form.accountHolder} onChange={(e) => updateField("accountHolder", e.target.value)} />
                </div>
              </div>
              <div className="pt-4 border-t">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isInvoiceIssuer}
                      onChange={(e) => updateField("isInvoiceIssuer", e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">適格請求書発行事業者</span>
                  </label>
                  {form.isInvoiceIssuer && (
                    <Input
                      value={form.invoiceIssuerNumber}
                      onChange={(e) => updateField("invoiceIssuerNumber", e.target.value)}
                      placeholder="T1234567890123"
                      className="max-w-xs"
                    />
                  )}
                </div>
              </div>
              <Button onClick={handleSave} disabled={updateMutation.isPending} className="bg-gold text-background hover:bg-gold-dim">
                {updateMutation.isPending ? "保存中..." : "保存"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Qualifications */}
        {!isNew && (
          <TabsContent value="qualifications">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>保有資格</CardTitle>
                <Dialog open={qualDialogOpen} onOpenChange={setQualDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-gold text-background hover:bg-gold-dim">
                      <Plus className="h-4 w-4 mr-1" />追加
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>資格を追加</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label>資格名 *</Label>
                        <Input value={qualName} onChange={(e) => setQualName(e.target.value)} placeholder="例: 第二種電気工事士" />
                      </div>
                      <div className="space-y-2">
                        <Label>取得日</Label>
                        <Input type="date" value={qualDate} onChange={(e) => setQualDate(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>証明書番号</Label>
                        <Input value={qualCertNum} onChange={(e) => setQualCertNum(e.target.value)} />
                      </div>
                      <Button
                        onClick={() => {
                          if (!qualName) { toast.error("資格名は必須です"); return; }
                          createQualMutation.mutate({
                            employeeId: employeeId!,
                            name: qualName,
                            obtainedDate: qualDate || undefined,
                            certificateNumber: qualCertNum || undefined,
                          });
                        }}
                        disabled={createQualMutation.isPending}
                        className="w-full bg-gold text-background hover:bg-gold-dim"
                      >
                        {createQualMutation.isPending ? "追加中..." : "追加"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {qualificationsQuery.isLoading ? (
                  <p className="text-muted-foreground text-center py-4">読み込み中...</p>
                ) : !qualificationsQuery.data?.length ? (
                  <p className="text-muted-foreground text-center py-8">資格がまだ登録されていません</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>資格名</TableHead>
                        <TableHead>取得日</TableHead>
                        <TableHead>証明書番号</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {qualificationsQuery.data.map((q) => (
                        <TableRow key={q.id}>
                          <TableCell className="font-medium">{q.name}</TableCell>
                          <TableCell>{q.obtainedDate ? format(new Date(q.obtainedDate), "yyyy/MM/dd") : "-"}</TableCell>
                          <TableCell>{q.certificateNumber || "-"}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteQualMutation.mutate({ id: q.id })}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Documents */}
        {!isNew && (
          <TabsContent value="documents">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>書類管理</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleFileUpload("other")}>
                    <Upload className="h-4 w-4 mr-1" />書類アップロード
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {documentsQuery.isLoading ? (
                  <p className="text-muted-foreground text-center py-4">読み込み中...</p>
                ) : !documentsQuery.data?.length ? (
                  <p className="text-muted-foreground text-center py-8">書類がまだアップロードされていません</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ファイル名</TableHead>
                        <TableHead>種別</TableHead>
                        <TableHead>有効期限</TableHead>
                        <TableHead>アップロード日</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {documentsQuery.data.map((doc) => (
                        <TableRow key={doc.id}>
                          <TableCell>
                            <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">
                              {doc.fileName}
                            </a>
                          </TableCell>
                          <TableCell>{doc.documentType}</TableCell>
                          <TableCell>{doc.expiryDate ? format(new Date(doc.expiryDate), "yyyy/MM/dd") : "-"}</TableCell>
                          <TableCell>{format(new Date(doc.createdAt), "yyyy/MM/dd")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Rates Tab (admin/leader only) */}
        {!isNew && isAdmin && (
          <TabsContent value="rates">
            <Card>
              <CardHeader>
                <CardTitle>単価情報</CardTitle>
                <CardDescription>この作業員に登録されている単価情報です</CardDescription>
              </CardHeader>
              <CardContent>
                {employeeRates.length === 0 ? (
                  <p className="text-muted-foreground text-sm">単価が登録されていません。単価管理ページから登録してください。</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>現場</TableHead>
                        <TableHead>勤務区分</TableHead>
                        <TableHead>先方単価</TableHead>
                        <TableHead>支払単価</TableHead>
                        <TableHead>備考</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employeeRates.map((rate: any) => (
                        <TableRow key={rate.id}>
                          <TableCell className="font-medium">{rate.project?.name || "-"}</TableCell>
                          <TableCell>
                            <span className={`px-2 py-0.5 rounded text-xs ${rate.shiftType === 'night' ? 'bg-blue-900/30 text-blue-300' : 'bg-yellow-900/30 text-yellow-300'}`}>
                              {rate.shiftType === 'night' ? '夜勤' : '昼勤'}
                            </span>
                          </TableCell>
                          <TableCell>¥{Number(rate.clientRate).toLocaleString()}</TableCell>
                          <TableCell>¥{Number(rate.payRate).toLocaleString()}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{rate.notes || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
