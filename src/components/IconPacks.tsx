// Original path: src/components/IconPacks.tsx
import React, { useId } from 'react';
import { IconDisplayMode, IconPackId, FrameShapeId, AppSettings } from '../types';
import { normalizeIconPackId, normalizeFrameShapeId } from '../utils/themeManager';
import { isTVOrLowEndDevice } from '../utils/tvNavigation';
import {
  StyledIconProps,
  LiveTVIconStyle2,
  MoviesIconStyle2,
  SeriesIconStyle2,
  PlaylistIconStyle2,
  SettingsIconStyle2,
  LiveTVIconStyle3,
  MoviesIconStyle3,
  SeriesIconStyle3,
  PlaylistIconStyle3,
  SettingsIconStyle3,
  LiveTVIconStyle4,
  MoviesIconStyle4,
  SeriesIconStyle4,
  PlaylistIconStyle4,
  SettingsIconStyle4,
  LiveTVIconStyle5,
  MoviesIconStyle5,
  SeriesIconStyle5,
  PlaylistIconStyle5,
  SettingsIconStyle5,
  LiveTVIconStyle6,
  MoviesIconStyle6,
  SeriesIconStyle6,
  PlaylistIconStyle6,
  SettingsIconStyle6,
  LiveTVIconStyle7,
  MoviesIconStyle7,
  SeriesIconStyle7,
  PlaylistIconStyle7,
  SettingsIconStyle7,
  LiveTVIconStyle8,
  MoviesIconStyle8,
  SeriesIconStyle8,
  PlaylistIconStyle8,
  SettingsIconStyle8,
  LiveTVIconStyle9,
  MoviesIconStyle9,
  SeriesIconStyle9,
  PlaylistIconStyle9,
  SettingsIconStyle9,
  LiveTVIconStyle10,
  MoviesIconStyle10,
  SeriesIconStyle10,
  PlaylistIconStyle10,
  SettingsIconStyle10,
} from './iconStyles';

export type SectionIconKind = 'live' | 'movies' | 'series' | 'add' | 'settings';

export const ICON_PX_MAP: Record<NonNullable<AppSettings['iconScale']>, number> = {
  xs: 26,
  sm: 32,
  md: 40,
  lg: 48,
  xl: 58,
  '2xl': 68,
  '3xl': 80,
};

export const FRAME_PX_MAP: Record<NonNullable<AppSettings['frameScale']>, number> = {
  xs: 48,
  sm: 58,
  md: 72,
  lg: 86,
  xl: 102,
  '2xl': 118,
  '3xl': 136,
};

const STYLE_2_TO_10_MAP: Record<string, Record<SectionIconKind, React.ComponentType<StyledIconProps>>> = {
  'pack-sculpted-3d': {
    live: LiveTVIconStyle2,
    movies: MoviesIconStyle2,
    series: SeriesIconStyle2,
    add: PlaylistIconStyle2,
    settings: SettingsIconStyle2,
  },
  'pack-luxury-engraved': {
    live: LiveTVIconStyle3,
    movies: MoviesIconStyle3,
    series: SeriesIconStyle3,
    add: PlaylistIconStyle3,
    settings: SettingsIconStyle3,
  },
  'pack-neon-line': {
    live: LiveTVIconStyle4,
    movies: MoviesIconStyle4,
    series: SeriesIconStyle4,
    add: PlaylistIconStyle4,
    settings: SettingsIconStyle4,
  },
  'pack-geometric-modern': {
    live: LiveTVIconStyle5,
    movies: MoviesIconStyle5,
    series: SeriesIconStyle5,
    add: PlaylistIconStyle5,
    settings: SettingsIconStyle5,
  },
  'pack-art-deco': {
    live: LiveTVIconStyle6,
    movies: MoviesIconStyle6,
    series: SeriesIconStyle6,
    add: PlaylistIconStyle6,
    settings: SettingsIconStyle6,
  },
  'pack-crystal-gold': {
    live: LiveTVIconStyle7,
    movies: MoviesIconStyle7,
    series: SeriesIconStyle7,
    add: PlaylistIconStyle7,
    settings: SettingsIconStyle7,
  },
  'pack-brushed-metal': {
    live: LiveTVIconStyle8,
    movies: MoviesIconStyle8,
    series: SeriesIconStyle8,
    add: PlaylistIconStyle8,
    settings: SettingsIconStyle8,
  },
  'pack-minimal-premium': {
    live: LiveTVIconStyle9,
    movies: MoviesIconStyle9,
    series: SeriesIconStyle9,
    add: PlaylistIconStyle9,
    settings: SettingsIconStyle9,
  },
  'pack-futuristic-tech': {
    live: LiveTVIconStyle10,
    movies: MoviesIconStyle10,
    series: SeriesIconStyle10,
    add: PlaylistIconStyle10,
    settings: SettingsIconStyle10,
  },
};

/**
 * Style 1 (pack-3d) — Preserved 100% verbatim from the original AchourTV artwork.
 */
