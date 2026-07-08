import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { flushOutbox, outboxCount } from "@/lib/genbaOutbox";

/**
 * オフライン・アウトボックスの自動送信フック。
 * - マウント時 + `online` イベント + 定期(30s) でキューを flush。
 * - 送信待ち件数を返し、ヘッダーのバッジ表示に使う。
 * - flush 完了で作業一覧を invalidate して最新化する。
 */
export function useGenbaOutbox() {
  const utils = trpc.useUtils();
  const setStatus = trpc.genba.tasks.setStatus.useMutation();
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const flushing = useRef(false);

  const refreshCount = useCallback(async () => {
    setPending(await outboxCount());
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    flushing.current = true;
    try {
      const before = await outboxCount();
      if (before === 0) return;
      const res = await flushOutbox((payload) => setStatus.mutateAsync(payload).then(() => undefined));
      if (res.sent > 0) {
        utils.genba.tasks.listByZone.invalidate();
        utils.genba.zones.listByFloor.invalidate();
        toast.success(`送信待ち ${res.sent}件を送信しました`);
      }
    } catch {
      /* 次回リトライ */
    } finally {
      flushing.current = false;
      await refreshCount();
    }
  }, [setStatus, utils, refreshCount]);

  useEffect(() => {
    refreshCount();
    flush();
    const onOnline = () => { setOnline(true); flush(); };
    const onOffline = () => setOnline(false);
    const onChanged = () => refreshCount();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("genba-outbox-changed", onChanged);
    const iv = window.setInterval(() => { refreshCount(); flush(); }, 30_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("genba-outbox-changed", onChanged);
      window.clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { pending, online, flush, refreshCount };
}
