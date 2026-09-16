import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { pageVariants, transition } from '../../lib/motion';

/**
 * PageTransition — one place where "moving between screens" gets its feel.
 *
 * • exit/enter run concurrently so navigation never feels gated
 * • the animation is transform+opacity only (composited, no layout thrash)
 * • scroll resets on route change, because a console that keeps you halfway
 *   down the previous page is disorienting
 * • `prefers-reduced-motion` collapses it to an instant swap
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const reduce = useReducedMotion();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);

  if (reduce) return <div key={pathname}>{children}</div>;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={pathname} variants={pageVariants} initial="initial" animate="animate" exit="exit">
        {children}
      </motion.div>
    </AnimatePresence>
  );
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
