import React, { useId } from 'react';
import { StyledIconProps } from './types';

function useSculptedIds() {
  const id = useId().replace(/:/g, '');
  return {
    gFace: `s2_face_${id}`,
    gSide: `s2_side_${id}`,
    gTop: `s2_top_${id}`,
    gRecess: `s2_rec_${id}`,
  };
}

function SculptedDefs({ gFace, gSide, gTop, gRecess }: ReturnType<typeof useSculptedIds>) {
  return (
    <defs>
      <linearGradient id={gFace} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="42%" stopColor="#FFFFFF" />
        <stop offset="52%" stopColor="var(--theme-split-mid, #F5E6A8)" />
        <stop offset="65%" stopColor="var(--theme-split-color, #D4AF37)" />
        <stop offset="100%" stopColor="var(--theme-split-deep, #8C6A1D)" />
      </linearGradient>
      <linearGradient id={gSide} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="var(--theme-split-color, #D4AF37)" stopOpacity="0.82" />
        <stop offset="100%" stopColor="var(--theme-split-deep, #8C6A1D)" stopOpacity="0.98" />
      </linearGradient>
      <linearGradient id={gTop} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="44%" stopColor="#FFFFFF" />
        <stop offset="56%" stopColor="var(--theme-split-mid, #F5E6A8)" />
        <stop offset="100%" stopColor="var(--theme-split-color, #D4AF37)" />
      </linearGradient>
      <linearGradient id={gRecess} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="var(--theme-split-deep, #8C6A1D)" stopOpacity="0.45" />
        <stop offset="100%" stopColor="var(--theme-split-color, #D4AF37)" stopOpacity="0.16" />
      </linearGradient>
    </defs>
  );
}

/** Style 2 - Sculpted 3D: Live TV (Beveled 3D TV with sculpted antenna, broadcast arcs & carved play relief) */
export function LiveTVIconStyle2({ sizePx = 42, className = '' }: StyledIconProps) {
  const ids = useSculptedIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible achour-icon-svg ${className}`}
      style={{
        color: 'var(--theme-primary, #D4AF37)',
      }}
    >
      <SculptedDefs {...ids} />
      {/* Sculpted Antenna & Signal Waves */}
      <path d="M16 7.5L23.5 14L31 7.5" fill="none" stroke={`url(#${ids.gTop})`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="15.5" cy="7" r="1.7" fill={`url(#${ids.gTop})`} />
      <circle cx="31.5" cy="7" r="1.7" fill={`url(#${ids.gTop})`} />
      <path d="M35.5 7.5C37.8 8.8 39.2 10.6 39.8 12.8" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M38 4.8C41.2 6.6 43 9.3 43.8 12.2" fill="none" stroke="currentColor" strokeOpacity="0.75" strokeWidth="1.5" strokeLinecap="round" />
      {/* 3D Extruded Depth Slab (bottom-right volume) */}
      <path d="M8 16.5H40C42 16.5 43.5 18 43.5 20V37C43.5 39 42 40.5 40 40.5H10C8 40.5 6.5 39 6.5 37V18" fill={`url(#${ids.gSide})`} />
      {/* Sculpted Front Chassis */}
      <rect x="5" y="14" width="36" height="24" rx="4.5" fill={`url(#${ids.gFace})`} stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.1" />
      {/* Inner Top Chamfer Highlight */}
      <path d="M9.5 15.2H36.5" stroke="#FFFFFF" strokeOpacity="0.48" strokeWidth="1.1" strokeLinecap="round" />
      {/* Deep Carved Screen Recess */}
      <rect x="8.5" y="17.5" width="22.5" height="17" rx="2.5" fill={`url(#${ids.gRecess})`} stroke="var(--theme-secondary, #8C6A1D)" strokeWidth="1.2" />
      <rect x="9.5" y="18.3" width="20.5" height="15.4" rx="2" fill="rgba(5,8,15,0.62)" />
      {/* Raised 3D Play Emblem inside screen */}
      <polygon points="17.2,22 25.2,26 17.2,30" fill={`url(#${ids.gTop})`} stroke="var(--theme-secondary, #8C6A1D)" strokeWidth="0.7" strokeLinejoin="round" />
      {/* Sculpted Dials on right bezel */}
      <circle cx="36" cy="21.5" r="2.1" fill={`url(#${ids.gTop})`} />
      <circle cx="36" cy="27.5" r="2.1" fill={`url(#${ids.gTop})`} />
      <path d="M33.8 32.5H38.2" stroke="var(--theme-secondary, #8C6A1D)" strokeWidth="1.8" strokeLinecap="round" />
      {/* 3D Pedestal */}
      <path d="M16 40.5H31L33 43.5H14L16 40.5Z" fill={`url(#${ids.gSide})`} />
    </svg>
  );
}

