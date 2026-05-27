import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ShieldCheck,
  Users,
  HardHat,
  BookOpen,
  HelpCircle,
  CalendarDays,
  FileText,
  FolderOpen,
  DollarSign,
  UserPlus,
  Building2,
  UserCircle,
  KeyRound,
  Globe,
} from "lucide-react";
import { useAppLang } from "@/contexts/AppLanguageContext";

/* ── Guide content ── */
const adminGuideJa = [
  {
    icon: UserPlus,
    title: "招待管理",
    steps: [
      "サイドバーの「招待管理」をクリック",
      "「新規招待を作成」ボタンをクリック",
      "ログインID（ローマ字氏名）と仮パスワードを入力",
      "権限（管理者/責任者/作業員）を選択",
      "「招待リンクを生成」をクリック",
      "生成されたログインID・仮パスワード・招待リンクを従業員に共有",
      "従業員は招待リンクからアカウントを作成し、初回ログイン後にパスワードを変更",
    ],
  },
  {
    icon: Building2,
    title: "会社設定",
    steps: [
      "サイドバーの「会社設定」をクリック",
      "会社名・住所・電話番号・メールアドレスを入力",
      "適格請求事業者番号（インボイス番号）を入力",
      "振込先情報（銀行名・支店名・口座番号・名義人）を入力",
      "ロゴ・社印・ウォーターマーク画像をアップロード（請求書PDFに反映）",
      "「保存」をクリック",
    ],
  },
  {
    icon: Users,
    title: "従業員管理",
    steps: [
      "サイドバーの「従業員管理」をクリック",
      "従業員一覧が表示されます",
      "従業員名をクリックすると詳細ページに移動",
      "詳細ページでは個人情報・在留情報・保険・緊急連絡先・振込先・資格・書類を管理",
      "作業員名簿PDFの出力も可能",
    ],
  },
  {
    icon: FolderOpen,
    title: "現場管理",
    steps: [
      "サイドバーの「現場管理」をクリック",
      "「新規現場追加」で取引先・現場名・場所を入力",
      "現場にメンバー（作業員）を追加",
      "現場のステータス（稼働中/終了）を管理",
    ],
  },
  {
    icon: DollarSign,
    title: "単価管理",
    steps: [
      "サイドバーの「単価管理」をクリック",
      "現場を選択して単価を設定",
      "一律単価：その現場の全作業員に適用されるデフォルト単価",
      "個別単価：特定の作業員に対して個別の単価を設定（一律より優先）",
      "昼勤/夜勤の区分、先方単価（売上）と支払単価（原価）を入力",
      "適用期間を設定して「登録」をクリック",
    ],
  },
  {
    icon: CalendarDays,
    title: "出面表管理",
    steps: [
      "サイドバーの「出面表管理」をクリック",
      "現場と月を選択",
      "空セルをクリックで出勤（8h）を設定",
      "出勤セルをクリックで詳細編集（シフト・残業時間・タイプ変更）",
      "ゲスト（一時的な作業員）の追加も可能",
      "「保存」で出面データを保存",
      "「PDF出力」「Excel出力」でファイルをダウンロード",
    ],
  },
  {
    icon: FileText,
    title: "請求書管理",
    steps: [
      "サイドバーの「請求書」をクリック",
      "「出面表から自動作成」：現場・月を選択すると出面データから自動で請求書を生成",
      "「手動作成」：取引先・現場・件名・金額を手入力",
      "明細の編集：項目の追加・削除・金額変更が可能",
      "「PDF出力」で請求書PDFをダウンロード",
      "ステータス管理：下書き→送付済→入金済の流れで管理",
    ],
  },
];

