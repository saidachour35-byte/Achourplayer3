import React, { useId } from 'react';
import { StyledIconProps } from './types';

function useGeoIds() {
  const id = useId().replace(/:/g, '');
  return {
    gSplit: `s5_split_${id}`,
  };
}

function GeoDefs({ gSplit }: { gSplit: string }) {
  return (
    <defs>
      <linearGradient id={gSplit} gradientUnits="userSpaceOnUse" x1="0" y1="6" x2="0" y2="42">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="44%" stopColor="#FFFFFF" />
        <stop offset="52%" stopColor="var(--theme-split-mid, #F5E6A8)" />
        <stop offset="64%" stopColor="var(--theme-split-color, #D4AF37)" />
        <stop offset="100%" stopColor="var(--theme-split-deep, #8C6A1D)" />
      </linearGradient>
    </defs>
  );
}

/** Style 5 - Geometric Modern: Live TV (Sharp angular architectural TV with geometric wedge signals & crisp cutout) */
export function LiveTVIconStyle5({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = useGeoIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible achour-icon-svg ${className}`}
      style={{ color: 'var(--theme-primary, #D4AF37)' }}
    >
      <GeoDefs gSplit={gSplit} />
      {/* Sharp Chevron V-Antenna */}
      <polygon points="15,6 18.5,6 24,13 29.5,6 33,6 25.8,14.5 22.2,14.5" fill={`url(#${gSplit})`} />
      {/* Angular Broadcast Signal Wedges */}
      <polygon points="36,8 41,7 39.5,12" fill={`url(#${gSplit})`} />
      <polygon points="40,4.5 45,3.5 43.5,8.5" fill={`url(#${gSplit})`} fillOpacity="0.82" />
      {/* Chamfered Geometric TV Frame */}
      <polygon points="5,15 43,15 43,34 39,38 5,38" fill={`url(#${gSplit})`} />
      {/* Dark Contrast Screen Block */}
      <polygon points="8.5,18.5 31.5,18.5 31.5,34.5 8.5,34.5" fill="rgba(6,8,14,0.78)" />
      {/* Sharp Geometric Play Wedge */}
      <polygon points="16.5,22 25.5,26.5 16.5,31" fill={`url(#${gSplit})`} />
      {/* Geometric Control Squares */}
      <rect x="35" y="19" width="4.5" height="4.5" fill={`url(#${gSplit})`} />
      <rect x="35" y="26" width="4.5" height="4.5" fill="var(--theme-split-deep, #8C6A1D)" />
      {/* Angular Trapezoid Base */}
      <polygon points="16,38 32,38 35,43 13,43" fill="var(--theme-split-color, #D4AF37)" />
    </svg>
  );
}

/** Style 5 - Geometric Modern: Movies (Modular geometric film strip built from sharp blocks & square sprockets) */
export function MoviesIconStyle5({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = useGeoIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible achour-icon-svg ${className}`}
      style={{ color: 'var(--theme-primary, #D4AF37)' }}
    >
      <GeoDefs gSplit={gSplit} />
      {/* Top & Bottom Modular Film Strips */}
      <polygon points="5,10 43,10 43,38 5,38" fill={`url(#${gSplit})`} />
      {/* Left & Right Dark Sprocket Strips */}
      <rect x="7" y="12.5" width="4.5" height="4.5" fill="rgba(6,8,14,0.82)" />
      <rect x="7" y="21.8" width="4.5" height="4.5" fill="rgba(6,8,14,0.82)" />
      <rect x="7" y="31" width="4.5" height="4.5" fill="rgba(6,8,14,0.82)" />
      <rect x="36.5" y="12.5" width="4.5" height="4.5" fill="rgba(6,8,14,0.82)" />
      <rect x="36.5" y="21.8" width="4.5" height="4.5" fill="rgba(6,8,14,0.82)" />
      <rect x="36.5" y="31" width="4.5" height="4.5" fill="rgba(6,8,14,0.82)" />
      {/* Split Architectural Cinema Frame */}
      <rect x="14.5" y="13" width="19" height="22" fill="rgba(6,8,14,0.78)" />
      {/* Bold Geometric Play Triangle */}
      <polygon points="20,18.5 30,24 20,29.5" fill={`url(#${gSplit})`} />
    </svg>
  );
}

/** Style 5 - Geometric Modern: Series (Sharp Bauhaus chamfered screen block) */
export function SeriesIconStyle5({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = useGeoIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible achour-icon-svg ${className}`}
      style={{ color: 'var(--theme-primary, #D4AF37)' }}
    >
      <GeoDefs gSplit={gSplit} />
      {/* Front Primary Block with Chamfer Cut */}
      <polygon points="7,11.5 41,11.5 41,31.5 35.5,37 7,37" fill={`url(#${gSplit})`} />
      <rect x="11" y="15.5" width="26" height="17" fill="rgba(6,8,14,0.78)" />
      <polygon points="20.5,19.5 29.5,24 20.5,28.5" fill={`url(#${gSplit})`} />
    </svg>
  );
}

/** Style 5 - Geometric Modern: Playlist (Crisp chamfered geometric bars + bold angular plus block) */
export function PlaylistIconStyle5({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = useGeoIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible achour-icon-svg ${className}`}
      style={{ color: 'var(--theme-primary, #D4AF37)' }}
    >
      <GeoDefs gSplit={gSplit} />
      {/* Chamfered Angled Queue Bars */}
      <polygon points="6,10 38,10 35,15.5 6,15.5" fill={`url(#${gSplit})`} />
      <polygon points="6,19.5 31,19.5 28,25 6,25" fill={`url(#${gSplit})`} />
      <polygon points="6,29 23,29 20,34.5 6,34.5" fill={`url(#${gSplit})`} />
      {/* Bold Geometric Cross/Plus */}
      <polygon points="33,22 38,22 38,29 44,29 44,34 38,34 38,41 33,41 33,34 27,34 27,29 33,29" fill={`url(#${gSplit})`} />
    </svg>
  );
}

/** Style 5 - Geometric Modern: Settings (Crisp 6-tooth hexagonal industrial Bauhaus cog) */
export function SettingsIconStyle5({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = useGeoIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible achour-icon-svg ${className}`}
      style={{ color: 'var(--theme-primary, #D4AF37)' }}
    >
      <GeoDefs gSplit={gSplit} />
      {/* 6 Sharp Architectural Teeth */}
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <polygon
          key={deg}
          points="20,4 28,4 30,11 18,11"
          transform={`rotate(${deg} 24 24)`}
          fill={`url(#${gSplit})`}
        />
      ))}
      {/* Crisp Hexagonal Gear Core */}
      <polygon points="24,9 37,16.5 37,31.5 24,39 11,31.5 11,16.5" fill={`url(#${gSplit})`} />
      {/* Dark Hexagonal Bore */}
      <polygon points="24,16 31,20 31,28 24,32 17,28 17,20" fill="rgba(6,8,14,0.8)" />
      {/* Center Geometric Dot */}
      <polygon points="24,20.5 27.5,24 24,27.5 20.5,24" fill={`url(#${gSplit})`} />
    </svg>
  );
}
