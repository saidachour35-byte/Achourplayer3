import React, { useId, useState, useEffect } from 'react';
import { StyledIconProps } from './types';
import { isTVOrLowEndDevice } from '../../utils/tvNavigation';

function parseCssColorToRgb(raw: string): [number, number, number] | null {
  const s = raw.trim();
  if (!s) return null;
  if (s.startsWith('#')) {
    let hex = s.slice(1);
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    if (hex.length === 6) {
      const n = parseInt(hex, 16);
      if (!Number.isNaN(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
  }
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

function computePack11Filter(colorStr: string): string | undefined {
  const rgb = parseCssColorToRgb(colorStr);
  if (!rgb) return undefined;
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

  // Pure white/silver/monochrome themes (e.g. pearl, platinum)
  if (d < 0.08 || s < 0.16) {
    return 'saturate(0.06) brightness(1.18) contrast(1.04)';
  }

  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  // Pure/warm Gold presets (hue ~26..54 with high saturation) remain 100% natural
  if (h >= 26 && h <= 54 && s >= 0.35) {
    return undefined;
  }

  // Original icon gold is centered around 38-40deg
  let shift = h - 38;
  if (shift > 180) shift -= 360;
  if (shift < -180) shift += 360;
  const satBoost = s > 0.6 ? 1.45 : 1.25;
  return `hue-rotate(${Math.round(shift)}deg) saturate(${satBoost})`;
}

function usePack11ThemeFilter(): string | undefined {
  const [filterVal, setFilterVal] = useState<string | undefined>(() => {
    if (typeof document === 'undefined') return undefined;
    const raw =
      document.documentElement.style.getPropertyValue('--theme-primary') ||
      getComputedStyle(document.documentElement).getPropertyValue('--theme-primary');
    return computePack11Filter(raw);
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const read = () => {
      const raw =
        document.documentElement.style.getPropertyValue('--theme-primary') ||
        getComputedStyle(document.documentElement).getPropertyValue('--theme-primary');
      setFilterVal(computePack11Filter(raw));
    };
    read();

    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });

    window.addEventListener('achour_theme_changed', read);

    const interval = setInterval(read, 800);

    return () => {
      obs.disconnect();
      window.removeEventListener('achour_theme_changed', read);
      clearInterval(interval);
    };
  }, []);

  return filterVal;
}

function FrostedGoldImgIcon({
  src,
  sizePx = 42,
  className = '',
}: {
  src: string;
  sizePx?: number;
  className?: string;
}) {
  const filter = usePack11ThemeFilter();
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      width={sizePx}
      height={sizePx}
      className={`shrink-0 select-none object-contain pointer-events-none transition-all duration-300 ${className}`}
      style={{
        width: sizePx,
        height: sizePx,
        filter,
      }}
    />
  );
}

function usePackDefs(prefix: string) {
  const raw = useId().replace(/:/g, '');
  return {
    gSplit: `${prefix}_split_${raw}`,
    gGlass: `${prefix}_glass_${raw}`,
    fGlow: `${prefix}_glow_${raw}`,
  };
}

function PackSvgShell({
  sizePx = 42,
  className = '',
  glow = false,
  gSplit,
  gGlass,
  fGlow,
  children,
}: {
  sizePx?: number;
  className?: string;
  glow?: boolean;
  gSplit: string;
  gGlass?: string;
  fGlow?: string;
  children: React.ReactNode;
}) {
  const tvPerf = isTVOrLowEndDevice();
  const useGlowFilter = glow && !tvPerf && Boolean(fGlow);

  return (
    <svg
      viewBox="0 0 100 100"
      width={sizePx}
      height={sizePx}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none overflow-visible ${
        glow ? 'achour-icon-svg-glow' : 'achour-icon-svg'
      } ${className}`}
      style={{ color: 'var(--theme-primary, #D4AF37)' }}
    >
      <defs>
        <linearGradient id={gSplit} gradientUnits="userSpaceOnUse" x1="0" y1="14" x2="0" y2="86">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="44%" stopColor="#FFFFFF" />
          <stop offset="52%" stopColor="var(--theme-split-mid, #F5E6A8)" />
          <stop offset="64%" stopColor="var(--theme-split-color, #D4AF37)" />
          <stop offset="100%" stopColor="var(--theme-split-deep, #8C6A1D)" />
        </linearGradient>
        {gGlass && (
          <linearGradient id={gGlass} gradientUnits="userSpaceOnUse" x1="12" y1="14" x2="88" y2="86">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.48" />
            <stop offset="45%" stopColor="var(--theme-primary, #D4AF37)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--theme-split-deep, #8C6A1D)" stopOpacity="0.42" />
          </linearGradient>
        )}
        {useGlowFilter && fGlow && (
          <filter id={fGlow} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.1" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>
      <g filter={useGlowFilter && fGlow ? `url(#${fGlow})` : undefined}>{children}</g>
    </svg>
  );
}

// =============================================================================
// PACK 11: 3D Frosted Glass & Gold (الزجاج المصنفر والذهب)
// =============================================================================

export function LiveTVIconPack11({ sizePx = 42, className = '' }: StyledIconProps) {
  return <FrostedGoldImgIcon src="/assets/pack11/live.png" sizePx={sizePx} className={className} />;
}

export function MoviesIconPack11({ sizePx = 42, className = '' }: StyledIconProps) {
  return <FrostedGoldImgIcon src="/assets/pack11/movies.png" sizePx={sizePx} className={className} />;
}

export function SeriesIconPack11({ sizePx = 42, className = '' }: StyledIconProps) {
  return <FrostedGoldImgIcon src="/assets/pack11/series.png" sizePx={sizePx} className={className} />;
}

export function PlaylistIconPack11({ sizePx = 42, className = '' }: StyledIconProps) {
  return <FrostedGoldImgIcon src="/assets/pack11/playlist.png" sizePx={sizePx} className={className} />;
}

export function SettingsIconPack11({ sizePx = 42, className = '' }: StyledIconProps) {
  return <FrostedGoldImgIcon src="/assets/pack11/settings.png" sizePx={sizePx} className={className} />;
}

// =============================================================================
// PACK 12: Crystal Neon Dual-Line (نيون مزدوج الخطوط)
// =============================================================================

export function LiveTVIconPack12({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit, fGlow } = usePackDefs('p12_live');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} glow gSplit={gSplit} fGlow={fGlow}>
      <rect x="12" y="22" width="76" height="50" rx="10" stroke={s} strokeWidth="3" />
      <rect x="18" y="28" width="64" height="38" rx="6" stroke={s} strokeWidth="1.5" strokeOpacity="0.6" />
      <path d="M36 80H64" stroke={s} strokeWidth="4" strokeLinecap="round" />
      <circle cx="50" cy="47" r="6" fill={s} />
    </PackSvgShell>
  );
}

