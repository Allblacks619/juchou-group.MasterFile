/**
 * InvoicePreview — 請求書PDF(server/pdfInvoice.ts)の 1:1 プレビュー。
 *
 * PDF と同じ A4 絶対座標(595.28×841.89pt)をそのまま HTML の絶対配置で描き、
 * 表示時にコンテナ幅へ transform: scale する。以前はプレビューだけ独自の
 * flex レイアウト（サマリと振込先が明細の下、6列テーブル）だったため、
 * 「プレビューと出力が別物」になっていた。**座標・順序・列は pdfInvoice.ts に合わせること。**
 */
import { Fragment, useEffect, useRef, useState } from "react";

interface InvoiceData {
  invoiceNumber: string;
  issueDate: Date | string;
  dueDate?: Date | string | null;
  periodStart: Date | string;
  periodEnd: Date | string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  taxRate: number;
  notes?: string | null;
  subject?: string | null;
  honorific?: string | null;
  paymentMethod?: string | null;
  subNumber?: string | null;
  showSeal?: boolean;
  showLogo?: boolean;
  withholding?: boolean;
  withholdingAmount?: number;
}

interface InvoiceItemData {
  itemType: string;
  description: string;
  /** 人間単位の数量（1.5 = 1.5時間）。×10保存は server/db.ts の内部事情。 */
  quantity: number;
  unit?: string | null;
  unitPrice: number;
  amount: number;
  itemTaxRate: number;
  notes?: string | null;
  sortOrder: number;
}

interface ClientData {
  name: string;
  postalCode?: string | null;
  address?: string | null;
  contactPerson?: string | null;
}

interface CompanyData {
  companyName: string;
  postalCode?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  registrationNumber?: string | null;
  invoiceIssuerNumber?: string | null;
  bankName?: string | null;
  branchName?: string | null;
  accountType?: string | null;
  accountNumber?: string | null;
  accountHolder?: string | null;
  logoUrl?: string | null;
  sealUrl?: string | null;
  watermarkUrl?: string | null;
}

/** 社印・ロゴのレイアウト調整（PDFと同じ座標系: A4=595.28×841.89pt、社印基準40pt/ロゴ基準50pt）。 */
export interface InvoiceLayoutSettings {
  seal?: { x?: number; y?: number; scale?: number; opacity?: number };
  logo?: { scale?: number; offsetX?: number; offsetY?: number };
}

interface InvoicePreviewProps {
  invoice: InvoiceData;
  items: InvoiceItemData[];
  client?: ClientData | null;
  company?: CompanyData | null;
  /** 未指定時は company.sealSettings / logoSettings を使う。プレビュー調整のライブ反映用。 */
  layout?: InvoiceLayoutSettings;
  /** PDF が印字する発行者名（server の OWNER_NAME）。 */
  ownerName?: string | null;
}

// ── pdfInvoice.ts と同じ定数（変更するときは両方そろえること） ──
const A4_W = 595.28;
const A4_H = 841.89;
const M_L = 40;
const M_R = 40;
const CONTENT_W = A4_W - M_L - M_R;
const SEAL_BASE = 40;
const SEAL_DEFAULT_X = 480;
const SEAL_DEFAULT_Y = 110;
const ROW_H = 18;
const MIN_ROWS = 12;

