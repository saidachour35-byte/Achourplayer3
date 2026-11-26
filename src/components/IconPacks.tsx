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
  LiveTVIconPack11,
  MoviesIconPack11,
  SeriesIconPack11,
  PlaylistIconPack11,
  SettingsIconPack11,
  LiveTVIconPack12,
  MoviesIconPack12,
  SeriesIconPack12,
  PlaylistIconPack12,
  SettingsIconPack12,
  LiveTVIconPack13,
  MoviesIconPack13,
  SeriesIconPack13,
  PlaylistIconPack13,
  SettingsIconPack13,
  LiveTVIconPack14,
  MoviesIconPack14,
  SeriesIconPack14,
  PlaylistIconPack14,
  SettingsIconPack14,
  LiveTVIconPack15,
  MoviesIconPack15,
  SeriesIconPack15,
  PlaylistIconPack15,
  SettingsIconPack15,
  LiveTVIconPack16,
  MoviesIconPack16,
  SeriesIconPack16,
  PlaylistIconPack16,
  SettingsIconPack16,
  LiveTVIconPack17,
  MoviesIconPack17,
  SeriesIconPack17,
  PlaylistIconPack17,
  SettingsIconPack17,
  LiveTVIconPack18,
  MoviesIconPack18,
  SeriesIconPack18,
  PlaylistIconPack18,
  SettingsIconPack18,
  LiveTVIconPack19,
  MoviesIconPack19,
  SeriesIconPack19,
  PlaylistIconPack19,
  SettingsIconPack19,
  LiveTVIconPack20,
  MoviesIconPack20,
  SeriesIconPack20,
  PlaylistIconPack20,
  SettingsIconPack20,
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
  'pack-frosted-gold-3d': {
    live: LiveTVIconPack11,
    movies: MoviesIconPack11,
    series: SeriesIconPack11,
    add: PlaylistIconPack11,
    settings: SettingsIconPack11,
  },
  'pack-crystal-neon-dual': {
    live: LiveTVIconPack12,
    movies: MoviesIconPack12,
    series: SeriesIconPack12,
    add: PlaylistIconPack12,
    settings: SettingsIconPack12,
  },
  'pack-bold-isometric': {
    live: LiveTVIconPack13,
    movies: MoviesIconPack13,
    series: SeriesIconPack13,
    add: PlaylistIconPack13,
    settings: SettingsIconPack13,
  },
  'pack-floating-blades': {
    live: LiveTVIconPack14,
    movies: MoviesIconPack14,
    series: SeriesIconPack14,
    add: PlaylistIconPack14,
    settings: SettingsIconPack14,
  },
  'pack-cinema-emblems': {
    live: LiveTVIconPack15,
    movies: MoviesIconPack15,
    series: SeriesIconPack15,
    add: PlaylistIconPack15,
    settings: SettingsIconPack15,
  },
  'pack-hologram-wire': {
    live: LiveTVIconPack16,
    movies: MoviesIconPack16,
    series: SeriesIconPack16,
    add: PlaylistIconPack16,
    settings: SettingsIconPack16,
  },
  'pack-soft-capsules': {
    live: LiveTVIconPack17,
    movies: MoviesIconPack17,
    series: SeriesIconPack17,
    add: PlaylistIconPack17,
    settings: SettingsIconPack17,
  },
  'pack-smoked-monolith': {
    live: LiveTVIconPack18,
    movies: MoviesIconPack18,
    series: SeriesIconPack18,
    add: PlaylistIconPack18,
    settings: SettingsIconPack18,
  },
  'pack-diamond-cut': {
    live: LiveTVIconPack19,
    movies: MoviesIconPack19,
    series: SeriesIconPack19,
    add: PlaylistIconPack19,
    settings: SettingsIconPack19,
  },
  'pack-architectural-wire': {
    live: LiveTVIconPack20,
    movies: MoviesIconPack20,
    series: SeriesIconPack20,
    add: PlaylistIconPack20,
    settings: SettingsIconPack20,
  },
};

