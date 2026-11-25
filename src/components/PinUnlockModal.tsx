// Parental PIN unlock modal
import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Lock, Check, AlertCircle } from 'lucide-react';
import { useI18n } from '../utils/i18n';
import { Language } from '../types';
import { isSafeBackdropClick } from '../utils/tvNavigation';

interface PinUnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  correctPin: string;
  playlistName: string;
  language: Language;
}

export default function PinUnlockModal({
  isOpen,
  onClose,
  onSuccess,
  correctPin,
  playlistName,
  language
}: PinUnlockModalProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const { t, isRtl } = useI18n(language);
  const openedAtRef = useRef<number>(Date.now());
  const backdropDownRef = useRef<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      openedAtRef.current = Date.now();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === correctPin) {
      setError('');
      setPin('');
      onSuccess();
    } else {
      setError(t('wrong_pin'));
    }
  };

  return (
    <div
      onPointerDown={(e) => {
        backdropDownRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (isSafeBackdropClick(e, openedAtRef.current, backdropDownRef.current)) {
          onClose();
        }
        backdropDownRef.current = false;
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 achour-modal-backdrop select-none"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        data-tv-modal="true"
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ duration: 0.08 }}
        onClick={(e) => e.stopPropagation()}
        className={`w-[min(92vw,580px)] max-h-[82vh] achour-glass-modal border-gold/40 rounded-2xl p-5 overflow-y-auto no-scrollbar ${isRtl ? 'font-cairo text-right' : 'text-left'}`}
      >
        <div className="flex flex-col sm:flex-row items-center gap-5">
          <div className="flex sm:flex-col items-center sm:items-start gap-3 sm:w-5/12 shrink-0 text-center sm:text-start">
            <div className="w-12 h-12 rounded-2xl bg-gold/15 text-gold flex items-center justify-center shrink-0">
              <Lock size={24} />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-semibold achour-glossy-title uppercase tracking-wider mb-1">{t('enter_pin')}</h3>
              <p className="text-xs text-zinc-400">
                {isRtl ? `هذه القائمة (${playlistName}) محمية برمز مرور للرقابة الأبوية.` : `This playlist (${playlistName}) is password-protected.`}
              </p>
            </div>
          </div>

          <form onSubmit={handleVerify} className="w-full sm:flex-1 space-y-3">
            <input
              type="password"
              maxLength={6}
              autoFocus
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/[^0-9]/g, ''));
                setError('');
              }}
              placeholder="••••"
              className="w-full bg-white/5 border border-white/10 rounded-xl py-3 text-center text-xl font-sans tabular-nums tracking-[0.6em] text-white focus:border-gold/60 outline-none transition-colors"
            />

            {error && (
              <div className="flex items-center justify-center gap-1.5 text-red-400 text-xs font-medium">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                data-tv-focusable="true"
                onClick={onClose}
                className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-zinc-300 rounded-xl text-xs font-medium transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                data-tv-focusable="true"
                className="flex-1 py-2.5 bg-gold hover:bg-gold/90 text-black font-medium uppercase tracking-wider rounded-xl text-xs transition-colors flex items-center justify-center gap-1"
              >
                <Check size={16} />
                <span>{t('unlocked')}</span>
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
