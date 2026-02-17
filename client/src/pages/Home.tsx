/* ============================================================
 * HOME — Craftsman's Ledger Design
 * Deep black bg, gold accents, left-aligned asymmetric layout
 * Sections: Hero, Shoku, Stance, Collab, Services, Area, Company, CTA
 * ============================================================ */
import { motion } from "framer-motion";
import { Link } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  INSTAGRAM_URL,
  LINEWORKS_URL,
  INSTAGRAM_QR_URL,
  LINEWORKS_QR_URL,
  EMAIL,
  PHONE,
} from "@/lib/translations";
import Layout from "@/components/Layout";
import Section from "@/components/Section";
import {
  Instagram,
  Mail,
  Phone as PhoneIcon,
  MessageCircle,
  MapPin,
  ArrowRight,
  Shield,
  Ruler,
  Clock,
  HardHat,
  CheckCircle,
} from "lucide-react";

const HERO_BG =
  "https://private-us-east-1.manuscdn.com/sessionFile/rCWGzbC5Fv9wiMEJ7c9ECd/sandbox/u8e1iFu3wsTxSX5PcFrJA5-img-1_1771261771000_na1fn_aGVyby1iZw.jpg?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvckNXR3piQzVGdjl3aU1FSjdjOUVDZC9zYW5kYm94L3U4ZTFpRnUzd3NUeFNYNVBjRnJKQTUtaW1nLTFfMTc3MTI2MTc3MTAwMF9uYTFmbl9hR1Z5YnkxaVp3LmpwZz94LW9zcy1wcm9jZXNzPWltYWdlL3Jlc2l6ZSx3XzE5MjAsaF8xOTIwL2Zvcm1hdCx3ZWJwL3F1YWxpdHkscV84MCIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5ODc2MTYwMH19fV19&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=us3zQtvdvnBaJPZXzSOU3dSI8FRT241S3ocPQb6yvCBb7BSDzSvJgujD1fqQL0I5tsVBrweYBQ9dHiZUYPImOXWmZDH1dCuzcv42kaGCxtYgRv2WLOVfHy96yVFDZLshVapYM5IUQFkm04Pr3RSk4FtZqui1WHvWhf9gHZHM6SMlgqybAS0WIIBX0NhYasxkQCaAk0w9BtJ2VH-IzwXdAUFRzrV1qDZYZZHK4GRWuwWbT2wuYwUxsu5ob83SkxkPUkeI7j634Ebxo9cayiGgUsZaVY0lww9a1qcvw5GvVNazil6oWjpmenClY2wiWUjNnGZpnUL8EHAQB5E119wNHg__";

const WORK_CONDUIT =
  "https://private-us-east-1.manuscdn.com/sessionFile/rCWGzbC5Fv9wiMEJ7c9ECd/sandbox/u8e1iFu3wsTxSX5PcFrJA5-img-2_1771261777000_na1fn_d29yay1jb25kdWl0.jpg?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvckNXR3piQzVGdjl3aU1FSjdjOUVDZC9zYW5kYm94L3U4ZTFpRnUzd3NUeFNYNVBjRnJKQTUtaW1nLTJfMTc3MTI2MTc3NzAwMF9uYTFmbl9kMjl5YXkxamIyNWtkV2wwLmpwZz94LW9zcy1wcm9jZXNzPWltYWdlL3Jlc2l6ZSx3XzE5MjAsaF8xOTIwL2Zvcm1hdCx3ZWJwL3F1YWxpdHkscV84MCIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5ODc2MTYwMH19fV19&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=EkU1gjwHz54ekN80mlxu7h8MF8tRspP1ASYsJTS35vsV7HlOWMs1K8LKlw-ft3KENI-7boNooCm5pkbS6cfBbPtCHRzE3w3Q8kNTBo9pvSkNRyuY4qNo01DAJHyoetSTy9nKoA-KjaFvn-lSrTzrrcER-Px0lrNrc9HxAD-P2AOoml3fSbLah4BDT3DW5JYfzoOj2Ha5so26oWRD-XCYqk3aejVX9oiyygxDNozHtPpRP~IpKirs68gA0~uF4pBr8bT0OQcst6TcGxCCuqIsWQNmBoMDczxfCMEKC0o5ZAl6Trv-GjYXNSoRhn5cRWY7PG69b-9CMiPgZZ5PFXTDBQ__";

