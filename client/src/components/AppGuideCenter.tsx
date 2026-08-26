import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileText,
  HardHat,
  HelpCircle,
  Megaphone,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useAppLang } from "@/contexts/AppLanguageContext";
import { isManagerLikeAppRole } from "@/lib/appRoles";
import { APP_UPDATES, type AppUpdate } from "@/generated/appUpdates";

const ONBOARDING_VERSION = 1;
type GuideAudience = "manager" | "worker";
type GuideMode = "onboarding" | "updates" | null;

type GuideStep = {
  icon: any;
  titleJa: string;
  titlePt: string;
  bodyJa: string;
  bodyPt: string;
  bulletsJa: string[];
  bulletsPt: string[];
  ctaJa?: string;
  ctaPt?: string;
  path?: string;
};

const MANAGER_STEPS: GuideStep[] = [
  {
    icon: Sparkles,
    titleJa: "このアプリで、現場から支払いまでを一本化",
    titlePt: "Do canteiro ao pagamento em um só fluxo",
    bodyJa: "招待・作業員・現場・出面・月締め・請求・入金・支払まで、同じデータをつないで管理する業務アプリです。二重入力を減らし、誰に何を確認すべきかを見える化します。",
    bodyPt: "O aplicativo conecta convites, trabalhadores, obras, presença, fechamento mensal, faturamento, recebimentos e pagamentos usando os mesmos dados.",
    bulletsJa: ["管理情報を1か所に集約", "現場データを請求・支払まで再利用", "管理者と作業員で必要な画面だけを表示"],
    bulletsPt: ["Informações de gestão em um só lugar", "Os dados da obra seguem até cobrança e pagamento", "Cada perfil vê somente o que precisa"],
  },
  {
    icon: Users,
    titleJa: "① 会社情報と作業員を整える",
    titlePt: "1. Prepare a empresa e a equipe",
    bodyJa: "最初に会社情報を確認し、作業員を登録・招待します。招待された人は自分のアカウントでログインし、自分のプロフィールや担当業務を確認できます。",
    bodyPt: "Primeiro confira os dados da empresa e convide os trabalhadores. Cada pessoa recebe sua própria conta e acesso ao que precisa.",
    bulletsJa: ["会社情報を登録", "従業員・外注さんを登録", "招待リンクを発行してログインしてもらう"],
    bulletsPt: ["Cadastre os dados da empresa", "Cadastre funcionários e prestadores", "Envie o convite para acesso individual"],
    ctaJa: "招待管理を開く",
    ctaPt: "Abrir convites",
    path: "/app/invitations",
  },
  {
    icon: HardHat,
    titleJa: "② 現場 → 配置 → 出面をつなぐ",
    titlePt: "2. Obra → equipe → presença",
    bodyJa: "現場を作成し、担当者を紐づけ、出面・作業日報を記録します。ここで入れた情報が月締めや支払い計算の根拠になります。",
    bodyPt: "Crie a obra, vincule a equipe e registre presença e relatórios. Esses dados serão a base do fechamento e dos pagamentos.",
    bulletsJa: ["現場と担当者を登録", "GENBAで配置・作業情報を共有", "出面と作業日報を日々確認"],
    bulletsPt: ["Cadastre obras e responsáveis", "Compartilhe alocação e tarefas pelo GENBA", "Confira presença e relatório diariamente"],
    ctaJa: "現場管理を開く",
    ctaPt: "Abrir obras",
    path: "/app/projects",
  },
  {
    icon: CalendarCheck2,
    titleJa: "③ 月末は『月締め』から始める",
    titlePt: "3. No fim do mês, comece pelo fechamento",
    bodyJa: "月締めで出面・交通費・必要情報を確認して締めます。締めた情報を元に請求・入金・支払へ進むため、後工程の金額ズレを減らせます。",
    bodyPt: "No fechamento mensal, revise presença, transporte e dados necessários. Depois avance para cobrança, recebimento e pagamento.",
    bulletsJa: ["① 月締め", "② 取引先へ請求", "③ 入金確認", "④ 外注費を支払"],
    bulletsPt: ["1. Fechamento mensal", "2. Cobrança do cliente", "3. Conferência do recebimento", "4. Pagamento dos prestadores"],
    ctaJa: "月締めを開く",
    ctaPt: "Abrir fechamento",
    path: "/app/monthly-close-v2",
  },
  {
    icon: Wallet,
    titleJa: "④ 支払は締めデータから自動で根拠を出す",
    titlePt: "4. Pagamentos baseados no fechamento",
    bodyJa: "支払管理では、支払月から2か月前の締め出面を参照します。早期支払がある場合は精算残高も含めて差引支払額を確認できます。",
    bodyPt: "A gestão de pagamentos usa o fechamento de dois meses antes do mês de pagamento e considera eventuais adiantamentos/antecipações registrados.",
    bulletsJa: ["例：10月支払＝8月締め出面", "外注費の早期支払・手数料・精算を記録", "支払済み状態まで一元管理"],
    bulletsPt: ["Ex.: pagamento de outubro = fechamento de agosto", "Registre antecipações, taxa e compensação", "Controle também o status de pagamento"],
    ctaJa: "支払管理を開く",
    ctaPt: "Abrir pagamentos",
    path: "/app/payments",
  },
  {
    icon: HelpCircle,
    titleJa: "困ったら、いつでもこのガイドに戻れます",
    titlePt: "Volte a este guia quando precisar",
    bodyJa: "右上の『使い方ガイド』から何度でも再表示できます。新機能やフロー変更が入った場合は、ベルのお知らせに変更点が届きます。",
    bodyPt: "Você pode reabrir este guia pelo botão no canto superior. Novas funções e mudanças de fluxo aparecem no sino de atualizações.",
    bulletsJa: ["ガイドは何度でも再表示可能", "自動表示は個別にOFF可能", "サポート画面から問い合わせ可能"],
    bulletsPt: ["O guia pode ser reaberto a qualquer momento", "A abertura automática pode ser desativada", "Use o suporte quando precisar"],
    ctaJa: "サポートを開く",
    ctaPt: "Abrir suporte",
    path: "/app/support",
  },
];

