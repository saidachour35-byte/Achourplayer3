import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  Check,
  Eye,
  Frame,
  Layers,
  Maximize2,
  Palette,
  RotateCcw,
  Sliders,
  Sparkles,
  SunMoon,
  Target,
  Type,
  ArrowUpDown,
} from 'lucide-react';
import {
  AppSettings,
  FocusVisualStyle,
  FrameShapeId,
  IconDisplayMode,
  IconPackId,
  WindowSizeScales,
} from '../types';
import {
  FRAME_SHAPES,
  ICON_PACKS,
  ROYAL_THEMES,
  computePaletteFromHex,
  isValidHexColor,
  normalizeHexColor,
  normalizeIconPackId,
} from '../utils/themeManager';
import { IconKind } from './DashboardLayouts';
import { DashboardSectionIcon, PackIconSvg } from './IconPacks';

export const DEFAULT_DASHBOARD_ORDER: IconKind[] = ['live', 'movies', 'series', 'add', 'settings'];

export type DesignSubViewId =
  | 'background-opacity'
  | 'window-sizes'
  | 'design-display'
  | 'design-icons'
  | 'design-frames'
  | 'design-icon-size'
  | 'design-frame-size'
  | 'design-spacing'
  | 'design-alignment'
  | 'design-order'
  | 'design-colors'
  | 'design-custom-color'
  | 'design-glass-opacity'
  | 'design-glass-blur'
  | 'design-focus-mode'
  | 'design-label-color';

interface DesignSubViewProps {
  subView: DesignSubViewId;
  settings: AppSettings;
  onUpdateSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  isRtl: boolean;
  t: (key: any, params?: Record<string, string | number>) => string;
}

const ICON_KINDS_PREVIEW: IconKind[] = ['live', 'movies', 'series', 'add', 'settings'];

const MemoIconPackCard = React.memo(({
  pack,
  active,
  isRtl,
  onSelect,
}: {
  pack: (typeof ICON_PACKS)[number];
  active: boolean;
  isRtl: boolean;
  onSelect: (id: IconPackId) => void;
}) => (
  <button
    type="button"
    data-tv-focusable="true"
    tabIndex={0}
    onClick={() => onSelect(pack.id as IconPackId)}
    className={`achour-perf-grid-item p-3.5 rounded-2xl border transition-colors duration-100 flex flex-col gap-2.5 cursor-pointer ${
      active
        ? 'border-gold bg-gold/15 shadow-[0_0_16px_var(--theme-glow)]'
        : 'border-white/10 bg-white/[0.04] hover:border-gold/45'
    } ${isRtl ? 'text-right' : 'text-left'}`}
  >
    <div className="flex items-center justify-between w-full gap-2">
      <span className="text-sm font-bold text-white truncate">
        {isRtl ? pack.nameAr : pack.nameEn}
      </span>
      {active && (
        <span className="p-1 rounded-lg bg-gold text-black shrink-0">
          <Check size={13} />
        </span>
      )}
    </div>
    <div className="flex items-center justify-around py-1.5 rounded-xl bg-black/35 border border-white/10">
      {ICON_KINDS_PREVIEW.map((k) => (
        <PackIconSvg key={k} kind={k} pack={pack.id} sizePx={28} />
      ))}
    </div>
    <p className="text-[11px] text-zinc-300 leading-snug">
      {isRtl ? pack.descriptionAr : pack.descriptionEn}
    </p>
  </button>
));

const MemoFrameShapeCard = React.memo(({
  shape,
  active,
  isRtl,
  iconPack,
  glassOpacity,
  glassBlur,
  onSelect,
}: {
  shape: (typeof FRAME_SHAPES)[number];
  active: boolean;
  isRtl: boolean;
  iconPack: string;
  glassOpacity?: number;
  glassBlur?: number;
  onSelect: (id: FrameShapeId) => void;
}) => (
  <button
    type="button"
    data-tv-focusable="true"
    tabIndex={0}
    onClick={() => onSelect(shape.id as FrameShapeId)}
    className={`achour-perf-grid-item p-3 rounded-2xl border transition-colors duration-100 flex flex-col items-center gap-2 text-center cursor-pointer ${
      active
        ? 'border-gold bg-gold/15 shadow-[0_0_16px_var(--theme-glow)]'
        : 'border-white/10 bg-white/[0.04] hover:border-gold/45'
    }`}
  >
    <div className="flex items-center justify-between w-full">
      <span className="text-xs font-bold text-white truncate">
        {isRtl ? shape.nameAr : shape.nameEn}
      </span>
      {active && (
        <span className="p-0.5 rounded bg-gold text-black shrink-0">
          <Check size={12} />
        </span>
      )}
    </div>
    <div className="py-1">
      <DashboardSectionIcon
        kind="live"
        displayMode="with-frames"
        iconPack={iconPack}
        frameShape={shape.id}
        sizeOverridePx={28}
        frameSizeOverridePx={58}
        glassOpacity={glassOpacity}
        glassBlur={glassBlur}
      />
    </div>
    <p className="text-[10px] text-zinc-400 line-clamp-2 leading-tight">
      {isRtl ? shape.descriptionAr : shape.descriptionEn}
    </p>
  </button>
));

