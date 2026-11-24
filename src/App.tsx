// @ts-nocheck
/**
 * Achour Player Root Component
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import Dashboard from './components/Dashboard';
import SplashScreen from './components/SplashScreen';
import AnimatedBackground from './components/AnimatedBackground';
import { motion, AnimatePresence } from 'framer-motion';
import { AppSettings, Language } from './types';
import { applyRoyalTheme, APP_BACKGROUNDS, resolveDesignSettings } from './utils/themeManager';
import { DEFAULT_PLAYERS } from './components/SettingsView';
import { runStorageCleanup } from './utils/storageCleanup';
import { parseTVKeyEvent, executeBackHandler, isTextInput, initGlobalFocusSync, isNativeCapacitorApp, isTVOrLowEndDevice } from './utils/tvNavigation';
import { Monitor, Smartphone } from 'lucide-react';
import { isTVDevice, getPublicId } from './utils/platform';
import TvPreviewModal from './components/TvPreviewModal';

const DEFAULT_SETTINGS: AppSettings = {
  language: 'en',
  hiddenCategories: [],
  hiddenLiveCategories: [],
  hiddenMovieCategories: [],
  hiddenSeriesCategories: [],
  timeFormat: '24h',
  viewMode: 'grid',
  autoPlayLastChannel: false,
  vodSortBy: 'newest',
  posterSize: 'medium',
  showPosterTitles: false,
  useExternalPlayer: false,
  externalPlayers: DEFAULT_PLAYERS,
  selectedPlayer: 'Achour Player (مدمج - Native)',
  installedPlayers: ['Achour Player (مدمج - Native)'],
  activePlaylistId: null,
  searchHistory: {
    movies: [],
    series: [],
  },
  royalThemeColor: 'pure-metallic-gold',
  customThemeColor: null,
  icon3DStyle: 'style-gold-3d',
  iconDisplayMode: 'with-frames',
  iconPack: 'pack-3d',
  frameShape: 'rounded-square',
  glassOpacity: 16,
  glassBlur: 10,
  backgroundStyle: 'bg-raouche-rocks-beirut',
  backgroundOpacity: 62,
  customBackground: null,
  splashSoundTrack: 'epic_royal_fanfare',
  splashStyle: 'royal_gold_particles',
  iconScale: 'md',
  frameScale: 'md',
  tileSpacing: 'md',
  dashboardAlignment: 'center',
  dashboardHorizontalAlignment: 'center',
  zoomScale: 85,
  windowScales: {
    global: 100,
    details: 100,
    playerPopups: 100,
    confirm: 100,
    settings: 100,
    playlists: 100,
  },
  multiViewFullSplit: false,
  liveBarSize: 'default',
  seekStep: 10,
  dashboardFocusMode: 'frame',
  dashboardLabelColorMode: 'theme',
  dashboardLabelCustomColor: null,
};
import { App as CapacitorApp } from '@capacitor/app';
import { StatusBar } from '@capacitor/status-bar';
import XtreamDebugOverlay from './components/XtreamDebugOverlay';

export default function App() {
  const [userId, setUserId] = useState<string>(() => getPublicId());
  const [showSplash, setShowSplash] = useState(true);
  const [splashIsPreview, setSplashIsPreview] = useState(false);
  const [splashFirstPainted, setSplashFirstPainted] = useState(false);
  const [isRestricted, setIsRestricted] = useState(false);
  const [tvPreviewMode, setTvPreviewMode] = useState<boolean>(() => {
    if (typeof window === 'undefined' || isNativeCapacitorApp()) return false;
    try {
      return new URLSearchParams(window.location.search).get('tvPreview') === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const stopFocusSync = initGlobalFocusSync();
    if (isTVOrLowEndDevice()) {
      document.documentElement.classList.add('achour-tv-perf');
    }
    if (isTVDevice()) {
      document.documentElement.classList.add('achour-tv-ui');
    }

    try {
      StatusBar.hide().catch(() => {});
    } catch (e) {}

    setIsRestricted(false);
    return () => {
      stopFocusSync();
    };
  }, []);

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('achour_settings_v2');
    const langInitialized = localStorage.getItem('achour_lang_initialized_v3');
    const userSelectedLang = localStorage.getItem('achour_user_selected_lang');
    const userSetViewMode = localStorage.getItem('achour_viewmode_user_set');
    if (!saved) {
      localStorage.setItem('achour_lang_initialized_v3', 'true');
      return DEFAULT_SETTINGS;
    }
    try {
      const parsed = JSON.parse(saved);
      let lang = parsed.language;
      if (!langInitialized && !userSelectedLang) {
        lang = 'en';
        localStorage.setItem('achour_lang_initialized_v3', 'true');
      }
      const bgValid = parsed.backgroundStyle && APP_BACKGROUNDS.some(b => b.id === parsed.backgroundStyle);
      const resolvedViewMode = (!userSetViewMode && parsed.viewMode === 'list')
        ? 'grid'
        : (parsed.viewMode || DEFAULT_SETTINGS.viewMode);
      const resolvedDesign = resolveDesignSettings(parsed);
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        iconDisplayMode: resolvedDesign.iconDisplayMode,
        iconPack: resolvedDesign.iconPack,
        frameShape: resolvedDesign.frameShape,
        glassOpacity: resolvedDesign.glassOpacity,
        glassBlur: resolvedDesign.glassBlur,
        viewMode: resolvedViewMode,
        language: lang || 'en',
        backgroundStyle: bgValid ? parsed.backgroundStyle : DEFAULT_SETTINGS.backgroundStyle,
        backgroundOpacity:
          typeof parsed.backgroundOpacity === 'number' && !Number.isNaN(parsed.backgroundOpacity)
            ? Math.max(0, Math.min(100, Math.round(parsed.backgroundOpacity)))
            : DEFAULT_SETTINGS.backgroundOpacity,
        searchHistory: {
          ...DEFAULT_SETTINGS.searchHistory,
          ...(parsed.searchHistory || {})
        }
      };
    } catch (e) {
      return DEFAULT_SETTINGS;
    }
  });

  useEffect(() => {
    try {
      const id = getPublicId();
      if (id) setUserId(id);
    } catch (err) {
      console.warn('App initialization notice:', err);
    }
    const runDeferredCleanup = () => {
      try {
        runStorageCleanup();
      } catch (err) {
        console.warn('App initialization storage notice:', err);
      }
    };
    const w = window as any;
    let idleId: any = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    if (typeof w.requestIdleCallback === 'function') {
      idleId = w.requestIdleCallback(runDeferredCleanup, { timeout: 1200 });
    } else {
      fallbackTimer = setTimeout(runDeferredCleanup, 450);
    }
    return () => {
      if (idleId !== null && typeof w.cancelIdleCallback === 'function') {
        w.cancelIdleCallback(idleId);
      }
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, []);

  useEffect(() => {
    if (!showSplash) {
      try {
        (window as any).AchourNative?.clearLaunchBackground?.();
      } catch {}
      return;
    }
    const mountFallbackTimer = setTimeout(() => {
      setSplashFirstPainted(true);
    }, 350);
    const splashTimer = setTimeout(() => {
      setShowSplash(false);
      setSplashIsPreview(false);
    }, 11500);
    return () => {
      clearTimeout(mountFallbackTimer);
      clearTimeout(splashTimer);
    };
  }, [showSplash]);

  const prevPlaylistIdRef = useRef<string | undefined>(settings.activePlaylistId);
  const settingsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSettingsRef = useRef<AppSettings>(settings);
  latestSettingsRef.current = settings;

  useEffect(() => {
    const flushSettings = () => {
      if (settingsSaveTimerRef.current) {
        clearTimeout(settingsSaveTimerRef.current);
        settingsSaveTimerRef.current = null;
      }
      try {
        localStorage.setItem('achour_settings_v2', JSON.stringify(latestSettingsRef.current));
      } catch (e) {}
    };

    const recoverUiFromForeground = () => {
      try {
        StatusBar.hide().catch(() => {});
      } catch {}
      try {
        (window as any).AchourNative?.clearLaunchBackground?.();
      } catch {}

      // Defer one frame so React components finish handling resume first
      requestAnimationFrame(() => {
        const hasVodActive = Boolean(document.querySelector('[data-vod-native-active="true"]'));
        const hasMultiActive = Boolean(document.querySelector('[data-multiview-native-hole="true"]'));
        if (!hasVodActive && !hasMultiActive) {
          document.documentElement.classList.remove('native-player-active', 'native-player-preview');
          document.body.classList.remove('native-player-active', 'native-player-preview');
          document.documentElement.style.removeProperty('--native-preview-clip');
        }
      });
    };

    const onVisibility = () => {
      if (document.hidden) {
        flushSettings();
      } else {
        recoverUiFromForeground();
      }
    };

    const onNativeResume = () => recoverUiFromForeground();

    (window as any).__ACHOUR_FLUSH_SETTINGS__ = flushSettings;
    window.addEventListener('pagehide', flushSettings);
    window.addEventListener('beforeunload', flushSettings);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('achour_native_resume', onNativeResume);

    let capStateListener: any = null;
    try {
      capStateListener = CapacitorApp.addListener('appStateChange', ({ isActive }: any) => {
        if (isActive) {
          recoverUiFromForeground();
        } else {
          flushSettings();
        }
      });
    } catch {}

    return () => {
      flushSettings();
      delete (window as any).__ACHOUR_FLUSH_SETTINGS__;
      window.removeEventListener('pagehide', flushSettings);
      window.removeEventListener('beforeunload', flushSettings);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('achour_native_resume', onNativeResume);
      if (capStateListener && typeof capStateListener.remove === 'function') {
        capStateListener.remove();
      }
    };
  }, []);

  useEffect(() => {
    if (settingsSaveTimerRef.current) {
      clearTimeout(settingsSaveTimerRef.current);
    }
    settingsSaveTimerRef.current = setTimeout(() => {
      settingsSaveTimerRef.current = null;
      try {
        localStorage.setItem('achour_settings_v2', JSON.stringify(latestSettingsRef.current));
      } catch (e) {}
    }, 150);

    if (settings.activePlaylistId !== prevPlaylistIdRef.current) {
      prevPlaylistIdRef.current = settings.activePlaylistId;
      (async () => {
        const { iptvGlobalCache } = await import('./utils/iptv');
        iptvGlobalCache.clear();
      })();
    }

    const nextDir = settings.language === 'ar' ? 'rtl' : 'ltr';
    if (document.documentElement.dir !== nextDir) {
      document.documentElement.dir = nextDir;
    }
    if (document.documentElement.lang !== settings.language) {
      document.documentElement.lang = settings.language;
    }

    const scaleVal = Math.max(0.6, Math.min(1.5, ((settings.zoomScale || 100) * 0.95) / 100));
    const rootStyle = document.documentElement.style;
    const setVarIfChanged = (name: string, val: string) => {
      if (rootStyle.getPropertyValue(name) !== val) {
        rootStyle.setProperty(name, val);
      }
    };
    setVarIfChanged('--achour-zoom-scale', String(scaleVal));

    const ws = settings.windowScales || {};
    const globalWScale = (typeof ws.global === 'number' ? ws.global : 100) / 100;
    const calcWindowFactor = (val?: number) => {
      const f = globalWScale * ((typeof val === 'number' ? val : 100) / 100);
      return Math.max(0.6, Math.min(1.45, Number(f.toFixed(3))));
    };
    setVarIfChanged('--achour-wscale-details', String(calcWindowFactor(ws.details)));
    setVarIfChanged('--achour-wscale-player', String(calcWindowFactor(ws.playerPopups)));
    setVarIfChanged('--achour-wscale-confirm', String(calcWindowFactor(ws.confirm)));
    setVarIfChanged('--achour-wscale-settings', String(calcWindowFactor(ws.settings)));
    setVarIfChanged('--achour-wscale-playlists', String(calcWindowFactor(ws.playlists)));

    applyRoyalTheme(
      settings.royalThemeColor || 'pure-metallic-gold',
      settings.customThemeColor,
      settings.glassOpacity,
      settings.glassBlur
    );
  }, [settings]);

  useEffect(() => {
    for (let i = 0; i < 10; i++) {
      window.history.pushState({ page: 'achour_app' }, '', window.location.href);
    }

    const handlePopState = (e: PopStateEvent) => {
      window.history.pushState({ page: 'achour_app' }, '', window.location.href);
      executeBackHandler();
    };
    window.addEventListener('popstate', handlePopState);

    const triggerBack = (): boolean => {
      const handled = executeBackHandler();
      if (handled) return true;

      const event = new CustomEvent('app_back_pressed');
      window.dispatchEvent(event);
      return false;
    };

    (window as any).handleAndroidBack = () => {
      triggerBack();
    };

    let capBackListener: any = null;
    try {
      capBackListener = CapacitorApp.addListener('backButton', ({ canGoBack }: any) => {
        triggerBack();
      });
    } catch (e) {}

    const handleGlobalBack = (e: KeyboardEvent) => {
      const action = parseTVKeyEvent(e);
      if (action === 'BACK') {
        if (e.key === 'Backspace' && isTextInput(document.activeElement)) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();
        triggerBack();
      }
    };

    window.addEventListener('keydown', handleGlobalBack, { capture: true });
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleGlobalBack, { capture: true });
      if (capBackListener && typeof capBackListener.remove === 'function') {
        capBackListener.remove();
      }
      delete (window as any).handleAndroidBack;
    };
  }, []);

  const effectiveScale = Math.max(0.6, Math.min(1.5, ((settings.zoomScale || 100) * 0.95) / 100));
  const isRtl = settings.language === 'ar';
  const activeBgImageUrl = React.useMemo(() => {
    const customBg = settings.customBackground as any;
    if (typeof customBg === 'string' && customBg.trim()) return customBg.trim();
    if (customBg && typeof customBg === 'object' && customBg.type === 'image' && customBg.url) {
      return String(customBg.url);
    }
    const found =
      APP_BACKGROUNDS.find(b => b.id === (settings.backgroundStyle || 'bg-raouche-rocks-beirut')) ||
      APP_BACKGROUNDS[0];
    return found?.imageUrl || null;
  }, [settings.backgroundStyle, settings.customBackground]);
  const homeStageReady = !showSplash || splashFirstPainted;

  return (
    <div
      className={`achour-app-shell h-screen w-screen bg-transparent text-white selection:bg-gold/30 ${isRtl ? 'font-cairo' : 'font-sans'} relative overflow-hidden`}
      style={{ '--achour-zoom-scale': effectiveScale } as React.CSSProperties}
      onScroll={(e) => {
        if (e.currentTarget.scrollTop !== 0) e.currentTarget.scrollTop = 0;
        if (e.currentTarget.scrollLeft !== 0) e.currentTarget.scrollLeft = 0;
      }}
    >
      {homeStageReady && (
        <div className="achour-animated-bg fixed inset-0 pointer-events-none z-0">
          <AnimatedBackground settings={settings} />
        </div>
      )}

      <XtreamDebugOverlay />

      {showSplash && (
        <SplashScreen
          onFirstPainted={() => setSplashFirstPainted(true)}
          onComplete={() => {
            setShowSplash(false);
            setSplashIsPreview(false);
          }}
          royalThemeId={settings.royalThemeColor || 'pure-metallic-gold'}
          soundTrack={settings.splashSoundTrack || 'epic_royal_fanfare'}
          splashStyle={settings.splashStyle || 'royal_gold_particles'}
          backgroundImageUrl={activeBgImageUrl}
          isPreview={splashIsPreview}
        />
      )}

      <AnimatePresence>
        {isRestricted && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[100] achour-modal-backdrop flex flex-col items-center justify-center p-8 text-center"
          >
            <div className="w-24 h-24 rounded-full bg-red-500/20 flex items-center justify-center mb-6 border border-red-500/40">
              <Smartphone size={48} className="text-red-500" />
            </div>
            <h1 className="text-2xl font-black uppercase tracking-widest text-white mb-4">
              {settings.language === 'ar' ? 'الجهاز غير مدعوم' : 'Device Not Supported'}
            </h1>
            <div className="max-w-md space-y-4 text-zinc-400 font-bold">
              <p className="text-sm">
                {settings.language === 'ar' 
                  ? 'عذراً، هذا التطبيق مصمم حصرياً للعمل على أجهزة Fire TV و Android Box.' 
                  : 'Sorry, this application is exclusively designed for Fire TV and Android Box devices.'}
              </p>
              <div className="p-4 rounded-2xl achour-glass-modal flex items-center gap-4 text-left rtl:text-right">
                <Monitor className="text-gold shrink-0" size={24} />
                <p className="text-xs">
                  {settings.language === 'ar'
                    ? 'يرجى فتح التطبيق من خلال شاشة التلفاز للحصول على أفضل تجربة.'
                    : 'Please launch the app on your TV screen for the best experience.'}
                </p>
              </div>
            </div>
            <div className="mt-8 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
              Achour Player • TV Edition Only
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="fixed inset-0 z-10 overflow-hidden bg-transparent"
        onScroll={(e) => {
          if (e.currentTarget.scrollTop !== 0) e.currentTarget.scrollTop = 0;
          if (e.currentTarget.scrollLeft !== 0) e.currentTarget.scrollLeft = 0;
        }}
      >
        <div
          className={`bg-transparent transition-transform duration-75 ${isRestricted ? 'opacity-25 pointer-events-none' : ''}`}
          style={{
            transform: `scale(${effectiveScale})`,
            transformOrigin: isRtl ? 'top right' : 'top left',
            width: `${100 / effectiveScale}%`,
            height: `${100 / effectiveScale}%`,
          }}
        >
          {userId && homeStageReady && (
            <Dashboard 
              userId={userId} 
              settings={settings} 
              onUpdateSettings={setSettings} 
              onTriggerSplash={() => {
                setSplashIsPreview(true);
                setShowSplash(true);
              }}
              startupSplashComplete={!showSplash}
            />
          )}
        </div>
      </div>

      {!isNativeCapacitorApp() && tvPreviewMode && (
        <TvPreviewModal
          isOpen={tvPreviewMode}
          onClose={() => setTvPreviewMode(false)}
          settings={settings}
          userId={userId}
          onUpdateSettings={setSettings}
        />
      )}
    </div>
  );
}
