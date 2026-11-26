import React, { useId } from 'react';
import { StyledIconProps } from './types';

function useTechIds() {
  const id = useId().replace(/:/g, '');
  return { gTech: `s10_tc_${id}` };
}

function TechDefs({ gTech }: { gTech: string }) {
  return (
    <defs>
      <linearGradient id={gTech} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="42%" stopColor="#FFFFFF" />
        <stop offset="52%" stopColor="var(--theme-split-mid, #F5E6A8)" />
        <stop offset="65%" stopColor="var(--theme-split-color, #D4AF37)" />
        <stop offset="100%" stopColor="var(--theme-split-deep, #8C6A1D)" />
      </linearGradient>
    </defs>
  );
}

/** Style 10 - Futuristic Tech: Live TV (Cybernetic chamfered visor TV with telemetry signal arcs & circuit nodes) */
export function LiveTVIconStyle10({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gTech } = useTechIds();
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
      <TechDefs gTech={gTech} />
      {/* Segmented Cyber Antenna + Node Tips */}
      <path d="M16 7L22 13.5M32 7L26 13.5" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="15.5" cy="6.5" r="1.4" fill="var(--theme-accent, #F5E6A8)" />
      <circle cx="32.5" cy="6.5" r="1.4" fill="var(--theme-accent, #F5E6A8)" />
      <path d="M36 7.5A6 6 0 0 1 39.5 11.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2.5 1.5" />
      <path d="M38.5 4.8A9.5 9.5 0 0 1 43 10.5" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.3" strokeLinecap="round" />
      {/* Chamfered Cyber Visor TV */}
      <polygon
        points="8,14 39,14 43,18 43,34 39,38 9,38 5,34 5,18"
        fill="currentColor"
        fillOpacity="0.14"
        stroke={`url(#${gTech})`}
        strokeWidth="1.75"
      />
      {/* Internal HUD Screen & Telemetry Ticks */}
      <polygon
        points="10,17.5 31.5,17.5 33,19 33,33 31.5,34.5 10,34.5 8.5,33 8.5,19"
        fill="rgba(5,8,14,0.72)"
        stroke="var(--theme-accent, #F5E6A8)"
        strokeWidth="1.1"
      />
      {/* Tech Play Core + Scanline */}
      <polygon points="17.5,21.8 25.5,26 17.5,30.2" fill="var(--theme-accent, #F5E6A8)" />
      <line x1="11" y1="26" x2="15" y2="26" stroke="currentColor" strokeWidth="1.2" />
      {/* Circuit Side Indicators */}
      <circle cx="37.5" cy="21" r="1.5" fill="var(--theme-accent, #F5E6A8)" />
      <path d="M35.5 25.5H39.5M35.5 29H38.5M35.5 32.5H39.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      {/* Cyber Base Thruster */}
      <path d="M14 41.5H21M27 41.5H34" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Style 10 - Futuristic Tech: Movies (Chamfered cyber film-cartridge with holographic sprocket slots & scan laser) */
export function MoviesIconStyle10({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gTech } = useTechIds();
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
      <TechDefs gTech={gTech} />
      {/* Chamfered Cyber Film Cartridge */}
      <polygon
        points="8,10 40,10 43,13 43,35 40,38 8,38 5,35 5,13"
        fill="currentColor"
        fillOpacity="0.14"
        stroke={`url(#${gTech})`}
        strokeWidth="1.75"
      />
      {/* Top & Bottom Circuit Perforations */}
      {[12, 20, 28, 34].map((x) => (
        <React.Fragment key={x}>
          <rect x={x} y="12.5" width="3" height="2.2" fill="var(--theme-accent, #F5E6A8)" />
          <rect x={x} y="33.3" width="3" height="2.2" fill="var(--theme-accent, #F5E6A8)" />
        </React.Fragment>
      ))}
      {/* Inner Chamfered Projection Core */}
      <polygon
        points="11,17.5 37,17.5 37,30.5 11,30.5"
        fill="rgba(5,8,14,0.74)"
        stroke="currentColor"
        strokeWidth="1.1"
      />
      {/* Laser Play Triangle + HUD Reticle Dots */}
      <polygon points="20.5,20 29.5,24 20.5,28" fill="var(--theme-accent, #F5E6A8)" />
      <circle cx="14.5" cy="24" r="1.1" fill="currentColor" />
      <circle cx="33.5" cy="24" r="1.1" fill="currentColor" />
    </svg>
  );
}

