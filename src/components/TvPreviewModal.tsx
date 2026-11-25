// TV 16:9 screen preview simulator modal
import React, { useState, useEffect, useRef } from 'react';
import { Monitor, X, Tv, Film, Eye, EyeOff, Radio, ChevronLeft, ChevronRight, Star, Play, Pause, RotateCcw, RotateCw, Languages, Subtitles, Check } from 'lucide-react';
import { AppSettings } from '../types';
import { useI18n } from '../utils/i18n';
import { isSafeBackdropClick } from '../utils/tvNavigation';

interface TvPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  userId: string;
  onUpdateSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

type PreviewMode = 'live-bar' | 'movie-bar' | 'series-bar' | 'dashboard';

const SAMPLE_STREAMS = {
  'live-bar': {
    channelNum: 12,
    name: 'beIN SPORTS 1 HD',
    category: 'Sports',
    program: 'المباراة المباشرة: الاستوديو التحليلي',
    startTime: '20:00',
    endTime: '22:30',
    progress: 58,
    quality: 'Full HD',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
  },
  'movie-bar': {
    title: 'Inception (2010)',
    category: 'أفلام أكشن وخيال علمي',
    poster: '',
    duration: 540,
    audioTracks: [
      { id: 0, label: 'English (5.1)' },
      { id: 1, label: 'Français (Stereo)' }
    ],
    subtitleTracks: [
      { id: 0, label: 'العربية (Arabic)' },
      { id: 1, label: 'English' }
    ],
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
  },
  'series-bar': {
    seriesTitle: 'الحفرة',
    seasonNum: 3,
    episodeNum: 14,
    episodeTitle: 'ليلة المواجهة الأخيرة',
    duration: 420,
    audioTracks: [
      { id: 0, label: 'Türkçe (Stereo)' }
    ],
    subtitleTracks: [] as Array<{ id: number; label: string }>,
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4'
  }
};

