/* ============================================================
 * CONTACT — Craftsman's Ledger Design
 * Business inquiry form connected to Google Sheets
 * ============================================================ */
import { useState } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  EMAIL,
  PHONE,
  INSTAGRAM_URL,
  LINEWORKS_URL,
  INSTAGRAM_QR_URL,
  LINEWORKS_QR_URL,
  CONTACT_FORM_ENDPOINT,
} from "@/lib/translations";
import Layout from "@/components/Layout";
import {
  Mail,
  Phone as PhoneIcon,
  CheckCircle,
  ArrowRight,
  Instagram,
  MessageCircle,
} from "lucide-react";

export default function Contact() {
  const { lang, t } = useLanguage();
  const c = t.contact[lang];
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    try {
      await fetch(CONTACT_FORM_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full bg-dark-surface/50 border border-gold/10 text-warm-white px-4 py-3 text-sm focus:border-gold/40 focus:outline-none transition-colors";

  return (
    <Layout>
      {/* ── Header ───────────────────────────────────── */}
      <section className="pt-32 md:pt-40 pb-12">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="gold-line w-24 mb-8" />
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-warm-white tracking-tight">
              {c.title}
            </h1>
          </motion.div>
        </div>
      </section>

      {/* ── Form + Contact Info ──────────────────────── */}
      <section className="pb-20 md:pb-32">
        <div className="container">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 lg:gap-16">
            {/* Form */}
            <div className="lg:col-span-2">
              {submitted ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center py-16"
                >
                  <CheckCircle size={48} className="text-gold mx-auto mb-6" />
                  <p className="text-warm-white text-lg">{c.success}</p>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label className="block text-sm text-gold/70 mb-2">{c.companyName}</label>
                    <input name="companyName" required className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm text-gold/70 mb-2">{c.personName}</label>
                    <input name="personName" required className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm text-gold/70 mb-2">{c.phone}</label>
                    <input name="phone" type="tel" required className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm text-gold/70 mb-2">{c.email}</label>
                    <input name="email" type="email" required className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm text-gold/70 mb-2">{c.message}</label>
                    <textarea name="message" rows={6} required className={`${inputClass} resize-none`} />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center gap-3 bg-gold text-background font-bold px-8 py-4 tracking-wider hover:bg-gold-dim transition-colors disabled:opacity-50"
                  >
                    {loading ? (
                      <span className="animate-pulse">{c.submit}</span>
                    ) : (
                      <>
                        {c.submit}
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>

            {/* Direct Contact Sidebar */}
            <div className="lg:col-span-1">
              <div className="border border-gold/10 bg-dark-surface/30 p-8 sticky top-28 space-y-8">
                <h3 className="text-base font-bold text-warm-white">
                  {c.directContact}
                </h3>

                {/* Contact links */}
                <div className="space-y-4">
                  <a
                    href={`mailto:${EMAIL}`}
                    className="flex items-center gap-3 text-sm text-warm-gray hover:text-gold transition-colors no-underline"
                  >
                    <Mail size={16} className="text-gold/50 shrink-0" />
                    {EMAIL}
                  </a>
                  <a
                    href={`tel:${PHONE}`}
                    className="flex items-center gap-3 text-sm text-warm-gray hover:text-gold transition-colors no-underline"
                  >
                    <PhoneIcon size={16} className="text-gold/50 shrink-0" />
                    {PHONE}
                  </a>
                  <a
                    href={INSTAGRAM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-sm text-warm-gray hover:text-gold transition-colors no-underline"
                  >
                    <Instagram size={16} className="text-gold/50 shrink-0" />
                    @juchou.group
                  </a>
                  <a
                    href={LINEWORKS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-sm text-warm-gray hover:text-gold transition-colors no-underline"
                  >
                    <MessageCircle size={16} className="text-gold/50 shrink-0" />
                    LINE WORKS
                  </a>
                </div>

                {/* QR Codes */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gold/10">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-xs text-gold/60 tracking-wider uppercase">Instagram</p>
                    <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
                      <img
                        src={INSTAGRAM_QR_URL}
                        alt="Instagram QR"
                        className="w-24 h-24 rounded-lg object-cover"
                      />
                    </a>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-xs text-gold/60 tracking-wider uppercase">LINE WORKS</p>
                    <a href={LINEWORKS_URL} target="_blank" rel="noopener noreferrer">
                      <img
                        src={LINEWORKS_QR_URL}
                        alt="LINE WORKS QR"
                        className="w-24 h-24 rounded-lg object-cover"
                      />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
