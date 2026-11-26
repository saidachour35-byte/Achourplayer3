import React, { useId } from 'react';
import { StyledIconProps } from './types';

function useCrystalIds() {
  const id = useId().replace(/:/g, '');
  return {
    gBright: `s7_br_${id}`,
    gMid: `s7_md_${id}`,
    gDeep: `s7_dp_${id}`,
  };
}

function CrystalDefs({ gBright, gMid, gDeep }: ReturnType<typeof useCrystalIds>) {
  return (
    <defs>
      <linearGradient id={gBright} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="52%" stopColor="#FFFFFF" />
        <stop offset="76%" stopColor="var(--theme-split-mid, #F5E6A8)" />
        <stop offset="100%" stopColor="var(--theme-split-color, #D4AF37)" />
      </linearGradient>
      <linearGradient id={gMid} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="38%" stopColor="#FFFFFF" />
        <stop offset="52%" stopColor="var(--theme-split-mid, #F5E6A8)" />
        <stop offset="72%" stopColor="var(--theme-split-color, #D4AF37)" />
        <stop offset="100%" stopColor="var(--theme-split-deep, #8C6A1D)" />
      </linearGradient>
      <linearGradient id={gDeep} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="var(--theme-split-mid, #F5E6A8)" />
        <stop offset="40%" stopColor="var(--theme-split-color, #D4AF37)" />
        <stop offset="100%" stopColor="var(--theme-split-deep, #8C6A1D)" />
      </linearGradient>
    </defs>
  );
}

/** Style 7 - Crystal Gold: Live TV (Faceted low-poly crystalline TV & sharp diamond broadcast shards) */
export function LiveTVIconStyle7({ sizePx = 42, className = '' }: StyledIconProps) {
  const ids = useCrystalIds();
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
      <CrystalDefs {...ids} />
      {/* Crystal Prism Antenna & Shard Signals */}
      <polygon points="15,6 18,6 24,13 29.5,6 32.5,6 25,14.5 23,14.5" fill={`url(#${ids.gBright})`} />
      <polygon points="36,7 41.5,5.5 39,11.5" fill={`url(#${ids.gBright})`} />
      <polygon points="41.5,10 45,9.5 43,14" fill={`url(#${ids.gMid})`} />
      {/* Faceted Crystal TV Chassis (multi-polygon prism faces) */}
      <polygon points="5,15 26,15 19,26 5,26" fill={`url(#${ids.gBright})`} />
      <polygon points="26,15 43,15 43,27 32,26 19,26" fill={`url(#${ids.gMid})`} />
      <polygon points="5,26 19,26 24,38 5,38" fill={`url(#${ids.gMid})`} />
      <polygon points="19,26 43,27 43,38 24,38" fill={`url(#${ids.gDeep})`} />
      {/* Crisp Crystal Ridge Highlight Lines */}
      <polyline points="5,15 43,15 43,38 5,38 5,15" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1" />
      <line x1="26" y1="15" x2="19" y2="26" stroke="#FFFFFF" strokeOpacity="0.6" strokeWidth="0.9" />
      {/* Faceted Dark Gem Screen */}
      <polygon points="9,18.5 31.5,18.5 31.5,34.5 9,34.5" fill="rgba(5,8,14,0.72)" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="0.9" />
      {/* Faceted Play Crystal */}
      <polygon points="17,22 25.5,26.5 17,26.5" fill={`url(#${ids.gBright})`} />
      <polygon points="17,26.5 25.5,26.5 17,31" fill={`url(#${ids.gMid})`} />
      {/* Faceted Stand */}
      <polygon points="17,38 24,38 20,42.5 14,42.5" fill={`url(#${ids.gMid})`} />
      <polygon points="24,38 31,38 34,42.5 20,42.5" fill={`url(#${ids.gDeep})`} />
    </svg>
  );
}

/** Style 7 - Crystal Gold: Movies (Multi-faceted gemstone clapperboard with prismatic shard reflections) */
export function MoviesIconStyle7({ sizePx = 42, className = '' }: StyledIconProps) {
  const ids = useCrystalIds();
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
      <CrystalDefs {...ids} />
      {/* Faceted Crystal Body Shards */}
      <polygon points="7,17 26,17 18,29 7,28" fill={`url(#${ids.gBright})`} />
      <polygon points="26,17 41,17 41,28 18,29" fill={`url(#${ids.gMid})`} />
      <polygon points="7,28 18,29 24,39 7,39" fill={`url(#${ids.gMid})`} />
      <polygon points="18,29 41,28 41,39 24,39" fill={`url(#${ids.gDeep})`} />
      <rect x="7" y="17" width="34" height="22" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1" />
      {/* Crystal Clapper Arm Facets */}
      <polygon points="7,17 17,13.5 19,17 9,21" fill={`url(#${ids.gBright})`} />
      <polygon points="17,13.5 28,10 30,13.5 19,17" fill={`url(#${ids.gMid})`} />
      <polygon points="28,10 38,7 40,12 30,13.5" fill={`url(#${ids.gBright})`} />
      {/* Faceted Play Gem */}
      <polygon points="19,22.5 30,28 19,28" fill="rgba(5,8,14,0.78)" />
      <polygon points="19,28 30,28 19,33.5" fill="rgba(5,8,14,0.9)" />
      <polygon points="20.5,24 27.5,28 20.5,28" fill="#FFFFFF" fillOpacity="0.85" />
      <polygon points="20.5,28 27.5,28 20.5,32" fill="var(--theme-accent, #F5E6A8)" />
    </svg>
  );
}