export function MoviesIconPack12({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit, fGlow } = usePackDefs('p12_movies');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} glow gSplit={gSplit} fGlow={fGlow}>
      <circle cx="50" cy="50" r="36" stroke={s} strokeWidth="3" />
      <circle cx="50" cy="50" r="28" stroke={s} strokeWidth="1.5" strokeDasharray="4 4" />
      <polygon points="44,38 44,62 64,50" stroke={s} strokeWidth="3" fill="none" strokeLinejoin="round" />
    </PackSvgShell>
  );
}

export function SeriesIconPack12({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit, fGlow } = usePackDefs('p12_series');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} glow gSplit={gSplit} fGlow={fGlow}>
      <rect x="18" y="18" width="64" height="64" rx="16" stroke={s} strokeWidth="3" />
      <rect x="25" y="25" width="50" height="50" rx="11" stroke={s} strokeWidth="1.5" strokeOpacity="0.6" />
      <polygon points="44,39 44,61 62,50" fill={s} />
    </PackSvgShell>
  );
}

export function PlaylistIconPack12({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit, fGlow } = usePackDefs('p12_playlist');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} glow gSplit={gSplit} fGlow={fGlow}>
      <rect x="18" y="24" width="64" height="12" rx="6" stroke={s} strokeWidth="2.5" />
      <rect x="18" y="44" width="64" height="12" rx="6" stroke={s} strokeWidth="2.5" />
      <rect x="18" y="64" width="44" height="12" rx="6" stroke={s} strokeWidth="2.5" />
      <polygon points="70,62 70,78 82,70" fill={s} />
    </PackSvgShell>
  );
}