const WORK_PANEL =
  "https://private-us-east-1.manuscdn.com/sessionFile/rCWGzbC5Fv9wiMEJ7c9ECd/sandbox/u8e1iFu3wsTxSX5PcFrJA5-img-3_1771261784000_na1fn_d29yay1wYW5lbA.jpg?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvckNXR3piQzVGdjl3aU1FSjdjOUVDZC9zYW5kYm94L3U4ZTFpRnUzd3NUeFNYNVBjRnJKQTUtaW1nLTNfMTc3MTI2MTc4NDAwMF9uYTFmbl9kMjl5YXkxd1lXNWxiQS5qcGc~eC1vc3MtcHJvY2Vzcz1pbWFnZS9yZXNpemUsd18xOTIwLGhfMTkyMC9mb3JtYXQsd2VicC9xdWFsaXR5LHFfODAiLCJDb25kaXRpb24iOnsiRGF0ZUxlc3NUaGFuIjp7IkFXUzpFcG9jaFRpbWUiOjE3OTg3NjE2MDB9fX1dfQ__&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=DYWFDlTk-fC2-M8OoS~ttkDGLU22lPw50cudMHeosJThjGUggmj-ZIUbUoyVwmL3SlviGP6LNMn79s64eG6Z~C7933gqnUB5tDko4lvxG5edmeTi1GiB-BoWqIaabFbJpUXGyYR1QBoIXWiTpZyo3AZt0qeAHOe~MkJBAj~Mqz4F1rlqOYUEdluQL7b~sqAsbHHiaWq46nCr2F2r9ozvY0As31zkMxnV9jSd7zE8arcqrh64D765zdz8uXTfRyXpbJG942A~ibNSTp3g4L5V1JmkYkZ3rYns24BKXkzwQgJYl49wzKnAGE5T~P9Ticuo6vGg1~h1FvBin6jq93MEBQ__";



const stanceIcons = [CheckCircle, Ruler, Clock, Shield, HardHat];

