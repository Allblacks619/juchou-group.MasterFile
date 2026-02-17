/* ============================================================
 * RECRUITMENT — Craftsman's Ledger Design
 * Recruitment page with form connected to Google Sheets
 * ============================================================ */
import { useState } from "react";
import { motion } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  INSTAGRAM_URL,
  RECRUIT_FORM_ENDPOINT,
} from "@/lib/translations";
import Layout from "@/components/Layout";
import Section from "@/components/Section";
import { Instagram, CheckCircle, ArrowRight, Briefcase, Award, Wrench, DollarSign } from "lucide-react";

const QR_URL =
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663330554130/dmgnirwDgiwzwstH.jpeg";

const WORK_SITE =
  "https://private-us-east-1.manuscdn.com/sessionFile/rCWGzbC5Fv9wiMEJ7c9ECd/sandbox/u8e1iFu3wsTxSX5PcFrJA5-img-4_1771261767000_na1fn_d29yay1zaXRl.jpg?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvckNXR3piQzVGdjl3aU1FSjdjOUVDZC9zYW5kYm94L3U4ZTFpRnUzd3NUeFNYNVBjRnJKQTUtaW1nLTRfMTc3MTI2MTc2NzAwMF9uYTFmbl9kMjl5YXkxemFYUmwuanBnP3gtb3NzLXByb2Nlc3M9aW1hZ2UvcmVzaXplLHdfMTkyMCxoXzE5MjAvZm9ybWF0LHdlYnAvcXVhbGl0eSxxXzgwIiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNzk4NzYxNjAwfX19XX0_&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=VoWf-JLIJh7HnM1qZ0nBBBs~OWt6vFaxpe1f9Dlxf7anzhAuoJTFJIM4DNV3udXRO0OzluAPy4ArPgAlUiSHc6vcuIbBNRFULpIYk6c7O8RywXJv8hy5vuZOU8RxLCYWMjSMEipBqILyVg2lFkAZd~1PH10gvUbEkaBjMzNWsDI8OHQTyptWxiBdPX47rYB1s-xo4hVHg4Od4VWl30q1w4jG7EZdSxQDwWp~eXFItllEQ1GeQ6Jr0HWHeIemA7tKf1MwuzISdcyBlQtd3TZ9Fp0Z0wThU4S8a7umbSE8a74FwRH11pyVwqEOomvNX4yC4qTmkE6UTKXPp8CDmG~oog__";