const adminGuidePt = [
  {
    icon: UserPlus,
    title: "Gerenciamento de Convites",
    steps: [
      "Clique em 'Convites' no menu lateral",
      "Clique no botão 'Criar novo convite'",
      "Digite o ID de login (nome em romaji) e a senha temporária",
      "Selecione a permissão (Administrador/Gerente/Trabalhador)",
      "Clique em 'Gerar link de convite'",
      "Compartilhe o ID de login, senha temporária e link com o funcionário",
      "O funcionário cria a conta pelo link e altera a senha no primeiro login",
    ],
  },
  {
    icon: Building2,
    title: "Configurações da Empresa",
    steps: [
      "Clique em 'Config. Empresa' no menu lateral",
      "Preencha nome da empresa, endereço, telefone e e-mail",
      "Insira o número de fatura qualificada (Invoice Number)",
      "Preencha os dados bancários (banco, agência, conta, titular)",
      "Envie imagens de logo, carimbo e marca d'água (refletidas no PDF)",
      "Clique em 'Salvar'",
    ],
  },
  {
    icon: Users,
    title: "Gerenciamento de Funcionários",
    steps: [
      "Clique em 'Funcionários' no menu lateral",
      "A lista de funcionários será exibida",
      "Clique no nome do funcionário para ver os detalhes",
      "Na página de detalhes, gerencie informações pessoais, residência, seguro, contato de emergência, dados bancários, qualificações e documentos",
      "Também é possível exportar o PDF da ficha do trabalhador",
    ],
  },
  {
    icon: FolderOpen,
    title: "Gerenciamento de Obras",
    steps: [
      "Clique em 'Obras' no menu lateral",
      "Em 'Adicionar nova obra', insira cliente, nome da obra e local",
      "Adicione membros (trabalhadores) à obra",
      "Gerencie o status da obra (Ativo/Encerrado)",
    ],
  },
  {
    icon: DollarSign,
    title: "Gerenciamento de Valores",
    steps: [
      "Clique em 'Valores' no menu lateral",
      "Selecione a obra e defina os valores",
      "Valor uniforme: valor padrão aplicado a todos os trabalhadores da obra",
      "Valor individual: valor específico para um trabalhador (tem prioridade sobre o uniforme)",
      "Insira turno (diurno/noturno), valor do cliente (receita) e valor de pagamento (custo)",
      "Defina o período de aplicação e clique em 'Registrar'",
    ],
  },
  {
    icon: CalendarDays,
    title: "Gerenciamento de Presença",
    steps: [
      "Clique em 'Presença' no menu lateral",
      "Selecione a obra e o mês",
      "Clique em uma célula vazia para registrar presença (8h)",
      "Clique em uma célula preenchida para editar detalhes (turno, hora extra, tipo)",
      "Também é possível adicionar convidados (trabalhadores temporários)",
      "'Salvar' para salvar os dados de presença",
      "'Exportar PDF' e 'Exportar Excel' para baixar arquivos",
    ],
  },
  {
    icon: FileText,
    title: "Gerenciamento de Faturas",
    steps: [
      "Clique em 'Faturas' no menu lateral",
      "'Criar a partir da presença': selecione obra e mês para gerar fatura automaticamente",
      "'Criar manualmente': insira cliente, obra, assunto e valores manualmente",
      "Edição de itens: adicione, exclua ou altere valores dos itens",
      "'Exportar PDF' para baixar o PDF da fatura",
      "Gerenciamento de status: Rascunho → Enviada → Paga",
    ],
  },
];

const workerGuideJa = [
  {
    icon: KeyRound,
    title: "初回ログイン",
    steps: [
      "管理者から共有された招待リンクを開く",
      "表示されたログインIDと仮パスワードを確認",
      "「アカウントを作成」をクリック",
      "ログインページでログインIDと仮パスワードを入力",
      "初回ログイン時にパスワード変更画面が表示されます",
      "新しいパスワードを設定してください（6文字以上）",
    ],
  },
  {
    icon: UserCircle,
    title: "マイプロフィール",
    steps: [
      "サイドバーの「マイプロフィール」をクリック",
      "個人情報（氏名・フリガナ・生年月日・血液型）を入力",
      "在留情報（在留資格・在留カード番号・期限）を入力",
      "住所・保険情報・緊急連絡先・振込先を入力",
      "資格や書類（在留カード画像など）をアップロード",
      "各セクションの「保存」ボタンで保存",
      "ダッシュボードに未記入項目のお知らせが表示されます",
    ],
  },
  {
    icon: CalendarDays,
    title: "マイ出面表",
    steps: [
      "ダッシュボードの「マイ出面表」セクションで確認",
      "現在の月の出勤日数・合計時間・残業時間が表示されます",
      "日別の出勤状況も確認できます",
    ],
  },
  {
    icon: Globe,
    title: "言語切替",
    steps: [
      "サイドバー下部の「Português / 日本語」ボタンをクリック",
      "日本語とポルトガル語を切り替えられます",
      "設定はブラウザに保存され、次回ログイン時も維持されます",
    ],
  },
];

const workerGuidePt = [
  {
    icon: KeyRound,
    title: "Primeiro Login",
    steps: [
      "Abra o link de convite compartilhado pelo administrador",
      "Confirme o ID de login e a senha temporária exibidos",
      "Clique em 'Criar conta'",
      "Na página de login, insira o ID e a senha temporária",
      "No primeiro login, a tela de alteração de senha será exibida",
      "Defina uma nova senha (mínimo 6 caracteres)",
    ],
  },
  {
    icon: UserCircle,
    title: "Meu Perfil",
    steps: [
      "Clique em 'Meu Perfil' no menu lateral",
      "Preencha informações pessoais (nome, furigana, data de nascimento, tipo sanguíneo)",
      "Preencha informações de residência (status, número do cartão, validade)",
      "Preencha endereço, seguro, contato de emergência e dados bancários",
      "Envie qualificações e documentos (imagens do cartão de residência, etc.)",
      "Clique em 'Salvar' em cada seção",
      "Itens pendentes serão exibidos no painel principal",
    ],
  },
  {
    icon: CalendarDays,
    title: "Minha Presença",
    steps: [
      "Confira na seção 'Minha presença' do painel principal",
      "São exibidos: dias trabalhados, horas totais e horas extras do mês atual",
      "Também é possível ver a presença diária",
    ],
  },
  {
    icon: Globe,
    title: "Troca de Idioma",
    steps: [
      "Clique no botão 'Português / 日本語' na parte inferior do menu lateral",
      "Alterne entre japonês e português",
      "A configuração é salva no navegador e mantida no próximo login",
    ],
  },
];

