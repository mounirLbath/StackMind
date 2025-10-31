import type { HTMLAttributes, ReactNode } from 'react';
import { motion } from 'framer-motion';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  header?: ReactNode;
  footer?: ReactNode;
  animate?: boolean;
}

export function Card({ header, footer, children, className = '', animate = false, onClick }: CardProps) {
  if (animate) {
    return (
      <motion.div
        className={`card ${className}`}
        onClick={onClick}
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
        {header && (
          <div className="mb-4 pb-4 border-b border-white/10">
            {header}
          </div>
        )}
        <div>{children}</div>
        {footer && (
          <div className="mt-4 pt-4 border-t border-white/10">
            {footer}
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <div className={`card ${className}`} onClick={onClick}>
      {header && (
        <div className="mb-4 pb-4 border-b border-white/10">
          {header}
        </div>
      )}
      <div>{children}</div>
      {footer && (
        <div className="mt-4 pt-4 border-t border-white/10">
          {footer}
        </div>
      )}
    </div>
  );
}

