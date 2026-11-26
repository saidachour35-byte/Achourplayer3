// Virtualized TV channel & VOD poster list (src/components/VirtualizedChannelList.tsx)
import React, { useRef, useState, useEffect, useLayoutEffect, useCallback, useMemo, useImperativeHandle } from 'react';
import { ParsedChannel } from './LivePlayer';
import { Play, Film, Clapperboard, Star } from 'lucide-react';
import { setTVFocus, isTVOrLowEndDevice } from '../utils/tvNavigation';

export interface VirtualizedChannelListHandle {
  focusIndex: (index: number) => void;
  resetToIndex: (index?: number) => void;
}

interface VirtualizedListProps {
  items: ParsedChannel[];
  selectedChannelId?: string | null;
  activePlayingMovieId?: string | null;
  favorites: string[];
  isRtl: boolean;
  mediaType: 'live' | 'movie' | 'series' | 'favorites';
  viewMode?: 'list' | 'grid';
  posterSize?: 'small' | 'medium' | 'large';
  showPosterTitles?: boolean;
  emptyMessage?: string;
  focusedIndex?: number;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onSelectChannel: (channel: ParsedChannel) => void;
  onDoubleClickChannel?: (channel: ParsedChannel) => void;
  onHighlightChannel?: (channel: ParsedChannel) => void;
  onFocusChannel?: (index: number) => void;
  onToggleFavorite: (streamId: string) => void;
  onReorderChannel?: (item: any) => void;
  onMoveChannel?: (streamId: string, direction: 'up' | 'down', e: React.MouseEvent) => void;
  fetchMediaDetails?: (ch: ParsedChannel) => void;
  onColumnCountChange?: (count: number) => void;
  isFullscreen?: boolean;
}

const ITEM_HEIGHT = 64;
const VOD_LIST_ITEM_HEIGHT = 78;
const GRID_ROW_HEIGHT = 380;
const FIRE_TV_GRID_ROW_HEIGHT = 380;
const LIST_TOP_PADDING = 4;
const LIST_BOTTOM_PADDING = 8;
const FAILED_URL_CAP = 800;
const LOADED_URL_CAP = 400;

const failedImageUrls = new Set<string>();
const loadedImageUrls = new Set<string>();

const addBounded = (set: Set<string>, val: string, cap: number) => {
  if (set.has(val)) return;
  if (set.size >= cap) {
    const oldest = set.values().next().value;
    if (oldest !== undefined) set.delete(oldest);
  }
  set.add(val);
};

let activeImageLoads = 0;
const pendingImageQueue: Array<() => void> = [];

const scheduleImageSlot = (startFn: () => void): (() => void) => {
  const maxConcurrent = isTVOrLowEndDevice() ? 4 : 10;
  let cancelled = false;
  let started = false;

  const tryRun = () => {
    if (cancelled || started) return;
    started = true;
    activeImageLoads++;
    startFn();
  };

  if (activeImageLoads < maxConcurrent) {
    tryRun();
  } else {
    pendingImageQueue.push(tryRun);
  }

  return () => {
    cancelled = true;
    if (!started) {
      const idx = pendingImageQueue.indexOf(tryRun);
      if (idx !== -1) pendingImageQueue.splice(idx, 1);
    }
  };
};

const releaseImageSlot = () => {
  if (activeImageLoads > 0) activeImageLoads--;
  const maxConcurrent = isTVOrLowEndDevice() ? 4 : 10;
  while (activeImageLoads < maxConcurrent && pendingImageQueue.length > 0) {
    const next = pendingImageQueue.shift();
    if (next) next();
  }
};