/**
 * Style 1 (pack-3d) — Premium 3D Glossy Metallic & Glass Neon Cinematic Icons
 * Dynamically bound to --theme-primary / --theme-accent / --theme-secondary / --theme-soft-white.
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
  const gMetal = `gMetal_${rawId}`;
  const gBevel = `gBevel_${rawId}`;
  const gRim = `gRim_${rawId}`;
  const gGlass = `gGlass_${rawId}`;
  const gScreen = `gScreen_${rawId}`;
  const gPlay = `gPlay_${rawId}`;

  const renderGlyph = () => {
    if (kind === 'live') {
      return (
        <g>
          {/* Twin Rabbit-Ear Antennas */}
          <path d="M16.5 6.8L24 14.5L31.5 6.8" fill="none" stroke={`url(#${gRim})`} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="16" cy="6.4" r="1.9" fill={`url(#${gRim})`} stroke="#FFFFFF" strokeOpacity="0.8" strokeWidth="0.6" />
          <circle cx="32" cy="6.4" r="1.9" fill={`url(#${gRim})`} stroke="#FFFFFF" strokeOpacity="0.8" strokeWidth="0.6" />
          {/* Bottom Feet */}
          <path d="M12 38.5H16.5L15 41.8H11L12 38.5Z" fill={`url(#${gBevel})`} stroke={`url(#${gRim})`} strokeWidth="0.6" />
          <path d="M31.5 38.5H36L37 41.8H33L31.5 38.5Z" fill={`url(#${gBevel})`} stroke={`url(#${gRim})`} strokeWidth="0.6" />
          {/* 3D Extruded Depth Slab */}
          <rect x="6" y="15.5" width="38" height="24" rx="5.8" fill={`url(#${gBevel})`} />
          {/* Main Metallic Glossy TV Chassis */}
          <rect x="4.5" y="14" width="38" height="24" rx="5.8" fill={`url(#${gMetal})`} stroke={`url(#${gRim})`} strokeWidth="1.35" />
          {/* Top Specular Glossy Edge */}
          <path d="M10.5 15.2H36.5" stroke="#FFFFFF" strokeOpacity="0.82" strokeWidth="1.2" strokeLinecap="round" />
          {/* Recessed Dark Glass Screen */}
          <rect x="8.2" y="17.8" width="23.2" height="16.4" rx="2.8" fill={`url(#${gScreen})`} stroke={`url(#${gRim})`} strokeWidth="1" />
          {/* Diagonal Glass Sheen */}
          <path d="M9.2 18.6H26L14.5 33.4H9.2C8.9 33.4 8.8 33 8.8 32.5V19.4C8.8 18.9 8.9 18.6 9.2 18.6Z" fill={`url(#${gGlass})`} />
          {/* Luminous 3D Play Emblem */}
          <polygon points="16.8,22 25.2,26 16.8,30" fill={`url(#${gPlay})`} stroke="#FFFFFF" strokeOpacity="0.9" strokeWidth="0.7" strokeLinejoin="round" />
          {/* Right Control Dials & Speaker Slits */}
          <circle cx="36.6" cy="21.2" r="2.1" fill={`url(#${gBevel})`} stroke={`url(#${gRim})`} strokeWidth="0.9" />
          <circle cx="36.3" cy="20.9" r="0.8" fill="#FFFFFF" fillOpacity="0.8" />
          <circle cx="36.6" cy="27.2" r="2.1" fill={`url(#${gBevel})`} stroke={`url(#${gRim})`} strokeWidth="0.9" />
          <circle cx="36.3" cy="26.9" r="0.8" fill="#FFFFFF" fillOpacity="0.8" />
          <path d="M34.5 31.6H38.7M34.5 33.6H38.7" stroke="rgba(6,8,14,0.8)" strokeWidth="1.3" strokeLinecap="round" />
        </g>
      );
    }

    if (kind === 'movies') {
      const holeAngles = [-90, -18, 54, 126, 198];
      return (
        <g>
          {/* Unwinding 3D Perforated Film Strip Tail */}
          <path
            d="M27.5 36.2C32.8 39.2 38.6 38.2 42.8 33L44.5 37.8C39.6 43 32.2 43.8 24.5 40.5L27.5 36.2Z"
            fill={`url(#${gMetal})`}
            stroke={`url(#${gRim})`}
            strokeWidth="1.05"
            strokeLinejoin="round"
          />
          <circle cx="32.2" cy="39.5" r="0.9" fill="#090B12" />
          <circle cx="36.6" cy="39.1" r="0.9" fill="#090B12" />
          <circle cx="40.6" cy="37.1" r="0.9" fill="#090B12" />

          {/* 3D Extruded Reel Depth */}
          <circle cx="23.4" cy="24.2" r="17.2" fill={`url(#${gBevel})`} />
          {/* Main Metallic Glossy Reel Disc */}
          <circle cx="22" cy="22.8" r="17.2" fill={`url(#${gMetal})`} stroke={`url(#${gRim})`} strokeWidth="1.45" />
          {/* Glossy Top Crescent Highlight */}
          <path d="M9.5 13.5A15.2 15.2 0 0 1 34.5 13.5" fill="none" stroke="#FFFFFF" strokeOpacity="0.72" strokeWidth="1.3" strokeLinecap="round" />
          {/* Inner Beveled Track Ring */}
          <circle cx="22" cy="22.8" r="14.2" fill="none" stroke={`url(#${gBevel})`} strokeWidth="1.2" opacity="0.75" />

          {/* 5 Precision Film Reel Holes */}
          {holeAngles.map((deg) => {
            const rad = (deg * Math.PI) / 180;
            const hx = 22 + Math.cos(rad) * 9.1;
            const hy = 22.8 + Math.sin(rad) * 9.1;
            return (
              <g key={deg}>
                <circle cx={hx} cy={hy} r="3.65" fill={`url(#${gScreen})`} stroke={`url(#${gRim})`} strokeWidth="1.05" />
                <circle cx={hx - 0.3} cy={hy - 0.3} r="2.2" fill="rgba(255,255,255,0.06)" />
              </g>
            );
          })}

          {/* Raised 3D Center Hub */}
          <circle cx="22" cy="22.8" r="4.2" fill={`url(#${gBevel})`} stroke={`url(#${gRim})`} strokeWidth="1.15" />
          <circle cx="22" cy="22.8" r="1.9" fill={`url(#${gPlay})`} />
        </g>
      );
    }

    if (kind === 'series') {
      return (
        <g>
          {/* 3D Extruded Frame Depth */}
          <rect x="6" y="12.2" width="38" height="26.5" rx="5.5" fill={`url(#${gBevel})`} />
          {/* Main Sculpted Widescreen Bezel */}
          <rect x="4.5" y="10.5" width="38" height="26.5" rx="5.5" fill={`url(#${gMetal})`} stroke={`url(#${gRim})`} strokeWidth="1.4" />
          {/* Top Metallic Specular Rim */}
          <path d="M10.5 11.7H36.5" stroke="#FFFFFF" strokeOpacity="0.82" strokeWidth="1.2" strokeLinecap="round" />
          {/* 4 Corner Specular Rivets */}
          <circle cx="8" cy="14" r="1.05" fill="#FFFFFF" fillOpacity="0.85" />
          <circle cx="39" cy="14" r="1.05" fill="#FFFFFF" fillOpacity="0.85" />
          <circle cx="8" cy="33.5" r="1.05" fill="var(--theme-soft-white, #FFFFFF)" fillOpacity="0.7" />
          <circle cx="39" cy="33.5" r="1.05" fill="var(--theme-soft-white, #FFFFFF)" fillOpacity="0.7" />
          {/* Recessed Glossy Dark Display */}
          <rect x="9.6" y="15" width="27.8" height="17.5" rx="3" fill={`url(#${gScreen})`} stroke={`url(#${gRim})`} strokeWidth="1.05" />
          {/* Diagonal Glass Reflection */}
          <path d="M10.5 15.8H30L16.5 31.8H10.5C10.2 31.8 10.1 31.4 10.1 30.8V16.6C10.1 16.1 10.2 15.8 10.5 15.8Z" fill={`url(#${gGlass})`} />
          {/* Glowing Centered Play Emblem */}
          <polygon points="20.2,19 29.4,23.8 20.2,28.6" fill={`url(#${gPlay})`} stroke="#FFFFFF" strokeOpacity="0.9" strokeWidth="0.75" strokeLinejoin="round" />
        </g>
      );
    }

    if (kind === 'add') {
      return (
        <g>
          {/* Bar 1 Depth & Front */}
          <rect x="6" y="10.5" width="26.5" height="6.4" rx="3.2" fill={`url(#${gBevel})`} />
          <rect x="5" y="9.2" width="26.5" height="6.4" rx="3.2" fill={`url(#${gMetal})`} stroke={`url(#${gRim})`} strokeWidth="1.05" />
          <path d="M8.5 10.4H28" stroke="#FFFFFF" strokeOpacity="0.78" strokeWidth="0.9" strokeLinecap="round" />
          <circle cx="8.8" cy="12.4" r="1.2" fill="#090B12" />

          {/* Bar 2 Depth & Front */}
          <rect x="6" y="20.2" width="21.5" height="6.4" rx="3.2" fill={`url(#${gBevel})`} />
          <rect x="5" y="18.9" width="21.5" height="6.4" rx="3.2" fill={`url(#${gMetal})`} stroke={`url(#${gRim})`} strokeWidth="1.05" />
          <path d="M8.5 20.1H23" stroke="#FFFFFF" strokeOpacity="0.74" strokeWidth="0.9" strokeLinecap="round" />
          <circle cx="8.8" cy="22.1" r="1.2" fill="#090B12" />

          {/* Bar 3 Depth & Front */}
          <rect x="6" y="29.9" width="16.5" height="6.4" rx="3.2" fill={`url(#${gBevel})`} />
          <rect x="5" y="28.6" width="16.5" height="6.4" rx="3.2" fill={`url(#${gMetal})`} stroke={`url(#${gRim})`} strokeWidth="1.05" />
          <path d="M8.5 29.8H18" stroke="#FFFFFF" strokeOpacity="0.7" strokeWidth="0.9" strokeLinecap="round" />
          <circle cx="8.8" cy="31.8" r="1.2" fill="#090B12" />

          {/* 3D Overlapping Play Disc */}
          <circle cx="35.2" cy="32.2" r="9.4" fill={`url(#${gBevel})`} />
          <circle cx="34" cy="31" r="9.4" fill={`url(#${gMetal})`} stroke={`url(#${gRim})`} strokeWidth="1.35" />
          <circle cx="34" cy="31" r="7.2" fill={`url(#${gScreen})`} stroke="rgba(255,255,255,0.45)" strokeWidth="0.8" />
          <polygon points="31.8,27 38.6,31 31.8,35" fill={`url(#${gPlay})`} stroke="#FFFFFF" strokeOpacity="0.9" strokeWidth="0.65" strokeLinejoin="round" />
        </g>
      );
    }

    const gearPath =
      'M20.8 5.2H27.2L28.6 9.7C29.9 10.1 31.1 10.8 32.1 11.7L36.2 9.5L40.8 14.1L38.6 18.2C39.5 19.2 40.2 20.4 40.6 21.7L44.8 23.1V29.5L40.6 30.9C40.2 32.2 39.5 33.4 38.6 34.4L40.8 38.5L36.2 43.1L32.1 40.9C31.1 41.8 29.9 42.5 28.6 42.9L27.2 47H20.8L19.4 42.9C18.1 42.5 16.9 41.8 15.9 40.9L11.8 43.1L7.2 38.5L9.4 34.4C8.5 33.4 7.8 32.2 7.4 30.9L3.2 29.5V23.1L7.4 21.7C7.8 20.4 8.5 19.2 9.4 18.2L7.2 14.1L11.8 9.5L15.9 11.7C16.9 10.8 18.1 10.1 19.4 9.7L20.8 5.2Z';

    return (
      <g>
        {/* 3D Extruded Gear Depth */}
        <g transform="translate(1.4, 1.9) scale(0.95)">
          <path d={gearPath} fill={`url(#${gBevel})`} />
        </g>
        {/* Main Sculpted Metallic Gear */}
        <g transform="translate(0, -0.8) scale(0.95)">
          <path d={gearPath} fill={`url(#${gMetal})`} stroke={`url(#${gRim})`} strokeWidth="1.25" strokeLinejoin="round" />
        </g>
        {/* Raised Inner Collar */}
        <circle cx="22.8" cy="24" r="10.2" fill={`url(#${gBevel})`} stroke={`url(#${gRim})`} strokeWidth="1.1" />
        {/* Top Specular Crescent */}
        <path d="M16 17.5A9.5 9.5 0 0 1 29.6 17.5" fill="none" stroke="#FFFFFF" strokeOpacity="0.72" strokeWidth="1.2" strokeLinecap="round" />
        {/* Deep Recessed Center Bore */}
        <circle cx="22.8" cy="24" r="6" fill={`url(#${gScreen})`} stroke={`url(#${gRim})`} strokeWidth="1.35" />
        <circle cx="22.8" cy="24" r="2.2" fill={`url(#${gPlay})`} fillOpacity="0.85" />
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
        <linearGradient id={gMetal} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="42%" stopColor="#FFFFFF" />
          <stop offset="52%" stopColor="var(--theme-split-mid, #F5E6A8)" />
          <stop offset="65%" stopColor="var(--theme-split-color, #D4AF37)" />
          <stop offset="100%" stopColor="var(--theme-split-deep, #8C6A1D)" />
        </linearGradient>
        <linearGradient id={gBevel} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="var(--theme-split-color, #D4AF37)" />
          <stop offset="58%" stopColor="var(--theme-split-deep, #8C6A1D)" />
          <stop offset="100%" stopColor="#07090F" />
        </linearGradient>
        <linearGradient id={gRim} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="44%" stopColor="#FFFFFF" />
          <stop offset="54%" stopColor="var(--theme-split-mid, #F5E6A8)" />
          <stop offset="100%" stopColor="var(--theme-split-color, #D4AF37)" />
        </linearGradient>
        <linearGradient id={gGlass} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.34" />
          <stop offset="65%" stopColor="#FFFFFF" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={gScreen} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1B1F2E" />
          <stop offset="55%" stopColor="#0B0E17" />
          <stop offset="100%" stopColor="#04060B" />
        </linearGradient>
        <linearGradient id={gPlay} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="44%" stopColor="#FFFFFF" />
          <stop offset="56%" stopColor="var(--theme-split-mid, #FFF6D6)" />
          <stop offset="100%" stopColor="var(--theme-split-color, #D4AF37)" />
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

  const frameClipId = `${frameMetalId}_clip`;
  const frameInnerGlowId = `${frameMetalId}_iglow`;
  const frameSplitId = `${frameMetalId}_split`;

  const renderSvgFrame = (
    silhouette: React.ReactElement<any>,
    details?: React.ReactNode,
    scaleInner = 0.6,
    contourStrokeWidth = 9
  ) => {
    const hasExplicitStroke = silhouette.props?.stroke && silhouette.props.stroke !== 'none';
    const primaryContour = React.cloneElement(silhouette, {
      ...(hasExplicitStroke ? { stroke: `url(#${frameSplitId})` } : {}),
      className: [silhouette.props?.className, 'dashboard-frame-primary-stroke'].filter(Boolean).join(' '),
    });
    const innerRimGlow = React.cloneElement(silhouette, {
      fill: 'none',
      stroke: `url(#${frameSplitId})`,
      strokeWidth: contourStrokeWidth,
      strokeOpacity: 0.52,
      strokeDasharray: undefined,
      className: undefined,
    });

    return (
      <div
        data-frame-kind="svg"
        data-frame-shape={resolvedShape}
        className="dashboard-frame-wrap relative flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-105"
        style={{ width: framePx, height: framePx }}
      >
        <svg viewBox="0 0 100 100" className="dashboard-frame-svg absolute inset-0 w-full h-full pointer-events-none overflow-visible">
          <defs>
            <linearGradient id={frameSplitId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="44%" stopColor="#FFFFFF" />
              <stop offset="52%" stopColor="var(--theme-split-mid, #F5E6A8)" />
              <stop offset="65%" stopColor="var(--theme-split-color, #D4AF37)" />
              <stop offset="100%" stopColor="var(--theme-split-deep, #8C6A1D)" />
            </linearGradient>
            <linearGradient id={frameMetalId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="44%" stopColor="#FFFFFF" />
              <stop offset="53%" stopColor="var(--theme-split-mid, #F5E6A8)" />
              <stop offset="66%" stopColor="var(--theme-split-color, #D4AF37)" />
              <stop offset="100%" stopColor="var(--theme-split-deep, #8C6A1D)" />
            </linearGradient>
            <clipPath id={frameClipId}>
              {React.cloneElement(silhouette, {
                stroke: 'none',
                strokeWidth: 0,
                strokeDasharray: undefined,
                fill: '#FFFFFF',
                className: undefined,
              })}
            </clipPath>
            <radialGradient id={frameInnerGlowId} cx="50%" cy="50%" r="54%">
              <stop offset="0%" stopColor="var(--theme-split-color, #D4AF37)" stopOpacity="0.16" />
              <stop offset="56%" stopColor="var(--theme-split-color, #D4AF37)" stopOpacity="0.36" />
              <stop offset="84%" stopColor="var(--theme-split-mid, #F5E6A8)" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.92" />
            </radialGradient>
          </defs>
          {primaryContour}
          {details}
          <g clipPath={`url(#${frameClipId})`} className="dashboard-svg-inner-glow">
            <rect x="0" y="0" width="100" height="100" fill={`url(#${frameInnerGlowId})`} />
            {innerRimGlow}
          </g>
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
  };

  // SVG Geometric Frames (22 distinct shapes, all contour-clipped)
  switch (resolvedShape) {
    case 'hexagon':
      return renderSvgFrame(
        <polygon
          points="50,3 93,26 93,74 50,97 7,74 7,26"
          fill={`rgba(14, 18, 28, ${alpha})`}
          stroke="var(--theme-primary, #D4AF37)"
          strokeWidth="3.2"
        />,
        <polygon
          points="50,9 87,29 87,71 50,91 13,71 13,29"
          fill="none"
          stroke="var(--theme-accent, #F5E6A8)"
          strokeOpacity="0.35"
          strokeWidth="1.2"
        />
      );

    case 'geometric':
      return renderSvgFrame(
        <polygon
          points="24,4 76,4 96,24 96,76 76,96 24,96 4,76 4,24"
          fill={`rgba(14, 18, 28, ${alpha})`}
          stroke="var(--theme-primary, #D4AF37)"
          strokeWidth="3.2"
        />,
        <>
          <polyline points="14,32 14,14 32,14" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="2.2" />
          <polyline points="86,68 86,86 68,86" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="2.2" />
        </>
      );

    case 'frame-07': // Double Orbital Ring
      return renderSvgFrame(
        <circle cx="50" cy="50" r="46" fill={`rgba(12,16,26,${alpha})`} stroke="var(--theme-primary, #D4AF37)" strokeWidth="2.8" />,
        <circle cx="50" cy="50" r="39" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeOpacity="0.65" strokeWidth="1.4" />,
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
        <polygon points="50,3 97,50 50,97 3,50" fill={`rgba(14,18,28,${alpha})`} stroke="var(--theme-primary, #D4AF37)" strokeWidth="3.2" />,
        <polygon points="50,11 89,50 50,89 11,50" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeOpacity="0.4" strokeWidth="1.2" />,
        0.52
      );

    case 'frame-10': // Heraldic Shield
      return renderSvgFrame(
        <path
          d="M12 8 H88 V47 C88 73 67 88 50 95 C33 88 12 73 12 47 Z"
          fill={`rgba(14,18,28,${alpha})`}
          stroke="var(--theme-primary, #D4AF37)"
          strokeWidth="3.2"
          strokeLinejoin="round"
        />,
        <path
          d="M18 14 H82 V47 C82 69 64 81 50 88 C36 81 18 69 18 47 Z"
          fill="none"
          stroke="var(--theme-accent, #F5E6A8)"
          strokeOpacity="0.32"
          strokeWidth="1.2"
        />,
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
        undefined,
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
        undefined,
        0.56
      );

    case 'frame-16': // Starburst 12-Point Seal
      return renderSvgFrame(
        <polygon
          points="50,3 61,13 76,9 80,24 94,30 89,45 97,57 86,69 87,84 72,87 63,97 50,91 37,97 28,87 13,84 14,69 3,57 11,45 6,30 20,24 24,9 39,13"
          fill={`rgba(14,18,28,${alpha})`}
          stroke="var(--theme-primary, #D4AF37)"
          strokeWidth="2.8"
          strokeLinejoin="round"
        />,
        <circle cx="50" cy="50" r="34" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeOpacity="0.35" strokeWidth="1.2" />,
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
        undefined,
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
        undefined,
        0.56
      );

    case 'frame-19': // Telemetry Radar Ring
      return renderSvgFrame(
        <circle cx="50" cy="50" r="38" fill={`rgba(14,18,28,${alpha})`} stroke="var(--theme-accent, #F5E6A8)" strokeOpacity="0.55" strokeWidth="1.5" />,
        <circle cx="50" cy="50" r="46" fill="none" stroke={`url(#${frameSplitId})`} strokeWidth="3.2" strokeDasharray="18 8" className="dashboard-frame-primary-stroke" />,
        0.56
      );

    case 'frame-21': // Side Caliper Bracket Arcs
      return renderSvgFrame(
        <rect x="14" y="10" width="72" height="80" rx="18" fill={`rgba(14,18,28,${alpha})`} />,
        <>
          <path d="M24 10 C8 16 4 32 4 50 C4 68 8 84 24 90" fill="none" stroke={`url(#${frameSplitId})`} strokeWidth="4" strokeLinecap="round" className="dashboard-frame-primary-stroke" />
          <path d="M76 10 C92 16 96 32 96 50 C96 68 92 84 76 90" fill="none" stroke={`url(#${frameSplitId})`} strokeWidth="4" strokeLinecap="round" className="dashboard-frame-primary-stroke" />
        </>,
        0.58
      );

    case 'frame-25': // Blueprint Twin Line Square
      return renderSvgFrame(
        <rect x="6" y="6" width="88" height="88" rx="10" fill={`rgba(14,18,28,${alpha})`} stroke="var(--theme-primary, #D4AF37)" strokeWidth="2.2" />,
        <rect x="13" y="13" width="74" height="74" rx="6" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.4" strokeDasharray="6 4" />,
        0.56
      );

    case 'frame-26': // Viewfinder L-Corners Only
      return renderSvgFrame(
        <rect x="8" y="8" width="84" height="84" rx="12" fill={`rgba(14,18,28,${Math.max(0.04, alpha * 0.6)})`} />,
        <>
          <polyline points="6,28 6,6 28,6" fill="none" stroke="#FFFFFF" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" className="dashboard-frame-primary-stroke" />
          <polyline points="72,6 94,6 94,28" fill="none" stroke="#FFFFFF" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" className="dashboard-frame-primary-stroke" />
          <polyline points="6,72 6,94 28,94" fill="none" stroke="var(--theme-split-color, #D4AF37)" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" className="dashboard-frame-primary-stroke" />
          <polyline points="72,94 94,94 94,72" fill="none" stroke="var(--theme-split-color, #D4AF37)" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" className="dashboard-frame-primary-stroke" />
        </>
      );

    case 'frame-27': // Frosted Glass Hexagon
      return renderSvgFrame(
        <polygon
          points="50,3 93,26 93,74 50,97 7,74 7,26"
          fill={`rgba(255,255,255,${Math.min(0.32, alpha + 0.08)})`}
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="2.8"
        />,
        <line x1="18" y1="30" x2="48" y2="12" stroke="#FFFFFF" strokeOpacity="0.6" strokeWidth="2.2" strokeLinecap="round" />,
        Math.min(0.6, innerIconPx / Math.max(1, framePx))
      );

    case 'frame-29': // Metallic Coin Circle
      return renderSvgFrame(
        <circle cx="50" cy="50" r="46" fill={`rgba(14,18,28,${Math.max(0.55, alpha)})`} stroke={`url(#${frameMetalId})`} strokeWidth="6" />,
        <circle cx="50" cy="50" r="39" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.2" strokeDasharray="3 2" />,
        0.58,
        12
      );

    case 'frame-30': // Metallic Hex Crest
      return renderSvgFrame(
        <polygon points="50,3 93,26 93,74 50,97 7,74 7,26" fill={`rgba(12,15,24,${Math.max(0.55, alpha)})`} stroke={`url(#${frameMetalId})`} strokeWidth="5.2" />,
        <polygon points="50,11 86,30 86,70 50,89 14,70 14,30" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.2" />,
        0.58,
        11
      );

    case 'frame-31': // Metallic Armor Shield
      return renderSvgFrame(
        <path
          d="M11 8 H89 V47 C89 74 68 89 50 96 C32 89 11 74 11 47 Z"
          fill={`rgba(12,14,22,${Math.max(0.55, alpha)})`}
          stroke={`url(#${frameMetalId})`}
          strokeWidth="5"
          strokeLinejoin="round"
        />,
        undefined,
        0.55,
        11
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
        undefined,
        0.58
      );

    case 'frame-37': // 10-Sided Decagon Jewel Cut
      return renderSvgFrame(
        <polygon
          points="50,4 78,13 95,36 95,64 78,87 50,96 22,87 5,64 5,36 22,13"
          fill={`rgba(14,18,28,${alpha})`}
          stroke="var(--theme-primary, #D4AF37)"
          strokeWidth="3.2"
        />,
        <polygon
          points="50,12 74,20 87,39 87,61 74,80 50,88 26,80 13,61 13,39 26,20"
          fill="none"
          stroke="var(--theme-accent, #F5E6A8)"
          strokeOpacity="0.4"
          strokeWidth="1.2"
        />,
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
        undefined,
        0.54
      );
  }

  // CSS / Box Architectural Frames (18 distinct shapes, each tagged with dashboard-frame-focus-surface)
  if (resolvedShape === 'metallic') {
    return (
      <div
        data-frame-kind="box"
        data-frame-shape={resolvedShape}
        className="dashboard-frame-wrap dashboard-frame-focus-surface relative flex items-center justify-center shrink-0 rounded-2xl p-[2.5px] transition-transform duration-150 group-hover:scale-105 shadow-[0_10px_24px_rgba(0,0,0,0.45)]"
        style={{
          width: framePx,
          height: framePx,
          background: 'var(--theme-two-tone-grad, linear-gradient(180deg, #FFFFFF 0%, #FFFFFF 45%, #F5E6A8 52%, #D4AF37 61%, #8C6A1D 100%))',
        }}
      >
        <div
          className="w-full h-full rounded-[13.5px] flex items-center justify-center border border-white/15"
          style={{
            background: `linear-gradient(160deg, rgba(24,26,34,${Math.max(0.45, alpha)}) 0%, rgba(10,12,18,${Math.max(0.6, alpha + 0.12)}) 100%)`,
          }}
        >
          <div className="relative z-10 flex items-center justify-center">
            <PackIconSvg kind={kind} pack={resolvedPack} sizePx={innerIconPx} />
          </div>
        </div>
      </div>
    );
  }

  if (resolvedShape === 'glass' || resolvedShape === 'frame-28') {
    const isSphere = resolvedShape === 'frame-28';
    return (
      <div
        data-frame-kind="box"
        data-frame-shape={resolvedShape}
        data-achour-glass="true"
        className={`dashboard-frame-wrap dashboard-frame-focus-surface relative flex items-center justify-center shrink-0 border border-white/30 transition-transform duration-150 group-hover:scale-105 shadow-[0_10px_28px_rgba(0,0,0,0.28),inset_0_1px_1px_rgba(255,255,255,0.45)] overflow-hidden ${
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
        data-frame-shape={resolvedShape}
        data-achour-glass="true"
        className="dashboard-frame-wrap dashboard-frame-focus-surface relative flex items-center justify-center shrink-0 rounded-full border-2 transition-transform duration-150 group-hover:scale-105 shadow-[0_8px_22px_rgba(0,0,0,0.35)]"
        style={{
          width: framePx,
          height: framePx,
          borderColor: 'var(--theme-primary, #D4AF37)',
          boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.12), 0 8px 22px rgba(0,0,0,0.35)',
          ...interiorGlassStyle,
        }}
      >
        <div className="relative z-10 flex items-center justify-center">
          <PackIconSvg kind={kind} pack={resolvedPack} sizePx={innerIconPx} />
        </div>
      </div>
    );
  }

  if (resolvedShape === 'frame-13') {
    // Stadium Pill Capsule
    return (
      <div
        data-frame-kind="box"
        data-frame-shape={resolvedShape}
        data-achour-glass="true"
        className="dashboard-frame-wrap dashboard-frame-focus-surface relative flex items-center justify-center shrink-0 rounded-full border-2 transition-transform duration-150 group-hover:scale-105"
        style={{
          width: Math.round(framePx * 1.18),
          height: Math.round(framePx * 0.88),
          borderColor: 'var(--theme-primary, #D4AF37)',
          ...interiorGlassStyle,
        }}
      >
        <div className="relative z-10 flex items-center justify-center">
          <PackIconSvg kind={kind} pack={resolvedPack} sizePx={Math.min(innerIconPx, Math.round(framePx * 0.56))} />
        </div>
      </div>
    );
  }

  if (resolvedShape === 'frame-14' || resolvedShape === 'frame-15') {
    // Diagonal Leaf Left / Blade Right
    return (
      <div
        data-frame-kind="box"
        data-frame-shape={resolvedShape}
        data-achour-glass="true"
        className="dashboard-frame-wrap dashboard-frame-focus-surface relative flex items-center justify-center shrink-0 border-2 transition-transform duration-150 group-hover:scale-105 shadow-[0_8px_22px_rgba(0,0,0,0.35)]"
        style={{
          width: framePx,
          height: framePx,
          borderRadius: resolvedShape === 'frame-14' ? '44% 10% 44% 10%' : '10% 44% 10% 44%',
          borderColor: 'var(--theme-primary, #D4AF37)',
          ...interiorGlassStyle,
        }}
      >
        <div className="relative z-10 flex items-center justify-center">
          <PackIconSvg kind={kind} pack={resolvedPack} sizePx={innerIconPx} />
        </div>
      </div>
    );
  }

  if (resolvedShape === 'frame-20') {
    // Top-Bottom Rail Brackets
    return (
      <div
        data-frame-kind="box"
        data-frame-shape={resolvedShape}
        data-achour-glass="true"
        className="dashboard-frame-wrap dashboard-frame-focus-surface relative flex items-center justify-center shrink-0 border-y-[3px] border-x-0 rounded-xl transition-transform duration-150 group-hover:scale-105"
        style={{
          width: framePx,
          height: framePx,
          borderColor: 'var(--theme-primary, #D4AF37)',
          ...interiorGlassStyle,
        }}
      >
        <div className="relative z-10 flex items-center justify-center">
          <PackIconSvg kind={kind} pack={resolvedPack} sizePx={innerIconPx} />
        </div>
      </div>
    );
  }

  if (resolvedShape === 'frame-22' || resolvedShape === 'frame-38') {
    // Electric Neon Ring / Soft Neon Squircle
    const isCircle = resolvedShape === 'frame-22';
    return (
      <div
        data-frame-kind="box"
        data-frame-shape={resolvedShape}
        className={`dashboard-frame-wrap dashboard-frame-focus-surface relative flex items-center justify-center shrink-0 border-2 transition-transform duration-150 group-hover:scale-105 ${
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
        <div className="relative z-10 flex items-center justify-center">
          <PackIconSvg kind={kind} pack={resolvedPack} sizePx={innerIconPx} />
        </div>
      </div>
    );
  }

  if (resolvedShape === 'frame-23') {
    // Cyberpunk Skew Parallelogram
    return (
      <div
        data-frame-kind="box"
        data-frame-shape={resolvedShape}
        data-achour-glass="true"
        className="dashboard-frame-wrap dashboard-frame-focus-surface relative flex items-center justify-center shrink-0 rounded-xl border-2 -skew-x-12 transition-transform duration-150 group-hover:scale-105"
        style={{
          width: framePx,
          height: framePx,
          borderColor: 'var(--theme-primary, #D4AF37)',
          boxShadow: '4px 4px 0 var(--theme-secondary, #8C6A1D)',
          ...interiorGlassStyle,
        }}
      >
        <div className="relative z-10 skew-x-12 flex items-center justify-center">
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
        data-frame-shape={resolvedShape}
        data-achour-glass="true"
        className="dashboard-frame-wrap dashboard-frame-focus-surface relative flex items-center justify-center shrink-0 rounded-[26%] border-2 border-b-[6px] transition-transform duration-150 group-hover:scale-105"
        style={{
          width: framePx,
          height: framePx,
          borderColor: 'var(--theme-primary, #D4AF37)',
          borderBottomColor: 'var(--theme-secondary, #8C6A1D)',
          ...interiorGlassStyle,
        }}
      >
        <div className="relative z-10 flex items-center justify-center">
          <PackIconSvg kind={kind} pack={resolvedPack} sizePx={innerIconPx} />
        </div>
      </div>
    );
  }

  if (resolvedShape === 'frame-32') {
    // Carbon Tech Weave Grid
    return (
      <div
        data-frame-kind="box"
        data-frame-shape={resolvedShape}
        className="dashboard-frame-wrap dashboard-frame-focus-surface relative flex items-center justify-center shrink-0 rounded-2xl border-2 transition-transform duration-150 group-hover:scale-105"
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
        <div className="relative z-10 flex items-center justify-center">
          <PackIconSvg kind={kind} pack={resolvedPack} sizePx={innerIconPx} />
        </div>
      </div>
    );
  }

  if (resolvedShape === 'frame-33') {
    // Obsidian Deep Inset Well
    return (
      <div
        data-frame-kind="box"
        data-frame-shape={resolvedShape}
        className="dashboard-frame-wrap dashboard-frame-focus-surface relative flex items-center justify-center shrink-0 rounded-2xl border transition-transform duration-150 group-hover:scale-105"
        style={{
          width: framePx,
          height: framePx,
          backgroundColor: 'rgba(6, 8, 12, 0.88)',
          borderColor: 'rgba(255,255,255,0.14)',
          boxShadow: 'inset 0 8px 18px rgba(0,0,0,0.85), inset 0 -1px 0 var(--theme-primary, #D4AF37)',
        }}
      >
        <div className="relative z-10 flex items-center justify-center">
          <PackIconSvg kind={kind} pack={resolvedPack} sizePx={innerIconPx} />
        </div>
      </div>
    );
  }

  if (resolvedShape === 'frame-35') {
    // Stacked Triple Deck Cards — focus surface attaches directly to front card contour!
    return (
      <div
        data-frame-kind="box"
        data-frame-shape={resolvedShape}
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
          data-frame-shape={resolvedShape}
          className="dashboard-frame-focus-surface relative w-full h-full rounded-[22%] border-2 flex items-center justify-center"
          style={{ borderColor: 'var(--theme-primary, #D4AF37)', ...interiorGlassStyle }}
        >
          <div className="relative z-10 flex items-center justify-center">
            <PackIconSvg kind={kind} pack={resolvedPack} sizePx={innerIconPx} />
          </div>
        </div>
      </div>
    );
  }

  if (resolvedShape === 'frame-36') {
    // Radiant Aura Halo
    return (
      <div
        data-frame-kind="box"
        data-frame-shape={resolvedShape}
        data-achour-glass="true"
        className="dashboard-frame-wrap dashboard-frame-focus-surface relative flex items-center justify-center shrink-0 rounded-full p-[3px] transition-transform duration-150 group-hover:scale-105"
        style={{
          width: framePx,
          height: framePx,
          background: 'var(--theme-two-tone-grad, linear-gradient(180deg, #FFFFFF 0%, #FFFFFF 45%, #F5E6A8 52%, #D4AF37 61%, #8C6A1D 100%))',
          boxShadow: isTvPerf ? 'none' : '0 0 18px var(--theme-glow, rgba(212,175,55,0.5))',
        }}
      >
        <div
          className="w-full h-full rounded-full flex items-center justify-center"
          style={interiorGlassStyle}
        >
          <div className="relative z-10 flex items-center justify-center">
            <PackIconSvg kind={kind} pack={resolvedPack} sizePx={innerIconPx} />
          </div>
        </div>
      </div>
    );
  }

  if (resolvedShape === 'frame-40') {
    // Pearl Satin Dual Bevel
    return (
      <div
        data-frame-kind="box"
        data-frame-shape={resolvedShape}
        data-achour-glass="true"
        className="dashboard-frame-wrap dashboard-frame-focus-surface relative flex items-center justify-center shrink-0 rounded-[26%] border-2 transition-transform duration-150 group-hover:scale-105"
        style={{
          width: framePx,
          height: framePx,
          borderColor: 'var(--theme-accent, #F5E6A8)',
          boxShadow: 'inset 0 0 0 3px var(--theme-primary, #D4AF37), 0 8px 22px rgba(0,0,0,0.45)',
          ...interiorGlassStyle,
        }}
      >
        <div className="relative z-10 flex items-center justify-center">
          <PackIconSvg kind={kind} pack={resolvedPack} sizePx={innerIconPx} />
        </div>
      </div>
    );
  }

  // Default: rounded-square
  return (
    <div
      data-frame-kind="box"
      data-frame-shape={resolvedShape}
      data-achour-glass="true"
      className="dashboard-frame-wrap dashboard-frame-focus-surface relative flex items-center justify-center shrink-0 rounded-[24%] border-2 transition-transform duration-150 group-hover:scale-105 shadow-[0_8px_22px_rgba(0,0,0,0.35)]"
      style={{
        width: framePx,
        height: framePx,
        borderColor: 'var(--theme-primary, #D4AF37)',
        ...interiorGlassStyle,
      }}
    >
      <div className="relative z-10 flex items-center justify-center">
        <PackIconSvg kind={kind} pack={resolvedPack} sizePx={innerIconPx} />
      </div>
    </div>
  );
}
