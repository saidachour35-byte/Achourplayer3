// @ts-nocheck
// Original path: src/components/LivePlayer.tsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Hls from 'hls.js';
import { ExternalLaunchResult, isFireTVDevice, launchExternalPlayerSession } from '../utils/players';
import { 
  Search, Zap, LayoutGrid, List, ArrowUpDown, Trash2, Clock, 
  Play, Pause, EyeOff, MonitorPlay, Plus, X, History, Database, 
  Maximize, Minimize, Eye, RotateCcw, AlertTriangle, ShieldCheck, ChevronLeft, ChevronRight,
  Star, Volume2, VolumeX, Sun, Tv, HelpCircle, Filter, Sparkles, Radio,
  Film, Clapperboard, Check, Sliders, Monitor, ChevronUp, ChevronDown, Layers, Info, ArrowUp, ArrowDown, Move, Copy, Mic, MicOff, Calendar, ChevronsUp
} from 'lucide-react';
import AIOcrModal from './AIOcrModal';
import PinUnlockModal from './PinUnlockModal';
import VodPlayerModal from './VodPlayerModal';
import EPGGrid from './EPGGrid';
import VirtualizedChannelList, { VirtualizedChannelListHandle } from './VirtualizedChannelList';
import PositionEditModal from './PositionEditModal';
import { collection, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import axios from 'axios';
import { AppSettings, Channel, Language, Playlist } from '../types';
import { fetchChannels, fetchChannelsForType, iptvGlobalCache, parseM3U } from '../utils/iptv';
import { useI18n } from '../utils/i18n';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  getLocalFavoriteIds, 
  getLocalVodFavoriteIds,
  toggleVodFavorite,
  syncFavoritesFromFirestore, 
  toggleFavorite as toggleFavoriteService, 
  subscribeFavorites 
} from '../utils/favoritesService';
import { xtreamFetch } from '../utils/iptv';
import { getRecents, addToRecents } from '../utils/recentService';
import {
  WATCH_HISTORY_CAT_ID,
  getWatchHistory,
  addToWatchHistory,
  saveLastWatchedChannel
} from '../utils/watchHistoryService';
import { getPlatformUrl, isAndroid, isNativeApp } from '../utils/platform';
import { createUnifiedHlsConfig, resolveUnifiedStreamUrls, buildUnifiedNativeHeaders } from '../utils/hlsConfig';
import { formatLanguageLabel } from '../utils/mediaTracks';
import {
  pushBackHandler,
  BackPriority,
  setTVFocus,
  getCurrentTVFocus,
  isTVOrLowEndDevice,
  markLongPressModalOpened,
  isLongPressModalGraceActive,
  isSafeBackdropClick
} from '../utils/tvNavigation';
import { parseExpiryDate } from '../utils/subscription';
import { 
  initDB, 
  saveChannels, 
  saveCategories,
  getChannelsByType, 
  getCategoriesByType, 
  getChannelsByCategory,
  getChannelsByCategoryWindowed,
  searchChannelsInCategory,
  getChannelsByIds,
  getChannelsByPlaylistAndType,
  getCategoriesByPlaylistAndType,
  getPlaylistExtractionStatus,
  trimDbMemoryCaches,
  getEpisodesBySeriesId,
  saveEpisodes,
  getSeriesDetails,
  saveSeriesDetails,
  getVodDetails,
  saveVodDetails,
  hasCategoryBuckets,
  isLegacyGeneralRepairChecked,
  markLegacyGeneralRepairChecked,
  promoteUncategorizedItemsToGeneral
} from '../lib/db';
import { StreamingM3UParser } from '../utils/streamScanner';
import {
  CONTINUE_WATCHING_CAT_ID,
  cleanVodEntityId,
  getContinueWatchingItems,
  getVodProgress,
  clearVodProgress,
  getSeriesLastUnfinishedEpisode,
  getSeriesEpisodesProgressMap,
  formatPlaybackClock,
  MIN_RESUME_POSITION_SEC
} from '../utils/vodProgressService';
import { ExtractionService } from '../utils/extractionService';
import { processInChunks } from '../utils/performance';

