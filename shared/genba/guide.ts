/**
 * 現場ビジョン: 使い方ガイド (日/PT)。プロトタイプ GUIDE_SECTIONS を移植した静的定数。
 * who: 表示対象ロール ("admin" のみ表示 / null=全員)。
 */

export type GuideSection = {
  icon: string;
  who: "admin" | null;
  jp: { t: string; b: string };
  pt: { t: string; b: string };
};

export const GUIDE_SECTIONS: GuideSection[] = [
  { icon: "🗺", who: null,
    jp: { t: "図面とエリア", b: "図面をタップして工区(エリア)を作成します。エリアをタップすると中の作業一覧が開きます。範囲や名前は ✏ であとから自由に編集できます。" },
    pt: { t: "Planta e áreas", b: "Toque na planta para criar áreas (kouku). Toque em uma área para abrir as tarefas dela. Você pode editar a forma e o nome depois com ✏." } },
  { icon: "📋", who: null,
    jp: { t: "作業と進捗", b: "状態ボタンをタップして「未着手 → 途中(25/50/75%) → 完了」を登録します。⚠問題ありは写真つきで報告でき、管理者の画面にすぐ表示されます。" },
    pt: { t: "Tarefas e progresso", b: "Toque no botão de status: Não iniciado → Em andamento (25/50/75%) → Concluído. Problemas (⚠) podem ser relatados com fotos e aparecem na hora para o encarregado." } },
  { icon: "📣", who: null,
    jp: { t: "指示", b: "管理者・リーダーが全員/班/個人あてに指示を送れます。受け取ったら「✓確認しました」をタップ。未読はタブのバッジで分かります。" },
    pt: { t: "Avisos", b: "Admin e líder enviam avisos para todos, turma ou pessoa. Ao receber, toque em “✓ Li e confirmei”. Não lidos aparecem no badge da aba." } },
  { icon: "📦", who: null,
    jp: { t: "材料発注", b: "「📦材料」から依頼します。カタログ(未来・ネグロス 約110品目)か直接入力で選び、個数と単位をつけて送信。管理者はΣ集計で今日/今週の必要数をまとめて上位へ発注できます。" },
    pt: { t: "Pedido de materiais", b: "Toque em “📦 Materiais”. Escolha do catálogo (Mirai/Negros, ~110 itens) ou digite, informe quantidade e unidade e envie. O admin usa Σ Totais para comprar tudo de uma vez." } },
  { icon: "👷", who: null,
    jp: { t: "配置ボード", b: "担当割当から自動で作られる朝礼用ボードです。毎日の入力は不要。人別/エリア別で今日の動きを確認できます。" },
    pt: { t: "Alocação", b: "Quadro de reunião matinal gerado automaticamente das atribuições. Sem digitação diária. Veja por pessoa ou por área." } },
  { icon: "📊", who: null,
    jp: { t: "全体(ダッシュボード)", b: "現場全体の進捗、期限アラート、問題の一覧をひと目で確認できます。" },
    pt: { t: "Resumo", b: "Progresso geral, alertas de prazo e problemas do canteiro em uma tela." } },
  { icon: "💰", who: "admin",
    jp: { t: "予算トラッカー(管理者)", b: "工期・契約金額・人工単価から「あと何人工使えるか」を自動計算します。出面は手入力か出面表連携。常駐現場では使わなくてOK(未設定のままで影響なし)。" },
    pt: { t: "Orçamento (admin)", b: "Calcula quantas diárias ainda cabem no orçamento a partir do contrato e do período. Obras “jouchuu” (pagas por presença) podem deixar desativado." } },
  { icon: "🔗", who: null,
    jp: { t: "外部共有", b: "施主・元請など外部の方に、図面/作業/配置/全体のうち選んだ範囲だけを閲覧専用で共有できます。社内メモ・Driveリンク・予算・担当者名は共有されません。" },
    pt: { t: "Compartilhamento externo", b: "Compartilhe apenas as abas escolhidas (planta/tarefas/alocação/resumo) em modo somente leitura. Notas internas, links do Drive, orçamento e nomes não são compartilhados." } },
  { icon: "⚙", who: null,
    jp: { t: "設定と権限", b: "権限は3段階: 🛠管理者(全機能) / ⭐リーダー(予算・システム設定以外) / 👷作業員(現場入力)。テーマや言語、このガイドの表示もここで変えられます。" },
    pt: { t: "Config. e permissões", b: "3 níveis: 🛠 Admin (tudo) / ⭐ Líder (menos orçamento) / 👷 Operário (registro de campo). Tema, idioma e este guia ficam aqui." } },
  { icon: "🇧🇷", who: null,
    jp: { t: "言語とローマ字", b: "設定の言語切替でポルトガル語に変更できます。作業名・材料名は「日本語 — Romaji」で併記されます。読みが変なときは管理者が作業詳細のローマ字欄で直せます。" },
    pt: { t: "Idioma e romaji", b: "Troque o idioma nas configurações. Nomes de tarefas e materiais aparecem como “日本語 — Romaji”. Se a leitura estiver errada, o admin corrige no campo romaji da tarefa." } },
];