const toDisplayThumbnailUrl = (rawUrl: string, variant?: 'poster' | 'icon'): string => {
  if (!rawUrl || !variant) return rawUrl;
  if (rawUrl.includes('image.tmdb.org/t/p/')) {
    const size = variant === 'icon' ? 'w92' : 'w154';
    return rawUrl.replace(/\/t\/p\/(?:original|w\d+|h\d+)\//i, `/t/p/${size}/`);
  }
  return rawUrl;
};

const CachedMediaImage: React.FC<{
  src?: string;
  alt: string;
  className: string;
  fallback: React.ReactNode;
  deferLoad?: boolean;
  thumbnailVariant?: 'poster' | 'icon';
}> = React.memo(({ src, alt, className, fallback, deferLoad = false, thumbnailVariant }) => {
  const cleanSrc = src ? src.trim() : '';
  const thumbSrc = toDisplayThumbnailUrl(cleanSrc, thumbnailVariant);
  const slotHeldRef = useRef(false);
  const [useOriginalFallback, setUseOriginalFallback] = useState(false);
  const displaySrc = useOriginalFallback ? cleanSrc : thumbSrc;
  const isAlreadyWarm = Boolean(displaySrc && loadedImageUrls.has(displaySrc));

  const [failed, setFailed] = useState(() => !cleanSrc || failedImageUrls.has(cleanSrc));
  const [canLoad, setCanLoad] = useState(() => isAlreadyWarm || (!deferLoad && Boolean(cleanSrc)));

  useEffect(() => {
    setUseOriginalFallback(false);
    const activeUrl = thumbSrc || cleanSrc;
    const nextFailed = !cleanSrc || failedImageUrls.has(cleanSrc) || (activeUrl !== cleanSrc && failedImageUrls.has(activeUrl) && failedImageUrls.has(cleanSrc));
    setFailed(nextFailed);
    if (nextFailed) {
      setCanLoad(false);
      return;
    }
    if (loadedImageUrls.has(activeUrl) || loadedImageUrls.has(cleanSrc)) {
      if (!loadedImageUrls.has(activeUrl) && loadedImageUrls.has(cleanSrc)) {
        setUseOriginalFallback(true);
      }
      setCanLoad(true);
      return;
    }
    if (deferLoad) {
      setCanLoad(false);
      return;
    }

    const cancelQueue = scheduleImageSlot(() => {
      slotHeldRef.current = true;
      setCanLoad(true);
    });

    return () => {
      cancelQueue();
      if (slotHeldRef.current) {
        slotHeldRef.current = false;
        releaseImageSlot();
      }
    };
  }, [cleanSrc, thumbSrc, deferLoad]);

  const finishSlot = useCallback(() => {
    if (slotHeldRef.current) {
      slotHeldRef.current = false;
      releaseImageSlot();
    }
  }, []);

  if (!displaySrc || failed || !canLoad) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={displaySrc}
      referrerPolicy="no-referrer"
      decoding="async"
      loading="lazy"
      className={className}
      onLoad={() => {
        addBounded(loadedImageUrls, displaySrc, LOADED_URL_CAP);
        finishSlot();
      }}
      onError={() => {
        if (!useOriginalFallback && thumbSrc !== cleanSrc && cleanSrc && !failedImageUrls.has(cleanSrc)) {
          addBounded(failedImageUrls, thumbSrc, FAILED_URL_CAP);
          setUseOriginalFallback(true);
          return;
        }
        addBounded(failedImageUrls, cleanSrc, FAILED_URL_CAP);
        finishSlot();
        setFailed(true);
      }}
      alt={alt}
    />
  );
});

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
    if (isLongPress.current) {
      setTimeout(() => {
        isLongPress.current = false;
      }, 350);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!startPos.current || e.touches.length === 0) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - startPos.current.x);
    const dy = Math.abs(touch.clientY - startPos.current.y);
    if (dx > 6 || dy > 6) stop();
  }, [stop]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!startPos.current) return;
    const dx = Math.abs(e.clientX - startPos.current.x);
    const dy = Math.abs(e.clientY - startPos.current.y);
    if (dx > 8 || dy > 8) stop();
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
      if (e.touches.length > 0) start(e.touches[0].clientX, e.touches[0].clientY);
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
    onClick,
    isLongPressActive: () => isLongPress.current
  };
};

