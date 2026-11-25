import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, AlertTriangle, ArrowLeft, Check } from 'lucide-react';
import { useI18n } from '../utils/i18n';
import { Language } from '../types';
import { parseTVKeyEvent, isSafeBackdropClick } from '../utils/tvNavigation';

interface ExitConfirmModalProps {
  isOpen: boolean;
  onConfirmExit: () => void;
  onCancel: () => void;
  language: Language;
}

export default function ExitConfirmModal({
  isOpen,
  onConfirmExit,
  onCancel,
  language
}: ExitConfirmModalProps) {
  const { t, isRtl } = useI18n(language);
  const [selectedAction, setSelectedAction] = useState<'no' | 'yes'>('no');
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const exitBtnRef = useRef<HTMLButtonElement | null>(null);
  const openedAtRef = useRef(0);
  const backdropDownRef = useRef(false);

  // Default focus on "No" button whenever the modal opens to prevent accidental exits
  useEffect(() => {
    if (isOpen) {
      openedAtRef.current = Date.now();
      backdropDownRef.current = false;
      setSelectedAction('no');
      const timer = setTimeout(() => {
        if (cancelBtnRef.current) {
          cancelBtnRef.current.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // TV Remote / Keyboard Navigation inside the Exit Modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const action = parseTVKeyEvent(e);

      if (action === 'LEFT' || action === 'RIGHT' || action === 'UP' || action === 'DOWN' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedAction(prev => {
          const next = prev === 'no' ? 'yes' : 'no';
          if (next === 'no' && cancelBtnRef.current) cancelBtnRef.current.focus();
          if (next === 'yes' && exitBtnRef.current) exitBtnRef.current.focus();
          return next;
        });
        return;
      }

      if (action === 'SELECT') {
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) return;
        if (selectedAction === 'yes') {
          onConfirmExit();
        } else {
          onCancel();
        }
        return;
      }

      if (action === 'BACK' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isOpen, selectedAction, onConfirmExit, onCancel]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          data-tv-modal="true"
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 achour-modal-backdrop p-4 sm:p-6"
          onPointerDown={(e) => { backdropDownRef.current = e.target === e.currentTarget; }}
          onClick={(e) => {
            if (isSafeBackdropClick(e, openedAtRef.current, backdropDownRef.current)) onCancel();
            backdropDownRef.current = false;
          }}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.08 }}
            data-achour-window-cat="confirm"
            onClick={(e) => e.stopPropagation()}
            className={`w-[min(92vw,580px)] max-h-[82vh] achour-glass-modal border border-gold/45 rounded-3xl p-5 sm:p-6 relative overflow-hidden flex flex-col gap-4 ${
              isRtl ? 'font-cairo text-right' : 'font-sans text-left'
            }`}
          >
            {/* Top gold accent line */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-gold to-transparent opacity-80" />

            <div className="flex items-center gap-4">
              {/* Glowing warning icon */}
              <div className="w-14 h-14 bg-amber-500/10 border border-gold/40 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
                <LogOut className="text-gold w-7 h-7" />
              </div>

              {/* Title & Description */}
              <div className="min-w-0 flex-1">
                <h2 className="text-lg sm:text-xl font-semibold achour-glossy-title mb-1 tracking-tight">
                  {t('exit_modal_title')}
                </h2>
                <p className="text-zinc-300 text-xs sm:text-sm font-normal leading-relaxed">
                  {t('exit_modal_desc')}
                </p>
              </div>
            </div>

            {/* Buttons (No / Yes) with clear remote focus */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {/* No / Cancel Button (Default selection) */}
              <button
                ref={cancelBtnRef}
                type="button"
                data-tv-focusable="true"
                tabIndex={0}
                onClick={onCancel}
                onFocus={() => setSelectedAction('no')}
                className={`py-3.5 px-4 rounded-xl font-medium text-sm uppercase transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer outline-none ${
                  selectedAction === 'no'
                    ? 'achour-glossy-pill scale-[1.02] ring-2 ring-white/40'
                    : 'bg-white/[0.06] text-zinc-300 border border-white/10 hover:border-gold/40 hover:text-white'
                }`}
              >
                <ArrowLeft size={16} className={isRtl ? 'rotate-180' : ''} />
                <span>{t('exit_confirm_no')}</span>
              </button>

              {/* Yes / Exit Button */}
              <button
                ref={exitBtnRef}
                type="button"
                data-tv-focusable="true"
                tabIndex={0}
                onClick={onConfirmExit}
                onFocus={() => setSelectedAction('yes')}
                style={
                  selectedAction === 'yes'
                    ? undefined
                    : {
                        color: 'var(--theme-primary, #D4AF37)'
                      }
                }
                className={`py-3.5 px-4 rounded-xl font-medium text-sm uppercase transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer outline-none ${
                  selectedAction === 'yes'
                    ? 'achour-glossy-pill scale-[1.02] ring-2 ring-white/40'
                    : 'bg-white/[0.06] border border-gold/30 hover:border-gold'
                }`}
              >
                <LogOut size={16} />
                <span>{t('exit_confirm_yes')}</span>
              </button>
            </div>

            {/* Hint for remote control */}
            <div className="mt-5 pt-3 border-t border-white/5 text-center">
              <span className="text-[10px] text-zinc-500 font-medium">
                {isRtl
                  ? 'استخدم أسهم الريموت (يمين / يسار) ثم اضغط OK'
                  : 'Use remote D-pad (Left / Right) and press OK'}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
