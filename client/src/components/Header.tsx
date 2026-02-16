/* ============================================================
 * Header — Craftsman's Ledger Design
 * Thin gold bottom border, left-aligned logo, right language switch
 * Mobile hamburger menu
 * ============================================================ */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Lang } from "@/lib/translations";
import { Menu, X } from "lucide-react";

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

  const langs: { code: Lang; label: string }[] = [
    { code: "ja", label: "JP" },
    { code: "pt", label: "PT" },
    { code: "en", label: "EN" },
  ];

  // Determine current page path without lang prefix
  const currentPath = location.replace(/^\/(pt|en)/, "") || "/";

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-gold/20">
      <div className="container flex items-center justify-between h-16 md:h-20">
        {/* Logo */}
        <Link href={prefix || "/"} className="flex items-center gap-3 no-underline">
          <span
            className="font-display text-lg md:text-xl font-semibold tracking-wider text-gold"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            JYUCHOU GROUP
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
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

          {/* Language Switch */}
          <div className="flex items-center gap-1 ml-4 pl-4 border-l border-gold/20">
            {langs.map((l, i) => (
              <span key={l.code} className="flex items-center">
                <Link
                  href={switchLang(l.code)}
                  className={`text-xs tracking-widest no-underline transition-colors duration-300 px-1 ${
                    lang === l.code
                      ? "text-gold font-semibold"
                      : "text-warm-gray hover:text-warm-white"
                  }`}
                >
                  {l.label}
                </Link>
                {i < langs.length - 1 && (
                  <span className="text-gold/30 text-xs">|</span>
                )}
              </span>
            ))}
          </div>
        </nav>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden text-warm-white p-2"
          aria-label="Menu"
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
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
            <div className="flex items-center gap-2 pt-4 border-t border-gold/10">
              {langs.map((l, i) => (
                <span key={l.code} className="flex items-center">
                  <Link
                    href={switchLang(l.code)}
                    onClick={() => setMobileOpen(false)}
                    className={`text-xs tracking-widest no-underline px-1 ${
                      lang === l.code
                        ? "text-gold font-semibold"
                        : "text-warm-gray"
                    }`}
                  >
                    {l.label}
                  </Link>
                  {i < langs.length - 1 && (
                    <span className="text-gold/30 text-xs">|</span>
                  )}
                </span>
              ))}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