export function SettingsIconPack12({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit, fGlow } = usePackDefs('p12_settings');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} glow gSplit={gSplit} fGlow={fGlow}>
      <polygon points="50,14 82,32 82,68 50,86 18,68 18,32" stroke={s} strokeWidth="3" strokeLinejoin="round" />
      <circle cx="50" cy="50" r="14" stroke={s} strokeWidth="3" />
    </PackSvgShell>
  );
}

// =============================================================================
// PACK 13: Bold Isometric Blocks (مجسمات هندسية بارزة)
// =============================================================================

export function LiveTVIconPack13({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p13_live');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <path d="M14 26L50 14L86 26V66L50 78L14 66V26Z" fill="currentColor" fillOpacity="0.25" stroke={s} strokeWidth="3.5" strokeLinejoin="round" />
      <polygon points="44,36 44,56 62,46" fill={s} />
    </PackSvgShell>
  );
}

export function MoviesIconPack13({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p13_movies');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <rect x="18" y="20" width="64" height="60" rx="8" fill="currentColor" fillOpacity="0.2" stroke={s} strokeWidth="4" />
      <path d="M18 34H82M32 20V34M50 20V34M68 20V34" stroke={s} strokeWidth="3.5" />
      <polygon points="44,46 44,68 62,57" fill={s} />
    </PackSvgShell>
  );
}

export function SeriesIconPack13({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p13_series');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <rect x="20" y="20" width="60" height="60" rx="12" fill="currentColor" fillOpacity="0.3" stroke={s} strokeWidth="4" />
      <rect x="34" y="34" width="32" height="32" rx="6" fill={s} />
    </PackSvgShell>
  );
}

export function PlaylistIconPack13({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p13_playlist');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <path d="M20 28H80V38H20V28ZM20 46H80V56H20V46ZM20 64H58V74H20V64Z" fill={s} />
      <polygon points="66,60 66,78 82,69" fill={s} />
    </PackSvgShell>
  );
}

export function SettingsIconPack13({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p13_settings');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <path
        d="M44 14H56L59 25L69 29L79 23L87 31L81 41L85 51L96 54V66L85 69L81 79L87 89L79 97L69 91L59 95L56 106H44L41 95L31 91L21 97L13 89L19 79L15 69L4 66V54L15 51L19 41L13 31L21 23L31 29L41 25L44 14Z"
        transform="scale(0.82) translate(11,2)"
        fill="currentColor"
        fillOpacity="0.25"
        stroke={s}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <circle cx="50" cy="50" r="12" fill={s} />
    </PackSvgShell>
  );
}

// =============================================================================
// PACK 14: Minimalist Floating Glass Blades (شفرات زجاجية عائمة)
// =============================================================================

export function LiveTVIconPack14({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p14_live');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <rect x="12" y="22" width="76" height="48" rx="4" fill="currentColor" fillOpacity="0.18" />
      <path d="M12 22H88M12 70H88" stroke={s} strokeWidth="4" strokeLinecap="round" />
      <path d="M38 46C38 39.3726 43.3726 34 50 34C56.6274 34 62 39.3726 62 46" stroke={s} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="50" cy="48" r="4" fill={s} />
    </PackSvgShell>
  );
}