function Style1Classic3DIcon({
  kind,
  sizePx = 42,
  className = '',
}: {
  kind: SectionIconKind;
  sizePx?: number;
  className?: string;
}) {
  const rawId = useId().replace(/:/g, '');
  const gMain = `gMain_${rawId}`;
  const gSub = `gSub_${rawId}`;

  const fillBody = `url(#${gMain})`;
  const fillSub = `url(#${gSub})`;
  const fillAccent = 'var(--theme-accent, #F5E6A8)';
  const fillDark = '#0C0F18';
  const strokeMain = 'var(--theme-accent, #F5E6A8)';
  const strokeAccent = '#FFFFFF';
  const sw = 1.7;

  const renderGlyph = () => {
    if (kind === 'live') {
      return (
        <g>
          <path d="M16 6L24 14L32 6" fill="none" stroke={strokeAccent} strokeWidth={sw + 0.4} strokeLinecap="round" strokeLinejoin="round" />
          <rect x="5" y="14" width="38" height="23" rx="4" fill={fillBody} stroke={strokeMain} strokeWidth={sw} />
          <rect x="9" y="18" width="22" height="15" rx="2" fill={fillDark} stroke={strokeAccent} strokeWidth={1.2} />
          <circle cx="36" cy="21" r="1.6" fill={fillAccent} />
          <circle cx="36" cy="27" r="1.6" fill={fillAccent} />
          <polygon points="17,23 23,25.5 17,28" fill={fillAccent} />
          <path d="M15 37H33" stroke={strokeMain} strokeWidth={sw} strokeLinecap="round" />
        </g>
      );
    }
    if (kind === 'movies') {
      return (
        <g>
          <rect x="6" y="17" width="26" height="20" rx="4" fill={fillBody} stroke={strokeMain} strokeWidth={sw} />
          <circle cx="13" cy="11" r="5.5" fill={fillSub} stroke={strokeAccent} strokeWidth={sw * 0.9} />
          <circle cx="25.5" cy="11" r="5.5" fill={fillSub} stroke={strokeAccent} strokeWidth={sw * 0.9} />
          <circle cx="13" cy="11" r="1.9" fill={fillDark} />
          <circle cx="25.5" cy="11" r="1.9" fill={fillDark} />
          <path d="M32 22L42 17V34L32 29V22Z" fill={fillSub} stroke={strokeMain} strokeWidth={sw} strokeLinejoin="round" />
          <polygon points="16,22.5 23.5,27 16,31.5" fill={fillDark} stroke={strokeAccent} strokeWidth={1.3} />
        </g>
      );
    }
    if (kind === 'series') {
      return (
        <g>
          <rect x="7" y="10.5" width="34" height="24" rx="4.2" fill={fillBody} stroke={strokeMain} strokeWidth={sw} />
          <rect x="10.5" y="14" width="27" height="17" rx="2.4" fill={fillDark} />
          <polygon points="20.5,18 29,22.5 20.5,27" fill={fillAccent} stroke={strokeAccent} strokeWidth={1.3} />
          <path d="M18 39.5H30L32 34.5H16L18 39.5Z" fill={fillBody} />
        </g>
      );
    }
    if (kind === 'add') {
      return (
        <g>
          <rect x="6" y="10" width="28" height="6" rx="2.5" fill={fillBody} stroke={strokeMain} strokeWidth={1} />
          <rect x="6" y="19.5" width="23" height="6" rx="2.5" fill={fillBody} stroke={strokeMain} strokeWidth={1} />
          <rect x="6" y="29" width="19" height="6" rx="2.5" fill={fillSub} stroke={strokeAccent} strokeWidth={1} />
          <circle cx="34.5" cy="31" r="8.2" fill={fillBody} stroke={strokeMain} strokeWidth={sw * 0.9} />
          <path d="M34.5 27V35M30.5 31H38.5" stroke="#0A0D14" strokeWidth="2.6" strokeLinecap="round" />
        </g>
      );
    }
    return (
      <g>
        <path
          d="M21 6H27L28.2 10.2C29.4 10.6 30.5 11.2 31.5 12L35.4 10L39.6 14.2L37.6 18.1C38.4 19.1 39 20.2 39.4 21.4L43.5 22.6V28.6L39.4 29.8C39 31 38.4 32.1 37.6 33.1L39.6 37L35.4 41.2L31.5 39.2C30.5 40 29.4 40.6 28.2 41L27 45H21L19.8 41C18.6 40.6 17.5 40 16.5 39.2L12.6 41.2L8.4 37L10.4 33.1C9.6 32.1 9 31 8.6 29.8L4.5 28.6V22.6L8.6 21.4C9 20.2 9.6 19.1 10.4 18.1L8.4 14.2L12.6 10L16.5 12C17.5 11.2 18.6 10.6 19.8 10.2L21 6Z"
          fill={fillBody}
          stroke={strokeMain}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
        <circle cx="24" cy="25.5" r="7.2" fill={fillDark} stroke={strokeAccent} strokeWidth={1.6} />
        <circle cx="24" cy="25.5" r="3" fill={fillAccent} />
      </g>
    );
  };

  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible achour-icon-svg ${className}`}
    >
      <defs>
        <linearGradient id={gMain} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--theme-accent, #F5E6A8)" />
          <stop offset="48%" stopColor="var(--theme-primary, #D4AF37)" />
          <stop offset="100%" stopColor="var(--theme-secondary, #8C6A1D)" />
        </linearGradient>
        <linearGradient id={gSub} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--theme-secondary, #8C6A1D)" />
          <stop offset="55%" stopColor="var(--theme-primary, #D4AF37)" />
          <stop offset="100%" stopColor="var(--theme-accent, #F5E6A8)" />
        </linearGradient>
      </defs>
      <g>{renderGlyph()}</g>
    </svg>
  );
}

/**
 * Renders Style 1 (original) or any of the 9 new independent Icon Styles (Styles 2-10).
 */
export function PackIconSvg({
  kind,
  pack,
  sizePx = 42,
  className = '',
}: {
  kind: SectionIconKind;
  pack: IconPackId;
  sizePx?: number;
  className?: string;
}) {
  const normId = normalizeIconPackId(pack);
  const styleSet = STYLE_2_TO_10_MAP[normId];
  if (styleSet) {
    const IconComp = styleSet[kind];
    return <IconComp sizePx={sizePx} className={className} />;
  }
  return <Style1Classic3DIcon kind={kind} sizePx={sizePx} className={className} />;
}

/**
 * Renders Option 1 (Icons Only vs With Frames), Option 2 (Any of 10 Icon Packs),
 * and Option 3 (Any of 40 Independent Frame Shapes) combinably with Glass Opacity & Blur!
 */
export function DashboardSectionIcon({
  kind,
  displayMode,
  iconPack,
  frameShape,
  iconScale = 'md',
  frameScale = 'md',
  glassOpacity = 16,
  glassBlur = 10,
  sizeOverridePx,
  frameSizeOverridePx,
  isHero = false,
}: {
  kind: SectionIconKind;
  displayMode: IconDisplayMode;
  iconPack: IconPackId;
  frameShape: FrameShapeId;
  iconScale?: AppSettings['iconScale'];
  frameScale?: AppSettings['frameScale'];
  glassOpacity?: number;
  glassBlur?: number;
  sizeOverridePx?: number;
  frameSizeOverridePx?: number;
  isHero?: boolean;
}) {
  const baseIconPx = sizeOverridePx ?? (ICON_PX_MAP[iconScale || 'md'] || 40);
  const iconPx = isHero ? Math.round(baseIconPx * 1.18) : baseIconPx;
  const resolvedPack = normalizeIconPackId(iconPack);

  const frameMetalId = `achourFrameMetal_${useId().replace(/:/g, '')}`;
  const isTvPerf = isTVOrLowEndDevice();

  // OPTION 1: ICONS ONLY — Zero frames, zero borders, zero background containers
  if (displayMode === 'icons-only') {
    return (
      <div className="dashboard-icon-wrap flex items-center justify-center bg-transparent border-0 shadow-none transition-transform duration-150 group-hover:scale-110">
        <PackIconSvg kind={kind} pack={resolvedPack} sizePx={iconPx} />
      </div>
    );
  }

  // OPTION 1 + 3: ICONS WITH INDEPENDENT FRAME SHAPE (40 distinct shapes)
  const resolvedShape = normalizeFrameShapeId(frameShape);
  const baseFramePx = frameSizeOverridePx ?? (FRAME_PX_MAP[frameScale || 'md'] || 72);
  const framePx = Math.max(iconPx + 14, isHero ? Math.round(baseFramePx * 1.14) : baseFramePx);
  const alpha = Math.max(0.02, Math.min(0.85, (glassOpacity ?? 16) / 100));
  const blurPx = isTvPerf ? 0 : Math.max(0, Math.min(24, glassBlur ?? 10));
  const innerIconPx = Math.min(iconPx, Math.round(framePx * 0.6));

  const interiorGlassStyle: React.CSSProperties = {
    backgroundColor: `rgba(14, 18, 28, ${Math.min(0.88, alpha + 0.08)})`,
    ...(blurPx > 0
      ? {
          backdropFilter: `blur(${blurPx}px)`,
          WebkitBackdropFilter: `blur(${blurPx}px)`,
        }
      : {}),
  };

  const renderSvgFrame = (
    children: React.ReactNode,
    scaleInner = 0.6
  ) => (
    <div
      data-frame-kind="svg"
      className="dashboard-frame-wrap relative flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-105"
      style={{ width: framePx, height: framePx }}
    >
      <svg viewBox="0 0 100 100" className="dashboard-frame-svg absolute inset-0 w-full h-full pointer-events-none overflow-visible">
        <defs>
          <linearGradient id={frameMetalId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--theme-secondary, #8C6A1D)" />
            <stop offset="35%" stopColor="var(--theme-primary, #D4AF37)" />
            <stop offset="60%" stopColor="var(--theme-accent, #F5E6A8)" />
            <stop offset="100%" stopColor="var(--theme-secondary, #8C6A1D)" />
          </linearGradient>
        </defs>
        {children}
      </svg>
      <div className="relative z-10 flex items-center justify-center">
        <PackIconSvg
          kind={kind}
          pack={resolvedPack}
          sizePx={Math.min(iconPx, Math.round(framePx * scaleInner))}
        />
      </div>
    </div>
  );

  // SVG Geometric Frames (All crisp and responsive)
  switch (resolvedShape) {
    case 'hexagon':
      return renderSvgFrame(
        <>
          <polygon
            points="50,3 93,26 93,74 50,97 7,74 7,26"
            fill={`rgba(14, 18, 28, ${alpha})`}
            stroke="var(--theme-primary, #D4AF37)"
            strokeWidth="3.2"
          />
          <polygon
            points="50,9 87,29 87,71 50,91 13,71 13,29"
            fill="none"
            stroke="var(--theme-accent, #F5E6A8)"
            strokeOpacity="0.35"
            strokeWidth="1.2"
          />
        </>
      );

    case 'geometric':
      return renderSvgFrame(
        <>
          <polygon
            points="24,4 76,4 96,24 96,76 76,96 24,96 4,76 4,24"
            fill={`rgba(14, 18, 28, ${alpha})`}
            stroke="var(--theme-primary, #D4AF37)"
            strokeWidth="3.2"
          />
          <polyline points="14,32 14,14 32,14" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="2.2" />
          <polyline points="86,68 86,86 68,86" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="2.2" />
        </>
      );

    case 'frame-07': // Double Orbital Ring
      return renderSvgFrame(
        <>
          <circle cx="50" cy="50" r="46" fill={`rgba(12,16,26,${alpha})`} stroke="var(--theme-primary, #D4AF37)" strokeWidth="2.8" />
          <circle cx="50" cy="50" r="39" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeOpacity="0.65" strokeWidth="1.4" />
        </>,
        0.56
      );

    case 'frame-08': // Wide Flat Hexagon
      return renderSvgFrame(
        <polygon
          points="26,7 74,7 96,50 74,93 26,93 4,50"
          fill={`rgba(14,18,28,${alpha})`}
          stroke="var(--theme-primary, #D4AF37)"
          strokeWidth="3.2"
        />
      );

    case 'frame-09': // Diamond Rhombus
      return renderSvgFrame(
        <>
          <polygon points="50,3 97,50 50,97 3,50" fill={`rgba(14,18,28,${alpha})`} stroke="var(--theme-primary, #D4AF37)" strokeWidth="3.2" />
          <polygon points="50,11 89,50 50,89 11,50" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeOpacity="0.4" strokeWidth="1.2" />
        </>,
        0.52
      );

    case 'frame-10': // Heraldic Shield
      return renderSvgFrame(
        <>
          <path
            d="M12 8 H88 V47 C88 73 67 88 50 95 C33 88 12 73 12 47 Z"
            fill={`rgba(14,18,28,${alpha})`}
            stroke="var(--theme-primary, #D4AF37)"
            strokeWidth="3.2"
            strokeLinejoin="round"
          />
          <path
            d="M18 14 H82 V47 C82 69 64 81 50 88 C36 81 18 69 18 47 Z"
            fill="none"
            stroke="var(--theme-accent, #F5E6A8)"
            strokeOpacity="0.32"
            strokeWidth="1.2"
          />
        </>,
        0.55
      );

    case 'frame-11': // Cathedral Arch
      return renderSvgFrame(
        <path
          d="M12 93 V46 A38 38 0 0 1 88 46 V93 Z"
          fill={`rgba(14,18,28,${alpha})`}
          stroke="var(--theme-primary, #D4AF37)"
          strokeWidth="3.2"
          strokeLinejoin="round"
        />,
        0.56
      );

    case 'frame-12': // Crown Pentagon
      return renderSvgFrame(
        <polygon
          points="50,4 95,37 78,94 22,94 5,37"
          fill={`rgba(14,18,28,${alpha})`}
          stroke="var(--theme-primary, #D4AF37)"
          strokeWidth="3.2"
          strokeLinejoin="round"
        />,
        0.56
      );

    case 'frame-16': // Starburst 12-Point Seal
      return renderSvgFrame(
        <>
          <polygon
            points="50,3 61,13 76,9 80,24 94,30 89,45 97,57 86,69 87,84 72,87 63,97 50,91 37,97 28,87 13,84 14,69 3,57 11,45 6,30 20,24 24,9 39,13"
            fill={`rgba(14,18,28,${alpha})`}
            stroke="var(--theme-primary, #D4AF37)"
            strokeWidth="2.8"
            strokeLinejoin="round"
          />
          <circle cx="50" cy="50" r="34" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeOpacity="0.35" strokeWidth="1.2" />
        </>,
        0.52
      );

    case 'frame-17': // Stepped Art Deco Cross Corner
      return renderSvgFrame(
        <polygon
          points="16,4 84,4 84,16 96,16 96,84 84,84 84,96 16,96 16,84 4,84 4,16 16,16"
          fill={`rgba(14,18,28,${alpha})`}
          stroke="var(--theme-primary, #D4AF37)"
          strokeWidth="3"
        />,
        0.56
      );

    case 'frame-18': // Cinema Ticket Stub
      return renderSvgFrame(
        <path
          d="M8 10 H92 V38 A12 12 0 0 0 92 62 V90 H8 V62 A12 12 0 0 0 8 38 Z"
          fill={`rgba(14,18,28,${alpha})`}
          stroke="var(--theme-primary, #D4AF37)"
          strokeWidth="3.2"
          strokeLinejoin="round"
        />,
        0.56
      );

    case 'frame-19': // Telemetry Radar Ring
      return renderSvgFrame(
        <>
          <circle cx="50" cy="50" r="46" fill="none" stroke="var(--theme-primary, #D4AF37)" strokeWidth="3.2" strokeDasharray="18 8" />
          <circle cx="50" cy="50" r="38" fill={`rgba(14,18,28,${alpha})`} stroke="var(--theme-accent, #F5E6A8)" strokeOpacity="0.55" strokeWidth="1.5" />
        </>,
        0.56
      );

    case 'frame-21': // Side Caliper Bracket Arcs
      return renderSvgFrame(
        <>
          <rect x="14" y="10" width="72" height="80" rx="18" fill={`rgba(14,18,28,${alpha})`} />
          <path d="M24 10 C8 16 4 32 4 50 C4 68 8 84 24 90" fill="none" stroke="var(--theme-primary, #D4AF37)" strokeWidth="4" strokeLinecap="round" />
          <path d="M76 10 C92 16 96 32 96 50 C96 68 92 84 76 90" fill="none" stroke="var(--theme-primary, #D4AF37)" strokeWidth="4" strokeLinecap="round" />
        </>,
        0.58
      );

    case 'frame-25': // Blueprint Twin Line Square
      return renderSvgFrame(
        <>
          <rect x="6" y="6" width="88" height="88" rx="10" fill={`rgba(14,18,28,${alpha})`} stroke="var(--theme-primary, #D4AF37)" strokeWidth="2.2" />
          <rect x="13" y="13" width="74" height="74" rx="6" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.4" strokeDasharray="6 4" />
        </>,
        0.56
      );

    case 'frame-26': // Viewfinder L-Corners Only
      return renderSvgFrame(
        <>
          <rect x="8" y="8" width="84" height="84" rx="12" fill={`rgba(14,18,28,${Math.max(0.04, alpha * 0.6)})`} />
          <polyline points="6,28 6,6 28,6" fill="none" stroke="var(--theme-primary, #D4AF37)" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="72,6 94,6 94,28" fill="none" stroke="var(--theme-primary, #D4AF37)" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="6,72 6,94 28,94" fill="none" stroke="var(--theme-primary, #D4AF37)" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="72,94 94,94 94,72" fill="none" stroke="var(--theme-primary, #D4AF37)" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );

    case 'frame-27': // Frosted Glass Hexagon
      return (
        <div
          data-frame-kind="svg"
          className="dashboard-frame-wrap relative flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-105"
          style={{ width: framePx, height: framePx }}
        >
          <svg viewBox="0 0 100 100" className="dashboard-frame-svg absolute inset-0 w-full h-full pointer-events-none overflow-visible">
            <polygon
              points="50,3 93,26 93,74 50,97 7,74 7,26"
              fill={`rgba(255,255,255,${Math.min(0.32, alpha + 0.08)})`}
              stroke="rgba(255,255,255,0.55)"
              strokeWidth="2.8"
            />
            <line x1="18" y1="30" x2="48" y2="12" stroke="#FFFFFF" strokeOpacity="0.6" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          <div className="relative z-10 flex items-center justify-center">
            <PackIconSvg kind={kind} pack={resolvedPack} sizePx={innerIconPx} />
          </div>
        </div>
      );

    case 'frame-29': // Metallic Coin Circle
      return renderSvgFrame(
        <>
          <circle cx="50" cy="50" r="46" fill={`rgba(14,18,28,${Math.max(0.55, alpha)})`} stroke={`url(#${frameMetalId})`} strokeWidth="6" />
          <circle cx="50" cy="50" r="39" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.2" strokeDasharray="3 2" />
        </>,
        0.58
      );

    case 'frame-30': // Metallic Hex Crest
      return renderSvgFrame(
        <>
          <polygon points="50,3 93,26 93,74 50,97 7,74 7,26" fill={`rgba(12,15,24,${Math.max(0.55, alpha)})`} stroke={`url(#${frameMetalId})`} strokeWidth="5.2" />
          <polygon points="50,11 86,30 86,70 50,89 14,70 14,30" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.2" />
        </>,
        0.58
      );

    case 'frame-31': // Metallic Armor Shield
      return renderSvgFrame(
        <>
          <path
            d="M11 8 H89 V47 C89 74 68 89 50 96 C32 89 11 74 11 47 Z"
            fill={`rgba(12,14,22,${Math.max(0.55, alpha)})`}
            stroke={`url(#${frameMetalId})`}
            strokeWidth="5"
            strokeLinejoin="round"
          />
        </>,
        0.55
      );

    case 'frame-34': // Crown Notched Slate
      return renderSvgFrame(
        <polygon
          points="20,5 80,5 95,22 95,93 5,93 5,22"
          fill={`rgba(14,18,28,${alpha})`}
          stroke="var(--theme-primary, #D4AF37)"
          strokeWidth="3.2"
          strokeLinejoin="round"
        />,
        0.58
      );

    case 'frame-37': // 10-Sided Decagon Jewel Cut
      return renderSvgFrame(
        <>
          <polygon
            points="50,4 78,13 95,36 95,64 78,87 50,96 22,87 5,64 5,36 22,13"
            fill={`rgba(14,18,28,${alpha})`}
            stroke="var(--theme-primary, #D4AF37)"
            strokeWidth="3.2"
          />
          <polygon
            points="50,12 74,20 87,39 87,61 74,80 50,88 26,80 13,61 13,39 26,20"
            fill="none"
            stroke="var(--theme-accent, #F5E6A8)"
            strokeOpacity="0.4"
            strokeWidth="1.2"
          />
        </>,
        0.56
      );

    case 'frame-39': // Aerodynamic Trapezoid Cut Badge
      return renderSvgFrame(
        <polygon
          points="18,8 82,8 96,90 4,90"
          fill={`rgba(14,18,28,${alpha})`}
          stroke="var(--theme-primary, #D4AF37)"
          strokeWidth="3.2"
          strokeLinejoin="round"
        />,
        0.54
      );
  }

  // CSS / Box Architectural Frames
  if (resolvedShape === 'metallic') {
    return (
      <div
        data-frame-kind="box"
        className="dashboard-frame-wrap relative flex items-center justify-center shrink-0 rounded-2xl p-[2.5px] transition-transform duration-150 group-hover:scale-105 shadow-[0_10px_24px_rgba(0,0,0,0.45)]"
        style={{
          width: framePx,
          height: framePx,
          background: 'var(--theme-metallic-grad, linear-gradient(135deg, #8C6A1D 0%, #D4AF37 35%, #F5E6A8 58%, #B8860B 84%, #8C6A1D 100%))',
        }}
      >
        <div
          className="w-full h-full rounded-[13.5px] flex items-center justify-center border border-white/15"
          style={{
            background: `linear-gradient(160deg, rgba(24,26,34,${Math.max(0.45, alpha)}) 0%, rgba(10,12,18,${Math.max(0.6, alpha + 0.12)}) 100%)`,
          }}
        >
          <PackIconSvg kind={kind} pack={resolvedPack} sizePx={innerIconPx} />
        </div>
      </div>
    );
  }

  if (resolvedShape === 'glass' || resolvedShape === 'frame-28') {
    const isSphere = resolvedShape === 'frame-28';
    return (
      <div
        data-frame-kind="box"
        data-achour-glass="true"
        className={`dashboard-frame-wrap relative flex items-center justify-center shrink-0 border border-white/30 transition-transform duration-150 group-hover:scale-105 shadow-[0_10px_28px_rgba(0,0,0,0.28),inset_0_1px_1px_rgba(255,255,255,0.45)] overflow-hidden ${
          isSphere ? 'rounded-full' : 'rounded-[26%]'
        }`}
        style={{
          width: framePx,
          height: framePx,
          background: `linear-gradient(145deg, rgba(255,255,255,${Math.min(0.32, alpha * 0.8 + 0.08)}) 0%, rgba(255,255,255,${Math.max(0.02, alpha * 0.3)}) 100%)`,
          ...(blurPx > 0
            ? {
                backdropFilter: `blur(${blurPx}px)`,
                WebkitBackdropFilter: `blur(${blurPx}px)`,
              }
            : {}),
        }}
      >
        <div className="pointer-events-none absolute -top-1/2 -left-1/2 w-[140%] h-[90%] rotate-[-25deg] bg-gradient-to-b from-white/25 to-transparent" />
        <div className="relative z-10 flex items-center justify-center">
          <PackIconSvg kind={kind} pack={resolvedPack} sizePx={innerIconPx} />
        </div>
      </div>
    );
  }

  if (resolvedShape === 'circle') {
    return (
      <div
        data-frame-kind="box"
        data-achour-glass="true"
        className="dashboard-frame-wrap relative flex items-center justify-center shrink-0 rounded-full border-2 transition-transform duration-150 group-hover:scale-105 shadow-[0_8px_22px_rgba(0,0,0,0.35)]"
        style={{
          width: framePx,
          height: framePx,
          borderColor: 'var(--theme-primary, #D4AF37)',
          boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.12), 0 8px 22px rgba(0,0,0,0.35)',
          ...interiorGlassStyle,
        }}
      >
        <PackIconSvg kind={kind} pack={resolvedPack} sizePx={innerIconPx} />
      </div>
    );
  }

  if (resolvedShape === 'frame-13') {
    // Stadium Pill Capsule
    return (
      <div
        data-frame-kind="box"
        data-achour-glass="true"
        className="dashboard-frame-wrap relative flex items-center justify-center shrink-0 rounded-full border-2 transition-transform duration-150 group-hover:scale-105"
        style={{
          width: Math.round(framePx * 1.18),
          height: Math.round(framePx * 0.88),
          borderColor: 'var(--theme-primary, #D4AF37)',
          ...interiorGlassStyle,
        }}
      >
        <PackIconSvg kind={kind} pack={resolvedPack} sizePx={Math.min(innerIconPx, Math.round(framePx * 0.56))} />
      </div>
    );
  }

  if (resolvedShape === 'frame-14' || resolvedShape === 'frame-15') {
    // Diagonal Leaf Left / Blade Right
    return (
      <div
        data-frame-kind="box"
        data-achour-glass="true"
        className="dashboard-frame-wrap relative flex items-center justify-center shrink-0 border-2 transition-transform duration-150 group-hover:scale-105 shadow-[0_8px_22px_rgba(0,0,0,0.35)]"
        style={{
          width: framePx,
          height: framePx,
          borderRadius: resolvedShape === 'frame-14' ? '44% 10% 44% 10%' : '10% 44% 10% 44%',
          borderColor: 'var(--theme-primary, #D4AF37)',
          ...interiorGlassStyle,
        }}
      >
        <PackIconSvg kind={kind} pack={resolvedPack} sizePx={innerIconPx} />
      </div>
    );
  }

  if (resolvedShape === 'frame-20') {
    // Top-Bottom Rail Brackets
    return (
      <div
        data-frame-kind="box"
        data-achour-glass="true"
        className="dashboard-frame-wrap relative flex items-center justify-center shrink-0 border-y-[3px] border-x-0 rounded-xl transition-transform duration-150 group-hover:scale-105"
        style={{
          width: framePx,
          height: framePx,
          borderColor: 'var(--theme-primary, #D4AF37)',
          ...interiorGlassStyle,
        }}
      >
        <PackIconSvg kind={kind} pack={resolvedPack} sizePx={innerIconPx} />
      </div>
    );
  }

  if (resolvedShape === 'frame-22' || resolvedShape === 'frame-38') {
    // Electric Neon Ring / Soft Neon Squircle
    const isCircle = resolvedShape === 'frame-22';
    return (
      <div
        data-frame-kind="box"
        className={`dashboard-frame-wrap relative flex items-center justify-center shrink-0 border-2 transition-transform duration-150 group-hover:scale-105 ${
          isCircle ? 'rounded-full' : 'rounded-[28%]'
        }`}
        style={{
          width: framePx,
          height: framePx,
          borderColor: 'var(--theme-primary, #D4AF37)',
          boxShadow: isTvPerf ? 'none' : '0 0 20px var(--theme-glow, rgba(212,175,55,0.6)), inset 0 0 12px var(--theme-glow, rgba(212,175,55,0.35))',
          backgroundColor: `rgba(8, 10, 16, ${Math.max(0.45, alpha)})`,
        }}
      >
        <PackIconSvg kind={kind} pack={resolvedPack} sizePx={innerIconPx} />
      </div>
    );
  }

  if (resolvedShape === 'frame-23') {
    // Cyberpunk Skew Parallelogram
    return (
      <div
        data-frame-kind="box"
        data-achour-glass="true"
        className="dashboard-frame-wrap relative flex items-center justify-center shrink-0 rounded-xl border-2 -skew-x-12 transition-transform duration-150 group-hover:scale-105"
        style={{
          width: framePx,
          height: framePx,
          borderColor: 'var(--theme-primary, #D4AF37)',
          boxShadow: '4px 4px 0 var(--theme-secondary, #8C6A1D)',
          ...interiorGlassStyle,
        }}
      >
        <div className="skew-x-12 flex items-center justify-center">
          <PackIconSvg kind={kind} pack={resolvedPack} sizePx={innerIconPx} />
        </div>
      </div>
    );
  }

  if (resolvedShape === 'frame-24') {
    // Tactile 3D Keycap Cushion
    return (
      <div
        data-frame-kind="box"
        data-achour-glass="true"
        className="dashboard-frame-wrap relative flex items-center justify-center shrink-0 rounded-[26%] border-2 border-b-[6px] transition-transform duration-150 group-hover:scale-105"
        style={{
          width: framePx,
          height: framePx,
          borderColor: 'var(--theme-primary, #D4AF37)',
          borderBottomColor: 'var(--theme-secondary, #8C6A1D)',
          ...interiorGlassStyle,
        }}
      >
        <PackIconSvg kind={kind} pack={resolvedPack} sizePx={innerIconPx} />
      </div>
    );
  }

  if (resolvedShape === 'frame-32') {
    // Carbon Tech Weave Grid
    return (
      <div
        data-frame-kind="box"
        className="dashboard-frame-wrap relative flex items-center justify-center shrink-0 rounded-2xl border-2 transition-transform duration-150 group-hover:scale-105"
        style={{
          width: framePx,
          height: framePx,
          borderColor: 'var(--theme-primary, #D4AF37)',
          backgroundColor: '#12141C',
          backgroundImage:
            'linear-gradient(45deg, rgba(255,255,255,0.05) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.05) 25%, transparent 25%)',
          backgroundSize: '6px 6px',
        }}
      >
        <PackIconSvg kind={kind} pack={resolvedPack} sizePx={innerIconPx} />
      </div>
    );
  }

  if (resolvedShape === 'frame-33') {
    // Obsidian Deep Inset Well
    return (
      <div
        data-frame-kind="box"
        className="dashboard-frame-wrap relative flex items-center justify-center shrink-0 rounded-2xl border transition-transform duration-150 group-hover:scale-105"
        style={{
          width: framePx,
          height: framePx,
          backgroundColor: 'rgba(6, 8, 12, 0.88)',
          borderColor: 'rgba(255,255,255,0.14)',
          boxShadow: 'inset 0 8px 18px rgba(0,0,0,0.85), inset 0 -1px 0 var(--theme-primary, #D4AF37)',
        }}
      >
        <PackIconSvg kind={kind} pack={resolvedPack} sizePx={innerIconPx} />
      </div>
    );
  }

  if (resolvedShape === 'frame-35') {
    // Stacked Triple Deck Cards
    return (
      <div
        data-frame-kind="box"
        data-achour-glass="true"
        className="dashboard-frame-wrap relative flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-105"
        style={{ width: framePx, height: framePx }}
      >
        <div
          className="absolute inset-0 rounded-[22%] border border-white/15 bg-black/50 translate-x-1.5 -translate-y-1.5 rotate-6"
        />
        <div
          className="absolute inset-0 rounded-[22%] border border-white/20 bg-black/60 -translate-x-1 translate-y-1 -rotate-3"
        />
        <div
          className="relative w-full h-full rounded-[22%] border-2 flex items-center justify-center"
          style={{ borderColor: 'var(--theme-primary, #D4AF37)', ...interiorGlassStyle }}
        >
          <PackIconSvg kind={kind} pack={resolvedPack} sizePx={innerIconPx} />
        </div>
      </div>
    );
  }

  if (resolvedShape === 'frame-36') {
    // Radiant Aura Halo
    return (
      <div
        data-frame-kind="box"
        data-achour-glass="true"
        className="dashboard-frame-wrap relative flex items-center justify-center shrink-0 rounded-full p-[3px] transition-transform duration-150 group-hover:scale-105"
        style={{
          width: framePx,
          height: framePx,
          background: 'conic-gradient(from 0deg, var(--theme-primary, #D4AF37), var(--theme-accent, #F5E6A8), var(--theme-secondary, #8C6A1D), var(--theme-primary, #D4AF37))',
          boxShadow: isTvPerf ? 'none' : '0 0 18px var(--theme-glow, rgba(212,175,55,0.5))',
        }}
      >
        <div
          className="w-full h-full rounded-full flex items-center justify-center"
          style={interiorGlassStyle}
        >
          <PackIconSvg kind={kind} pack={resolvedPack} sizePx={innerIconPx} />
        </div>
      </div>
    );
  }

  if (resolvedShape === 'frame-40') {
    // Pearl Satin Dual Bevel
    return (
      <div
        data-frame-kind="box"
        data-achour-glass="true"
        className="dashboard-frame-wrap relative flex items-center justify-center shrink-0 rounded-[26%] border-2 transition-transform duration-150 group-hover:scale-105"
        style={{
          width: framePx,
          height: framePx,
          borderColor: 'var(--theme-accent, #F5E6A8)',
          boxShadow: 'inset 0 0 0 3px var(--theme-primary, #D4AF37), 0 8px 22px rgba(0,0,0,0.45)',
          ...interiorGlassStyle,
        }}
      >
        <PackIconSvg kind={kind} pack={resolvedPack} sizePx={innerIconPx} />
      </div>
    );
  }

  // Default: rounded-square
  return (
    <div
      data-frame-kind="box"
      data-achour-glass="true"
      className="dashboard-frame-wrap relative flex items-center justify-center shrink-0 rounded-[24%] border-2 transition-transform duration-150 group-hover:scale-105 shadow-[0_8px_22px_rgba(0,0,0,0.35)]"
      style={{
        width: framePx,
        height: framePx,
        borderColor: 'var(--theme-primary, #D4AF37)',
        ...interiorGlassStyle,
      }}
    >
      <PackIconSvg kind={kind} pack={resolvedPack} sizePx={innerIconPx} />
    </div>
  );
}
