import React from 'react';
import { motion } from 'framer-motion';
import { RefreshCcw, CheckCircle2, Clock, AlertTriangle, X, Tv, Pause, Minimize2 } from 'lucide-react';
import { useI18n, formatExtractionProgressMessage } from '../utils/i18n';
import { ExtractionProgress } from '../utils/extractionService';
import { Language } from '../types';

interface ExtractionProgressModalProps {
  progress: ExtractionProgress;
  playlistName: string;
  language: Language;
  onClose: () => void;
  onMinimize?: () => void;
  onWatchLive?: () => void;
  onPause?: () => void;
  onRetry?: () => void;
  onResume?: () => void;
}

export default function ExtractionProgressModal({
  progress,
  playlistName,
  language,
  onClose,
  onMinimize,
  onWatchLive,
  onPause,
  onRetry,
  onResume
}: ExtractionProgressModalProps) {
  const { stage, percent, message, counts, liveReady, movieReady, seriesReady } = progress;
  const { t, isRtl } = useI18n(language);
  const localizedMessage = formatExtractionProgressMessage(message, language, stage);

  const isRunning =
    stage === 'downloading' ||
    stage === 'parsing' ||
    stage === 'categorizing' ||
    stage === 'saving' ||
    stage === 'verifying';

  const getStageLabel = () => {
    switch (stage) {
      case 'downloading': return t('extraction_downloading');
      case 'parsing': return t('extraction_parsing');
      case 'categorizing': return t('extraction_categorizing');
      case 'saving': return t('extraction_saving');
      case 'verifying': return t('extraction_verifying');
      case 'paused': return t('extraction_paused');
      case 'completed': return t('extraction_completed');
      case 'error': return t('extraction_error');
      default: return t('loading');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      data-tv-modal="true"
      onClick={(e) => e.stopPropagation()}
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/70 achour-modal-backdrop p-4 ${isRtl ? 'font-cairo' : 'font-sans'}`}
    >
      <motion.div
        initial={{ scale: 0.97, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.08 }}
        onClick={(e) => e.stopPropagation()}
        className="w-[min(92vw,620px)] max-h-[82vh] achour-glass-modal border-gold/40 rounded-2xl p-4 sm:p-5 relative overflow-y-auto no-scrollbar"
      >
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-gold to-transparent opacity-60" />

        {/* Header Row */}
        <div className="flex items-center justify-between gap-2.5 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gold/15 border border-gold/30 flex items-center justify-center shrink-0">
              {stage === 'error' ? (
                <AlertTriangle className="text-red-400 w-4 h-4" />
              ) : stage === 'completed' ? (
                <CheckCircle2 className="text-emerald-400 w-4 h-4" />
              ) : stage === 'paused' ? (
                <Clock className="text-amber-300 w-4 h-4" />
              ) : (
                <RefreshCcw className="text-gold w-4 h-4 animate-spin" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold achour-glossy-title truncate">
                {playlistName || 'Achour Player'}
              </h2>
              <p className="text-[11px] font-medium achour-glossy-text truncate">
                {getStageLabel()}
              </p>
            </div>
          </div>

          <button
            onClick={isRunning && onMinimize ? onMinimize : onClose}
            data-tv-focusable="true"
            tabIndex={0}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center transition-colors focus:outline-none shrink-0 cursor-pointer"
            title={isRunning && onMinimize ? t('minimize_background') : t('close')}
          >
            {isRunning && onMinimize ? <Minimize2 className="w-4 h-4" /> : <X className="w-4 h-4" />}
          </button>
        </div>

        {/* Progress Bar */}
        <div className="relative h-2.5 bg-white/10 rounded-full overflow-hidden border border-white/10 mb-2">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
            transition={{ duration: 0.2 }}
            className={`absolute top-0 left-0 h-full bg-gradient-to-r ${
              stage === 'error' ? 'from-red-600 to-red-400' : 'from-gold via-yellow-400 to-gold'
            }`}
          />
        </div>

        {/* Message + Percentage */}
        <div className="flex justify-between items-center gap-2 mb-3">
          <span className="text-zinc-300 text-[11px] font-normal truncate">
            {localizedMessage}
          </span>
          <span className="achour-glossy-text font-semibold text-sm font-sans tabular-nums shrink-0">
            {Math.max(0, Math.min(100, Math.round(percent)))}%
          </span>
        </div>

        {/* Stage Counts (Live, Movie, Series) with Readiness Indicator */}
        <div className="grid grid-cols-3 gap-1.5 p-2.5 bg-white/5 rounded-xl border border-white/10 mb-3 text-center">
          <div className={`rounded-lg py-1 px-1 ${liveReady ? 'bg-emerald-500/15 border border-emerald-500/30' : ''}`}>
            <span className="block text-[10px] text-zinc-400 font-medium">
              {t('live')} {liveReady ? '✓' : ''}
            </span>
            <span className="text-xs font-semibold text-white font-sans tabular-nums">
              {(counts?.live || 0).toLocaleString()}
            </span>
          </div>
          <div className={`rounded-lg py-1 px-1 ${movieReady ? 'bg-emerald-500/15 border border-emerald-500/30' : ''}`}>
            <span className="block text-[10px] text-zinc-400 font-medium">
              {t('movies')} {movieReady ? '✓' : ''}
            </span>
            <span className="text-xs font-semibold text-white font-sans tabular-nums">
              {(counts?.movie || 0).toLocaleString()}
            </span>
          </div>
          <div className={`rounded-lg py-1 px-1 ${seriesReady ? 'bg-emerald-500/15 border border-emerald-500/30' : ''}`}>
            <span className="block text-[10px] text-zinc-400 font-medium">
              {t('series')} {seriesReady ? '✓' : ''}
            </span>
            <span className="text-xs font-semibold text-white font-sans tabular-nums">
              {(counts?.series || 0).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        {isRunning && (
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-white/10">
            {liveReady && onWatchLive && (
              <button
                onClick={onWatchLive}
                data-tv-focusable="true"
                tabIndex={0}
                className="flex-1 min-w-[140px] px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-medium text-xs flex items-center justify-center gap-1.5 transition-colors focus:outline-none cursor-pointer"
              >
                <Tv className="w-3.5 h-3.5" />
                <span>{t('watch_live_now')}</span>
              </button>
            )}
            {onMinimize && (
              <button
                onClick={onMinimize}
                data-tv-focusable="true"
                tabIndex={0}
                className="px-3 py-2 rounded-xl achour-glossy-surface border border-gold/40 text-gold font-medium text-xs transition-colors focus:outline-none cursor-pointer"
              >
                {t('minimize_background')}
              </button>
            )}
            {onPause && (
              <button
                onClick={onPause}
                data-tv-focusable="true"
                tabIndex={0}
                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-zinc-200 font-medium text-xs flex items-center gap-1 transition-colors focus:outline-none cursor-pointer"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>{t('pause')}</span>
              </button>
            )}
          </div>
        )}

        {(stage === 'paused' || stage === 'error') && (
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-white/10">
            {liveReady && onWatchLive && (
              <button
                onClick={onWatchLive}
                data-tv-focusable="true"
                tabIndex={0}
                className="px-3 py-1.5 rounded-xl bg-emerald-500 text-black font-medium text-xs hover:bg-emerald-400 transition-colors focus:outline-none cursor-pointer"
              >
                {t('watch_live')}
              </button>
            )}
            {stage === 'paused' && onResume && (
              <button
                onClick={onResume}
                data-tv-focusable="true"
                tabIndex={0}
                className="px-3 py-1.5 rounded-xl achour-glossy-pill font-medium text-xs hover:brightness-110 transition-all focus:outline-none cursor-pointer"
              >
                {t('resume_extraction')}
              </button>
            )}
            {stage === 'error' && onRetry && (
              <button
                onClick={onRetry}
                data-tv-focusable="true"
                tabIndex={0}
                className="px-3 py-1.5 rounded-xl achour-glossy-pill font-medium text-xs hover:brightness-110 transition-all focus:outline-none cursor-pointer"
              >
                {t('retry')}
              </button>
            )}
            <button
              onClick={onClose}
              data-tv-focusable="true"
              tabIndex={0}
              className="px-3 py-1.5 rounded-xl bg-white/10 text-white font-bold text-xs hover:bg-white/20 transition-colors focus:outline-none cursor-pointer"
            >
              {t('close')}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
