import React, { useId } from 'react';
import { StyledIconProps } from './types';

function useDecoIds() {
  const id = useId().replace(/:/g, '');
  return { gDeco: `s6_dc_${id}` };
}

function DecoDefs({ gDeco }: { gDeco: string }) {
  return (
    <defs>
      <linearGradient id={gDeco} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="42%" stopColor="#FFFFFF" />
        <stop offset="52%" stopColor="var(--theme-split-mid, #F5E6A8)" />
        <stop offset="65%" stopColor="var(--theme-split-color, #D4AF37)" />
        <stop offset="100%" stopColor="var(--theme-split-deep, #8C6A1D)" />
      </linearGradient>
    </defs>
  );
}

/** Style 6 - Art Deco: Live TV (Stepped ziggurat theater TV console with sunburst antenna finial & fluted grille) */
export function LiveTVIconStyle6({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gDeco } = useDecoIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible ${className}`}
      style={{ color: 'var(--theme-primary, #D4AF37)' }}
    >
      <DecoDefs gDeco={gDeco} />
      {/* Sunburst Deco Antenna + Chevron Signals */}
      <path d="M16 7L24 14L32 7" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.7" strokeLinecap="round" />
      <polygon points="24,5 26,8.5 24,11 22,8.5" fill="var(--theme-accent, #F5E6A8)" />
      <path d="M35.5 7.5L39.5 9L38 13" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.5" strokeLinejoin="miter" />
      <path d="M38.5 4.5L43.5 6.2L42 11.2" fill="none" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1.3" />
      {/* Stepped Art Deco Ziggurat Chassis */}
      <polygon
        points="9,14 39,14 39,17 43,17 43,35 39,35 39,38 9,38 9,35 5,35 5,17 9,17"
        fill="currentColor"
        fillOpacity="0.18"
        stroke={`url(#${gDeco})`}
        strokeWidth="1.8"
      />
      {/* Stepped Deco Screen Frame */}
      <polygon
        points="11,18 32,18 32,34 11,34"
        fill="rgba(6,8,14,0.65)"
        stroke="var(--theme-accent, #F5E6A8)"
        strokeWidth="1.2"
      />
      {/* Vertical Fluted Deco Speaker Ribs */}
      <line x1="35" y1="19" x2="35" y2="33" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.3" />
      <line x1="37.5" y1="20.5" x2="37.5" y2="31.5" stroke="currentColor" strokeWidth="1.3" />
      <line x1="40" y1="22" x2="40" y2="30" stroke="var(--theme-secondary, #8C6A1D)" strokeWidth="1.3" />
      {/* Deco Play Chevron */}
      <polygon points="18.5,21.5 26.5,26 18.5,30.5" fill={`url(#${gDeco})`} />
      {/* Stepped Plinth */}
      <polygon points="15,38 33,38 36,42 12,42" fill={`url(#${gDeco})`} />
    </svg>
  );
}

/** Style 6 - Art Deco: Movies (Tiered Deco marquee clapperboard with chevron stripes & diamond play crest) */
export function MoviesIconStyle6({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gDeco } = useDecoIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible ${className}`}
      style={{ color: 'var(--theme-primary, #D4AF37)' }}
    >
      <DecoDefs gDeco={gDeco} />
      {/* Stepped Art Deco Slate */}
      <polygon
        points="10,16 38,16 38,19 41,19 41,37 38,37 38,40 10,40 10,37 7,37 7,19 10,19"
        fill="currentColor"
        fillOpacity="0.2"
        stroke={`url(#${gDeco})`}
        strokeWidth="1.8"
      />
      {/* Deco Clapper Arm with Chevron Cuts */}
      <polygon points="7,16.5 39,7 41,12.5 9,22" fill={`url(#${gDeco})`} />
      <polyline points="15,14 18,16.2 16,19.5" fill="none" stroke="rgba(6,8,14,0.85)" strokeWidth="1.8" />
      <polyline points="23.5,11.5 26.5,13.7 24.5,17" fill="none" stroke="rgba(6,8,14,0.85)" strokeWidth="1.8" />
      <polyline points="32,9 35,11.2 33,14.5" fill="none" stroke="rgba(6,8,14,0.85)" strokeWidth="1.8" />
      {/* Inner Deco Diamond Center */}
      <polygon points="24,22 31.5,28.5 24,35 16.5,28.5" fill="rgba(6,8,14,0.65)" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.2" />
      <polygon points="21.8,25 27.8,28.5 21.8,32" fill="var(--theme-accent, #F5E6A8)" />
    </svg>
  );
}