export default function Home() {
  const { lang, t, prefix } = useLanguage();
  const hero = t.hero[lang];
  const shoku = t.shoku[lang];
  const stance = t.stance[lang];
  const collab = t.collab[lang];
  const services = t.services[lang];
  const area = t.area[lang];
  const company = t.company[lang];
  const cta = t.cta[lang];

  return (
    <Layout>
      {/* ── HERO ─────────────────────────────────────── */}
      <section className="relative min-h-[90vh] md:min-h-screen flex items-end">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${HERO_BG})` }}
        />
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/40" />

        <div className="container relative z-10 pb-20 md:pb-32">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-3xl"
          >
            <div className="gold-line w-24 mb-8" />
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tight text-warm-white mb-6" style={{fontSize: '54px'}}>
              {hero.headline}
            </h1>
            <p className="text-base md:text-lg text-warm-gray leading-relaxed max-w-2xl" style={{fontSize: '17px'}}>
              {hero.sub}
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── 仕事 vs 職 ──────────────────────────────── */}
      <Section number="01" title={shoku.title}>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 lg:gap-16 items-center">
          <div className="lg:col-span-3">
            <p className="text-base md:text-lg text-warm-gray leading-loose">
              {shoku.body}
            </p>
          </div>
          <div className="lg:col-span-2">
            <div className="relative overflow-hidden rounded-sm">
              <img
                src={WORK_CONDUIT}
                alt="Electrical conduit work"
                className="w-full h-64 md:h-80 object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent" />
            </div>
          </div>
        </div>
      </Section>

      {/* ── 施工スタンス ─────────────────────────────── */}
      <Section number="02" title={stance.title}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {stance.items.map((item, i) => {
            const Icon = stanceIcons[i] || CheckCircle;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                className="border border-gold/10 bg-dark-surface/50 p-6 md:p-8 group hover:border-gold/30 transition-colors duration-500"
              >
                <Icon
                  size={20}
                  className="text-gold/60 mb-4 group-hover:text-gold transition-colors duration-500"
                />
                <h3 className="text-lg font-bold text-warm-white mb-3">
                  {item.label}
                </h3>
                <p className="text-sm text-warm-gray leading-relaxed">
                  {item.desc}
                </p>
              </motion.div>
            );
          })}
        </div>
      </Section>

      {/* ── 協力体制 ─────────────────────────────────── */}
      <Section number="03" title={collab.title}>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 lg:gap-16 items-center">
          <div className="lg:col-span-2 order-2 lg:order-1">
            <div className="relative overflow-hidden rounded-sm">
              <img
                src={WORK_PANEL}
                alt="Electrical panel work"
                className="w-full h-64 md:h-80 object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent" />
            </div>
          </div>
          <div className="lg:col-span-3 order-1 lg:order-2">
            <p className="text-base md:text-lg text-warm-gray leading-loose">
              {collab.body}
            </p>
          </div>
        </div>
      </Section>

      {/* ── 施工内容 ─────────────────────────────────── */}
      <Section number="04" title={services.title}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-gold/10">
          {services.items.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="bg-background p-6 md:p-8"
            >
              <div className="flex items-start gap-4">
                <span
                  className="font-display text-xs text-gold/40 mt-1 shrink-0"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="text-base font-bold text-warm-white mb-2">
                    {item.label}
                  </h3>
                  <p className="text-sm text-warm-gray leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* ── 対応エリア ────────────────────────────────── */}
      <Section number="05" title={area.title}>
        <div className="flex items-center gap-4">
          <MapPin size={20} className="text-gold/60 shrink-0" />
          <div>
            <p className="text-lg md:text-xl font-bold text-warm-white">
              {area.main}
            </p>
            <p className="text-base text-warm-gray mt-1">{area.sub}</p>
          </div>
        </div>
      </Section>

      {/* ── 会社概要 ─────────────────────────────────── */}
      <Section number="06" title={company.title}>
        <div className="border border-gold/10 bg-dark-surface/30 overflow-hidden">
          <table className="w-full text-sm md:text-base">
            <tbody>
              {[
                [company.nameLabel, company.name],
                [company.addressLabel, company.address],
                [company.businessLabel, company.business],
                [company.areaLabel, company.area],
                [company.emailLabel, EMAIL],
                [company.phoneLabel, PHONE],
              ].map(([label, value], i) => (
                <tr
                  key={i}
                  className="border-b border-gold/5 last:border-b-0"
                >
                  <td className="py-4 px-6 text-gold/70 font-medium w-1/3 align-top">
                    {label}
                  </td>
                  <td className="py-4 px-6 text-warm-white">
                    {label === company.emailLabel ? (
                      <a
                        href={`mailto:${value}`}
                        className="hover:text-gold transition-colors no-underline text-warm-white"
                      >
                        {value}
                      </a>
                    ) : label === company.phoneLabel ? (
                      <a
                        href={`tel:${value}`}
                        className="hover:text-gold transition-colors no-underline text-warm-white"
                      >
                        {value}
                      </a>
                    ) : (
                      value
                    )}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-4 px-6 text-gold/70 font-medium align-top">
                  Instagram
                </td>
                <td className="py-4 px-6">
                  <a
                    href={INSTAGRAM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-warm-white hover:text-gold transition-colors no-underline"
                  >
                    <Instagram size={16} />
                    @juchou.group
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── BOTTOM CTA ───────────────────────────────── */}
      <section className="py-20 md:py-32">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="max-w-xl mx-auto text-center"
          >
            <div className="gold-line-full mb-12" />

            {/* Primary CTA */}
            <Link
              href={`${prefix}/recruit`}
              className="inline-flex items-center gap-3 bg-gold text-background font-bold text-base md:text-lg px-8 py-4 tracking-wider hover:bg-gold-dim transition-colors duration-300 no-underline mb-4 w-full justify-center"
            >
              {cta.recruit}
              <ArrowRight size={18} />
            </Link>

            {/* Secondary CTA */}
            <Link
              href={`${prefix}/contact`}
              className="inline-flex items-center gap-3 border border-gold/30 text-gold font-medium text-sm md:text-base px-8 py-3 tracking-wider hover:border-gold/60 hover:bg-gold/5 transition-all duration-300 no-underline mb-8 w-full justify-center"
            >
              {cta.contact}
              <ArrowRight size={16} />
            </Link>

            {/* QR Codes — Instagram & LINE WORKS */}
            <div className="grid grid-cols-2 gap-6 mt-6">
              {/* Instagram */}
              <div className="flex flex-col items-center gap-3">
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <img
                    src={INSTAGRAM_QR_URL}
                    alt="Instagram QR Code"
                    className="w-32 h-32 md:w-36 md:h-36 rounded-lg object-cover mx-auto"
                  />
                </a>
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-warm-gray hover:text-gold transition-colors no-underline"
                >
                  <Instagram size={14} />
                  {cta.instagram}
                </a>
              </div>

              {/* LINE WORKS */}
              <div className="flex flex-col items-center gap-3">
                <a
                  href={LINEWORKS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <img
                    src={LINEWORKS_QR_URL}
                    alt="LINE WORKS QR Code"
                    className="w-32 h-32 md:w-36 md:h-36 rounded-lg object-cover mx-auto"
                  />
                </a>
                <a
                  href={LINEWORKS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-warm-gray hover:text-gold transition-colors no-underline"
                >
                  <MessageCircle size={14} />
                  LINE WORKS
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}
