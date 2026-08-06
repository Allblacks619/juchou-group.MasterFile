-- 請求書明細の数量を「単位に関係なく ×10 保存」に統一する。
-- 従来は unit='日' のみ ×10 で、それ以外(時間/式)は素の値だったため、
-- 残業 1.5時間 が int 列で 2 に丸められて表示されていた（金額は 1.5h で正しく計算済み）。
--
-- invoice_items: unit='日' の行は既に ×10 なのでそのまま。それ以外(NULL含む)を ×10 にする。
UPDATE `invoice_items` SET `quantity` = `quantity` * 10 WHERE `unit` IS NULL OR `unit` <> '日';
--> statement-breakpoint
-- worker_invoice_items: 全単位が素の値だったので一律 ×10 にする。
UPDATE `worker_invoice_items` SET `quantity` = `quantity` * 10;
--> statement-breakpoint
-- 既定値 1(=1式) も ×10 表現の 10 に合わせる。
ALTER TABLE `worker_invoice_items` MODIFY `quantity` int NOT NULL DEFAULT 10;
