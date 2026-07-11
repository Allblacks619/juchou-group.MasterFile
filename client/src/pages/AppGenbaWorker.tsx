import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import GenbaShell from "@/components/genba/GenbaShell";
import { setGenbaLinkToken } from "@/lib/genbaLinkToken";

/**
 * 作業員専用リンクのエントリ (G-full)。ログイン不要 (トークン認証)。
 * 簡易ページではなく本体アプリ (GenbaShell) をそのまま起動し、
 * リンクの現場スコープ + 権限 (worker/leader) で機能を出し分ける。
 * 無効化されたリンクは内容を一切表示しない。
 */
export default function AppGenbaWorker() {
  const [, params] = useRoute("/app/w/:token");
  const token = params?.token ?? "";
  // クエリ発火前にトークンを確定させる (main.tsx が毎リクエスト x-genba-link を付与)
  if (token) setGenbaLinkToken(token);

  const utils = trpc.useUtils();
  const { data: me, isLoading: meLoading, error: meError } = trpc.genba.me.useQuery(undefined, {
    enabled: !!token, retry: false, refetchOnWindowFocus: true,
  });
  const { data: sites, isLoading: sitesLoading, error: sitesError } = trpc.genba.sites.list.useQuery(undefined, {
    enabled: !!me, retry: false,
  });

  if (!token) return null;
  if (meLoading || (!!me && sitesLoading)) {
    return <div className="min-h-dvh flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  const err = meError || sitesError;
  if (err || !me) {
    return <CenterMessage title="このリンクは利用できません" body={err?.message || "通信環境を確認して、もう一度開いてください。"} />;
  }

  const list = (sites || []) as { id: string; name: string; driveUrl: string | null; projectId: number | null }[];
  if (list.length === 0) {
    return <CenterMessage title="現場が見つかりません" body="この現場は削除されたか、非公開になっています。管理者に確認してください。" />;
  }

  return (
    <div className="min-h-dvh bg-background text-foreground p-1">
      <GenbaShell
        me={me as any}
        sites={list}
        linkMode
        onCreateSite={() => {}}
        onSitesChanged={() => utils.genba.sites.list.invalidate()}
      />
    </div>
  );
}

function CenterMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <div className="max-w-sm text-center space-y-2">
        <div className="text-4xl">🔒</div>
        <h1 className="text-lg font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
