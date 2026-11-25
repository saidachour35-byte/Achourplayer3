// @ts-nocheck
// Achour Player VOD & Series Modal Player
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Hls from 'hls.js';

import {
  X,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Sliders,
  Subtitles as SubtitleIcon,
  Languages,
  Maximize2,
  ListVideo,
  Clock,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Check,
  Zap,
  Settings,
  PlayCircle,
  Volume2,
  VolumeX,
  Tv,
  Star,
  Info
} from 'lucide-react';
import { VodItem, SeriesEpisode } from '../types';
import { pushBackHandler, BackPriority, parseTVKeyEvent, setTVFocus, getCurrentTVFocus, clearTVFocus, isTVOrLowEndDevice, markLongPressModalOpened, isLongPressModalGraceActive, isSafeBackdropClick } from '../utils/tvNavigation';
import { useI18n } from '../utils/i18n';
import { formatLanguageLabel } from '../utils/mediaTracks';
import { getPlatformUrl, isNativeApp, isMobileDevice, isTVDevice } from '../utils/platform';
import { createUnifiedHlsConfig, resolveUnifiedStreamUrls, buildUnifiedNativeHeaders } from '../utils/hlsConfig';
import {
  cleanVodEntityId,
  getVodProgress,
  saveVodProgress,
  markVodCompleted,
  clearVodProgress,
  MIN_RESUME_POSITION_SEC
} from '../utils/vodProgressService';

export interface VodPlayerModalProps {
  item?: VodItem;
  media?: any;
  episodes?: SeriesEpisode[];
  episodesList?: any[];
  itemsList?: any[];
  epgData?: Record<string, any[]>;
  currentEpisodeIndex?: number;
  mediaType?: 'movie' | 'series' | 'live';
  seriesId?: string;
  playlistId?: string;
  initialResumeMode?: 'prompt' | 'resume' | 'restart';
  initialResumePositionSec?: number;
  activePlaylist?: any;
  settings?: any;
  isRtl?: boolean;
  onClose: () => void;
  onSelectEpisode?: (index: number) => void;
  onSelectMedia?: (media: any) => void;
  onToggleFavorite?: (media: any) => void;
  isFavorite?: boolean;
  isPreview?: boolean;
  containerId?: string;
  onPlaybackStarted?: (media: any) => void;
  onPlaybackFailed?: (media: any) => void;
}

type AspectRatioMode = 'fit' | 'fill' | 'zoom' | '16:9' | '4:3';
type ActivePopup = 'none' | 'audio' | 'subtitles' | 'quality' | 'aspect' | 'speed' | 'sleep' | 'episodes' | 'subtitle-settings';

export interface AudioTrackOption {
  id: number;
  name: string;
  lang: string;
  channels?: number;
  channelLabel?: string;
}

export interface SubtitleTrackOption {
  id: number;
  name: string;
  lang: string;
  mode: string;
}

const formatAudioChannelLabel = (channels?: number, channelLabel?: string): string => {
  if (channelLabel && (channelLabel === '5.1' || channelLabel === 'Stereo' || channelLabel === 'Mono' || channelLabel === '7.1')) {
    return channelLabel;
  }
  if (!channels || channels <= 0) return '';
  if (channels >= 8) return '7.1';
  if (channels >= 6) return '5.1';
  if (channels === 2) return 'Stereo';
  if (channels === 1) return 'Mono';
  return `${channels}ch`;
};

const extractExternalSubtitles = (mediaObj: any, episodeObj: any): Array<{ url: string; lang: string; label: string }> => {
  const candidates =
    episodeObj?.subtitles ||
    episodeObj?.info?.subtitles ||
    mediaObj?.subtitles ||
    mediaObj?.info?.subtitles ||
    mediaObj?.movie_data?.subtitles;
  if (!candidates) return [];
  const arr = Array.isArray(candidates) ? candidates : Object.values(candidates);
  const out: Array<{ url: string; lang: string; label: string }> = [];
  arr.forEach((entry: any, idx: number) => {
    if (entry && typeof entry === 'object') {
      const subUrl = entry.url || entry.src || entry.file || entry.link;
      if (typeof subUrl === 'string' && subUrl.trim().startsWith('http')) {
        const lang = String(entry.language || entry.lang || '');
        const label = String(entry.label || entry.name || formatLanguageLabel(lang, idx, 'subtitle'));
        out.push({ url: subUrl.trim(), lang, label });
      }
    } else if (typeof entry === 'string' && entry.trim().startsWith('http')) {
      out.push({ url: entry.trim(), lang: '', label: `Subtitle ${idx + 1}` });
    }
  });
  return out;
};

const extractAudioTracksFromManifest = (manifestText: string): AudioTrackOption[] => {
  const tracks: AudioTrackOption[] = [];
  const regex = /#EXT-X-MEDIA:TYPE=AUDIO[^\n]*?NAME="([^"]+)"[^\n]*/gi;
  let match;
  let idx = 0;
  while ((match = regex.exec(manifestText)) !== null) {
    const line = match[0];
    const name = match[1];
    const langMatch = line.match(/LANGUAGE="([^"]+)"/i);
    const chMatch = line.match(/CHANNELS="(\d+)/i);
    const channels = chMatch ? parseInt(chMatch[1], 10) : undefined;
    const channelLabel = formatAudioChannelLabel(channels);
    const lang = langMatch ? langMatch[1] : name;
    tracks.push({
      id: idx++,
      name: formatLanguageLabel(lang || name, idx - 1, 'audio'),
      lang,
      channels,
      channelLabel
    });
  }
  return tracks;
};

