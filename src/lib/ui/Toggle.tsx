import type { InputHTMLAttributes } from 'react';
import { motion } from 'framer-motion';

interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

export function Toggle({ label, checked, onChange, className = '', disabled, ...props }: ToggleProps) {
  return (
    <label className={`inline-flex items-center gap-3 cursor-pointer select-none ${disabled ? 'opacity-60 cursor-not-allowed' : ''} ${className}`}>
      <div className="relative">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          {...props}
        />
        {/* Glass track */}
        <motion.div
          className={`relative w-10 h-5 rounded-full backdrop-blur-md border transition-all duration-300 ${
            checked
              ? 'bg-white/20 border-white/40 shadow-sm'
              : 'bg-black/10 dark:bg-black/20 border-white/15 dark:border-white/10'
          }`}
          animate={{
            backgroundColor: checked ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)',
            borderColor: checked ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.15)',
          }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Glass thumb */}
          <motion.div
            className={`absolute top-0.5 w-4 h-4 rounded-full backdrop-blur-md border transition-all duration-300 ${
              checked
                ? 'bg-white/95 dark:bg-white/90 border-white/40 shadow-soft'
                : 'bg-white/60 dark:bg-white/40 border-white/20 shadow-sm'
            }`}
            animate={{ 
              x: checked ? 20 : 2,
              opacity: checked ? 1 : 0.7
            }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            whileHover={!disabled ? { scale: 1.1 } : {}}
            whileTap={!disabled ? { scale: 0.95 } : {}}
          />
        </motion.div>
      </div>
      {label && (
        <span className="text-sm font-medium transition-colors duration-200 text-black/70 dark:text-white/70">
          {label}
        </span>
      )}
    </label>
  );
}

