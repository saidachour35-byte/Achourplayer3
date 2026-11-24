// @ts-nocheck
// Original path: src/components/SettingsView.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Globe,
  LayoutGrid, EyeOff,
  MonitorPlay, Clock, Check, X, Eye, Search, Trash2,
  Tv, Film, Clapperboard, Palette, Sparkles, Image,
  Upload, RefreshCw, Maximize2,
  ArrowUpDown, Type, AppWindow, Target, Frame, Layers, Sliders, SunMoon, AlertTriangle
} from 'lucide-react';
import {
  EXTERNAL_PLAYER_PROFILES,
  isFireTVDevice,
  probeExternalPlayerInstalled,
  removeCustomPlayerPackage,
  saveCustomPlayerPackage
} from '../utils/players';
import { AppSettings, Language, TimeFormat, ViewMode, VodSortBy, PosterSize, Playlist, LiveBarSize } from '../types';
import { useI18n } from '../utils/i18n';
import { getPlatformUrl } from '../utils/platform';
import DesignSubViewContent, { DesignSubViewId } from './DesignSubViews';
import { xtreamFetch } from '../utils/iptv';
import axios from 'axios';
import { collection, query, where, getDocs, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, sanitizeForFirestore } from '../lib/firebase';
import { ExtractionService } from '../utils/extractionService';
import {
  clearWatchHistoryByType,
  getLastWatchedChannel,
  WatchHistoryType
} from '../utils/watchHistoryService';
import { APP_BACKGROUNDS } from '../utils/themeManager';
import {
  pushBackHandler,
  navigateSpatial,
  parseTVKeyEvent,
  BackPriority,
  ensureInitialFocus,
  getCurrentTVFocus,
  setTVFocus,
  isTextInput,
  isSafeBackdropClick
} from '../utils/tvNavigation';

interface SettingsViewProps {
  onBack: () => void;
  settings: AppSettings;
  onUpdateSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  userId: string;
  onTriggerSplash?: () => void;
}

const DESIGN_SUBVIEW_IDS = new Set<string>([
  'background-opacity',
  'window-sizes',
  'design-display',
  'design-icons',
  'design-frames',
  'design-icon-size',
  'design-frame-size',
  'design-spacing',
  'design-alignment',
  'design-order',
  'design-colors',
  'design-custom-color',
  'design-glass-opacity',
  'design-glass-blur',
  'design-focus-mode',
  'design-label-color',
]);

type SettingsSubView =
  | 'main'
  | DesignSubViewId
  | 'language'
  | 'time'
  | 'view'
  | 'last-channel'
  | 'vod-sort'
  | 'poster-size'
  | 'poster-titles'
  | 'players'
  | 'backgrounds'
  | 'categories-live'
  | 'categories-movie'
  | 'categories-series'
  | 'screen-zoom'
  | 'settings-scale'
  | 'live-scale'
  | 'vod-scale'
  | 'live-bar-size'
  | 'seek-step';

export const DEFAULT_PLAYERS = [
  'LibVLC (محرك VLC المدمج الداخلي)',
  'Achour Player (مدمج - Native)',
  'VLC for Android',
  'VLC Media Player',
  'MX Player Pro',
  'ExoPlayer',
  'MPV Player',
  'Nova Player',
  'Nova Video Player',
  'Just Player',
  'IJK Player',
  'PotPlayer',
  'KMPlayer'
];

// Isolated clock preview so main Settings never re-renders every 1 second
const SettingsTimePreview = React.memo(({
  language,
  timeFormat,
  onSelect,
  isRtl,
  t
}: {
  language: Language;
  timeFormat: TimeFormat;
  onSelect: (fmt: TimeFormat) => void;
  isRtl: boolean;
  t: (key: any, params?: Record<string, string | number>) => string;
}) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const preview12 = useMemo(() => {
    return now.toLocaleTimeString(language === 'ar' ? 'ar-EG' : language, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }, [now, language]);

  const preview24 = useMemo(() => {
    return now.toLocaleTimeString(language === 'ar' ? 'ar-EG' : language, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }, [now, language]);

  const items: Array<{ format: TimeFormat; label: string; preview: string }> = [
    { format: '12h', label: t('time_12h_label'), preview: preview12 },
    { format: '24h', label: t('time_24h_label'), preview: preview24 },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map((item) => {
        const active = timeFormat === item.format;
        return (
          <button
            key={item.format}
            data-tv-focusable="true"
            tabIndex={0}
            onClick={() => onSelect(item.format)}
            className={`sm:col-span-1 lg:col-span-2 flex flex-col justify-between p-4 rounded-2xl border transition-colors cursor-pointer min-h-[92px] ${
              active
                ? 'border-gold bg-gold/15'
                : 'border-white/10 bg-white/[0.04] hover:border-gold/40 hover:bg-white/[0.09]'
            } ${isRtl ? 'text-right' : 'text-left'}`}
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="text-base font-medium text-white">{item.label}</span>
              {active && (
                <span className="p-1.5 rounded-lg bg-gold text-black shrink-0">
                  <Check size={16} />
                </span>
              )}
            </div>
            <span className="text-lg font-mono text-gold mt-3 block">
              {t('time_preview_label')} {item.preview}
            </span>
          </button>
        );
      })}
    </div>
  );
});




