import { useState, useRef, useMemo, useCallback } from "react";

/* ============================================================
   現場ビジョン v2 — 電気工事 現場進捗管理 プロトタイプ (フェーズ2)
   追加: 現場複数管理 / PDF図面取込 / 写真付き問題報告 /
         ログイン&権限 / 作業カスタム / メモ・期限
   ============================================================ */

/* ---------- カラートークン (CUD ver.4 準拠) ---------- */
const PRIORITY = {
  1: { label: "最優先", color: "#FF4B00", soft: "rgba(255,75,0,0.28)", text: "#fff" },
  2: { label: "高", color: "#F6AA00", soft: "rgba(246,170,0,0.30)", text: "#3a2a00" },
  3: { label: "中", color: "#4DC4FF", soft: "rgba(77,196,255,0.30)", text: "#00304a" },
  4: { label: "低", color: "#84919E", soft: "rgba(132,145,158,0.28)", text: "#fff" },
};
const STATUS = {
  todo: { label: "未着手", color: "#9aa5af", icon: "○" },
  progress: { label: "途中", color: "#4DC4FF", icon: "▶" },
  done: { label: "完了", color: "#03AF7A", icon: "✓" },
  issue: { label: "問題あり", color: "#FF4B00", icon: "⚠" },
};

const ROLES = {
  admin: { label: "管理者", icon: "🛠" },
  leader: { label: "リーダー", icon: "⭐" },
  worker: { label: "作業員", icon: "👷" },
};

const MREQ_STATUS = {
  pending: { label: "依頼中", color: "#F6AA00", text: "#3a2a00" },
  ordered: { label: "発注済", color: "#4DC4FF", text: "#00304a" },
  delivered: { label: "納品済", color: "#03AF7A", text: "#fff" },
};

/* ---------- 発注単位 ---------- */
const UNITS = ["個", "箱", "袋", "束", "巻", "本", "m"];

/* ---------- 電材マスターカタログ (未来工業・ネグロス電工ベース / 屋内配線) ---------- */
const MATERIAL_MASTER = [
  {
    g: "建て込み",
    parts: [
      ["未来 スライドボックス SBO(浅形1個用)", "個"],
      ["未来 スライドボックス SB(1個用)", "個"],
      ["未来 スライドボックス SBW(2個用)", "個"],
      ["未来 アウトレットボックス 中形四角 CDO-4A", "個"],
      ["未来 アウトレットボックス 大形四角 CDO-5A", "個"],
      ["塗代カバー(中形四角用・丸孔)", "個"],
      ["塗代カバー(大形四角用・丸孔)", "個"],
      ["未来 八角コンクリートボックス 8CB", "個"],
    ],
  },
  {
    g: "配管",
    parts: [
      ["未来 PF管 MFP-14(50m巻)", "巻"],
      ["未来 PF管 MFP-16(50m巻)", "巻"],
      ["未来 PF管 MFP-22(50m巻)", "巻"],
      ["未来 PF管 MFP-28(30m巻)", "巻"],
      ["未来 CD管 CD-16(50m巻)", "巻"],
      ["PF管カップリング MFC-16", "個"],
      ["PF管カップリング MFC-22", "個"],
      ["PF管コネクタ MFSK-16", "箱"],
      ["PF管コネクタ MFSK-22", "箱"],
      ["PF管用サドル(16用)", "箱"],
      ["PF管用サドル(22用)", "箱"],
      ["ゴムブッシング(打抜き穴用)", "袋"],
    ],
  },
  {
    g: "レースウェイ取り付け",
    parts: [
      ["ネグロス レースウェイ DP1(定尺4m)", "本"],
      ["ネグロス レースウェイ DP2(定尺4m)", "本"],
      ["ネグロス ジョイナー DJ1", "個"],
      ["ネグロス エンドキャップ DE1", "個"],
      ["ネグロス レースウェイ用吊りハンガー(DP1用)", "個"],
      ["ネグロス レースウェイ用吊りハンガー(DP2用)", "個"],
    ],
  },
  {
    g: "支持金具(ダクター)",
    parts: [
      ["ネグロス ダクターチャンネル D1×1m", "本"],
      ["ネグロス ダクターチャンネル D1×1.5m", "本"],
      ["ネグロス ダクターチャンネル D1×2m", "本"],
      ["ネグロス ダクターチャンネル D1×2.5m(定尺)", "本"],
      ["ネグロス ダクターチャンネル D2×2.5m(定尺)", "本"],
      ["ネグロス ダクター Z-D1(ドブ)×2.5m", "本"],
      ["ネグロス ダクター S-D1(ステン)×2.5m", "本"],
      ["ネグロス ダクタークリップ DC1", "箱"],
      ["ネグロス ダクタークリップ DC2", "箱"],
      ["ネグロス パイラック PH1", "箱"],
      ["ネグロス パイラック Z-PH1(ドブ)", "箱"],
      ["ネグロス パイラック S-PH1(ステン)", "箱"],
      ["ダクターナット W3/8", "袋"],
    ],
  },
  {
    g: "金属管(E管・ねじなし)",
    parts: [
      ["ねじなし電線管 E19(定尺3.66m)", "本"],
      ["ねじなし電線管 E25(定尺3.66m)", "本"],
      ["ねじなし電線管 E31(定尺3.66m)", "本"],
      ["ねじなしカップリング E19用", "個"],
      ["ねじなしカップリング E25用", "個"],
      ["ねじなしコネクタ E19用", "箱"],
      ["ねじなしコネクタ E25用", "箱"],
      ["ノーマルベンド E19用", "個"],
      ["露出用サドル E19用", "箱"],
      ["露出用サドル E25用", "箱"],
    ],
  },
  {
    g: "金属管(G管・厚鋼)",
    parts: [
      ["厚鋼電線管 G16(定尺3.66m)", "本"],
      ["厚鋼電線管 G22(定尺3.66m)", "本"],
      ["厚鋼電線管 G28(定尺3.66m)", "本"],
      ["厚鋼電線管 G36(定尺3.66m)", "本"],
      ["カップリング G16用", "個"],
      ["カップリング G22用", "個"],
      ["ノーマルベンド G16用", "個"],
      ["ノーマルベンド G22用", "個"],
      ["絶縁ブッシング G16用", "袋"],
      ["絶縁ブッシング G22用", "袋"],
      ["ロックナット G16用", "袋"],
      ["ロックナット G22用", "袋"],
    ],
  },
  {
    g: "全ネジ・吊りボルト",
    parts: [
      ["全ネジ W3/8×1m", "本"],
      ["全ネジ W3/8×1.5m", "本"],
      ["全ネジ W3/8×2m", "本"],
      ["全ネジ W3/8×1m(ドブ)", "本"],
      ["全ネジ W3/8×2m(ドブ)", "本"],
      ["全ネジ W3/8×1m(ステン)", "本"],
      ["全ネジ W3/8×2m(ステン)", "本"],
      ["全ネジ W1/2×1m", "本"],
      ["全ネジ W1/2×1.5m", "本"],
      ["全ネジ W1/2×2m", "本"],
      ["六角ナット W3/8", "袋"],
      ["六角ナット W3/8(ドブ)", "袋"],
      ["六角ナット W3/8(ステン)", "袋"],
      ["六角ナット W1/2", "袋"],
      ["平ワッシャー W3/8", "袋"],
      ["平ワッシャー W1/2", "袋"],
    ],
  },
  {
    g: "配線(強電)",
    parts: [
      ["IV1.6 黒(300m束)", "束"],
      ["IV1.6 白(300m束)", "束"],
      ["IV1.6 赤(300m束)", "束"],
      ["IV1.6 緑(300m束)", "束"],
      ["IV2.0 黒(300m束)", "束"],
      ["IV2.0 白(300m束)", "束"],
      ["IV2.0 緑(300m束)", "束"],
      ["VVF1.6-2C(100m巻)", "巻"],
      ["VVF1.6-3C(100m巻)", "巻"],
      ["VVF2.0-2C(100m巻)", "巻"],
      ["VVF2.0-3C(100m巻)", "巻"],
      ["EM-EEF2.0-2C(100m巻)", "巻"],
    ],
  },
  {
    g: "配線(弱電・防災)",
    parts: [
      ["AE線 0.9-2C(200m巻)", "巻"],
      ["AE線 0.9-3C(200m巻)", "巻"],
      ["AE線 1.2-2C(200m巻)", "巻"],
      ["AE線 1.2-3C(200m巻)", "巻"],
      ["HP線(耐熱) 1.2-2C(200m巻)", "巻"],
      ["HP線(耐熱) 1.2-3C(200m巻)", "巻"],
      ["LANケーブル Cat6(300m箱)", "箱"],
    ],
  },
  {
    g: "結線材",
    parts: [
      ["リングスリーブ 小(100個入)", "箱"],
      ["リングスリーブ 中(100個入)", "箱"],
      ["リングスリーブ 大(50個入)", "箱"],
      ["差込形コネクタ 2口(50個入)", "箱"],
      ["差込形コネクタ 3口(50個入)", "箱"],
      ["差込形コネクタ 4口(30個入)", "箱"],
      ["ボンド線(アース用)", "袋"],
    ],
  },
  {
    g: "消耗品",
    parts: [
      ["ビニールテープ 黒(10巻入)", "箱"],
      ["ビニールテープ 白(10巻入)", "箱"],
      ["ビニールテープ 赤(10巻入)", "箱"],
      ["ビニールテープ 緑(10巻入)", "箱"],
      ["バリアテープ(危険表示)", "巻"],
      ["結束バンド 200mm(100本入)", "袋"],
      ["結束バンド 300mm(100本入)", "袋"],
      ["マジックペン 黒", "本"],
      ["ステップル(VVF用)", "箱"],
      ["コンクリートビス 25mm", "箱"],
      ["カールプラグ 6mm", "袋"],
    ],
  },
];
const MASTER_FLAT = MATERIAL_MASTER.flatMap((grp) => grp.parts.map(([label, unit]) => ({ label, unit, g: grp.g })));

/* ============================================================
   i18n (日本語 / ポルトガル語)
   ============================================================ */
let LANG = "jp";
const PT = {
  "図面": "Planta", "作業": "Tarefas", "指示": "Avisos", "配置": "Alocação", "全体": "Resumo", "設定": "Config.",
  "完了": "Concluído", "途中": "Em andamento", "未着手": "Não iniciado", "問題あり": "Problema",
  "最優先": "Urgente", "高": "Alta", "中": "Média", "低": "Baixa", "優先": "Prior.",
  "追加": "Adicionar", "保存": "Salvar", "キャンセル": "Cancelar", "削除": "Excluir", "確定": "Confirmar",
  "中止": "Cancelar", "閉じる": "Fechar", "送信": "Enviar", "作成": "Criar", "登録": "Registrar",
  "クリア": "Limpar", "◀ 戻る": "◀ Voltar", "OK": "OK",
  "＋ エリア追加": "＋ Nova área", "サブエリア追加": "Adicionar subárea",
  "図面をタップして頂点を追加": "Toque na planta para adicionar vértices",
  "1点戻す": "Desfazer ponto",
  "✏ 頂点をドラッグで移動 / ＋タップで頂点追加": "✏ Arraste os vértices / toque em ＋ p/ adicionar",
  "選択頂点を削除": "Excluir vértice",
  "エリア優先度:": "Prioridade da área:", "✏ 範囲を編集": "✏ Editar área",
  "▶ 稼働中": "▶ Ativa", "⏸ 予定なし": "⏸ Sem trabalho",
  "＋ このエリアに作業を追加": "＋ Adicionar tarefa nesta área",
  "👤 自分の作業": "👤 Minhas tarefas", "⚠ 問題のみ": "⚠ Só problemas",
  "進捗を登録": "Registrar progresso", "進捗はどれくらいですか?": "Qual é o progresso?",
  "⚠ 問題の内容を報告": "⚠ Relatar o problema", "写真追加": "Foto", "⚠ 問題を報告する": "⚠ Enviar problema",
  "期限": "Prazo", "開始": "Início", "設定なし": "Não definido", "期限超過!": "Atrasado!", "開始遅れ": "Início atrasado", "期限超過": "Atrasado",
  "📐 図面リンク(Google Drive等)": "📐 Link da planta (Google Drive)", "📐 図面を開く(最新版)": "📐 Abrir planta (atual)",
  "図面リンクは設定されていません": "Sem link de planta",
  "📝 管理者メモ": "📝 Nota do encarregado", "作業員に表示": "Visível p/ equipe", "表示できるメモはありません": "Sem notas visíveis",
  "⚠ 報告されている問題": "⚠ Problema relatado", "返信": "Responder",
  "🤝 この作業を引き継ぐ": "🤝 Repassar esta tarefa", "🤝 引き継ぎ先を選択": "🤝 Escolha quem recebe",
  "引き継ぐ(相手に📣通知)": "Repassar (notifica 📣)",
  "📜 履歴": "📜 Histórico", "＋ サブ作業追加": "＋ Subtarefa", "🗑 この作業を削除": "🗑 Excluir tarefa",
  "ローマ字表記(ポルトガル語表示用・任意)": "Leitura em romaji (opcional)",
  "👷 人別": "👷 Por pessoa", "🗺 エリア別": "🗺 Por área",
  "未配置(担当作業なし)": "Sem alocação", "↻ 継続中": "↻ Continuando", "⚠ 担当者未割当": "⚠ Sem responsável",
  "⏸ 作業予定なし(設定済み)": "⏸ Sem trabalho (definido)",
  "全体進捗": "Progresso geral", "📅 期限アラート": "📅 Alertas de prazo", "⚠ 問題あり": "⚠ Problemas",
  "フロア別進捗": "Progresso por andar", "優先度別の残作業(未完了)": "Pendências por prioridade",
  "問題の報告はありません 👍": "Nenhum problema 👍",
  "📣 指示": "📣 Avisos", "📦 材料発注": "📦 Materiais", "📣 指示を出す": "📣 Enviar aviso",
  "👥 全員へ": "👥 Para todos", "エリアリンクなし": "Sem link de área",
  "✓ 確認しました": "✓ Li e confirmei", "✓ 確認済み": "✓ Confirmado", "未読": "Não lido",
  "図面で見る": "Ver na planta", "既読": "Lido",
  "📋 依頼一覧": "📋 Pedidos", "Σ 集計(発注用)": "Σ Totais (compra)",
  "今日": "Hoje", "今週": "Semana", "全期間": "Tudo", "依頼中のみ": "Só pendentes",
  "📦 材料の発注を依頼する": "📦 Pedir materiais",
  "カタログから選択(未来工業・ネグロス電工 他)": "Escolher do catálogo (Mirai / Negros etc.)",
  "分類を選択": "Categoria", "材料を選択": "Material",
  "または直接入力(型番の一部で候補が出ます)": "Ou digite (sugestões pelo código)",
  "個数": "Qtd.", "＋ リストに追加": "＋ Adicionar à lista",
  "依頼中": "Pendente", "発注済": "Comprado", "納品済": "Entregue",
  "📦 発注済にする": "📦 Marcar comprado", "✅ 納品済にする": "✅ Marcar entregue", "依頼を取り消す": "Cancelar pedido",
  "Σ 材料の必要数 集計": "Σ Total de materiais",
  "メンバー": "Equipe", "班(チーム)": "Turmas", "📦 材料プリセット": "📦 Presets de materiais",
  "🔗 外部共有ビュー": "🔗 Compartilhamento externo", "💾 データのバックアップ": "💾 Backup",
  "作業テンプレート(編集可能)": "Modelo de tarefas (editável)",
  "🎨 テーマ": "🎨 Tema", "スタンダード": "Padrão", "ダーク": "Escuro", "ピンク": "Rosa",
  "ブラジル和風": "Brasil × Japão", "電気屋スタイル": "Estilo eletricista", "THE 職人": "THE Shokunin",
  "GTAネオン": "Neon GTA", "カスタム": "Personalizado",
  "アクセント色": "Cor de destaque", "ヘッダー色": "Cor do cabeçalho",
  "ライト": "Claro", "和風": "Japonês", "ブラジル×日本": "Brasil × Japão",
  "龍": "Dragão", "虎": "Tigre", "白狐": "Raposa Branca", "烏天狗": "Tengu",
  "ひょっとこ": "Hyottoko", "おたふく": "Otafuku", "翁": "Okina",
  "歌舞伎(隈取)": "Kabuki", "サイバーネオン": "Cyber Neon",
  "あなたを選択してください。🛠は管理者権限を持つメンバーです(管理者も一作業員として作業を担当できます)。":
    "Selecione seu nome. 🛠 = administrador (o admin também trabalha em campo).",
  "🔗 共有ビュー(外部の方向け・閲覧専用)": "🔗 Visualização externa (somente leitura)",
  "件": "itens",
  "📈 学習と改善提案": "📈 Aprendizado e sugestões",
  "アプリの使われ方から自動で提案します": "Sugestões automáticas com base no uso",
  "改善のヒント": "Dicas de melhoria", "利用統計": "Estatísticas de uso",
  "プリセットに追加": "Adicionar ao preset", "読みを設定": "Definir leitura",
  "手入力の材料をプリセット化": "Registrar material digitado",
  "回入力": "vezes", "提案はありません。使い込むほど提案が増えます 👍": "Sem sugestões ainda. Quanto mais uso, mais dicas 👍",
  "完了した作業": "Tarefas concluídas", "報告された問題": "Problemas relatados",
  "材料発注(品目)": "Pedidos de material", "よく発注される材料 TOP5": "Top 5 materiais pedidos",
  "問題が多いエリア": "Áreas com mais problemas", "ログを消去": "Limpar registros",
  "未使用の作業テンプレート": "Tarefas nunca usadas", "テンプレートから削除できます": "Pode remover do modelo",
  "ローマ字未設定の作業": "Tarefas sem leitura romaji",
  "管理者": "Admin", "リーダー": "Líder", "作業員": "Operário",
  "予算": "Orçamento", "💰 予算トラッカー": "💰 Controle de orçamento",
  "契約金額": "Valor do contrato", "目標利益": "Meta de lucro", "人工単価": "Custo por diária",
  "月間経費": "Despesa mensal", "工期": "Período da obra", "導入前の人工数": "Diárias antes do sistema",
  "残り予算": "Orçamento restante", "使用済み": "Gasto até agora", "出面(人工)を記録": "Registrar diárias",
  "使用できる人工の上限(月平均)": "Limite de diárias (média/mês)", "現在ペース": "Ritmo atual",
  "この現場で予算トラッカーを使う": "Ativar controle de orçamento", "連携する出面表": "Folha de presença vinculada",
  "手入力(このアプリで記録)": "Manual (neste app)",
  "📖 使い方ガイド": "📖 Guia do app", "ガイドを開く": "Abrir o guia",
  "画面右下の?ボタンを表示": "Mostrar o botão ? na tela",
  "図面(Drive)": "Planta (Drive)", "図面の共有リンク(Google Drive)": "Link da planta (Google Drive)",
  "工期消化": "Período decorrido", "予算消化": "Orçamento usado", "ゲスト": "Convidado",
};
const tr = (s) => (LANG === "pt" ? PT[s] || s : s);

/* ---------- 使い方ガイド (日/PT) ---------- */
const GUIDE_SECTIONS = [
  { icon: "map", who: null,
    jp: { t: "図面とエリア", b: "図面をタップして工区(エリア)を作成します。エリアをタップすると中の作業一覧が開きます。範囲や名前は ✏ であとから自由に編集できます。" },
    pt: { t: "Planta e áreas", b: "Toque na planta para criar áreas (kouku). Toque em uma área para abrir as tarefas dela. Você pode editar a forma e o nome depois com ✏." } },
  { icon: "tasks", who: null,
    jp: { t: "作業と進捗", b: "状態ボタンをタップして「未着手 → 途中(25/50/75%) → 完了」を登録します。⚠問題ありは写真つきで報告でき、管理者の画面にすぐ表示されます。" },
    pt: { t: "Tarefas e progresso", b: "Toque no botão de status: Não iniciado → Em andamento (25/50/75%) → Concluído. Problemas (⚠) podem ser relatados com fotos e aparecem na hora para o encarregado." } },
  { icon: "megaphone", who: null,
    jp: { t: "指示", b: "管理者・リーダーが全員/班/個人あてに指示を送れます。受け取ったら「✓確認しました」をタップ。未読はタブのバッジで分かります。" },
    pt: { t: "Avisos", b: "Admin e líder enviam avisos para todos, turma ou pessoa. Ao receber, toque em “✓ Li e confirmei”. Não lidos aparecem no badge da aba." } },
  { icon: "megaphone", who: null,
    jp: { t: "材料発注", b: "指示タブの「📦材料」から依頼します。カタログ(未来・ネグロス 約110品目)か直接入力で選び、個数と単位をつけて送信。管理者はΣ集計で今日/今週の必要数をまとめて上位へ発注できます。" },
    pt: { t: "Pedido de materiais", b: "Na aba Avisos, toque em “📦 Materiais”. Escolha do catálogo (Mirai/Negros, ~110 itens) ou digite, informe quantidade e unidade e envie. O admin usa Σ Totais para comprar tudo de uma vez." } },
  { icon: "users", who: null,
    jp: { t: "配置ボード", b: "担当割当から自動で作られる朝礼用ボードです。毎日の入力は不要。人別/エリア別で今日の動きを確認できます。" },
    pt: { t: "Alocação", b: "Quadro de reunião matinal gerado automaticamente das atribuições. Sem digitação diária. Veja por pessoa ou por área." } },
  { icon: "chart", who: null,
    jp: { t: "全体(ダッシュボード)", b: "現場全体の進捗、期限アラート、問題の一覧をひと目で確認できます。" },
    pt: { t: "Resumo", b: "Progresso geral, alertas de prazo e problemas do canteiro em uma tela." } },
  { icon: "wallet", who: "admin",
    jp: { t: "予算トラッカー(管理者)", b: "工期・契約金額・人工単価から「あと何人工使えるか」を自動計算します。出面は手入力か出面表連携。常駐現場では使わなくてOK(未設定のままで影響なし)。" },
    pt: { t: "Orçamento (admin)", b: "Calcula quantas diárias ainda cabem no orçamento a partir do contrato e do período. Obras “jouchuu” (pagas por presença) podem deixar desativado." } },
  { icon: "gear", who: null,
    jp: { t: "設定と権限", b: "権限は3段階: 🛠管理者(全機能) / ⭐リーダー(予算・システム設定以外) / 👷作業員(現場入力)。テーマや言語、このガイドの表示もここで変えられます。" },
    pt: { t: "Config. e permissões", b: "3 níveis: 🛠 Admin (tudo) / ⭐ Líder (menos orçamento e config. do sistema) / 👷 Operário (registro de campo). Tema, idioma e este guia ficam aqui." } },
  { icon: "bolt", who: null,
    jp: { t: "言語とローマ字", b: "右上の🇯🇵/🇧🇷でポルトガル語に切り替え。作業名・材料名は「日本語 — Romaji」で併記されます。読みが変なときは管理者が作業詳細の🇧🇷欄で直せます。" },
    pt: { t: "Idioma e romaji", b: "Troque o idioma no 🇯🇵/🇧🇷 do topo. Nomes de tarefas e materiais aparecem como “日本語 — Romaji”. Se a leitura estiver errada, o admin corrige no campo 🇧🇷 da tarefa." } },
];

/* ---------- SVGアイコン (ラインアイコン / 絵文字廃止) ---------- */
function SvgIcon({ k, size = 22, sw = 1.9, style }) {
  const body = {
    map: (<><path d="M9 4 3.5 5.9a.8.8 0 0 0-.5.75V19.5l6-2 6 2 5.5-1.9a.8.8 0 0 0 .5-.75V4.5l-6 2L9 4Z" /><path d="M9 4v13.5" /><path d="M15 6v13.5" /></>),
    tasks: (<><rect x="5" y="4.5" width="14" height="16.5" rx="2.5" /><path d="M9.5 2.8h5a1 1 0 0 1 1 1v1.7h-7V3.8a1 1 0 0 1 1-1Z" /><path d="M9 11.5h6" /><path d="M9 15.5h6" /></>),
    megaphone: (<><path d="m3.5 10.5 17-6.5v16l-17-6.5v-3Z" /><path d="M7.5 14.5v3.2a2.3 2.3 0 0 0 4.6 0v-1.5" /></>),
    users: (<><circle cx="9" cy="8" r="3.4" /><path d="M2.8 20a6.3 6.3 0 0 1 12.4 0" /><path d="M15.5 5a3.4 3.4 0 0 1 0 6.8" /><path d="M17.8 14.6a6.3 6.3 0 0 1 3.7 5.4" /></>),
    chart: (<><path d="M5.5 20v-7.5" /><path d="M11.5 20V4.5" /><path d="M17.5 20v-4.5" /><path d="M3 20.5h18" /></>),
    wallet: (<><rect x="3" y="7" width="18" height="13" rx="3" /><path d="M3 10V7a2 2 0 0 1 2-2h11.5" /><path d="M16 13.5h2.5" /></>),
    gear: (<><path d="M4.5 7.5h9" /><circle cx="17" cy="7.5" r="2.4" /><path d="M19.5 12.5h-9" /><circle cx="7" cy="12.5" r="2.4" /><path d="M4.5 17.5h9" /><circle cx="17" cy="17.5" r="2.4" /></>),
    bolt: (<path d="M13.2 2.5 4.5 13.8h5.6l-1.3 7.7 8.7-11.3h-5.6l1.3-7.7Z" fill="currentColor" stroke="none" />),
  }[k];
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ width: size, height: size, display: "block", flexShrink: 0, ...style }}>
      {body}
    </svg>
  );
}

/* ---------- テーマ家紋クレスト (旧・未使用) ---------- */
function ThemeCrest({ t, size = 40, ghost = false }) {
  const txt = t.crest || t.emblem || "現";
  const vertical = t.serif && txt.length >= 2 && txt.length <= 3;
  return (
    <span aria-hidden style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: ghost ? "transparent" : `radial-gradient(circle at 32% 26%, ${t.logo}, ${t.header})`,
      color: t.headerText,
      border: `2px solid ${ghost ? "currentColor" : "rgba(255,255,255,0.88)"}`,
      boxShadow: ghost
        ? `inset 0 0 0 2px transparent, 0 0 0 3px transparent`
        : `0 0 0 2.5px ${t.header}, 0 0 0 4px rgba(255,255,255,0.5), ${t.glow !== "none" ? t.glow : "0 2px 8px rgba(0,0,0,0.3)"}`,
      fontFamily: t.serif ? `"Yu Mincho", "Hiragino Mincho ProN", "Noto Serif JP", serif` : "inherit",
      fontWeight: 800,
      fontSize: vertical ? size * 0.40 : txt.length > 2 ? size * 0.30 : txt.length === 2 ? size * 0.40 : size * 0.52,
      writingMode: vertical ? "vertical-rl" : "horizontal-tb",
      lineHeight: 1, letterSpacing: vertical ? "0.02em" : "0",
      textShadow: t.glow !== "none" ? t.glow : "0 1px 2px rgba(0,0,0,0.25)",
      opacity: ghost ? 0.32 : 1,
      userSelect: "none", pointerEvents: "none",
    }}>{txt}</span>
  );
}

/* ============================================================
   ローマ字変換 (辞書 + かな自動変換 / PT表示用)
   ============================================================ */
