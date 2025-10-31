import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-xs font-semibold text-black/70 dark:text-white mb-2 uppercase tracking-wide">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`
            w-full px-3 py-2 text-sm
            text-black/90 dark:!text-white
            backdrop-blur-md bg-white/10 dark:bg-white/5
            border border-white/20 dark:border-white/15
            rounded-lg
            outline-none
            transition-all duration-200
            focus:ring-1 focus:ring-primary/40 focus:border-primary/60
            placeholder:text-black/40 dark:placeholder:text-white/40
            ${error ? 'border-red-500/60 focus:ring-red-500/40' : ''}
            ${className}
          `}
          {...props}
        />
        {error && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

interface TextareaProps extends InputHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  rows?: number;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = '', rows = 4, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-xs font-semibold text-black/70 dark:text-white mb-2 uppercase tracking-wide">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          rows={rows}
          className={`
            w-full px-3 py-2 text-sm
            text-black/90 dark:!text-white
            backdrop-blur-md bg-white/10 dark:bg-white/5
            border border-white/20 dark:border-white/15
            rounded-lg
            outline-none
            transition-all duration-200
            focus:ring-1 focus:ring-primary/40 focus:border-primary/60
            placeholder:text-black/40 dark:placeholder:text-white/40
            resize-vertical
            ${error ? 'border-red-500/60 focus:ring-red-500/40' : ''}
            ${className}
          `}
          {...props}
        />
        {error && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

