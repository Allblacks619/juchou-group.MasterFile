/**
 * InvoicePreview — freee-style invoice preview rendered in the browser.
 * Mirrors the layout of pdfInvoice.ts so users can check before generating PDF.
 */
import { format } from "date-fns";

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
}

interface InvoicePreviewProps {
  invoice: InvoiceData;
  items: InvoiceItemData[];
  client?: ClientData | null;
  company?: CompanyData | null;
}

function toJaDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatYen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

function quantityDisplay(quantity: number, unit: string): string {
  if (unit === "日") return (quantity / 10).toFixed(1);
  return String(quantity);
}

export default function InvoicePreview({ invoice, items, client, company }: InvoicePreviewProps) {
  const honorific = invoice.honorific || "御中";
  const showSeal = invoice.showSeal !== false;
  const showLogo = invoice.showLogo !== false;

  // Tax breakdown by rate
  const taxByRate = new Map<number, number>();
  for (const item of items) {
    if (item.itemType === "text") continue;
    const existing = taxByRate.get(item.itemTaxRate) || 0;
    taxByRate.set(item.itemTaxRate, existing + item.amount);
  }

  const sortedItems = [...items].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="bg-white text-black font-sans text-[11px] leading-relaxed w-full max-w-[210mm] mx-auto shadow-lg" style={{ fontFamily: "'Noto Sans JP', sans-serif" }}>
      {/* A4 page container */}
      <div className="relative p-8 min-h-[297mm]">
        {/* ── Title ── */}
        <h1 className="text-center text-xl font-bold tracking-widest mb-6 border-b-2 border-black pb-2">
          請 求 書
        </h1>

        {/* ── Top Section: Client left, Meta right ── */}
        <div className="flex justify-between mb-6">
          {/* Client info (left) */}
          <div className="w-[55%]">
            {client?.postalCode && (
              <p className="text-[10px] text-gray-600">〒{client.postalCode}</p>
            )}
            {client?.address && (
              <p className="text-[10px] text-gray-600 mb-1">{client.address}</p>
            )}
            {client?.contactPerson && (
              <p className="text-[10px] text-gray-600 mb-1">{client.contactPerson} 様</p>
            )}
            <p className="text-base font-bold border-b border-black pb-1 inline-block">
              {client?.name || "取引先"} {honorific}
            </p>

            {/* Subject */}
            {invoice.subject && (
              <div className="mt-4">
                <p className="text-[10px] text-gray-500">件名</p>
                <p className="text-sm font-medium">{invoice.subject}</p>
              </div>
            )}

            {/* Summary box */}
            <div className="mt-4 border border-gray-400 p-3 bg-gray-50">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-gray-500">ご請求金額</span>
                <span className="text-lg font-bold">{formatYen(invoice.totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Meta info (right) */}
          <div className="w-[40%] text-right">
            <table className="ml-auto text-[10px]">
              <tbody>
                <tr>
                  <td className="text-gray-500 pr-3 py-0.5 text-left">請求書番号</td>
                  <td className="font-mono">{invoice.invoiceNumber}{invoice.subNumber ? `-${invoice.subNumber}` : ""}</td>
                </tr>
                <tr>
                  <td className="text-gray-500 pr-3 py-0.5 text-left">発行日</td>
                  <td>{toJaDate(invoice.issueDate)}</td>
                </tr>
                {invoice.dueDate && (
                  <tr>
                    <td className="text-gray-500 pr-3 py-0.5 text-left">お支払期限</td>
                    <td>{toJaDate(invoice.dueDate)}</td>
                  </tr>
                )}
                <tr>
                  <td className="text-gray-500 pr-3 py-0.5 text-left">対象期間</td>
                  <td>{toJaDate(invoice.periodStart)} 〜 {toJaDate(invoice.periodEnd)}</td>
                </tr>
              </tbody>
            </table>

            {/* Company info */}
            {company && (
              <div className="mt-4 text-[10px] text-left border-t pt-3">
                {showLogo && company.logoUrl && (
                  <div className="flex justify-end mb-2">
                    <img src={company.logoUrl} alt="Logo" className="h-10 object-contain" />
                  </div>
                )}
                <p className="font-bold text-sm">{company.companyName}</p>
                {company.postalCode && <p className="text-gray-600">〒{company.postalCode}</p>}
                {company.address && <p className="text-gray-600">{company.address}</p>}
                {company.phone && <p className="text-gray-600">TEL: {company.phone}</p>}
                {company.email && <p className="text-gray-600">Email: {company.email}</p>}
                {company.invoiceIssuerNumber && (
                  <p className="text-gray-600 mt-1">
                    登録番号: {company.invoiceIssuerNumber}
                  </p>
                )}

                {/* Seal */}
                {showSeal && company.sealUrl && (
                  <div className="flex justify-end mt-2">
                    <img src={company.sealUrl} alt="社印" className="h-16 w-16 object-contain opacity-80" />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Items Table ── */}
        <table className="w-full border-collapse mb-4">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-2 py-1.5 text-left text-[10px] w-8">No.</th>
              <th className="border border-gray-300 px-2 py-1.5 text-left text-[10px]">摘要</th>
              <th className="border border-gray-300 px-2 py-1.5 text-right text-[10px] w-16">数量</th>
              <th className="border border-gray-300 px-2 py-1.5 text-center text-[10px] w-10">単位</th>
              <th className="border border-gray-300 px-2 py-1.5 text-right text-[10px] w-20">単価</th>
              <th className="border border-gray-300 px-2 py-1.5 text-right text-[10px] w-20">金額</th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((item, idx) => (
              <tr key={idx} className={item.itemType === "text" ? "bg-gray-50" : ""}>
                <td className="border border-gray-300 px-2 py-1 text-[10px] text-gray-500">{idx + 1}</td>
                <td className="border border-gray-300 px-2 py-1 text-[10px]">
                  {item.description}
                  {item.itemTaxRate === 8 && item.itemType === "normal" && (
                    <span className="text-[9px] ml-1">※</span>
                  )}
                  {item.notes && (
                    <span className="text-[9px] text-gray-500 ml-1">({item.notes})</span>
                  )}
                </td>
                <td className="border border-gray-300 px-2 py-1 text-[10px] text-right">
                  {item.itemType === "normal" ? quantityDisplay(item.quantity, item.unit || "式") : ""}
                </td>
                <td className="border border-gray-300 px-2 py-1 text-[10px] text-center">
                  {item.itemType === "normal" ? (item.unit || "式") : ""}
                </td>
                <td className="border border-gray-300 px-2 py-1 text-[10px] text-right">
                  {item.itemType === "normal" ? formatYen(item.unitPrice) : ""}
                </td>
                <td className="border border-gray-300 px-2 py-1 text-[10px] text-right font-medium">
                  {item.itemType === "normal" ? formatYen(item.amount) : ""}
                </td>
              </tr>
            ))}
            {/* Empty rows to fill space */}
            {sortedItems.length < 10 && Array.from({ length: 10 - sortedItems.length }).map((_, i) => (
              <tr key={`empty-${i}`}>
                <td className="border border-gray-300 px-2 py-1 text-[10px]">&nbsp;</td>
                <td className="border border-gray-300 px-2 py-1"></td>
                <td className="border border-gray-300 px-2 py-1"></td>
                <td className="border border-gray-300 px-2 py-1"></td>
                <td className="border border-gray-300 px-2 py-1"></td>
                <td className="border border-gray-300 px-2 py-1"></td>
                <td className="border border-gray-300 px-2 py-1"></td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── Reduced tax note ── */}
        {items.some(i => i.itemTaxRate === 8 && i.itemType === "normal") && (
          <p className="text-[9px] text-gray-500 mb-3">※印は軽減税率（8%）対象です。</p>
        )}

        {/* ── Summary Section ── */}
        <div className="flex justify-end mb-4">
          <table className="border-collapse w-[45%]">
            <tbody>
              <tr>
                <td className="border border-gray-300 bg-gray-100 px-3 py-1.5 text-[10px] font-medium">小計</td>
                <td className="border border-gray-300 px-3 py-1.5 text-right text-[10px]">{formatYen(invoice.subtotal)}</td>
              </tr>
              {Array.from(taxByRate.entries()).sort((a, b) => b[0] - a[0]).map(([rate, base]) => {
                if (rate === 0) return null;
                const tax = Math.round((base * rate) / 100);
                return (
                  <tr key={rate}>
                    <td className="border border-gray-300 bg-gray-100 px-3 py-1.5 text-[10px] font-medium">
                      消費税（{rate}%）
                    </td>
                    <td className="border border-gray-300 px-3 py-1.5 text-right text-[10px]">{formatYen(tax)}</td>
                  </tr>
                );
              })}
              {invoice.withholding && invoice.withholdingAmount ? (
                <tr>
                  <td className="border border-gray-300 bg-gray-100 px-3 py-1.5 text-[10px] font-medium">源泉徴収税</td>
                  <td className="border border-gray-300 px-3 py-1.5 text-right text-[10px]">-{formatYen(invoice.withholdingAmount)}</td>
                </tr>
              ) : null}
              <tr>
                <td className="border border-gray-300 bg-gray-800 text-white px-3 py-2 text-[11px] font-bold">合計金額</td>
                <td className="border border-gray-300 bg-gray-800 text-white px-3 py-2 text-right text-[11px] font-bold">{formatYen(invoice.totalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── Bank Info ── */}
        {company && company.bankName && (
          <div className="border border-gray-300 p-3 mb-4 bg-gray-50">
            <p className="text-[10px] font-bold mb-1">お振込先</p>
            <table className="text-[10px]">
              <tbody>
                <tr>
                  <td className="text-gray-500 pr-3 py-0.5">銀行名</td>
                  <td>{company.bankName}</td>
                </tr>
                {company.branchName && (
                  <tr>
                    <td className="text-gray-500 pr-3 py-0.5">支店名</td>
                    <td>{company.branchName}</td>
                  </tr>
                )}
                <tr>
                  <td className="text-gray-500 pr-3 py-0.5">口座種別</td>
                  <td>{company.accountType === "checking" ? "当座" : "普通"}</td>
                </tr>
                {company.accountNumber && (
                  <tr>
                    <td className="text-gray-500 pr-3 py-0.5">口座番号</td>
                    <td>{company.accountNumber}</td>
                  </tr>
                )}
                {company.accountHolder && (
                  <tr>
                    <td className="text-gray-500 pr-3 py-0.5">口座名義</td>
                    <td>{company.accountHolder}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Payment method ── */}
        {invoice.paymentMethod && (
          <p className="text-[10px] text-gray-600 mb-2">お支払方法: {invoice.paymentMethod}</p>
        )}

        {/* ── Notes ── */}
        {invoice.notes && (
          <div className="border-t pt-2 mt-2">
            <p className="text-[10px] font-bold mb-1">備考</p>
            <p className="text-[10px] text-gray-600 whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