const faqJa = [
  { q: "パスワードを忘れた場合はどうすればいいですか？", a: "管理者に連絡して、新しい招待リンクを発行してもらうか、管理者がパスワードをリセットしてください。" },
  { q: "招待リンクの有効期限が切れました。", a: "管理者に連絡して、新しい招待リンクを発行してもらってください。" },
  { q: "出面表のデータが表示されません。", a: "現場と月が正しく選択されているか確認してください。また、その現場にメンバーとして登録されているか確認してください。" },
  { q: "請求書の金額が合いません。", a: "出面表のデータと単価設定を確認してください。出面表から自動作成した場合、単価が正しく設定されているか確認してください。" },
  { q: "PDFが文字化けします。", a: "システムは日本語フォント（NotoSansJP）を使用しています。通常は文字化けしません。問題が続く場合は管理者に連絡してください。" },
  { q: "スマートフォンから使えますか？", a: "はい、レスポンシブデザインに対応しています。ブラウザからアクセスしてください。" },
  { q: "複数の現場を同時に管理できますか？", a: "はい、現場ごとに出面表と請求書を管理できます。現場管理ページで複数の現場を登録してください。" },
  { q: "ゲスト作業員とは何ですか？", a: "一時的に現場に入る作業員です。アカウント登録なしで出面表に名前を追加できます。" },
];

const faqPt = [
  { q: "Esqueci minha senha. O que fazer?", a: "Entre em contato com o administrador para emitir um novo link de convite ou redefinir sua senha." },
  { q: "O link de convite expirou.", a: "Entre em contato com o administrador para emitir um novo link de convite." },
  { q: "Os dados de presença não aparecem.", a: "Verifique se a obra e o mês estão selecionados corretamente. Confirme também se você está registrado como membro da obra." },
  { q: "O valor da fatura está incorreto.", a: "Verifique os dados de presença e as configurações de valores. Se a fatura foi criada automaticamente, confirme se os valores estão corretos." },
  { q: "O PDF está com caracteres ilegíveis.", a: "O sistema usa a fonte japonesa NotoSansJP. Normalmente não há problemas. Se persistir, entre em contato com o administrador." },
  { q: "Posso usar pelo celular?", a: "Sim, o sistema é responsivo. Acesse pelo navegador do seu celular." },
  { q: "Posso gerenciar várias obras ao mesmo tempo?", a: "Sim, é possível gerenciar presença e faturas por obra. Registre várias obras na página de gerenciamento." },
  { q: "O que é um trabalhador convidado?", a: "É um trabalhador temporário na obra. Pode ser adicionado à presença sem criar uma conta." },
];

export default function AppSupport() {
  const { t, lang } = useAppLang();
  const [tab, setTab] = useState("admin");

  const adminGuide = lang === "pt" ? adminGuidePt : adminGuideJa;
  const workerGuide = lang === "pt" ? workerGuidePt : workerGuideJa;
  const faq = lang === "pt" ? faqPt : faqJa;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("support_title")}</h1>
        <p className="text-muted-foreground mt-1">{t("support_subtitle")}</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="admin" className="gap-2">
            <ShieldCheck className="h-4 w-4" />
            {t("support_adminGuide")}
          </TabsTrigger>
          <TabsTrigger value="worker" className="gap-2">
            <HardHat className="h-4 w-4" />
            {t("support_workerGuide")}
          </TabsTrigger>
          <TabsTrigger value="faq" className="gap-2">
            <HelpCircle className="h-4 w-4" />
            {t("support_faq")}
          </TabsTrigger>
        </TabsList>

        {/* Admin Guide */}
        <TabsContent value="admin" className="space-y-4 mt-4">
          {adminGuide.map((section, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-3 text-lg">
                  <section.icon className="h-5 w-5 text-gold" />
                  {section.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  {section.steps.map((step, j) => (
                    <li key={j} className="leading-relaxed">{step}</li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Worker Guide */}
        <TabsContent value="worker" className="space-y-4 mt-4">
          {workerGuide.map((section, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-3 text-lg">
                  <section.icon className="h-5 w-5 text-gold" />
                  {section.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  {section.steps.map((step, j) => (
                    <li key={j} className="leading-relaxed">{step}</li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* FAQ */}
        <TabsContent value="faq" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <Accordion type="multiple" className="w-full">
                {faq.map((item, i) => (
                  <AccordionItem key={i} value={`faq-${i}`}>
                    <AccordionTrigger className="text-sm text-left">
                      <span className="flex items-center gap-2">
                        <Badge variant="outline" className="shrink-0 text-xs">Q{i + 1}</Badge>
                        {item.q}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground">
                      {item.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