export function MoviesIconPack14({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p14_movies');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <path d="M22 24H78L86 76H14L22 24Z" fill="currentColor" fillOpacity="0.2" stroke={s} strokeWidth="3.5" strokeLinejoin="round" />
      <polygon points="44,40 44,62 62,51" fill={s} />
    </PackSvgShell>
  );
}

export function SeriesIconPack14({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p14_series');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <rect x="20" y="20" width="60" height="60" rx="6" fill="currentColor" fillOpacity="0.22" />
      <path d="M20 20H80V80H20V20Z" stroke={s} strokeWidth="3.5" strokeLinejoin="round" />
      <polygon points="43,37 43,63 64,50" fill={s} />
    </PackSvgShell>
  );
}

export function PlaylistIconPack14({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p14_playlist');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <rect x="18" y="22" width="64" height="56" rx="6" fill="currentColor" fillOpacity="0.18" />
      <path d="M28 36H72M28 50H72M28 64H54" stroke={s} strokeWidth="4" strokeLinecap="round" />
      <circle cx="68" cy="64" r="5" fill={s} />
    </PackSvgShell>
  );
}

export function SettingsIconPack14({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p14_settings');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <line x1="28" y1="22" x2="28" y2="78" stroke={s} strokeWidth="4" strokeLinecap="round" />
      <line x1="50" y1="22" x2="50" y2="78" stroke={s} strokeWidth="4" strokeLinecap="round" />
      <line x1="72" y1="22" x2="72" y2="78" stroke={s} strokeWidth="4" strokeLinecap="round" />
      <circle cx="28" cy="38" r="7" fill={s} />
      <circle cx="50" cy="62" r="7" fill={s} />
      <circle cx="72" cy="42" r="7" fill={s} />
    </PackSvgShell>
  );
}

// =============================================================================
// PACK 15: Cinema Badge Emblems (شارات سينمائية حديثة)
// =============================================================================

export function LiveTVIconPack15({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p15_live');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <rect x="14" y="24" width="72" height="46" rx="12" stroke={s} strokeWidth="4" />
      <path d="M36 14L50 24L64 14" stroke={s} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <polygon points="44,38 44,56 60,47" fill={s} />
    </PackSvgShell>
  );
}

export function MoviesIconPack15({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p15_movies');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <rect x="20" y="16" width="60" height="68" rx="8" stroke={s} strokeWidth="4" />
      <line x1="20" y1="30" x2="80" y2="30" stroke={s} strokeWidth="3" />
      <line x1="20" y1="70" x2="80" y2="70" stroke={s} strokeWidth="3" />
      <polygon points="44,41 44,59 60,50" fill={s} />
    </PackSvgShell>
  );
}

export function SeriesIconPack15({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p15_series');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <rect x="18" y="18" width="64" height="64" rx="20" stroke={s} strokeWidth="4" />
      <polygon points="43,37 43,63 63,50" fill={s} />
    </PackSvgShell>
  );
}

export function PlaylistIconPack15({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p15_playlist');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <circle cx="26" cy="32" r="5" fill={s} />
      <line x1="40" y1="32" x2="78" y2="32" stroke={s} strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="26" cy="50" r="5" fill={s} />
      <line x1="40" y1="50" x2="78" y2="50" stroke={s} strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="26" cy="68" r="5" fill={s} />
      <line x1="40" y1="68" x2="78" y2="68" stroke={s} strokeWidth="4.5" strokeLinecap="round" />
    </PackSvgShell>
  );
}

export function SettingsIconPack15({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p15_settings');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <circle cx="50" cy="50" r="32" stroke={s} strokeWidth="4" />
      <circle cx="50" cy="50" r="10" fill={s} />
      <path d="M50 10V22M50 78V90M10 50H22M78 50H90" stroke={s} strokeWidth="5" strokeLinecap="round" />
    </PackSvgShell>
  );
}

// =============================================================================
// PACK 16: Hologram Translucent Wireframe (هولوغرام شفاف)
// =============================================================================

