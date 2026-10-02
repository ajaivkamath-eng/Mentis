import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { transition } from '../../lib/motion';

function EnteringPage({ children }: { children: ReactNode }) {
  const [entering, setEntering] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => setEntering(false), (transition.deliberate.duration ?? 0.5) * 1000 + 100);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <div className="relative">
      {entering && (
        <div role="status" aria-label="Loading page" className="absolute inset-0 z-10 grid min-h-64 place-items-center bg-bg">
          <span className="size-9 animate-spin rounded-full border-[3px] border-line border-r-brand motion-reduce:animate-none" aria-hidden="true" />
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * PageTransition — one place where "moving between screens" gets its feel.
 *
 * • new routes mount immediately, including in background tabs
 * • scroll resets on route change, because a console that keeps you halfway
 *   down the previous page is disorienting
 * • `prefers-reduced-motion` collapses it to an instant swap
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);

  return <EnteringPage key={pathname}>{children}</EnteringPage>;
}

/**
 * Reveal — scroll-triggered entrance for dashboard sections. Kept as a separate
 * primitive so above-the-fold content still renders instantly (no waiting on
 * IntersectionObserver) while long pages build in as you scroll.
 */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-8% 0px -6% 0px' }}
      transition={{ ...transition.smooth, delay }}
    >
      {children}
    </motion.div>
  );
}
