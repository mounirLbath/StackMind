import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  isVisible: boolean;
  onClose: () => void;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function Toast({ message, type = 'info', isVisible, onClose, duration = 4000, action }: ToastProps) {
  useEffect(() => {
    if (isVisible && duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  const icons: Record<string, ReactNode> = {
    success: <CheckCircle2 className="w-5 h-5 text-green-500" />,
    error: <AlertCircle className="w-5 h-5 text-red-500" />,
    info: <Info className="w-5 h-5 text-primary" />,
  };

  const variants = {
    success: 'border-green-500/40',
    error: 'border-red-500/40',
    info: 'border-primary/40',
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.95 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className={`fixed bottom-6 right-6 z-50 glass max-w-sm flex items-center gap-3 p-4 ${variants[type]} border-l-4 shadow-glow`}
        >
          {icons[type]}
          <div className="flex-1">
            <p className="text-sm text-black/90 dark:text-white/95 font-medium">{message}</p>
          </div>
          {action && (
            <button
              onClick={action.onClick}
              className="text-xs font-medium text-primary hover:text-primary-600 transition-colors"
            >
              {action.label}
            </button>
          )}
          <button
            onClick={onClose}
            className="ml-2 hover:bg-white/20 rounded-lg p-1 transition-colors"
            aria-label="Close notification"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

