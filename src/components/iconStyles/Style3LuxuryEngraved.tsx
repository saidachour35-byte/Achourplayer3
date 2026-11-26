import React, { useId } from 'react';
import { StyledIconProps } from './types';

function useEngravedIds() {
  const id = useId().replace(/:/g, '');
  return {
    gMetal: `s3_met_${id}`,
    gLine: `s3_ln_${id}`,
  };
}

function EngravedDefs({ gMetal, gLine }: ReturnType<typeof useEngravedIds>) {
  return (
    <defs>
      <linearGradient id={gMetal} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="42%" stopColor="#FFFFFF" />
        <stop offset="52%" stopColor="var(--theme-split-mid, #F5E6A8)" />
        <stop offset="65%" stopColor="var(--theme-split-color, #D4AF37)" />
        <stop offset="100%" stopColor="var(--theme-split-deep, #8C6A1D)" />
      </linearGradient>
      <linearGradient id={gLine} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="44%" stopColor="#FFFFFF" />
        <stop offset="56%" stopColor="var(--theme-split-mid, #F5E6A8)" />
        <stop offset="100%" stopColor="var(--theme-split-color, #D4AF37)" />
      </linearGradient>
    </defs>
  );
}

/** Style 3 - Luxury Engraved: Live TV (Finely engraved TV chassis with double filigree trim, V-antenna & broadcast waves) */
export function LiveTVIconStyle3({ sizePx = 42, className = '' }: StyledIconProps) {
  const ids = useEngravedIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible ${className}`}
      style={{ color: 'var(--theme-primary, #D4AF37)' }}
    >
      <EngravedDefs {...ids} />
      {/* Engraved V-Antenna with Filigree Finials & Broadcast Arcs */}
      <path d="M16.5 7.5L24 14L31.5 7.5" fill="none" stroke={`url(#${ids.gMetal})`} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="7" r="1.4" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.1" />
      <circle cx="32" cy="7" r="1.4" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.1" />
      <path d="M35.5 8.5A6.5 6.5 0 0 1 38.8 12.5" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M38 5.5A10 10 0 0 1 42 11.5" fill="none" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1.1" strokeLinecap="round" />
      {/* Outer Engraved TV Silhouette */}
      <rect x="5.5" y="14" width="37" height="24" rx="4" fill="currentColor" fillOpacity="0.12" stroke={`url(#${ids.gMetal})`} strokeWidth="1.8" />
      {/* Hairline Inner Filigree Groove */}
      <rect x="7.8" y="16.2" width="32.4" height="19.6" rx="2.6" fill="none" stroke={`url(#${ids.gLine})`} strokeWidth="0.9" strokeOpacity="0.85" />
      {/* Engraved Screen Frame */}
      <rect x="10.2" y="18.4" width="21" height="15.2" rx="1.8" fill="rgba(6,8,14,0.45)" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.1" />
      {/* Fine Engraved Play Mark */}
      <polygon points="18.2,22.5 24.8,26 18.2,29.5" fill="currentColor" fillOpacity="0.35" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.2" strokeLinejoin="round" />
      {/* Fine Engraved Side Speaker Louvers & Dials */}
      <circle cx="35.8" cy="21" r="1.7" fill="none" stroke={`url(#${ids.gMetal})`} strokeWidth="1.1" />
      <circle cx="35.8" cy="26" r="1.7" fill="none" stroke={`url(#${ids.gMetal})`} strokeWidth="1.1" />
      <path d="M33.6 29.8H38M33.6 32H38" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      {/* Fine Engraved Stand */}
      <path d="M18 38L16 41.5H32L30 38" fill="none" stroke={`url(#${ids.gMetal})`} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/** Style 3 - Luxury Engraved: Movies (Finely engraved horizontal cinema film strip with filigree sprockets) */
export function MoviesIconStyle3({ sizePx = 42, className = '' }: StyledIconProps) {
  const ids = useEngravedIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible ${className}`}
      style={{ color: 'var(--theme-primary, #D4AF37)' }}
    >
      <EngravedDefs {...ids} />
      {/* Outer Engraved Film Strip */}
      <rect x="5" y="10.5" width="38" height="27" rx="3" fill="currentColor" fillOpacity="0.12" stroke={`url(#${ids.gMetal})`} strokeWidth="1.8" />
      {/* Double Engraved Sprocket Rails */}
      <line x1="12.5" y1="10.5" x2="12.5" y2="37.5" stroke={`url(#${ids.gLine})`} strokeWidth="1.1" />
      <line x1="35.5" y1="10.5" x2="35.5" y2="37.5" stroke={`url(#${ids.gLine})`} strokeWidth="1.1" />
      {/* Fine Milled Sprocket Holes */}
      {[14, 22, 30].map((y) => (
        <React.Fragment key={y}>
          <rect x="7.5" y={y} width="2.8" height="3.5" rx="0.7" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1" />
          <rect x="37.7" y={y} width="2.8" height="3.5" rx="0.7" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1" />
        </React.Fragment>
      ))}
      {/* Engraved Center Cinema Aperture */}
      <rect x="15" y="13.5" width="18" height="21" rx="1.6" fill="rgba(6,8,14,0.42)" stroke={`url(#${ids.gMetal})`} strokeWidth="1.1" />
      <rect x="16.8" y="15.3" width="14.4" height="17.4" rx="1" fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="0.75" />
      {/* Filigree Play Triangle */}
      <polygon points="21,19.5 29,24 21,28.5" fill="currentColor" fillOpacity="0.3" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

/** Style 3 - Luxury Engraved: Series (Engraved hero episode plate with hairline inner filigree) */
export function SeriesIconStyle3({ sizePx = 42, className = '' }: StyledIconProps) {
  const ids = useEngravedIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible ${className}`}
      style={{ color: 'var(--theme-primary, #D4AF37)' }}
    >
      <EngravedDefs {...ids} />
      {/* Hero Engraved Plate */}
      <rect x="7.5" y="11" width="33" height="24" rx="3.2" fill="currentColor" fillOpacity="0.14" stroke={`url(#${ids.gMetal})`} strokeWidth="1.8" />
      {/* Inner Filigree Line */}
      <rect x="10.2" y="13.8" width="27.6" height="18.4" rx="2" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="0.9" strokeOpacity="0.8" />
      {/* Fine Corner Ticks */}
      <circle cx="12.3" cy="15.8" r="0.8" fill="var(--theme-accent, #F5E6A8)" />
      <circle cx="35.7" cy="15.8" r="0.8" fill="var(--theme-accent, #F5E6A8)" />
      {/* Engraved Play Symbol */}
      <polygon points="20.2,18.8 28.8,23 20.2,27.2" fill="currentColor" fillOpacity="0.35" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.3" strokeLinejoin="round" />
      {/* Engraved Chapter Dots Below */}
      <circle cx="19" cy="39.5" r="1.2" fill="var(--theme-accent, #F5E6A8)" />
      <circle cx="24" cy="39.5" r="1.2" fill="currentColor" />
      <circle cx="29" cy="39.5" r="1.2" fill="var(--theme-secondary, #8C6A1D)" />
    </svg>
  );
}

/** Style 3 - Luxury Engraved: Playlist (Double-ruled metallic queue bars + engraved circular play crest) */
export function PlaylistIconStyle3({ sizePx = 42, className = '' }: StyledIconProps) {
  const ids = useEngravedIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible ${className}`}
      style={{ color: 'var(--theme-primary, #D4AF37)' }}
    >
      <EngravedDefs {...ids} />
      {/* Engraved Double-Line Queue Tracks */}
      {[12, 22, 32].map((y, idx) => {
        const w = idx === 0 ? 31 : idx === 1 ? 24 : 18;
        return (
          <g key={y}>
            <rect x="6" y={y - 2.3} width={w} height="4.6" rx="2.3" fill="currentColor" fillOpacity="0.14" stroke={`url(#${ids.gMetal})`} strokeWidth="1.3" />
            <line x1="8.5" y1={y} x2={6 + w - 2.5} y2={y} stroke="var(--theme-accent, #F5E6A8)" strokeWidth="0.7" strokeOpacity="0.8" />
          </g>
        );
      })}
      {/* Engraved Play Medallion */}
      <circle cx="34.5" cy="31.5" r="8.5" fill="currentColor" fillOpacity="0.16" stroke={`url(#${ids.gMetal})`} strokeWidth="1.7" />
      <circle cx="34.5" cy="31.5" r="6.3" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="0.85" strokeDasharray="2 1.5" />
      <polygon points="32.5,28 38.2,31.5 32.5,35" fill="currentColor" fillOpacity="0.4" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}

/** Style 3 - Luxury Engraved: Settings (Watchmaker's guilloche engraved 10-tooth gear with concentric hairline rings) */
export function SettingsIconStyle3({ sizePx = 42, className = '' }: StyledIconProps) {
  const ids = useEngravedIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible ${className}`}
      style={{ color: 'var(--theme-primary, #D4AF37)' }}
    >
      <EngravedDefs {...ids} />
      {/* 10 Fine Milled Gear Teeth */}
      {[0, 36, 72, 108, 144, 180, 216, 252, 288, 324].map((deg) => (
        <rect
          key={deg}
          x="22"
          y="4.5"
          width="4"
          height="5.5"
          rx="1"
          transform={`rotate(${deg} 24 24)`}
          fill="currentColor"
          fillOpacity="0.22"
          stroke={`url(#${ids.gMetal})`}
          strokeWidth="1.2"
        />
      ))}
      {/* Main Gear Ring */}
      <circle cx="24" cy="24" r="14.5" fill="currentColor" fillOpacity="0.14" stroke={`url(#${ids.gMetal})`} strokeWidth="1.8" />
      {/* Concentric Hairline Filigree Rings */}
      <circle cx="24" cy="24" r="11.5" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="0.85" strokeDasharray="2.5 1.8" />
      <circle cx="24" cy="24" r="7.5" fill="rgba(6,8,14,0.45)" stroke={`url(#${ids.gLine})`} strokeWidth="1.4" />
      {/* Engraved Cardinal Spokes */}
      <path d="M24 12.5V16.5M24 31.5V35.5M12.5 24H16.5M31.5 24H35.5" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1" strokeLinecap="round" />
      <circle cx="24" cy="24" r="2.8" fill="currentColor" fillOpacity="0.45" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.1" />
    </svg>
  );
}