/** Style 10 - Futuristic Tech: Series (Chamfered cybernetic episode screen with circuit trace) */
export function SeriesIconStyle10({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gTech } = useTechIds();
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
      <TechDefs gTech={gTech} />
      {/* Front Chamfered Cyber Screen */}
      <polygon
        points="9.5,11.5 38.5,11.5 42,15 42,33 38.5,36.5 9.5,36.5 6,33 6,15"
        fill="rgba(5,8,14,0.72)"
        stroke={`url(#${gTech})`}
        strokeWidth="1.8"
      />
      {/* Internal HUD Play & Circuit Trace */}
      <polygon points="20,19 29.5,24 20,29" fill="var(--theme-accent, #F5E6A8)" />
      <path d="M11 16H16.5M31.5 32H37" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="11" cy="32" r="1.1" fill="var(--theme-accent, #F5E6A8)" />
    </svg>
  );
}

/** Style 10 - Futuristic Tech: Playlist (Data-stream cyber bars with node terminals + hex play module) */
export function PlaylistIconStyle10({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gTech } = useTechIds();
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
      <TechDefs gTech={gTech} />
      {/* Data-Stream Track 1 */}
      <polygon points="6,10 34,10 37,13 34,15 6,15" fill="currentColor" fillOpacity="0.24" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.2" />
      <circle cx="9" cy="12.5" r="1.1" fill="var(--theme-accent, #F5E6A8)" />
      {/* Data-Stream Track 2 */}
      <polygon points="6,19.5 27,19.5 30,22.5 27,24.5 6,24.5" fill="currentColor" fillOpacity="0.22" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="9" cy="22" r="1.1" fill="var(--theme-accent, #F5E6A8)" />
      {/* Data-Stream Track 3 */}
      <polygon points="6,29 20,29 23,32 20,34 6,34" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="9" cy="31.5" r="1.1" fill="var(--theme-accent, #F5E6A8)" />
      {/* Hexagonal Cyber Play Core */}
      <polygon
        points="34.5,23 42,27.2 42,35.8 34.5,40 27,35.8 27,27.2"
        fill="rgba(5,8,14,0.78)"
        stroke={`url(#${gTech})`}
        strokeWidth="1.7"
      />
      <polygon points="32,27.5 38.5,31.5 32,35.5" fill="var(--theme-accent, #F5E6A8)" />
    </svg>
  );
}

/** Style 10 - Futuristic Tech: Settings (Split cybernetic telemetry gear with broken HUD arcs & trace spokes) */
export function SettingsIconStyle10({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gTech } = useTechIds();
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
      <TechDefs gTech={gTech} />
      {/* 8 Precision Notched Cyber Teeth */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <polygon
          key={deg}
          points="21.2,4.5 26.8,4.5 28.2,10.5 19.8,10.5"
          transform={`rotate(${deg} 24 24)`}
          fill="currentColor"
          fillOpacity="0.28"
          stroke="var(--theme-accent, #F5E6A8)"
          strokeWidth="1.2"
        />
      ))}
      {/* Segmented Outer HUD Telemetry Ring */}
      <circle cx="24" cy="24" r="14" fill="rgba(5,8,14,0.72)" stroke={`url(#${gTech})`} strokeWidth="1.8" strokeDasharray="16 4.5" />
      {/* Inner Circuit Ring & Radial Data Spokes */}
      <circle cx="24" cy="24" r="8.2" fill="none" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.3" strokeDasharray="8 3" />
      <path d="M24 11V16M24 32V37M11 24H16M32 24H37" stroke="var(--theme-accent, #F5E6A8)" strokeWidth="1.4" strokeLinecap="round" />
      {/* Glowing Hex Core */}
      <polygon points="24,19.8 27.6,22 27.6,26 24,28.2 20.4,26 20.4,22" fill="var(--theme-accent, #F5E6A8)" />
    </svg>
  );
}