const ROMAJI_DICT = {
  "壁": "Kabe", "天井": "Tenjou", "墨出し": "Sumidashi", "建て込み": "Tatekomi", "取り付け": "Toritsuke",
  "貫通": "Kantsuu", "配管": "Haikan", "区画処理": "Kukaku Shori", "全ネジ": "Zen-Neji", "敷設": "Fusetsu",
  "配線": "Haisen", "強電": "Kyouden", "電灯": "Dentou", "非常照明": "Hijou Shoumei", "動力": "Douryoku",
  "幹線引き": "Kansen Hiki", "幹線": "Kansen", "弱電": "Jakuden", "自火報": "Jikahou", "工区": "Kouku",
  "吊りボルト": "Tsuri Bolt", "吊り": "Tsuri", "支持金具": "Shiji Kanagu", "金具": "Kanagu",
  "電線管": "Densenkan", "厚鋼": "Atsukou", "ねじなし": "Nejinashi", "金属管": "Kinzokukan",
  "結束バンド": "Kessoku Band", "ビニールテープ": "Vinyl Tape", "バリアテープ": "Barrier Tape",
  "マジックペン": "Magic Pen", "ステップル": "Staple", "コンクリートビス": "Concrete Screw",
  "カールプラグ": "Curl Plug", "リングスリーブ": "Ring Sleeve", "差込形": "Sashikomi-gata",
  "六角ナット": "Rokkaku Nut", "平ワッシャー": "Hira Washer", "塗代カバー": "Nurishiro Cover",
  "中形四角": "Chuugata Shikaku", "大形四角": "Oogata Shikaku", "浅形": "Asagata", "八角": "Hakkaku",
  "定尺": "Teishaku", "露出用": "Roshutsu-you", "絶縁": "Zetsuen", "消耗品": "Shoumouhin",
  "結線材": "Kessenzai", "危険表示": "Kiken Hyouji", "打抜き穴": "Uchinuki-ana",
  "未来": "Mirai", "個用": "-ko", "黒": "Kuro", "白": "Shiro", "赤": "Aka", "緑": "Midori",
  "小": "Shou", "中": "Chuu", "大": "Dai", "巻": "Maki", "束": "Taba", "入": " iri", "用": "-you",
  "個": "ko", "口": "-guchi", "本": "hon", "耐熱": "Tainetsu", "作業": "Sagyou", "エリア": "Area",
  "管": "Kan", "防災": "Bousai", "材料": "Zairyou", "使う": "Tsukau",
  "レースウェイ": "Raceway", "ダクター": "Ducter", "チャンネル": "Channel", "ボックス": "Box",
  "アース": "Earth", "ラック": "Rack", "アウトレット": "Outlet", "ボンド": "Bond",
  "カップリング": "Coupling", "コネクタ": "Connector", "サドル": "Saddle", "ブッシング": "Bushing",
  "ノーマルベンド": "Normal Bend", "ロックナット": "Lock Nut", "ハンガー": "Hanger",
  "ジョイナー": "Joiner", "エンドキャップ": "End Cap", "クリップ": "Clip", "スライド": "Slide",
  "器具": "Kigu", "付け": "Tsuke", "取付": "Toritsuke", "ルート": "Route", "モール": "Mall",
};
const DICT_KEYS = Object.keys(ROMAJI_DICT).sort((a, b) => b.length - a.length);
const KANA = { あ:"a",い:"i",う:"u",え:"e",お:"o",か:"ka",き:"ki",く:"ku",け:"ke",こ:"ko",さ:"sa",し:"shi",す:"su",せ:"se",そ:"so",た:"ta",ち:"chi",つ:"tsu",て:"te",と:"to",な:"na",に:"ni",ぬ:"nu",ね:"ne",の:"no",は:"ha",ひ:"hi",ふ:"fu",へ:"he",ほ:"ho",ま:"ma",み:"mi",む:"mu",め:"me",も:"mo",や:"ya",ゆ:"yu",よ:"yo",ら:"ra",り:"ri",る:"ru",れ:"re",ろ:"ro",わ:"wa",を:"o",ん:"n",が:"ga",ぎ:"gi",ぐ:"gu",げ:"ge",ご:"go",ざ:"za",じ:"ji",ず:"zu",ぜ:"ze",ぞ:"zo",だ:"da",ぢ:"ji",づ:"zu",で:"de",ど:"do",ば:"ba",び:"bi",ぶ:"bu",べ:"be",ぼ:"bo",ぱ:"pa",ぴ:"pi",ぷ:"pu",ぺ:"pe",ぽ:"po",ぁ:"a",ぃ:"i",ぅ:"u",ぇ:"e",ぉ:"o",ゔ:"vu" };
const SMALL_YA = { ゃ:"ya", ゅ:"yu", ょ:"yo" };
function kanaToRomaji(src) {
  let out = "";
  for (let i = 0; i < src.length; i++) {
    let c = src[i];
    const code = c.charCodeAt(0);
    if (code >= 0x30a1 && code <= 0x30f6) c = String.fromCharCode(code - 0x60);
    if (c === "ー") { const m = out.match(/[aiueo]$/); out += m ? m[0] : ""; continue; }
    if (c === "っ") {
      let n = src[i + 1] || "";
      const nc = n.charCodeAt(0);
      if (nc >= 0x30a1 && nc <= 0x30f6) n = String.fromCharCode(nc - 0x60);
      const r = KANA[n] || "";
      out += r ? r[0] : "tsu";
      continue;
    }
    if (SMALL_YA[c]) {
      out = out.replace(/i$/, "");
      out += /(sh|ch|j)$/.test(out) ? SMALL_YA[c].slice(1) : SMALL_YA[c];
      continue;
    }
    out += KANA[c] !== undefined ? KANA[c] : c;
  }
  return out ? out[0].toUpperCase() + out.slice(1) : out;
}
function romanize(text) {
  const s = String(text || "");
  let i = 0;
  const parts = [];
  while (i < s.length) {
    let hit = null;
    for (const k of DICT_KEYS) { if (s.startsWith(k, i)) { hit = k; break; } }
    if (hit) { parts.push(ROMAJI_DICT[hit]); i += hit.length; continue; }
    const code = s.charCodeAt(i);
    if ((code >= 0x3041 && code <= 0x309f) || (code >= 0x30a1 && code <= 0x30fc)) {
      let j = i;
      while (j < s.length) {
        const cc = s.charCodeAt(j);
        if ((cc >= 0x3041 && cc <= 0x309f) || (cc >= 0x30a1 && cc <= 0x30fc)) j++;
        else break;
      }
      parts.push(kanaToRomaji(s.slice(i, j)));
      i = j;
      continue;
    }
    if (code < 128) {
      let j = i;
      while (j < s.length && s.charCodeAt(j) < 128) j++;
      parts.push(s.slice(i, j));
      i = j;
      continue;
    }
    {
      let j = i;
      while (j < s.length) {
        const cc = s.charCodeAt(j);
        const isKana = (cc >= 0x3041 && cc <= 0x309f) || (cc >= 0x30a1 && cc <= 0x30fc);
        if (cc < 128 || isKana) break;
        let dictHit = false;
        for (const k of DICT_KEYS) { if (s.startsWith(k, j)) { dictHit = true; break; } }
        if (dictHit) break;
        j++;
      }
      parts.push(s.slice(i, j));
      i = j;
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").replace(/\s([)）×〜~])/g, "$1").replace(/([×])\s/g, "$1").replace(/([（(])\s/g, "$1").trim();
}
/* 日本語正式名を保ち、PT時のみ「名前 — Romaji」を返す */
function dispName(name, romaji) {
  if (LANG !== "pt") return name;
  const r = (romaji && romaji.trim()) || romanize(name);
  return r && r !== name ? `${name} — ${r}` : name;
}

/* ============================================================
   テーマ (CUDの優先度・進捗色は全テーマで不変)
   ============================================================ */
const THEMES = {
  standard: { crest: "現場", serif: false, stripe: "linear-gradient(90deg,#005AFF,#4DC4FF)", tint: "rgba(0,90,255, 0.045)", line: "rgba(0,90,255, 0.14)", label: "ライト", appBg: "radial-gradient(110% 55% at 50% 0%, rgba(0,90,255,0.055), transparent 62%), linear-gradient(180deg, #f6f8fb 0%, #edf0f5 100%)", header: "#1B2A41", header2: "#2b4162", headerText: "#fff", logo: "#F6AA00", tabOff: "#94a3b8", tabOn: "#F6AA00", accent: "#005AFF", card: "#fff", mapBg: "#dbe3ea", glow: "none", emblem: "⚡", chip: "rgba(255,255,255,0.14)", chipBorder: "rgba(255,255,255,0.25)" },
  dark: { crest: "現場", serif: false, stripe: "linear-gradient(90deg,#3b82f6,#22d3ee)", tint: "rgba(59,130,246, 0.045)", line: "rgba(59,130,246, 0.14)", label: "ダーク", appBg: "radial-gradient(110% 55% at 50% 0%, rgba(59,130,246,0.13), transparent 58%), linear-gradient(180deg, #0e1627, #090e1a)", header: "#0f172a", header2: "#1e293b", headerText: "#e2e8f0", logo: "#F6AA00", tabOff: "#64748b", tabOn: "#F6AA00", accent: "#3b82f6", card: "#f1f5f9", mapBg: "#1e293b", glow: "none", emblem: "⚡", chip: "rgba(255,255,255,0.10)", chipBorder: "rgba(255,255,255,0.22)" },
  wafu: { crest: "和心", serif: true, stripe: "linear-gradient(90deg,#c9a227,#7a1f1f)", tint: "rgba(138,43,43, 0.045)", line: "rgba(138,43,43, 0.14)", label: "和風", appBg: "radial-gradient(95% 48% at 85% 0%, rgba(201,162,39,0.10), transparent 58%), radial-gradient(80% 40% at 0% 20%, rgba(122,31,31,0.05), transparent 55%), linear-gradient(180deg, #f8f3e9, #f0e8d8)", header: "#7a1f1f", header2: "#4a1010", headerText: "#f8ecd7", logo: "#c9a227", tabOff: "#c9a58f", tabOn: "#f2d17c", accent: "#8a2b2b", card: "#fffaf0", mapBg: "#e9e0cd", glow: "none", emblem: "和", chip: "rgba(255,255,255,0.14)", chipBorder: "rgba(255,255,255,0.30)" },
  brasil: { crest: "BR", serif: false, stripe: "linear-gradient(90deg,#0b6b3a 0 40%,#ffdf00 40% 72%,#1d4ed8 72%)", tint: "rgba(11,107,58, 0.045)", line: "rgba(11,107,58, 0.14)", label: "ブラジル", appBg: "radial-gradient(95% 48% at 12% 0%, rgba(255,223,0,0.13), transparent 55%), radial-gradient(85% 45% at 100% 15%, rgba(11,107,58,0.07), transparent 55%), linear-gradient(180deg, #f4f9f3, #e9f1e8)", header: "#0b6b3a", header2: "#064a27", headerText: "#fff7d6", logo: "#ffdf00", tabOff: "#a7d4b8", tabOn: "#ffdf00", accent: "#0b6b3a", card: "#ffffff", mapBg: "#e3efe4", glow: "none", emblem: "🇧🇷", chip: "rgba(255,255,255,0.16)", chipBorder: "rgba(255,255,255,0.32)" },
  brasilwa: { crest: "日伯", serif: true, stripe: "linear-gradient(90deg,#0b6b3a 0 33%,#ffffff 33% 66%,#bc002d 66%)", tint: "rgba(188,0,45, 0.045)", line: "rgba(188,0,45, 0.14)", label: "ブラジル×日本", appBg: "radial-gradient(85% 42% at 88% 0%, rgba(188,0,45,0.075), transparent 55%), radial-gradient(80% 40% at 0% 12%, rgba(11,107,58,0.07), transparent 55%), linear-gradient(180deg, #f9f6ec, #f1ebdc)", header: "#0b6b3a", header2: "#bc002d", headerText: "#fffbe8", logo: "#ffdf00", tabOff: "#d9c9a8", tabOn: "#ffdf00", accent: "#bc002d", card: "#fffdf5", mapBg: "#eee7d4", glow: "none", emblem: "絆", chip: "rgba(255,255,255,0.16)", chipBorder: "rgba(255,255,255,0.32)" },
  ryu: { crest: "昇龍", serif: true, stripe: "linear-gradient(90deg,#0f766e,#34d399)", tint: "rgba(16,185,129, 0.045)", line: "rgba(16,185,129, 0.14)", label: "龍", appBg: "radial-gradient(95% 48% at 82% 0%, rgba(16,185,129,0.11), transparent 58%), linear-gradient(180deg, #f0f5f2, #e5ede8)", header: "#0b3d3d", header2: "#062525", headerText: "#d6f5e8", logo: "#10b981", tabOff: "#6ea99a", tabOn: "#34d399", accent: "#0f766e", card: "#f7fbf9", mapBg: "#dce8e2", glow: "0 0 10px rgba(16,185,129,0.55)", emblem: "龍", chip: "rgba(255,255,255,0.12)", chipBorder: "rgba(255,255,255,0.26)" },
  tora: { crest: "猛虎", serif: true, stripe: "repeating-linear-gradient(100deg,#1a1206 0 14px,#f59e0b 14px 28px)", tint: "rgba(217,119,6, 0.045)", line: "rgba(217,119,6, 0.14)", label: "虎", appBg: "radial-gradient(95% 48% at 50% 0%, rgba(245,158,11,0.10), transparent 58%), linear-gradient(180deg, #faf7f0, #f1ebdd)", header: "#1a1206", header2: "#000000", headerText: "#fbbf24", logo: "#f59e0b", tabOff: "#8a7a58", tabOn: "#fbbf24", accent: "#d97706", card: "#fffdf7", mapBg: "#efe8d8", glow: "0 0 10px rgba(251,191,36,0.5)", emblem: "虎", chip: "rgba(251,191,36,0.14)", chipBorder: "rgba(251,191,36,0.35)" },
  byakko: { crest: "白狐", serif: true, stripe: "linear-gradient(90deg,#e5e7eb,#b91c1c)", tint: "rgba(185,28,28, 0.045)", line: "rgba(185,28,28, 0.14)", label: "白狐", appBg: "radial-gradient(85% 42% at 18% 0%, rgba(185,28,28,0.06), transparent 52%), linear-gradient(180deg, #fdfdfe, #eff2f6)", header: "#fdfdfd", header2: "#e5e7eb", headerText: "#b91c1c", logo: "#b91c1c", tabOff: "#9ca3af", tabOn: "#b91c1c", accent: "#b91c1c", card: "#ffffff", mapBg: "#eef1f5", glow: "none", emblem: "狐", chip: "rgba(185,28,28,0.10)", chipBorder: "rgba(185,28,28,0.35)" },
  karasu: { crest: "天狗", serif: true, stripe: "linear-gradient(90deg,#111827,#dc2626)", tint: "rgba(220,38,38, 0.045)", line: "rgba(220,38,38, 0.14)", label: "烏天狗", appBg: "radial-gradient(95% 48% at 50% 0%, rgba(220,38,38,0.06), transparent 55%), linear-gradient(180deg, #f7f7f8, #ebebee)", header: "#111827", header2: "#000000", headerText: "#e5e7eb", logo: "#374151", tabOff: "#6b7280", tabOn: "#dc2626", accent: "#dc2626", card: "#fafafa", mapBg: "#e4e4e7", glow: "none", emblem: "天", chip: "rgba(255,255,255,0.10)", chipBorder: "rgba(255,255,255,0.22)" },
  hyottoko: { crest: "火男", serif: true, stripe: "linear-gradient(90deg,#ea580c,#fde68a)", tint: "rgba(234,88,12, 0.045)", line: "rgba(234,88,12, 0.14)", label: "ひょっとこ", appBg: "radial-gradient(95% 50% at 50% 0%, rgba(234,88,12,0.13), transparent 58%), linear-gradient(180deg, #fff7ed, #f9ecd9)", header: "#d97706", header2: "#b45309", headerText: "#fff7ed", logo: "#fde68a", tabOff: "#f3cf9e", tabOn: "#fff1c4", accent: "#ea580c", card: "#fffdf8", mapBg: "#f6e9d5", glow: "none", emblem: "火", chip: "rgba(255,255,255,0.18)", chipBorder: "rgba(255,255,255,0.34)" },
  otafuku: { crest: "多福", serif: true, stripe: "linear-gradient(90deg,#f9a8d4,#db2777)", tint: "rgba(219,39,119, 0.045)", line: "rgba(219,39,119, 0.14)", label: "おたふく", appBg: "radial-gradient(85% 45% at 18% 0%, rgba(219,39,119,0.09), transparent 52%), radial-gradient(80% 40% at 95% 22%, rgba(249,168,212,0.16), transparent 50%), linear-gradient(180deg, #fdf2f8, #f9e6f0)", header: "#f9a8d4", header2: "#ec4899", headerText: "#500724", logo: "#ffffff", tabOff: "#f5c1dd", tabOn: "#831843", accent: "#db2777", card: "#ffffff", mapBg: "#fce7f3", glow: "none", emblem: "福", chip: "rgba(80,7,36,0.10)", chipBorder: "rgba(80,7,36,0.28)" },
  okina: { crest: "翁", serif: true, stripe: "linear-gradient(90deg,#a8a29e,#57534e)", tint: "rgba(120,113,108, 0.045)", line: "rgba(120,113,108, 0.14)", label: "翁", appBg: "radial-gradient(95% 45% at 50% 0%, rgba(120,113,108,0.07), transparent 55%), linear-gradient(180deg, #fbfaf8, #efedea)", header: "#57534e", header2: "#292524", headerText: "#f5f5f4", logo: "#a8a29e", tabOff: "#a8a29e", tabOn: "#e7e5e4", accent: "#78716c", card: "#ffffff", mapBg: "#e7e5e4", glow: "none", emblem: "翁", chip: "rgba(255,255,255,0.12)", chipBorder: "rgba(255,255,255,0.26)" },
  kabuki: { crest: "隈取", serif: true, stripe: "linear-gradient(90deg,#1a1a1a 0 33.4%,#d0642a 33.4% 66.7%,#2a6b4f 66.7%)", tint: "rgba(185,28,28, 0.045)", line: "rgba(185,28,28, 0.14)", label: "歌舞伎(隈取)", appBg: "radial-gradient(90% 45% at 100% 0%, rgba(185,28,28,0.085), transparent 55%), radial-gradient(75% 38% at 0% 18%, rgba(42,107,79,0.05), transparent 50%), linear-gradient(180deg, #faf8f6, #f1eeea)", header: "#b91c1c", header2: "#111111", headerText: "#ffffff", logo: "#ffffff", tabOff: "#a78b8b", tabOn: "#fecaca", accent: "#b91c1c", card: "#ffffff", mapBg: "#e9e4e0", glow: "0 0 8px rgba(185,28,28,0.5)", emblem: "隈", chip: "rgba(255,255,255,0.16)", chipBorder: "rgba(255,255,255,0.32)" },
  cyber: { crest: "電脳", serif: false, stripe: "linear-gradient(90deg,#d946ef,#22d3ee)", tint: "rgba(217,70,239, 0.045)", line: "rgba(217,70,239, 0.14)", appBgSize: "26px 26px, 26px 26px, auto", label: "サイバーネオン", appBg: "linear-gradient(rgba(34,211,238,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(217,70,239,0.05) 1px, transparent 1px), radial-gradient(110% 60% at 50% 0%, #1c0b38, #0a0a14 70%)", header: "#0f0f23", header2: "#1a0533", headerText: "#22d3ee", logo: "#f0abfc", tabOff: "#7c5bd1", tabOn: "#22d3ee", accent: "#d946ef", card: "#f5f3ff", mapBg: "#17123a", glow: "0 0 16px rgba(217,70,239,0.85)", emblem: "◢", chip: "rgba(34,211,238,0.12)", chipBorder: "rgba(34,211,238,0.35)" },
  denki: { crest: "電工", serif: false, stripe: "repeating-linear-gradient(45deg,#facc15 0 14px,#141414 14px 28px)", tint: "rgba(245,158,11, 0.045)", line: "rgba(245,158,11, 0.14)", label: "電気屋スタイル", appBg: "radial-gradient(95% 48% at 50% 0%, rgba(250,204,21,0.14), transparent 58%), linear-gradient(180deg, #f8f8f6, #edece7)", header: "#141414", header2: "#2b2b2b", headerText: "#facc15", logo: "#facc15", tabOff: "#8a8a8a", tabOn: "#facc15", accent: "#f59e0b", card: "#ffffff", mapBg: "#e7e5e4", glow: "none", emblem: "電", chip: "rgba(250,204,21,0.12)", chipBorder: "rgba(250,204,21,0.35)" },
  shokunin: { crest: "職人", serif: true, stripe: "linear-gradient(90deg,#232a33,#b45309)", tint: "rgba(180,83,9, 0.045)", line: "rgba(180,83,9, 0.14)", label: "THE 職人", appBg: "radial-gradient(95% 48% at 80% 0%, rgba(180,83,9,0.09), transparent 58%), linear-gradient(180deg, #f4efe4, #e9e1d0)", header: "#232a33", header2: "#3a2b1c", headerText: "#e8d8b0", logo: "#b45309", tabOff: "#8d99a8", tabOn: "#e8a33d", accent: "#b45309", card: "#fbf7ef", mapBg: "#ddd5c7", glow: "none", emblem: "匠", chip: "rgba(255,255,255,0.12)", chipBorder: "rgba(255,255,255,0.26)" },
};

/* ---------- 電気工事 作業テンプレート (階層 / 編集可能) ---------- */
const DEFAULT_TEMPLATE_DATA = [
  { name: "壁の墨出し" },
  { name: "天井の墨出し" },
  { name: "建て込み", children: [{ name: "ボックス取り付け" }, { name: "配管取り付け" }] },
  { name: "貫通配管" },
  { name: "配管", children: [{ name: "ダクター取り付け" }, { name: "ボックス取り付け" }, { name: "ボンドアース" }] },
  { name: "区画処理" },
  { name: "レースウェイ取り付け", children: [{ name: "全ネジ取り付け" }, { name: "ダクター取り付け" }, { name: "アース取り付け" }] },
  { name: "ラック取り付け", children: [{ name: "全ネジ取り付け" }, { name: "ダクター取り付け" }, { name: "ラック敷設" }] },
  {
    name: "配線",
    children: [
      { name: "配線ルート取り付け" },
      { name: "強電配線", children: [{ name: "電灯配線" }, { name: "非常照明配線" }, { name: "コンセント配線" }, { name: "動力配線" }, { name: "幹線引き" }] },
      { name: "弱電配線", children: [{ name: "自火報配線" }, { name: "SP配線" }, { name: "弱電配線" }] },
    ],
  },
];

/* ---------- ユーティリティ ---------- */
let _seq = 100;
const uid = (p) => `${p}${++_seq}`;
const todayStr = () => new Date().toISOString().slice(0, 10);
function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}
function centroid(poly) {
  let x = 0, y = 0;
  poly.forEach((p) => { x += p.x; y += p.y; });
  return { x: x / poly.length, y: y / poly.length };
}
const polyPath = (poly) => poly.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + " Z";

/* ---------- テンプレートツリー操作 ---------- */
function withTplIds(nodes) {
  return nodes.map((n) => ({ id: uid("p"), name: n.name, children: n.children ? withTplIds(n.children) : [] }));
}
function tplUpdate(nodes, id, fn) {
  return nodes.map((n) => (n.id === id ? fn(n) : { ...n, children: tplUpdate(n.children || [], id, fn) }));
}
function tplRemove(nodes, id) {
  return nodes.filter((n) => n.id !== id).map((n) => ({ ...n, children: tplRemove(n.children || [], id) }));
}

function newTask(zoneId, parentTaskId, name) {
  return {
    id: uid("t"), zoneId, parentTaskId, name,
    priority: null, status: "todo", issueText: "", issuePhotos: [],
    assigneeIds: [], teamIds: [], startDate: null, dueDate: null, memo: "", memoVisibleToWorkers: false,
    percent: null, replies: [], linkUrl: "", romaji: "",
    history: [],
  };
}
function instantiateTasks(templateNodes, zoneId, parentTaskId = null) {
  const out = [];
  for (const node of templateNodes) {
    const t = newTask(zoneId, parentTaskId, node.name);
    out.push(t);
    if (node.children && node.children.length) out.push(...instantiateTasks(node.children, zoneId, t.id));
  }
  return out;
}

/* ---------- 画像リサイズ (写真添付用) ---------- */
function fileToResizedDataUrl(file, maxW = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.naturalWidth);
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = r.result;
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* ---------- pdf.js 動的ロード ---------- */
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = () => rej(new Error("script load failed"));
    document.head.appendChild(s);
  });
}
async function ensurePdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  return window.pdfjsLib;
}
async function pdfToFloorImages(file, onProgress) {
  const pdfjs = await ensurePdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const pages = Math.min(pdf.numPages, 12);
  const results = [];
  for (let i = 1; i <= pages; i++) {
    onProgress && onProgress(i, pages);
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = vp.width; canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
    results.push({ image: canvas.toDataURL("image/jpeg", 0.85), w: Math.round(vp.width), h: Math.round(vp.height) });
  }
  return { results, total: pdf.numPages };
}