export function LiveTVIconPack16({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit, fGlow } = usePackDefs('p16_live');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} glow gSplit={gSplit} fGlow={fGlow}>
      <path
        d="M14 28C14 22.4772 18.4772 18 24 18H76C81.5228 18 86 22.4772 86 28V62C86 67.5228 81.5228 72 76 72H24C18.4772 72 14 67.5228 14 62V28Z"
        stroke={s}
        strokeWidth="3"
        strokeDasharray="16 4"
      />
      <path d="M32 82H68" stroke={s} strokeWidth="3.5" strokeLinecap="round" />
      <polygon points="44,36 44,54 60,45" stroke={s} strokeWidth="3" strokeLinejoin="round" />
    </PackSvgShell>
  );
}

export function MoviesIconPack16({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit, fGlow } = usePackDefs('p16_movies');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} glow gSplit={gSplit} fGlow={fGlow}>
      <polygon points="50,14 86,34 86,66 50,86 14,66 14,34" stroke={s} strokeWidth="3" strokeDasharray="14 4" strokeLinejoin="round" />
      <polygon points="44,38 44,62 63,50" fill={s} />
    </PackSvgShell>
  );
}

export function SeriesIconPack16({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit, fGlow } = usePackDefs('p16_series');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} glow gSplit={gSplit} fGlow={fGlow}>
      <rect x="20" y="20" width="60" height="60" rx="8" stroke={s} strokeWidth="3" strokeDasharray="12 4" />
      <polygon points="43,37 43,63 63,50" stroke={s} strokeWidth="3" strokeLinejoin="round" />
    </PackSvgShell>
  );
}

export function PlaylistIconPack16({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit, fGlow } = usePackDefs('p16_playlist');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} glow gSplit={gSplit} fGlow={fGlow}>
      <path d="M20 26H80M20 42H80M20 58H62M20 74H50" stroke={s} strokeWidth="4" strokeLinecap="round" />
      <polygon points="68,58 68,78 84,68" fill={s} />
    </PackSvgShell>
  );
}

export function SettingsIconPack16({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit, fGlow } = usePackDefs('p16_settings');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} glow gSplit={gSplit} fGlow={fGlow}>
      <circle cx="50" cy="50" r="30" stroke={s} strokeWidth="3" strokeDasharray="8 5" />
      <circle cx="50" cy="50" r="16" stroke={s} strokeWidth="3" />
      <circle cx="50" cy="50" r="4" fill={s} />
    </PackSvgShell>
  );
}

// =============================================================================
// PACK 17: Soft Pill Capsules (كبسولات عصرية ناعمة)
// =============================================================================

export function LiveTVIconPack17({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p17_live');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <rect x="10" y="24" width="80" height="52" rx="26" fill="currentColor" fillOpacity="0.22" stroke={s} strokeWidth="4" />
      <polygon points="44,38 44,62 64,50" fill={s} />
    </PackSvgShell>
  );
}

export function MoviesIconPack17({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p17_movies');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <rect x="22" y="14" width="56" height="72" rx="28" fill="currentColor" fillOpacity="0.22" stroke={s} strokeWidth="4" />
      <polygon points="44,39 44,61 62,50" fill={s} />
    </PackSvgShell>
  );
}

export function SeriesIconPack17({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p17_series');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <rect x="18" y="18" width="64" height="64" rx="32" fill="currentColor" fillOpacity="0.22" stroke={s} strokeWidth="4" />
      <polygon points="43,37 43,63 63,50" fill={s} />
    </PackSvgShell>
  );
}

export function PlaylistIconPack17({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p17_playlist');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <rect x="16" y="20" width="68" height="16" rx="8" fill="currentColor" fillOpacity="0.25" stroke={s} strokeWidth="3" />
      <rect x="16" y="42" width="68" height="16" rx="8" fill="currentColor" fillOpacity="0.25" stroke={s} strokeWidth="3" />
      <rect x="16" y="64" width="68" height="16" rx="8" fill="currentColor" fillOpacity="0.25" stroke={s} strokeWidth="3" />
    </PackSvgShell>
  );
}

