// Original path: src/components/DashboardLayouts.tsx
import React from 'react';
import { ChevronRight, ChevronLeft, Move } from 'lucide-react';
import {
  Icon3DStyle,
  resolveDesignSettings,
} from '../utils/themeManager';
import {
  AppSettings,
  FrameShapeId,
  IconDisplayMode,
  IconPackId,
  Language,
} from '../types';
import {
  DashboardSectionIcon,
  FRAME_PX_MAP,
  ICON_PX_MAP,
} from './IconPacks';
import { isTVOrLowEndDevice } from '../utils/tvNavigation';

export type DashboardViewTarget = 'live' | 'movies' | 'series' | 'add' | 'settings';
export type IconKind = 'live' | 'movies' | 'series' | 'add' | 'settings';

export interface DashboardLayoutsProps {
  dashboardOrder?: string[];
  iconDisplayMode?: IconDisplayMode;
  iconPack?: IconPackId;
  frameShape?: FrameShapeId;
  active3DStyle?: Icon3DStyle;
  iconSize?: AppSettings['iconScale'];
  frameScale?: AppSettings['frameScale'];
  tileSpacing?: AppSettings['tileSpacing'];
  glassOpacity?: number;
  glassBlur?: number;
  dashboardAlignment?: AppSettings['dashboardAlignment'];
  dashboardHorizontalAlignment?: AppSettings['dashboardHorizontalAlignment'];
  dashboardFocusMode?: AppSettings['dashboardFocusMode'];
  dashboardLabelColorMode?: AppSettings['dashboardLabelColorMode'];
  dashboardLabelCustomColor?: AppSettings['dashboardLabelCustomColor'];
  reorderingKind?: IconKind | null;
  previewMode?: boolean;
  language: Language;
  isRtl: boolean;
  t: (key: any) => string;
  onNavigate: (view: DashboardViewTarget) => void;
  onExit?: () => void;
}

/**
 * Backward-compatible icon wrapper delegating directly to DashboardSectionIcon.
 */
export function StyledAppIcon({
  kind,
  scale = 'md',
  iconSize = 'md',
  frameScale = 'md',
  iconDisplayMode,
  iconPack,
  frameShape,
  active3DStyle,
  glassOpacity,
  glassBlur,
}: {
  kind: IconKind;
  active3DStyle?: Icon3DStyle;
  scale?: 'sm' | 'md' | 'lg' | 'hero';
  iconSize?: AppSettings['iconScale'];
  frameScale?: AppSettings['frameScale'];
  iconDisplayMode?: IconDisplayMode;
  iconPack?: IconPackId;
  frameShape?: FrameShapeId;
  glassOpacity?: number;
  glassBlur?: number;
}) {
  const resolved = resolveDesignSettings({
    iconDisplayMode,
    iconPack,
    frameShape,
    icon3DStyle: active3DStyle?.id,
    glassOpacity,
    glassBlur,
  });

  return (
    <DashboardSectionIcon
      kind={kind}
      displayMode={resolved.iconDisplayMode}
      iconPack={resolved.iconPack}
      frameShape={resolved.frameShape}
      iconScale={iconSize}
      frameScale={frameScale}
      glassOpacity={resolved.glassOpacity}
      glassBlur={resolved.glassBlur}
      isHero={scale === 'hero'}
    />
  );
}

const DEFAULT_ORDER: IconKind[] = ['live', 'movies', 'series', 'add', 'settings'];

const SPACING_PX: Record<NonNullable<AppSettings['tileSpacing']>, number> = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 34,
};

interface SectionItem {
  kind: IconKind;
  label: string;
  subtitle: string;
}

