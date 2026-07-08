/**
 * 現場ビジョン: オフライン・アウトボックスのキュー処理 (純関数・単体テスト対象)。
 * IndexedDB 依存はクライアント側 (client/src/lib/genbaOutbox.ts) が持ち、ここは並べ替え/送信順序の
 * ロジックのみを扱う。進捗登録・問題報告を FIFO で再送し、順序を保つため最初の失敗で停止する。
 */

export type OutboxKind = "setStatus";

export type OutboxItem = {
  /** クライアント生成のキューID (IndexedDB キー) */
  id: string;
  kind: OutboxKind;
  /** tRPC mutation 入力 (setStatus: {id,status,percent?,issueText?,photos?}) */
  payload: any;
  createdAt: number;
  tries: number;
};

export type FlushResult = { sent: number; remaining: number; failed: boolean };

/**
 * キューを古い順(FIFO)で送信する。
 * - runner が成功したら onSent でそのIDを消す。
 * - 1件でも失敗したら順序保持のためそこで停止 (残りは次回の flush に持ち越し)。
 * 進捗の途中経過や問題報告(履歴イベント)を欠落・入れ替えさせないための設計。
 */
export async function processOutbox(
  items: OutboxItem[],
  runner: (item: OutboxItem) => Promise<void>,
  onSent: (id: string) => Promise<void> | void,
): Promise<FlushResult> {
  const ordered = [...items].sort((a, b) => a.createdAt - b.createdAt);
  let sent = 0;
  for (const item of ordered) {
    try {
      await runner(item);
      await onSent(item.id);
      sent++;
    } catch {
      return { sent, remaining: ordered.length - sent, failed: true };
    }
  }
  return { sent, remaining: ordered.length - sent, failed: false };
}