// Helper for long press detection with touch-movement cancellation
const useLongPress = (callback: () => void, ms = 500, enabled = true) => {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPress = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);

  const start = useCallback((clientX?: number, clientY?: number) => {
    if (!enabled) return;
    isLongPress.current = false;
    if (clientX !== undefined && clientY !== undefined) {
      startPos.current = { x: clientX, y: clientY };
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      isLongPress.current = true;
      callback();
    }, ms);
  }, [callback, ms, enabled]);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPos.current = null;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!startPos.current || e.touches.length === 0) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - startPos.current.x);
    const dy = Math.abs(touch.clientY - startPos.current.y);
    if (dx > 6 || dy > 6) {
      stop();
    }
  }, [stop]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!startPos.current) return;
    const dx = Math.abs(e.clientX - startPos.current.x);
    const dy = Math.abs(e.clientY - startPos.current.y);
    if (dx > 8 || dy > 8) {
      stop();
    }
  }, [stop]);

  const onClick = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (isLongPress.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  return {
    onMouseDown: (e: React.MouseEvent) => start(e.clientX, e.clientY),
    onMouseMove: handleMouseMove,
    onMouseUp: stop,
    onMouseLeave: stop,
    onTouchStart: (e: React.TouchEvent) => {
      if (e.touches.length > 0) {
        start(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    onTouchMove: handleTouchMove,
    onTouchEnd: stop,
    onTouchCancel: stop,
    onContextMenu: (e: React.MouseEvent) => {
      if (enabled) {
        e.preventDefault();
        e.stopPropagation();
        callback();
      }
    },
    onClick
  };
};

const CategoryButton = React.memo(({ cat, catIdx, isSelected, onSelect, onFocusIdx, onReorder, categories, showNumber }: any) => {
  const canReorder = Boolean(onReorder) && cat?.category_id !== '__all__' && cat?.category_id !== WATCH_HISTORY_CAT_ID && cat?.category_id !== CONTINUE_WATCHING_CAT_ID && cat?.category_id !== 'favorites';
  const longPress = useLongPress(() => {
    if (canReorder && onReorder) {
      markLongPressModalOpened(700);
      const realIdx = categories.findIndex((c: any) => c.category_id === cat.category_id);
      onReorder({ type: 'category', id: cat.category_id, index: realIdx !== -1 ? realIdx : catIdx, name: cat.category_name });
    }
  }, 450, canReorder);

  return (
    <div
      role="button"
      tabIndex={0}
      data-tv-focusable="true"
      data-tv-focus-inset="true"
      data-tv-pane="categories"
      data-index={catIdx + 1}
      data-cat-index={catIdx}
      {...(canReorder ? longPress : {})}
      onFocus={() => onFocusIdx?.(catIdx)}
      onClick={(e) => {
        if (canReorder && longPress.onClick) {
          longPress.onClick(e);
          if (e.defaultPrevented) return;
        }
        onFocusIdx?.(catIdx);
        onSelect(cat.category_id);
      }}
      className={`w-full h-[44px] flex items-center justify-between px-3.5 rounded-xl text-xs sm:text-sm md:text-base font-medium cursor-pointer outline-none relative bg-transparent transition-colors ${
        isSelected
          ? 'achour-glossy-surface font-semibold'
          : 'text-zinc-300 hover:text-white'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1 pr-1">
        {isSelected && <span className="w-1.5 h-4 rounded-full bg-gold shrink-0" />}
        {showNumber && (
          <span className="text-[11px] font-sans font-normal tabular-nums achour-glossy-info shrink-0 min-w-[1.5rem] text-center select-none">
            {catIdx + 1}
          </span>
        )}
        <span className={`truncate text-xs sm:text-sm md:text-base leading-snug text-white ${isSelected ? 'font-semibold' : 'font-medium'}`}>
          {cat.category_name}
        </span>
      </div>
      {cat.count > 0 && (
        <span className="text-[10px] sm:text-xs font-sans font-normal tabular-nums achour-glossy-info shrink-0">{cat.count}</span>
      )}
    </div>
  );
});

const CAT_ROW_HEIGHT = 44;
const CAT_TOP_INSET = 4;
const CAT_BOTTOM_BUFFER = 4;

interface VirtualizedCategoryListHandle {
  focusIndex: (idx: number) => void;
}

const VirtualizedCategoryList = React.forwardRef<VirtualizedCategoryListHandle, {
  categories: ParsedCategory[];
  realLiveCats: ParsedCategory[];
  selectedCategory: string;
  onSelect: (id: string) => void;
  onFocusIdx: (idx: number) => void;
  onReorder?: (item: any) => void;
  showNumber?: boolean;
}>(({ categories, realLiveCats, selectedCategory, onSelect, onFocusIdx, onReorder, showNumber = false }, ref) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(560);
  const lastScrollTopRef = useRef(0);
  const scrollRafRef = useRef<number | null>(null);
  const pendingScrollTopRef = useRef<number | null>(null);
  const activeFocusIdxRef = useRef<number>(0);
  const pendingFocusRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  const getVisibleViewportMetrics = useCallback((el: HTMLDivElement) => {
    const rect = el.getBoundingClientRect();
    const winH = typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 0;
    const rawH = el.clientHeight > 40 ? el.clientHeight : viewportH;
    const zoomFactor = rect.height > 0 && rawH > 0 ? rect.height / rawH : 1;
    if (winH > 0 && rect.height > 0) {
      const clampedBottom = Math.min(rect.bottom, winH);
      const visibleFromWindow = Math.floor((clampedBottom - Math.max(0, rect.top)) / zoomFactor);
      const effectiveH = Math.max(120, Math.min(rawH, visibleFromWindow));
      return { effectiveH, visibleTop: Math.max(0, rect.top), visibleBottom: clampedBottom, zoomFactor };
    }
    return {
      effectiveH: Math.max(120, rawH),
      visibleTop: rect.top,
      visibleBottom: rect.top + rawH,
      zoomFactor: 1
    };
  }, [viewportH]);

  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const updateH = () => {
      const { effectiveH } = getVisibleViewportMetrics(el);
      if (effectiveH > 0) setViewportH(prev => (prev === effectiveH ? prev : effectiveH));
    };
    updateH();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(updateH);
      ro.observe(el);
    }
    window.addEventListener('resize', updateH);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', updateH);
    };
  }, [getVisibleViewportMetrics]);

  const total = categories.length;
  const overscan = 8;
  const effectiveScrollTop = Math.max(0, scrollTop - CAT_TOP_INSET);
  let startIdx = Math.max(0, Math.floor(effectiveScrollTop / CAT_ROW_HEIGHT) - overscan);
  const visibleCount = Math.ceil(viewportH / CAT_ROW_HEIGHT) + overscan * 2;
  let endIdx = Math.min(total - 1, startIdx + visibleCount);

  // Guarantee the active focused category row is always mounted in DOM even during rapid D-pad repeats
  const curFocusIdx = activeFocusIdxRef.current;
  if (total > 0 && curFocusIdx >= 0 && curFocusIdx < total) {
    if (curFocusIdx < startIdx) startIdx = Math.max(0, curFocusIdx - 2);
    if (curFocusIdx > endIdx) endIdx = Math.min(total - 1, curFocusIdx + 2);
  }

  const ensureTargetRectVisible = useCallback((el: HTMLDivElement, target: HTMLElement) => {
    const { effectiveH, visibleTop, visibleBottom, zoomFactor } = getVisibleViewportMetrics(el);
    const safePad = Math.max(64, Math.min(104, Math.round(effectiveH * 0.12))) * zoomFactor;
    const targetRect = target.getBoundingClientRect();
    if (targetRect.height <= 0) return;

    if (targetRect.top < visibleTop + safePad) {
      const delta = ((visibleTop + safePad) - targetRect.top) / zoomFactor;
      const nextTop = Math.max(0, el.scrollTop - delta);
      if (Math.abs(nextTop - el.scrollTop) > 1) {
        el.scrollTop = nextTop;
        const clampedTop = el.scrollTop;
        lastScrollTopRef.current = clampedTop;
        setScrollTop(clampedTop);
      }
    } else if (targetRect.bottom > visibleBottom - safePad) {
      const delta = (targetRect.bottom - (visibleBottom - safePad)) / zoomFactor;
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      const nextTop = Math.min(maxScroll, el.scrollTop + delta);
      if (Math.abs(nextTop - el.scrollTop) > 1) {
        el.scrollTop = nextTop;
        const clampedTop = el.scrollTop;
        lastScrollTopRef.current = clampedTop;
        setScrollTop(clampedTop);
      }
    }
  }, [getVisibleViewportMetrics]);

  const focusDomCategoryByIndex = useCallback((safeIdx: number, verifyViewportScroll = false): boolean => {
    const el = scrollRef.current;
    if (!el) return false;
    const target = el.querySelector<HTMLElement>(
      `[data-tv-pane="categories"][data-cat-index="${safeIdx}"]`
    );
    if (!target) return false;
    setTVFocus(target, { scroll: false, skipLayoutCheck: true });
    if (verifyViewportScroll) {
      ensureTargetRectVisible(el, target);
    }
    return true;
  }, [ensureTargetRectVisible]);

  React.useImperativeHandle(ref, () => ({
    focusIndex: (idx: number) => {
      if (total === 0) return;
      const safeIdx = Math.max(0, Math.min(total - 1, idx));
      activeFocusIdxRef.current = safeIdx;
      const el = scrollRef.current;
      if (el) {
        const effectiveH = el.clientHeight > 40 ? el.clientHeight : viewportH;
        const safePad = Math.max(64, Math.min(104, Math.round(effectiveH * 0.12)));
        const rowTop = CAT_TOP_INSET + safeIdx * CAT_ROW_HEIGHT;
        const rowBottom = rowTop + CAT_ROW_HEIGHT;
        const curTop = el.scrollTop;
        const expectedTotalH = CAT_TOP_INSET + total * CAT_ROW_HEIGHT + CAT_BOTTOM_BUFFER;
        const maxScroll = Math.max(0, expectedTotalH - effectiveH);

        if (rowTop - safePad < curTop) {
          const clampedTop = Math.max(0, Math.min(maxScroll, rowTop - safePad));
          if (Math.abs(clampedTop - curTop) > 1) {
            el.scrollTop = clampedTop;
            lastScrollTopRef.current = clampedTop;
            setScrollTop(clampedTop);
          }
        } else if (rowBottom + safePad > curTop + effectiveH) {
          const clampedTop = Math.min(maxScroll, Math.max(0, rowBottom + safePad - effectiveH));
          if (Math.abs(clampedTop - curTop) > 1) {
            el.scrollTop = clampedTop;
            lastScrollTopRef.current = clampedTop;
            setScrollTop(clampedTop);
          }
        }
      }

      if (focusDomCategoryByIndex(safeIdx, false)) {
        pendingFocusRef.current = null;
      } else {
        pendingFocusRef.current = safeIdx;
      }
    }
  }), [total, viewportH, focusDomCategoryByIndex]);

  React.useLayoutEffect(() => {
    const idx = pendingFocusRef.current;
    if (idx === null) return;
    if (focusDomCategoryByIndex(idx, false)) {
      pendingFocusRef.current = null;
    } else {
      const raf = requestAnimationFrame(() => {
        if (pendingFocusRef.current !== null && focusDomCategoryByIndex(pendingFocusRef.current, false)) {
          pendingFocusRef.current = null;
        }
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [startIdx, endIdx, categories.length, focusDomCategoryByIndex]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const nextTop = e.currentTarget.scrollTop;
    pendingScrollTopRef.current = nextTop;
    if (scrollRafRef.current === null) {
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        const targetTop = pendingScrollTopRef.current;
        if (targetTop === null) return;
        pendingScrollTopRef.current = null;
        if (Math.abs(targetTop - lastScrollTopRef.current) >= 8 || targetTop === 0) {
          lastScrollTopRef.current = targetTop;
          setScrollTop(targetTop);
        }
      });
    }
  }, []);

  const visibleSlice: React.ReactNode[] = [];
  for (let i = startIdx; i <= endIdx; i++) {
    const cat = categories[i];
    if (!cat) continue;
    visibleSlice.push(
      <div
        key={`${cat.category_id}-${i}`}
        style={{
          position: 'absolute',
          top: `${CAT_TOP_INSET + i * CAT_ROW_HEIGHT}px`,
          left: 0,
          right: 0,
          height: `${CAT_ROW_HEIGHT}px`
        }}
      >
        <CategoryButton
          cat={cat}
          catIdx={i}
          categories={realLiveCats}
          isSelected={selectedCategory === cat.category_id}
          onSelect={onSelect}
          onFocusIdx={onFocusIdx}
          onReorder={onReorder}
          showNumber={showNumber}
        />
      </div>
    );
  }

  const adaptiveBottomBuf = CAT_BOTTOM_BUFFER;

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      onFocusCapture={(e) => {
        const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-tv-pane="categories"]');
        if (target && scrollRef.current) {
          const parsedIdx = parseInt(target.getAttribute('data-cat-index') || '', 10);
          if (!isNaN(parsedIdx) && parsedIdx >= 0 && parsedIdx < total) {
            activeFocusIdxRef.current = parsedIdx;
          }
          ensureTargetRectVisible(scrollRef.current, target);
        }
      }}
      className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden no-scrollbar px-2"
      style={{
        contain: 'layout style',
        scrollPaddingTop: '64px',
        scrollPaddingBottom: `${adaptiveBottomBuf}px`
      }}
    >
      <div
        style={{
          height: `${CAT_TOP_INSET + total * CAT_ROW_HEIGHT + adaptiveBottomBuf}px`,
          position: 'relative',
          width: '100%'
        }}
      >
        {visibleSlice}
      </div>
    </div>
  );
});

const LiveHeaderClock: React.FC<{ language?: string; timeFormat?: string }> = React.memo(({ language, timeFormat }) => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(t);
  }, []);
  const loc = language === 'ar' ? 'ar-EG' : language;
  return (
    <div className="flex flex-col items-end shrink-0">
      <span className="text-xs sm:text-sm font-normal font-sans tabular-nums achour-glossy-title leading-none">
        {now.toLocaleTimeString(loc, {
          hour: '2-digit',
          minute: '2-digit',
          hour12: timeFormat === '12h'
        })}
      </span>
      <span className="text-[10px] font-normal font-sans achour-glossy-info mt-0.5 whitespace-nowrap">
        {now.toLocaleDateString(loc, {
          weekday: 'short',
          day: 'numeric',
          month: 'short'
        })}
      </span>
    </div>
  );
});


const LiveMiniEpgCard: React.FC<{
  selectedChannel: ParsedChannel | null;
  findProgramsForChannel: (ch: ParsedChannel | null) => any[] | null;
  language?: string;
  timeFormat?: string;
  isRtl: boolean;
}> = React.memo(({ selectedChannel, findProgramsForChannel, language, timeFormat, isRtl }) => {
  const [now, setNow] = useState(() => new Date());
  const [failedIconUrl, setFailedIconUrl] = useState<string>('');
  const channelIconUrl = String(selectedChannel?.stream_icon || selectedChannel?.logo || '').trim();
  useEffect(() => {
    setFailedIconUrl('');
  }, [selectedChannel?.stream_id, channelIconUrl]);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  const programs = findProgramsForChannel(selectedChannel);
  const curProg = programs ? (programs.find(p => p.start <= now && p.stop >= now) || null) : null;
  const nextProg = programs ? (programs.find(p => p.start > now) || null) : null;

  let curProgressPct = 0;
  let remainingMins: number | null = null;
  if (curProg && curProg.start && curProg.stop) {
    const sMs = new Date(curProg.start).getTime();
    const eMs = new Date(curProg.stop).getTime();
    const nMs = now.getTime();
    if (eMs > sMs) {
      curProgressPct = Math.min(100, Math.max(0, ((nMs - sMs) / (eMs - sMs)) * 100));
      remainingMins = Math.max(0, Math.ceil((eMs - nMs) / 60000));
    }
  }
  const fmtTime = (dt: any) => {
    if (!dt) return '';
    const d = new Date(dt);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString(language === 'ar' ? 'ar-EG' : language, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: timeFormat === '12h'
    });
  };

  if (!selectedChannel) {
    return (
      <div className="h-full flex items-center justify-center text-[10px] font-medium text-zinc-500">
        {isRtl ? 'اختر قناة لعرض دليل البرامج الحالي والتالي' : 'Select a channel to view program guide'}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 pb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          {channelIconUrl && failedIconUrl !== channelIconUrl && (
            <img
              key={`${selectedChannel.stream_id || ''}__${channelIconUrl}`}
              src={channelIconUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="w-6 h-6 rounded-lg object-contain bg-transparent shrink-0"
              onError={() => setFailedIconUrl(channelIconUrl)}
            />
          )}
          <span className="text-xs font-semibold achour-glossy-text truncate">{selectedChannel.name}</span>
        </div>
        <span className="text-[9px] font-medium achour-glossy-info shrink-0">
          {isRtl ? 'دليل البرامج' : 'Program Guide'}
        </span>
      </div>

      {curProg ? (
        <div className="rounded-xl bg-transparent p-2 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-semibold achour-glossy-text uppercase">
              {isRtl ? 'البرنامج الحالي' : 'Now Playing'}
            </span>
            <span className="text-[9px] font-sans font-normal tabular-nums achour-glossy-info" dir="ltr">
              {fmtTime(curProg.start)} - {fmtTime(curProg.stop)}
            </span>
          </div>
          <p className="text-xs font-medium text-white leading-snug line-clamp-2">
            {curProg.title}
          </p>
          <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gold rounded-full transition-all duration-500"
              style={{ width: `${curProgressPct}%` }}
            />
          </div>
          {remainingMins !== null && (
            <div className="text-[9px] font-normal font-sans tabular-nums achour-glossy-info">
              {isRtl ? `متبقي ${remainingMins} دقيقة` : `${remainingMins} min remaining`}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-transparent p-2 text-[10px] font-normal text-zinc-400">
          {isRtl ? 'لا تتوفر بيانات البرنامج الحالي لهذه القناة' : 'No current program guide available for this channel'}
        </div>
      )}

      {nextProg && (
        <div className="rounded-xl bg-transparent px-2 py-1.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="block text-[9px] font-semibold achour-glossy-info uppercase mb-0.5">
              {isRtl ? 'البرنامج التالي' : 'Up Next'}
            </span>
            <p className="text-[10px] font-medium text-zinc-200 truncate">
              {nextProg.title}
            </p>
          </div>
          <span className="text-[10px] font-sans font-normal tabular-nums achour-glossy-info shrink-0" dir="ltr">
            {fmtTime(nextProg.start)}
          </span>
        </div>
      )}
    </div>
  );
});




const getAspectRatioClass = (ratio: string) => {
  if (ratio === '16:9') return 'w-full h-full object-contain aspect-video bg-black mx-auto';
  if (ratio === '4:3') return 'w-[82%] h-full object-contain aspect-[4/3] bg-black mx-auto';
  if (ratio === 'fill') return 'w-full h-full object-cover bg-black';
  return 'w-full h-full object-contain bg-black';
};




interface LivePlayerProps {
  onBack: () => void;
  settings: AppSettings;
  onUpdateSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  userId: string;
  initialType?: 'live' | 'movie' | 'series' | 'favorites';
  initialChannelToPlay?: ParsedChannel | null;
  onAutoPlayFallback?: () => void;
}

export interface ParsedChannel {
  stream_id: string;
  name: string;
  stream_icon?: string;
  logo?: string;
  cover?: string;
  url: string;
  category_id: string;
  category_name?: string;
  category?: string;
  container_extension?: string;
  season?: number;
  episode?: number;
  type?: 'live' | 'movie' | 'series';
  rating?: string;
  releaseDate?: string;
  added?: string | number;
  year?: string;
  duration?: string;
  plot?: string;
  orderIndex?: number;
}


export interface ParsedCategory {
  category_id: string;
  category_name: string;
  count?: number;
}

export function isFavCategory(c: ParsedCategory | { category_id?: string; category_name?: string; name?: string; id?: string }): boolean {
  if (!c) return false;
  const normName = String(c.category_name || (c as any).name || '').trim().toLowerCase();
  const normId = String(c.category_id || (c as any).id || '').trim().toLowerCase();
  return (
    normId === 'favorites' ||
    normId === 'favourites' ||
    normId === 'fav' ||
    normId === 'favorites_internal' ||
    /\bfav(s|orite|orites|ourite|ourites)?\b/i.test(normName) ||
    normName.includes('مفضل') ||
    normName.includes('favorite') ||
    normName.includes('favourite') ||
    normName.includes('favoriten') ||
    normName.includes('favoris') ||
    normName.includes('⭐') ||
    normName.includes('★')
  );
}

export function detectGenre(channelName: string, categoryName: string = ''): string {
  const text = (channelName + ' ' + categoryName).toLowerCase();
  if (/sport|bein|ssc|kora|foot|espn|eurosport|رياض/i.test(text)) return 'sports';
  if (/news|jazeera|arabiya|bbc|cnn|sky news|أخبار|الجزيرة|العربية/i.test(text)) return 'news';
  if (/movie|cinema|film|action|hbo|mbc2|mbc max|أفلام|سينما|أكشن/i.test(text)) return 'movies';
  if (/series|drama|mbc drama|مسلسل|دراما/i.test(text)) return 'series';
  if (/kid|cartoon|disney|spacetoon|cn|أطفال|كرتون|سبيستون/i.test(text)) return 'kids';
  if (/quran|sunnah|islam|قرآن|سنة|إسلام/i.test(text)) return 'religious';
  if (/music|rotana|mtv|موسيقى|اغاني/i.test(text)) return 'music';
  if (/doc|nat geo|discovery|history|وثائقي/i.test(text)) return 'documentary';
  return 'general';
}

export function isMovieItem(name: string, group: string = '', url: string = ''): boolean {
  const text = (name + ' ' + group + ' ' + url).toLowerCase();
  return text.includes('.mp4') || text.includes('.mkv') || text.includes('.avi') || text.includes('.mov') || text.includes('.m4v') ||
         text.includes('movie') || text.includes('film') || text.includes('vod') || text.includes('cinema') ||
         text.includes('netflix') || text.includes('shahed') || text.includes('osn') || text.includes('boxoffice') ||
         text.includes('أفلام') || text.includes('افلام') || text.includes('الأفلام') || text.includes('الافلام') ||
         text.includes('سينما') || text.includes('السينما') || text.includes('فيلم') || text.includes('الفيلم') ||
         text.includes('مترجم') || text.includes('مدبلج') || text.includes('شاهد') || text.includes('نتفليكس');
}

export function isSeriesItem(name: string, group: string = '', url: string = ''): boolean {
  const text = (name + ' ' + group + ' ' + url).toLowerCase();
  return text.includes('series') || text.includes('serie') || text.includes('مسلسل') || text.includes('المسلسل') ||
         text.includes('مسلسلات') || text.includes('المسلسلات') || text.includes('دراما') || text.includes('drama') ||
         text.includes('s0') || text.includes('s1') || text.includes('s2') || text.includes('s3') || text.includes('s4') || text.includes('s5') ||
         text.includes('season') || text.includes('episode') || text.includes('حلقة') || text.includes('حلقات') ||
         text.includes('موسم') || text.includes('مواسم') || text.includes('انمي') || text.includes('anime');
}





// Budgeted LRU in-memory session caches to stay well within 1.5 GB Fire TV RAM
const sessionCategoriesCache = new Map<string, ParsedCategory[]>();
const sessionChannelsCache = new Map<string, ParsedChannel[]>();
const sessionSeriesDetailsCache = new Map<string, any>();
const sessionVodDetailsCache = new Map<string, any>();
const inFlightDetailsCache = new Map<string, Promise<any>>();
let sessionChannelsTotalItems = 0;

const setBoundedDetailCache = (cache: Map<string, any>, key: string, value: any, maxEntries: number) => {
  if (!key || !value) return;
  if (cache.has(key)) cache.delete(key);
  while (cache.size >= maxEntries) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  cache.set(key, value);
};

const setSessionChannelsCache = (key: string, items: ParsedChannel[]) => {
  const lowMem = isTVOrLowEndDevice();
  const maxEntries = lowMem ? 3 : 8;
  const maxTotalItems = lowMem ? 6000 : 25000;
  const maxSingleItems = lowMem ? 3500 : 12000;

  if (!items || items.length === 0 || items.length > maxSingleItems) return;

  const existing = sessionChannelsCache.get(key);
  if (existing) {
    sessionChannelsTotalItems = Math.max(0, sessionChannelsTotalItems - existing.length);
    sessionChannelsCache.delete(key);
  }

  while (
    sessionChannelsCache.size > 0 &&
    (sessionChannelsCache.size >= maxEntries || sessionChannelsTotalItems + items.length > maxTotalItems)
  ) {
    const oldestKey = sessionChannelsCache.keys().next().value;
    if (oldestKey === undefined) break;
    const evicted = sessionChannelsCache.get(oldestKey);
    if (evicted) sessionChannelsTotalItems = Math.max(0, sessionChannelsTotalItems - evicted.length);
    sessionChannelsCache.delete(oldestKey);
  }

  sessionChannelsCache.set(key, items);
  sessionChannelsTotalItems += items.length;
};

export const clearLivePlayerSessionCache = () => {
  sessionCategoriesCache.clear();
  sessionChannelsCache.clear();
  sessionSeriesDetailsCache.clear();
  sessionVodDetailsCache.clear();
  inFlightDetailsCache.clear();
  sessionChannelsTotalItems = 0;
  trimDbMemoryCaches();
};
if (typeof window !== 'undefined') {
  window.addEventListener('achour_clear_session_cache', clearLivePlayerSessionCache);
  window.addEventListener('achour_trim_memory', () => {
    sessionChannelsCache.clear();
    sessionSeriesDetailsCache.clear();
    sessionVodDetailsCache.clear();
    sessionChannelsTotalItems = 0;
    trimDbMemoryCaches();
  });
}

// Keep WebView wallpaper cutout polygon & native transparency classes synced across all active MultiView ExoPlayer slots
const syncMultiViewNativeOverlay = (isFullscreenSlot: boolean) => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const native = (window as any).AchourNative;
  if (!isNativeApp() || !native?.showMultiSlot) return;

  const docEl = document.documentElement;
  const bodyEl = document.body;

  if (isFullscreenSlot) {
    docEl.classList.add('native-player-active');
    bodyEl.classList.add('native-player-active');
    docEl.classList.remove('native-player-preview');
    bodyEl.classList.remove('native-player-preview');
    docEl.style.removeProperty('--native-preview-clip');
    return;
  }

  const holeEls = Array.from(document.querySelectorAll<HTMLElement>('[data-multiview-native-hole="true"]'));
  const holes: string[] = [];
  for (const el of holeEls) {
    const r = el.getBoundingClientRect();
    if (r.width > 10 && r.height > 10) {
      const x = Math.max(0, Math.round(r.left));
      const y = Math.max(0, Math.round(r.top));
      const w = Math.max(0, Math.round(r.width));
      const h = Math.max(0, Math.round(r.height));
      holes.push(`${x}px ${y}px, ${x}px ${y + h}px, ${x + w}px ${y + h}px, ${x + w}px ${y}px, ${x}px ${y}px, 0px 0px`);
    }
  }

  if (holes.length > 0) {
    docEl.classList.add('native-player-active', 'native-player-preview');
    bodyEl.classList.add('native-player-active', 'native-player-preview');
    docEl.style.setProperty(
      '--native-preview-clip',
      `polygon(evenodd, 0px 0px, 100% 0px, 100% 100%, 0px 100%, 0px 0px, ${holes.join(', ')})`
    );
  } else {
    docEl.classList.remove('native-player-active', 'native-player-preview');
    bodyEl.classList.remove('native-player-active', 'native-player-preview');
    docEl.style.removeProperty('--native-preview-clip');
  }
};

// High-performance, lightweight video player dedicated for each active Multi-View slot (ExoPlayer on APK, Hls.js on Web)
interface MultiViewSlotItem {
  slotId: number;
  channel: ParsedChannel | null;
  aspectRatio: MultiViewAspectRatio;
}

type MultiViewAspectRatio = '16:9' | '4:3' | 'fit' | 'cover' | 'fill';

interface MultiViewSlotPlayerProps {
  channel: ParsedChannel;
  isActive: boolean;
  isMuted: boolean;
  aspectRatio: MultiViewAspectRatio;
  isFullscreenSlot?: boolean;
  className?: string;
  settings: AppSettings;
  onSelectSlot: () => void;
  onToggleMute: (e: React.MouseEvent) => void;
  onAspectRatioChange: (slotId: number, ratio: MultiViewAspectRatio) => void;
  onOpenFullscreen: () => void;
  onChangeChannel?: (e: React.MouseEvent) => void;
  onRemove: (e: React.MouseEvent) => void;
  slotIndex: number;
  displayNumber?: number;
  slotCount?: number;
  isRtl: boolean;
}

const MultiViewSlotPlayerComponent: React.FC<MultiViewSlotPlayerProps> = ({
  channel,
  isActive,
  isMuted,
  aspectRatio,
  isFullscreenSlot = false,
  className = '',
  settings,
  onSelectSlot,
  onToggleMute,
  onAspectRatioChange,
  onOpenFullscreen,
  onChangeChannel,
  onRemove,
  slotIndex,
  displayNumber,
  slotCount = 1,
  isRtl,
}) => {
  const slotRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;
  const isFullscreenRef = useRef(isFullscreenSlot);
  isFullscreenRef.current = isFullscreenSlot;
  const slotCountRef = useRef(slotCount);
  slotCountRef.current = slotCount;

  const native = typeof window !== 'undefined' ? (window as any).AchourNative : null;
  const isNativeActive = isNativeApp() && !!native?.showMultiSlot;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showAspectRatioMenu, setShowAspectRatioMenu] = useState(false);
  const [showFocusBorder, setShowFocusBorder] = useState(false);
  const [slotBounds, setSlotBounds] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const focusTimerRef = useRef<NodeJS.Timeout | null>(null);

  const triggerFocusBorder = useCallback(() => {
    setShowFocusBorder(true);
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    focusTimerRef.current = setTimeout(() => {
      setShowFocusBorder(false);
    }, 3500);
  }, []);

  const handleSlotFocus = () => {
    onSelectSlot();
    triggerFocusBorder();
  };

  useEffect(() => {
    const onPulse = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail && detail.slotIndex === slotIndex) {
        triggerFocusBorder();
      }
    };
    window.addEventListener('achour_multiview_focus_pulse', onPulse);
    return () => {
      window.removeEventListener('achour_multiview_focus_pulse', onPulse);
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    };
  }, [slotIndex, triggerFocusBorder]);

  useEffect(() => {
    if (isNativeActive) return;
    const el = slotRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      setSlotBounds((prev) =>
        Math.abs(prev.width - rect.width) < 1 && Math.abs(prev.height - rect.height) < 1
          ? prev
          : { width: rect.width, height: rect.height }
      );
    };
    updateSize();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(updateSize);
      ro.observe(el);
    }
    window.addEventListener('resize', updateSize);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, [isNativeActive, slotCount, isFullscreenSlot]);

  useEffect(() => {
    if (!isNativeActive) return;
    try {
      native.setMultiSlotResizeModeForSlot?.(slotIndex, aspectRatio);
    } catch {}
  }, [aspectRatio, slotIndex, channel?.stream_id, isNativeActive, native]);

  // Sync audio mute/unmute instantly on native ExoPlayer slot & HTML5 video
  useEffect(() => {
    if (isNativeActive) {
      try {
        native.setMultiSlotVolume?.(slotIndex, isMuted ? 0 : 1);
      } catch {}
      return;
    }
    const v = videoRef.current;
    if (v) {
      v.muted = isMuted;
      v.volume = isMuted ? 0 : 1;
    }
  }, [isNativeActive, isMuted, slotIndex, channel?.stream_id]);

  // Native Multi-View slot unmount cleanup (avoid destroying ExoPlayer between channel switches or reflows)
  useEffect(() => {
    if (!isNativeActive) return;
    return () => {
      try {
        native?.hideMultiSlot?.(slotIndex);
      } catch {}
      if (typeof document !== 'undefined' && document.querySelector('[data-multiview-container="true"]')) {
        requestAnimationFrame(() => syncMultiViewNativeOverlay(false));
      }
    };
  }, [isNativeActive, slotIndex]);

  // Keep native ExoPlayer slot bounds & WebView transparency cutout synced on split <-> reflow <-> fullscreen <-> resize
  useEffect(() => {
    if (!isNativeActive) return;

    let lastKey = '';
    const syncSlotBounds = () => {
      syncMultiViewNativeOverlay(Boolean(isFullscreenRef.current));
      let b = { x: 0, y: 0, width: 0, height: 0 };
      if (!isFullscreenRef.current) {
        const rect = slotRef.current?.getBoundingClientRect();
        if (rect && rect.width > 10 && rect.height > 10) {
          const x = Math.round(rect.left);
          const y = Math.round(rect.top);
          b = {
            x,
            y,
            width: Math.round(rect.right) - x,
            height: Math.round(rect.bottom) - y,
          };
        } else {
          return;
        }
      }
      const key = `${b.x},${b.y},${b.width},${b.height}`;
      if (key === lastKey) return;
      lastKey = key;
      try {
        native.updateMultiSlotBounds?.(slotIndex, b.x, b.y, b.width, b.height);
      } catch {}
    };

    const rafId = requestAnimationFrame(syncSlotBounds);
    const settleTimer = setTimeout(syncSlotBounds, 90);
    window.addEventListener('resize', syncSlotBounds);

    let ro: ResizeObserver | null = null;
    if (slotRef.current && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(syncSlotBounds);
      ro.observe(slotRef.current);
    }

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(settleTimer);
      ro?.disconnect();
      window.removeEventListener('resize', syncSlotBounds);
    };
  }, [isNativeActive, isFullscreenSlot, slotIndex, className, slotCount]);

  // Start stream playback using the isolated Multi-Screen pipeline (AndroidX Media3 ExoPlayer on APK, Hls.js on Web preview)
  useEffect(() => {
    if (!channel) return;

    let destroyed = false;
    const isCurrentPlayback = () => !destroyed;
    setLoading(true);
    setError(false);

    const rawChannelUrl = channel.url || (channel as any).stream_url || '';
    const { activeStreamUrl, isHls } = resolveUnifiedStreamUrls(rawChannelUrl, true, isNativeActive);

    if (!activeStreamUrl) {
      setError(true);
      setLoading(false);
      return;
    }

    if (isNativeActive && native?.showMultiSlot) {
      let b = { x: 0, y: 0, width: 0, height: 0 };
      if (!isFullscreenRef.current) {
        const rect = slotRef.current?.getBoundingClientRect();
        if (rect && rect.width > 10 && rect.height > 10) {
          const x = Math.round(rect.left);
          const y = Math.round(rect.top);
          b = {
            x,
            y,
            width: Math.round(rect.right) - x,
            height: Math.round(rect.bottom) - y,
          };
        }
      }
      syncMultiViewNativeOverlay(Boolean(isFullscreenRef.current));

      try {
        const customHeaders = buildUnifiedNativeHeaders(channel);
        native.showMultiSlot(
          slotIndex,
          activeStreamUrl,
          JSON.stringify({
            title: channel.name || 'Achour Player',
            isLive: true,
            autoPlay: true,
            muted: isMutedRef.current,
            volume: isMutedRef.current ? 0 : 1,
            headers: customHeaders
          }),
          b.x,
          b.y,
          b.width,
          b.height
        );
      } catch (e) {
        console.warn('AchourNative showMultiSlot failed:', e);
        setError(true);
        setLoading(false);
      }

      const startedAt = Date.now();
      const pollTimer = setInterval(() => {
        if (destroyed) return;
        try {
          const playing = Boolean(native.isMultiSlotPlaying?.(slotIndex));
          const hasErr = Boolean(native.hasMultiSlotError?.(slotIndex));
          if (playing) {
            setLoading(false);
            setError(false);
          } else if (hasErr) {
            setLoading(false);
            setError(true);
          } else if (Date.now() - startedAt > 12000) {
            setLoading(false);
          }
        } catch {}
      }, 300);

      return () => {
        destroyed = true;
        clearInterval(pollTimer);
      };
    }

    const video = videoRef.current;
    if (!video) return;
    video.muted = isMutedRef.current;
    video.volume = isMutedRef.current ? 0 : 1;
    video.defaultPlaybackRate = 1;
    video.playbackRate = 1;

    if (Hls.isSupported() && isHls) {
      let webWatchdogTimer: ReturnType<typeof setInterval> | null = null;
      let lastVideoTime = -1;
      let stallTicks = 0;
      let webRecoveryCount = 0;

      const teardownHls = () => {
        if (hlsRef.current) {
          try {
            hlsRef.current.stopLoad();
            hlsRef.current.detachMedia();
            hlsRef.current.destroy();
          } catch (e) {}
          hlsRef.current = null;
        }
      };

      const startHlsSession = () => {
        if (!isCurrentPlayback()) return;
        teardownHls();

        const hls = new Hls(createUnifiedHlsConfig(true, !isFullscreenRef.current, slotCountRef.current, true));
        hlsRef.current = hls;

        hls.attachMedia(video);
        hls.loadSource(activeStreamUrl);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!isCurrentPlayback()) return;
          if (Array.isArray(hls.levels) && hls.levels.length > 0) {
            let cappedIdx = -1;
            for (let i = 0; i < hls.levels.length; i++) {
              const lvl = hls.levels[i];
              const h = lvl.height || 0;
              const b = lvl.bitrate || 0;
              if ((h === 0 || h <= 360) && (b === 0 || b <= 1_000_000)) {
                cappedIdx = i;
              }
            }
            if (cappedIdx === -1) {
              let lowestIdx = 0;
              for (let i = 1; i < hls.levels.length; i++) {
                const curH = hls.levels[i].height || Number.MAX_SAFE_INTEGER;
                const lowH = hls.levels[lowestIdx].height || Number.MAX_SAFE_INTEGER;
                if (
                  curH < lowH ||
                  (curH === lowH && (hls.levels[i].bitrate || 0) < (hls.levels[lowestIdx].bitrate || 0))
                ) {
                  lowestIdx = i;
                }
              }
              cappedIdx = lowestIdx;
            }
            hls.autoLevelCapping = cappedIdx;
            hls.currentLevel = cappedIdx;
          }
          setLoading(false);
          setError(false);
          video.muted = isMutedRef.current;
          video.volume = isMutedRef.current ? 0 : 1;
          video.play().catch(() => {});
        });

        hls.on(Hls.Events.FRAG_BUFFERED, () => {
          if (!isCurrentPlayback()) return;
          setLoading(false);
          setError(false);
          if (video.paused) {
            video.muted = isMutedRef.current;
            video.volume = isMutedRef.current ? 0 : 1;
            video.play().catch(() => {});
          }
        });

        hls.on(Hls.Events.FRAG_PARSED, () => {
          if (!isCurrentPlayback()) return;
          if (video.paused) {
            video.muted = isMutedRef.current;
            video.volume = isMutedRef.current ? 0 : 1;
            video.play().catch(() => {});
          }
        });

        let hlsErrorCount = 0;
        let directFallbackStarted = false;
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!isCurrentPlayback()) return;
          if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR || data.details === Hls.ErrorDetails.BUFFER_NUDGE_ON_STALL) {
            if (video && video.paused) {
              video.play().catch(() => {});
            }
            return;
          }
          if (data.fatal) {
            hlsErrorCount++;
            if (hlsErrorCount <= 2 && data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              try { hls.recoverMediaError(); } catch (e) {}
            } else if (hlsErrorCount <= 2 && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              try { hls.startLoad(-1); } catch (e) {}
            } else if (!directFallbackStarted) {
              directFallbackStarted = true;
              teardownHls();
              if (video) {
                video.src = activeStreamUrl || rawChannelUrl;
                video.muted = isMutedRef.current;
                video.volume = isMutedRef.current ? 0 : 1;
                video.play().then(() => {
                  if (isCurrentPlayback()) setLoading(false);
                }).catch(() => {
                  if (!isCurrentPlayback()) return;
                  if (rawChannelUrl && rawChannelUrl !== activeStreamUrl) {
                    video.src = rawChannelUrl;
                    video.play().then(() => {
                      if (isCurrentPlayback()) setLoading(false);
                    }).catch(() => {
                      if (!isCurrentPlayback()) return;
                      setError(true);
                      setLoading(false);
                    });
                  } else {
                    setError(true);
                    setLoading(false);
                  }
                });
              }
            }
          }
        });
      };

      startHlsSession();

      // Independent Web per-slot stall/freeze watchdog
      webWatchdogTimer = setInterval(() => {
        if (!isCurrentPlayback() || !video) return;
        const curTime = video.currentTime || 0;
        if (!video.paused && !video.ended) {
          if (lastVideoTime >= 0 && Math.abs(curTime - lastVideoTime) < 0.05) {
            stallTicks++;
          } else {
            stallTicks = 0;
            webRecoveryCount = 0;
          }
          lastVideoTime = curTime;

          if (stallTicks === 4) {
            // Soft live-edge nudge for this slot only
            try {
              const livePos = hlsRef.current?.liveSyncPosition;
              if (typeof livePos === 'number' && Number.isFinite(livePos) && livePos > 0) {
                video.currentTime = livePos;
              }
              hlsRef.current?.startLoad(-1);
              video.play().catch(() => {});
            } catch {}
          } else if (stallTicks >= 8) {
            stallTicks = 0;
            if (webRecoveryCount < 4) {
              webRecoveryCount++;
              startHlsSession();
            } else {
              setError(true);
              setLoading(false);
            }
          }
        }
      }, 2000);

      return () => {
        destroyed = true;
        if (webWatchdogTimer) clearInterval(webWatchdogTimer);
        teardownHls();
        if (video && video.hasAttribute('src')) {
          try {
            video.pause();
            video.removeAttribute('src');
            video.load();
          } catch (e) {}
        }
      };
    } else {
      const onReady = () => {
        if (!isCurrentPlayback()) return;
        setLoading(false);
        setError(false);
      };
      const onErr = () => {
        if (!isCurrentPlayback()) return;
        setError(true);
        setLoading(false);
      };
      video.addEventListener('loadeddata', onReady);
      video.addEventListener('playing', onReady);
      video.addEventListener('error', onErr);
      video.src = activeStreamUrl || rawChannelUrl;
      video.muted = isMutedRef.current;
      video.volume = isMutedRef.current ? 0 : 1;
      video.play().then(() => {
        if (isCurrentPlayback()) setLoading(false);
      }).catch(() => {});

      return () => {
        destroyed = true;
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('playing', onReady);
        video.removeEventListener('error', onErr);
        if (video && video.hasAttribute('src')) {
          try {
            video.pause();
            video.removeAttribute('src');
            video.load();
          } catch (e) {}
        }
      };
    }
  }, [channel?.stream_id, channel?.url, isNativeActive, slotIndex]);

  const badgeNum = displayNumber ?? slotIndex + 1;

  const explicitRatioBoxStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (aspectRatio !== '16:9' && aspectRatio !== '4:3') return undefined;
    if (slotBounds.width <= 0 || slotBounds.height <= 0) return { width: '100%', height: '100%' };
    const targetRatio = aspectRatio === '16:9' ? 16 / 9 : 4 / 3;
    const containerRatio = slotBounds.width / slotBounds.height;
    if (containerRatio > targetRatio) {
      const h = slotBounds.height;
      return { width: `${Math.round(h * targetRatio)}px`, height: `${Math.round(h)}px` };
    }
    const w = slotBounds.width;
    return { width: `${Math.round(w)}px`, height: `${Math.round(w / targetRatio)}px` };
  }, [aspectRatio, slotBounds.width, slotBounds.height]);

  return (
    <div
      ref={slotRef}
      id={`multiview-slot-${slotIndex}`}
      data-tv-focusable={isFullscreenSlot ? undefined : "true"}
      data-multiview-slot="true"
      data-multiview-focus-visible={showFocusBorder && !isFullscreenSlot ? 'true' : undefined}
      data-multiview-native-hole={isNativeActive ? 'true' : undefined}
      data-slot-index={slotIndex}
      data-aspect-ratio={aspectRatio}
      tabIndex={isFullscreenSlot ? -1 : 0}
      onClick={() => {
        onSelectSlot();
        triggerFocusBorder();
      }}
      onFocus={handleSlotFocus}
      onBlur={(e) => {
        if (!slotRef.current?.contains(e.relatedTarget as Node)) {
          setShowFocusBorder(false);
          setShowAspectRatioMenu(false);
        }
      }}
      onKeyDown={() => {
        triggerFocusBorder();
      }}
      onDoubleClick={onOpenFullscreen}
      className={`group relative w-full h-full min-w-0 min-h-0 rounded-none overflow-hidden bg-transparent border-0 ring-0 outline-none ${
        showFocusBorder && !isFullscreenSlot ? 'z-30' : 'shadow-none'
      } ${isFullscreenSlot ? 'cursor-default' : 'cursor-pointer'} ${className}`}
    >
      {!isNativeActive && (
        explicitRatioBoxStyle ? (
          <div className="w-full h-full flex items-center justify-center bg-transparent pointer-events-none">
            <div style={explicitRatioBoxStyle} className="overflow-hidden bg-transparent pointer-events-none">
              <video
                ref={videoRef}
                playsInline
                autoPlay
                muted={isMuted}
                className="w-full h-full object-fill bg-transparent pointer-events-none"
              />
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted={isMuted}
            className={`w-full h-full ${
              aspectRatio === 'fill'
                ? 'object-fill'
                : aspectRatio === 'cover'
                ? 'object-cover'
                : 'object-contain'
            } bg-transparent pointer-events-none`}
          />
        )
      )}

      {!isFullscreenSlot && loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-transparent pointer-events-none z-10">
          <div className="w-7 h-7 border-2 border-gold border-t-transparent rounded-full animate-spin drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]" />
        </div>
      )}

      {!isFullscreenSlot && error && (
        <div dir={isRtl ? 'rtl' : 'ltr'} className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-transparent text-zinc-200 p-2 text-center pointer-events-none z-10 drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
          <AlertTriangle size={20} className="text-amber-400" />
          <span className="text-[11px] font-bold">{isRtl ? 'تعذر تشغيل البث' : 'Playback error'}</span>
        </div>
      )}

      {/* All slot controls and labels are intentionally absent in clean fullscreen mode. */}
      {!isFullscreenSlot && (
      <div dir={isRtl ? 'rtl' : 'ltr'} className={`absolute top-1.5 inset-x-1.5 flex items-center justify-between gap-1.5 z-20 transition-opacity duration-300 ${showFocusBorder ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'} bg-transparent`}>
        <div className="flex items-center gap-1.5 px-1.5 py-0.5 bg-transparent border-0 text-white min-w-0 max-w-[62%] drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
          <span className={`text-[10px] font-sans font-semibold tabular-nums ${isActive ? 'achour-glossy-text' : 'achour-glossy-info'}`}>#{badgeNum}</span>
          <span className={`text-xs font-semibold truncate ${isActive ? 'achour-glossy-title' : 'text-white/95'}`}>{channel.name}</span>
        </div>

        <div className="flex items-center gap-1 bg-transparent">
          <button
            onClick={onToggleMute}
            data-tv-focusable="true" tabIndex={0}
            title={isMuted ? (isRtl ? 'تشغيل الصوت' : 'Unmute') : (isRtl ? 'كتم الصوت' : 'Mute')}
            className={`p-1.5 bg-transparent border-0 shadow-none outline-none transition-transform cursor-pointer drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)] hover:scale-110 focus:scale-125 focus:text-gold ${
              !isMuted ? 'text-gold' : 'text-white/90 hover:text-gold'
            }`}
          >
            {!isMuted ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowAspectRatioMenu((open) => !open);
            }}
            data-tv-focusable="true" tabIndex={0}
            title={isRtl ? 'نسبة عرض الصورة' : 'Aspect ratio'}
            aria-label={isRtl ? 'نسبة عرض الصورة' : 'Aspect ratio'}
            className="p-1 bg-transparent border-0 shadow-none outline-none text-white/90 hover:text-gold focus:text-gold transition-transform cursor-pointer drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]"
          >
            <span className="text-[9px] font-semibold">AR</span>
          </button>
          {onChangeChannel && (
            <button
              onClick={onChangeChannel}
              data-tv-focusable="true" tabIndex={0}
              title={isRtl ? 'تغيير القناة' : 'Change channel'}
              className="p-1.5 bg-transparent border-0 shadow-none outline-none text-white/90 hover:text-gold focus:text-gold hover:scale-110 focus:scale-125 transition-transform cursor-pointer drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]"
            >
              <Tv size={14} />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenFullscreen();
            }}
            data-tv-focusable="true" tabIndex={0}
            title={isRtl ? 'ملء الشاشة' : 'Fullscreen'}
            className="p-1.5 bg-transparent border-0 shadow-none outline-none text-white/90 hover:text-gold focus:text-gold hover:scale-110 focus:scale-125 transition-transform cursor-pointer drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]"
          >
            <Maximize size={14} />
          </button>
          <button
            onClick={onRemove}
            data-tv-focusable="true" tabIndex={0}
            title={isRtl ? 'إزالة القناة' : 'Remove channel'}
            className="p-1.5 bg-transparent border-0 shadow-none outline-none text-white/90 hover:text-rose-400 focus:text-rose-400 hover:scale-110 focus:scale-125 transition-transform cursor-pointer drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]"
          >
            <X size={14} />
          </button>
        </div>
        {showAspectRatioMenu && (
          <div
            className={`absolute top-8 ${isRtl ? 'left-0' : 'right-0'} flex flex-wrap items-center gap-1 z-30 bg-transparent max-w-full`}
            onClick={(e) => e.stopPropagation()}
          >
            {([
              ['16:9', '16:9'],
              ['4:3', '4:3'],
              ['fit', 'FIT / ORIGINAL'],
              ['cover', 'ZOOM / COVER'],
              ['fill', 'FILL / STRETCH'],
            ] as const).map(([ratio, label]) => (
              <button
                key={ratio}
                type="button"
                data-tv-focusable="true"
                tabIndex={0}
                aria-pressed={aspectRatio === ratio}
                onClick={(e) => {
                  e.stopPropagation();
                  onAspectRatioChange(slotIndex, ratio);
                  setShowAspectRatioMenu(false);
                }}
                className={`px-1.5 py-1 bg-transparent border-0 text-[9px] font-bold drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)] cursor-pointer ${
                  aspectRatio === ratio ? 'text-gold' : 'text-white hover:text-gold focus:text-gold'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  );
};

const MultiViewSlotPlayer = React.memo(MultiViewSlotPlayerComponent, (prev, next) => (
  prev.channel?.stream_id === next.channel?.stream_id &&
  prev.channel?.url === next.channel?.url &&
  prev.isActive === next.isActive &&
  prev.isMuted === next.isMuted &&
  prev.aspectRatio === next.aspectRatio &&
  prev.isFullscreenSlot === next.isFullscreenSlot &&
  prev.className === next.className &&
  prev.slotIndex === next.slotIndex &&
  prev.displayNumber === next.displayNumber &&
  prev.slotCount === next.slotCount &&
  prev.onAspectRatioChange === next.onAspectRatioChange &&
  prev.isRtl === next.isRtl
));

const EmptyMultiViewSlotButton = React.memo(({
  slotId,
  displayNumber,
  spanClass,
  isRtl,
  onPickSlot,
}: {
  slotId: number;
  displayNumber: number;
  spanClass: string;
  isRtl: boolean;
  onPickSlot: () => void;
}) => {
  const [showFocusBorder, setShowFocusBorder] = useState(false);
  const focusTimerRef = useRef<NodeJS.Timeout | null>(null);

  const triggerFocusBorder = useCallback(() => {
    setShowFocusBorder(true);
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    focusTimerRef.current = setTimeout(() => {
      setShowFocusBorder(false);
    }, 3500);
  }, []);

  useEffect(() => {
    const onPulse = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail && detail.slotIndex === slotId) {
        triggerFocusBorder();
      }
    };
    window.addEventListener('achour_multiview_focus_pulse', onPulse);
    return () => {
      window.removeEventListener('achour_multiview_focus_pulse', onPulse);
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    };
  }, [slotId, triggerFocusBorder]);

  return (
    <button
      id={`multiview-slot-${slotId}`}
      data-tv-focusable="true"
      data-multiview-slot="true"
      data-multiview-focus-visible={showFocusBorder ? 'true' : undefined}
      data-slot-index={slotId}
      tabIndex={0}
      dir={isRtl ? 'rtl' : 'ltr'}
      onFocus={triggerFocusBorder}
      onBlur={() => setShowFocusBorder(false)}
      onKeyDown={triggerFocusBorder}
      onClick={() => {
        triggerFocusBorder();
        onPickSlot();
      }}
      className={`w-full h-full min-h-0 rounded-none border-0 shadow-none ring-0 outline-none bg-transparent flex flex-col items-center justify-center gap-2 text-zinc-200 hover:text-gold focus:text-gold transition-colors drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] ${
        showFocusBorder ? 'z-30' : ''
      } ${spanClass}`}
    >
      <Plus size={28} className="text-gold" />
      <span className="text-xs font-medium achour-glossy-text">
        {isRtl ? `اختر قناة للخانة ${displayNumber}` : `Select channel for slot ${displayNumber}`}
      </span>
    </button>
  );
});

export default function LivePlayer({ onBack, settings, onUpdateSettings, userId, initialType = 'live', initialChannelToPlay = null, onAutoPlayFallback }: LivePlayerProps) {

  const { t, isRtl } = useI18n(settings.language);
  const playlistId = settings.activePlaylistId || 'default';
  const [historyRevision, setHistoryRevision] = useState(0);
  const [progressRevision, setProgressRevision] = useState(0);
  const [vodResumeOverride, setVodResumeOverride] = useState<{
    mode: 'prompt' | 'resume' | 'restart';
    positionSec?: number;
  }>({ mode: 'prompt' });
  const activeSeriesParentRef = useRef<ParsedChannel | null>(null);
  const returningEpisodeIdRef = useRef<string | null>(null);
  const autoSeasonSelectedRef = useRef<string | null>(null);
  const autoPlayAttemptRef = useRef<ParsedChannel | null>(initialChannelToPlay || null);
  const autoPlayTriggeredRef = useRef(false);
  const autoPlayFallbackCalledRef = useRef(false);
  const [watchItResumeModal, setWatchItResumeModal] = useState<{
    channel: ParsedChannel;
    progress: any;
  } | null>(null);
  const watchItModalBackdropDownRef = useRef<boolean>(false);
  const watchItModalOpenedAtRef = useRef<number>(0);

  useEffect(() => {
    const onHistChanged = () => setHistoryRevision(r => r + 1);
    const onProgChanged = () => setProgressRevision(r => r + 1);
    window.addEventListener('achour_watch_history_changed', onHistChanged);
    window.addEventListener('achour_vod_progress_changed', onProgChanged);
    return () => {
      window.removeEventListener('achour_watch_history_changed', onHistChanged);
      window.removeEventListener('achour_vod_progress_changed', onProgChanged);
    };
  }, []);

  useEffect(() => {
    autoPlayAttemptRef.current = initialChannelToPlay || null;
    if (!initialChannelToPlay) {
      autoPlayTriggeredRef.current = false;
      autoPlayFallbackCalledRef.current = false;
    }
  }, [initialChannelToPlay?.stream_id]);

  const [forceInternalPlaybackOnce, setForceInternalPlaybackOnce] = useState(false);
  const [externalLaunchModal, setExternalLaunchModal] = useState<{
    result: ExternalLaunchResult;
    streamUrl: string;
    channel: ParsedChannel;
    playbackType: 'live' | 'movie' | 'series';
    copied?: boolean;
  } | null>(null);
  const externalLaunchOpenedAtRef = useRef<number>(0);
  const externalLaunchBackdropDownRef = useRef<boolean>(false);
  const detailsModalOpenedAtRef = useRef<number>(0);
  const detailsModalBackdropDownRef = useRef<boolean>(false);

  const resolveDirectStreamUrl = (
    rawUrl: string,
    targetItem: ParsedChannel | null | undefined,
    resolvedType: 'live' | 'movie' | 'series'
  ): string => {
    let finalUrl = (rawUrl || targetItem?.url || '').trim();
    if (!finalUrl && activePlaylist?.type === 'xtream' && activePlaylist.username && activePlaylist.password && targetItem) {
      let baseHost = streamingHost || (activePlaylist.url || '').trim()
        .replace(/\/+$/, '')
        .replace(/\/(player_api|get|index)\.php.*$/i, '')
        .replace(/\/c\/?$/i, '')
        .replace(/\?.*$/, '');
      if (baseHost && !baseHost.startsWith('http://') && !baseHost.startsWith('https://')) {
        baseHost = `http://${baseHost}`;
      }
      const effPlId = activePlaylist?.id || settings.activePlaylistId || 'default';
      const cleanId = cleanVodEntityId(
        (targetItem as any).xtream_id || targetItem.stream_id,
        effPlId
      ) || String(targetItem.stream_id || '').trim();

      if (baseHost && cleanId) {
        if (resolvedType === 'movie') {
          const ext = targetItem.container_extension || mediaDetailInfo?.movie_data?.container_extension || 'mp4';
          finalUrl = `${baseHost}/movie/${encodeURIComponent(activePlaylist.username)}/${encodeURIComponent(activePlaylist.password)}/${cleanId}.${ext}`;
        } else if (resolvedType === 'series') {
          const ext = targetItem.container_extension || 'mp4';
          finalUrl = `${baseHost}/series/${encodeURIComponent(activePlaylist.username)}/${encodeURIComponent(activePlaylist.password)}/${cleanId}.${ext}`;
        } else {
          finalUrl = `${baseHost}/live/${encodeURIComponent(activePlaylist.username)}/${encodeURIComponent(activePlaylist.password)}/${cleanId}.ts`;
        }
      }
    }

    if (finalUrl.includes('/api/proxy?')) {
      try {
        const parsedProxy = new URL(finalUrl.startsWith('http') ? finalUrl : `http://localhost${finalUrl}`);
        const unwrapped = parsedProxy.searchParams.get('url');
        if (unwrapped && unwrapped.trim()) {
          finalUrl = unwrapped.trim();
        }
      } catch {}
    }

    if (finalUrl.startsWith('/')) {
      finalUrl = window.location.origin + finalUrl;
    }
    return finalUrl;
  };

  const launchExternalPlayer = async (
    url: string,
    overrideChannel?: ParsedChannel,
    playbackType?: 'live' | 'movie' | 'series',
    positionMs?: number
  ): Promise<boolean> => {
    const targetItem = overrideChannel || selectedChannel;
    const effPlId = activePlaylist?.id || settings.activePlaylistId || 'default';
    const resolvedType = playbackType || (mediaType === 'series' ? 'series' : mediaType === 'movie' ? 'movie' : 'live');
    const finalUrl = resolveDirectStreamUrl(url, targetItem, resolvedType);

    // Ensure any internal native player or MultiView surface is cleared before transferring to an external player
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('native-player-active', 'native-player-preview');
      document.body.classList.remove('native-player-active', 'native-player-preview');
      document.documentElement.style.removeProperty('--native-preview-clip');
    }
    const native = typeof window !== 'undefined' ? (window as any).AchourNative : null;
    if (isNativeApp() && native) {
      try {
        native.hideAllMultiSlots?.();
        native.hidePlayer?.();
      } catch {}
    }

    const unifiedHeaders = buildUnifiedNativeHeaders(targetItem || {});
    const itemHeaders = (targetItem as any)?.headers && typeof (targetItem as any).headers === 'object'
      ? (targetItem as any).headers
      : {};
    const mergedHeaders = { ...unifiedHeaders, ...itemHeaders };
    const resolvedUa = (targetItem as any)?.userAgent || (targetItem as any)?.http_user_agent || mergedHeaders['User-Agent'] || '';
    const resolvedReferer = (targetItem as any)?.referer || (targetItem as any)?.http_referrer || mergedHeaders['Referer'] || '';

    const result = await launchExternalPlayerSession({
      streamUrl: finalUrl,
      playerName: settings.selectedPlayer || 'External Player',
      title: targetItem?.name || 'Achour Player',
      logo: targetItem?.stream_icon || targetItem?.cover || targetItem?.logo || '',
      streamId: targetItem?.stream_id || '',
      mediaType: resolvedType,
      isFavorite: favorites.includes(targetItem?.stream_id || ''),
      isAndroidEnv: isAndroid(),
      headers: mergedHeaders,
      userAgent: resolvedUa,
      referer: resolvedReferer,
      positionMs: typeof positionMs === 'number' && positionMs > 0 ? Math.round(positionMs) : 0,
    });

    if (!result.ok) {
      setStreamError(null);
      externalLaunchOpenedAtRef.current = Date.now();
      markLongPressModalOpened(550);
      setExternalLaunchModal({
        result,
        streamUrl: finalUrl,
        channel: targetItem || ({
          stream_id: 'external',
          name: 'Stream',
          url: finalUrl,
          category_id: '',
        } as ParsedChannel),
        playbackType: resolvedType,
        copied: false,
      });
      return false;
    }

    setExternalLaunchModal(null);
    setStreamError(null);
    if (targetItem) {
      addToRecents(targetItem);
      if (resolvedType === 'series') {
        addToWatchHistory('series', activeSeriesParentRef.current || targetItem, effPlId);
      } else if (resolvedType === 'movie') {
        addToWatchHistory('movie', targetItem, effPlId);
      } else {
        addToWatchHistory('live', targetItem, effPlId);
        saveLastWatchedChannel(targetItem, effPlId);
      }
    }
    return true;
  };




  const [mediaType, setMediaType] = useState<'live' | 'movie' | 'series' | 'favorites'>(initialType as any);
  const [categories, setCategories] = useState<ParsedCategory[]>([]);
  const [channels, setChannels] = useState<ParsedChannel[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedChannel, setSelectedChannel] = useState<ParsedChannel | null>(null);
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'none' | 'az'>('none');
  const [loading, setLoading] = useState(true);
  const [activePlaylist, setActivePlaylist] = useState<Playlist | null>(null);
  const [favorites, setFavorites] = useState<string[]>(() => getLocalFavoriteIds());
  const [vodFavorites, setVodFavorites] = useState<string[]>(() =>
    initialType === 'movie' || initialType === 'series' ? getLocalVodFavoriteIds(initialType) : []
  );
  const favoritesRef = useRef<string[]>(favorites);
  favoritesRef.current = favorites;
  const sortCategoriesBySavedOrderRef = useRef<(cats: ParsedCategory[]) => ParsedCategory[]>((c) => c);

  useEffect(() => {
    setSearch('');
    if (mediaType === 'movie' || mediaType === 'series') {
      setVodFavorites(getLocalVodFavoriteIds(mediaType));
    }
  }, [mediaType]);

  // Reset stale playback/EPG/detail states whenever active playlist changes
  useEffect(() => {
    sessionCategoriesCache.clear();
    sessionChannelsCache.clear();
    sessionSeriesDetailsCache.clear();
    sessionVodDetailsCache.clear();
    sessionChannelsTotalItems = 0;
    trimDbMemoryCaches();
    setSelectedChannel(null);
    setStreamError(null);
    setEpgData([]);
    setXmltvData({});
    setShortEpgCache({});
    setMediaDetailInfo(null);
    setMovieDetailsModal(null);
    shortEpgFetchedRef.current.clear();
  }, [settings.activePlaylistId]);

  // Load categories lazily from IndexedDB (with 0ms in-memory session cache)
  useEffect(() => {
    let cancelled = false;
    const loadCategories = async () => {
      setSelectedCategory('');
      setChannels([]);
      const typeToLoad = mediaType === 'favorites' ? 'live' : mediaType;

      try {
        const activeP = await fetchActivePlaylist();
        if (cancelled) return;

        const effectivePlaylistId = activeP?.id || settings.activePlaylistId || 'default';
        const sessionKey = `${effectivePlaylistId}_${typeToLoad}`;

        // 1. Instant 0ms return from in-memory session cache if already visited
        const inMemCats = sessionCategoriesCache.get(sessionKey);
        if (inMemCats && inMemCats.length > 0) {
          setCategories(inMemCats);
          const firstReal = inMemCats.find(c => c.category_id !== 'favorites');
          if (firstReal) {
            setSelectedCategory(firstReal.category_id);
          } else if (typeToLoad === 'live' && favoritesRef.current.length > 0) {
            setSelectedCategory('favorites');
          }
          setLoading(false);
          return;
        }

        setLoading(true);

        let formattedCats: ParsedCategory[] = [];
        let cachedCats = await getCategoriesByPlaylistAndType(effectivePlaylistId, typeToLoad as any);

        // One-time non-destructive repair for already-extracted M3U playlists where "General"
        // had previously been stored inside the "uncategorized" bucket instead of its own group.
        if (
          cachedCats.length > 0 &&
          activeP &&
          activeP.type !== 'xtream' &&
          !cachedCats.some((c: any) => String(c.category_name || c.name || c.category_id || '').trim().toLowerCase() === 'general')
        ) {
          try {
            const [hasUncat, alreadyChecked] = await Promise.all([
              hasCategoryBuckets(effectivePlaylistId, typeToLoad as any, 'uncategorized'),
              isLegacyGeneralRepairChecked(effectivePlaylistId, typeToLoad as any)
            ]);
            if (hasUncat && !alreadyChecked) {
              let rawText = (activeP as any).m3uContent || '';
              if (!rawText && activeP.url?.startsWith('local_file://')) {
                const fileName = activeP.url.replace('local_file://', '');
                rawText = localStorage.getItem('achour_m3u_file_' + fileName) || localStorage.getItem('achour_m3u_file_' + activeP.name) || '';
              } else if (!rawText && activeP.url && !activeP.url.includes('username=')) {
                const fetchUrl = getPlatformUrl('m3u', activeP.url);
                const resp = await fetch(fetchUrl);
                if (resp.ok) {
                  const lenHdr = resp.headers.get('content-length');
                  const totalBytes = lenHdr ? parseInt(lenHdr, 10) : 0;
                  if (!totalBytes || totalBytes <= 25 * 1024 * 1024) {
                    rawText = await resp.text();
                  }
                }
              }

              if (rawText) {
                const generalUrls = new Set<string>();
                const generalNames = new Set<string>();
                let generalOrderIdx = 0;
                const scanner = new StreamingM3UParser(4000, 0);
                const collect = (batch: any) => {
                  const list = batch[typeToLoad] || [];
                  for (let i = 0; i < list.length; i++) {
                    const entry = list[i];
                    if (String(entry.category_name || '').trim().toLowerCase() === 'general') {
                      if (entry.url) generalUrls.add(entry.url);
                      if (entry.name) generalNames.add(entry.name.trim().toLowerCase());
                    }
                  }
                  const catInfo = (batch.newCategories || []).find(
                    (c: any) => c.type === typeToLoad && String(c.category_name || '').trim().toLowerCase() === 'general'
                  );
                  if (catInfo && typeof catInfo.orderIndex === 'number') {
                    generalOrderIdx = catInfo.orderIndex;
                  }
                };
                scanner.feedChunk(rawText, collect);
                scanner.finish(collect);

                if (generalUrls.size > 0 || generalNames.size > 0) {
                  const promoted = await promoteUncategorizedItemsToGeneral(
                    effectivePlaylistId,
                    typeToLoad as any,
                    generalUrls,
                    generalNames,
                    generalOrderIdx
                  );
                  if (promoted) {
                    cachedCats = await getCategoriesByPlaylistAndType(effectivePlaylistId, typeToLoad as any);
                  }
                }
                await markLegacyGeneralRepairChecked(effectivePlaylistId, typeToLoad as any);
              }
            }
          } catch {}
        }

        if (cachedCats.length > 0) {
          formattedCats = cachedCats.map((c: any) => ({
            category_id: String(c.category_id || c.id || ''),
            category_name: String(c.category_name || c.name || ''),
            count: c.count || 0
          }));
        } else if (activeP && !ExtractionService.isExtracting(effectivePlaylistId)) {
          // Check if extraction status already exists
          const extStatus = await getPlaylistExtractionStatus(effectivePlaylistId);
          if (!extStatus || extStatus.stage === 'idle') {
            const { categories: fetchedCats, channels: fetchedChs } = await fetchChannelsForType(activeP, typeToLoad as any, [], false);
            if (fetchedCats.length > 0) {
              formattedCats = fetchedCats.map((c: any) => ({
                category_id: String(c.category_id || c.id || ''),
                category_name: String(c.category_name || c.name || ''),
                count: c.count || 0
              }));
              await saveCategories(formattedCats.map((c, idx) => ({ ...c, orderIndex: idx })), typeToLoad as any, effectivePlaylistId).catch(() => {});
            }
            if (fetchedChs.length > 0) {
              await saveChannels(fetchedChs, typeToLoad as any, effectivePlaylistId, { batchSize: 500 }).catch(() => {});
              if (formattedCats.length === 0) {
                const catMap = new Map<string, ParsedCategory>();
                fetchedChs.forEach((ch: any) => {
                  const catName = String(ch.category_name || ch.category || 'General');
                  const cid = String(ch.category_id || catName);
                  if (!catMap.has(cid)) {
                    catMap.set(cid, { category_id: cid, category_name: catName, count: 0 });
                  }
                  catMap.get(cid)!.count!++;
                });
                formattedCats = Array.from(catMap.values());
              }
            }
          }
        }

        if (cancelled) return;

        // Clean, deduplicate & sort real categories (never inject synthetic 'favorites' into raw categories state)
        const seenCatIds = new Set<string>();
        const dedupedCats: ParsedCategory[] = [];
        for (const c of formattedCats) {
          if (!c || !c.category_id || isFavCategory(c)) continue;
          if (seenCatIds.has(c.category_id)) continue;
          seenCatIds.add(c.category_id);
          dedupedCats.push(c);
        }
        const cleanCats = sortCategoriesBySavedOrderRef.current(dedupedCats);
        sessionCategoriesCache.set(sessionKey, cleanCats);

        setCategories(cleanCats);
        if (mediaType === 'live') {
          const firstReal = cleanCats.find(c => c.category_id !== 'favorites');
          if (firstReal) {
            setSelectedCategory(firstReal.category_id);
          } else if (favoritesRef.current.length > 0) {
            setSelectedCategory('favorites');
          } else {
            setSelectedCategory('');
          }
        } else if (mediaType !== 'favorites') {
          setSelectedCategory('__all__');
        } else if (cleanCats.length > 0) {
          setSelectedCategory(cleanCats[0].category_id);
        } else if (favoritesRef.current.length > 0) {
          setSelectedCategory('favorites');
        }
      } catch (e) {
        console.error('Failed to load categories:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadCategories();

    const onTypeReady = (e: any) => {
      const detail = e?.detail;
      const typeToLoad = mediaType === 'favorites' ? 'live' : mediaType;
      const effId = settings.activePlaylistId || 'default';
      if (!detail || detail.playlistId !== effId) return;
      if (detail.mediaType === 'categories' || detail.mediaType === typeToLoad) {
        sessionCategoriesCache.delete(`${effId}_${typeToLoad}`);
        loadCategories();
      }
    };
    window.addEventListener('achour_type_ready', onTypeReady);
    return () => {
      cancelled = true;
      window.removeEventListener('achour_type_ready', onTypeReady);
    };
  }, [mediaType, settings.activePlaylistId, userId]);

  const dbLookupSettledKeyRef = useRef<string>('');
  const [dbRefreshNonce, setDbRefreshNonce] = useState(0);
  const [categoryHasMore, setCategoryHasMore] = useState(false);
  const [categoryNextBucketOffset, setCategoryNextBucketOffset] = useState(0);
  const [categoryResolvedId, setCategoryResolvedId] = useState('');
  const [categorySearchMatches, setCategorySearchMatches] = useState<ParsedChannel[] | null>(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    const onTypeReady = (e: any) => {
      const detail = e?.detail;
      const typeToLoad = mediaType === 'favorites' ? 'live' : mediaType;
      const effId = activePlaylist?.id || settings.activePlaylistId || 'default';
      if (!detail || detail.playlistId !== effId) return;
      if (detail.mediaType === typeToLoad) {
        for (const k of Array.from(sessionChannelsCache.keys())) {
          if (k.startsWith(`${effId}_${typeToLoad}_`)) {
            const evicted = sessionChannelsCache.get(k);
            if (evicted) sessionChannelsTotalItems = Math.max(0, sessionChannelsTotalItems - evicted.length);
            sessionChannelsCache.delete(k);
          }
        }
        setDbRefreshNonce(n => n + 1);
      }
    };
    window.addEventListener('achour_type_ready', onTypeReady);
    return () => window.removeEventListener('achour_type_ready', onTypeReady);
  }, [mediaType, activePlaylist?.id, settings.activePlaylistId]);

  // Lazy load channels for the selected category ONLY using windowed bucket pagination (0 RAM explosion on 1M+ libraries)
  useEffect(() => {
    if (!selectedCategory) return;

    let isMounted = true;
    loadingMoreRef.current = false;
    setCategoryHasMore(false);
    setCategoryNextBucketOffset(0);
    setCategoryResolvedId('');
    setCategorySearchMatches(null);

    const loadChannels = async () => {
      const effectivePlId = activePlaylist?.id || settings.activePlaylistId || 'default';
      const typeToLoad = mediaType === 'favorites' ? 'live' : mediaType;
      const channelCacheKey = `${effectivePlId}_${typeToLoad}_${selectedCategory}`;
      dbLookupSettledKeyRef.current = '';

      try {
        if (selectedCategory === WATCH_HISTORY_CAT_ID) {
          if (!isMounted) return;
          dbLookupSettledKeyRef.current = channelCacheKey;
          const histType = (typeToLoad === 'movie' || typeToLoad === 'series') ? typeToLoad : 'live';
          setChannels(getWatchHistory(histType, effectivePlId));
          return;
        }

        if (selectedCategory === CONTINUE_WATCHING_CAT_ID) {
          if (!isMounted) return;
          dbLookupSettledKeyRef.current = channelCacheKey;
          const vodType: 'movie' | 'series' = typeToLoad === 'series' ? 'series' : 'movie';
          setChannels(getContinueWatchingItems(vodType, effectivePlId, getWatchHistory(vodType, effectivePlId)));
          return;
        }

        if (selectedCategory === 'favorites' || mediaType === 'favorites') {
          if (mediaType === 'movie' || mediaType === 'series') {
            if (!isMounted) return;
            setChannels([]);
            return;
          }
          const favItems = await getChannelsByIds(effectivePlId, 'live', favoritesRef.current);
          if (!isMounted) return;
          dbLookupSettledKeyRef.current = channelCacheKey;
          setChannels(favItems);
          return;
        }

        // 1. Check budgeted session LRU cache
        const cachedChs = sessionChannelsCache.get(channelCacheKey);
        if (cachedChs && cachedChs.length > 0) {
          if (!isMounted) return;
          dbLookupSettledKeyRef.current = channelCacheKey;
          setChannels(cachedChs);
          return;
        }

        const win = await getChannelsByCategoryWindowed(typeToLoad, selectedCategory, effectivePlId, {
          bucketOffset: 0,
          maxItems: isTVOrLowEndDevice() ? 1000 : 4000
        });
        if (!isMounted) return;
        dbLookupSettledKeyRef.current = channelCacheKey;

        const loadedItems = win.items || [];
        setCategoryHasMore(win.hasMore);
        setCategoryNextBucketOffset(win.nextBucketOffset);
        setCategoryResolvedId(win.resolvedCategoryId);

        if (loadedItems.length > 0 && !win.hasMore) {
          setSessionChannelsCache(channelCacheKey, loadedItems);
        }
        setChannels(loadedItems);
      } catch (e) {
        dbLookupSettledKeyRef.current = channelCacheKey;
        console.error('Failed to load category channels:', e);
      }
    };
    loadChannels();
    return () => { isMounted = false; };
  }, [selectedCategory, mediaType, activePlaylist?.id, settings.activePlaylistId, dbRefreshNonce]);

  useEffect(() => {
    if (selectedCategory === WATCH_HISTORY_CAT_ID) {
      const effectivePlId = activePlaylist?.id || settings.activePlaylistId || 'default';
      const typeToLoad = mediaType === 'favorites' ? 'live' : mediaType;
      const histType = (typeToLoad === 'movie' || typeToLoad === 'series') ? typeToLoad : 'live';
      setChannels(getWatchHistory(histType, effectivePlId));
      return;
    }
    if (selectedCategory === CONTINUE_WATCHING_CAT_ID) {
      const effectivePlId = activePlaylist?.id || settings.activePlaylistId || 'default';
      const vodType: 'movie' | 'series' = mediaType === 'series' ? 'series' : 'movie';
      setChannels(getContinueWatchingItems(vodType, effectivePlId, getWatchHistory(vodType, effectivePlId)));
    }
  }, [historyRevision, progressRevision, selectedCategory, mediaType, activePlaylist?.id, settings.activePlaylistId]);

  const handleLoadMoreCategoryChannels = useCallback(async () => {
    if (!categoryHasMore || loadingMoreRef.current) return;
    if (channels.length >= (isTVOrLowEndDevice() ? 12000 : 50000)) return;
    const effectivePlId = activePlaylist?.id || settings.activePlaylistId || 'default';
    const typeToLoad = mediaType === 'favorites' ? 'live' : mediaType;
    const catKey = categoryResolvedId || selectedCategory;
    if (!catKey || catKey === 'favorites' || catKey === 'recent') return;

    loadingMoreRef.current = true;
    try {
      const nextWin = await getChannelsByCategoryWindowed(typeToLoad, catKey, effectivePlId, {
        bucketOffset: categoryNextBucketOffset,
        maxItems: isTVOrLowEndDevice() ? 1500 : 4000
      });
      if (nextWin.items.length > 0) {
        setChannels(prev => prev.concat(nextWin.items));
      }
      setCategoryHasMore(nextWin.hasMore);
      setCategoryNextBucketOffset(nextWin.nextBucketOffset);
    } catch {
      setCategoryHasMore(false);
    } finally {
      loadingMoreRef.current = false;
    }
  }, [categoryHasMore, categoryNextBucketOffset, categoryResolvedId, selectedCategory, activePlaylist?.id, settings.activePlaylistId, mediaType, channels.length]);

  // Streaming IndexedDB search when searching inside a huge partially-loaded category
  useEffect(() => {
    const cleanQ = search.trim();
    if (!cleanQ || !categoryHasMore) {
      setCategorySearchMatches(null);
      return;
    }
    let cancelled = false;
    const effectivePlId = activePlaylist?.id || settings.activePlaylistId || 'default';
    const typeToLoad = mediaType === 'favorites' ? 'live' : mediaType;
    const catKey = categoryResolvedId || selectedCategory;

    const timer = setTimeout(async () => {
      const hits = await searchChannelsInCategory(effectivePlId, typeToLoad as any, catKey, cleanQ, 250);
      if (!cancelled) {
        setCategorySearchMatches(hits);
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, categoryHasMore, activePlaylist?.id, settings.activePlaylistId, mediaType, categoryResolvedId, selectedCategory]);

  // Refresh channels ONLY when viewing Live TV favorites and favorite list changes
  useEffect(() => {
    if (mediaType === 'movie' || mediaType === 'series') return;
    if (selectedCategory !== 'favorites' && mediaType !== 'favorites') return;
    let isMounted = true;
    const effectivePlId = activePlaylist?.id || settings.activePlaylistId || 'default';
    getChannelsByIds(effectivePlId, 'live', favorites).then((favList) => {
      if (!isMounted) return;
      setChannels(favList);
    }).catch(() => {});
    return () => { isMounted = false; };
  }, [favorites, selectedCategory, mediaType, activePlaylist?.id, settings.activePlaylistId]);

  const [streamingHost, setStreamingHost] = useState<string>('');
  const [showOcr, setShowOcr] = useState(false);
  const [showRemoteHelp, setShowRemoteHelp] = useState(false);
  const [showOverlayChannelDrawer, setShowOverlayChannelDrawer] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [activeVodPlayer, setActiveVodPlayer] = useState<ParsedChannel | null>(null);
  const [showEpgGrid, setShowEpgGrid] = useState(false);
  
  const [itemsToShow, setItemsToShow] = useState(100);
  const [movieDetailsModal, setMovieDetailsModal] = useState<ParsedChannel | null>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const detailsSeasonsScrollRef = useRef<HTMLDivElement>(null);
  const detailsEpisodesScrollRef = useRef<HTMLDivElement>(null);
  const autoFocusedSeriesIdRef = useRef<string | null>(null);

  // Multi-View State (Live TV only) - uses permanent hardware slotId (0..3) so reflow 4->3->2->1 never interrupts surviving channels
  const [multiViewMode, setMultiViewMode] = useState<1 | 2 | 3 | 4>(1);
  const [showMultiViewMenu, setShowMultiViewMenu] = useState(false);
  const [multiViewActive, setMultiViewActive] = useState(false);
  const [multiViewFullSplit, setMultiViewFullSplit] = useState<boolean>(() => Boolean(settings.multiViewFullSplit));
  const [multiViewThreeReverse, setMultiViewThreeReverse] = useState(false);
  const [multiViewPickingSlot, setMultiViewPickingSlot] = useState<number | null>(null);
  const [multiViewFullscreenSlot, setMultiViewFullscreenSlot] = useState<number | null>(null);
  const [multiViewSlots, setMultiViewSlots] = useState<MultiViewSlotItem[]>([]);
  const multiViewSlotsRef = useRef<MultiViewSlotItem[]>([]);
  multiViewSlotsRef.current = multiViewSlots;
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number>(0);
  const [audioSlotIndex, setAudioSlotIndex] = useState<number>(0);
  const preMultiViewChannelRef = useRef<ParsedChannel | null>(null);
  const multiViewChannelAspectRatiosRef = useRef<Record<string, MultiViewAspectRatio>>({});

  const handleSlotAspectRatioChange = useCallback((slotId: number, ratio: MultiViewAspectRatio) => {
    setMultiViewSlots((prev) =>
      prev.map((item) => {
        if (item.slotId !== slotId) return item;
        if (item.channel?.stream_id) {
          multiViewChannelAspectRatiosRef.current[item.channel.stream_id] = ratio;
        }
        return { ...item, aspectRatio: ratio };
      })
    );
  }, []);

  const setMultiViewFullSplitPersist = useCallback((nextVal: boolean) => {
    setMultiViewFullSplit(nextVal);
    onUpdateSettings((prev) => ({ ...prev, multiViewFullSplit: nextVal }));
  }, [onUpdateSettings]);

  const toggleMultiViewFullSplit = useCallback(() => {
    setMultiViewFullSplit((prev) => {
      const next = !prev;
      onUpdateSettings((s) => ({ ...s, multiViewFullSplit: next }));
      return next;
    });
  }, [onUpdateSettings]);

  // Complete Audio & Video Isolation: entering Multi-Screen immediately kills any hidden regular player (Web & Native APK)
  useEffect(() => {
    if (!multiViewActive) return;
    setSelectedChannel(null);
    setActivePlayingMovie(null);
    setIsFullscreen(false);
    setActiveVodPlayer(null);
    const native = typeof window !== 'undefined' ? (window as any).AchourNative : null;
    if (isNativeApp() && native?.hidePlayer) {
      try {
        native.hidePlayer();
      } catch {}
    }
  }, [multiViewActive]);

  const wasMultiViewActiveRef = useRef(false);

  // Sync WebView transparency cutouts & guarantee native MultiView ExoPlayer cleanup on exit/unmount
  useEffect(() => {
    const native = typeof window !== 'undefined' ? (window as any).AchourNative : null;
    if (!isNativeApp() || !native?.showMultiSlot) return;

    if (!multiViewActive) {
      if (wasMultiViewActiveRef.current) {
        wasMultiViewActiveRef.current = false;
        try {
          native.hideAllMultiSlots?.();
        } catch {}
      }
      if (!selectedChannel && !activeVodPlayer) {
        document.documentElement.classList.remove('native-player-active', 'native-player-preview');
        document.body.classList.remove('native-player-active', 'native-player-preview');
        document.documentElement.style.removeProperty('--native-preview-clip');
      }
      return;
    }

    wasMultiViewActiveRef.current = true;
    const rafId = requestAnimationFrame(() => {
      syncMultiViewNativeOverlay(multiViewFullscreenSlot !== null);
    });
    return () => cancelAnimationFrame(rafId);
  }, [multiViewActive, multiViewMode, multiViewFullSplit, multiViewThreeReverse, multiViewPickingSlot, multiViewFullscreenSlot, multiViewSlots, selectedChannel?.stream_id, activeVodPlayer]);

  useEffect(() => {
    const onNativeResume = (e: Event) => {
      const detail = (e as CustomEvent)?.detail || {};
      requestAnimationFrame(() => {
        if (multiViewActive) {
          syncMultiViewNativeOverlay(multiViewFullscreenSlot !== null);
        } else {
          const hasVod = Boolean(document.querySelector('[data-vod-native-active="true"]'));
          if (!hasVod) {
            document.documentElement.classList.remove('native-player-active', 'native-player-preview');
            document.body.classList.remove('native-player-active', 'native-player-preview');
            document.documentElement.style.removeProperty('--native-preview-clip');
          }
        }
        if (detail?.externalPlayerReturned || !getCurrentTVFocus()) {
          if (movieDetailsModal) {
            const target =
              document.querySelector<HTMLElement>('[data-tv-modal="details"][data-modal-role="play"]') ||
              document.querySelector<HTMLElement>('[data-tv-modal="details"]');
            if (target) setTVFocus(target, { scroll: false });
          } else if (tvFocusedPane.current === 'channels') {
            focusChannelAtIdx(tvFocusedChannelIndex.current >= 0 ? tvFocusedChannelIndex.current : 0);
          } else {
            ensureInitialFocus();
          }
        }
      });
    };
    window.addEventListener('achour_native_resume', onNativeResume);
    return () => {
      window.removeEventListener('achour_native_resume', onNativeResume);
      const native = typeof window !== 'undefined' ? (window as any).AchourNative : null;
      if (isNativeApp() && native?.hideAllMultiSlots) {
        try {
          native.hideAllMultiSlots();
        } catch {}
      }
    };
  }, [multiViewActive, multiViewFullscreenSlot, movieDetailsModal]);

  const externalLaunchOpen = Boolean(externalLaunchModal);
  const prevExternalLaunchOpenRef = useRef(false);
  useEffect(() => {
    if (externalLaunchOpen) {
      prevExternalLaunchOpenRef.current = true;
      const timer = setTimeout(() => {
        const target =
          document.querySelector<HTMLElement>('[data-external-primary="true"]') ||
          document.querySelector<HTMLElement>('[data-tv-modal="external-launch"]');
        if (target) setTVFocus(target, { scroll: false });
      }, 45);
      return () => clearTimeout(timer);
    } else if (prevExternalLaunchOpenRef.current) {
      prevExternalLaunchOpenRef.current = false;
      const timer = setTimeout(() => {
        if (movieDetailsModal) {
          const target =
            document.querySelector<HTMLElement>('[data-tv-modal="details"][data-modal-role="play"]') ||
            document.querySelector<HTMLElement>('[data-tv-modal="details"]');
          if (target) setTVFocus(target, { scroll: false });
        } else {
          tvFocusedPane.current = 'channels';
          focusChannelAtIdx(tvFocusedChannelIndex.current >= 0 ? tvFocusedChannelIndex.current : 0);
        }
      }, 45);
      return () => clearTimeout(timer);
    }
  }, [externalLaunchOpen, movieDetailsModal]);

  // D-Pad TV Remote Control Navigation States & Preview Refs
  const tvFocusedPane = useRef<'categories' | 'channels' | 'header' | 'player' | 'player-controls' | 'multiview'>('categories');
  const tvFocusedCatIndex = useRef<number>(0);
  const tvFocusedChannelIndex = useRef<number>(0);
  const tvFocusedControlIndex = useRef<number>(0);

  const previewDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const categoryNavDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const detailsPrefetchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentHighlightedChannelRef = useRef<string | null>(null);
  const filteredChannelsRef = useRef<ParsedChannel[]>([]);
  const visibleCategoriesRef = useRef<ParsedCategory[]>([]);
  const handleHighlightChannelRef = useRef<(ch: ParsedChannel) => void>(() => {});
  const handleOpenFullscreenRef = useRef<(ch: ParsedChannel) => void>(() => {});
  const handleChannelClickRef = useRef<(ch: ParsedChannel) => void>(() => {});
  const toggleFullscreenRef = useRef<() => void>(() => {});
  const virtualListRef = useRef<VirtualizedChannelListHandle | null>(null);
  const categoryListRef = useRef<VirtualizedCategoryListHandle | null>(null);
  const gridColumnCountRef = useRef<number>(4);

  const focusCategoryAtIdx = useCallback((nextIdx: number) => {
    const catsList = visibleCategoriesRef.current || [];
    if (catsList.length === 0) return;
    const safeIdx = Math.max(0, Math.min(catsList.length - 1, nextIdx));
    tvFocusedCatIndex.current = safeIdx;
    if (categoryListRef.current) {
      categoryListRef.current.focusIndex(safeIdx);
      return;
    }
    const targetEl = document.querySelector<HTMLElement>(
      `[data-tv-pane="categories"][data-cat-index="${safeIdx}"]`
    );
    if (targetEl) setTVFocus(targetEl, { scroll: true });
  }, []);

  const focusChannelAtIdx = useCallback((nextIdx: number) => {
    const channelsList = filteredChannelsRef.current || [];
    if (channelsList.length === 0) return;
    const safeIdx = Math.max(0, Math.min(channelsList.length - 1, nextIdx));
    tvFocusedChannelIndex.current = safeIdx;

    if (virtualListRef.current) {
      virtualListRef.current.focusIndex(safeIdx);
      return;
    }

    const targetEl = document.querySelector<HTMLElement>(
      `[data-tv-pane="channels"][data-index="${safeIdx}"]`
    );
    if (targetEl) setTVFocus(targetEl, { scroll: true });
  }, []);

  useEffect(() => {
    return () => {
      if (previewDebounceRef.current) {
        clearTimeout(previewDebounceRef.current);
      }
      if (categoryNavDebounceRef.current) {
        clearTimeout(categoryNavDebounceRef.current);
      }
      if (detailsPrefetchTimerRef.current) {
        clearTimeout(detailsPrefetchTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const restoreLastChannel = async () => {
      // Do not auto-select or auto-play channel on Live TV initial load so user can browse categories/channels first
      if (mediaType !== 'live' && channels.length > 0 && !selectedChannel) {
        try {
          const lastId = localStorage.getItem('achour_last_stream_id');
          if (lastId) {
            const lastCh = channels.find(c => c.stream_id === lastId);
            if (lastCh) {
              setSelectedChannel(lastCh);
            }
          }
        } catch (e) {}
      }
    };
    if (!loading) restoreLastChannel();
  }, [loading, channels, selectedChannel, mediaType]);

  // Register pushBackHandler in LivePlayer so remote & phone Back button navigates back cleanly


  useEffect(() => {
    setItemsToShow(100);
    tvFocusedChannelIndex.current = 0;
    virtualListRef.current?.resetToIndex(0);
  }, [selectedCategory, search, mediaType]);

  const scrollModalItemIntoContainer = useCallback(
    (container: HTMLElement | null, child: HTMLElement | null, axis: 'x' | 'y') => {
      if (!container || !child) return;
      try {
        const contRect = container.getBoundingClientRect();
        const childRect = child.getBoundingClientRect();
        if (axis === 'y' && contRect.height > 0) {
          const pad = 8;
          const scaleY = container.clientHeight / contRect.height;
          const relTop = (childRect.top - contRect.top) * scaleY;
          const relBottom = (childRect.bottom - contRect.top) * scaleY;
          if (relTop < pad) {
            container.scrollTop = Math.max(0, container.scrollTop + relTop - pad);
          } else if (relBottom + pad > container.clientHeight) {
            container.scrollTop = Math.max(0, container.scrollTop + relBottom + pad - container.clientHeight);
          }
        } else if (axis === 'x' && contRect.width > 0) {
          const pad = 10;
          const scaleX = container.clientWidth / contRect.width;
          const relLeft = (childRect.left - contRect.left) * scaleX;
          const relRight = (childRect.right - contRect.left) * scaleX;
          if (relLeft < pad) {
            container.scrollLeft = Math.max(0, container.scrollLeft + relLeft - pad);
          } else if (relRight + pad > container.clientWidth) {
            container.scrollLeft = Math.max(0, container.scrollLeft + relRight + pad - container.clientWidth);
          }
        }
      } catch {}
    },
    []
  );

  // Auto-focus inside Movie/Series details modal when it opens (restoring last-played episode on Back!)
  useEffect(() => {
    if (!movieDetailsModal) {
      autoFocusedSeriesIdRef.current = null;
      return;
    }
    try {
      window.scrollTo(0, 0);
      document.querySelectorAll<HTMLElement>('.achour-app-shell, [data-live-root="true"]').forEach((el) => {
        if (el.scrollTop !== 0) el.scrollTop = 0;
        if (el.scrollLeft !== 0) el.scrollLeft = 0;
      });
    } catch {}

    const rafId = requestAnimationFrame(() => {
      const dialog = document.querySelector<HTMLElement>('[data-tv-details-dialog="true"]');
      if (!dialog) return;
      let initialTarget: HTMLElement | null = null;
      if (returningEpisodeIdRef.current) {
        const retId = returningEpisodeIdRef.current;
        returningEpisodeIdRef.current = null;
        initialTarget = dialog.querySelector<HTMLElement>(`[data-episode-item="true"][data-episode-id="${retId}"]`);
      }
      if (!initialTarget) {
        initialTarget =
          dialog.querySelector<HTMLElement>('[data-tv-play-now="true"]') ||
          dialog.querySelector<HTMLElement>('[data-episode-item="true"][data-episode-resume="true"]') ||
          dialog.querySelector<HTMLElement>('[data-season-tab="true"][data-season-active="true"]') ||
          dialog.querySelector<HTMLElement>('[data-season-tab="true"]') ||
          dialog.querySelector<HTMLElement>('[data-episode-item="true"]') ||
          dialog.querySelector<HTMLElement>('[data-modal-role="favorite"]') ||
          dialog.querySelector<HTMLElement>('[data-tv-modal="details"]');
      }
      if (initialTarget) {
        setTVFocus(initialTarget, { scroll: false });
        requestAnimationFrame(() => {
          if (initialTarget?.hasAttribute('data-episode-item')) {
            scrollModalItemIntoContainer(detailsEpisodesScrollRef.current, initialTarget, 'y');
          } else if (initialTarget?.hasAttribute('data-season-tab')) {
            scrollModalItemIntoContainer(detailsSeasonsScrollRef.current, initialTarget, 'x');
          }
        });
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [movieDetailsModal, scrollModalItemIntoContainer]);



  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 100) {
      setItemsToShow(prev => prev + 100);
    }
  }, []);

  const [mediaDetailInfo, setMediaDetailInfo] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activePlayingMovie, setActivePlayingMovie] = useState<ParsedChannel | null>(null);
  const [selectedSeasonNum, setSelectedSeasonNum] = useState<number>(1);

  const seriesSeasonsData = useMemo(() => {
    const targetMedia = movieDetailsModal || activeSeriesParentRef.current || activeVodPlayer;
    if (mediaType !== 'series' || !targetMedia) return [];

    const effectivePlId = activePlaylist?.id || settings.activePlaylistId || 'default';
    const seriesIdClean = cleanVodEntityId(
      (targetMedia as any).series_id || targetMedia.stream_id || (targetMedia as any).id,
      effectivePlId
    );
    const parentSeriesTitle = activeSeriesParentRef.current?.name || targetMedia.name;

    const epBuckets = new Map<number, { seasonNum: number; rawTitle?: string; episodes: any[] }>();
    const pushToBucket = (sNum: number, list: any[], rawTitle?: string) => {
      if (!Array.isArray(list) || list.length === 0) return;
      const existing = epBuckets.get(sNum);
      if (existing) {
        existing.episodes.push(...list);
        if (!existing.rawTitle && rawTitle) existing.rawTitle = rawTitle;
      } else {
        epBuckets.set(sNum, { seasonNum: sNum, rawTitle, episodes: [...list] });
      }
    };

    const parseSeasonNumber = (val: any, fallback: number): number => {
      if (typeof val === 'number' && Number.isFinite(val) && val > 0) return val;
      const match = String(val ?? '').match(/\d+/);
      if (match) {
        const parsed = parseInt(match[0], 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
      return fallback;
    };

    if (mediaDetailInfo?.episodes) {
      if (Array.isArray(mediaDetailInfo.episodes)) {
        mediaDetailInfo.episodes.forEach((ep: any) => {
          const sNum = parseSeasonNumber(ep?.season ?? ep?.season_num ?? ep?.season_number, 1);
          pushToBucket(sNum, [ep]);
        });
      } else if (typeof mediaDetailInfo.episodes === 'object') {
        Object.entries(mediaDetailInfo.episodes).forEach(([rawKey, val], idx) => {
          if (Array.isArray(val)) {
            const sNum = parseSeasonNumber(rawKey, idx + 1);
            pushToBucket(sNum, val);
          } else if (val && typeof val === 'object') {
            const innerList = Array.isArray((val as any).episodes) ? (val as any).episodes : Object.values(val);
            const sNum = parseSeasonNumber((val as any).season_number ?? rawKey, idx + 1);
            pushToBucket(sNum, innerList, (val as any).name);
          }
        });
      }
    } else if (Array.isArray(mediaDetailInfo?.seasons)) {
      mediaDetailInfo.seasons.forEach((s: any, idx: number) => {
        if (Array.isArray(s?.episodes) && s.episodes.length > 0) {
          const sNum = parseSeasonNumber(s.season_number ?? s.season ?? s.name, idx + 1);
          pushToBucket(sNum, s.episodes, s.name);
        }
      });
    }

    const sortedBuckets = Array.from(epBuckets.values()).sort((a, b) => a.seasonNum - b.seasonNum);
    if (sortedBuckets.length > 0) {
      return sortedBuckets.map((bucket) => {
        const seasonNum = bucket.seasonNum;
        const sortedRawEps = [...bucket.episodes].sort((a, b) => {
          const aNum = parseInt(String(a?.episode_num ?? a?.episode ?? 0), 10) || 0;
          const bNum = parseInt(String(b?.episode_num ?? b?.episode ?? 0), 10) || 0;
          return aNum - bNum;
        });

        const episodesList = sortedRawEps.map((ep: any, idx: number) => {
          const epNum = parseInt(String(ep.episode_num ?? ep.episode ?? idx + 1), 10) || (idx + 1);
          const trueEpId = cleanVodEntityId(
            ep.xtream_id ?? ep.original_id ?? ep.stream_id ?? ep.id,
            effectivePlId,
            seriesIdClean
          );
          const rawStreamId = trueEpId || String(ep.stream_id || ep.id || `${seriesIdClean || targetMedia.stream_id}-s${seasonNum}-e${epNum}`);
          const cleanStreamId = rawStreamId.replace(/\.(mp4|mkv|avi|mov|webm|ts|m3u8)$/i, '');
          const ext = ep.container_extension || targetMedia.container_extension || 'mp4';
          const directSourceClean = typeof ep.direct_source === 'string' ? ep.direct_source.trim() : '';

          let epDirectUrl = ep.stream_url || directSourceClean || ep.url || targetMedia.url;
          if (activePlaylist?.type === 'xtream' && activePlaylist.username && activePlaylist.password && !directSourceClean) {
            let baseHost = streamingHost || (activePlaylist.url || '').trim().replace(/\/+$/, '').replace(/\/(player_api|get|index)\.php.*$/i, '').replace(/\/c\/?$/i, '').replace(/\?.*$/, '');
            if (baseHost && !baseHost.startsWith('http://') && !baseHost.startsWith('https://')) {
              baseHost = `http://${baseHost}`;
            }
            epDirectUrl = `${baseHost}/series/${encodeURIComponent(activePlaylist.username)}/${encodeURIComponent(activePlaylist.password)}/${cleanStreamId}.${ext}`;
          }

          return {
            stream_id: cleanStreamId,
            xtream_id: cleanStreamId,
            series_id: seriesIdClean || String(targetMedia.stream_id || ''),
            series_name: parentSeriesTitle,
            type: 'series' as const,
            name: `${parentSeriesTitle} - S${seasonNum} E${epNum}: ${ep.title || ep.name || (isRtl ? `الحلقة ${epNum}` : `Episode ${epNum}`)}`,
            stream_icon: ep.info?.movie_image || ep.info?.cover_big || targetMedia.stream_icon,
            url: epDirectUrl,
            category_id: targetMedia.category_id,
            category_name: targetMedia.category_name,
            container_extension: ext,
            duration: ep.info?.duration || ep.duration,
            season: seasonNum,
            season_num: seasonNum,
            episode: epNum,
            episode_num: epNum
          };
        });

        return {
          seasonNumber: seasonNum,
          title: bucket.rawTitle || (isRtl ? `الموسم ${seasonNum}` : `Season ${seasonNum}`),
          episodes: episodesList
        };
      });
    }

    return [];
  }, [mediaType, movieDetailsModal, activeVodPlayer, mediaDetailInfo, activePlaylist, streamingHost, isRtl, settings.activePlaylistId]);

  useEffect(() => {
    if (!movieDetailsModal || mediaType !== 'series' || seriesSeasonsData.length === 0) return;
    const modalSid = String((movieDetailsModal as any).series_id || movieDetailsModal.stream_id || '');
    if (autoSeasonSelectedRef.current !== modalSid) {
      autoSeasonSelectedRef.current = modalSid;
      const plId = activePlaylist?.id || settings.activePlaylistId || 'default';
      const unfinished = getSeriesLastUnfinishedEpisode(plId, modalSid);
      if (unfinished && seriesSeasonsData.some(s => s.seasonNumber === unfinished.seasonNum)) {
        setSelectedSeasonNum(unfinished.seasonNum);
        return;
      }
    }
    if (!seriesSeasonsData.some(s => s.seasonNumber === selectedSeasonNum)) {
      setSelectedSeasonNum(seriesSeasonsData[0].seasonNumber);
    }
  }, [seriesSeasonsData, selectedSeasonNum, movieDetailsModal, mediaType, activePlaylist?.id, settings.activePlaylistId]);

  useEffect(() => {
    if (detailsEpisodesScrollRef.current && !returningEpisodeIdRef.current) {
      detailsEpisodesScrollRef.current.scrollTop = 0;
    }
  }, [selectedSeasonNum, movieDetailsModal]);

  // Once series seasons/episodes load asynchronously, place initial focus on quick-resume / active season tab if user is still on header/footer
  useEffect(() => {
    if (!movieDetailsModal || seriesSeasonsData.length === 0) return;
    if (autoFocusedSeriesIdRef.current === movieDetailsModal.stream_id) return;
    autoFocusedSeriesIdRef.current = movieDetailsModal.stream_id;

    const timer = setTimeout(() => {
      const dialog = document.querySelector<HTMLElement>('[data-tv-details-dialog="true"]');
      if (!dialog) return;
      const cur = getCurrentTVFocus();
      const role = cur?.getAttribute('data-modal-role');
      if (!cur || !dialog.contains(cur) || role === 'close' || role === 'favorite') {
        const preferred =
          dialog.querySelector<HTMLElement>('[data-tv-play-now="true"]') ||
          dialog.querySelector<HTMLElement>('[data-season-tab="true"][data-season-active="true"]') ||
          dialog.querySelector<HTMLElement>('[data-season-tab="true"]');
        if (preferred) {
          setTVFocus(preferred, { scroll: false });
        }
      }
    }, 35);
    return () => clearTimeout(timer);
  }, [movieDetailsModal, seriesSeasonsData.length]);

  const parsedSubscription = useMemo(() => {
    if (!activePlaylist || !activePlaylist.expDate) return null;
    return parseExpiryDate(activePlaylist.expDate, isRtl);
  }, [activePlaylist?.expDate, isRtl]);

  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [brightness, setBrightness] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [selectedQuality, setSelectedQuality] = useState<string>('4K Ultra HD');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '4:3' | 'fill' | 'fit'>('16:9');
  
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showSubMenu, setShowSubMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState('Audio 1 (الأساسي - Primary)');
  const [selectedSubtitleTrack, setSelectedSubtitleTrack] = useState('Off (مغلق)');
  const [subtitleActive, setSubtitleActive] = useState<boolean>(false);





  const handleNextChannel = useCallback(() => {
    if (multiViewActive || !channels || channels.length === 0) return;
    const curIndex = channels.findIndex(c => c.stream_id === selectedChannel?.stream_id);
    const nextIndex = curIndex >= 0 ? (curIndex + 1) % channels.length : 0;
    const nextCh = channels[nextIndex];
    setSelectedChannel(nextCh);
    setActivePlayingMovie(nextCh);
    addToRecents(nextCh);
  }, [multiViewActive, channels, selectedChannel]);

  const handlePrevChannel = useCallback(() => {
    if (multiViewActive || !channels || channels.length === 0) return;
    const curIndex = channels.findIndex(c => c.stream_id === selectedChannel?.stream_id);
    const prevIndex = curIndex > 0 ? curIndex - 1 : channels.length - 1;
    const prevCh = channels[prevIndex];
    setSelectedChannel(prevCh);
    setActivePlayingMovie(prevCh);
    addToRecents(prevCh);
  }, [multiViewActive, channels, selectedChannel]);



  const [showControls, setShowControls] = useState<boolean>(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const triggerControlsVisibility = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (!showAudioMenu && !showSubMenu && !showQualityMenu && !movieDetailsModal) {
        setShowControls(false);
      }
    }, isFullscreen ? 8000 : 5000);
  }, [showAudioMenu, showSubMenu, showQualityMenu, movieDetailsModal, isFullscreen]);

  const toggleControlsVisibility = useCallback(() => {
    setShowControls(prev => {
      const next = !prev;
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      if (next) {
        controlsTimeoutRef.current = setTimeout(() => {
          if (!showAudioMenu && !showSubMenu && !showQualityMenu && !movieDetailsModal) {
            setShowControls(false);
          }
        }, isFullscreen ? 8000 : 5000);
      }
      return next;
    });
  }, [showAudioMenu, showSubMenu, showQualityMenu, movieDetailsModal, isFullscreen]);

  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (showAudioMenu || showSubMenu || showQualityMenu) {
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    }
  }, [showAudioMenu, showSubMenu, showQualityMenu]);

  const [showEpgTimeline, setShowEpgTimeline] = useState(false);
  const [reorderTarget, setReorderTarget] = useState<{ type: 'category' | 'channel', id: string, index: number, name: string } | null>(null);
  const prevReorderTargetIdRef = useRef<string | null>(null);

  useEffect(() => {
    const hasActiveModal = !!(externalLaunchModal || showOcr || showPinModal || showRemoteHelp || showOverlayChannelDrawer || movieDetailsModal || reorderTarget || showEpgGrid || showEpgTimeline || showAudioMenu || showSubMenu || showQualityMenu || isFullscreen);
    const priority = hasActiveModal ? BackPriority.MODAL : BackPriority.VIEW;

    const unregister = pushBackHandler(() => {
      if (externalLaunchModal) {
        setExternalLaunchModal(null);
        setTimeout(() => {
          if (movieDetailsModal) {
            const target =
              document.querySelector<HTMLElement>('[data-tv-modal="details"][data-modal-role="play"]') ||
              document.querySelector<HTMLElement>('[data-tv-modal="details"]');
            if (target) setTVFocus(target, { scroll: false });
          } else {
            tvFocusedPane.current = 'channels';
            focusChannelAtIdx(tvFocusedChannelIndex.current);
          }
        }, 30);
        return true;
      }
      if (showOcr) { setShowOcr(false); return true; }
      if (showPinModal) { setShowPinModal(false); return true; }
      if (showRemoteHelp) { setShowRemoteHelp(false); return true; }
      if (showOverlayChannelDrawer) { setShowOverlayChannelDrawer(false); return true; }
      if (reorderTarget) { setReorderTarget(null); return true; }
      if (showMultiViewMenu) { setShowMultiViewMenu(false); return true; }
      if (multiViewFullscreenSlot !== null) {
        const slot = multiViewFullscreenSlot;
        setMultiViewFullscreenSlot(null);
        tvFocusedPane.current = 'multiview';
        setTimeout(() => { const el = document.getElementById(`multiview-slot-${slot}`); if (el) setTVFocus(el); }, 40);
        return true;
      }
      if (multiViewPickingSlot !== null) {
        setMultiViewPickingSlot(null);
        tvFocusedPane.current = 'multiview';
        setTimeout(() => { const el = document.getElementById(`multiview-slot-${selectedSlotIndex}`); if (el) setTVFocus(el); }, 40);
        return true;
      }
      if (multiViewActive && multiViewFullSplit) {
        setMultiViewFullSplitPersist(false);
        tvFocusedPane.current = 'multiview';
        setTimeout(() => { const el = document.getElementById(`multiview-slot-${Math.max(0, selectedSlotIndex)}`); if (el) setTVFocus(el); }, 40);
        return true;
      }
      if (movieDetailsModal) {
        setMovieDetailsModal(null);
        setTimeout(() => {
          tvFocusedPane.current = 'channels';
          focusChannelAtIdx(tvFocusedChannelIndex.current);
        }, 30);
        return true;
      }
      if (showEpgGrid) { setShowEpgGrid(false); return true; }
      if (showEpgTimeline) { setShowEpgTimeline(false); return true; }
      if (showAudioMenu || showSubMenu || showQualityMenu) {
        setShowAudioMenu(false); setShowSubMenu(false); setShowQualityMenu(false);
        return true;
      }

      if (isFullscreen) {
        setIsFullscreen(false);
        setActiveVodPlayer(null);
        if (toggleFullscreenRef.current) toggleFullscreenRef.current();
        setTimeout(() => {
          tvFocusedPane.current = 'channels';
          focusChannelAtIdx(tvFocusedChannelIndex.current);
        }, 30);
        return true;
      }

      if (activeVodPlayer) {
        const currentSeries = activeSeriesParentRef.current || activeVodPlayer;
        setActiveVodPlayer(null);
        if (currentSeries && mediaType === 'series') {
          setMovieDetailsModal(currentSeries);
        } else {
          setTimeout(() => {
            tvFocusedPane.current = 'channels';
            focusChannelAtIdx(tvFocusedChannelIndex.current);
          }, 30);
        }
        return true;
      }

      if (tvFocusedPane.current === 'multiview') {
        tvFocusedPane.current = 'channels';
        focusChannelAtIdx(tvFocusedChannelIndex.current >= 0 ? tvFocusedChannelIndex.current : 0);
        return true;
      }

      if (tvFocusedPane.current === 'channels' || tvFocusedPane.current === 'player') {
        tvFocusedPane.current = 'categories';
        focusCategoryAtIdx(tvFocusedCatIndex.current);
        return true;
      }

      onBack();
      return true;
    }, priority);

    return unregister;
  }, [
    externalLaunchModal, showOcr, showPinModal, showRemoteHelp, showOverlayChannelDrawer, reorderTarget,
    showMultiViewMenu, multiViewActive, multiViewFullSplit, setMultiViewFullSplitPersist, multiViewFullscreenSlot, multiViewPickingSlot, selectedSlotIndex, movieDetailsModal, showEpgGrid, showEpgTimeline, showAudioMenu,
    showSubMenu, showQualityMenu, isFullscreen, activeVodPlayer, mediaType, onBack
  ]);

  const [epgData, setEpgData] = useState<any[]>([]);
  const [epgLoading, setEpgLoading] = useState(false);
  const [xmltvData, setXmltvData] = useState<Record<string, any[]>>({});
  const [shortEpgCache, setShortEpgCache] = useState<Record<string, any[]>>({});
  const shortEpgFetchedRef = useRef<Set<string>>(new Set());

  const decodeEpgText = (val: any): string => {
    if (!val || typeof val !== 'string') return '';
    let trimmed = val.trim();
    if (!trimmed) return '';
    // Decode UTF-8 base64 strings commonly returned by Xtream get_short_epg
    if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length >= 4 && trimmed.length % 4 === 0 && !trimmed.includes(' ')) {
      try {
        const binary = atob(trimmed);
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        if (decoded && !/\uFFFD/.test(decoded)) {
          trimmed = decoded.trim();
        }
      } catch (e) {}
    }
    return trimmed
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  };

  const parseXmlTvTimestamp = (timeStr: string): Date | null => {
    if (!timeStr) return null;
    const m = timeStr.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\s*([+-])(\d{2}):?(\d{2})|Z)?/);
    if (!m) {
      const parsed = new Date(timeStr);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const d = parseInt(m[3], 10);
    const h = parseInt(m[4], 10);
    const min = parseInt(m[5], 10);
    const s = m[6] ? parseInt(m[6], 10) : 0;

    if (m[7]) {
      const sign = m[7] === '-' ? -1 : 1;
      const offsetMins = sign * (parseInt(m[8], 10) * 60 + parseInt(m[9], 10));
      const utcMs = Date.UTC(y, mo, d, h, min, s) - offsetMins * 60000;
      return new Date(utcMs);
    }
    if (timeStr.trim().endsWith('Z')) {
      return new Date(Date.UTC(y, mo, d, h, min, s));
    }
    return new Date(y, mo, d, h, min, s);
  };

  const normalizeEpgKey = (val: string): string =>
    String(val || '').replace(/\|AR\||\|EN\||HD|FHD|4K|RAW|SD|HEVC|\+|:-/gi, '').trim().toLowerCase();

  const parseXMLTV = async (xmlText: string, isCancelled?: () => boolean) => {
    try {
      if (!xmlText || typeof xmlText !== 'string') return;
      const lowMem = isTVOrLowEndDevice();
      const nowMs = Date.now();
      const windowStart = nowMs - (lowMem ? 3 : 8) * 3600 * 1000;
      const windowEnd = nowMs + (lowMem ? 12 : 36) * 3600 * 1000;
      const maxPrograms = lowMem ? 8000 : 30000;

      // 1) Index <channel id="..."> <display-name> aliases cleanly without heavy DOMParser allocation
      const channelAliasMap = new Map<string, string[]>();
      const chRegex = /<channel\b[^>]*\bid=["']([^"']+)["'][^>]*>([\s\S]*?)<\/channel>/gi;
      let chMatch: RegExpExecArray | null;
      let iter = 0;
      while ((chMatch = chRegex.exec(xmlText)) !== null) {
        if (++iter % 200 === 0) {
          await new Promise(r => setTimeout(r, 0));
          if (isCancelled?.()) return;
        }
        const cid = chMatch[1].trim();
        const body = chMatch[2];
        const names: string[] = [];
        const dnRegex = /<display-name[^>]*>([\s\S]*?)<\/display-name>/gi;
        let dnMatch: RegExpExecArray | null;
        while ((dnMatch = dnRegex.exec(body)) !== null) {
          const decodedName = decodeEpgText(dnMatch[1].replace(/<[^>]+>/g, ''));
          if (decodedName) names.push(decodedName);
        }
        if (names.length > 0) {
          channelAliasMap.set(cid, names);
        }
      }

      // 2) Chunk-yielded scan of <programme ...> tags keeping only active tight window & capped entries
      const epgMap: Record<string, any[]> = {};
      const progRegex = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;
      let pMatch: RegExpExecArray | null;
      let keptCount = 0;
      iter = 0;
      while ((pMatch = progRegex.exec(xmlText)) !== null) {
        if (++iter % 200 === 0) {
          await new Promise(r => setTimeout(r, 0));
          if (isCancelled?.()) return;
        }
        const attrs = pMatch[1];
        const body = pMatch[2];

        const startAttr = attrs.match(/\bstart=["']([^"']+)["']/i)?.[1];
        const stopAttr = attrs.match(/\bstop=["']([^"']+)["']/i)?.[1];
        const channelId = attrs.match(/\bchannel=["']([^"']+)["']/i)?.[1]?.trim();
        if (!channelId || !startAttr || !stopAttr) continue;

        const startTime = parseXmlTvTimestamp(startAttr);
        const stopTime = parseXmlTvTimestamp(stopAttr);
        if (!startTime || !stopTime) continue;

        if (stopTime.getTime() < windowStart || startTime.getTime() > windowEnd) continue;

        const rawTitle = body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
        const rawDesc = body.match(/<desc\b[^>]*>([\s\S]*?)<\/desc>/i)?.[1] || '';
        const title = decodeEpgText(rawTitle.replace(/<[^>]+>/g, '')) || (isRtl ? 'بدون عنوان' : 'No Title');
        const desc = decodeEpgText(rawDesc.replace(/<[^>]+>/g, ''));

        const entry = {
          title,
          description: desc,
          start: startTime,
          stop: stopTime,
          timeRange: `${String(startTime.getHours()).padStart(2, '0')}:${String(startTime.getMinutes()).padStart(2, '0')} - ${String(stopTime.getHours()).padStart(2, '0')}:${String(stopTime.getMinutes()).padStart(2, '0')}`
        };

        if (!epgMap[channelId]) epgMap[channelId] = [];
        epgMap[channelId].push(entry);

        const lowerId = channelId.toLowerCase();
        if (lowerId !== channelId && !epgMap[lowerId]) {
          epgMap[lowerId] = epgMap[channelId];
        }

        if (++keptCount >= maxPrograms) break;
      }

      if (isCancelled?.()) return;

      // Sort unique buckets and attach normalized display-name pointers (shared array reference = 0 extra memory)
      const sortedArrays = new Set<any[]>();
      Object.keys(epgMap).forEach(cid => {
        const list = epgMap[cid];
        if (!sortedArrays.has(list)) {
          sortedArrays.add(list);
          list.sort((a, b) => a.start.getTime() - b.start.getTime());
        }
        const aliases = channelAliasMap.get(cid);
        if (aliases) {
          for (const alias of aliases) {
            if (!epgMap[alias]) epgMap[alias] = list;
            const normAlias = normalizeEpgKey(alias);
            if (normAlias && !epgMap[normAlias]) epgMap[normAlias] = list;
          }
        }
      });

      setXmltvData(epgMap);
    } catch (err) {
      console.warn('parseXMLTV error:', err);
    }
  };

  const parseXtreamEpgTimestamp = (tsVal: any, dateStrVal: any): Date | null => {
    if (tsVal !== undefined && tsVal !== null && String(tsVal).trim() !== '') {
      const n = Number(tsVal);
      if (!isNaN(n) && n > 0) {
        return new Date(n < 1e12 ? n * 1000 : n);
      }
    }
    if (dateStrVal && typeof dateStrVal === 'string') {
      const cleaned = dateStrVal.trim();
      const isoAttempt = cleaned.includes('T') ? cleaned : cleaned.replace(' ', 'T');
      const d = new Date(isoAttempt);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  };

  const fetchEPG = async (streamId: string) => {
    if (activePlaylist?.type !== 'xtream') return;
    setEpgLoading(true);
    try {
      const host = (activePlaylist.url || '').trim().replace(/\/+$/, '').replace(/\/(player_api|get|index)\.php.*$/i, '').replace(/\/c\/?$/i, '').replace(/\?.*$/, '');
      const res = await xtreamFetch(host, activePlaylist.username || '', activePlaylist.password || '', 'get_short_epg', { stream_id: streamId, limit: '10' });
      const listings = res.data?.epg_listings || res.data?.listings || (Array.isArray(res.data) ? res.data : []);
      if (res.ok && Array.isArray(listings)) setEpgData(listings);
      else setEpgData([]);
    } catch (e) {
      setEpgData([]);
    } finally {
      setEpgLoading(false);
    }
  };

  useEffect(() => {
    shortEpgFetchedRef.current.clear();
    setShortEpgCache({});

    // Never auto-download multi-MB XMLTV in VOD/Series mode, or on low-RAM Fire TV unless full EPG Grid is explicitly opened
    // (Per-channel get_short_epg handles Live mini & fullscreen infobar guides in <3KB with zero memory spikes)
    if ((mediaType !== 'live' && mediaType !== 'favorites') || (isTVOrLowEndDevice() && !showEpgGrid)) {
      return;
    }

    let cancelled = false;
    let started = false;
    let activeAbort: AbortController | null = null;

    const loadGlobalEPG = async () => {
      if (cancelled || started) return;
      if (ExtractionService.isAnyExtracting()) return;
      started = true;

      let epgUrlToUse = activePlaylist?.epgUrl;
      if (!epgUrlToUse && activePlaylist?.type === 'xtream') {
        const rawHost = activePlaylist.url || activePlaylist.portal || '';
        let cleanHost = rawHost.trim().replace(/\/+$/, '').replace(/\/(player_api|get|index)\.php.*$/i, '').replace(/\/c\/?$/i, '').replace(/\?.*$/, '').replace(/\/+$/, '');
        if (cleanHost && !cleanHost.startsWith('http')) cleanHost = 'http://' + cleanHost;
        if (cleanHost && activePlaylist.username && activePlaylist.password) {
          epgUrlToUse = `${cleanHost}/xmltv.php?username=${encodeURIComponent(activePlaylist.username)}&password=${encodeURIComponent(activePlaylist.password)}`;
        }
      }

      if (!epgUrlToUse) {
        setXmltvData({});
        return;
      }

      const maxBytes = isTVOrLowEndDevice() ? 8 * 1024 * 1024 : 35 * 1024 * 1024;
      activeAbort = new AbortController();
      const timeoutId = setTimeout(() => activeAbort?.abort(), 30000);

      try {
        const fetchUrl = getPlatformUrl('epg', epgUrlToUse);
        const resp = await fetch(fetchUrl, { signal: activeAbort.signal });
        if (!resp.ok || cancelled) return;

        const contentLenHeader = resp.headers.get('content-length');
        const declaredLen = contentLenHeader ? parseInt(contentLenHeader, 10) : 0;
        if (declaredLen > maxBytes) {
          activeAbort.abort();
          return;
        }

        let xmlText = '';
        if (resp.body && typeof resp.body.getReader === 'function') {
          const reader = resp.body.getReader();
          const decoder = new TextDecoder('utf-8', { fatal: false });
          let totalBytes = 0;
          const chunks: string[] = [];
          while (true) {
            const { done, value } = await reader.read();
            if (done || cancelled) break;
            if (value) {
              totalBytes += value.byteLength;
              if (totalBytes > maxBytes) {
                activeAbort.abort();
                return;
              }
              chunks.push(decoder.decode(value, { stream: true }));
            }
          }
          chunks.push(decoder.decode());
          xmlText = chunks.join('');
        } else {
          xmlText = await resp.text();
          if (xmlText.length > maxBytes) return;
        }

        if (!cancelled && xmlText && xmlText.includes('<')) {
          await parseXMLTV(xmlText, () => cancelled);
        }
      } catch (err) {
        if ((err as any)?.name !== 'AbortError') {
          console.warn('Global EPG fetch error:', err);
        }
      } finally {
        clearTimeout(timeoutId);
      }
    };

    const onExtractionProgress = (e: any) => {
      const stage = e?.detail?.stage;
      if (stage === 'completed' || stage === 'paused' || stage === 'error') {
        setTimeout(() => { if (!cancelled) loadGlobalEPG(); }, 600);
      }
    };

    window.addEventListener('achour_extraction_progress', onExtractionProgress);
    const initTimer = setTimeout(loadGlobalEPG, 2000);
    return () => {
      cancelled = true;
      clearTimeout(initTimer);
      activeAbort?.abort();
      window.removeEventListener('achour_extraction_progress', onExtractionProgress);
    };
  }, [activePlaylist, mediaType, showEpgGrid]);

  // Fetch per-channel short program guide from Xtream after channel settles so zapping stays fast
  useEffect(() => {
    if ((mediaType !== 'live' && mediaType !== 'favorites') || !selectedChannel || activePlaylist?.type !== 'xtream') return;
    const cid = String(selectedChannel.stream_id || '');
    if (!cid) return;

    const existingPrograms = findProgramsForChannel(selectedChannel);
    if (existingPrograms && existingPrograms.length > 0) return;
    if (shortEpgFetchedRef.current.has(cid)) return;

    let cancelled = false;
    const delayMs = isFullscreen ? 650 : 250;
    const timer = setTimeout(() => {
      if (cancelled) return;
      if (shortEpgFetchedRef.current.size > 200) shortEpgFetchedRef.current.clear();
      shortEpgFetchedRef.current.add(cid);
      const host = (activePlaylist.url || '').trim().replace(/\/+$/, '').replace(/\/(player_api|get|index)\.php.*$/i, '').replace(/\/c\/?$/i, '').replace(/\?.*$/, '');
      xtreamFetch(host, activePlaylist.username || '', activePlaylist.password || '', 'get_short_epg', { stream_id: cid, limit: '10' }, 1)
        .then((res) => {
          if (cancelled) return;
          const listings = res.data?.epg_listings || res.data?.listings || (Array.isArray(res.data) ? res.data : []);
          if (res.ok && Array.isArray(listings) && listings.length > 0) {
            const normalized = listings
              .map((item: any) => {
                const startDate = parseXtreamEpgTimestamp(item.start_timestamp, item.start);
                const stopDate = parseXtreamEpgTimestamp(item.stop_timestamp, item.end || item.stop);
                if (!startDate || !stopDate) return null;
                return {
                  title: decodeEpgText(item.title),
                  description: decodeEpgText(item.description),
                  start: startDate,
                  stop: stopDate
                };
              })
              .filter((p: any) => p && p.title && !isNaN(p.start.getTime()) && !isNaN(p.stop.getTime()))
              .sort((a: any, b: any) => a.start.getTime() - b.start.getTime());

            if (normalized.length > 0) {
              setShortEpgCache(prev => {
                const keys = Object.keys(prev);
                if (keys.length >= 40) {
                  const trimmed: Record<string, any[]> = {};
                  for (let i = keys.length - 30; i < keys.length; i++) {
                    trimmed[keys[i]] = prev[keys[i]];
                  }
                  trimmed[cid] = normalized;
                  return trimmed;
                }
                return { ...prev, [cid]: normalized };
              });
            }
          }
        })
        .catch(() => {});
    }, delayMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [selectedChannel?.stream_id, mediaType, activePlaylist, xmltvData, isFullscreen]);

  useEffect(() => {
    if (showEpgTimeline && selectedChannel) {
      const foundInXml = findProgramsForChannel(selectedChannel);
      if (foundInXml && foundInXml.length > 0) {
        setEpgData(foundInXml.map(p => ({
          title: p.title,
          start: p.start.toISOString(),
          end: p.stop.toISOString(),
          description: p.description
        })));
      } else {
        fetchEPG(selectedChannel.stream_id);
      }
    }
  }, [showEpgTimeline, selectedChannel, xmltvData]);

  // Pass ONLY the active channel's matched EPG bucket (avoids cloning 50k XMLTV keys on every zap)
  const mergedEpgForModal = useMemo(() => {
    if (!selectedChannel) return shortEpgCache;
    const programs = findProgramsForChannel(selectedChannel);
    if (!programs || programs.length === 0) return {};
    const cid = String(selectedChannel.stream_id || (selectedChannel as any).id || '');
    return cid ? { [cid]: programs } : {};
  }, [selectedChannel, xmltvData, shortEpgCache]);

  function findProgramsForChannel(channel: ParsedChannel | null) {
    if (!channel) return null;
    const cid = String(channel.stream_id || '');
    const epgId = String((channel as any).epg_channel_id || '');
    const tvgId = String((channel as any).tvg_id || '');
    const chName = String(channel.name || '');
    const cleanName = chName ? chName.replace(/\|AR\||\|EN\||HD|FHD|4K|RAW|SD|HEVC|\+|:-/gi, '').trim() : '';

    const keys = [
      cid,
      epgId,
      epgId.toLowerCase(),
      tvgId,
      tvgId.toLowerCase(),
      chName,
      chName.toLowerCase(),
      cleanName,
      cleanName.toLowerCase()
    ].filter(Boolean);

    for (const k of keys) {
      if (shortEpgCache[k]?.length) return shortEpgCache[k];
      if (xmltvData[k]?.length) return xmltvData[k];
    }
    return null;
  }

  const getCurrentProgram = (channel: ParsedChannel | null) => {
    const programs = findProgramsForChannel(channel);
    if (!programs) return null;
    const now = new Date();
    return programs.find(p => p.start <= now && p.stop >= now) || null;
  };

  const getNextProgram = (channel: ParsedChannel | null) => {
    const programs = findProgramsForChannel(channel);
    if (!programs) return null;
    const now = new Date();
    return programs.find(p => p.start > now) || null;
  };

  // Auto-focus move-up button when Reorder / Context Action modal opens (only when opening a new modal)
  useEffect(() => {
    if (reorderTarget) {
      if (prevReorderTargetIdRef.current !== reorderTarget.id) {
        prevReorderTargetIdRef.current = reorderTarget.id;
        const timer = setTimeout(() => {
          const firstMoveUpBtn = document.querySelector<HTMLElement>('[data-tv-modal="reorder"][data-tv-move-up="true"]') ||
                                 document.querySelector<HTMLElement>('[data-tv-modal="reorder"]');
          if (firstMoveUpBtn) {
            setTVFocus(firstMoveUpBtn, { scroll: false });
          }
        }, 60);
        return () => clearTimeout(timer);
      }
    } else {
      prevReorderTargetIdRef.current = null;
    }
  }, [reorderTarget]);

  useEffect(() => {
    if (!externalLaunchModal) return;
    const timer = setTimeout(() => {
      const firstBtn =
        document.querySelector<HTMLElement>('[data-tv-modal="external-launch"][data-external-primary="true"]') ||
        document.querySelector<HTMLElement>('[data-tv-modal="external-launch"]');
      if (firstBtn) {
        setTVFocus(firstBtn, { scroll: false });
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [externalLaunchModal]);

  useEffect(() => {
    if (!isFullscreen && !activeVodPlayer) {
      setForceInternalPlaybackOnce(false);
    }
  }, [isFullscreen, activeVodPlayer, settings.useExternalPlayer]);

 

  // TV Remote OK Button Long-Press Detection Refs
  const okPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const okLongPressFiredRef = useRef<boolean>(false);
  const okPressedChannelRef = useRef<ParsedChannel | null>(null);
  const okPressedIndexRef = useRef<number>(0);
  const okCatPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const okCatLongPressFiredRef = useRef<boolean>(false);
  const okPressedCatIndexRef = useRef<number>(0);
  const lastDpadKeyTimeRef = useRef<number>(0);

  // 2-Pane D-Pad TV Remote Control Navigation Listener (Capture-Phase + Unified Single-Focus Engine)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      const code = e.keyCode;

      const isBackKey = key === 'Escape' || key === 'Backspace' || key === 'GoBack' || key === 'Back' ||
                        code === 4 || code === 10009 || code === 461 || code === 27 || code === 8;

      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
        const isTrueEscape = key === 'Escape' || key === 'GoBack' || code === 10009 || code === 461 || code === 27;
        const isNavKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key) || (code >= 19 && code <= 22) || (code >= 37 && code <= 40);

        if (isTrueEscape) {
          (document.activeElement as HTMLElement).blur();
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        if (!isNavKey) {
          return;
        }
      }

      if (isBackKey) {
        return;
      }

      // Remove artificial repeat throttling on VOD grid so held D-pad keys move smoothly without delay
      const now = Date.now();
      const isVodGridView = mediaType === 'movie' || mediaType === 'series';
      if (!isVodGridView && e.repeat && now - lastDpadKeyTimeRef.current < 24) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      lastDpadKeyTimeRef.current = now;

      const isReorderShortcut = key === 'F3' || key === 'Yellow' || code === 114 || code === 405 ||
                                key === 'm' || key === 'M' || key === 'r' || key === 'Menu' || code === 82 ||
                                key === 'ContextMenu' || key === 'Guide' || code === 457;
      if (isReorderShortcut && !externalLaunchModal && !reorderTarget && !movieDetailsModal && !isFullscreen && !activeVodPlayer) {
        const activeEl = getCurrentTVFocus();
        if (activeEl) {
          const isCat = activeEl.getAttribute('data-tv-pane') === 'categories';
          const isCh = activeEl.getAttribute('data-tv-pane') === 'channels';
          if (isCat && mediaType === 'live') {
            e.preventDefault();
            e.stopPropagation();
            const curCats = visibleCategoriesRef.current;
            const catItem = curCats[tvFocusedCatIndex.current];
            if (catItem && catItem.category_id !== '__all__' && catItem.category_id !== 'favorites') {
              const realCats = curCats.filter(c => c.category_id !== '__all__' && c.category_id !== 'favorites');
              const realIdx = Math.max(0, realCats.findIndex(c => c.category_id === catItem.category_id));
              markLongPressModalOpened(700);
              setReorderTarget({ type: 'category', id: catItem.category_id, index: realIdx, name: catItem.category_name || 'Category' });
              return;
            }
          } else if (isCh && mediaType === 'live') {
            e.preventDefault();
            e.stopPropagation();
            const curList = filteredChannelsRef.current;
            const ch = curList[tvFocusedChannelIndex.current];
            if (ch) {
              markLongPressModalOpened(700);
              setReorderTarget({ type: 'channel', id: ch.stream_id, index: tvFocusedChannelIndex.current, name: ch.name });
              return;
            }
          }
        }
      }

      if (externalLaunchModal) {
        const modalBtns = Array.from(document.querySelectorAll<HTMLElement>('[data-tv-modal="external-launch"]'));
        if (modalBtns.length > 0) {
          const currentEl = getCurrentTVFocus() || (document.activeElement as HTMLElement);
          const activeIdx = modalBtns.indexOf(currentEl);
          const cur = activeIdx >= 0 ? activeIdx : 0;

          if (key === 'ArrowDown' || code === 40 || code === 20 || key === 'ArrowRight' || code === 39 || code === 22) {
            e.preventDefault();
            e.stopPropagation();
            setTVFocus(modalBtns[Math.min(modalBtns.length - 1, cur + 1)], { scroll: true });
          } else if (key === 'ArrowUp' || code === 38 || code === 19 || key === 'ArrowLeft' || code === 37 || code === 21) {
            e.preventDefault();
            e.stopPropagation();
            setTVFocus(modalBtns[Math.max(0, cur - 1)], { scroll: true });
          } else if (key === 'Enter' || code === 13 || key === 'Select' || code === 23) {
            e.preventDefault();
            e.stopPropagation();
            if (e.repeat || isLongPressModalGraceActive()) return;
            modalBtns[cur]?.click();
          }
        }
        return;
      }

      // If Movie/Series Details Modal is open, keep focus strictly trapped inside and scroll ONLY seasons/episodes
      if (movieDetailsModal) {
        const dialog = document.querySelector<HTMLElement>('[data-tv-details-dialog="true"]');
        const modalFocusables = Array.from(
          (dialog || document).querySelectorAll<HTMLElement>('[data-tv-modal="details"]')
        );
        if (modalFocusables.length > 0) {
          const currentEl = getCurrentTVFocus() || (document.activeElement as HTMLElement);
          const isInsideDialog = !!(currentEl && modalFocusables.includes(currentEl));

          const closeBtn = modalFocusables.find(el => el.getAttribute('data-modal-role') === 'close') || null;
          const seasonTabs = modalFocusables.filter(el => el.hasAttribute('data-season-tab'));
          const activeSeason =
            seasonTabs.find(el => el.getAttribute('data-season-active') === 'true') ||
            seasonTabs[0] ||
            null;
          const episodeItems = modalFocusables.filter(el => el.hasAttribute('data-episode-item'));
          const footerBtns = modalFocusables.filter(el => {
            const role = el.getAttribute('data-modal-role');
            return role === 'play' || role === 'favorite';
          });

          const isCloseBtn = currentEl === closeBtn;
          const isSeasonTab = !!currentEl?.hasAttribute('data-season-tab');
          const isEpisodeItem = !!currentEl?.hasAttribute('data-episode-item');
          const isFooterBtn = !!(currentEl && footerBtns.includes(currentEl));

          if (!isInsideDialog) {
            const fallback = footerBtns[0] || activeSeason || episodeItems[0] || closeBtn || modalFocusables[0];
            if (fallback) setTVFocus(fallback, { scroll: false });
            e.preventDefault();
            e.stopPropagation();
            return;
          }

          if (key === 'ArrowDown' || code === 40 || code === 20) {
            e.preventDefault();
            e.stopPropagation();
            if (isCloseBtn) {
              const target = activeSeason || episodeItems[0] || footerBtns[0];
              if (target) {
                setTVFocus(target, { scroll: false });
                if (target.hasAttribute('data-season-tab')) {
                  scrollModalItemIntoContainer(detailsSeasonsScrollRef.current, target, 'x');
                }
              }
            } else if (isSeasonTab) {
              const target = episodeItems[0] || footerBtns[0];
              if (target) {
                setTVFocus(target, { scroll: false });
                if (target.hasAttribute('data-episode-item')) {
                  if (detailsEpisodesScrollRef.current) detailsEpisodesScrollRef.current.scrollTop = 0;
                  scrollModalItemIntoContainer(detailsEpisodesScrollRef.current, target, 'y');
                }
              }
            } else if (isEpisodeItem) {
              const epIdx = episodeItems.indexOf(currentEl);
              if (epIdx >= 0 && epIdx < episodeItems.length - 1) {
                const nextEp = episodeItems[epIdx + 1];
                setTVFocus(nextEp, { scroll: false });
                scrollModalItemIntoContainer(detailsEpisodesScrollRef.current, nextEp, 'y');
              } else if (footerBtns.length > 0) {
                setTVFocus(footerBtns[0], { scroll: false });
              }
            }
          } else if (key === 'ArrowUp' || code === 38 || code === 19) {
            e.preventDefault();
            e.stopPropagation();
            if (isFooterBtn) {
              if (episodeItems.length > 0) {
                const lastEp = episodeItems[episodeItems.length - 1];
                setTVFocus(lastEp, { scroll: false });
                scrollModalItemIntoContainer(detailsEpisodesScrollRef.current, lastEp, 'y');
              } else if (activeSeason) {
                setTVFocus(activeSeason, { scroll: false });
                scrollModalItemIntoContainer(detailsSeasonsScrollRef.current, activeSeason, 'x');
              } else if (closeBtn) {
                setTVFocus(closeBtn, { scroll: false });
              }
            } else if (isEpisodeItem) {
              const epIdx = episodeItems.indexOf(currentEl);
              if (epIdx > 0) {
                const prevEp = episodeItems[epIdx - 1];
                setTVFocus(prevEp, { scroll: false });
                scrollModalItemIntoContainer(detailsEpisodesScrollRef.current, prevEp, 'y');
              } else if (activeSeason) {
                setTVFocus(activeSeason, { scroll: false });
                scrollModalItemIntoContainer(detailsSeasonsScrollRef.current, activeSeason, 'x');
              } else if (closeBtn) {
                setTVFocus(closeBtn, { scroll: false });
              }
            } else if (isSeasonTab && closeBtn) {
              setTVFocus(closeBtn, { scroll: false });
            }
          } else if (key === 'ArrowRight' || code === 39 || code === 22) {
            e.preventDefault();
            e.stopPropagation();
            if (isSeasonTab && seasonTabs.length > 0) {
              const sIdx = seasonTabs.indexOf(currentEl);
              const nextSIdx = isRtl ? Math.max(0, sIdx - 1) : Math.min(seasonTabs.length - 1, sIdx + 1);
              const nextTab = seasonTabs[nextSIdx];
              if (nextTab) {
                setTVFocus(nextTab, { scroll: false });
                scrollModalItemIntoContainer(detailsSeasonsScrollRef.current, nextTab, 'x');
                nextTab.click();
              }
            } else if (isFooterBtn && footerBtns.length > 1) {
              const fIdx = footerBtns.indexOf(currentEl);
              const nextFIdx = isRtl ? Math.max(0, fIdx - 1) : Math.min(footerBtns.length - 1, fIdx + 1);
              setTVFocus(footerBtns[nextFIdx], { scroll: false });
            }
          } else if (key === 'ArrowLeft' || code === 37 || code === 21) {
            e.preventDefault();
            e.stopPropagation();
            if (isSeasonTab && seasonTabs.length > 0) {
              const sIdx = seasonTabs.indexOf(currentEl);
              const prevSIdx = isRtl ? Math.min(seasonTabs.length - 1, sIdx + 1) : Math.max(0, sIdx - 1);
              const prevTab = seasonTabs[prevSIdx];
              if (prevTab) {
                setTVFocus(prevTab, { scroll: false });
                scrollModalItemIntoContainer(detailsSeasonsScrollRef.current, prevTab, 'x');
                prevTab.click();
              }
            } else if (isFooterBtn && footerBtns.length > 1) {
              const fIdx = footerBtns.indexOf(currentEl);
              const prevFIdx = isRtl ? Math.min(footerBtns.length - 1, fIdx + 1) : Math.max(0, fIdx - 1);
              setTVFocus(footerBtns[prevFIdx], { scroll: false });
            }
          } else if (key === 'Enter' || code === 13 || key === 'Select' || code === 23) {
            e.preventDefault();
            e.stopPropagation();
            if (e.repeat || isLongPressModalGraceActive()) return;
            currentEl?.click();
          }
        }
        return;
      }

      // If Position Reorder Modal is open, handle D-Pad button traversal only (PositionEditModal owns digits/input/Enter)
      if (reorderTarget) {
        const isInputActive = document.activeElement && document.activeElement.tagName === 'INPUT';
        const modalBtns = Array.from(document.querySelectorAll<HTMLElement>('[data-tv-modal="reorder"]'));
        if (modalBtns.length > 0) {
          const currentEl = getCurrentTVFocus() || (document.activeElement as HTMLElement);
          const activeIdx = modalBtns.indexOf(currentEl);
          const cur = activeIdx >= 0 ? activeIdx : 0;

          if (key === 'ArrowDown' || code === 40 || code === 20) {
            e.preventDefault();
            e.stopPropagation();
            setTVFocus(modalBtns[Math.min(modalBtns.length - 1, cur + 1)], { scroll: true });
          } else if (key === 'ArrowUp' || code === 38 || code === 19) {
            e.preventDefault();
            e.stopPropagation();
            setTVFocus(modalBtns[Math.max(0, cur - 1)], { scroll: true });
          } else if (key === 'ArrowRight' || code === 39 || code === 22) {
            e.preventDefault();
            e.stopPropagation();
            const next = isRtl ? Math.max(0, cur - 1) : Math.min(modalBtns.length - 1, cur + 1);
            setTVFocus(modalBtns[next], { scroll: true });
          } else if (key === 'ArrowLeft' || code === 37 || code === 21) {
            e.preventDefault();
            e.stopPropagation();
            const next = isRtl ? Math.min(modalBtns.length - 1, cur + 1) : Math.max(0, cur - 1);
            setTVFocus(modalBtns[next], { scroll: true });
          } else if (!isInputActive && (key === 'Enter' || code === 13 || key === 'Select' || code === 23)) {
            e.preventDefault();
            e.stopPropagation();
            if (e.repeat || isLongPressModalGraceActive()) return;
            modalBtns[cur]?.click();
          }
        }
        return;
      }

      if (isFullscreen || activeVodPlayer || multiViewFullscreenSlot !== null) {
        return;
      }

      if (tvFocusedPane.current === 'header') {
        const headerTabs = document.querySelectorAll<HTMLElement>('[data-tv-pane="header"]');
        if (headerTabs.length > 0) {
          const currentActive = getCurrentTVFocus() || (document.activeElement as HTMLElement);
          let cur = -1;
          for (let i = 0; i < headerTabs.length; i++) {
            if (headerTabs[i] === currentActive) { cur = i; break; }
          }
          if (cur === -1) cur = 0;

          if (key === 'ArrowDown' || code === 40 || code === 20) {
            e.preventDefault();
            e.stopPropagation();
            if (multiViewActive && multiViewFullSplit && multiViewPickingSlot === null) {
              tvFocusedPane.current = 'multiview';
              const targetSlotEl =
                document.getElementById(`multiview-slot-${Math.max(0, selectedSlotIndex)}`) ||
                document.querySelector<HTMLElement>('[data-multiview-container="true"] [data-tv-focusable="true"]');
              if (targetSlotEl) setTVFocus(targetSlotEl, { scroll: false });
              return;
            }
            const channelsList = filteredChannelsRef.current || [];
            if (channelsList.length > 0) {
              tvFocusedPane.current = 'channels';
              focusChannelAtIdx(0);
            } else {
              tvFocusedPane.current = 'categories';
              focusCategoryAtIdx(0);
            }
          } else if (key === 'ArrowRight' || code === 39 || code === 22) {
            e.preventDefault();
            e.stopPropagation();
            const next = isRtl ? Math.max(0, cur - 1) : Math.min(headerTabs.length - 1, cur + 1);
            setTVFocus(headerTabs[next], { scroll: true });
          } else if (key === 'ArrowLeft' || code === 37 || code === 21) {
            e.preventDefault();
            e.stopPropagation();
            const next = isRtl ? Math.min(headerTabs.length - 1, cur + 1) : Math.max(0, cur - 1);
            setTVFocus(headerTabs[next], { scroll: true });
          } else if (key === 'Enter' || code === 13 || key === 'Select' || code === 23) {
            e.preventDefault();
            e.stopPropagation();
            if (e.repeat) return;
            headerTabs[cur]?.click();
          }
        }
        return;
      }

      if (tvFocusedPane.current === 'multiview') {
        const container = document.querySelector<HTMLElement>('[data-multiview-container="true"]');
        const focusables = container
          ? Array.from(container.querySelectorAll<HTMLElement>('[data-tv-focusable="true"]'))
          : [];
        const currentEl = getCurrentTVFocus() || (document.activeElement as HTMLElement);
        const curRect = currentEl?.getBoundingClientRect();

        const isUp = key === 'ArrowUp' || code === 38 || code === 19;
        const isDown = key === 'ArrowDown' || code === 40 || code === 20;
        const isRight = key === 'ArrowRight' || code === 39 || code === 22;
        const isLeft = key === 'ArrowLeft' || code === 37 || code === 21;

        if (isUp || isDown || isRight || isLeft) {
          e.preventDefault();
          e.stopPropagation();

          let bestEl: HTMLElement | null = null;
          let bestScore = Infinity;

          if (curRect && focusables.length > 0) {
            const cx = curRect.left + curRect.width / 2;
            const cy = curRect.top + curRect.height / 2;

            for (const cand of focusables) {
              if (cand === currentEl) continue;
              const r = cand.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) continue;
              const tx = r.left + r.width / 2;
              const ty = r.top + r.height / 2;
              const dx = tx - cx;
              const dy = ty - cy;

              if (isUp && dy >= -6) continue;
              if (isDown && dy <= 6) continue;
              if (isLeft && dx >= -6) continue;
              if (isRight && dx <= 6) continue;

              // Prefer slot-level navigation slightly less noisy than tiny button overlaps
              const dist = isUp || isDown
                ? Math.abs(dy) + Math.abs(dx) * 1.4
                : Math.abs(dx) + Math.abs(dy) * 1.4;
              if (dist < bestScore) {
                bestScore = dist;
                bestEl = cand;
              }
            }
          }

          if (bestEl) {
            setTVFocus(bestEl, { scroll: false });
            const ownerSlot = bestEl.closest<HTMLElement>('[data-multiview-slot="true"]');
            const pulseIdx = ownerSlot ? Number(ownerSlot.getAttribute('data-slot-index')) : NaN;
            if (!Number.isNaN(pulseIdx)) {
              window.dispatchEvent(new CustomEvent('achour_multiview_focus_pulse', { detail: { slotIndex: pulseIdx } }));
            }
          } else if (isUp) {
            if (multiViewFullscreenSlot === null) {
              tvFocusedPane.current = 'header';
              const headerTabs = document.querySelectorAll<HTMLElement>('[data-tv-pane="header"]');
              if (headerTabs.length > 0) setTVFocus(headerTabs[0], { scroll: true });
            }
          } else if ((isLeft && !isRtl) || (isRight && isRtl)) {
            if (multiViewFullscreenSlot === null && (!multiViewFullSplit || multiViewPickingSlot !== null)) {
              tvFocusedPane.current = 'channels';
              focusChannelAtIdx(tvFocusedChannelIndex.current >= 0 ? tvFocusedChannelIndex.current : 0);
            }
          }
        } else if (key === 'Enter' || code === 13 || key === 'Select' || code === 23) {
          e.preventDefault();
          e.stopPropagation();
          if (currentEl && container?.contains(currentEl)) {
            const ownerSlot = currentEl.closest<HTMLElement>('[data-multiview-slot="true"]');
            const pulseIdx = ownerSlot ? Number(ownerSlot.getAttribute('data-slot-index')) : NaN;
            if (!Number.isNaN(pulseIdx)) {
              window.dispatchEvent(new CustomEvent('achour_multiview_focus_pulse', { detail: { slotIndex: pulseIdx } }));
            }
            currentEl.click();
          }
        }
        return;
      }

      if (tvFocusedPane.current === 'categories') {
        const curCats = visibleCategoriesRef.current;
        if (curCats.length === 0) return;

        let cur = tvFocusedCatIndex.current;
        if (cur < 0 || cur >= curCats.length) cur = 0;

        if (key === 'ArrowDown' || code === 40 || code === 20) {
          e.preventDefault();
          e.stopPropagation();
          const next = mediaType === 'live' && cur === curCats.length - 1 ? 0 : Math.min(curCats.length - 1, cur + 1);
          focusCategoryAtIdx(next);
        } else if (key === 'ArrowUp' || code === 38 || code === 19) {
          e.preventDefault();
          e.stopPropagation();
          if (cur === 0) {
            if (mediaType === 'live') {
              focusCategoryAtIdx(curCats.length - 1);
            } else {
              tvFocusedPane.current = 'header';
              const headerTabs = document.querySelectorAll<HTMLElement>('[data-tv-pane="header"]');
              if (headerTabs.length > 0) setTVFocus(headerTabs[0], { scroll: true });
            }
          } else {
            focusCategoryAtIdx(cur - 1);
          }
        } else if (key === 'Enter' || code === 13 || key === 'Select' || code === 23) {
          e.preventDefault();
          e.stopPropagation();
          const catItem = curCats[cur];
          const canReorderCat = Boolean(
            mediaType === 'live' &&
            catItem &&
            catItem.category_id !== '__all__' &&
            catItem.category_id !== 'favorites' &&
            catItem.category_id !== WATCH_HISTORY_CAT_ID &&
            catItem.category_id !== CONTINUE_WATCHING_CAT_ID
          );
          if (canReorderCat && catItem) {
            if (!e.repeat) {
              okCatLongPressFiredRef.current = false;
              okPressedCatIndexRef.current = cur;
              if (okCatPressTimerRef.current) clearTimeout(okCatPressTimerRef.current);
              okCatPressTimerRef.current = setTimeout(() => {
                okCatLongPressFiredRef.current = true;
                markLongPressModalOpened(700);
                const realCats = curCats.filter(
                  c => c.category_id !== '__all__' && c.category_id !== 'favorites' && c.category_id !== WATCH_HISTORY_CAT_ID && c.category_id !== CONTINUE_WATCHING_CAT_ID
                );
                const realIdx = Math.max(0, realCats.findIndex(c => c.category_id === catItem.category_id));
                setReorderTarget({
                  type: 'category',
                  id: catItem.category_id,
                  index: realIdx,
                  name: catItem.category_name || 'Category'
                });
              }, 380);
            }
          } else if (!e.repeat && catItem) {
            okPressedCatIndexRef.current = -1;
            setSelectedCategory(catItem.category_id);
          }
        } else if (((key === 'ArrowRight' || code === 39 || code === 22) && !isRtl) || ((key === 'ArrowLeft' || code === 37 || code === 21) && isRtl)) {
          e.preventDefault();
          e.stopPropagation();
          const channelsList = filteredChannelsRef.current || [];
          if (channelsList.length > 0) {
            tvFocusedPane.current = 'channels';
            const targetIdx = (tvFocusedChannelIndex.current >= 0 && tvFocusedChannelIndex.current < channelsList.length)
              ? tvFocusedChannelIndex.current
              : 0;
            focusChannelAtIdx(targetIdx);
          }
        }
      } else if (tvFocusedPane.current === 'channels') {
        const channelsList = filteredChannelsRef.current;
        if (!channelsList || channelsList.length === 0) {
          tvFocusedPane.current = 'categories';
          return;
        }

        const isVodGridView =
          (mediaType === 'movie' || mediaType === 'series') &&
          (settings.viewMode || 'grid') !== 'list';
        const listContainer = isVodGridView
          ? document.querySelector<HTMLElement>('[data-channel-list-container="true"]')
          : null;
        const domCols = listContainer ? parseInt(listContainer.getAttribute('data-column-count') || '', 10) : NaN;
        const isGrid = isVodGridView && (isNaN(domCols) || domCols > 1);
        const cols = isGrid ? (!isNaN(domCols) && domCols > 0 ? domCols : gridColumnCountRef.current || 4) : 1;

        const activeEl = getCurrentTVFocus() || (document.activeElement as HTMLElement);
        let curIdx = tvFocusedChannelIndex.current;

        if (curIdx < 0 || curIdx >= channelsList.length) {
          const parsed = parseInt(activeEl?.getAttribute('data-index') || '', 10);
          curIdx = !isNaN(parsed) && parsed >= 0 && parsed < channelsList.length ? parsed : 0;
        }

        curIdx = Math.max(0, Math.min(channelsList.length - 1, curIdx));

        if (key === 'ArrowDown' || code === 40 || code === 20) {
          e.preventDefault();
          e.stopPropagation();
          if (isGrid) {
            const nextIdx = curIdx + cols;
            if (nextIdx < channelsList.length) {
              focusChannelAtIdx(nextIdx);
            } else {
              const lastIdx = channelsList.length - 1;
              const currentRow = Math.floor(curIdx / cols);
              const lastRow = Math.floor(lastIdx / cols);
              if (currentRow < lastRow) {
                focusChannelAtIdx(lastIdx);
              }
            }
          } else {
            // Live TV (unchanged)
            focusChannelAtIdx(Math.min(channelsList.length - 1, curIdx + 1));
          }
        } else if (key === 'ArrowUp' || code === 38 || code === 19) {
          e.preventDefault();
          e.stopPropagation();
          if (isGrid) {
            if (curIdx < cols) {
              tvFocusedPane.current = 'header';
              const headerTabs = document.querySelectorAll<HTMLElement>('[data-tv-pane="header"]');
              if (headerTabs.length > 0) setTVFocus(headerTabs[0], { scroll: true });
            } else {
              focusChannelAtIdx(curIdx - cols);
            }
          } else {
            // Live TV (unchanged)
            if (curIdx === 0) {
              tvFocusedPane.current = 'header';
              const headerTabs = document.querySelectorAll<HTMLElement>('[data-tv-pane="header"]');
              if (headerTabs.length > 0) setTVFocus(headerTabs[0], { scroll: true });
            } else {
              focusChannelAtIdx(Math.max(0, curIdx - 1));
            }
          }
        } else if (key === 'ArrowRight' || code === 39 || code === 22) {
          e.preventDefault();
          e.stopPropagation();
          if (isGrid) {
            const col = curIdx % cols;
            if (isRtl) {
              // RTL: Moving RIGHT moves towards col 0 (adjacent to Categories sidebar)
              if (col === 0) {
                tvFocusedPane.current = 'categories';
                focusCategoryAtIdx(tvFocusedCatIndex.current);
              } else {
                focusChannelAtIdx(curIdx - 1);
              }
            } else {
              // LTR: Moving RIGHT moves towards rightmost column (does NOT wrap to next row)
              if (col < cols - 1 && curIdx + 1 < channelsList.length) {
                focusChannelAtIdx(curIdx + 1);
              }
            }
          } else {
            // Live TV
            if (isRtl) {
              tvFocusedPane.current = 'categories';
              focusCategoryAtIdx(tvFocusedCatIndex.current);
            } else if (document.querySelector('[data-multiview-container="true"]')) {
              const firstSlot = document.getElementById('multiview-slot-0');
              if (firstSlot) {
                tvFocusedPane.current = 'multiview';
                setTVFocus(firstSlot, { scroll: false });
              }
            }
          }
        } else if (key === 'ArrowLeft' || code === 37 || code === 21) {
          e.preventDefault();
          e.stopPropagation();
          if (isGrid) {
            const col = curIdx % cols;
            if (!isRtl) {
              // LTR: Moving LEFT moves towards col 0 (adjacent to Categories sidebar)
              if (col === 0) {
                tvFocusedPane.current = 'categories';
                focusCategoryAtIdx(tvFocusedCatIndex.current);
              } else {
                focusChannelAtIdx(curIdx - 1);
              }
            } else {
              // RTL: Moving LEFT moves towards leftmost column (does NOT wrap to next row)
              if (col < cols - 1 && curIdx + 1 < channelsList.length) {
                focusChannelAtIdx(curIdx + 1);
              }
            }
          } else {
            // Live TV
            if (!isRtl) {
              tvFocusedPane.current = 'categories';
              focusCategoryAtIdx(tvFocusedCatIndex.current);
            } else if (document.querySelector('[data-multiview-container="true"]')) {
              const firstSlot = document.getElementById('multiview-slot-0');
              if (firstSlot) {
                tvFocusedPane.current = 'multiview';
                setTVFocus(firstSlot, { scroll: false });
              }
            }
          }
        } else if (key === 'Enter' || code === 13 || key === 'Select' || code === 23) {
          e.preventDefault();
          e.stopPropagation();
          if (!e.repeat) {
            const targetCh = channelsList[curIdx];
            if (mediaType === 'live') {
              okLongPressFiredRef.current = false;
              okPressedChannelRef.current = targetCh || null;
              okPressedIndexRef.current = curIdx;

              if (okPressTimerRef.current) clearTimeout(okPressTimerRef.current);
              okPressTimerRef.current = setTimeout(() => {
                okLongPressFiredRef.current = true;
                if (targetCh) {
                  markLongPressModalOpened(700);
                  setReorderTarget({
                    type: 'channel',
                    id: targetCh.stream_id,
                    index: curIdx,
                    name: targetCh.name
                  });
                }
              }, 380);
            } else if (targetCh) {
              okLongPressFiredRef.current = false;
              okPressedChannelRef.current = null;
              handleChannelClickRef.current(targetCh);
            }
          }
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key;
      const code = e.keyCode;
      const isOkKey = key === 'Enter' || code === 13 || key === 'Select' || code === 23;
      if (!isOkKey) return;

      if (okPressTimerRef.current) {
        clearTimeout(okPressTimerRef.current);
        okPressTimerRef.current = null;
      }
      if (okCatPressTimerRef.current) {
        clearTimeout(okCatPressTimerRef.current);
        okCatPressTimerRef.current = null;
      }

      const hadCatPress = okPressedCatIndexRef.current >= 0 || okCatLongPressFiredRef.current;
      const hadChannelPress = Boolean(okPressedChannelRef.current) || okLongPressFiredRef.current;

      if (hadCatPress || hadChannelPress || reorderTarget) {
        e.preventDefault();
        e.stopPropagation();
      }

      if (
        hadCatPress &&
        tvFocusedPane.current === 'categories' &&
        mediaType === 'live' &&
        !isFullscreen &&
        !activeVodPlayer &&
        !reorderTarget &&
        !movieDetailsModal &&
        !externalLaunchModal &&
        !okCatLongPressFiredRef.current
      ) {
        const catItem = visibleCategoriesRef.current[okPressedCatIndexRef.current];
        if (catItem) {
          setSelectedCategory(catItem.category_id);
        }
      }

      if (
        hadChannelPress &&
        tvFocusedPane.current === 'channels' &&
        mediaType === 'live' &&
        !isFullscreen &&
        !activeVodPlayer &&
        !reorderTarget &&
        !movieDetailsModal &&
        !externalLaunchModal &&
        !okLongPressFiredRef.current
      ) {
        const chToSelect = okPressedChannelRef.current;
        if (chToSelect) {
          handleChannelClickRef.current(chToSelect);
        }
      }

      okPressedCatIndexRef.current = -1;
      okCatLongPressFiredRef.current = false;
      okLongPressFiredRef.current = false;
      okPressedChannelRef.current = null;
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      if (okPressTimerRef.current) {
        clearTimeout(okPressTimerRef.current);
        okPressTimerRef.current = null;
      }
      if (okCatPressTimerRef.current) {
        clearTimeout(okCatPressTimerRef.current);
        okCatPressTimerRef.current = null;
      }
    };
  }, [isRtl, mediaType, settings.viewMode, onBack, showPinModal, showEpgGrid, showEpgTimeline, showAudioMenu, showSubMenu, showQualityMenu, reorderTarget, activeVodPlayer, movieDetailsModal, externalLaunchModal, isFullscreen, showControls, toggleControlsVisibility, multiViewActive, multiViewFullSplit, multiViewFullscreenSlot, multiViewPickingSlot, selectedSlotIndex]);

  const effectivePlaylistId = activePlaylist?.id || playlistId;

  const triggerAutoPlayFallback = useCallback(() => {
    if (autoPlayFallbackCalledRef.current) return;
    autoPlayFallbackCalledRef.current = true;
    autoPlayAttemptRef.current = null;
    setIsFullscreen(false);
    setSelectedChannel(null);
    setActiveVodPlayer(null);
    onAutoPlayFallback?.();
  }, [onAutoPlayFallback]);

  useEffect(() => {
    if (mediaType !== 'live' || !initialChannelToPlay || loading || autoPlayTriggeredRef.current) return;
    let cancelled = false;
    const effPlId = activePlaylist?.id || settings.activePlaylistId || 'default';

    const verifyAndPlayLastChannel = async () => {
      if (categories.length === 0) {
        autoPlayTriggeredRef.current = true;
        triggerAutoPlayFallback();
        return;
      }
      autoPlayTriggeredRef.current = true;
      try {
        const matches = await getChannelsByIds(effPlId, 'live', [initialChannelToPlay.stream_id]);
        if (cancelled) return;
        const verified = matches && matches.length > 0 ? matches[0] : null;
        if (!verified) {
          triggerAutoPlayFallback();
          return;
        }
        autoPlayAttemptRef.current = verified;
        setSelectedChannel(verified);
        setActivePlayingMovie(verified);
        if (settings.useExternalPlayer) {
          launchExternalPlayer(verified.url, verified, 'live');
          autoPlayAttemptRef.current = null;
        } else {
          setIsFullscreen(true);
          setActiveVodPlayer(verified);
        }
      } catch {
        if (!cancelled) triggerAutoPlayFallback();
      }
    };

    verifyAndPlayLastChannel();
    return () => {
      cancelled = true;
    };
  }, [mediaType, initialChannelToPlay, loading, categories.length, activePlaylist?.id, settings.activePlaylistId, settings.useExternalPlayer, triggerAutoPlayFallback]);

  useEffect(() => {
    if (!autoPlayAttemptRef.current) return;
    const timer = setTimeout(() => {
      if (autoPlayAttemptRef.current) {
        triggerAutoPlayFallback();
      }
    }, 12000);
    return () => clearTimeout(timer);
  }, [initialChannelToPlay?.stream_id, triggerAutoPlayFallback]);

  useEffect(() => {
    const plId = activePlaylist?.id || settings.activePlaylistId || undefined;
    setFavorites(getLocalFavoriteIds(plId));
    if (mediaType === 'movie' || mediaType === 'series') {
      setVodFavorites(getLocalVodFavoriteIds(mediaType, plId));
    }
  }, [activePlaylist?.id, settings.activePlaylistId, mediaType]);

  useEffect(() => {
    const plId = activePlaylist?.id || settings.activePlaylistId || undefined;
    return subscribeFavorites(userId, plId, (next: string[]) => setFavorites(next));
  }, [userId, activePlaylist?.id, settings.activePlaylistId]);

  const toggleFavorite = (streamId: string) => {
    const cleanId = String(streamId || '').trim();
    if (!cleanId) return;
    const plId = activePlaylist?.id || settings.activePlaylistId || undefined;
    if (mediaType === 'movie' || mediaType === 'series') {
      const nextVodFavs = toggleVodFavorite(mediaType, cleanId, plId);
      setVodFavorites(nextVodFavs);
      return;
    }
    const ch = channels.find(c => c.stream_id === cleanId);
    setFavorites(prev => (prev.includes(cleanId) ? prev.filter(id => id !== cleanId) : [...prev, cleanId]));
    toggleFavoriteService(userId, cleanId, plId, ch ? {
      name: ch.name,
      logo: ch.stream_icon,
      url: ch.url,
      category: ch.category_name,
      category_id: ch.category_id,
      type: 'live'
    } : undefined);
  };
  const toggleFavoriteRef = useRef(toggleFavorite);
  toggleFavoriteRef.current = toggleFavorite;

  const moveChannel = (streamId: string, direction: 'up' | 'down', e: React.MouseEvent) => {
    e.stopPropagation();
    const curList = filteredChannelsRef.current && filteredChannelsRef.current.length > 0 ? filteredChannelsRef.current : filteredChannels;
    const filteredIdx = curList.findIndex(c => c.stream_id === streamId);
    if (filteredIdx === -1) return;
    const targetFilteredIdx = direction === 'up' ? filteredIdx - 1 : filteredIdx + 1;
    if (targetFilteredIdx < 0 || targetFilteredIdx >= curList.length) return;

    moveItemToPosition('channel', streamId, targetFilteredIdx + 1, false);
  };

  const moveItemToPosition = (type: 'category' | 'channel', id: string, toPosNum: number, closeModal = true) => {
    if (type === 'category') {
      setCategories(prev => {
        const favEntries = prev.filter(c => c.category_id === 'favorites');
        const realCats = prev.filter(
          c => c.category_id !== 'favorites' && c.category_id !== WATCH_HISTORY_CAT_ID && c.category_id !== CONTINUE_WATCHING_CAT_ID
        );
        const fromIdx = realCats.findIndex(c => c.category_id === id);
        if (fromIdx === -1) return prev;
        const toIdx = Math.max(0, Math.min(realCats.length - 1, toPosNum - 1));
        if (fromIdx === toIdx) return prev;
        const copy = [...realCats];
        const [item] = copy.splice(fromIdx, 1);
        copy.splice(toIdx, 0, item);
        const newOrderIds = copy.map(c => c.category_id);
        onUpdateSettings(st => ({
          ...st,
          categoryOrders: { ...(st.categoryOrders || {}), [mediaType]: newOrderIds }
        }));
        try {
          localStorage.setItem(`achour_category_orders_${mediaType}`, JSON.stringify(newOrderIds));
        } catch (e) {}
        setTimeout(() => {
          const visIdx = visibleCategoriesRef.current.findIndex(c => c.category_id === id);
          if (visIdx !== -1) focusCategoryAtIdx(visIdx);
        }, 40);
        return [...favEntries, ...copy];
      });
    } else {
      const curList = filteredChannelsRef.current && filteredChannelsRef.current.length > 0
        ? filteredChannelsRef.current
        : filteredChannels;
      
      const fromCurIdx = curList.findIndex(c => c.stream_id === id);
      const toCurIdx = Math.max(0, Math.min(curList.length - 1, toPosNum - 1));

      if (fromCurIdx !== -1 && fromCurIdx !== toCurIdx) {
        const reorderedCurList = [...curList];
        const [movedItem] = reorderedCurList.splice(fromCurIdx, 1);
        reorderedCurList.splice(toCurIdx, 0, movedItem);

        setChannels(prevMaster => {
          const curListIds = new Set(curList.map(c => c.stream_id));
          const masterIndices: number[] = [];
          for (let i = 0; i < prevMaster.length; i++) {
            if (curListIds.has(prevMaster[i].stream_id)) {
              masterIndices.push(i);
            }
          }

          const nextMaster = [...prevMaster];
          if (masterIndices.length === reorderedCurList.length) {
            for (let k = 0; k < reorderedCurList.length; k++) {
              nextMaster[masterIndices[k]] = reorderedCurList[k];
            }
          } else {
            const fromMasterIdx = nextMaster.findIndex(c => c.stream_id === id);
            if (fromMasterIdx !== -1) {
              const [item] = nextMaster.splice(fromMasterIdx, 1);
              const targetNeighbor = reorderedCurList[toCurIdx === 0 ? 1 : toCurIdx - 1];
              const targetNeighborIdx = targetNeighbor ? nextMaster.findIndex(c => c.stream_id === targetNeighbor.stream_id) : -1;
              if (targetNeighborIdx !== -1) {
                const insertIdx = toCurIdx === 0 ? targetNeighborIdx : targetNeighborIdx + 1;
                nextMaster.splice(insertIdx, 0, item);
              } else {
                nextMaster.splice(Math.max(0, Math.min(nextMaster.length, toCurIdx)), 0, item);
              }
            }
          }
          if (mediaType === 'live') {
            const isFavorites =
              selectedCategory === 'favorites' ||
              selectedCategory === 'FAVORITES_INTERNAL';

            const isSynthetic =
              selectedCategory === WATCH_HISTORY_CAT_ID ||
              selectedCategory === CONTINUE_WATCHING_CAT_ID;

            if (!isSynthetic) {
              const categoryKey = isFavorites
                ? 'favorites'
                : String(selectedCategory || '__all__');

              const orderKey =
                `${encodeURIComponent(effectivePlaylistId || 'default')}::live::${encodeURIComponent(categoryKey)}`;

              const newOrderIds = reorderedCurList.map(c => String(c.stream_id));

              onUpdateSettings(st => ({
                ...st,
                channelOrders: {
                  ...(st.channelOrders || {}),
                  [orderKey]: newOrderIds
                }
              }));

              try {
                localStorage.setItem(
                  `achour_channel_orders_${orderKey}`,
                  JSON.stringify(newOrderIds)
                );
              } catch (e) {}
            }

            return prevMaster;
          }

          const newOrderIds = nextMaster.map(c => c.stream_id);
          onUpdateSettings(st => ({
            ...st,
            channelOrders: { ...(st.channelOrders || {}), [mediaType]: newOrderIds }
          }));
          try {
            localStorage.setItem(
              `achour_channel_orders_${mediaType}`,
              JSON.stringify(newOrderIds)
            );
          } catch (e) {}

          return nextMaster;
    
        });
      }
    }

    if (closeModal) {
      setReorderTarget(null);
    } else {
      setReorderTarget(prev => prev ? { ...prev, index: toPosNum - 1 } : null);
    }
  };

  const fullscreenContainerRef = useRef<HTMLDivElement>(null);
  const playerVideoElements = useRef<(HTMLVideoElement | null)[]>([null, null, null, null]);
  const hlsInstances = useRef<(Hls | null)[]>([null, null, null, null]);



  const sortCategoriesBySavedOrder = useCallback((incomingCats: ParsedCategory[]): ParsedCategory[] => {
    let savedOrder = settings.categoryOrders?.[mediaType];
    if (!savedOrder || !Array.isArray(savedOrder) || savedOrder.length === 0) {
      try {
        const raw = localStorage.getItem(`achour_category_orders_${mediaType}`);
        if (raw) savedOrder = JSON.parse(raw);
      } catch (e) {}
    }
    if (!savedOrder || !Array.isArray(savedOrder) || savedOrder.length === 0) {
      return incomingCats;
    }
    const orderMap = new Map<string, number>();
    savedOrder.forEach((id, idx) => orderMap.set(id, idx));
    return [...incomingCats].sort((a, b) => {
      const idxA = orderMap.has(a.category_id) ? (orderMap.get(a.category_id) as number) : 99999;
      const idxB = orderMap.has(b.category_id) ? (orderMap.get(b.category_id) as number) : 99999;
      return idxA - idxB;
    });
  }, [settings.categoryOrders, mediaType]);
  sortCategoriesBySavedOrderRef.current = sortCategoriesBySavedOrder;

    const sortChannelsBySavedOrder = useCallback((incomingChs: ParsedChannel[]): ParsedChannel[] => {
    const isFavorites =
      selectedCategory === 'favorites' ||
      selectedCategory === 'FAVORITES_INTERNAL';

    const isSynthetic =
      selectedCategory === WATCH_HISTORY_CAT_ID ||
      selectedCategory === CONTINUE_WATCHING_CAT_ID;

    if (mediaType !== 'live' || isSynthetic) return incomingChs;

    const categoryKey = isFavorites
      ? 'favorites'
      : String(selectedCategory || '__all__');

    const orderKey =
      `${encodeURIComponent(effectivePlaylistId || 'default')}::live::${encodeURIComponent(categoryKey)}`;

    let savedOrder = settings.channelOrders?.[orderKey];

    if (!savedOrder || !Array.isArray(savedOrder) || savedOrder.length === 0) {
      try {
        const raw = localStorage.getItem(`achour_channel_orders_${orderKey}`);
        if (raw) savedOrder = JSON.parse(raw);
      } catch (e) {}
    }

    if (!savedOrder || !Array.isArray(savedOrder) || savedOrder.length === 0) {
      return incomingChs;
    }

    const orderMap = new Map<string, number>();
    savedOrder.forEach((id, idx) => orderMap.set(String(id), idx));

    return incomingChs.slice().sort((a, b) => {
      const idxA = orderMap.has(String(a.stream_id))
        ? orderMap.get(String(a.stream_id))!
        : 999999;
      const idxB = orderMap.has(String(b.stream_id))
        ? orderMap.get(String(b.stream_id))!
        : 999999;
      return idxA - idxB;
    });
  }, [settings.channelOrders, mediaType, selectedCategory, effectivePlaylistId]);

  const fetchActivePlaylist = async (): Promise<Playlist | null> => {
    try {
      const rawLocal = localStorage.getItem('achour_local_playlists');
      const localList: Playlist[] = rawLocal ? JSON.parse(rawLocal) : [];

      // 1. If explicit active playlist selected in local cache, return instantly
      if (settings.activePlaylistId) {
        const localFound = localList.find(p => p.id === settings.activePlaylistId);
        if (localFound) {
          setActivePlaylist(localFound);
          if (localFound.isProtected && localFound.pin && !isUnlocked) setShowPinModal(true);
          return localFound;
        }
      }

      // 2. Prioritize first available local playlist
      if (localList.length > 0) {
        const first = localList[0];
        setActivePlaylist(first);
        if (settings.activePlaylistId !== first.id) {
          onUpdateSettings(prev => ({ ...prev, activePlaylistId: first.id }));
        }
        if (first.isProtected && first.pin && !isUnlocked) setShowPinModal(true);
        return first;
      }

      // 3. Fallback / background fetch from Firestore if local is empty
      if (db && settings.activePlaylistId) {
        try {
          const docRef = doc(db, 'playlists', settings.activePlaylistId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = { id: docSnap.id, ...docSnap.data() } as Playlist;
            setActivePlaylist(data);
            if (data.isProtected && data.pin && !isUnlocked) setShowPinModal(true);
            return data;
          }
        } catch (e) {}
      }

      if (db) {
        try {
          const q = query(collection(db, 'playlists'), where('userId', '==', userId));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            const first = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Playlist;
            setActivePlaylist(first);
            if (settings.activePlaylistId !== first.id) {
              onUpdateSettings(prev => ({ ...prev, activePlaylistId: first.id }));
            }
            if (first.isProtected && first.pin && !isUnlocked) setShowPinModal(true);
            return first;
          }
        } catch (e) {}
      }

      return localList[0] || null;
    } catch (err) {
      console.warn('fetchActivePlaylist error:', err);
      return null;
    }
  };

  const parseM3U = (rawContent: string, baseUrl?: string): ParsedChannel[] => {
    if (!rawContent) return [];
    let content = rawContent.replace(/^\uFEFF/, '').trim();
    if (!content) return [];

    // Reject HTML content (e.g. when fetching a GitHub web page instead of raw M3U)
    if (content.startsWith('<!DOCTYPE') || content.startsWith('<html') || content.startsWith('<div')) {
      console.warn('Received HTML response instead of valid M3U text file');
      return [];
    }

    if (content.startsWith('{') || content.startsWith('[')) {
      try {
        const json = JSON.parse(content);
        let list = Array.isArray(json) ? json : (json.available_channels || json.channels || json.streams || json.live_streams || json.vod_streams || json.series || json.vod_data || json.data || []);
        if ((!Array.isArray(list) || list.length === 0) && typeof json === 'object' && json !== null) {
          const vals = Object.values(json);
          if (vals.length > 0 && typeof vals[0] === 'object' && vals[0] !== null) {
            list = vals;
          }
        }
        if (Array.isArray(list) && list.length > 0) {
          return list.map((ch: any, idx: number) => {
            const rawCat = String(ch.category_name || ch.group || '').trim();
            const cleanCat = rawCat.toLowerCase() === 'عام (general)' ? '' : rawCat;
            return {
              stream_id: String(ch.stream_id || ch.id || `${Date.now()}-${idx}`),
              name: String(ch.name || ch.title || `Channel ${idx + 1}`),
              stream_icon: ch.stream_icon || ch.logo || ch.cover || undefined,
              url: ch.url || (ch.stream_id ? `${baseUrl || ''}/live/${ch.stream_id}.ts` : ''),
              category_id: String(ch.category_id || cleanCat || 'uncategorized'),
              category_name: cleanCat,
            };
          });
        }
      } catch (e) {}
    }

    const lines = content.split(/\r?\n/);
    const result: ParsedChannel[] = [];
    let curName = '';
    let curLogo = '';
    let curGroup = '';
    let curId = '';

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) continue;


      if (line.startsWith('#EXTINF:')) {
        const logoMatch = line.match(/tvg-logo=["']([^"']*)["']/i) || line.match(/tvg-logo=([^\s,]+)/i);
        const groupMatch = line.match(/group-title=["']([^"']*)["']/i) || line.match(/group-title=([^\s,]+)/i);
        const idMatch = line.match(/tvg-id=["']([^"']*)["']/i) || line.match(/tvg-id=([^\s,]+)/i);
        const tvgNameMatch = line.match(/tvg-name=["']([^"']*)["']/i) || line.match(/tvg-name=([^\s,]+)/i);

        let inQuotes = false;
        let quoteChar = '';
        let commaPos = -1;
        for (let cIdx = 0; cIdx < line.length; cIdx++) {
          const char = line[cIdx];
          if (char === '"' || char === "'") {
            if (!inQuotes) { inQuotes = true; quoteChar = char; }
            else if (char === quoteChar) { inQuotes = false; }
          } else if (char === ',' && !inQuotes) {
            commaPos = cIdx;
            break;
          }
        }

        let extractedName = '';
        if (commaPos !== -1) extractedName = line.substring(commaPos + 1).trim();
        else if (tvgNameMatch && tvgNameMatch[1]) extractedName = tvgNameMatch[1].trim();

        const rawGrp = groupMatch ? groupMatch[1].trim() : '';
        curName = extractedName;
        curLogo = logoMatch ? logoMatch[1].trim() : '';
        curGroup = rawGrp.toLowerCase() === 'عام (general)' ? '' : rawGrp;
        curId = idMatch ? idMatch[1].trim() : '';
      } else if (line.startsWith('#EXTGRP:')) {
        const rawExtGrp = line.replace('#EXTGRP:', '').trim();
        curGroup = rawExtGrp.toLowerCase() === 'عام (general)' ? '' : rawExtGrp;
      } else if (!line.startsWith('#')) {
        let streamUrl = line.replace(/&amp;/g, '&');
        // Filter out non-media assets
        if (streamUrl.endsWith('.js') || streamUrl.endsWith('.css') || streamUrl.includes('githubassets.com')) {
          continue;
        }
        if (!streamUrl.startsWith('http://') && !streamUrl.startsWith('https://')) {
          if (baseUrl) {
            try {
              const base = new URL(baseUrl);
              streamUrl = new URL(streamUrl, base.origin).toString();
            } catch (e) {}
          }
        }

        // Generate safe stable ID if missing, avoiding unescape/btoa crashes
        const finalId = curId || ('ch_' + Math.abs((curName + streamUrl).split('').reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0)).toString(36) + '_' + result.length);

        result.push({
          stream_id: finalId,
          name: curName || `Channel ${result.length + 1}`,
          stream_icon: curLogo || undefined,
          url: streamUrl,
          category_id: curGroup || 'uncategorized',
          category_name: curGroup
        });
        curName = '';
        curLogo = '';
        curGroup = '';
        curId = '';
      }
    }
    return result;
  };

  // We use the global cache from iptv.ts now to persist across Live/Movies/Series
  const isFetchingRef = useRef(false);
  const lastFetchKeyRef = useRef<string>('');

  const fetchIPTVData = useCallback(async (forceRefresh = false) => {
    const curPlaylistId = settings.activePlaylistId || 'default';
    const typeToLoad = mediaType === 'favorites' ? 'live' : mediaType;
    const fetchKey = `${userId}_${mediaType}_${curPlaylistId}`;

    if (!forceRefresh && isFetchingRef.current && lastFetchKeyRef.current === fetchKey) {
      return;
    }

    isFetchingRef.current = true;
    lastFetchKeyRef.current = fetchKey;
    setLoading(true);
    setStreamError(null);

    const playlist = await fetchActivePlaylist();
    if (!playlist) {
      setChannels([]);
      setCategories([]);
      setLoading(false);
      isFetchingRef.current = false;
      return;
    }

    try {
      const { categories: fetchedCats, channels: fetchedChannels } = await fetchChannelsForType(playlist, typeToLoad as any, [], forceRefresh);

      if (fetchedCats.length > 0 || fetchedChannels.length > 0) {
        if (fetchedCats.length > 0) {
          await saveCategories(fetchedCats.map((c: any, idx: number) => ({ ...c, orderIndex: idx })), typeToLoad as any, curPlaylistId).catch(() => {});
        }
        if (fetchedChannels.length > 0) {
          await saveChannels(fetchedChannels, typeToLoad as any, curPlaylistId, { batchSize: 300 }).catch(() => {});
        }
        const sortedCats = sortCategoriesBySavedOrder(fetchedCats);
        setCategories(sortedCats);
        const defaultCatId = mediaType === 'live'
          ? (sortedCats[0]?.category_id || (favoritesRef.current.length > 0 ? 'favorites' : ''))
          : (mediaType !== 'favorites' ? '__all__' : sortedCats[0]?.category_id || '');
        const firstCatId = (selectedCategory && (mediaType !== 'live' || selectedCategory !== '__all__'))
          ? selectedCategory
          : defaultCatId;
        if (firstCatId) {
          setSelectedCategory(firstCatId);
          const win = await getChannelsByCategoryWindowed(typeToLoad, firstCatId, curPlaylistId, {
            bucketOffset: 0,
            maxItems: isTVOrLowEndDevice() ? 1000 : 4000
          });
          setChannels(win.items || []);
          setCategoryHasMore(win.hasMore);
          setCategoryNextBucketOffset(win.nextBucketOffset);
          setCategoryResolvedId(win.resolvedCategoryId);
        }
      } else {
        setStreamError(isRtl ? 'لم يتم العثور على قنوات أو محتوى في هذا السيرفر.' : 'No channels or content found on this server.');
      }
    } catch (e: any) {
      console.error('Fetch failed', e);
      setStreamError(isRtl ? `فشل الاتصال بالسيرفر: ${e?.message || 'تعذر الاتصال'}` : `Connection failed: ${e?.message || 'Network error'}`);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [userId, mediaType, settings.activePlaylistId, selectedCategory, sortCategoriesBySavedOrder, isRtl]);

  const fetchXtreamStreams = async (catId: string, p: Playlist, actionName?: string, sHost?: string, passedCats?: ParsedCategory[]) => {
    if (catId === '__all__' || catId === 'ALL_CATEGORIES' || !catId || catId === 'FAVORITES_INTERNAL') return;
    if (catId === 'أفلام تجريبية (Test Movies)' || catId === 'مسلسلات تجريبية (Test Series)') return;

    let action = actionName || 'get_live_streams';
    if (!actionName) {
      if (mediaType === 'movie') action = 'get_vod_streams';
      if (mediaType === 'series') action = 'get_series';
    }

    try {
      const host = (p.url || '').trim().replace(/\/+$/, '').replace(/\/(player_api|get|index)\.php.*$/i, '').replace(/\/c\/?$/i, '').replace(/\?.*$/, '');
      const extraParams: any = {};
      if (catId && catId !== '__all__' && catId !== 'All' && catId !== 'all' && catId !== 'ALL_CATEGORIES') extraParams.category_id = catId;

      // Never fall back to uncapped full-catalog fetch (200MB+) on the main thread
      const res = await xtreamFetch(host, p.username || '', p.password || '', action, extraParams);

      if (res.ok && res.rawList.length > 0) {
        const baseStreamUrl = sHost || streamingHost || host;
        let rawList = res.rawList;

        if (catId && catId !== '__all__' && catId !== 'All' && catId !== 'all' && catId !== 'ALL_CATEGORIES') {
          const cleanTarget = String(catId).trim().toLowerCase();
          const filtered = rawList.filter((ch: any) => {
            const cid = String(ch.category_id || '').trim().toLowerCase();
            const cname = String(ch.category_name || ch.category || '').trim().toLowerCase();
            return cid === cleanTarget || cname === cleanTarget;
          });
          if (filtered.length > 0) rawList = filtered;
        }
  
        const catsToUse = (passedCats && passedCats.length > 0) ? passedCats : categories;

        const mapped: ParsedChannel[] = rawList.map((ch: any, idx: number) => {
          const rawStreamId = String(ch.stream_id || ch.series_id || ch.id || `${catId}-${idx}`);
          const cleanStreamId = rawStreamId.replace(/\.(m3u8|ts|mp4|mkv|avi|flv)$/i, '');
          const ext = ch.container_extension || (mediaType === 'live' ? 'm3u8' : 'mp4');

          let directUrl = ch.stream_url || ch.direct_source || ch.url || '';
          if (!directUrl) {
            if (mediaType === 'live') directUrl = `${baseStreamUrl}/live/${p.username}/${p.password}/${cleanStreamId}.${ext}`;
            else if (mediaType === 'movie') directUrl = `${baseStreamUrl}/movie/${p.username}/${p.password}/${cleanStreamId}.${ext}`;
            else directUrl = `${baseStreamUrl}/series/${p.username}/${p.password}/${cleanStreamId}.${ext}`;
          }

          const rawCatId = String(ch.category_id || catId || 'uncategorized');
          const matchedCat = catsToUse.find(c => String(c.category_id) === rawCatId);
          const rawCatName = String(ch.category_name || (matchedCat ? matchedCat.category_name : '') || '').trim();
          const resolvedCatName = rawCatName.toLowerCase() === 'عام (general)' ? '' : rawCatName;

          return {
            stream_id: cleanStreamId,
            name: String(ch.name || ch.title || 'Channel ' + (idx + 1)),
            stream_icon: ch.stream_icon || ch.cover || ch.logo || undefined,
            url: directUrl,
            category_id: rawCatId,
            category_name: resolvedCatName,
            container_extension: ext
          };
        });
 
        saveChannels(mapped, (mediaType === 'favorites' ? 'live' : mediaType) as 'live' | 'movie' | 'series', settings.activePlaylistId || 'default');

        setChannels(prev => {
          const existingIds = new Set(prev.map(c => c.stream_id));
          const newStreams = mapped.filter(c => !existingIds.has(c.stream_id));
          return sortChannelsBySavedOrder(prev.concat(newStreams));
        });

      }
    } catch (err) {}
  };

  const fetchStalkerStreams = async (catId: string, p: Playlist) => {
    try {
      const fetchUrl = getPlatformUrl('stalker', p.url || p.portal || '', {
        action: 'get_ordered_list',
        type: 'itv',
        category: catId,
        mac: p.macAddress || ''
      });
      const chRes = await axios.get(fetchUrl);
      const rawData = chRes.data?.js?.data || chRes.data?.js || chRes.data?.data;
      if (Array.isArray(rawData)) {
        const cleanHost = (p.url || p.portal || '').replace(/\/+$/, '');
        const mapped: ParsedChannel[] = rawData.map((ch: any, idx: number) => ({
          stream_id: String(ch.id || ch.cmd || idx),
          name: String(ch.name || 'Channel ' + (idx + 1)),
          stream_icon: ch.logo,
          url: ch.cmd || `${cleanHost}/play/${ch.id}`,
          category_id: catId
        }));
        setChannels(prev => {
          const existingIds = new Set(prev.map(c => c.stream_id));
          const newStreams = mapped.filter(c => !existingIds.has(c.stream_id));
          return sortChannelsBySavedOrder(prev.concat(newStreams));
        });

      }
    } catch (err) {}
  };

  // Initial focus setup for categories pane when LivePlayer mounts cleanly (or restore channel focus on fullscreen exit)
  useEffect(() => {
    if (!loading && categories.length > 0 && !isFullscreen && !activeVodPlayer && !movieDetailsModal && !reorderTarget && !externalLaunchModal) {
      const rafId = requestAnimationFrame(() => {
        if (!getCurrentTVFocus()) {
          if (tvFocusedPane.current === 'channels' || tvFocusedPane.current === 'player') {
            tvFocusedPane.current = 'channels';
            focusChannelAtIdx(tvFocusedChannelIndex.current);
          } else {
            tvFocusedPane.current = 'categories';
            focusCategoryAtIdx(tvFocusedCatIndex.current || 0);
          }
        }
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [loading, categories.length, isFullscreen, activeVodPlayer, movieDetailsModal, reorderTarget, externalLaunchModal, focusCategoryAtIdx, focusChannelAtIdx]);

  useEffect(() => {
    const update = async () => {
      if (!selectedCategory || !activePlaylist) return;
      if (
        selectedCategory === '__all__' ||
        selectedCategory === 'ALL_CATEGORIES' ||
        selectedCategory === 'All' ||
        selectedCategory === 'all' ||
        selectedCategory === 'FAVORITES_INTERNAL' ||
        selectedCategory === 'favorites' ||
        selectedCategory === 'recent' ||
        selectedCategory === WATCH_HISTORY_CAT_ID ||
        selectedCategory === CONTINUE_WATCHING_CAT_ID
      ) return;
      
      // Skip network fallback whenever IndexedDB already returned items for this category
      if (channels.length > 0) return;

      // Only trigger lightweight per-category Xtream fetch AFTER IndexedDB lookup for this category has settled
      const typeToLoad = mediaType === 'favorites' ? 'live' : mediaType;
      const expectedKey = `${activePlaylist.id}_${typeToLoad}_${selectedCategory}`;
      if (dbLookupSettledKeyRef.current !== expectedKey) return;

      if (activePlaylist.type === 'xtream') {
        await fetchXtreamStreams(selectedCategory, activePlaylist);
      } else if (activePlaylist.type === 'stalker') {
        await fetchStalkerStreams(selectedCategory, activePlaylist);
      }
    };
    update();
  }, [selectedCategory, activePlaylist, channels.length, mediaType]);

  const getTargetVideoElement = (slotIdx: number = 0): HTMLVideoElement | null => {
    return playerVideoElements.current[slotIdx] || null;
  };

  const hiddenList = useMemo(() => {
    if (mediaType === 'movie') return settings.hiddenMovieCategories || settings.hiddenCategories || [];
    if (mediaType === 'series') return settings.hiddenSeriesCategories || settings.hiddenCategories || [];
    return settings.hiddenLiveCategories || settings.hiddenCategories || [];
  }, [mediaType, settings.hiddenLiveCategories, settings.hiddenMovieCategories, settings.hiddenSeriesCategories, settings.hiddenCategories]);

  const hiddenSet = useMemo(() => new Set(hiddenList), [hiddenList]);
  const favSet = useMemo(() => new Set(favorites), [favorites]);

  const watchHistoryCount = useMemo(() => {
    const tType = mediaType === 'favorites' ? 'live' : mediaType;
    return getWatchHistory(tType as 'live' | 'movie' | 'series', effectivePlaylistId).length;
  }, [mediaType, effectivePlaylistId, historyRevision]);

  const continueWatchingCount = useMemo(() => {
    if (mediaType !== 'movie' && mediaType !== 'series') return 0;
    return getContinueWatchingItems(mediaType, effectivePlaylistId, getWatchHistory(mediaType, effectivePlaylistId)).length;
  }, [mediaType, effectivePlaylistId, progressRevision, historyRevision]);

  const visibleCategories = useMemo(() => {
    const seen = new Set<string>();
    const cleanCats = categories.filter(cat => {
      if (!cat || !cat.category_id || !cat.category_name || !cat.category_name.trim()) return false;
      if (cat.category_id === '__all__') return false;
      if (hiddenSet.has(cat.category_id) || hiddenSet.has(cat.category_name)) return false;
      if (
        cat.category_name === 'جميع المجموعات' ||
        cat.category_name === 'All Groups' ||
        cat.category_name === 'ALL' ||
        cat.category_name === 'All'
      ) return false;
      if (isFavCategory(cat)) return false;
      if (seen.has(cat.category_id)) return false;
      seen.add(cat.category_id);
      return true;
    });

    if (mediaType === 'favorites') {
      if (favorites.length > 0) {
        return [{
          category_id: 'favorites',
          category_name: `⭐ ${t('favorites')}`,
          count: favorites.length
        }, ...cleanCats];
      }
      return cleanCats;
    }

    const totalCleanCount = cleanCats.reduce((sum, c) => sum + (Number(c.count) || 0), 0);
    const allCat: ParsedCategory = {
      category_id: '__all__',
      category_name: t('all_items'),
      count: totalCleanCount
    };

    const historyCat: ParsedCategory = {
      category_id: WATCH_HISTORY_CAT_ID,
      category_name: t('watch_history'),
      count: watchHistoryCount
    };

    const continueCat: ParsedCategory = {
      category_id: CONTINUE_WATCHING_CAT_ID,
      category_name: isRtl ? 'Watch It (متابعة المشاهدة)' : 'Watch It (Continue Watching)',
      count: continueWatchingCount
    };

    if (mediaType === 'movie' || mediaType === 'series') {
      const specialCats: ParsedCategory[] = [continueCat];
      if (watchHistoryCount > 0 || selectedCategory === WATCH_HISTORY_CAT_ID) {
        specialCats.push(historyCat);
      }
      return [allCat, ...specialCats, ...cleanCats];
    }

    // Live TV: Favorites (if any) at top, then channel categories (omitting «الجميع» only from Live as requested)
    if (mediaType === 'live') {
      if (favorites.length > 0) {
        const favLabel = t('favorites');
        const favCat: ParsedCategory = {
          category_id: 'favorites',
          category_name: `⭐ ${favLabel}`,
          count: favorites.length
        };
        return [favCat, ...cleanCats];
      }
      return cleanCats;
    }

    return [allCat, historyCat, ...cleanCats];
  }, [categories, hiddenSet, favorites.length, mediaType, settings.language, watchHistoryCount, continueWatchingCount, selectedCategory]);

  visibleCategoriesRef.current = visibleCategories;

  // Ensure Live TV immediately selects the first real category if selectedCategory was '__all__'
  useEffect(() => {
    if (mediaType === 'live' && selectedCategory === '__all__') {
      const firstValid = visibleCategories.find(c => c.category_id !== '__all__');
      if (firstValid) {
        setSelectedCategory(firstValid.category_id);
      }
    }
  }, [mediaType, selectedCategory, visibleCategories]);

  const filteredChannels = useMemo(() => {
    if (categorySearchMatches !== null && search.trim()) {
      return categorySearchMatches;
    }

    const query = search.trim().toLowerCase();
    const targetCategory = (selectedCategory && selectedCategory !== '__all__' && selectedCategory !== 'ALL_CATEGORIES' && selectedCategory !== 'All' && selectedCategory !== 'all') ? String(selectedCategory) : null;

    let result: ParsedChannel[] = [];
    
    if (selectedCategory === WATCH_HISTORY_CAT_ID || selectedCategory === CONTINUE_WATCHING_CAT_ID) {
      result = channels;
    } else if (selectedCategory === 'favorites' || selectedCategory === 'FAVORITES_INTERNAL' || mediaType === 'favorites') {
      if (mediaType === 'movie' || mediaType === 'series') {
        return [];
      }
      const seenFavStreamIds = new Set<string>();
      for (let i = 0; i < channels.length; i++) {
        const ch = channels[i];
        if (ch.type && ch.type !== 'live') continue;
        const sid = String(ch.stream_id || (ch as any).id || '');
        if (!sid || seenFavStreamIds.has(sid)) continue;
        if (favSet.has(sid)) {
          seenFavStreamIds.add(sid);
          result.push(ch);
        }
      }
    } else if (targetCategory) {
      const cleanTarget = targetCategory.trim().toLowerCase();
      const resolvedTarget = categoryResolvedId ? categoryResolvedId.trim().toLowerCase() : cleanTarget;
      // Fast path: if channels was loaded scoped to this category, check once if all belong to it
      let allMatch = channels.length > 0;
      for (let i = 0; i < channels.length; i++) {
        const ch = channels[i];
        const cid = String(ch.category_id || '').trim().toLowerCase();
        if (cid !== cleanTarget && cid !== resolvedTarget) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) {
        result = channels;
      } else {
        result = channels.filter(ch => {
          const cid = String(ch.category_id || '').trim().toLowerCase();
          const cname = String(ch.category_name || ch.category || '').trim().toLowerCase();
          return cid === cleanTarget || cid === resolvedTarget || cname === cleanTarget;
        });
      }
    } else {
      if (hiddenSet.size === 0) {
        result = channels;
      } else {
        for (let i = 0; i < channels.length; i++) {
          const ch = channels[i];
          if (hiddenSet.has(ch.category_id) || hiddenSet.has(ch.category_name || '')) continue;
          result.push(ch);
        }
      }
    }

    if (query) {
      result = result.filter(ch => (ch.name || '').toLowerCase().includes(query));
    }

    if (result.length === 0 && !query && mediaType !== 'favorites' && selectedCategory !== 'FAVORITES_INTERNAL' && !targetCategory && selectedCategory !== WATCH_HISTORY_CAT_ID && selectedCategory !== CONTINUE_WATCHING_CAT_ID) {
      if (channels.length > 0) {
        result = channels;
      }
    }

    if (selectedCategory === WATCH_HISTORY_CAT_ID || selectedCategory === CONTINUE_WATCHING_CAT_ID) {
      return result;
    }

    if (sortOrder === 'az') {
      result = result.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
    } else if (mediaType === 'movie' || mediaType === 'series') {
      const vodSort = settings.vodSortBy || 'newest';
      const getAddedScore = (item: ParsedChannel): number => {
        const rawAdded = Number(item.added);
        if (rawAdded > 0) return rawAdded;
        if (item.releaseDate) {
          const ts = Date.parse(String(item.releaseDate));
          if (!isNaN(ts)) return ts;
          const yr = parseInt(String(item.releaseDate), 10);
          if (!isNaN(yr) && yr > 1900) return yr;
        }
        const sidNum = parseInt(String(item.stream_id || ''), 10);
        return !isNaN(sidNum) && sidNum > 0 ? sidNum : (item.orderIndex || 0);
      };

      if (vodSort === 'alpha') {
        result = result.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
      } else if (vodSort === 'rating') {
        result = result.slice().sort((a, b) => {
          const ra = parseFloat(String(a.rating || '0')) || 0;
          const rb = parseFloat(String(b.rating || '0')) || 0;
          return rb - ra;
        });
      } else if (vodSort === 'oldest') {
        result = result.slice().sort((a, b) => getAddedScore(a) - getAddedScore(b));
      } else {
        result = result.slice().sort((a, b) => getAddedScore(b) - getAddedScore(a));
      }
    } else {
      result = sortChannelsBySavedOrder(result);
    }

    return result;
  }, [channels, categorySearchMatches, search, sortOrder, selectedCategory, categoryResolvedId, hiddenSet, favSet, mediaType, settings.vodSortBy, sortChannelsBySavedOrder]);

  useEffect(() => {
    filteredChannelsRef.current = selectedCategory === 'recent'
      ? getRecents().map((r: any) => ({ ...r, stream_id: r.id }))
      : filteredChannels;
  }, [filteredChannels, selectedCategory]);

  const scheduleVodDetailsPrefetch = useCallback((ch?: ParsedChannel | null) => {
    if (!ch || (mediaType !== 'movie' && mediaType !== 'series')) return;
    const effPlId = activePlaylist?.id || settings.activePlaylistId || 'default';
    const resolvedId = cleanVodEntityId((ch as any).series_id || ch.stream_id || (ch as any).id || '', effPlId)
      || String((ch as any).series_id || ch.stream_id || (ch as any).id || '').trim();
    if (!resolvedId) return;
    const memKey = `${effPlId}_${resolvedId}`;
    const alreadyMem = mediaType === 'series'
      ? sessionSeriesDetailsCache.has(memKey)
      : sessionVodDetailsCache.has(memKey);
    if (alreadyMem) return;

    if (detailsPrefetchTimerRef.current) {
      clearTimeout(detailsPrefetchTimerRef.current);
    }
    detailsPrefetchTimerRef.current = setTimeout(() => {
      fetchMediaDetails(resolvedId, mediaType, activePlaylist).catch(() => {});
    }, 100);
  }, [mediaType, activePlaylist, settings.activePlaylistId]);

  const handleHighlightChannel = useCallback((ch: ParsedChannel) => {
    if (!ch || !ch.stream_id) return;
    currentHighlightedChannelRef.current = ch.stream_id;
    scheduleVodDetailsPrefetch(ch);
  }, [scheduleVodDetailsPrefetch]);

  const assignChannelToMultiView = useCallback((ch: ParsedChannel) => {
    const curSlots = multiViewSlotsRef.current;
    if (curSlots.length === 0) return;

    let targetSlotId = multiViewPickingSlot;
    if (targetSlotId === null || !curSlots.some((s) => s.slotId === targetSlotId)) {
      const emptySlot = curSlots.find((s) => !s.channel);
      targetSlotId = emptySlot
        ? emptySlot.slotId
        : (curSlots.some((s) => s.slotId === selectedSlotIndex) ? selectedSlotIndex : curSlots[0].slotId);
    }

    const resolvedTargetId = targetSlotId;
    const preferredRatio: MultiViewAspectRatio = ch.stream_id
      ? (multiViewChannelAspectRatiosRef.current[ch.stream_id] || 'fill')
      : 'fill';
    setMultiViewSlots((prev) =>
      prev.map((item) => (item.slotId === resolvedTargetId ? { ...item, channel: ch, aspectRatio: preferredRatio } : item))
    );
    setSelectedSlotIndex(resolvedTargetId);
    setAudioSlotIndex((prevAudio) => {
      const hasLiveAudio = curSlots.some((s) => s.slotId === prevAudio && s.channel !== null);
      return hasLiveAudio && prevAudio !== resolvedTargetId ? prevAudio : resolvedTargetId;
    });
    setMultiViewPickingSlot(null);
    tvFocusedPane.current = 'multiview';
    requestAnimationFrame(() => {
      const el = document.getElementById(`multiview-slot-${resolvedTargetId}`);
      if (el) setTVFocus(el, { scroll: false });
    });
  }, [multiViewPickingSlot, selectedSlotIndex]);

  const handleOpenFullscreen = useCallback((ch: ParsedChannel) => {
    if (!ch) return;
    if (previewDebounceRef.current) {
      clearTimeout(previewDebounceRef.current);
      previewDebounceRef.current = null;
    }
    if (detailsPrefetchTimerRef.current) {
      clearTimeout(detailsPrefetchTimerRef.current);
      detailsPrefetchTimerRef.current = null;
    }
    currentHighlightedChannelRef.current = ch.stream_id;
    addToRecents(ch);
    if (multiViewActive && (mediaType === 'live' || mediaType === 'favorites')) {
      assignChannelToMultiView(ch);
      return;
    }
    setSelectedChannel(ch);
    setActivePlayingMovie(ch);

    if (mediaType === 'movie' || mediaType === 'series') {
      const effPlId = activePlaylist?.id || settings.activePlaylistId || 'default';
      const resolvedId = cleanVodEntityId((ch as any).series_id || ch.stream_id || (ch as any).id || '', effPlId)
        || String((ch as any).series_id || ch.stream_id || (ch as any).id || '').trim();
      if (mediaType === 'series') {
        activeSeriesParentRef.current = { ...ch, stream_id: resolvedId, series_id: resolvedId } as any;
        autoSeasonSelectedRef.current = null;
      }
      returningEpisodeIdRef.current = null;
      setMovieDetailsModal(ch);

      const memHit = mediaType === 'series'
        ? sessionSeriesDetailsCache.get(`${effPlId}_${resolvedId}`)
        : sessionVodDetailsCache.get(`${effPlId}_${resolvedId}`);
      if (memHit) {
        setMediaDetailInfo(memHit);
        setDetailLoading(false);
        return;
      }

      const initialPlot = String((ch as any).plot || (ch as any).description || '');
      const seededInfo = initialPlot || (ch as any).cast || (ch as any).director || (ch as any).genre || (ch as any).rating || (ch as any).releaseDate || (ch as any).duration
        ? {
            info: {
              plot: initialPlot,
              cast: (ch as any).cast || '',
              director: (ch as any).director || '',
              genre: (ch as any).genre || '',
              rating: (ch as any).rating || '',
              releaseDate: (ch as any).releaseDate || '',
              duration: (ch as any).duration || '',
              cover_big: ch.cover || ch.stream_icon || ch.logo
            }
          }
        : null;

      setMediaDetailInfo(seededInfo);
      setDetailLoading(true);
      fetchMediaDetails(resolvedId, mediaType, activePlaylist).then(info => {
        if (info) {
          setMediaDetailInfo(info);
        }
        setDetailLoading(false);
      }).catch(() => {
        setDetailLoading(false);
      });
      return;
    }

    if (settings.useExternalPlayer) {
      launchExternalPlayer(ch.url, ch, 'live');
    } else {
      setIsFullscreen(true);
      setActiveVodPlayer(ch);
    }
  }, [mediaType, settings.useExternalPlayer, settings.selectedPlayer, settings.activePlaylistId, activePlaylist, multiViewActive, assignChannelToMultiView]);


  const handleRemoveMultiViewSlot = useCallback((targetSlotId: number) => {
    const prev = multiViewSlotsRef.current;
    const remaining = prev.filter((item) => item.slotId !== targetSlotId && item.channel !== null);

    if (remaining.length === 0) {
      setMultiViewActive(false);
      setMultiViewMode(1);
      setMultiViewSlots([]);
      setMultiViewPickingSlot(null);
      setMultiViewFullscreenSlot(null);
      setSelectedSlotIndex(0);
      setAudioSlotIndex(0);
      setIsFullscreen(false);
      setActiveVodPlayer(null);
      setSelectedChannel(null);
      setActivePlayingMovie(null);
      tvFocusedPane.current = 'channels';
      requestAnimationFrame(() => focusChannelAtIdx(tvFocusedChannelIndex.current >= 0 ? tvFocusedChannelIndex.current : 0));
      return;
    }

    const nextMode = Math.min(4, Math.max(1, remaining.length)) as 1 | 2 | 3 | 4;
    const fallbackSlotId = remaining[0].slotId;

    setMultiViewSlots(remaining);
    setMultiViewMode(nextMode);
    setMultiViewFullscreenSlot((cur) => (cur === targetSlotId ? null : cur));
    setMultiViewPickingSlot((cur) => (cur === targetSlotId ? null : cur));
    setAudioSlotIndex((cur) =>
      cur === targetSlotId || !remaining.some((r) => r.slotId === cur) ? fallbackSlotId : cur
    );
    setSelectedSlotIndex((cur) => {
      const nextSel = cur === targetSlotId || !remaining.some((r) => r.slotId === cur) ? fallbackSlotId : cur;
      tvFocusedPane.current = 'multiview';
      requestAnimationFrame(() => {
        const el = document.getElementById(`multiview-slot-${nextSel}`);
        if (el) setTVFocus(el, { scroll: false });
      });
      return nextSel;
    });
  }, [focusChannelAtIdx]);

  const handleChannelClick = useCallback((ch: ParsedChannel) => {
    if (!ch) return;

    if (multiViewActive && (mediaType === 'live' || mediaType === 'favorites')) {
      assignChannelToMultiView(ch);
      addToRecents(ch);
      return;
    }

    if (mediaType === 'movie' || mediaType === 'series') {
      if (selectedCategory === CONTINUE_WATCHING_CAT_ID) {
        const effPlId = activePlaylist?.id || settings.activePlaylistId || 'default';
        const prog = mediaType === 'series'
          ? getSeriesLastUnfinishedEpisode(effPlId, cleanVodEntityId((ch as any).series_id || ch.stream_id, effPlId))
          : getVodProgress({ mediaType: 'movie', playlistId: effPlId, streamId: cleanVodEntityId(ch.stream_id, effPlId) });

        if (prog && prog.positionSec >= MIN_RESUME_POSITION_SEC && !prog.completed) {
          watchItModalOpenedAtRef.current = Date.now();
          markLongPressModalOpened(400);
          setWatchItResumeModal({ channel: ch, progress: prog });
          return;
        }
      }
      handleOpenFullscreen(ch);
      return;
    }

    if (settings.useExternalPlayer) {
      setForceInternalPlaybackOnce(false);
      setSelectedChannel(ch);
      setActivePlayingMovie(ch);
      void launchExternalPlayer(ch.url, ch, 'live');
      return;
    }

    // For Live channels:
    // First click: plays in small preview screen
    // Second click on the same selected channel: opens in FULLSCREEN!
    if (selectedChannel?.stream_id === ch.stream_id && !activeVodPlayer) {
      handleOpenFullscreen(ch);
    } else {
      setSelectedChannel(ch);
      setActivePlayingMovie(ch);
      addToRecents(ch);
    }
  }, [mediaType, settings.useExternalPlayer, selectedChannel?.stream_id, activeVodPlayer, handleOpenFullscreen, multiViewActive, assignChannelToMultiView]);

  useEffect(() => {
    handleHighlightChannelRef.current = handleHighlightChannel;
  }, [handleHighlightChannel]);

  useEffect(() => {
    handleOpenFullscreenRef.current = handleOpenFullscreen;
  }, [handleOpenFullscreen]);

  useEffect(() => {
    handleChannelClickRef.current = handleChannelClick;
  }, [handleChannelClick]);

  const switchChannelByOffset = useCallback((offset: number) => {
    if (multiViewActive || filteredChannels.length === 0) return;
    const currentCh = selectedChannel;
    const currentIndex = currentCh ? filteredChannels.findIndex(c => c.stream_id === currentCh.stream_id) : 0;
    const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (safeCurrentIndex + offset + filteredChannels.length) % filteredChannels.length;
    const nextCh = filteredChannels[nextIndex];
    if (!nextCh) return;

    setSelectedChannel(nextCh);
    setActivePlayingMovie(nextCh);
    addToRecents(nextCh);
  }, [multiViewActive, filteredChannels, selectedChannel]);

  const touchStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartTime = useRef<number>(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    // Gestures disabled per user request
    triggerControlsVisibility();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    // Gestures disabled per user request
    touchStartY.current = null;
    touchStartX.current = null;
  };

  const handleSelectAudioTrack = (trackId: number, trackName: string) => {
    setSelectedAudioTrack(trackName);
    const hls = hlsInstances.current[0];
    if (hls && hls.audioTracks && hls.audioTracks.length > 0) hls.audioTrack = trackId;
    setShowAudioMenu(false);
    triggerControlsVisibility();
  };

  const handleSelectSubtitleTrack = (trackId: number, trackName: string) => {
    setSelectedSubtitleTrack(trackName);
    const hls = hlsInstances.current[0];
    if (hls) hls.subtitleTrack = trackId;
    setSubtitleActive(trackId >= 0);
    setShowSubMenu(false);
    triggerControlsVisibility();
  };

  const handleSelectQuality = (levelId: number, qualityLabel: string) => {
    setSelectedQuality(qualityLabel);
    const hls = hlsInstances.current[0];
    if (hls) hls.currentLevel = levelId;
    setShowQualityMenu(false);
    triggerControlsVisibility();
  };

  const toggleFullscreen = useCallback(() => {
    const container = fullscreenContainerRef.current;
    const currentIsFs = isFullscreen;
    
    setShowControls(true);
    setIsFullscreen(!currentIsFs);

    // Force aspect ratio to 'fill' or '16:9' when going fullscreen if it was 'fit'
    if (!currentIsFs && aspectRatio === 'fit') {
      setAspectRatio('16:9');
    }

    if (currentIsFs) {
      requestAnimationFrame(() => {
        tvFocusedPane.current = 'channels';
        focusChannelAtIdx(tvFocusedChannelIndex.current);
      });
    }

    if (container) {
      const requestFs = container.requestFullscreen || (container as any).webkitRequestFullscreen || (container as any).mozRequestFullScreen || (container as any).msRequestFullscreen;
      const isFs = !!(document.fullscreenElement || (document as any).webkitFullscreenElement || (document as any).mozFullScreenElement || (document as any).msFullscreenElement);
      
      if (!isFs) {
        if (requestFs) {
          requestFs.call(container).catch(() => {
            // Native fallback for mobile webviews
            const vid = getTargetVideoElement(0);
            if (vid) {
              const vidRequestFs = vid.requestFullscreen || (vid as any).webkitRequestFullscreen;
              if (vidRequestFs) vidRequestFs.call(vid).catch(() => {});
            }
          });
        }
      } else {
        const exitFs = document.exitFullscreen || (document as any).webkitExitFullscreen || (document as any).mozCancelFullScreen || (document as any).msExitFullscreen;
        if (exitFs) {
          exitFs.call(document).catch(() => {});
        }
      }
    }
  }, [isFullscreen, aspectRatio]);

  useEffect(() => {
    toggleFullscreenRef.current = toggleFullscreen;
  }, [toggleFullscreen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      if (isFullscreen) return;
      const key = e.key.toLowerCase();

      if (key === 'r' || e.code === 'F1') {
        e.preventDefault();
        fetchIPTVData(true);
      } else if (key === 'g' || e.code === 'F2') {
        e.preventDefault();
        setShowRemoteHelp(prev => !prev);
      } else if (key === 'y' || e.code === 'F3') {
        e.preventDefault();
        if (mediaType === 'movie' || mediaType === 'series') {
          const searchInput = document.getElementById('vod-search-input');
          if (searchInput) setTVFocus(searchInput, { scroll: false });
        }
      } else if (key === 'b' || e.code === 'F4') {
        e.preventDefault();
        if (selectedChannel) toggleFavorite(selectedChannel.stream_id);
      } else if (key === 'f') {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedChannel, isFullscreen, toggleFullscreen, mediaType]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!(document.fullscreenElement || (document as any).webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  const resolveLocalPlaylistSync = (): Playlist | null => {
    if (activePlaylist) return activePlaylist;
    try {
      const rawLocal = localStorage.getItem('achour_local_playlists');
      if (!rawLocal) return null;
      const list: Playlist[] = JSON.parse(rawLocal);
      if (settings.activePlaylistId) {
        const hit = list.find(item => item.id === settings.activePlaylistId);
        if (hit) return hit;
      }
      return list[0] || null;
    } catch {
      return null;
    }
  };

  const fetchMediaDetails = async (rawId: string, type: 'movie' | 'series', p?: Playlist | null) => {
    const syncPl = p || resolveLocalPlaylistSync();
    const resolvedPlaylist = syncPl || await fetchActivePlaylist();
    if (!rawId || !resolvedPlaylist) return null;
    const playlistId = resolvedPlaylist.id;
    const id = cleanVodEntityId(rawId, playlistId) || String(rawId).trim();
    const memKey = `${playlistId}_${id}`;
    const cacheMap = type === 'series' ? sessionSeriesDetailsCache : sessionVodDetailsCache;

    const memHit = cacheMap.get(memKey);
    if (memHit) return memHit;

    const inflightKey = `${playlistId}_${type}_${id}`;
    const existingFlight = inFlightDetailsCache.get(inflightKey);
    if (existingFlight) return existingFlight;

    const loaderPromise = (async () => {
      try {
        let cachedEps: any[] = [];
        let cachedDetails: any = null;

        if (type === 'series') {
          cachedDetails = await getSeriesDetails(playlistId, id);
          if (cachedDetails) {
            const epVal = cachedDetails.episodes;
            const hasEpisodes = Array.isArray(epVal)
              ? epVal.length > 0
              : Boolean(epVal && typeof epVal === 'object' && Object.keys(epVal).length > 0);
            if (hasEpisodes) {
              const result = {
                info: cachedDetails.info || {},
                seasons: cachedDetails.seasons || [],
                episodes: cachedDetails.episodes
              };
              setBoundedDetailCache(sessionSeriesDetailsCache, memKey, result, 30);
              return result;
            }
          }
        } else {
          cachedDetails = await getVodDetails(playlistId, id);
          if (cachedDetails?.info && (cachedDetails.info.plot || cachedDetails.info.cast || cachedDetails.info.genre || Object.keys(cachedDetails.info).length > 0)) {
            setBoundedDetailCache(sessionVodDetailsCache, memKey, cachedDetails, 40);
            return cachedDetails;
          }
        }

        const action = type === 'movie' ? 'get_vod_info' : 'get_series_info';
        const rawHost = resolvedPlaylist?.url || streamingHost || '';
        const host = rawHost.trim().replace(/\/+$/, '').replace(/\/(player_api|get|index)\.php.*$/i, '').replace(/\/c\/?$/i, '').replace(/\?.*$/, '');

        let data: any = null;
        if (host && resolvedPlaylist?.username && resolvedPlaylist?.password) {
          const xtRes = await xtreamFetch(host, resolvedPlaylist.username, resolvedPlaylist.password, action, {
            [type === 'movie' ? 'vod_id' : 'series_id']: id
          }, 1);
          if (xtRes.ok && xtRes.data) {
            data = xtRes.data;
          }
        }

        if (data && typeof data === 'object') {
          if (type === 'series') {
            let epList: any[] = [];
            if (data.episodes) {
              if (Array.isArray(data.episodes)) {
                epList = data.episodes;
              } else if (typeof data.episodes === 'object') {
                Object.entries(data.episodes).forEach(([sKey, arr]) => {
                  const sNumMatch = String(sKey).match(/\d+/);
                  const sNum = sNumMatch ? parseInt(sNumMatch[0], 10) : 1;
                  if (Array.isArray(arr)) {
                    arr.forEach((ep: any) => epList.push({ ...ep, season: ep.season ?? ep.season_num ?? sNum }));
                  }
                });
              }
            }
            if (epList.length > 0) {
              saveEpisodes(playlistId, id, epList).catch(() => {});
            }
            saveSeriesDetails(playlistId, id, {
              info: data.info || {},
              seasons: data.seasons || [],
              episodes: data.episodes || epList
            }).catch(() => {});
            setBoundedDetailCache(sessionSeriesDetailsCache, memKey, data, 30);
            return data;
          }

          const normalizedVod = {
            info: { ...(data.movie_data || {}), ...(data.info || {}) },
            movie_data: data.movie_data || {}
          };
          saveVodDetails(playlistId, id, normalizedVod).catch(() => {});
          setBoundedDetailCache(sessionVodDetailsCache, memKey, normalizedVod, 40);
          return normalizedVod;
        }

        if (type === 'series' && cachedEps.length > 0) {
          const fallback = { info: cachedDetails?.info || {}, seasons: cachedDetails?.seasons || [], episodes: cachedEps };
          setBoundedDetailCache(sessionSeriesDetailsCache, memKey, fallback, 30);
          return fallback;
        }
        return cachedDetails || null;
      } catch {
        return null;
      } finally {
        inFlightDetailsCache.delete(inflightKey);
      }
    })();

    inFlightDetailsCache.set(inflightKey, loaderPromise);
    return loaderPromise;
  };


  const isMultiViewSlotFullscreen = multiViewActive && multiViewFullscreenSlot !== null;
  const isViewingFullscreen = (isFullscreen && (mediaType === 'live' || mediaType === 'favorites')) || Boolean(activeVodPlayer && (mediaType === 'movie' || mediaType === 'series'));

  // Release heavy IndexedDB transient read caches without wiping active category channels (keeps Back <50ms)
  useEffect(() => {
    if (isViewingFullscreen || isMultiViewSlotFullscreen) {
      trimDbMemoryCaches();
    }
  }, [isViewingFullscreen, isMultiViewSlotFullscreen]);

  const handleColumnCountChange = useCallback((cols: number) => {
    gridColumnCountRef.current = cols;
  }, []);

  const handleFocusChannel = useCallback((idx: number) => {
    tvFocusedChannelIndex.current = idx;
    tvFocusedPane.current = 'channels';
    const focusedItem = filteredChannelsRef.current?.[idx];
    if (focusedItem) {
      scheduleVodDetailsPrefetch(focusedItem);
    }
  }, [scheduleVodDetailsPrefetch]);

  const handleReorderChannel = useCallback((item: any) => {
    markLongPressModalOpened(700);
    setReorderTarget({
      type: 'channel',
      id: item.stream_id,
      index: item.realIdx,
      name: item.name
    });
  }, []);

  const recentChannelItems = useMemo(() => {
    if (selectedCategory !== 'recent') return null;
    return getRecents().map((r: any) => ({ ...r, stream_id: r.id }));
  }, [selectedCategory]);

  const isLiveMode = mediaType === 'live' || mediaType === 'favorites';
  const isVodGridMode = mediaType === 'movie' || mediaType === 'series';

  const realLiveCats = useMemo(
    () => visibleCategories.filter(c => c.category_id !== '__all__' && c.category_id !== 'favorites' && c.category_id !== WATCH_HISTORY_CAT_ID && c.category_id !== CONTINUE_WATCHING_CAT_ID),
    [visibleCategories]
  );

  const handleFocusCatIdx = useCallback((idx: number) => {
    tvFocusedPane.current = 'categories';
    tvFocusedCatIndex.current = idx;
  }, []);

  const handleReorderCategory = useCallback((item: any) => {
    const targetId = item.id || item.category_id;
    if (targetId === '__all__' || targetId === WATCH_HISTORY_CAT_ID || targetId === CONTINUE_WATCHING_CAT_ID || targetId === 'favorites') return;
    markLongPressModalOpened(700);
    const realIdx = Math.max(0, realLiveCats.findIndex(c => c.category_id === targetId));
    const targetName = item.name || item.category_name || 'Category';
    setReorderTarget({
      type: 'category',
      id: targetId,
      index: realIdx,
      name: targetName
    });
  }, [realLiveCats]);

  const handleLiveModalClose = useCallback(() => {
    autoPlayAttemptRef.current = null;
    if (isFullscreen) {
      setIsFullscreen(false);
      setActiveVodPlayer(null);
      requestAnimationFrame(() => {
        tvFocusedPane.current = 'channels';
        focusChannelAtIdx(tvFocusedChannelIndex.current);
      });
    } else {
      setSelectedChannel(null);
      setActiveVodPlayer(null);
    }
  }, [isFullscreen, focusChannelAtIdx]);

  const handleLiveSelectMedia = useCallback((next: any) => {
    setSelectedChannel(next);
    setActivePlayingMovie(next);
  }, []);

  const handleModalToggleFavorite = useCallback((item: any) => {
    const sid = item?.stream_id || item?.id;
    if (sid) toggleFavoriteRef.current(sid);
  }, []);

  const handleVodModalClose = useCallback(() => {
    const playedEpId = activeVodPlayer
      ? cleanVodEntityId(
          (activeVodPlayer as any).xtream_id || activeVodPlayer.stream_id || (activeVodPlayer as any).id,
          effectivePlaylistId,
          activeSeriesParentRef.current?.stream_id
        )
      : null;
    const currentSeries = activeSeriesParentRef.current || activeVodPlayer;
    setActiveVodPlayer(null);
    if (currentSeries && mediaType === 'series') {
      returningEpisodeIdRef.current = playedEpId || null;
      detailsModalOpenedAtRef.current = Date.now();
      markLongPressModalOpened(450);
      setMovieDetailsModal(currentSeries);
      return;
    }
    requestAnimationFrame(() => {
      tvFocusedPane.current = 'channels';
      focusChannelAtIdx(tvFocusedChannelIndex.current);
    });
  }, [activeVodPlayer, mediaType, effectivePlaylistId, focusChannelAtIdx]);

  const handleVodSelectMedia = useCallback((next: any) => {
    setActiveVodPlayer(next);
    setSelectedChannel(next);
    setActivePlayingMovie(next);
  }, []);

  const handleLivePlaybackStarted = useCallback((playedMedia: any) => {
    autoPlayAttemptRef.current = null;
    const target = playedMedia || selectedChannel;
    if (!target || !target.stream_id) return;
    addToWatchHistory('live', target, effectivePlaylistId);
    saveLastWatchedChannel(target, effectivePlaylistId);
  }, [selectedChannel, effectivePlaylistId]);

  const handleLivePlaybackFailed = useCallback((_failedMedia: any) => {
    if (autoPlayAttemptRef.current) {
      triggerAutoPlayFallback();
    }
  }, [triggerAutoPlayFallback]);

  const handleVodPlaybackStarted = useCallback((playedMedia: any) => {
    if (mediaType === 'series') {
      const seriesTarget = activeSeriesParentRef.current || playedMedia || activeVodPlayer;
      if (seriesTarget?.stream_id) {
        addToWatchHistory('series', seriesTarget, effectivePlaylistId);
      }
    } else {
      const movieTarget = playedMedia || activeVodPlayer;
      if (movieTarget?.stream_id) {
        addToWatchHistory('movie', movieTarget, effectivePlaylistId);
      }
    }
  }, [mediaType, activeVodPlayer, effectivePlaylistId]);

  const rawPageScale = (mediaType === 'live' || mediaType === 'favorites' ? (settings.livePageScale ?? 100) : (settings.vodPageScale ?? 100)) / 100;
  const pageScale = (isViewingFullscreen || isMultiViewSlotFullscreen || (multiViewActive && multiViewFullSplit)) ? 1 : rawPageScale;

  return (
    <div 
      data-live-root="true"
      className={`flex flex-col h-full bg-transparent text-white overflow-hidden select-none ${isRtl ? 'font-cairo' : ''}`}
      dir={isRtl ? 'rtl' : 'ltr'}
      onScroll={(e) => {
        if (e.currentTarget.scrollTop !== 0) e.currentTarget.scrollTop = 0;
        if (e.currentTarget.scrollLeft !== 0) e.currentTarget.scrollLeft = 0;
      }}
      style={
        pageScale !== 1
          ? ({ zoom: pageScale, width: `${100 / pageScale}%`, height: `${100 / pageScale}%` } as React.CSSProperties)
          : undefined
      }
    >
      {/* Requirement 2: Top Header - Search Field | Application Logo | Clock (kept hidden in fullscreen for <50ms exit) */}
      <header className={`${(isViewingFullscreen || isMultiViewSlotFullscreen) ? 'hidden' : 'flex'} relative z-30 h-16 items-center justify-between px-6 bg-transparent shrink-0`}>
        <div className="grid grid-cols-3 items-center w-full gap-4">
          {/* Left Column: App name only (logo is splash-screen-only) */}
          <div dir="ltr" className="flex items-center justify-start min-w-0">
            <h1 className="text-sm sm:text-base font-semibold tracking-tight uppercase leading-none whitespace-nowrap achour-glossy-title">ACHOUR PLAYER</h1>
          </div>

          {/* Center Column: Multi View layouts and display controls */}
          <div className="flex items-center justify-center min-w-0 gap-3">
            {(mediaType === 'live' || mediaType === 'favorites') && (
              <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm font-medium">
                <span className="select-none font-semibold achour-glossy-text">Multi View</span>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {([1, 2, 3, 4] as const).map((modeNum, idx) => (
                    <button
                      key={modeNum}
                      data-tv-focusable="true"
                      data-tv-pane="header"
                      data-header-index={idx}
                      tabIndex={0}
                      onClick={() => {
                        if (modeNum === 1 || (multiViewActive && multiViewMode === modeNum)) {
                          const returnChannel =
                            multiViewSlots.find((s) => s.slotId === selectedSlotIndex)?.channel ||
                            multiViewSlots.find((s) => s.channel)?.channel ||
                            preMultiViewChannelRef.current ||
                            null;
                          setMultiViewActive(false);
                          setMultiViewMode(1);
                          setMultiViewSlots([]);
                          setMultiViewPickingSlot(null);
                          setMultiViewFullscreenSlot(null);
                          if (returnChannel) {
                            setSelectedChannel(returnChannel);
                            setActivePlayingMovie(returnChannel);
                          }
                          tvFocusedPane.current = 'channels';
                          requestAnimationFrame(() => focusChannelAtIdx(tvFocusedChannelIndex.current >= 0 ? tvFocusedChannelIndex.current : 0));
                          return;
                        }
                        preMultiViewChannelRef.current = selectedChannel;
                        setSelectedChannel(null); setActivePlayingMovie(null);
                        setIsFullscreen(false); setActiveVodPlayer(null);

                        let nextSlots: MultiViewSlotItem[];
                        if (multiViewActive && multiViewSlots.length > 0) {
                          // Preserve currently playing channels on their permanent slotIds when switching 1/2/3 -> 4 or 4 -> 2
                          const kept = multiViewSlots.filter((s) => s.channel !== null).slice(0, modeNum);
                          const usedIds = new Set(kept.map((s) => s.slotId));
                          const freeIds = [0, 1, 2, 3].filter((id) => !usedIds.has(id));
                          nextSlots = [...kept];
                          while (nextSlots.length < modeNum && freeIds.length > 0) {
                            nextSlots.push({ slotId: freeIds.shift()!, channel: null, aspectRatio: 'fill' });
                          }
                        } else {
                          nextSlots = Array.from({ length: modeNum }, (_, idx) => ({ slotId: idx, channel: null, aspectRatio: 'fill' as const }));
                          setSelectedSlotIndex(0);
                          setAudioSlotIndex(0);
                        }

                        setMultiViewSlots(nextSlots);
                        setMultiViewMode(nextSlots.length as 1 | 2 | 3 | 4);
                        setMultiViewPickingSlot(null);
                        setMultiViewFullscreenSlot(null);
                        setMultiViewActive(true);
                        const focusTargetId = nextSlots[0]?.slotId ?? 0;
                        if (!nextSlots.some((s) => s.slotId === selectedSlotIndex)) {
                          setSelectedSlotIndex(focusTargetId);
                        }
                        if (!nextSlots.some((s) => s.slotId === audioSlotIndex)) {
                          setAudioSlotIndex(focusTargetId);
                        }
                        tvFocusedPane.current = 'multiview';
                        requestAnimationFrame(() => {
                          const el = document.getElementById(`multiview-slot-${focusTargetId}`);
                          if (el) setTVFocus(el, { scroll: false });
                        });
                      }}
                      className={`px-2.5 py-1 rounded-md flex items-center justify-center font-sans tabular-nums font-medium text-sm sm:text-base transition-colors cursor-pointer outline-none ${
                        multiViewActive && multiViewMode === modeNum
                          ? 'achour-glossy-pill font-semibold scale-105 opacity-100'
                          : 'bg-transparent text-zinc-200 hover:text-white opacity-90 hover:opacity-100'
                      }`}
                    >
                      <span className={multiViewActive && multiViewMode === modeNum ? '' : 'achour-glossy-text'}>{modeNum}</span>
                    </button>
                  ))}
                  {multiViewActive && (
                    <button
                      type="button"
                      data-tv-focusable="true"
                      data-tv-pane="header"
                      data-header-index={4}
                      tabIndex={0}
                      onClick={toggleMultiViewFullSplit}
                      title={isRtl ? 'التبديل بين تقسيم ملء شاشة التلفاز والوضع العادي' : 'Toggle Full-TV-Screen Split Mode'}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] sm:text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer outline-none whitespace-nowrap ${
                        multiViewFullSplit
                          ? 'achour-glossy-pill'
                          : 'achour-glossy-surface text-white hover:border-gold'
                      }`}
                    >
                      <Maximize size={13} />
                      <span>{multiViewFullSplit ? (isRtl ? 'الوضع العادي' : 'Classic') : (isRtl ? 'ملء الشاشة' : 'Full Split')}</span>
                    </button>
                  )}
                  {multiViewActive && multiViewMode === 3 && (
                    <button
                      type="button"
                      data-tv-focusable="true"
                      data-tv-pane="header"
                      data-header-index={5}
                      tabIndex={0}
                      onClick={() => setMultiViewThreeReverse((reversed) => !reversed)}
                      title={isRtl ? 'عكس ترتيب الشاشات' : 'Reverse screen order'}
                      aria-pressed={multiViewThreeReverse}
                      className={`px-2 py-1 rounded-lg bg-transparent border-0 text-[11px] sm:text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer outline-none whitespace-nowrap ${
                        multiViewThreeReverse ? 'text-gold' : 'text-white/90 hover:text-gold focus:text-gold'
                      }`}
                    >
                      <ArrowUpDown size={13} />
                      <span className={multiViewThreeReverse ? 'achour-glossy-text' : ''}>{isRtl ? 'عكس' : 'Reverse'}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Clock & Date */}
          <div className="flex items-center justify-end gap-4 min-w-0">
            <LiveHeaderClock language={settings.language} timeFormat={settings.timeFormat} />
          </div>
        </div>
      </header>
      {/* Main Content Area (kept mounted & CSS-hidden during single-channel/VOD fullscreen; sidebars hidden cleanly during MultiView Full Split & MultiView slot fullscreen) */}
      <div className={`${isViewingFullscreen ? 'hidden' : 'flex'} flex-1 min-h-0 overflow-hidden ${isMultiViewSlotFullscreen ? '' : 'relative z-10'}`}>
        
        {/* Column 1: Virtualized Categories Sidebar */}
        <aside className={`${(isMultiViewSlotFullscreen || (multiViewActive && multiViewFullSplit && multiViewPickingSlot === null)) ? 'hidden' : 'flex'} w-44 sm:w-56 md:w-64 lg:w-72 bg-transparent flex-col h-full min-h-0 shrink-0 overflow-hidden pb-0`}>
          <div className="px-3 py-2 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 text-gold text-xs sm:text-sm font-semibold uppercase">
              {mediaType === 'movie' ? <Film size={16} /> : mediaType === 'series' ? <Clapperboard size={16} /> : <Tv size={16} />}
              <span className="achour-glossy-title">{isRtl ? (mediaType === 'movie' ? 'أقسام الأفلام' : mediaType === 'series' ? 'أقسام المسلسلات' : 'المجموعات') : t('categories')}</span>
            </div>
            <span className="text-xs font-sans font-normal tabular-nums achour-glossy-info px-2 py-0.5">{visibleCategories.length}</span>
          </div>

          {loading && visibleCategories.length === 0 ? (
            <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar py-1">
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-2 mb-3 text-gold text-xs font-medium">
                  <div className="w-3.5 h-3.5 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                  <span></span>
                </div>
                {[1, 2, 3, 4, 5, 6, 7].map(n => (
                  <div key={n} className="h-9" />
                ))}
              </div>
            </div>
          ) : (
            <VirtualizedCategoryList
              ref={categoryListRef}
              categories={visibleCategories}
              realLiveCats={realLiveCats}
              selectedCategory={selectedCategory}
              onSelect={setSelectedCategory}
              onFocusIdx={handleFocusCatIdx}
              onReorder={mediaType === 'live' ? handleReorderCategory : undefined}
              showNumber={mediaType === 'live'}
            />
          )}
        </aside>

        {/* Column 2: Channel List / Posters Grid */}
        <section className={`${
          (isMultiViewSlotFullscreen || (multiViewActive && multiViewFullSplit && multiViewPickingSlot === null))
            ? 'hidden'
            : mediaType === 'movie' || mediaType === 'series'
              ? 'flex-1 bg-transparent'
              : 'w-64 sm:w-72 md:w-80 lg:w-96 bg-transparent'
        } flex flex-col h-full min-h-0 shrink-0 pb-0`}>
          
          <div className="px-2.5 py-1.5 flex items-center justify-between shrink-0 bg-transparent">
            <div className="flex items-center gap-1.5 text-gold text-[11px] sm:text-xs font-semibold uppercase">
              {mediaType === 'movie' ? <Film size={14} /> : mediaType === 'series' ? <Clapperboard size={14} /> : <Tv size={14} />}
              <span className="achour-glossy-title">
                {mediaType === 'movie'
                  ? t('movies')
                  : mediaType === 'series'
                  ? t('series')
                  : t('channels')}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {(mediaType === 'movie' || mediaType === 'series') && (
                <div className="relative flex items-center bg-transparent border-0 ring-0 shadow-none">
                  <button
                    type="button"
                    data-tv-focusable="true"
                    data-vod-search-btn="true"
                    tabIndex={0}
                    onClick={() => {
                      const input = document.getElementById('vod-search-input') as HTMLInputElement | null;
                      if (input) {
                        setTVFocus(input, { scroll: false });
                        input.focus();
                      }
                    }}
                    className="p-1 bg-transparent border-0 ring-0 shadow-none outline-none text-gold hover:brightness-125 cursor-pointer"
                    title={t('search')}
                    aria-label={t('search')}
                  >
                    <Search size={14} />
                  </button>
                  <input
                    id="vod-search-input"
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('search')}
                    aria-label={t('search')}
                    className="bg-transparent border-0 ring-0 shadow-none outline-none text-xs font-medium text-gold px-1.5 py-0.5 w-24 sm:w-32"
                  />
                  {search && (
                    <button
                      type="button"
                      data-vod-search-btn="true"
                      onClick={() => setSearch('')}
                      className="p-0.5 bg-transparent border-0 ring-0 shadow-none outline-none text-gold/80 hover:text-gold cursor-pointer ml-1"
                      aria-label={t('close')}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              )}

              <span className="text-[10px] font-sans font-normal tabular-nums achour-glossy-info">
                {loading && filteredChannels.length === 0 ? '...' : (recentChannelItems ? recentChannelItems.length : `${filteredChannels.length}${categoryHasMore ? '+' : ''}`)}
              </span>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden px-1.5 sm:px-2 pt-0 pb-0 outline-none ring-0 border-0">
            {loading && filteredChannels.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-gold p-4 text-center">
                <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin shadow-lg shadow-gold/20" />
                <span className="text-xs font-bold text-zinc-300">
                </span>
              </div>
            ) : (
            <VirtualizedChannelList
              ref={virtualListRef}
              items={recentChannelItems || filteredChannels}
              selectedChannelId={selectedChannel?.stream_id}
              activePlayingMovieId={activePlayingMovie?.stream_id}
              favorites={favorites}
              isRtl={isRtl}
              mediaType={mediaType}
              viewMode={settings.viewMode || 'grid'}
              posterSize={settings.posterSize || 'medium'}
              showPosterTitles={Boolean(settings.showPosterTitles)}
              emptyMessage={
                selectedCategory === WATCH_HISTORY_CAT_ID
                  ? t('watch_history_empty')
                  : selectedCategory === CONTINUE_WATCHING_CAT_ID
                    ? t('continue_watching_empty')
                    : undefined
              }
              hasMore={selectedCategory !== WATCH_HISTORY_CAT_ID && selectedCategory !== CONTINUE_WATCHING_CAT_ID && !recentChannelItems && !search.trim() && categoryHasMore}
              onLoadMore={handleLoadMoreCategoryChannels}
              onColumnCountChange={handleColumnCountChange}
              onFocusChannel={handleFocusChannel}
              onHighlightChannel={handleHighlightChannel}
              onSelectChannel={handleChannelClick}
              onDoubleClickChannel={handleOpenFullscreen}
              onToggleFavorite={toggleFavorite}
              onReorderChannel={mediaType === 'live' && selectedCategory !== WATCH_HISTORY_CAT_ID && selectedCategory !== CONTINUE_WATCHING_CAT_ID ? handleReorderChannel : undefined}
              isFullscreen={isViewingFullscreen}
            />
            )}
          </div>
        </section>

        {/* Column 3: Small Player Area + Program Guide Under Mini Player (Only for Live & Favorites) */}
        {(mediaType === 'live' || mediaType === 'favorites') && (
          <main className={`flex-1 flex flex-col ${multiViewActive ? 'gap-0' : 'gap-2'} bg-transparent ${isMultiViewSlotFullscreen ? '' : 'relative'} min-w-0 h-full overflow-hidden ${isMultiViewSlotFullscreen || multiViewActive ? 'p-0' : 'p-2 sm:p-3'}`}>
            {multiViewActive ? (() => {
              const visibleSlots = multiViewFullscreenSlot !== null
                ? multiViewSlots.filter((s) => s.slotId === multiViewFullscreenSlot)
                : multiViewSlots;
              const activeLayoutCount = visibleSlots.length;
              const gridColsRowsClass =
                multiViewFullscreenSlot !== null || activeLayoutCount <= 1
                  ? 'grid-cols-1 grid-rows-1'
                  : activeLayoutCount === 2
                  ? 'grid-cols-2 grid-rows-1'
                  : 'grid-cols-2 grid-rows-2';

              const outerContainerClass =
                isMultiViewSlotFullscreen
                  ? 'fixed inset-0 z-[120] bg-transparent p-0 flex flex-col'
                  : 'flex-1 min-h-0 flex flex-col bg-transparent';

              return (
                <div data-multiview-container="true" dir="ltr" className={outerContainerClass}>
                  <div
                    dir="ltr"
                    className={`flex-1 min-h-0 grid gap-0 ${gridColsRowsClass} bg-transparent`}
                  >
                    {visibleSlots.map((slotItem, visibleIndex) => {
                      const slotId = slotItem.slotId;
                      const slotChannel = slotItem.channel;
                      let placementClass = '';
                      if (multiViewFullscreenSlot === null && activeLayoutCount === 3) {
                        if (visibleIndex === 0) {
                          placementClass = multiViewThreeReverse
                            ? 'col-start-2 row-start-1 row-span-2'
                            : 'col-start-1 row-start-1 row-span-2';
                        } else if (visibleIndex === 1) {
                          placementClass = multiViewThreeReverse
                            ? 'col-start-1 row-start-1'
                            : 'col-start-2 row-start-1';
                        } else {
                          placementClass = multiViewThreeReverse
                            ? 'col-start-1 row-start-2'
                            : 'col-start-2 row-start-2';
                        }
                      }

                      return slotChannel ? (
                        <MultiViewSlotPlayer
                          key={`multiview-player-${slotId}`}
                          channel={slotChannel}
                          slotIndex={slotId}
                          displayNumber={visibleIndex + 1}
                          slotCount={activeLayoutCount}
                          aspectRatio={slotItem.aspectRatio || 'fill'}
                          isActive={selectedSlotIndex === slotId}
                          isMuted={audioSlotIndex !== slotId}
                          isFullscreenSlot={multiViewFullscreenSlot === slotId}
                          className={placementClass}
                          settings={settings}
                          isRtl={isRtl}
                          onSelectSlot={() => {
                            setSelectedSlotIndex(slotId);
                            setAudioSlotIndex(slotId);
                            tvFocusedPane.current = 'multiview';
                          }}
                          onToggleMute={(e) => {
                            e.stopPropagation();
                            setAudioSlotIndex((current) => current === slotId ? -1 : slotId);
                          }}
                          onAspectRatioChange={handleSlotAspectRatioChange}
                          onChangeChannel={(e) => {
                            e.stopPropagation();
                            setSelectedSlotIndex(slotId);
                            setMultiViewFullscreenSlot(null);
                            setMultiViewPickingSlot(slotId);
                            tvFocusedPane.current = 'channels';
                            focusChannelAtIdx(tvFocusedChannelIndex.current >= 0 ? tvFocusedChannelIndex.current : 0);
                          }}
                          onOpenFullscreen={() => {
                            setSelectedSlotIndex(slotId);
                            setMultiViewFullscreenSlot(slotId);
                          }}
                          onRemove={(e) => {
                            e.stopPropagation();
                            handleRemoveMultiViewSlot(slotId);
                          }}
                        />
                      ) : (
                        <EmptyMultiViewSlotButton
                          key={`multiview-empty-${slotId}`}
                          slotId={slotId}
                          displayNumber={visibleIndex + 1}
                          spanClass={placementClass}
                          isRtl={isRtl}
                          onPickSlot={() => {
                            setSelectedSlotIndex(slotId);
                            setMultiViewPickingSlot(slotId);
                            tvFocusedPane.current = 'channels';
                            focusChannelAtIdx(tvFocusedChannelIndex.current >= 0 ? tvFocusedChannelIndex.current : 0);
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })() : (
              <>
            {/* Top Player Section - Small Video Player (Unfocusable by D-Pad) */}
            <div
              className={`w-full aspect-video shrink-0 ${!selectedChannel ? 'bg-transparent' : isNativeApp() ? 'bg-transparent' : 'bg-black'} rounded-2xl overflow-hidden relative group cursor-pointer`}
              onClick={() => !isFullscreen && selectedChannel && handleOpenFullscreen(selectedChannel)}
              onDoubleClick={() => !isFullscreen && selectedChannel && handleOpenFullscreen(selectedChannel)}
            >
              <div id="live-preview-container" className="w-full h-full"></div>

              {!selectedChannel && (
                <div className="absolute inset-0 flex items-center justify-center text-zinc-600 flex-col gap-2">
                  <Play size={48} className="opacity-20" />
                  <span className="text-xs font-medium uppercase tracking-widest opacity-40">
                    {isRtl ? 'اختر قناة للمعاينة' : 'Select a channel to preview'}
                  </span>
                </div>
              )}
            </div>

            {/* Program Guide Directly Under Mini Player */}
<div className="flex-1 min-h-0 p-3 sm:p-4 flex flex-col justify-between overflow-y-auto no-scrollbar">
  <LiveMiniEpgCard
    selectedChannel={selectedChannel}
    findProgramsForChannel={findProgramsForChannel}
    language={settings.language}
    timeFormat={settings.timeFormat}
    isRtl={isRtl}
  />
</div>
              </>
            )}
</main>
)}
</div>

      {/* Unified Live Player (Preview & Fullscreen) - Strictly unmounted in Multi-Screen and External Player mode for complete audio/video isolation */}
      {!multiViewActive && (!settings.useExternalPlayer || forceInternalPlaybackOnce) && (mediaType === 'live' || mediaType === 'favorites') && selectedChannel && (
        <VodPlayerModal
          key="live-player"
          media={selectedChannel}
          mediaType="live"
          isPreview={!isFullscreen}
          containerId={isFullscreen ? undefined : "live-preview-container"}
          settings={settings}
          isRtl={isRtl}
          onClose={handleLiveModalClose}
          itemsList={filteredChannels}
          epgData={mergedEpgForModal}
          onSelectMedia={handleLiveSelectMedia}
          onToggleFavorite={handleModalToggleFavorite}
          onPlaybackStarted={handleLivePlaybackStarted}
          onPlaybackFailed={handleLivePlaybackFailed}
          isFavorite={selectedChannel?.stream_id ? favorites.includes(selectedChannel.stream_id) : false}
        />
      )}

      {/* Rich Movie / Series Details Modal (Portaled to body so viewport centering & height ignore parent scale/scroll) */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {movieDetailsModal && (() => {
            const infoObj = mediaDetailInfo?.info || {};
            const resolvedPlot =
              infoObj.plot ||
              infoObj.description ||
              infoObj.overview ||
              infoObj.storyline ||
              infoObj.notes ||
              infoObj.plot_ar ||
              mediaDetailInfo?.movie_data?.plot ||
              (movieDetailsModal as any)?.plot ||
              '';
            const resolvedCast = infoObj.cast || infoObj.actors || (movieDetailsModal as any)?.cast || '';
            const resolvedDirector = infoObj.director || (movieDetailsModal as any)?.director || '';
            const resolvedGenre = infoObj.genre || (movieDetailsModal as any)?.genre || '';
            const resolvedRating = infoObj.rating || infoObj.rating_5based || (movieDetailsModal as any)?.rating || '';
            const resolvedRelease = infoObj.releaseDate || infoObj.releasedate || infoObj.year || (movieDetailsModal as any)?.releaseDate || '';
            const resolvedDuration = infoObj.duration || infoObj.episode_run_time || (movieDetailsModal as any)?.duration || '';
            const hasSeasonsSection = mediaType === 'series' || seriesSeasonsData.length > 0;
            const activeEpisodes =
              seriesSeasonsData.find(s => s.seasonNumber === selectedSeasonNum)?.episodes ||
              seriesSeasonsData[0]?.episodes ||
              [];

            const movieCleanId = cleanVodEntityId(movieDetailsModal.stream_id, effectivePlaylistId);
            const movieProgress = (mediaType === 'movie' && progressRevision >= 0)
              ? getVodProgress({
                  mediaType: 'movie',
                  playlistId: effectivePlaylistId,
                  streamId: movieCleanId
                })
              : null;
            const hasMovieResume = Boolean(
              movieProgress &&
              !movieProgress.completed &&
              movieProgress.positionSec >= MIN_RESUME_POSITION_SEC
            );

            const seriesKeyId = cleanVodEntityId(
              (movieDetailsModal as any)?.series_id || movieDetailsModal.stream_id,
              effectivePlaylistId
            );
            const epProgressMap = (hasSeasonsSection && progressRevision >= 0)
              ? getSeriesEpisodesProgressMap(effectivePlaylistId, seriesKeyId)
              : {};
            const lastUnfinishedEp = (hasSeasonsSection && progressRevision >= 0)
              ? getSeriesLastUnfinishedEpisode(effectivePlaylistId, seriesKeyId)
              : null;
            const unfinishedEpisodeObj = lastUnfinishedEp
              ? seriesSeasonsData
                  .flatMap(s => s.episodes)
                  .find((ep: any) =>
                    cleanVodEntityId(ep.xtream_id || ep.stream_id, effectivePlaylistId, seriesKeyId) === lastUnfinishedEp.episodeId
                  ) || null
              : null;

            return (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.04 }}
                dir={isRtl ? 'rtl' : 'ltr'}
                onPointerDown={(e) => {
                  detailsModalBackdropDownRef.current = e.target === e.currentTarget;
                }}
                onClick={(e) => {
                  if (isSafeBackdropClick(e, detailsModalOpenedAtRef.current || Date.now() - 400, detailsModalBackdropDownRef.current, 250)) {
                    setMovieDetailsModal(null);
                  }
                  detailsModalBackdropDownRef.current = false;
                }}
                className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 achour-modal-backdrop select-none overflow-hidden"
              >
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  data-tv-modal="true"
                  data-tv-details-dialog="true"
                  data-has-seasons={hasSeasonsSection ? 'true' : 'false'}
                  initial={{ scale: 0.98, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.98, opacity: 0 }}
                  transition={{ duration: 0.04 }}
                  onClick={(e) => e.stopPropagation()}
                  className={`achour-tv-details-popup w-[min(92vw,720px)] ${hasSeasonsSection ? 'h-[min(82vh,560px)]' : 'max-h-[82vh]'} achour-glass-modal border-gold/40 rounded-2xl p-3.5 sm:p-5 flex flex-col overflow-hidden ${isRtl ? 'font-cairo text-right' : 'text-left'}`}
                >
                  {/* 1. Sticky Modal Title Bar */}
                  <div className={`flex items-center justify-between pb-2 border-b border-white/10 shrink-0 ${isRtl ? 'flex-row-reverse' : ''}`}>
                    <div className={`flex items-center gap-2 min-w-0 ${isRtl ? 'flex-row-reverse' : ''}`}>
                      <div className="p-1.5 rounded-xl bg-gold/20 text-gold shrink-0">
                        {mediaType === 'movie' ? <Film size={15} /> : <Clapperboard size={15} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-xs sm:text-sm font-semibold uppercase tracking-wider truncate achour-glossy-title">
                          {movieDetailsModal.name}
                        </h2>
                        <p className="text-[10px] font-normal achour-glossy-info uppercase truncate">
                          {(movieDetailsModal?.category_name && movieDetailsModal.category_name.toLowerCase() !== 'general' ? movieDetailsModal.category_name : '') || (mediaType === 'movie' ? (isRtl ? 'فيلم سينمائي' : 'Movie') : (isRtl ? 'مسلسل تلفزيوني' : 'TV Series'))}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      data-tv-focusable="true"
                      data-tv-modal="details"
                      data-modal-role="close"
                      tabIndex={0}
                      onClick={() => setMovieDetailsModal(null)}
                      className="p-1.5 text-zinc-400 hover:text-white focus:text-gold rounded-full transition-colors outline-none shrink-0"
                      title={isRtl ? 'إغلاق (Esc)' : 'Close (Esc)'}
                    >
                      <X size={17} />
                    </button>
                  </div>

                  {/* 2. Fixed Sticky Poster + Info (Compact single strip on Series so Seasons & Episodes move up cleanly) */}
                  <div className={`${hasSeasonsSection ? 'py-1.5 gap-2.5' : 'py-2 gap-3 sm:gap-4'} flex flex-row items-start shrink-0 ${isRtl ? 'flex-row-reverse' : ''}`}>
                    {/* Fixed Poster */}
                    <div className={`${hasSeasonsSection ? 'w-11 sm:w-14' : 'w-16 sm:w-22 md:w-24'} aspect-[2/3] rounded-xl overflow-hidden border border-gold/30 shrink-0 bg-white/[0.04]`}>
                      <img 
                        src={mediaDetailInfo?.info?.cover_big || mediaDetailInfo?.info?.movie_image || movieDetailsModal.stream_icon || movieDetailsModal.cover || movieDetailsModal.logo} 
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover" 
                        onError={e => { e.currentTarget.style.display = 'none'; }} 
                        alt="" 
                      />
                    </div>

                    {/* Fixed Details & Story Column */}
                    <div className="flex-1 flex flex-col gap-1 min-w-0">
                      {(resolvedRating || resolvedRelease || resolvedGenre || resolvedDuration) && (
                        <div className="flex items-center flex-wrap gap-1 text-[10px] sm:text-[11px] font-normal font-sans tabular-nums">
                          {resolvedRating && (
                            <span className="px-1.5 py-0.5 rounded-md achour-glossy-surface border border-gold/30 font-medium">
                              <span className="achour-glossy-text">★ {resolvedRating}</span>
                            </span>
                          )}
                          {resolvedRelease && (
                            <span className="px-1.5 py-0.5 rounded-md bg-white/10 border border-white/10">
                              <span className="achour-glossy-info">{resolvedRelease}</span>
                            </span>
                          )}
                          {!hasSeasonsSection && resolvedDuration && (
                            <span className="px-1.5 py-0.5 rounded-md bg-white/10 border border-white/10">
                              <span className="achour-glossy-info">{resolvedDuration}</span>
                            </span>
                          )}
                          {resolvedGenre && (
                            <span className="px-1.5 py-0.5 rounded-md bg-white/10 text-zinc-200 border border-white/10 truncate max-w-[200px]">
                              {resolvedGenre}
                            </span>
                          )}
                        </div>
                      )}

                      <div>
                        {!hasSeasonsSection && (
                          <h3 className="text-[11px] sm:text-xs font-semibold uppercase tracking-widest mb-0.5 achour-glossy-text">
                            {isRtl ? 'قصة العمل' : 'Synopsis & Plot'}
                          </h3>
                        )}
                        {detailLoading && !resolvedPlot ? (
                          <div className="flex items-center gap-2 py-1 text-gold text-xs font-medium">
                            <div className="w-3.5 h-3.5 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                            <span>{isRtl ? 'جاري تحميل التفاصيل...' : 'Loading details...'}</span>
                          </div>
                        ) : (
                          <p className={`text-[11px] sm:text-xs text-zinc-200 leading-snug font-normal ${hasSeasonsSection ? 'line-clamp-1 sm:line-clamp-2' : 'max-h-32 overflow-y-auto no-scrollbar'}`}>
                            {resolvedPlot || (isRtl ? 'لا تتوفر قصة لهذا العمل في بيانات الاشتراك.' : 'No synopsis provided by the playlist.')}
                          </p>
                        )}
                      </div>

                      {!hasSeasonsSection && (resolvedCast || resolvedDirector) && (
                        <div className="space-y-0.5 text-xs">
                          {resolvedCast && (
                            <p className="line-clamp-2 text-zinc-300 font-normal">
                              <span className="font-semibold uppercase tracking-wider achour-glossy-text">
                                {isRtl ? 'طاقم التمثيل: ' : 'Cast: '}
                              </span>
                              {resolvedCast}
                            </p>
                          )}
                          {resolvedDirector && (
                            <p className="truncate text-zinc-300 font-normal">
                              <span className="font-semibold uppercase tracking-wider achour-glossy-text">
                                {isRtl ? 'الإخراج: ' : 'Director: '}
                              </span>
                              {resolvedDirector}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Subtitles & Audio Languages Badges extracted from subscription (Movies only to preserve Series episode room) */}
                      {!hasSeasonsSection && Boolean(
                        (mediaDetailInfo?.info?.subtitles && (mediaDetailInfo.info.subtitles.length > 0 || Object.keys(mediaDetailInfo.info.subtitles).length > 0)) ||
                        (mediaDetailInfo?.movie_data?.subtitles && mediaDetailInfo.movie_data.subtitles.length > 0) ||
                        mediaDetailInfo?.info?.audio ||
                        mediaDetailInfo?.info?.audio_streams
                      ) && (
                        <div className="p-2 rounded-xl bg-white/[0.05] border border-white/10 flex flex-col gap-1.5">
                          {Boolean((mediaDetailInfo?.info?.subtitles && (Array.isArray(mediaDetailInfo.info.subtitles) ? mediaDetailInfo.info.subtitles.length > 0 : Object.keys(mediaDetailInfo.info.subtitles).length > 0)) || (mediaDetailInfo?.movie_data?.subtitles && mediaDetailInfo.movie_data.subtitles.length > 0)) && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] sm:text-xs text-emerald-400 font-bold flex items-center gap-1 shrink-0">
                                <Layers size={13} />
                                {isRtl ? 'الترجمة المتوفرة:' : 'Subtitles:'}
                              </span>
                              {(Array.isArray(mediaDetailInfo?.info?.subtitles)
                                ? mediaDetailInfo.info.subtitles
                                : Object.values(mediaDetailInfo?.info?.subtitles || mediaDetailInfo?.movie_data?.subtitles || {})
                              ).slice(0, 6).map((sub: any, sIdx: number) => {
                                const code = typeof sub === 'string' ? sub : (sub.language || sub.lang || sub.container || 'ar');
                                return (
                                  <span key={sIdx} className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                                    {formatLanguageLabel(code, sIdx, 'subtitle')}
                                  </span>
                                );
                              })}
                            </div>
                          )}

                          {Boolean(mediaDetailInfo?.info?.audio || mediaDetailInfo?.info?.audio_streams) && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] sm:text-xs text-red-400 font-bold flex items-center gap-1 shrink-0">
                                <Volume2 size={13} />
                                {isRtl ? 'لغات الصوت:' : 'Audio:'}
                              </span>
                              {(Array.isArray(mediaDetailInfo?.info?.audio || mediaDetailInfo?.info?.audio_streams)
                                ? (mediaDetailInfo?.info?.audio || mediaDetailInfo?.info?.audio_streams)
                                : [mediaDetailInfo?.info?.audio || mediaDetailInfo?.info?.audio_streams]
                              ).slice(0, 6).map((aud: any, aIdx: number) => {
                                const code = typeof aud === 'string' ? aud : (aud.language || aud.lang || 'Stereo');
                                return (
                                  <span key={aIdx} className="px-2 py-0.5 rounded-md bg-red-500/20 text-red-300 border border-red-500/30 text-[10px] font-bold">
                                    {formatLanguageLabel(code, aIdx, 'audio')}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                {/* 3. Independently Scrollable Seasons & Episodes Area (Series Only) */}
                {hasSeasonsSection && (
                  <div className="flex-1 min-h-0 flex flex-col border-t border-white/10 pt-1.5 overflow-hidden">
                    {/* Fixed Seasons Header & Tabs (Compact & elevated) */}
                    <div className="shrink-0 flex items-center gap-2.5 pb-1.5">
                      <h3 className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider shrink-0 achour-glossy-title">
                        {isRtl ? 'المواسم' : 'Seasons'} ({seriesSeasonsData.length})
                      </h3>
                      <div
                        ref={detailsSeasonsScrollRef}
                        className="relative flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar px-1 py-0.5"
                      >
                        {seriesSeasonsData.map((s, sIdx) => {
                          const isSelected = selectedSeasonNum === s.seasonNumber;
                          return (
                            <button
                              key={`${s.seasonNumber}-${sIdx}`}
                              data-tv-focusable="true"
                              data-tv-modal="details"
                              data-season-tab="true"
                              data-season-active={isSelected ? 'true' : 'false'}
                              tabIndex={0}
                              onClick={() => setSelectedSeasonNum(s.seasonNumber)}
                              className={`px-3 py-1 rounded-lg text-[11px] sm:text-xs font-medium whitespace-nowrap transition-colors border outline-none shrink-0 ${
                                isSelected
                                  ? 'achour-glossy-pill font-semibold border-gold'
                                  : 'bg-white/[0.06] border-white/15 text-zinc-200 hover:text-white hover:border-gold/50'
                              }`}
                            >
                              {s.title}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* ONLY Scrollable Episodes List (flex-1 min-h-0 guarantees zero bottom overflow on phones & crisp non-overlapping rows) */}
                    <div
                      ref={detailsEpisodesScrollRef}
                      style={{ scrollPaddingTop: 8, scrollPaddingBottom: 8 }}
                      className="relative flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-2 py-2 px-1"
                    >
                      {activeEpisodes.length === 0 ? (
                        <div className="py-6 text-center text-xs sm:text-sm text-zinc-400 font-medium">
                          {detailLoading
                            ? (isRtl ? 'جاري تحميل الحلقات...' : 'Loading episodes...')
                            : (isRtl ? 'لا توجد حلقات متاحة لهذا الموسم.' : 'No episodes available for this season.')}
                        </div>
                      ) : (
                        activeEpisodes.map((ep: ParsedChannel, epIdx: number) => {
                          const epCleanId = cleanVodEntityId(
                            (ep as any).xtream_id || ep.stream_id,
                            effectivePlaylistId,
                            seriesKeyId
                          );
                          const epProg =
                            epProgressMap[epCleanId] ||
                            getVodProgress({
                              mediaType: 'series',
                              playlistId: effectivePlaylistId,
                              seriesId: seriesKeyId,
                              streamId: epCleanId,
                              episodeId: epCleanId,
                              legacyEpisodeIndex: epIdx
                            });
                          const isEpCompleted = Boolean(epProg?.completed);
                          const hasEpResume = Boolean(
                            epProg &&
                            !epProg.completed &&
                            epProg.positionSec >= MIN_RESUME_POSITION_SEC
                          );
                          const epPct =
                            hasEpResume && epProg && epProg.durationSec > 0
                              ? Math.min(100, Math.max(3, Math.round((epProg.positionSec / epProg.durationSec) * 100)))
                              : 0;

                          return (
                            <div
                              key={`${ep.stream_id}-${epIdx}`}
                              data-tv-focusable="true"
                              data-tv-modal="details"
                              data-tv-focus-inset="true"
                              data-episode-item="true"
                              data-episode-id={epCleanId}
                              data-episode-resume={hasEpResume ? 'true' : 'false'}
                              tabIndex={0}
                              onClick={() => {
                                if (!activeSeriesParentRef.current && movieDetailsModal) {
                                  activeSeriesParentRef.current = movieDetailsModal;
                                }
                                setSelectedChannel(ep);
                                setActivePlayingMovie(ep);
                                if (settings.useExternalPlayer) {
                                  void launchExternalPlayer(ep.url, ep, 'series').then((opened) => {
                                    if (opened) setMovieDetailsModal(null);
                                  });
                                } else {
                                  setVodResumeOverride({ mode: 'prompt' });
                                  setActiveVodPlayer(ep);
                                  setMovieDetailsModal(null);
                                }
                              }}
                              className={`shrink-0 min-h-[42px] flex items-center justify-between px-3 py-2 rounded-xl border transition-colors group cursor-pointer outline-none ${
                                hasEpResume
                                  ? 'bg-gold/[0.08] border-gold/45 hover:border-gold hover:bg-gold/15'
                                  : 'bg-white/[0.05] border-white/15 hover:border-gold/60 hover:bg-gold/15'
                              }`}
                            >
                              <div className="w-7 h-7 rounded-lg achour-glossy-surface border border-gold/35 flex items-center justify-center font-sans font-semibold tabular-nums text-xs shrink-0">
                                <span className="achour-glossy-text">{ep.episode || epIdx + 1}</span>
                              </div>
                              <div className={`min-w-0 flex-1 ${isRtl ? 'mr-2.5' : 'ml-2.5'}`}>
                                <div className="flex items-center gap-2 min-w-0">
                                  <p className="text-xs sm:text-sm font-medium text-white group-hover:text-gold transition-colors truncate flex-1 leading-tight">
                                    {ep.name}
                                  </p>
                                  {isEpCompleted && (
                                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-medium shrink-0 flex items-center gap-1">
                                      <Check size={10} />
                                      {isRtl ? 'تمت المشاهدة' : 'Watched'}
                                    </span>
                                  )}
                                  {hasEpResume && epProg && (
                                    <span className="px-1.5 py-0.5 rounded-md achour-glossy-surface border border-gold/40 text-[10px] font-sans font-normal tabular-nums shrink-0">
                                      <span className="achour-glossy-info">
                                        {isRtl
                                          ? `توقفت عند ${formatPlaybackClock(epProg.positionSec)}`
                                          : `Paused ${formatPlaybackClock(epProg.positionSec)}`}
                                      </span>
                                    </span>
                                  )}
                                </div>
                                {epPct > 0 && (
                                  <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden mt-1">
                                    <div className="h-full bg-gold rounded-full" style={{ width: `${epPct}%` }} />
                                  </div>
                                )}
                              </div>
                              <Play size={13} className="text-gold/80 shrink-0 opacity-75 group-hover:opacity-100 ml-2" />
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* 4. Sticky Action Buttons Footer (Movies only — omitted on Series to maximize Seasons & Episodes area) */}
                {mediaType !== 'series' && (
                <div className="pt-2.5 mt-1 border-t border-white/10 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
                  {mediaType === 'movie' && hasMovieResume && movieProgress ? (
                    <button
                      data-tv-focusable="true"
                      data-tv-modal="details"
                      data-tv-play-now="true"
                      data-modal-role="play"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedChannel(movieDetailsModal);
                        setActivePlayingMovie(movieDetailsModal);
                        if (settings.useExternalPlayer) {
                          void launchExternalPlayer(movieDetailsModal.url, movieDetailsModal, 'movie').then((opened) => {
                            if (opened) setMovieDetailsModal(null);
                          });
                        } else {
                          setVodResumeOverride({ mode: 'prompt' });
                          setActiveVodPlayer(movieDetailsModal);
                          setMovieDetailsModal(null);
                        }
                      }}
                      className="px-4 py-1.5 achour-glossy-pill hover:brightness-110 rounded-lg text-xs sm:text-sm font-medium flex items-center justify-center gap-1.5 focus:outline-none transition-all cursor-pointer"
                    >
                      <Play size={14} className="fill-current" />
                      <span>{isRtl ? 'تشغيل' : 'Play'}</span>
                    </button>
                  ) : mediaType === 'movie' ? (
                    <button
                      data-tv-focusable="true"
                      data-tv-modal="details"
                      data-tv-play-now="true"
                      data-modal-role="play"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedChannel(movieDetailsModal);
                        setActivePlayingMovie(movieDetailsModal);
                        if (settings.useExternalPlayer) {
                          void launchExternalPlayer(movieDetailsModal.url, movieDetailsModal, 'movie').then((opened) => {
                            if (opened) setMovieDetailsModal(null);
                          });
                        } else {
                          setVodResumeOverride({ mode: 'prompt' });
                          setActiveVodPlayer(movieDetailsModal);
                          setMovieDetailsModal(null);
                        }
                      }}
                      className="px-4 py-1.5 achour-glossy-pill hover:brightness-110 rounded-lg text-xs sm:text-sm font-medium uppercase tracking-wider flex items-center justify-center gap-1.5 focus:outline-none transition-all cursor-pointer"
                    >
                      <Play size={14} className="fill-current" />
                      <span>{isRtl ? 'تشغيل' : 'Play'}</span>
                    </button>
                  ) : (
                    <div />
                  )}
                  <button
                    data-tv-focusable="true"
                    data-tv-modal="details"
                    data-modal-role="favorite"
                    tabIndex={0}
                    onClick={() => toggleFavorite(movieDetailsModal.stream_id)}
                    className={`px-3 py-1.5 rounded-lg border transition-all outline-none focus:outline-none flex items-center justify-center gap-1.5 text-xs sm:text-sm font-medium cursor-pointer ${
                      vodFavorites.includes(movieDetailsModal.stream_id) ? 'achour-glossy-pill border-gold' : 'bg-white/[0.06] border-white/15 text-zinc-200 hover:border-gold'
                    }`}
                    title={t('favorites')}
                  >
                    <Star size={14} className={vodFavorites.includes(movieDetailsModal.stream_id) ? 'fill-current' : ''} />
                    {hasSeasonsSection && (
                      <span>{vodFavorites.includes(movieDetailsModal.stream_id) ? (isRtl ? 'في المفضلة' : 'Favorited') : (isRtl ? 'المفضلة' : 'Favorite')}</span>
                    )}
                  </button>
                </div>
                )}
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>,
      document.body
      )}

      {/* Position Reorder & Channel Actions Strip Modal */}
      <AnimatePresence>
        {reorderTarget && (
          <PositionEditModal
            type={reorderTarget.type}
            id={reorderTarget.id}
            name={reorderTarget.name}
            currentIndex={reorderTarget.index}
            maxPosition={
              reorderTarget.type === 'category'
                ? visibleCategories.filter(c => c.category_id !== 'favorites' && c.category_id !== WATCH_HISTORY_CAT_ID && c.category_id !== CONTINUE_WATCHING_CAT_ID).length
                : (filteredChannelsRef.current?.length || filteredChannels.length)
            }
            language={settings.language}
            onClose={() => setReorderTarget(null)}
            onSave={(newPos) => moveItemToPosition(reorderTarget.type, reorderTarget.id, newPos, true)}
            onToggleFavorite={reorderTarget.type === 'channel' ? () => toggleFavorite(reorderTarget.id) : undefined}
            isFavorite={favorites.includes(reorderTarget.id)}
          />
        )}
      </AnimatePresence>

      {/* Dedicated Player Modal for Movies & Series (Only non-live) */}
      {activeVodPlayer && (mediaType === 'movie' || mediaType === 'series') && (() => {
        const seriesEpisodes = mediaType === 'series'
          ? (seriesSeasonsData.find(s => s.seasonNumber === selectedSeasonNum)?.episodes || seriesSeasonsData.flatMap(s => s.episodes))
          : undefined;
        const seriesIdClean = mediaType === 'series'
          ? cleanVodEntityId(
              (activeSeriesParentRef.current as any)?.series_id || activeSeriesParentRef.current?.stream_id || (activeVodPlayer as any)?.series_id,
              effectivePlaylistId
            )
          : undefined;
        const matchedEpIdx = seriesEpisodes
          ? Math.max(0, seriesEpisodes.findIndex(e => String(e.stream_id) === String(activeVodPlayer.stream_id)))
          : 0;
        let fallbackMovieUrl = activeVodPlayer.url || '';
        if (mediaType === 'movie' && !fallbackMovieUrl && activePlaylist?.type === 'xtream' && activePlaylist.username && activePlaylist.password) {
          let baseHost = streamingHost || (activePlaylist.url || '').trim().replace(/\/+$/, '').replace(/\/(player_api|get|index)\.php.*$/i, '').replace(/\/c\/?$/i, '').replace(/\?.*$/, '');
          if (baseHost && !baseHost.startsWith('http://') && !baseHost.startsWith('https://')) {
            baseHost = `http://${baseHost}`;
          }
          const cleanMovieId = cleanVodEntityId(activeVodPlayer.stream_id, effectivePlaylistId) || String(activeVodPlayer.stream_id || '').trim();
          const ext = activeVodPlayer.container_extension || mediaDetailInfo?.movie_data?.container_extension || 'mp4';
          if (baseHost && cleanMovieId) {
            fallbackMovieUrl = `${baseHost}/movie/${encodeURIComponent(activePlaylist.username)}/${encodeURIComponent(activePlaylist.password)}/${cleanMovieId}.${ext}`;
          }
        }
        const enrichedMedia = {
          ...activeVodPlayer,
          url: fallbackMovieUrl,
          series_id: seriesIdClean || (activeVodPlayer as any).series_id,
          series_name: (activeVodPlayer as any).series_name || activeSeriesParentRef.current?.name || activeVodPlayer.name,
          series_poster:
            activeSeriesParentRef.current?.stream_icon ||
            activeSeriesParentRef.current?.cover ||
            activeSeriesParentRef.current?.logo ||
            mediaDetailInfo?.info?.cover_big ||
            mediaDetailInfo?.info?.movie_image ||
            activeVodPlayer.stream_icon,
          subtitles: (activeVodPlayer as any).subtitles || mediaDetailInfo?.info?.subtitles || mediaDetailInfo?.movie_data?.subtitles
        };
        return (
          <VodPlayerModal
            media={enrichedMedia}
            mediaType={activeVodPlayer.type || (mediaType === 'series' ? 'series' : 'movie')}
            seriesId={seriesIdClean}
            playlistId={effectivePlaylistId}
            initialResumeMode={vodResumeOverride.mode}
            initialResumePositionSec={vodResumeOverride.positionSec}
            activePlaylist={activePlaylist}
            settings={settings}
            isRtl={isRtl}
            onClose={handleVodModalClose}
            episodesList={seriesEpisodes}
            currentEpisodeIndex={matchedEpIdx}
            itemsList={filteredChannels}
            epgData={mergedEpgForModal}
            onSelectEpisode={(idx) => {
              const ep = seriesEpisodes?.[idx];
              if (ep) {
                setVodResumeOverride({ mode: 'prompt' });
                handleVodSelectMedia(ep);
              }
            }}
            onSelectMedia={(next) => {
              setVodResumeOverride({ mode: 'prompt' });
              handleVodSelectMedia(next);
            }}
            onToggleFavorite={handleModalToggleFavorite}
            onPlaybackStarted={handleVodPlaybackStarted}
            isFavorite={activeVodPlayer?.stream_id ? vodFavorites.includes(activeVodPlayer.stream_id) : false}
          />
        );
      })()}


      {/* Parental PIN Modal */}
      {showPinModal && activePlaylist?.pin && (
        <PinUnlockModal
          isOpen={showPinModal}
          onClose={onBack}
          onSuccess={() => {
            setIsUnlocked(true);
            setShowPinModal(false);
          }}
          correctPin={activePlaylist.pin}
          playlistName={activePlaylist.name}
          language={settings.language}
        />
      )}
      {showEpgGrid && (
        <EPGGrid
          isOpen={showEpgGrid}
          onClose={() => setShowEpgGrid(false)}
          channels={channels.filter(c => !isMovieItem(c.name) && !isSeriesItem(c.name)).map((c: any) => ({
            id: c.stream_id || c.id || String(Math.random()),
            name: c.name,
            logo: c.logo || c.stream_icon,
            url: c.url || '',
            category: c.category_name || c.category || '',
            category_id: c.category_id || c.category || 'uncategorized',
            type: 'live' as const,
            stream_id: c.stream_id
          }))}
          epgData={xmltvData}
          onSelectChannel={(ch) => {
            const found = channels.find((c: any) => (c.stream_id === ch.stream_id) || (c.id === ch.id) || (c.name === ch.name));
            if (found) {
              if (multiViewActive) {
                handleChannelClick(found);
              } else {
                setSelectedChannel(found);
              }
            }
            setShowEpgGrid(false);
          }}
          settings={settings}
        />
      )}
      {showOcr && (
        <AIOcrModal 
          onClose={() => setShowOcr(false)} 
          onSelectChannel={(name) => {
            setSearch(name);
            setShowOcr(false);
          }} 
          language={settings.language}
        />
      )}

      {/* External Player Installation / Launch Fallback Modal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {externalLaunchModal && (() => {
            const { result, streamUrl, channel, playbackType, copied } = externalLaunchModal;
            const fireTv = isFireTVDevice();
            const safeProfile = result?.profile || {
              id: settings.selectedPlayer || 'External Player',
              name: settings.selectedPlayer || 'External Player',
              packageName: '',
              fireTvCompatible: true,
              aliases: []
            };
            const playerLabel = safeProfile.name;
            const pkgLabel = result?.resolvedPackage || safeProfile.packageName;

            let titleText = isRtl ? 'تعذر فتح المشغّل الخارجي' : 'Could not open External Player';
            let descText = '';
            if (result?.reason === 'firetv_incompatible' || (fireTv && safeProfile.fireTvCompatible === false)) {
              titleText = isRtl ? `${playerLabel} غير متوافق مع Fire TV Stick` : `${playerLabel} is not compatible with Fire TV Stick`;
              descText = isRtl
                ? `تطبيق ${playerLabel} (${pkgLabel}) مُصمم للهواتف اللمسية ولا يعمل بشكل موثوق على Amazon Fire TV Stick أو لم يتم تثبيته. ننصح باستخدام Just Player أو المشغّل الداخلي (ExoPlayer).`
                : `${playerLabel} (${pkgLabel}) is built for touch devices and is not compatible with Amazon Fire TV Stick, or is not installed. Try Just Player or the internal player (ExoPlayer).`;
            } else if (result?.reason === 'not_installed') {
              titleText = isRtl ? `المشغّل ${playerLabel} غير مثبّت على الجهاز` : `${playerLabel} is not installed on this device`;
              descText = isRtl
                ? `لم يتم العثور على الحزمة (${pkgLabel}) على جهاز Android أو Fire TV الخاص بك. ثبّت التطبيق أولاً أو شغّل المحتوى الآن بالمشغّل الداخلي.`
                : `Package (${pkgLabel}) was not found on your Android or Fire TV device. Install the app first or play now using the internal player.`;
            } else if (result?.reason === 'unsupported_platform') {
              titleText = isRtl ? 'المشغّلات الخارجية متاحة على أجهزة Android فقط' : 'External players require Android / Fire TV';
              descText = isRtl
                ? `أنت تستخدم متصفح الويب حالياً، ولا يمكنه استدعاء تطبيق (${pkgLabel}) عبر نظام Android Intent. يمكنك تشغيل البث بالمشغّل الداخلي أو نسخ الرابط.`
                : `You are currently in a web browser, which cannot invoke Android Intent packages (${pkgLabel}). You can play with the internal player or copy the stream URL.`;
            } else if (result?.reason === 'missing_url') {
              titleText = isRtl ? 'رابط البث غير متوفر' : 'Stream URL unavailable';
              descText = isRtl
                ? 'تعذر استخراج رابط بث مباشر لهذا المحتوى حالياً.'
                : 'Could not resolve a direct playback URL for this item.';
            } else {
              descText = isRtl
                ? `تعذر تشغيل البث عبر ${playerLabel}${pkgLabel ? ` (${pkgLabel})` : ''}. يمكنك إعادة المحاولة أو التشغيل بالمشغّل الداخلي فوراً.`
                : `Failed to start playback in ${playerLabel}${pkgLabel ? ` (${pkgLabel})` : ''}. You can retry or switch to the internal player right away.`;
            }

            const startInternalFallback = (persistInternal: boolean) => {
              if (persistInternal) {
                onUpdateSettings((prev) => ({ ...prev, useExternalPlayer: false }));
              }
              setExternalLaunchModal(null);
              if (playbackType === 'live') {
                if (!persistInternal) {
                  setForceInternalPlaybackOnce(true);
                }
                setSelectedChannel(channel);
                setActivePlayingMovie(channel);
                setIsFullscreen(true);
                setActiveVodPlayer(channel);
              } else {
                setMovieDetailsModal(null);
                setSelectedChannel(channel);
                setActivePlayingMovie(channel);
                setVodResumeOverride({ mode: 'prompt' });
                setActiveVodPlayer(channel);
              }
            };

            return (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.08 }}
                dir={isRtl ? 'rtl' : 'ltr'}
                onPointerDown={(e) => {
                  externalLaunchBackdropDownRef.current = e.target === e.currentTarget;
                }}
                onClick={(e) => {
                  if (isSafeBackdropClick(e, externalLaunchOpenedAtRef.current, externalLaunchBackdropDownRef.current)) {
                    setExternalLaunchModal(null);
                  }
                  externalLaunchBackdropDownRef.current = false;
                }}
                className="fixed inset-0 z-[260] flex items-center justify-center p-4 bg-black/75 achour-modal-backdrop select-none"
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
                  className={`w-[min(92vw,640px)] max-h-[82vh] achour-glass-modal rounded-2xl border-amber-400/35 p-4 sm:p-5 flex flex-col gap-3.5 overflow-y-auto no-scrollbar ${isRtl ? 'font-cairo text-right' : 'text-left'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-400/35 text-amber-400 flex items-center justify-center shrink-0">
                        <AlertTriangle size={22} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base sm:text-lg font-semibold leading-snug achour-glossy-title">
                          {titleText}
                        </h3>
                        <p className="text-xs font-sans font-normal achour-glossy-info mt-0.5 truncate">
                          {playerLabel}{pkgLabel ? ` • ${pkgLabel}` : ''}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      data-tv-focusable="true"
                      data-tv-modal="external-launch"
                      tabIndex={0}
                      onClick={() => setExternalLaunchModal(null)}
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-zinc-300 hover:text-white transition-colors shrink-0"
                      aria-label={isRtl ? 'إغلاق' : 'Close'}
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <p className="text-xs sm:text-sm font-normal text-zinc-200 leading-relaxed bg-white/[0.04] border border-white/10 rounded-2xl p-3.5">
                    {descText}
                  </p>

                  <div className="flex flex-col gap-2.5">
                    {streamUrl && (
                      <>
                        <button
                          type="button"
                          data-tv-focusable="true"
                          data-tv-modal="external-launch"
                          data-external-primary="true"
                          tabIndex={0}
                          onClick={() => startInternalFallback(false)}
                          className="w-full py-3 px-4 rounded-xl achour-glossy-pill hover:brightness-110 font-medium text-sm flex items-center justify-center gap-2 transition-all outline-none cursor-pointer"
                        >
                          <Play size={16} className="fill-current" />
                          <span>{isRtl ? 'تشغيل بالمشغّل الداخلي الآن' : 'Play with Internal Player Now'}</span>
                        </button>

                        {result?.reason !== 'unsupported_platform' && (
                          <button
                            type="button"
                            data-tv-focusable="true"
                            data-tv-modal="external-launch"
                            tabIndex={0}
                            onClick={() => {
                              void launchExternalPlayer(streamUrl, channel, playbackType).then((opened) => {
                                if (opened && (playbackType === 'movie' || playbackType === 'series')) {
                                  setMovieDetailsModal(null);
                                }
                              });
                            }}
                            className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-medium text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors outline-none"
                          >
                            <RotateCcw size={15} className="text-gold" />
                            <span>{isRtl ? `إعادة المحاولة عبر ${playerLabel}` : `Retry with ${playerLabel}`}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          data-tv-focusable="true"
                          data-tv-modal="external-launch"
                          tabIndex={0}
                          onClick={() => startInternalFallback(true)}
                          className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-medium text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors outline-none"
                        >
                          <MonitorPlay size={15} className="text-gold" />
                          <span>{isRtl ? 'اعتماد المشغّل الداخلي وحفظه في الإعدادات' : 'Switch & Save Internal Player in Settings'}</span>
                        </button>

                        <button
                          type="button"
                          data-tv-focusable="true"
                          data-tv-modal="external-launch"
                          tabIndex={0}
                          onClick={async () => {
                            try {
                              if (navigator.clipboard?.writeText) {
                                await navigator.clipboard.writeText(streamUrl);
                                setExternalLaunchModal((prev) => prev ? { ...prev, copied: true } : prev);
                              }
                            } catch {}
                          }}
                          className="w-full py-2 px-4 rounded-xl bg-white/[0.04] hover:bg-white/10 border border-white/10 text-zinc-300 font-medium text-xs flex items-center justify-center gap-2 transition-colors outline-none"
                        >
                          {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                          <span>
                            {copied
                              ? (isRtl ? 'تم نسخ رابط البث' : 'Stream URL Copied')
                              : (isRtl ? 'نسخ رابط البث المباشر' : 'Copy Stream URL')}
                          </span>
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      data-tv-focusable="true"
                      data-tv-modal="external-launch"
                      tabIndex={0}
                      onClick={() => setExternalLaunchModal(null)}
                      className="w-full py-2 px-4 rounded-xl bg-transparent hover:bg-white/10 border border-white/10 text-zinc-400 hover:text-white font-medium text-xs transition-colors outline-none"
                    >
                      {isRtl ? 'إغلاق' : 'Close'}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            );
          })()}
        </AnimatePresence>,
        document.body
      )}

      {/* Watch It / Continue Watching Action Modal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {watchItResumeModal && (() => {
            const { channel, progress } = watchItResumeModal;
            const isSeriesItem = mediaType === 'series';
            const posSec = progress.positionSec;
            const durSec = progress.durationSec;
            const pct = durSec > 0 ? Math.min(100, Math.max(5, Math.round((posSec / durSec) * 100))) : 0;
            const timeFormatted = formatPlaybackClock(posSec);
            const posterSrc = channel.stream_icon || channel.cover || channel.logo;
            const epSubtitle = isSeriesItem && progress.seasonNum && progress.episodeNum
              ? `${isRtl ? 'الموسم' : 'Season'} ${progress.seasonNum} • ${isRtl ? 'الحلقة' : 'Episode'} ${progress.episodeNum}${progress.episodeTitle ? ` • ${progress.episodeTitle}` : ''}`
              : (channel.category_name && channel.category_name !== 'Watch It' ? channel.category_name : '');

            const handleContinueWatching = () => {
              setWatchItResumeModal(null);
              const effPlId = activePlaylist?.id || settings.activePlaylistId || 'default';
              if (isSeriesItem) {
                const seriesIdClean = cleanVodEntityId((channel as any).series_id || channel.stream_id, effPlId);
                activeSeriesParentRef.current = { ...channel, stream_id: seriesIdClean, series_id: seriesIdClean } as any;
                const epIdClean = cleanVodEntityId(progress.episodeId || channel.stream_id, effPlId, seriesIdClean);
                const epMedia: ParsedChannel = {
                  ...channel,
                  stream_id: epIdClean,
                  series_id: seriesIdClean,
                  name: progress.episodeTitle || `${channel.name} - S${progress.seasonNum || 1} E${progress.episodeNum || 1}`,
                  season: progress.seasonNum,
                  episode: progress.episodeNum,
                  type: 'series'
                };
                setSelectedChannel(epMedia);
                setActivePlayingMovie(epMedia);
                if (settings.useExternalPlayer) {
                  void launchExternalPlayer(epMedia.url, epMedia, 'series', Math.round(posSec * 1000));
                } else {
                  setVodResumeOverride({ mode: 'resume', positionSec: posSec });
                  setActiveVodPlayer(epMedia);
                }
              } else {
                setSelectedChannel(channel);
                setActivePlayingMovie(channel);
                if (settings.useExternalPlayer) {
                  void launchExternalPlayer(channel.url, channel, 'movie', Math.round(posSec * 1000));
                } else {
                  setVodResumeOverride({ mode: 'resume', positionSec: posSec });
                  setActiveVodPlayer(channel);
                }
              }
            };

            const handleStartOver = () => {
              setWatchItResumeModal(null);
              const effPlId = activePlaylist?.id || settings.activePlaylistId || 'default';
              if (isSeriesItem) {
                const seriesIdClean = cleanVodEntityId((channel as any).series_id || channel.stream_id, effPlId);
                const epIdClean = cleanVodEntityId(progress.episodeId || channel.stream_id, effPlId, seriesIdClean);
                clearVodProgress({
                  mediaType: 'series',
                  playlistId: effPlId,
                  streamId: epIdClean,
                  seriesId: seriesIdClean,
                  episodeId: epIdClean
                });
                activeSeriesParentRef.current = { ...channel, stream_id: seriesIdClean, series_id: seriesIdClean } as any;
                const epMedia: ParsedChannel = {
                  ...channel,
                  stream_id: epIdClean,
                  series_id: seriesIdClean,
                  name: progress.episodeTitle || `${channel.name} - S${progress.seasonNum || 1} E${progress.episodeNum || 1}`,
                  season: progress.seasonNum,
                  episode: progress.episodeNum,
                  type: 'series'
                };
                setSelectedChannel(epMedia);
                setActivePlayingMovie(epMedia);
                if (settings.useExternalPlayer) {
                  void launchExternalPlayer(epMedia.url, epMedia, 'series', 0);
                } else {
                  setVodResumeOverride({ mode: 'restart', positionSec: 0 });
                  setActiveVodPlayer(epMedia);
                }
              } else {
                clearVodProgress({
                  mediaType: 'movie',
                  playlistId: effPlId,
                  streamId: cleanVodEntityId(channel.stream_id, effPlId)
                });
                setSelectedChannel(channel);
                setActivePlayingMovie(channel);
                if (settings.useExternalPlayer) {
                  void launchExternalPlayer(channel.url, channel, 'movie', 0);
                } else {
                  setVodResumeOverride({ mode: 'restart', positionSec: 0 });
                  setActiveVodPlayer(channel);
                }
              }
            };

            return (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.05 }}
                dir={isRtl ? 'rtl' : 'ltr'}
                onPointerDown={(e) => {
                  watchItModalBackdropDownRef.current = e.target === e.currentTarget;
                }}
                onClick={(e) => {
                  if (isSafeBackdropClick(e, watchItModalOpenedAtRef.current || Date.now() - 400, watchItModalBackdropDownRef.current, 250)) {
                    setWatchItResumeModal(null);
                  }
                  watchItModalBackdropDownRef.current = false;
                }}
                className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/75 achour-modal-backdrop select-none"
              >
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  data-tv-modal="watch-it-action"
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  transition={{ duration: 0.05 }}
                  onClick={(e) => e.stopPropagation()}
                  className={`w-[min(92vw,520px)] achour-glass-modal border-gold/45 rounded-2xl p-4 sm:p-5 flex flex-col gap-4 overflow-hidden ${isRtl ? 'font-cairo text-right' : 'text-left'}`}
                >
                  <div className={`flex items-center justify-between pb-2 border-b border-white/10 ${isRtl ? 'flex-row-reverse' : ''}`}>
                    <div className={`flex items-center gap-2.5 min-w-0 ${isRtl ? 'flex-row-reverse' : ''}`}>
                      <div className="p-2 rounded-xl bg-gold/20 text-gold shrink-0">
                        <RotateCcw size={18} />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-sm sm:text-base font-semibold uppercase tracking-wider truncate achour-glossy-title">
                          {isRtl ? 'استئناف المشاهدة' : 'Resume Playback'}
                        </h2>
                        <span className="text-[10px] sm:text-xs font-medium achour-glossy-text">Watch It</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      data-tv-focusable="true"
                      data-tv-modal="watch-it-action"
                      tabIndex={0}
                      onClick={() => setWatchItResumeModal(null)}
                      className="p-1.5 text-zinc-400 hover:text-white rounded-full transition-colors outline-none shrink-0"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className={`flex items-center gap-3.5 sm:gap-4 ${isRtl ? 'flex-row-reverse' : ''}`}>
                    {posterSrc && (
                      <div className="w-16 sm:w-20 aspect-[2/3] rounded-xl overflow-hidden border border-gold/30 shrink-0 bg-white/[0.04]">
                        <img
                          src={posterSrc}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                      <h3 className="text-sm sm:text-base font-semibold text-white truncate">
                        {channel.name}
                      </h3>
                      {epSubtitle && (
                        <p className="text-xs font-normal achour-glossy-info truncate">
                          {epSubtitle}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 text-xs text-zinc-300 font-normal">
                        <Clock size={13} className="text-gold shrink-0" />
                        <span>
                          {isRtl ? `توقفت عند الدقيقة ` : `Paused at `}
                          <strong className="font-sans font-normal tabular-nums achour-glossy-text">{timeFormatted}</strong>
                        </span>
                      </div>
                      {pct > 0 && (
                        <div className="w-full h-1.5 bg-white/15 rounded-full overflow-hidden mt-1">
                          <div className="h-full bg-gold rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={`pt-2 border-t border-white/10 flex items-center justify-end gap-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
                    <button
                      type="button"
                      data-tv-focusable="true"
                      data-tv-modal="watch-it-action"
                      tabIndex={0}
                      onClick={handleStartOver}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-white/[0.08] hover:bg-white/15 border border-white/15 text-zinc-200 text-xs sm:text-sm font-medium flex items-center justify-center gap-2 transition-colors outline-none cursor-pointer"
                    >
                      <RotateCcw size={15} />
                      <span>{isRtl ? 'بدء من البداية' : 'Start Over'}</span>
                    </button>
                    <button
                      type="button"
                      data-tv-focusable="true"
                      data-tv-modal="watch-it-action"
                      tabIndex={0}
                      onClick={handleContinueWatching}
                      className="flex-1 py-2.5 px-4 rounded-xl achour-glossy-pill hover:brightness-110 text-xs sm:text-sm font-medium flex items-center justify-center gap-2 transition-all outline-none cursor-pointer"
                    >
                      <Play size={16} className="fill-current" />
                      <span>{isRtl ? 'استكمال المشاهدة' : 'Continue Watching'}</span>
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            );
          })()}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
