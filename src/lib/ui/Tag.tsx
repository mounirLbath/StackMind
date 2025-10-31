import type { HTMLAttributes } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

interface TagProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onRemove'> {
  onRemove?: () => void;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

export function Tag({ onRemove, variant = 'default', children, className = '' }: TagProps) {
  const variants = {
    default: 'bg-white/14 dark:bg-white/14 text-black/80 dark:text-white/90',
    primary: 'bg-primary/20 text-primary-600 dark:text-primary',
    success: 'bg-green-500/20 text-green-700 dark:text-green-400',
    warning: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
    danger: 'bg-red-500/20 text-red-700 dark:text-red-400',
  };

  return (
    <motion.div
      className={`chip ${variants[variant]} ${className}`}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.14 }}
      whileHover={{ y: -1 }}
    >
      <span>{children}</span>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-1 hover:bg-white/20 rounded-full p-0.5 transition-colors"
          aria-label="Remove tag"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </motion.div>
  );
}

