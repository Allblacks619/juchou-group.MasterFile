/**
 * 現場ビジョン: i18n (日本語 / ポルトガル語)。
 * プロトタイプ GenbaAppV18.jsx の PT 辞書と tr() を移植した静的定数 (DBに入れない)。
 * キーは日本語原文。未登録キーは原文をそのまま返す (フォールバック)。
 */

export type GenbaLang = "ja" | "pt";

/** 日本語キー → ポルトガル語 */
export const GENBA_PT: Record<string, string> = {
  "図面": "Planta", "作業": "Tarefas", "指示": "Avisos", "配置": "Alocação", "全体": "Resumo", "設定": "Config.",
  "完了": "Concluído", "途中": "Em andamento", "未着手": "Não iniciado", "問題あり": "Problema",
  "最優先": "Urgente", "高": "Alta", "中": "Média", "低": "Baixa", "優先": "Prior.",
  "追加": "Adicionar", "保存": "Salvar", "キャンセル": "Cancelar", "削除": "Excluir", "確定": "Confirmar",
  "中止": "Cancelar", "閉じる": "Fechar", "送信": "Enviar", "作成": "Criar", "登録": "Registrar",
  "クリア": "Limpar", "◀ 戻る": "◀ Voltar", "OK": "OK",
  "＋ エリア追加": "＋ Nova área", "サブエリア追加": "Adicionar subárea",
  "👤 自分の作業": "👤 Minhas tarefas", "⚠ 問題のみ": "⚠ Só problemas",
  "進捗を登録": "Registrar progresso",
  "期限": "Prazo", "開始": "Início", "設定なし": "Não definido",
  "📝 管理者メモ": "📝 Nota do encarregado", "作業員に表示": "Visível p/ equipe",
  "🤝 この作業を引き継ぐ": "🤝 Repassar esta tarefa",
  "📜 履歴": "📜 Histórico", "＋ サブ作業追加": "＋ Subtarefa", "🗑 この作業を削除": "🗑 Excluir tarefa",
  "ローマ字表記(ポルトガル語表示用・任意)": "Leitura em romaji (opcional)",
  "👷 人別": "👷 Por pessoa", "🗺 エリア別": "🗺 Por área",
  "未配置（担当作業なし）": "Sem alocação", "↻ 継続中": "↻ Continuando", "⚠ 担当者未割当": "⚠ Sem responsável",
  "全体進捗": "Progresso geral", "⚠ 問題あり": "⚠ Problemas",
  "フロア別進捗": "Progresso por andar",
  "📣 指示": "📣 Avisos", "📦 材料発注": "📦 Materiais", "📣 指示を出す": "📣 Enviar aviso",
  "👥 全員へ": "👥 Para todos",
  "✓ 確認しました": "✓ Li e confirmei", "✓ 確認済み": "✓ Confirmado", "未読": "Não lido",
  "既読": "Lido",
  "📋 依頼一覧": "📋 Pedidos", "Σ 集計(発注用)": "Σ Totais (compra)",
  "今日": "Hoje", "今週": "Semana", "全期間": "Tudo", "依頼中のみ": "Só pendentes",
  "📦 材料の発注を依頼する": "📦 Pedir materiais",
  "カタログから選択（未来工業・ネグロス電工 他）": "Escolher do catálogo (Mirai / Negros etc.)",
  "分類を選択": "Categoria", "材料を選択": "Material",
  "または直接入力（型番の一部で候補が出ます）": "Ou digite (sugestões pelo código)",
  "個数": "Qtd.", "＋ リストに追加": "＋ Adicionar à lista",
  "依頼中": "Pendente", "発注済": "Comprado", "納品済": "Entregue",
  "📦 発注済にする": "📦 Marcar comprado", "✅ 納品済にする": "✅ Marcar entregue", "依頼を取り消す": "Cancelar pedido",
  "Σ 材料の必要数 集計": "Σ Total de materiais",
  "メンバー": "Equipe", "班（チーム）": "Turmas", "📦 材料プリセット": "📦 Presets de materiais",
  "🔗 外部共有ビュー": "🔗 Compartilhamento externo",
  "🎨 テーマ": "🎨 Tema", "スタンダード": "Padrão", "ダーク": "Escuro", "ピンク": "Rosa",
  "ブラジル和風": "Brasil × Japão", "電気屋スタイル": "Estilo eletricista", "THE 職人": "THE Shokunin",
  "GTAネオン": "Neon GTA", "カスタム": "Personalizado",
  "アクセント色": "Cor de destaque", "ヘッダー色": "Cor do cabeçalho",
  "ライト": "Claro", "和風": "Japonês", "ブラジル×日本": "Brasil × Japão",
  "龍": "Dragão", "虎": "Tigre", "白狐": "Raposa Branca", "烏天狗": "Tengu",
  "ひょっとこ": "Hyottoko", "おたふく": "Otafuku", "翁": "Okina",
  "歌舞伎(隈取)": "Kabuki", "サイバーネオン": "Cyber Neon",
  "🔗 共有ビュー（外部の方向け・閲覧専用）": "🔗 Visualização externa (somente leitura)",
  "件": "itens",
  "📈 学習と改善提案": "📈 Aprendizado e sugestões",
  "アプリの使われ方から自動で提案します": "Sugestões automáticas com base no uso",
  "改善のヒント": "Dicas de melhoria", "利用統計": "Estatísticas de uso",
  "プリセットに追加": "Adicionar ao preset",
  "手入力の材料をプリセット化": "Registrar material digitado",
  "回入力": "vezes", "提案はありません。使い込むほど提案が増えます 👍": "Sem sugestões ainda. Quanto mais uso, mais dicas 👍",
  "完了した作業": "Tarefas concluídas", "報告された問題": "Problemas relatados",
  "材料発注(品目)": "Pedidos de material", "よく発注される材料 TOP5": "Top 5 materiais pedidos",
  "問題が多いエリア": "Áreas com mais problemas",
  "未使用の作業テンプレート": "Tarefas nunca usadas",
  "管理者": "Admin", "リーダー": "Líder", "作業員": "Operário",
  "予算": "Orçamento", "💰 予算トラッカー": "💰 Controle de orçamento",
  "契約金額": "Valor do contrato", "目標利益": "Meta de lucro", "人工単価": "Custo por diária",
  "月間経費": "Despesa mensal", "工期": "Período da obra", "導入前の人工数": "Diárias antes do sistema",
  "残り予算": "Orçamento restante", "使用済み": "Gasto até agora",
  "この現場で予算トラッカーを使う": "Ativar controle de orçamento", "連携する出面表": "Folha de presença vinculada",
  "手入力": "Manual",
  "📖 使い方ガイド": "📖 Guia do app", "ガイドを開く": "Abrir o guia",
  "図面(Drive)": "Planta (Drive)",
  "工期消化": "Período decorrido", "予算消化": "Orçamento usado",
  "言語": "Idioma", "現場一覧": "Lista de obras", "閲覧専用": "Somente leitura",
  "班管理": "Turmas", "作業テンプレート": "Modelo de tarefas", "図面を追加": "Adicionar planta",
  "材料": "Materiais", "共有": "Compartilhar", "学習": "Aprendizado",
};

/** key(日本語) を lang に応じて翻訳。未登録は原文フォールバック */
export function genbaTr(key: string, lang: GenbaLang): string {
  if (lang === "pt") return GENBA_PT[key] ?? key;
  return key;
}