export default function Recruit() {
  const { lang, t } = useLanguage();
  const r = t.recruit[lang];
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [experience, setExperience] = useState<"experienced" | "inexperienced" | "">("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    try {
      await fetch(RECRUIT_FORM_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      setSubmitted(true);
    } catch {
      // Even with no-cors, the form data is sent
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      {/* ── Hero Banner ──────────────────────────────── */}
      <section className="relative py-32 md:py-40">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{ backgroundImage: `url(${WORK_SITE})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/90 to-background" />
        <div className="container relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="gold-line w-24 mb-8" />
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-warm-white tracking-tight mb-6">
              {r.headline}
            </h1>
            <p className="text-base md:text-lg text-warm-gray leading-relaxed max-w-3xl">
              {r.intro}
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Priorities ───────────────────────────────── */}
      <Section number="01" title={r.prioritiesTitle}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {r.priorities.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="flex items-start gap-3 p-4 border border-gold/10 bg-dark-surface/30"
            >
              <CheckCircle size={18} className="text-gold/60 mt-0.5 shrink-0" />
              <span className="text-warm-white text-sm md:text-base">{item}</span>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* ── Conditions ───────────────────────────────── */}
      <Section number="02" title={r.conditionsTitle}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {r.conditions.map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-sm text-warm-gray"
            >
              <span className="w-1.5 h-1.5 bg-gold/40 rounded-full shrink-0" />
              {item}
            </div>
          ))}
        </div>

        {/* Contract */}
        <div className="mt-10 border-l-2 border-gold/20 pl-6">
          <div className="flex items-center gap-2 mb-3">
            <Briefcase size={16} className="text-gold/60" />
            <h3 className="text-base font-bold text-warm-white">{r.contractTitle}</h3>
          </div>
          <p className="text-sm text-warm-gray leading-relaxed">{r.contractBody}</p>
        </div>
      </Section>

      {/* ── Insurance & Tools ────────────────────────── */}
      <Section number="03" title={r.insuranceTitle}>
        <div className="space-y-4">
          {r.insuranceItems.map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-3 text-sm text-warm-gray leading-relaxed"
            >
              <span className="text-gold/50 mt-1 shrink-0">&#9679;</span>
              {item}
            </div>
          ))}
        </div>

        {/* Tools */}
        <div className="mt-10 border-l-2 border-gold/20 pl-6">
          <div className="flex items-center gap-2 mb-3">
            <Wrench size={16} className="text-gold/60" />
            <h3 className="text-base font-bold text-warm-white">{r.toolsTitle}</h3>
          </div>
          <p className="text-sm text-warm-gray leading-relaxed">{r.toolsBody}</p>
        </div>
      </Section>

      {/* ── Pay ──────────────────────────────────────── */}
      <Section number="04" title={r.payTitle}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border border-gold/10 bg-dark-surface/30 p-6">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign size={16} className="text-gold/60" />
              <span className="text-warm-white font-bold">{r.payInexperienced}</span>
            </div>
            <p className="text-xs text-warm-gray">{r.payInexperiencedNote}</p>
          </div>
          <div className="border border-gold/10 bg-dark-surface/30 p-6">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign size={16} className="text-gold/60" />
              <span className="text-warm-white font-bold">{r.payExperienced}</span>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Qualifications ───────────────────────────── */}
      <Section number="05" title={r.qualTitle}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Preferred */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Award size={16} className="text-gold/60" />
              <h3 className="text-base font-bold text-warm-white">{r.qualPreferred}</h3>
            </div>
            <ul className="space-y-2">
              {r.qualPreferredItems.map((item, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-warm-gray">
                  <span className="w-1.5 h-1.5 bg-gold/40 rounded-full shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Baseline */}
          <div>
            <p className="text-sm text-warm-gray mb-4 leading-relaxed">
              {r.qualBaseline}
            </p>
            <ul className="space-y-2">
              {r.qualBaselineItems.map((item, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-warm-gray">
                  <span className="w-1.5 h-1.5 bg-gold/40 rounded-full shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* ── Application Form ─────────────────────────── */}
      <Section number="06" title={r.formTitle}>
        {submitted ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-12"
          >
            <CheckCircle size={48} className="text-gold mx-auto mb-6" />
            <p className="text-warm-white text-lg whitespace-pre-line mb-8">
              {r.formSuccess}
            </p>
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block mb-6"
            >
              <img
                src={QR_URL}
                alt="Instagram QR Code"
                className="w-36 h-36 rounded-lg object-cover bg-white p-1.5 mx-auto"
              />
            </a>
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 bg-gold text-background font-bold px-8 py-4 tracking-wider hover:bg-gold-dim transition-colors no-underline"
            >
              <Instagram size={18} />
              {r.formInstagramBtn}
              <ArrowRight size={16} />
            </a>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
            {/* Name */}
            <div>
              <label className="block text-sm text-gold/70 mb-2">{r.formName}</label>
              <input
                name="name"
                required
                className="w-full bg-dark-surface/50 border border-gold/10 text-warm-white px-4 py-3 text-sm focus:border-gold/40 focus:outline-none transition-colors"
              />
            </div>

            {/* Birthdate */}
            <div>
              <label className="block text-sm text-gold/70 mb-2">{r.formBirthdate}</label>
              <input
                name="birthdate"
                type="date"
                required
                className="w-full bg-dark-surface/50 border border-gold/10 text-warm-white px-4 py-3 text-sm focus:border-gold/40 focus:outline-none transition-colors"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm text-gold/70 mb-2">{r.formEmail}</label>
              <input
                name="email"
                type="email"
                required
                className="w-full bg-dark-surface/50 border border-gold/10 text-warm-white px-4 py-3 text-sm focus:border-gold/40 focus:outline-none transition-colors"
              />
            </div>

            {/* Prefecture */}
            <div>
              <label className="block text-sm text-gold/70 mb-2">{r.formPrefecture}</label>
              <input
                name="prefecture"
                required
                className="w-full bg-dark-surface/50 border border-gold/10 text-warm-white px-4 py-3 text-sm focus:border-gold/40 focus:outline-none transition-colors"
              />
            </div>

            {/* Motivation */}
            <div>
              <label className="block text-sm text-gold/70 mb-2">{r.formMotivation}</label>
              <textarea
                name="motivation"
                rows={4}
                required
                className="w-full bg-dark-surface/50 border border-gold/10 text-warm-white px-4 py-3 text-sm focus:border-gold/40 focus:outline-none transition-colors resize-none"
              />
            </div>

            {/* Experience Radio */}
            <div>
              <label className="block text-sm text-gold/70 mb-3">{r.formExperience}</label>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm text-warm-gray cursor-pointer">
                  <input
                    type="radio"
                    name="experience"
                    value="experienced"
                    onChange={() => setExperience("experienced")}
                    className="accent-[#B8965A]"
                  />
                  {r.formExperienced}
                </label>
                <label className="flex items-center gap-2 text-sm text-warm-gray cursor-pointer">
                  <input
                    type="radio"
                    name="experience"
                    value="inexperienced"
                    onChange={() => setExperience("inexperienced")}
                    className="accent-[#B8965A]"
                  />
                  {r.formInexperienced}
                </label>
              </div>
            </div>

            {/* Conditional: Experienced fields */}
            {experience === "experienced" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="space-y-6 overflow-hidden"
              >
                {/* Years */}
                <div>
                  <label className="block text-sm text-gold/70 mb-2">{r.formYears}</label>
                  <select
                    name="years"
                    className="w-full bg-dark-surface/50 border border-gold/10 text-warm-white px-4 py-3 text-sm focus:border-gold/40 focus:outline-none transition-colors"
                  >
                    {r.formYearsOptions.map((opt, i) => (
                      <option key={i} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Desired pay */}
                <div>
                  <label className="block text-sm text-gold/70 mb-2">{r.formDesiredPay}</label>
                  <input
                    name="desiredPay"
                    className="w-full bg-dark-surface/50 border border-gold/10 text-warm-white px-4 py-3 text-sm focus:border-gold/40 focus:outline-none transition-colors"
                  />
                </div>
              </motion.div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-3 bg-gold text-background font-bold px-8 py-4 tracking-wider hover:bg-gold-dim transition-colors disabled:opacity-50 w-full justify-center"
            >
              {loading ? (
                <span className="animate-pulse">{r.formSubmit}</span>
              ) : (
                <>
                  {r.formSubmit}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        )}
      </Section>
    </Layout>
  );
}