const DashboardLayouts: React.FC<DashboardLayoutsProps> = ({
  dashboardOrder,
  iconDisplayMode,
  iconPack,
  frameShape,
  active3DStyle,
  iconSize = 'md',
  frameScale = 'md',
  tileSpacing = 'md',
  glassOpacity = 16,
  glassBlur = 10,
  dashboardFocusMode = 'frame',
  dashboardLabelColorMode = 'theme',
  dashboardLabelCustomColor = null,
  reorderingKind = null,
  previewMode = false,
  language,
  isRtl,
  t,
  onNavigate,
}) => {
  const resolved = resolveDesignSettings({
    iconDisplayMode,
    iconPack,
    frameShape,
    icon3DStyle: active3DStyle?.id,
    glassOpacity,
    glassBlur,
  });

  const itemMap: Record<IconKind, SectionItem> = {
    live: {
      kind: 'live',
      label: t('live'),
      subtitle: language === 'ar' ? 'القنوات المباشرة' : 'Live TV Channels',
    },
    movies: {
      kind: 'movies',
      label: t('movies'),
      subtitle: language === 'ar' ? 'أفلام سينمائية' : 'Cinema & VOD',
    },
    series: {
      kind: 'series',
      label: t('series'),
      subtitle: language === 'ar' ? 'مسلسلات وحلقات' : 'TV Series & Shows',
    },
    add: {
      kind: 'add',
      label: t('playlist'),
      subtitle: language === 'ar' ? 'قوائم التشغيل' : 'Xtream & M3U Lists',
    },
    settings: {
      kind: 'settings',
      label: t('settings'),
      subtitle: language === 'ar' ? 'التخصيص والنظام' : 'App Preferences',
    },
  };

  const validOrder: IconKind[] = [
    ...(dashboardOrder || []),
    ...DEFAULT_ORDER,
  ].filter(
    (value, index, list): value is IconKind =>
      DEFAULT_ORDER.includes(value as IconKind) && list.indexOf(value) === index
  );

  const slots = validOrder.map((k) => itemMap[k]);
  const [slot0, slot1, slot2, slot3, slot4] = slots;

  const rawGap = SPACING_PX[tileSpacing || 'md'] ?? 16;
  const gapPx = previewMode ? Math.max(4, Math.round(rawGap * 0.56)) : rawGap;

  const baseIconPx = ICON_PX_MAP[iconSize || 'md'] || 40;
  const baseFramePx = FRAME_PX_MAP[frameScale || 'md'] || 72;
  const previewScale = previewMode ? 0.56 : 1;

  const isTvPerf = isTVOrLowEndDevice();
  const surfaceAlpha = Math.max(0.02, Math.min(0.85, (resolved.glassOpacity ?? 16) / 100));
  const surfaceBlur = isTvPerf ? 0 : Math.max(0, Math.min(24, resolved.glassBlur ?? 10));

  const getGlassCardStyle = (emphasized = false): React.CSSProperties => {
    if (resolved.iconDisplayMode === 'icons-only') {
      return {
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        boxShadow: 'none',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
      };
    }
    return {
      backgroundColor: emphasized
        ? `rgba(14, 18, 28, ${Math.min(0.88, surfaceAlpha + 0.08)})`
        : `rgba(12, 16, 26, ${surfaceAlpha})`,
      ...(surfaceBlur > 0
        ? {
            backdropFilter: `blur(${surfaceBlur}px)`,
            WebkitBackdropFilter: `blur(${surfaceBlur}px)`,
          }
        : {}),
      borderColor: emphasized ? 'var(--theme-primary, #D4AF37)' : 'rgba(255,255,255,0.16)',
    };
  };

  type TileMode = 'open' | 'card' | 'wide' | 'row' | 'pill';

  const getLabelColor = (): string => {
    const mode = dashboardLabelColorMode || 'theme';
    if (mode === 'white') return '#FFFFFF';
    if (mode === 'gold') return '#D4AF37';
    if (mode === 'custom' && dashboardLabelCustomColor) return dashboardLabelCustomColor;
    return 'var(--theme-primary, #D4AF37)';
  };

  const renderSectionTile = (
    item: SectionItem,
    {
      mode = 'open',
      isHero = false,
      extraClass = '',
    }: {
      mode?: TileMode;
      isHero?: boolean;
      extraClass?: string;
    } = {}
  ) => {
    const isReorderingThis = !previewMode && reorderingKind === item.kind;
    const isIconsOnly = resolved.iconDisplayMode === 'icons-only';
    const effectiveFocusMode =
      isIconsOnly && (!dashboardFocusMode || dashboardFocusMode === 'frame')
        ? 'label'
        : dashboardFocusMode || 'frame';
    const iconMultiplier = isHero ? 1.15 : mode === 'row' || mode === 'pill' ? 0.82 : 1;
    const computedIconPx = Math.max(15, Math.round(baseIconPx * previewScale * iconMultiplier));
    const computedFramePx = Math.max(
      computedIconPx + 10,
      Math.round(baseFramePx * previewScale * (isHero ? 1.12 : mode === 'row' || mode === 'pill' ? 0.8 : 1))
    );

    const commonProps = previewMode
      ? {
          type: 'button' as const,
          tabIndex: -1,
          'data-dashboard-kind': item.kind,
          'data-dashboard-icons-only': isIconsOnly ? 'true' : 'false',
          'data-dashboard-focus-mode': effectiveFocusMode,
          'data-preview-focused': item.kind === slot0?.kind ? 'true' : undefined,
          onClick: () => onNavigate(item.kind),
        }
      : {
          type: 'button' as const,
          'data-tv-focusable': 'true',
          'data-dashboard-kind': item.kind,
          'data-dashboard-icons-only': isIconsOnly ? 'true' : 'false',
          'data-dashboard-focus-mode': effectiveFocusMode,
          tabIndex: 0,
          onClick: () => onNavigate(item.kind),
        };

    const reorderRing = isReorderingThis
      ? 'ring-2 ring-emerald-400 bg-emerald-500/15 animate-pulse'
      : '';

    const iconNode = (
      <DashboardSectionIcon
        kind={item.kind}
        displayMode={resolved.iconDisplayMode}
        iconPack={resolved.iconPack}
        frameShape={resolved.frameShape}
        iconScale={iconSize}
        frameScale={frameScale}
        glassOpacity={resolved.glassOpacity}
        glassBlur={resolved.glassBlur}
        sizeOverridePx={computedIconPx}
        frameSizeOverridePx={computedFramePx}
        isHero={isHero}
      />
    );

    if (mode === 'pill') {
      return (
        <button
          key={item.kind}
          {...commonProps}
          style={getGlassCardStyle(isHero)}
          className={`group relative flex items-center justify-center gap-2 transition-all duration-150 cursor-pointer select-none ${
            isIconsOnly
              ? 'bg-transparent border-0 shadow-none rounded-full hover:scale-105'
              : 'rounded-full border shadow-[0_8px_22px_rgba(0,0,0,0.35)] hover:border-[var(--theme-primary)]'
          } ${previewMode ? 'px-2.5 py-1.5' : 'px-4 py-2 sm:px-5 sm:py-2.5'} ${reorderRing} ${extraClass}`}
        >
          {iconNode}
          <span
            className={`dashboard-tile-label font-bold transition-all truncate ${
              previewMode ? 'text-[10px]' : 'text-xs sm:text-sm'
            }`}
            style={{ color: getLabelColor() }}
          >
            {item.label}
          </span>
        </button>
      );
    }

    if (mode === 'row' || mode === 'wide') {
      const paddingClass = previewMode
        ? 'px-2.5 py-1.5'
        : mode === 'wide'
        ? 'px-4 py-3.5 sm:px-6 sm:py-5'
        : 'px-3.5 py-2.5 sm:px-5 sm:py-3.5';

      return (
        <button
          key={item.kind}
          {...commonProps}
          style={getGlassCardStyle(isHero)}
          className={`group relative flex items-center justify-between gap-3 w-full transition-all duration-150 cursor-pointer select-none ${
            isIconsOnly
              ? 'bg-transparent border-0 shadow-none rounded-2xl hover:scale-[1.02]'
              : 'rounded-2xl border shadow-[0_10px_28px_rgba(0,0,0,0.34)] hover:border-[var(--theme-primary)]'
          } ${paddingClass} ${reorderRing} ${extraClass}`}
        >
          {isReorderingThis && (
            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-30 px-2 py-0.5 rounded-full bg-emerald-400 text-black text-[9px] font-black flex items-center gap-1 shadow whitespace-nowrap">
              <Move size={10} />
              <span>{isRtl ? 'حرّك بالأسهم' : 'Move'}</span>
            </span>
          )}
          <div className="flex items-center gap-3 min-w-0">
            {iconNode}
            <div className={`min-w-0 ${isRtl ? 'text-right' : 'text-left'}`}>
              <span
                className={`dashboard-tile-label block font-bold tracking-wide transition-all truncate ${
                  previewMode
                    ? 'text-[11px]'
                    : isHero
                    ? 'text-base sm:text-xl'
                    : 'text-sm sm:text-base'
                }`}
                style={{ color: getLabelColor() }}
              >
                {item.label}
              </span>
              {!previewMode && (
                <span className="block text-[11px] sm:text-xs text-zinc-300/80 truncate mt-0.5">
                  {item.subtitle}
                </span>
              )}
            </div>
          </div>
          {!previewMode &&
            (isRtl ? (
              <ChevronLeft size={16} className="text-gold/75 group-hover:text-gold shrink-0" />
            ) : (
              <ChevronRight size={16} className="text-gold/75 group-hover:text-gold shrink-0" />
            ))}
        </button>
      );
    }

    const useCardChrome = mode === 'card' && !isIconsOnly;

    return (
      <button
        key={item.kind}
        {...commonProps}
        style={useCardChrome ? getGlassCardStyle(isHero) : undefined}
        className={`group relative flex flex-col items-center justify-center transition-all duration-150 cursor-pointer select-none ${
          useCardChrome
            ? `rounded-2xl border shadow-[0_10px_26px_rgba(0,0,0,0.34)] hover:border-[var(--theme-primary)] ${
                previewMode ? 'p-2 gap-1.5' : 'p-3 sm:p-4 gap-2 sm:gap-2.5'
              }`
            : `bg-transparent border-0 shadow-none rounded-2xl hover:scale-105 ${
                previewMode ? 'p-1.5 gap-1' : 'p-2 sm:p-3 gap-2'
              }`
        } ${reorderRing} ${extraClass}`}
      >
        {isReorderingThis && (
          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-30 px-2 py-0.5 rounded-full bg-emerald-400 text-black text-[9px] font-black flex items-center gap-1 shadow whitespace-nowrap">
            <Move size={10} />
            <span>{isRtl ? 'حرّك بالأسهم' : 'Move'}</span>
          </span>
        )}
        {iconNode}
        <div className="flex flex-col items-center text-center min-w-0 max-w-full">
          <span
            className={`dashboard-tile-label font-bold tracking-wide transition-transform truncate max-w-full [text-shadow:0_2px_6px_rgba(0,0,0,0.85)] ${
              previewMode
                ? 'text-[10px] leading-tight'
                : isHero
                ? 'text-sm sm:text-base'
                : 'text-xs sm:text-sm'
            }`}
            style={{ color: getLabelColor() }}
          >
            {item.label}
          </span>
          {mode === 'card' && !previewMode && !isIconsOnly && (
            <span className="hidden sm:block text-[10px] text-zinc-300/75 truncate max-w-[140px] mt-0.5">
              {item.subtitle}
            </span>
          )}
        </div>
      </button>
    );
  };

  const containerMax = previewMode ? 'w-full' : 'w-full max-w-6xl mx-auto py-1 sm:py-2';

  // Preserve the current Balanced Dock Row (5 columns) layout verbatim
  return (
    <div className={`${containerMax} grid grid-cols-5 items-center justify-items-center`} style={{ gap: `${gapPx}px` }}>
      {slots.map((item) => renderSectionTile(item, { mode: 'open', extraClass: 'w-full' }))}
    </div>
  );
};

export default React.memo(DashboardLayouts);
