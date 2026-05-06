import { useState, useRef } from "react";
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
import { toast } from "sonner";
import { Upload, Building2, Banknote, Image } from "lucide-react";

export default function AppCompany() {
  const companyQuery = trpc.company.get.useQuery();
  const upsertMutation = trpc.company.upsert.useMutation({
    onSuccess: () => {
      toast.success("会社情報を保存しました");
      companyQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const uploadMutation = trpc.company.uploadImage.useMutation({
    onSuccess: (data) => {
      toast.success("画像をアップロードしました");
      companyQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const company = companyQuery.data;

  // Form state
  const [companyName, setCompanyName] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [invoiceIssuerNumber, setInvoiceIssuerNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [branchName, setBranchName] = useState("");
  const [accountType, setAccountType] = useState<"ordinary" | "checking">("ordinary");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [sealX, setSealX] = useState(0);
  const [sealY, setSealY] = useState(0);
  const [sealScale, setSealScale] = useState(1);
  const [sealOpacity, setSealOpacity] = useState(1);

  // Initialize form when data loads
  const [initialized, setInitialized] = useState(false);
  if (company && !initialized) {
    setCompanyName(company.companyName || "");
    setPostalCode(company.postalCode || "");
    setAddress(company.address || "");
    setPhone(company.phone || "");
    setEmail(company.email || "");
    setRegistrationNumber(company.registrationNumber || "");
    setInvoiceIssuerNumber(company.invoiceIssuerNumber || "");
    setBankName(company.bankName || "");
    setBranchName(company.branchName || "");
    setAccountType((company.accountType as any) || "ordinary");
    setAccountNumber(company.accountNumber || "");
    setAccountHolder(company.accountHolder || "");
    const ss = (company.sealSettings || {}) as any;
    setSealX(Number(ss.x || 0));
    setSealY(Number(ss.y || 0));
    setSealScale(Number(ss.scale || 1));
    setSealOpacity(Number(ss.opacity || 1));
    setInitialized(true);
  }

  const handleSave = () => {
    upsertMutation.mutate({
      companyName,
      postalCode: postalCode || undefined,
      address: address || undefined,
      phone: phone || undefined,
      email: email || undefined,
      registrationNumber: registrationNumber || undefined,
      invoiceIssuerNumber: invoiceIssuerNumber || undefined,
      bankName: bankName || undefined,
      branchName: branchName || undefined,
      accountType: accountType || undefined,
      accountNumber: accountNumber || undefined,
      accountHolder: accountHolder || undefined,
      sealSettings: { x: sealX, y: sealY, scale: sealScale, opacity: sealOpacity },
    });
  };

  const handleImageUpload = (type: "logo" | "seal" | "watermark") => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        toast.error("ファイルサイズは5MB以下にしてください");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        uploadMutation.mutate({
          type,
          base64,
          mimeType: file.type,
          fileName: file.name,
        });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  if (companyQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">会社設定</h1>
        <p className="text-muted-foreground mt-1">
          会社情報、ロゴ、社印、ウォーターマークを管理します
        </p>
      </div>

      <Tabs defaultValue="info" className="space-y-4">
        <TabsList>
          <TabsTrigger value="info">
            <Building2 className="h-4 w-4 mr-2" />
            基本情報
          </TabsTrigger>
          <TabsTrigger value="bank">
            <Banknote className="h-4 w-4 mr-2" />
            振込先
          </TabsTrigger>
          <TabsTrigger value="images">
            <Image className="h-4 w-4 mr-2" />
            ロゴ・社印・ウォーターマーク
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card>
            <CardHeader>
              <CardTitle>基本情報</CardTitle>
              <CardDescription>請求書や名簿に表示される会社情報</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>会社名 *</Label>
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>郵便番号</Label>
                  <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="257-0015" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>住所</Label>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>電話番号</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>メールアドレス</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>登録番号</Label>
                  <Input value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>適格請求書発行事業者番号</Label>
                  <Input value={invoiceIssuerNumber} onChange={(e) => setInvoiceIssuerNumber(e.target.value)} placeholder="T6810341010660" />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2"><Label>社印X</Label><Input type="number" value={sealX} onChange={(e)=>setSealX(Number(e.target.value))} /></div>
                <div className="space-y-2"><Label>社印Y</Label><Input type="number" value={sealY} onChange={(e)=>setSealY(Number(e.target.value))} /></div>
                <div className="space-y-2"><Label>社印Scale</Label><Input type="number" step="0.1" value={sealScale} onChange={(e)=>setSealScale(Number(e.target.value))} /></div>
                <div className="space-y-2"><Label>社印Opacity</Label><Input type="number" min="0" max="1" step="0.1" value={sealOpacity} onChange={(e)=>setSealOpacity(Number(e.target.value))} /></div>
              </div>
              <Button
                onClick={handleSave}
                disabled={upsertMutation.isPending}
                className="bg-gold text-background hover:bg-gold-dim"
              >
                {upsertMutation.isPending ? "保存中..." : "保存"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bank">
          <Card>
            <CardHeader>
              <CardTitle>振込先情報</CardTitle>
              <CardDescription>請求書に表示される振込先口座情報</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>銀行名</Label>
                  <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="三井住友銀行" />
                </div>
                <div className="space-y-2">
                  <Label>支店名</Label>
                  <Input value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="厚木支店" />
                </div>
                <div className="space-y-2">
                  <Label>口座種別</Label>
                  <Select value={accountType} onValueChange={(v) => setAccountType(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ordinary">普通</SelectItem>
                      <SelectItem value="checking">当座</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>口座番号</Label>
                  <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>口座名義</Label>
                  <Input value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} />
                </div>
              </div>
              <Button
                onClick={handleSave}
                disabled={upsertMutation.isPending}
                className="bg-gold text-background hover:bg-gold-dim"
              >
                {upsertMutation.isPending ? "保存中..." : "保存"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="images">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Logo */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">会社ロゴ</CardTitle>
                <CardDescription>請求書・名簿のヘッダーに表示</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="aspect-square border border-dashed border-border rounded-lg flex items-center justify-center bg-muted/20 overflow-hidden">
                  {company?.logoUrl ? (
                    <img src={company.logoUrl} alt="ロゴ" className="max-w-full max-h-full object-contain p-4" />
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <Upload className="h-8 w-8 mx-auto mb-2" />
                      <p className="text-sm">未設定</p>
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleImageUpload("logo")}
                  disabled={uploadMutation.isPending}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploadMutation.isPending ? "アップロード中..." : "アップロード"}
                </Button>
              </CardContent>
            </Card>

            {/* Seal */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">社印</CardTitle>
                <CardDescription>請求書に押印として表示</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="aspect-square border border-dashed border-border rounded-lg flex items-center justify-center bg-muted/20 overflow-hidden">
                  {company?.sealUrl ? (
                    <img src={company.sealUrl} alt="社印" className="max-w-full max-h-full object-contain p-4" />
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <Upload className="h-8 w-8 mx-auto mb-2" />
                      <p className="text-sm">未設定</p>
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleImageUpload("seal")}
                  disabled={uploadMutation.isPending}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploadMutation.isPending ? "アップロード中..." : "アップロード"}
                </Button>
              </CardContent>
            </Card>

            {/* Watermark */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">ウォーターマーク</CardTitle>
                <CardDescription>PDF書類の背景に透かしとして表示</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="aspect-square border border-dashed border-border rounded-lg flex items-center justify-center bg-muted/20 overflow-hidden">
                  {company?.watermarkUrl ? (
                    <img src={company.watermarkUrl} alt="ウォーターマーク" className="max-w-full max-h-full object-contain p-4 opacity-30" />
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <Upload className="h-8 w-8 mx-auto mb-2" />
                      <p className="text-sm">未設定</p>
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleImageUpload("watermark")}
                  disabled={uploadMutation.isPending}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploadMutation.isPending ? "アップロード中..." : "アップロード"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
