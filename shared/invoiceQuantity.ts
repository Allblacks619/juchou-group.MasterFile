/**
 * 請求書明細の数量（invoice_items.quantity / worker_invoice_items.quantity）の共通変換。
 *
 * 【規約】DBの quantity は **単位に関係なく必ず ×10 の int**（15 = 1.5、220 = 22.0）。
 * attendance_records.hoursWorked / overtimeHours と同じ house convention（小数を int で持つ）。
 * **変換は server/db.ts の invoice item アクセサだけで行う**。ルーター・PDF・画面は常に人間単位(1.5)。
 *
 * 以前は「単位が『日』のときだけ ×10、それ以外は素の値」という規約を各所に散らしていたため、
 * 30分刻み(0.5h)の残業 1.5 が int 列に丸められて 2 として表示され、
 * 「2時間 × ¥3,906 = ¥5,859」という計算の合わない請求書が出ていた（金額は 1.5h で正しかった）。
 * 半日(0.5日)を含む作業員請求書の日数も同じ理由でずれていた。
 */

/** 保存倍率。0.1 単位（＝残業30分刻み・半日）まで丸めずに int 列へ載せるための係数。 */
const QUANTITY_SCALE = 10;

/** 人間が入力・計算する数量(1.5) → 保存値(15)。 */
export function toStoredQuantity(human: number): number {
  return Math.round((Number(human) || 0) * QUANTITY_SCALE);
}

/** 保存値(15) → 人間が読む数量(1.5)。金額計算はこちらを使う。 */
export function fromStoredQuantity(stored: number): number {
  return (Number(stored) || 0) / QUANTITY_SCALE;
}

