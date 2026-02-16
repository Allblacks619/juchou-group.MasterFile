/* ============================================================
 * Layout — Craftsman's Ledger Design
 * Wraps all pages with Header + Footer + background pattern
 * ============================================================ */
import type { ReactNode } from "react";
import Header from "./Header";
import Footer from "./Footer";

const BLUEPRINT_PATTERN =
  "https://private-us-east-1.manuscdn.com/sessionFile/rCWGzbC5Fv9wiMEJ7c9ECd/sandbox/u8e1iFu3wsTxSX5PcFrJA5-img-5_1771261765000_na1fn_Ymx1ZXByaW50LXBhdHRlcm4.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvckNXR3piQzVGdjl3aU1FSjdjOUVDZC9zYW5kYm94L3U4ZTFpRnUzd3NUeFNYNVBjRnJKQTUtaW1nLTVfMTc3MTI2MTc2NTAwMF9uYTFmbl9ZbXgxWlhCeWFXNTBMWEJoZEhSbGNtNC5wbmc~eC1vc3MtcHJvY2Vzcz1pbWFnZS9yZXNpemUsd18xOTIwLGhfMTkyMC9mb3JtYXQsd2VicC9xdWFsaXR5LHFfODAiLCJDb25kaXRpb24iOnsiRGF0ZUxlc3NUaGFuIjp7IkFXUzpFcG9jaFRpbWUiOjE3OTg3NjE2MDB9fX1dfQ__&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=mfpYxxmvP~eAJJNiq9PN-2d4QQb6FeofFxhFmqikAbJxxqWP6jxm5xN93IS-UyA3jzOBEj5ReHvqFjJZpo5FZAETxhasIyBUb-CMtpHSAK5JRAUAM0sca8c3vFnsC3j643L8iH8GEMTBa-QwKm7yvTqALjCVPqbajme~QOy2D8RtZDbaE-et05ncJBa9F5rUK28~~fLcd2n4MyXxRPcXj0LVaHYZwvTZWYZv1ZvFBGKCnv68F1Xh16~M~K8CzVqELQnnNkP04LWovVuBv1WZRPM9VGkxVwnwZPw5Rev55QMRJ5tOZHxOuQ388h6A9XcwcWzXMlgfV1bAw3GDRbhQhw__";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col relative">
      {/* Subtle blueprint background pattern */}
      <div
        className="fixed inset-0 opacity-[0.04] pointer-events-none z-0"
        style={{
          backgroundImage: `url(${BLUEPRINT_PATTERN})`,
          backgroundSize: "800px 800px",
          backgroundRepeat: "repeat",
        }}
      />

      {/* Left gold accent line */}
      <div className="fixed left-0 top-0 bottom-0 w-px bg-gold/10 z-10 hidden lg:block" />

      <Header />
      <main className="flex-1 relative z-1 pt-16 md:pt-20">{children}</main>
      <Footer />
    </div>
  );
}