const WORKER_STEPS: GuideStep[] = [
  {
    icon: Sparkles,
    titleJa: "あなたの現場情報を、スマホで分かりやすく",
    titlePt: "Suas informações de trabalho direto no celular",
    bodyJa: "自分のプロフィール、担当現場、出面、作業日報、月締めなど、必要な情報を自分のアカウントから確認・提出できます。",
    bodyPt: "Pelo seu acesso você confere perfil, obras, presença, relatórios e fechamento mensal sem depender de mensagens soltas.",
    bulletsJa: ["自分に必要な情報だけ表示", "現場情報をスマホで確認", "提出・確認の履歴が残る"],
    bulletsPt: ["Veja só o que é necessário para você", "Consulte a obra pelo celular", "Envios e confirmações ficam registrados"],
  },
  {
    icon: BriefcaseBusiness,
    titleJa: "① まず自分のプロフィールを確認",
    titlePt: "1. Confira seu perfil",
    bodyJa: "氏名・連絡先・口座・資格など、自分に関係する情報を確認します。情報が正しいと、管理側との確認作業が減ります。",
    bodyPt: "Confira nome, contato, conta bancária, qualificações e demais dados. Informações corretas reduzem retrabalho.",
    bulletsJa: ["基本情報を確認", "必要書類・資格を確認", "変更があれば最新状態にする"],
    bulletsPt: ["Confira os dados básicos", "Confira documentos e qualificações", "Mantenha as informações atualizadas"],
    ctaJa: "自分のプロフィールを開く",
    ctaPt: "Abrir meu perfil",
    path: "/app/my-profile",
  },
  {
    icon: HardHat,
    titleJa: "② 担当現場と作業内容を確認",
    titlePt: "2. Confira sua obra e tarefas",
    bodyJa: "担当現場や配置、作業内容はGENBAやダッシュボードから確認できます。管理側から共有された情報をここで確認します。",
    bodyPt: "Confira obra, alocação e tarefas pelo GENBA ou painel. As informações compartilhadas pela administração ficam centralizadas aqui.",
    bulletsJa: ["担当現場を確認", "当日の作業内容を確認", "必要な情報・資料を共有"],
    bulletsPt: ["Confira a obra designada", "Veja as tarefas do dia", "Acesse informações e arquivos necessários"],
    ctaJa: "GENBAを開く",
    ctaPt: "Abrir GENBA",
    path: "/app/genba",
  },
  {
    icon: ClipboardCheck,
    titleJa: "③ 出面・作業日報を確認する",
    titlePt: "3. Confira presença e relatório",
    bodyJa: "働いた日や作業内容が正しく記録されているか確認します。この情報が月締めや外注費の算定につながります。",
    bodyPt: "Confira se os dias trabalhados e as atividades estão corretos. Esses dados serão usados no fechamento e cálculo do pagamento.",
    bulletsJa: ["働いた日の記録を確認", "作業日報を確認・提出", "間違いがあれば早めに共有"],
    bulletsPt: ["Confira os dias trabalhados", "Confira/envie o relatório", "Avise rapidamente se houver erro"],
    ctaJa: "作業日報を開く",
    ctaPt: "Abrir relatórios",
    path: "/app/work-reports",
  },
  {
    icon: FileText,
    titleJa: "④ 月末は自分の月締めを確認",
    titlePt: "4. No fim do mês, confira seu fechamento",
    bodyJa: "月末には出面・交通費・必要情報を確認し、自分の締めを進めます。ここが正しいと、請求や支払の金額確認がスムーズになります。",
    bodyPt: "No fim do mês, revise presença, transporte e informações necessárias. Isso facilita a conferência do valor a receber.",
    bulletsJa: ["出面を確認", "交通費など必要情報を確認", "締め内容を提出・確認"],
    bulletsPt: ["Confira a presença", "Confira transporte e outros dados", "Envie/confirme o fechamento"],
    ctaJa: "自分の月締めを開く",
    ctaPt: "Abrir meu fechamento",
    path: "/app/my-closing",
  },
  {
    icon: HelpCircle,
    titleJa: "分からない時はガイドとサポートを使う",
    titlePt: "Use o guia e o suporte quando precisar",
    bodyJa: "右上のガイドは何度でも開けます。新しい機能や使い方の変更があれば、ベルのお知らせで確認できます。",
    bodyPt: "O guia pode ser reaberto sempre que quiser. Mudanças de funções e de fluxo aparecem no sino de atualizações.",
    bulletsJa: ["使い方ガイドは再表示可能", "更新情報はベルに届く", "困ったらサポートから連絡"],
    bulletsPt: ["Reabra o guia quando quiser", "Atualizações chegam pelo sino", "Entre em contato pelo suporte"],
    ctaJa: "サポートを開く",
    ctaPt: "Abrir suporte",
    path: "/app/support",
  },
];

