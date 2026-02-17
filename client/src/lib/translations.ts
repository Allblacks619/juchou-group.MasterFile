/* ============================================================
 * JYUCHOU GROUP — Craftsman's Ledger Design
 * Translation data for JP / PT-BR / EN
 * ============================================================ */

export type Lang = "ja" | "pt" | "en";

export const translations = {
  // ── Navigation ──────────────────────────────────────
  nav: {
    ja: { home: "ホーム", recruit: "採用情報", contact: "お問い合わせ" },
    pt: { home: "Início", recruit: "Recrutamento", contact: "Contato" },
    en: { home: "Home", recruit: "Recruitment", contact: "Contact" },
  },

  // ── Hero ────────────────────────────────────────────
  hero: {
    ja: {
      headline: "未来をつなぐ、地図に残る仕事。",
      sub: '一般電気用工作物工事を中心に、電気工事\u201c施工\u201dに特化したプロフェッショナルチーム。',
    },
    pt: {
      headline: "Conectando o futuro. Trabalhos que ficam no mapa.",
      sub: "Equipe profissional especializada na execução de obras elétricas, com foco em instalações elétricas gerais.",
    },
    en: {
      headline: "Connecting the future. Work that stays on the map.",
      sub: "A professional team specializing in electrical construction execution, focused on general electrical installation works.",
    },
  },

  // ── Section: 仕事 vs 職 ─────────────────────────────
  shoku: {
    ja: {
      title: '仕事ではなく、\u201c職\u201dを持つ。',
      body: '「仕事」はその日の作業を指す。だが「職」は、一生をかけて磨き上げる技能であり、自分自身の価値そのものだ。充寵グループでは、ただ働くのではなく、電気工事という\u201c職\u201dを身につけ、誇りを持って現場に立つことを大切にしている。日々の作業の積み重ねが、やがて揺るぎない技術と信頼になる。それが「職を持つ」ということだ。',
    },
    pt: {
      title: "Não é apenas trabalho — é um ofício.",
      body: "\"Trabalho\" é o que se faz no dia a dia. Mas \"ofício\" é uma habilidade que se aprimora ao longo da vida — é o seu próprio valor. No Grupo Jyuchou, não se trata apenas de trabalhar: trata-se de dominar o ofício da instalação elétrica e estar no canteiro de obras com orgulho. O acúmulo diário de experiência se transforma em técnica inabalável e confiança. Isso é ter um ofício.",
    },
    en: {
      title: "Not just a job — a skilled trade.",
      body: "A \"job\" is what you do today. But a \"trade\" is a skill you refine over a lifetime — it becomes your identity and your value. At Jyuchou Group, we don't just work; we master the craft of electrical construction and stand on-site with pride. The daily accumulation of experience becomes unshakable expertise and trust. That is what it means to master a profession.",
    },
  },

  // ── Section: 施工スタンス ────────────────────────────
  stance: {
    ja: {
      title: "施工スタンス",
      items: [
        { label: "施工品質", desc: "一つひとつの接続、一本一本の配線に妥協しない。現場で求められる品質を、確実に実現する。" },
        { label: "図面に忠実", desc: "設計図面の意図を正確に読み取り、忠実に施工する。図面通りの仕上がりが、信頼の基盤となる。" },
        { label: "工程遵守", desc: "決められた工程を守り、全体の進行に貢献する。遅延なく、確実に自分の工程を完了させる。" },
        { label: "安全最優先", desc: "どんな状況でも安全を最優先とする。事故ゼロは、プロとしての最低限の責任である。" },
        { label: "確実な仕上がり", desc: "引き渡し後に手直しが不要な施工を目指す。一度で確実に仕上げることが、職人の矜持である。" },
      ],
    },
    pt: {
      title: "Postura na Execução",
      items: [
        { label: "Qualidade na Execução", desc: "Sem compromissos em cada conexão, em cada fio. Garantimos a qualidade exigida no canteiro de obras." },
        { label: "Fidelidade ao Projeto", desc: "Interpretamos com precisão a intenção do projeto e executamos fielmente. A execução conforme o projeto é a base da confiança." },
        { label: "Cumprimento do Cronograma", desc: "Respeitamos o cronograma estabelecido e contribuímos para o progresso geral. Concluímos nossa etapa sem atrasos." },
        { label: "Segurança em Primeiro Lugar", desc: "Em qualquer situação, a segurança é prioridade máxima. Zero acidentes é a responsabilidade mínima de um profissional." },
        { label: "Acabamento Impecável", desc: "Buscamos uma execução que não necessite de retrabalho após a entrega. Acertar de primeira é o orgulho do artesão." },
      ],
    },
    en: {
      title: "Execution Standards",
      items: [
        { label: "Construction Quality", desc: "No compromises on every connection, every wire. We deliver the quality demanded on-site, without exception." },
        { label: "Faithful to Drawings", desc: "We accurately interpret the design intent and execute faithfully. Delivering exactly as drawn is the foundation of trust." },
        { label: "Schedule Compliance", desc: "We adhere to established schedules and contribute to overall progress. Our phase is completed on time, every time." },
        { label: "Safety First", desc: "Safety is the top priority in any situation. Zero accidents is the minimum responsibility of a professional." },
        { label: "Reliable Finish", desc: "We aim for execution that requires no rework after handover. Getting it right the first time is a craftsman's pride." },
      ],
    },
  },

  // ── Section: 協力体制 ───────────────────────────────
  collab: {
    ja: {
      title: "協力体制",
      body: "設計やコンサルティングが必要な案件については、信頼のおけるパートナー企業と連携し、プロジェクトごとに最適なチームを編成します。施工の専門家として、協力会社と共に高品質な成果を実現します。",
    },
    pt: {
      title: "Estrutura de Cooperação",
      body: "Para projetos que exigem engenharia ou consultoria, colaboramos com empresas parceiras de confiança para formar a melhor equipe para cada projeto. Como especialistas em execução, trabalhamos junto com nossos parceiros para entregar resultados de alta qualidade.",
    },
    en: {
      title: "Collaborative Structure",
      body: "For projects requiring engineering or consulting, we collaborate with trusted partner companies to form the optimal team for each project. As execution specialists, we work alongside our partners to deliver high-quality results.",
    },
  },

  // ── Section: 施工内容 ───────────────────────────────
  services: {
    ja: {
      title: "施工内容",
      items: [
        { label: "低圧設備工事", desc: "照明器具・コンセント・スイッチなど、建物内の低圧電気設備の設置・配線工事を行います。" },
        { label: "幹線工事", desc: "受変電設備から各分電盤への幹線ケーブルの敷設・接続工事を実施します。" },
        { label: "配管・ラック据付工事", desc: "電線管やケーブルラックの据付・固定工事を行い、配線経路を確保します。" },
        { label: "配線工事", desc: "各種ケーブルの布設・結線工事を行います。整線・結束まで丁寧に仕上げます。" },
        { label: "盤据付・結線工事", desc: "分電盤・制御盤の据付から内部結線まで、一貫して対応します。" },
        { label: "一般電気用工作物工事", desc: "上記を含む一般電気用工作物工事全般に対応可能です。対応範囲として明記いたします。" },
      ],
    },
    pt: {
      title: "Serviços de Execução",
      items: [
        { label: "Instalações de Baixa Tensão", desc: "Instalação e fiação de equipamentos elétricos de baixa tensão, incluindo luminárias, tomadas e interruptores." },
        { label: "Obras de Alimentação Principal", desc: "Instalação e conexão de cabos principais desde subestações até quadros de distribuição." },
        { label: "Instalação de Eletrodutos e Eletrocalhas", desc: "Instalação e fixação de eletrodutos e eletrocalhas para garantir as rotas de fiação." },
        { label: "Obras de Fiação", desc: "Instalação e conexão de diversos cabos. Acabamento cuidadoso incluindo organização e amarração." },
        { label: "Instalação e Conexão de Painéis", desc: "Desde a instalação de quadros de distribuição e painéis de controle até a fiação interna." },
        { label: "Obras Elétricas Gerais", desc: "Atendemos todas as obras elétricas gerais, incluindo os serviços listados acima." },
      ],
    },
    en: {
      title: "Scope of Work",
      items: [
        { label: "Low-Voltage Equipment", desc: "Installation and wiring of low-voltage electrical equipment including lighting fixtures, outlets, and switches." },
        { label: "Main Line Works", desc: "Installation and connection of main cables from substations to distribution panels." },
        { label: "Conduit & Cable Tray Installation", desc: "Installation and securing of conduit and cable trays to establish wiring routes." },
        { label: "Wiring Works", desc: "Installation and termination of various cables. Careful finishing including cable dressing and bundling." },
        { label: "Panel Installation & Wiring", desc: "Comprehensive service from distribution and control panel installation to internal wiring." },
        { label: "General Electrical Works", desc: "We handle all general electrical installation works, including all services listed above." },
      ],
    },
  },

  // ── Section: 対応エリア ─────────────────────────────
  area: {
    ja: {
      title: "対応エリア",
      main: "東京・神奈川中心",
      sub: "埼玉・千葉",
    },
    pt: {
      title: "Área de Atuação",
      main: "Foco em Tóquio e Kanagawa",
      sub: "Saitama e Chiba",
    },
    en: {
      title: "Service Area",
      main: "Primarily Tokyo & Kanagawa",
      sub: "Saitama & Chiba",
    },
  },

  // ── Section: 会社概要 ───────────────────────────────
  company: {
    ja: {
      title: "会社概要",
      address: "神奈川県秦野市",
      name: "充寵グループ / JYUCHOU GROUP",
      business: "一般電気用工作物工事／電気工事施工",
      areaLabel: "活動エリア",
      area: "東京・神奈川中心",
      emailLabel: "メール",
      phoneLabel: "電話",
      addressLabel: "所在地",
      nameLabel: "屋号",
      businessLabel: "事業内容",
    },
    pt: {
      title: "Sobre a Empresa",
      address: "Hadano, Kanagawa",
      name: "Grupo Jyuchou / JYUCHOU GROUP",
      business: "Obras elétricas gerais / Execução de instalações elétricas",
      areaLabel: "Área de atuação",
      area: "Foco em Tóquio e Kanagawa",
      emailLabel: "E-mail",
      phoneLabel: "Telefone",
      addressLabel: "Endereço",
      nameLabel: "Nome comercial",
      businessLabel: "Atividade",
    },
    en: {
      title: "Company Overview",
      address: "Hadano, Kanagawa",
      name: "Jyuchou Group / JYUCHOU GROUP",
      business: "General electrical works / Electrical construction execution",
      areaLabel: "Service area",
      area: "Primarily Tokyo & Kanagawa",
      emailLabel: "Email",
      phoneLabel: "Phone",
      addressLabel: "Location",
      nameLabel: "Trade name",
      businessLabel: "Business",
    },
  },

  // ── CTA ─────────────────────────────────────────────
  cta: {
    ja: {
      recruit: "採用情報を見る",
      contact: "お取引・工事のご相談",
      instagram: "Instagramを見る",
    },
    pt: {
      recruit: "Ver vagas",
      contact: "Consultas comerciais",
      instagram: "Ver Instagram",
    },
    en: {
      recruit: "View Recruitment",
      contact: "Business Inquiries",
      instagram: "View Instagram",
    },
  },

  // ── Recruitment Page ────────────────────────────────
  recruit: {
    ja: {
      headline: "未来の設立メンバーを募集しています。",
      intro: "充寵グループは、将来の法人化を見据え、創立メンバーとして共に歩んでくれる仲間を探しています。年齢・学歴・性別は問いません。未経験者も積極的に採用しています（年間未経験者4名まで、同時育成は最大約5名）。信頼と絆のある関係を築きたい方を歓迎します。",
      prioritiesTitle: "求める人物像",
      priorities: [
        "年齢・学歴・性別不問",
        "未経験者を積極採用",
        '将来の法人化を見据え、\u201c柱\u201dになってほしい',
        "信頼と絆のある関係を築きたい方",
      ],
      conditionsTitle: "募集条件",
      conditions: [
        "18歳以上",
        "男女不問",
        "学歴不問",
        "未経験OK",
        "一人親方として働いてみたい方",
        "経験者も条件次第で採用",
      ],
      contractTitle: "契約形態",
      contractBody: "業務委託契約となりますが、作業工程の指導、日々の相談対応、丁寧なフォローアップなど、社員と同様のサポート体制を整えています。まずは質問だけでもOKです。",
      insuranceTitle: "必須事項（現場配置前）",
      insuranceItems: [
        "一人親方労災保険への加入が必須です（加入方法はご案内します）",
        "建設業国民保険への加入を推奨します（資格取得時のサポート手当、法人化を見据えたメリットが多いため）",
      ],
      toolsTitle: "工具について",
      toolsBody: "腰道具などが揃えられない場合は貸し出し可能です。まずは現場に慣れることを優先し、段階的に整えていく方針です。",
      payTitle: "日当",
      payInexperienced: "未経験：13,000円〜",
      payInexperiencedNote: "※できる作業内容により随時アップ",
      payExperienced: "経験者：要相談（希望日当も確認）",
      qualTitle: "資格について",
      qualPreferred: "あれば歓迎",
      qualPreferredItems: ["第一種電気工事士", "第二種電気工事士"],
      qualBaseline: "基本資格として取得してもらいます（取得方法はご案内します）",
      qualBaselineItems: [
        "低圧電気取扱い特別教育",
        "高所作業車特別教育",
        "職長・安全衛生教育",
      ],
      formTitle: "応募フォーム",
      formName: "名前",
      formBirthdate: "生年月日",
      formEmail: "メールアドレス",
      formPrefecture: "住んでいる県",
      formMotivation: "志望動機",
      formExperience: "経験",
      formExperienced: "経験者",
      formInexperienced: "未経験者",
      formYears: "経験年数",
      formYearsOptions: ["1年未満", "1〜3年", "3〜5年", "5年以上"],
      formDesiredPay: "希望日当",
      formSubmit: "送信する",
      formSuccess: "送信ありがとうございます。\n照合のため、InstagramからDMでお名前を送ってください。",
      formInstagramBtn: "Instagramを開く",
    },
    pt: {
      headline: "Estamos recrutando futuros membros fundadores.",
      intro: "O Grupo Jyuchou busca companheiros que caminhem juntos como membros fundadores, visando a futura incorporação. Não importa idade, escolaridade ou gênero. Recrutamos ativamente pessoas sem experiência (até 4 iniciantes por ano, treinamento simultâneo de até 5 pessoas). Buscamos pessoas que desejam construir relações de confiança e vínculo.",
      prioritiesTitle: "Perfil Desejado",
      priorities: [
        "Sem restrição de idade, escolaridade ou gênero",
        "Recrutamento ativo de iniciantes",
        "Buscamos pessoas que queiram ser pilares da futura empresa",
        "Pessoas que desejam construir relações de confiança",
      ],
      conditionsTitle: "Requisitos",
      conditions: [
        "Maiores de 18 anos",
        "Qualquer gênero",
        "Sem exigência de escolaridade",
        "Sem experiência — OK",
        "Pessoas interessadas em trabalhar como autônomo",
        "Profissionais experientes também são bem-vindos",
      ],
      contractTitle: "Tipo de Contrato",
      contractBody: "O contrato é de prestação de serviços, mas oferecemos suporte similar ao de um funcionário: orientação nos processos de trabalho, atendimento de dúvidas diárias e acompanhamento cuidadoso. Pode começar apenas com perguntas.",
      insuranceTitle: "Requisitos Obrigatórios (antes da alocação)",
      insuranceItems: [
        "É obrigatório o seguro de acidentes de trabalho para autônomos (orientamos sobre como se inscrever)",
        "Recomendamos a adesão ao seguro nacional de construção (há benefícios como auxílio para obtenção de qualificações e vantagens para a futura incorporação)",
      ],
      toolsTitle: "Sobre Ferramentas",
      toolsBody: "Se não tiver as ferramentas necessárias, podemos emprestá-las. A prioridade é se adaptar ao canteiro de obras primeiro, equipando-se gradualmente.",
      payTitle: "Diária",
      payInexperienced: "Sem experiência: a partir de ¥13.000",
      payInexperiencedNote: "※ Aumentos conforme as habilidades adquiridas",
      payExperienced: "Com experiência: a combinar (confirmamos a diária desejada)",
      qualTitle: "Qualificações",
      qualPreferred: "Desejável",
      qualPreferredItems: ["Eletricista de 1ª classe", "Eletricista de 2ª classe"],
      qualBaseline: "Qualificações básicas a serem obtidas (orientamos sobre como obtê-las)",
      qualBaselineItems: [
        "Treinamento especial em eletricidade de baixa tensão",
        "Treinamento especial em plataforma elevatória",
        "Educação de líder de equipe e segurança",
      ],
      formTitle: "Formulário de Candidatura",
      formName: "Nome",
      formBirthdate: "Data de nascimento",
      formEmail: "E-mail",
      formPrefecture: "Estado/Província de residência",
      formMotivation: "Motivação",
      formExperience: "Experiência",
      formExperienced: "Com experiência",
      formInexperienced: "Sem experiência",
      formYears: "Anos de experiência",
      formYearsOptions: ["Menos de 1 ano", "1 a 3 anos", "3 a 5 anos", "Mais de 5 anos"],
      formDesiredPay: "Diária desejada",
      formSubmit: "Enviar",
      formSuccess: "Obrigado pelo envio.\nPara verificação, envie seu nome por DM no Instagram.",
      formInstagramBtn: "Abrir Instagram",
    },
    en: {
      headline: "We are recruiting future founding members.",
      intro: "Jyuchou Group is looking for partners who will walk with us as founding members, with an eye toward future incorporation. Age, education, and gender do not matter. We actively recruit those without experience (up to 4 beginners per year, simultaneous training of up to 5). We welcome those who want to build relationships based on trust and bonds.",
      prioritiesTitle: "Who We're Looking For",
      priorities: [
        "No restrictions on age, education, or gender",
        "Active recruitment of beginners",
        "We want people who will become pillars of the future company",
        "People who want to build relationships of trust",
      ],
      conditionsTitle: "Requirements",
      conditions: [
        "18 years or older",
        "Any gender",
        "No education requirements",
        "No experience required",
        "Those interested in working as independent contractors",
        "Experienced professionals also welcome",
      ],
      contractTitle: "Contract Type",
      contractBody: "The contract is a service agreement, but we provide employee-level support: work process guidance, daily consultation, and careful follow-up. Feel free to start with just questions.",
      insuranceTitle: "Required Before Site Assignment",
      insuranceItems: [
        "Workers' accident insurance for independent contractors is mandatory (we will guide you through enrollment)",
        "Construction industry national insurance is recommended (benefits include qualification support allowance and advantages for future incorporation)",
      ],
      toolsTitle: "About Tools",
      toolsBody: "If you cannot prepare the necessary tools, we can lend them to you. The priority is getting comfortable on-site first, then gradually building your toolkit.",
      payTitle: "Daily Rate",
      payInexperienced: "No experience: from ¥13,000",
      payInexperiencedNote: "※ Increases based on acquired skills",
      payExperienced: "Experienced: negotiable (we confirm your desired rate)",
      qualTitle: "Qualifications",
      qualPreferred: "Preferred",
      qualPreferredItems: ["Class 1 Electrician", "Class 2 Electrician"],
      qualBaseline: "Basic qualifications to be obtained (we will guide you)",
      qualBaselineItems: [
        "Low-voltage electrical handling special training",
        "Aerial work platform special training",
        "Foreman & safety/health education",
      ],
      formTitle: "Application Form",
      formName: "Name",
      formBirthdate: "Date of birth",
      formEmail: "Email address",
      formPrefecture: "Prefecture / State of residence",
      formMotivation: "Motivation",
      formExperience: "Experience",
      formExperienced: "Experienced",
      formInexperienced: "No experience",
      formYears: "Years of experience",
      formYearsOptions: ["Less than 1 year", "1–3 years", "3–5 years", "5+ years"],
      formDesiredPay: "Desired daily rate",
      formSubmit: "Submit",
      formSuccess: "Thank you for your submission.\nFor verification, please send your name via Instagram DM.",
      formInstagramBtn: "Open Instagram",
    },
  },

  // ── Contact Page ────────────────────────────────────
  contact: {
    ja: {
      title: "お取引・工事のご相談",
      companyName: "企業名",
      personName: "担当者名",
      phone: "電話番号",
      email: "メールアドレス",
      message: "お問い合わせ内容",
      submit: "送信する",
      success: "内容を確認後、折り返しご連絡いたします。",
      directContact: "直接のご連絡",
    },
    pt: {
      title: "Consultas Comerciais",
      companyName: "Nome da empresa",
      personName: "Nome do responsável",
      phone: "Telefone",
      email: "E-mail",
      message: "Conteúdo da consulta",
      submit: "Enviar",
      success: "Após confirmar o conteúdo, entraremos em contato.",
      directContact: "Contato direto",
    },
    en: {
      title: "Business Inquiries",
      companyName: "Company name",
      personName: "Contact person",
      phone: "Phone number",
      email: "Email address",
      message: "Inquiry details",
      submit: "Submit",
      success: "We will review your inquiry and contact you shortly.",
      directContact: "Direct Contact",
    },
  },

  // ── Footer ──────────────────────────────────────────
  footer: {
    ja: { copyright: "充寵グループ" },
    pt: { copyright: "Grupo Jyuchou" },
    en: { copyright: "Jyuchou Group" },
  },
} as const;

export const INSTAGRAM_URL =
  "https://www.instagram.com/juchou.group?igsh=ZjV6NjAyZHA2bWt0&utm_source=qr";
export const EMAIL = "info@juchou-group.com";
export const PHONE = "050-5873-4183";

// Placeholder Google Apps Script endpoints (user will replace with real ones)
export const RECRUIT_FORM_ENDPOINT = "https://script.google.com/macros/s/AKfycbxmtpGPy-iFK2GMVeZMqdmasFr2Bgf1W_VDa-IlIn3WsnMBgiMyW6dbbQpgDjaBw9YWhQ/exec";
export const CONTACT_FORM_ENDPOINT = "https://script.google.com/macros/s/AKfycbxmtpGPy-iFK2GMVeZMqdmasFr2Bgf1W_VDa-IlIn3WsnMBgiMyW6dbbQpgDjaBw9YWhQ/exec";
