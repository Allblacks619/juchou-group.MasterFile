import { useEffect } from "react";
import { type Lang } from "@/lib/translations";

interface SEOConfig {
  title: Record<Lang, string>;
  description: Record<Lang, string>;
  keywords: Record<Lang, string>;
}

const pageSEO: Record<string, SEOConfig> = {
  home: {
    title: {
      ja: "充寵グループ｜電気工事施工のプロフェッショナル｜埼玉・千葉・東京",
      pt: "JYUCHOU GROUP | Especialistas em Instalações Elétricas | Saitama, Chiba, Tóquio",
      en: "JYUCHOU GROUP | Professional Electrical Construction | Saitama, Chiba, Tokyo",
    },
    description: {
      ja: "充寵グループ（JYUCHOU GROUP）は一般電気用工作物工事を中心に電気工事施工に特化したプロフェッショナルチームです。埼玉・千葉・東京エリアで確実な施工品質をお届けします。",
      pt: "JYUCHOU GROUP é uma equipe profissional especializada em construção elétrica, focada em instalações elétricas gerais nas regiões de Saitama, Chiba e Tóquio.",
      en: "JYUCHOU GROUP is a professional team specializing in electrical construction, focused on general electrical installations in the Saitama, Chiba, and Tokyo areas.",
    },
    keywords: {
      ja: "充寵グループ,JYUCHOU GROUP,電気工事,電気工事施工,一般電気用工作物工事,埼玉,千葉,東京,電気工事士,電気設備工事",
      pt: "JYUCHOU GROUP,construção elétrica,instalações elétricas,Saitama,Chiba,Tóquio,eletricista,Brasil",
      en: "JYUCHOU GROUP,electrical construction,electrical installation,Saitama,Chiba,Tokyo,electrician,Japan",
    },
  },
  recruit: {
    title: {
      ja: "採用情報｜充寵グループ｜電気工事士 求人・未経験歓迎",
      pt: "Recrutamento | JYUCHOU GROUP | Vagas para Eletricistas",
      en: "Recruitment | JYUCHOU GROUP | Electrician Jobs",
    },
    description: {
      ja: "充寵グループの採用情報ページです。電気工事士の求人募集中。未経験者歓迎、資格取得支援あり。埼玉・千葉・東京エリアで一緒に働きませんか。",
      pt: "Página de recrutamento do JYUCHOU GROUP. Vagas abertas para eletricistas. Iniciantes são bem-vindos, com suporte para obtenção de certificações.",
      en: "JYUCHOU GROUP recruitment page. Now hiring electricians. Beginners welcome with certification support available.",
    },
    keywords: {
      ja: "充寵グループ,採用,求人,電気工事士,未経験歓迎,資格取得支援,埼玉,千葉,東京",
      pt: "JYUCHOU GROUP,recrutamento,vagas,eletricista,iniciantes,certificação,Saitama",
      en: "JYUCHOU GROUP,recruitment,jobs,electrician,beginners welcome,certification,Saitama",
    },
  },
  contact: {
    title: {
      ja: "お問い合わせ｜充寵グループ｜電気工事のご相談",
      pt: "Contato | JYUCHOU GROUP | Consultas sobre Instalações Elétricas",
      en: "Contact | JYUCHOU GROUP | Electrical Construction Inquiries",
    },
    description: {
      ja: "充寵グループへのお問い合わせページです。電気工事に関するご相談、お見積もり依頼はこちらからお気軽にどうぞ。LINE WORKS・メール・お電話でもお問い合わせいただけます。",
      pt: "Página de contato do JYUCHOU GROUP. Entre em contato conosco para consultas sobre instalações elétricas. Disponível via LINE WORKS, e-mail e telefone.",
      en: "JYUCHOU GROUP contact page. Feel free to reach out for electrical construction inquiries and estimates. Available via LINE WORKS, email, and phone.",
    },
    keywords: {
      ja: "充寵グループ,お問い合わせ,電気工事,見積もり,相談,LINE WORKS",
      pt: "JYUCHOU GROUP,contato,instalações elétricas,orçamento,consulta,LINE WORKS",
      en: "JYUCHOU GROUP,contact,electrical construction,estimate,inquiry,LINE WORKS",
    },
  },
};

export function usePageSEO(page: "home" | "recruit" | "contact", lang: Lang) {
  useEffect(() => {
    const seo = pageSEO[page];
    if (!seo) return;

    // Set document title
    document.title = seo.title[lang];

    // Set meta description
    let descMeta = document.querySelector('meta[name="description"]');
    if (!descMeta) {
      descMeta = document.createElement("meta");
      descMeta.setAttribute("name", "description");
      document.head.appendChild(descMeta);
    }
    descMeta.setAttribute("content", seo.description[lang]);

    // Set meta keywords
    let kwMeta = document.querySelector('meta[name="keywords"]');
    if (!kwMeta) {
      kwMeta = document.createElement("meta");
      kwMeta.setAttribute("name", "keywords");
      document.head.appendChild(kwMeta);
    }
    kwMeta.setAttribute("content", seo.keywords[lang]);

    // Set OG title
    let ogTitle = document.querySelector('meta[property="og:title"]');
    if (!ogTitle) {
      ogTitle = document.createElement("meta");
      ogTitle.setAttribute("property", "og:title");
      document.head.appendChild(ogTitle);
    }
    ogTitle.setAttribute("content", seo.title[lang]);

    // Set OG description
    let ogDesc = document.querySelector('meta[property="og:description"]');
    if (!ogDesc) {
      ogDesc = document.createElement("meta");
      ogDesc.setAttribute("property", "og:description");
      document.head.appendChild(ogDesc);
    }
    ogDesc.setAttribute("content", seo.description[lang]);

    // Set OG locale
    let ogLocale = document.querySelector('meta[property="og:locale"]');
    if (!ogLocale) {
      ogLocale = document.createElement("meta");
      ogLocale.setAttribute("property", "og:locale");
      document.head.appendChild(ogLocale);
    }
    const localeMap: Record<Lang, string> = {
      ja: "ja_JP",
      pt: "pt_BR",
      en: "en_US",
    };
    ogLocale.setAttribute("content", localeMap[lang]);

    // Set html lang attribute
    document.documentElement.lang = lang === "pt" ? "pt-BR" : lang;

    // Set canonical URL
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    const basePath =
      page === "home" ? "" : page === "recruit" ? "/recruit" : "/contact";
    const langPath = lang === "ja" ? "" : `/${lang}`;
    canonical.setAttribute(
      "href",
      `https://juchou-group.com${langPath}${basePath}`,
    );
  }, [page, lang]);
}
