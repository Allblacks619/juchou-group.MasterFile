/* ============================================================
 * Footer — Craftsman's Ledger Design
 * Logo image, contact info, Instagram QR code
 * ============================================================ */
import { useLanguage } from "@/contexts/LanguageContext";
import { INSTAGRAM_URL, EMAIL, PHONE } from "@/lib/translations";
import { Instagram, Mail, Phone as PhoneIcon } from "lucide-react";

const LOGO_URL =
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663330554130/ekwsVLnLZDZZusPp.png";
const QR_URL =
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663330554130/dmgnirwDgiwzwstH.jpeg";

export default function Footer() {
  const { lang, t } = useLanguage();
  const footer = t.footer[lang];

  return (
    <footer className="border-t border-gold/10">
      <div className="container py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-10">
          {/* Brand — Logo + name */}
          <div className="flex flex-col items-start gap-3">
            <img
              src={LOGO_URL}
              alt="充寵グループ"
              className="h-16 w-auto object-contain"
            />
            <span
              className="font-display text-lg font-semibold tracking-wider text-gold"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              JYUCHOU GROUP
            </span>
            <p className="text-warm-gray text-sm mt-1">
              {footer.copyright}
            </p>
          </div>

          {/* Contact Info */}
          <div className="flex flex-col gap-3 justify-center">
            <a
              href={`mailto:${EMAIL}`}
              className="flex items-center gap-3 text-sm text-warm-gray hover:text-gold transition-colors no-underline"
            >
              <Mail size={14} className="text-gold/50 shrink-0" />
              {EMAIL}
            </a>
            <a
              href={`tel:${PHONE}`}
              className="flex items-center gap-3 text-sm text-warm-gray hover:text-gold transition-colors no-underline"
            >
              <PhoneIcon size={14} className="text-gold/50 shrink-0" />
              {PHONE}
            </a>
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 text-sm text-warm-gray hover:text-gold transition-colors no-underline"
            >
              <Instagram size={14} className="text-gold/50 shrink-0" />
              @juchou.group
            </a>
          </div>

          {/* Instagram QR Code */}
          <div className="flex flex-col items-center md:items-start gap-3">
            <p className="text-xs text-gold/60 tracking-wider uppercase">Instagram</p>
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <img
                src={QR_URL}
                alt="Instagram QR Code — @juchou.group"
                className="w-28 h-28 md:w-32 md:h-32 rounded-md object-cover bg-white p-1"
              />
            </a>
            <p className="text-xs text-warm-gray">@juchou.group</p>
          </div>

          {/* Legal */}
          <div className="md:text-right flex flex-col justify-end">
            <p className="text-warm-gray/50 text-xs">
              &copy; {new Date().getFullYear()} {footer.copyright}. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
