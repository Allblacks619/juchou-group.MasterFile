/* ============================================================
 * Header — Craftsman's Ledger Design
 * Logo image + text, flag-emoji language switcher, mobile menu
 * ============================================================ */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Lang } from "@/lib/translations";
import { Menu, X } from "lucide-react";

const LOGO_URL =
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663330554130/CtYvLyODvIfdtgNS.png";

const langOptions: { code: Lang; label: string; flag: string }[] = [
  { code: "ja", label: "JP", flag: "\u{1F1EF}\u{1F1F5}" },   // 🇯🇵
  { code: "pt", label: "BR", flag: "\u{1F1E7}\u{1F1F7}" },   // 🇧🇷
  { code: "en", label: "EN", flag: "\u{1F1EC}\u{1F1E7}" },   // 🇬🇧
];

export default function Header() {
  const { lang, t, prefix, switchLang } = useLanguage();
  const [location] = useLocation();
  const nav = t.nav[lang];
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { label: nav.home, href: prefix || "/" },
    { label: nav.recruit, href: `${prefix}/recruit` },
    { label: nav.contact, href: `${prefix}/contact` },
  ];

  // Determine current page path without lang prefix
  const currentPath = location.replace(/^\/(pt|en)/, "") || "/";

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-gold/20">
      <div className="container flex items-center justify-between h-16 md:h-20">
        {/* Logo — image + text */}
        <Link href={prefix || "/"} className="flex items-center gap-2.5 no-underline shrink-0">
          <img
            src={LOGO_URL}
            alt="充寵グループ"
            className="h-10 md:h-12 w-auto object-contain"
          />
          <span
            className="font-display text-base md:text-lg font-semibold tracking-wider text-gold hidden sm:inline"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            JYUCHOU GROUP
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-6 lg:gap-8">
          {navItems.map((item) => {
            const isActive =
              item.href === (prefix || "/")
                ? currentPath === "/"
                : currentPath === item.href.replace(prefix, "");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm tracking-widest uppercase no-underline transition-colors duration-300 ${
                  isActive
                    ? "text-gold"
                    : "text-warm-gray hover:text-warm-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}

          {/* ── Language Switch (flag emoji + label) ── */}
          <div className="flex items-center gap-1 ml-2 pl-4 border-l border-gold/20">
            {langOptions.map((l) => (
              <Link
                key={l.code}
                href={switchLang(l.code)}
                className={`flex items-center gap-1 px-2 py-1 rounded-sm text-xs tracking-wider no-underline transition-all duration-300 ${
                  lang === l.code
                    ? "bg-gold/15 text-gold font-bold"
                    : "text-warm-gray hover:text-warm-white hover:bg-warm-white/5"
                }`}
              >
                <span className="text-base leading-none">{l.flag}</span>
                <span>{l.label}</span>
              </Link>
            ))}
          </div>
        </nav>

        {/* Mobile: language flags + hamburger */}
        <div className="flex md:hidden items-center gap-2">
          {/* Compact language flags for mobile */}
          <div className="flex items-center gap-0.5">
            {langOptions.map((l) => (
              <Link
                key={l.code}
                href={switchLang(l.code)}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-0.5 px-1.5 py-1 rounded-sm text-[11px] no-underline transition-all ${
                  lang === l.code
                    ? "bg-gold/15 text-gold font-bold"
                    : "text-warm-gray"
                }`}
              >
                <span className="text-sm leading-none">{l.flag}</span>
                <span>{l.label}</span>
              </Link>
            ))}
          </div>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="text-warm-white p-2"
            aria-label="Menu"
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <div className="md:hidden bg-background/98 backdrop-blur-md border-b border-gold/20">
          <nav className="container py-6 flex flex-col gap-4">
            {navItems.map((item) => {
              const isActive =
                item.href === (prefix || "/")
                  ? currentPath === "/"
                  : currentPath === item.href.replace(prefix, "");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`text-sm tracking-widest uppercase no-underline py-2 transition-colors ${
                    isActive ? "text-gold" : "text-warm-gray"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