export default function DesignSubViewContent({
  subView,
  settings,
  onUpdateSettings,
  isRtl,
  t,
}: DesignSubViewProps) {
  const updateField = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      onUpdateSettings((prev) => ({ ...prev, [key]: value }));
    },
    [onUpdateSettings]
  );

  const patchFields = useCallback(
    (patch: Partial<AppSettings>) => {
      onUpdateSettings((prev) => ({ ...prev, ...patch }));
    },
    [onUpdateSettings]
  );

  const handleSelectIconPack = useCallback(
    (id: IconPackId) => {
      updateField('iconPack', id);
    },
    [updateField]
  );

  const handleSelectFrameShape = useCallback((id: FrameShapeId) => {
    patchFields({
      frameShape: id,
      iconDisplayMode: 'with-frames',
    });
  }, [patchFields]);

  const activePalette = useMemo(() => {
    const validCustom = normalizeHexColor(settings.customThemeColor);
    if (validCustom) return computePaletteFromHex(validCustom);
    const preset = ROYAL_THEMES.find((th) => th.id === (settings.royalThemeColor || 'pure-metallic-gold')) || ROYAL_THEMES[0];
    return computePaletteFromHex(preset.primary);
  }, [settings.customThemeColor, settings.royalThemeColor]);

  const [hexInput, setHexInput] = useState<string>(() => {
    const c = normalizeHexColor(settings.customThemeColor);
    if (c) return c;
    const preset = ROYAL_THEMES.find((th) => th.id === (settings.royalThemeColor || 'pure-metallic-gold'));
    return preset?.primary || '#D4AF37';
  });

  useEffect(() => {
    const c = normalizeHexColor(settings.customThemeColor);
    if (c) {
      setHexInput(c);
    } else {
      const preset = ROYAL_THEMES.find((th) => th.id === (settings.royalThemeColor || 'pure-metallic-gold'));
      if (preset) setHexInput(preset.primary);
    }
  }, [settings.customThemeColor, settings.royalThemeColor]);

  // 1. BACKGROUND OPACITY (0% to 100%, 1% granularity, live applied, D-pad Left/Right +/-1%, Touch +/- buttons)
  if (subView === 'background-opacity') {
    const bgOpacity =
      typeof settings.backgroundOpacity === 'number' && !Number.isNaN(settings.backgroundOpacity)
        ? Math.max(0, Math.min(100, Math.round(settings.backgroundOpacity)))
        : 62;

    const setOpacityClamped = (next: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(next)));
      updateField('backgroundOpacity', clamped);
    };

    const statusText =
      bgOpacity === 0
        ? t('bg_opacity_status_0')
        : bgOpacity === 62
        ? t('bg_opacity_status_62')
        : bgOpacity === 100
        ? t('bg_opacity_status_100')
        : t('bg_opacity_status_custom', { pct: bgOpacity });

    return (
      <div className="max-w-3xl mx-auto py-4 space-y-5">
        <div className="p-5 sm:p-6 rounded-3xl bg-black/30 border border-white/15 backdrop-blur-sm space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-gold/20 text-gold border border-gold/30">
                <SunMoon size={22} />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-semibold achour-glossy-title">
                  {t('background_opacity')}
                </h2>
                <p className="text-xs text-zinc-300 mt-0.5">
                  {t('background_opacity_desc')}
                </p>
              </div>
            </div>

            <div className="px-5 py-2.5 rounded-2xl bg-black/50 border border-gold/50 text-center min-w-[104px]">
              <span
                data-testid="bg-opacity-value"
                className="text-3xl sm:text-4xl font-sans font-semibold achour-glossy-text tabular-nums"
              >
                {bgOpacity}%
              </span>
            </div>
          </div>

          {/* Precision 0% - 100% Control (LTR layout so Left = -1% and Right = +1% consistently) */}
          <div dir="ltr" className="space-y-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                data-tv-focusable="true"
                tabIndex={0}
                aria-label="Decrease Background Opacity by 1%"
                onClick={() => setOpacityClamped(bgOpacity - 1)}
                disabled={bgOpacity <= 0}
                className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-gold hover:text-black disabled:opacity-35 text-white text-xl font-medium border border-white/15 transition-colors cursor-pointer flex items-center justify-center shrink-0"
              >
                −
              </button>

              <div className="flex-1 flex flex-col gap-1.5">
                <input
                  type="range"
                  dir="ltr"
                  min={0}
                  max={100}
                  step={1}
                  data-tv-focusable="true"
                  aria-label="Background Opacity Percentage"
                  value={bgOpacity}
                  onChange={(e) => setOpacityClamped(Number(e.target.value))}
                  className="w-full h-3 accent-[var(--theme-primary)] cursor-pointer"
                />
                <div className="flex items-center justify-between text-[11px] font-sans tabular-nums text-zinc-300 px-0.5">
                  <span>0% ({t('bg_opacity_natural_short')})</span>
                  <span>62% ({t('bg_opacity_default_short')})</span>
                  <span>100% ({t('bg_opacity_full_short')})</span>
                </div>
              </div>

              <button
                type="button"
                data-tv-focusable="true"
                tabIndex={0}
                aria-label="Increase Background Opacity by 1%"
                onClick={() => setOpacityClamped(bgOpacity + 1)}
                disabled={bgOpacity >= 100}
                className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-gold hover:text-black disabled:opacity-35 text-white text-xl font-medium border border-white/15 transition-colors cursor-pointer flex items-center justify-center shrink-0"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10">
            <div className="space-y-1">
              <p className="text-xs sm:text-sm font-semibold text-white">{statusText}</p>
              <p className="text-[11px] text-zinc-300">
                {t('bg_opacity_remote_hint')}
              </p>
            </div>

            {bgOpacity !== 62 && (
              <button
                type="button"
                data-tv-focusable="true"
                tabIndex={0}
                onClick={() => setOpacityClamped(62)}
                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-gold hover:text-black text-zinc-200 text-xs font-bold border border-white/15 flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <RotateCcw size={13} />
                <span>{t('reset_default_62')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 2. ICON DISPLAY MODE (Icons Only vs With Frames)
  if (subView === 'design-display') {
    const currentMode: IconDisplayMode = settings.iconDisplayMode || 'icons-only';
    return (
      <div className="space-y-4 pb-4">
        <div className="flex items-center gap-2.5">
          <Eye size={18} className="text-gold" />
          <div>
            <h3 className="text-sm sm:text-base font-semibold achour-glossy-title">
              {t('icon_display_mode')}
            </h3>
            <p className="text-xs text-zinc-400">
              {t('icon_display_mode_desc')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {(
            [
              {
                mode: 'icons-only' as IconDisplayMode,
                title: t('icons_only_title'),
                desc: t('icons_only_desc'),
              },
              {
                mode: 'with-frames' as IconDisplayMode,
                title: t('icons_with_frames_title'),
                desc: t('icons_with_frames_desc'),
              },
            ] as const
          ).map((opt) => {
            const active = currentMode === opt.mode;
            return (
              <button
                key={opt.mode}
                type="button"
                data-tv-focusable="true"
                tabIndex={0}
                onClick={() => updateField('iconDisplayMode', opt.mode)}
                className={`p-4 rounded-2xl border transition-all flex flex-col gap-3 cursor-pointer ${
                  active
                    ? 'border-gold bg-gold/15 shadow-[0_0_18px_var(--theme-glow)]'
                    : 'border-white/10 bg-white/[0.04] hover:border-gold/45'
                } ${isRtl ? 'text-right' : 'text-left'}`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-sm font-medium text-white">
                    {opt.title}
                  </span>
                  {active && (
                    <span className="p-1 rounded-lg bg-gold text-black shrink-0">
                      <Check size={14} />
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-center gap-4 py-2">
                  <DashboardSectionIcon
                    kind="live"
                    displayMode={opt.mode}
                    iconPack={settings.iconPack || 'pack-3d'}
                    frameShape={settings.frameShape || 'rounded-square'}
                    sizeOverridePx={32}
                    frameSizeOverridePx={54}
                  />
                  <DashboardSectionIcon
                    kind="movies"
                    displayMode={opt.mode}
                    iconPack={settings.iconPack || 'pack-3d'}
                    frameShape={settings.frameShape || 'rounded-square'}
                    sizeOverridePx={32}
                    frameSizeOverridePx={54}
                  />
                  <DashboardSectionIcon
                    kind="series"
                    displayMode={opt.mode}
                    iconPack={settings.iconPack || 'pack-3d'}
                    frameShape={settings.frameShape || 'rounded-square'}
                    sizeOverridePx={32}
                    frameSizeOverridePx={54}
                  />
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  {opt.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // 3. 10 ICON PACKS
  if (subView === 'design-icons') {
    const currentPack = normalizeIconPackId(settings.iconPack);
    return (
      <div className="space-y-3 pb-4">
        <div className="flex items-center gap-2.5">
          <Sparkles size={18} className="text-gold" />
          <div>
            <h3 className="text-sm sm:text-base font-semibold achour-glossy-title">
              {t('icon_styles_heading', { count: ICON_PACKS.length })}
            </h3>
            <p className="text-xs text-zinc-400">
              {t('icon_styles_desc')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ICON_PACKS.map((pack) => (
            <MemoIconPackCard
              key={pack.id}
              pack={pack}
              active={currentPack === pack.id}
              isRtl={isRtl}
              onSelect={handleSelectIconPack}
            />
          ))}
        </div>
      </div>
    );
  }

  // 4. 40 FRAME SHAPES
  if (subView === 'design-frames') {
    const currentShape = settings.frameShape || 'rounded-square';
    return (
      <div className="space-y-3 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Frame size={18} className="text-gold" />
            <div>
              <h3 className="text-sm sm:text-base font-semibold achour-glossy-title">
                {t('frame_shapes_heading', { count: FRAME_SHAPES.length })}
              </h3>
              <p className="text-xs text-zinc-400">
                {t('frame_shapes_desc')}
              </p>
            </div>
          </div>
          {(settings.iconDisplayMode || 'icons-only') === 'icons-only' && (
            <button
              type="button"
              data-tv-focusable="true"
              tabIndex={0}
              onClick={() => updateField('iconDisplayMode', 'with-frames')}
              className="px-3 py-1.5 rounded-xl achour-glossy-pill text-xs font-medium cursor-pointer whitespace-nowrap"
            >
              {t('enable_frames_now')}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {FRAME_SHAPES.map((shape) => (
            <MemoFrameShapeCard
              key={shape.id}
              shape={shape}
              active={currentShape === shape.id}
              isRtl={isRtl}
              iconPack={settings.iconPack || 'pack-3d'}
              glassOpacity={settings.glassOpacity}
              glassBlur={settings.glassBlur}
              onSelect={handleSelectFrameShape}
            />
          ))}
        </div>
      </div>
    );
  }

  // 6. ICON SIZE
  if (subView === 'design-icon-size') {
    const cur = settings.iconScale || 'md';
    return (
      <div className="max-w-3xl mx-auto py-3 space-y-4">
        <div className="p-4 sm:p-5 rounded-3xl bg-white/[0.04] border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Maximize2 size={18} className="text-gold" />
              <span className="text-sm sm:text-base font-semibold achour-glossy-title">
                {t('icon_size_label')}
              </span>
            </div>
            <span className="text-sm font-sans font-medium achour-glossy-text uppercase">{cur}</span>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {(['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] as const).map((sz) => (
              <button
                key={sz}
                type="button"
                data-tv-focusable="true"
                tabIndex={0}
                onClick={() => updateField('iconScale', sz)}
                className={`py-3 rounded-2xl border text-sm font-sans font-medium uppercase cursor-pointer transition-colors ${
                  cur === sz
                    ? 'achour-glossy-pill border-gold'
                    : 'bg-white/[0.04] border-white/10 text-zinc-200 hover:border-gold/50'
                }`}
              >
                {sz}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 7. FRAME SIZE (Independent)
  if (subView === 'design-frame-size') {
    const cur = settings.frameScale || 'md';
    return (
      <div className="max-w-3xl mx-auto py-3 space-y-4">
        <div className="p-4 sm:p-5 rounded-3xl bg-white/[0.04] border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Frame size={18} className="text-gold" />
              <span className="text-sm sm:text-base font-semibold achour-glossy-title">
                {t('frame_size_independent')}
              </span>
            </div>
            <span className="text-sm font-sans font-medium achour-glossy-text uppercase">{cur}</span>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {(['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] as const).map((sz) => (
              <button
                key={sz}
                type="button"
                data-tv-focusable="true"
                tabIndex={0}
                onClick={() => updateField('frameScale', sz)}
                className={`py-3 rounded-2xl border text-sm font-sans font-medium uppercase cursor-pointer transition-colors ${
                  cur === sz
                    ? 'achour-glossy-pill border-gold'
                    : 'bg-white/[0.04] border-white/10 text-zinc-200 hover:border-gold/50'
                }`}
              >
                {sz}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 8. SECTION SPACING
  if (subView === 'design-spacing') {
    const cur = settings.tileSpacing || 'md';
    return (
      <div className="max-w-3xl mx-auto py-3 space-y-4">
        <div className="p-4 sm:p-5 rounded-3xl bg-white/[0.04] border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm sm:text-base font-semibold achour-glossy-title">
              {t('section_spacing')}
            </span>
            <span className="text-sm font-sans font-medium achour-glossy-text uppercase">{cur}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {(
              [
                { id: 'xs', label: t('spacing_tight') },
                { id: 'sm', label: t('spacing_compact') },
                { id: 'md', label: t('spacing_balanced') },
                { id: 'lg', label: t('spacing_wide') },
                { id: 'xl', label: t('spacing_spacious') },
              ] as const
            ).map((sp) => (
              <button
                key={sp.id}
                type="button"
                data-tv-focusable="true"
                tabIndex={0}
                onClick={() => updateField('tileSpacing', sp.id)}
                className={`py-3 px-2 rounded-2xl border text-xs sm:text-sm font-medium cursor-pointer transition-colors whitespace-nowrap ${
                  cur === sp.id
                    ? 'achour-glossy-pill border-gold'
                    : 'bg-white/[0.04] border-white/10 text-zinc-200 hover:border-gold/50'
                }`}
              >
                {sp.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 9. SCREEN ALIGNMENT POSITION (9-Zone Grid)
  if (subView === 'design-alignment') {
    const curV = settings.dashboardAlignment || 'bottom';
    const curH = settings.dashboardHorizontalAlignment || 'center';
    return (
      <div className="max-w-2xl mx-auto py-3 space-y-4">
        <div className="p-4 sm:p-5 rounded-3xl bg-white/[0.04] border border-white/10 space-y-4">
          <div>
            <h3 className="text-sm sm:text-base font-semibold achour-glossy-title">
              {t('screen_alignment_heading')}
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              {t('screen_alignment_desc')}
            </p>
          </div>
          <div dir="ltr" className="grid grid-cols-3 gap-2.5">
            {(
              [
                { v: 'top', h: 'left', label: t('align_top_left') },
                { v: 'top', h: 'center', label: t('align_top') },
                { v: 'top', h: 'right', label: t('align_top_right') },
                { v: 'center', h: 'left', label: t('align_left') },
                { v: 'center', h: 'center', label: t('align_center') },
                { v: 'center', h: 'right', label: t('align_right') },
                { v: 'bottom', h: 'left', label: t('align_bottom_left') },
                { v: 'bottom', h: 'center', label: t('align_bottom') },
                { v: 'bottom', h: 'right', label: t('align_bottom_right') },
              ] as const
            ).map((cell) => {
              const active = curV === cell.v && curH === cell.h;
              return (
                <button
                  key={`${cell.v}-${cell.h}`}
                  type="button"
                  data-tv-focusable="true"
                  tabIndex={0}
                  onClick={() =>
                    patchFields({
                      dashboardAlignment: cell.v,
                      dashboardHorizontalAlignment: cell.h,
                    })
                  }
                  className={`py-3 px-2 rounded-2xl border text-xs sm:text-sm font-bold cursor-pointer transition-colors ${
                    active
                      ? 'bg-gold/25 border-gold text-gold shadow-[0_0_16px_var(--theme-glow)]'
                      : 'bg-white/[0.04] border-white/10 text-zinc-300 hover:border-gold/45'
                  }`}
                >
                  {cell.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // 10. REORDER 5 SECTIONS
  if (subView === 'design-order') {
    const order = settings.dashboardOrder?.length ? settings.dashboardOrder : DEFAULT_DASHBOARD_ORDER;
    const moveOrderItem = (index: number, delta: -1 | 1) => {
      const cur = [...order];
      const target = index + delta;
      if (target < 0 || target >= cur.length) return;
      [cur[index], cur[target]] = [cur[target], cur[index]];
      updateField('dashboardOrder', cur);
    };
    const nameMap: Record<string, string> = {
      live: t('live'),
      movies: t('movies'),
      series: t('series'),
      add: t('playlist'),
      settings: t('settings'),
    };

    return (
      <div className="max-w-2xl mx-auto py-3 space-y-4">
        <div className="p-4 sm:p-5 rounded-3xl bg-white/[0.04] border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowUpDown size={18} className="text-gold" />
              <h3 className="text-sm sm:text-base font-semibold achour-glossy-title">
                {t('reorder_sections')}
              </h3>
            </div>
            <button
              type="button"
              data-tv-focusable="true"
              tabIndex={0}
              onClick={() => updateField('dashboardOrder', [...DEFAULT_DASHBOARD_ORDER])}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-gold hover:text-black text-xs font-medium text-zinc-200 cursor-pointer flex items-center gap-1"
            >
              <RotateCcw size={12} />
              <span>{t('reset_label')}</span>
            </button>
          </div>
          <div className="space-y-2">
            {order.map((kind, idx) => (
              <div
                key={kind}
                className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-black/35 border border-white/10"
              >
                <span className="text-sm font-medium text-white">
                  {idx + 1}. {nameMap[kind] || kind}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-tv-focusable="true"
                    tabIndex={0}
                    disabled={idx === 0}
                    onClick={() => moveOrderItem(idx, -1)}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-gold hover:text-black disabled:opacity-30 text-sm font-medium cursor-pointer"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    data-tv-focusable="true"
                    tabIndex={0}
                    disabled={idx === order.length - 1}
                    onClick={() => moveOrderItem(idx, 1)}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-gold hover:text-black disabled:opacity-30 text-sm font-medium cursor-pointer"
                  >
                    ↓
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 11. THEME COLORS (True 24K Metallic Gold + Preset Swatches)
  if (subView === 'design-colors') {
    return (
      <div className="space-y-4 pb-4">
        <div className="flex items-center gap-2.5">
          <Palette size={18} className="text-gold" />
          <div>
            <h3 className="text-sm sm:text-base font-semibold achour-glossy-title">
              {t('app_theme_colors_heading')}
            </h3>
            <p className="text-xs text-zinc-400">
              {t('app_theme_colors_desc')}
            </p>
          </div>
        </div>

        {/* Featured True 24K Metallic Gold Card */}
        <button
          type="button"
          data-tv-focusable="true"
          tabIndex={0}
          onClick={() =>
            patchFields({
              royalThemeColor: 'pure-metallic-gold',
              customThemeColor: '#D4AF37',
            })
          }
          className={`w-full p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 cursor-pointer ${
            activePalette.primary === '#D4AF37'
              ? 'border-gold bg-gold/15 shadow-[0_0_20px_var(--theme-glow)]'
              : 'border-white/15 bg-white/[0.04] hover:border-gold'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-11 h-11 rounded-2xl border border-white/40 shrink-0 shadow-lg"
              style={{
                background:
                  'linear-gradient(135deg, #8C6A1D 0%, #D4AF37 35%, #F5E6A8 58%, #B8860B 100%)',
              }}
            />
            <div className="min-w-0 text-start">
              <span className="block text-sm font-semibold achour-glossy-text truncate">
                {t('true_gold_full_app')}
              </span>
              <span className="block text-[11px] font-sans tabular-nums text-zinc-300 truncate mt-0.5">
                #8C6A1D · #D4AF37 · #F5E6A8 · #B8860B
              </span>
            </div>
          </div>
          {activePalette.primary === '#D4AF37' && (
            <span className="p-1.5 rounded-lg bg-gold text-black shrink-0">
              <Check size={15} />
            </span>
          )}
        </button>

        {/* Preset Swatches */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
          {ROYAL_THEMES.map((theme) => {
            const isSelected =
              !settings.customThemeColor && settings.royalThemeColor === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                data-tv-focusable="true"
                tabIndex={0}
                onClick={() =>
                  patchFields({
                    royalThemeColor: theme.id,
                    customThemeColor: null,
                  })
                }
                className={`achour-perf-grid-item p-2.5 rounded-xl border flex flex-col gap-1.5 cursor-pointer transition-colors duration-100 ${
                  isSelected
                    ? 'border-gold bg-white/15 shadow-[0_0_14px_var(--theme-glow)]'
                    : 'border-white/10 bg-white/[0.04] hover:border-white/30'
                } ${isRtl ? 'text-right' : 'text-left'}`}
              >
                <div className="flex items-center justify-between w-full">
                  <span
                    className="w-5 h-5 rounded-full border border-white/25"
                    style={{ backgroundColor: theme.primary }}
                  />
                  <span className="text-[10px] font-sans tabular-nums text-zinc-400">
                    {theme.primary}
                  </span>
                </div>
                <span className="text-xs font-medium text-white truncate w-full">
                  {isRtl ? theme.nameAr : theme.nameEn}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // 12. CUSTOM COLOR (Color Picker + HEX Input)
  if (subView === 'design-custom-color') {
    return (
      <div className="max-w-2xl mx-auto py-3 space-y-4">
        <div className="p-5 rounded-3xl bg-white/[0.04] border border-white/15 space-y-4">
          <div>
            <h3 className="text-sm sm:text-base font-semibold achour-glossy-title">
              {t('custom_color_heading')}
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              {t('custom_color_desc')}
            </p>
          </div>

          <div dir="ltr" className="flex flex-wrap items-center gap-3">
            <label className="relative flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-black/45 border border-white/15 cursor-pointer">
              <input
                type="color"
                value={
                  isValidHexColor(hexInput)
                    ? normalizeHexColor(hexInput)!
                    : activePalette.primary
                }
                onChange={(e) => {
                  const next = e.target.value.toUpperCase();
                  setHexInput(next);
                  updateField('customThemeColor', next);
                }}
                className="w-9 h-9 rounded-lg border-0 bg-transparent cursor-pointer"
              />
              <span className="text-xs font-medium text-zinc-200 whitespace-nowrap">
                {t('pick_color')}
              </span>
            </label>

            <input
              type="text"
              value={hexInput}
              maxLength={7}
              placeholder="#D4AF37"
              onChange={(e) => {
                const raw = e.target.value.toUpperCase();
                setHexInput(raw);
                const norm = normalizeHexColor(raw);
                if (norm) {
                  updateField('customThemeColor', norm);
                }
              }}
              className="flex-1 min-w-[140px] px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/20 text-sm font-sans tabular-nums font-medium text-gold uppercase"
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-white/10">
            <div className="flex items-center gap-2.5">
              <span
                className="w-7 h-7 rounded-full border border-white/30"
                style={{ backgroundColor: activePalette.primary }}
              />
              <span className="text-xs font-sans tabular-nums text-zinc-300">
                {t('active_color')}{' '}
                <strong className="achour-glossy-text font-medium">{activePalette.primary}</strong>
              </span>
            </div>
            {settings.customThemeColor && (
              <button
                type="button"
                data-tv-focusable="true"
                tabIndex={0}
                onClick={() => updateField('customThemeColor', null)}
                className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-gold hover:text-black text-xs font-medium text-zinc-200 cursor-pointer"
              >
                {t('clear_custom_color')}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 13. GLASS SURFACE OPACITY (Transparent Cards & Frames)
  if (subView === 'design-glass-opacity') {
    const val = typeof settings.glassOpacity === 'number' ? settings.glassOpacity : 16;
    return (
      <div className="max-w-2xl mx-auto py-3 space-y-4">
        <div className="p-5 rounded-3xl bg-white/[0.04] border border-white/15 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm sm:text-base font-semibold achour-glossy-text flex items-center gap-2">
              <Sliders size={18} />
              <span>{t('glass_opacity_heading')}</span>
            </span>
            <span className="text-lg font-sans tabular-nums font-semibold text-white">{val}%</span>
          </div>
          <div dir="ltr" className="flex items-center gap-3">
            <button
              type="button"
              data-tv-focusable="true"
              tabIndex={0}
              onClick={() => updateField('glassOpacity', Math.max(0, val - 2))}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-gold hover:text-black text-base font-medium cursor-pointer"
            >
              −
            </button>
            <input
              type="range"
              dir="ltr"
              min={0}
              max={85}
              step={1}
              value={val}
              onChange={(e) => updateField('glassOpacity', Number(e.target.value))}
              className="flex-1 accent-[var(--theme-primary)] cursor-pointer"
            />
            <button
              type="button"
              data-tv-focusable="true"
              tabIndex={0}
              onClick={() => updateField('glassOpacity', Math.min(85, val + 2))}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-gold hover:text-black text-base font-medium cursor-pointer"
            >
              +
            </button>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {[4, 16, 30, 50, 75].map((v) => (
              <button
                key={v}
                type="button"
                data-tv-focusable="true"
                tabIndex={0}
                onClick={() => updateField('glassOpacity', v)}
                className={`py-2 rounded-xl border text-xs font-sans tabular-nums font-medium cursor-pointer ${
                  val === v
                    ? 'achour-glossy-pill border-gold'
                    : 'bg-white/[0.04] border-white/10 text-zinc-200 hover:border-gold/50'
                }`}
              >
                {v}%
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 14. FROSTED GLASS BLUR
  if (subView === 'design-glass-blur') {
    const val = typeof settings.glassBlur === 'number' ? settings.glassBlur : 10;
    return (
      <div className="max-w-2xl mx-auto py-3 space-y-4">
        <div className="p-5 rounded-3xl bg-white/[0.04] border border-white/15 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm sm:text-base font-semibold achour-glossy-text flex items-center gap-2">
              <Layers size={18} />
              <span>{t('frosted_glass_blur_heading')}</span>
            </span>
            <span className="text-lg font-sans tabular-nums font-semibold text-white">{val}px</span>
          </div>
          <div dir="ltr" className="flex items-center gap-3">
            <button
              type="button"
              data-tv-focusable="true"
              tabIndex={0}
              onClick={() => updateField('glassBlur', Math.max(0, val - 2))}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-gold hover:text-black text-base font-medium cursor-pointer"
            >
              −
            </button>
            <input
              type="range"
              dir="ltr"
              min={0}
              max={24}
              step={1}
              value={val}
              onChange={(e) => updateField('glassBlur', Number(e.target.value))}
              className="flex-1 accent-[var(--theme-primary)] cursor-pointer"
            />
            <button
              type="button"
              data-tv-focusable="true"
              tabIndex={0}
              onClick={() => updateField('glassBlur', Math.min(24, val + 2))}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-gold hover:text-black text-base font-medium cursor-pointer"
            >
              +
            </button>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {[0, 6, 10, 16, 24].map((v) => (
              <button
                key={v}
                type="button"
                data-tv-focusable="true"
                tabIndex={0}
                onClick={() => updateField('glassBlur', v)}
                className={`py-2 rounded-xl border text-xs font-sans tabular-nums font-medium cursor-pointer ${
                  val === v
                    ? 'achour-glossy-pill border-gold'
                    : 'bg-white/[0.04] border-white/10 text-zinc-200 hover:border-gold/50'
                }`}
              >
                {v}px
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 15. DASHBOARD TV FOCUS MODE & GLOBAL FOCUS SHAPES
  if (subView === 'design-focus-mode') {
    const mode = settings.dashboardFocusMode || 'both';
    const focusStyle: FocusVisualStyle = settings.focusVisualStyle || 'lamp-halo';
    const shapeOptions: Array<{
      id: FocusVisualStyle;
      title: string;
      desc: string;
      previewClass: string;
    }> = [
      {
        id: 'lamp-halo',
        title: t('focus_style_lamp_halo_title'),
        desc: t('focus_style_lamp_halo_desc'),
        previewClass:
          'rounded-xl border border-white/85 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.85)_0%,rgba(var(--theme-rgb),0.75)_45%,transparent_85%)] shadow-[0_0_16px_rgba(var(--theme-rgb),0.85)]',
      },
      {
        id: 'double-neon',
        title: t('focus_style_double_neon_title'),
        desc: t('focus_style_double_neon_desc'),
        previewClass:
          'rounded-xl border-2 border-white outline outline-2 outline-[var(--theme-primary)] outline-offset-2 bg-[rgba(var(--theme-rgb),0.22)] shadow-[0_0_14px_rgba(var(--theme-rgb),0.85)]',
      },
      {
        id: 'spotlight-pillar',
        title: t('focus_style_spotlight_pillar_title'),
        desc: t('focus_style_spotlight_pillar_desc'),
        previewClass:
          'rounded-t-2xl rounded-b-lg border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.72)_0%,rgba(var(--theme-rgb),0.68)_50%,rgba(var(--theme-rgb),0.2)_100%)]',
      },
      {
        id: 'diamond-prism',
        title: t('focus_style_diamond_prism_title'),
        desc: t('focus_style_diamond_prism_desc'),
        previewClass:
          'rounded-lg border-2 border-white/90 bg-[linear-gradient(135deg,rgba(255,255,255,0.68)_0%,rgba(var(--theme-rgb),0.36)_45%,rgba(var(--theme-rgb),0.75)_100%)] shadow-[0_0_14px_rgba(var(--theme-rgb),0.8)]',
      },
      {
        id: 'cyber-brackets',
        title: t('focus_style_cyber_brackets_title'),
        desc: t('focus_style_cyber_brackets_desc'),
        previewClass:
          'rounded-md border border-[var(--theme-primary)] bg-[radial-gradient(circle,rgba(var(--theme-rgb),0.55)_0%,transparent_80%)] shadow-[inset_0_0_0_2px_rgba(255,255,255,0.65)]',
      },
      {
        id: 'aurora-capsule',
        title: t('focus_style_aurora_capsule_title'),
        desc: t('focus_style_aurora_capsule_desc'),
        previewClass:
          'rounded-full border-2 border-white/90 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.55)_0%,rgba(var(--theme-rgb),0.65)_65%,transparent_100%)] shadow-[0_0_16px_rgba(var(--theme-rgb),0.85)]',
      },
      {
        id: 'classic-ring',
        title: t('focus_style_classic_ring_title'),
        desc: t('focus_style_classic_ring_desc'),
        previewClass:
          'rounded-xl border-2 border-[var(--theme-primary)] bg-[rgba(var(--theme-rgb),0.14)]',
      },
    ];

    return (
      <div className="space-y-6 pb-4">
        <div>
          <h3 className="text-sm sm:text-base font-semibold achour-glossy-title flex items-center gap-2">
            <Target size={18} className="text-gold" />
            <span>{t('tv_focus_mode_heading')}</span>
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            {t('tv_focus_mode_desc')}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(
            [
              {
                id: 'frame' as const,
                title: t('focus_frame_title'),
                desc: t('focus_frame_desc'),
              },
              {
                id: 'label' as const,
                title: t('focus_label_title'),
                desc: t('focus_label_desc'),
              },
              {
                id: 'both' as const,
                title: t('focus_both_title'),
                desc: t('focus_both_desc'),
              },
              {
                id: 'icon' as const,
                title: t('focus_icon_title'),
                desc: t('focus_icon_desc'),
              },
            ] as const
          ).map((opt) => {
            const active = mode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                data-tv-focusable="true"
                tabIndex={0}
                onClick={() => updateField('dashboardFocusMode', opt.id)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col gap-1.5 ${
                  isRtl ? 'text-right' : 'text-left'
                } ${
                  active
                    ? 'border-gold bg-gold/15 shadow-[0_0_18px_var(--theme-glow,rgba(212,175,55,0.4))]'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/30'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-semibold text-xs sm:text-sm text-white">
                    {opt.title}
                  </span>
                  {active && (
                    <span className="w-5 h-5 rounded-full bg-gold text-black flex items-center justify-center font-semibold text-xs shrink-0">
                      ✓
                    </span>
                  )}
                </div>
                <span className="text-xs text-zinc-400">
                  {opt.desc}
                </span>
              </button>
            );
          })}
        </div>

        <div className="pt-4 border-t border-white/10 space-y-3">
          <div>
            <h3 className="text-sm sm:text-base font-semibold achour-glossy-title flex items-center gap-2">
              <Sparkles size={18} className="text-gold" />
              <span>{t('focus_shape_heading')}</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              {t('focus_shape_desc')}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {shapeOptions.map((opt) => {
              const active = focusStyle === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-tv-focusable="true"
                  tabIndex={0}
                  onClick={() => updateField('focusVisualStyle', opt.id)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 ${
                    isRtl ? 'text-right' : 'text-left'
                  } ${
                    active
                      ? 'border-gold bg-gold/15 shadow-[0_0_18px_var(--theme-glow,rgba(212,175,55,0.4))]'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/30'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`w-10 h-10 shrink-0 ${opt.previewClass}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-xs sm:text-sm text-white truncate">
                        {opt.title}
                      </span>
                      {active && (
                        <span className="w-5 h-5 rounded-full bg-gold text-black flex items-center justify-center font-semibold text-xs shrink-0">
                          ✓
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-2">
                      {opt.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // 16. DASHBOARD SECTION LABELS COLOR
  if (subView === 'design-label-color') {
    const colorMode = settings.dashboardLabelColorMode || 'theme';
    return (
      <div className="space-y-4 pb-4">
        <div>
          <h3 className="text-sm sm:text-base font-semibold achour-glossy-title flex items-center gap-2">
            <Type size={18} className="text-gold" />
            <span>
              {t('section_label_colors_heading')}
            </span>
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            {t('section_label_colors_desc')}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(
            [
              {
                id: 'theme' as const,
                swatch: 'var(--theme-primary, #D4AF37)',
                title: t('label_color_theme'),
                sub: t('label_color_theme_sub'),
              },
              {
                id: 'white' as const,
                swatch: '#FFFFFF',
                title: t('label_color_white'),
                sub: t('label_color_white_sub'),
              },
              {
                id: 'gold' as const,
                swatch: '#D4AF37',
                title: t('label_color_gold'),
                sub: '#D4AF37',
              },
              {
                id: 'custom' as const,
                swatch: settings.dashboardLabelCustomColor || '#FFD700',
                title: t('label_color_custom'),
                sub: settings.dashboardLabelCustomColor || '#HEX',
              },
            ] as const
          ).map((opt) => {
            const active = colorMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                data-tv-focusable="true"
                tabIndex={0}
                onClick={() => updateField('dashboardLabelColorMode', opt.id)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 text-center ${
                  active
                    ? 'border-gold bg-gold/15 shadow-[0_0_16px_var(--theme-glow,rgba(212,175,55,0.4))]'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/30'
                }`}
              >
                <span
                  className="w-6 h-6 rounded-full border border-white/30"
                  style={{ backgroundColor: opt.swatch }}
                />
                <span className="text-xs sm:text-sm font-medium text-white mt-1">
                  {opt.title}
                </span>
                <span className="text-[11px] text-zinc-400">
                  {opt.sub}
                </span>
              </button>
            );
          })}
        </div>

        {colorMode === 'custom' && (
          <div dir="ltr" className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-wrap items-center gap-3">
            <input
              type="color"
              value={settings.dashboardLabelCustomColor || '#FFD700'}
              onChange={(e) => updateField('dashboardLabelCustomColor', e.target.value.toUpperCase())}
              className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0"
            />
            <input
              type="text"
              value={settings.dashboardLabelCustomColor || '#FFD700'}
              onChange={(e) => updateField('dashboardLabelCustomColor', e.target.value.toUpperCase())}
              placeholder="#RRGGBB"
              className="px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white font-sans tabular-nums text-xs uppercase w-32"
            />
            <span className="text-xs text-zinc-300">
              {t('pick_label_color')}
            </span>
          </div>
        )}
      </div>
    );
  }

  // 17. COMPREHENSIVE WINDOW & MODAL SIZE CONTROL (Global + 5 Independent Categories)
  if (subView === 'window-sizes') {
    const ws: WindowSizeScales = settings.windowScales || {};
    const clampScale = (v: number) => Math.max(60, Math.min(140, Math.round(v)));
    const globalVal = typeof ws.global === 'number' ? clampScale(ws.global) : 100;

    const setWindowScale = (key: keyof WindowSizeScales, nextVal: number) => {
      const clamped = clampScale(nextVal);
      onUpdateSettings((prev) => ({
        ...prev,
        windowScales: {
          global: 100,
          details: 100,
          playerPopups: 100,
          confirm: 100,
          settings: 100,
          playlists: 100,
          ...(prev.windowScales || {}),
          [key]: clamped,
        },
      }));
    };

    const resetAllWindowSizes = () => {
      onUpdateSettings((prev) => ({
        ...prev,
        windowScales: {
          global: 100,
          details: 100,
          playerPopups: 100,
          confirm: 100,
          settings: 100,
          playlists: 100,
        },
      }));
    };

    const categories: Array<{
      key: Exclude<keyof WindowSizeScales, 'global'>;
      title: string;
      desc: string;
    }> = [
      {
        key: 'details',
        title: t('win_cat_details_title'),
        desc: t('win_cat_details_desc'),
      },
      {
        key: 'playerPopups',
        title: t('win_cat_player_title'),
        desc: t('win_cat_player_desc'),
      },
      {
        key: 'confirm',
        title: t('win_cat_confirm_title'),
        desc: t('win_cat_confirm_desc'),
      },
      {
        key: 'settings',
        title: t('win_cat_settings_title'),
        desc: t('win_cat_settings_desc'),
      },
      {
        key: 'playlists',
        title: t('win_cat_playlists_title'),
        desc: t('win_cat_playlists_desc'),
      },
    ];

    const hasAnyCustom =
      globalVal !== 100 ||
      categories.some((c) => typeof ws[c.key] === 'number' && clampScale(ws[c.key] as number) !== 100);

    return (
      <div className="max-w-4xl mx-auto py-2 space-y-4 pb-6">
        {/* Header & Reset All */}
        <div className="p-4 rounded-3xl bg-white/[0.04] border border-white/15 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm sm:text-base font-semibold achour-glossy-title">
              {t('all_windows_control_title')}
            </h2>
            <p className="text-xs text-zinc-300 mt-0.5">
              {t('all_windows_control_desc')}
            </p>
          </div>
          <button
            type="button"
            data-tv-focusable="true"
            tabIndex={0}
            onClick={resetAllWindowSizes}
            disabled={!hasAnyCustom}
            className={`px-3.5 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
              hasAnyCustom
                ? 'achour-glossy-pill hover:brightness-110'
                : 'bg-white/10 text-zinc-400 opacity-60 cursor-default'
            }`}
          >
            <RotateCcw size={13} />
            <span>{t('reset_all_100')}</span>
          </button>
        </div>

        {/* Master / Global Window Scale */}
        <div className="p-4 rounded-3xl bg-gold/10 border border-gold/40 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold achour-glossy-text">
                {t('global_scale_title')}
              </h3>
              <p className="text-[11px] text-zinc-300">
                {t('global_scale_desc')}
              </p>
            </div>
            <span className="text-lg font-sans tabular-nums font-semibold achour-glossy-text px-3 py-1 rounded-xl bg-black/40 border border-gold/30">
              {globalVal}%
            </span>
          </div>

          <div dir="ltr" className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-tv-focusable="true"
              tabIndex={0}
              onClick={() => setWindowScale('global', globalVal - 5)}
              className="px-3 py-1.5 rounded-xl bg-black/40 border border-white/15 hover:border-gold text-xs font-sans tabular-nums font-medium text-white cursor-pointer"
            >
              -5%
            </button>
            <button
              type="button"
              data-tv-focusable="true"
              tabIndex={0}
              onClick={() => setWindowScale('global', globalVal - 1)}
              className="px-3 py-1.5 rounded-xl bg-black/40 border border-white/15 hover:border-gold text-xs font-sans tabular-nums font-medium text-white cursor-pointer"
            >
              -1%
            </button>
            <input
              type="range"
              dir="ltr"
              min={60}
              max={140}
              step={1}
              value={globalVal}
              onChange={(e) => setWindowScale('global', Number(e.target.value))}
              className="flex-1 min-w-[120px] accent-[var(--theme-primary)] cursor-pointer"
            />
            <button
              type="button"
              data-tv-focusable="true"
              tabIndex={0}
              onClick={() => setWindowScale('global', globalVal + 1)}
              className="px-3 py-1.5 rounded-xl bg-black/40 border border-white/15 hover:border-gold text-xs font-sans tabular-nums font-medium text-white cursor-pointer"
            >
              +1%
            </button>
            <button
              type="button"
              data-tv-focusable="true"
              tabIndex={0}
              onClick={() => setWindowScale('global', globalVal + 5)}
              className="px-3 py-1.5 rounded-xl bg-black/40 border border-white/15 hover:border-gold text-xs font-sans tabular-nums font-medium text-white cursor-pointer"
            >
              +5%
            </button>
            <button
              type="button"
              data-tv-focusable="true"
              tabIndex={0}
              onClick={() => setWindowScale('global', 100)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-medium cursor-pointer ${
                globalVal === 100
                  ? 'achour-glossy-pill border-gold'
                  : 'bg-black/40 border-white/15 text-zinc-200 hover:border-gold'
              }`}
            >
              100%
            </button>
          </div>
        </div>

        {/* Independent Per-Category Controls */}
        <div className="grid grid-cols-1 gap-3">
          {categories.map((cat) => {
            const val = typeof ws[cat.key] === 'number' ? clampScale(ws[cat.key] as number) : 100;
            const effectivePct = Math.round((globalVal * val) / 100);
            return (
              <div
                key={cat.key}
                className="p-3.5 sm:p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-xs sm:text-sm font-medium text-white">
                      {cat.title}
                    </h4>
                    <p className="text-[11px] text-zinc-400 truncate">
                      {cat.desc}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-sans tabular-nums font-semibold achour-glossy-text">{val}%</span>
                    {globalVal !== 100 && (
                      <span className="text-[10px] font-sans tabular-nums px-2 py-0.5 rounded-lg bg-white/10 text-zinc-300">
                        {t('net_scale_pct', { pct: effectivePct })}
                      </span>
                    )}
                  </div>
                </div>

                <div dir="ltr" className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    data-tv-focusable="true"
                    tabIndex={0}
                    onClick={() => setWindowScale(cat.key, val - 5)}
                    className="px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 hover:border-gold text-xs font-sans tabular-nums font-medium text-white cursor-pointer"
                  >
                    -5%
                  </button>
                  <button
                    type="button"
                    data-tv-focusable="true"
                    tabIndex={0}
                    onClick={() => setWindowScale(cat.key, val - 1)}
                    className="px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 hover:border-gold text-xs font-sans tabular-nums font-medium text-white cursor-pointer"
                  >
                    -1%
                  </button>
                  {[80, 90, 100, 110, 120].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      data-tv-focusable="true"
                      tabIndex={0}
                      onClick={() => setWindowScale(cat.key, preset)}
                      className={`px-2.5 py-1.5 rounded-xl border text-xs font-sans tabular-nums font-medium cursor-pointer ${
                        val === preset
                          ? 'achour-glossy-pill border-gold'
                          : 'bg-white/[0.04] border-white/10 text-zinc-300 hover:border-gold/50'
                      }`}
                    >
                      {preset}%
                    </button>
                  ))}
                  <button
                    type="button"
                    data-tv-focusable="true"
                    tabIndex={0}
                    onClick={() => setWindowScale(cat.key, val + 1)}
                    className="px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 hover:border-gold text-xs font-sans tabular-nums font-medium text-white cursor-pointer"
                  >
                    +1%
                  </button>
                  <button
                    type="button"
                    data-tv-focusable="true"
                    tabIndex={0}
                    onClick={() => setWindowScale(cat.key, val + 5)}
                    className="px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 hover:border-gold text-xs font-sans tabular-nums font-medium text-white cursor-pointer"
                  >
                    +5%
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}