function toJaDateStr(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatYen(amount: number): string {
  return amount.toLocaleString("ja-JP");
}

/** 絶対配置のテキスト。PDFKit の doc.text(text, x, y, {width, align}) と同じ引数の並び。 */
function Txt({
  children, x, y, size = 8, width, align = "left", color = "#333", bold = false, lineGap = 0,
}: {
  children: React.ReactNode; x: number; y: number; size?: number; width?: number;
  align?: "left" | "center" | "right"; color?: string; bold?: boolean; lineGap?: number;
}) {
  return (
    <div
      style={{
        position: "absolute", left: x, top: y, width, color, textAlign: align,
        fontSize: size, lineHeight: `${size + 2 + lineGap}px`, fontWeight: bold ? 700 : 400,
        whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}
    >
      {children}
    </div>
  );
}

/** 絶対配置の矩形（PDFKit の doc.rect(...).stroke() / .fillAndStroke(...) 相当）。 */
function Box({
  x, y, w, h, fill, stroke = "#999",
}: { x: number; y: number; w: number; h: number; fill?: string; stroke?: string }) {
  return (
    <div
      style={{
        position: "absolute", left: x, top: y, width: w, height: h,
        background: fill ?? "transparent", border: `0.5px solid ${stroke}`, boxSizing: "border-box",
      }}
    />
  );
}

export default function InvoicePreview({ invoice, items, client, company, layout, ownerName }: InvoicePreviewProps) {
  // A4 の実寸 div を親幅に合わせて縮小表示する（座標をPDFと共有するため実寸を崩さない）。
  // スマホ幅では 7pt の文字が潰れるので、原寸(100%)に切り替えて横スクロールで読めるようにする。
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  const [actualSize, setActualSize] = useState(false);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setFitScale(entry.contentRect.width / A4_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = actualSize ? 1 : fitScale;

  const honorific = invoice.honorific || "御中";
  const showSeal = invoice.showSeal !== false;
  const showLogo = invoice.showLogo !== false;

  const sealRaw = layout?.seal ?? ((company as any)?.sealSettings || {});
  const sealX = Number(sealRaw?.x) > 0 ? Number(sealRaw.x) : SEAL_DEFAULT_X;
  const sealY = Number(sealRaw?.y) > 0 ? Number(sealRaw.y) : SEAL_DEFAULT_Y;
  const sealScale = Number(sealRaw?.scale) > 0 ? Number(sealRaw.scale) : 1;
  const sealOpacity = sealRaw?.opacity != null && sealRaw?.opacity !== "" ? Number(sealRaw.opacity) : 0.85;
  const logoRaw = layout?.logo ?? ((company as any)?.logoSettings || {});
  const logoScale = Number(logoRaw?.scale) > 0 ? Number(logoRaw.scale) : 1;
  const logoOffsetX = Number(logoRaw?.offsetX) || 0;
  const logoOffsetY = Number(logoRaw?.offsetY) || 0;
  const logoSize = 50 * logoScale;

  const sortedItems = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  const nodes: React.ReactNode[] = [];
  let key = 0;
  const push = (n: React.ReactNode) => nodes.push(<Fragment key={key++}>{n}</Fragment>);

  // ── 左: 取引先 ──
  let y = 35;
  push(<Txt x={M_L} y={y} width={CONTENT_W} align="center" size={18} bold>請求書</Txt>);
  y += 35;

  const clientStartY = y;
  push(<Txt x={M_L} y={y} size={12} bold width={260}>{`${client?.name || "取引先"} ${honorific}`}</Txt>);
  y += 20;
  for (const line of [
    client?.postalCode ? `〒${client.postalCode}` : null,
    client?.address || null,
    client?.contactPerson ? `${client.contactPerson} 様` : null,
  ]) {
    if (!line) continue;
    push(<Txt x={M_L} y={y} width={220} color="#555">{line}</Txt>);
    y += 12;
  }

  // ── 右: 請求メタ ──
  const metaX = A4_W - M_R - 200;
  let metaY = clientStartY;
  const metaRows: [string, string][] = [
    ["請求日", toJaDateStr(invoice.issueDate)],
    ["請求書番号", `${invoice.invoiceNumber}${invoice.subNumber ? `-${invoice.subNumber}` : ""}`],
  ];
  if (company?.invoiceIssuerNumber) metaRows.push(["登録番号", company.invoiceIssuerNumber]);
  for (const [label, value] of metaRows) {
    push(<Txt x={metaX} y={metaY} width={70} color="#555">{label}</Txt>);
    push(<Txt x={metaX + 70} y={metaY} width={130} align="right" color="#555">{value}</Txt>);
    metaY += 14;
  }
  metaY += 10;

  if (showLogo && company?.logoUrl) {
    push(
      <img
        src={company.logoUrl}
        alt="Logo"
        style={{
          position: "absolute", left: metaX + 140 + logoOffsetX, top: metaY - 5 + logoOffsetY,
          width: logoSize, height: logoSize, objectFit: "contain",
        }}
      />
    );
  }
  if (company?.companyName) {
    push(
      <Txt x={metaX} y={metaY} size={10} bold align="right" width={showLogo && company?.logoUrl ? 130 : 200}>
        {company.companyName}
      </Txt>
    );
    metaY += 16;
  }
  for (const line of [ownerName || null, company?.postalCode ? `〒${company.postalCode}` : null, company?.address || null]) {
    if (!line) continue;
    push(<Txt x={metaX} y={metaY} size={7} align="right" width={200} color="#555">{line}</Txt>);
    metaY += 11;
  }

  y = Math.max(y + 10, metaY + 10);

  push(<Txt x={M_L} y={y} width={CONTENT_W}>下記の通りご請求申し上げます。</Txt>);
  y += 16;
  if (invoice.subject) {
    push(<Txt x={M_L} y={y} size={9} bold width={CONTENT_W}>{`件名　${invoice.subject}`}</Txt>);
    y += 16;
  }

  // ── サマリ枠（小計 / 消費税 / 源泉徴収 / 請求金額） ──
  const hasWithholding = !!invoice.withholding && (invoice.withholdingAmount || 0) > 0;
  const summaryW = hasWithholding ? 370 : 280;
  const col1W = hasWithholding ? 80 : 90;
  const col2W = hasWithholding ? 80 : 90;
  const colWHW = hasWithholding ? 90 : 0;
  const col3W = hasWithholding ? 120 : 100;
  push(<Box x={M_L} y={y} w={summaryW} h={36} />);
  push(<Box x={M_L} y={y} w={summaryW} h={14} fill="#f0ebe0" />);
  push(<Txt x={M_L} y={y + 3} size={7} width={col1W} align="center">小計</Txt>);
  push(<Txt x={M_L + col1W} y={y + 3} size={7} width={col2W} align="center">消費税</Txt>);
  if (hasWithholding) push(<Txt x={M_L + col1W + col2W} y={y + 3} size={7} width={colWHW} align="center">源泉徴収</Txt>);
  push(<Txt x={M_L + col1W + col2W + colWHW} y={y + 3} size={7} width={col3W} align="center">請求金額</Txt>);
  push(<Txt x={M_L} y={y + 18} width={col1W} align="center">{`${formatYen(invoice.subtotal)}円`}</Txt>);
  push(<Txt x={M_L + col1W} y={y + 18} width={col2W} align="center">{`${formatYen(invoice.taxAmount)}円`}</Txt>);
  if (hasWithholding) {
    push(<Txt x={M_L + col1W + col2W} y={y + 18} width={colWHW} align="center" color="#c00">{`-${formatYen(invoice.withholdingAmount || 0)}円`}</Txt>);
  }
  push(<Txt x={M_L + col1W + col2W + colWHW} y={y + 16} size={11} bold width={col3W} align="center">{`${formatYen(invoice.totalAmount)}円`}</Txt>);
  y += 46;

  // ── 入金期日 / 振込先 ──
  if (invoice.dueDate || company?.bankName) {
    const payW = 280;
    const payH = company?.bankName ? 44 : 22;
    const dueW = 80;
    push(<Box x={M_L} y={y} w={payW} h={payH} />);
    push(<Box x={M_L} y={y} w={dueW} h={22} fill="#f0ebe0" />);
    push(<Txt x={M_L} y={y + 6} size={7} width={dueW} align="center">入金期日</Txt>);
    push(<Txt x={M_L} y={y + 28} width={dueW} align="center">{invoice.dueDate ? toJaDateStr(invoice.dueDate) : "-"}</Txt>);
    if (company?.bankName) {
      const accType = company.accountType === "ordinary" ? "普通" : company.accountType === "checking" ? "当座" : "";
      push(<Box x={M_L + dueW} y={y} w={payW - dueW} h={22} fill="#f0ebe0" />);
      push(<Txt x={M_L + dueW} y={y + 6} size={7} width={payW - dueW} align="center">振込先</Txt>);
      push(
        <Txt x={M_L + dueW + 6} y={y + 24} size={7} width={payW - dueW - 12} lineGap={1}>
          {`${company.bankName} ${company.branchName || ""}\n${accType}口座 ${company.accountNumber || ""}\n口座名義 ${company.accountHolder || ""}`}
        </Txt>
      );
    }
    y += payH + 12;
  }

  // ── 明細表（品目・摘要 / 数量 / 単価 / 明細金額） ──
  const amountColW = 75;
  const qtyColW = 55;
  const priceColW = 60;
  const descColW = CONTENT_W - qtyColW - priceColW - amountColW;
  const cols: { w: number; label: string; align: "left" | "right" }[] = [
    { w: descColW, label: "品目・摘要", align: "left" },
    { w: qtyColW, label: "数量", align: "right" },
    { w: priceColW, label: "単価", align: "right" },
    { w: amountColW, label: "明細金額", align: "right" },
  ];
  let hx = M_L;
  for (const col of cols) {
    push(<Box x={hx} y={y} w={col.w} h={18} fill="#e8e0d0" />);
    push(<Txt x={hx + 3} y={y + 4} size={7} width={col.w - 6} align="center">{col.label}</Txt>);
    hx += col.w;
  }
  y += 18;

  const totalRows = Math.max(sortedItems.filter((i) => i.itemType !== "text").length, MIN_ROWS);
  let itemIdx = 0;
  for (let rowNum = 0; rowNum < totalRows; rowNum++) {
    const item = itemIdx < sortedItems.length ? sortedItems[itemIdx] : null;
    if (item?.itemType === "text") {
      push(<Box x={M_L} y={y} w={CONTENT_W} h={ROW_H} fill="#f9f9f5" stroke="#ddd" />);
      push(<Txt x={M_L + 3} y={y + 4} size={6.5} width={CONTENT_W - 10} color="#666">{item.description || ""}</Txt>);
      y += ROW_H;
      itemIdx++;
      continue; // pdfInvoice.ts と同じく text 行も 1 行ぶんを消費する
    }
    const bg = rowNum % 2 === 0 ? "#ffffff" : "#fafaf5";
    const values = item
      ? [
          item.description + (item.itemTaxRate === 8 ? " ※" : ""),
          `${item.quantity} ${item.unit || "式"}`,
          formatYen(item.unitPrice),
          formatYen(item.amount),
        ]
      : ["", "", "", ""];
    let cx = M_L;
    for (let j = 0; j < cols.length; j++) {
      push(<Box x={cx} y={y} w={cols[j].w} h={ROW_H} fill={bg} stroke="#ddd" />);
      if (values[j]) push(<Txt x={cx + 3} y={y + 4} size={7} width={cols[j].w - 6} align={cols[j].align}>{values[j]}</Txt>);
      cx += cols[j].w;
    }
    if (item) itemIdx++;
    y += ROW_H;
  }
  while (itemIdx < sortedItems.length) {
    const item = sortedItems[itemIdx];
    if (item.itemType === "text") {
      push(<Box x={M_L} y={y} w={CONTENT_W} h={ROW_H} fill="#f9f9f5" stroke="#ddd" />);
      push(<Txt x={M_L + 3} y={y + 4} size={6.5} width={CONTENT_W - 10} color="#666">{item.description || ""}</Txt>);
      y += ROW_H;
    }
    itemIdx++;
  }
  y += 8;

  if (sortedItems.some((i) => i.itemTaxRate === 8 && i.itemType === "normal")) {
    push(<Txt x={M_L} y={y} size={6.5} color="#666" width={CONTENT_W}>※印は軽減税率対象です。</Txt>);
    y += 12;
  }

  // ── 税率別内訳 ──
  const taxByRate = new Map<number, number>();
  for (const item of sortedItems) {
    if (item.itemType === "text") continue;
    taxByRate.set(item.itemTaxRate, (taxByRate.get(item.itemTaxRate) || 0) + item.amount);
  }
  const breakdown = Array.from(taxByRate.entries()).sort((a, b) => b[0] - a[0]).filter(([r]) => r > 0);
  if (breakdown.length > 0) {
    const bdX = M_L + CONTENT_W - 220;
    const bdW = 220;
    const bdH = 14 + breakdown.length * 28;
    push(<Box x={bdX} y={y} w={bdW} h={bdH} />);
    push(<Box x={bdX} y={y} w={bdW} h={14} fill="#f0ebe0" />);
    push(<Txt x={bdX + 4} y={y + 3} size={7}>内訳</Txt>);
    let bdY = y + 14;
    for (const [rate, base] of breakdown) {
      const taxAmt = Math.round((base * rate) / 100);
      push(<Txt x={bdX + 8} y={bdY + 3} size={7} width={130}>{rate === 8 ? `軽減税率${rate}%対象(税抜)` : `${rate}%対象(税抜)`}</Txt>);
      push(<Txt x={bdX + 138} y={bdY + 3} size={7} width={76} align="right">{`${formatYen(base)}円`}</Txt>);
      bdY += 14;
      push(<Txt x={bdX + 16} y={bdY + 2} size={6.5} width={122} color="#666">{rate === 8 ? `軽減税率${rate}%消費税` : `${rate}%消費税`}</Txt>);
      push(<Txt x={bdX + 138} y={bdY + 2} size={6.5} width={76} align="right" color="#666">{`${formatYen(taxAmt)}円`}</Txt>);
      bdY += 14;
    }
    y += bdH + 8;
  }

  if (invoice.notes) {
    push(<Box x={M_L} y={y} w={CONTENT_W} h={50} />);
    push(<Txt x={M_L + 6} y={y + 4} size={7} color="#666">備考</Txt>);
    push(<Txt x={M_L + 6} y={y + 16} size={7} width={CONTENT_W - 12} lineGap={2}>{invoice.notes}</Txt>);
    y += 58;
  }

  // ponytail: 用紙は1枚の縦長キャンバスとして描く。PDF の改ページ（y>720で addPage）は再現しない。
  // 明細が1枚に収まらない案件が出たらページ分割を入れる。
  const pageH = Math.max(A4_H, y + 40);

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setActualSize((v) => !v)}
        className="mb-1 rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {actualSize ? "画面幅に合わせる" : `原寸で見る（${Math.round(fitScale * 100)}%表示中）`}
      </button>
      <div
        ref={wrapRef}
        className={`w-full bg-white ${actualSize ? "overflow-auto" : "overflow-hidden"}`}
        style={{ height: pageH * scale }}
      >
      <div
        className="relative bg-white text-black shadow-lg"
        style={{
          width: A4_W, height: pageH, transform: `scale(${scale})`, transformOrigin: "top left",
          fontFamily: "'Noto Sans JP', sans-serif",
        }}
      >
        {/* 透かし — PDFと同じ（画像が無ければ社名テキストを -35° で薄く） */}
        {company?.watermarkUrl ? (
          <img
            src={company.watermarkUrl}
            alt=""
            style={{ position: "absolute", left: (A4_W - 300) / 2, top: 421 - 150, width: 300, height: 300, objectFit: "contain", opacity: 0.05 }}
          />
        ) : (
          <div
            style={{
              position: "absolute", left: A4_W / 2 - 200, top: 421 - 30, width: 400, textAlign: "center",
              fontSize: 80, color: "#c8a96e", opacity: 0.03, transform: "rotate(-35deg)", whiteSpace: "nowrap",
            }}
          >
            充寵グループ
          </div>
        )}

        {nodes}

        {/* 社印 — PDFと同じA4絶対座標・大きさ・透明度 */}
        {showSeal && company?.sealUrl && (
          <img
            src={company.sealUrl}
            alt="社印"
            style={{
              position: "absolute", left: sealX, top: sealY,
              width: SEAL_BASE * sealScale, height: SEAL_BASE * sealScale,
              objectFit: "contain", opacity: sealOpacity, pointerEvents: "none",
            }}
          />
        )}

      </div>
      </div>
    </div>
  );
}