export function SettingsIconPack17({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p17_settings');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <rect x="16" y="24" width="68" height="22" rx="11" stroke={s} strokeWidth="3.5" />
      <circle cx="64" cy="35" r="6" fill={s} />
      <rect x="16" y="54" width="68" height="22" rx="11" stroke={s} strokeWidth="3.5" />
      <circle cx="36" cy="65" r="6" fill={s} />
    </PackSvgShell>
  );
}

// =============================================================================
// PACK 18: Smoked Glass Monolith (الزجاج المدخن الداكن)
// =============================================================================

export function LiveTVIconPack18({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p18_live');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <rect x="12" y="20" width="76" height="52" rx="8" fill="currentColor" fillOpacity="0.35" stroke={s} strokeWidth="2" strokeOpacity="0.45" />
      <path d="M12 28C12 23.5817 15.5817 20 20 20H80C84.4183 20 88 23.5817 88 28V34H12V28Z" fill="currentColor" fillOpacity="0.5" />
      <path d="M36 80H64" stroke={s} strokeWidth="5" strokeLinecap="round" />
      <polygon points="45,44 45,60 59,52" fill={s} />
    </PackSvgShell>
  );
}

export function MoviesIconPack18({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p18_movies');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <rect x="18" y="18" width="64" height="64" rx="10" fill="currentColor" fillOpacity="0.35" stroke={s} strokeWidth="2" strokeOpacity="0.45" />
      <circle cx="30" cy="30" r="3.5" fill={s} />
      <circle cx="70" cy="30" r="3.5" fill={s} />
      <circle cx="30" cy="70" r="3.5" fill={s} />
      <circle cx="70" cy="70" r="3.5" fill={s} />
      <polygon points="44,39 44,61 62,50" fill={s} />
    </PackSvgShell>
  );
}

export function SeriesIconPack18({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p18_series');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <rect x="20" y="20" width="60" height="60" rx="12" fill="currentColor" fillOpacity="0.4" stroke={s} strokeWidth="2" strokeOpacity="0.45" />
      <polygon points="43,37 43,63 63,50" fill={s} />
    </PackSvgShell>
  );
}

export function PlaylistIconPack18({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p18_playlist');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <rect x="18" y="20" width="64" height="60" rx="10" fill="currentColor" fillOpacity="0.35" stroke={s} strokeWidth="2" strokeOpacity="0.45" />
      <line x1="30" y1="36" x2="70" y2="36" stroke={s} strokeWidth="4" strokeLinecap="round" />
      <line x1="30" y1="50" x2="70" y2="50" stroke={s} strokeWidth="4" strokeLinecap="round" />
      <line x1="30" y1="64" x2="54" y2="64" stroke={s} strokeWidth="4" strokeLinecap="round" />
    </PackSvgShell>
  );
}

export function SettingsIconPack18({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p18_settings');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <rect x="18" y="18" width="64" height="64" rx="18" fill="currentColor" fillOpacity="0.35" stroke={s} strokeWidth="2" strokeOpacity="0.45" />
      <circle cx="50" cy="50" r="16" stroke={s} strokeWidth="5" />
      <circle cx="50" cy="50" r="4" fill={s} />
    </PackSvgShell>
  );
}

// =============================================================================
// PACK 19: Diamond Geometric Cut (القطع الماسي الهندسي)
// =============================================================================

export function LiveTVIconPack19({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p19_live');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <polygon points="24,18 76,18 90,45 76,72 24,72 10,45" stroke={s} strokeWidth="4" fill="currentColor" fillOpacity="0.15" strokeLinejoin="round" />
      <path d="M36 82H64" stroke={s} strokeWidth="4" strokeLinecap="round" />
      <polygon points="44,35 44,55 61,45" fill={s} />
    </PackSvgShell>
  );
}

