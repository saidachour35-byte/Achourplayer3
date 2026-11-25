// Original path: src/components/DashboardDesignStudio.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Check,
  ChevronLeft,
  Eye,
  Frame,
  Layers,
  Maximize2,
  Palette,
  RotateCcw,
  Sliders,
  Sparkles,
  Target,
  Type,
  X,
} from 'lucide-react';
import {
  AppSettings,
  FocusVisualStyle,
  FrameShapeId,
  IconDisplayMode,
  IconPackId,
} from '../types';
import {
  APP_BACKGROUNDS,
  FRAME_SHAPES,
  ICON_PACKS,
  ROYAL_THEMES,
  applyRoyalTheme,
  computePaletteFromHex,
  isValidHexColor,
  normalizeHexColor,
  resolveDesignSettings,
} from '../utils/themeManager';
import DashboardLayouts, { IconKind } from './DashboardLayouts';
import { DashboardSectionIcon, PackIconSvg } from './IconPacks';

export type StudioTabId =
  | 'display'
  | 'icons'
  | 'frames'
  | 'sizing'
  | 'colors'
  | 'focus_text'
  | 'glass';

interface DashboardDesignStudioProps {
  settings: AppSettings;
  initialTab?: StudioTabId;
  isRtl: boolean;
  t: (key: any) => string;
  onCommit: (nextDesign: Partial<AppSettings>) => void;
  onBack: () => void;
}

export const DEFAULT_DASHBOARD_ORDER: IconKind[] = ['live', 'movies', 'series', 'add', 'settings'];
const DEFAULT_ORDER = DEFAULT_DASHBOARD_ORDER;