/** Style 6 - Art Deco: Series (Grand stepped Deco marquee screen) */
export function SeriesIconStyle6({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gDeco } = useDecoIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible ${className}`}
      style={{ color: 'var(--theme-primary, #D4AF37)' }}
    >
      <DecoDefs gDeco={gDeco} />
      {/* Front Grand Stepped Screen */}
      <polygon
        points="9,12 39,12 39,16 42,16 42,32 39,32 39,36 9,36 9,32 6,32 6,16 9,16"
        fill="currentColor"
        fillOpacity="0.2"
        stroke={`url(#${gDeco})`}
        strokeWidth="1.8"
      />
      {/* Side Flutes */}
      <line x1="10" y1="18" x2="10" y2="30" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.2" />
      <line x1="38" y1="18" x2="38" y2="30" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.2" />
      {/* Inner Screen & Play Chevron */}
      <rect x="13" y="16" width="22" height="16" fill="rgba(6,8,14,0.62)" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.1" />
      <polygon points="21,20 28.5,24 21,28" fill={`url(#${gDeco})`} />
    </svg>
  );
}

/** Style 6 - Art Deco: Playlist (Stepped Deco pointed list bars + stepped octagonal play badge) */
export function PlaylistIconStyle6({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gDeco } = useDecoIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible ${className}`}
      style={{ color: 'var(--theme-primary, #D4AF37)' }}
    >
      <DecoDefs gDeco={gDeco} />
      {/* Deco Pointed Spear Bars */}
      <polygon points="6,10 34,10 37,12.8 34,15.5 6,15.5" fill={`url(#${gDeco})`} />
      <polygon points="6,20 27,20 30,22.8 27,25.5 6,25.5" fill="currentColor" />
      <polygon points="6,30 20,30 23,32.8 20,35.5 6,35.5" fill="var(--theme-secondary, #8C6A1D)" />
      {/* Octagonal Art Deco Play Crest */}
      <polygon
        points="31,23 39,23 43,27 43,35 39,39 31,39 27,35 27,27"
        fill="rgba(6,8,14,0.7)"
        stroke="var(--theme-accent, #F5E6A8)"
        strokeWidth="1.6"
      />
      <polygon points="32.5,27 39,31 32.5,35" fill={`url(#${gDeco})`} />
    </svg>
  );
}

/** Style 6 - Art Deco: Settings (Stepped Art Deco sunburst gear with octagonal inner dial & radiating spokes) */
export function SettingsIconStyle6({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gDeco } = useDecoIds();
  return (
    <svg
      viewBox="0 0 48 48"
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none overflow-visible ${className}`}
      style={{ color: 'var(--theme-primary, #D4AF37)' }}
    >
      <DecoDefs gDeco={gDeco} />
      {/* 8 Stepped Deco Sunburst Teeth */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <polygon
          key={deg}
          points="21.5,4 26.5,4 28,8 29.5,11 18.5,11 20,8"
          transform={`rotate(${deg} 24 24)`}
          fill={`url(#${gDeco})`}
        />
      ))}
      {/* Octagonal Gear Body */}
      <polygon
        points="18,9.5 30,9.5 38.5,18 38.5,30 30,38.5 18,38.5 9.5,30 9.5,18"
        fill="rgba(6,8,14,0.68)"
        stroke="var(--theme-accent, #F5E6A8)"
        strokeWidth="1.7"
      />
      {/* Inner Concentric Deco Octagon & Fan Spokes */}
      <polygon
        points="20,15 28,15 33,20 33,28 28,33 20,33 15,28 15,20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M24 11V16M24 32V37M11 24H16M32 24H37" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.2" />
      <polygon points="24,19.5 28.5,24 24,28.5 19.5,24" fill={`url(#${gDeco})`} />
    </svg>
  );
}
