import type { InputHTMLAttributes } from 'react';
import { motion } from 'framer-motion';

interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

export function Toggle({ label, checked, onChange, className = '', ...props }: ToggleProps) {
  return (
    <label className={`inline-flex items-center gap-3 cursor-pointer ${className}`}>
      <div className="relative">
        <input
          type="checkbox"
          className="sr-only peer"
          checked={checked}
          onChange={onChange}
          {...props}
        />
        <div className="w-11 h-6 backdrop-blur-md bg-white/20 dark:bg-white/10 border border-white/20 rounded-pill peer-checked:bg-primary/30 peer-checked:border-primary/40 transition-all duration-200" />
        <motion.div
          className="absolute left-[2px] top-[2px] w-5 h-5 bg-white dark:bg-gray-200 rounded-full shadow-soft"
          animate={{ x: checked ? 20 : 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      {label && (
        <span className="text-sm text-black/80 dark:text-white/90">{label}</span>
      )}
    </label>
  );
}

