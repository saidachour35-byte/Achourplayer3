import React, { useId } from 'react';
import { StyledIconProps } from './types';

function useBrushedIds() {
  const id = useId().replace(/:/g, '');
  return {
    gBrushed: `s8_br_${id}`,
    pBrush: `s8_pt_${id}`,
  };
}

function BrushedDefs({ gBrushed, pBrush }: ReturnType<typeof useBrushedIds>) {
  return (
    <defs>
      <linearGradient id={gBrushed} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="42%" stopColor="#FFFFFF" />
        <stop offset="52%" stopColor="var(--theme-split-mid, #F5E6A8)" />
        <stop offset="65%" stopColor="var(--theme-split-color, #D4AF37)" />
        <stop offset="100%" stopColor="var(--theme-split-deep, #8C6A1D)" />
      </linearGradient>
      <pattern id={pBrush} width="8" height="3" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0.8" x2="8" y2="0.8" stroke="#FFFFFF" strokeOpacity="0.16" strokeWidth="0.7" />
        <line x1="0" y1="2.2" x2="8" y2="2.2" stroke="#000000" strokeOpacity="0.22" strokeWidth="0.7" />
      </pattern>
    </defs>
  );
}

/** Style 8 - Brushed Metal: Live TV (CNC-machined brushed alloy TV housing with milled dial & sheen bands) */
export function LiveTVIconStyle8({ sizePx = 42, className = '' }: StyledIconProps) {
  const ids = useBrushedIds();
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
      <BrushedDefs {...ids} />
      {/* Brushed Alloy Twin Antenna + Broadcast Waves */}
      <path d="M16 6.5L24 13.5L32 6.5" fill="none" stroke={`url(#${ids.gBrushed})`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M36 7.5A6.5 6.5 0 0 1 39.5 12" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.6" strokeLinecap="round" />
      {/* Machined Metal TV Body */}
      <rect x="4.5" y="13.5" width="39" height="25" rx="3.5" fill={`url(#${ids.gBrushed})`} stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.1" />
      {/* Brushed Grain Texture Overlay */}
      <rect x="4.5" y="13.5" width="39" height="25" rx="3.5" fill={`url(#${ids.pBrush})`} />
      {/* Machined Screen Recess */}
      <rect x="8" y="17" width="24" height="18" rx="2" fill="rgba(6,8,14,0.8)" stroke="var(--theme-secondary, #8C6A1D)" strokeWidth="1.4" />
      {/* Stamped Play Relief */}
      <polygon points="17,22 25,26 17,30" fill={`url(#${ids.gBrushed})`} />
      {/* Machined Rotary Knobs & Rivets */}
      <circle cx="37.5" cy="21" r="2.6" fill="rgba(6,8,14,0.72)" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.1" />
      <circle cx="37.5" cy="28.5" r="2.6" fill="rgba(6,8,14,0.72)" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.1" />
      <rect x="14" y="38.5" width="20" height="3.5" rx="1.2" fill={`url(#${ids.gBrushed})`} />
    </svg>
  );
}

/** Style 8 - Brushed Metal: Movies (Machined brushed steel/gold film reel + stamped strip tail) */
export function MoviesIconStyle8({ sizePx = 42, className = '' }: StyledIconProps) {
  const ids = useBrushedIds();
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
      <BrushedDefs {...ids} />
      {/* Stamped Film Strip Tail */}
      <rect x="24" y="32" width="19" height="7" rx="1.5" fill={`url(#${ids.gBrushed})`} stroke="var(--theme-accent, #F5E6A8)" strokeWidth="0.9" />
      <rect x="27" y="34" width="3" height="3" rx="0.5" fill="rgba(6,8,14,0.78)" />
      <rect x="33" y="34" width="3" height="3" rx="0.5" fill="rgba(6,8,14,0.78)" />
      <rect x="38.5" y="34" width="2.5" height="3" rx="0.5" fill="rgba(6,8,14,0.78)" />
      {/* Machined Brushed Cinema Reel */}
      <circle cx="22" cy="23" r="16.5" fill={`url(#${ids.gBrushed})`} stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.2" />
      <circle cx="22" cy="23" r="16.5" fill={`url(#${ids.pBrush})`} />
      {/* Machined Spool Cutouts */}
      <circle cx="22" cy="13.2" r="3.4" fill="rgba(6,8,14,0.8)" stroke="var(--theme-secondary, #8C6A1D)" strokeWidth="1" />
      <circle cx="22" cy="32.8" r="3.4" fill="rgba(6,8,14,0.8)" stroke="var(--theme-secondary, #8C6A1D)" strokeWidth="1" />
      <circle cx="12.2" cy="23" r="3.4" fill="rgba(6,8,14,0.8)" stroke="var(--theme-secondary, #8C6A1D)" strokeWidth="1" />
      <circle cx="31.8" cy="23" r="3.4" fill="rgba(6,8,14,0.8)" stroke="var(--theme-secondary, #8C6A1D)" strokeWidth="1" />
      {/* Center Machined Spindle */}
      <circle cx="22" cy="23" r="3.2" fill="rgba(6,8,14,0.85)" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.2" />
    </svg>
  );
}

