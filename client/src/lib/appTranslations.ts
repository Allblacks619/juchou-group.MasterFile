/**
 * App (management) translations — Japanese / Brazilian Portuguese
 * Usage: const { t } = useAppLang();  t('dashboard')
 */

export type AppLang = "ja" | "pt";

const dict = {
  // ── Common ──
  loading: { ja: "読み込み中...", pt: "Carregando..." },
  save: { ja: "保存", pt: "Salvar" },
  cancel: { ja: "キャンセル", pt: "Cancelar" },
  create: { ja: "作成", pt: "Criar" },
  edit: { ja: "編集", pt: "Editar" },
  delete: { ja: "削除", pt: "Excluir" },
  close: { ja: "閉じる", pt: "Fechar" },
  search: { ja: "検索", pt: "Buscar" },
  add: { ja: "追加", pt: "Adicionar" },
  back: { ja: "戻る", pt: "Voltar" },
  confirm: { ja: "確認", pt: "Confirmar" },
  yes: { ja: "はい", pt: "Sim" },
  no: { ja: "いいえ", pt: "Não" },
  register: { ja: "登録", pt: "Registrar" },
  update: { ja: "更新", pt: "Atualizar" },
  download: { ja: "ダウンロード", pt: "Baixar" },
  upload: { ja: "アップロード", pt: "Enviar" },
  noData: { ja: "データがありません", pt: "Sem dados" },
  required: { ja: "必須", pt: "Obrigatório" },
  optional: { ja: "任意", pt: "Opcional" },
  actions: { ja: "操作", pt: "Ações" },
  status: { ja: "ステータス", pt: "Status" },
  notes: { ja: "備考", pt: "Observações" },
  name: { ja: "名前", pt: "Nome" },
  email: { ja: "メール", pt: "E-mail" },
  phone: { ja: "電話番号", pt: "Telefone" },
  address: { ja: "住所", pt: "Endereço" },

  // ── Navigation / Sidebar ──
  nav_dashboard: { ja: "ダッシュボード", pt: "Painel" },
  nav_genba: { ja: "現場ビジョン", pt: "Visão do Canteiro" },
  nav_connect: { ja: "会社間連携", pt: "Conexão entre Empresas" },
  nav_myProfile: { ja: "マイプロフィール", pt: "Meu Perfil" },
  nav_invitations: { ja: "招待管理", pt: "Convites" },
  nav_company: { ja: "会社設定", pt: "Config. Empresa" },
  nav_employees: { ja: "従業員管理", pt: "Funcionários" },
  nav_projects: { ja: "現場管理", pt: "Obras" },
  nav_rates: { ja: "単価管理", pt: "Valores" },
  nav_myAttendance: { ja: "マイ出面表", pt: "Minha Presença" },
  nav_myClosing: { ja: "月締め提出", pt: "Fechar Mês" },
  nav_attendance: { ja: "出面表管理", pt: "Presença" },
  nav_workReports: { ja: "作業日報", pt: "Relatório de trabalho" },
  nav_invoices: { ja: "請求書", pt: "Faturas" },
  nav_closings: { ja: "締め管理", pt: "Fechamento" },
  nav_monthlyCloseV2: { ja: "月締め管理", pt: "Fechamento mensal" },
  nav_workerInvoiceV2: { ja: "作業員請求書管理", pt: "Fatura do trabalhador" },
  nav_confirmationPdf: { ja: "確認表PDF", pt: "PDF de Confirmação" },
  confirmation_pdf_title: { ja: "作業出面・交通費確認表", pt: "Confirmação de Presença e Transporte" },
  nav_payments: { ja: "支払管理", pt: "Pagamentos" },
  nav_receivables: { ja: "入金管理", pt: "Recebimentos" },
  nav_audit: { ja: "監査ログ", pt: "Auditoria" },
  nav_passwordResets: { ja: "パスワード再発行", pt: "Reemitir senha" },
  nav_support: { ja: "サポート", pt: "Suporte" },
  nav_corporateSite: { ja: "コーポレートサイトへ", pt: "Site corporativo" },
  nav_password: { ja: "パスワード", pt: "Senha" },
  nav_logout: { ja: "ログアウト", pt: "Sair" },
  nav_redirectingLogin: { ja: "ログインページに移動中...", pt: "Redirecionando para login..." },

  // ── Login ──
  login_title: { ja: "ログイン", pt: "Login" },
  login_id: { ja: "ログインID", pt: "ID de Login" },
  login_password: { ja: "パスワード", pt: "Senha" },
  login_button: { ja: "ログイン", pt: "Entrar" },
  login_error: { ja: "ログインIDまたはパスワードが正しくありません", pt: "ID ou senha incorretos" },
  login_subtitle: { ja: "管理システムにログイン", pt: "Entrar no sistema de gestão" },

  // ── Change Password ──
  changePassword_title: { ja: "パスワード変更", pt: "Alterar Senha" },
  changePassword_current: { ja: "現在のパスワード", pt: "Senha atual" },
  changePassword_new: { ja: "新しいパスワード", pt: "Nova senha" },
  changePassword_confirm: { ja: "新しいパスワード（確認）", pt: "Confirmar nova senha" },
  changePassword_button: { ja: "パスワードを変更", pt: "Alterar senha" },
  changePassword_success: { ja: "パスワードを変更しました", pt: "Senha alterada com sucesso" },
  changePassword_mustChange: { ja: "初回ログインのためパスワードの変更が必要です", pt: "É necessário alterar a senha no primeiro login" },
  changePassword_mismatch: { ja: "パスワードが一致しません", pt: "As senhas não coincidem" },
  changePassword_minLength: { ja: "パスワードは6文字以上にしてください", pt: "A senha deve ter pelo menos 6 caracteres" },

  // ── Dashboard ──
  dashboard_welcome: { ja: "ようこそ、", pt: "Bem-vindo(a), " },
  dashboard_totalEmployees: { ja: "従業員数", pt: "Total de funcionários" },
  dashboard_totalProjects: { ja: "現場数", pt: "Total de obras" },
  dashboard_totalInvitations: { ja: "招待数", pt: "Total de convites" },
  dashboard_addEmployee: { ja: "従業員追加", pt: "Adicionar funcionário" },
  dashboard_newEmployee: { ja: "新しい従業員を登録", pt: "Registrar novo funcionário" },
  dashboard_myAttendance: { ja: "マイ出面表", pt: "Minha presença" },
  dashboard_workDays: { ja: "出勤", pt: "Dias trabalhados" },
  dashboard_totalHours: { ja: "時間", pt: "Horas" },
  dashboard_overtime: { ja: "残業", pt: "Hora extra" },
  dashboard_teamMembers: { ja: "チームメンバーの出面状況", pt: "Presença da equipe" },
  dashboard_addGuest: { ja: "ゲスト追加", pt: "Adicionar convidado" },
  dashboard_pdfExport: { ja: "PDF出力", pt: "Exportar PDF" },
  dashboard_excelExport: { ja: "Excel出力", pt: "Exportar Excel" },
  dashboard_saveBtn: { ja: "保存", pt: "Salvar" },
  dashboard_addWorker: { ja: "作業員追加", pt: "Adicionar trabalhador" },
  dashboard_attendanceHint: { ja: "空セルをクリックで出勤（8h）を設定。出勤セルをクリックで詳細編集（シフト・残業時間・タイプ変更）。", pt: "Clique em célula vazia para registrar presença (8h). Clique em célula preenchida para editar detalhes (turno, hora extra, tipo)." },
  dashboard_legend_work: { ja: "出 = 出勤", pt: "出 = Presente" },
  dashboard_legend_half: { ja: "半 = 半日", pt: "半 = Meio dia" },
  dashboard_legend_overtime: { ja: "残 = 残業", pt: "残 = Hora extra" },
  dashboard_legend_holiday: { ja: "休 = 休出", pt: "休 = Folga trabalhada" },
  dashboard_incompleteProfile: { ja: "プロフィールの未記入項目があります", pt: "Há itens pendentes no seu perfil" },
  dashboard_fillProfile: { ja: "プロフィールを記入する", pt: "Preencher perfil" },

  // ── My Profile ──
  myProfile_title: { ja: "マイプロフィール", pt: "Meu Perfil" },
  myProfile_subtitle: { ja: "あなたの個人情報を管理します。この情報は各種提出書類に使用されます。", pt: "Gerencie suas informações pessoais. Estas informações são usadas em documentos oficiais." },
  myProfile_basicInfo: { ja: "基本的な個人情報", pt: "Informações básicas" },
  myProfile_residenceInfo: { ja: "在留情報", pt: "Informações de residência" },
  myProfile_addressInfo: { ja: "住所", pt: "Endereço" },
  myProfile_insuranceInfo: { ja: "保険", pt: "Seguro" },
  myProfile_emergencyContact: { ja: "緊急連絡先", pt: "Contato de emergência" },
  myProfile_bankInfo: { ja: "振込先", pt: "Dados bancários" },
  myProfile_qualifications: { ja: "資格", pt: "Qualificações" },
  myProfile_documents: { ja: "書類", pt: "Documentos" },
  myProfile_stamp: { ja: "印鑑", pt: "Carimbo/Selo" },
  myProfile_notFound: { ja: "プロフィールが見つかりません", pt: "Perfil não encontrado" },
  myProfile_saved: { ja: "保存しました", pt: "Salvo com sucesso" },

  // Basic info fields
  field_lastName: { ja: "姓", pt: "Sobrenome" },
  field_firstName: { ja: "名", pt: "Nome" },
  field_lastNameKana: { ja: "姓（フリガナ）", pt: "Sobrenome (Furigana)" },
  field_firstNameKana: { ja: "名（フリガナ）", pt: "Nome (Furigana)" },
  field_birthDate: { ja: "生年月日", pt: "Data de nascimento" },
  field_bloodType: { ja: "血液型", pt: "Tipo sanguíneo" },
  field_experienceYears: { ja: "経験年数", pt: "Anos de experiência" },
  field_ccusNumber: { ja: "CCUS番号", pt: "Número CCUS" },
  field_ccusCard: { ja: "CCUSカード", pt: "Cartão CCUS" },

  // Residence fields
  field_residenceStatus: { ja: "在留資格", pt: "Status de residência" },
  field_residenceCardNumber: { ja: "在留カード番号", pt: "Nº do cartão de residência" },
  field_residenceExpiry: { ja: "在留期限", pt: "Validade da residência" },
  field_residenceCardFront: { ja: "在留カード（表）", pt: "Cartão de residência (frente)" },
  field_residenceCardBack: { ja: "在留カード（裏）", pt: "Cartão de residência (verso)" },
  field_driverLicenseFront: { ja: "運転免許証（表）", pt: "Carteira de motorista (frente)" },
  field_driverLicenseBack: { ja: "運転免許証（裏）", pt: "Carteira de motorista (verso)" },

  // Address fields
  field_postalCode: { ja: "郵便番号", pt: "CEP" },
  field_prefecture: { ja: "都道府県", pt: "Estado/Província" },
  field_city: { ja: "市区町村", pt: "Cidade" },
  field_streetAddress: { ja: "番地", pt: "Endereço" },

  // Insurance fields
  field_healthInsurance: { ja: "健康保険", pt: "Seguro saúde" },
  field_pensionType: { ja: "年金", pt: "Previdência" },
  field_employmentInsurance: { ja: "雇用保険番号", pt: "Nº seguro emprego" },
  field_workersCompInsurance: { ja: "労災保険番号", pt: "Nº seguro acidente trabalho" },
  field_insuranceCard: { ja: "保険証", pt: "Cartão de seguro" },
  field_pensionBook: { ja: "年金手帳", pt: "Caderneta de previdência" },

  // Emergency contact fields
  field_emergencyName: { ja: "氏名", pt: "Nome" },
  field_emergencyRelation: { ja: "関係", pt: "Parentesco" },
  field_emergencyPhone: { ja: "電話番号", pt: "Telefone" },

  // Bank fields
  field_bankName: { ja: "銀行名", pt: "Nome do banco" },
  field_branchName: { ja: "支店名", pt: "Nome da agência" },
  field_accountType: { ja: "口座種別", pt: "Tipo de conta" },
  field_accountNumber: { ja: "口座番号", pt: "Número da conta" },
  field_accountHolder: { ja: "名義人", pt: "Titular" },
  field_accountType_savings: { ja: "普通", pt: "Poupança" },
  field_accountType_checking: { ja: "当座", pt: "Corrente" },

  // ── Invitations ──
  invitations_title: { ja: "招待管理", pt: "Gerenciamento de Convites" },
  invitations_create: { ja: "新規招待を作成", pt: "Criar novo convite" },
  invitations_loginId: { ja: "ログインID（ローマ字）", pt: "ID de Login (alfanumérico)" },
  invitations_tempPassword: { ja: "仮パスワード", pt: "Senha temporária" },
  invitations_role: { ja: "権限", pt: "Permissão" },
  invitations_role_worker: { ja: "作業員", pt: "Trabalhador" },
  invitations_role_leader: { ja: "管理者", pt: "Gerente" },
  invitations_role_admin: { ja: "管理者", pt: "Administrador" },
  invitations_history: { ja: "招待履歴", pt: "Histórico de convites" },
  invitations_status_used: { ja: "使用済み", pt: "Usado" },
  invitations_status_expired: { ja: "期限切れ", pt: "Expirado" },
  invitations_status_active: { ja: "有効", pt: "Ativo" },
  invitations_copyLink: { ja: "リンクをコピー", pt: "Copiar link" },
  invitations_copyId: { ja: "IDをコピー", pt: "Copiar ID" },
  invitations_copyPassword: { ja: "パスワードをコピー", pt: "Copiar senha" },
  invitations_createdAt: { ja: "作成日", pt: "Data de criação" },
  invitations_deleteExpired: { ja: "期限切れを削除", pt: "Excluir expirados" },
  invitations_status: { ja: "ステータス", pt: "Status" },
  invitations_expiry: { ja: "有効期限", pt: "Validade" },
  invitations_createNew: { ja: "新しい招待を作成", pt: "Criar novo convite" },

  // ── Company Settings ──
  company_title: { ja: "会社設定", pt: "Configurações da Empresa" },
  company_basicInfo: { ja: "基本情報", pt: "Informações básicas" },
  company_companyName: { ja: "会社名", pt: "Nome da empresa" },
  company_address: { ja: "住所", pt: "Endereço" },
  company_phone: { ja: "電話番号", pt: "Telefone" },
  company_email: { ja: "メール", pt: "E-mail" },
  company_registrationNumber: { ja: "登録番号", pt: "Número de registro" },
  company_invoiceNumber: { ja: "適格請求事業者番号", pt: "Nº de fatura qualificada" },
  company_bankInfo: { ja: "振込先情報", pt: "Dados bancários" },
  company_logo: { ja: "ロゴ", pt: "Logo" },
  company_seal: { ja: "社印", pt: "Carimbo da empresa" },
  company_watermark: { ja: "ウォーターマーク", pt: "Marca d'água" },

  // ── Employees ──
  employees_title: { ja: "従業員管理", pt: "Gerenciamento de Funcionários" },
  employees_addNew: { ja: "新規追加", pt: "Adicionar novo" },
  employees_search: { ja: "名前で検索...", pt: "Buscar por nome..." },
  employees_detail: { ja: "従業員詳細", pt: "Detalhes do funcionário" },
  employees_deleteConfirm: { ja: "この従業員を削除しますか？", pt: "Deseja excluir este funcionário?" },

  // ── Projects ──
  projects_title: { ja: "現場管理", pt: "Gerenciamento de Obras" },
  projects_addNew: { ja: "新規現場追加", pt: "Adicionar nova obra" },
  projects_name: { ja: "現場名", pt: "Nome da obra" },
  projects_client: { ja: "取引先", pt: "Cliente" },
  projects_location: { ja: "場所", pt: "Local" },
  projects_active: { ja: "稼働中", pt: "Ativo" },
  projects_inactive: { ja: "終了", pt: "Encerrado" },
  projects_members: { ja: "メンバー", pt: "Membros" },
  projects_addMember: { ja: "メンバー追加", pt: "Adicionar membro" },

  // ── Rates ──
  rates_title: { ja: "単価管理", pt: "Gerenciamento de Valores" },
  rates_register: { ja: "単価を登録", pt: "Registrar valor" },
  rates_subtitle: { ja: "現場の単価を設定してください", pt: "Defina os valores por obra" },
  rates_uniform: { ja: "一律単価", pt: "Valor uniforme" },
  rates_individual: { ja: "個別単価", pt: "Valor individual" },
  rates_uniformDesc: { ja: "一律単価：この現場の全作業員に適用されるデフォルト単価です。個別単価が設定されている作業員はそちらが優先されます。", pt: "Valor uniforme: valor padrão aplicado a todos os trabalhadores desta obra. Trabalhadores com valor individual terão prioridade." },
  rates_project: { ja: "現場", pt: "Obra" },
  rates_shiftType: { ja: "勤務区分", pt: "Turno" },
  rates_dayShift: { ja: "昼勤", pt: "Diurno" },
  rates_nightShift: { ja: "夜勤", pt: "Noturno" },
  rates_clientRate: { ja: "先方単価（日額）", pt: "Valor do cliente (diário)" },
  rates_payRate: { ja: "支払単価（日額）", pt: "Valor de pagamento (diário)" },
  rates_startDate: { ja: "適用開始日", pt: "Data de início" },
  rates_endDate: { ja: "適用終了日", pt: "Data de término" },
  rates_employee: { ja: "作業員", pt: "Trabalhador" },

  // ── Attendance ──
  attendance_title: { ja: "出面表管理", pt: "Gerenciamento de Presença" },
  attendance_subtitle: { ja: "出面表の管理と出力ができます", pt: "Gerencie e exporte registros de presença" },
  attendance_addWorker: { ja: "作業員追加", pt: "Adicionar trabalhador" },
  attendance_addGuest: { ja: "ゲスト追加", pt: "Adicionar convidado" },
  attendance_pdfExport: { ja: "PDF出力", pt: "Exportar PDF" },
  attendance_excelExport: { ja: "Excel出力", pt: "Exportar Excel" },
  attendance_save: { ja: "保存", pt: "Salvar" },
  attendance_month: { ja: "月", pt: "Mês" },
  attendance_employeeName: { ja: "氏名", pt: "Nome" },
  attendance_work: { ja: "出", pt: "P" },
  attendance_half: { ja: "半", pt: "½" },
  attendance_absent: { ja: "休", pt: "F" },
  attendance_overtime: { ja: "残", pt: "HE" },
  attendance_holiday: { ja: "休出", pt: "FT" },
  attendance_total: { ja: "合計", pt: "Total" },
  attendance_days: { ja: "日", pt: "dias" },
  attendance_hours: { ja: "h", pt: "h" },
  attendance_overtimeHours: { ja: "残業", pt: "Hora extra" },
  attendance_shiftDay: { ja: "昼勤", pt: "Diurno" },
  attendance_shiftNight: { ja: "夜勤", pt: "Noturno" },
  attendance_guestName: { ja: "ゲスト名", pt: "Nome do convidado" },
  attendance_selectProject: { ja: "現場を選択", pt: "Selecionar obra" },

  // ── Invoices ──
  invoices_title: { ja: "請求書管理", pt: "Gerenciamento de Faturas" },
  invoices_subtitle: { ja: "請求書の作成・管理・PDF出力", pt: "Criar, gerenciar e exportar faturas em PDF" },
  invoices_createFromAttendance: { ja: "出面表から自動作成", pt: "Criar a partir da presença" },
  invoices_createManual: { ja: "手動作成", pt: "Criar manualmente" },
  invoices_list: { ja: "請求書一覧", pt: "Lista de faturas" },
  invoices_number: { ja: "請求書番号", pt: "Nº da fatura" },
  invoices_subject: { ja: "件名", pt: "Assunto" },
  invoices_client: { ja: "取引先", pt: "Cliente" },
  invoices_project: { ja: "現場", pt: "Obra" },
  invoices_amount: { ja: "金額", pt: "Valor" },
  invoices_issueDate: { ja: "発行日", pt: "Data de emissão" },
  invoices_dueDate: { ja: "支払期限", pt: "Data de vencimento" },
  invoices_status_draft: { ja: "下書き", pt: "Rascunho" },
  invoices_status_sent: { ja: "送付済", pt: "Enviada" },
  invoices_status_paid: { ja: "入金済", pt: "Paga" },
  invoices_status_overdue: { ja: "未入金", pt: "Atrasada" },
  invoices_status_cancelled: { ja: "取消", pt: "Cancelada" },
  invoices_detail: { ja: "明細編集", pt: "Editar itens" },
  invoices_preview: { ja: "プレビュー", pt: "Pré-visualizar" },
  invoices_generatePdf: { ja: "PDF出力", pt: "Exportar PDF" },
  invoices_subtotal: { ja: "小計", pt: "Subtotal" },
  invoices_tax: { ja: "消費税", pt: "Imposto" },
  invoices_total: { ja: "合計", pt: "Total" },
  invoices_itemType: { ja: "項目タイプ", pt: "Tipo de item" },
  invoices_itemType_normal: { ja: "通常行", pt: "Linha normal" },
  invoices_itemType_text: { ja: "テキスト行", pt: "Linha de texto" },
  invoices_description: { ja: "摘要", pt: "Descrição" },
  invoices_quantity: { ja: "数量", pt: "Quantidade" },
  invoices_unit: { ja: "単位", pt: "Unidade" },
  invoices_unitPrice: { ja: "単価（円）", pt: "Preço unitário (¥)" },
  invoices_taxRate: { ja: "税率", pt: "Taxa de imposto" },
  invoices_lineAmount: { ja: "金額", pt: "Valor" },
  invoices_addItem: { ja: "項目追加", pt: "Adicionar item" },
  invoices_selectClient: { ja: "取引先を選択", pt: "Selecionar cliente" },
  invoices_selectProject: { ja: "現場を選択", pt: "Selecionar obra" },
  invoices_targetMonth: { ja: "対象月", pt: "Mês de referência" },
  invoices_paymentMethod: { ja: "入金方法", pt: "Método de pagamento" },
  invoices_honorific: { ja: "敬称", pt: "Tratamento" },
  invoices_showSeal: { ja: "社印を表示", pt: "Exibir carimbo" },
  invoices_showLogo: { ja: "ロゴを表示", pt: "Exibir logo" },

  // ── Invite Accept ──
  invite_title: { ja: "招待を受諾", pt: "Aceitar Convite" },
  invite_loginId: { ja: "ログインID", pt: "ID de Login" },
  invite_password: { ja: "パスワード", pt: "Senha" },
  invite_accept: { ja: "アカウントを作成", pt: "Criar conta" },
  invite_invalid: { ja: "この招待リンクは無効または期限切れです", pt: "Este link de convite é inválido ou expirou" },
  invite_success: { ja: "アカウントが作成されました。ログインしてください。", pt: "Conta criada com sucesso. Faça login." },

  // ── Support / Guide ──
  support_title: { ja: "サポートガイド", pt: "Guia de Suporte" },
  support_subtitle: { ja: "システムの使い方を確認できます", pt: "Consulte como usar o sistema" },
  support_adminGuide: { ja: "管理者ガイド", pt: "Guia do Administrador" },
  support_workerGuide: { ja: "作業員ガイド", pt: "Guia do Trabalhador" },
  support_faq: { ja: "よくある質問", pt: "Perguntas Frequentes" },

  // ── Weekdays ──
  weekday_sun: { ja: "日", pt: "Dom" },
  weekday_mon: { ja: "月", pt: "Seg" },
  weekday_tue: { ja: "火", pt: "Ter" },
  weekday_wed: { ja: "水", pt: "Qua" },
  weekday_thu: { ja: "木", pt: "Qui" },
  weekday_fri: { ja: "金", pt: "Sex" },
  weekday_sat: { ja: "土", pt: "Sáb" },

  // ── Months ──
  month_format: { ja: "{year}年{month}月", pt: "{month}/{year}" },

  // ── Misc ──
  featureComingSoon: { ja: "この機能は近日公開予定です", pt: "Esta função estará disponível em breve" },
  errorOccurred: { ja: "エラーが発生しました", pt: "Ocorreu um erro" },
  tryAgain: { ja: "もう一度お試しください", pt: "Tente novamente" },
  pdfGenerating: { ja: "PDF生成中...", pt: "Gerando PDF..." },
  pdfError: { ja: "PDF生成エラー", pt: "Erro ao gerar PDF" },
  selectAll: { ja: "全選択", pt: "Selecionar tudo" },
  deselectAll: { ja: "全解除", pt: "Desmarcar tudo" },
} as const;

export type TranslationKey = keyof typeof dict;

export function getTranslation(key: TranslationKey, lang: AppLang): string {
  return dict[key]?.[lang] ?? dict[key]?.ja ?? key;
}

/**
 * Helper to format month string
 */
export function formatMonth(year: number, month: number, lang: AppLang): string {
  if (lang === "pt") return `${String(month).padStart(2, "0")}/${year}`;
  return `${year}年${month}月`;
}

/**
 * Helper to get weekday name
 */
export function getWeekdayName(dayIndex: number, lang: AppLang): string {
  const keys: TranslationKey[] = [
    "weekday_sun", "weekday_mon", "weekday_tue", "weekday_wed",
    "weekday_thu", "weekday_fri", "weekday_sat",
  ];
  return getTranslation(keys[dayIndex], lang);
}

export default dict;
