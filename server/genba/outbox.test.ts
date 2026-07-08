import { describe, it, expect, vi } from "vitest";
import { processOutbox, type OutboxItem } from "../../shared/genba/outbox";

/** オフライン・アウトボックスの送信順序ロジック (Genba_Beta: 純関数・DB/IDB不使用) */
function item(id: string, createdAt: number, payload: any = {}): OutboxItem {
  return { id, kind: "setStatus", payload, createdAt, tries: 0 };
}

describe("processOutbox", () => {
  it("FIFO(createdAt昇順)で全件送信し、各IDを onSent で消す", async () => {
    const items = [item("c", 300), item("a", 100), item("b", 200)];
    const runOrder: string[] = [];
    const removed: string[] = [];
    const res = await processOutbox(items, async (it) => { runOrder.push(it.id); }, (id) => { removed.push(id); });
    expect(runOrder).toEqual(["a", "b", "c"]); // 古い順
    expect(removed).toEqual(["a", "b", "c"]);
    expect(res).toEqual({ sent: 3, remaining: 0, failed: false });
  });

  it("1件でも失敗したら順序保持のためそこで停止 (残りは持ち越し)", async () => {
    const items = [item("a", 100), item("b", 200), item("c", 300)];
    const removed: string[] = [];
    const res = await processOutbox(
      items,
      async (it) => { if (it.id === "b") throw new Error("network"); },
      (id) => { removed.push(id); },
    );
    expect(removed).toEqual(["a"]); // a のみ送信・削除、b で停止
    expect(res).toEqual({ sent: 1, remaining: 2, failed: true });
  });

  it("先頭で失敗すれば1件も送らない", async () => {
    const res = await processOutbox([item("a", 100)], async () => { throw new Error("fail"); }, vi.fn());
    expect(res).toEqual({ sent: 0, remaining: 1, failed: true });
  });

  it("空キューは no-op", async () => {
    const res = await processOutbox([], vi.fn(), vi.fn());
    expect(res).toEqual({ sent: 0, remaining: 0, failed: false });
  });
});
