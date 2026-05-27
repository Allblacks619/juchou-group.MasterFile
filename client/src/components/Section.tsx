/* ============================================================
 * Section — Craftsman's Ledger Design
 * Reusable section wrapper with section number and gold line
 * ============================================================ */
import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface SectionProps {
  number?: string;
  title: string;
  children: ReactNode;
  className?: string;
  id?: string;
}

export default function Section({
  number,
  title,
  children,
  className = "",
  id,
}: SectionProps) {
  return (
    <section id={id} className={`py-20 md:py-28 ${className}`}>
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Section number + gold line */}
          <div className="flex items-end gap-6 mb-10 md:mb-14">
            {number && (
              <span className="section-number">{number}</span>
            )}
            <div className="flex-1">
              <div className="gold-line w-full mb-4" />
              <h2 className="text-2xl md:text-3xl font-bold tracking-wide text-warm-white">
                {title}
              </h2>
            </div>
          </div>

          {/* Content */}
          <div className="md:pl-[calc(4rem+1.5rem)]">{children}</div>
        </motion.div>
      </div>
    </section>
  );
}
