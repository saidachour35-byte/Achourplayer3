import React, { useId } from 'react';
import { StyledIconProps } from './types';
import { isTVOrLowEndDevice } from '../../utils/tvNavigation';

function useNeonIds() {
  const id = useId().replace(/:/g, '');
  return {
    fGlow: `s4_glow_${id}`,
    gSplit: `s4_split_${id}`,
  };
}

function NeonDefs({ fGlow, gSplit }: { fGlow: string; gSplit: string }) {
  const tvPerf = isTVOrLowEndDevice();
  return (
    <defs>
      <linearGradient id={gSplit} gradientUnits="userSpaceOnUse" x1="0" y1="6" x2="0" y2="42">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="44%" stopColor="#FFFFFF" />
        <stop offset="52%" stopColor="var(--theme-split-mid, #F5E6A8)" />
        <stop offset="64%" stopColor="var(--theme-split-color, #D4AF37)" />
        <stop offset="100%" stopColor="var(--theme-split-deep, #8C6A1D)" />
      </linearGradient>
      {!tvPerf && (
        <filter id={fGlow} x="-35%" y="-35%" width="170%" height="170%">
          <feGaussianBlur stdDeviation="1.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      )}
    </defs>
  );
}

/** Style 4 - Neon Line: Live TV (Crisp thin glowing outline TV with antenna, broadcast arcs & open play contour) */
export function LiveTVIconStyle4({ sizePx = 42, className = '' }: StyledIconProps) {
  const { fGlow, gSplit } = useNeonIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible achour-icon-svg-glow ${className}`}
      style={{
        color: 'var(--theme-primary, #D4AF37)',
      }}
    >
      <NeonDefs fGlow={fGlow} gSplit={gSplit} />
      <g filter={isTVOrLowEndDevice() ? undefined : `url(#${fGlow})`} fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Neon V-Antenna */}
        <path d="M16 7.5L24 14.5L32 7.5" stroke={`url(#${gSplit})`} strokeWidth="1.75" />
        {/* Dual Signal Arcs */}
        <path d="M35.5 8.5A6 6 0 0 1 39 12.5" stroke={`url(#${gSplit})`} strokeWidth="1.6" />
        <path d="M38 5.5A9.5 9.5 0 0 1 42.5 11.5" stroke={`url(#${gSplit})`} strokeWidth="1.4" />
        {/* Clean Open Neon Screen Chassis */}
        <rect x="6" y="14.5" width="36" height="22.5" rx="4" stroke={`url(#${gSplit})`} strokeWidth="1.85" />
        {/* Bright Inner Play Contour */}
        <polygon points="20.5,21.5 29,25.8 20.5,30" stroke={`url(#${gSplit})`} strokeWidth="1.65" />
        {/* Minimal Neon Base Bar */}
        <path d="M15 41.5H33" stroke={`url(#${gSplit})`} strokeWidth="1.85" />
      </g>
    </svg>
  );
}

/** Style 4 - Neon Line: Movies (Thin glowing cinema clapperboard contour with crisp diagonal clap stripes) */
export function MoviesIconStyle4({ sizePx = 42, className = '' }: StyledIconProps) {
  const { fGlow, gSplit } = useNeonIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible achour-icon-svg-glow ${className}`}
      style={{
        color: 'var(--theme-primary, #D4AF37)',
      }}
    >
      <NeonDefs fGlow={fGlow} gSplit={gSplit} />
      <g filter={isTVOrLowEndDevice() ? undefined : `url(#${fGlow})`} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <rect x="7" y="18" width="34" height="21.5" rx="3.5" stroke={`url(#${gSplit})`} strokeWidth="1.85" />
        <path d="M7 18L37.5 8.5L39.5 14L9 23.5" stroke={`url(#${gSplit})`} strokeWidth="1.7" />
        <path d="M14.5 16L17.5 20.8M23.5 13.2L26.5 18M32 10.5L35 15.2" stroke={`url(#${gSplit})`} strokeWidth="1.6" />
        <polygon points="20.5,24 29,28.8 20.5,33.5" stroke={`url(#${gSplit})`} strokeWidth="1.65" />
      </g>
    </svg>
  );
}

/** Style 4 - Neon Line: Series (Sleek glowing wireframe screen with play contour) */
export function SeriesIconStyle4({ sizePx = 42, className = '' }: StyledIconProps) {
  const { fGlow, gSplit } = useNeonIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible achour-icon-svg-glow ${className}`}
      style={{
        color: 'var(--theme-primary, #D4AF37)',
      }}
    >
      <NeonDefs fGlow={fGlow} gSplit={gSplit} />
      <g filter={isTVOrLowEndDevice() ? undefined : `url(#${fGlow})`} fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Front Primary Screen */}
        <rect x="7.5" y="11.5" width="33" height="24" rx="3.8" stroke={`url(#${gSplit})`} strokeWidth="1.9" />
        {/* Neon Play Triangle */}
        <polygon points="20.2,19 29.2,23.5 20.2,28" stroke={`url(#${gSplit})`} strokeWidth="1.7" />
        <path d="M17.5 39.5H30.5" stroke={`url(#${gSplit})`} strokeWidth="1.7" />
      </g>
    </svg>
  );
}

/** Style 4 - Neon Line: Playlist (Glowing thin list lines + crisp open play/plus symbol, zero box) */
export function PlaylistIconStyle4({ sizePx = 42, className = '' }: StyledIconProps) {
  const { fGlow, gSplit } = useNeonIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible achour-icon-svg-glow ${className}`}
      style={{
        color: 'var(--theme-primary, #D4AF37)',
      }}
    >
      <NeonDefs fGlow={fGlow} gSplit={gSplit} />
      <g filter={isTVOrLowEndDevice() ? undefined : `url(#${fGlow})`} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 13H35" stroke={`url(#${gSplit})`} strokeWidth="2.1" />
        <path d="M7 22H29" stroke={`url(#${gSplit})`} strokeWidth="2.1" />
        <path d="M7 31H22" stroke={`url(#${gSplit})`} strokeWidth="2.1" />
        {/* Glowing Neon Play Triangle + Subtle Plus Accent */}
        <polygon points="29,26 40,32.5 29,39" stroke={`url(#${gSplit})`} strokeWidth="1.9" />
        <path d="M38 18V24M35 21H41" stroke={`url(#${gSplit})`} strokeWidth="1.7" />
      </g>
    </svg>
  );
}

/** Style 4 - Neon Line: Settings (Crisp thin neon 8-tooth gear outline with luminous inner core rings) */
export function SettingsIconStyle4({ sizePx = 42, className = '' }: StyledIconProps) {
  const { fGlow, gSplit } = useNeonIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible achour-icon-svg-glow ${className}`}
      style={{
        color: 'var(--theme-primary, #D4AF37)',
      }}
    >
      <NeonDefs fGlow={fGlow} gSplit={gSplit} />
      <g filter={isTVOrLowEndDevice() ? undefined : `url(#${fGlow})`} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M21 5.5H27L28.1 9.8C29.4 10.2 30.6 10.9 31.6 11.8L35.6 9.8L39.8 14L37.8 18C38.7 19 39.4 20.2 39.8 21.5L44 22.6V28.6L39.8 29.7C39.4 31 38.7 32.2 37.8 33.2L39.8 37.2L35.6 41.4L31.6 39.4C30.6 40.3 29.4 41 28.1 41.4L27 45.5H21L19.9 41.4C18.6 41 17.4 40.3 16.4 39.4L12.4 41.4L8.2 37.2L10.2 33.2C9.3 32.2 8.6 31 8.2 29.7L4 28.6V22.6L8.2 21.5C8.6 20.2 9.3 19 10.2 18L8.2 14L12.4 9.8L16.4 11.8C17.4 10.9 18.6 10.2 19.9 9.8L21 5.5Z"
          stroke={`url(#${gSplit})`}
          strokeWidth="1.8"
        />
        <circle cx="24" cy="25.5" r="7.2" stroke={`url(#${gSplit})`} strokeWidth="1.65" />
        <circle cx="24" cy="25.5" r="2.6" stroke={`url(#${gSplit})`} strokeWidth="1.4" />
      </g>
    </svg>
  );
}