/** Style 2 - Sculpted 3D: Movies (Embossed 3D Cinema Clapperboard with extruded edge & raised play core) */
export function MoviesIconStyle2({ sizePx = 42, className = '' }: StyledIconProps) {
  const ids = useSculptedIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible achour-icon-svg ${className}`}
      style={{
        color: 'var(--theme-primary, #D4AF37)',
      }}
    >
      <SculptedDefs {...ids} />
      {/* 3D Extruded Body Shadow Layer */}
      <rect x="8.5" y="19.5" width="34" height="22" rx="4" fill={`url(#${ids.gSide})`} />
      {/* Raised Front Clapper Slate */}
      <rect x="6" y="17" width="34" height="22" rx="4" fill={`url(#${ids.gFace})`} stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.1" />
      {/* Deep Carved Inner Film Window */}
      <rect x="9.5" y="21" width="27" height="14.5" rx="2.2" fill="rgba(5,8,15,0.56)" stroke="var(--theme-secondary, #8C6A1D)" strokeWidth="1" />
      {/* Raised 3D Play Arrow */}
      <polygon points="19.5,24 28.5,28.2 19.5,32.5" fill={`url(#${ids.gTop})`} stroke="var(--theme-secondary, #8C6A1D)" strokeWidth="0.8" strokeLinejoin="round" />
      {/* Hinged Sculpted Top Clap Bar */}
      <path d="M6.5 16L37.5 6.8L39.6 12.6L8.6 21.8L6.5 16Z" fill={`url(#${ids.gTop})`} stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1" strokeLinejoin="round" />
      {/* Carved Diagonal Stripes */}
      <path d="M13 14L16.2 19.5M21.5 11.5L24.7 17M30 9L33.2 14.5" stroke="var(--theme-secondary, #8C6A1D)" strokeWidth="2.4" strokeLinecap="round" />
      {/* Hinge Rivet */}
      <circle cx="9.2" cy="18.2" r="1.4" fill="var(--theme-secondary, #8C6A1D)" />
    </svg>
  );
}

/** Style 2 - Sculpted 3D: Series (Volumetric Sculpted Screen with depth bevel & stand) */
export function SeriesIconStyle2({ sizePx = 42, className = '' }: StyledIconProps) {
  const ids = useSculptedIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible achour-icon-svg ${className}`}
      style={{
        color: 'var(--theme-primary, #D4AF37)',
      }}
    >
      <SculptedDefs {...ids} />
      {/* Front 3D Extruded Screen Depth */}
      <rect x="8.5" y="13" width="33" height="23.5" rx="4.2" fill={`url(#${ids.gSide})`} />
      {/* Front Hero Screen */}
      <rect x="6.5" y="11" width="33" height="23" rx="4.2" fill={`url(#${ids.gFace})`} stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.2" />
      {/* Carved Recessed Screen */}
      <rect x="10.2" y="14.5" width="25.6" height="16" rx="2.4" fill="rgba(5,8,15,0.62)" stroke="var(--theme-secondary, #8C6A1D)" strokeWidth="1" />
      {/* Sculpted Play Triangle */}
      <polygon points="19.8,18.2 28.2,22.5 19.8,26.8" fill={`url(#${ids.gTop})`} stroke="var(--theme-secondary, #8C6A1D)" strokeWidth="0.7" strokeLinejoin="round" />
      {/* Base Stand */}
      <path d="M17.5 36.5H30.5L32.5 40H15.5L17.5 36.5Z" fill={`url(#${ids.gSide})`} />
    </svg>
  );
}

