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
                <div className="space-y-2 md:col-span-2">
                  <Label>適格請求書発行事業者番号</Label>
                  <Input value={invoiceIssuerNumber} onChange={(e) => setInvoiceIssuerNumber(e.target.value)} placeholder="T6810341010660" />
                  <p className="text-xs text-muted-foreground">取引先への請求書には、この番号が自社の登録番号として表示されます。</p>
                </div>
              </div>

              {/* 社印の位置（取引先請求書プレビュー） */}
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="pt-3">
                  <Label>社印の位置（取引先請求書プレビュー）</Label>
                  <p className="text-xs text-muted-foreground">プレビュー上で社印をドラッグして位置を決めてください。大きさ・濃さは下のスライダーで調整できます。「保存」で確定します。</p>
                </div>
                <SealPositionPreview
                  sealUrl={company?.sealUrl || null}
                  x={sealX}
                  y={sealY}
                  scale={sealScale}
                  opacity={sealOpacity}
                  onChange={(nx, ny) => { setSealX(nx); setSealY(ny); }}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs">大きさ（Scale）：{sealScale.toFixed(1)}倍</Label>
                    <input type="range" min="0.3" max="3" step="0.1" value={sealScale} onChange={(e)=>setSealScale(Number(e.target.value))} className="w-full accent-gold" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">濃さ（Opacity）：{Math.round(sealOpacity*100)}%</Label>
                    <input type="range" min="0.1" max="1" step="0.05" value={sealOpacity} onChange={(e)=>setSealOpacity(Number(e.target.value))} className="w-full accent-gold" />
                  </div>
                </div>
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">数値で微調整</summary>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                    <div className="space-y-1"><Label className="text-xs">X</Label><Input type="number" value={sealX} onChange={(e)=>setSealX(Number(e.target.value))} /></div>
                    <div className="space-y-1"><Label className="text-xs">Y</Label><Input type="number" value={sealY} onChange={(e)=>setSealY(Number(e.target.value))} /></div>
                    <div className="space-y-1"><Label className="text-xs">Scale</Label><Input type="number" step="0.1" value={sealScale} onChange={(e)=>setSealScale(Number(e.target.value))} /></div>
                    <div className="space-y-1"><Label className="text-xs">Opacity</Label><Input type="number" min="0" max="1" step="0.1" value={sealOpacity} onChange={(e)=>setSealOpacity(Number(e.target.value))} /></div>
                  </div>
                </details>
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

// ── 社印の位置プレビュー ──
// 取引先請求書PDF(server/pdfInvoice.ts)と同じ座標系。A4(pt)絶対座標・左上原点。
// 数値はこの定数を server 側と一致させること（社印の見た目が揃う）。
const SEAL_A4_W = 595.28;
const SEAL_A4_H = 841.89;
const SEAL_BASE = 40; // 拡大率1のときの社印の一辺(pt)
const SEAL_DEFAULT_X = 480;
const SEAL_DEFAULT_Y = 110;

function SealPositionPreview({
  sealUrl,
  x,
  y,
  scale,
  opacity,
  onChange,
}: {
  sealUrl: string | null;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  onChange: (x: number, y: number) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // 未設定(0,0)は既定位置を表示（PDF側も同じ既定に落とす）。
  const isUnset = x === 0 && y === 0;
  const effX = isUnset ? SEAL_DEFAULT_X : x;
  const effY = isUnset ? SEAL_DEFAULT_Y : y;
  const sealPt = SEAL_BASE * (scale > 0 ? scale : 1);

  const moveTo = (clientX: number, clientY: number) => {
    const box = boxRef.current;
    if (!box) return;
    const r = box.getBoundingClientRect();
    // カーソル位置を社印の中心にする → 左上座標に変換
    let nx = ((clientX - r.left) / r.width) * SEAL_A4_W - sealPt / 2;
    let ny = ((clientY - r.top) / r.height) * SEAL_A4_H - sealPt / 2;
    nx = Math.max(0, Math.min(SEAL_A4_W - sealPt, nx));
    ny = Math.max(0, Math.min(SEAL_A4_H - sealPt, ny));
    onChange(Math.round(nx), Math.round(ny));
  };

  return (
    <div>
      <div
        ref={boxRef}
        onPointerDown={(e) => { dragging.current = true; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); moveTo(e.clientX, e.clientY); }}
        onPointerMove={(e) => { if (dragging.current) moveTo(e.clientX, e.clientY); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
        className="relative mx-auto w-full max-w-[360px] rounded-md border border-border bg-white overflow-hidden select-none touch-none cursor-crosshair"
        style={{ aspectRatio: `${SEAL_A4_W} / ${SEAL_A4_H}` }}
      >
        {/* 請求書レイアウトの簡易ワイヤーフレーム（位置の目安） */}
        <div className="absolute inset-0 p-[6%] text-[#333]" style={{ pointerEvents: "none" }}>
          <div className="text-center font-bold" style={{ fontSize: "min(3.2vw,15px)" }}>請求書</div>
          <div className="mt-[3%] flex justify-between text-[8px] text-[#999]">
            <div className="space-y-1">
              <div className="h-2 w-24 bg-[#eee] rounded" />
              <div className="h-2 w-16 bg-[#eee] rounded" />
            </div>
            <div className="space-y-1 text-right">
              <div className="h-2 w-24 bg-[#eee] rounded ml-auto" />
              <div className="h-2 w-20 bg-[#eee] rounded ml-auto" />
              <div className="h-2 w-16 bg-[#eee] rounded ml-auto" />
            </div>
          </div>
          <div className="mt-[8%] space-y-1">
            <div className="h-3 w-full bg-[#f3f3f3] rounded" />
            <div className="h-3 w-full bg-[#f7f7f7] rounded" />
            <div className="h-3 w-full bg-[#f7f7f7] rounded" />
          </div>
        </div>

        {/* 社印 */}
        {sealUrl ? (
          <img
            src={sealUrl}
            alt="社印"
            draggable={false}
            onPointerDown={(e) => { e.stopPropagation(); dragging.current = true; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); }}
            className="absolute cursor-move"
            style={{
              left: `${(effX / SEAL_A4_W) * 100}%`,
              top: `${(effY / SEAL_A4_H) * 100}%`,
              width: `${(sealPt / SEAL_A4_W) * 100}%`,
              height: `${(sealPt / SEAL_A4_H) * 100}%`,
              opacity: opacity,
              objectFit: "contain",
            }}
          />
        ) : (
          <div
            className="absolute flex items-center justify-center rounded-full border-2 border-dashed border-red-400 text-[9px] text-red-400 text-center leading-tight"
            style={{
              left: `${(effX / SEAL_A4_W) * 100}%`,
              top: `${(effY / SEAL_A4_H) * 100}%`,
              width: `${(sealPt / SEAL_A4_W) * 100}%`,
              height: `${(sealPt / SEAL_A4_H) * 100}%`,
              opacity: opacity,
            }}
          >
            社印
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-1 text-center">
        {sealUrl
          ? (isUnset ? "既定位置（未設定）。ドラッグして位置を決めてください。" : `位置 X:${x} / Y:${y}`)
          : "「ロゴ・社印・ウォーターマーク」タブで社印画像をアップロードすると表示されます。"}
      </p>
    </div>
  );
}