/** Style 8 - Brushed Metal: Series (Machined brushed-metal screen plate with corner rivets) */
export function SeriesIconStyle8({ sizePx = 42, className = '' }: StyledIconProps) {
  const ids = useBrushedIds();
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
      <BrushedDefs {...ids} />
      {/* Front Machined Plate */}
      <rect x="7" y="11.5" width="34" height="25" rx="3.2" fill={`url(#${ids.gBrushed})`} stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.2" />
      <rect x="7" y="11.5" width="34" height="25" rx="3.2" fill={`url(#${ids.pBrush})`} />
      {/* Corner Micro-Rivets */}
      <circle cx="9.8" cy="14.3" r="0.95" fill="rgba(6,8,14,0.7)" />
      <circle cx="38.2" cy="14.3" r="0.95" fill="rgba(6,8,14,0.7)" />
      <circle cx="9.8" cy="33.7" r="0.95" fill="rgba(6,8,14,0.7)" />
      <circle cx="38.2" cy="33.7" r="0.95" fill="rgba(6,8,14,0.7)" />
      {/* Machined Screen Window */}
      <rect x="11.5" y="16" width="25" height="16" rx="1.8" fill="rgba(6,8,14,0.8)" stroke="var(--theme-secondary, #8C6A1D)" strokeWidth="1.1" />
      <polygon points="20.5,19.8 29,24 20.5,28.2" fill={`url(#${ids.gBrushed})`} />
    </svg>
  );
}

/** Style 8 - Brushed Metal: Playlist (Stamped brushed-metal track bars + machined play disc) */
export function PlaylistIconStyle8({ sizePx = 42, className = '' }: StyledIconProps) {
  const ids = useBrushedIds();
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
      <BrushedDefs {...ids} />
      {[9.5, 19.5, 29.5].map((y, idx) => {
        const w = idx === 0 ? 30 : idx === 1 ? 23.5 : 18;
        return (
          <g key={y}>
            <rect x="5.5" y={y} width={w} height="6" rx="1.6" fill={`url(#${ids.gBrushed})`} stroke="var(--theme-accent, #F5E6A8)" strokeWidth="0.85" />
            <rect x="5.5" y={y} width={w} height="6" rx="1.6" fill={`url(#${ids.pBrush})`} />
            <circle cx="8.5" cy={y + 3} r="1" fill="rgba(6,8,14,0.72)" />
          </g>
        );
      })}
      {/* Machined Metal Play Disc */}
      <circle cx="34.5" cy="31.5" r="8.8" fill={`url(#${ids.gBrushed})`} stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.2" />
      <circle cx="34.5" cy="31.5" r="8.8" fill={`url(#${ids.pBrush})`} />
      <polygon points="32,27.5 39,31.5 32,35.5" fill="rgba(6,8,14,0.85)" />
    </svg>
  );
}

/** Style 8 - Brushed Metal: Settings (CNC-turned brushed alloy 8-tooth gear with recessed bolt studs) */
export function SettingsIconStyle8({ sizePx = 42, className = '' }: StyledIconProps) {
  const ids = useBrushedIds();
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
      <BrushedDefs {...ids} />
      <g transform="translate(1.2, -1) scale(0.95)">
        <path d={gearPath} fill={`url(#${ids.gBrushed})`} stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.1" strokeLinejoin="round" />
        <path d={gearPath} fill={`url(#${ids.pBrush})`} />
      </g>
      {/* Machined Turned-Metal Grooves & 4 Bolts */}
      <circle cx="24" cy="24" r="10.8" fill="none" stroke="rgba(6,8,14,0.55)" strokeWidth="1.2" />
      <circle cx="24" cy="14.5" r="1.1" fill="rgba(6,8,14,0.75)" />
      <circle cx="24" cy="33.5" r="1.1" fill="rgba(6,8,14,0.75)" />
      <circle cx="14.5" cy="24" r="1.1" fill="rgba(6,8,14,0.75)" />
      <circle cx="33.5" cy="24" r="1.1" fill="rgba(6,8,14,0.75)" />
      <circle cx="24" cy="24" r="6.2" fill="rgba(6,8,14,0.82)" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.2" />
    </svg>
  );
}