function audienceForRole(appRole: string): GuideAudience {
  return isManagerLikeAppRole(appRole) ? "manager" : "worker";
}

function updatesForAudience(audience: GuideAudience) {
  return APP_UPDATES.filter((item) => item.audience === "all" || item.audience === audience);
}

export default function AppGuideCenter({ appRole }: { appRole: string }) {
  const { lang } = useAppLang();
  const audience = audienceForRole(appRole);
  const steps = audience === "manager" ? MANAGER_STEPS : WORKER_STEPS;
  const utils = trpc.useUtils();
  const stateQuery = trpc.guide.state.useQuery(undefined, { staleTime: 30_000, retry: 1 });
  const saveState = trpc.guide.saveState.useMutation({
    onSuccess: (next) => utils.guide.state.setData(undefined, next),
  });
  const [mode, setMode] = useState<GuideMode>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [disableAutoGuide, setDisableAutoGuide] = useState(false);
  const [disableAutoUpdates, setDisableAutoUpdates] = useState(false);

  const relevantUpdates = useMemo(() => updatesForAudience(audience), [audience]);
  const unseenUpdates = useMemo(() => {
    const lastSeen = stateQuery.data?.lastSeenUpdateId;
    if (!lastSeen) return relevantUpdates;
    const idx = relevantUpdates.findIndex((item) => item.id === lastSeen);
    return idx < 0 ? relevantUpdates : relevantUpdates.slice(0, idx);
  }, [relevantUpdates, stateQuery.data?.lastSeenUpdateId]);

  useEffect(() => {
    const state = stateQuery.data;
    if (!state || mode) return;
    if (state.onboardingAutoShow && state.onboardingSeenVersion < ONBOARDING_VERSION) {
      setStepIndex(0);
      setDisableAutoGuide(false);
      setMode("onboarding");
      return;
    }
    if (state.updatesAutoShow && unseenUpdates.length > 0) {
      setDisableAutoUpdates(false);
      setMode("updates");
    }
  }, [stateQuery.data, unseenUpdates.length, mode]);

  const latestRelevantId = relevantUpdates[0]?.id ?? null;

  const finishGuide = () => {
    saveState.mutate({
      onboardingSeenVersion: ONBOARDING_VERSION,
      onboardingAutoShow: !disableAutoGuide,
      lastSeenUpdateId: latestRelevantId,
    });
    setMode(null);
  };

  const closeGuideForLater = () => {
    if (disableAutoGuide) saveState.mutate({ onboardingAutoShow: false });
    setMode(null);
  };

  const markUpdatesSeen = () => {
    saveState.mutate({
      lastSeenUpdateId: latestRelevantId,
      updatesAutoShow: !disableAutoUpdates,
    });
    setMode(null);
  };

  const openGuide = () => {
    setStepIndex(0);
    setDisableAutoGuide(stateQuery.data?.onboardingAutoShow === false);
    setMode("onboarding");
  };

  const openUpdates = () => {
    setDisableAutoUpdates(stateQuery.data?.updatesAutoShow === false);
    setMode("updates");
  };

  const step = steps[stepIndex];
  const StepIcon = step?.icon ?? BookOpen;

  return (
    <>
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={openGuide} title={lang === "pt" ? "Guia de uso" : "使い方ガイド"}>
          <BookOpen className="h-4 w-4" />
          <span className="hidden sm:inline">{lang === "pt" ? "Guia" : "使い方ガイド"}</span>
        </Button>
        <Button variant="ghost" size="icon" className="relative h-9 w-9" onClick={openUpdates} title={lang === "pt" ? "Atualizações" : "新機能・変更点"}>
          <Bell className="h-4 w-4" />
          {unseenUpdates.length > 0 && (
            <span className="absolute right-0.5 top-0.5 min-w-4 h-4 rounded-full bg-gold text-[10px] leading-4 text-black font-bold px-1">
              {Math.min(unseenUpdates.length, 9)}
            </span>
          )}
        </Button>
      </div>

      <Dialog open={mode === "onboarding"} onOpenChange={(open) => !open && closeGuideForLater()}>
        <DialogContent className="sm:max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-4 pr-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gold/15 text-gold flex items-center justify-center">
                  <StepIcon className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle>{lang === "pt" ? step.titlePt : step.titleJa}</DialogTitle>
                  <DialogDescription className="mt-1">
                    {lang === "pt" ? `Passo ${stepIndex + 1} de ${steps.length}` : `${stepIndex + 1} / ${steps.length}`}
                  </DialogDescription>
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="flex gap-1.5 py-1">
            {steps.map((_, index) => (
              <div key={index} className={`h-1.5 flex-1 rounded-full ${index <= stepIndex ? "bg-gold" : "bg-muted"}`} />
            ))}
          </div>

          <div className="space-y-4 py-2">
            <p className="text-sm leading-6 text-muted-foreground">{lang === "pt" ? step.bodyPt : step.bodyJa}</p>
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2.5">
              {(lang === "pt" ? step.bulletsPt : step.bulletsJa).map((bullet) => (
                <div key={bullet} className="flex gap-2.5 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-gold shrink-0 mt-0.5" />
                  <span>{bullet}</span>
                </div>
              ))}
            </div>
            {step.path && (
              <Button variant="outline" size="sm" onClick={() => { setMode(null); window.location.href = step.path!; }}>
                {lang === "pt" ? step.ctaPt : step.ctaJa}
              </Button>
            )}
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={disableAutoGuide} onChange={(e) => setDisableAutoGuide(e.target.checked)} />
            {lang === "pt" ? "Não abrir este guia automaticamente novamente" : "このガイドを今後自動表示しない"}
          </label>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={closeGuideForLater}>{lang === "pt" ? "Depois" : "あとで"}</Button>
            {stepIndex > 0 && (
              <Button variant="outline" onClick={() => setStepIndex((v) => Math.max(0, v - 1))}>
                <ChevronLeft className="h-4 w-4 mr-1" />{lang === "pt" ? "Voltar" : "戻る"}
              </Button>
            )}
            {stepIndex < steps.length - 1 ? (
              <Button onClick={() => setStepIndex((v) => Math.min(steps.length - 1, v + 1))}>
                {lang === "pt" ? "Próximo" : "次へ"}<ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={finishGuide} disabled={saveState.isPending}>
                <CheckCircle2 className="h-4 w-4 mr-1" />{lang === "pt" ? "Começar a usar" : "使い始める"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === "updates"} onOpenChange={(open) => !open && markUpdatesSeen()}>
        <DialogContent className="sm:max-w-xl max-h-[82vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gold/15 text-gold flex items-center justify-center">
                <Megaphone className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle>{lang === "pt" ? "Novidades e mudanças" : "新機能・変更点"}</DialogTitle>
                <DialogDescription>{lang === "pt" ? "Veja o que mudou no aplicativo." : "アプリの新機能や使い方の変更をここで確認できます。"}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {(unseenUpdates.length > 0 ? unseenUpdates : relevantUpdates.slice(0, 8)).map((item: AppUpdate, index) => (
              <div key={item.id} className={`rounded-xl border p-4 ${index < unseenUpdates.length ? "border-gold/35 bg-gold/5" : "border-border"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-sm">{lang === "pt" ? item.titlePt : item.titleJa}</div>
                    <div className="text-xs text-muted-foreground mt-1">{item.date}</div>
                  </div>
                  {index < unseenUpdates.length && <span className="text-[10px] rounded-full bg-gold text-black font-bold px-2 py-0.5">NEW</span>}
                </div>
                <p className="text-sm text-muted-foreground leading-5 mt-3">{lang === "pt" ? item.detailPt : item.detailJa}</p>
                {item.areas.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {item.areas.map((area) => <span key={area} className="text-[10px] rounded-full bg-muted px-2 py-1">{area}</span>)}
                  </div>
                )}
              </div>
            ))}
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={disableAutoUpdates} onChange={(e) => setDisableAutoUpdates(e.target.checked)} />
            {lang === "pt" ? "Não abrir avisos de atualização automaticamente" : "新機能・変更点のお知らせを自動表示しない"}
          </label>
          <DialogFooter>
            <Button onClick={markUpdatesSeen} disabled={saveState.isPending}>{lang === "pt" ? "Entendi" : "確認しました"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
