import React, { useId } from 'react';
import { StyledIconProps } from './types';

function useMinIds() {
  const id = useId().replace(/:/g, '');
  return {
    gSplit: `s9_split_${id}`,
  };
}

function MinDefs({ gSplit }: { gSplit: string }) {
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

/** Style 9 - Minimal Premium: Live TV (Balanced refined stroke TV screen, sleek V-antenna & minimalist broadcast wave) */
export function LiveTVIconStyle9({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = useMinIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible achour-icon-svg ${className}`}
      style={{ color: 'var(--theme-primary, #D4AF37)' }}
      fill="none"
    >
      <MinDefs gSplit={gSplit} />
      <path d="M17.5 8L24 14.5L30.5 8" stroke={`url(#${gSplit})`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M35 8.5A6 6 0 0 1 38.5 12" stroke={`url(#${gSplit})`} strokeWidth="1.8" strokeLinecap="round" />
      <rect x="6.5" y="14.5" width="35" height="22" rx="4.5" stroke={`url(#${gSplit})`} strokeWidth="2.1" />
      <polygon points="21,21.5 28.5,25.5 21,29.5" fill={`url(#${gSplit})`} />
      <path d="M16 41H32" stroke={`url(#${gSplit})`} strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  );
}

/** Style 9 - Minimal Premium: Movies (Clean optical-balance cinema clapperboard with crisp lines) */
export function MoviesIconStyle9({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = useMinIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible achour-icon-svg ${className}`}
      style={{ color: 'var(--theme-primary, #D4AF37)' }}
      fill="none"
    >
      <MinDefs gSplit={gSplit} />
      <rect x="7" y="18" width="34" height="21" rx="4" stroke={`url(#${gSplit})`} strokeWidth="2.1" />
      <path d="M7 18L39.5 10.5" stroke={`url(#${gSplit})`} strokeWidth="2.1" strokeLinecap="round" />
      <path d="M15.5 16L19 20.5M26.5 13.5L30 18" stroke={`url(#${gSplit})`} strokeWidth="2" strokeLinecap="round" />
      <polygon points="21,24.2 28.5,28.5 21,32.8" fill={`url(#${gSplit})`} />
    </svg>
  );
}

/** Style 9 - Minimal Premium: Series (Refined minimal episode screen with balanced spacing) */
export function SeriesIconStyle9({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = useMinIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible achour-icon-svg ${className}`}
      style={{ color: 'var(--theme-primary, #D4AF37)' }}
      fill="none"
    >
      <MinDefs gSplit={gSplit} />
      <rect x="7" y="12" width="34" height="24" rx="4.5" stroke={`url(#${gSplit})`} strokeWidth="2.1" />
      <polygon points="20.5,19.5 29,24 20.5,28.5" fill={`url(#${gSplit})`} />
    </svg>
  );
}

/** Style 9 - Minimal Premium: Playlist (Balanced minimal queue bars + clean play symbol) */
export function PlaylistIconStyle9({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = useMinIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible achour-icon-svg ${className}`}
      style={{ color: 'var(--theme-primary, #D4AF37)' }}
      fill="none"
    >
      <MinDefs gSplit={gSplit} />
      <path d="M8 13.5H36" stroke={`url(#${gSplit})`} strokeWidth="2.3" strokeLinecap="round" />
      <path d="M8 22.5H28" stroke={`url(#${gSplit})`} strokeWidth="2.3" strokeLinecap="round" />
      <path d="M8 31.5H22" stroke={`url(#${gSplit})`} strokeWidth="2.3" strokeLinecap="round" />
      <polygon points="30,27 39.5,32.5 30,38" fill={`url(#${gSplit})`} />
    </svg>
  );
}

/** Style 9 - Minimal Premium: Settings (Slender Swiss-precision 6-tooth gear with wide open inner ring) */
export function SettingsIconStyle9({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = useMinIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible achour-icon-svg ${className}`}
      style={{ color: 'var(--theme-primary, #D4AF37)' }}
      fill="none"
    >
      <MinDefs gSplit={gSplit} />
      <path
        d="M20.5 6.5H27.5L28.8 11.2C30.4 11.8 31.8 12.6 33.1 13.7L37.8 12.2L41.3 18.2L37.8 21.7C38 22.4 38.1 23.2 38.1 24C38.1 24.8 38 25.6 37.8 26.3L41.3 29.8L37.8 35.8L33.1 34.3C31.8 35.4 30.4 36.2 28.8 36.8L27.5 41.5H20.5L19.2 36.8C17.6 36.2 16.2 35.4 14.9 34.3L10.2 35.8L6.7 29.8L10.2 26.3C10 25.6 9.9 24.8 9.9 24C9.9 23.2 10 22.4 10.2 21.7L6.7 18.2L10.2 12.2L14.9 13.7C16.2 12.6 17.6 11.8 19.2 11.2L20.5 6.5Z"
        stroke={`url(#${gSplit})`}
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="24" r="6" stroke={`url(#${gSplit})`} strokeWidth="2.1" />
    </svg>
  );
}