export default function DashboardDesignStudio({
  settings,
  initialTab = 'display',
  isRtl,
  t,
  onCommit,
  onBack,
}: DashboardDesignStudioProps) {
  const makeDraftFromSettings = (src: AppSettings): AppSettings => {
    const r = resolveDesignSettings(src);
    return {
      ...src,
      iconDisplayMode: r.iconDisplayMode,
      iconPack: r.iconPack,
      frameShape: r.frameShape,
      iconScale: src.iconScale || 'md',
      frameScale: src.frameScale || 'md',
      tileSpacing: src.tileSpacing || 'md',
      dashboardAlignment: src.dashboardAlignment || 'bottom',
      dashboardHorizontalAlignment: src.dashboardHorizontalAlignment || 'center',
      dashboardOrder: src.dashboardOrder?.length ? [...src.dashboardOrder] : [...DEFAULT_ORDER],
      royalThemeColor: src.royalThemeColor || 'pure-metallic-gold',
      customThemeColor: src.customThemeColor ?? null,
      glassOpacity: typeof src.glassOpacity === 'number' ? src.glassOpacity : 16,
      glassBlur: typeof src.glassBlur === 'number' ? src.glassBlur : 10,
      dashboardFocusMode: src.dashboardFocusMode || 'both',
      focusVisualStyle: src.focusVisualStyle || 'frameless-glow',
      dashboardLabelColorMode: src.dashboardLabelColorMode || 'theme',
      dashboardLabelCustomColor: src.dashboardLabelCustomColor ?? null,
    };
  };

  const [draft, setDraft] = useState<AppSettings>(() => makeDraftFromSettings(settings));
  const [activeTab, setActiveTab] = useState<StudioTabId>(initialTab);
  const [hexInput, setHexInput] = useState<string>(() => {
    const c = normalizeHexColor(settings.customThemeColor);
    if (c) return c;
    const preset = ROYAL_THEMES.find((th) => th.id === (settings.royalThemeColor || 'pure-metallic-gold'));
    return preset?.primary || '#D4AF37';
  });
  const [justApplied, setJustApplied] = useState(false);

  // Track latest committed settings so unmount cleanly restores saved theme if unconfirmed
  const committedSettingsRef = useRef(settings);
  committedSettingsRef.current = settings;

  // Live-apply draft colors & glass opacity/blur while inspecting in studio
  useEffect(() => {
    applyRoyalTheme(
      draft.royalThemeColor || 'pure-metallic-gold',
      draft.customThemeColor,
      draft.glassOpacity,
      draft.glassBlur
    );
  }, [draft.royalThemeColor, draft.customThemeColor, draft.glassOpacity, draft.glassBlur]);

  // Restore committed theme on unmount if uncommitted changes exist
  useEffect(() => {
    return () => {
      const s = committedSettingsRef.current;
      applyRoyalTheme(
        s.royalThemeColor || 'pure-metallic-gold',
        s.customThemeColor,
        s.glassOpacity,
        s.glassBlur
      );
    };
  }, []);

  const hasUnsavedChanges = useMemo(() => {
    const base = makeDraftFromSettings(settings);
    return (
      draft.iconDisplayMode !== base.iconDisplayMode ||
      draft.iconPack !== base.iconPack ||
      draft.frameShape !== base.frameShape ||
      draft.iconScale !== base.iconScale ||
      draft.frameScale !== base.frameScale ||
      draft.tileSpacing !== base.tileSpacing ||
      draft.dashboardAlignment !== base.dashboardAlignment ||
      draft.dashboardHorizontalAlignment !== base.dashboardHorizontalAlignment ||
      JSON.stringify(draft.dashboardOrder) !== JSON.stringify(base.dashboardOrder) ||
      draft.royalThemeColor !== base.royalThemeColor ||
      (draft.customThemeColor || null) !== (base.customThemeColor || null) ||
      (draft.glassOpacity ?? 16) !== (base.glassOpacity ?? 16) ||
      (draft.glassBlur ?? 10) !== (base.glassBlur ?? 10) ||
      draft.dashboardFocusMode !== base.dashboardFocusMode ||
      draft.focusVisualStyle !== base.focusVisualStyle ||
      draft.dashboardLabelColorMode !== base.dashboardLabelColorMode ||
      (draft.dashboardLabelCustomColor || null) !== (base.dashboardLabelCustomColor || null)
    );
  }, [draft, settings]);

  const updateDraft = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setJustApplied(false);
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleApplyConfirm = () => {
    onCommit({
      iconDisplayMode: draft.iconDisplayMode,
      iconPack: draft.iconPack,
      frameShape: draft.frameShape,
      iconScale: draft.iconScale,
      frameScale: draft.frameScale,
      tileSpacing: draft.tileSpacing,
      dashboardAlignment: draft.dashboardAlignment,
      dashboardHorizontalAlignment: draft.dashboardHorizontalAlignment,
      dashboardOrder: draft.dashboardOrder,
      royalThemeColor: draft.royalThemeColor,
      customThemeColor: draft.customThemeColor ?? null,
      glassOpacity: draft.glassOpacity,
      glassBlur: draft.glassBlur,
      dashboardFocusMode: draft.dashboardFocusMode,
      focusVisualStyle: draft.focusVisualStyle,
      dashboardLabelColorMode: draft.dashboardLabelColorMode,
      dashboardLabelCustomColor: draft.dashboardLabelCustomColor ?? null,
    });
    setJustApplied(true);
    setTimeout(() => setJustApplied(false), 2400);
  };

  const handleCancelDiscard = () => {
    const s = committedSettingsRef.current;
    applyRoyalTheme(
      s.royalThemeColor || 'pure-metallic-gold',
      s.customThemeColor,
      s.glassOpacity,
      s.glassBlur
    );
    onBack();
  };

  const handleResetDefaults = () => {
    setJustApplied(false);
    setDraft((prev) => ({
      ...prev,
      iconDisplayMode: 'icons-only',
      iconPack: 'pack-3d',
      frameShape: 'rounded-square',
      iconScale: 'md',
      frameScale: 'md',
      tileSpacing: 'md',
      dashboardAlignment: 'bottom',
      dashboardHorizontalAlignment: 'center',
      dashboardOrder: [...DEFAULT_ORDER],
      royalThemeColor: 'pure-metallic-gold',
      customThemeColor: '#D4AF37',
      glassOpacity: 16,
      glassBlur: 10,
      dashboardFocusMode: 'both',
      focusVisualStyle: 'frameless-glow',
      dashboardLabelColorMode: 'theme',
      dashboardLabelCustomColor: null,
    }));
    setHexInput('#D4AF37');
  };

  const bgConfig = useMemo(() => {
    const id = settings.backgroundStyle || 'bg-raouche-rocks-beirut';
    return APP_BACKGROUNDS.find((b) => b.id === id) || APP_BACKGROUNDS[0];
  }, [settings.backgroundStyle]);

  const customBgUrl =
    typeof settings.customBackground === 'string' && settings.customBackground.trim()
      ? settings.customBackground.trim()
      : typeof settings.customBackground === 'object' && settings.customBackground?.url
      ? settings.customBackground.url
      : null;

  const activePalette = useMemo(() => {
    const validCustom = normalizeHexColor(draft.customThemeColor);
    if (validCustom) return computePaletteFromHex(validCustom);
    const preset = ROYAL_THEMES.find((th) => th.id === draft.royalThemeColor) || ROYAL_THEMES[0];
    return computePaletteFromHex(preset.primary);
  }, [draft.customThemeColor, draft.royalThemeColor]);

  const tabs: Array<{ id: StudioTabId; icon: React.ComponentType<any>; labelAr: string; labelEn: string }> = [
    { id: 'display', icon: Eye, labelAr: 'العرض', labelEn: 'Display' },
    { id: 'icons', icon: Sparkles, labelAr: 'الأيقونات', labelEn: 'Icons' },
    { id: 'frames', icon: Frame, labelAr: 'الإطارات', labelEn: 'Frames' },
    { id: 'sizing', icon: Maximize2, labelAr: 'الأحجام', labelEn: 'Sizing' },
    { id: 'colors', icon: Palette, labelAr: 'الألوان', labelEn: 'Colors' },
    { id: 'focus_text', icon: Target, labelAr: 'الفوكس والنصوص', labelEn: 'Focus & Text' },
    { id: 'glass', icon: Layers, labelAr: 'الشفافية', labelEn: 'Glass' },
  ];

  const moveOrderItem = (index: number, delta: -1 | 1) => {
    const cur = [...(draft.dashboardOrder || DEFAULT_ORDER)];
    const target = index + delta;
    if (target < 0 || target >= cur.length) return;
    [cur[index], cur[target]] = [cur[target], cur[index]];
    updateDraft('dashboardOrder', cur);
  };

  const previewAlignV =
    draft.dashboardAlignment === 'top'
      ? 'justify-start pt-2'
      : draft.dashboardAlignment === 'bottom'
      ? 'justify-end pb-2'
      : 'justify-center';

  const previewAlignH =
    draft.dashboardHorizontalAlignment === 'left'
      ? 'items-start'
      : draft.dashboardHorizontalAlignment === 'right'
      ? 'items-end'
      : 'items-center';

  return (
    <div
      className={`h-full w-full flex flex-col px-3 sm:px-5 py-2.5 overflow-hidden select-none ${
        isRtl ? 'font-cairo text-right' : 'font-sans text-left'
      }`}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Top Studio Header Bar */}
      <header className="w-full max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            data-tv-focusable="true"
            tabIndex={0}
            onClick={handleCancelDiscard}
            className="p-2 rounded-xl bg-white/10 hover:bg-gold hover:text-black text-white transition-none cursor-pointer shrink-0"
            title={isRtl ? 'رجوع' : 'Back'}
          >
            <ChevronLeft size={18} className={isRtl ? 'rotate-180' : ''} />
          </button>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-lg font-semibold achour-glossy-title truncate">
              {isRtl ? 'استوديو تصميم واجهة Achour Player' : 'Achour Player UI Design Studio'}
            </h2>
            <p className="text-[11px] font-normal achour-glossy-info truncate">
              {isRtl
                ? 'خصص الأيقونات والإطارات والتوزيع والألوان مع معاينة فورية قبل الاعتماد'
                : 'Mix & match icons, frames, layouts, gold tones & glass with live preview'}
            </p>
          </div>
        </div>

        {/* Apply / Confirm + Reset + Cancel */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-tv-focusable="true"
            tabIndex={0}
            onClick={handleResetDefaults}
            className="px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/15 border border-white/15 text-zinc-200 text-xs font-bold flex items-center gap-1.5 transition-none cursor-pointer whitespace-nowrap"
          >
            <RotateCcw size={14} />
            <span>{isRtl ? 'افتراضي' : 'Reset'}</span>
          </button>

          <button
            type="button"
            data-tv-focusable="true"
            tabIndex={0}
            onClick={handleCancelDiscard}
            className="px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-red-500/20 border border-white/15 hover:border-red-400/50 text-zinc-200 text-xs font-bold flex items-center gap-1.5 transition-none cursor-pointer whitespace-nowrap"
          >
            <X size={14} />
            <span>{isRtl ? 'إلغاء' : 'Cancel'}</span>
          </button>

          <button
            type="button"
            data-tv-focusable="true"
            tabIndex={0}
            onClick={handleApplyConfirm}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium flex items-center gap-1.5 hover:brightness-110 transition-none cursor-pointer whitespace-nowrap ${
              justApplied
                ? 'bg-emerald-500 text-black'
                : 'achour-glossy-pill'
            }`}
          >
            <Check size={16} strokeWidth={3} />
            <span>
              {justApplied
                ? isRtl
                  ? 'تم الحفظ والتطبيق!'
                  : 'Applied & Saved!'
                : isRtl
                ? 'تطبيق وتأكيد'
                : 'Apply / Confirm'}
            </span>
          </button>
        </div>
      </header>

      {/* Main Split Studio Stage: Live Preview (Left/Top) + Customization Controls (Right/Bottom) */}
      <div className="w-full max-w-7xl mx-auto flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3.5 overflow-hidden">
        {/* LIVE PREVIEW PANEL */}
        <section className="lg:col-span-5 flex flex-col gap-2 min-h-[210px] sm:min-h-[245px] lg:min-h-0">
          <div className="flex items-center justify-between px-1 shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-xs font-medium achour-glossy-text">
                {isRtl ? 'معاينة مباشرة فورية' : 'Live Interactive Preview'}
              </span>
            </div>
            {hasUnsavedChanges && (
              <span className="px-2 py-0.5 rounded-lg achour-glossy-surface border border-gold/50 text-[10px] font-medium">
                <span className="achour-glossy-text">{isRtl ? 'تعديلات غير محفوظة' : 'Draft Active'}</span>
              </span>
            )}
          </div>

          {/* Miniature Achour Player Screen Canvas */}
          <div className="relative flex-1 min-h-[180px] rounded-3xl border border-gold/40 overflow-hidden shadow-2xl bg-black flex flex-col">
            {customBgUrl ? (
              <div
                className="absolute inset-0 bg-cover bg-center pointer-events-none"
                style={{ backgroundImage: `url(${customBgUrl})` }}
              />
            ) : (
              bgConfig?.imageUrl && (
                <img
                  src={bgConfig.imageUrl}
                  alt={bgConfig.nameEn}
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                />
              )
            )}
            <div className="absolute inset-0 bg-black/50 pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/65 pointer-events-none" />

            {/* Preview Top Brand Bar (Strictly no mini video player) */}
            <div
              dir="ltr"
              className="relative z-10 flex items-center justify-between px-4 pt-2.5 pb-1 shrink-0"
            >
              <span className="text-[10px] font-sans font-normal achour-glossy-info">
                {isRtl ? 'اشتراك نشط' : 'ACTIVE'}
              </span>
              <span className="text-xs font-semibold tracking-widest achour-glossy-title uppercase">
                ACHOUR PLAYER
              </span>
              <span className="text-[10px] font-sans font-normal tabular-nums achour-glossy-info">21:45</span>
            </div>

            {/* Live Rendered 5 Sections */}
            <div
              className={`relative z-10 flex-1 min-h-0 flex flex-col px-3.5 py-2 overflow-hidden ${previewAlignV} ${previewAlignH}`}
            >
              <div
                className={
                  draft.dashboardHorizontalAlignment === 'left' ||
                  draft.dashboardHorizontalAlignment === 'right'
                    ? 'w-[78%]'
                    : 'w-full'
                }
              >
                <DashboardLayouts
                  previewMode
                  dashboardOrder={draft.dashboardOrder}
                  iconDisplayMode={draft.iconDisplayMode}
                  iconPack={draft.iconPack}
                  frameShape={draft.frameShape}
                  iconSize={draft.iconScale}
                  frameScale={draft.frameScale}
                  tileSpacing={draft.tileSpacing}
                  glassOpacity={draft.glassOpacity}
                  glassBlur={draft.glassBlur}
                  dashboardFocusMode={draft.dashboardFocusMode}
                  focusVisualStyle={draft.focusVisualStyle}
                  dashboardLabelColorMode={draft.dashboardLabelColorMode}
                  dashboardLabelCustomColor={draft.dashboardLabelCustomColor}
                  language={settings.language}
                  isRtl={isRtl}
                  t={t}
                  onNavigate={() => {}}
                />
              </div>
            </div>
          </div>

          {/* Active Mix-and-Match Recipe Bar */}
          <div className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/10 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-1.5 text-[11px] shrink-0">
            <div className="truncate">
              <span className="text-zinc-400">{isRtl ? 'العرض: ' : 'Mode: '}</span>
              <strong className="achour-glossy-text font-medium">
                {draft.iconDisplayMode === 'icons-only'
                  ? isRtl
                    ? 'أيقونات فقط'
                    : 'Icons Only'
                  : isRtl
                  ? 'مع إطارات'
                  : 'With Frames'}
              </strong>
            </div>
            <div className="truncate">
              <span className="text-zinc-400">{isRtl ? 'الأيقونات: ' : 'Pack: '}</span>
              <strong className="text-white font-medium">
                {ICON_PACKS.find((p) => p.id === draft.iconPack)?.[isRtl ? 'nameAr' : 'nameEn']}
              </strong>
            </div>
            <div className="truncate">
              <span className="text-zinc-400">{isRtl ? 'الإطار: ' : 'Frame: '}</span>
              <strong className="text-white font-medium">
                {draft.iconDisplayMode === 'icons-only'
                  ? isRtl
                    ? 'موقوف'
                    : 'Off'
                  : FRAME_SHAPES.find((f) => f.id === draft.frameShape)?.[
                      isRtl ? 'nameAr' : 'nameEn'
                    ]}
              </strong>
            </div>
            <div className="flex items-center gap-1.5 truncate">
              <span
                className="w-3 h-3 rounded-full border border-white/30 shrink-0"
                style={{ backgroundColor: activePalette.primary }}
              />
              <strong className="font-sans font-normal tabular-nums achour-glossy-info truncate">{activePalette.primary}</strong>
            </div>
          </div>
        </section>

        {/* CONTROLS WORKSPACE */}
        <section className="lg:col-span-7 flex flex-col min-h-0 overflow-hidden">
          {/* Studio Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2 mb-2 border-b border-white/10 shrink-0">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-tv-focusable="true"
                  tabIndex={0}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-2 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-none cursor-pointer shrink-0 whitespace-nowrap ${
                    isActive
                      ? 'achour-glossy-surface border-gold text-gold shadow-[0_0_12px_var(--theme-glow)]'
                      : 'bg-white/[0.04] border-white/10 text-zinc-300 hover:border-gold/40 hover:text-white'
                  }`}
                >
                  <Icon size={14} className="shrink-0" />
                  <span className={isActive ? 'achour-glossy-text' : ''}>{isRtl ? tab.labelAr : tab.labelEn}</span>
                </button>
              );
            })}
          </div>

          {/* Scrollable Active Tab Content */}
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar pr-0.5 pb-3 space-y-4">
            {/* =============================================================== */}
            {/* TAB 1: OPTION 1 — DISPLAY MODE (Icons Only vs With Frames)     */}
            {/* =============================================================== */}
            {activeTab === 'display' && (
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold achour-glossy-title">
                    {isRtl ? 'الخيار الأول: طريقة عرض الأيقونات' : 'Option 1: Icon Display Mode'}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {isRtl
                      ? 'اختر عرض الأيقونات وحدها بحرية تامة دون أي إطار أو خلفية، أو عرضها داخل إطارات مستقلة.'
                      : 'Show pure icons cleanly with zero borders/backgrounds, or enable customizable frames.'}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(
                    [
                      {
                        mode: 'icons-only' as IconDisplayMode,
                        titleAr: 'أيقونات فقط (بدون إطار)',
                        titleEn: 'Icons Only (No Frame)',
                        descAr:
                          'عرض الأيقونات مباشرة فوق الخلفية بدون أي إطار أو صندوق أو حدود.',
                        descEn:
                          'Pure borderless SVG icons floating directly over your wallpaper.',
                      },
                      {
                        mode: 'with-frames' as IconDisplayMode,
                        titleAr: 'أيقونات مع إطارات',
                        titleEn: 'Icons With Frames',
                        descAr:
                          'تشغيل الإطارات الهندسية والزجاجية والمعدنية حول كل قسم مع حرية التخصيص.',
                        descEn:
                          'Enable sculptural frames (circle, hex, glass, metallic, geometric).',
                      },
                    ] as const
                  ).map((opt) => {
                    const active = draft.iconDisplayMode === opt.mode;
                    return (
                      <button
                        key={opt.mode}
                        type="button"
                        data-tv-focusable="true"
                        tabIndex={0}
                        onClick={() => updateDraft('iconDisplayMode', opt.mode)}
                        className={`p-4 rounded-2xl border transition-none flex flex-col gap-3 cursor-pointer ${
                          active
                            ? 'border-gold bg-gold/15 shadow-[0_0_18px_var(--theme-glow)]'
                            : 'border-white/10 bg-white/[0.04] hover:border-gold/45'
                        } ${isRtl ? 'text-right' : 'text-left'}`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-sm font-medium text-white">
                            {isRtl ? opt.titleAr : opt.titleEn}
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
                            iconPack={draft.iconPack || 'pack-3d'}
                            frameShape={draft.frameShape || 'rounded-square'}
                            sizeOverridePx={32}
                            frameSizeOverridePx={54}
                          />
                          <DashboardSectionIcon
                            kind="movies"
                            displayMode={opt.mode}
                            iconPack={draft.iconPack || 'pack-3d'}
                            frameShape={draft.frameShape || 'rounded-square'}
                            sizeOverridePx={32}
                            frameSizeOverridePx={54}
                          />
                          <DashboardSectionIcon
                            kind="series"
                            displayMode={opt.mode}
                            iconPack={draft.iconPack || 'pack-3d'}
                            frameShape={draft.frameShape || 'rounded-square'}
                            sizeOverridePx={32}
                            frameSizeOverridePx={54}
                          />
                        </div>
                        <p className="text-xs text-zinc-300 leading-relaxed">
                          {isRtl ? opt.descAr : opt.descEn}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* =============================================================== */}
            {/* TAB 2: OPTION 2 — 10 DISTINCT ICON PACKS                        */}
            {/* =============================================================== */}
            {activeTab === 'icons' && (
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold achour-glossy-title">
                    {isRtl ? `الخيار الثاني: شكل الأيقونات (${ICON_PACKS.length} أشكال مختلفة)` : `Option 2: Icon Artwork (${ICON_PACKS.length} Distinct Styles)`}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {isRtl
                      ? '10 حزم أيقونات برسومات هندسية ومجسمة وزجاجية ومعدنية ونيون مختلفة بوضوح لكل قسم.'
                      : '10 genuinely distinct vector icon styles across Live, Movies, Series, Playlist & Settings.'}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {ICON_PACKS.map((pack) => {
                    const active = draft.iconPack === pack.id;
                    return (
                      <button
                        key={pack.id}
                        type="button"
                        data-tv-focusable="true"
                        tabIndex={0}
                        onClick={() => updateDraft('iconPack', pack.id as IconPackId)}
                        className={`achour-perf-grid-item p-3.5 rounded-2xl border transition-none flex flex-col gap-2.5 cursor-pointer ${
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
                          {(['live', 'movies', 'series', 'add', 'settings'] as IconKind[]).map(
                            (k) => (
                              <PackIconSvg
                                key={k}
                                kind={k}
                                pack={pack.id}
                                sizePx={28}
                              />
                            )
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-300 leading-snug">
                          {isRtl ? pack.descriptionAr : pack.descriptionEn}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* =============================================================== */}
            {/* TAB 3: OPTION 3 — 40 INDEPENDENT FRAME SHAPES                   */}
            {/* =============================================================== */}
            {activeTab === 'frames' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold achour-glossy-title">
                      {isRtl
                        ? `الخيار الثالث: شكل الإطارات (${FRAME_SHAPES.length} شكلاً مستقلاً)`
                        : `Option 3: Independent Frame Shapes (${FRAME_SHAPES.length})`}
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {isRtl
                        ? 'ادمج أي شكل إطار من الـ 40 شكلاً مع أي حزمة أيقونات بكل حرية.'
                        : 'Combine any of the 40 distinct frame silhouettes freely with any icon pack.'}
                    </p>
                  </div>
                  {draft.iconDisplayMode === 'icons-only' && (
                    <button
                      type="button"
                      data-tv-focusable="true"
                      tabIndex={0}
                      onClick={() => updateDraft('iconDisplayMode', 'with-frames')}
                      className="px-3 py-1.5 rounded-xl achour-glossy-pill text-xs font-medium cursor-pointer whitespace-nowrap"
                    >
                      {isRtl ? 'تفعيل عرض الإطارات الآن' : 'Enable Frames Now'}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {FRAME_SHAPES.map((shape) => {
                    const active = draft.frameShape === shape.id;
                    return (
                      <button
                        key={shape.id}
                        type="button"
                        data-tv-focusable="true"
                        tabIndex={0}
                        onClick={() => {
                          setJustApplied(false);
                          setDraft((prev) => ({
                            ...prev,
                            frameShape: shape.id as FrameShapeId,
                            iconDisplayMode: 'with-frames',
                          }));
                        }}
                        className={`achour-perf-grid-item p-3 rounded-2xl border transition-none flex flex-col items-center gap-2 text-center cursor-pointer ${
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
                            iconPack={draft.iconPack || 'pack-3d'}
                            frameShape={shape.id}
                            sizeOverridePx={28}
                            frameSizeOverridePx={58}
                            glassOpacity={draft.glassOpacity}
                            glassBlur={draft.glassBlur}
                          />
                        </div>
                        <p className="text-[10px] text-zinc-400 line-clamp-2 leading-tight">
                          {isRtl ? shape.descriptionAr : shape.descriptionEn}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* =============================================================== */}
            {/* TAB 4: SIZES, SPACING, SCREEN ALIGNMENT & ORDERING              */}
            {/* =============================================================== */}
            {activeTab === 'sizing' && (
              <div className="space-y-4">
                {/* Icon Size */}
                <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium achour-glossy-text">
                      {isRtl ? 'حجم الأيقونات' : 'Icon Size'}
                    </span>
                    <span className="text-[11px] font-sans tabular-nums text-zinc-300 uppercase">
                      {draft.iconScale || 'md'}
                    </span>
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {(['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] as const).map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        data-tv-focusable="true"
                        tabIndex={0}
                        onClick={() => updateDraft('iconScale', sz)}
                        className={`py-2 rounded-xl border text-xs font-sans font-medium uppercase cursor-pointer transition-none ${
                          (draft.iconScale || 'md') === sz
                            ? 'achour-glossy-pill border-gold'
                            : 'bg-white/[0.04] border-white/10 text-zinc-200 hover:border-gold/50'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Frame Size */}
                <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium achour-glossy-text">
                      {isRtl ? 'حجم الإطارات (مستقل)' : 'Frame Size (Independent)'}
                    </span>
                    <span className="text-[11px] font-sans tabular-nums text-zinc-300 uppercase">
                      {draft.frameScale || 'md'}
                    </span>
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {(['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] as const).map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        data-tv-focusable="true"
                        tabIndex={0}
                        onClick={() => updateDraft('frameScale', sz)}
                        className={`py-2 rounded-xl border text-xs font-sans font-medium uppercase cursor-pointer transition-none ${
                          (draft.frameScale || 'md') === sz
                            ? 'achour-glossy-pill border-gold'
                            : 'bg-white/[0.04] border-white/10 text-zinc-200 hover:border-gold/50'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Section Spacing */}
                <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium achour-glossy-text">
                      {isRtl ? 'المسافة بين الأقسام' : 'Section Spacing'}
                    </span>
                    <span className="text-[11px] font-sans tabular-nums text-zinc-300 uppercase">
                      {draft.tileSpacing || 'md'}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {(
                      [
                        { id: 'xs', ar: 'متلاصق', en: 'Tight' },
                        { id: 'sm', ar: 'قريب', en: 'Compact' },
                        { id: 'md', ar: 'متوازن', en: 'Balanced' },
                        { id: 'lg', ar: 'واسع', en: 'Wide' },
                        { id: 'xl', ar: 'أقصى', en: 'Spacious' },
                      ] as const
                    ).map((sp) => (
                      <button
                        key={sp.id}
                        type="button"
                        data-tv-focusable="true"
                        tabIndex={0}
                        onClick={() => updateDraft('tileSpacing', sp.id)}
                        className={`py-2 px-1 rounded-xl border text-[11px] font-medium cursor-pointer transition-none whitespace-nowrap ${
                          (draft.tileSpacing || 'md') === sp.id
                            ? 'bg-gold text-black border-gold'
                            : 'bg-white/[0.04] border-white/10 text-zinc-200 hover:border-gold/50'
                        }`}
                      >
                        {isRtl ? sp.ar : sp.en}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Screen Alignment (9-Zone Grid) */}
                <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2">
                  <span className="text-xs font-semibold achour-glossy-text block">
                    {isRtl ? 'محاذاة الأقسام على الشاشة' : 'Screen Alignment Position'}
                  </span>
                  <div dir="ltr" className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { v: 'top', h: 'left', ar: 'أعلى يسار', en: 'Top Left' },
                        { v: 'top', h: 'center', ar: 'أعلى', en: 'Top' },
                        { v: 'top', h: 'right', ar: 'أعلى يمين', en: 'Top Right' },
                        { v: 'center', h: 'left', ar: 'يسار', en: 'Left' },
                        { v: 'center', h: 'center', ar: 'المنتصف', en: 'Center' },
                        { v: 'center', h: 'right', ar: 'يمين', en: 'Right' },
                        { v: 'bottom', h: 'left', ar: 'أسفل يسار', en: 'Bottom Left' },
                        { v: 'bottom', h: 'center', ar: 'أسفل', en: 'Bottom' },
                        { v: 'bottom', h: 'right', ar: 'أسفل يمين', en: 'Bottom Right' },
                      ] as const
                    ).map((cell) => {
                      const active =
                        (draft.dashboardAlignment || 'bottom') === cell.v &&
                        (draft.dashboardHorizontalAlignment || 'center') === cell.h;
                      return (
                        <button
                          key={`${cell.v}-${cell.h}`}
                          type="button"
                          data-tv-focusable="true"
                          tabIndex={0}
                          onClick={() => {
                            setJustApplied(false);
                            setDraft((prev) => ({
                              ...prev,
                              dashboardAlignment: cell.v,
                              dashboardHorizontalAlignment: cell.h,
                            }));
                          }}
                          className={`py-1.5 px-2 rounded-xl border text-[11px] font-medium cursor-pointer transition-none ${
                            active
                              ? 'bg-gold/25 border-gold text-gold'
                              : 'bg-white/[0.04] border-white/10 text-zinc-300 hover:border-gold/45'
                          }`}
                        >
                          {isRtl ? cell.ar : cell.en}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Section Order (Live, Movies, Series, Playlist, Settings) */}
                <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2">
                  <span className="text-xs font-semibold achour-glossy-text block">
                    {isRtl ? 'ترتيب الأقسام الخمسة' : 'Reorder 5 Sections'}
                  </span>
                  <div className="space-y-1.5">
                    {(draft.dashboardOrder || DEFAULT_ORDER).map((kind, idx) => {
                      const nameMap: Record<string, string> = {
                        live: t('live'),
                        movies: t('movies'),
                        series: t('series'),
                        add: t('playlist'),
                        settings: t('settings'),
                      };
                      return (
                        <div
                          key={kind}
                          className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-black/35 border border-white/10"
                        >
                          <span className="text-xs font-medium text-white">
                            {idx + 1}. {nameMap[kind] || kind}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              data-tv-focusable="true"
                              tabIndex={0}
                              disabled={idx === 0}
                              onClick={() => moveOrderItem(idx, -1)}
                              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-gold hover:text-black disabled:opacity-30 text-xs font-semibold cursor-pointer"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              data-tv-focusable="true"
                              tabIndex={0}
                              disabled={idx === (draft.dashboardOrder || DEFAULT_ORDER).length - 1}
                              onClick={() => moveOrderItem(idx, 1)}
                              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-gold hover:text-black disabled:opacity-30 text-xs font-semibold cursor-pointer"
                            >
                              ↓
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* =============================================================== */}
            {/* TAB 6: TRUE METALLIC GOLD (#D4AF37) + MANUAL HEX + PRESETS      */}
            {/* =============================================================== */}
            {activeTab === 'colors' && (
              <div className="space-y-3.5">
                {/* Featured True 24K Metallic Gold Card */}
                <button
                  type="button"
                  data-tv-focusable="true"
                  tabIndex={0}
                  onClick={() => {
                    setJustApplied(false);
                    setHexInput('#D4AF37');
                    setDraft((prev) => ({
                      ...prev,
                      royalThemeColor: 'pure-metallic-gold',
                      customThemeColor: '#D4AF37',
                    }));
                  }}
                  className={`w-full p-3.5 rounded-2xl border transition-none flex items-center justify-between gap-3 cursor-pointer ${
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
                    <div className="min-w-0">
                      <span className="block text-sm font-semibold achour-glossy-text truncate">
                        {isRtl
                          ? 'الذهب المعدني الحقيقي (#D4AF37) — لكامل التطبيق'
                          : 'True 24K Metallic Gold (#D4AF37) — Full App'}
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

                {/* Manual Color Picker + HEX Input */}
                <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/15 space-y-2.5">
                  <span className="text-xs font-semibold text-white block">
                    {isRtl
                      ? 'اختيار اللون يدوياً أو إدخال كود HEX'
                      : 'Manual Color Picker & HEX Code'}
                  </span>
                  <div dir="ltr" className="flex flex-wrap items-center gap-2.5">
                    <label className="relative flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/45 border border-white/15 cursor-pointer">
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
                          updateDraft('customThemeColor', next);
                        }}
                        className="w-8 h-8 rounded-lg border-0 bg-transparent cursor-pointer"
                      />
                      <span className="text-xs font-medium text-zinc-200 whitespace-nowrap">
                        {isRtl ? 'منتقي' : 'Pick'}
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
                          updateDraft('customThemeColor', norm);
                        }
                      }}
                      className="flex-1 min-w-[120px] px-3 py-2 rounded-xl bg-black/50 border border-white/20 text-sm font-sans tabular-nums font-medium text-gold uppercase"
                    />

                    <button
                      type="button"
                      data-tv-focusable="true"
                      tabIndex={0}
                      disabled={!isValidHexColor(hexInput)}
                      onClick={() => {
                        const norm = normalizeHexColor(hexInput);
                        if (norm) {
                          setHexInput(norm);
                          updateDraft('customThemeColor', norm);
                        }
                      }}
                      className="px-3.5 py-2 rounded-xl bg-gold text-black font-medium text-xs disabled:opacity-40 cursor-pointer whitespace-nowrap"
                    >
                      {isRtl ? 'معاينة HEX' : 'Use HEX'}
                    </button>
                  </div>
                </div>

                {/* Preset Swatches */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ROYAL_THEMES.map((theme) => {
                    const isSelected =
                      !draft.customThemeColor && draft.royalThemeColor === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        data-tv-focusable="true"
                        tabIndex={0}
                        onClick={() => {
                          setJustApplied(false);
                          setHexInput(theme.primary);
                          setDraft((prev) => ({
                            ...prev,
                            royalThemeColor: theme.id,
                            customThemeColor: null,
                          }));
                        }}
                        className={`p-2.5 rounded-xl border flex flex-col gap-1.5 cursor-pointer transition-none ${
                          isSelected
                            ? 'border-gold bg-white/15'
                            : 'border-white/10 bg-white/[0.04] hover:border-white/30'
                        } ${isRtl ? 'text-right' : 'text-left'}`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span
                            className="w-4 h-4 rounded-full border border-white/25"
                            style={{ backgroundColor: theme.primary }}
                          />
                          <span className="text-[10px] font-sans tabular-nums text-zinc-400">
                            {theme.primary}
                          </span>
                        </div>
                        <span className="text-[11px] font-medium text-white truncate w-full">
                          {isRtl ? theme.nameAr : theme.nameEn}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* =============================================================== */}
            {/* TAB: FOCUS TARGET & LABEL TYPOGRAPHY COLOR                      */}
            {/* =============================================================== */}
            {activeTab === 'focus_text' && (
              <div className="space-y-6">
                {/* 1. FOCUS TARGET / CONTOUR MODE */}
                <div>
                  <h3 className="text-sm font-semibold achour-glossy-title flex items-center gap-2">
                    <Target size={16} className="text-gold" />
                    <span>{isRtl ? 'نمط الفوكس على الشاشة الرئيسية (40 شكلاً)' : 'Dashboard TV Focus Target'}</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    {isRtl
                      ? 'حدد أين يظهر مؤشر الفوكس عند التنقل بالريموت: يتبع انحناءات الإطار الهندسي تماماً بدون أي مربع، أو على الأسماء، أو الأيقونة.'
                      : 'Choose how TV remote focus is highlighted: exact frame shape contour without squares, on section names, or on icons.'}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3">
                    {/* Option 1: Frame Contour */}
                    <button
                      type="button"
                      data-tv-focusable="true"
                      onClick={() => updateDraft('dashboardFocusMode', 'frame')}
                      className={`p-3 rounded-2xl border text-right transition-none cursor-pointer flex flex-col gap-1.5 ${
                        draft.dashboardFocusMode === 'frame'
                          ? 'border-gold bg-gold/15 shadow-[0_0_18px_var(--theme-glow,rgba(212,175,55,0.4))]'
                          : 'border-white/10 bg-white/[0.03] hover:border-white/30'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-medium text-xs text-white">
                          {isRtl ? '🔷 على الإطار بشكله الدقيق (توهج انسيابي)' : '🔷 Exact Frame Shape Contour'}
                        </span>
                        {draft.dashboardFocusMode === 'frame' && (
                          <span className="w-5 h-5 rounded-full bg-gold text-black flex items-center justify-center font-semibold text-xs">✓</span>
                        )}
                      </div>
                      <span className="text-[11px] text-zinc-400">
                        {isRtl
                          ? 'يتتبع تفاصيل الـ 40 إطاراً (دائري، سداسي، درع، معين، نجمة) بهالة مضيئة متناسقة بدون أي مربع خارجي.'
                          : 'Hugs the exact contour of all 40 frames without any square outline.'}
                      </span>
                    </button>

                    {/* Option 2: Label Focus */}
                    <button
                      type="button"
                      data-tv-focusable="true"
                      onClick={() => updateDraft('dashboardFocusMode', 'label')}
                      className={`p-3 rounded-2xl border text-right transition-none cursor-pointer flex flex-col gap-1.5 ${
                        draft.dashboardFocusMode === 'label'
                          ? 'border-gold bg-gold/15 shadow-[0_0_18px_var(--theme-glow,rgba(212,175,55,0.4))]'
                          : 'border-white/10 bg-white/[0.03] hover:border-white/30'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-medium text-xs text-white">
                          {isRtl ? '🏷️ على الأسماء في الأسفل (شارة فوكس مضيئة)' : '🏷️ Section Name Badge Pill'}
                        </span>
                        {draft.dashboardFocusMode === 'label' && (
                          <span className="w-5 h-5 rounded-full bg-gold text-black flex items-center justify-center font-semibold text-xs">✓</span>
                        )}
                      </div>
                      <span className="text-[11px] text-zinc-400">
                        {isRtl
                          ? 'يضيء شارة كبسولية بلون الثيم حول اسم القسم (بث مباشر، أفلام...)، مثالي للوضع بدون إطار وللتلفزيونات.'
                          : 'Lights up an illuminated capsule around the section title text.'}
                      </span>
                    </button>

                    {/* Option 3: Both (Frame + Label) */}
                    <button
                      type="button"
                      data-tv-focusable="true"
                      onClick={() => updateDraft('dashboardFocusMode', 'both')}
                      className={`p-3 rounded-2xl border text-right transition-none cursor-pointer flex flex-col gap-1.5 ${
                        (draft.dashboardFocusMode || 'both') === 'both'
                          ? 'border-gold bg-gold/15 shadow-[0_0_18px_var(--theme-glow,rgba(212,175,55,0.4))]'
                          : 'border-white/10 bg-white/[0.03] hover:border-white/30'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-medium text-xs text-white">
                          {isRtl ? '✨ على الإطار والاسم معاً (أعلى وضوح)' : '✨ Both (Frame Contour + Name Badge)'}
                        </span>
                        {(draft.dashboardFocusMode || 'both') === 'both' && (
                          <span className="w-5 h-5 rounded-full bg-gold text-black flex items-center justify-center font-semibold text-xs">✓</span>
                        )}
                      </div>
                      <span className="text-[11px] text-zinc-400">
                        {isRtl
                          ? 'يجمع بين توهج محيط الإطار وإضاءة شارة الاسم معاً لرؤية فائقة الوضوح من مسافات بعيدة.'
                          : 'Highlights both the frame contour and the name badge for maximum visibility.'}
                      </span>
                    </button>

                    {/* Option 4: Icon Only */}
                    <button
                      type="button"
                      data-tv-focusable="true"
                      onClick={() => updateDraft('dashboardFocusMode', 'icon')}
                      className={`p-3 rounded-2xl border text-right transition-none cursor-pointer flex flex-col gap-1.5 ${
                        draft.dashboardFocusMode === 'icon'
                          ? 'border-gold bg-gold/15 shadow-[0_0_18px_var(--theme-glow,rgba(212,175,55,0.4))]'
                          : 'border-white/10 bg-white/[0.03] hover:border-white/30'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-medium text-xs text-white">
                          {isRtl ? '🎯 على الأيقونة مباشرة (توهج الرمز)' : '🎯 Direct Icon Glyph Glow'}
                        </span>
                        {draft.dashboardFocusMode === 'icon' && (
                          <span className="w-5 h-5 rounded-full bg-gold text-black flex items-center justify-center font-semibold text-xs">✓</span>
                        )}
                      </div>
                      <span className="text-[11px] text-zinc-400">
                        {isRtl
                          ? 'تكبير الأيقونة وإضفاء إشعاع ملكي مباشر حول الرمز فقط دون أي إطارات خارجية.'
                          : 'Gently scales the icon glyph with royal radiant glow, no external boxes.'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* 1B. FOCUS VISUAL GLOW & SHAPES */}
                <div className="pt-4 border-t border-white/10">
                  <h3 className="text-sm font-semibold achour-glossy-title flex items-center gap-2">
                    <Sparkles size={16} className="text-gold" />
                    <span>{t('focus_shape_heading')}</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    {t('focus_shape_desc')}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3">
                    {(
                      [
                        {
                          id: 'frameless-glow' as FocusVisualStyle,
                          title: t('focus_style_frameless_glow_title'),
                          desc: t('focus_style_frameless_glow_desc'),
                          swatch:
                            'rounded-full border-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.92)_0%,rgba(var(--theme-rgb),0.72)_45%,transparent_78%)]',
                        },
                        {
                          id: 'lamp-halo' as FocusVisualStyle,
                          title: t('focus_style_lamp_halo_title'),
                          desc: t('focus_style_lamp_halo_desc'),
                          swatch:
                            'rounded-xl border border-white/85 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.85)_0%,rgba(var(--theme-rgb),0.75)_45%,transparent_85%)] shadow-[0_0_14px_rgba(var(--theme-rgb),0.85)]',
                        },
                        {
                          id: 'double-neon' as FocusVisualStyle,
                          title: t('focus_style_double_neon_title'),
                          desc: t('focus_style_double_neon_desc'),
                          swatch:
                            'rounded-xl border-2 border-white outline outline-2 outline-[var(--theme-primary)] outline-offset-2 bg-[rgba(var(--theme-rgb),0.22)] shadow-[0_0_12px_rgba(var(--theme-rgb),0.85)]',
                        },
                        {
                          id: 'spotlight-pillar' as FocusVisualStyle,
                          title: t('focus_style_spotlight_pillar_title'),
                          desc: t('focus_style_spotlight_pillar_desc'),
                          swatch:
                            'rounded-t-2xl rounded-b-lg border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.72)_0%,rgba(var(--theme-rgb),0.68)_50%,rgba(var(--theme-rgb),0.2)_100%)]',
                        },
                        {
                          id: 'diamond-prism' as FocusVisualStyle,
                          title: t('focus_style_diamond_prism_title'),
                          desc: t('focus_style_diamond_prism_desc'),
                          swatch:
                            'rounded-lg border-2 border-white/90 bg-[linear-gradient(135deg,rgba(255,255,255,0.68)_0%,rgba(var(--theme-rgb),0.36)_45%,rgba(var(--theme-rgb),0.75)_100%)] shadow-[0_0_12px_rgba(var(--theme-rgb),0.8)]',
                        },
                        {
                          id: 'cyber-brackets' as FocusVisualStyle,
                          title: t('focus_style_cyber_brackets_title'),
                          desc: t('focus_style_cyber_brackets_desc'),
                          swatch:
                            'rounded-md border border-[var(--theme-primary)] bg-[radial-gradient(circle,rgba(var(--theme-rgb),0.55)_0%,transparent_80%)] shadow-[inset_0_0_0_2px_rgba(255,255,255,0.65)]',
                        },
                        {
                          id: 'aurora-capsule' as FocusVisualStyle,
                          title: t('focus_style_aurora_capsule_title'),
                          desc: t('focus_style_aurora_capsule_desc'),
                          swatch:
                            'rounded-full border-2 border-white/90 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.55)_0%,rgba(var(--theme-rgb),0.65)_65%,transparent_100%)] shadow-[0_0_14px_rgba(var(--theme-rgb),0.85)]',
                        },
                        {
                          id: 'classic-ring' as FocusVisualStyle,
                          title: t('focus_style_classic_ring_title'),
                          desc: t('focus_style_classic_ring_desc'),
                          swatch:
                            'rounded-xl border-2 border-[var(--theme-primary)] bg-[rgba(var(--theme-rgb),0.14)]',
                        },
                      ] as const
                    ).map((opt) => {
                      const active = (draft.focusVisualStyle || 'frameless-glow') === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          data-tv-focusable="true"
                          onClick={() => updateDraft('focusVisualStyle', opt.id)}
                          className={`p-3 rounded-2xl border transition-none cursor-pointer flex items-center gap-2.5 ${
                            isRtl ? 'text-right' : 'text-left'
                          } ${
                            active
                              ? 'border-gold bg-gold/15 shadow-[0_0_18px_var(--theme-glow,rgba(212,175,55,0.4))]'
                              : 'border-white/10 bg-white/[0.03] hover:border-white/30'
                          }`}
                        >
                          <span aria-hidden="true" className={`w-8 h-8 shrink-0 ${opt.swatch}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="font-medium text-xs text-white truncate">
                                {opt.title}
                              </span>
                              {active && (
                                <span className="w-5 h-5 rounded-full bg-gold text-black flex items-center justify-center font-semibold text-xs shrink-0">✓</span>
                              )}
                            </div>
                            <span className="block text-[11px] text-zinc-400 line-clamp-2 mt-0.5">
                              {opt.desc}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. DASHBOARD LABELS COLOR */}
                <div className="pt-4 border-t border-white/10">
                  <h3 className="text-sm font-semibold achour-glossy-title flex items-center gap-2">
                    <Type size={16} className="text-gold" />
                    <span>{isRtl ? 'لون نصوص الشاشة الرئيسية (الكلام أسفل الأيقونات)' : 'Dashboard Section Labels Color'}</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    {isRtl
                      ? 'يمكنك جعل الكلام باللون الأبيض الناصع كما كان سابقاً، أو متوافقاً مع لون التطبيق (الثيم المختار)، أو ذهبياً خالصاً، أو لوناً مخصصاً.'
                      : 'Choose section label text color: classic white, matching active theme, pure 24K gold, or custom HEX.'}
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                    {/* Mode: Theme */}
                    <button
                      type="button"
                      data-tv-focusable="true"
                      onClick={() => updateDraft('dashboardLabelColorMode', 'theme')}
                      className={`p-3 rounded-2xl border transition-none cursor-pointer flex flex-col items-center justify-center gap-1.5 text-center ${
                        (draft.dashboardLabelColorMode || 'theme') === 'theme'
                          ? 'border-gold bg-gold/15 shadow-[0_0_16px_var(--theme-glow,rgba(212,175,55,0.4))]'
                          : 'border-white/10 bg-white/[0.03] hover:border-white/30'
                      }`}
                    >
                      <span className="w-5 h-5 rounded-full border border-white/30" style={{ backgroundColor: 'var(--theme-primary, #D4AF37)' }} />
                      <span className="text-xs font-medium text-white mt-1">{isRtl ? 'حسب الثيم المختار' : 'Match Theme'}</span>
                      <span className="text-[10px] text-zinc-400">{isRtl ? 'يتغير مع لون التطبيق' : 'Dynamic theme'}</span>
                    </button>

                    {/* Mode: White */}
                    <button
                      type="button"
                      data-tv-focusable="true"
                      onClick={() => updateDraft('dashboardLabelColorMode', 'white')}
                      className={`p-3 rounded-2xl border transition-none cursor-pointer flex flex-col items-center justify-center gap-1.5 text-center ${
                        draft.dashboardLabelColorMode === 'white'
                          ? 'border-gold bg-gold/15 shadow-[0_0_16px_var(--theme-glow,rgba(212,175,55,0.4))]'
                          : 'border-white/10 bg-white/[0.03] hover:border-white/30'
                      }`}
                    >
                      <span className="w-5 h-5 rounded-full border border-white/30 bg-white" />
                      <span className="text-xs font-medium text-white mt-1">{isRtl ? 'أبيض ناصع' : 'Classic White'}</span>
                      <span className="text-[10px] text-zinc-400">{isRtl ? 'كما كان سابقاً (#FFF)' : 'Classic text'}</span>
                    </button>

                    {/* Mode: Gold */}
                    <button
                      type="button"
                      data-tv-focusable="true"
                      onClick={() => updateDraft('dashboardLabelColorMode', 'gold')}
                      className={`p-3 rounded-2xl border transition-none cursor-pointer flex flex-col items-center justify-center gap-1.5 text-center ${
                        draft.dashboardLabelColorMode === 'gold'
                          ? 'border-gold bg-gold/15 shadow-[0_0_16px_var(--theme-glow,rgba(212,175,55,0.4))]'
                          : 'border-white/10 bg-white/[0.03] hover:border-white/30'
                      }`}
                    >
                      <span className="w-5 h-5 rounded-full border border-white/30 bg-[#D4AF37]" />
                      <span className="text-xs font-medium text-white mt-1">{isRtl ? 'ذهب ملكي دائم' : 'Permanent 24K'}</span>
                      <span className="text-[10px] font-sans tabular-nums text-zinc-400">#D4AF37</span>
                    </button>

                    {/* Mode: Custom */}
                    <button
                      type="button"
                      data-tv-focusable="true"
                      onClick={() => updateDraft('dashboardLabelColorMode', 'custom')}
                      className={`p-3 rounded-2xl border transition-none cursor-pointer flex flex-col items-center justify-center gap-1.5 text-center ${
                        draft.dashboardLabelColorMode === 'custom'
                          ? 'border-gold bg-gold/15 shadow-[0_0_16px_var(--theme-glow,rgba(212,175,55,0.4))]'
                          : 'border-white/10 bg-white/[0.03] hover:border-white/30'
                      }`}
                    >
                      <span className="w-5 h-5 rounded-full border border-white/30" style={{ backgroundColor: draft.dashboardLabelCustomColor || '#FFD700' }} />
                      <span className="text-xs font-medium text-white mt-1">{isRtl ? 'لون مخصص' : 'Custom HEX'}</span>
                      <span className="text-[10px] font-sans tabular-nums text-zinc-400">{draft.dashboardLabelCustomColor || '#HEX'}</span>
                    </button>
                  </div>

                  {draft.dashboardLabelColorMode === 'custom' && (
                    <div className="mt-3 p-3 rounded-xl bg-white/[0.04] border border-white/10 flex items-center gap-3">
                      <input
                        type="color"
                        value={draft.dashboardLabelCustomColor || '#FFD700'}
                        onChange={(e) => updateDraft('dashboardLabelCustomColor', e.target.value)}
                        className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0"
                      />
                      <input
                        type="text"
                        value={draft.dashboardLabelCustomColor || '#FFD700'}
                        onChange={(e) => updateDraft('dashboardLabelCustomColor', e.target.value)}
                        placeholder="#RRGGBB"
                        className="px-3 py-1.5 rounded-lg bg-black/40 border border-white/15 text-white font-sans tabular-nums text-xs uppercase w-32"
                      />
                      <span className="text-xs text-zinc-400">{isRtl ? 'اختر اللون المفضل لنصوص الواجهة' : 'Pick label color'}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* =============================================================== */}
            {/* TAB 7: TRANSPARENCY & GLASS BLUR                                */}
            {/* =============================================================== */}
            {activeTab === 'glass' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold achour-glossy-title">
                    {isRtl
                      ? 'شفافية الخلفيات والتأثير الزجاجي'
                      : 'Background Opacity & Glass Effect'}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {isRtl
                      ? 'يتحكم في شفافية البطاقات والإطارات الزجاجية والمعدنية ودرجة الضبابية.'
                      : 'Controls card & frame translucency plus frosted glass blur intensity.'}
                  </p>
                </div>

                {/* Glass Opacity Control */}
                <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/15 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold achour-glossy-text flex items-center gap-1.5">
                      <Sliders size={14} style={{ color: 'var(--theme-primary, #d4af37)' }} />
                      <span>{isRtl ? 'شفافية الإطارات والخلفيات' : 'Surface Opacity'}</span>
                    </span>
                    <span className="text-xs font-sans tabular-nums font-medium text-white">
                      {draft.glassOpacity ?? 16}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      data-tv-focusable="true"
                      tabIndex={0}
                      onClick={() =>
                        updateDraft('glassOpacity', Math.max(0, (draft.glassOpacity ?? 16) - 6))
                      }
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-gold hover:text-black text-sm font-semibold cursor-pointer"
                    >
                      −
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={85}
                      step={2}
                      value={draft.glassOpacity ?? 16}
                      onChange={(e) => updateDraft('glassOpacity', Number(e.target.value))}
                      className="flex-1 accent-[var(--theme-primary)] cursor-pointer"
                    />
                    <button
                      type="button"
                      data-tv-focusable="true"
                      tabIndex={0}
                      onClick={() =>
                        updateDraft('glassOpacity', Math.min(85, (draft.glassOpacity ?? 16) + 6))
                      }
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-gold hover:text-black text-sm font-semibold cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[4, 16, 30, 50, 75].map((v) => (
                      <button
                        key={v}
                        type="button"
                        data-tv-focusable="true"
                        tabIndex={0}
                        onClick={() => updateDraft('glassOpacity', v)}
                        className={`py-1.5 rounded-xl border text-[11px] font-sans tabular-nums font-medium cursor-pointer ${
                          (draft.glassOpacity ?? 16) === v
                            ? 'bg-gold text-black border-gold'
                            : 'bg-white/[0.04] border-white/10 text-zinc-200 hover:border-gold/50'
                        }`}
                      >
                        {v}%
                      </button>
                    ))}
                  </div>
                </div>

                {/* Glass Blur Control */}
                <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/15 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold achour-glossy-text flex items-center gap-1.5">
                      <Layers size={14} style={{ color: 'var(--theme-primary, #d4af37)' }} />
                      <span>{isRtl ? 'التأثير الزجاجي الضبابي (Blur)' : 'Frosted Glass Blur'}</span>
                    </span>
                    <span className="text-xs font-sans tabular-nums font-medium text-white">
                      {draft.glassBlur ?? 10}px
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      data-tv-focusable="true"
                      tabIndex={0}
                      onClick={() =>
                        updateDraft('glassBlur', Math.max(0, (draft.glassBlur ?? 10) - 2))
                      }
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-gold hover:text-black text-sm font-semibold cursor-pointer"
                    >
                      −
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={24}
                      step={2}
                      value={draft.glassBlur ?? 10}
                      onChange={(e) => updateDraft('glassBlur', Number(e.target.value))}
                      className="flex-1 accent-[var(--theme-primary)] cursor-pointer"
                    />
                    <button
                      type="button"
                      data-tv-focusable="true"
                      tabIndex={0}
                      onClick={() =>
                        updateDraft('glassBlur', Math.min(24, (draft.glassBlur ?? 10) + 2))
                      }
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-gold hover:text-black text-sm font-semibold cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[0, 6, 10, 16, 24].map((v) => (
                      <button
                        key={v}
                        type="button"
                        data-tv-focusable="true"
                        tabIndex={0}
                        onClick={() => updateDraft('glassBlur', v)}
                        className={`py-1.5 rounded-xl border text-[11px] font-sans tabular-nums font-medium cursor-pointer ${
                          (draft.glassBlur ?? 10) === v
                            ? 'bg-gold text-black border-gold'
                            : 'bg-white/[0.04] border-white/10 text-zinc-200 hover:border-gold/50'
                        }`}
                      >
                        {v}px
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