export function MoviesIconPack19({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p19_movies');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <polygon points="50,12 88,50 50,88 12,50" stroke={s} strokeWidth="4" fill="currentColor" fillOpacity="0.15" strokeLinejoin="round" />
      <polygon points="44,38 44,62 63,50" fill={s} />
    </PackSvgShell>
  );
}

export function SeriesIconPack19({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p19_series');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <polygon points="30,16 70,16 84,30 84,70 70,84 30,84 16,70 16,30" stroke={s} strokeWidth="4" fill="currentColor" fillOpacity="0.15" strokeLinejoin="round" />
      <polygon points="43,37 43,63 63,50" fill={s} />
    </PackSvgShell>
  );
}

export function PlaylistIconPack19({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p19_playlist');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <polygon points="22,26 78,26 84,34 78,42 22,42 16,34" stroke={s} strokeWidth="3" strokeLinejoin="round" />
      <polygon points="22,54 78,54 84,62 78,70 22,70 16,62" stroke={s} strokeWidth="3" strokeLinejoin="round" />
    </PackSvgShell>
  );
}

export function SettingsIconPack19({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p19_settings');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <polygon points="50,14 86,50 50,86 14,50" stroke={s} strokeWidth="4" strokeLinejoin="round" />
      <circle cx="50" cy="50" r="14" stroke={s} strokeWidth="4" />
    </PackSvgShell>
  );
}

// =============================================================================
// PACK 20: Ultra-Thin Architectural Wire (الخطوط المعمارية الدقيقة)
// =============================================================================

export function LiveTVIconPack20({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p20_live');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <rect x="14" y="22" width="72" height="48" rx="4" stroke={s} strokeWidth="2.5" />
      <path d="M38 78H62M50 70V78" stroke={s} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M42 46C42 41.5817 45.5817 38 50 38C54.4183 38 58 41.5817 58 46" stroke={s} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="50" cy="48" r="2.5" fill={s} />
    </PackSvgShell>
  );
}

export function MoviesIconPack20({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p20_movies');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <rect x="20" y="18" width="60" height="64" rx="4" stroke={s} strokeWidth="2.5" />
      <line x1="20" y1="32" x2="80" y2="32" stroke={s} strokeWidth="2" />
      <polygon points="44,44 44,62 60,53" stroke={s} strokeWidth="2.5" strokeLinejoin="round" />
    </PackSvgShell>
  );
}

export function SeriesIconPack20({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p20_series');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <rect x="20" y="20" width="60" height="60" rx="6" stroke={s} strokeWidth="2.5" />
      <polygon points="44,39 44,61 61,50" stroke={s} strokeWidth="2.5" strokeLinejoin="round" />
    </PackSvgShell>
  );
}

export function PlaylistIconPack20({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p20_playlist');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <line x1="22" y1="30" x2="78" y2="30" stroke={s} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="22" y1="44" x2="78" y2="44" stroke={s} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="22" y1="58" x2="60" y2="58" stroke={s} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="22" y1="72" x2="48" y2="72" stroke={s} strokeWidth="2.5" strokeLinecap="round" />
      <polygon points="68,58 68,74 80,66" stroke={s} strokeWidth="2.5" strokeLinejoin="round" />
    </PackSvgShell>
  );
}

export function SettingsIconPack20({ sizePx = 42, className = '' }: StyledIconProps) {
  const { gSplit } = usePackDefs('p20_settings');
  const s = `url(#${gSplit})`;
  return (
    <PackSvgShell sizePx={sizePx} className={className} gSplit={gSplit}>
      <circle cx="50" cy="50" r="28" stroke={s} strokeWidth="2.5" />
      <circle cx="50" cy="50" r="10" stroke={s} strokeWidth="2.5" />
      <line x1="50" y1="14" x2="50" y2="22" stroke={s} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="50" y1="78" x2="50" y2="86" stroke={s} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="14" y1="50" x2="22" y2="50" stroke={s} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="78" y1="50" x2="86" y2="50" stroke={s} strokeWidth="2.5" strokeLinecap="round" />
    </PackSvgShell>
  );
}