/* ---------- サンプル図面 ---------- */
function makeSampleFloorImage(label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="850" viewBox="0 0 1200 850">
  <rect width="1200" height="850" fill="#fdfdfb"/>
  <g stroke="#334155" stroke-width="4" fill="none">
    <rect x="60" y="60" width="1080" height="730"/>
    <line x1="60" y1="420" x2="700" y2="420"/><line x1="700" y1="60" x2="700" y2="790"/>
    <line x1="380" y1="420" x2="380" y2="790"/><line x1="700" y1="300" x2="1140" y2="300"/>
    <line x1="920" y1="300" x2="920" y2="790"/>
  </g>
  <g stroke="#94a3b8" stroke-width="2" fill="none">
    <rect x="100" y="100" width="160" height="90"/><rect x="480" y="480" width="120" height="120"/>
    <rect x="960" y="360" width="120" height="80"/>
    <line x1="60" y1="230" x2="1140" y2="230" stroke-dasharray="14 10"/>
    <line x1="230" y1="60" x2="230" y2="790" stroke-dasharray="14 10"/>
  </g>
  <g fill="#64748b" font-family="sans-serif" font-size="30">
    <text x="90" y="380">電気室</text><text x="430" y="380">共用廊下</text>
    <text x="90" y="740">事務室A</text><text x="430" y="740">事務室B</text>
    <text x="760" y="200">機械室</text><text x="760" y="700">倉庫</text><text x="960" y="700">EPS</text>
  </g>
  <text x="600" y="45" fill="#94a3b8" font-family="sans-serif" font-size="26" text-anchor="middle">${label} (サンプル図面)</text>
</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/* ---------- 初期データ ---------- */
function buildInitialData() {
  const site1 = { id: uid("s"), name: "◯◯ビル新築工事", driveUrl: "" };
  const f1 = { id: uid("f"), siteId: site1.id, name: "1F", image: makeSampleFloorImage("1F 平面図"), w: 1200, h: 850 };
  const f2 = { id: uid("f"), siteId: site1.id, name: "2F", image: makeSampleFloorImage("2F 平面図"), w: 1200, h: 850 };

  const z1 = { id: uid("z"), floorId: f1.id, parentZoneId: null, name: "1工区", polygon: [{ x: 60, y: 60 }, { x: 700, y: 60 }, { x: 700, y: 420 }, { x: 60, y: 420 }], priority: 1 };
  const z11 = { id: uid("z"), floorId: f1.id, parentZoneId: z1.id, name: "1-1", polygon: [{ x: 60, y: 60 }, { x: 380, y: 60 }, { x: 380, y: 420 }, { x: 60, y: 420 }], priority: 1 };
  const z12 = { id: uid("z"), floorId: f1.id, parentZoneId: z1.id, name: "1-2", polygon: [{ x: 380, y: 60 }, { x: 700, y: 60 }, { x: 700, y: 420 }, { x: 380, y: 420 }], priority: 3 };
  const z2 = { id: uid("z"), floorId: f1.id, parentZoneId: null, name: "2工区", polygon: [{ x: 60, y: 420 }, { x: 700, y: 420 }, { x: 700, y: 790 }, { x: 60, y: 790 }], priority: 2 };
  const z3 = { id: uid("z"), floorId: f1.id, parentZoneId: null, name: "3工区", polygon: [{ x: 700, y: 60 }, { x: 1140, y: 60 }, { x: 1140, y: 790 }, { x: 700, y: 790 }], priority: 4 };

  const workers = [
    { id: uid("w"), name: "山田", color: "#334155", role: "admin", kind: "employee" },
    { id: uid("w"), name: "田中", color: "#005AFF", role: "leader", kind: "employee" },
    { id: uid("w"), name: "佐藤", color: "#03AF7A", role: "worker", kind: "employee" },
    { id: uid("w"), name: "鈴木", color: "#F6AA00", role: "worker", kind: "employee" },
    { id: uid("w"), name: "高橋", color: "#990099", role: "worker", kind: "guest" },
  ];
  const teams = [
    { id: uid("g"), name: "1班", color: "#005AFF", memberIds: [workers[1].id, workers[2].id] },
    { id: uid("g"), name: "2班", color: "#03AF7A", memberIds: [workers[3].id, workers[4].id] },
  ];

  let tasks = [];
  const template = withTplIds(DEFAULT_TEMPLATE_DATA);
  for (const z of [z11, z12, z2, z3]) tasks.push(...instantiateTasks(template, z.id));

  const parentIds = new Set(tasks.map((t) => t.parentTaskId).filter(Boolean));
  const leafOf = (zoneId) => tasks.filter((t) => t.zoneId === zoneId && !parentIds.has(t.id));

  leafOf(z11.id).slice(0, 6).forEach((t) => (t.status = "done"));
  leafOf(z11.id).slice(6, 9).forEach((t, i) => { t.status = "progress"; t.percent = [75, 50, 25][i]; });
  const issueTask = leafOf(z12.id)[3];
  if (issueTask) { issueTask.status = "issue"; issueTask.issueText = "スリーブ位置が図面と相違。監督に確認中。"; }
  leafOf(z2.id).slice(0, 3).forEach((t) => (t.status = "progress"));
  leafOf(z11.id)[6].assigneeIds = [workers[1].id];
  leafOf(z11.id)[7].assigneeIds = [workers[2].id];
  leafOf(z2.id)[0].assigneeIds = [workers[3].id, workers[4].id];
  leafOf(z2.id)[1].assigneeIds = [workers[0].id];
  leafOf(z2.id)[0].dueDate = todayStr();
  const memoT = leafOf(z11.id)[6];
  memoT.memo = "配管ルートは天井裏の梁貫通NG。迂回ルートで施工のこと。";
  memoT.memoVisibleToWorkers = true;
  memoT.linkUrl = "https://drive.google.com/drive/folders/sample";
  leafOf(z12.id)[0].teamIds = [teams[0].id];
  leafOf(z3.id)[0].teamIds = [teams[1].id];

  const materialPresets = [
    { id: uid("mp"), workName: "うちの定番セット", parts: ["未来 スライドボックス SB(1個用)", "VVF1.6-2C(100m巻)", "ビニールテープ 黒(10巻入)"] },
  ];
  const materialRequests = [
    {
      id: uid("m"), byId: workers[1].id, byName: workers[1].name,
      at: new Date().toISOString(), status: "pending", orderedAt: null, deliveredAt: null,
      items: [{ name: "未来 スライドボックス SB(1個用)", qty: 30, unit: "個" }, { name: "未来 PF管 MFP-16(50m巻)", qty: 2, unit: "巻" }],
      note: "1-1エリアの建て込み分です",
    },
    {
      id: uid("m"), byId: workers[2].id, byName: workers[2].name,
      at: new Date(Date.now() - 86400000).toISOString(), status: "ordered",
      orderedAt: new Date(Date.now() - 43200000).toISOString(), deliveredAt: null,
      items: [{ name: "ビニールテープ 黒(10巻入)", qty: 2, unit: "箱" }, { name: "AE線 0.9-2C(200m巻)", qty: 1, unit: "巻" }],
      note: "",
    },
  ];

  const instructions = [
    {
      id: uid("i"),
      text: "本日中に1-1エリアの建て込みを完了させてください。資材は2Fの倉庫前に搬入済みです。",
      targetType: "team", targetId: teams[0].id, zoneId: z11.id,
      createdAt: new Date().toISOString(), readBy: [workers[1].id],
    },
  ];

  const shares = [
    { id: uid("sh"), name: "施主様向け", scopes: { map: true, tasks: false, board: false, dash: true } },
  ];

  const now = Date.now();
  const logs = [
    { t: "material", at: now - 500000, by: "田中", name: "アイボルト M10", qty: 20, unit: "個", freeInput: true },
    { t: "material", at: now - 400000, by: "佐藤", name: "アイボルト M10", qty: 15, unit: "個", freeInput: true },
    { t: "material", at: now - 300000, by: "鈴木", name: "未来 PF管 MFP-16(50m巻)", qty: 5, unit: "巻", freeInput: false },
    { t: "material", at: now - 200000, by: "田中", name: "ビニールテープ 黒(10巻入)", qty: 3, unit: "箱", freeInput: false },
    { t: "status", at: now - 150000, by: "田中", taskName: "壁の墨出し", status: "done" },
    { t: "status", at: now - 140000, by: "佐藤", taskName: "配管取り付け", status: "done" },
    { t: "issue", at: now - 100000, by: "鈴木", taskName: "ボックス取り付け", zoneId: z12.id },
  ];

  const budgets = {
    [site1.id]: {
      enabled: true, attendanceSheet: "manual",
      contractAmount: 12000000, targetType: "percent", targetValue: 15,
      costPerManDay: 25000, monthlyExpense: 300000,
      periodStart: "2026-06-01", periodEnd: "2026-12-31",
      preManDays: 42,
      attendance: [
        { id: uid("a"), date: "2026-07-01", manDays: 6 },
        { id: uid("a"), date: "2026-07-02", manDays: 5.5 },
        { id: uid("a"), date: "2026-07-03", manDays: 6 },
      ],
    },
  };

  return { sites: [site1], floors: [f1, f2], zones: [z1, z11, z12, z2, z3], tasks, workers, teams, instructions, template, shares, materialPresets, materialRequests, logs, budgets };
}

/* ---------- バックアップの取込 (正規化 + ID連番調整) ---------- */
function normalizeImported(d) {
  if (!d || !Array.isArray(d.sites) || !Array.isArray(d.floors) || !Array.isArray(d.zones) || !Array.isArray(d.tasks) || !Array.isArray(d.workers)) {
    throw new Error("invalid");
  }
  const tasks = d.tasks.map((t) => ({
    issuePhotos: [], teamIds: [], history: [], replies: [], linkUrl: "", romaji: "",
    startDate: null, dueDate: null, percent: null, memo: "", memoVisibleToWorkers: false,
    priority: null, issueText: "", assigneeIds: [],
    ...t,
  }));
  const st = {
    sites: d.sites.map((st) => ({ driveUrl: "", ...st })), floors: d.floors, zones: d.zones, tasks,
    workers: d.workers.map((w) => ({
      kind: "employee",
      ...w,
      role: w.role || (w.isAdmin ? "admin" : "worker"),
    })),
    teams: d.teams || [], instructions: d.instructions || [],
    template: d.template || withTplIds(DEFAULT_TEMPLATE_DATA),
    shares: d.shares || [],
    materialPresets: d.materialPresets || [],
    logs: Array.isArray(d.logs) ? d.logs.slice(-1000) : [],
    budgets: Object.fromEntries(
      Object.entries(d.budgets || {}).map(([k, v]) => [
        k,
        { enabled: v.enabled !== undefined ? v.enabled : (v.contractAmount || 0) > 0, attendanceSheet: "manual", ...v },
      ])
    ),
    materialRequests: (d.materialRequests || []).map((r) => ({
      orderedAt: null, deliveredAt: null, note: "",
      ...r,
      items: (r.items || []).map((it) => ({ unit: "個", ...it })),
    })),
  };
  // ID連番をインポートデータの最大値まで進めて衝突を防ぐ
  let max = _seq;
  const scan = (id) => {
    const n = parseInt(String(id).replace(/^\D+/, ""), 10);
    if (!isNaN(n) && n > max) max = n;
  };
  [...st.sites, ...st.floors, ...st.zones, ...st.tasks, ...st.workers, ...st.teams, ...st.instructions, ...st.shares].forEach((o) => o && scan(o.id));
  (function walk(ns) { ns.forEach((n) => { scan(n.id); walk(n.children || []); }); })(st.template);
  _seq = max;
  return st;
}

/* ---------- 進捗集計 ---------- */
function leafProgress(task) {
  if (task.status === "done") return 100;
  if (task.status === "progress") return task.percent != null ? task.percent : 50;
  if (task.status === "issue") return task.percent != null ? task.percent : 0;
  return 0;
}
function computeTaskProgress(task, tasksByParent) {
  const children = tasksByParent.get(task.id) || [];
  if (children.length === 0) return leafProgress(task);
  const sum = children.reduce((a, c) => a + computeTaskProgress(c, tasksByParent), 0);
  return sum / children.length;
}
function useDerived(state) {
  return useMemo(() => {
    const tasksByParent = new Map();
    const tasksByZone = new Map();
    for (const t of state.tasks) {
      if (t.parentTaskId) {
        if (!tasksByParent.has(t.parentTaskId)) tasksByParent.set(t.parentTaskId, []);
        tasksByParent.get(t.parentTaskId).push(t);
      }
      if (!tasksByZone.has(t.zoneId)) tasksByZone.set(t.zoneId, []);
      tasksByZone.get(t.zoneId).push(t);
    }
    const childZones = new Map();
    for (const z of state.zones) {
      if (z.parentZoneId) {
        if (!childZones.has(z.parentZoneId)) childZones.set(z.parentZoneId, []);
        childZones.get(z.parentZoneId).push(z);
      }
    }
    const zoneProgressCache = new Map();
    const zoneIssueCache = new Map();
    function zoneProgress(zoneId) {
      if (zoneProgressCache.has(zoneId)) return zoneProgressCache.get(zoneId);
      const own = (tasksByZone.get(zoneId) || []).filter((t) => !t.parentTaskId);
      const kids = childZones.get(zoneId) || [];
      const parts = [];
      for (const t of own) parts.push(computeTaskProgress(t, tasksByParent));
      for (const k of kids) parts.push(zoneProgress(k.id));
      const val = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;
      zoneProgressCache.set(zoneId, val);
      return val;
    }
    function zoneIssues(zoneId) {
      if (zoneIssueCache.has(zoneId)) return zoneIssueCache.get(zoneId);
      let n = (tasksByZone.get(zoneId) || []).filter((t) => t.status === "issue").length;
      for (const k of childZones.get(zoneId) || []) n += zoneIssues(k.id);
      zoneIssueCache.set(zoneId, n);
      return n;
    }
    state.zones.forEach((z) => { zoneProgress(z.id); zoneIssues(z.id); });
    const isLeaf = (t) => !(tasksByParent.get(t.id) || []).length;
    return { tasksByParent, tasksByZone, childZones, zoneProgress: zoneProgressCache, zoneIssues: zoneIssueCache, isLeaf };
  }, [state]);
}

/* タスクの実効優先度: 自身 > 親タスク > エリア > 親エリア */
function effectivePriority(task, state) {
  if (task.priority) return task.priority;
  let p = task.parentTaskId ? state.tasks.find((t) => t.id === task.parentTaskId) : null;
  while (p) {
    if (p.priority) return p.priority;
    p = p.parentTaskId ? state.tasks.find((t) => t.id === p.parentTaskId) : null;
  }
  let z = state.zones.find((zz) => zz.id === task.zoneId);
  while (z) {
    if (z.priority) return z.priority;
    z = z.parentZoneId ? state.zones.find((zz) => zz.id === z.parentZoneId) : null;
  }
  return null;
}

/* ============================================================
   メインアプリ
   ============================================================ */
export default function GenbaApp() {
  const [state, setState] = useState(buildInitialData);
  const [currentUser, setCurrentUser] = useState(null); // {type:'admin'} | {type:'worker', id}
  const [tab, setTab] = useState("map");
  const [siteId, setSiteId] = useState(() => state.sites[0].id);
  const [floorId, setFloorId] = useState(() => state.floors[0].id);
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [mode, setMode] = useState("view"); // view | draw | edit
  const [draftPoly, setDraftPoly] = useState([]);
  const [draftParentZoneId, setDraftParentZoneId] = useState(null);
  const [editZoneId, setEditZoneId] = useState(null);
  const [editPoly, setEditPoly] = useState([]);
  const [selVtx, setSelVtx] = useState(null);
  const dragIdx = useRef(null);
  const [toast, setToast] = useState(null);
  const [statusTask, setStatusTask] = useState(null);
  const [detailTask, setDetailTask] = useState(null);
  const [photoView, setPhotoView] = useState(null);
  const [busy, setBusy] = useState(null);
  const [dialog, setDialog] = useState(null);
  const dlgSeq = useRef(0);
  const [lang, setLang] = useState("jp");
  const [theme, setTheme] = useState("standard");
  const [customTheme, setCustomTheme] = useState({ accent: "#005AFF", header: "#1B2A41" });
  const [guideOpen, setGuideOpen] = useState(false);
  const [showGuideBtn, setShowGuideBtn] = useState(true);
  const toastTimer = useRef(null);
  const derived = useDerived(state);

  /* 言語・テーマをレンダー時に適用 (CUD色は不変) */
  LANG = lang;
  const themeObj = theme === "custom"
    ? { ...THEMES.standard, label: "カスタム", header: customTheme.header, header2: customTheme.header, accent: customTheme.accent }
    : THEMES[theme] || THEMES.standard;
  sx = makeSx(themeObj);

  /* ---------- アプリ内ダイアログ (sandbox環境でwindow.prompt/confirmが使えないため) ---------- */
  const uiPrompt = useCallback((title, defaultValue = "", placeholder = "") =>
    new Promise((resolve) => { dlgSeq.current++; setDialog({ key: dlgSeq.current, mode: "prompt", title, value: defaultValue, placeholder, resolve }); }), []);
  const uiConfirm = useCallback((title, okLabel = "OK", danger = false) =>
    new Promise((resolve) => { dlgSeq.current++; setDialog({ key: dlgSeq.current, mode: "confirm", title, okLabel, danger, resolve }); }), []);
  const ui = { prompt: uiPrompt, confirm: uiConfirm };

  const viewerShare = currentUser && currentUser.type === "viewer"
    ? state.shares.find((s) => s.id === currentUser.shareId) || null
    : null;
  const isViewer = !!viewerShare;
  const me = currentUser && !isViewer ? state.workers.find((w) => w.id === currentUser.id) : null;
  const myRole = me ? me.role || "worker" : null;
  const isAdmin = myRole === "admin";
  const isLeader = myRole === "leader";
  const canField = isAdmin || isLeader; // 現場運用の編集権限(エリア・配置・指示など)
  const myWorkerId = me ? me.id : null;
  const viewerTabs = viewerShare
    ? [["map", "図面", "map"], ["tasks", "作業", "tasks"], ["board", "配置", "users"], ["dash", "全体", "chart"]].filter(([k]) => viewerShare.scopes[k])
    : null;
  const goTab = (k) => {
    if (viewerShare && !viewerShare.scopes[k]) { return; }
    setTab(k);
  };
  const myTeamIds = useMemo(
    () => new Set(state.teams.filter((g) => myWorkerId && g.memberIds.includes(myWorkerId)).map((g) => g.id)),
    [state.teams, myWorkerId]
  );

  /* ---------- 指示 ---------- */
  const targetedToMe = useCallback(
    (i) =>
      !!myWorkerId &&
      (i.targetType === "all" ||
        (i.targetType === "worker" && i.targetId === myWorkerId) ||
        (i.targetType === "team" && myTeamIds.has(i.targetId))),
    [myWorkerId, myTeamIds]
  );
  const myInstructions = useMemo(() => {
    if (isAdmin) return state.instructions;
    return state.instructions.filter(targetedToMe);
  }, [state.instructions, isAdmin, targetedToMe]);
  const unreadCount = state.instructions.filter((i) => targetedToMe(i) && !i.readBy.includes(myWorkerId)).length;
  function addInstruction(text, targetType, targetId, zoneId) {
    const inst = {
      id: uid("i"), text, targetType, targetId, zoneId: zoneId || null,
      createdAt: new Date().toISOString(),
      readBy: myWorkerId ? [myWorkerId] : [],
    };
    setState((s) => ({ ...s, instructions: [inst, ...s.instructions] }));
  }
  function markInstructionRead(instId) {
    if (!myWorkerId) return;
    setState((s) => ({
      ...s,
      instructions: s.instructions.map((i) =>
        i.id === instId && !i.readBy.includes(myWorkerId) ? { ...i, readBy: [...i.readBy, myWorkerId] } : i
      ),
    }));
  }

  /* ---------- 材料発注 ---------- */
  const pendingMatCount = state.materialRequests.filter((r) => r.status === "pending").length;
  function addMaterialRequest(items, note) {
    const catalogSet = new Set(MASTER_FLAT.map((m) => m.label));
    const presetSet = new Set(state.materialPresets.flatMap((p) => p.parts));
    setState((s) => ({
      ...s,
      materialRequests: [
        { id: uid("m"), items, note: note || "", byId: myWorkerId, byName: actorName, at: new Date().toISOString(), status: "pending", orderedAt: null, deliveredAt: null },
        ...s.materialRequests,
      ],
    }));
    items.forEach((it) => logEvent("material", {
      name: it.name, qty: it.qty, unit: it.unit,
      freeInput: !catalogSet.has(it.name) && !presetSet.has(it.name),
    }));
    showToast("材料の発注依頼を送信しました 📦");
  }
  function setRequestStatus(id, status) {
    const now = new Date().toISOString();
    setState((s) => ({
      ...s,
      materialRequests: s.materialRequests.map((r) =>
        r.id === id
          ? {
              ...r, status,
              orderedAt: status === "ordered" ? now : r.orderedAt || null,
              deliveredAt: status === "delivered" ? now : r.deliveredAt || null,
            }
          : r
      ),
    }));
  }
  function cancelRequest(id) {
    setState((s) => ({ ...s, materialRequests: s.materialRequests.filter((r) => r.id !== id) }));
    showToast("依頼を取り消しました");
  }

  const site = state.sites.find((s) => s.id === siteId) || state.sites[0];
  const siteFloors = state.floors.filter((f) => f.siteId === site.id);
  const floor = siteFloors.find((f) => f.id === floorId) || siteFloors[0] || null;
  const floorZones = floor ? state.zones.filter((z) => z.floorId === floor.id) : [];
  const selectedZone = state.zones.find((z) => z.id === selectedZoneId) || null;

  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  }, []);

  /* ---------- 権限 ---------- */
  const canEditTask = useCallback(
    (task) => {
      if (isViewer) return false;
      if (isAdmin || isLeader) return true;
      if (!myWorkerId) return false;
      const teamIds = task.teamIds || [];
      const unassigned = task.assigneeIds.length === 0 && teamIds.length === 0;
      return unassigned || task.assigneeIds.includes(myWorkerId) || teamIds.some((id) => myTeamIds.has(id));
    },
    [isViewer, isAdmin, isLeader, myWorkerId, myTeamIds]
  );

  /* ---------- 利用ログ (改良提案の学習用 / 直近1000件で自動ローテーション) ---------- */
  const logEvent = useCallback((type, data) => {
    setState((s) => {
      const entry = { t: type, at: Date.now(), by: (s.workers.find((w) => w.id === (currentUser && currentUser.id)) || {}).name || "?", ...data };
      const logs = [...(s.logs || []), entry];
      return { ...s, logs: logs.length > 1000 ? logs.slice(-1000) : logs };
    });
  }, [currentUser]);

  /* ---------- 更新ヘルパ ---------- */
  const updateTask = (taskId, patch) =>
    setState((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)) }));
  const updateZone = (zoneId, patch) =>
    setState((s) => ({ ...s, zones: s.zones.map((z) => (z.id === zoneId ? { ...z, ...patch } : z)) }));
  function deleteZone(zoneId) {
    const collect = (id) => [id, ...state.zones.filter((z) => z.parentZoneId === id).flatMap((z) => collect(z.id))];
    const ids = new Set(collect(zoneId));
    setState((s) => ({ ...s, zones: s.zones.filter((z) => !ids.has(z.id)), tasks: s.tasks.filter((t) => !ids.has(t.zoneId)) }));
    setSelectedZoneId(null);
  }
  function deleteTask(taskId) {
    const collect = (id) => [id, ...state.tasks.filter((t) => t.parentTaskId === id).flatMap((t) => collect(t.id))];
    const ids = new Set(collect(taskId));
    setState((s) => ({ ...s, tasks: s.tasks.filter((t) => !ids.has(t.id)) }));
    setDetailTask(null);
    showToast("作業を削除しました");
  }
  function addSubTask(parentTask, name) {
    const t = newTask(parentTask.zoneId, parentTask.id, name);
    setState((s) => ({ ...s, tasks: [...s.tasks, t] }));
    showToast(`「${name}」を追加しました`);
  }
  function addRootTask(zoneId, name) {
    const t = newTask(zoneId, null, name);
    setState((s) => ({ ...s, tasks: [...s.tasks, t] }));
    showToast(`「${name}」を追加しました`);
  }

  /* ---------- 図面アップロード (画像 + PDF) ---------- */
  const fileRef = useRef(null);
  async function onFileChosen(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file || !floorTargetSite()) return;
    if (file.type === "application/pdf") {
      try {
        setBusy("PDFを読み込み中…");
        const base = file.name.replace(/\.pdf$/i, "");
        const { results, total } = await pdfToFloorImages(file, (i, n) => setBusy(`PDF変換中 ${i}/${n}ページ`));
        const newFloors = results.map((r, i) => ({
          id: uid("f"), siteId: site.id,
          name: results.length > 1 ? `${base} P${i + 1}` : base,
          image: r.image, w: r.w, h: r.h,
        }));
        setState((s) => ({ ...s, floors: [...s.floors, ...newFloors] }));
        setFloorId(newFloors[0].id);
        showToast(total > results.length
          ? `${results.length}ページを取り込みました(${total}ページ中、上限12)`
          : `PDFから${results.length}フロアを取り込みました`);
      } catch (err) {
        showToast("PDFの読み込みに失敗しました。画像(PNG/JPG)でもアップロードできます。");
      } finally {
        setBusy(null);
      }
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const nf = { id: uid("f"), siteId: site.id, name: `フロア${siteFloors.length + 1}`, image: reader.result, w: img.naturalWidth, h: img.naturalHeight };
        setState((s) => ({ ...s, floors: [...s.floors, nf] }));
        setFloorId(nf.id);
        showToast("図面を追加しました");
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
  function floorTargetSite() { return site; }

  /* ---------- 現場管理 ---------- */
  async function addSite() {
    const name = await uiPrompt("新しい現場名を入力", "", "例: ◯◯マンション改修工事");
    if (!name || !name.trim()) return;
    const ns = { id: uid("s"), name: name.trim(), driveUrl: "" };
    setState((s) => ({ ...s, sites: [...s.sites, ns] }));
    setSiteId(ns.id);
    setSelectedZoneId(null);
    showToast(`現場「${name}」を追加しました。図面をアップロードしてください。`);
  }
  function switchSite(id) {
    setSiteId(id);
    const first = state.floors.find((f) => f.siteId === id);
    setFloorId(first ? first.id : null);
    setSelectedZoneId(null);
  }

  /* ---------- エリア描画 ---------- */
  const svgRef = useRef(null);
  function svgPoint(evt) {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    const touch = evt.touches && evt.touches[0];
    pt.x = touch ? touch.clientX : evt.clientX;
    pt.y = touch ? touch.clientY : evt.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }
  function onSvgClick(evt) {
    if (mode !== "draw") return;
    const p = svgPoint(evt);
    if (p) setDraftPoly((d) => [...d, p]);
  }
  async function confirmDraft() {
    if (draftPoly.length < 3) { showToast("頂点を3点以上タップしてください"); return; }
    const parent = draftParentZoneId ? state.zones.find((z) => z.id === draftParentZoneId) : null;
    const siblings = state.zones.filter((z) => z.floorId === floor.id && z.parentZoneId === (parent ? parent.id : null));
    const defaultName = parent ? `${parent.name}-${siblings.length + 1}` : `${floorZones.filter((z) => !z.parentZoneId).length + 1}工区`;
    const input = await uiPrompt("エリア名を入力", defaultName);
    if (input === null) return;
    const name = input.trim() || defaultName;
    const nz = { id: uid("z"), floorId: floor.id, parentZoneId: parent ? parent.id : null, name, polygon: draftPoly, priority: null };
    const newTasks = instantiateTasks(state.template, nz.id);
    setState((s) => ({ ...s, zones: [...s.zones, nz], tasks: [...s.tasks, ...newTasks] }));
    setDraftPoly([]); setMode("view"); setDraftParentZoneId(null);
    setSelectedZoneId(nz.id);
    showToast(`「${name}」を作成しました(作業テンプレート適用済み)`);
  }
  function cancelDraft() { setDraftPoly([]); setMode("view"); setDraftParentZoneId(null); }

  function setSiteDriveUrl(url) {
    setState((s) => ({ ...s, sites: s.sites.map((x) => (x.id === site.id ? { ...x, driveUrl: url } : x)) }));
    showToast(url ? "図面リンクを設定しました 📐" : "図面リンクを削除しました");
  }

  /* ---------- エリア範囲の後編集 ---------- */
  function startEditZone(zone) {
    setMode("edit");
    setEditZoneId(zone.id);
    setEditPoly(zone.polygon.map((p) => ({ ...p })));
    setSelVtx(null);
    setSelectedZoneId(null);
    showToast("頂点をドラッグで移動、＋タップで頂点追加できます");
  }
  function saveEditZone() {
    if (editPoly.length >= 3 && editZoneId) updateZone(editZoneId, { polygon: editPoly });
    setMode("view"); setEditZoneId(null); setEditPoly([]); setSelVtx(null);
    showToast("エリアの範囲を更新しました");
  }
  function cancelEditZone() {
    setMode("view"); setEditZoneId(null); setEditPoly([]); setSelVtx(null);
  }
  function deleteSelVtx() {
    if (selVtx === null) { showToast("削除する頂点をタップで選択してください"); return; }
    if (editPoly.length <= 3) { showToast("頂点は3点未満にできません"); return; }
    setEditPoly((p) => p.filter((_, i) => i !== selVtx));
    setSelVtx(null);
  }
  function insertMidpoint(i) {
    setEditPoly((p) => {
      const a = p[i], b = p[(i + 1) % p.length];
      const m = { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) };
      const np = [...p];
      np.splice(i + 1, 0, m);
      return np;
    });
    setSelVtx(i + 1);
  }
  function startDragVtx(i, evt) {
    evt.stopPropagation();
    dragIdx.current = i;
    setSelVtx(i);
  }
  function onSvgPointerMove(evt) {
    if (mode !== "edit" || dragIdx.current === null) return;
    if (evt.cancelable) evt.preventDefault();
    const p = svgPoint(evt);
    if (p) setEditPoly((prev) => prev.map((pt, i) => (i === dragIdx.current ? p : pt)));
  }
  function onSvgPointerUp() { dragIdx.current = null; }

  /* ---------- taskApi (子コンポーネントへ渡す束) ---------- */
  const actorName = me ? me.name : "?";

  function handoverTask(task, toWorkerId, note) {
    const to = state.workers.find((w) => w.id === toWorkerId);
    if (!to) return;
    const now = new Date().toISOString();
    const entry = { at: now, by: actorName, text: `${to.name}さんへ引き継ぎ${note ? " — " + note : ""}` };
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => {
        if (t.id !== task.id) return t;
        const nextAssignees = Array.from(new Set([...t.assigneeIds.filter((id) => id !== myWorkerId), toWorkerId]));
        return { ...t, assigneeIds: nextAssignees, history: [...(t.history || []), entry] };
      }),
      instructions: [
        {
          id: uid("i"),
          text: `🤝 引き継ぎ: 「${task.name}」を${actorName}さんから引き継ぎました。${note ? "\n申し送り: " + note : ""}`,
          targetType: "worker", targetId: toWorkerId,
          zoneId: task.zoneId, createdAt: now, readBy: [],
        },
        ...s.instructions,
      ],
    }));
    showToast(`${to.name}さんへ引き継ぎました(📣通知済み)`);
  }

  const taskApi = {
    state, derived, isAdmin, isLeader, canField, myRole, myWorkerId, myTeamIds, canEditTask, actorName, handoverTask, targetedToMe, isViewer, ui, logEvent,
    updateTask, deleteTask, addSubTask, addRootTask,
    openStatus: (t) => {
      if (isViewer) { showToast("共有ビューは閲覧専用です 🔒"); return; }
      if (!canEditTask(t)) { showToast("この作業は担当者と管理者のみ更新できます 🔒"); return; }
      setStatusTask(t);
    },
    openDetail: (t) => setDetailTask(t),
    setPhotoView,
    showToast,
  };

  /* ---------- ログイン画面 ---------- */
  if (!me && !viewerShare) {
    const order = { admin: 0, leader: 1, worker: 2 };
    const sorted = [...state.workers].sort((a, b) => (order[a.role] ?? 2) - (order[b.role] ?? 2));
    const firstScope = (sh) => ["map", "tasks", "board", "dash"].find((k) => sh.scopes[k]) || "dash";
    return (
      <div style={sx.app}>
        <style>{globalCss}</style>
        <div style={sx.loginWrap}>
          <div style={sx.loginCard}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ ...sx.logoTile, width: 46, height: 46, borderRadius: 14 }}><SvgIcon k="bolt" size={26} /></span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 20, fontWeight: 800 }}>現場ビジョン</div>
                <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: "0.1em" }}>電気工事 進捗管理 β</div>
              </div>
              <button style={{ ...sx.iconHeaderBtn, background: "#f1f5f9", border: "1.5px solid #cbd5e1" }}
                onClick={() => setLang(lang === "jp" ? "pt" : "jp")}>
                {lang === "jp" ? "🇯🇵" : "🇧🇷"}
              </button>
            </div>
            <div style={{ fontSize: 13, color: "#475569", margin: "10px 0 14px" }}>
              {tr("あなたを選択してください。🛠は管理者権限を持つメンバーです(管理者も一作業員として作業を担当できます)。")}
            </div>
            {sorted.map((w) => {
              const r = ROLES[w.role] || ROLES.worker;
              return (
                <button key={w.id} style={sx.loginBtn} onClick={() => setCurrentUser({ id: w.id })}>
                  <span style={{ ...sx.workerDot, background: w.color }} />
                  {w.name}
                  {w.kind === "guest" && <span style={{ fontSize: 10, color: "#94a3b8" }}>({tr("ゲスト")})</span>}
                  <span style={{ marginLeft: "auto", fontSize: 13 }}>{r.icon} {tr(r.label)}</span>
                </button>
              );
            })}
            {state.shares.length > 0 && (
              <>
                <div style={{ fontSize: 12, color: "#64748b", margin: "14px 0 6px" }}>{tr("🔗 共有ビュー(外部の方向け・閲覧専用)")}</div>
                {state.shares.map((sh) => (
                  <button key={sh.id} style={{ ...sx.loginBtn, borderStyle: "dashed" }}
                    onClick={() => { setCurrentUser({ type: "viewer", shareId: sh.id }); setTab(firstScope(sh)); }}>
                    🔗 {sh.name}
                  </button>
                ))}
              </>
            )}
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 14, lineHeight: 1.6 }}>
              ※ 本番移行時はメンバーごとの専用リンク+パスワード(JWT認証)、共有ビューは有効期限付きURLに置き換わります。ここではその仕組みを試せます。
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ============================================================ UI */
  return (
    <div style={sx.app}>
      <style>{globalCss}</style>

      {/* ヘッダー */}
      <header style={sx.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
          <span style={sx.logoTile}><SvgIcon k="bolt" size={19} /></span>
          <select value={site.id} onChange={(e) => switchSite(e.target.value)} style={sx.siteSelect}>
            {state.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {isAdmin && <button style={sx.siteAddBtn} onClick={addSite}>＋現場</button>}
        </div>
        <button
          style={sx.userChip}
          onClick={async () => { if (await uiConfirm("ログアウトしてユーザーを切り替えますか?", "ログアウト")) { setCurrentUser(null); setTab("map"); } }}
          title="タップでユーザー切替"
        >
          {isViewer
            ? <>🔗 {viewerShare.name}(閲覧専用)</>
            : <><span style={{ ...sx.workerDot, background: me.color }} />{me.name} {(ROLES[myRole] || ROLES.worker).icon}</>}
        </button>
        <button style={sx.iconHeaderBtn} onClick={() => setLang(lang === "jp" ? "pt" : "jp")} title="日本語 / Português">
          {lang === "jp" ? "🇯🇵" : "🇧🇷"}
        </button>
      </header>
      <div style={sx.headerStripe} aria-hidden />

      {/* 本文 */}
      <main style={sx.main}>
        {tab === "map" && (
          floor ? (
            <MapTab
              taskApi={taskApi}
              floor={floor} siteFloors={siteFloors} floorZones={floorZones}
              setFloorId={setFloorId} floorId={floor.id}
              selectedZone={selectedZone} setSelectedZoneId={setSelectedZoneId}
              mode={mode} setMode={setMode}
              draftPoly={draftPoly} setDraftPoly={setDraftPoly}
              draftParentZoneId={draftParentZoneId} setDraftParentZoneId={setDraftParentZoneId}
              confirmDraft={confirmDraft} cancelDraft={cancelDraft}
              site={site} onSetDriveUrl={setSiteDriveUrl}
              editApi={{ editZoneId, editPoly, selVtx, setSelVtx, startEditZone, saveEditZone, cancelEditZone, deleteSelVtx, insertMidpoint, startDragVtx, onSvgPointerMove, onSvgPointerUp }}
              svgRef={svgRef} onSvgClick={onSvgClick}
              fileRef={fileRef} onFileChosen={onFileChosen}
              updateZone={updateZone} deleteZone={deleteZone}
            />
          ) : (
            <div style={{ padding: 20 }}>
              <div style={sx.empty}>
                この現場にはまだ図面がありません。
                {isAdmin && (
                  <div style={{ marginTop: 12 }}>
                    <button style={sx.primaryBtn} onClick={() => fileRef.current && fileRef.current.click()}>図面をアップロード(画像/PDF)</button>
                    <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={onFileChosen} />
                  </div>
                )}
              </div>
            </div>
          )
        )}
        {tab === "tasks" && (
          <TasksTab
            taskApi={taskApi}
            siteFloors={siteFloors} floorId={floor ? floor.id : null} setFloorId={setFloorId}
          />
        )}
        {tab === "inst" && (
          <InstructionsTab
            taskApi={taskApi} siteFloors={siteFloors}
            myInstructions={myInstructions}
            addInstruction={addInstruction} markInstructionRead={markInstructionRead}
            jumpZone={(z) => { setFloorId(z.floorId); setSelectedZoneId(z.id); setTab("map"); }}
            matApi={{ addMaterialRequest, setRequestStatus, cancelRequest }}
          />
        )}
        {tab === "board" && (
          <BoardTab taskApi={taskApi} siteFloors={siteFloors} />
        )}
        {tab === "dash" && (
          <DashTab taskApi={taskApi} site={site} siteFloors={siteFloors} setTab={goTab} setFloorId={setFloorId} setSelectedZoneId={setSelectedZoneId} />
        )}
        {tab === "budget" && isAdmin && (
          <BudgetTab state={state} setState={setState} site={site} showToast={showToast} ui={ui} />
        )}
        {tab === "settings" && me && <SettingsTab state={state} setState={setState} showToast={showToast} me={me} ui={ui} isAdmin={isAdmin} canField={canField} themeApi={{ theme, setTheme, customTheme, setCustomTheme }} guideApi={{ openGuide: () => setGuideOpen(true), showGuideBtn, setShowGuideBtn }} />}
      </main>

      {/* モーダル群 */}
      {statusTask && (
        <StatusModal
          task={state.tasks.find((t) => t.id === statusTask.id) || statusTask}
          onClose={() => setStatusTask(null)}
          updateTask={updateTask}
          setPhotoView={setPhotoView}
          showToast={showToast}
          actorName={actorName}
          logEvent={logEvent}
        />
      )}
      {detailTask && (
        <TaskDetailModal
          task={state.tasks.find((t) => t.id === detailTask.id) || detailTask}
          taskApi={taskApi}
          onClose={() => setDetailTask(null)}
        />
      )}
      {photoView && (
        <div style={sx.photoOverlay} onClick={() => setPhotoView(null)}>
          <img src={photoView} alt="添付写真" style={{ maxWidth: "94%", maxHeight: "88%", borderRadius: 8 }} />
          <div style={{ color: "#fff", fontSize: 12, marginTop: 8 }}>タップで閉じる</div>
        </div>
      )}
      {dialog && (
        <UiDialog key={dialog.key} dialog={dialog} onDone={(result) => { dialog.resolve(result); setDialog(null); }} />
      )}
      {guideOpen && <GuideModal onClose={() => setGuideOpen(false)} />}
      {showGuideBtn && !isViewer && (
        <button aria-label="ガイド" onClick={() => setGuideOpen(true)} style={sx.helpFab}>?</button>
      )}
      {busy && (
        <div style={sx.photoOverlay}>
          <div style={{ background: "#fff", borderRadius: 12, padding: "18px 26px", fontSize: 14, fontWeight: 700 }}>{busy}</div>
        </div>
      )}
      {toast && <div style={sx.toast}>{toast}</div>}

      {/* 下部タブ */}
      <nav style={sx.tabbar}>
        {(viewerTabs || [["map", "図面", "map"], ["tasks", "作業", "tasks"], ["inst", "指示", "megaphone"], ["board", "配置", "users"], ["dash", "全体", "chart"], ...(isAdmin ? [["budget", "予算", "wallet"]] : []), ["settings", "設定", "gear"]]).map(([k, label, icon]) => (
          <button key={k} onClick={() => setTab(k)} style={{ ...sx.tabBtn, ...(tab === k ? sx.tabBtnActive : {}), position: "relative" }}>
            <SvgIcon k={icon} size={22} sw={1.8} />
            <span>{tr(label)}</span>
            {k === "inst" && (unreadCount + (canField ? pendingMatCount : 0)) > 0 && (
              <span style={sx.tabBadge}>{unreadCount + (canField ? pendingMatCount : 0)}</span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}

/* ============================================================
   アプリ内ダイアログ
   ============================================================ */
function UiDialog({ dialog, onDone }) {
  const [val, setVal] = useState(dialog.value || "");
  const isPrompt = dialog.mode === "prompt";
  return (
    <div style={{ ...sx.modalOverlay, zIndex: 90 }} onClick={() => onDone(isPrompt ? null : false)}>
      <div style={{ ...sx.modal, maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.6, marginBottom: 12, whiteSpace: "pre-wrap" }}>{dialog.title}</div>
        {isPrompt && (
          <input
            autoFocus
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder={dialog.placeholder || ""}
            style={{ ...sx.input, width: "100%", marginBottom: 12 }}
            onKeyDown={(e) => { if (e.key === "Enter") onDone(val); }}
          />
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...sx.smallBtn, flex: 1, padding: "10px 0" }} onClick={() => onDone(isPrompt ? null : false)}>キャンセル</button>
          <button
            style={{ ...(dialog.danger ? sx.dangerBtn : sx.primaryBtn), flex: 2 }}
            onClick={() => onDone(isPrompt ? val : true)}
          >
            {dialog.okLabel || "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   使い方ガイドモーダル
   ============================================================ */
function GuideModal({ onClose }) {
  return (
    <div style={{ ...sx.modalOverlay, zIndex: 85 }} onClick={onClose}>
      <div style={{ ...sx.modal, maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
          <strong style={{ flex: 1, fontSize: 17 }}>{tr("📖 使い方ガイド")}</strong>
          <button style={sx.iconBtn} onClick={onClose}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
          {LANG === "pt" ? "O básico do Genba Vision em 1 minuto." : "現場ビジョンの基本を1分で。"}
        </div>
        {GUIDE_SECTIONS.map((g, i) => {
          const c = LANG === "pt" ? g.pt : g.jp;
          return (
            <div key={i} style={{ display: "flex", gap: 12, padding: "12px 2px", borderBottom: i < GUIDE_SECTIONS.length - 1 ? "1px solid rgba(16,24,40,0.06)" : "none" }}>
              <span style={{
                width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "linear-gradient(180deg, #f2f5fa, #e8edf4)",
                border: "1px solid rgba(16,24,40,0.07)", color: "#33415c",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9)",
              }}>
                <SvgIcon k={g.icon} size={19} sw={1.8} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#141c2b", display: "flex", alignItems: "center", gap: 6 }}>
                  {c.t}
                  {g.who === "admin" && <span style={{ ...sx.prTag, background: "#1B2A41", color: "#fff" }}>🛠</span>}
                </div>
                <div style={{ fontSize: 12.5, color: "#4b586e", lineHeight: 1.75, marginTop: 3 }}>{c.b}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   テーマ設定カード (設定タブ / 全員が利用可)
   ============================================================ */
function ThemeSettingsCard({ theme, setTheme, customTheme, setCustomTheme }) {
  return (
    <div style={{ ...sx.card }}>
      <div style={{ padding: 14 }}>
        <strong>{tr("🎨 テーマ")}</strong>
        <div style={{ fontSize: 12, color: "#64748b", margin: "4px 0 10px" }}>
          自分の端末の見た目を選べます。優先度・進捗のCUD配色は安全のため全テーマ共通です。
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {Object.entries(THEMES).map(([key, t]) => (
            <button key={key} onClick={() => setTheme(key)}
              style={{ ...sx.themeSwatch, marginBottom: 0, ...(theme === key ? { borderColor: t.accent, borderWidth: 2.5, background: "#fff" } : {}) }}>
              <span style={{
                width: 36, height: 36, borderRadius: 11, flexShrink: 0, overflow: "hidden",
                background: `linear-gradient(135deg, ${t.header} 0%, ${t.header2 || t.header} 55%, ${t.accent} 130%)`,
                display: "flex", flexDirection: "column", justifyContent: "flex-end",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), 0 1px 3px rgba(16,24,40,0.2)",
              }}>
                <span style={{ height: 7, background: t.stripe || t.accent }} />
              </span>
              <span style={{ fontSize: 12 }}>{tr(t.label)}</span>
              {theme === key && <span style={{ marginLeft: "auto", color: t.accent }}>✓</span>}
            </button>
          ))}
          <button onClick={() => setTheme("custom")}
            style={{ ...sx.themeSwatch, marginBottom: 0, ...(theme === "custom" ? { borderColor: customTheme.accent, borderWidth: 2.5, background: "#fff" } : {}) }}>
            <span style={{
              width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
              background: `linear-gradient(135deg, ${customTheme.header}, ${customTheme.accent})`,
              border: "2px solid rgba(255,255,255,0.88)", boxShadow: `0 0 0 2.5px ${customTheme.header}`,
            }} />
            <span style={{ fontSize: 12 }}>{tr("カスタム")}</span>
            {theme === "custom" && <span style={{ marginLeft: "auto", color: customTheme.accent }}>✓</span>}
          </button>
        </div>
        {theme === "custom" && (
          <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, color: "#475569", display: "flex", alignItems: "center", gap: 6 }}>
              {tr("ヘッダー色")}
              <input type="color" value={customTheme.header} onChange={(e) => setCustomTheme((c) => ({ ...c, header: e.target.value }))} />
            </label>
            <label style={{ fontSize: 12, color: "#475569", display: "flex", alignItems: "center", gap: 6 }}>
              {tr("アクセント色")}
              <input type="color" value={customTheme.accent} onChange={(e) => setCustomTheme((c) => ({ ...c, accent: e.target.value }))} />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   図面タブ
   ============================================================ */
function MapTab(props) {
  const {
    taskApi, floor, siteFloors, floorZones, setFloorId, floorId,
    selectedZone, setSelectedZoneId, mode, setMode,
    draftPoly, setDraftPoly, draftParentZoneId, setDraftParentZoneId,
    confirmDraft, cancelDraft, svgRef, onSvgClick,
    fileRef, onFileChosen, updateZone, deleteZone, editApi,
    site, onSetDriveUrl,
  } = props;
  const { state, derived, isAdmin, canField } = taskApi;
  const { editZoneId, editPoly, selVtx, setSelVtx, startEditZone, saveEditZone, cancelEditZone, deleteSelVtx, insertMidpoint, startDragVtx, onSvgPointerMove, onSvgPointerUp } = editApi;
  const mapScale = Math.max(floor.w, floor.h) / 1200;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* フロアバー */}
      <div style={sx.floorBar}>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", flex: 1 }}>
          {siteFloors.map((f) => (
            <button key={f.id} onClick={() => { setFloorId(f.id); setSelectedZoneId(null); }}
              style={{ ...sx.floorChip, ...(f.id === floorId ? sx.floorChipActive : {}) }}>
              {f.name}
            </button>
          ))}
        </div>
        {site && site.driveUrl && !taskApi.isViewer && (
          <a href={site.driveUrl} target="_blank" rel="noopener noreferrer"
            style={{ ...sx.smallBtn, textDecoration: "none", borderStyle: "solid", borderColor: "#c7d2fe", background: "#eef2ff", color: "#3730a3", fontWeight: 700 }}>
            📐 {tr("図面(Drive)")}
          </a>
        )}
        {canField && (
          <>
            <button style={{ ...sx.smallBtn, fontSize: site && site.driveUrl ? 12 : undefined }}
              title="現場のGoogle Drive図面リンク"
              onClick={async () => {
                const v = await taskApi.ui.prompt(tr("図面の共有リンク(Google Drive)"), (site && site.driveUrl) || "", "https://drive.google.com/...");
                if (v === null) return;
                const url = v.trim();
                if (url && !/^https?:\/\//i.test(url)) { taskApi.showToast("URLは https:// から入力してください"); return; }
                onSetDriveUrl(url);
              }}>
              {site && site.driveUrl ? "✏" : "📐 Driveリンク設定"}
            </button>
            <button style={sx.smallBtn} onClick={() => fileRef.current && fileRef.current.click()}>+ 図面</button>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={onFileChosen} />
          </>
        )}
      </div>

      {/* 描画モードバー */}
      {canField && (
        <div style={sx.drawBar}>
          {mode === "view" ? (
            <>
              <button style={sx.primaryBtn} onClick={() => { setMode("draw"); setDraftParentZoneId(null); setSelectedZoneId(null); }}>
                {tr("＋ エリア追加")}
              </button>
              {selectedZone && (
                <button style={sx.secondaryBtn} onClick={() => { setMode("draw"); setDraftParentZoneId(selectedZone.id); }}>
                  ＋ {tr("サブエリア追加")}: {selectedZone.name}
                </button>
              )}
            </>
          ) : mode === "edit" ? (
            <>
              <span style={{ fontSize: 12, color: "#cbd5e1", flex: 1 }}>
                {tr("✏ 頂点をドラッグで移動 / ＋タップで頂点追加")}({editPoly.length})
              </span>
              <button style={sx.secondaryBtn} onClick={deleteSelVtx}>{tr("選択頂点を削除")}</button>
              <button style={sx.primaryBtn} onClick={saveEditZone}>{tr("保存")}</button>
              <button style={sx.dangerBtn} onClick={cancelEditZone}>{tr("キャンセル")}</button>
            </>
          ) : (
            <>
              <span style={{ fontSize: 12, color: "#cbd5e1", flex: 1 }}>
                {tr("図面をタップして頂点を追加")}({draftPoly.length})
                {draftParentZoneId ? " / 親: " + ((state.zones.find((z) => z.id === draftParentZoneId) || {}).name || "") : ""}
              </span>
              <button style={sx.secondaryBtn} onClick={() => setDraftPoly((d) => d.slice(0, -1))}>{tr("1点戻す")}</button>
              <button style={sx.primaryBtn} onClick={confirmDraft}>{tr("確定")}</button>
              <button style={sx.dangerBtn} onClick={cancelDraft}>{tr("中止")}</button>
            </>
          )}
        </div>
      )}

      {/* 図面 + SVGオーバーレイ */}
      <div style={sx.mapWrap}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${floor.w} ${floor.h}`}
          style={{ width: "100%", height: "auto", display: "block", touchAction: mode !== "view" ? "none" : "auto", cursor: mode === "draw" ? "crosshair" : "default" }}
          onClick={onSvgClick}
          onMouseMove={onSvgPointerMove}
          onMouseUp={onSvgPointerUp}
          onMouseLeave={onSvgPointerUp}
          onTouchMove={onSvgPointerMove}
          onTouchEnd={onSvgPointerUp}
        >
          <image href={floor.image} x="0" y="0" width={floor.w} height={floor.h} />
          {[...floorZones].filter((z) => z.id !== editZoneId).sort((a, b) => (a.parentZoneId ? 1 : 0) - (b.parentZoneId ? 1 : 0)).map((z) => {
            const pr = z.priority ? PRIORITY[z.priority] : null;
            const prog = derived.zoneProgress.get(z.id) || 0;
            const issues = derived.zoneIssues.get(z.id) || 0;
            const sel = selectedZone && selectedZone.id === z.id;
            const c = centroid(z.polygon);
            const isChild = !!z.parentZoneId;
            const scale = Math.max(floor.w, floor.h) / 1200;
            return (
              <g key={z.id} onClick={(e) => { if (mode === "draw") return; e.stopPropagation(); setSelectedZoneId(sel ? null : z.id); }} style={{ cursor: "pointer" }}>
                <path d={polyPath(z.polygon)}
                  fill={pr ? pr.soft : "rgba(100,116,139,0.15)"}
                  stroke={sel ? "#0f172a" : pr ? pr.color : "#64748b"}
                  strokeWidth={(sel ? 7 : isChild ? 3 : 5) * scale}
                  strokeDasharray={isChild ? `${10 * scale} ${7 * scale}` : "none"}
                />
                <g transform={`translate(${c.x},${c.y}) scale(${scale})`}>
                  <ProgressBadge name={(z.workStatus === "paused" ? "⏸" : "") + z.name} progress={prog} issues={issues} small={isChild} priority={z.priority} />
                </g>
              </g>
            );
          })}
          {draftPoly.length > 0 && (
            <g>
              <path d={polyPath(draftPoly)} fill="rgba(0,90,255,0.15)" stroke="#005AFF" strokeWidth="4" strokeDasharray="12 8" />
              {draftPoly.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="14" fill="#005AFF" stroke="#fff" strokeWidth="4" />
              ))}
            </g>
          )}
          {/* エリア範囲の編集オーバーレイ */}
          {mode === "edit" && editPoly.length > 0 && (
            <g>
              <path d={polyPath(editPoly)} fill="rgba(0,90,255,0.18)" stroke="#005AFF" strokeWidth={5 * mapScale} strokeDasharray={`${12 * mapScale} ${8 * mapScale}`} />
              {/* 中点: タップで頂点追加 */}
              {editPoly.map((p, i) => {
                const b = editPoly[(i + 1) % editPoly.length];
                const m = { x: (p.x + b.x) / 2, y: (p.y + b.y) / 2 };
                return (
                  <g key={"m" + i} onClick={(e) => { e.stopPropagation(); insertMidpoint(i); }} style={{ cursor: "copy" }}>
                    <circle cx={m.x} cy={m.y} r={12 * mapScale} fill="#fff" stroke="#005AFF" strokeWidth={2.5 * mapScale} />
                    <text x={m.x} y={m.y + 6 * mapScale} textAnchor="middle" fontSize={17 * mapScale} fontWeight="800" fill="#005AFF">＋</text>
                  </g>
                );
              })}
              {/* 頂点: ドラッグで移動、タップで選択 */}
              {editPoly.map((p, i) => (
                <circle
                  key={"v" + i}
                  cx={p.x} cy={p.y} r={17 * mapScale}
                  fill={selVtx === i ? "#FF4B00" : "#005AFF"}
                  stroke="#fff" strokeWidth={4 * mapScale}
                  style={{ cursor: "grab" }}
                  onMouseDown={(e) => startDragVtx(i, e)}
                  onTouchStart={(e) => startDragVtx(i, e)}
                  onClick={(e) => { e.stopPropagation(); setSelVtx(i); }}
                />
              ))}
            </g>
          )}
        </svg>
      </div>

      {/* 凡例 */}
      <div style={sx.legend}>
        {Object.entries(PRIORITY).map(([k, v]) => (
          <span key={k} style={sx.legendItem}>
            <span style={{ ...sx.legendSwatch, background: v.color }} />{tr("優先")}{k}:{tr(v.label)}
          </span>
        ))}
      </div>

      {/* エリア詳細シート */}
      {selectedZone && (
        <ZoneSheet
          zone={selectedZone} taskApi={taskApi}
          updateZone={updateZone} deleteZone={deleteZone}
          startEditZone={startEditZone}
          onClose={() => setSelectedZoneId(null)}
          onSelectZone={setSelectedZoneId}
        />
      )}
    </div>
  );
}

/* ---------- 図面上の進捗バッジ ---------- */
function ProgressBadge({ name, progress, issues, small, priority }) {
  const r = small ? 34 : 46;
  const stroke = small ? 9 : 12;
  const circ = 2 * Math.PI * r;
  const pr = priority ? PRIORITY[priority] : null;
  return (
    <g>
      <circle r={r + stroke} fill="rgba(255,255,255,0.92)" stroke={pr ? pr.color : "#94a3b8"} strokeWidth="3" />
      <circle r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
      <circle r={r} fill="none" stroke={progress >= 100 ? STATUS.done.color : "#005AFF"} strokeWidth={stroke}
        strokeDasharray={`${(progress / 100) * circ} ${circ}`} strokeLinecap="round" transform="rotate(-90)" />
      <text y={small ? -4 : -6} textAnchor="middle" fontSize={small ? 20 : 26} fontWeight="700" fill="#0f172a">{name}</text>
      <text y={small ? 20 : 26} textAnchor="middle" fontSize={small ? 18 : 22} fill="#334155" style={{ fontVariantNumeric: "tabular-nums" }}>
        {Math.round(progress)}%
      </text>
      {issues > 0 && (
        <g transform={`translate(${r + 2},${-r - 2})`}>
          <circle r="16" fill={STATUS.issue.color} />
          <text y="6" textAnchor="middle" fontSize="20" fontWeight="700" fill="#fff">!</text>
        </g>
      )}
    </g>
  );
}

/* ============================================================
   エリア詳細シート
   ============================================================ */
function ZoneSheet({ zone, taskApi, updateZone, deleteZone, startEditZone, onClose, onSelectZone }) {
  const { state, derived, isAdmin, canField, addRootTask } = taskApi;
  const prog = derived.zoneProgress.get(zone.id) || 0;
  const issues = derived.zoneIssues.get(zone.id) || 0;
  const children = derived.childZones.get(zone.id) || [];
  const parent = zone.parentZoneId ? state.zones.find((z) => z.id === zone.parentZoneId) : null;

  return (
    <div style={sx.sheet}>
      <div style={sx.grabber} aria-hidden />
      <div style={sx.sheetHandleRow}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          {parent && <button style={sx.linkBtn} onClick={() => onSelectZone(parent.id)}>◀ {parent.name}</button>}
          <strong style={{ fontSize: 16 }}>{dispName(zone.name)}</strong>
          {taskApi.canField && (
            <button style={{ ...sx.linkBtn, fontSize: 14 }} title="名前を変更"
              onClick={async () => {
                const nm = await taskApi.ui.prompt("エリア名を変更", zone.name);
                if (nm && nm.trim() && nm.trim() !== zone.name) updateZone(zone.id, { name: nm.trim() });
              }}>✏</button>
          )}
          <span style={{ fontSize: 13, color: "#475569", fontVariantNumeric: "tabular-nums" }}>{Math.round(prog)}%</span>
          {issues > 0 && <span style={sx.issueBadge}>⚠ {issues}</span>}
        </div>
        <button style={sx.iconBtn} onClick={onClose}>✕</button>
      </div>

      {canField && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "#475569" }}>{tr("エリア優先度:")}</span>
          {Object.entries(PRIORITY).map(([k, v]) => (
            <button key={k}
              onClick={() => updateZone(zone.id, { priority: zone.priority === Number(k) ? null : Number(k) })}
              style={{
                ...sx.prChip, background: zone.priority === Number(k) ? v.color : "#f1f5f9",
                color: zone.priority === Number(k) ? v.text : "#334155", borderColor: v.color,
              }}>
              {tr(v.label)}
            </button>
          ))}
          <button
            onClick={() => startEditZone(zone)}
            style={{ ...sx.prChip, borderColor: "#005AFF", background: "#f8fafc", color: "#005AFF" }}>
            {tr("✏ 範囲を編集")}
          </button>
          <button
            onClick={() => updateZone(zone.id, { workStatus: zone.workStatus === "paused" ? null : "paused" })}
            style={{
              ...sx.prChip, borderColor: "#64748b",
              background: zone.workStatus === "paused" ? "#64748b" : "#f8fafc",
              color: zone.workStatus === "paused" ? "#fff" : "#334155",
            }}>
            {zone.workStatus === "paused" ? tr("⏸ 予定なし") : tr("▶ 稼働中")}
          </button>
          <button style={{ ...sx.dangerBtn, marginLeft: "auto", padding: "6px 10px", fontSize: 12 }}
            onClick={async () => { if (await taskApi.ui.confirm(`「${zone.name}」を削除しますか?\n(サブエリア・作業も削除されます)`, "削除", true)) deleteZone(zone.id); }}>
            {tr("削除")}
          </button>
        </div>
      )}

      {children.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {children.map((c) => (
            <button key={c.id} style={sx.childChip} onClick={() => onSelectZone(c.id)}>
              {c.name} <span style={{ fontVariantNumeric: "tabular-nums" }}>{Math.round(derived.zoneProgress.get(c.id) || 0)}%</span>
            </button>
          ))}
        </div>
      )}

      <TaskTree zoneId={zone.id} taskApi={taskApi} />

      {canField && (
        <button style={{ ...sx.smallBtn, marginTop: 8 }}
          onClick={async () => { const n = await taskApi.ui.prompt("追加する作業名を入力", "", "例: 器具付け"); if (n && n.trim()) addRootTask(zone.id, n.trim()); }}>
          {tr("＋ このエリアに作業を追加")}
        </button>
      )}
    </div>
  );
}

/* ============================================================
   作業ツリー
   ============================================================ */
function TaskTree({ zoneId, taskApi }) {
  const roots = (taskApi.derived.tasksByZone.get(zoneId) || []).filter((t) => !t.parentTaskId);
  return (
    <div style={{ overflowY: "auto", flex: 1, WebkitOverflowScrolling: "touch" }}>
      {roots.map((t) => <TaskRow key={t.id} task={t} depth={0} taskApi={taskApi} />)}
    </div>
  );
}

function TaskRow({ task, depth, taskApi }) {
  const { state, derived, isAdmin, canField, myWorkerId, myTeamIds, canEditTask, updateTask, openStatus, openDetail } = taskApi;
  const [open, setOpen] = useState(depth > 0);
  const children = derived.tasksByParent.get(task.id) || [];
  const isLeaf = children.length === 0;
  const prog = computeTaskProgress(task, derived.tasksByParent);
  const st = STATUS[task.status];
  const pr = task.priority ? PRIORITY[task.priority] : null;
  const assignees = task.assigneeIds.map((id) => state.workers.find((w) => w.id === id)).filter(Boolean);
  const assignedTeams = (task.teamIds || []).map((id) => state.teams.find((g) => g.id === id)).filter(Boolean);
  const editable = canEditTask(task);
  const overdue = task.dueDate && task.status !== "done" && task.dueDate < todayStr();
  const startLate = task.startDate && task.status === "todo" && task.startDate < todayStr();
  const isMine = myWorkerId && (task.assigneeIds.includes(myWorkerId) || (task.teamIds || []).some((id) => myTeamIds.has(id)));
  const memoVisible = task.memo && (isAdmin || task.memoVisibleToWorkers);

  return (
    <div>
      <div style={{
        ...sx.taskRow, paddingLeft: 8 + depth * 16,
        borderLeft: pr ? `5px solid ${pr.color}` : "5px solid transparent",
        background: isMine ? "rgba(0,90,255,0.05)" : "transparent",
      }}>
        {isLeaf ? (
          <button
            onClick={() => openStatus(task)}
            style={{ ...sx.statusBtn, background: st.color, color: "#fff", opacity: editable ? 1 : 0.55 }}
          >
            {editable ? st.icon : "🔒"} {task.status === "progress" ? `${task.percent || 50}%` : tr(st.label)}
          </button>
        ) : (
          <button style={sx.expandBtn} onClick={() => setOpen(!open)}>{open ? "▾" : "▸"}</button>
        )}

        <div style={{ flex: 1, minWidth: 0 }} onClick={() => openDetail(task)}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: isLeaf ? 500 : 700 }}>{dispName(task.name, task.romaji)}</span>
            {!isLeaf && <span style={{ fontSize: 12, color: "#475569", fontVariantNumeric: "tabular-nums" }}>{Math.round(prog)}%</span>}
            {task.startDate && (
              <span style={{ ...sx.dueChip, background: startLate ? "#fef3c7" : "#f1f5f9", color: startLate ? "#92400e" : "#475569", fontWeight: startLate ? 700 : 500 }}>
                ▶ {fmtDate(task.startDate)}〜{startLate ? " " + tr("開始遅れ") : ""}
              </span>
            )}
            {task.dueDate && (
              <span style={{ ...sx.dueChip, background: overdue ? "#fee2e2" : "#f1f5f9", color: overdue ? "#b91c1c" : "#475569", fontWeight: overdue ? 700 : 500 }}>
                📅 {fmtDate(task.dueDate)}{overdue ? " " + tr("期限超過") : ""}
              </span>
            )}
            {memoVisible && <span style={{ fontSize: 13 }} title="メモあり">📝</span>}
            {assignedTeams.map((g) => (
              <span key={g.id} style={{ ...sx.teamChip, borderColor: g.color, color: g.color }}>{g.name}</span>
            ))}
            {assignees.map((w) => (
              <span key={w.id} style={{ ...sx.workerChip, background: w.color }}>{w.name}</span>
            ))}
            {task.linkUrl && !taskApi.isViewer && (
              <a href={task.linkUrl} target="_blank" rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()} style={sx.linkChip}>📐 図面</a>
            )}
            {task.issuePhotos && task.issuePhotos.length > 0 && <span style={{ fontSize: 12, color: "#64748b" }}>📷{task.issuePhotos.length}</span>}
          </div>
          {!isLeaf && (
            <div style={sx.miniBarTrack}><div style={{ ...sx.miniBarFill, width: `${prog}%`, background: prog >= 100 ? STATUS.done.color : "#005AFF" }} /></div>
          )}
          {task.status === "issue" && task.issueText && <div style={sx.issueText}>⚠ {task.issueText}</div>}
        </div>

        {canField && (
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <select
              value={task.priority || ""}
              onChange={(e) => updateTask(task.id, { priority: e.target.value ? Number(e.target.value) : null })}
              onClick={(e) => e.stopPropagation()}
              style={{ ...sx.select, borderColor: pr ? pr.color : "#cbd5e1" }}
            >
              <option value="">{tr("優先")}-</option>
              {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}
            </select>
            {isLeaf && <AssignPicker task={task} workers={state.workers} teams={state.teams} updateTask={updateTask} />}
          </div>
        )}
      </div>
      {open && children.map((c) => <TaskRow key={c.id} task={c} depth={depth + 1} taskApi={taskApi} />)}
    </div>
  );
}

function AssignPicker({ task, workers, teams, updateTask }) {
  const [open, setOpen] = useState(false);
  const nAssigned = task.assigneeIds.length + (task.teamIds || []).length;
  return (
    <div style={{ position: "relative" }}>
      <button style={sx.assignBtn} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>👤{nAssigned || ""}</button>
      {open && (
        <div style={sx.assignPop}>
          {teams.length > 0 && <div style={sx.assignHead}>班</div>}
          {teams.map((g) => {
            const on = (task.teamIds || []).includes(g.id);
            return (
              <button key={g.id}
                style={{ ...sx.assignItem, background: on ? g.color : "#f1f5f9", color: on ? "#fff" : "#334155", fontWeight: 700 }}
                onClick={(e) => {
                  e.stopPropagation();
                  const cur = task.teamIds || [];
                  updateTask(task.id, { teamIds: on ? cur.filter((x) => x !== g.id) : [...cur, g.id] });
                }}>
                {on ? "✓ " : ""}{g.name}({g.memberIds.length}名)
              </button>
            );
          })}
          <div style={sx.assignHead}>個人</div>
          {workers.map((w) => {
            const on = task.assigneeIds.includes(w.id);
            return (
              <button key={w.id}
                style={{ ...sx.assignItem, background: on ? w.color : "#f1f5f9", color: on ? "#fff" : "#334155" }}
                onClick={(e) => {
                  e.stopPropagation();
                  updateTask(task.id, { assigneeIds: on ? task.assigneeIds.filter((x) => x !== w.id) : [...task.assigneeIds, w.id] });
                }}>
                {on ? "✓ " : ""}{w.name}
              </button>
            );
          })}
          <button style={{ ...sx.assignItem, background: "#e2e8f0" }} onClick={(e) => { e.stopPropagation(); setOpen(false); }}>閉じる</button>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   進捗登録モーダル (問題報告 + 写真添付)
   ============================================================ */
function StatusModal({ task, onClose, updateTask, setPhotoView, showToast, actorName, logEvent }) {
  const [issueOpen, setIssueOpen] = useState(task.status === "issue");
  const [progressOpen, setProgressOpen] = useState(false);
  const [issueText, setIssueText] = useState(task.issueText || "");
  const [photos, setPhotos] = useState(task.issuePhotos || []);
  const photoRef = useRef(null);
  const logEntry = (text) => ({ at: new Date().toISOString(), by: actorName, text });

  function pickSimple(status) {
    updateTask(task.id, {
      status, issueText: "", issuePhotos: [],
      percent: status === "done" ? 100 : status === "todo" ? null : task.percent,
      history: [...(task.history || []), logEntry(`「${STATUS[status].label}」に変更`)],
    });
    logEvent && logEvent("status", { taskName: task.name, status });
    onClose();
  }
  function pickProgress(pct) {
    updateTask(task.id, {
      status: "progress", issueText: "", issuePhotos: [], percent: pct,
      history: [...(task.history || []), logEntry(`「途中(${pct}%)」に変更`)],
    });
    logEvent && logEvent("status", { taskName: task.name, status: "progress", percent: pct });
    onClose();
  }
  function saveIssue() {
    updateTask(task.id, {
      status: "issue", issueText: issueText.trim(), issuePhotos: photos,
      history: [...(task.history || []), logEntry(`問題を報告${issueText.trim() ? ": " + issueText.trim() : ""}`)],
    });
    logEvent && logEvent("issue", { taskName: task.name, zoneId: task.zoneId });
    showToast("問題を報告しました。管理者の全体タブに表示されます。");
    onClose();
  }
  async function onPhotoChosen(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    for (const f of files.slice(0, 4 - photos.length)) {
      try {
        const url = await fileToResizedDataUrl(f);
        setPhotos((p) => [...p, url]);
      } catch { showToast("写真の読み込みに失敗しました"); }
    }
  }

  return (
    <div style={sx.modalOverlay} onClick={onClose}>
      <div style={sx.modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
          <strong style={{ flex: 1, fontSize: 15 }}>{tr("進捗を登録")}: {dispName(task.name, task.romaji)}</strong>
          <button style={sx.iconBtn} onClick={onClose}>✕</button>
        </div>

        {progressOpen ? (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0369a1", marginBottom: 8 }}>▶ {tr("進捗はどれくらいですか?")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {[25, 50, 75].map((pct) => (
                <button key={pct} onClick={() => pickProgress(pct)}
                  style={{ ...sx.bigStatusBtn, background: STATUS.progress.color, ...(task.status === "progress" && (task.percent || 50) === pct ? sx.bigStatusActive : {}) }}>
                  <span style={{ fontSize: 22, fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
                </button>
              ))}
            </div>
            <button style={{ ...sx.secondaryBtn, color: "#334155", borderColor: "#cbd5e1", width: "100%", marginTop: 10 }} onClick={() => setProgressOpen(false)}>{tr("◀ 戻る")}</button>
          </div>
        ) : !issueOpen ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button onClick={() => pickSimple("todo")}
              style={{ ...sx.bigStatusBtn, background: STATUS.todo.color, ...(task.status === "todo" ? sx.bigStatusActive : {}) }}>
              <span style={{ fontSize: 24 }}>{STATUS.todo.icon}</span>
              {tr("未着手")}
            </button>
            <button onClick={() => setProgressOpen(true)}
              style={{ ...sx.bigStatusBtn, background: STATUS.progress.color, ...(task.status === "progress" ? sx.bigStatusActive : {}) }}>
              <span style={{ fontSize: 24 }}>{STATUS.progress.icon}</span>
              {tr("途中")}{task.status === "progress" ? `(${task.percent || 50}%)` : ""} ▸
            </button>
            <button onClick={() => pickSimple("done")}
              style={{ ...sx.bigStatusBtn, background: STATUS.done.color, ...(task.status === "done" ? sx.bigStatusActive : {}) }}>
              <span style={{ fontSize: 24 }}>{STATUS.done.icon}</span>
              {tr("完了")}
            </button>
            <button onClick={() => setIssueOpen(true)}
              style={{ ...sx.bigStatusBtn, background: STATUS.issue.color, ...(task.status === "issue" ? sx.bigStatusActive : {}) }}>
              <span style={{ fontSize: 24 }}>⚠</span>
              {tr("問題あり")} ▸
            </button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#b91c1c", marginBottom: 6 }}>{tr("⚠ 問題の内容を報告")}</div>
            <textarea
              value={issueText}
              onChange={(e) => setIssueText(e.target.value)}
              placeholder="例: スリーブ位置が図面と相違。監督に確認が必要。"
              style={sx.textarea}
              rows={4}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
              {photos.map((p, i) => (
                <div key={i} style={{ position: "relative" }}>
                  <img src={p} alt={`添付${i + 1}`} style={sx.thumb} onClick={() => setPhotoView(p)} />
                  <button style={sx.thumbDel} onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              {photos.length < 4 && (
                <button style={sx.photoAddBtn} onClick={() => photoRef.current && photoRef.current.click()}>
                  📷<br />{tr("写真追加")}
                </button>
              )}
              <input ref={photoRef} type="file" accept="image/*" capture="environment" multiple style={{ display: "none" }} onChange={onPhotoChosen} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button style={{ ...sx.secondaryBtn, color: "#334155", borderColor: "#cbd5e1", flex: 1 }} onClick={() => setIssueOpen(false)}>{tr("◀ 戻る")}</button>
              <button style={{ ...sx.dangerBtn, flex: 2 }} onClick={saveIssue}>{tr("⚠ 問題を報告する")}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   作業詳細モーダル (メモ・期限・カスタム)
   ============================================================ */
function TaskDetailModal({ task, taskApi, onClose }) {
  const { state, derived, isAdmin, canField, myWorkerId, isViewer, actorName, updateTask, deleteTask, addSubTask, handoverTask, canEditTask } = taskApi;
  const zone = state.zones.find((z) => z.id === task.zoneId);
  const children = derived.tasksByParent.get(task.id) || [];
  const [name, setName] = useState(task.name);
  const [memo, setMemo] = useState(task.memo || "");
  const [hoOpen, setHoOpen] = useState(false);
  const [hoTarget, setHoTarget] = useState("");
  const [hoNote, setHoNote] = useState("");
  const [replyText, setReplyText] = useState("");
  const memoVisible = !isViewer && task.memo && (canField || task.memoVisibleToWorkers);
  const overdue = task.dueDate && task.status !== "done" && task.dueDate < todayStr();
  const canHandover = !isViewer && myWorkerId && task.assigneeIds.includes(myWorkerId) && state.workers.length > 1;
  const canReply = !isViewer && (isAdmin || canEditTask(task));
  const history = (task.history || []).slice(-6).reverse();
  function addReply() {
    const txt = replyText.trim();
    if (!txt) return;
    updateTask(task.id, { replies: [...(task.replies || []), { at: new Date().toISOString(), by: actorName, text: txt }] });
    setReplyText("");
  }

  return (
    <div style={sx.modalOverlay} onClick={onClose}>
      <div style={sx.modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: "#64748b" }}>{zone ? zone.name : ""}</div>
            {canField ? (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => name.trim() && name !== task.name && updateTask(task.id, { name: name.trim() })}
                style={{ ...sx.input, fontWeight: 700, fontSize: 15, width: "100%" }}
              />
            ) : (
              <strong style={{ fontSize: 16 }}>{dispName(task.name, task.romaji)}</strong>
            )}
          </div>
          <button style={sx.iconBtn} onClick={onClose}>✕</button>
        </div>

        {/* ローマ字読み (PT表示用・管理者) */}
        {canField && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "#475569" }}>🇧🇷</span>
            <input
              defaultValue={task.romaji || ""}
              placeholder={tr("ローマ字表記(ポルトガル語表示用・任意)") + " / " + romanize(task.name)}
              onBlur={(e) => { const v = e.target.value.trim(); if (v !== (task.romaji || "")) updateTask(task.id, { romaji: v }); }}
              style={{ ...sx.input, flex: 1, fontSize: 12 }}
            />
          </div>
        )}

        {/* 開始日・終了期限 (どちらも任意) */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: "#475569", minWidth: 40 }}>{tr("開始")}</span>
          {canField ? (
            <>
              <input type="date" value={task.startDate || ""} onChange={(e) => updateTask(task.id, { startDate: e.target.value || null })} style={sx.input} />
              {task.startDate && <button style={sx.smallBtn} onClick={() => updateTask(task.id, { startDate: null })}>{tr("クリア")}</button>}
            </>
          ) : (
            <span style={{ fontSize: 14, fontWeight: 600, color: task.startDate && task.status === "todo" && task.startDate < todayStr() ? "#92400e" : "#0f172a" }}>
              {task.startDate ? `${fmtDate(task.startDate)}〜${task.status === "todo" && task.startDate < todayStr() ? `(${tr("開始遅れ")})` : ""}` : tr("設定なし")}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: "#475569", minWidth: 40 }}>{tr("期限")}</span>
          {canField ? (
            <>
              <input type="date" value={task.dueDate || ""} onChange={(e) => updateTask(task.id, { dueDate: e.target.value || null })} style={sx.input} />
              {task.dueDate && <button style={sx.smallBtn} onClick={() => updateTask(task.id, { dueDate: null })}>{tr("クリア")}</button>}
            </>
          ) : (
            <span style={{ fontSize: 14, fontWeight: 600, color: overdue ? "#b91c1c" : "#0f172a" }}>
              {task.dueDate ? `${fmtDate(task.dueDate)}${overdue ? `(${tr("期限超過!")})` : ""}` : tr("設定なし")}
            </span>
          )}
        </div>

        {/* 図面リンク (Google Drive等 / 共有ビューには非表示) */}
        {!isViewer && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: "#475569", marginBottom: 4 }}>{tr("📐 図面リンク(Google Drive等)")}</div>
            {canField ? (
              <input
                defaultValue={task.linkUrl || ""}
                placeholder="https://drive.google.com/..."
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && !/^https?:\/\//i.test(v)) { taskApi.showToast("URLは https:// から入力してください"); return; }
                  if (v !== (task.linkUrl || "")) updateTask(task.id, { linkUrl: v });
                }}
                style={{ ...sx.input, width: "100%" }}
              />
            ) : null}
            {task.linkUrl ? (
              <a href={task.linkUrl} target="_blank" rel="noopener noreferrer"
                style={{ ...sx.primaryBtn, display: "block", textAlign: "center", textDecoration: "none", marginTop: canField ? 8 : 0, padding: "11px 0", background: "#3730a3" }}>
                {tr("📐 図面を開く(最新版)")}
              </a>
            ) : (!canField && <div style={{ fontSize: 12, color: "#94a3b8" }}>{tr("図面リンクは設定されていません")}</div>)}
          </div>
        )}

        {/* メモ (共有ビューでは非表示) */}
        {!isViewer && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: "#475569" }}>{tr("📝 管理者メモ")}</span>
            {canField && (
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, marginLeft: "auto", cursor: "pointer" }}>
                <input type="checkbox" checked={task.memoVisibleToWorkers} onChange={(e) => updateTask(task.id, { memoVisibleToWorkers: e.target.checked })} />
                {tr("作業員に表示")}
              </label>
            )}
          </div>
          {canField ? (
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              onBlur={() => memo !== task.memo && updateTask(task.id, { memo })}
              placeholder="施工上の注意点、指示事項など"
              style={sx.textarea}
              rows={3}
            />
          ) : memoVisible ? (
            <div style={{ fontSize: 13, background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 10px", lineHeight: 1.6 }}>{task.memo}</div>
          ) : (
            <div style={{ fontSize: 12, color: "#94a3b8" }}>{tr("表示できるメモはありません")}</div>
          )}
        </div>
        )}

        {/* 問題内容表示 + 返信スレッド */}
        {task.status === "issue" && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: "#b91c1c", fontWeight: 700 }}>{tr("⚠ 報告されている問題")}</div>
            <div style={sx.issueText}>{task.issueText || "(詳細未記入)"}</div>
            {task.issuePhotos && task.issuePhotos.length > 0 && (
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                {task.issuePhotos.map((p, i) => (
                  <img key={i} src={p} alt={`問題写真${i + 1}`} style={sx.thumb} onClick={() => taskApi.setPhotoView(p)} />
                ))}
              </div>
            )}
            {(task.replies || []).map((r, i) => (
              <div key={i} style={{ fontSize: 12, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 10px", marginTop: 6 }}>
                <span style={{ fontWeight: 700, color: "#334155" }}>{r.by}</span>
                <span style={{ color: "#94a3b8", marginLeft: 6, fontVariantNumeric: "tabular-nums" }}>{fmtDateTime(r.at)}</span>
                <div style={{ marginTop: 2, lineHeight: 1.6 }}>{r.text}</div>
              </div>
            ))}
            {canReply && (
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <input
                  value={replyText} onChange={(e) => setReplyText(e.target.value)}
                  placeholder="返信(例: 対応中です。明日資材が届きます)"
                  style={{ ...sx.input, flex: 1 }}
                  onKeyDown={(e) => e.key === "Enter" && addReply()}
                />
                <button style={sx.primaryBtn} onClick={addReply}>{tr("返信")}</button>
              </div>
            )}
          </div>
        )}

        {/* 引き継ぎ (担当作業員) */}
        {canHandover && (
          <div style={{ marginBottom: 10 }}>
            {!hoOpen ? (
              <button style={{ ...sx.smallBtn, width: "100%", padding: "10px 0", fontSize: 13 }} onClick={() => setHoOpen(true)}>
                {tr("🤝 この作業を引き継ぐ")}
              </button>
            ) : (
              <div style={{ border: "1.5px solid #cbd5e1", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{tr("🤝 引き継ぎ先を選択")}</div>
                <select value={hoTarget} onChange={(e) => setHoTarget(e.target.value)} style={{ ...sx.input, width: "100%" }}>
                  <option value="">引き継ぎ先の作業員を選択</option>
                  {state.workers.filter((w) => w.id !== myWorkerId).map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
                <textarea
                  value={hoNote} onChange={(e) => setHoNote(e.target.value)}
                  placeholder="申し送り(例: 3列目まで配管済み。残りは西側から)"
                  style={{ ...sx.textarea, marginTop: 8 }} rows={2}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button style={{ ...sx.smallBtn, flex: 1 }} onClick={() => setHoOpen(false)}>{tr("キャンセル")}</button>
                  <button
                    style={{ ...sx.primaryBtn, flex: 2, opacity: hoTarget ? 1 : 0.5 }}
                    onClick={() => { if (!hoTarget) return; handoverTask(task, hoTarget, hoNote.trim()); onClose(); }}
                  >
                    {tr("引き継ぐ(相手に📣通知)")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 履歴 */}
        {history.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: "#475569", marginBottom: 4 }}>{tr("📜 履歴")}</div>
            {history.map((h, i) => (
              <div key={i} style={{ fontSize: 12, color: "#64748b", padding: "3px 0", borderBottom: "1px solid #f1f5f9" }}>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtDateTime(h.at)}</span>
                {" "}<strong style={{ color: "#334155" }}>{h.by}</strong> — {h.text}
              </div>
            ))}
          </div>
        )}

        {/* 管理者: カスタム操作 */}
        {canField && (
          <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
            <button style={sx.smallBtn}
              onClick={async () => { const n = await taskApi.ui.prompt(`「${task.name}」の下に追加するサブ作業名`, "", "例: 支持金物取り付け"); if (n && n.trim()) addSubTask(task, n.trim()); }}>
              {tr("＋ サブ作業追加")}
            </button>
            <button style={{ ...sx.dangerBtn, padding: "6px 12px", fontSize: 12 }}
              onClick={async () => {
                const warn = children.length > 0 ? `「${task.name}」とサブ作業${children.length}件以上を削除しますか?` : `「${task.name}」を削除しますか?`;
                if (await taskApi.ui.confirm(warn, "削除", true)) deleteTask(task.id);
              }}>
              {tr("🗑 この作業を削除")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   指示タブ (管理者: 作成+既読確認 / 作業員: 受信+確認)
   ============================================================ */
function fmtDateTime(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function InstructionsTab({ taskApi, siteFloors, myInstructions, addInstruction, markInstructionRead, jumpZone, matApi }) {
  const { state, isAdmin, canField, myWorkerId, showToast } = taskApi;
  const [mode, setMode] = useState("inst"); // inst | mat
  const [text, setText] = useState("");
  const [target, setTarget] = useState("all"); // 'all' | 'team:ID' | 'worker:ID'
  const [zoneSel, setZoneSel] = useState("");
  const floorIds = new Set(siteFloors.map((f) => f.id));
  const siteZones = state.zones.filter((z) => floorIds.has(z.floorId));
  const pendingMat = state.materialRequests.filter((r) => r.status === "pending").length;

  function targetLabel(inst) {
    if (inst.targetType === "all") return "全員";
    if (inst.targetType === "team") {
      const g = state.teams.find((x) => x.id === inst.targetId);
      return g ? g.name : "班";
    }
    const w = state.workers.find((x) => x.id === inst.targetId);
    return w ? w.name : "作業員";
  }
  function targetMembers(inst) {
    if (inst.targetType === "all") return state.workers;
    if (inst.targetType === "team") {
      const g = state.teams.find((x) => x.id === inst.targetId);
      return g ? g.memberIds.map((id) => state.workers.find((w) => w.id === id)).filter(Boolean) : [];
    }
    const w = state.workers.find((x) => x.id === inst.targetId);
    return w ? [w] : [];
  }
  function send() {
    const t = text.trim();
    if (!t) { showToast("指示の内容を入力してください"); return; }
    let targetType = "all", targetId = null;
    if (target.startsWith("team:")) { targetType = "team"; targetId = target.slice(5); }
    if (target.startsWith("worker:")) { targetType = "worker"; targetId = target.slice(7); }
    addInstruction(t, targetType, targetId, zoneSel || null);
    setText(""); setZoneSel("");
    showToast("指示を送信しました");
  }

  return (
    <div style={{ padding: 12, overflowY: "auto", height: "100%" }}>
      {/* モード切替 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <button onClick={() => setMode("inst")} style={{ ...sx.floorChip, ...(mode === "inst" ? sx.floorChipActive : {}) }}>{tr("📣 指示")}</button>
        <button onClick={() => setMode("mat")} style={{ ...sx.floorChip, ...(mode === "mat" ? sx.floorChipActive : {}), position: "relative" }}>
          {tr("📦 材料発注")}{canField && pendingMat > 0 ? `(${pendingMat})` : ""}
        </button>
      </div>

      {mode === "mat" ? (
        <MaterialSection taskApi={taskApi} matApi={matApi} />
      ) : (
      <>
      {/* 指示作成 (管理者・リーダー) */}
      {canField && (
        <div style={{ ...sx.card }}>
          <div style={{ padding: 14 }}>
            <strong>{tr("📣 指示を出す")}</strong>
            <textarea
              value={text} onChange={(e) => setText(e.target.value)}
              placeholder="例: 本日中に1-1エリアの建て込みを完了してください"
              style={{ ...sx.textarea, marginTop: 8 }} rows={3}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <select value={target} onChange={(e) => setTarget(e.target.value)} style={{ ...sx.input, flex: 1, minWidth: 130 }}>
                <option value="all">{tr("👥 全員へ")}</option>
                {state.teams.map((g) => <option key={g.id} value={`team:${g.id}`}>🏳 {g.name}({g.memberIds.length}名)へ</option>)}
                {state.workers.map((w) => <option key={w.id} value={`worker:${w.id}`}>👤 {w.name}へ</option>)}
              </select>
              <select value={zoneSel} onChange={(e) => setZoneSel(e.target.value)} style={{ ...sx.input, flex: 1, minWidth: 130 }}>
                <option value="">{tr("エリアリンクなし")}</option>
                {siteZones.map((z) => {
                  const f = siteFloors.find((ff) => ff.id === z.floorId);
                  return <option key={z.id} value={z.id}>{f ? f.name + " / " : ""}{z.name}</option>;
                })}
              </select>
            </div>
            <button style={{ ...sx.primaryBtn, width: "100%", marginTop: 10, padding: "11px 0" }} onClick={send}>{tr("送信")}</button>
          </div>
        </div>
      )}

      {/* 指示一覧 */}
      {myInstructions.length === 0 && <div style={sx.empty}>指示はまだありません。</div>}
      {myInstructions.map((inst) => {
        const zone = inst.zoneId ? state.zones.find((z) => z.id === inst.zoneId) : null;
        const members = targetMembers(inst);
        const readMembers = members.filter((w) => inst.readBy.includes(w.id));
        const unread = taskApi.targetedToMe(inst) && !inst.readBy.includes(myWorkerId);
        return (
          <div key={inst.id} style={{ ...sx.card, borderLeft: unread ? "5px solid #FF4B00" : "5px solid transparent" }}>
            <div style={{ padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <span style={{ ...sx.prTag, background: "#1B2A41", color: "#fff" }}>→ {targetLabel(inst)}</span>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>{fmtDateTime(inst.createdAt)}</span>
                {unread && <span style={{ ...sx.prTag, background: "#FF4B00", color: "#fff" }}>{tr("未読")}</span>}
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{inst.text}</div>
              {zone && (
                <button style={{ ...sx.childChip, marginTop: 8 }} onClick={() => jumpZone(zone)}>
                  🗺 {dispName(zone.name)} — {tr("図面で見る")}
                </button>
              )}
              {/* 既読状況 (管理者・リーダー) */}
              {canField && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#475569" }}>
                  {tr("既読")} {readMembers.length}/{members.length}:
                  {members.map((w) => (
                    <span key={w.id} style={{
                      ...sx.workerChip, background: inst.readBy.includes(w.id) ? w.color : "#cbd5e1",
                      marginLeft: 4, opacity: inst.readBy.includes(w.id) ? 1 : 0.7,
                    }}>
                      {inst.readBy.includes(w.id) ? "✓" : ""}{w.name}
                    </span>
                  ))}
                </div>
              )}
              {/* 確認ボタン (自分宛ての指示のみ) */}
              {taskApi.targetedToMe(inst) && (
                unread ? (
                  <button style={{ ...sx.primaryBtn, marginTop: 10, width: "100%", padding: "11px 0" }}
                    onClick={() => { markInstructionRead(inst.id); showToast("確認済みにしました"); }}>
                    {tr("✓ 確認しました")}
                  </button>
                ) : (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#03AF7A", fontWeight: 700 }}>{tr("✓ 確認済み")}</div>
                )
              )}
            </div>
          </div>
        );
      })}
      </>
      )}
    </div>
  );
}

/* ---------- 材料発注セクション ---------- */
function MaterialSection({ taskApi, matApi }) {
  const { state, isAdmin, canField, myWorkerId, isViewer, showToast, ui } = taskApi;
  const { addMaterialRequest, setRequestStatus, cancelRequest } = matApi;
  const [matView, setMatView] = useState("list"); // list | agg (管理者集計)
  const [aggPeriod, setAggPeriod] = useState("week"); // today | week | all
  const [aggPendingOnly, setAggPendingOnly] = useState(true);
  const [groupSel, setGroupSel] = useState("");
  const [presetPart, setPresetPart] = useState("");
  const [freeName, setFreeName] = useState("");
  const [unit, setUnit] = useState("個");
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState([]);
  const [note, setNote] = useState("");

  /* グループ = 内蔵マスター + カスタムプリセット */
  const groups = [
    ...MATERIAL_MASTER.map((m, i) => ({ key: `b${i}`, name: m.g, parts: m.parts.map(([label, u]) => ({ label, unit: u })) })),
    ...state.materialPresets.map((p) => ({ key: `c${p.id}`, name: `★ ${p.workName}`, parts: p.parts.map((label) => ({ label, unit: "個" })) })),
  ];
  const group = groups.find((g) => g.key === groupSel) || null;

  /* 手入力サジェスト (型番部分一致) */
  const allParts = [
    ...MASTER_FLAT,
    ...state.materialPresets.flatMap((p) => p.parts.map((label) => ({ label, unit: "個", g: p.workName }))),
  ];
  const norm = (s) => String(s).toLowerCase().replace(/\s/g, "");
  const suggestions = freeName.trim().length >= 1
    ? allParts.filter((p) => norm(p.label).includes(norm(freeName))).slice(0, 6)
    : [];

  function pickPresetPart(label) {
    setPresetPart(label);
    const p = group && group.parts.find((x) => x.label === label);
    if (p) setUnit(p.unit);
  }
  function addToCart(name, u) {
    const nm = (name || "").trim();
    const n = Math.max(1, Math.floor(Number(qty) || 1));
    if (!nm) { showToast("材料名を選択または入力してください"); return; }
    const useUnit = u || unit || "個";
    setCart((c) => {
      const exists = c.find((x) => x.name === nm && x.unit === useUnit);
      if (exists) return c.map((x) => (x === exists ? { ...x, qty: x.qty + n } : x));
      return [...c, { name: nm, qty: n, unit: useUnit }];
    });
    setFreeName(""); setPresetPart(""); setQty(1);
  }
  function send() {
    if (cart.length === 0) { showToast("材料をリストに追加してください"); return; }
    addMaterialRequest(cart, note.trim());
    setCart([]); setNote("");
  }

  /* 集計 (管理者・発注用) */
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const weekStart = new Date(startToday); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const boundary = aggPeriod === "today" ? startToday : aggPeriod === "week" ? weekStart : null;
  const aggSource = state.materialRequests.filter((r) =>
    (!boundary || new Date(r.at) >= boundary) && (!aggPendingOnly || r.status === "pending")
  );
  const aggMap = new Map();
  for (const r of aggSource) {
    for (const it of r.items) {
      const key = `${it.name}|${it.unit || "個"}`;
      const cur = aggMap.get(key) || { name: it.name, unit: it.unit || "個", qty: 0, count: 0 };
      cur.qty += it.qty; cur.count += 1;
      aggMap.set(key, cur);
    }
  }
  const aggRows = [...aggMap.values()].sort((a, b) => b.qty - a.qty);

  return (
    <div>
      {/* 一覧/集計切替 (管理者・リーダー) */}
      {canField && (
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <button onClick={() => setMatView("list")} style={{ ...sx.floorChip, ...(matView === "list" ? sx.floorChipActive : {}) }}>{tr("📋 依頼一覧")}</button>
          <button onClick={() => setMatView("agg")} style={{ ...sx.floorChip, ...(matView === "agg" ? sx.floorChipActive : {}) }}>{tr("Σ 集計(発注用)")}</button>
        </div>
      )}

      {canField && matView === "agg" ? (
        <div style={{ ...sx.card }}>
          <div style={{ padding: 14 }}>
            <strong>{tr("Σ 材料の必要数 集計")}</strong>
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
              {[["today", "今日"], ["week", "今週"], ["all", "全期間"]].map(([k, label]) => (
                <button key={k} onClick={() => setAggPeriod(k)} style={{ ...sx.floorChip, ...(aggPeriod === k ? sx.floorChipActive : {}) }}>{tr(label)}</button>
              ))}
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, marginLeft: "auto", cursor: "pointer" }}>
                <input type="checkbox" checked={aggPendingOnly} onChange={(e) => setAggPendingOnly(e.target.checked)} />
                {tr("依頼中のみ")}
              </label>
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
              依頼日ベースで集計(今週=月曜起点)。このまま上位への発注リストに使えます。
            </div>
            {aggRows.length === 0 && <div style={{ ...sx.empty, padding: "14px 0" }}>該当する依頼はありません。</div>}
            {aggRows.map((row, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
                <span style={{ fontSize: 14, flex: 1 }}>{dispName(row.name)}</span>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>{row.count}{tr("件")}</span>
                <strong style={{ fontSize: 16, fontVariantNumeric: "tabular-nums" }}>{row.qty}</strong>
                <span style={{ fontSize: 12, color: "#475569", minWidth: 20 }}>{row.unit}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
      <>
      {/* 依頼作成 (閲覧専用以外) */}
      {!isViewer && (
        <div style={{ ...sx.card }}>
          <div style={{ padding: 14 }}>
            <strong>{tr("📦 材料の発注を依頼する")}</strong>
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>{tr("カタログから選択(未来工業・ネグロス電工 他)")}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <select value={groupSel} onChange={(e) => { setGroupSel(e.target.value); setPresetPart(""); }} style={{ ...sx.input, flex: 1, minWidth: 130 }}>
                  <option value="">{tr("分類を選択")}</option>
                  {groups.map((g) => <option key={g.key} value={g.key}>{dispName(g.name)}</option>)}
                </select>
                <select value={presetPart} onChange={(e) => pickPresetPart(e.target.value)} disabled={!group} style={{ ...sx.input, flex: 1.4, minWidth: 150 }}>
                  <option value="">{tr("材料を選択")}</option>
                  {group && group.parts.map((pt, i) => <option key={i} value={pt.label}>{dispName(pt.label)}</option>)}
                </select>
              </div>
            </div>
            <div style={{ fontSize: 12, color: "#475569", margin: "10px 0 4px" }}>{tr("または直接入力(型番の一部で候補が出ます)")}</div>
            <div style={{ position: "relative" }}>
              <input value={freeName} onChange={(e) => { setFreeName(e.target.value); setPresetPart(""); }}
                placeholder="材料名・型番(例: D1、VVF、ビニテ)" style={{ ...sx.input, width: "100%" }} />
              {suggestions.length > 0 && (
                <div style={sx.suggestBox}>
                  {suggestions.map((sug, i) => (
                    <button key={i} style={sx.suggestItem}
                      onClick={() => { setFreeName(sug.label); setUnit(sug.unit); }}>
                      <span style={{ flex: 1, textAlign: "left" }}>{dispName(sug.label)}</span>
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>{sug.g}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "#475569" }}>{tr("個数")}</span>
              <button style={sx.qtyBtn} onClick={() => setQty((q) => Math.max(1, Math.floor(Number(q) || 1) - 1))}>−</button>
              <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)}
                style={{ ...sx.input, width: 64, textAlign: "center" }} />
              <button style={sx.qtyBtn} onClick={() => setQty((q) => Math.max(1, Math.floor(Number(q) || 1) + 1))}>＋</button>
              <select value={unit} onChange={(e) => setUnit(e.target.value)} style={{ ...sx.input, width: 70 }}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <button style={{ ...sx.primaryBtn, marginLeft: "auto" }}
                onClick={() => addToCart(presetPart || freeName)}>
                {tr("＋ リストに追加")}
              </button>
            </div>

            {cart.length > 0 && (
              <div style={{ marginTop: 12, border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "8px 12px" }}>
                {cart.map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: i < cart.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                    <span style={{ fontSize: 14, flex: 1 }}>{dispName(item.name)}</span>
                    <strong style={{ fontVariantNumeric: "tabular-nums" }}>× {item.qty}{item.unit}</strong>
                    <button style={{ background: "none", border: "none", color: "#b91c1c", cursor: "pointer", fontSize: 14 }}
                      onClick={() => setCart((c) => c.filter((_, j) => j !== i))}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <input value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="ひとこと(例: 1-1エリアの建て込み分)" style={{ ...sx.input, width: "100%", marginTop: 8 }} />
            <button style={{ ...sx.primaryBtn, width: "100%", marginTop: 10, padding: "12px 0" }} onClick={send}>
              {tr("📦 材料の発注を依頼する")}({cart.length})
            </button>
          </div>
        </div>
      )}

      {/* 依頼一覧 */}
      {state.materialRequests.length === 0 && <div style={sx.empty}>発注依頼はまだありません。</div>}
      {state.materialRequests.map((r) => {
        const st = MREQ_STATUS[r.status] || MREQ_STATUS.pending;
        const mine = r.byId === myWorkerId;
        return (
          <div key={r.id} style={{ ...sx.card, borderLeft: `4px solid ${st.color}` }}>
            <div style={{ padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                <span style={{ ...sx.prTag, background: st.color, color: st.text }}>{tr(st.label)}</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{r.byName}</span>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>{fmtDateTime(r.at)}</span>
              </div>
              {r.items.map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "3px 0", borderBottom: "1px solid #f8fafc" }}>
                  <span>{dispName(item.name)}</span>
                  <strong style={{ fontVariantNumeric: "tabular-nums" }}>× {item.qty}{item.unit || "個"}</strong>
                </div>
              ))}
              {r.note && <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>💬 {r.note}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                {canField && r.status === "pending" && (
                  <button style={{ ...sx.primaryBtn, flex: 1 }} onClick={() => { setRequestStatus(r.id, "ordered"); showToast("発注済にしました"); }}>
                    {tr("📦 発注済にする")}
                  </button>
                )}
                {canField && r.status === "ordered" && (
                  <button style={{ ...sx.primaryBtn, flex: 1, background: "#03AF7A" }} onClick={() => { setRequestStatus(r.id, "delivered"); showToast("納品済にしました"); }}>
                    {tr("✅ 納品済にする")}
                  </button>
                )}
                {mine && r.status === "pending" && !canField && (
                  <button style={{ ...sx.smallBtn, flex: 1 }}
                    onClick={async () => { if (await ui.confirm("この依頼を取り消しますか?", "取り消す", true)) cancelRequest(r.id); }}>
                    {tr("依頼を取り消す")}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
      </>
      )}
    </div>
  );
}

/* ============================================================
   作業一覧タブ
   ============================================================ */
function TasksTab({ taskApi, siteFloors, floorId, setFloorId }) {
  const { state, derived, myWorkerId, isAdmin } = taskApi;
  const [filter, setFilter] = useState(!taskApi.canField && myWorkerId ? "mine" : "all");
  const floor = siteFloors.find((f) => f.id === floorId) || siteFloors[0] || null;
  const floorZones = floor ? state.zones.filter((z) => z.floorId === floor.id) : [];
  const zonesSorted = [...floorZones].sort((a, b) => (a.priority || 9) - (b.priority || 9));

  return (
    <div style={{ padding: 12, overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {siteFloors.map((f) => (
          <button key={f.id} onClick={() => setFloorId(f.id)} style={{ ...sx.floorChip, ...(floor && f.id === floor.id ? sx.floorChipActive : {}) }}>{f.name}</button>
        ))}
        {myWorkerId && (
          <button onClick={() => setFilter(filter === "mine" ? "all" : "mine")}
            style={{ ...sx.floorChip, ...(filter === "mine" ? { background: "#005AFF", color: "#fff", borderColor: "#005AFF" } : {}) }}>
            {tr("👤 自分の作業")}
          </button>
        )}
        <button onClick={() => setFilter(filter === "issue" ? "all" : "issue")}
          style={{ ...sx.floorChip, ...(filter === "issue" ? { background: STATUS.issue.color, color: "#fff", borderColor: STATUS.issue.color } : {}) }}>
          {tr("⚠ 問題のみ")}
        </button>
      </div>

      {filter === "mine" && myWorkerId ? (
        <MyTasksList taskApi={taskApi} floorZones={floorZones} />
      ) : (
        <>
          {zonesSorted.filter((z) => !z.parentZoneId).map((z) => (
            <ZoneTaskCard key={z.id} zone={z} taskApi={taskApi} filter={filter} />
          ))}
          {zonesSorted.length === 0 && <div style={sx.empty}>このフロアにはまだエリアがありません。図面タブで「＋ エリア追加」から作成してください。</div>}
        </>
      )}
    </div>
  );
}

function MyTasksList({ taskApi, floorZones }) {
  const { state, derived, myWorkerId, myTeamIds } = taskApi;
  const zoneIds = new Set(floorZones.map((z) => z.id));
  const mine = state.tasks.filter((t) =>
    zoneIds.has(t.zoneId) &&
    (t.assigneeIds.includes(myWorkerId) || (t.teamIds || []).some((id) => myTeamIds.has(id)))
  );
  if (mine.length === 0) return <div style={sx.empty}>このフロアであなたに割り当てられた作業はありません。</div>;
  const byZone = new Map();
  for (const t of mine) {
    if (!byZone.has(t.zoneId)) byZone.set(t.zoneId, []);
    byZone.get(t.zoneId).push(t);
  }
  return (
    <>
      {[...byZone.entries()].map(([zoneId, tasks]) => {
        const z = state.zones.find((zz) => zz.id === zoneId);
        return (
          <div key={zoneId} style={sx.card}>
            <div style={{ padding: "10px 14px", fontWeight: 700, fontSize: 14, borderBottom: "1px solid #f1f5f9" }}>{z ? z.name : "?"}</div>
            {tasks.map((t) => <TaskRow key={t.id} task={t} depth={0} taskApi={taskApi} />)}
          </div>
        );
      })}
    </>
  );
}

function ZoneTaskCard({ zone, taskApi, filter }) {
  const { state, derived } = taskApi;
  const [open, setOpen] = useState(true);
  const prog = derived.zoneProgress.get(zone.id) || 0;
  const pr = zone.priority ? PRIORITY[zone.priority] : null;
  const children = derived.childZones.get(zone.id) || [];
  const issueTasks = (derived.tasksByZone.get(zone.id) || []).filter((t) => t.status === "issue");

  if (filter === "issue") {
    const childIssues = children.some((c) => (derived.zoneIssues.get(c.id) || 0) > 0);
    if (issueTasks.length === 0 && !childIssues) return null;
  }

  return (
    <div style={{ ...sx.card, borderTop: `6px solid ${pr ? pr.color : "#cbd5e1"}` }}>
      <button style={sx.cardHead} onClick={() => setOpen(!open)}>
        <strong>{dispName(zone.name)}</strong>
        {pr && <span style={{ ...sx.prTag, background: pr.color, color: pr.text }}>{tr(pr.label)}</span>}
        <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums", fontSize: 13 }}>{Math.round(prog)}%</span>
        <span>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <>
          {filter !== "issue" ? (
            <TaskTree zoneId={zone.id} taskApi={taskApi} />
          ) : (
            issueTasks.map((t) => (
              <div key={t.id} style={{ ...sx.taskRow, borderLeft: `5px solid ${STATUS.issue.color}` }}>
                <button onClick={() => taskApi.openStatus(t)} style={{ ...sx.statusBtn, background: STATUS.issue.color, color: "#fff" }}>{tr("問題あり")}</button>
                <div style={{ flex: 1 }} onClick={() => taskApi.openDetail(t)}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{t.name}</div>
                  <div style={sx.issueText}>{t.issueText}</div>
                </div>
              </div>
            ))
          )}
          {children.map((c) => (
            <div key={c.id} style={{ marginLeft: 10, borderLeft: "3px dashed #cbd5e1", paddingLeft: 6 }}>
              <ZoneTaskCard zone={c} taskApi={taskApi} filter={filter} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ============================================================
   予算トラッカー (管理者専用)
   人工数は出面表ベース(本番は業務システムの出面表と自動連携)
   ============================================================ */
const fmtYen = (n) => "¥" + Math.round(n).toLocaleString("ja-JP");
const MONTH_MS = 30.44 * 24 * 3600 * 1000;

/* 出面表の選択肢(本番は業務システムから一覧取得) */
const ATTENDANCE_SHEETS = [
  { id: "manual", label: "手入力(このアプリで記録)" },
  { id: "sys_site", label: "業務システム: この現場の出面表(連携予定)" },
  { id: "sys_common", label: "業務システム: 本社共通出面表(連携予定)" },
];

/* カンマ整形の金額入力(先頭ゼロなし) */
function MoneyInput({ value, onChange, suffix, width }) {
  return (
    <>
      <input
        type="text" inputMode="numeric"
        value={value ? value.toLocaleString("ja-JP") : ""}
        placeholder="0"
        onChange={(e) => onChange(Number(e.target.value.replace(/[^\d]/g, "")) || 0)}
        style={{ ...sx.input, flex: width ? undefined : 1, width, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
      />
      {suffix && <span style={{ fontSize: 12, color: "#94a3b8", minWidth: 28 }}>{suffix}</span>}
    </>
  );
}

function BudgetTab({ state, setState, site, showToast, ui }) {
  const b = (state.budgets || {})[site.id] || null;
  const enabled = !!(b && b.enabled);
  const [attDate, setAttDate] = useState(todayStr());
  const [attMd, setAttMd] = useState("");

  function updateBudget(patch) {
    setState((s) => ({
      ...s,
      budgets: {
        ...(s.budgets || {}),
        [site.id]: {
          enabled: true,
          contractAmount: 0, targetType: "percent", targetValue: 10,
          costPerManDay: 25000, monthlyExpense: 0,
          periodStart: todayStr(), periodEnd: todayStr(),
          preManDays: 0, attendance: [], attendanceSheet: "manual",
          ...((s.budgets || {})[site.id] || {}),
          ...patch,
        },
      },
    }));
  }
  function addAttendance() {
    const md = Number(attMd);
    if (!attDate || !md || md <= 0) { showToast("日付と人工数を入力してください"); return; }
    updateBudget({ attendance: [...(b ? b.attendance : []), { id: uid("a"), date: attDate, manDays: md }].sort((x, y) => x.date.localeCompare(y.date)) });
    setAttMd("");
    showToast(`${fmtDate(attDate)} に ${md}人工を記録しました`);
  }

  /* ---------- 計算 ---------- */
  const calc = useMemo(() => {
    if (!b || !b.contractAmount) return null;
    const start = new Date(b.periodStart + "T00:00:00");
    const end = new Date(b.periodEnd + "T00:00:00");
    const now = new Date();
    const totalMonths = Math.max((end - start) / MONTH_MS, 0.1);
    const elapsedMonths = Math.min(Math.max((now - start) / MONTH_MS, 0), totalMonths);
    const remainingMonths = Math.max(totalMonths - elapsedMonths, 0);
    const targetProfit = b.targetType === "percent" ? (b.contractAmount * b.targetValue) / 100 : b.targetValue;
    const budgetCap = b.contractAmount - targetProfit;
    const attMd = (b.attendance || []).reduce((a, x) => a + x.manDays, 0);
    const usedManDays = (b.preManDays || 0) + attMd;
    const laborCost = usedManDays * b.costPerManDay;
    const expenseCost = b.monthlyExpense * elapsedMonths;
    const usedTotal = laborCost + expenseCost;
    const remainingBudget = budgetCap - usedTotal;
    const futureExpense = b.monthlyExpense * remainingMonths;
    const allowableManDays = (remainingBudget - futureExpense) / b.costPerManDay;
    const paceNeeded = remainingMonths > 0.05 ? allowableManDays / remainingMonths : 0;
    const currentPace = elapsedMonths > 0.05 ? usedManDays / elapsedMonths : 0;
    const periodPct = (elapsedMonths / totalMonths) * 100;
    const budgetPct = budgetCap > 0 ? (usedTotal / budgetCap) * 100 : 0;
    return { totalMonths, elapsedMonths, remainingMonths, targetProfit, budgetCap, usedManDays, attMd, laborCost, expenseCost, usedTotal, remainingBudget, allowableManDays, paceNeeded, currentPace, periodPct, budgetPct };
  }, [b]);

  const moneyRow = (label, key) => (
    <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13 }}>
      <span style={{ minWidth: 110, color: "#475569" }}>{tr(label)}</span>
      <MoneyInput value={b ? b[key] : 0} onChange={(v) => updateBudget({ [key]: v })} suffix="円" />
    </label>
  );
  const profitAmount = b ? (b.targetType === "percent" ? (b.contractAmount * b.targetValue) / 100 : b.targetValue) : 0;

  if (!enabled) {
    return (
      <div style={{ padding: 12, overflowY: "auto", height: "100%" }}>
        <div style={{ ...sx.card }}>
          <div style={{ padding: 18, textAlign: "center" }}>
            <div style={{ fontSize: 40 }}>💰</div>
            <strong style={{ fontSize: 16 }}>{tr("💰 予算トラッカー")}</strong>
            <div style={{ fontSize: 13, color: "#64748b", margin: "10px 0 4px", lineHeight: 1.8, textAlign: "left" }}>
              工期・契約金額・人工単価から「あと何人工使えるか」を自動計算する機能です。<br />
              <strong>常駐現場(出勤分だけ請求する現場)など逆算が不要な場合は、この画面のままでOK</strong>。何も設定しなくてもアプリの他の機能に影響はありません。
            </div>
            <button style={{ ...sx.primaryBtn, width: "100%", marginTop: 12, padding: "13px 0", fontSize: 14 }}
              onClick={() => { updateBudget({ enabled: true }); showToast(`「${site.name}」で予算トラッカーを有効化しました`); }}>
              {tr("この現場で予算トラッカーを使う")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 12, overflowY: "auto", height: "100%" }}>
      {/* サマリー */}
      {calc && (
        <div style={{ ...sx.card }}>
          <div style={{ padding: 14 }}>
            <div style={{ fontSize: 13, color: "#475569" }}>{site.name} — {tr("💰 予算トラッカー")}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <div style={{ ...sx.statBox, minWidth: 140 }}>
                <div style={{ ...sx.statNum, fontSize: 22, color: calc.remainingBudget < 0 ? "#FF4B00" : "#03AF7A" }}>{fmtYen(calc.remainingBudget)}</div>
                <div style={sx.statLbl}>{tr("残り予算")}(利益確保後)</div>
              </div>
              <div style={{ ...sx.statBox, minWidth: 140 }}>
                <div style={{ ...sx.statNum, fontSize: 22 }}>{fmtYen(calc.usedTotal)}</div>
                <div style={sx.statLbl}>{tr("使用済み")}(人工{Math.round(calc.usedManDays * 10) / 10} + 経費)</div>
              </div>
            </div>
            {/* 工期 vs 予算 */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#475569" }}>
                <span>{tr("工期消化")} {Math.round(calc.periodPct)}%</span>
                <span style={{ color: calc.budgetPct > calc.periodPct + 5 ? "#FF4B00" : "#475569", fontWeight: calc.budgetPct > calc.periodPct + 5 ? 700 : 400 }}>
                  {tr("予算消化")} {Math.round(calc.budgetPct)}%{calc.budgetPct > calc.periodPct + 5 ? " ⚠" : ""}
                </span>
              </div>
              <div style={{ ...sx.miniBarTrack, height: 10, marginTop: 4 }}>
                <div style={{ ...sx.miniBarFill, height: 10, width: `${Math.min(calc.periodPct, 100)}%`, background: "#94a3b8" }} />
              </div>
              <div style={{ ...sx.miniBarTrack, height: 10, marginTop: 4 }}>
                <div style={{ ...sx.miniBarFill, height: 10, width: `${Math.min(calc.budgetPct, 100)}%`, background: calc.budgetPct > calc.periodPct + 5 ? "#FF4B00" : "#005AFF" }} />
              </div>
            </div>
            {/* ペース */}
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <div style={{ ...sx.statBox, minWidth: 140, background: "#eff6ff" }}>
                <div style={{ ...sx.statNum, fontSize: 24, color: "#1d4ed8" }}>{calc.paceNeeded > 0 ? (Math.round(calc.paceNeeded * 10) / 10) : "—"}</div>
                <div style={sx.statLbl}>{tr("使用できる人工の上限(月平均)")}</div>
              </div>
              <div style={{ ...sx.statBox, minWidth: 120 }}>
                <div style={{ ...sx.statNum, fontSize: 24 }}>{Math.round(calc.currentPace * 10) / 10}</div>
                <div style={sx.statLbl}>{tr("現在ペース")}(人工/月)</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 10, lineHeight: 1.7 }}>
              予算上限 {fmtYen(calc.budgetCap)}(契約 {fmtYen(b.contractAmount)} − 目標利益 {fmtYen(calc.targetProfit)})
              ／ 残工期 {Math.round(calc.remainingMonths * 10) / 10}ヶ月 ／ 使用可能な残り人工 約{Math.max(Math.floor(calc.allowableManDays), 0)}人工
            </div>
          </div>
        </div>
      )}

      {/* 設定 */}
      <div style={sx.card}>
        <div style={{ padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <strong style={{ flex: 1 }}>⚙ プロジェクト設定</strong>
            <button style={{ ...sx.smallBtn, fontSize: 11 }}
              onClick={async () => { if (await ui.confirm("この現場の予算トラッカーを無効化しますか?\n(設定と出面記録は保持され、再有効化で戻ります)", "無効化")) { updateBudget({ enabled: false }); showToast("予算トラッカーを無効化しました(常駐現場向け)"); } }}>
              この現場では使わない
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13 }}>
            <span style={{ minWidth: 110, color: "#475569" }}>{tr("工期")}</span>
            <input type="date" value={b ? b.periodStart : ""} onChange={(e) => updateBudget({ periodStart: e.target.value })} style={{ ...sx.input, flex: 1 }} />
            <span>〜</span>
            <input type="date" value={b ? b.periodEnd : ""} onChange={(e) => updateBudget({ periodEnd: e.target.value })} style={{ ...sx.input, flex: 1 }} />
          </div>
          {moneyRow("契約金額", "contractAmount")}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13 }}>
            <span style={{ minWidth: 110, color: "#475569" }}>{tr("目標利益")}</span>
            <select value={b ? b.targetType : "percent"} onChange={(e) => updateBudget({ targetType: e.target.value })} style={{ ...sx.input, width: 70 }}>
              <option value="percent">%</option>
              <option value="amount">円</option>
            </select>
            {b && b.targetType === "percent" ? (
              <input type="text" inputMode="numeric" value={b.targetValue || ""} placeholder="0"
                onChange={(e) => updateBudget({ targetValue: Number(e.target.value.replace(/[^\d]/g, "")) || 0 })}
                style={{ ...sx.input, flex: 1, textAlign: "right", fontVariantNumeric: "tabular-nums" }} />
            ) : (
              <MoneyInput value={b ? b.targetValue : 0} onChange={(v) => updateBudget({ targetValue: v })} />
            )}
          </div>
          {b && b.targetType === "percent" && b.contractAmount > 0 && (
            <div style={{ fontSize: 12, color: "#1d4ed8", fontWeight: 700, marginTop: 4, marginLeft: 118, fontVariantNumeric: "tabular-nums" }}>
              = {fmtYen(profitAmount)}
            </div>
          )}
          {moneyRow("人工単価", "costPerManDay")}
          {moneyRow("月間経費", "monthlyExpense")}
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13 }}>
            <span style={{ minWidth: 110, color: "#475569" }}>{tr("導入前の人工数")}</span>
            <input type="text" inputMode="decimal" value={b && b.preManDays ? String(b.preManDays) : ""} placeholder="0"
              onChange={(e) => updateBudget({ preManDays: parseFloat(e.target.value.replace(/[^\d.]/g, "")) || 0 })}
              style={{ ...sx.input, flex: 1, textAlign: "right", fontVariantNumeric: "tabular-nums" }} />
            <span style={{ fontSize: 12, color: "#94a3b8", minWidth: 28 }}>人工</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13 }}>
            <span style={{ minWidth: 110, color: "#475569" }}>{tr("連携する出面表")}</span>
            <select value={b ? b.attendanceSheet || "manual" : "manual"}
              onChange={(e) => updateBudget({ attendanceSheet: e.target.value })}
              style={{ ...sx.input, flex: 1 }}>
              {ATTENDANCE_SHEETS.map((sh) => <option key={sh.id} value={sh.id}>{tr(sh.label)}</option>)}
            </select>
          </label>
          {b && b.attendanceSheet !== "manual" && (
            <div style={{ fontSize: 11, color: "#b45309", marginTop: 4, marginLeft: 118 }}>
              ⏳ 連携は本番移行後に有効化されます。それまでは下の手入力が使われます。
            </div>
          )}
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8, lineHeight: 1.6 }}>
            ※ 出面管理を途中から導入した現場は「導入前の人工数」に過去分を入力すると正確に計算されます。<br />
            ※ 本番移行後は人工数を業務システムの出面表から自動取得します(手入力は補正用として残ります)。
          </div>
        </div>
      </div>

      {/* 出面入力 */}
      <div style={{ ...sx.card }}>
        <div style={{ padding: 14 }}>
          <strong>👷 {tr("出面(人工)を記録")}</strong>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <input type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)} style={{ ...sx.input, flex: 1, minWidth: 130 }} />
            <input type="number" step="0.5" min="0.5" value={attMd} onChange={(e) => setAttMd(e.target.value)}
              placeholder="人工数(例: 6)" style={{ ...sx.input, width: 120, textAlign: "right" }} />
            <button style={sx.primaryBtn} onClick={addAttendance}>{tr("登録")}</button>
          </div>
          {b && b.attendance.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {[...b.attendance].reverse().slice(0, 10).map((a) => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
                  <span style={{ fontVariantNumeric: "tabular-nums", color: "#475569" }}>{fmtDate(a.date)}</span>
                  <strong style={{ flex: 1, fontVariantNumeric: "tabular-nums" }}>{a.manDays} 人工</strong>
                  <button style={{ background: "none", border: "none", color: "#b91c1c", cursor: "pointer" }}
                    onClick={async () => { if (await ui.confirm(`${fmtDate(a.date)} の ${a.manDays}人工を削除しますか?`, "削除", true)) updateBudget({ attendance: b.attendance.filter((x) => x.id !== a.id) }); }}>✕</button>
                </div>
              ))}
              {calc && <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>記録合計: {Math.round(calc.attMd * 10) / 10}人工(+ 導入前 {b.preManDays || 0}人工)</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   配置ボード (朝礼用 / 割当から自動生成・毎日の入力不要)
   ============================================================ */
function BoardTab({ taskApi, siteFloors }) {
  const { state, derived, myWorkerId, openDetail } = taskApi;
  const [view, setView] = useState("people"); // people | zone
  const floorIds = new Set(siteFloors.map((f) => f.id));
  const zoneById = new Map(state.zones.map((z) => [z.id, z]));
  const siteTasks = state.tasks.filter((t) => {
    const z = zoneById.get(t.zoneId);
    return z && floorIds.has(z.floorId);
  });
  const activeLeaf = siteTasks.filter((t) => derived.isLeaf(t) && t.status !== "done");

  const teamsByMember = new Map();
  state.teams.forEach((g) => g.memberIds.forEach((id) => {
    if (!teamsByMember.has(id)) teamsByMember.set(id, []);
    teamsByMember.get(id).push(g);
  }));
  const tasksForWorker = (wid) => {
    const gids = new Set((teamsByMember.get(wid) || []).map((g) => g.id));
    return activeLeaf.filter((t) => t.assigneeIds.includes(wid) || (t.teamIds || []).some((id) => gids.has(id)));
  };
  const workersForTask = (t) => {
    const set = new Map();
    t.assigneeIds.forEach((id) => { const w = state.workers.find((x) => x.id === id); if (w) set.set(w.id, w); });
    (t.teamIds || []).forEach((gid) => {
      const g = state.teams.find((x) => x.id === gid);
      if (g) g.memberIds.forEach((id) => { const w = state.workers.find((x) => x.id === id); if (w) set.set(w.id, w); });
    });
    return [...set.values()];
  };

  const StatusChip = ({ t }) => (
    <span style={{ ...sx.prTag, background: STATUS[t.status].color, color: "#fff" }}>
      {STATUS[t.status].icon} {tr(STATUS[t.status].label)}
    </span>
  );

  return (
    <div style={{ padding: 12, overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
        <button onClick={() => setView("people")} style={{ ...sx.floorChip, ...(view === "people" ? sx.floorChipActive : {}) }}>{tr("👷 人別")}</button>
        <button onClick={() => setView("zone")} style={{ ...sx.floorChip, ...(view === "zone" ? sx.floorChipActive : {}) }}>{tr("🗺 エリア別")}</button>
      </div>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 10 }}>
        現在の割り当てから自動生成されます(毎日の入力は不要)。「途中」の作業は前回からの継続中です。
      </div>

      {view === "people" ? (
        <>
          {state.workers.map((w) => {
            const tasks = tasksForWorker(w.id);
            const groups = new Map();
            tasks.forEach((t) => {
              if (!groups.has(t.zoneId)) groups.set(t.zoneId, []);
              groups.get(t.zoneId).push(t);
            });
            const myTeams = teamsByMember.get(w.id) || [];
            return (
              <div key={w.id} style={{ ...sx.card, borderLeft: `6px solid ${w.color}`, ...(w.id === myWorkerId ? { outline: "2px solid #005AFF", outlineOffset: -2 } : {}) }}>
                <div style={{ padding: "10px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong>{w.name}</strong>
                    <span style={{ fontSize: 12 }}>{(ROLES[w.role] || ROLES.worker).icon}</span>
                    {myTeams.map((g) => (
                      <span key={g.id} style={{ ...sx.teamChip, borderColor: g.color, color: g.color }}>{g.name}</span>
                    ))}
                    <span style={{ marginLeft: "auto", fontSize: 12, color: "#64748b", fontVariantNumeric: "tabular-nums" }}>
                      {tasks.length ? `${tasks.length}件` : ""}
                    </span>
                  </div>
                  {tasks.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>{tr("未配置(担当作業なし)")}</div>
                  ) : (
                    [...groups.entries()].map(([zoneId, ts]) => {
                      const z = zoneById.get(zoneId);
                      return (
                        <div key={zoneId} style={{ marginTop: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>📍 {z ? dispName(z.name) : "?"}</div>
                          {ts.map((t) => (
                            <button key={t.id} onClick={() => openDetail(t)}
                              style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: "1px solid #f1f5f9", padding: "6px 0", cursor: "pointer", flexWrap: "wrap" }}>
                              <span style={{ fontSize: 13, flex: 1, minWidth: 120 }}>{dispName(t.name, t.romaji)}</span>
                              {t.status === "progress" && <span style={{ ...sx.prTag, background: "#e0f2fe", color: "#0369a1" }}>{tr("↻ 継続中")}</span>}
                              <StatusChip t={t} />
                            </button>
                          ))}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </>
      ) : (
        <>
          {state.zones.filter((z) => floorIds.has(z.floorId)).map((z) => {
            const ts = activeLeaf.filter((t) => t.zoneId === z.id);
            if (ts.length === 0) return null;
            const people = new Map();
            ts.forEach((t) => workersForTask(t).forEach((w) => people.set(w.id, w)));
            const f = siteFloors.find((ff) => ff.id === z.floorId);
            const pr = z.priority ? PRIORITY[z.priority] : null;
            return (
              <div key={z.id} style={{ ...sx.card, borderTop: `6px solid ${pr ? pr.color : "#cbd5e1"}` }}>
                <div style={{ padding: "10px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong>{f ? f.name + " / " : ""}{dispName(z.name)}</strong>
                    {pr && <span style={{ ...sx.prTag, background: pr.color, color: pr.text }}>{tr(pr.label)}</span>}
                    <span style={{ marginLeft: "auto", fontSize: 12, color: "#64748b" }}>{ts.length}件</span>
                  </div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
                    {people.size === 0
                      ? (z.workStatus === "paused"
                        ? <span style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>{tr("⏸ 作業予定なし(設定済み)")}</span>
                        : <span style={{ fontSize: 12, color: "#b45309", fontWeight: 700 }}>{tr("⚠ 担当者未割当")}</span>)
                      : [...people.values()].map((w) => (
                        <span key={w.id} style={{ ...sx.workerChip, background: w.color, fontSize: 12, padding: "4px 10px" }}>{w.name}</span>
                      ))}
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

/* ============================================================
   ダッシュボード
   ============================================================ */
function DashTab({ taskApi, site, siteFloors, setTab, setFloorId, setSelectedZoneId }) {
  const { state, derived } = taskApi;
  const floorIds = new Set(siteFloors.map((f) => f.id));
  const siteZoneIds = new Set(state.zones.filter((z) => floorIds.has(z.floorId)).map((z) => z.id));
  const siteTasks = state.tasks.filter((t) => siteZoneIds.has(t.zoneId));
  const allLeaf = siteTasks.filter((t) => derived.isLeaf(t));
  const count = (s) => allLeaf.filter((t) => t.status === s).length;
  const total = allLeaf.length || 1;
  const topZones = state.zones.filter((z) => floorIds.has(z.floorId) && !z.parentZoneId);
  const overallProg = topZones.length
    ? topZones.reduce((a, z) => a + (derived.zoneProgress.get(z.id) || 0), 0) / topZones.length : 0;
  const issues = siteTasks.filter((t) => t.status === "issue");
  const overdueTasks = allLeaf.filter((t) => t.dueDate && t.status !== "done" && t.dueDate < todayStr());
  const startLateTasks = allLeaf.filter((t) => t.startDate && t.status === "todo" && t.startDate < todayStr());

  const jumpToTask = (t) => {
    const z = state.zones.find((zz) => zz.id === t.zoneId);
    if (z) { setFloorId(z.floorId); setSelectedZoneId(z.id); setTab("map"); }
  };

  return (
    <div style={{ padding: 12, overflowY: "auto", height: "100%" }}>
      <div style={sx.card}>
        <div style={{ padding: 14 }}>
          <div style={{ fontSize: 13, color: "#475569" }}>{site.name} — {tr("全体進捗")}</div>
          <div style={{ fontSize: 44, fontWeight: 800, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
            {Math.round(overallProg)}<span style={{ fontSize: 22 }}>%</span>
          </div>
          <div style={{ ...sx.miniBarTrack, height: 12, marginTop: 8 }}>
            <div style={{ ...sx.miniBarFill, width: `${overallProg}%`, height: 12, background: overallProg >= 100 ? STATUS.done.color : "#005AFF" }} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            {Object.entries(STATUS).map(([k, v]) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13 }}>
                <span style={{ ...sx.legendSwatch, background: v.color }} />
                {tr(v.label)} <strong style={{ fontVariantNumeric: "tabular-nums" }}>{count(k)}</strong>
                <span style={{ color: "#94a3b8", fontSize: 11 }}>({Math.round((count(k) / total) * 100)}%)</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 期限アラート */}
      {(overdueTasks.length > 0 || startLateTasks.length > 0) && (
        <div style={{ ...sx.card }}>
          <div style={{ padding: 14 }}>
            <strong>{tr("📅 期限アラート")} ({overdueTasks.length + startLateTasks.length})</strong>
            {overdueTasks.map((t) => {
              const z = state.zones.find((zz) => zz.id === t.zoneId);
              return (
                <button key={t.id} style={sx.issueRow} onClick={() => jumpToTask(t)}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{z ? z.name : "?"} — {t.name}</div>
                  <div style={{ fontSize: 12, color: "#7f1d1d" }}>期限超過: {fmtDate(t.dueDate)} まで / 状態: {STATUS[t.status].label}</div>
                </button>
              );
            })}
            {startLateTasks.map((t) => {
              const z = state.zones.find((zz) => zz.id === t.zoneId);
              return (
                <button key={t.id} style={{ ...sx.issueRow, background: "#fffbeb", borderColor: "#fde68a" }} onClick={() => jumpToTask(t)}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e" }}>{z ? z.name : "?"} — {t.name}</div>
                  <div style={{ fontSize: 12, color: "#92400e" }}>開始遅れ: {fmtDate(t.startDate)} 開始予定のまま未着手</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 問題あり一覧 */}
      <div style={{ ...sx.card, borderTop: `6px solid ${STATUS.issue.color}` }}>
        <div style={{ padding: 14 }}>
          <strong>{tr("⚠ 問題あり")} ({issues.length})</strong>
          {issues.length === 0 && <div style={{ ...sx.empty, padding: "10px 0" }}>{tr("問題の報告はありません 👍")}</div>}
          {issues.map((t) => {
            const z = state.zones.find((zz) => zz.id === t.zoneId);
            const f = z && state.floors.find((ff) => ff.id === z.floorId);
            return (
              <button key={t.id} style={sx.issueRow} onClick={() => jumpToTask(t)}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{f ? f.name + " / " : ""}{z ? z.name : "?"} — {t.name}</div>
                <div style={{ fontSize: 12, color: "#7f1d1d" }}>{t.issueText || "(詳細未記入)"}</div>
                {t.issuePhotos && t.issuePhotos.length > 0 && (
                  <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                    {t.issuePhotos.map((p, i) => <img key={i} src={p} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6 }} />)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* フロア別 */}
      <div style={sx.card}>
        <div style={{ padding: 14 }}>
          <strong>{tr("フロア別進捗")}</strong>
          {siteFloors.map((f) => {
            const zs = state.zones.filter((z) => z.floorId === f.id && !z.parentZoneId);
            const p = zs.length ? zs.reduce((a, z) => a + (derived.zoneProgress.get(z.id) || 0), 0) / zs.length : 0;
            return (
              <div key={f.id} style={{ marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span>{f.name} <span style={{ color: "#94a3b8" }}>({zs.length}エリア)</span></span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{Math.round(p)}%</span>
                </div>
                <div style={sx.miniBarTrack}><div style={{ ...sx.miniBarFill, width: `${p}%`, background: p >= 100 ? STATUS.done.color : "#005AFF" }} /></div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 優先度別残作業 */}
      <div style={sx.card}>
        <div style={{ padding: 14 }}>
          <strong>{tr("優先度別の残作業(未完了)")}</strong>
          {Object.entries(PRIORITY).map(([k, v]) => {
            const n = allLeaf.filter((t) => t.status !== "done" && effectivePriority(t, state) === Number(k)).length;
            return (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13 }}>
                <span style={{ ...sx.prTag, background: v.color, color: v.text, minWidth: 58, textAlign: "center" }}>{tr(v.label)}</span>
                <strong style={{ fontVariantNumeric: "tabular-nums" }}>{n}</strong> 件
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   設定タブ (管理者のみ)
   ============================================================ */
/* ============================================================
   学習と改善提案 (利用ログから自動生成)
   ============================================================ */
function InsightsCard({ state, setState, showToast, ui, isAdmin }) {
  const logs = state.logs || [];
  const catalogSet = new Set(MASTER_FLAT.map((m) => m.label));
  const presetSet = new Set(state.materialPresets.flatMap((p) => p.parts));

  /* 提案1: 手入力材料の昇格 (2回以上・カタログ外) */
  const freeCounts = new Map();
  logs.filter((l) => l.t === "material" && l.freeInput).forEach((l) => {
    freeCounts.set(l.name, (freeCounts.get(l.name) || 0) + 1);
  });
  const promoteCandidates = [...freeCounts.entries()]
    .filter(([name, c]) => c >= 2 && !catalogSet.has(name) && !presetSet.has(name))
    .sort((a, b) => b[1] - a[1]);

  /* 提案2: 未使用の作業テンプレート (全エリアで一度も使われない葉) */
  const usedNames = new Set(state.tasks.map((t) => t.name));
  const flatTpl = [];
  (function walk(ns) { ns.forEach((n) => { if (!n.children || !n.children.length) flatTpl.push(n.name); walk(n.children || []); }); })(state.template);
  const unusedTpl = [...new Set(flatTpl)].filter((n) => !usedNames.has(n));

  /* 提案3: ローマ字未設定 (辞書で読めない漢字を含む作業) */
  const needsRomaji = state.tasks.filter((t) => {
    if (t.romaji && t.romaji.trim()) return false;
    const r = romanize(t.name);
    return /[\u4e00-\u9fff]/.test(r); // ローマ字化後も漢字が残る
  });
  const needsRomajiUniq = [...new Map(needsRomaji.map((t) => [t.name, t])).values()].slice(0, 8);

  /* 統計 */
  const doneCount = logs.filter((l) => l.t === "status" && l.status === "done").length;
  const issueCount = logs.filter((l) => l.t === "issue").length;
  const matLogs = logs.filter((l) => l.t === "material");
  const matCounts = new Map();
  matLogs.forEach((l) => matCounts.set(l.name, (matCounts.get(l.name) || 0) + (l.qty || 1)));
  const topMat = [...matCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const issueZones = new Map();
  logs.filter((l) => l.t === "issue" && l.zoneId).forEach((l) => issueZones.set(l.zoneId, (issueZones.get(l.zoneId) || 0) + 1));
  const topIssueZones = [...issueZones.entries()].map(([zid, c]) => ({ zone: state.zones.find((z) => z.id === zid), c })).filter((x) => x.zone).sort((a, b) => b.c - a.c).slice(0, 3);

  const totalSuggestions = promoteCandidates.length + (unusedTpl.length > 0 ? 1 : 0) + needsRomajiUniq.length;

  function promote(name) {
    setState((s) => {
      const gid = "★ よく使う材料";
      const exists = s.materialPresets.find((p) => p.workName === "よく使う材料");
      if (exists) {
        if (exists.parts.includes(name)) return s;
        return { ...s, materialPresets: s.materialPresets.map((p) => (p.id === exists.id ? { ...p, parts: [...p.parts, name] } : p)) };
      }
      return { ...s, materialPresets: [...s.materialPresets, { id: uid("mp"), workName: "よく使う材料", parts: [name] }] };
    });
    showToast(`「${name}」をプリセットに追加しました`);
  }

  return (
    <div style={{ ...sx.card }}>
      <div style={{ padding: 14 }}>
        <strong>{tr("📈 学習と改善提案")}{totalSuggestions > 0 ? ` (${totalSuggestions})` : ""}</strong>
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{tr("アプリの使われ方から自動で提案します")}</div>

        {/* 改善提案 */}
        <div style={{ fontSize: 13, fontWeight: 700, color: "#7c3aed", marginTop: 12 }}>💡 {tr("改善のヒント")}</div>
        {totalSuggestions === 0 && (
          <div style={{ ...sx.empty, padding: "12px 0" }}>{tr("提案はありません。使い込むほど提案が増えます 👍")}</div>
        )}

        {promoteCandidates.map(([name, c]) => (
          <div key={name} style={sx.suggestRow}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>📦 {tr("手入力の材料をプリセット化")}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>{dispName(name)}（{c}{tr("回入力")}）</div>
            </div>
            <button style={sx.primaryBtn} onClick={() => promote(name)}>{tr("プリセットに追加")}</button>
          </div>
        ))}

        {unusedTpl.length > 0 && (
          <div style={sx.suggestRow}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>🧹 {tr("未使用の作業テンプレート")}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>{unusedTpl.slice(0, 5).map((n) => dispName(n)).join("、")}{unusedTpl.length > 5 ? " 他" : ""} — {tr("テンプレートから削除できます")}</div>
            </div>
          </div>
        )}

        {needsRomajiUniq.length > 0 && (
          <div style={sx.suggestRow}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>🇧🇷 {tr("ローマ字未設定の作業")}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>{needsRomajiUniq.map((t) => t.name).join("、")}</div>
            </div>
          </div>
        )}

        {/* 統計 */}
        <div style={{ fontSize: 13, fontWeight: 700, color: "#475569", marginTop: 14 }}>📊 {tr("利用統計")}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <div style={sx.statBox}><div style={sx.statNum}>{doneCount}</div><div style={sx.statLbl}>{tr("完了した作業")}</div></div>
          <div style={sx.statBox}><div style={sx.statNum}>{issueCount}</div><div style={sx.statLbl}>{tr("報告された問題")}</div></div>
          <div style={sx.statBox}><div style={sx.statNum}>{matLogs.length}</div><div style={sx.statLbl}>{tr("材料発注(品目)")}</div></div>
        </div>

        {topMat.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>{tr("よく発注される材料 TOP5")}</div>
            {topMat.map(([name, qty], i) => (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13, borderBottom: "1px solid #f1f5f9" }}>
                <span style={{ color: "#94a3b8", width: 18 }}>{i + 1}.</span>
                <span style={{ flex: 1 }}>{dispName(name)}</span>
                <strong style={{ fontVariantNumeric: "tabular-nums" }}>{qty}</strong>
              </div>
            ))}
          </div>
        )}

        {topIssueZones.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>{tr("問題が多いエリア")}</div>
            {topIssueZones.map(({ zone, c }) => (
              <div key={zone.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13, borderBottom: "1px solid #f1f5f9" }}>
                <span style={{ flex: 1 }}>{dispName(zone.name)}</span>
                <span style={{ ...sx.prTag, background: STATUS.issue.color, color: "#fff" }}>⚠ {c}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 12, lineHeight: 1.6 }}>
          ※ ログは改善のための集計用です(直近1000件)。バックアップに含まれ、本番移行時はDBに引き継がれます。
        </div>
        {isAdmin && logs.length > 0 && (
          <button style={{ ...sx.smallBtn, marginTop: 8 }}
            onClick={async () => { if (await ui.confirm("利用ログを消去しますか?(提案・統計がリセットされます)", "消去", true)) { setState((s) => ({ ...s, logs: [] })); showToast("ログを消去しました"); } }}>
            {tr("ログを消去")}({logs.length})
          </button>
        )}
      </div>
    </div>
  );
}

function SettingsTab({ state, setState, showToast, me, ui, isAdmin, canField, themeApi, guideApi }) {
  const [name, setName] = useState("");
  const [teamName, setTeamName] = useState("");
  const palette = ["#005AFF", "#03AF7A", "#F6AA00", "#990099", "#FF4B00", "#4DC4FF"];
  const adminCount = state.workers.filter((w) => w.role === "admin").length;
  function addWorker() {
    const nm = name.trim();
    if (!nm) return;
    setState((s) => ({ ...s, workers: [...s.workers, { id: uid("w"), name: nm, color: palette[s.workers.length % palette.length], role: "worker", kind: "employee" }] }));
    setName("");
    showToast(`メンバー「${nm}」を追加しました`);
  }
  function setRole(w, role) {
    if (w.role === "admin" && role !== "admin" && adminCount <= 1) { showToast("管理者が0人になるため変更できません"); return; }
    setState((s) => ({ ...s, workers: s.workers.map((x) => (x.id === w.id ? { ...x, role } : x)) }));
    showToast(`${w.name}の権限を「${ROLES[role].label}」にしました`);
  }
  async function removeWorker(w) {
    if (w.id === me.id) { showToast("自分自身は削除できません"); return; }
    if (w.role === "admin" && adminCount <= 1) { showToast("最後の管理者は削除できません"); return; }
    if (!(await ui.confirm(`「${w.name}」を削除しますか?\n(担当作業・班からも外れます)`, "削除", true))) return;
    setState((s) => ({
      ...s,
      workers: s.workers.filter((x) => x.id !== w.id),
      tasks: s.tasks.map((t) => ({ ...t, assigneeIds: t.assigneeIds.filter((id) => id !== w.id) })),
      teams: s.teams.map((g) => ({ ...g, memberIds: g.memberIds.filter((id) => id !== w.id) })),
    }));
  }
  function addTeam() {
    const nm = teamName.trim();
    if (!nm) return;
    setState((s) => ({ ...s, teams: [...s.teams, { id: uid("g"), name: nm, color: palette[s.teams.length % palette.length], memberIds: [] }] }));
    setTeamName("");
    showToast(`班「${nm}」を作成しました。メンバーをタップで追加してください。`);
  }
  function toggleMember(teamId, workerId) {
    setState((s) => ({
      ...s,
      teams: s.teams.map((g) =>
        g.id === teamId
          ? { ...g, memberIds: g.memberIds.includes(workerId) ? g.memberIds.filter((x) => x !== workerId) : [...g.memberIds, workerId] }
          : g
      ),
    }));
  }
  function deleteTeam(teamId) {
    setState((s) => ({
      ...s,
      teams: s.teams.filter((g) => g.id !== teamId),
      tasks: s.tasks.map((t) => ({ ...t, teamIds: (t.teamIds || []).filter((id) => id !== teamId) })),
      instructions: s.instructions.filter((i) => !(i.targetType === "team" && i.targetId === teamId)),
    }));
  }
  const [shareName, setShareName] = useState("");
  const [shareScopes, setShareScopes] = useState({ map: true, tasks: false, board: false, dash: true });
  const importRef = useRef(null);
  const SCOPE_LABELS = { map: "図面", tasks: "作業一覧", board: "配置", dash: "全体" };
  function addShare() {
    const nm = shareName.trim();
    if (!nm) { showToast("共有ビューの名前を入力してください"); return; }
    if (!Object.values(shareScopes).some(Boolean)) { showToast("表示する画面を1つ以上選択してください"); return; }
    setState((s) => ({ ...s, shares: [...s.shares, { id: uid("sh"), name: nm, scopes: { ...shareScopes } }] }));
    setShareName("");
    showToast(`共有ビュー「${nm}」を作成しました(ログイン画面に表示されます)`);
  }
  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `genba-vision-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("バックアップをダウンロードしました");
  }
  function importJson(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const r = new FileReader();
    r.onload = async () => {
      try {
        const st = normalizeImported(JSON.parse(r.result));
        if (!(await ui.confirm("現在のデータをバックアップの内容で置き換えますか?", "置き換える", true))) return;
        setState(st);
        showToast("バックアップを読み込みました");
      } catch {
        showToast("読み込みに失敗しました。現場ビジョンのバックアップJSONを選択してください。");
      }
    };
    r.readAsText(file);
  }
  const [matWork, setMatWork] = useState("");
  const [matPart, setMatPart] = useState("");
  function addMaterialPreset() {
    const wk = matWork.trim(), pt = matPart.trim();
    if (!wk || !pt) { showToast("作業名と材料名の両方を入力してください"); return; }
    setState((s) => {
      const exists = s.materialPresets.find((p) => p.workName === wk);
      if (exists) {
        if (exists.parts.includes(pt)) return s;
        return { ...s, materialPresets: s.materialPresets.map((p) => (p.id === exists.id ? { ...p, parts: [...p.parts, pt] } : p)) };
      }
      return { ...s, materialPresets: [...s.materialPresets, { id: uid("mp"), workName: wk, parts: [pt] }] };
    });
    setMatPart("");
    showToast(`「${wk} → ${pt}」を登録しました`);
  }
  function removePresetPart(presetId, part) {
    setState((s) => ({
      ...s,
      materialPresets: s.materialPresets
        .map((p) => (p.id === presetId ? { ...p, parts: p.parts.filter((x) => x !== part) } : p))
        .filter((p) => p.parts.length > 0),
    }));
  }
  return (
    <div style={{ padding: 12, overflowY: "auto", height: "100%" }}>
      <div style={sx.card}>
        <div style={{ padding: 14 }}>
          <strong>{tr("📖 使い方ガイド")}</strong>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <button style={sx.primaryBtn} onClick={guideApi.openGuide}>{tr("ガイドを開く")}</button>
            <label style={{ fontSize: 12.5, color: "#475569", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={guideApi.showGuideBtn} onChange={(e) => guideApi.setShowGuideBtn(e.target.checked)} />
              {tr("画面右下の?ボタンを表示")}
            </label>
          </div>
        </div>
      </div>

      <ThemeSettingsCard {...themeApi} />
      {canField && <InsightsCard state={state} setState={setState} showToast={showToast} ui={ui} isAdmin={isAdmin} />}
      {isAdmin && (
      <div style={sx.card}>
        <div style={{ padding: 14 }}>
          <strong>{tr("メンバー")}</strong>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
            本番では業務システムの従業員名簿(ゲスト含む)と連携し、名前選択で追加できます。権限は3段階: 🛠管理者(全機能) / ⭐リーダー(予算・システム設定以外) / 👷作業員(現場入力のみ)。
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="氏名を入力"
              style={{ ...sx.input, flex: 1 }} onKeyDown={(e) => e.key === "Enter" && addWorker()} />
            <button style={sx.primaryBtn} onClick={addWorker}>追加</button>
          </div>
          <div style={{ marginTop: 12 }}>
            {state.workers.map((w) => (
              <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
                <span style={{ ...sx.workerDot, background: w.color, width: 14, height: 14 }} />
                <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>
                  {w.name}{w.id === me.id ? "(自分)" : ""}
                  {w.kind === "guest" && <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 4 }}>({tr("ゲスト")})</span>}
                </span>
                <select
                  value={w.role || "worker"}
                  onChange={(e) => setRole(w, e.target.value)}
                  style={{ ...sx.select, maxWidth: 110, fontWeight: 700 }}>
                  {Object.entries(ROLES).map(([k, r]) => <option key={k} value={k}>{r.icon} {tr(r.label)}</option>)}
                </select>
                <button
                  style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 30, height: 30, cursor: "pointer", color: "#b91c1c" }}
                  onClick={() => removeWorker(w)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      </div>
      )}

      {canField && (
      <div style={sx.card}>
        <div style={{ padding: 14 }}>
          <strong>{tr("班(チーム)")}</strong>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
            班を作ってメンバーをタップで追加。作業の割り当てや指示を班単位で出せます。
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="班名を入力(例: 3班)"
              style={{ ...sx.input, flex: 1 }} onKeyDown={(e) => e.key === "Enter" && addTeam()} />
            <button style={sx.primaryBtn} onClick={addTeam}>作成</button>
          </div>
          {state.teams.map((g) => (
            <div key={g.id} style={{ marginTop: 12, border: `1.5px solid ${g.color}`, borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong style={{ color: g.color }}>{g.name}</strong>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>{g.memberIds.length}名</span>
                <button style={{ background: "none", border: "none", color: "#94a3b8", marginLeft: "auto", cursor: "pointer", fontSize: 13 }}
                  onClick={async () => { if (await ui.confirm(`班「${g.name}」を削除しますか?\n(作業の割当・指示も解除)`, "削除", true)) deleteTeam(g.id); }}>🗑</button>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {state.workers.map((w) => {
                  const on = g.memberIds.includes(w.id);
                  return (
                    <button key={w.id} onClick={() => toggleMember(g.id, w.id)}
                      style={{
                        ...sx.prChip, borderColor: w.color,
                        background: on ? w.color : "#f8fafc", color: on ? "#fff" : "#334155",
                      }}>
                      {on ? "✓ " : ""}{w.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {canField && (
      <div style={{ ...sx.card }}>
        <div style={{ padding: 14 }}>
          <strong>{tr("📦 材料プリセット")}</strong>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
            「作業名 → 材料名」を登録すると、発注依頼画面でプルダウンから選べるようになります。同じ作業名で追加すると材料が追記されます。
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            <input value={matWork} onChange={(e) => setMatWork(e.target.value)} placeholder="作業名(例: 建て込み)"
              list="tpl-works" style={{ ...sx.input, flex: 1, minWidth: 120 }} />
            <datalist id="tpl-works">
              {state.template.map((n) => <option key={n.id} value={n.name} />)}
            </datalist>
            <input value={matPart} onChange={(e) => setMatPart(e.target.value)} placeholder="材料名・型番(例: MSRB130)"
              style={{ ...sx.input, flex: 1, minWidth: 120 }} onKeyDown={(e) => e.key === "Enter" && addMaterialPreset()} />
            <button style={sx.primaryBtn} onClick={addMaterialPreset}>登録</button>
          </div>
          {state.materialPresets.map((p) => (
            <div key={p.id} style={{ marginTop: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{dispName(p.workName)}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                {p.parts.map((pt, i) => (
                  <span key={i} style={{ ...sx.childChip, display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {pt}
                    <button style={{ background: "none", border: "none", color: "#b91c1c", cursor: "pointer", padding: 0 }}
                      onClick={() => removePresetPart(p.id, pt)}>✕</button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {isAdmin && (
      <div style={{ ...sx.card }}>
        <div style={{ padding: 14 }}>
          <strong>{tr("🔗 外部共有ビュー")}</strong>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
            施主や元請など外部の方に見せる閲覧専用ビューを作成できます。見せる画面を選択でき、編集は一切できません。作成するとログイン画面に表示されます。
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input value={shareName} onChange={(e) => setShareName(e.target.value)} placeholder="名前(例: 元請け共有用)"
              style={{ ...sx.input, flex: 1 }} onKeyDown={(e) => e.key === "Enter" && addShare()} />
            <button style={sx.primaryBtn} onClick={addShare}>作成</button>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {Object.entries(SCOPE_LABELS).map(([k, label]) => (
              <button key={k}
                onClick={() => setShareScopes((sc) => ({ ...sc, [k]: !sc[k] }))}
                style={{
                  ...sx.prChip, borderColor: "#4DC4FF",
                  background: shareScopes[k] ? "#4DC4FF" : "#f8fafc",
                  color: shareScopes[k] ? "#00304a" : "#334155",
                }}>
                {shareScopes[k] ? "✓ " : ""}{label}
              </button>
            ))}
          </div>
          {state.shares.map((sh) => (
            <div key={sh.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #f1f5f9", marginTop: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>🔗 {sh.name}</span>
              <span style={{ fontSize: 11, color: "#64748b", flex: 1 }}>
                {Object.entries(SCOPE_LABELS).filter(([k]) => sh.scopes[k]).map(([, l]) => l).join("・")}
              </span>
              <button
                style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 30, height: 30, cursor: "pointer", color: "#b91c1c" }}
                onClick={async () => { if (await ui.confirm(`共有ビュー「${sh.name}」を削除しますか?`, "削除", true)) setState((s) => ({ ...s, shares: s.shares.filter((x) => x.id !== sh.id) })); }}>✕</button>
            </div>
          ))}
        </div>
      </div>
      )}

      {isAdmin && (
      <div style={{ ...sx.card }}>
        <div style={{ padding: 14 }}>
          <strong>{tr("💾 データのバックアップ")}</strong>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
            現在の全データ(現場・図面・エリア・作業・進捗・写真含む)をJSONファイルとして保存/復元できます。プロトタイプ段階のテスト運用にご活用ください。
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button style={{ ...sx.primaryBtn, flex: 1 }} onClick={exportJson}>⬇ ダウンロード</button>
            <button style={{ ...sx.smallBtn, flex: 1, padding: "8px 0" }} onClick={() => importRef.current && importRef.current.click()}>⬆ 読み込み</button>
            <input ref={importRef} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={importJson} />
          </div>
        </div>
      </div>
      )}

      {canField && (
      <div style={sx.card}>
        <div style={{ padding: 14 }}>
          <strong>{tr("作業テンプレート(編集可能)")}</strong>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
            ここで編集した内容は<strong>これから作成するエリア</strong>に反映されます。既存エリアの作業は各エリア内で個別に追加・削除できます。
          </div>
          <TemplateEditor state={state} setState={setState} showToast={showToast} ui={ui} />
        </div>
      </div>
      )}

      <div style={{ ...sx.card, background: "#f8fafc" }}>
        <div style={{ padding: 14, fontSize: 12, color: "#64748b", lineHeight: 1.7 }}>
          <strong style={{ color: "#334155" }}>このプロトタイプについて</strong><br />
          ・データはこの画面を開いている間だけ保持されます(本番移行時にDB保存を実装)<br />
          ・PDF図面は各ページが自動でフロアとして取り込まれます(最大12ページ)<br />
          ・作業員ごとの専用リンク+認証は本番移行時にJWTで実装予定<br />
          ・優先度カラーはCUD(カラーユニバーサルデザイン)推奨配色に準拠
        </div>
      </div>
    </div>
  );
}

function TemplateEditor({ state, setState, showToast, ui }) {
  const [newMain, setNewMain] = useState("");
  const mutate = (fn) => setState((s) => ({ ...s, template: fn(s.template) }));

  function addMain() {
    const nm = newMain.trim();
    if (!nm) return;
    mutate((tpl) => [...tpl, { id: uid("p"), name: nm, children: [] }]);
    setNewMain("");
    showToast(`メイン作業「${nm}」を追加しました`);
  }
  async function addChild(node) {
    const nm = await ui.prompt(`「${node.name}」の下に追加するサブ作業名`, "", "例: 支持金物取り付け");
    if (!nm || !nm.trim()) return;
    mutate((tpl) => tplUpdate(tpl, node.id, (n) => ({ ...n, children: [...(n.children || []), { id: uid("p"), name: nm.trim(), children: [] }] })));
    showToast(`サブ作業「${nm.trim()}」を追加しました`);
  }
  async function rename(node) {
    const nm = await ui.prompt("新しい作業名", node.name);
    if (!nm || !nm.trim() || nm.trim() === node.name) return;
    mutate((tpl) => tplUpdate(tpl, node.id, (n) => ({ ...n, name: nm.trim() })));
  }
  async function remove(node) {
    const hasKids = (node.children || []).length > 0;
    if (!(await ui.confirm(`「${node.name}」${hasKids ? "とサブ作業すべて" : ""}をテンプレートから削除しますか?`, "削除", true))) return;
    mutate((tpl) => tplRemove(tpl, node.id));
    showToast(`「${node.name}」を削除しました`);
  }

  function Row({ node, depth }) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: depth * 16, marginTop: 4 }}>
          <span style={{ fontSize: 13, flex: 1, fontWeight: depth === 0 ? 700 : 400 }}>
            {depth === 0 ? "■" : depth === 1 ? "・" : "‐"} {dispName(node.name)}
          </span>
          {depth < 2 && (
            <button style={sx.tplBtn} title="サブ作業を追加" onClick={() => addChild(node)}>＋</button>
          )}
          <button style={sx.tplBtn} title="名前を変更" onClick={() => rename(node)}>✏</button>
          <button style={{ ...sx.tplBtn, color: "#b91c1c" }} title="削除" onClick={() => remove(node)}>🗑</button>
        </div>
        {(node.children || []).map((c) => <Row key={c.id} node={c} depth={depth + 1} />)}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 8 }}>
      {state.template.map((n) => <Row key={n.id} node={n} depth={0} />)}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          value={newMain} onChange={(e) => setNewMain(e.target.value)}
          placeholder="メイン作業を追加(例: 器具付け)"
          style={{ ...sx.input, flex: 1 }} onKeyDown={(e) => e.key === "Enter" && addMain()}
        />
        <button style={sx.primaryBtn} onClick={addMain}>追加</button>
      </div>
    </div>
  );
}

/* ============================================================
   スタイル
   ============================================================ */
const globalCss = `
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin: 0; }
  button, input, select, textarea { font-family: inherit; }
  button { transition: transform .07s ease, filter .18s ease, box-shadow .18s ease, background-color .18s ease; }
  button:active { transform: scale(.96); }
  button:hover { filter: brightness(1.05); }
  input, select, textarea { transition: border-color .15s ease, box-shadow .15s ease; }
  input:focus, select:focus, textarea:focus { outline: none; border-color: #7c94b5; box-shadow: 0 0 0 4px rgba(64,98,148,0.13); }
  ::selection { background: rgba(0,90,255,0.18); }
  @keyframes gvIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;

function makeSx(t) {
  return {
  app: {
    fontFamily: t.font || `"Hiragino Kaku Gothic ProN", "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif`,
    height: "100vh", display: "flex", flexDirection: "column",
    background: t.appBg, backgroundSize: t.appBgSize || "auto", color: "#0f172a",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
    padding: "8px 12px", color: t.headerText, flexShrink: 0,
    background: `linear-gradient(135deg, ${t.header} 0%, ${t.header2 || t.header} 100%)`,
    position: "relative", overflow: "hidden",
  },
  logoTile: {
    width: 34, height: 34, borderRadius: 11, flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: `linear-gradient(135deg, ${t.logo} 0%, ${t.accent} 120%)`,
    color: "#fff",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.25)",
  },
  headerStripe: { height: 3, background: t.stripe || t.accent, flexShrink: 0, opacity: 0.9 },
  logoMark: { fontSize: 24, background: t.logo, borderRadius: 8, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: t.glow },
  siteSelect: {
    background: t.chip, color: "#fff", border: "1px solid rgba(255,255,255,0.25)",
    borderRadius: 8, padding: "7px 8px", fontSize: 13, fontWeight: 700,
    maxWidth: "48vw", minWidth: 0, textOverflow: "ellipsis",
  },
  main: { flex: 1, overflow: "hidden", position: "relative" },
  tabbar: { display: "flex", gap: 2, padding: "6px 6px", borderTop: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 -8px 24px rgba(0,0,0,0.18)", background: `linear-gradient(135deg, ${t.header} 0%, ${t.header2 || t.header} 100%)`, flexShrink: 0, paddingBottom: "calc(6px + env(safe-area-inset-bottom))" },
  tabBtn: {
    flex: 1, padding: "7px 0 6px", background: "none", border: "none", color: t.tabOff,
    display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
    fontSize: 10.5, fontWeight: 600, letterSpacing: "0.02em", cursor: "pointer",
  },
  tabBtnActive: { color: t.tabOn, fontWeight: 800, textShadow: t.glow, background: "rgba(255,255,255,0.10)", borderRadius: 14, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10)" },
  userChip: {
    display: "flex", alignItems: "center", gap: 6, background: t.chip,
    border: `1px solid ${t.chipBorder}`, borderRadius: 999, padding: "6px 12px",
    color: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
  },
  workerDot: { width: 10, height: 10, borderRadius: "50%", display: "inline-block" },
  siteAddBtn: {
    background: "none", border: "1px dashed rgba(255,255,255,0.4)", borderRadius: 8,
    color: "#cbd5e1", fontSize: 11, padding: "5px 8px", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
  },
  loginWrap: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: `radial-gradient(120% 90% at 50% 0%, ${t.header2 || t.header}, ${t.header} 70%)`, padding: 20 },
  loginCard: { background: "#fff", borderRadius: 24, padding: "26px 22px", width: "100%", maxWidth: 380, border: "1px solid rgba(16,24,40,0.06)", boxShadow: "0 1px 2px rgba(16,24,40,0.08), 0 32px 80px -16px rgba(0,0,0,0.5)" },
  loginBtn: {
    display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "13px 16px",
    borderRadius: 14, border: "1px solid #dbe0e8", background: "linear-gradient(180deg, #ffffff, #f6f8fb)",
    fontSize: 15, fontWeight: 700, color: "#1a2233", cursor: "pointer", marginBottom: 8, textAlign: "left",
    boxShadow: "0 1px 2px rgba(16,24,40,0.05)",
  },
  floorBar: { display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "rgba(255,255,255,0.85)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", borderBottom: "1px solid rgba(16,24,40,0.07)" },
  floorChip: { padding: "7px 16px", borderRadius: 999, border: "1px solid #dbe0e8", background: "#fff", fontSize: 13, fontWeight: 600, color: "#3d4654", cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 1px 2px rgba(16,24,40,0.05)" },
  floorChipActive: { background: `linear-gradient(135deg, ${t.header}, ${t.header2 || t.header})`, color: t.headerText, borderColor: "transparent", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 2px 8px -2px rgba(16,24,40,0.35)" },
  smallBtn: { padding: "6px 12px", borderRadius: 10, border: "1px dashed #aab3c0", background: "#fbfcfe", fontSize: 12, fontWeight: 600, color: "#3d4654", cursor: "pointer", whiteSpace: "nowrap" },
  drawBar: { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: `linear-gradient(120deg, ${t.header}, ${t.header2 || t.header})`, flexWrap: "wrap" },
  primaryBtn: { padding: "9px 18px", borderRadius: 12, border: "none", background: `linear-gradient(180deg, ${t.accent} 0%, ${t.accent}e6 100%)`, color: "#fff", fontSize: 13, fontWeight: 700, letterSpacing: "0.01em", cursor: "pointer", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 1px 2px rgba(16,24,40,0.2), 0 6px 16px -6px " + t.accent + "99" },
  secondaryBtn: { padding: "8px 14px", borderRadius: 11, border: "1px solid rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.08)", color: "#eef2f7", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  dangerBtn: { padding: "8px 14px", borderRadius: 11, border: "none", background: "linear-gradient(180deg, #FF4B00, #e64400)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 1px 2px rgba(16,24,40,0.2)" },
  mapWrap: { flex: 1, overflow: "auto", background: t.mapBg, WebkitOverflowScrolling: "touch" },
  legend: { display: "flex", gap: 12, padding: "7px 12px", background: "rgba(255,255,255,0.85)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", borderTop: "1px solid rgba(16,24,40,0.07)", flexWrap: "wrap", flexShrink: 0 },
  legendItem: { display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#475569" },
  legendSwatch: { width: 12, height: 12, borderRadius: 3, display: "inline-block" },
  sheet: {
    position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "62%",
    background: "rgba(255,255,255,0.96)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
    borderRadius: "22px 22px 0 0", border: "1px solid rgba(16,24,40,0.08)", borderBottom: "none",
    boxShadow: "0 -12px 40px rgba(16,24,40,0.22)",
    padding: "10px 14px calc(14px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", zIndex: 20,
  },
  sheetHandleRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  grabber: { width: 40, height: 4.5, borderRadius: 999, background: "rgba(16,24,40,0.16)", margin: "2px auto 10px" },
  helpFab: {
    position: "fixed", right: 14, bottom: "calc(84px + env(safe-area-inset-bottom))", zIndex: 45,
    width: 44, height: 44, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(17,24,39,0.88)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
    color: "#f4f6fa", fontSize: 19, fontWeight: 800, cursor: "pointer",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), 0 8px 24px rgba(16,24,40,0.4)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  linkBtn: { background: "none", border: "none", color: "#005AFF", fontSize: 13, cursor: "pointer", padding: 0 },
  iconBtn: { background: "#f0f2f6", border: "1px solid rgba(16,24,40,0.06)", borderRadius: 10, width: 34, height: 34, fontSize: 15, cursor: "pointer", flexShrink: 0 },
  issueBadge: { background: "#FF4B00", color: "#fff", borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 700 },
  prChip: { padding: "5px 12px", borderRadius: 999, border: "1.5px solid", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  childChip: { padding: "6px 12px", borderRadius: 8, border: "1.5px dashed #94a3b8", background: "#f8fafc", fontSize: 13, cursor: "pointer" },
  taskRow: { display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 8px 8px 0", borderBottom: "1px solid #f1f5f9" },
  statusBtn: { border: "none", borderRadius: 10, padding: "8px 10px", fontSize: 12, fontWeight: 800, letterSpacing: "0.01em", cursor: "pointer", whiteSpace: "nowrap", minWidth: 86, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(0,0,0,0.08), 0 1px 2px rgba(16,24,40,0.12)" },
  expandBtn: { background: "#f1f5f9", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 14 },
  miniBarTrack: { height: 7, background: "#e9edf2", borderRadius: 999, marginTop: 4, overflow: "hidden", boxShadow: "inset 0 1px 2px rgba(16,24,40,0.08)" },
  miniBarFill: { height: 7, borderRadius: 999, transition: "width 0.45s cubic-bezier(.22,1,.36,1)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3)" },
  issueText: { fontSize: 12, color: "#b91c1c", background: "#fef2f2", borderRadius: 6, padding: "4px 8px", marginTop: 4 },
  dueChip: { fontSize: 11, borderRadius: 6, padding: "2px 8px" },
  select: { fontSize: 12, borderRadius: 9, border: "1px solid #d5dae2", padding: "5px 3px", background: "#fff", maxWidth: 74, boxShadow: "0 1px 2px rgba(16,24,40,0.05)", color: "#3d4654" },
  assignBtn: { background: "#f1f5f9", border: "1.5px solid #cbd5e1", borderRadius: 8, padding: "5px 8px", fontSize: 13, cursor: "pointer" },
  assignPop: {
    position: "absolute", right: 0, top: "110%", background: "#fff", borderRadius: 10,
    boxShadow: "0 4px 16px rgba(15,23,42,0.2)", padding: 6, display: "flex", flexDirection: "column", gap: 4, zIndex: 30, minWidth: 110,
  },
  assignItem: { border: "none", borderRadius: 6, padding: "7px 10px", fontSize: 13, cursor: "pointer", textAlign: "left" },
  workerChip: { color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 700 },
  teamChip: { border: "1.5px solid", background: "#fff", borderRadius: 999, padding: "1px 8px", fontSize: 11, fontWeight: 800 },
  tabBadge: {
    position: "absolute", top: 4, right: "22%", background: "#FF4B00", color: "#fff",
    borderRadius: 999, minWidth: 17, height: 17, fontSize: 10, fontWeight: 800,
    display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px",
  },
  assignHead: { fontSize: 10, color: "#94a3b8", fontWeight: 700, padding: "2px 4px 0" },
  tplBtn: {
    background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6,
    width: 28, height: 28, fontSize: 12, cursor: "pointer", flexShrink: 0,
  },
  qtyBtn: {
    background: "#f1f5f9", border: "1.5px solid #cbd5e1", borderRadius: 8,
    width: 38, height: 38, fontSize: 18, fontWeight: 700, cursor: "pointer", flexShrink: 0,
  },
  linkChip: {
    fontSize: 11, borderRadius: 6, padding: "2px 8px", background: "#eef2ff",
    color: "#3730a3", textDecoration: "none", fontWeight: 700, border: "1px solid #c7d2fe",
  },
  suggestBox: {
    position: "absolute", left: 0, right: 0, top: "106%", background: "rgba(255,255,255,0.97)",
    backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
    borderRadius: 14, boxShadow: "0 16px 48px -12px rgba(16,24,40,0.32)", zIndex: 40,
    display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid rgba(16,24,40,0.08)",
    animation: "gvIn .16s ease both",
  },
  suggestItem: {
    display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", fontSize: 13,
    background: "#fff", border: "none", borderBottom: "1px solid #f1f5f9", cursor: "pointer",
  },
  card: {
    background: t.card,
    backgroundImage: `linear-gradient(180deg, ${t.tint || "rgba(0,0,0,0.02)"} 0%, rgba(255,255,255,0) 72px)`,
    border: `1px solid ${t.line || "rgba(16,24,40,0.10)"}`,
    borderRadius: 18, boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 12px 32px -16px rgba(16,24,40,0.18)",
    marginBottom: 12, overflow: "hidden", animation: "gvIn .28s ease both",
  },
  cardHead: { display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "13px 15px", background: "none", border: "none", fontSize: 15, fontWeight: 700, letterSpacing: "0.01em", color: "#141c2b", cursor: "pointer", textAlign: "left" },
  prTag: { borderRadius: 7, padding: "3px 9px", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.03em", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25)" },
  issueRow: { display: "block", width: "100%", textAlign: "left", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 10px", marginTop: 8, cursor: "pointer" },
  empty: { fontSize: 13, color: "#64748b", padding: 20, textAlign: "center" },
  input: { borderRadius: 11, border: "1px solid #d5dae2", padding: "9px 13px", fontSize: 14, background: "#fff", boxShadow: "inset 0 1px 2px rgba(16,24,40,0.04)", color: "#1a2233" },
  textarea: { width: "100%", borderRadius: 8, border: "1.5px solid #cbd5e1", padding: "8px 12px", fontSize: 14, resize: "vertical" },
  toast: {
    position: "fixed", bottom: 86, left: "50%", transform: "translateX(-50%)",
    background: "rgba(17,24,39,0.92)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
    color: "#f4f6fa", padding: "11px 20px", borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.10)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 28px rgba(16,24,40,0.4)",
    fontSize: 13, fontWeight: 600, zIndex: 100, maxWidth: "90%", animation: "gvIn .2s ease both",
  },
  modalOverlay: {
    position: "fixed", inset: 0, background: "rgba(10,15,28,0.45)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", zIndex: 50,
    display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
  },
  modal: {
    background: "#fff", borderRadius: 22, padding: 18, width: "100%", maxWidth: 420,
    maxHeight: "84vh", overflowY: "auto",
    border: "1px solid rgba(16,24,40,0.06)",
    boxShadow: "0 1px 2px rgba(16,24,40,0.06), 0 24px 64px -12px rgba(16,24,40,0.35)",
    animation: "gvIn .22s ease both",
  },
  bigStatusBtn: {
    border: "none", borderRadius: 16, padding: "17px 8px", color: "#fff",
    fontSize: 14, fontWeight: 800, letterSpacing: "0.02em", cursor: "pointer",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
    boxShadow: "inset 0 1.5px 0 rgba(255,255,255,0.3), inset 0 -2px 0 rgba(0,0,0,0.12), 0 2px 6px rgba(16,24,40,0.18)",
  },
  bigStatusActive: { outline: "3px solid rgba(20,28,43,0.85)", outlineOffset: 2.5 },
  photoOverlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 80,
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  },
  thumb: { width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1.5px solid #cbd5e1", cursor: "pointer" },
  thumbDel: {
    position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: "50%",
    border: "none", background: "#0f172a", color: "#fff", fontSize: 11, cursor: "pointer",
  },
  photoAddBtn: {
    width: 64, height: 64, borderRadius: 8, border: "1.5px dashed #94a3b8",
    background: "#f8fafc", fontSize: 11, cursor: "pointer", lineHeight: 1.4,
  },
  iconHeaderBtn: {
    background: t.chip, border: `1px solid ${t.chipBorder}`, color: "inherit",
    borderRadius: 8, width: 36, height: 32, fontSize: 16, cursor: "pointer", flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  themeSwatch: {
    display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 11px",
    borderRadius: 14, border: "1px solid #dbe0e8", background: "linear-gradient(180deg, #ffffff, #f7f9fc)",
    fontSize: 14, fontWeight: 700, color: "#1a2233", cursor: "pointer", marginBottom: 8, textAlign: "left",
    boxShadow: "0 1px 2px rgba(16,24,40,0.05)",
  },
  suggestRow: {
    display: "flex", alignItems: "center", gap: 10, padding: "10px 0",
    borderBottom: "1px solid #f1f5f9",
  },
  statBox: {
    flex: 1, minWidth: 90, background: "linear-gradient(180deg, #fbfcfe, #f2f5f9)", border: "1px solid rgba(16,24,40,0.06)", borderRadius: 14, padding: "12px 12px", textAlign: "center", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
  },
  statNum: { fontSize: 26, fontWeight: 800, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 },
  statLbl: { fontSize: 11, color: "#64748b", marginTop: 2 },
  };
}
let sx = makeSx(THEMES.standard);