const LiveChannelRow: React.FC<{
  ch: ParsedChannel;
  idx: number;
  top: number;
  isSelected: boolean;
  isRtl: boolean;
  mediaType?: string;
  onSelectChannel: (channel: ParsedChannel) => void;
  onDoubleClickChannel?: (channel: ParsedChannel) => void;
  onHighlightChannel?: (channel: ParsedChannel) => void;
  onReorderChannel?: (item: any) => void;
}> = React.memo(({
  ch,
  idx,
  top,
  isSelected,
  isRtl,
  mediaType = 'live',
  onSelectChannel,
  onDoubleClickChannel,
  onHighlightChannel,
  onReorderChannel
}) => {
  const longPress = useLongPress(() => {
    if (onReorderChannel) {
      onReorderChannel({ ...ch, realIdx: idx });
    }
  }, 450, !!onReorderChannel);

  const handleItemClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (longPress.isLongPressActive && longPress.isLongPressActive()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onSelectChannel(ch);
  };

  const { isLongPressActive, ...longPressHandlers } = longPress;
  const imgSrc = ch.stream_icon || ch.logo || ch.cover;

  const fallbackLogo = useMemo(
    () => <Play size={16} className={isSelected ? 'text-gold fill-gold' : 'text-zinc-400'} />,
    [isSelected]
  );

  return (
    <div
      style={{
        position: 'absolute',
        top: `${top}px`,
        left: 0,
        right: 0,
        height: `${ITEM_HEIGHT - 6}px`
      }}
      className="px-2"
    >
      <div
        role="button"
        data-tv-focusable="true"
        data-tv-focus-inset="true"
        data-tv-pane="channels"
        data-index={idx}
        tabIndex={0}
        {...longPressHandlers}
        onFocus={() => {
          if (onHighlightChannel) onHighlightChannel(ch);
        }}
        onClick={handleItemClick}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onSelectChannel(ch);
          if (onDoubleClickChannel) onDoubleClickChannel(ch);
        }}
        className={`w-full h-full flex items-center gap-3 px-3 py-2 rounded-2xl transition-colors relative group cursor-pointer outline-none bg-transparent ${
          isSelected
            ? 'achour-glossy-surface font-semibold'
            : 'text-zinc-300 hover:text-white font-medium'
        } ${isRtl ? 'text-right' : 'text-left'}`}
        title={mediaType === 'live' ? (isRtl ? 'اضغط مطولاً أو انقر بالزر الأيمن لنقل القناة أو تغيير رقمها' : 'Long press or right click to reorder channel position') : undefined}
      >
        <span className={`w-9 text-xs sm:text-sm font-sans tabular-nums shrink-0 text-center select-none ${isSelected ? 'font-semibold achour-glossy-text' : 'font-normal achour-glossy-info'}`} tabIndex={-1}>
          {idx + 1}
        </span>

        <div className="w-11 h-11 rounded-xl bg-transparent flex items-center justify-center overflow-hidden shrink-0">
          <CachedMediaImage
            src={imgSrc}
            alt=""
            className="w-full h-full object-contain"
            fallback={fallbackLogo}
            thumbnailVariant="icon"
          />
        </div>

        <div className="flex flex-col flex-1 min-w-0 justify-center py-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`text-sm sm:text-base truncate leading-tight text-white ${
                isSelected ? 'font-semibold' : 'font-medium'
              }`}
              title={ch.name}
            >
              {ch.name}
            </span>
          </div>
          {(() => {
            const catVal = ch.category_name || ch.category;
            const rawCat = typeof catVal === 'string' ? catVal.trim() : '';
            const lowerCat = rawCat.toLowerCase();
            const isSynthetic = !rawCat || lowerCat === 'general' || lowerCat === 'uncategorized' || rawCat === 'عام' || lowerCat === 'عام (general)';
            return !isSynthetic ? (
              <span className="text-[11px] font-normal text-white truncate leading-none mt-1">
                {rawCat}
              </span>
            ) : null;
          })()}
        </div>
      </div>
    </div>
  );
});

const VodListRow: React.FC<{
  ch: ParsedChannel;
  idx: number;
  top: number;
  isSelected: boolean;
  isRtl: boolean;
  mediaType: 'movie' | 'series';
  onSelectChannel: (channel: ParsedChannel) => void;
  onFocusChannel?: (index: number) => void;
  fetchMediaDetails?: (ch: ParsedChannel) => void;
}> = React.memo(({
  ch,
  idx,
  top,
  isSelected,
  isRtl,
  mediaType,
  onSelectChannel,
  onFocusChannel,
  fetchMediaDetails
}) => {
  const imgSrc = ch.stream_icon || ch.cover || ch.logo;
  const ratingVal = ch.rating ? String(ch.rating).trim() : '';
  const yearVal = ch.releaseDate || ch.year ? String(ch.releaseDate || ch.year).trim() : '';
  const durationVal = ch.duration ? String(ch.duration).trim() : '';

  const fallbackThumb = useMemo(() => (
    mediaType === 'movie'
      ? <Film size={18} className={isSelected ? 'text-gold' : 'text-zinc-400'} />
      : <Clapperboard size={18} className={isSelected ? 'text-gold' : 'text-zinc-400'} />
  ), [mediaType, isSelected]);

  return (
    <div
      style={{
        position: 'absolute',
        top: `${top}px`,
        left: 0,
        right: 0,
        height: `${VOD_LIST_ITEM_HEIGHT - 8}px`
      }}
      className="px-2 sm:px-3"
    >
      <div
        role="button"
        data-tv-focusable="true"
        data-tv-focus-inset="true"
        data-tv-pane="channels"
        data-index={idx}
        tabIndex={0}
        onFocus={() => onFocusChannel?.(idx)}
        onClick={() => {
          onSelectChannel(ch);
          if (fetchMediaDetails) fetchMediaDetails(ch);
        }}
        className={`w-full h-full flex items-center gap-3 px-3 py-1.5 rounded-2xl transition-colors relative group cursor-pointer outline-none bg-transparent ${
          isSelected
            ? 'achour-glossy-surface font-semibold'
            : 'text-zinc-200 hover:text-white font-medium'
        } ${isRtl ? 'text-right' : 'text-left'}`}
      >
        <div className="w-11 h-16 rounded-xl bg-transparent flex items-center justify-center overflow-hidden shrink-0">
          <CachedMediaImage
            src={imgSrc}
            alt={ch.name}
            className="w-full h-full object-contain"
            fallback={fallbackThumb}
            thumbnailVariant="poster"
          />
        </div>

        <div className="flex flex-col flex-1 min-w-0 justify-center gap-1">
          <span className={`text-sm sm:text-base truncate leading-tight achour-glossy-text ${isSelected ? 'font-semibold' : 'font-medium'}`}>
            {ch.name}
          </span>
          <div className="flex items-center flex-wrap gap-2 text-[11px] font-normal text-zinc-400">
            {ch.category_name &&
  !['general', 'uncategorized', 'عام', 'عام (general)'].includes(
    String(ch.category_name).trim().toLowerCase()
  ) && (
    <span className="text-white truncate max-w-[180px]">
      {ch.category_name}
    </span>
)}
            {ratingVal && (
              <span className="text-gold flex items-center gap-1 font-sans tabular-nums">
                <Star size={10} className="fill-gold" />
                <span className="achour-glossy-info">{ratingVal}</span>
              </span>
            )}
            {yearVal && (
              <span className="font-sans tabular-nums achour-glossy-info">
                {yearVal}
              </span>
            )}
            {durationVal && (
              <span className="font-sans tabular-nums achour-glossy-info">
                {durationVal}
              </span>
            )}
          </div>
        </div>

        <div className="w-9 h-9 rounded-xl text-gold flex items-center justify-center shrink-0 transition-colors">
          <Play size={16} className="fill-current" />
        </div>
        {Number((ch as any).progressPositionSec || 0) >= 8 && (
          <div className="absolute bottom-0 left-3 right-3 h-1 rounded-full bg-white/15 overflow-hidden pointer-events-none">
            <div
              className="h-full bg-gold rounded-full"
              style={{
                width: `${
                  Number((ch as any).progressDurationSec || 0) > 0
                    ? Math.min(100, Math.max(8, Math.round((Number((ch as any).progressPositionSec) / Number((ch as any).progressDurationSec)) * 100)))
                    : 35
                }%`
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
});

const VodPosterCard: React.FC<{
  ch: ParsedChannel;
  idx: number;
  isSelected: boolean;
  isRtl: boolean;
  mediaType: 'movie' | 'series';
  deferImageLoad: boolean;
  posterHeight: number;
  showTitle: boolean;
  onSelectChannel: (channel: ParsedChannel) => void;
  onFocusChannel?: (index: number) => void;
  fetchMediaDetails?: (ch: ParsedChannel) => void;
}> = React.memo(({
  ch,
  idx,
  isSelected,
  isRtl,
  mediaType,
  deferImageLoad,
  posterHeight,
  showTitle,
  onSelectChannel,
  onFocusChannel,
  fetchMediaDetails
}) => {
  const imgSrc = ch.stream_icon || ch.logo || ch.cover;

  const fallbackPoster = useMemo(() => (
    <div className="w-full h-full bg-white/[0.06] flex flex-col items-center justify-center p-3 text-center">
      {mediaType === 'movie' ? (
        <Film size={28} className="text-gold/60 mb-2" />
      ) : (
        <Clapperboard size={28} className="text-gold/60 mb-2" />
      )}
      <span className="text-xs font-semibold achour-glossy-text line-clamp-3 leading-tight px-1">
        {ch.name}
      </span>
    </div>
  ), [mediaType, ch.name]);

  return (
    <div
      role="button"
      data-tv-focusable="true"
      data-tv-focus-inset="true"
      data-tv-vod-poster="true"
      data-tv-pane="channels"
      data-index={idx}
      tabIndex={0}
      onFocus={() => {
        onFocusChannel?.(idx);
      }}
      onClick={() => {
        onSelectChannel(ch);
        if (fetchMediaDetails) fetchMediaDetails(ch);
      }}
      className="relative h-full w-full rounded-2xl overflow-visible cursor-pointer group outline-none bg-transparent transition-colors flex flex-col"
      title={isRtl ? 'انقر لعرض التفاصيل والتشغيل' : 'Click to view details & play'}
    >
      <div aria-hidden="true" className="achour-poster-lamp-bar" />
      <div
        style={{ height: `${posterHeight}px` }}
        className={`relative w-full shrink-0 flex items-center justify-center overflow-hidden bg-transparent ${showTitle ? 'rounded-t-2xl' : 'rounded-2xl'}`}
      >
        <CachedMediaImage
          src={imgSrc}
          alt={ch.name}
          className="block w-full h-full object-contain"
          fallback={fallbackPoster}
          deferLoad={deferImageLoad}
          thumbnailVariant="poster"
        />
        <div aria-hidden="true" className="achour-poster-lamp-beam">
          <span className="achour-poster-lamp-cone" />
          <span className="achour-poster-lamp-spill" />
        </div>

        {Number((ch as any).progressPositionSec || 0) >= 8 && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/75 z-10 pointer-events-none">
            <div
              className="h-full bg-gold"
              style={{
                width: `${
                  Number((ch as any).progressDurationSec || 0) > 0
                    ? Math.min(100, Math.max(8, Math.round((Number((ch as any).progressPositionSec) / Number((ch as any).progressDurationSec)) * 100)))
                    : 35
                }%`
              }}
            />
          </div>
        )}
      </div>

      {showTitle && (
        <div className="h-[40px] w-full shrink-0 px-2 flex items-center justify-center bg-transparent text-center overflow-hidden rounded-b-2xl">
          <span className={`text-[11px] sm:text-xs line-clamp-2 leading-tight w-full achour-glossy-text ${isSelected ? 'font-semibold' : 'font-medium'}`}>
            {ch.name}
          </span>
        </div>
      )}
    </div>
  );
});

export const VirtualizedChannelList = React.forwardRef<VirtualizedChannelListHandle, VirtualizedListProps>(({
  items,
  selectedChannelId,
  activePlayingMovieId,
  isRtl,
  mediaType,
  viewMode = 'grid',
  posterSize = 'medium',
  showPosterTitles = false,
  emptyMessage,
  focusedIndex,
  hasMore = false,
  onLoadMore,
  onSelectChannel,
  onDoubleClickChannel,
  onHighlightChannel,
  onFocusChannel,
  onReorderChannel,
  fetchMediaDetails,
  onColumnCountChange,
  isFullscreen
}, ref) => {
  const isFireTV =
    typeof navigator !== 'undefined' &&
    /AFT[A-Z0-9]*|FireTV|AmazonWebAppPlatform/i.test(navigator.userAgent || '');

  const listOverscan = 14;
  const gridOverscan = 4;

  const isVodType = mediaType === 'movie' || mediaType === 'series';
  const isVodGrid = isVodType && viewMode !== 'list';
  const isVodList = isVodType && viewMode === 'list';
  const activeListItemHeight = isVodList ? VOD_LIST_ITEM_HEIGHT : ITEM_HEIGHT;

  const getGridColumnTarget = useCallback((width: number): number => {
    if (!isVodGrid) return 1;
    if (width < 520) {
      return posterSize === 'small' ? 3 : 2;
    }
    if (posterSize === 'small') return 5;
    if (posterSize === 'large') return 3;
    return 4;
  }, [isVodGrid, posterSize]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const [containerWidth, setContainerWidth] = useState(800);
  const [columnCount, setColumnCount] = useState(() => (isVodGrid ? (posterSize === 'small' ? 5 : posterSize === 'large' ? 3 : 4) : 1));
  const [isFastScrolling, setIsFastScrolling] = useState(false);

  // Dynamic VOD grid geometry calculated from actual container size, posterSize, and optional title strip.
  // Preserves 2:3 poster aspect ratio and guarantees full rows + safe focus margins (zero clipping or overlap).
  const activeCols = Math.max(1, columnCount);
  const titleStripHeight = isVodGrid && showPosterTitles ? 40 : 0;
  const gridVertGap = isVodGrid
    ? Math.max(16, Math.min(28, Math.round(containerHeight * 0.036)))
    : (isFireTV ? FIRE_TV_GRID_ROW_HEIGHT : GRID_ROW_HEIGHT) - 340;
  const gridTopPad = isVodGrid
    ? Math.max(6, Math.min(10, Math.round(containerHeight * 0.01)))
    : 8;

  const minHorizPad = Math.max(12, Math.min(28, Math.round(containerWidth * 0.025)));
  const minHorizGap = Math.max(16, Math.min(30, Math.round(containerWidth * 0.022)));
  const twoRowMaxCardHeight = Math.floor(
    (containerHeight - gridTopPad * 2 - gridVertGap) / 2
  );
  const maxPosterHFromTwoRows = Math.max(64, twoRowMaxCardHeight - titleStripHeight);
  const maxCardWidthForCols = Math.floor(
    (containerWidth - minHorizPad * 2 - minHorizGap * Math.max(0, activeCols - 1)) / activeCols
  );
  const maxPosterHFromWidth = Math.floor(maxCardWidthForCols * 1.5);

  const posterHeight = isVodGrid
    ? (posterSize === 'small'
      ? Math.max(70, Math.min(maxPosterHFromWidth, Math.floor(maxPosterHFromTwoRows * 0.80)))
      : posterSize === 'large'
      ? Math.max(100, Math.min(maxPosterHFromWidth, Math.floor(containerHeight * 0.72) - titleStripHeight))
      : Math.max(80, Math.min(maxPosterHFromTwoRows, maxPosterHFromWidth)))
    : 340;

  const gridCardHeight = isVodGrid ? posterHeight + titleStripHeight : 340;
  const gridCardWidth = isVodGrid ? Math.max(56, Math.round(posterHeight * (2 / 3))) : 226;
  const gridBottomPad = isVodGrid ? Math.max(6, gridTopPad) : 8;

  const extraHorizSpace = Math.max(0, containerWidth - gridCardWidth * activeCols);
  const gridHorizGap = activeCols > 1
    ? Math.max(minHorizGap, Math.min(56, Math.floor(extraHorizSpace / (activeCols + 1))))
    : 0;
  const gridHorizPad = Math.max(
    minHorizPad,
    Math.floor((containerWidth - gridCardWidth * activeCols - gridHorizGap * Math.max(0, activeCols - 1)) / 2)
  );
  const gridRowHeight = gridCardHeight + gridVertGap;

  const lastScrollActionTsRef = useRef(0);
  const lastScrollTopRef = useRef(0);
  const fastScrollSettleRef = useRef<NodeJS.Timeout | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const pendingScrollTopRef = useRef<number | null>(null);
  const pendingFocusIdxRef = useRef<number | null>(null);
  const activeFocusIdxRef = useRef<number>(focusedIndex ?? 0);
  const onColumnCountChangeRef = useRef(onColumnCountChange);
  onColumnCountChangeRef.current = onColumnCountChange;
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;
  const loadMoreTriggeredLenRef = useRef(-1);
  const lastAutoScrolledChannelRef = useRef<string | null>(null);

  const markScrollActivity = useCallback(() => {
    const now = Date.now();
    const dt = now - lastScrollActionTsRef.current;
    lastScrollActionTsRef.current = now;
    if (dt < 75) {
      setIsFastScrolling(true);
      if (fastScrollSettleRef.current) clearTimeout(fastScrollSettleRef.current);
      fastScrollSettleRef.current = setTimeout(() => {
        setIsFastScrolling(false);
      }, 85);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (fastScrollSettleRef.current) clearTimeout(fastScrollSettleRef.current);
      if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      const rawH = container.clientHeight;
      const rawW = container.clientWidth;
      if (rawH <= 0 || rawW <= 0) return;
      setContainerHeight(prev => (prev === rawH ? prev : rawH));
      setContainerWidth(prev => (prev === rawW ? prev : rawW));

      const cols = isVodGrid ? getGridColumnTarget(rawW) : 1;

      setColumnCount(prev => {
        if (prev !== cols) onColumnCountChangeRef.current?.(cols);
        return prev === cols ? prev : cols;
      });
    };

    updateDimensions();

    const observer = new ResizeObserver(() => {
      updateDimensions();
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, [mediaType, isVodGrid, getGridColumnTarget]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const h = container.clientHeight;
    if (h > 0) {
      setContainerHeight(prev => (prev === h ? prev : h));
    }
    if (!isFullscreen && (mediaType === 'live' || mediaType === 'favorites')) {
      requestAnimationFrame(() => {
        focusIndexImperative(activeFocusIdxRef.current);
      });
    }
  }, [isFullscreen, mediaType]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const nextScrollTop = e.currentTarget.scrollTop;
    const delta = Math.abs(nextScrollTop - lastScrollTopRef.current);
    if (delta > 36) {
      markScrollActivity();
    }
    pendingScrollTopRef.current = nextScrollTop;
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
  }, [markScrollActivity]);

  const focusDomItemByIndex = useCallback((idx: number): boolean => {
    const container = containerRef.current;
    if (!container) return false;
    const targetEl = container.querySelector<HTMLElement>(
      `[data-tv-pane="channels"][data-index="${idx}"]`
    );
    if (targetEl) {
      setTVFocus(targetEl, { scroll: false, skipLayoutCheck: true });
      return true;
    }
    return false;
  }, []);

  const focusIndexImperative = useCallback((rawIdx: number) => {
    const container = containerRef.current;
    if (!container || items.length === 0) return;
    const safeIdx = Math.max(0, Math.min(items.length - 1, rawIdx));
    activeFocusIdxRef.current = safeIdx;

    let targetScroll: number | null = null;
    let clampedMaxScroll = 0;
    const currentContainerHeight =
      container.clientHeight && container.clientHeight > 50
        ? container.clientHeight
        : (containerHeight > 50 ? containerHeight : 600);

    if (isVodGrid) {
      const rowIndex = Math.floor(safeIdx / activeCols);
      const totalRows = Math.ceil(items.length / activeCols);
      const totalContentH = totalRows > 0
        ? gridTopPad + totalRows * gridRowHeight - gridVertGap + gridBottomPad
        : 0;
      clampedMaxScroll = Math.max(0, totalContentH - currentContainerHeight);
      const rowTop = gridTopPad + rowIndex * gridRowHeight;
      const rowBottom = rowTop + gridCardHeight;
      const viewTop = container.scrollTop;
      const viewBottom = viewTop + currentContainerHeight;

      if (rowTop - gridTopPad < viewTop) {
        targetScroll = Math.max(0, rowTop - gridTopPad);
      } else if (rowBottom + gridBottomPad > viewBottom) {
        targetScroll = Math.min(clampedMaxScroll, Math.max(0, rowBottom + gridBottomPad - currentContainerHeight));
      }
    } else {
      const safeMargin = 36;
      const totalContentH = LIST_TOP_PADDING + items.length * activeListItemHeight + LIST_BOTTOM_PADDING;
      clampedMaxScroll = Math.max(0, totalContentH - currentContainerHeight);
      const itemTop = LIST_TOP_PADDING + safeIdx * activeListItemHeight;
      const itemBottom = itemTop + activeListItemHeight;
      const viewTop = container.scrollTop;
      const viewBottom = viewTop + currentContainerHeight;

      if (itemTop - safeMargin < viewTop) {
        targetScroll = Math.max(0, itemTop - safeMargin);
      } else if (itemBottom + safeMargin > viewBottom) {
        targetScroll = Math.min(clampedMaxScroll, Math.max(0, itemBottom + safeMargin - currentContainerHeight));
      }
    }

    if (targetScroll !== null && Math.abs(targetScroll - container.scrollTop) > 1) {
      const clampedTop = Math.max(0, Math.min(clampedMaxScroll, targetScroll));
      container.scrollTop = clampedTop;
      lastScrollTopRef.current = clampedTop;
      setScrollTop(clampedTop);
      if (!focusDomItemByIndex(safeIdx)) {
        pendingFocusIdxRef.current = safeIdx;
      } else {
        pendingFocusIdxRef.current = null;
      }
      return;
    }

    pendingFocusIdxRef.current = null;
    if (!focusDomItemByIndex(safeIdx)) {
      pendingFocusIdxRef.current = safeIdx;
    }
  }, [items.length, isVodGrid, activeCols, activeListItemHeight, gridRowHeight, gridCardHeight, gridTopPad, gridBottomPad, containerHeight, posterSize, focusDomItemByIndex]);

  const resetToIndexImperative = useCallback((rawIdx = 0) => {
    const container = containerRef.current;
    if (!container) return;
    const safeIdx = Math.max(0, Math.min(Math.max(0, items.length - 1), rawIdx));
    activeFocusIdxRef.current = safeIdx;
    if (safeIdx === 0 && container.scrollTop !== 0) {
      container.scrollTop = 0;
      lastScrollTopRef.current = 0;
      setScrollTop(0);
    }
    pendingFocusIdxRef.current = null;
  }, [items.length]);

  useImperativeHandle(ref, () => ({
    focusIndex: focusIndexImperative,
    resetToIndex: resetToIndexImperative,
  }), [focusIndexImperative, resetToIndexImperative]);

  // Complete deferred DOM focus immediately after a virtualized scroll commit with RAF fallback
  useLayoutEffect(() => {
    const pendingIdx = pendingFocusIdxRef.current;
    if (pendingIdx === null) return;
    if (focusDomItemByIndex(pendingIdx)) {
      pendingFocusIdxRef.current = null;
    } else {
      const raf = requestAnimationFrame(() => {
        if (pendingFocusIdxRef.current !== null) {
          if (focusDomItemByIndex(pendingFocusIdxRef.current)) {
            pendingFocusIdxRef.current = null;
          }
        }
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [scrollTop, items.length, columnCount, focusDomItemByIndex]);

  // Sync if caller passes a changed focusedIndex prop (e.g., reset on category change)
  useEffect(() => {
    if (focusedIndex === undefined || focusedIndex < 0) return;
    activeFocusIdxRef.current = focusedIndex;
  }, [focusedIndex]);

  useEffect(() => {
    if (!selectedChannelId || !containerRef.current) {
      lastAutoScrolledChannelRef.current = null;
      return;
    }
    if (lastAutoScrolledChannelRef.current === selectedChannelId) return;
    const index = items.findIndex(c => c.stream_id === selectedChannelId);
    if (index === -1) return;
    lastAutoScrolledChannelRef.current = selectedChannelId;

    const container = containerRef.current;

    if (!isVodGrid) {
      const itemTop = LIST_TOP_PADDING + index * activeListItemHeight;
      const itemBottom = itemTop + activeListItemHeight;
      const viewTop = container.scrollTop;
      const viewBottom = viewTop + containerHeight;

      if (itemTop < viewTop) {
        container.scrollTop = itemTop;
        lastScrollTopRef.current = itemTop;
        setScrollTop(itemTop);
      } else if (itemBottom > viewBottom) {
        const target = Math.max(0, itemBottom - containerHeight);
        container.scrollTop = target;
        lastScrollTopRef.current = target;
        setScrollTop(target);
      }
    } else {
      const rowIndex = Math.floor(index / activeCols);
      const totalRows = Math.ceil(items.length / activeCols);
      const totalContentH = totalRows > 0
        ? gridTopPad + totalRows * gridRowHeight - gridVertGap + gridBottomPad
        : 0;
      const maxScroll = Math.max(0, totalContentH - containerHeight);
      const rowTop = gridTopPad + rowIndex * gridRowHeight;
      const rowBottom = rowTop + gridCardHeight;
      const viewTop = container.scrollTop;
      const viewBottom = viewTop + containerHeight;

      if (rowTop - gridTopPad < viewTop) {
        const target = Math.max(0, rowTop - gridTopPad);
        container.scrollTop = target;
        lastScrollTopRef.current = target;
        setScrollTop(target);
      } else if (rowBottom + gridBottomPad > viewBottom) {
        const target = Math.min(maxScroll, Math.max(0, rowBottom + gridBottomPad - containerHeight));
        container.scrollTop = target;
        lastScrollTopRef.current = target;
        setScrollTop(target);
      }
    }
  }, [
    selectedChannelId,
    items,
    containerHeight,
    isVodGrid,
    activeCols,
    activeListItemHeight,
    gridRowHeight,
    gridCardHeight,
    gridTopPad,
    gridBottomPad,
    posterSize
  ]);

  // Progressive chunk loader trigger when approaching the bottom.
  useEffect(() => {
    if (!hasMore || !onLoadMoreRef.current || items.length === 0) return;
    if (loadMoreTriggeredLenRef.current === items.length) return;

    const totalRows = Math.ceil(items.length / activeCols);
    const totalHeight = isVodGrid
      ? (totalRows > 0 ? gridTopPad + totalRows * gridRowHeight - gridVertGap + gridBottomPad : 0)
      : LIST_TOP_PADDING + items.length * activeListItemHeight + LIST_BOTTOM_PADDING;

    const distanceFromBottom = totalHeight - (scrollTop + containerHeight);

    if (distanceFromBottom < containerHeight * 2.5) {
      loadMoreTriggeredLenRef.current = items.length;
      onLoadMoreRef.current();
    }
  }, [hasMore, items.length, scrollTop, containerHeight, isVodGrid, activeCols, activeListItemHeight, gridRowHeight, gridTopPad, gridBottomPad, gridVertGap]);

  useEffect(() => {
    loadMoreTriggeredLenRef.current = -1;
  }, [items.length === 0, mediaType]);

  const listVirtualBounds = useMemo(() => {
    const totalCount = items.length;
    const listScrollTop = Math.max(0, scrollTop - LIST_TOP_PADDING);
    const effectiveHeight =
      containerRef.current?.clientHeight && containerRef.current.clientHeight > 50
        ? containerRef.current.clientHeight
        : (containerHeight > 50 ? containerHeight : 600);
    const adaptiveBottomPad = LIST_BOTTOM_PADDING;
    const totalHeight = LIST_TOP_PADDING + totalCount * activeListItemHeight + adaptiveBottomPad;

    let startIndex = Math.max(0, Math.floor(listScrollTop / activeListItemHeight) - listOverscan);
    let endIndex = Math.min(
      totalCount,
      Math.max(
        0,
        Math.ceil((scrollTop + effectiveHeight - LIST_TOP_PADDING) / activeListItemHeight)
      ) + listOverscan
    );

    // Guarantee activeFocusIdxRef is ALWAYS included in visible items so focus never drops
    const currentFocusedIdx = activeFocusIdxRef.current;
    if (currentFocusedIdx >= 0 && currentFocusedIdx < totalCount) {
      if (currentFocusedIdx < startIndex) startIndex = Math.max(0, currentFocusedIdx - 2);
      if (currentFocusedIdx >= endIndex) endIndex = Math.min(totalCount, currentFocusedIdx + 3);
    }

    const visibleItems: { item: ParsedChannel; originalIndex: number; top: number }[] = [];

    for (let i = startIndex; i < endIndex; i++) {
      visibleItems.push({
        item: items[i],
        originalIndex: i,
        top: LIST_TOP_PADDING + i * activeListItemHeight
      });
    }

    return { totalHeight, visibleItems };
  }, [items, scrollTop, containerHeight, listOverscan, activeListItemHeight]);

  const gridVirtualBounds = useMemo(() => {
    const totalItems = items.length;
    const totalRows = Math.ceil(totalItems / activeCols);
    const totalHeight = totalRows > 0
      ? gridTopPad + totalRows * gridRowHeight - gridVertGap + gridBottomPad
      : 0;
    const gridScrollTop = Math.max(0, scrollTop - gridTopPad);
    const effectiveHeight =
      containerRef.current?.clientHeight && containerRef.current.clientHeight > 50
        ? containerRef.current.clientHeight
        : (containerHeight > 50 ? containerHeight : 600);

    let startRow = Math.max(0, Math.floor(gridScrollTop / gridRowHeight) - gridOverscan);
    let endRow = Math.min(
      totalRows,
      Math.max(
        0,
        Math.ceil((scrollTop + effectiveHeight - gridTopPad) / gridRowHeight)
      ) + gridOverscan
    );

    // Guarantee activeFocusIdxRef row is ALWAYS included in visible rows
    const currentFocusedIdx = activeFocusIdxRef.current;
    if (currentFocusedIdx >= 0 && currentFocusedIdx < totalItems) {
      const focusedRow = Math.floor(currentFocusedIdx / activeCols);
      if (focusedRow < startRow) startRow = Math.max(0, focusedRow - 1);
      if (focusedRow >= endRow) endRow = Math.min(totalRows, focusedRow + 2);
    }

    const visibleRows: {
      rowIndex: number;
      top: number;
      rowItems: { item: ParsedChannel; originalIndex: number }[];
    }[] = [];

    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      const rowItems: { item: ParsedChannel; originalIndex: number }[] = [];
      const startIndex = rowIndex * activeCols;
      const endIndex = Math.min(totalItems, startIndex + activeCols);

      for (let i = startIndex; i < endIndex; i++) {
        rowItems.push({
          item: items[i],
          originalIndex: i
        });
      }

      visibleRows.push({
        rowIndex,
        top: gridTopPad + rowIndex * gridRowHeight,
        rowItems
      });
    }

    return { totalHeight, visibleRows };
  }, [
    items,
    activeCols,
    scrollTop,
    containerHeight,
    gridRowHeight,
    gridTopPad,
    gridBottomPad,
    gridVertGap,
    gridOverscan
  ]);

  if (items.length === 0) {
    const emptyText =
      emptyMessage ||
      (mediaType === 'movie'
        ? (isRtl ? 'لا توجد أفلام متاحة' : 'No movies available')
        : mediaType === 'series'
        ? (isRtl ? 'لا توجد مسلسلات متاحة' : 'No series available')
        : (isRtl ? 'لا توجد قنوات متاحة' : 'No channels available'));

    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center text-zinc-500">
        <Film size={36} className="mb-2 opacity-40 text-gold" />
        <span className="text-xs font-medium">{emptyText}</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      data-channel-list-container="true"
      data-column-count={isVodGrid ? activeCols : 1}
      style={{ contain: 'layout style' }}
      className="relative w-full h-full overflow-y-auto overflow-x-hidden no-scrollbar outline-none"
    >
      {isVodGrid ? (
        <div
          style={{
            height: `${gridVirtualBounds.totalHeight}px`,
            position: 'relative',
            width: '100%'
          }}
          className="outline-none ring-0 border-0"
        >
          {gridVirtualBounds.visibleRows.map(row => (
            <div
              key={`row-${row.rowIndex}`}
              style={{
                position: 'absolute',
                top: `${row.top}px`,
                left: 0,
                right: 0,
                height: `${gridCardHeight}px`,
                display: 'grid',
                gridTemplateColumns: `repeat(${activeCols}, ${gridCardWidth}px)`,
                justifyContent: 'center',
                gap: `${gridHorizGap}px`,
                padding: `0 ${gridHorizPad}px`,
                overflow: 'visible'
              }}
            >
              {row.rowItems.map(({ item: ch, originalIndex: idx }) => (
                <VodPosterCard
                  key={`${ch.stream_id}-${idx}`}
                  ch={ch}
                  idx={idx}
                  isSelected={
                    selectedChannelId === ch.stream_id ||
                    activePlayingMovieId === ch.stream_id
                  }
                  isRtl={isRtl}
                  mediaType={mediaType as 'movie' | 'series'}
                  deferImageLoad={isFastScrolling}
                  posterHeight={posterHeight}
                  showTitle={Boolean(showPosterTitles)}
                  onSelectChannel={onSelectChannel}
                  onFocusChannel={onFocusChannel}
                  fetchMediaDetails={fetchMediaDetails}
                />
              ))}
            </div>
          ))}
        </div>
      ) : isVodList ? (
        <div
          style={{
            height: `${listVirtualBounds.totalHeight}px`,
            position: 'relative',
            width: '100%'
          }}
          className="outline-none ring-0 border-0"
        >
          {listVirtualBounds.visibleItems.map(({ item: ch, originalIndex: idx, top }) => (
            <VodListRow
              key={`${ch.stream_id}-${idx}`}
              ch={ch}
              idx={idx}
              top={top}
              isSelected={
                selectedChannelId === ch.stream_id ||
                activePlayingMovieId === ch.stream_id
              }
              isRtl={isRtl}
              mediaType={mediaType as 'movie' | 'series'}
              onSelectChannel={onSelectChannel}
              onFocusChannel={onFocusChannel}
              fetchMediaDetails={fetchMediaDetails}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            height: `${listVirtualBounds.totalHeight}px`,
            position: 'relative',
            width: '100%'
          }}
          className="outline-none ring-0 border-0"
        >
          {listVirtualBounds.visibleItems.map(({ item: ch, originalIndex: idx, top }) => (
            <LiveChannelRow
              key={`${ch.stream_id}-${idx}`}
              ch={ch}
              idx={idx}
              top={top}
              isSelected={selectedChannelId === ch.stream_id}
              isRtl={isRtl}
              mediaType={mediaType}
              onSelectChannel={onSelectChannel}
              onDoubleClickChannel={onDoubleClickChannel}
              onHighlightChannel={onHighlightChannel}
              onReorderChannel={onReorderChannel}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export default VirtualizedChannelList;
