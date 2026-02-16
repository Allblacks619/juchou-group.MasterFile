/* ============================================================
 * Footer — Craftsman's Ledger Design
 * Minimal footer with gold line separator
 * ============================================================ */
import { useLanguage } from "@/contexts/LanguageContext";
import { INSTAGRAM_URL, EMAIL, PHONE } from "@/lib/translations";
import { Instagram, Mail, Phone as PhoneIcon } from "lucide-react";

export default function Footer() {
  const { lang, t } = useLanguage();
  const footer = t.footer[lang];

  return (
    <footer className="border-t border-gold/10">
      <div className="container py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
          {/* Brand */}
          <div>
            <span
              className="font-display text-lg font-semibold tracking-wider text-gold"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              JYUCHOU GROUP
            </span>
            <p className="text-warm-gray text-sm mt-2">
              {footer.copyright}
            </p>
          </div>

          {/* Contact Info */}
          <div className="flex flex-col gap-3">
            <a
              href={`mailto:${EMAIL}`}
              className="flex items-center gap-3 text-sm text-warm-gray hover:text-gold transition-colors no-underline"
            >
              <Mail size={14} className="text-gold/50" />
              {EMAIL}
            </a>
            <a
              href={`tel:${PHONE}`}
              className="flex items-center gap-3 text-sm text-warm-gray hover:text-gold transition-colors no-underline"
            >
              <PhoneIcon size={14} className="text-gold/50" />
              {PHONE}
            </a>
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 text-sm text-warm-gray hover:text-gold transition-colors no-underline"
            >
              <Instagram size={14} className="text-gold/50" />
              Instagram
            </a>
          </div>

          {/* Legal */}
          <div className="md:text-right">
            <p className="text-warm-gray/50 text-xs">
              &copy; {new Date().getFullYear()} {footer.copyright}. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
