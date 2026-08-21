import { toast } from "sonner";

/**
 * 生成したファイル（Excel等）を確実にダウンロードさせる。
 *
 * mutation の onSuccess から window.open() を呼ぶと、ユーザー操作から時間が空くため
 * ブラウザのポップアップブロックに掛かり「押しても何も起きない」状態になる。
 * a[download] のクリックはポップアップ扱いされないので、blob 化してから落とす。
 */
export async function downloadFile(url: string, fileName: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
  } catch {
    // CORS等で取得できない場合は新しいタブで開く（ブラウザの保存機能を使ってもらう）。
    window.open(url, "_blank", "noopener,noreferrer");
    toast.info("ダウンロードできない場合は、開いたファイルから保存してください。");
  }
}
