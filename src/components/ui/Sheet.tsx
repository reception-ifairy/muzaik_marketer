import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, type LucideIcon } from 'lucide-react';
import type { Tone } from '../../lib/sections';
import { cn } from '../../lib/utils';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: LucideIcon;
  tone?: Tone;
  widthClass?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** Modal panel for details that don't fit a card. Closes on backdrop tap, the X button or Escape. */
export default function Sheet({ open, onClose, title, icon: Icon, tone, widthClass = 'max-w-2xl', children, footer }: SheetProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: 0.15 }}
            className={cn('relative w-full panel bg-brand-raised flex flex-col max-h-full shadow-2xl', widthClass)}
          >
            <div className="shrink-0 flex items-center gap-3 px-5 h-16 border-b border-white/10">
              {Icon && (
                <span className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', tone?.soft, tone?.text)}>
                  <Icon size={20} />
                </span>
              )}
              <h3 className="flex-1 min-w-0 truncate font-display font-semibold text-lg text-white">{title}</h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Zamknij"
                className="h-12 w-12 -mr-2 rounded-xl flex items-center justify-center text-slate-300 active:bg-white/10"
              >
                <X size={22} />
              </button>
            </div>
            {/* Last-resort scroll: only model text of unpredictable length can get this long. */}
            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">{children}</div>
            {footer && <div className="shrink-0 px-5 py-4 border-t border-white/10">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