/** Style 7 - Crystal Gold: Series (Faceted crystalline episode screen with light shards) */
export function SeriesIconStyle7({ sizePx = 42, className = '' }: StyledIconProps) {
  const ids = useCrystalIds();
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
      <CrystalDefs {...ids} />
      {/* Crystal Front Screen Split Facets */}
      <polygon points="7,12 28,12 19,25 7,25" fill={`url(#${ids.gBright})`} />
      <polygon points="28,12 41,12 41,36 19,25" fill={`url(#${ids.gMid})`} />
      <polygon points="7,25 19,25 41,36 7,36" fill={`url(#${ids.gDeep})`} />
      <rect x="7" y="12" width="34" height="24" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1" />
      {/* Inner Faceted Play Diamond */}
      <polygon points="19.5,18.2 30.5,24 19.5,29.8" fill="rgba(5,8,14,0.72)" stroke="#FFFFFF" strokeOpacity="0.7" strokeWidth="0.9" />
    </svg>
  );
}

/** Style 7 - Crystal Gold: Playlist (Faceted prism-cut bars + cut gemstone play diamond) */
export function PlaylistIconStyle7({ sizePx = 42, className = '' }: StyledIconProps) {
  const ids = useCrystalIds();
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
      <CrystalDefs {...ids} />
      {/* Faceted Bevel Queue Bars */}
      <g>
        <polygon points="6,10 36,10 34,13 8,13" fill={`url(#${ids.gBright})`} />
        <polygon points="8,13 34,13 36,16 6,16" fill={`url(#${ids.gDeep})`} />
      </g>
      <g>
        <polygon points="6,19.5 29,19.5 27,22.5 8,22.5" fill={`url(#${ids.gBright})`} />
        <polygon points="8,22.5 27,22.5 29,25.5 6,25.5" fill={`url(#${ids.gMid})`} />
      </g>
      <g>
        <polygon points="6,29 22,29 20,32 8,32" fill={`url(#${ids.gMid})`} />
        <polygon points="8,32 20,32 22,35 6,35" fill={`url(#${ids.gDeep})`} />
      </g>
      {/* Multi-Faceted Crystal Play Gem */}
      <polygon points="34,21 43,27 40,39 28,39 25,27" fill={`url(#${ids.gBright})`} stroke="var(--theme-accent, #F5E6A8)" strokeWidth="0.9" />
      <polygon points="34,21 43,27 34,30" fill="#FFFFFF" fillOpacity="0.35" />
      <polygon points="34,30 43,27 40,39 34,39" fill={`url(#${ids.gDeep})`} fillOpacity="0.65" />
      <polygon points="31.5,27 38,31 31.5,35" fill="rgba(5,8,14,0.8)" />
    </svg>
  );
}

/** Style 7 - Crystal Gold: Settings (Gemstone-faceted 8-tooth crystal cog with reflective triangles) */
export function SettingsIconStyle7({ sizePx = 42, className = '' }: StyledIconProps) {
  const ids = useCrystalIds();
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
      <CrystalDefs {...ids} />
      {/* 8 Faceted Crystal Teeth */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => (
        <g key={deg} transform={`rotate(${deg} 24 24)`}>
          <polygon points="21,4 24,4 24,11 19,11" fill={`url(#${i % 2 === 0 ? ids.gBright : ids.gMid})`} />
          <polygon points="24,4 27,4 29,11 24,11" fill={`url(#${i % 2 === 0 ? ids.gMid : ids.gDeep})`} />
        </g>
      ))}
      {/* Faceted Octagon Crystal Body */}
      <polygon points="24,9.5 34.5,13.5 38.5,24 24,24" fill={`url(#${ids.gBright})`} />
      <polygon points="24,9.5 13.5,13.5 9.5,24 24,24" fill={`url(#${ids.gMid})`} />
      <polygon points="9.5,24 13.5,34.5 24,38.5 24,24" fill={`url(#${ids.gMid})`} />
      <polygon points="38.5,24 34.5,34.5 24,38.5 24,24" fill={`url(#${ids.gDeep})`} />
      <polygon
        points="24,9.5 34.5,13.5 38.5,24 34.5,34.5 24,38.5 13.5,34.5 9.5,24 13.5,13.5"
        fill="none"
        stroke="var(--theme-accent, #F5E6A8)"
        strokeWidth="0.9"
      />
      {/* Faceted Center Jewel Bore */}
      <polygon points="24,17 29.5,20 29.5,28 24,31 18.5,28 18.5,20" fill="rgba(5,8,14,0.78)" stroke="#FFFFFF" strokeOpacity="0.6" strokeWidth="0.9" />
    </svg>
  );
}
