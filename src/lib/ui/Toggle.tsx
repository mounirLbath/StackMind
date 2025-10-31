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
          className={`relative w-12 h-6 rounded-full backdrop-blur-md border transition-all duration-300 ${
            checked
              ? 'bg-amber-500/20 border-amber-500/40 shadow-sm'
              : 'bg-white/10 dark:bg-white/5 border-white/20'
          }`}
          animate={{
            backgroundColor: checked ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.1)',
            borderColor: checked ? 'rgba(245, 158, 11, 0.4)' : 'rgba(255, 255, 255, 0.2)',
          }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Glass thumb */}
          <motion.div
            className="absolute top-0.5 w-5 h-5 rounded-full backdrop-blur-md bg-white/90 dark:bg-white/80 border border-white/30 shadow-soft"
            animate={{ x: checked ? 24 : 2 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            whileHover={!disabled ? { scale: 1.1 } : {}}
            whileTap={!disabled ? { scale: 0.95 } : {}}
          >
            {/* Inner glow when checked */}
            {checked && (
              <motion.div
                className="absolute inset-0 rounded-full bg-amber-400/30 blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            )}
          </motion.div>
        </motion.div>
      </div>
      {label && (
        <span className={`text-sm font-medium transition-colors duration-200 ${
          checked 
            ? 'text-amber-700 dark:text-amber-400' 
            : 'text-black/70 dark:text-white/70'
        }`}>
          {label}
        </span>
      )}
    </label>
  );
}

