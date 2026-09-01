"use client";

import { motion, useReducedMotion } from "motion/react";

type MotionRevealProps = {
  children: React.ReactNode;
};

export function MotionReveal({ children }: MotionRevealProps) {
  const prefersReducedMotion = useReducedMotion();
  const reduce = prefersReducedMotion === true;

  const initial = reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 };

  return (
    <motion.div
      data-motion-reveal=""
      data-reduced-motion={reduce ? "true" : "false"}
      initial={initial}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.25, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