export default function SettingsView({ onBack, settings, onUpdateSettings, userId }: SettingsViewProps) {
  const [subView, setSubView] = useState<SettingsSubView>('main');
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerPackage, setNewPlayerPackage] = useState('');
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<{ category_id: string; category_name: string }[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [catSearch, setCatSearch] = useState('');
  const [catFilterTab, setCatFilterTab] = useState<'all' | 'visible' | 'hidden'>('all');
  const [playersTab, setPlayersTab] = useState<'internal' | 'external' | 'custom'>(() => {
    if (!settings.useExternalPlayer) return 'internal';
    const isBuiltInExternal = EXTERNAL_PLAYER_PROFILES.some(
      (p) => p.id === settings.selectedPlayer || p.aliases?.includes(settings.selectedPlayer)
    );
    return isBuiltInExternal ? 'external' : 'custom';
  });
  const [externalInstallMap, setExternalInstallMap] = useState<Record<string, boolean | 'unknown'>>({});
  const [bgPage, setBgPage] = useState(0);
  const [catPage, setCatPage] = useState(0);
  const [historyClearSuccess, setHistoryClearSuccess] = useState<string | null>(null);
  const [confirmClearType, setConfirmClearType] = useState<WatchHistoryType | null>(null);
  const [historyTick, setHistoryTick] = useState(0);
  const [syncInProgress] = useState(false);
  const [syncNotification, setSyncNotification] = useState<string | null>(null);
  const [showUploadPasteModal, setShowUploadPasteModal] = useState(false);
  const modalOpenedAtRef = useRef(0);
  const modalBackdropDownRef = useRef(false);

  const channelFileInputRef = useRef<HTMLInputElement | null>(null);
  const { t, isRtl } = useI18n(settings.language);

  const mainScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const mainScrollTopRef = useRef(0);
  const lastFocusedButtonRef = useRef<HTMLElement | null>(null);
  const lastFocusedTileIdRef = useRef<string | null>(null);
  const prevSubViewRef = useRef<SettingsSubView>('main');
  const prevModalOpenRef = useRef(false);

  const captureMainState = (explicitTileId?: string) => {
    if (mainScrollContainerRef.current) {
      mainScrollTopRef.current = mainScrollContainerRef.current.scrollTop;
    }
    const activeEl = getCurrentTVFocus() || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const resolvedTileId =
      explicitTileId ||
      activeEl?.getAttribute('data-settings-tile-id') ||
      lastFocusedTileIdRef.current;
    if (resolvedTileId) {
      lastFocusedTileIdRef.current = resolvedTileId;
    }
    if (activeEl && activeEl !== document.body && activeEl !== document.documentElement) {
      lastFocusedButtonRef.current = activeEl;
    }
  };

  const restoreMainScrollAndFocus = () => {
    const container = mainScrollContainerRef.current;
    const savedTop = mainScrollTopRef.current;
    if (container) {
      container.scrollTop = savedTop;
    }
    const tileId = lastFocusedTileIdRef.current;
    let targetEl: HTMLElement | null = null;
    if (tileId) {
      targetEl = document.querySelector<HTMLElement>(`[data-settings-tile-id="${tileId}"]`);
    }
    if (!targetEl && lastFocusedButtonRef.current && document.body.contains(lastFocusedButtonRef.current)) {
      targetEl = lastFocusedButtonRef.current;
    }
    if (targetEl) {
      setTVFocus(targetEl, { scroll: false, skipLayoutCheck: true });
    } else {
      ensureInitialFocus();
    }
    if (container) {
      container.scrollTop = savedTop;
    }
  };

  const navigateToSubView = (sub: SettingsSubView, explicitTileId?: string) => {
    captureMainState(explicitTileId);
    setSubView(sub);
  };

  useEffect(() => {
    if (confirmClearType || showUploadPasteModal) {
      modalOpenedAtRef.current = Date.now();
      modalBackdropDownRef.current = false;
    }
  }, [confirmClearType, showUploadPasteModal]);

  useEffect(() => {
    if (subView !== 'players' || playersTab !== 'external') return;
    let cancelled = false;
    Promise.all(
      EXTERNAL_PLAYER_PROFILES.map(async (p) => {
        const res = await probeExternalPlayerInstalled(p.packageName, p.fallbackPackages);
        return [p.id, res.installed] as const;
      })
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<string, boolean | 'unknown'> = {};
      entries.forEach(([id, status]) => {
        next[id] = status;
      });
      setExternalInstallMap(next);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [subView, playersTab]);

  // Reset error cleanly whenever switching subviews or inner filter tabs
  useEffect(() => {
    setError('');
  }, [subView, catFilterTab, catSearch, playersTab]);

  // Register pushBackHandler for SettingsView
  useEffect(() => {
    const priority = confirmClearType || showUploadPasteModal
      ? BackPriority.MODAL
      : subView !== 'main'
      ? BackPriority.SUBVIEW
      : BackPriority.VIEW;
    const unregister = pushBackHandler(() => {
      if (confirmClearType) {
        setConfirmClearType(null);
        return true;
      }
      if (showUploadPasteModal) {
        setShowUploadPasteModal(false);
        return true;
      }
      if (subView !== 'main') {
        setSubView('main');
        return true;
      }
      onBack();
      return true;
    }, priority);
    return unregister;
  }, [subView, confirmClearType, showUploadPasteModal, onBack]);

  // Manage initial focus cleanly across subviews/modals without overwriting restored main scroll/focus
  const hasModalOpen = Boolean(confirmClearType || showUploadPasteModal);
  useEffect(() => {
    const prevSub = prevSubViewRef.current;
    const prevModal = prevModalOpenRef.current;
    prevSubViewRef.current = subView;
    prevModalOpenRef.current = hasModalOpen;

    if (hasModalOpen) {
      const tmr = setTimeout(() => {
        ensureInitialFocus();
      }, 50);
      return () => clearTimeout(tmr);
    }

    if (subView === 'main') {
      const returningToMain = prevSub !== 'main' || prevModal;
      if (returningToMain) {
        if (mainScrollContainerRef.current) {
          mainScrollContainerRef.current.scrollTop = mainScrollTopRef.current;
        }
        const rafId = requestAnimationFrame(() => restoreMainScrollAndFocus());
        const tmr = setTimeout(() => restoreMainScrollAndFocus(), 45);
        return () => {
          cancelAnimationFrame(rafId);
          clearTimeout(tmr);
        };
      }
      const tmr = setTimeout(() => {
        if (!getCurrentTVFocus()) {
          ensureInitialFocus();
        }
      }, 50);
      return () => clearTimeout(tmr);
    }

    const tmr = setTimeout(() => {
      ensureInitialFocus();
    }, 50);
    return () => clearTimeout(tmr);
  }, [subView, playersTab, hasModalOpen]);

  // Recover TV focus smoothly if a pagination button becomes disabled after page change
  useEffect(() => {
    const tmr = setTimeout(() => {
      const active = document.activeElement as HTMLButtonElement | null;
      if (!active || active === document.body || active.disabled || !document.body.contains(active)) {
        ensureInitialFocus();
      }
    }, 40);
    return () => clearTimeout(tmr);
  }, [bgPage, catPage]);

  // TV Remote D-Pad Navigation for SettingsView (capture phase avoids double-handling)
  useEffect(() => {

    const handleKeyDown = (e: KeyboardEvent) => {
      const action = parseTVKeyEvent(e);
      const activeEl = document.activeElement;

      // In Background Opacity view, Left ALWAYS decreases by 1% and Right ALWAYS increases by 1%
      if (subView === 'background-opacity') {
        if (action === 'RIGHT') {
          e.preventDefault();
          e.stopPropagation();
          onUpdateSettings((prev) => {
            const cur =
              typeof prev.backgroundOpacity === 'number' && !Number.isNaN(prev.backgroundOpacity)
                ? Math.round(prev.backgroundOpacity)
                : 62;
            return { ...prev, backgroundOpacity: Math.min(100, cur + 1) };
          });
          return;
        }
        if (action === 'LEFT') {
          e.preventDefault();
          e.stopPropagation();
          onUpdateSettings((prev) => {
            const cur =
              typeof prev.backgroundOpacity === 'number' && !Number.isNaN(prev.backgroundOpacity)
                ? Math.round(prev.backgroundOpacity)
                : 62;
            return { ...prev, backgroundOpacity: Math.max(0, cur - 1) };
          });
          return;
        }
      }

      if (isTextInput(activeEl)) {
        if (action === 'UP') {
          e.preventDefault(); e.stopPropagation(); navigateSpatial('up', document.body);
        } else if (action === 'DOWN') {
          e.preventDefault(); e.stopPropagation(); navigateSpatial('down', document.body);
        }
        return;
      }

      if (action === 'UP') {
        e.preventDefault(); e.stopPropagation(); navigateSpatial('up', document.body, null);
      } else if (action === 'DOWN') {
        e.preventDefault(); e.stopPropagation(); navigateSpatial('down', document.body, null);
      } else if (action === 'LEFT') {
        e.preventDefault(); e.stopPropagation(); navigateSpatial('left', document.body, null);
      } else if (action === 'RIGHT') {
        e.preventDefault(); e.stopPropagation(); navigateSpatial('right', document.body, null);
      } else if (action === 'SELECT') {
        if (e.repeat) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        const cur = getCurrentTVFocus();
        if (cur && typeof cur.click === 'function') {
          e.preventDefault();
          e.stopPropagation();
          cur.click();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [subView, onBack, onUpdateSettings]);

  const [pastedM3uText, setPastedM3uText] = useState('');
  const [pastedM3uName, setPastedM3uName] = useState('');

  const saveAndActivateM3uContent = async (fileName: string, content: string) => {
    if (!content.trim()) return;

    const lines = content.split('\n');
    let channelCount = 0;
    for (const l of lines) {
      if (l.startsWith('#EXTINF:')) channelCount++;
    }

    const playlistName = fileName.replace(/\.[^/.]+$/, '').trim() || 'ملف قنوات M3U';
    const k1 = 'achour_m3u_file_' + playlistName;
    const k2 = 'achour_m3u_file_' + fileName;

    // 1. Wipe old extracted storage before activating the new M3U source
    await ExtractionService.purgeStorageForSwitch([k1, k2]);

    try {
      localStorage.setItem(k1, content);
      localStorage.setItem(k2, content);
    } catch (err) {
      console.warn('LocalStorage error', err);
    }

    const newDocRef = db ? doc(collection(db, 'playlists')) : null;
    const canonicalId = newDocRef
      ? newDocRef.id
      : `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const localItem = {
      id: canonicalId,
      name: playlistName,
      type: 'm3u' as const,
      url: 'local_file://' + fileName,
      portal: 'local_file://' + fileName,
      m3uContent: content,
      userId,
      createdAt: new Date().toISOString()
    };

    try {
      const rawLocal = localStorage.getItem('achour_local_playlists');
      const list = rawLocal ? JSON.parse(rawLocal) : [];
      localStorage.setItem('achour_local_playlists', JSON.stringify([localItem, ...list.filter((p: any) => p.id !== canonicalId)]));
    } catch (e) {
      console.warn(e);
    }

    if (db && newDocRef) {
      try {
        await setDoc(newDocRef, sanitizeForFirestore({
          name: playlistName,
          type: 'm3u',
          url: 'local_file://' + fileName,
          portal: 'local_file://' + fileName,
          userId,
          createdAt: serverTimestamp()
        }));
      } catch (e) {
        console.warn('Firestore fallback to local:', e);
      }
    }

    onUpdateSettings(prev => ({ ...prev, activePlaylistId: canonicalId }));
    setSyncNotification(
      isRtl
        ? `✓ تم حفظ وتفعيل ملف القنوات بنجاح: "${playlistName}" (${channelCount} قناة)`
        : `✓ Playlist content saved and activated: "${playlistName}" (${channelCount} channels)`
    );
    setShowUploadPasteModal(false);
    setPastedM3uText('');
    setPastedM3uName('');
    setTimeout(() => setSyncNotification(null), 5000);
  };

  const handleChannelFileUploadInSettings = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (content) {
        await saveAndActivateM3uContent(file.name, content);
      }
    };
    reader.readAsText(file);
  };

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    onUpdateSettings(prev => ({ ...prev, [key]: value }));
  };

  const allPlayers = useMemo(() => {
    const list = [...DEFAULT_PLAYERS];
    (settings.externalPlayers || []).forEach(p => {
      if (!list.includes(p)) list.push(p);
    });
    return list;
  }, [settings.externalPlayers]);

  const fetchCategories = async (type: 'live' | 'movie' | 'series') => {
    setCatLoading(true);
    setCategories([]);
    try {
      let p: any = null;
      if (settings.activePlaylistId && db) {
        try {
          const docSnap = await getDoc(doc(db, 'playlists', settings.activePlaylistId));
          if (docSnap.exists()) {
            p = { id: docSnap.id, ...docSnap.data() };
          }
        } catch (e) {
          console.warn('Could not fetch active playlist doc', e);
        }
      }

      if (!p) {
        try {
          const rawLocal = localStorage.getItem('achour_local_playlists');
          const localList: Playlist[] = rawLocal ? JSON.parse(rawLocal) : [];
          const found = localList.find(pl => pl.id === settings.activePlaylistId);
          if (found) {
            p = found;
          } else if (db) {
            const q = query(collection(db, 'playlists'), where('userId', '==', userId));
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
              p = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
            }
          }
        } catch (e) {
          console.warn('Could not query playlists', e);
        }
      }

      if (p) {
        let xHost = p.url || '';
        let xUser = p.username || '';
        let xPass = p.password || '';
        if (p.url && (!xUser || !xPass)) {
          try {
            const u = new URL(p.url.startsWith('http') ? p.url : 'http://' + p.url);
            const userParam = u.searchParams.get('username');
            const passParam = u.searchParams.get('password');
            if (userParam && passParam) {
              xUser = userParam;
              xPass = passParam;
              xHost = u.origin;
            }
          } catch (e) {}
        }

        if (p.type === 'xtream' || (xUser && xPass)) {
          const host = xHost.trim().replace(/\/+$/, '').replace(/\/(player_api|get|index)\.php.*$/i, '').replace(/\/c\/?$/i, '').replace(/\?.*$/, '');
          let action = 'get_live_categories';
          if (type === 'movie') action = 'get_vod_categories';
          if (type === 'series') action = 'get_series_categories';

          const res = await xtreamFetch(host, xUser, xPass, action);
          if (res.ok && res.rawList && res.rawList.length > 0) {
            setCategories(res.rawList.map((c: any) => ({
              category_id: String(c.category_id || c.id || c.name || Math.random()),
              category_name: String(c.category_name || c.name || 'Unnamed Category')
            })));
            return;
          }
        }

        let rawContent = p.m3uContent || '';
        if (!rawContent && p.url?.startsWith('local_file://')) {
          const fileName = p.url.replace('local_file://', '');
          rawContent = localStorage.getItem('achour_m3u_file_' + fileName) || localStorage.getItem('achour_m3u_file_' + p.name) || '';
        } else if (!rawContent && p.url) {
          try {
            const fetchUrl = getPlatformUrl('m3u', p.url);
            const res = await axios.get(fetchUrl);
            rawContent = typeof res.data === 'string' ? res.data : '';
          } catch (err) {
            try {
              const fetchUrl2 = getPlatformUrl('get', p.url);
              const res2 = await axios.get(fetchUrl2);
              rawContent = typeof res2.data === 'string' ? res2.data : '';
            } catch (e) {}
          }
        }

        if (rawContent) {
          const groupTitleMatches = rawContent.match(/group-title="([^"]+)"/g) || [];
          const extGrpMatches = rawContent.match(/#EXTGRP:(.+)/g) || [];

          const titles = [
            ...groupTitleMatches.map((m: string) => m.replace(/group-title="|"/g, '').trim()),
            ...extGrpMatches.map((m: string) => m.replace('#EXTGRP:', '').trim())
          ].filter(Boolean);

          if (titles.length > 0) {
            const uniqueGroups = Array.from(new Set(titles));
            const filteredGroups = uniqueGroups.filter(g => {
              const lower = g.toLowerCase();
              if (type === 'movie') {
                return lower.includes('movie') || lower.includes('film') || lower.includes('vod') || lower.includes('cinema') || g.includes('أفلام') || g.includes('افلام') || g.includes('فيلم');
              } else if (type === 'series') {
                return lower.includes('serie') || lower.includes('show') || lower.includes('season') || g.includes('مسلسل') || g.includes('مسلسلات') || g.includes('دراما');
              } else {
                return !lower.includes('vod') && !lower.includes('film') && !lower.includes('movie') && !lower.includes('serie') && !g.includes('أفلام') && !g.includes('مسلسلات');
              }
            });

            const targetList = filteredGroups.length > 0 ? filteredGroups : uniqueGroups;
            setCategories(targetList.map(name => ({ category_id: name, category_name: name })));
            return;
          }
        }
      }

      setCategories([]);
    } catch (err) {
      console.error('Error fetching categories in SettingsView:', err);
      setCategories([]);
    } finally {
      setCatLoading(false);
    }
  };

  useEffect(() => {
    if (subView === 'categories-live') fetchCategories('live');
    if (subView === 'categories-movie') fetchCategories('movie');
    if (subView === 'categories-series') fetchCategories('series');
    if (subView === 'backgrounds') {
      const activeBgId = settings.backgroundStyle || 'bg-raouche-rocks-beirut';
      const activeIdx = APP_BACKGROUNDS.findIndex((b) => b.id === activeBgId);
      setBgPage(activeIdx >= 0 ? Math.floor(activeIdx / 15) : 0);
    }
    setCatSearch('');
    setCatFilterTab('all');
    setCatPage(0);
  }, [subView]);

  useEffect(() => {
    setCatPage(0);
  }, [catSearch, catFilterTab]);

  const handleLanguageSelect = (lang: Language) => {
    try {
      localStorage.setItem('achour_user_selected_lang', 'true');
      localStorage.setItem('achour_lang_initialized_v3', 'true');
    } catch {}
    updateSetting('language', lang);
    setSubView('main');
  };

  const handleTimeFormatSelect = (format: TimeFormat) => {
    updateSetting('timeFormat', format);
    setSubView('main');
  };

  const handleViewModeSelect = (mode: ViewMode) => {
    try {
      localStorage.setItem('achour_viewmode_user_set', 'true');
    } catch {}
    updateSetting('viewMode', mode);
    setSubView('main');
  };

  const handlePlayerSelect = (player: string) => {
    updateSetting('selectedPlayer', player);
    setSubView('main');
  };

  const handleAddPlayer = () => {
    const name = newPlayerName.trim();
    const pkg = newPlayerPackage.trim();
    if (!name) return;
    if (allPlayers.includes(name)) {
      setError(t('player_already_exists'));
      return;
    }
    if (pkg) {
      saveCustomPlayerPackage(name, pkg);
    }
    const updatedPlayers = [...(settings.externalPlayers || []), name];
    updateSetting('externalPlayers', updatedPlayers);
    updateSetting('useExternalPlayer', true);
    updateSetting('selectedPlayer', name);
    setNewPlayerName('');
    setNewPlayerPackage('');
    setError('');
  };

  const handleDeletePlayer = (e: React.MouseEvent, playerName: string) => {
    e.stopPropagation();
    removeCustomPlayerPackage(playerName);
    const updated = allPlayers.filter(p => p !== playerName);
    updateSetting('externalPlayers', updated);
    if (settings.selectedPlayer === playerName) {
      updateSetting('selectedPlayer', updated[0] || DEFAULT_PLAYERS[0]);
      updateSetting('useExternalPlayer', false);
    }
  };

  const handleSelectBackground = (bgId: string) => {
    updateSetting('backgroundStyle', bgId);
    updateSetting('customBackground', null);
  };

  const toggleCategoryVisibility = (catId: string) => {
    const cat = categories.find(c => c.category_id === catId);
    const idsToToggle = cat ? Array.from(new Set([cat.category_id, cat.category_name].filter(Boolean))) : [catId];

    if (subView === 'categories-movie') {
      const list = settings.hiddenMovieCategories || [];
      const isHidden = list.includes(catId) || (cat && list.includes(cat.category_name));
      const newHidden = isHidden
        ? list.filter(id => !idsToToggle.includes(id))
        : Array.from(new Set([...list, ...idsToToggle]));
      updateSetting('hiddenMovieCategories', newHidden);
    } else if (subView === 'categories-series') {
      const list = settings.hiddenSeriesCategories || [];
      const isHidden = list.includes(catId) || (cat && list.includes(cat.category_name));
      const newHidden = isHidden
        ? list.filter(id => !idsToToggle.includes(id))
        : Array.from(new Set([...list, ...idsToToggle]));
      updateSetting('hiddenSeriesCategories', newHidden);
    } else {
      const list = settings.hiddenLiveCategories || [];
      const isHidden = list.includes(catId) || (cat && list.includes(cat.category_name));
      const newHidden = isHidden
        ? list.filter(id => !idsToToggle.includes(id))
        : Array.from(new Set([...list, ...idsToToggle]));
      updateSetting('hiddenLiveCategories', newHidden);
    }
  };

  const showAllVisibleCategories = () => {
    const categoryIdentifiers = categories.flatMap(c => [c.category_id, c.category_name]).filter(Boolean);
    if (subView === 'categories-movie') {
      updateSetting('hiddenMovieCategories', (settings.hiddenMovieCategories || []).filter(id => !categoryIdentifiers.includes(id)));
    } else if (subView === 'categories-series') {
      updateSetting('hiddenSeriesCategories', (settings.hiddenSeriesCategories || []).filter(id => !categoryIdentifiers.includes(id)));
    } else {
      updateSetting('hiddenLiveCategories', (settings.hiddenLiveCategories || []).filter(id => !categoryIdentifiers.includes(id)));
    }
  };

  const hideAllVisibleCategories = () => {
    const categoryIdentifiers = categories.flatMap(c => [c.category_id, c.category_name]).filter(Boolean);
    if (subView === 'categories-movie') {
      updateSetting('hiddenMovieCategories', Array.from(new Set([...(settings.hiddenMovieCategories || []), ...categoryIdentifiers])));
    } else if (subView === 'categories-series') {
      updateSetting('hiddenSeriesCategories', Array.from(new Set([...(settings.hiddenSeriesCategories || []), ...categoryIdentifiers])));
    } else {
      updateSetting('hiddenLiveCategories', Array.from(new Set([...(settings.hiddenLiveCategories || []), ...categoryIdentifiers])));
    }
  };

  const handleConfirmClearWatchHistory = () => {
    if (!confirmClearType) return;
    clearWatchHistoryByType(confirmClearType);
    const clearedKind = confirmClearType;
    setConfirmClearType(null);
    setHistoryTick(n => n + 1);
    setHistoryClearSuccess(clearedKind);
    setTimeout(() => setHistoryClearSuccess(null), 2600);
  };

  const filteredCategories = useMemo(() => {
    let list = categories;
    let hiddenList = settings.hiddenLiveCategories || [];
    if (subView === 'categories-movie') hiddenList = settings.hiddenMovieCategories || [];
    if (subView === 'categories-series') hiddenList = settings.hiddenSeriesCategories || [];

    if (catFilterTab === 'visible') {
      list = list.filter(c => !hiddenList.includes(c.category_id) && !hiddenList.includes(c.category_name));
    } else if (catFilterTab === 'hidden') {
      list = list.filter(c => hiddenList.includes(c.category_id) || hiddenList.includes(c.category_name));
    }
    if (!catSearch.trim()) return list;
    const q = catSearch.toLowerCase();
    return list.filter(c => c.category_name.toLowerCase().includes(q));
  }, [categories, catSearch, catFilterTab, subView, settings.hiddenLiveCategories, settings.hiddenMovieCategories, settings.hiddenSeriesCategories]);

  const currentBgOpacity =
    typeof settings.backgroundOpacity === 'number' && !Number.isNaN(settings.backgroundOpacity)
      ? Math.max(0, Math.min(100, Math.round(settings.backgroundOpacity)))
      : 62;

  // Grouped settings for structured display (each customization option has its own independent tile)
  const settingsGroups: Array<{
    title: string;
    items: Array<{
      icon: React.ComponentType<any>;
      label: string;
      subLabel?: string;
      action: () => void;
    }>;
  }> = [
    {
      title: t('settings_group_system'),
      items: [
        { icon: Globe, label: t('language'), action: () => navigateToSubView('language') },
        { icon: Clock, label: t('time_format'), action: () => navigateToSubView('time') },
        { icon: Tv, label: t('auto_open_last_channel'), action: () => navigateToSubView('last-channel') },
        { icon: Trash2, label: t('clear_movie_history'), action: () => setConfirmClearType('movie') },
        { icon: Trash2, label: t('clear_series_history'), action: () => setConfirmClearType('series') },
        { icon: Trash2, label: t('clear_channel_history'), action: () => setConfirmClearType('live') },
      ]
    },
    {
      title: t('settings_group_sizes'),
      items: [
        { icon: AppWindow, label: t('window_popup_sizes'), subLabel: `${settings.windowScales?.global ?? 100}%`, action: () => navigateToSubView('window-sizes') },
        { icon: Maximize2, label: t('screen_zoom'), action: () => navigateToSubView('screen-zoom') },
        { icon: Maximize2, label: t('settings_page_size'), action: () => navigateToSubView('settings-scale') },
        { icon: Tv, label: t('live_page_size'), action: () => navigateToSubView('live-scale') },
        {
          icon: Tv,
          label: t('live_bar_size'),
          subLabel:
            (settings.liveBarSize || 'default') === 'full'
              ? t('live_bar_full')
              : (settings.liveBarSize || 'default') === 'compact'
              ? t('live_bar_compact')
              : t('live_bar_default'),
          action: () => navigateToSubView('live-bar-size')
        },
        { icon: Film, label: t('vod_page_size'), action: () => navigateToSubView('vod-scale') },
        { icon: Clock, label: t('seek_step'), action: () => navigateToSubView('seek-step') },
      ]
    },
    {
      title: t('settings_group_playback'),
      items: [
        { icon: LayoutGrid, label: t('view_mode'), action: () => navigateToSubView('view') },
        {
          icon: MonitorPlay,
          label: t('players_title'),
          subLabel: `${settings.useExternalPlayer ? t('player_external_tag') : t('player_internal_tag')} · ${settings.selectedPlayer || 'Achour Player'}`,
          action: () => navigateToSubView('players')
        },
        { icon: ArrowUpDown, label: t('sort_by'), action: () => navigateToSubView('vod-sort') },
        { icon: Film, label: t('poster_size'), action: () => navigateToSubView('poster-size') },
        { icon: Type, label: t('poster_titles'), action: () => navigateToSubView('poster-titles') },
      ]
    },
    {
      title: t('settings_group_appearance'),
      items: [
        {
          icon: SunMoon,
          label: t('background_opacity'),
          subLabel: `${currentBgOpacity}%`,
          action: () => navigateToSubView('background-opacity'),
        },
        { icon: Palette, label: t('app_theme_colors'), action: () => navigateToSubView('design-colors') },
        { icon: Sparkles, label: t('custom_color_hex'), action: () => navigateToSubView('design-custom-color') },
        { icon: Eye, label: t('icon_display_mode'), action: () => navigateToSubView('design-display') },
        { icon: Sparkles, label: t('icon_styles_10'), action: () => navigateToSubView('design-icons') },
        { icon: Frame, label: t('frame_shapes_40'), action: () => navigateToSubView('design-frames') },
        { icon: Maximize2, label: t('icon_size_label'), action: () => navigateToSubView('design-icon-size') },
        { icon: Frame, label: t('frame_size_label'), action: () => navigateToSubView('design-frame-size') },
        { icon: Sliders, label: t('section_spacing'), action: () => navigateToSubView('design-spacing') },
        { icon: AppWindow, label: t('screen_alignment'), action: () => navigateToSubView('design-alignment') },
        { icon: ArrowUpDown, label: t('reorder_sections'), action: () => navigateToSubView('design-order') },
        { icon: Sliders, label: t('glass_opacity'), action: () => navigateToSubView('design-glass-opacity') },
        { icon: Layers, label: t('frosted_glass_blur'), action: () => navigateToSubView('design-glass-blur') },
        { icon: Target, label: t('tv_focus_mode'), action: () => navigateToSubView('design-focus-mode') },
        { icon: Type, label: t('section_label_colors'), action: () => navigateToSubView('design-label-color') },
        { icon: Image, label: t('app_backgrounds'), action: () => navigateToSubView('backgrounds') },
      ]
    }
  ];

  // SUBVIEW: LANGUAGE
  if (subView === 'language') {
    return (
      <SubViewContainer title={t('language')} onBack={() => setSubView('main')} isRtl={isRtl} backLabel={t('back')}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          {[
            { code: 'en', label: 'English', name: t('lang_en_sub'), flag: '🇬🇧' },
            { code: 'ar', label: 'العربية', name: t('lang_ar_sub'), flag: '🇸🇦' },
            { code: 'fr', label: 'Français', name: t('lang_fr_sub'), flag: '🇫🇷' },
            { code: 'de', label: 'Deutsch', name: t('lang_de_sub'), flag: '🇩🇪' },
          ].map((lang) => (
            <TileOptionButton
              key={lang.code}
              title={`${lang.flag} ${lang.label}`}
              subtitle={lang.name}
              active={settings.language === lang.code}
              onClick={() => handleLanguageSelect(lang.code as Language)}
              isRtl={isRtl}
            />
          ))}
        </div>
      </SubViewContainer>
    );
  }

  // SUBVIEW: TIME FORMAT
  if (subView === 'time') {
    return (
      <SubViewContainer title={t('time_format')} onBack={() => setSubView('main')} isRtl={isRtl} backLabel={t('back')}>
        <SettingsTimePreview
          language={settings.language}
          timeFormat={settings.timeFormat}
          onSelect={handleTimeFormatSelect}
          isRtl={isRtl}
          t={t}
        />
      </SubViewContainer>
    );
  }

  // SUBVIEW: SEEK STEP (10s / 20s / 30s)
  if (subView === 'seek-step') {
    const currentStep = settings.seekStep || 10;
    const stepOptions: Array<{ val: 10 | 20 | 30; label: string; desc: string }> = [
      { val: 10, label: t('seconds_10'), desc: t('seek_10_desc') },
      { val: 20, label: t('seconds_20'), desc: t('seek_20_desc') },
      { val: 30, label: t('seconds_30'), desc: t('seek_30_desc') },
    ];
    return (
      <SubViewContainer title={t('seek_step')} onBack={() => setSubView('main')} isRtl={isRtl} backLabel={t('back')}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {stepOptions.map((opt) => (
            <TileOptionButton
              key={opt.val}
              title={opt.label}
              subtitle={opt.desc}
              active={currentStep === opt.val}
              onClick={() => {
                updateSetting('seekStep', opt.val);
                setSubView('main');
              }}
              isRtl={isRtl}
            />
          ))}
        </div>
      </SubViewContainer>
    );
  }

  // SUBVIEW: VIEW MODE
  if (subView === 'view') {
    const activeViewMode = settings.viewMode || 'grid';
    return (
      <SubViewContainer title={t('view_mode')} onBack={() => setSubView('main')} isRtl={isRtl} backLabel={t('back')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {(['list', 'grid'] as ViewMode[]).map((mode) => (
            <TileOptionButton
              key={mode}
              title={t(mode)}
              subtitle={mode === 'list' ? t('view_list_desc') : t('view_grid_desc')}
              active={activeViewMode === mode}
              onClick={() => handleViewModeSelect(mode)}
              isRtl={isRtl}
            />
          ))}
        </div>
      </SubViewContainer>
    );
  }

  // SUBVIEW: AUTO OPEN LAST WATCHED CHANNEL
  if (subView === 'last-channel') {
    const savedLast = getLastWatchedChannel(settings.activePlaylistId);
    const savedChannelName = savedLast?.channel?.name;
    const enabled = Boolean(settings.autoPlayLastChannel);
    return (
      <SubViewContainer title={t('auto_open_last_channel')} onBack={() => setSubView('main')} isRtl={isRtl} backLabel={t('back')}>
        <div className="space-y-3">
          <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 text-xs sm:text-sm text-zinc-300 flex items-center justify-between gap-2">
            <span>{t('auto_open_last_channel_desc')}</span>
            {savedChannelName && (
              <span className="px-2.5 py-1 rounded-xl bg-gold/15 border border-gold/35 text-gold text-xs font-medium shrink-0">
                {savedChannelName}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <TileOptionButton
              title={t('enabled')}
              subtitle={savedChannelName || undefined}
              active={enabled}
              onClick={() => {
                updateSetting('autoPlayLastChannel', true);
                setSubView('main');
              }}
              isRtl={isRtl}
            />
            <TileOptionButton
              title={t('disabled')}
              active={!enabled}
              onClick={() => {
                updateSetting('autoPlayLastChannel', false);
                setSubView('main');
              }}
              isRtl={isRtl}
            />
          </div>
        </div>
      </SubViewContainer>
    );
  }

  // SUBVIEW: MOVIES & SERIES SORT ORDER
  if (subView === 'vod-sort') {
    const currentSort = settings.vodSortBy || 'newest';
    const sortOptions: Array<{ id: VodSortBy; label: string }> = [
      { id: 'newest', label: t('sort_newest') },
      { id: 'oldest', label: t('sort_oldest') },
      { id: 'alpha', label: t('sort_alpha') },
      { id: 'rating', label: t('sort_rating') },
    ];
    return (
      <SubViewContainer title={t('sort_by')} onBack={() => setSubView('main')} isRtl={isRtl} backLabel={t('back')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {sortOptions.map((opt) => (
            <TileOptionButton
              key={opt.id}
              title={opt.label}
              active={currentSort === opt.id}
              onClick={() => {
                updateSetting('vodSortBy', opt.id);
                setSubView('main');
              }}
              isRtl={isRtl}
            />
          ))}
        </div>
      </SubViewContainer>
    );
  }

  // SUBVIEW: POSTER SIZE (Small / Medium / Large)
  if (subView === 'poster-size') {
    const currentSize = settings.posterSize || 'medium';
    const sizeOptions: Array<{ id: PosterSize; label: string; desc: string }> = [
      { id: 'small', label: t('small'), desc: t('posters_5_row') },
      { id: 'medium', label: t('medium'), desc: t('posters_4_row') },
      { id: 'large', label: t('large'), desc: t('posters_3_row') },
    ];
    return (
      <SubViewContainer title={t('poster_size')} onBack={() => setSubView('main')} isRtl={isRtl} backLabel={t('back')}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {sizeOptions.map((opt) => (
            <TileOptionButton
              key={opt.id}
              title={opt.label}
              subtitle={opt.desc}
              active={currentSize === opt.id}
              onClick={() => {
                updateSetting('posterSize', opt.id);
                setSubView('main');
              }}
              isRtl={isRtl}
            />
          ))}
        </div>
      </SubViewContainer>
    );
  }

  // SUBVIEW: POSTER TITLES (Show / Hide)
  if (subView === 'poster-titles') {
    const showing = Boolean(settings.showPosterTitles);
    return (
      <SubViewContainer title={t('poster_titles')} onBack={() => setSubView('main')} isRtl={isRtl} backLabel={t('back')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <TileOptionButton
            title={t('show')}
            subtitle={t('poster_titles_show_desc')}
            active={showing}
            onClick={() => {
              updateSetting('showPosterTitles', true);
              setSubView('main');
            }}
            isRtl={isRtl}
          />
          <TileOptionButton
            title={t('hide')}
            subtitle={t('poster_titles_hide_desc')}
            active={!showing}
            onClick={() => {
              updateSetting('showPosterTitles', false);
              setSubView('main');
            }}
            isRtl={isRtl}
          />
        </div>
      </SubViewContainer>
    );
  }

  // SUBVIEWS: BACKGROUND OPACITY & SEPARATED UI DESIGN OPTIONS (instant auto-save)
  if (DESIGN_SUBVIEW_IDS.has(subView)) {
    return (
      <SubViewContainer
        title={subView === 'background-opacity' ? t('background_opacity') : ''}
        onBack={() => setSubView('main')}
        isRtl={isRtl}
        backLabel={t('back')}
      >
        <DesignSubViewContent
          subView={subView as DesignSubViewId}
          settings={settings}
          onUpdateSettings={onUpdateSettings}
          isRtl={isRtl}
          t={t}
        />
      </SubViewContainer>
    );
  }

  // SUBVIEW: INDEPENDENT PAGE SCALING (each control affects only its own section)
  if (subView === 'settings-scale' || subView === 'live-scale' || subView === 'vod-scale') {
    const scaleConfig = subView === 'settings-scale'
      ? { key: 'settingsScale' as const, current: settings.settingsScale ?? 90, title: t('settings_page_size'), hint: t('settings_scale_hint') }
      : subView === 'live-scale'
      ? { key: 'livePageScale' as const, current: settings.livePageScale ?? 100, title: t('live_page_size'), hint: t('live_scale_hint') }
      : { key: 'vodPageScale' as const, current: settings.vodPageScale ?? 100, title: t('vod_page_size'), hint: t('vod_scale_hint') };
    const scaleValues = [70, 80, 90, 100, 110, 120];
    return (
      <SubViewContainer title={scaleConfig.title} onBack={() => setSubView('main')} isRtl={isRtl} backLabel={t('back')}>
        <div className="space-y-3">
          <p className="text-xs sm:text-sm text-zinc-300">{scaleConfig.hint}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {scaleValues.map(value => (
              <button key={value} data-tv-focusable="true" tabIndex={0}
                onClick={() => updateSetting(scaleConfig.key, value)}
                className={`min-h-[72px] rounded-2xl border flex flex-col items-center justify-center gap-1 transition-colors ${scaleConfig.current === value ? 'border-gold bg-gold/15' : 'border-white/10 bg-white/[0.04] hover:border-gold/40'}`}>
                <span className="text-lg font-mono font-bold text-gold">{value}%</span>
                {scaleConfig.current === value && <Check size={14} className="text-gold" />}
              </button>
            ))}
          </div>
        </div>
      </SubViewContainer>
    );
  }

  // SUBVIEW: LIVE FULLSCREEN BAR SIZE (Current / Full Width / Smaller)
  if (subView === 'live-bar-size') {
    const currentBarSize: LiveBarSize = settings.liveBarSize || 'default';
    const barSizeOptions: Array<{ id: LiveBarSize; label: string; desc: string }> = [
      {
        id: 'default',
        label: t('live_bar_default'),
        desc: t('live_bar_default_desc'),
      },
      {
        id: 'full',
        label: t('live_bar_full'),
        desc: t('live_bar_full_desc'),
      },
      {
        id: 'compact',
        label: t('live_bar_compact'),
        desc: t('live_bar_compact_desc'),
      },
    ];
    return (
      <SubViewContainer title={t('live_bar_size_title')} onBack={() => setSubView('main')} isRtl={isRtl} backLabel={t('back')}>
        <div className="space-y-3">
          <p className="text-xs sm:text-sm text-zinc-300">
            {t('live_bar_size_hint')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {barSizeOptions.map((opt) => (
              <TileOptionButton
                key={opt.id}
                title={opt.label}
                subtitle={opt.desc}
                active={currentBarSize === opt.id}
                onClick={() => {
                  updateSetting('liveBarSize', opt.id);
                  setSubView('main');
                }}
                isRtl={isRtl}
              />
            ))}
          </div>
        </div>
      </SubViewContainer>
    );
  }

  // SUBVIEW: SCREEN ZOOM (8 tiles in 4x2 grid + fine tune)
  if (subView === 'screen-zoom') {
    const currentZoom = settings.zoomScale || 100;
    const zoomPresets = [80, 85, 90, 95, 98, 100, 105, 110];

    return (
      <SubViewContainer title={`${t('screen_zoom')} (${currentZoom}%)`} onBack={() => setSubView('main')} isRtl={isRtl} backLabel={t('back')}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {zoomPresets.map((val) => {
              const isActive = currentZoom === val;
              return (
                <button
                  key={val}
                  data-tv-focusable="true"
                  tabIndex={0}
                  onClick={() => updateSetting('zoomScale', val)}
                  className={`p-3 rounded-2xl border transition-colors flex flex-col items-center justify-center gap-1 min-h-[76px] cursor-pointer ${
                    isActive ? 'border-gold bg-gold/15' : 'border-white/10 bg-white/[0.04] hover:border-gold/40 hover:bg-white/[0.09]'
                  }`}
                >
                  <span className="text-lg font-mono font-medium text-gold">{val}%</span>
                  <span className="text-xs sm:text-sm font-normal text-zinc-200">
                    {val === 100 ? t('zoom_default_95') : val === 98 ? t('zoom_tv_fit') : `${val}%`}
                  </span>
                  {isActive && <Check className="text-gold mt-0.5" size={14} />}
                </button>
              );
            })}
          </div>

          <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-wrap items-center justify-between gap-2.5">
            <span className="text-sm font-medium text-zinc-200">
              {t('fine_tuning')}
            </span>
            <div className="flex items-center gap-2.5">
              <button
                data-tv-focusable="true"
                tabIndex={0}
                onClick={() => updateSetting('zoomScale', Math.max(70, currentZoom - 1))}
                className="px-4 py-2 bg-white/10 hover:bg-gold hover:text-black text-white rounded-xl text-sm font-medium transition-colors cursor-pointer"
              >
                - 1%
              </button>
              <span className="text-base font-mono font-medium text-gold px-2">{currentZoom}%</span>
              <button
                data-tv-focusable="true"
                tabIndex={0}
                onClick={() => updateSetting('zoomScale', Math.min(150, currentZoom + 1))}
                className="px-4 py-2 bg-white/10 hover:bg-gold hover:text-black text-white rounded-xl text-sm font-medium transition-colors cursor-pointer"
              >
                + 1%
              </button>
              <button
                data-tv-focusable="true"
                tabIndex={0}
                onClick={() => setSubView('main')}
                className="px-5 py-2 bg-gold text-black rounded-xl text-sm font-medium cursor-pointer"
              >
                {t('done')}
              </button>
            </div>
          </div>
        </div>
      </SubViewContainer>
    );
  }

  // SUBVIEW: PLAYERS (Clean sub-tabs so all fit on 1 TV screen in 4-5 tiles/row)
  if (subView === 'players') {
    const internalEngines = [
      { id: 'LibVLC (محرك VLC المدمج الداخلي)', name: t('engine_libvlc_name'), desc: t('engine_libvlc_desc') },
      { id: 'ExoPlayer', name: 'ExoPlayer / Media3', desc: t('engine_exo_desc') },
      { id: 'Achour Player (مدمج - Native)', name: 'Achour 4K Native', desc: t('engine_achour_desc') },
      { id: 'IJK Player', name: 'FFmpeg / IJK', desc: t('engine_ijk_desc') },
      { id: 'MPV Player', name: 'MPV Bitrate', desc: t('engine_mpv_desc') },
    ];
    const externalApps = EXTERNAL_PLAYER_PROFILES;
    const customList = (settings.externalPlayers || []).filter(p => !DEFAULT_PLAYERS.includes(p));
    const onFireTv = isFireTVDevice();

    return (
      <SubViewContainer title={t('players_title')} onBack={() => setSubView('main')} isRtl={isRtl} backLabel={t('back')}>
        <div className="space-y-3">
          <div className={`flex items-center gap-2 bg-white/[0.04] p-1 rounded-2xl border border-white/10 ${isRtl ? 'flex-row-reverse' : ''}`}>
            {[
              { id: 'internal', label: t('players_tab_internal') },
              { id: 'external', label: t('players_tab_external') },
              { id: 'custom', label: t('players_tab_custom', { count: customList.length }) },
            ].map((tab) => (
              <button
                key={tab.id}
                data-tv-focusable="true"
                tabIndex={0}
                onClick={() => setPlayersTab(tab.id as any)}
                className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                  playersTab === tab.id ? 'bg-gold text-black' : 'text-zinc-300 hover:bg-white/5'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {playersTab === 'internal' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {internalEngines.map((p) => {
                const isActive = !settings.useExternalPlayer && settings.selectedPlayer === p.id;
                return (
                  <button
                    key={p.id}
                    data-tv-focusable="true"
                    tabIndex={0}
                    onClick={() => {
                      onUpdateSettings(prev => ({ ...prev, useExternalPlayer: false, selectedPlayer: p.id }));
                      setSubView('main');
                    }}
                    className={`p-3.5 rounded-2xl border transition-colors flex flex-col justify-between min-h-[96px] cursor-pointer ${
                      isActive ? 'border-gold bg-gold/15' : 'border-white/10 bg-white/[0.04] hover:border-gold/40 hover:bg-white/[0.09]'
                    } ${isRtl ? 'text-right' : 'text-left'}`}
                  >
                    <div className="flex items-start justify-between gap-2 w-full">
                      <span className="text-sm sm:text-base font-medium text-white leading-snug">{p.name}</span>
                      {isActive && <Check className="text-gold shrink-0" size={16} />}
                    </div>
                    <p className="text-xs text-zinc-400 font-normal mt-1.5 line-clamp-2">{p.desc}</p>
                  </button>
                );
              })}
            </div>
          )}

          {playersTab === 'external' && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                {externalApps.map((p) => {
                  const isActive =
                    settings.useExternalPlayer &&
                    (settings.selectedPlayer === p.id || Boolean(p.aliases?.includes(settings.selectedPlayer)));
                  const installStatus = externalInstallMap[p.id];
                  const showFireTvWarn = !p.fireTvCompatible;
                  return (
                    <button
                      key={p.id}
                      data-tv-focusable="true"
                      tabIndex={0}
                      onClick={() => {
                        onUpdateSettings(prev => ({ ...prev, useExternalPlayer: true, selectedPlayer: p.id }));
                        setSubView('main');
                      }}
                      className={`p-3.5 rounded-2xl border transition-colors flex flex-col justify-between min-h-[112px] cursor-pointer ${
                        isActive ? 'border-gold bg-gold/15' : 'border-white/10 bg-white/[0.04] hover:border-gold/40 hover:bg-white/[0.09]'
                      } ${isRtl ? 'text-right' : 'text-left'}`}
                    >
                      <div className="flex items-start justify-between gap-2 w-full">
                        <span className="text-sm sm:text-base font-medium text-white leading-snug">{p.name}</span>
                        {isActive && <Check className="text-gold shrink-0" size={16} />}
                      </div>
                      <div className="mt-1.5 space-y-1">
                        <span className="text-[11px] font-mono text-zinc-400 truncate block">{p.packageName}</span>
                        <div className="flex flex-wrap items-center gap-1">
                          {installStatus === true && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold">
                              {t('installed_badge')}
                            </span>
                          )}
                          {installStatus === false && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-bold">
                              {t('not_installed_badge')}
                            </span>
                          )}
                          {showFireTvWarn && (
                            <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold flex items-center gap-1 ${
                              onFireTv
                                ? 'bg-amber-500/25 border-amber-400/60 text-amber-200'
                                : 'bg-amber-500/15 border-amber-500/35 text-amber-300'
                            }`}>
                              <AlertTriangle size={10} />
                              {t('phone_only_badge')}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-zinc-400 px-1">
                {t('external_players_note')}
              </p>
            </div>
          )}

          {playersTab === 'custom' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-white/[0.04] p-3.5 rounded-2xl border border-white/10">
                <input
                  type="text"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  placeholder={t('player_name_placeholder')}
                  className="bg-white/[0.05] border border-white/15 rounded-xl px-3.5 py-2 text-sm text-white"
                />
                <input
                  type="text"
                  value={newPlayerPackage}
                  onChange={(e) => setNewPlayerPackage(e.target.value)}
                  placeholder={t('package_id_placeholder')}
                  className="bg-white/[0.05] border border-white/15 rounded-xl px-3.5 py-2 text-sm font-mono text-white"
                />
                <button
                  data-tv-focusable="true"
                  tabIndex={0}
                  onClick={handleAddPlayer}
                  className="px-4 py-2 bg-gold text-black rounded-xl text-sm font-medium cursor-pointer"
                >
                  {t('add_player')}
                </button>
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              {customList.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
                  {customList.map((name) => {
                    const isActive = settings.useExternalPlayer && settings.selectedPlayer === name;
                    return (
                      <div key={name} className="flex flex-col gap-1.5">
                        <button
                          data-tv-focusable="true"
                          tabIndex={0}
                          onClick={() => {
                            updateSetting('useExternalPlayer', true);
                            handlePlayerSelect(name);
                          }}
                          className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer ${
                            isActive ? 'border-gold bg-gold/15' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.09]'
                          }`}
                        >
                          <span className="text-sm font-medium text-white truncate">{name}</span>
                          {isActive && <Check className="text-gold shrink-0" size={16} />}
                        </button>
                        <button
                          data-tv-focusable="true"
                          tabIndex={0}
                          onClick={(e) => handleDeletePlayer(e, name)}
                          className="py-1.5 rounded-xl bg-red-500/15 text-red-300 text-xs font-medium cursor-pointer"
                        >
                          {t('delete_label')}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </SubViewContainer>
    );
  }



  // SUBVIEW: APP BACKGROUNDS (46 Static Natural Wallpapers — paginated 15/page for instant Fire TV rendering)
  if (subView === 'backgrounds') {
    const BG_PAGE_SIZE = 15;
    const totalBgPages = Math.max(1, Math.ceil(APP_BACKGROUNDS.length / BG_PAGE_SIZE));
    const safeBgPage = Math.max(0, Math.min(bgPage, totalBgPages - 1));
    const pagedBackgrounds = APP_BACKGROUNDS.slice(
      safeBgPage * BG_PAGE_SIZE,
      (safeBgPage + 1) * BG_PAGE_SIZE
    );

    return (
      <SubViewContainer title={`${t('app_backgrounds')} (${APP_BACKGROUNDS.length})`} onBack={() => setSubView('main')} isRtl={isRtl} backLabel={t('back')}>
        <div className="flex flex-col gap-3 pb-4">
          {totalBgPages > 1 && (
            <div className={`flex items-center justify-between gap-2 bg-white/[0.04] px-3 py-2 rounded-2xl border border-white/10 shrink-0 ${isRtl ? 'flex-row-reverse' : ''}`}>
              <span className="text-xs sm:text-sm font-medium text-zinc-300">
                {t('bg_page_info', { page: safeBgPage + 1, total: totalBgPages, count: APP_BACKGROUNDS.length })}
              </span>
              <div className={`flex items-center gap-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                <button
                  type="button"
                  data-tv-focusable="true"
                  tabIndex={0}
                  disabled={safeBgPage <= 0}
                  onClick={() => setBgPage((p) => Math.max(0, p - 1))}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-gold hover:text-black disabled:opacity-35 text-white text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
                >
                  {isRtl ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
                  <span>{t('prev_label')}</span>
                </button>
                <button
                  type="button"
                  data-tv-focusable="true"
                  tabIndex={0}
                  disabled={safeBgPage >= totalBgPages - 1}
                  onClick={() => setBgPage((p) => Math.min(totalBgPages - 1, p + 1))}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-gold hover:text-black disabled:opacity-35 text-white text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span>{t('next_label')}</span>
                  {isRtl ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
            {pagedBackgrounds.map((bg) => {
              const isActive = !settings.customBackground && (settings.backgroundStyle || 'bg-raouche-rocks-beirut') === bg.id;
              return (
                <button
                  key={bg.id}
                  data-tv-focusable="true"
                  tabIndex={0}
                  onClick={() => handleSelectBackground(bg.id)}
                  className={`achour-perf-grid-item p-2.5 rounded-2xl border transition-colors duration-100 flex flex-col justify-between cursor-pointer ${
                    isActive ? 'border-gold bg-gold/15' : 'border-white/10 bg-white/[0.04] hover:border-gold/40 hover:bg-white/[0.09]'
                  } ${isRtl ? 'text-right' : 'text-left'}`}
                >
                  <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-white/20 bg-black">
                    {bg.imageUrl && (
                      <img
                        src={bg.imageUrl}
                        alt={bg.nameEn}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                        style={{ background: bg.previewGradient || bg.previewColor }}
                      />
                    )}
                    <div className="absolute inset-0 bg-black/25 pointer-events-none" />
                    {isActive && (
                      <span className="absolute top-1.5 right-1.5 p-1 rounded-full bg-gold text-black shadow">
                        <Check size={12} />
                      </span>
                    )}
                  </div>
                  <h3 className="text-xs sm:text-sm font-medium text-white truncate mt-2">
                    {settings.language === 'ar' ? bg.nameAr : bg.nameEn}
                  </h3>
                </button>
              );
            })}
          </div>
        </div>
      </SubViewContainer>
    );
  }



  // SUBVIEWS: CATEGORY MANAGEMENT (Paginated 48/page to prevent 1000+ DOM node lag on Fire TV)
  if (subView.startsWith('categories-')) {
    const type = subView.split('-')[1] as 'live' | 'movie' | 'series';
    const titleKey = type === 'live' ? 'hide_live_categories' : type === 'movie' ? 'hide_movie_categories' : 'hide_series_categories';
    let hiddenList = settings.hiddenLiveCategories || [];
    if (type === 'movie') hiddenList = settings.hiddenMovieCategories || [];
    if (type === 'series') hiddenList = settings.hiddenSeriesCategories || [];
    const hiddenCountInThisView = categories.filter(c => hiddenList.includes(c.category_id) || hiddenList.includes(c.category_name)).length;
    const visibleCountInThisView = categories.length - hiddenCountInThisView;

    const CAT_PAGE_SIZE = 48;
    const totalCatPages = Math.max(1, Math.ceil(filteredCategories.length / CAT_PAGE_SIZE));
    const safeCatPage = Math.max(0, Math.min(catPage, totalCatPages - 1));
    const pagedCategories = filteredCategories.slice(
      safeCatPage * CAT_PAGE_SIZE,
      (safeCatPage + 1) * CAT_PAGE_SIZE
    );

    return (
      <SubViewContainer title={t(titleKey)} onBack={() => setSubView('main')} isRtl={isRtl} backLabel={t('back')}>
        <div className="flex flex-col gap-3 pb-4">
          <div className={`flex flex-wrap items-center justify-between gap-2 bg-white/[0.04] p-2 rounded-2xl border border-white/10 shrink-0 ${isRtl ? 'flex-row-reverse' : ''}`}>
            <div className="relative flex-1 min-w-[160px]">
              <Search className={`absolute top-1/2 -translate-y-1/2 text-zinc-400 ${isRtl ? 'right-3' : 'left-3'}`} size={15} />
              <input
                type="text"
                value={catSearch}
                onChange={(e) => setCatSearch(e.target.value)}
                placeholder={t('search_categories')}
                className={`w-full bg-white/[0.05] border border-white/15 rounded-xl py-1.5 text-sm text-white ${isRtl ? 'pr-9 pl-3 text-right' : 'pl-9 pr-3 text-left'}`}
              />
            </div>

            <div className={`flex items-center gap-1.5 ${isRtl ? 'flex-row-reverse' : ''}`}>
              <button
                data-tv-focusable="true"
                tabIndex={0}
                onClick={() => setCatFilterTab('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer ${catFilterTab === 'all' ? 'bg-gold text-black' : 'bg-white/5 text-zinc-300'}`}
              >
                {t('cat_all_count', { count: categories.length })}
              </button>
              <button
                data-tv-focusable="true"
                tabIndex={0}
                onClick={() => setCatFilterTab('visible')}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer ${catFilterTab === 'visible' ? 'bg-emerald-500 text-white' : 'bg-white/5 text-zinc-300'}`}
              >
                {t('cat_visible_count', { count: visibleCountInThisView })}
              </button>
              <button
                data-tv-focusable="true"
                tabIndex={0}
                onClick={() => setCatFilterTab('hidden')}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer ${catFilterTab === 'hidden' ? 'bg-red-500 text-white' : 'bg-white/5 text-zinc-300'}`}
              >
                {t('cat_hidden_count', { count: hiddenCountInThisView })}
              </button>
            </div>

            <div className={`flex items-center gap-1.5 ${isRtl ? 'flex-row-reverse' : ''}`}>
              <button
                data-tv-focusable="true"
                tabIndex={0}
                onClick={showAllVisibleCategories}
                className="px-3 py-1.5 bg-white/10 hover:bg-gold hover:text-black text-white text-xs font-medium rounded-xl cursor-pointer"
              >
                {t('show_all')}
              </button>
              <button
                data-tv-focusable="true"
                tabIndex={0}
                onClick={hideAllVisibleCategories}
                className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500 text-red-200 text-xs font-medium rounded-xl cursor-pointer"
              >
                {t('hide_all')}
              </button>
              <button
                data-tv-focusable="true"
                tabIndex={0}
                onClick={() => {
                  if (type === 'movie') updateSetting('hiddenMovieCategories', []);
                  else if (type === 'series') updateSetting('hiddenSeriesCategories', []);
                  else updateSetting('hiddenLiveCategories', []);
                }}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/15 text-zinc-300 text-xs font-medium rounded-xl cursor-pointer"
              >
                {t('cat_reset')}
              </button>
            </div>
          </div>

          {totalCatPages > 1 && (
            <div className={`flex items-center justify-between gap-2 bg-white/[0.04] px-3 py-1.5 rounded-2xl border border-white/10 shrink-0 ${isRtl ? 'flex-row-reverse' : ''}`}>
              <span className="text-xs font-medium text-zinc-300">
                {t('cat_page_info', { page: safeCatPage + 1, total: totalCatPages, count: filteredCategories.length })}
              </span>
              <div className={`flex items-center gap-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                <button
                  type="button"
                  data-tv-focusable="true"
                  tabIndex={0}
                  disabled={safeCatPage <= 0}
                  onClick={() => setCatPage((p) => Math.max(0, p - 1))}
                  className="px-3 py-1 rounded-xl bg-white/10 hover:bg-gold hover:text-black disabled:opacity-35 text-white text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
                >
                  {isRtl ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                  <span>{t('prev_label')}</span>
                </button>
                <button
                  type="button"
                  data-tv-focusable="true"
                  tabIndex={0}
                  disabled={safeCatPage >= totalCatPages - 1}
                  onClick={() => setCatPage((p) => Math.min(totalCatPages - 1, p + 1))}
                  className="px-3 py-1 rounded-xl bg-white/10 hover:bg-gold hover:text-black disabled:opacity-35 text-white text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span>{t('next_label')}</span>
                  {isRtl ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {catLoading ? (
              <div className="col-span-full py-10 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                <span className="text-zinc-300 text-sm">{t('loading')}</span>
              </div>
            ) : filteredCategories.length === 0 ? (
              <div className="col-span-full py-10 text-center rounded-2xl border border-white/10 bg-white/[0.04]">
                <EyeOff className="mx-auto text-zinc-600 mb-2" size={28} />
                <p className="text-zinc-300 text-sm">{t('no_channels')}</p>
              </div>
            ) : (
              pagedCategories.map((cat, idx) => {
                const isHidden = hiddenList.includes(cat.category_id) || hiddenList.includes(cat.category_name);
                return (
                  <button
                    key={`${cat.category_id}-${safeCatPage}-${idx}`}
                    data-tv-focusable="true"
                    tabIndex={0}
                    onClick={() => toggleCategoryVisibility(cat.category_id)}
                    className={`achour-perf-grid-item flex items-center justify-between p-2.5 rounded-2xl transition-colors duration-100 border min-h-[60px] cursor-pointer ${
                      isHidden
                        ? 'border-red-500/45 bg-red-950/30'
                        : 'border-white/10 bg-white/[0.04] hover:border-gold/40 hover:bg-white/[0.09]'
                    } ${isRtl ? 'flex-row-reverse text-right' : 'text-left'}`}
                  >
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className={`text-xs sm:text-sm font-medium truncate ${isHidden ? 'text-zinc-400 line-through' : 'text-white'}`}>
                        {cat.category_name}
                      </span>
                      <span className={`text-[11px] mt-0.5 ${isHidden ? 'text-red-400' : 'text-emerald-400'}`}>
                        {isHidden ? t('hidden') : t('visible')}
                      </span>
                    </div>
                    <div className={`p-1.5 rounded-xl shrink-0 ${isHidden ? 'bg-red-500/20 text-red-400' : 'bg-gold/15 text-gold'}`}>
                      {isHidden ? <EyeOff size={15} /> : <Eye size={15} />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </SubViewContainer>
    );
  }

  // MAIN SETTINGS VIEW — Clean 5-tiles-per-row TV Grid fitting single screen comfortably
  return (
    <div className={`h-full w-full bg-transparent flex flex-col items-center p-2.5 sm:p-4 select-none overflow-hidden relative z-10 ${isRtl ? 'font-cairo' : 'font-sans'}`}>
      <input
        type="file"
        ref={channelFileInputRef}
        className="hidden"
        accept=".m3u,.m3u8,.txt"
        onChange={handleChannelFileUploadInSettings}
      />

      {/* Compact Header */}
      <header className="w-full max-w-6xl flex items-center justify-between mb-2.5 bg-transparent px-3 py-2 border-b border-white/10 shrink-0">
        <button
          data-tv-focusable="false"
          data-tv-back-btn="true"
          tabIndex={-1}
          onClick={onBack}
          className="p-2 bg-white/10 hover:bg-gold hover:text-black rounded-xl text-white transition-colors cursor-pointer flex items-center justify-center"
          title={t('back')}
        >
          <ChevronLeft size={20} className={isRtl ? 'rotate-180' : ''} />
        </button>
        <div className="flex flex-col items-center">
          <h1 className="text-base sm:text-lg font-medium text-gold leading-tight">{t('settings')}</h1>
          <span className="text-xs text-zinc-400 font-normal">{t('settings_subtitle')}</span>
        </div>
        <div className="w-10" />
      </header>

      {/* Main Content Fitting Cleanly Inside Single TV Viewport */}
      <div ref={mainScrollContainerRef} data-tv-scroll-container="true" className="w-full max-w-6xl flex-1 flex flex-col justify-between overflow-y-auto no-scrollbar">
        <div className="space-y-2.5">
          {historyClearSuccess && (
            <div className="px-4 py-1.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 rounded-xl text-sm font-medium">
              {t('history_cleared_success')}
            </div>
          )}

          {syncNotification && (
            <div className="px-4 py-1.5 bg-white/[0.05] border border-gold/40 text-gold rounded-xl text-sm font-medium flex items-center gap-2">
              <RefreshCw size={16} className={syncInProgress ? 'animate-spin' : ''} />
              <span>{syncNotification}</span>
            </div>
          )}

          {/* Top Category Management Strip ONLY (Series, Movies, Live) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { view: 'categories-series' as const, icon: Clapperboard, title: t('hide_series_categories') },
              { view: 'categories-movie' as const, icon: Film, title: t('hide_movie_categories') },
              { view: 'categories-live' as const, icon: EyeOff, title: t('hide_live_categories') },
            ].map((catCard) => {
              const Icon = catCard.icon;
              const tileId = `cat:${catCard.view}`;
              return (
                <button
                  key={catCard.view}
                  data-tv-focusable="true"
                  data-settings-tile-id={tileId}
                  tabIndex={0}
                  onClick={() => navigateToSubView(catCard.view, tileId)}
                  className={`px-3.5 py-2.5 bg-white/[0.04] hover:bg-white/[0.09] rounded-2xl border border-white/10 hover:border-gold/50 flex items-center justify-between transition-colors duration-100 cursor-pointer ${isRtl ? 'flex-row-reverse text-right' : 'text-left'}`}
                >
                  <div className={`flex items-center gap-2.5 min-w-0 ${isRtl ? 'flex-row-reverse' : ''}`}>
                    <div className="p-1.5 rounded-xl bg-gold/15 text-gold shrink-0">
                      <Icon size={17} />
                    </div>
                    <span className="text-xs sm:text-sm font-medium text-white truncate">{catCard.title}</span>
                  </div>
                  <ChevronLeft size={16} className={`${isRtl ? '' : 'rotate-180'} text-gold shrink-0`} />
                </button>
              );
            })}
          </div>

          {/* Grouped Settings Sections */}
          <div className="space-y-4 pb-3">
            {settingsGroups.map((group, gIdx) => (
              <div key={gIdx} className="space-y-2">
                <h3 className="text-xs sm:text-sm font-black text-gold uppercase tracking-wider px-1">
                  {group.title}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                  {group.items.map((item, idx) => {
                    const Icon = item.icon;
                    const tileId = `item:${gIdx}:${idx}`;
                    return (
                      <button
                        key={idx}
                        data-tv-focusable="true"
                        data-settings-tile-id={tileId}
                        tabIndex={0}
                        onClick={() => {
                          captureMainState(tileId);
                          item.action();
                        }}
                        className="flex flex-col items-center justify-center p-3 bg-white/[0.04] hover:bg-white/[0.09] rounded-2xl border border-white/10 hover:border-gold/50 transition-colors duration-100 group h-[84px] sm:h-[90px] text-center cursor-pointer gap-2"
                      >
                        <div className="p-1.5 rounded-xl bg-gold/15 text-gold group-hover:bg-gold group-hover:text-black transition-colors shrink-0">
                          <Icon size={17} />
                        </div>
                        <div className="w-full min-w-0">
                          <span className="text-xs sm:text-sm font-medium text-white group-hover:text-gold truncate w-full leading-snug block">
                            {item.label}
                          </span>
                          {item.subLabel && (
                            <span className="text-[10px] text-zinc-400 truncate w-full leading-none block mt-0.5">
                              {item.subLabel}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Minimal Device Footer */}
        <footer className="pt-1.5 pb-1 flex items-center justify-center gap-6 text-xs font-mono text-zinc-400 shrink-0">
          <span>MAC: <strong className="text-zinc-200 font-normal">6A:CD:C2:93:2F:D5</strong></span>
          <span>{t('device_key')}: <strong className="text-gold font-normal">411480</strong></span>
        </footer>
      </div>

      {/* In-App Confirmation Dialog for Clearing Individual Watch History */}
      {confirmClearType && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 achour-modal-backdrop select-none"
          onPointerDown={(e) => { modalBackdropDownRef.current = e.target === e.currentTarget; }}
          onClick={(e) => {
            if (isSafeBackdropClick(e, modalOpenedAtRef.current, modalBackdropDownRef.current)) setConfirmClearType(null);
            modalBackdropDownRef.current = false;
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            data-tv-modal="confirm-clear"
            data-achour-window-cat="confirm"
            onClick={(e) => e.stopPropagation()}
            className={`w-[min(92vw,580px)] max-h-[84vh] achour-glass-modal border border-gold/45 rounded-3xl p-4 sm:p-5 flex flex-col gap-3.5 ${isRtl ? 'font-cairo text-right' : 'text-left'}`}
          >
            <div className={`flex items-center justify-between pb-2.5 border-b border-white/10 ${isRtl ? 'flex-row-reverse' : ''}`}>
              <div className={`flex items-center gap-2.5 ${isRtl ? 'flex-row-reverse' : ''}`}>
                <div className="p-2 rounded-xl bg-red-500/20 text-red-400">
                  <Trash2 size={18} />
                </div>
                <h3 className="text-base font-semibold text-white">
                  {t('clear_history_confirm_title')}
                </h3>
              </div>
              <button
                data-tv-focusable="true"
                data-tv-modal="confirm-clear"
                tabIndex={0}
                onClick={() => setConfirmClearType(null)}
                className="p-1.5 text-zinc-300 hover:text-white rounded-full cursor-pointer shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-zinc-200 leading-relaxed">
              {confirmClearType === 'movie'
                ? t('clear_movie_history_confirm')
                : confirmClearType === 'series'
                ? t('clear_series_history_confirm')
                : t('clear_channel_history_confirm')}
            </p>

            <div className={`flex items-center justify-end gap-2.5 pt-1 ${isRtl ? 'flex-row-reverse' : ''}`}>
              <button
                data-tv-focusable="true"
                data-tv-modal="confirm-clear"
                tabIndex={0}
                onClick={() => setConfirmClearType(null)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                data-tv-focusable="true"
                data-tv-modal="confirm-clear"
                tabIndex={0}
                onClick={handleConfirmClearWatchHistory}
                className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-semibold cursor-pointer"
              >
                {t('confirm_clear')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showUploadPasteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 achour-modal-backdrop select-none"
          onPointerDown={(e) => { modalBackdropDownRef.current = e.target === e.currentTarget; }}
          onClick={(e) => {
            if (isSafeBackdropClick(e, modalOpenedAtRef.current, modalBackdropDownRef.current)) setShowUploadPasteModal(false);
            modalBackdropDownRef.current = false;
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            data-tv-modal="true"
            data-achour-window-cat="settings"
            onClick={(e) => e.stopPropagation()}
            className={`w-[min(92vw,640px)] max-h-[84vh] achour-glass-modal border border-gold/45 rounded-3xl p-4 sm:p-5 flex flex-col gap-3 ${isRtl ? 'font-cairo text-right' : 'text-left'}`}
          >
            <div className={`flex items-center justify-between pb-2.5 border-b border-white/10 ${isRtl ? 'flex-row-reverse' : ''}`}>
              <h3 className="text-base font-medium text-white">
                {t('upload_paste_m3u')}
              </h3>
              <button data-tv-focusable="true" tabIndex={0} onClick={() => setShowUploadPasteModal(false)} className="p-2 text-zinc-300 hover:text-white rounded-full cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
              <input
                type="text"
                value={pastedM3uName}
                onChange={(e) => setPastedM3uName(e.target.value)}
                placeholder={t('playlist_name_optional')}
                className="w-full bg-white/5 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white"
              />
              <textarea
                value={pastedM3uText}
                onChange={(e) => setPastedM3uText(e.target.value)}
                rows={4}
                className="sm:col-span-2 w-full bg-white/[0.05] border border-white/15 rounded-2xl p-3 text-sm font-mono text-gold"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button data-tv-focusable="true" tabIndex={0} onClick={() => setShowUploadPasteModal(false)} className="px-4 py-2 bg-white/10 text-white rounded-xl text-sm font-medium cursor-pointer">
                {t('cancel')}
              </button>
              <button
                data-tv-focusable="true"
                tabIndex={0}
                onClick={() => saveAndActivateM3uContent(pastedM3uName.trim() || 'ملف_قنوات_مباشر.m3u', pastedM3uText)}
                disabled={!pastedM3uText.trim()}
                className="px-5 py-2 bg-gold text-black rounded-xl text-sm font-medium disabled:opacity-40 cursor-pointer"
              >
                {t('save_and_activate')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SubViewContainer({ title: _title, onBack, children, isRtl, backLabel }: { title: string; onBack: () => void; children: React.ReactNode; isRtl: boolean; backLabel?: string }) {
  return (
    <div className={`h-full w-full bg-transparent px-3 py-2 flex flex-col items-center select-none overflow-hidden relative z-10 ${isRtl ? 'font-cairo' : 'font-sans'}`}>
      <header className="w-full max-w-6xl flex items-center justify-between mb-2 shrink-0 bg-transparent px-3 py-1.5 border-b border-white/10">
        <button
          data-tv-focusable="false"
          tabIndex={-1}
          onClick={onBack}
          className="p-2 bg-white/10 hover:bg-gold hover:text-black rounded-lg text-white transition-colors cursor-pointer flex items-center justify-center"
          title={backLabel || 'Back'}
        >
          <ChevronLeft size={18} className={isRtl ? 'rotate-180' : ''} />
        </button>
        <div className="w-8" />
      </header>
      <div data-tv-scroll-container="true" className="w-full max-w-6xl flex-1 min-h-0 overflow-y-auto no-scrollbar pb-1">
        {children}
      </div>
    </div>
  );
}

function TileOptionButton({
  title,
  subtitle,
  active,
  onClick,
  isRtl
}: {
  title: string;
  subtitle?: string;
  active: boolean;
  onClick: () => void;
  isRtl: boolean;
}) {
  return (
    <button
      data-tv-focusable="true"
      tabIndex={0}
      onClick={onClick}
      className={`w-full flex flex-col justify-between p-3 rounded-2xl transition-colors border min-h-[82px] cursor-pointer ${
        active
          ? 'border-gold bg-gold/15'
          : 'border-white/10 bg-white/[0.04] hover:border-gold/40 hover:bg-white/[0.09]'
      } ${isRtl ? 'text-right' : 'text-left'}`}
    >
      <div className="flex items-start justify-between gap-2 w-full">
        <span className="text-xs sm:text-sm font-medium text-white leading-snug">{title}</span>
        {active && (
          <span className="p-1 rounded-lg bg-gold text-black shrink-0">
            <Check size={14} />
          </span>
        )}
      </div>
      {subtitle && (
        <span className="text-xs font-normal text-zinc-400 mt-1.5 block truncate w-full">
          {subtitle}
        </span>
      )}
    </button>
  );
}