export const TvPreviewModal: React.FC<TvPreviewModalProps> = ({
  isOpen,
  onClose,
  settings
}) => {
  const { isRtl } = useI18n(settings.language);
  const [mode, setMode] = useState<PreviewMode>('live-bar');
  const [showBar, setShowBar] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [liveChannelIdx, setLiveChannelIdx] = useState(12);
  const [isPlaying, setIsPlaying] = useState(true);
  const [simTime, setSimTime] = useState(145);
  const [now, setNow] = useState(() => new Date());
  const [activeSubPopup, setActiveSubPopup] = useState<'none' | 'audio' | 'subtitles'>('none');
  const [selectedAudio, setSelectedAudio] = useState(0);
  const [selectedSub, setSelectedSub] = useState(-1);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const openedAtRef = useRef<number>(0);
  const backdropDownRef = useRef<boolean>(false);

  const seekStep = settings.seekStep || 10;

  useEffect(() => {
    if (!isOpen) return;
    openedAtRef.current = Date.now();
    backdropDownRef.current = false;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const t = setInterval(() => {
      setNow(new Date());
      if (isPlaying && mode !== 'live-bar' && mode !== 'dashboard') {
        const maxD = mode === 'movie-bar' ? SAMPLE_STREAMS['movie-bar'].duration : SAMPLE_STREAMS['series-bar'].duration;
        setSimTime(prev => (prev + 1 > maxD ? 0 : prev + 1));
      }
    }, 1000);
    return () => clearInterval(t);
  }, [isOpen, isPlaying, mode]);

  useEffect(() => {
    if (!isOpen) return;
    setActiveSubPopup('none');
    setShowBar(true);
    setTimeout(() => {
      const firstFocusable = frameRef.current?.querySelector<HTMLElement>('[data-tv-preview-focus="true"]');
      firstFocusable?.focus();
    }, 60);
  }, [isOpen, mode]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (activeSubPopup !== 'none') {
          setActiveSubPopup('none');
          return;
        }
        onClose();
        return;
      }

      const focusables = Array.from(
        frameRef.current?.querySelectorAll<HTMLElement>('[data-tv-preview-focus="true"]') || []
      ).filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);
      if (focusables.length === 0) return;

      const cur = document.activeElement as HTMLElement;
      const curIdx = focusables.indexOf(cur);

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        const nextIdx = curIdx >= 0 ? (curIdx + 1) % focusables.length : 0;
        focusables[nextIdx]?.focus();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        const prevIdx = curIdx > 0 ? curIdx - 1 : focusables.length - 1;
        focusables[prevIdx]?.focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (cur && focusables.includes(cur)) {
          e.preventDefault();
          e.stopPropagation();
          cur.click();
        }
      }
    };
    window.addEventListener('keydown', handleKey, { capture: true });
    return () => window.removeEventListener('keydown', handleKey, { capture: true });
  }, [isOpen, onClose, activeSubPopup]);

  const showToast = (msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(null), 1600);
  };

  if (!isOpen) return null;

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const formattedClock = now.toLocaleTimeString(settings.language === 'ar' ? 'ar-EG' : settings.language, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: settings.timeFormat === '12h'
  });
  const formattedDate = now.toLocaleDateString(settings.language === 'ar' ? 'ar-EG' : settings.language, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  const currentVodMeta = mode === 'series-bar' ? SAMPLE_STREAMS['series-bar'] : SAMPLE_STREAMS['movie-bar'];
  const totalDur = mode === 'series-bar' ? SAMPLE_STREAMS['series-bar'].duration : SAMPLE_STREAMS['movie-bar'].duration;
  const remainingSec = Math.max(0, totalDur - simTime);

  return (
    <div
      ref={frameRef}
      onPointerDown={(e) => {
        backdropDownRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (isSafeBackdropClick(e, openedAtRef.current, backdropDownRef.current)) {
          onClose();
        }
        backdropDownRef.current = false;
      }}
      className="fixed inset-0 z-[99998] achour-modal-backdrop flex flex-col items-center justify-center p-3 sm:p-5 select-none"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[min(94vw,960px)] achour-glass-modal border-2 border-[var(--theme-primary,#D4AF37)]/50 rounded-3xl overflow-hidden flex flex-col max-h-[86vh]"
      >
        {/* Header Bar */}
        <div className="bg-white/[0.04] px-4 py-2.5 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <Monitor size={16} className="text-[var(--theme-primary,#D4AF37)]" />
            <span className="text-xs font-semibold achour-glossy-title">
              {isRtl ? 'معاينة شاشة التلفزيون (16:9)' : 'TV Screen Preview (16:9)'}
            </span>
            <span className="text-[10px] text-zinc-400 hidden md:inline">
              {isRtl
                ? '• تختبر واجهة React والتنقل بلوحة المفاتيح فقط (التشغيل الفعلي Media3 وقاعدة بيانات Android على الجهاز الحقيقي)'
                : '• Tests React UI & keyboard focus only (Media3 & Android native runs on device)'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { id: 'live-bar', label: isRtl ? 'شريط Live' : 'Live Bar', icon: Radio },
              { id: 'movie-bar', label: isRtl ? 'شريط الأفلام' : 'Movie Bar', icon: Film },
              { id: 'series-bar', label: isRtl ? 'شريط المسلسلات' : 'Series Bar', icon: Tv },
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  data-tv-preview-focus="true"
                  tabIndex={0}
                  onClick={() => setMode(tab.id as PreviewMode)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-medium flex items-center gap-1.5 transition-all focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary,#D4AF37)] ${
                    mode === tab.id
                      ? 'achour-glossy-pill'
                      : 'bg-white/10 text-zinc-200 hover:bg-white/15'
                  }`}
                >
                  <Icon size={12} />
                  <span>{tab.label}</span>
                </button>
              );
            })}

            <button
              data-tv-preview-focus="true"
              tabIndex={0}
              onClick={() => setShowBar(prev => !prev)}
              className="px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[11px] font-medium flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary,#D4AF37)]"
            >
              {showBar ? <EyeOff size={12} /> : <Eye size={12} />}
              <span>{showBar ? (isRtl ? 'إخفاء الشريط' : 'Hide Bar') : (isRtl ? 'إظهار الشريط' : 'Show Bar')}</span>
            </button>

            <button
              data-tv-preview-focus="true"
              tabIndex={0}
              onClick={onClose}
              className="px-2.5 py-1 rounded-xl bg-red-500/20 hover:bg-red-500/40 text-red-200 text-[11px] font-medium flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-red-400"
            >
              <X size={13} />
              <span>{isRtl ? 'إغلاق' : 'Close'}</span>
            </button>
          </div>
        </div>

        {/* 16:9 Simulation Viewport */}
        <div className="relative w-full aspect-video bg-black overflow-hidden">
          <video
            ref={videoRef}
            key={mode}
            src={mode === 'live-bar' ? SAMPLE_STREAMS['live-bar'].videoUrl : currentVodMeta.videoUrl}
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover opacity-80"
          />

          {/* Subtle feedback toast inside preview */}
          {actionFeedback && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40 px-4 py-1.5 rounded-full achour-glass-modal border-[var(--theme-primary,#D4AF37)]/60 text-xs font-medium text-white">
              {actionFeedback}
            </div>
          )}

          {/* LIVE BAR PREVIEW (Centered Glassmorphism) */}
          {showBar && mode === 'live-bar' && (
            <div className="absolute bottom-6 inset-x-0 z-30 flex justify-center px-4 pointer-events-auto">
              <div
                dir="ltr"
                className="w-full max-w-3xl achour-glass-bar rounded-3xl px-3 py-2.5 flex items-center justify-between gap-2.5"
              >
                <button
                  data-tv-preview-focus="true"
                  tabIndex={0}
                  onClick={() => {
                    setLiveChannelIdx(c => Math.max(1, c - 1));
                    showToast(isRtl ? 'القناة السابقة' : 'Previous channel');
                  }}
                  className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white flex items-center justify-center shrink-0 focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary,#D4AF37)] focus:scale-110 transition-all"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <div className="px-2.5 py-1 achour-glossy-badge font-sans tabular-nums font-semibold text-xs rounded-xl shrink-0">
                  {String(liveChannelIdx).padStart(3, '0')}
                </div>

                <div className="w-10 h-10 rounded-xl bg-white/95 border border-white/20 flex items-center justify-center shrink-0">
                  <Tv className="w-5 h-5 text-black" />
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold achour-glossy-text truncate">
                      {SAMPLE_STREAMS['live-bar'].name}
                    </h3>
                    <span className="text-[10px] font-sans font-normal tabular-nums text-zinc-200 whitespace-nowrap">
                      {SAMPLE_STREAMS['live-bar'].startTime} - {SAMPLE_STREAMS['live-bar'].endTime}
                    </span>
                  </div>
                  <p className="text-[11px] font-normal text-zinc-200/90 truncate">
                    {SAMPLE_STREAMS['live-bar'].program}
                  </p>
                  <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden mt-1">
                    <div
                      className="h-full bg-[var(--theme-primary,#D4AF37)] rounded-full"
                      style={{ width: `${SAMPLE_STREAMS['live-bar'].progress}%` }}
                    />
                  </div>
                </div>

                <div className="flex flex-col items-end shrink-0 text-right px-1">
                  <span className="text-[11px] font-sans tabular-nums font-normal achour-glossy-text leading-tight">{formattedClock}</span>
                  <span className="text-[9px] font-sans tabular-nums font-normal achour-glossy-info leading-tight">{formattedDate}</span>
                </div>

                <button
                  data-tv-preview-focus="true"
                  tabIndex={0}
                  onClick={() => {
                    setIsFavorite(prev => !prev);
                    showToast(!isFavorite ? (isRtl ? 'تمت الإضافة للمفضلة' : 'Added to Favorites') : (isRtl ? 'تمت الإزالة من المفضلة' : 'Removed from Favorites'));
                  }}
                  className="p-2 rounded-full hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary,#D4AF37)] focus:scale-110 transition-all shrink-0"
                >
                  <Star className={`w-5 h-5 ${isFavorite ? 'text-amber-400 fill-amber-400' : 'text-zinc-300'}`} />
                </button>

                <div className="px-2 py-1 rounded-lg border border-white/25 bg-black/30 text-[var(--theme-primary,#D4AF37)] font-medium text-[11px] font-sans shrink-0">
                  {SAMPLE_STREAMS['live-bar'].quality}
                </div>

                <button
                  data-tv-preview-focus="true"
                  tabIndex={0}
                  onClick={() => {
                    setLiveChannelIdx(c => c + 1);
                    showToast(isRtl ? 'القناة التالية' : 'Next channel');
                  }}
                  className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white flex items-center justify-center shrink-0 focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary,#D4AF37)] focus:scale-110 transition-all"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* VOD (MOVIE / SERIES) BAR PREVIEW */}
          {showBar && (mode === 'movie-bar' || mode === 'series-bar') && (
            <div className="absolute bottom-6 inset-x-0 z-30 flex justify-center px-4">
              <div
                dir="ltr"
                className="w-full max-w-4xl achour-glass-bar rounded-3xl px-3.5 py-2.5 flex flex-col gap-2"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-14 rounded-xl bg-black/60 border border-white/20 flex items-center justify-center shrink-0">
                    {mode === 'series-bar' ? <Tv className="w-5 h-5 text-[var(--theme-primary,#D4AF37)]" /> : <Film className="w-5 h-5 text-[var(--theme-primary,#D4AF37)]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold achour-glossy-text truncate">
                        {mode === 'series-bar'
                          ? `${SAMPLE_STREAMS['series-bar'].seriesTitle} — S${String(SAMPLE_STREAMS['series-bar'].seasonNum).padStart(2, '0')}E${String(SAMPLE_STREAMS['series-bar'].episodeNum).padStart(2, '0')} • ${SAMPLE_STREAMS['series-bar'].episodeTitle}`
                          : SAMPLE_STREAMS['movie-bar'].title}
                      </h3>
                      <div className="text-right shrink-0">
                        <span className="text-[11px] font-sans tabular-nums font-normal achour-glossy-text block leading-tight">{formattedClock}</span>
                        <span className="text-[9px] font-sans tabular-nums font-normal achour-glossy-info block leading-tight">{formattedDate}</span>
                      </div>
                    </div>

                    {/* Progress bar + Elapsed / Total / Remaining */}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] font-sans tabular-nums font-normal text-white shrink-0">{formatTime(simTime)}</span>
                      <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[var(--theme-primary,#D4AF37)] rounded-full"
                          style={{ width: `${Math.min(100, (simTime / totalDur) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-sans tabular-nums font-normal text-zinc-300 shrink-0">{formatTime(totalDur)}</span>
                      <span className="text-[10px] font-sans tabular-nums font-medium text-[var(--theme-primary,#D4AF37)] shrink-0">
                        -{formatTime(remainingSec)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Single Inside Row of Controls */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10">
                  <div className="flex items-center gap-1.5">
                    <button
                      data-tv-preview-focus="true"
                      tabIndex={0}
                      onClick={() => {
                        const target = Math.max(0, simTime - seekStep);
                        setSimTime(target);
                        if (videoRef.current) videoRef.current.currentTime = target % (videoRef.current.duration || 60);
                        showToast(`-${seekStep}s`);
                      }}
                      className="px-2.5 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white text-[11px] font-medium flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary,#D4AF37)]"
                    >
                      <RotateCcw size={13} />
                      <span>-{seekStep}s</span>
                    </button>

                    <button
                      data-tv-preview-focus="true"
                      tabIndex={0}
                      onClick={() => {
                        setIsPlaying(p => !p);
                        if (videoRef.current) {
                          if (isPlaying) videoRef.current.pause();
                          else videoRef.current.play().catch(() => {});
                        }
                      }}
                      className="w-9 h-9 rounded-full achour-glossy-pill flex items-center justify-center font-medium focus:outline-none focus:ring-2 focus:ring-white"
                    >
                      {isPlaying ? <Pause size={16} className="fill-current" /> : <Play size={16} className="fill-current ml-0.5" />}
                    </button>

                    <button
                      data-tv-preview-focus="true"
                      tabIndex={0}
                      onClick={() => {
                        const target = Math.min(totalDur, simTime + seekStep);
                        setSimTime(target);
                        if (videoRef.current) videoRef.current.currentTime = target % (videoRef.current.duration || 60);
                        showToast(`+${seekStep}s`);
                      }}
                      className="px-2.5 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white text-[11px] font-medium flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary,#D4AF37)]"
                    >
                      <span>+{seekStep}s</span>
                      <RotateCw size={13} />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {currentVodMeta.audioTracks.length > 0 && (
                      <button
                        data-tv-preview-focus="true"
                        tabIndex={0}
                        onClick={() => setActiveSubPopup(p => p === 'audio' ? 'none' : 'audio')}
                        className="px-3 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white text-[11px] font-bold flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary,#D4AF37)]"
                      >
                        <Languages size={13} />
                        <span>{isRtl ? 'الصوت' : 'Audio'}</span>
                      </button>
                    )}

                    <button
                      data-tv-preview-focus="true"
                      tabIndex={0}
                      onClick={() => setActiveSubPopup(p => p === 'subtitles' ? 'none' : 'subtitles')}
                      className="px-3 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white text-[11px] font-bold flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary,#D4AF37)]"
                    >
                      <Subtitles size={13} />
                      <span>{isRtl ? 'الترجمة' : 'Subtitles'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {activeSubPopup === 'audio' && (
                <div
                  onClick={() => setActiveSubPopup('none')}
                  className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4"
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="achour-glass-modal border-[var(--theme-primary,#D4AF37)]/40 rounded-2xl p-4 w-[min(86vw,380px)] space-y-2"
                  >
                    <div className="text-xs font-bold text-[var(--theme-primary,#D4AF37)] pb-1.5 border-b border-white/10">
                      {isRtl ? 'مسارات الصوت الفعلية' : 'Real Audio Tracks'}
                    </div>
                    {currentVodMeta.audioTracks.map(tr => (
                      <button
                        key={tr.id}
                        onClick={() => { setSelectedAudio(tr.id); setActiveSubPopup('none'); }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs ${selectedAudio === tr.id ? 'bg-[var(--theme-primary,#D4AF37)]/20 text-[var(--theme-primary,#D4AF37)]' : 'text-zinc-200 hover:bg-white/10'}`}
                      >
                        <span>{tr.label}</span>
                        {selectedAudio === tr.id && <Check size={13} />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeSubPopup === 'subtitles' && (
                <div
                  onClick={() => setActiveSubPopup('none')}
                  className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4"
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="achour-glass-modal border-[var(--theme-primary,#D4AF37)]/40 rounded-2xl p-4 w-[min(86vw,380px)] space-y-2"
                  >
                    <div className="text-xs font-bold text-[var(--theme-primary,#D4AF37)] pb-1.5 border-b border-white/10">
                      {isRtl ? 'الترجمة' : 'Subtitles'}
                    </div>
                    {currentVodMeta.subtitleTracks.length === 0 ? (
                      <div className="text-xs text-zinc-300 py-2 text-center">
                        {isRtl ? 'الترجمة غير متوفرة' : 'Subtitles unavailable'}
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => { setSelectedSub(-1); setActiveSubPopup('none'); }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs ${selectedSub === -1 ? 'bg-[var(--theme-primary,#D4AF37)]/20 text-[var(--theme-primary,#D4AF37)]' : 'text-zinc-200 hover:bg-white/10'}`}
                        >
                          <span>{isRtl ? 'إيقاف الترجمة' : 'Off'}</span>
                          {selectedSub === -1 && <Check size={13} />}
                        </button>
                        {currentVodMeta.subtitleTracks.map(st => (
                          <button
                            key={st.id}
                            onClick={() => { setSelectedSub(st.id); setActiveSubPopup('none'); }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs ${selectedSub === st.id ? 'bg-[var(--theme-primary,#D4AF37)]/20 text-[var(--theme-primary,#D4AF37)]' : 'text-zinc-200 hover:bg-white/10'}`}
                          >
                            <span>{st.label}</span>
                            {selectedSub === st.id && <Check size={13} />}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TvPreviewModal;