/** Style 2 - Sculpted 3D: Playlist (Embossed 3D Media Bars + Raised Play Disc) */
export function PlaylistIconStyle2({ sizePx = 42, className = '' }: StyledIconProps) {
  const ids = useSculptedIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible achour-icon-svg ${className}`}
      style={{
        color: 'var(--theme-primary, #D4AF37)',
      }}
    >
      <SculptedDefs {...ids} />
      {/* Bar 1 Depth & Top */}
      <rect x="7" y="11" width="30" height="6" rx="2.5" fill={`url(#${ids.gSide})`} />
      <rect x="5.5" y="9" width="30" height="6" rx="2.5" fill={`url(#${ids.gTop})`} stroke="var(--theme-accent, #F5E6A8)" strokeWidth="0.8" />
      {/* Bar 2 Depth & Top */}
      <rect x="7" y="21" width="24" height="6" rx="2.5" fill={`url(#${ids.gSide})`} />
      <rect x="5.5" y="19" width="24" height="6" rx="2.5" fill={`url(#${ids.gFace})`} stroke="var(--theme-accent, #F5E6A8)" strokeWidth="0.8" />
      {/* Bar 3 Depth & Top */}
      <rect x="7" y="31" width="19" height="6" rx="2.5" fill={`url(#${ids.gSide})`} />
      <rect x="5.5" y="29" width="19" height="6" rx="2.5" fill={`url(#${ids.gFace})`} stroke="var(--theme-accent, #F5E6A8)" strokeWidth="0.8" />
      {/* Raised 3D Action Disc */}
      <circle cx="35.5" cy="33" r="9.2" fill={`url(#${ids.gSide})`} />
      <circle cx="34.2" cy="31.5" r="9" fill={`url(#${ids.gTop})`} stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.1" />
      <polygon points="31.8,27.6 38.6,31.5 31.8,35.4" fill="rgba(5,8,15,0.82)" />
    </svg>
  );
}

/** Style 2 - Sculpted 3D: Settings (Heavy Beveled 8-Tooth Crown Gear with 3D extruded flank) */
export function SettingsIconStyle2({ sizePx = 42, className = '' }: StyledIconProps) {
  const ids = useSculptedIds();
  const gearPath =
    'M20.8 5.5H27.2L28.5 9.9C29.8 10.3 31 11 32 11.9L36 9.8L40.5 14.3L38.4 18.3C39.3 19.3 40 20.5 40.4 21.8L44.5 23.1V29.5L40.4 30.8C40 32.1 39.3 33.3 38.4 34.3L40.5 38.3L36 42.8L32 40.7C31 41.6 29.8 42.3 28.5 42.7L27.2 46.8H20.8L19.5 42.7C18.2 42.3 17 41.6 16 40.7L12 42.8L7.5 38.3L9.6 34.3C8.7 33.3 8 32.1 7.6 30.8L3.5 29.5V23.1L7.6 21.8C8 20.5 8.7 19.3 9.6 18.3L7.5 14.3L12 9.8L16 11.9C17 11 18.2 10.3 19.5 9.9L20.8 5.5Z';
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible achour-icon-svg ${className}`}
      style={{
        color: 'var(--theme-primary, #D4AF37)',
      }}
    >
      <SculptedDefs {...ids} />
      {/* Extruded 3D Gear Depth */}
      <g transform="translate(1.4, 1.8) scale(0.95)">
        <path d={gearPath} fill={`url(#${ids.gSide})`} />
      </g>
      {/* Front Beveled Gear */}
      <g transform="translate(0, -1) scale(0.95)">
        <path d={gearPath} fill={`url(#${ids.gFace})`} stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.1" strokeLinejoin="round" />
      </g>
      {/* Raised Inner Collar */}
      <circle cx="22.8" cy="24" r="9.6" fill={`url(#${ids.gTop})`} stroke="var(--theme-secondary, #8C6A1D)" strokeWidth="1" />
      {/* Recessed Center Bore */}
      <circle cx="22.8" cy="24" r="5.6" fill="rgba(5,8,15,0.72)" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.2" />
    </svg>
  );
}