export const VodPlayerModal: React.FC<VodPlayerModalProps> = ({
  item,
  media,
  episodes,
  episodesList,
  itemsList,
  epgData,
  currentEpisodeIndex = 0,
  mediaType = 'movie',
  seriesId,
  playlistId,
  initialResumeMode = 'prompt',
  initialResumePositionSec,
  activePlaylist,
  settings,
  isRtl: propIsRtl,
  onClose,
  onSelectEpisode,
  onSelectMedia,
  onToggleFavorite,
  isFavorite = false,
  isPreview = false,
  containerId,
  onPlaybackStarted,
  onPlaybackFailed
}) => {
  const { t, isRtl } = useI18n(settings?.language || 'en');
  const portalTarget = typeof document !== 'undefined' ? document.body : null;
  const [previewBox, setPreviewBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    if (typeof document === 'undefined' || !isPreview || !containerId) {
      setPreviewBox(null);
      return;
    }

    let rafId = 0;
    const measure = () => {
      const targetEl = document.getElementById(containerId);
      if (!targetEl) return;
      const rect = targetEl.getBoundingClientRect();
      if (rect.width > 10 && rect.height > 10) {
        const next = {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
        setPreviewBox(prev =>
          prev &&
          prev.left === next.left &&
          prev.top === next.top &&
          prev.width === next.width &&
          prev.height === next.height
            ? prev
            : next
        );
      }
    };

    measure();
    rafId = requestAnimationFrame(measure);
    const settleTimer = setTimeout(measure, 120);
    window.addEventListener('resize', measure);

    let ro: ResizeObserver | null = null;
    const targetEl = document.getElementById(containerId);
    if (targetEl && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(targetEl);
    }

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(settleTimer);
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [containerId, isPreview]);

  const activeVod = item || media || {};
  const vodEpisodes = episodes || episodesList || [];
  const isLive = mediaType === 'live';

  const [showControls, setShowControls] = useState<boolean>(false);
   const [liveFocusMode, setLiveFocusMode] = useState<'channel' | 'bar'>('channel');
  const [vodFocusMode, setVodFocusMode] = useState<'playback' | 'bar'>('playback');

  // Live Clock for Infobar OSD (Only ticks while controls bar is visible)
  const [liveClock, setLiveClock] = useState<Date>(() => new Date());
  useEffect(() => {
    if (isPreview || !showControls) return;
    setLiveClock(new Date());
    const timer = setInterval(() => setLiveClock(new Date()), 10000);
    return () => clearInterval(timer);
  }, [isPreview, showControls]);

  const getProgramInfo = (ch: any) => {
    if (!ch || !epgData) return { current: null, next: null };
    const candidates = [
      ch.stream_id,
      ch.id,
      ch.epg_channel_id,
      ch.tvg_id,
      ch.name,
      typeof ch.name === 'string' ? ch.name.trim().toLowerCase() : '',
      typeof ch.epg_channel_id === 'string' ? ch.epg_channel_id.trim().toLowerCase() : '',
      typeof ch.tvg_id === 'string' ? ch.tvg_id.trim().toLowerCase() : ''
    ].filter(Boolean);
    let programs: any[] | null = null;
    for (const key of candidates) {
      const hit = epgData[String(key)];
      if (Array.isArray(hit) && hit.length > 0) {
        programs = hit;
        break;
      }
    }
    if (!programs) return { current: null, next: null };
    const now = new Date();
    const current = programs.find((p: any) => new Date(p.start) <= now && new Date(p.stop) >= now) || null;
    const next = programs.find((p: any) => new Date(p.start) > now) || null;
    return { current, next };
  };

  const activeVodIdStr = String(activeVod?.stream_id || activeVod?.id || '');
  const channelIndex = useMemo(() => {
    if (!itemsList || itemsList.length === 0 || !activeVodIdStr) return 1;
    const idx = itemsList.findIndex((ch: any) => String(ch.stream_id || ch.id) === activeVodIdStr);
    return idx >= 0 ? idx + 1 : 1;
  }, [itemsList, activeVodIdStr]);

  const { current: currentProg, next: nextProg } = useMemo(() => {
    return getProgramInfo(activeVod);
  }, [activeVod, epgData]);

  let currentProgPercent = 0;
  if (currentProg && currentProg.start && currentProg.stop) {
    const s = new Date(currentProg.start).getTime();
    const e = new Date(currentProg.stop).getTime();
    const n = liveClock.getTime();
    if (e > s) {
      currentProgPercent = Math.min(100, Math.max(0, ((n - s) / (e - s)) * 100));
    }
  }

  const formatTimeHHMM = (d: any) => {
    if (!d) return '';
    const dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return String(d);
    return dateObj.toLocaleTimeString(settings?.language === 'ar' ? 'ar-EG' : settings?.language || [], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: settings?.timeFormat === '12h'
    });
  };

  const formattedClockTime = liveClock.toLocaleTimeString(settings?.language === 'ar' ? 'ar-EG' : settings?.language || [], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: settings?.timeFormat === '12h'
  });

  const formattedClockDate = liveClock.toLocaleDateString(settings?.language === 'ar' ? 'ar-EG' : settings?.language || [], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  const formatVideoResolution = (resStr: string): string => {
    if (!resStr) return '';
    const match = resStr.match(/(\d+)\s*[x×]\s*(\d+)/i);
    if (match) {
      const w = parseInt(match[1], 10);
      const h = parseInt(match[2], 10);
      if (w > 0 && h > 0) {
        return `${w}x${h}`;
      }
    }
    const clean = resStr.trim();
    if (/4k|uhd|2160/i.test(clean)) return '4K';
    if (/fhd|1080/i.test(clean)) return '1080p';
    if (/hd|720/i.test(clean)) return '720p';
    if (/sd|576|480/i.test(clean)) return 'SD';
    return clean;
  };

  const inferQualityFromMedia = (item: any): string => {
    if (!item) return '';
    const name = String(item.name || item.title || item.stream_name || '').toUpperCase();
    const url = String(item.url || '').toUpperCase();
    const combined = `${name} ${url}`;
    if (/\b(4K|UHD|2160P?)\b/i.test(combined) || combined.includes('4K') || combined.includes('UHD')) return '4K';
    if (/\b(FHD|1080P?|FULL\s*HD)\b/i.test(combined) || combined.includes('FHD') || combined.includes('1080')) return '1080p';
    if (/\b(HD|720P?)\b/i.test(combined) || combined.includes('HD') || combined.includes('720')) return '720p';
    if (/\b(SD|576P?|480P?)\b/i.test(combined) || combined.includes('SD')) return 'SD';
    return '';
  };

  // Video element and container refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeWebVideoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isPreviewRef = useRef<boolean>(isPreview);
  isPreviewRef.current = isPreview;
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoNextTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapTimeRef = useRef<number>(0);
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);
  const seekLockUntilRef = useRef<number>(0);
  const lastNativeResRawRef = useRef<string>('');
  const lastNativeAudioRawRef = useRef<string>('');
  const lastNativeSubsRawRef = useRef<string>('');
  const lastSavedProgressSecRef = useRef<number>(-1);
  const startedPlaybackKeyRef = useRef<string>('');
  const failedPlaybackKeyRef = useRef<string>('');
  const endedPlaybackKeyRef = useRef<string>('');
  const pendingSeekSecRef = useRef<number>(0);
  const shouldAutoPlayRef = useRef<boolean>(true);
  const waitingForPromptRef = useRef<boolean>(false);
  const livePlaybackPosRef = useRef<number>(0);
  const livePlaybackDurRef = useRef<number>(0);
  const initialResumeConsumedRef = useRef<boolean>(false);
  const progressTargetRef = useRef<{
    mediaType: 'movie' | 'series';
    playlistId: string;
    streamId: string;
    seriesId?: string;
    episodeId?: string;
    seasonNum?: number;
    episodeNum?: number;
    episodeTitle?: string;
    legacyEpisodeIndex?: number;
    isLive: boolean;
    snapshot?: {
      mediaTitle?: string;
      streamIcon?: string;
      categoryId?: string;
      categoryName?: string;
      mediaUrl?: string;
      containerExtension?: string;
      rating?: string;
      releaseDate?: string;
      durationLabel?: string;
    };
  } | null>(null);
  const activeVodRef = useRef<any>(activeVod);
  activeVodRef.current = activeVod;
  const onPlaybackStartedRef = useRef(onPlaybackStarted);
  onPlaybackStartedRef.current = onPlaybackStarted;
  const onPlaybackFailedRef = useRef(onPlaybackFailed);
  onPlaybackFailedRef.current = onPlaybackFailed;

  // Playback States
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [buffered, setBuffered] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioMode>('fit');
  const [isSeeking, setIsSeeking] = useState<boolean>(false);

  // Resume State
  const [showResumePrompt, setShowResumePrompt] = useState<boolean>(false);
  const [savedResumeTime, setSavedResumeTime] = useState<number>(0);

  // Auto-Next Episode State
  const [showAutoNextPrompt, setShowAutoNextPrompt] = useState<boolean>(false);
  const [autoNextCountdown, setAutoNextCountdown] = useState<number>(10);

  // Popups & Active Drawers
  const [activePopup, setActivePopup] = useState<ActivePopup>('none');

  // HLS & Media3 Real Tracks Specs
  const [audioTracks, setAudioTracks] = useState<AudioTrackOption[]>([]);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<number>(-1);
  
  const [hlsQualities, setHlsQualities] = useState<Array<{ id: number; height: number; bitrate: number; name: string }>>([]);
  const [selectedQuality, setSelectedQuality] = useState<number>(-1); // -1 is Auto
  const [realResolution, setRealResolution] = useState<string>('');

  // Subtitle States
  const [subtitles, setSubtitles] = useState<SubtitleTrackOption[]>([]);
  const [selectedSubtitle, setSelectedSubtitle] = useState<number>(-1); // -1 is Off
  const [subSyncOffset, setSubSyncOffset] = useState<number>(0); // Seconds offset (-5 to +5)
  const [subFontSize, setSubFontSize] = useState<'sm' | 'md' | 'lg' | 'xl'>('lg');
  const [subColor, setSubColor] = useState<string>('#FFFFFF');
  const [subBg, setSubBg] = useState<'none' | 'semi' | 'black'>('semi');

  // Sleep Timer
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
  const [sleepTimerTimeLeft, setSleepTimerTimeLeft] = useState<number | null>(null);

  // Direct Seeking Overlay State
  const [seekNotice, setSeekNotice] = useState<string | null>(null);
  const seekNoticeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Key debouncing & popup/prompt safe dismissal guards
  const lastKeyTimeRef = useRef<number>(0);
  const popupOpenedAtRef = useRef<number>(0);
  const popupBackdropDownRef = useRef<boolean>(false);
  const promptOpenedAtRef = useRef<number>(0);
  const promptBackdropDownRef = useRef<boolean>(false);

  useEffect(() => {
    if (activePopup !== 'none') {
      popupOpenedAtRef.current = Date.now();
      popupBackdropDownRef.current = false;
      markLongPressModalOpened(550);
    }
  }, [activePopup]);

  useEffect(() => {
    if (showResumePrompt || showAutoNextPrompt) {
      promptOpenedAtRef.current = Date.now();
      promptBackdropDownRef.current = false;
      markLongPressModalOpened(550);
    }
  }, [showResumePrompt, showAutoNextPrompt]);

  const seekStepSeconds = settings?.seekStep || 10;

  // Stream & Episode resolver
  const isSeries = mediaType === 'series' || (vodEpisodes && vodEpisodes.length > 0);
  const effectivePlaylistId = String(playlistId || activePlaylist?.id || settings?.activePlaylistId || 'default').trim() || 'default';
  const resolvedSeriesId = isSeries
    ? cleanVodEntityId(seriesId || activeVod?.series_id || activeVod?.parent_series_id, effectivePlaylistId)
    : '';
  const resolvedEpisodeIndex = isSeries && vodEpisodes.length > 0
    ? (() => {
        const aid = cleanVodEntityId(
          activeVod.xtream_id || activeVod.original_id || activeVod.stream_id || activeVod.id || '',
          effectivePlaylistId,
          resolvedSeriesId
        );
        const matchedIdx = aid
          ? vodEpisodes.findIndex((ep: any) =>
              cleanVodEntityId(ep.xtream_id || ep.original_id || ep.stream_id || ep.id || '', effectivePlaylistId, resolvedSeriesId) === aid
            )
          : -1;
        return matchedIdx >= 0 ? matchedIdx : currentEpisodeIndex;
      })()
    : currentEpisodeIndex;
  const currentEpisode = isSeries ? (vodEpisodes[resolvedEpisodeIndex] || activeVod) : null;
  const cleanVodOrEpId = isSeries
    ? cleanVodEntityId(
        currentEpisode?.xtream_id || currentEpisode?.original_id || currentEpisode?.stream_id || currentEpisode?.id || activeVod?.xtream_id || activeVod?.stream_id || activeVod?.id,
        effectivePlaylistId,
        resolvedSeriesId
      )
    : cleanVodEntityId(activeVod?.stream_id || activeVod?.id, effectivePlaylistId);
  const vodId = cleanVodOrEpId || activeVod.id || activeVod.stream_id || activeVod.title || 'vod_1';
  const streamUrl = activeVod.stream_url || activeVod.url || activeVod.direct_source || '';
  const rawActiveStreamUrl = activeVod.url || activeVod.stream_url || currentEpisode?.stream_url || currentEpisode?.url || currentEpisode?.direct_source || streamUrl;

  const isNativeActive = isNativeApp() && typeof window !== 'undefined' && !!(window as any).AchourNative;

  const liveBarLogoUrl = String(activeVod.stream_icon || activeVod.logo || activeVod.cover || '').trim();
  const vodBarPosterUrl = String(activeVod.stream_icon || activeVod.cover || activeVod.logo || '').trim();
  const [failedLogoUrl, setFailedLogoUrl] = useState<string>('');
  useEffect(() => {
    setFailedLogoUrl('');
  }, [activeVodIdStr, liveBarLogoUrl, vodBarPosterUrl]);

  useEffect(() => {
    if (typeof document === 'undefined' || isNativeActive) return;
    document.documentElement.classList.add('achour-web-player-active');
    return () => {
      document.documentElement.classList.remove('achour-web-player-active');
    };
  }, [isNativeActive]);

  const {
    playUrl,
    activeStreamUrl,
    isExplicitHls,
    isHls
  } = resolveUnifiedStreamUrls(rawActiveStreamUrl, isLive, isNativeActive);

  const seasonNum = currentEpisode?.season_num ?? currentEpisode?.season ?? activeVod?.season_num ?? activeVod?.season;
  const episodeNum = currentEpisode?.episode_num ?? currentEpisode?.episode ?? activeVod?.episode_num ?? activeVod?.episode;
  const seriesMainName = activeVod.series_name || (typeof activeVod.name === 'string' && activeVod.name.includes(' - S') ? activeVod.name.split(' - S')[0] : activeVod.title || activeVod.name);
  const rawEpName = currentEpisode?.title || currentEpisode?.name || '';
  const cleanEpTitle = rawEpName.includes(': ') ? rawEpName.split(': ').slice(1).join(': ') : rawEpName;
  const rawCategoryName = String(activeVod.category_name || '').trim();
  const cleanVodCategoryName = rawCategoryName && !/^(general|uncategorized|عام|عام\s*\(general\))$/i.test(rawCategoryName)
    ? rawCategoryName
    : '';

  const displayTitle = isSeries
    ? (seriesMainName || (isRtl ? 'مسلسل' : 'Series'))
    : activeVod.title || activeVod.name || (isRtl ? 'عرض فيديو' : 'Video');
  const displaySeriesSubline = isSeries
    ? `${seasonNum ? `S${String(seasonNum).padStart(2, '0')} ` : ''}E${String(episodeNum || resolvedEpisodeIndex + 1).padStart(2, '0')}${cleanEpTitle ? ` • ${cleanEpTitle}` : ''}`
    : (cleanVodCategoryName || (isRtl ? 'فيلم' : 'Movie'));

  const externalSubtitles = extractExternalSubtitles(activeVod, currentEpisode);

  const flushCurrentProgress = useCallback((notify = false, explicitPosSec?: number, explicitDurSec?: number) => {
    const target = progressTargetRef.current;
    if (!target || target.isLive || !target.streamId || waitingForPromptRef.current) return;

    const native = typeof window !== 'undefined' ? (window as any).AchourNative : null;
    const isNative = isNativeApp() && !!native;

    let posSec = explicitPosSec ?? 0;
    let durSec = explicitDurSec ?? 0;

    if (explicitPosSec === undefined) {
      if (isNative && native) {
        try {
          const nPos = Number(native.getCurrentPosition()) / 1000;
          const nDur = Number(native.getDuration()) / 1000;
          posSec = Number.isFinite(nPos) && nPos > 0 ? nPos : livePlaybackPosRef.current;
          durSec = Number.isFinite(nDur) && nDur > 0 ? nDur : livePlaybackDurRef.current;
        } catch {
          posSec = livePlaybackPosRef.current;
          durSec = livePlaybackDurRef.current;
        }
      } else if (videoRef.current) {
        posSec = Number.isFinite(videoRef.current.currentTime) && videoRef.current.currentTime > 0
          ? videoRef.current.currentTime
          : livePlaybackPosRef.current;
        durSec = Number.isFinite(videoRef.current.duration) && videoRef.current.duration > 0
          ? videoRef.current.duration
          : livePlaybackDurRef.current;
      } else {
        posSec = livePlaybackPosRef.current;
        durSec = livePlaybackDurRef.current;
      }
    }

    if (!Number.isFinite(posSec) || posSec < 4) return;
    lastSavedProgressSecRef.current = Math.floor(posSec);
    saveVodProgress({
      mediaType: target.mediaType,
      playlistId: target.playlistId,
      streamId: target.streamId,
      seriesId: target.seriesId,
      episodeId: target.episodeId,
      seasonNum: target.seasonNum,
      episodeNum: target.episodeNum,
      episodeTitle: target.episodeTitle,
      positionSec: posSec,
      durationSec: durSec,
      legacyEpisodeIndex: target.legacyEpisodeIndex,
      notify,
      snapshot: target.snapshot
    });
  }, []);

  const handleCloseWithSave = useCallback(() => {
    flushCurrentProgress(true);
    onClose();
  }, [flushCurrentProgress, onClose]);

  const syncNativePreviewClasses = (
    previewMode: boolean,
    bounds?: { x: number; y: number; width: number; height: number } | null
  ) => {
    if (typeof document === 'undefined') return;
    const docEl = document.documentElement;
    const bodyEl = document.body;
    docEl.classList.add('native-player-active');
    bodyEl.classList.add('native-player-active');

    if (previewMode) {
      docEl.classList.add('native-player-preview');
      bodyEl.classList.add('native-player-preview');
      if (bounds && bounds.width > 10 && bounds.height > 10) {
        const x = Math.max(0, Math.round(bounds.x));
        const y = Math.max(0, Math.round(bounds.y));
        const w = Math.max(0, Math.round(bounds.width));
        const h = Math.max(0, Math.round(bounds.height));
        const clip = `polygon(evenodd, 0px 0px, 100% 0px, 100% 100%, 0px 100%, 0px 0px, ${x}px ${y}px, ${x}px ${y + h}px, ${x + w}px ${y + h}px, ${x + w}px ${y}px, ${x}px ${y}px)`;
        docEl.style.setProperty('--native-preview-clip', clip);
      } else {
        docEl.style.removeProperty('--native-preview-clip');
      }
    } else {
      docEl.classList.remove('native-player-preview');
      bodyEl.classList.remove('native-player-preview');
      docEl.style.removeProperty('--native-preview-clip');
    }
  };

  // Native unmount cleanup (avoid hiding player surface between consecutive Live channel zaps)
  useEffect(() => {
    if (!isNativeActive) return;
    return () => {
      document.documentElement.classList.remove('native-player-active', 'native-player-preview');
      document.body.classList.remove('native-player-active', 'native-player-preview');
      document.documentElement.style.removeProperty('--native-preview-clip');
      const native = typeof window !== 'undefined' ? (window as any).AchourNative : null;
      if (native) {
        try {
          native.hidePlayer();
        } catch (e) {}
      }
    };
  }, [isNativeActive]);

  // Persistent HLS cleanup on unmount
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        try {
          hlsRef.current.stopLoad();
          hlsRef.current.detachMedia();
          hlsRef.current.destroy();
        } catch (e) {}
        hlsRef.current = null;
      }
    };
  }, []);

  // Keep native ExoPlayer bounds synchronized cleanly on fullscreen <-> preview transitions via ResizeObserver
  useEffect(() => {
    const native = typeof window !== 'undefined' ? (window as any).AchourNative : null;
    if (!isNativeApp() || !native) return;

    let lastKey = '';
    const syncNativeBounds = () => {
      let b = { x: 0, y: 0, width: 0, height: 0 };
      let hasMeasuredRect = false;
      if (isPreview) {
        const previewHost = containerId ? document.getElementById(containerId) : null;
        const rect = previewHost?.getBoundingClientRect() || containerRef.current?.getBoundingClientRect();
        if (rect && rect.width > 10 && rect.height > 10) {
          hasMeasuredRect = true;
          b = {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          };
        } else {
          b = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
        }
      }
      syncNativePreviewClasses(isPreview, isPreview && hasMeasuredRect ? b : null);

      const key = `${b.x},${b.y},${b.width},${b.height}`;
      if (key === lastKey) return;
      lastKey = key;
      try {
        native.updateBounds(b.x, b.y, b.width, b.height);
      } catch (e) {}
    };

    const forceResyncBounds = () => {
      lastKey = '';
      requestAnimationFrame(syncNativeBounds);
      setTimeout(syncNativeBounds, 90);
    };
    const onVisibilityBounds = () => {
      if (!document.hidden) forceResyncBounds();
    };

    const rafId = requestAnimationFrame(syncNativeBounds);
    const settleTimer = setTimeout(syncNativeBounds, 100);
    window.addEventListener('resize', syncNativeBounds);
    window.addEventListener('achour_native_resume', forceResyncBounds);
    document.addEventListener('visibilitychange', onVisibilityBounds);

    let ro: ResizeObserver | null = null;
    const previewHost = isPreview && containerId ? document.getElementById(containerId) : null;
    if (previewHost && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(syncNativeBounds);
      ro.observe(previewHost);
    }

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(settleTimer);
      ro?.disconnect();
      window.removeEventListener('resize', syncNativeBounds);
      window.removeEventListener('achour_native_resume', forceResyncBounds);
      document.removeEventListener('visibilitychange', onVisibilityBounds);
    };
  }, [isPreview, containerId]);

  // Persist progress reliably across app background/close/tab switch on Web & Android
  useEffect(() => {
    if (isLive || isPreview) return;
    const onLifecycleHide = () => {
      if (document.visibilityState === 'hidden' || document.visibilityState === undefined) {
        flushCurrentProgress(true);
      }
    };
    const onPageHide = () => flushCurrentProgress(true);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onPageHide);
    document.addEventListener('visibilitychange', onLifecycleHide);
    return () => {
      flushCurrentProgress(true);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onPageHide);
      document.removeEventListener('visibilitychange', onLifecycleHide);
    };
  }, [isLive, isPreview, flushCurrentProgress]);

  // 1. Initialize Player & Load Stream (AndroidX Media3 ExoPlayer via AchourNativeBridge on Android, Hls.js on Web)
  useEffect(() => {
    // Each stream effect owns its callbacks. Once a channel/episode changes,
    // callbacks from the previous stream become inert instead of touching the new player.
    let effectActive = true;
    const isCurrentPlayback = () => effectActive;
    const native = typeof window !== 'undefined' ? (window as any).AchourNative : null;
    const isNative = isNativeApp() && !!native;

    if (!activeStreamUrl) return () => { effectActive = false; };

    // Update active progress target for current movie/episode
    progressTargetRef.current = !isLive
      ? {
          mediaType: isSeries ? 'series' : 'movie',
          playlistId: effectivePlaylistId,
          streamId: String(vodId),
          seriesId: isSeries ? resolvedSeriesId : undefined,
          episodeId: isSeries ? String(vodId) : undefined,
          seasonNum: Number(seasonNum) || 1,
          episodeNum: Number(episodeNum || resolvedEpisodeIndex + 1) || 1,
          episodeTitle: cleanEpTitle || displayTitle,
          legacyEpisodeIndex: resolvedEpisodeIndex,
          isLive: false,
          snapshot: {
            mediaTitle: displayTitle,
            streamIcon: activeVod?.series_poster || activeVod?.stream_icon || activeVod?.cover || activeVod?.logo || currentEpisode?.stream_icon,
            categoryId: activeVod?.category_id ? String(activeVod.category_id) : undefined,
            categoryName: activeVod?.category_name || undefined,
            mediaUrl: isSeries ? undefined : (rawActiveStreamUrl || undefined),
            containerExtension: activeVod?.container_extension || currentEpisode?.container_extension,
            rating: activeVod?.rating ? String(activeVod.rating) : undefined,
            releaseDate: activeVod?.releaseDate || activeVod?.year || undefined,
            durationLabel: activeVod?.duration ? String(activeVod.duration) : undefined
          }
        }
      : null;

    // Reset per-stream transient states
    setAudioTracks([]);
    setSubtitles([]);
    setSelectedAudioTrack(-1);
    setSelectedSubtitle(-1);
    setRealResolution('');
    setShowResumePrompt(false);
    setShowAutoNextPrompt(false);
    setSavedResumeTime(0);
    setCurrentTime(0);
    setDuration(0);
    lastSavedProgressSecRef.current = -1;
    livePlaybackPosRef.current = 0;
    livePlaybackDurRef.current = 0;
    pendingSeekSecRef.current = 0;
    waitingForPromptRef.current = false;
    shouldAutoPlayRef.current = true;

    let startPositionSec = 0;
    let shouldHoldForPrompt = false;

    if (!isLive && !isPreview) {
      const useInitialOverride = !initialResumeConsumedRef.current;
      initialResumeConsumedRef.current = true;

      if (useInitialOverride && initialResumeMode === 'restart') {
        clearVodProgress({
          mediaType: isSeries ? 'series' : 'movie',
          playlistId: effectivePlaylistId,
          streamId: String(vodId),
          seriesId: isSeries ? resolvedSeriesId : undefined,
          episodeId: isSeries ? String(vodId) : undefined,
          legacyEpisodeIndex: resolvedEpisodeIndex
        });
      } else if (useInitialOverride && initialResumeMode === 'resume') {
        const overrideSec = Number(initialResumePositionSec || 0);
        if (overrideSec >= MIN_RESUME_POSITION_SEC) {
          startPositionSec = Math.floor(overrideSec);
        } else {
          const savedRec = getVodProgress({
            mediaType: isSeries ? 'series' : 'movie',
            playlistId: effectivePlaylistId,
            streamId: String(vodId),
            seriesId: isSeries ? resolvedSeriesId : undefined,
            episodeId: isSeries ? String(vodId) : undefined,
            legacyEpisodeIndex: resolvedEpisodeIndex
          });
          if (savedRec && !savedRec.completed && savedRec.positionSec >= MIN_RESUME_POSITION_SEC) {
            startPositionSec = Math.floor(savedRec.positionSec);
          }
        }
      } else {
        const savedRec = getVodProgress({
          mediaType: isSeries ? 'series' : 'movie',
          playlistId: effectivePlaylistId,
          streamId: String(vodId),
          seriesId: isSeries ? resolvedSeriesId : undefined,
          episodeId: isSeries ? String(vodId) : undefined,
          legacyEpisodeIndex: resolvedEpisodeIndex
        });
        if (savedRec && !savedRec.completed && savedRec.positionSec >= MIN_RESUME_POSITION_SEC) {
          shouldHoldForPrompt = true;
          waitingForPromptRef.current = true;
          shouldAutoPlayRef.current = false;
          setSavedResumeTime(savedRec.positionSec);
          setShowResumePrompt(true);
          setIsPlaying(false);
        }
      }

      if (startPositionSec >= MIN_RESUME_POSITION_SEC) {
        pendingSeekSecRef.current = startPositionSec;
        livePlaybackPosRef.current = startPositionSec;
        setCurrentTime(startPositionSec);
        seekLockUntilRef.current = Date.now() + 1200;
      }
    }

    if (isNative && native) {
      const getTargetBounds = () => {
        if (!isPreviewRef.current) {
          return { x: 0, y: 0, width: 0, height: 0, measured: false };
        }
        const previewHost = containerId ? document.getElementById(containerId) : null;
        const rect = previewHost?.getBoundingClientRect() || containerRef.current?.getBoundingClientRect();
        if (rect && rect.width > 10 && rect.height > 10) {
          return {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            measured: true
          };
        }
        return { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight, measured: false };
      };

      const initialBounds = getTargetBounds();
      syncNativePreviewClasses(isPreviewRef.current, initialBounds.measured ? initialBounds : null);

      try {
        const customHeaders = buildUnifiedNativeHeaders(activeVodRef.current);

        native.showPlayer(
          activeStreamUrl,
          JSON.stringify({
            title: displayTitle,
            isLive,
            engine: 'exoplayer',
            autoPlay: !shouldHoldForPrompt,
            startPositionMs: startPositionSec > 0 ? Math.round(startPositionSec * 1000) : 0,
            subtitles: !isLive && externalSubtitles.length > 0 ? externalSubtitles : undefined,
            headers: customHeaders
          }),
          initialBounds.x,
          initialBounds.y,
          initialBounds.width,
          initialBounds.height
        );
        setIsPlaying(!shouldHoldForPrompt);
      } catch (e) {
        console.warn('AchourNative showPlayer failed:', e);
      }

      lastNativeResRawRef.current = '';
      lastNativeAudioRawRef.current = '';
      lastNativeSubsRawRef.current = '';

      const playbackKey = `${vodId}__${resolvedEpisodeIndex}__${activeStreamUrl}`;
      const applyResolutionStr = (res: string) => {
        if (res && res !== lastNativeResRawRef.current) {
          lastNativeResRawRef.current = res;
          if (/(\d+)\s*[x×]\s*(\d+)/i.test(res)) {
            const m = res.match(/(\d+)\s*[x×]\s*(\d+)/i);
            if (m && parseInt(m[1], 10) > 0 && parseInt(m[2], 10) > 0) {
              const nextRes = `${parseInt(m[1], 10)}x${parseInt(m[2], 10)}`;
              setRealResolution(prev => (prev === nextRes ? prev : nextRes));
            }
          } else if (res.trim()) {
            setRealResolution(prev => (prev === res.trim() ? prev : res.trim()));
          }
        }
      };
      const syncNativeResolution = () => {
        try {
          if (typeof native.getVideoResolution === 'function') {
            applyResolutionStr(native.getVideoResolution() || '');
          }
        } catch {}
      };
      syncNativeResolution();
      let pollTickCount = 0;
      const pollInterval = setInterval(() => {
        if (!isCurrentPlayback()) return;
        pollTickCount += 1;
        try {
          const nowTs = Date.now();
          let nativePlaying = false;
          let nativeEnded = false;
          let pos = NaN;
          let dur = NaN;

          if (typeof native.getPlaybackSnapshot === 'function') {
            const rawSnap = native.getPlaybackSnapshot();
            if (rawSnap) {
              const snap = JSON.parse(rawSnap);
              nativePlaying = Boolean(snap.playing);
              nativeEnded = Boolean(snap.ended);
              if (typeof snap.positionMs === 'number') {
                pos = snap.positionMs / 1000;
              }
              if (typeof snap.durationMs === 'number') {
                dur = snap.durationMs / 1000;
              }
              if (typeof snap.resolution === 'string') {
                applyResolutionStr(snap.resolution);
              }
            }
          } else {
            nativePlaying = typeof native.isPlaying === 'function' ? Boolean(native.isPlaying()) : false;
            syncNativeResolution();
            if (!isLive) {
              pos = Number(native.getCurrentPosition()) / 1000;
              dur = Number(native.getDuration()) / 1000;
              nativeEnded = typeof native.isEnded === 'function' ? Boolean(native.isEnded()) : false;
            }
          }

          if (nativePlaying && startedPlaybackKeyRef.current !== playbackKey) {
            startedPlaybackKeyRef.current = playbackKey;
            onPlaybackStartedRef.current?.(activeVodRef.current);
          }

          if (!isLive) {
            if (Number.isFinite(pos) && pos >= 0) {
              livePlaybackPosRef.current = pos;
            }
            if (Number.isFinite(dur) && dur > 0) {
              livePlaybackDurRef.current = dur;
            }
            if (nowTs > seekLockUntilRef.current) {
              if (!isNaN(pos)) setCurrentTime(pos);
              if (!isNaN(dur) && dur > 0) setDuration(dur);
            }
            if (!waitingForPromptRef.current) {
              setIsPlaying(nativePlaying);
            }

            if (
              !waitingForPromptRef.current &&
              Number.isFinite(pos) &&
              pos >= 4 &&
              Math.abs(Math.floor(pos) - lastSavedProgressSecRef.current) >= 4
            ) {
              flushCurrentProgress(false, pos, Number.isFinite(dur) ? dur : 0);
            }

            if (nativeEnded && endedPlaybackKeyRef.current !== playbackKey) {
              endedPlaybackKeyRef.current = playbackKey;
              setIsPlaying(false);
              if (progressTargetRef.current) {
                markVodCompleted({
                  mediaType: progressTargetRef.current.mediaType,
                  playlistId: progressTargetRef.current.playlistId,
                  streamId: progressTargetRef.current.streamId,
                  seriesId: progressTargetRef.current.seriesId,
                  episodeId: progressTargetRef.current.episodeId,
                  seasonNum: progressTargetRef.current.seasonNum,
                  episodeNum: progressTargetRef.current.episodeNum,
                  episodeTitle: progressTargetRef.current.episodeTitle,
                  durationSec: Number.isFinite(dur) ? dur : livePlaybackDurRef.current,
                  legacyEpisodeIndex: progressTargetRef.current.legacyEpisodeIndex
                });
              }
              if (isSeries && resolvedEpisodeIndex < (vodEpisodes.length - 1)) {
                handleNextEpisode();
              }
            }
          }

          // Track lists rarely change mid-stream: poll every ~1.5s (or while empty during first ~3s)
          const shouldPollTracks =
            !isLive &&
            (pollTickCount % 5 === 0 ||
              (pollTickCount <= 10 && (!lastNativeAudioRawRef.current || !lastNativeSubsRawRef.current)));

          if (shouldPollTracks && typeof native.getAudioTracks === 'function') {
            const rawAudio = native.getAudioTracks() || '';
            if (rawAudio && rawAudio !== lastNativeAudioRawRef.current) {
              lastNativeAudioRawRef.current = rawAudio;
              const parsedAudio = JSON.parse(rawAudio);
              if (Array.isArray(parsedAudio)) {
                const normalizedAudio: AudioTrackOption[] = parsedAudio.map((tr: any, i: number) => {
                  const channels = typeof tr.channels === 'number' && tr.channels > 0 ? tr.channels : undefined;
                  const chLabel = formatAudioChannelLabel(channels, tr.channelLabel);
                  const langStr = tr.lang || tr.language || '';
                  const formattedLang = formatLanguageLabel(langStr || tr.label, tr.id ?? i, 'audio');
                  return {
                    id: typeof tr.id === 'number' ? tr.id : i,
                    name: chLabel ? `${formattedLang} (${chLabel})` : formattedLang,
                    lang: langStr,
                    channels,
                    channelLabel: chLabel
                  };
                });
                setAudioTracks(normalizedAudio);
                const activeAud = parsedAudio.find((tr: any) => tr.selected);
                if (activeAud && typeof activeAud.id === 'number') {
                  setSelectedAudioTrack(activeAud.id);
                }
              }
            }
          }

          if (shouldPollTracks && typeof native.getSubtitleTracks === 'function') {
            const rawSubs = native.getSubtitleTracks() || '';
            if (rawSubs && rawSubs !== lastNativeSubsRawRef.current) {
              lastNativeSubsRawRef.current = rawSubs;
              const parsedSubs = JSON.parse(rawSubs);
              if (Array.isArray(parsedSubs)) {
                const normalizedSubs: SubtitleTrackOption[] = parsedSubs.map((st: any, i: number) => {
                  const langStr = st.lang || st.language || '';
                  return {
                    id: typeof st.id === 'number' ? st.id : i,
                    name: formatLanguageLabel(langStr || st.label, st.id ?? i, 'subtitle'),
                    lang: langStr,
                    mode: st.selected ? 'showing' : 'disabled'
                  };
                });
                setSubtitles(normalizedSubs);
                const activeSub = parsedSubs.find((st: any) => st.selected);
                if (activeSub && typeof activeSub.id === 'number') {
                  setSelectedSubtitle(activeSub.id);
                }
              }
            }
          }
        } catch (e) {}
      }, isLive ? 250 : 300);

      return () => {
        effectActive = false;
        clearInterval(pollInterval);
        if (!isLive) {
          flushCurrentProgress(true);
        }
      };
    }

    const video = videoRef.current;
    if (!video) return;

    // Silence any previously mounted Web <video> if portalTarget swapped DOM nodes (mini-preview <-> fullscreen)
    if (activeWebVideoRef.current && activeWebVideoRef.current !== video) {
      try {
        activeWebVideoRef.current.pause();
        activeWebVideoRef.current.removeAttribute('src');
        activeWebVideoRef.current.load();
      } catch (e) {}
    }
    activeWebVideoRef.current = video;
    video.muted = isMuted;
    video.volume = volume;
    if (isLive) {
      video.defaultPlaybackRate = 1;
      video.playbackRate = 1;
    }

    if (Hls.isSupported() && isHls) {
      let hls = hlsRef.current;

      if (hls) {
        const oldMedia = hls.media;
        try {
          hls.stopLoad();
          hls.detachMedia();
          hls.destroy();
        } catch (e) {}
        if (oldMedia && oldMedia !== video) {
          try {
            oldMedia.pause();
            if (oldMedia.hasAttribute('src')) {
              oldMedia.removeAttribute('src');
              oldMedia.load();
            }
          } catch (e) {}
        }
        hlsRef.current = null;
      }

      hls = new Hls(createUnifiedHlsConfig(isLive, isPreviewRef.current));

      hlsRef.current = hls;
      hls.attachMedia(video);
      hls.loadSource(activeStreamUrl);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        if (!isCurrentPlayback()) return;
        const qualities = data.levels.map((lvl, index) => ({
          id: index,
          height: lvl.height || 0,
          bitrate: lvl.bitrate || 0,
          name: lvl.height ? `${lvl.height}p` : `Level ${index + 1}`
        }));
        setHlsQualities(qualities);
        if (data.levels.length === 1 && data.levels[0].width > 0 && data.levels[0].height > 0 && video.videoWidth === 0) {
          setRealResolution(`${data.levels[0].width}x${data.levels[0].height}`);
        }

        let extractedTracks: AudioTrackOption[] = [];
        if (hls.audioTracks && hls.audioTracks.length > 0) {
          extractedTracks = hls.audioTracks.map((tr: any, index: number) => {
            const chLabel = formatAudioChannelLabel(tr.channels);
            const label = formatLanguageLabel(tr.lang || tr.name, index, 'audio');
            return {
              id: index,
              name: chLabel ? `${label} (${chLabel})` : label,
              lang: tr.lang || '',
              channels: tr.channels,
              channelLabel: chLabel
            };
          });
          setSelectedAudioTrack(hls.audioTrack);
        }

        if (hls.subtitleTracks && hls.subtitleTracks.length > 0) {
          const subTracks: SubtitleTrackOption[] = hls.subtitleTracks.map((st, index) => ({
            id: index,
            name: formatLanguageLabel(st.lang || st.name, index, 'subtitle'),
            lang: st.lang || '',
            mode: 'disabled'
          }));
          setSubtitles(subTracks);
        }

        if (!isLive && isExplicitHls && extractedTracks.length === 0) {
          fetch(activeStreamUrl)
            .then(res => {
              if (!res.ok) throw new Error(`Manifest request failed: ${res.status}`);
              return res.text();
            })
            .then(text => {
              if (!isCurrentPlayback()) return;
              const manifestAudioTracks = extractAudioTracksFromManifest(text);
              if (manifestAudioTracks.length > 0) {
                setAudioTracks(manifestAudioTracks);
              }
            })
            .catch(() => {});
        } else if (extractedTracks.length > 0) {
          setAudioTracks(extractedTracks);
        }

        if (shouldAutoPlayRef.current && !waitingForPromptRef.current) {
          video.play().then(() => {
            if (isCurrentPlayback()) setIsPlaying(true);
          }).catch(() => {
            if (isCurrentPlayback()) setIsPlaying(false);
          });
        }
      });

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        if (!isCurrentPlayback()) return;
        if (video.paused && shouldAutoPlayRef.current && !waitingForPromptRef.current) {
          video.play().catch(() => {});
        }
      });

      hls.on(Hls.Events.FRAG_PARSED, () => {
        if (!isCurrentPlayback()) return;
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          setRealResolution(`${video.videoWidth}x${video.videoHeight}`);
        }
        if (video.paused && shouldAutoPlayRef.current && !waitingForPromptRef.current) {
          video.play().catch(() => {});
        }
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        if (!isCurrentPlayback()) return;
        const level = hls?.levels?.[data.level];
        if (level && level.width > 0 && level.height > 0) {
          setRealResolution(`${level.width}x${level.height}`);
        } else if (video.videoWidth > 0 && video.videoHeight > 0) {
          setRealResolution(`${video.videoWidth}x${video.videoHeight}`);
        }
      });

      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, data) => {
        if (!isCurrentPlayback()) return;
        setSelectedAudioTrack(data.id);
      });

      hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, (_, data) => {
        if (!isCurrentPlayback()) return;
        setSelectedSubtitle(data.id);
      });

      if (isLive) {
        hls.on(Hls.Events.FRAG_LOADED, (_, data: any) => {
          if (!isCurrentPlayback()) return;
          const stats = data?.frag?.stats;
          const loadMs = stats ? Math.round((stats.loading?.end || 0) - (stats.loading?.start || 0)) : 0;
          if (loadMs >= 1500) {
            let aheadSec = 0;
            try {
              const cur = video.currentTime;
              for (let i = 0; i < video.buffered.length; i++) {
                if (cur >= video.buffered.start(i) - 0.5 && cur <= video.buffered.end(i)) {
                  aheadSec = Math.max(0, video.buffered.end(i) - cur);
                  break;
                }
              }
            } catch {}
            console.debug(`[AchourLiveDiag][HlsJs] SLOW_FRAG durMs=${loadMs} bytes=${stats?.total || 0} aheadSec=${aheadSec.toFixed(2)}`);
          }
        });
      }

      let hlsErrorCount = 0;
      let directFallbackStarted = false;
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!isCurrentPlayback()) return;
        if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR || data.details === Hls.ErrorDetails.BUFFER_NUDGE_ON_STALL) {
          if (isLive) {
            console.warn(`[AchourLiveDiag][HlsJs] ${data.details}`, { buffer: data.buffer, fatal: data.fatal });
          }
          if (video && video.paused && shouldAutoPlayRef.current && !waitingForPromptRef.current) {
            video.play().catch(() => {});
          }
          return;
        }
        if (isLive && !data.fatal) {
          console.warn(`[AchourLiveDiag][HlsJs] NON_FATAL ${data.type}:${data.details}`);
        }
        if (data.fatal) {
          hlsErrorCount++;
          console.warn('[VodPlayerModal] HLS Fatal Error:', data.type, data.details, 'count:', hlsErrorCount);
          if (hlsErrorCount <= 2 && data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            try { hls?.recoverMediaError(); } catch (e) {}
          } else if (hlsErrorCount <= 2 && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            try { hls?.startLoad(-1); } catch (e) {}
          } else if (!directFallbackStarted) {
            directFallbackStarted = true;
            console.warn('[VodPlayerModal] Falling back to direct video element src:', activeStreamUrl);
            try {
              hls?.destroy();
            } catch (e) {}
            hlsRef.current = null;
            if (video) {
              video.src = activeStreamUrl || rawActiveStreamUrl;
              if (isPlaying && isCurrentPlayback()) {
                video.play().catch(err => {
                  if (!isCurrentPlayback()) return;
                  console.warn('[VodPlayerModal] Direct video play failed, trying raw URL fallback:', err);
                  if (video && rawActiveStreamUrl && rawActiveStreamUrl !== activeStreamUrl) {
                    video.src = rawActiveStreamUrl;
                    video.play().catch(() => {
                      if (!isCurrentPlayback()) return;
                      setIsPlaying(false);
                      const failKey = `${vodId}__${resolvedEpisodeIndex}__${activeStreamUrl}`;
                      if (failedPlaybackKeyRef.current !== failKey) {
                        failedPlaybackKeyRef.current = failKey;
                        onPlaybackFailedRef.current?.(activeVodRef.current);
                      }
                    });
                  } else {
                    if (!isCurrentPlayback()) return;
                    setIsPlaying(false);
                    const failKey = `${vodId}__${resolvedEpisodeIndex}__${activeStreamUrl}`;
                    if (failedPlaybackKeyRef.current !== failKey) {
                      failedPlaybackKeyRef.current = failKey;
                      onPlaybackFailedRef.current?.(activeVodRef.current);
                    }
                  }
                });
              }
            }
          }
        }
      });

      return () => {
        effectActive = false;
        if (hlsRef.current) {
          try {
            hlsRef.current.stopLoad();
            hlsRef.current.detachMedia();
            hlsRef.current.destroy();
          } catch (e) {}
          hlsRef.current = null;
        }
        if (video && video.hasAttribute('src')) {
          try {
            video.pause();
            video.removeAttribute('src');
            video.load();
          } catch (e) {}
        }
      };
    } else {
      video.src = activeStreamUrl || rawActiveStreamUrl;
      if (shouldAutoPlayRef.current && !waitingForPromptRef.current) {
        video.play().then(() => {
          if (isCurrentPlayback()) setIsPlaying(true);
        }).catch(() => {
          if (isCurrentPlayback()) setIsPlaying(false);
        });
      } else {
        video.pause();
      }
      return () => {
        effectActive = false;
        if (!isLive) {
          flushCurrentProgress(true);
        }
        if (video) {
          try {
            video.pause();
            video.removeAttribute('src');
            video.load();
          } catch (e) {}
        }
      };
    }
  }, [activeStreamUrl, resolvedEpisodeIndex, vodId, isLive]);

  // Forward subtitle style customization to native Android Media3 player when active
  useEffect(() => {
    if (isLive || !isNativeActive) return;
    const native = typeof window !== 'undefined' ? (window as any).AchourNative : null;
    if (!native || typeof native.setSubtitleStyle !== 'function') return;
    const sizeMap: Record<'sm' | 'md' | 'lg' | 'xl', number> = {
      sm: 14,
      md: 18,
      lg: 24,
      xl: 30
    };
    try {
      native.setSubtitleStyle(sizeMap[subFontSize] || 22, subColor, subBg);
    } catch (e) {}
  }, [isLive, isNativeActive, subFontSize, subColor, subBg]);

  // 2. Video Events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateResolutionMeta = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setRealResolution(`${video.videoWidth}x${video.videoHeight}`);
      }
    };

    const applyPendingSeek = () => {
      const targetSeek = pendingSeekSecRef.current;
      if (targetSeek <= 0) return;
      if (video.readyState < 1) return;
      const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      const clamped = dur > 0 ? Math.min(targetSeek, Math.max(0, dur - 1)) : targetSeek;
      try {
        seekLockUntilRef.current = Date.now() + 1200;
        video.currentTime = clamped;
        livePlaybackPosRef.current = clamped;
        setCurrentTime(clamped);
        pendingSeekSecRef.current = 0;
      } catch {}
    };

    const handleLoadedMetaData = () => {
      const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      if (dur > 0) {
        livePlaybackDurRef.current = dur;
        setDuration(dur);
      }
      updateResolutionMeta();
      applyPendingSeek();

      const tracks: SubtitleTrackOption[] = [];
      for (let i = 0; i < video.textTracks.length; i++) {
        const track = video.textTracks[i];
        tracks.push({
          id: i,
          name: formatLanguageLabel(track.language || track.label, i, 'subtitle'),
          lang: track.language || '',
          mode: track.mode
        });
      }
      if (tracks.length > 0) {
        setSubtitles(tracks);
      }
    };

    video.addEventListener('resize', updateResolutionMeta);

    const handleTimeUpdate = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        livePlaybackDurRef.current = video.duration;
      }
      if (!isSeeking && Date.now() > seekLockUntilRef.current) {
        livePlaybackPosRef.current = video.currentTime;
        setCurrentTime(video.currentTime);
        const curSec = Math.floor(video.currentTime);
        if (
          !isLive &&
          !waitingForPromptRef.current &&
          curSec >= 4 &&
          Math.abs(curSec - lastSavedProgressSecRef.current) >= 4
        ) {
          flushCurrentProgress(false, video.currentTime, video.duration || 0);
        }
      }

      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };

    const handlePause = () => {
      if (!isLive && !waitingForPromptRef.current) {
        flushCurrentProgress(true);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      if (!isLive && progressTargetRef.current) {
        markVodCompleted({
          mediaType: progressTargetRef.current.mediaType,
          playlistId: progressTargetRef.current.playlistId,
          streamId: progressTargetRef.current.streamId,
          seriesId: progressTargetRef.current.seriesId,
          episodeId: progressTargetRef.current.episodeId,
          seasonNum: progressTargetRef.current.seasonNum,
          episodeNum: progressTargetRef.current.episodeNum,
          episodeTitle: progressTargetRef.current.episodeTitle,
          durationSec: video.duration || livePlaybackDurRef.current,
          legacyEpisodeIndex: progressTargetRef.current.legacyEpisodeIndex
        });
      }
      if (isSeries && resolvedEpisodeIndex < (vodEpisodes.length - 1)) {
        handleNextEpisode();
      }
    };

    const handlePlaying = () => {
      if (!activeStreamUrl) return;
      updateResolutionMeta();
      applyPendingSeek();
      const playKey = `${vodId}__${resolvedEpisodeIndex}__${activeStreamUrl}`;
      if (startedPlaybackKeyRef.current !== playKey) {
        startedPlaybackKeyRef.current = playKey;
        onPlaybackStartedRef.current?.(activeVodRef.current);
      }
    };

    const handleCanPlay = () => {
      updateResolutionMeta();
      applyPendingSeek();
    };

    const handleVideoError = () => {
      if (!activeStreamUrl || !video.getAttribute('src')) return;
      if (hlsRef.current) return; // HLS handles retries & fallback before reporting fatal failure
      const failKey = `${vodId}__${resolvedEpisodeIndex}__${activeStreamUrl}`;
      if (failedPlaybackKeyRef.current !== failKey) {
        failedPlaybackKeyRef.current = failKey;
        onPlaybackFailedRef.current?.(activeVodRef.current);
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetaData);
    video.addEventListener('loadeddata', updateResolutionMeta);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('error', handleVideoError);

    return () => {
      video.removeEventListener('resize', updateResolutionMeta);
      video.removeEventListener('loadedmetadata', handleLoadedMetaData);
      video.removeEventListener('loadeddata', updateResolutionMeta);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('error', handleVideoError);
    };
  }, [isSeeking, isSeries, isLive, resolvedEpisodeIndex, vodEpisodes.length, vodId, isRtl, activeStreamUrl, flushCurrentProgress]);

  // 3. Auto-Next Countdown
  useEffect(() => {
    if (!showAutoNextPrompt) return;

    if (autoNextCountdown <= 0) {
      handleNextEpisode();
      setShowAutoNextPrompt(false);
      return;
    }

    autoNextTimeoutRef.current = setTimeout(() => {
      setAutoNextCountdown((prev) => prev - 1);
    }, 1000);

    return () => {
      if (autoNextTimeoutRef.current) clearTimeout(autoNextTimeoutRef.current);
    };
  }, [showAutoNextPrompt, autoNextCountdown]);

  // 4. Sleep Timer
  useEffect(() => {
    if (sleepTimerMinutes === null) {
      setSleepTimerTimeLeft(null);
      return;
    }

    setSleepTimerTimeLeft(sleepTimerMinutes * 60);
    const interval = setInterval(() => {
      setSleepTimerTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          const native = typeof window !== 'undefined' ? (window as any).AchourNative : null;
          if (isNativeApp() && native) {
            try { native.pause(); } catch (e) {}
            setIsPlaying(false);
          } else if (videoRef.current) {
            videoRef.current.pause();
            setIsPlaying(false);
          }
          setSleepTimerMinutes(null);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [sleepTimerMinutes]);

  const focusLiveBarButton = useCallback((preferred?: string) => {
    if (isPreview || !isLive) return;
    requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      const liveItems = Array.from(
        container.querySelectorAll<HTMLElement>('[data-tv-live-item]')
      ).filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);
      if (liveItems.length === 0) return;
      const cur = getCurrentTVFocus();
      if (!preferred && cur && liveItems.includes(cur)) return;
      const preferredEl = preferred
        ? container.querySelector<HTMLElement>(`[data-tv-live-item="${preferred}"]`)
        : container.querySelector<HTMLElement>('[data-tv-live-item="fav"]');
      setTVFocus((preferredEl && liveItems.includes(preferredEl) ? preferredEl : liveItems[0]) || null, { scroll: false });
    });
  }, [isPreview, isLive]);

    // 5. Controls Auto-Hide
  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);

    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }

    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying && activePopup === 'none' && !showResumePrompt && !showAutoNextPrompt) {
        setShowControls(false);
        setLiveFocusMode('channel');
        const cur = getCurrentTVFocus();
        if (cur && containerRef.current?.contains(cur)) {
          clearTVFocus();
          if (typeof cur.blur === 'function') cur.blur();
        }
      }
    }, 5500);
  }, [isPlaying, activePopup, showResumePrompt, showAutoNextPrompt, isLive]);
  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying, activePopup, isPreview, isLive, resetControlsTimeout, focusLiveBarButton]);
  
  // Auto-focus Resume / Auto-Next prompt buttons for TV Remote D-Pad
  useEffect(() => {
    if (isPreview || (!showResumePrompt && !showAutoNextPrompt)) return;
    const timer = setTimeout(() => {
      const btn = containerRef.current?.querySelector<HTMLElement>('[data-tv-prompt-btn="true"]');
      if (btn) {
        setTVFocus(btn, { scroll: false });
      }
    }, 45);
    return () => clearTimeout(timer);
  }, [isPreview, showResumePrompt, showAutoNextPrompt]);

  // Actions
  const togglePlayPause = () => {
    const native = typeof window !== 'undefined' ? (window as any).AchourNative : null;
    const isNative = isNativeApp() && !!native;

    if (isLive) {
      if (showControls) {
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        setShowControls(false);
        setLiveFocusMode('channel');
        const cur = getCurrentTVFocus();
        if (cur && containerRef.current?.contains(cur)) {
          clearTVFocus();
          if (typeof cur.blur === 'function') cur.blur();
        }
      } else {
        resetControlsTimeout();
        setLiveFocusMode('bar');
        focusLiveBarButton();
      }
      return;
    }

    if (isNative && native) {
      if (isPlaying) {
        flushCurrentProgress(true);
        native.pause();
        setIsPlaying(false);
        setShowControls(true);
      } else {
        shouldAutoPlayRef.current = true;
        native.play();
        setIsPlaying(true);
        resetControlsTimeout();
      }
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      flushCurrentProgress(true);
      video.pause();
      setIsPlaying(false);
      setShowControls(true);
    } else {
      shouldAutoPlayRef.current = true;
      video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      resetControlsTimeout();
    }
  };

  const toggleMute = () => {
    const native = typeof window !== 'undefined' ? (window as any).AchourNative : null;
    const isNative = isNativeApp() && !!native;
    if (isNative && native) {
      setIsMuted(!isMuted);
      native.setVolume(isMuted ? 1.0 : 0.0);
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleSeekChange = (newTime: number) => {
    seekLockUntilRef.current = Date.now() + 1000;
    livePlaybackPosRef.current = newTime;
    const native = typeof window !== 'undefined' ? (window as any).AchourNative : null;
    const isNative = isNativeApp() && !!native;
    if (isNative && native) {
      native.seekTo(Math.round(newTime * 1000));
      setCurrentTime(newTime);
      if (!isLive && !waitingForPromptRef.current && newTime >= 4) {
        flushCurrentProgress(false, newTime, duration);
      }
      resetControlsTimeout();
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = newTime;
    setCurrentTime(newTime);
    if (!isLive && !waitingForPromptRef.current && newTime >= 4) {
      flushCurrentProgress(false, newTime, video.duration || duration);
    }
    resetControlsTimeout();
  };

  const handleSkipTime = (seconds: number) => {
    const native = typeof window !== 'undefined' ? (window as any).AchourNative : null;
    const isNative = isNativeApp() && !!native;
    const curPos = isNative && native ? currentTime : (videoRef.current ? videoRef.current.currentTime : currentTime);
    const maxDur = duration || (videoRef.current ? videoRef.current.duration : 0) || 0;
    const target = Math.max(0, Math.min(maxDur > 0 ? maxDur : curPos + Math.abs(seconds) + 3600, curPos + seconds));

    seekLockUntilRef.current = Date.now() + 1050;
    livePlaybackPosRef.current = target;
    setCurrentTime(target);

    if (isNative && native) {
      try {
        native.seekTo(Math.round(target * 1000));
      } catch (e) {}
    } else if (videoRef.current) {
      const wasPlaying = isPlaying || !videoRef.current.paused;
      try {
        videoRef.current.currentTime = target;
        if (wasPlaying && videoRef.current.paused) {
          videoRef.current.play().catch(() => {});
        }
      } catch (e) {}
    }

    if (!isLive && !waitingForPromptRef.current && target >= 4) {
      flushCurrentProgress(false, target, maxDur);
    }

    const formattedTarget = formatTime(target);
    const directionText = seconds > 0 ? `+${Math.abs(seconds)}s ⏩` : `-${Math.abs(seconds)}s ⏪`;
    setSeekNotice(`${directionText} (${formattedTarget})`);

    if (seekNoticeTimeoutRef.current) {
      clearTimeout(seekNoticeTimeoutRef.current);
    }
    seekNoticeTimeoutRef.current = setTimeout(() => {
      setSeekNotice(null);
    }, 1200);

    resetControlsTimeout();
  };

  const handleSelectAudioTrack = (trackId: number) => {
    const native = typeof window !== 'undefined' ? (window as any).AchourNative : null;
    if (isNativeApp() && native) {
      try { native.setAudioTrack(trackId); } catch (e) {}
      setSelectedAudioTrack(trackId);
      setActivePopup('none');
      return;
    }
    if (hlsRef.current) {
      hlsRef.current.audioTrack = trackId;
      setSelectedAudioTrack(trackId);
    }
    setActivePopup('none');
  };

  const handleSelectQuality = (qualityId: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = qualityId;
      setSelectedQuality(qualityId);
    }
    setActivePopup('none');
  };

  const handleSelectSubtitle = (subId: number) => {
    const native = typeof window !== 'undefined' ? (window as any).AchourNative : null;
    if (isNativeApp() && native) {
      try { native.setSubtitleTrack(subId); } catch (e) {}
      setSelectedSubtitle(subId);
      setActivePopup('none');
      return;
    }
    const video = videoRef.current;
    if (!video) return;

    for (let i = 0; i < video.textTracks.length; i++) {
      video.textTracks[i].mode = i === subId ? 'showing' : 'disabled';
    }
    setSelectedSubtitle(subId);
    setActivePopup('none');
  };

  const handleSubSyncChange = (delta: number) => {
    const video = videoRef.current;
    setSubSyncOffset((prev) => {
      const next = parseFloat((prev + delta).toFixed(1));
      if (video) {
        for (let i = 0; i < video.textTracks.length; i++) {
          const track = video.textTracks[i];
          if (track.cues) {
            for (let j = 0; j < track.cues.length; j++) {
              const cue = track.cues[j] as VTTCue;
              cue.startTime += delta;
              cue.endTime += delta;
            }
          }
        }
      }
      return next;
    });
  };

  const handleResumeConfirm = (resume: boolean) => {
    waitingForPromptRef.current = false;
    shouldAutoPlayRef.current = true;
    setShowResumePrompt(false);

    const native = typeof window !== 'undefined' ? (window as any).AchourNative : null;
    if (isNativeApp() && native) {
      if (resume && savedResumeTime > 0) {
        seekLockUntilRef.current = Date.now() + 1200;
        livePlaybackPosRef.current = savedResumeTime;
        try { native.seekTo(Math.round(savedResumeTime * 1000)); } catch (e) {}
        setCurrentTime(savedResumeTime);
      } else {
        if (progressTargetRef.current) {
          clearVodProgress({
            mediaType: progressTargetRef.current.mediaType,
            playlistId: progressTargetRef.current.playlistId,
            streamId: progressTargetRef.current.streamId,
            seriesId: progressTargetRef.current.seriesId,
            episodeId: progressTargetRef.current.episodeId,
            legacyEpisodeIndex: progressTargetRef.current.legacyEpisodeIndex
          });
        }
        livePlaybackPosRef.current = 0;
        try { native.seekTo(0); } catch (e) {}
        setCurrentTime(0);
      }
      try { native.play(); } catch (e) {}
      setIsPlaying(true);
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    if (resume && savedResumeTime > 0) {
      seekLockUntilRef.current = Date.now() + 1200;
      livePlaybackPosRef.current = savedResumeTime;
      setCurrentTime(savedResumeTime);
      if (video.readyState >= 1) {
        const clamped = Number.isFinite(video.duration) && video.duration > 0
          ? Math.min(savedResumeTime, Math.max(0, video.duration - 1))
          : savedResumeTime;
        video.currentTime = clamped;
        pendingSeekSecRef.current = 0;
      } else {
        pendingSeekSecRef.current = savedResumeTime;
      }
    } else {
      pendingSeekSecRef.current = 0;
      livePlaybackPosRef.current = 0;
      if (video.readyState >= 1) {
        video.currentTime = 0;
      }
      setCurrentTime(0);
      if (progressTargetRef.current) {
        clearVodProgress({
          mediaType: progressTargetRef.current.mediaType,
          playlistId: progressTargetRef.current.playlistId,
          streamId: progressTargetRef.current.streamId,
          seriesId: progressTargetRef.current.seriesId,
          episodeId: progressTargetRef.current.episodeId,
          legacyEpisodeIndex: progressTargetRef.current.legacyEpisodeIndex
        });
      }
    }
    video.play().then(() => setIsPlaying(true)).catch(() => {});
  };

  const handleNextEpisode = () => {
    if (isSeries && resolvedEpisodeIndex < vodEpisodes.length - 1) {
      flushCurrentProgress(true);
      if (onSelectEpisode) {
        onSelectEpisode(resolvedEpisodeIndex + 1);
      } else if (onSelectMedia && vodEpisodes[resolvedEpisodeIndex + 1]) {
        onSelectMedia(vodEpisodes[resolvedEpisodeIndex + 1]);
      }
      setShowAutoNextPrompt(false);
    }
  };

  const handlePrevEpisode = () => {
    if (isSeries && resolvedEpisodeIndex > 0) {
      flushCurrentProgress(true);
      if (onSelectEpisode) {
        onSelectEpisode(resolvedEpisodeIndex - 1);
      } else if (onSelectMedia && vodEpisodes[resolvedEpisodeIndex - 1]) {
        onSelectMedia(vodEpisodes[resolvedEpisodeIndex - 1]);
      }
    }
  };

  const handlePrevChannel = () => {
    if (itemsList && itemsList.length > 0) {
      const curIdx = itemsList.findIndex((ch: any) => String(ch.stream_id || ch.id) === String(activeVod.stream_id || activeVod.id));
      if (curIdx > 0) {
        if (onSelectMedia) onSelectMedia(itemsList[curIdx - 1]);
      } else if (curIdx === 0) {
        if (onSelectMedia) onSelectMedia(itemsList[itemsList.length - 1]);
      }
      resetControlsTimeout();
    }
  };

  const handleNextChannel = () => {
    if (itemsList && itemsList.length > 0) {
      const curIdx = itemsList.findIndex((ch: any) => String(ch.stream_id || ch.id) === String(activeVod.stream_id || activeVod.id));
      if (curIdx >= 0 && curIdx < itemsList.length - 1) {
        if (onSelectMedia) onSelectMedia(itemsList[curIdx + 1]);
      } else if (curIdx === itemsList.length - 1) {
        if (onSelectMedia) onSelectMedia(itemsList[0]);
      }
      resetControlsTimeout();
    }
  };

  // Register pushBackHandler for TV remote and Android Phone back button (single source of truth for BACK)
  useEffect(() => {
    if (isPreview) return; // No back handler in preview mode
    const unregister = pushBackHandler(() => {
      if (showResumePrompt) {
        handleResumeConfirm(false);
        return true;
      }
      if (showAutoNextPrompt) {
        setShowAutoNextPrompt(false);
        return true;
      }
      if (activePopup !== 'none') {
        setActivePopup('none');
        if (lastFocusedElementRef.current && document.body.contains(lastFocusedElementRef.current)) {
          setTVFocus(lastFocusedElementRef.current);
        }
        return true;
      }
      // For VOD/Series, only dismiss controls bar on Back if the user explicitly focused inside the control bar;
      // otherwise Back exits fullscreen playback immediately (0 extra Back press!)
      if (showControls && (isLive ? liveFocusMode === 'bar' : vodFocusMode === 'bar')) {
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        setShowControls(false);
        setLiveFocusMode('channel');
        setVodFocusMode('playback');
        const cur = getCurrentTVFocus();
        if (cur && containerRef.current?.contains(cur)) {
          clearTVFocus();
          if (typeof cur.blur === 'function') cur.blur();
        }
        return true;
      }
      handleCloseWithSave();
      return true;
    }, BackPriority.PLAYER);

    return unregister;
  }, [isPreview, showResumePrompt, showAutoNextPrompt, activePopup, showControls, isLive, liveFocusMode, vodFocusMode, handleCloseWithSave]);


  // D-Pad Remote Navigation Key Handler (no BACK duplication — App.tsx routes BACK via pushBackHandler)
  useEffect(() => {
    if (isPreview) return; // No remote navigation in preview mode
    const handleKeyDown = (e: KeyboardEvent) => {
      const action = parseTVKeyEvent(e);
      if (action === 'BACK') return;

      const now = Date.now();
      if (e.repeat && now - lastKeyTimeRef.current < 38) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      lastKeyTimeRef.current = now;

      // Resume / Auto-Next prompt D-Pad navigation
      if (showResumePrompt || showAutoNextPrompt) {
        resetControlsTimeout();
        const promptButtons = Array.from(
          containerRef.current?.querySelectorAll<HTMLElement>('[data-tv-prompt-btn="true"]') || []
        ).filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);
        const cur = getCurrentTVFocus();
        if (action === 'LEFT' || action === 'RIGHT' || action === 'UP' || action === 'DOWN') {
          e.preventDefault();
          e.stopPropagation();
          if (promptButtons.length > 0) {
            const idx = cur ? promptButtons.indexOf(cur) : -1;
            const delta = (action === 'RIGHT' || action === 'DOWN') ? 1 : -1;
            const nextIdx = idx >= 0 ? (idx + delta + promptButtons.length) % promptButtons.length : 0;
            setTVFocus(promptButtons[nextIdx]);
          }
          return;
        }
        if (action === 'SELECT') {
          e.preventDefault();
          e.stopPropagation();
          if (e.repeat || isLongPressModalGraceActive()) return;
          if (cur && cur.tagName === 'BUTTON') cur.click();
          else promptButtons[0]?.click();
          return;
        }
      }

      // Remote Color Keys
      if (action === 'RED' || e.key === 'r' || e.key === 'Red' || e.keyCode === 403) {
        if (!isLive && audioTracks.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          resetControlsTimeout();
          setActivePopup(prev => prev === 'audio' ? 'none' : 'audio');
        }
        return;
      }
      if (action === 'GREEN' || e.key === 'g' || e.key === 'Green' || e.keyCode === 404) {
        if (!isLive) {
          e.preventDefault();
          e.stopPropagation();
          resetControlsTimeout();
          setActivePopup(prev => prev === 'subtitles' ? 'none' : 'subtitles');
        }
        return;
      }
      if (action === 'YELLOW' || e.key === 'y' || e.key === 'Yellow' || e.keyCode === 405) {
        if (!isLive && hlsQualities.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          resetControlsTimeout();
          setActivePopup(prev => prev === 'quality' ? 'none' : 'quality');
        }
        return;
      }
      if (action === 'BLUE' || e.key === 'b' || e.key === 'Blue' || e.keyCode === 406) {
        e.preventDefault();
        e.stopPropagation();
        resetControlsTimeout();
        setActivePopup(prev => prev === 'aspect' ? 'none' : 'aspect');
        return;
      }

      // Dedicated Media Transport Keys (Fire TV Rewind / FastForward / PlayPause)
      if (!isLive) {
        if (action === 'FAST_FORWARD' || e.key === 'MediaFastForward' || e.keyCode === 90 || e.keyCode === 228) {
          e.preventDefault();
          e.stopPropagation();
          handleSkipTime(seekStepSeconds);
          return;
        }
        if (action === 'REWIND' || e.key === 'MediaRewind' || e.keyCode === 89 || e.keyCode === 227) {
          e.preventDefault();
          e.stopPropagation();
          handleSkipTime(-seekStepSeconds);
          return;
        }
        if (action === 'PLAY_PAUSE' || e.key === 'MediaPlayPause' || e.keyCode === 85) {
          e.preventDefault();
          e.stopPropagation();
          togglePlayPause();
          return;
        }
      }

      // Live TV Dedicated Zapping Keys
      if (isLive) {
        if (action === 'CHANNEL_UP') {
          e.preventDefault();
          e.stopPropagation();
          setLiveFocusMode('channel');
          handlePrevChannel();
          return;
        }
        if (action === 'CHANNEL_DOWN') {
          e.preventDefault();
          e.stopPropagation();
          setLiveFocusMode('channel');
          handleNextChannel();
          return;
        }
      }

      // If a popup (Audio, Subtitles, Aspect, Episodes) is active, navigate inside the popup
      if (activePopup !== 'none') {
        resetControlsTimeout();
        const popupEl = containerRef.current?.querySelector('.vod-popup-container, .vod-drawer-container');
        if (popupEl) {
          const focusableItems = Array.from(
            popupEl.querySelectorAll<HTMLElement>('button, [tabindex="0"]')
          ).filter(el => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');

          if (focusableItems.length > 0) {
            const cur = getCurrentTVFocus();
            const activeIdx = cur ? focusableItems.indexOf(cur) : -1;

            if (action === 'DOWN' || action === 'RIGHT') {
              e.preventDefault();
              e.stopPropagation();
              const nextIdx = activeIdx < focusableItems.length - 1 ? activeIdx + 1 : 0;
              setTVFocus(focusableItems[nextIdx]);
            } else if (action === 'UP' || action === 'LEFT') {
              e.preventDefault();
              e.stopPropagation();
              const prevIdx = activeIdx > 0 ? activeIdx - 1 : focusableItems.length - 1;
              setTVFocus(focusableItems[prevIdx]);
            } else if (action === 'SELECT') {
              e.preventDefault();
              e.stopPropagation();
              if (e.repeat || isLongPressModalGraceActive()) return;
              if (cur && focusableItems.includes(cur)) {
                cur.click();
              } else {
                focusableItems[0]?.click();
              }
            }
          }
        }
        return;
      }

      const currentActive = getCurrentTVFocus();
      // LIVE TV REMOTE NAVIGATION
      if (isLive) {
        const liveItems = Array.from(
          containerRef.current?.querySelectorAll<HTMLElement>('[data-tv-live-item]') || []
        ).filter(el => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');

        const currentItem =
          currentActive && liveItems.includes(currentActive)
            ? currentActive
            : null;

        // الفيديو هو موضع التركيز: يمين ويسار لتبديل القنوات
        if (liveFocusMode !== 'bar') {
          if (action === 'LEFT' || action === 'RIGHT') {
            e.preventDefault();
            e.stopPropagation();

            if (action === 'LEFT') {
              handlePrevChannel();
            } else {
              handleNextChannel();
            }

            setLiveFocusMode('channel');
            return;
          }

          // DOWN يُظهر الشريط وينقل التركيز إليه
          if (action === 'DOWN') {
            e.preventDefault();
            e.stopPropagation();
            setShowControls(true);
            setLiveFocusMode('bar');
            resetControlsTimeout();
            focusLiveBarButton();
            return;
          }

          // OK يُظهر الشريط وينقل التركيز إليه
          if (action === 'SELECT') {
            e.preventDefault();
            e.stopPropagation();
            setShowControls(true);
            setLiveFocusMode('bar');
            resetControlsTimeout();
            focusLiveBarButton();
            return;
          }

          return;
        }

        // التركيز داخل الشريط: يمين ويسار للتنقل بين عناصره
        if (action === 'LEFT' || action === 'RIGHT') {
          e.preventDefault();
          e.stopPropagation();
          resetControlsTimeout();

          if (liveItems.length > 0) {
            const currentIndex = currentItem ? liveItems.indexOf(currentItem) : -1;
            const direction = action === 'RIGHT' ? 1 : -1;
            const nextIndex =
              currentIndex < 0
                ? 0
                : (currentIndex + direction + liveItems.length) % liveItems.length;

            setTVFocus(liveItems[nextIndex], { scroll: false });
          }
          return;
        }

        // UP يرجع للمشاهدة ويخفي الشريط
        if (action === 'UP') {
          e.preventDefault();
          e.stopPropagation();

          if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
          }

          setShowControls(false);
          setLiveFocusMode('channel');
          clearTVFocus();
          return;
        }

        // DOWN يبقى ضمن عناصر الشريط
        if (action === 'DOWN') {
          e.preventDefault();
          e.stopPropagation();
          resetControlsTimeout();

          if (liveItems.length > 0) {
            const currentIndex = currentItem ? liveItems.indexOf(currentItem) : -1;
            const nextIndex =
              currentIndex < 0 ? 0 : (currentIndex + 1) % liveItems.length;

            setTVFocus(liveItems[nextIndex], { scroll: false });
          }
          return;
        }

        // OK ينفذ العنصر المحدد
        if (action === 'SELECT') {
          e.preventDefault();
          e.stopPropagation();
          if (e.repeat) return;
          resetControlsTimeout();

          if (currentItem && currentItem.tagName === 'BUTTON') {
            currentItem.click();
          } else {
            focusLiveBarButton();
          }
          return;
        }

        return;
      }
      
      // VOD & Series: separate playback seeking from control-bar navigation
      resetControlsTimeout();

      // Playback mode: LEFT/RIGHT always seek, even if controls are visible
      if (vodFocusMode === 'playback' || !showControls) {
        if (action === 'RIGHT') {
          e.preventDefault();
          e.stopPropagation();
          handleSkipTime(seekStepSeconds);
          return;
        }

        if (action === 'LEFT') {
          e.preventDefault();
          e.stopPropagation();
          handleSkipTime(-seekStepSeconds);
          return;
        }

        if (action === 'SELECT') {
          e.preventDefault();
          e.stopPropagation();
          togglePlayPause();
          return;
        }

        if (action === 'DOWN') {
          e.preventDefault();
          e.stopPropagation();
          setVodFocusMode('bar');
          setShowControls(true);
          requestAnimationFrame(() => {
            const playBtn = containerRef.current?.querySelector<HTMLElement>(
              '.vod-bottom-play-btn, [data-tv-vod-item]'
            );
            setTVFocus(playBtn || null, { scroll: false });
          });
          return;
        }
      }

      // Control-bar mode: LEFT/RIGHT navigate between controls only
      const vodItems = Array.from(
        containerRef.current?.querySelectorAll<HTMLElement>('[data-tv-vod-item]') || []
      ).filter(el => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');

      if (action === 'UP') {
        e.preventDefault();
        e.stopPropagation();
        setVodFocusMode('playback');
        setShowControls(false);
        setTVFocus(null);
        return;
      }

      if (action === 'RIGHT') {
        e.preventDefault();
        e.stopPropagation();
        if (vodItems.length > 0) {
          const curIdx = currentActive ? vodItems.indexOf(currentActive) : -1;
          const nextIdx = curIdx >= 0 ? (curIdx + 1) % vodItems.length : 0;
          setTVFocus(vodItems[nextIdx]);
        }
      } else if (action === 'LEFT') {
        e.preventDefault();
        e.stopPropagation();
        if (vodItems.length > 0) {
          const curIdx = currentActive ? vodItems.indexOf(currentActive) : -1;
          const prevIdx = curIdx > 0 ? curIdx - 1 : vodItems.length - 1;
          setTVFocus(vodItems[prevIdx]);
        }
      } else if (action === 'DOWN') {
        e.preventDefault();
        e.stopPropagation();
        if (vodItems.length > 0 && (!currentActive || !vodItems.includes(currentActive))) {
          const playBtn = containerRef.current?.querySelector<HTMLElement>('.vod-bottom-play-btn') || vodItems[0];
          setTVFocus(playBtn);
        }
      } else if (action === 'SELECT') {
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) return;
        if (currentActive && currentActive.tagName === 'BUTTON' && vodItems.includes(currentActive)) {
          currentActive.click();
        } else {
          togglePlayPause();
        }
      }

          };
        window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isPreview, showControls, liveFocusMode, vodFocusMode, activePopup, showResumePrompt, showAutoNextPrompt, isPlaying, duration, isLive, seekStepSeconds, audioTracks.length, hlsQualities.length, resetControlsTimeout, focusLiveBarButton, handlePrevChannel, handleNextChannel]);

  const openPopup = (type: ActivePopup, triggerEl?: HTMLElement | null) => {
    if (triggerEl) {
      lastFocusedElementRef.current = triggerEl;
    }
    popupOpenedAtRef.current = Date.now();
    popupBackdropDownRef.current = false;
    markLongPressModalOpened(550);
    setActivePopup(type);
    setShowControls(true);

    requestAnimationFrame(() => {
      const popup = containerRef.current?.querySelector('.vod-popup-container, .vod-drawer-container');
      const firstBtn = popup?.querySelector<HTMLElement>('button, [tabindex="0"]');
      if (firstBtn) setTVFocus(firstBtn, { scroll: false });
    });
  };

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const pad = (num: number) => num.toString().padStart(2, '0');

    if (hrs > 0) {
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  };

  const getAspectRatioClass = () => {
    switch (aspectRatio) {
      case 'fill':
        return 'object-cover w-full h-full';
      case 'zoom':
        return 'object-none scale-125 w-full h-full';
      case '16:9':
        return 'object-contain aspect-video w-full h-full';
      case '4:3':
        return 'object-contain aspect-[4/3] w-full h-full';
      case 'fit':
      default:
        return 'object-contain w-full h-full';
    }
  };

  useEffect(() => {
    return () => {
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
        tapTimeoutRef.current = null;
      }
    };
  }, []);

  const handlePlayerTap = (e: React.MouseEvent<HTMLElement>) => {
    if (isPreview) return;

    const rawTarget = e.target as HTMLElement | null;
    if (rawTarget?.closest('button, input, [role="button"], .vod-popup-container, .vod-drawer-container')) {
      return;
    }

    e.stopPropagation();

    const isTvSim = typeof window !== 'undefined' && window.location.search.includes('tvPreview=1');
    const hasTouch =
      typeof window !== 'undefined' &&
      (navigator.maxTouchPoints > 0 ||
        'ontouchstart' in window ||
        Boolean(window.matchMedia?.('(pointer: coarse)')?.matches));
    const isPhoneOrTouchPreview = !isTVDevice() && !isTvSim && (isMobileDevice() || hasTouch || !isNativeApp());

    if (isLive && isPhoneOrTouchPreview) {
      // Read bounding box and coordinates synchronously before setTimeout (React clears e.currentTarget asynchronously)
      const hostEl = containerRef.current || e.currentTarget;
      const rect = hostEl && hostEl.isConnected ? hostEl.getBoundingClientRect() : null;
      const width = rect && rect.width > 0 ? rect.width : window.innerWidth;
      const clickX = rect ? e.clientX - rect.left : e.clientX;
      const isRightHalf = clickX >= width / 2;

      const now = Date.now();
      const timeDiff = now - lastTapTimeRef.current;

      if (timeDiff > 0 && timeDiff < 320) {
        if (tapTimeoutRef.current) {
          clearTimeout(tapTimeoutRef.current);
          tapTimeoutRef.current = null;
        }
        lastTapTimeRef.current = 0;
        handleCloseWithSave();
        return;
      }

      lastTapTimeRef.current = now;
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
      }

      tapTimeoutRef.current = setTimeout(() => {
        tapTimeoutRef.current = null;
        lastTapTimeRef.current = 0;
        if (isRightHalf) {
          handleNextChannel();
        } else {
          handlePrevChannel();
        }
      }, 320);
    } else {
      togglePlayPause();
    }
  };

  const playerJSX = (
    <div
      ref={containerRef}
      data-vod-native-active={isNativeActive ? 'true' : undefined}
      style={
        isPreview
          ? previewBox
            ? {
                left: `${previewBox.left}px`,
                top: `${previewBox.top}px`,
                width: `${previewBox.width}px`,
                height: `${previewBox.height}px`
              }
            : { left: 0, top: 0, width: 1, height: 1, opacity: 0 }
          : undefined
      }
      className={`${
        isPreview
          ? 'fixed z-20 rounded-2xl pointer-events-none'
          : 'fixed inset-0 z-[9999]'
      } ${isNativeActive ? 'bg-transparent' : 'bg-black'} flex items-center justify-center overflow-hidden select-none font-sans text-white outline-none border-0 ring-0 shadow-none`}
      onMouseMove={isPreview ? undefined : resetControlsTimeout}
    >

      {/* 1. Main Video Container */}
      <div
        className={`relative w-full h-full flex items-center justify-center touch-manipulation ${isNativeActive ? 'bg-transparent' : 'bg-black'} outline-none border-0 ring-0 shadow-none`}
        style={{ touchAction: 'manipulation' }}
        onClick={handlePlayerTap}
      >
        <video
          ref={videoRef}
          style={isNativeActive ? { backgroundColor: 'transparent', touchAction: 'manipulation' } : { backgroundColor: '#000000', touchAction: 'manipulation' }}
          poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
          className={isNativeActive ? 'hidden' : `outline-none border-0 ring-0 shadow-none ${getAspectRatioClass()}`}
          playsInline
          crossOrigin="anonymous"
          onClick={handlePlayerTap}
        >
          {!isNativeActive && !isLive && externalSubtitles.map((sub, i) => (
            <track
              key={sub.url || i}
              kind="subtitles"
              src={sub.url}
              srcLang={sub.lang || 'ar'}
              label={sub.label}
            />
          ))}
        </video>

        <style>{`
          video::cue {
            font-size: ${
              subFontSize === 'sm'
                ? '1rem'
                : subFontSize === 'md'
                ? '1.35rem'
                : subFontSize === 'lg'
                ? '1.8rem'
                : '2.4rem'
            } !important;
            color: ${subColor} !important;
            background-color: ${
              subBg === 'none'
                ? 'transparent'
                : subBg === 'black'
                ? 'rgba(0, 0, 0, 0.95)'
                : 'rgba(0, 0, 0, 0.65)'
            } !important;
            text-shadow: 0 2px 4px rgba(0,0,0,0.8);
            font-family: inherit;
          }
        `}</style>


        {/* 2. Sleep Timer Badge */}
        {sleepTimerTimeLeft !== null && !isPreview && showControls && (
          <div className="absolute top-4 left-4 z-40 achour-glass-modal px-3 py-1.5 rounded-full border-gold/40 text-gold flex items-center gap-2 text-xs font-sans font-normal tabular-nums">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span className="achour-glossy-info">إيقاف تلقائي: {formatTime(sleepTimerTimeLeft)}</span>
          </div>
        )}

        {/* 2b. Direct Seeking Overlay Badge (Movies & Series VOD) */}
        {seekNotice && !isPreview && (
          <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
            <div className="achour-glass-modal px-6 py-3.5 rounded-2xl border-2 border-gold flex items-center gap-3 text-lg font-sans font-semibold tabular-nums">
              <span className="achour-glossy-title">{seekNotice}</span>
            </div>
          </div>
        )}

        {/* 3. Auto-Next Episode Overlay */}
        {showAutoNextPrompt && !isPreview && (
          <div
            onPointerDown={(e) => {
              promptBackdropDownRef.current = e.target === e.currentTarget;
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (isSafeBackdropClick(e, promptOpenedAtRef.current, promptBackdropDownRef.current)) {
                setShowAutoNextPrompt(false);
              }
              promptBackdropDownRef.current = false;
            }}
            className="absolute inset-0 z-50 bg-black/65 achour-modal-backdrop flex items-center justify-center p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              data-achour-skip-tv-base="true"
              className="achour-glass-modal border-gold/40 rounded-2xl p-5 w-[min(92vw,560px)] max-h-[82vh] overflow-y-auto no-scrollbar text-center space-y-4"
            >
              <div className="w-12 h-12 bg-gold/10 text-gold rounded-full flex items-center justify-center mx-auto border border-gold/30">
                <Play className="w-6 h-6 fill-current mr-0.5" />
              </div>
              <h3 className="text-lg font-semibold achour-glossy-title">الحلقة التالية بعد {autoNextCountdown} ثوانٍ</h3>
              <p className="text-sm font-normal text-gray-200">
                {vodEpisodes[resolvedEpisodeIndex + 1]?.title || `الحلقة ${resolvedEpisodeIndex + 2}`}
              </p>
              <div className="flex items-center justify-center gap-3 pt-1">
                <button
                  onClick={handleNextEpisode}
                  data-tv-prompt-btn="true"
                  data-tv-focus-inset="true"
                  tabIndex={0}
                  className="px-6 py-2.5 rounded-xl achour-glossy-pill font-medium text-sm transition-transform active:scale-95"
                >
                  تشغيل الآن
                </button>
                <button
                  onClick={() => setShowAutoNextPrompt(false)}
                  data-tv-prompt-btn="true"
                  data-tv-focus-inset="true"
                  tabIndex={0}
                  className="px-5 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/15 text-gray-200 text-sm font-medium border border-white/15"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4. Resume Last Position Prompt (Movies & Series VOD Only - NEVER for Live TV) */}
        {!isLive && showResumePrompt && !isPreview && (
          <div
            onPointerDown={(e) => {
              promptBackdropDownRef.current = e.target === e.currentTarget;
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
            className="absolute inset-0 z-50 bg-black/65 achour-modal-backdrop flex items-center justify-center p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              data-achour-skip-tv-base="true"
              className="achour-glass-modal border-gold/40 rounded-2xl p-5 w-[min(92vw,560px)] max-h-[82vh] overflow-y-auto no-scrollbar text-center space-y-4"
            >
              <div className="w-12 h-12 bg-gold/10 text-gold rounded-full flex items-center justify-center mx-auto border border-gold/30">
                <RotateCcw className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold achour-glossy-title">{t('resume_watching')}</h3>
              <p className="text-sm font-normal text-gray-200">
                {isRtl ? 'هل ترغب في مواصلة العرض من الدقيقة' : 'Would you like to resume playback from'}{' '}
                <span className="achour-glossy-text font-sans font-medium tabular-nums">{formatTime(savedResumeTime)}</span>{isRtl ? '؟' : '?'}
              </p>
              <div className="flex items-center justify-center gap-3 pt-1">
                <button
                  onClick={() => handleResumeConfirm(true)}
                  data-tv-prompt-btn="true"
                  data-tv-focus-inset="true"
                  tabIndex={0}
                  className="px-6 py-2.5 rounded-xl achour-glossy-pill font-medium text-sm transition-transform active:scale-95"
                >
                  {t('resume')}
                </button>
                <button
                  onClick={() => handleResumeConfirm(false)}
                  data-tv-prompt-btn="true"
                  data-tv-focus-inset="true"
                  tabIndex={0}
                  className="px-5 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/15 text-gray-200 text-sm font-medium border border-white/15"
                >
                  {t('start_over')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 7. Player Centered Floating Glassmorphism Control Bar (Live TV & VOD) */}
        {(() => {
          const liveBarSize = settings?.liveBarSize || 'default';
          const isLiveFull = isLive && liveBarSize === 'full';
          const isLiveCompact = isLive && liveBarSize === 'compact';
          const outerStyle = !isPreview && !isLiveFull
            ? { transform: 'scale(var(--achour-zoom-scale, 0.95))', transformOrigin: 'bottom center' }
            : undefined;
          const outerPosClass = isLiveFull
            ? 'bottom-3 inset-x-0 px-1.5 sm:px-2.5'
            : isLiveCompact
            ? 'bottom-4 inset-x-0 px-4'
            : 'bottom-5 inset-x-0 px-4';

          return (
            <div
              style={outerStyle}
              className={`absolute ${outerPosClass} z-30 flex justify-center pointer-events-none transition-opacity duration-300 ${
                showControls && !isPreview ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {isLive ? (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    resetControlsTimeout();
                    setLiveFocusMode('bar');
                  }}
                  onPointerDownCapture={() => {
                    resetControlsTimeout();
                    setLiveFocusMode('bar');
                  }}
                  onFocusCapture={() => {
                    resetControlsTimeout();
                    setLiveFocusMode('bar');
                  }}
                  className={`w-full ${isLiveFull ? 'max-w-none' : isLiveCompact ? 'max-w-3xl' : 'max-w-6xl'} font-sans dir-ltr select-none ${
                    showControls && !isPreview ? 'pointer-events-auto' : 'pointer-events-none'
                  }`}
                >
                  {/* Single Centered Lightly-Dimmed Translucent Live Bar */}
                  <div
                    className={`w-full achour-glass-bar flex items-center justify-between min-w-0 ${
                      isLiveCompact
                        ? 'rounded-2xl px-3 py-2 sm:px-4 sm:py-2.5 gap-2 sm:gap-2.5'
                        : 'rounded-3xl px-4 py-3 sm:px-6 sm:py-4.5 gap-3 sm:gap-4'
                    }`}
                  >
                    {/* 2. Channel Number */}
                    <div
                      className={`achour-glossy-badge font-sans font-semibold tabular-nums shrink-0 ${
                        isLiveCompact
                          ? 'px-2 py-1 sm:px-2.5 sm:py-1 text-xs sm:text-sm rounded-xl'
                          : 'px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-lg rounded-2xl'
                      }`}
                    >
                      {String(channelIndex).padStart(3, '0')}
                    </div>

                    {/* 3. Channel Logo */}
                    <div
                      className={`bg-zinc-900/90 border border-white/20 flex items-center justify-center overflow-hidden shrink-0 shadow-md ${
                        isLiveCompact
                          ? 'w-9 h-9 sm:w-12 sm:h-12 rounded-xl p-1'
                          : 'w-13 h-13 sm:w-20 sm:h-20 rounded-2xl p-1.5 sm:p-2'
                      }`}
                    >
                      {liveBarLogoUrl && failedLogoUrl !== liveBarLogoUrl ? (
                        <img
                          key={`${activeVodIdStr}__${liveBarLogoUrl}`}
                          src={liveBarLogoUrl}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain"
                          onError={() => setFailedLogoUrl(liveBarLogoUrl)}
                        />
                      ) : (
                        <Tv className={isLiveCompact ? 'w-5 h-5 sm:w-6 sm:h-6 text-zinc-200' : 'w-7 h-7 sm:w-10 sm:h-10 text-zinc-200'} />
                      )}
                    </div>

                    {/* 4. Channel Name + EPG Program Name + Start/End + Progress + Next Program */}
                    <div className="flex flex-col flex-1 min-w-0 justify-center">
                      <div className="flex items-center justify-between gap-2.5 min-w-0">
                        <h2 className={`font-semibold achour-glossy-title truncate leading-tight ${isLiveCompact ? 'text-xs sm:text-base' : 'text-base sm:text-2xl'}`}>
                          {activeVod.name || activeVod.title || (isRtl ? 'قناة مباشرة' : 'Live Channel')}
                        </h2>
                        {currentProg?.start && currentProg?.stop && (
                          <span className={`font-sans font-normal tabular-nums achour-glossy-info whitespace-nowrap shrink-0 ${isLiveCompact ? 'text-[10px] sm:text-xs' : 'text-xs sm:text-base'}`}>
                            {formatTimeHHMM(currentProg.start)} - {formatTimeHHMM(currentProg.stop)}
                          </span>
                        )}
                      </div>
                      <div className={`flex items-center justify-between gap-2.5 min-w-0 ${isLiveCompact ? 'mt-0.5' : 'mt-1'}`}>
                        <span className={`font-medium achour-glossy-text truncate ${isLiveCompact ? 'text-[11px] sm:text-xs' : 'text-xs sm:text-lg'}`}>
                          {currentProg?.title || (isRtl ? 'لا تتوفر بيانات برنامج حالية' : 'No program information available')}
                        </span>
                        {nextProg?.title && (
                          <span className={`hidden sm:inline font-normal achour-glossy-info opacity-85 truncate max-w-[55%] shrink-0 ${isLiveCompact ? 'text-[11px] sm:text-xs' : 'text-xs sm:text-base'}`}>
                            {isRtl ? `التالي: ${nextProg.title}` : `Next: ${nextProg.title}`}
                          </span>
                        )}
                      </div>
                      <div className={`w-full bg-white/20 rounded-full overflow-hidden ${isLiveCompact ? 'h-1.5 mt-1' : 'h-2 sm:h-2.5 mt-2'}`}>
                        <div
                          className="h-full bg-gold rounded-full transition-all duration-300"
                          style={{ width: `${currentProg ? (currentProgPercent || 5) : 0}%` }}
                        />
                      </div>
                    </div>

                    {/* 5. Clock Time & Date inside the bar */}
                    <div className={`flex flex-col items-end shrink-0 text-right ${isLiveCompact ? 'px-1' : 'px-2'}`}>
                      <span className={`font-sans font-normal tabular-nums achour-glossy-title leading-tight whitespace-nowrap ${isLiveCompact ? 'text-xs sm:text-sm' : 'text-base sm:text-xl'}`}>
                        {formattedClockTime}
                      </span>
                      <span className={`font-sans font-normal tabular-nums achour-glossy-info leading-tight whitespace-nowrap ${isLiveCompact ? 'text-[9px] sm:text-[11px]' : 'text-[11px] sm:text-sm'}`}>
                        {formattedClockDate}
                      </span>
                    </div>

                    {/* 6. Favorite Toggle Button */}
                    {onToggleFavorite && (
                      <button
                        onClick={() => onToggleFavorite(activeVod)}
                        data-tv-focusable="true"
                        data-tv-live-item="fav"
                        data-tv-focus-inset="true"
                        tabIndex={0}
                        className={`bg-white/10 hover:bg-white/20 border border-white/15 transition-transform active:scale-125 focus:outline-none shrink-0 ${
                          isLiveCompact ? 'p-1.5 sm:p-2 rounded-xl' : 'p-2.5 sm:p-3.5 rounded-2xl'
                        }`}
                        title={isFavorite ? (isRtl ? 'إزالة من المفضلة' : 'Remove Favorite') : (isRtl ? 'إضافة للمفضلة' : 'Add Favorite')}
                      >
                        <Star className={`${isLiveCompact ? 'w-4 h-4 sm:w-5 sm:h-5' : 'w-6 h-6 sm:w-7 sm:h-7'} ${isFavorite ? 'text-amber-400 fill-amber-400' : 'text-zinc-300'}`} />
                      </button>
                    )}

                    {/* 7. Measured Raw Video Resolution (Direct text on bar, zero box/frame/background) */}
                    {(() => {
                      const qualityLabel = formatVideoResolution(realResolution) || inferQualityFromMedia(activeVodRef.current);
                      return (
                        <span
                          aria-hidden={!qualityLabel}
                          aria-label={qualityLabel || undefined}
                          className={`${
                            isLiveCompact ? 'w-[68px] sm:w-[86px] text-[10px] sm:text-xs' : 'w-[82px] sm:w-[104px] text-xs sm:text-base'
                          } font-semibold shrink-0 font-sans tabular-nums inline-flex items-center justify-center text-center whitespace-nowrap select-none ${
                            qualityLabel
                              ? 'achour-glossy-text'
                              : 'text-transparent pointer-events-none'
                          }`}
                        >
                          {qualityLabel || '\u00A0'}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              ) : (
            /* Single Centered Theme-Aware Glassmorphism VOD Bar (Movies & Series) — ZERO scattered outer elements */
            <div
              dir="ltr"
              onClick={(e) => {
                e.stopPropagation();
                resetControlsTimeout();
              }}
              onPointerDownCapture={() => {
                resetControlsTimeout();
              }}
              onFocusCapture={() => {
                resetControlsTimeout();
              }}
              className={`w-full max-w-4xl font-sans select-none ${
                showControls && !isPreview ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
            >
              <div
                className="w-full achour-glass-bar rounded-3xl px-3.5 py-2.5 flex flex-col gap-2"
              >
                {/* Top Info Strip: Poster + Title/Episode + Clock/Date */}
                <div className="flex items-center gap-3 min-w-0">
                  {/* 1. Movie / Series Poster */}
                  <div className="w-11 h-14 rounded-xl border border-white/20 bg-black/60 overflow-hidden shrink-0 shadow-md flex items-center justify-center">
                    {vodBarPosterUrl && failedLogoUrl !== vodBarPosterUrl ? (
                      <img
                        key={`${vodId}__${vodBarPosterUrl}`}
                        src={vodBarPosterUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                        onError={() => setFailedLogoUrl(vodBarPosterUrl)}
                      />
                    ) : (
                      <Tv className="w-5 h-5 text-zinc-400" />
                    )}
                  </div>

                  {/* 2. Title + Season/Episode/Title + Subtitle Status */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <h2 className="text-xs sm:text-sm font-semibold achour-glossy-title truncate leading-tight">
                          {displayTitle}
                        </h2>
                        {(() => {
                          const qBadge = formatVideoResolution(realResolution) || inferQualityFromMedia(activeVodRef.current);
                          if (!qBadge) return null;
                          return (
                            <span className="px-1.5 py-0.5 rounded achour-glossy-surface border border-gold/45 text-[10px] font-sans font-semibold tabular-nums tracking-wide shrink-0">
                              <span className="achour-glossy-text">{qBadge}</span>
                            </span>
                          );
                        })()}
                      </div>
                      <div className="flex flex-col items-end shrink-0 text-right">
                        <span className="text-[11px] font-sans font-normal tabular-nums achour-glossy-title leading-tight whitespace-nowrap">
                          {formattedClockTime}
                        </span>
                        <span className="text-[9px] font-sans font-normal tabular-nums achour-glossy-info leading-tight whitespace-nowrap">
                          {formattedClockDate}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-0.5 min-w-0">
                      <span className="text-[11px] font-medium achour-glossy-text truncate">
                        {displaySeriesSubline}
                      </span>
                      {subtitles.length === 0 && (
                        <span className="text-[10px] font-normal achour-glossy-info opacity-85 whitespace-nowrap shrink-0">
                          {isRtl ? 'الترجمة غير متوفرة' : 'Subtitles unavailable'}
                        </span>
                      )}
                    </div>

                    {/* 3. Progress Bar + Elapsed / Total / Remaining Time */}
                    <div className="flex items-center gap-2 mt-1.5 w-full">
                      <span className="text-[10px] sm:text-xs font-sans font-normal tabular-nums achour-glossy-info shrink-0">
                        {formatTime(currentTime)}
                      </span>
                      <div className="relative flex-1 flex items-center">
                        <input
                          type="range"
                          min={0}
                          max={duration || 100}
                          value={Math.min(currentTime, duration || 100)}
                          onChange={(e) => handleSeekChange(parseFloat(e.target.value))}
                          className="vod-seekbar-input w-full h-1.5 bg-white/20 rounded-full appearance-none cursor-pointer accent-[var(--theme-primary,#e5a00d)] focus:outline-none"
                          style={{
                            background: `linear-gradient(to right, var(--theme-primary, #e5a00d) ${
                              duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0
                            }%, rgba(255, 255, 255, 0.2) ${duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0}%)`
                          }}
                        />
                      </div>
                      <span className="text-[10px] sm:text-xs font-sans font-normal tabular-nums text-zinc-200 shrink-0">
                        {formatTime(duration)}
                      </span>
                      <span className="text-[10px] sm:text-xs font-sans font-normal tabular-nums achour-glossy-text shrink-0">
                        -{formatTime(Math.max(0, duration - currentTime))}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Inside Controls Row (Forced physical LTR so Episode buttons stay on the LEFT and Subtitles on the RIGHT) */}
                <div dir="ltr" className="flex items-center justify-between gap-4 pt-2 border-t border-white/10">
                  {/* Left Group: Previous Episode and Next Episode (when isSeries), placed cleanly on the physical LEFT */}
                  <div className="flex-1 min-w-0 flex items-center justify-start gap-2 overflow-x-auto no-scrollbar">
                    {isSeries && resolvedEpisodeIndex > 0 && (
                      <button
                        onClick={handlePrevEpisode}
                        data-tv-focusable="true"
                        data-tv-vod-item="prev-ep"
                        data-tv-focus-inset="true"
                        tabIndex={0}
                        className="h-8 px-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white text-[11px] font-medium flex items-center gap-1.5 transition-colors focus:outline-none shrink-0 whitespace-nowrap shadow-sm"
                        title={isRtl ? 'الحلقة السابقة' : 'Previous Episode'}
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>{isRtl ? 'السابقة' : 'Prev Ep'}</span>
                      </button>
                    )}

                    {isSeries && resolvedEpisodeIndex < vodEpisodes.length - 1 && (
                      <button
                        onClick={handleNextEpisode}
                        data-tv-focusable="true"
                        data-tv-vod-item="next-ep"
                        data-tv-focus-inset="true"
                        tabIndex={0}
                        className="h-8 px-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white text-[11px] font-medium flex items-center gap-1.5 transition-colors focus:outline-none shrink-0 whitespace-nowrap shadow-sm"
                        title={isRtl ? 'الحلقة التالية' : 'Next Episode'}
                      >
                        <span>{isRtl ? 'التالية' : 'Next Ep'}</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Center Group: Rewind, Play/Pause, Forward */}
                  <div className="flex items-center justify-center gap-2.5 shrink-0">
                    {/* Rewind Button */}
                    <button
                      onClick={() => handleSkipTime(-seekStepSeconds)}
                      data-tv-focusable="true"
                      data-tv-vod-item="rewind"
                      data-tv-focus-inset="true"
                      tabIndex={0}
                      className="h-9 px-3 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-medium flex items-center gap-1.5 transition-transform active:scale-90 focus:outline-none whitespace-nowrap"
                      title={`-${seekStepSeconds}s`}
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span className="font-sans tabular-nums">-{seekStepSeconds}s</span>
                    </button>

                    {/* Play / Pause Button */}
                    <button
                      onClick={togglePlayPause}
                      data-tv-focusable="true"
                      data-tv-vod-item="play"
                      data-tv-focus-inset="true"
                      tabIndex={0}
                      className="vod-bottom-play-btn w-11 h-11 rounded-full achour-glossy-pill hover:brightness-110 flex items-center justify-center font-medium transition-transform active:scale-90 focus:outline-none shrink-0"
                      title={isPlaying ? (isRtl ? 'إيقاف مؤقت' : 'Pause') : (isRtl ? 'تشغيل' : 'Play')}
                    >
                      {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                    </button>

                    {/* Forward Button */}
                    <button
                      onClick={() => handleSkipTime(seekStepSeconds)}
                      data-tv-focusable="true"
                      data-tv-vod-item="forward"
                      data-tv-focus-inset="true"
                      tabIndex={0}
                      className="h-9 px-3 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-medium flex items-center gap-1.5 transition-transform active:scale-90 focus:outline-none whitespace-nowrap"
                      title={`+${seekStepSeconds}s`}
                    >
                      <span className="font-sans tabular-nums">+{seekStepSeconds}s</span>
                      <RotateCw className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Right Group inside bar: Audio, Subtitles, Speed, Aspect (no overlap with episode buttons) */}
                  <div className="flex-1 min-w-0 flex items-center justify-end gap-1.5 flex-nowrap overflow-x-auto no-scrollbar">
                    {audioTracks.length > 0 && (
                      <button
                        onClick={(e) => openPopup('audio', e.currentTarget)}
                        data-tv-focusable="true"
                        data-tv-vod-item="audio"
                        data-tv-focus-inset="true"
                        tabIndex={0}
                        className="h-8 px-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white text-[11px] font-medium flex items-center gap-1.5 transition-colors focus:outline-none shrink-0 whitespace-nowrap"
                      >
                        <Languages className="w-3.5 h-3.5" />
                        <span>{isRtl ? 'الصوت' : 'Audio'}</span>
                      </button>
                    )}

                    {subtitles.length > 0 && (
                      <button
                        onClick={(e) => openPopup('subtitles', e.currentTarget)}
                        data-tv-focusable="true"
                        data-tv-vod-item="subtitles"
                        data-tv-focus-inset="true"
                        tabIndex={0}
                        className="h-8 px-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white text-[11px] font-medium flex items-center gap-1.5 transition-colors focus:outline-none shrink-0 whitespace-nowrap"
                      >
                        <SubtitleIcon className="w-3.5 h-3.5" />
                        <span>{isRtl ? 'الترجمة' : 'Subtitles'}</span>
                      </button>
                    )}

                    <button
                      onClick={(e) => openPopup('speed', e.currentTarget)}
                      data-tv-focusable="true"
                      data-tv-vod-item="speed"
                      data-tv-focus-inset="true"
                      tabIndex={0}
                      className="h-8 px-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white text-[11px] font-sans font-medium tabular-nums flex items-center justify-center transition-colors focus:outline-none shrink-0 whitespace-nowrap"
                      title={t('speed')}
                    >
                      {playbackSpeed}x
                    </button>

                    <button
                      onClick={(e) => openPopup('aspect', e.currentTarget)}
                      data-tv-focusable="true"
                      data-tv-vod-item="aspect"
                      data-tv-focus-inset="true"
                      tabIndex={0}
                      className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center transition-colors focus:outline-none shrink-0"
                      title={t('aspect_ratio')}
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
          );
        })()}

        {/* 8. POPUPS (Unified Centered Landscape Overlays) */}
        {activePopup !== 'none' && (
          <div
            onPointerDown={(e) => {
              popupBackdropDownRef.current = e.target === e.currentTarget;
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (isSafeBackdropClick(e, popupOpenedAtRef.current, popupBackdropDownRef.current)) {
                setActivePopup('none');
              }
              popupBackdropDownRef.current = false;
            }}
            className="absolute inset-0 z-50 bg-black/65 achour-modal-backdrop flex items-center justify-center p-4"
          >
            {activePopup === 'audio' && (
              <div
                onClick={(e) => e.stopPropagation()}
                data-achour-skip-tv-base="true"
                className="vod-popup-container achour-glass-modal border-gold/40 rounded-2xl p-5 w-[min(92vw,600px)] max-h-[82vh] flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-75"
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5 shrink-0">
                  <h4 className="text-sm font-semibold text-gold flex items-center gap-2">
                    <Languages className="w-4 h-4 shrink-0" />
                    <span className="achour-glossy-title">{t('select_audio')}</span>
                  </h4>
                  <button
                    onClick={() => setActivePopup('none')}
                    data-tv-focus-inset="true"
                    tabIndex={0}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-y-auto no-scrollbar">
                  {audioTracks.length > 0 ? (
                    audioTracks.map((tr) => (
                      <button
                        key={tr.id}
                        onClick={() => handleSelectAudioTrack(tr.id)}
                        data-tv-focus-inset="true"
                        tabIndex={0}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors border ${
                          selectedAudioTrack === tr.id
                            ? 'achour-glossy-surface border-gold/45 text-gold'
                            : 'text-gray-200 border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'
                        }`}
                      >
                        <span className={`truncate ${selectedAudioTrack === tr.id ? 'achour-glossy-text' : ''}`}>{tr.name}</span>
                        {selectedAudioTrack === tr.id && <Check className="w-4 h-4 shrink-0" />}
                      </button>
                    ))
                  ) : (
                    <div className="sm:col-span-2 p-4 text-center text-xs font-normal text-gray-400">
                      {isRtl ? 'لا تتوفر مسارات صوت متعددة' : 'No multiple audio tracks available'}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activePopup === 'subtitles' && (
              <div
                onClick={(e) => e.stopPropagation()}
                data-achour-skip-tv-base="true"
                className="vod-popup-container achour-glass-modal border-gold/40 rounded-2xl p-5 w-[min(92vw,600px)] max-h-[82vh] flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-75"
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5 shrink-0">
                  <h4 className="text-sm font-semibold text-gold flex items-center gap-2">
                    <SubtitleIcon className="w-4 h-4 shrink-0" />
                    <span className="achour-glossy-title">{t('sub_settings')}</span>
                  </h4>
                  <button
                    onClick={() => setActivePopup('none')}
                    data-tv-focus-inset="true"
                    tabIndex={0}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {subtitles.length === 0 ? (
                  <div className="p-4 text-center text-xs font-medium text-gray-300 bg-white/5 rounded-xl border border-white/10">
                    {isRtl ? 'الترجمة غير متوفرة' : 'Subtitles unavailable'}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-y-auto no-scrollbar">
                      <button
                        onClick={() => handleSelectSubtitle(-1)}
                        data-tv-focus-inset="true"
                        tabIndex={0}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors border ${
                          selectedSubtitle === -1
                            ? 'achour-glossy-surface border-gold/45 text-gold'
                            : 'text-gray-200 border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'
                        }`}
                      >
                        <span className={selectedSubtitle === -1 ? 'achour-glossy-text' : ''}>{t('off')}</span>
                        {selectedSubtitle === -1 && <Check className="w-4 h-4 shrink-0" />}
                      </button>

                      {subtitles.map((sub) => (
                        <button
                          key={sub.id}
                          onClick={() => handleSelectSubtitle(sub.id)}
                          data-tv-focus-inset="true"
                          tabIndex={0}
                          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors border ${
                            selectedSubtitle === sub.id
                              ? 'achour-glossy-surface border-gold/45 text-gold'
                              : 'text-gray-200 border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'
                          }`}
                        >
                          <span className={`truncate ${selectedSubtitle === sub.id ? 'achour-glossy-text' : ''}`}>{sub.name}</span>
                          {selectedSubtitle === sub.id && <Check className="w-4 h-4 shrink-0" />}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => setActivePopup('subtitle-settings')}
                      data-tv-focus-inset="true"
                      tabIndex={0}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/15 text-xs font-medium text-gold border border-white/15 shrink-0"
                    >
                      <Settings className="w-3.5 h-3.5 shrink-0" />
                      <span className="achour-glossy-text">{isRtl ? 'تخصيص الحجم / اللون / المزامنة' : 'Customize Size / Color / Sync'}</span>
                    </button>
                  </>
                )}
              </div>
            )}

            {activePopup === 'subtitle-settings' && (
              <div
                onClick={(e) => e.stopPropagation()}
                data-achour-skip-tv-base="true"
                className="vod-popup-container achour-glass-modal border-gold/40 rounded-2xl p-5 w-[min(92vw,640px)] max-h-[82vh] overflow-y-auto no-scrollbar flex flex-col gap-3.5 animate-in fade-in zoom-in-95 duration-75"
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5 shrink-0">
                  <h4 className="text-sm font-semibold text-gold flex items-center gap-2">
                    <Settings className="w-4 h-4 shrink-0" />
                    <span className="achour-glossy-title">{isRtl ? 'تخصيص مظهر الترجمة' : 'Customize Subtitle Style'}</span>
                  </h4>
                  <button
                    onClick={() => setActivePopup('subtitles')}
                    data-tv-focus-inset="true"
                    tabIndex={0}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-300 font-medium block">{isRtl ? 'تزامن الترجمة (ثوانٍ):' : 'Subtitle Offset (sec):'}</label>
                    <div className="flex items-center justify-between bg-white/[0.06] rounded-xl p-2 border border-white/15">
                      <button
                        onClick={() => handleSubSyncChange(-0.5)}
                        data-tv-focus-inset="true"
                        tabIndex={0}
                        className="px-3 py-1 bg-white/[0.08] hover:bg-white/15 rounded-lg text-xs font-medium"
                      >
                        <span className="achour-glossy-text font-sans tabular-nums">-0.5s</span>
                      </button>
                      <span className="text-xs font-sans font-normal tabular-nums achour-glossy-info">{subSyncOffset > 0 ? `+${subSyncOffset}` : subSyncOffset}s</span>
                      <button
                        onClick={() => handleSubSyncChange(0.5)}
                        data-tv-focus-inset="true"
                        tabIndex={0}
                        className="px-3 py-1 bg-white/[0.08] hover:bg-white/15 rounded-lg text-xs font-medium"
                      >
                        <span className="achour-glossy-text font-sans tabular-nums">+0.5s</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-300 font-medium block">{isRtl ? 'حجم الخط:' : 'Font Size:'}</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['sm', 'md', 'lg', 'xl'] as const).map((sz) => (
                        <button
                          key={sz}
                          onClick={() => setSubFontSize(sz)}
                          data-tv-focus-inset="true"
                          tabIndex={0}
                          className={`py-2 rounded-lg text-xs font-medium uppercase border ${
                            subFontSize === sz
                              ? 'achour-glossy-pill border-gold'
                              : 'bg-white/[0.08] text-gray-300 border-white/15'
                          }`}
                        >
                          {sz}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-300 font-medium block">{isRtl ? 'لون النص:' : 'Text Color:'}</label>
                    <div className="flex items-center gap-2.5">
                      {[
                        { name: isRtl ? 'أبيض' : 'White', color: '#FFFFFF' },
                        { name: isRtl ? 'أصفر' : 'Yellow', color: '#FFD700' },
                        { name: isRtl ? 'سماوي' : 'Cyan', color: '#00FFFF' },
                        { name: isRtl ? 'أخضر' : 'Green', color: '#00FF00' }
                      ].map((c) => (
                        <button
                          key={c.color}
                          onClick={() => setSubColor(c.color)}
                          data-tv-focus-inset="true"
                          tabIndex={0}
                          className="w-8 h-8 rounded-full border-2 flex items-center justify-center"
                          style={{ backgroundColor: c.color, borderColor: subColor === c.color ? 'var(--theme-primary, #e5a00d)' : 'transparent' }}
                        >
                          {subColor === c.color && <Check className="w-4 h-4 text-black" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-300 font-medium block">{isRtl ? 'خلفية النص:' : 'Text Background:'}</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'none', name: isRtl ? 'بدون' : 'None' },
                        { id: 'semi', name: isRtl ? 'شفافة' : 'Semi' },
                        { id: 'black', name: isRtl ? 'سوداء' : 'Black' }
                      ].map((bg) => (
                        <button
                          key={bg.id}
                          onClick={() => setSubBg(bg.id as any)}
                          data-tv-focus-inset="true"
                          tabIndex={0}
                          className={`py-2 rounded-lg text-xs font-medium border ${
                            subBg === bg.id
                              ? 'achour-glossy-pill border-gold'
                              : 'bg-white/[0.08] text-gray-300 border-white/15'
                          }`}
                        >
                          {bg.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activePopup === 'quality' && (
              <div
                onClick={(e) => e.stopPropagation()}
                data-achour-skip-tv-base="true"
                className="vod-popup-container achour-glass-modal border-gold/40 rounded-2xl p-5 w-[min(92vw,580px)] max-h-[82vh] flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-75"
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5 shrink-0">
                  <h4 className="text-sm font-semibold text-gold flex items-center gap-2">
                    <Zap className="w-4 h-4 shrink-0" />
                    <span className="achour-glossy-title">{t('quality')}</span>
                  </h4>
                  <button
                    onClick={() => setActivePopup('none')}
                    data-tv-focus-inset="true"
                    tabIndex={0}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-y-auto no-scrollbar">
                  <button
                    onClick={() => handleSelectQuality(-1)}
                    data-tv-focus-inset="true"
                    tabIndex={0}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors border ${
                      selectedQuality === -1
                        ? 'achour-glossy-surface border-gold/45 text-gold'
                        : 'text-gray-200 border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'
                    }`}
                  >
                    <span className={selectedQuality === -1 ? 'achour-glossy-text' : ''}>{isRtl ? 'تلقائي' : 'Auto'}</span>
                    {selectedQuality === -1 && <Check className="w-4 h-4 shrink-0" />}
                  </button>

                  {hlsQualities.map((q) => (
                    <button
                      key={q.id}
                      onClick={() => handleSelectQuality(q.id)}
                      data-tv-focus-inset="true"
                      tabIndex={0}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors border ${
                        selectedQuality === q.id
                          ? 'achour-glossy-surface border-gold/45 text-gold'
                          : 'text-gray-200 border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'
                      }`}
                    >
                      <span className={selectedQuality === q.id ? 'achour-glossy-text' : ''}>{q.name}</span>
                      {selectedQuality === q.id && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activePopup === 'aspect' && (
              <div
                onClick={(e) => e.stopPropagation()}
                data-achour-skip-tv-base="true"
                className="vod-popup-container achour-glass-modal border-gold/40 rounded-2xl p-5 w-[min(92vw,580px)] max-h-[82vh] flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-75"
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5 shrink-0">
                  <h4 className="text-sm font-semibold text-gold flex items-center gap-2">
                    <Maximize2 className="w-4 h-4 shrink-0" />
                    <span className="achour-glossy-title">{t('aspect_ratio')}</span>
                  </h4>
                  <button
                    onClick={() => setActivePopup('none')}
                    data-tv-focus-inset="true"
                    tabIndex={0}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-y-auto no-scrollbar">
                  {[
                    { id: 'fit', label: isRtl ? 'تناسب تلقائي (Fit)' : 'Auto Fit' },
                    { id: 'fill', label: isRtl ? 'تعبئة الشاشة (Fill)' : 'Full Fill' },
                    { id: 'zoom', label: isRtl ? 'تكبير (Zoom)' : 'Zoom' },
                    { id: '16:9', label: '16:9' },
                    { id: '4:3', label: '4:3' }
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => {
                        setAspectRatio(mode.id as AspectRatioMode);
                        const native = typeof window !== 'undefined' ? (window as any).AchourNative : null;
                        if (isNativeApp() && native && typeof native.setResizeMode === 'function') {
                          try { native.setResizeMode(mode.id); } catch (e) {}
                        }
                        setActivePopup('none');
                      }}
                      data-tv-focus-inset="true"
                      tabIndex={0}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors border ${
                        aspectRatio === mode.id
                          ? 'achour-glossy-surface border-gold/45 text-gold'
                          : 'text-gray-200 border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'
                      }`}
                    >
                      <span className={aspectRatio === mode.id ? 'achour-glossy-text' : ''}>{mode.label}</span>
                      {aspectRatio === mode.id && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activePopup === 'speed' && (
              <div
                onClick={(e) => e.stopPropagation()}
                data-achour-skip-tv-base="true"
                className="vod-popup-container achour-glass-modal border-gold/40 rounded-2xl p-5 w-[min(92vw,580px)] max-h-[82vh] flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-75"
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5 shrink-0">
                  <h4 className="text-sm font-semibold text-gold flex items-center gap-2">
                    <Sliders className="w-4 h-4 shrink-0" />
                    <span className="achour-glossy-title">{t('speed')}</span>
                  </h4>
                  <button
                    onClick={() => setActivePopup('none')}
                    data-tv-focus-inset="true"
                    tabIndex={0}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-y-auto no-scrollbar">
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                    <button
                      key={speed}
                      onClick={() => {
                        const native = typeof window !== 'undefined' ? (window as any).AchourNative : null;
                        if (isNativeApp() && native && typeof native.setPlaybackSpeed === 'function') {
                          try { native.setPlaybackSpeed(speed); } catch (e) {}
                        }
                        if (videoRef.current) videoRef.current.playbackRate = speed;
                        setPlaybackSpeed(speed);
                        setActivePopup('none');
                      }}
                      data-tv-focus-inset="true"
                      tabIndex={0}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors border ${
                        playbackSpeed === speed
                          ? 'achour-glossy-surface border-gold/45 text-gold'
                          : 'text-gray-200 border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'
                      }`}
                    >
                      <span className={`font-sans tabular-nums ${playbackSpeed === speed ? 'achour-glossy-text' : ''}`}>{speed === 1 ? (isRtl ? 'سرعة طبيعية (1.0x)' : 'Normal (1.0x)') : `${speed}x`}</span>
                      {playbackSpeed === speed && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activePopup === 'sleep' && (
              <div
                onClick={(e) => e.stopPropagation()}
                data-achour-skip-tv-base="true"
                className="vod-popup-container achour-glass-modal border-gold/40 rounded-2xl p-5 w-[min(92vw,580px)] max-h-[82vh] flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-75"
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5 shrink-0">
                  <h4 className="text-sm font-semibold text-gold flex items-center gap-2">
                    <Clock className="w-4 h-4 shrink-0" />
                    <span className="achour-glossy-title">{t('sleep_timer')}</span>
                  </h4>
                  <button
                    onClick={() => setActivePopup('none')}
                    data-tv-focus-inset="true"
                    tabIndex={0}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-y-auto no-scrollbar">
                  {[
                    { label: isRtl ? 'إيقاف المؤقت' : 'Off', min: null },
                    { label: isRtl ? 'بعد 15 دقيقة' : '15 min', min: 15 },
                    { label: isRtl ? 'بعد 30 دقيقة' : '30 min', min: 30 },
                    { label: isRtl ? 'بعد 45 دقيقة' : '45 min', min: 45 },
                    { label: isRtl ? 'بعد 60 دقيقة' : '60 min', min: 60 }
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => {
                        setSleepTimerMinutes(opt.min);
                        setActivePopup('none');
                      }}
                      data-tv-focus-inset="true"
                      tabIndex={0}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors border ${
                        sleepTimerMinutes === opt.min
                          ? 'achour-glossy-surface border-gold/45 text-gold'
                          : 'text-gray-200 border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'
                      }`}
                    >
                      <span className={sleepTimerMinutes === opt.min ? 'achour-glossy-text' : ''}>{opt.label}</span>
                      {sleepTimerMinutes === opt.min && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activePopup === 'episodes' && isSeries && (
              <div
                onClick={(e) => e.stopPropagation()}
                data-achour-skip-tv-base="true"
                className="vod-popup-container achour-glass-modal border-gold/40 rounded-2xl p-5 w-[min(92vw,680px)] max-h-[82vh] flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-75"
              >
                <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
                  <h3 className="text-base font-semibold text-gold flex items-center gap-2">
                    <ListVideo className="w-5 h-5 shrink-0" />
                    <span className="achour-glossy-title">{t('episodes')}</span>
                  </h3>
                  <button
                    onClick={() => setActivePopup('none')}
                    data-tv-focus-inset="true"
                    tabIndex={0}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2.5 py-1 no-scrollbar">
                  {vodEpisodes.map((ep, idx) => {
                    const isCurrent = idx === resolvedEpisodeIndex;
                    return (
                      <button
                        key={ep.id || idx}
                        onClick={() => {
                          flushCurrentProgress(true);
                          if (onSelectEpisode) {
                            onSelectEpisode(idx);
                          } else if (onSelectMedia) {
                            onSelectMedia(ep);
                          }
                          setActivePopup('none');
                        }}
                        data-tv-focus-inset="true"
                        tabIndex={0}
                        className={`w-full p-3 rounded-xl border text-start transition-all flex items-center justify-between gap-3 ${
                          isCurrent
                            ? 'achour-glossy-surface border-gold'
                            : 'bg-white/[0.05] border-white/10 text-gray-200 hover:bg-white/10'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className={`text-xs font-medium truncate ${isCurrent ? 'achour-glossy-text' : ''}`}>
                            S{ep.season_num || 1} E{ep.episode_num || idx + 1}: {ep.title || ep.name || `الحلقة ${idx + 1}`}
                          </div>
                          {ep.duration && (
                            <div className="text-[10px] font-sans font-normal tabular-nums achour-glossy-info mt-0.5">{ep.duration}</div>
                          )}
                        </div>
                        {isCurrent ? (
                          <div className="w-7 h-7 rounded-full achour-glossy-pill flex items-center justify-center shrink-0">
                            <Play className="w-4 h-4 fill-current" />
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-white/10 text-gray-300 flex items-center justify-center shrink-0">
                            <PlayCircle className="w-4 h-4" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (portalTarget) {
    return createPortal(playerJSX, portalTarget);
  }

  return playerJSX;
};

export default VodPlayerModal;
