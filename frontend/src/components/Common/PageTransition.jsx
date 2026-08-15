import { motion, useReducedMotion } from 'framer-motion'

// Custom easing — a quick, confident deceleration rather than framer's
// generic 'easeOut'. Feels closer to how premium fintech dashboards move.
const EASE = [0.16, 1, 0.3, 1]

export default function PageTransition({ children, className = '' }) {
  const shouldReduceMotion = useReducedMotion()

  const variants = shouldReduceMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        initial: { opacity: 0, y: 14, scale: 0.985, filter: 'blur(4px)' },
        animate: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' },
        exit: { opacity: 0, y: -10, scale: 0.99, filter: 'blur(2px)' },
      }

  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={variants}
      transition={{
        duration: shouldReduceMotion ? 0.15 : 0.45,
        ease: EASE,
        opacity: { duration: shouldReduceMotion ? 0.15 : 0.35 },
      }}
      className={`w-full h-full will-change-transform ${className}`}
    >
      {children}
    </motion.div>
  )
}