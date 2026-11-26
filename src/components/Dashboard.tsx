// @ts-nocheck
// Achour Player Dashboard (src/components/Dashboard.tsx)
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Settings, RefreshCcw, LogOut, Plus, Tv, AlertCircle, CheckCircle2, 
  Clock, Upload, FolderPlus, Copy, Eye, Globe, Server, FileText, Check, X, Star,
  Film, Clapperboard, Calendar, ShieldCheck, AlertTriangle, Sparkles, ArrowUpDown, Move
} from 'lucide-react';
import PlaylistManager from './PlaylistManager';
import LivePlayer from './LivePlayer';
import SettingsView from './SettingsView';
import AddPlaylistModal from './AddPlaylistModal';
import { AppSettings, Channel, Playlist } from '../types';
import { useI18n, formatExtractionProgressMessage } from '../utils/i18n';
import { collection, query, where, getDocs, doc, getDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { ICON_3D_STYLES } from '../utils/themeManager';
import { syncFavoritesFromFirestore } from '../utils/favoritesService';
import { ExtractionService, ExtractionProgress } from '../utils/extractionService';
import { initDB, getPlaylistExtractionStatus } from '../lib/db';
import { parseExpiryDate, fetchLiveSubscriptionExpiry } from '../utils/subscription';
import { navigateSpatial, parseTVKeyEvent, ensureInitialFocus, pushBackHandler, BackPriority, getCurrentTVFocus, setTVFocus, markLongPressModalOpened, isLongPressModalGraceActive, isSafeBackdropClick } from '../utils/tvNavigation';
import { getLastWatchedChannel } from '../utils/watchHistoryService';
import ExitConfirmModal from './ExitConfirmModal';
import ExtractionProgressModal from './ExtractionProgressModal';
import DashboardLayouts, { IconKind } from './DashboardLayouts';
import { isMobileDevice, isTVDevice } from '../utils/platform';
import { isFireTVDevice } from '../utils/players';

interface DashboardProps {
  userId: string;
  settings: AppSettings;
  onUpdateSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  onTriggerSplash?: () => void;
  startupSplashComplete?: boolean;
}

type View = 'home' | 'live' | 'movies' | 'series' | 'sports' | 'settings' | 'add';



// Separate Clock component to prevent full Dashboard re-renders every second
const ClockDisplay = React.memo(({ settings, isRtl }: { settings: AppSettings, isRtl: boolean }) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedClock = React.useMemo(() => {
    const options: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      hour12: settings.timeFormat === '12h',
    };
    return currentTime.toLocaleTimeString(settings.language === 'ar' ? 'ar-EG' : settings.language, options);
  }, [currentTime, settings.timeFormat, settings.language]);

  const formattedDate = React.useMemo(() => {
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };
    return currentTime.toLocaleDateString(settings.language === 'ar' ? 'ar-EG' : settings.language, options);
  }, [currentTime, settings.language]);

  return (
    <div className="achour-header-glass-card rounded-2xl px-3 sm:px-4 py-2 flex flex-col items-end text-right min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <Clock
          size={18}
          stroke="url(#achour-ui-twotone)"
          className="shrink-0 hidden sm:block drop-shadow-[0_0_8px_var(--theme-glow)]"
          style={{ color: 'var(--theme-split-color, #d4af37)' }}
        />
        <span className="text-lg sm:text-2xl md:text-3xl font-semibold font-sans tabular-nums achour-glossy-title tracking-wider leading-none">
          {formattedClock}
        </span>
      </div>
      <span className="text-[10px] sm:text-xs font-semibold font-sans achour-glossy-title capitalize mt-1 tracking-tight max-w-full truncate inline-block">
        {formattedDate}
      </span>
    </div>
  );
});




export default function Dashboard({ userId, settings, onUpdateSettings, onTriggerSplash, startupSplashComplete = true }: DashboardProps) {
  const [currentView, setCurrentView] = useState<View>('home');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [showRepositionModal, setShowRepositionModal] = useState(false);
  const [repositionFocusKind, setRepositionFocusKind] = useState<IconKind | null>(null);
  const repositionBodyRef = useRef<HTMLDivElement | null>(null);
  const repositionOpenedAtRef = useRef(0);
  const repositionBackdropDownRef = useRef(false);
  const isFireOrTvDevice = React.useMemo(() => (isTVDevice() || isFireTVDevice()) && !isMobileDevice(), []);
  const [reorderingKind, setReorderingKind] = useState<IconKind | null>(null);
  const reorderBackupRef = useRef<{
    dashboardOrder?: string[];
    dashboardAlignment?: AppSettings['dashboardAlignment'];
    dashboardHorizontalAlignment?: AppSettings['dashboardHorizontalAlignment'];
  } | null>(null);
  const selectHoldTimerRef = useRef<NodeJS.Timeout | null>(null);
  const selectHoldTriggeredRef = useRef(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchLongPressHandledRef = useRef(false);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const settingsRef = useRef<AppSettings>(settings);
  settingsRef.current = settings;
  const openRepositionModal = React.useCallback((kind: IconKind) => {
    repositionOpenedAtRef.current = Date.now();
    repositionBackdropDownRef.current = false;
    markLongPressModalOpened(700);
    setRepositionFocusKind(kind);
    setShowRepositionModal(true);
  }, []);
  const [activePlaylistData, setActivePlaylistData] = useState<Playlist | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshToast, setRefreshToast] = useState(false);
  const [activePlaylistName, setActivePlaylistName] = useState<string>('');
  const [autoStartChannel, setAutoStartChannel] = useState<any>(null);
  const startupAutoOpenCheckedRef = useRef(false);
  
  // Extraction State
  const [extractionProgress, setExtractionProgress] = useState<ExtractionProgress | null>(null);
  const [pausedExtraction, setPausedExtraction] = useState<ExtractionProgress | null>(null);
  const [showExtractionModal, setShowExtractionModal] = useState(false);
  const dismissedExtractionRef = useRef<Set<string>>(new Set());

  const active3DStyle = React.useMemo(() => {
    return ICON_3D_STYLES.find(s => s.id === (settings.icon3DStyle || 'style-gold-3d')) || ICON_3D_STYLES[0];
  }, [settings.icon3DStyle]);

  const { t, isRtl } = useI18n(settings.language);

  useEffect(() => {
    if (!startupSplashComplete || startupAutoOpenCheckedRef.current) return;
    startupAutoOpenCheckedRef.current = true;
    if (!settings.autoPlayLastChannel || currentView !== 'home') return;

    const savedRecord = getLastWatchedChannel(settings.activePlaylistId || activePlaylistData?.id);
    if (savedRecord?.channel?.stream_id && savedRecord.channel.url) {
      setAutoStartChannel(savedRecord.channel);
      setCurrentView('live');
    }
  }, [startupSplashComplete, settings.autoPlayLastChannel, settings.activePlaylistId, activePlaylistData?.id, currentView]);

  // Check if extraction was already started by SplashScreen preload
  useEffect(() => {
    const existingProgress = (window as any).__ACHOUR_EXTRACTION_PROGRESS__;
    if (
      existingProgress &&
      existingProgress.stage !== 'completed' &&
      existingProgress.stage !== 'idle' &&
      existingProgress.stage !== 'paused' &&
      (!activePlaylistData || !dismissedExtractionRef.current.has(activePlaylistData.id))
    ) {
      setExtractionProgress(existingProgress);
      setShowExtractionModal(true);
    }

    const handleProgressEvent = (e: any) => {
      if (e.detail) {
        if (e.detail.stage === 'completed') {
          setPausedExtraction(null);
          (window as any).__ACHOUR_EXTRACTION_PROGRESS__ = null;
          setShowExtractionModal(false);
          setExtractionProgress(null);
          return;
        }
        if (e.detail.stage === 'paused') {
          setPausedExtraction(e.detail);
        } else {
          setPausedExtraction(null);
        }
        setExtractionProgress(e.detail);
        if (activePlaylistData && dismissedExtractionRef.current.has(activePlaylistData.id)) {
          return;
        }
        if (e.detail.stage !== 'paused') {
          setShowExtractionModal(true);
        }
      }
    };

    const handleNavigateView = (e: any) => {
      const target = e?.detail as View | undefined;
      if (target) setCurrentView(target);
    };

    window.addEventListener('achour_extraction_progress', handleProgressEvent);
    window.addEventListener('achour_navigate_view', handleNavigateView);
    return () => {
      window.removeEventListener('achour_extraction_progress', handleProgressEvent);
      window.removeEventListener('achour_navigate_view', handleNavigateView);
    };
  }, [activePlaylistData?.id]);

  // Check if extraction is needed (or paused & awaiting user resume) once splash completes and active playlist is determined
  useEffect(() => {
    if (!startupSplashComplete) return;
    if (activePlaylistData) {
      dismissedExtractionRef.current.delete(activePlaylistData.id);
      const checkAndExtract = async () => {
        const status = await getPlaylistExtractionStatus(activePlaylistData.id);
        if (status?.stage === 'paused') {
          setPausedExtraction(status);
          return;
        }
        if (status?.stage === 'completed') {
          setPausedExtraction(null);
          setShowExtractionModal(false);
          setExtractionProgress(null);
          return;
        }
        if (dismissedExtractionRef.current.has(activePlaylistData.id)) return;
        const existing =
          ExtractionService.getLatestProgress(activePlaylistData.id) ||
          (window as any).__ACHOUR_EXTRACTION_PROGRESS__;
        if (existing && existing.stage !== 'completed' && existing.stage !== 'error' && existing.stage !== 'paused') {
          setExtractionProgress(existing);
          setShowExtractionModal(true);
        }
        setPausedExtraction(null);
        if (!existing) {
          setShowExtractionModal(true);
        }
        await ExtractionService.extract(activePlaylistData, (progress) => {
          if (progress.stage === 'completed') {
            setPausedExtraction(null);
            (window as any).__ACHOUR_EXTRACTION_PROGRESS__ = null;
            setShowExtractionModal(false);
            setExtractionProgress(null);
            return;
          }
          if (progress.stage === 'paused') {
            setPausedExtraction(progress);
          }
          setExtractionProgress(progress);
        });
      };
      checkAndExtract();
    } else {
      setPausedExtraction(null);
      setExtractionProgress(null);
    }
  }, [activePlaylistData?.id, startupSplashComplete]);


  const fetchActivePlaylist = async () => {
    try {
      let deletedIds = new Set<string>();
      try {
        const rawDel = localStorage.getItem('achour_deleted_playlist_ids');
        const arrDel = rawDel ? JSON.parse(rawDel) : [];
        if (Array.isArray(arrDel)) deletedIds = new Set(arrDel.filter((x) => typeof x === 'string'));
      } catch {}

      // 1. Check local playlists first if active
      const localSaved = localStorage.getItem('achour_local_playlists');
      const localListRaw: Playlist[] = localSaved ? JSON.parse(localSaved) : [];
      const localList: Playlist[] = Array.isArray(localListRaw)
        ? localListRaw.filter(p => p?.id && !deletedIds.has(p.id))
        : [];

      if (settings.activePlaylistId && !deletedIds.has(settings.activePlaylistId)) {
        const localFound = localList.find(p => p.id === settings.activePlaylistId);
        if (localFound) {
          setActivePlaylistName(localFound.name || 'IPTV');
          setActivePlaylistData(localFound);
          return;
        }

        if (db) {
          try {
            const snap = await getDoc(doc(db, 'playlists', settings.activePlaylistId));
            if (snap.exists() && !deletedIds.has(snap.id)) {
              const data = { id: snap.id, ...snap.data() } as Playlist;
              setActivePlaylistName(data.name || 'IPTV');
              setActivePlaylistData(data);
              return;
            }
          } catch (e) {
            console.warn('Firestore getDoc fallback warning:', e);
          }
        }
      }

      // Check local list fallback before querying Firestore so we prefer current local state
      if (localList.length > 0) {
        setActivePlaylistName(localList[0].name || 'IPTV');
        setActivePlaylistData(localList[0]);
        if (settings.activePlaylistId !== localList[0].id) {
          onUpdateSettings(prev => ({ ...prev, activePlaylistId: localList[0].id }));
        }
        return;
      }

      // Check Firestore list
      if (db) {
        const playlistsPath = 'playlists';
        try {
          const q = query(collection(db, playlistsPath), where('userId', '==', userId));
          const res = await getDocs(q);
          const validDoc = res.docs.find(d => !deletedIds.has(d.id));
          if (validDoc) {
            const first = { id: validDoc.id, ...validDoc.data() } as Playlist;
            setActivePlaylistName(first.name || 'IPTV');
            setActivePlaylistData(first);
            onUpdateSettings(prev => ({ ...prev, activePlaylistId: first.id }));
            return;
          }
        } catch (err) {
          console.warn('Firestore playlist fetch note (offline cache fallback active):', err);
        }
      }

      setActivePlaylistName('');
      setActivePlaylistData(null);
    } catch (err) {
      console.warn('Could not fetch active playlist name', err);
    }
  };

  useEffect(() => {
    setPausedExtraction(null);
    setExtractionProgress(null);
    if (settings.activePlaylistId) {
      dismissedExtractionRef.current.delete(settings.activePlaylistId);
    }
    fetchActivePlaylist();
  }, [userId, settings.activePlaylistId]);


  // Compute real subscription info strictly extracted from the active link
  const parsedSubscription = React.useMemo(() => {
    if (!activePlaylistData || !activePlaylistData.expDate) return null;
    const parsed = parseExpiryDate(activePlaylistData.expDate, settings.language);
    if (!parsed || !parsed.hasDate) return null;
    return parsed;
  }, [activePlaylistData?.expDate, settings.language]);



  // Background fetch/sync of live subscription expiration if not already present
  useEffect(() => {
    if (activePlaylistData && (activePlaylistData.expDate === undefined || activePlaylistData.expDate === null)) {
      fetchLiveSubscriptionExpiry(activePlaylistData).then(exp => {
        if (exp !== null && exp !== undefined) {
          setActivePlaylistData(prev => prev ? ({ ...prev, expDate: exp }) : null);
          try {
            const rawLocal = localStorage.getItem('achour_local_playlists');
            if (rawLocal) {
              const list: Playlist[] = JSON.parse(rawLocal);
              const updated = list.map(p => p.id === activePlaylistData.id ? ({ ...p, expDate: exp }) : p);
              localStorage.setItem('achour_local_playlists', JSON.stringify(updated));
            }
          } catch (e) {}
        }
      }).catch(() => {});
    }
  }, [activePlaylistData?.id, activePlaylistData?.url]);

  // Auto-Initial Focus for TV Remote Navigation once Splash finishes
  useEffect(() => {
    if (startupSplashComplete && currentView === 'home' && !showExtractionModal && !showExitModal && !showAddModal && !showRepositionModal) {
      const timer = setTimeout(() => {
        if (!getCurrentTVFocus()) {
          ensureInitialFocus();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [startupSplashComplete, currentView, showExtractionModal, showExitModal, showAddModal, showRepositionModal]);

  // Focus first control inside Reposition Modal on open & restore focus to dashboard tile on close
  const prevRepositionOpenRef = useRef(false);
  useEffect(() => {
    if (showRepositionModal) {
      prevRepositionOpenRef.current = true;
      const tId = setTimeout(() => {
        if (repositionBodyRef.current) {
          repositionBodyRef.current.scrollTop = 0;
        }
        const modal = document.querySelector<HTMLElement>('[data-tv-reposition-modal="true"]');
        const firstBtn =
          modal?.querySelector<HTMLElement>('[data-rep-row="1"][data-tv-focusable="true"]') ||
          modal?.querySelector<HTMLElement>('button[data-tv-focusable="true"]');
        if (firstBtn) setTVFocus(firstBtn, { scroll: false });
      }, 40);
      return () => clearTimeout(tId);
    } else if (prevRepositionOpenRef.current) {
      prevRepositionOpenRef.current = false;
      const targetKind = repositionFocusKind || 'live';
      const tId = setTimeout(() => {
        const el = document.querySelector<HTMLElement>(`[data-dashboard-kind="${targetKind}"]`);
        if (el) setTVFocus(el, { scroll: false });
      }, 40);
      return () => clearTimeout(tId);
    }
  }, [showRepositionModal, repositionFocusKind]);

  // Cancel reorder mode cleanly on Back button (at MODAL priority so it intercepts before exit confirmation)
  useEffect(() => {
    if (!reorderingKind) return;
    const unregister = pushBackHandler(() => {
      const backup = reorderBackupRef.current;
      if (backup) {
        onUpdateSettings(prev => ({
          ...prev,
          dashboardOrder: backup.dashboardOrder,
          dashboardAlignment: backup.dashboardAlignment,
          dashboardHorizontalAlignment: backup.dashboardHorizontalAlignment,
        }));
      }
      reorderBackupRef.current = null;
      const targetKind = reorderingKind;
      setReorderingKind(null);
      setTimeout(() => {
        const el = document.querySelector<HTMLElement>(`[data-dashboard-kind="${targetKind}"]`);
        if (el) setTVFocus(el, { scroll: false });
      }, 30);
      return true;
    }, BackPriority.MODAL);
    return unregister;
  }, [reorderingKind, onUpdateSettings]);

  // Register comprehensive back handlers for modals, subviews, and home dashboard
  useEffect(() => {
    const unregister = pushBackHandler(() => {
      if (showExtractionModal) {
        if (activePlaylistData) {
          dismissedExtractionRef.current.add(activePlaylistData.id);
        }
        setShowExtractionModal(false);
        return true;
      }
      if (showAddModal) {
        setShowAddModal(false);
        return true;
      }
      if (showRepositionModal) {
        setShowRepositionModal(false);
        return true;
      }
      if (showExitModal) {
        setShowExitModal(false);
        return true;
      }

      if (currentView !== 'home') {
        setCurrentView('home');
        return true;
      }

      setShowExitModal(true);
      return true;
    }, BackPriority.DASHBOARD);

    return unregister;
  }, [showExtractionModal, showAddModal, showExitModal, showRepositionModal, currentView, activePlaylistData?.id]);

  // Helper: move/swap active item in TV reorder mode along D-pad direction (or align on screen at boundaries)
  const handleTVReorderStep = React.useCallback((kind: IconKind, direction: 'up' | 'down' | 'left' | 'right') => {
    const tiles = Array.from(document.querySelectorAll<HTMLElement>('[data-dashboard-kind]'));
    const curEl = tiles.find(el => el.getAttribute('data-dashboard-kind') === kind);

    let neighborKind: IconKind | null = null;
    if (curEl) {
      const curRect = curEl.getBoundingClientRect();
      const cx = curRect.left + curRect.width / 2;
      const cy = curRect.top + curRect.height / 2;
      let bestScore = Infinity;

      for (const cand of tiles) {
        const candKind = cand.getAttribute('data-dashboard-kind') as IconKind | null;
        if (!candKind || candKind === kind) continue;
        const r = cand.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const tx = r.left + r.width / 2;
        const ty = r.top + r.height / 2;
        const dx = tx - cx;
        const dy = ty - cy;

        if (direction === 'up' && dy >= -10) continue;
        if (direction === 'down' && dy <= 10) continue;
        if (direction === 'left' && dx >= -10) continue;
        if (direction === 'right' && dx <= 10) continue;

        const score =
          direction === 'up' || direction === 'down'
            ? Math.abs(dy) + Math.abs(dx) * 1.4
            : Math.abs(dx) + Math.abs(dy) * 1.4;
        if (score < bestScore) {
          bestScore = score;
          neighborKind = candKind;
        }
      }
    }

    if (neighborKind) {
      onUpdateSettings(prev => {
        const base = ['live', 'movies', 'series', 'add', 'settings'];
        const order = [...(prev.dashboardOrder || []), ...base].filter(
          (value, index, list) => base.includes(value) && list.indexOf(value) === index
        );
        const fromIdx = order.indexOf(kind);
        const toIdx = order.indexOf(neighborKind!);
        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
        const nextOrder = [...order];
        [nextOrder[fromIdx], nextOrder[toIdx]] = [nextOrder[toIdx], nextOrder[fromIdx]];
        return { ...prev, dashboardOrder: nextOrder };
      });
    } else if (direction === 'up' || direction === 'down') {
      onUpdateSettings(prev => {
        const curAlign = prev.dashboardAlignment || 'center';
        const nextAlign =
          direction === 'up'
            ? curAlign === 'bottom' ? 'center' : 'top'
            : curAlign === 'top' ? 'center' : 'bottom';
        return curAlign === nextAlign ? prev : { ...prev, dashboardAlignment: nextAlign };
      });
    } else {
      onUpdateSettings(prev => {
        const curH = prev.dashboardHorizontalAlignment || 'center';
        const nextH =
          direction === 'left'
            ? curH === 'right' ? 'center' : 'left'
            : curH === 'left' ? 'center' : 'right';
        return curH === nextH ? prev : { ...prev, dashboardHorizontalAlignment: nextH };
      });
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const updatedEl = document.querySelector<HTMLElement>(`[data-dashboard-kind="${kind}"]`);
        if (updatedEl) setTVFocus(updatedEl, { scroll: false });
      });
    });
  }, [onUpdateSettings]);

  // Universal Keyboard & Remote D-Pad Navigation for Dashboard (capture phase prevents duplicate bubbling)
  useEffect(() => {
    if (currentView !== 'home') return;

    const isPhone = isMobileDevice();

    const enterReorderMode = (kind: IconKind) => {
      const curSettings = settingsRef.current;
      reorderBackupRef.current = {
        dashboardOrder: curSettings.dashboardOrder ? [...curSettings.dashboardOrder] : undefined,
        dashboardAlignment: curSettings.dashboardAlignment,
        dashboardHorizontalAlignment: curSettings.dashboardHorizontalAlignment,
      };
      setReorderingKind(kind);
    };

    const commitReorderMode = () => {
      reorderBackupRef.current = null;
      const targetKind = reorderingKind;
      setReorderingKind(null);
      if (targetKind) {
        setTimeout(() => {
          const el = document.querySelector<HTMLElement>(`[data-dashboard-kind="${targetKind}"]`);
          if (el) setTVFocus(el, { scroll: false });
        }, 25);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (showAddModal || showExitModal || showExtractionModal) return;

      // Open Icons Position menu when TV Menu / ContextMenu / Info button is pressed
      if (!showRepositionModal && !reorderingKind && (e.key === 'ContextMenu' || e.keyCode === 82 || e.keyCode === 457)) {
        e.preventDefault();
        e.stopPropagation();
        const active = getCurrentTVFocus();
        const focusedKind = (active?.getAttribute('data-dashboard-kind') as IconKind | null) || 'live';
        openRepositionModal(focusedKind);
        return;
      }

      const action = parseTVKeyEvent(e);

      if (action === 'UP' || action === 'DOWN' || action === 'LEFT' || action === 'RIGHT') {
        e.preventDefault();
        e.stopPropagation();
        const dir = action.toLowerCase() as 'up' | 'down' | 'left' | 'right';
        if (showRepositionModal) {
          const modalEl = document.querySelector<HTMLElement>('[data-tv-reposition-modal="true"]');
          if (modalEl) {
            const btns = Array.from(modalEl.querySelectorAll<HTMLElement>('[data-rep-row]'));
            if (btns.length > 0) {
              const rowMap = new Map<number, HTMLElement[]>();
              for (const b of btns) {
                const r = parseInt(b.getAttribute('data-rep-row') || '0', 10);
                if (!rowMap.has(r)) rowMap.set(r, []);
                rowMap.get(r)!.push(b);
              }
              const rowNums = Array.from(rowMap.keys()).sort((a, b) => a - b);
              const cur = getCurrentTVFocus() || (document.activeElement as HTMLElement | null);
              const curRowIdx = cur
                ? rowNums.findIndex((r) => rowMap.get(r)!.includes(cur))
                : -1;

              let targetEl: HTMLElement | null = null;
              if (curRowIdx === -1) {
                targetEl = rowMap.get(rowNums[Math.min(1, rowNums.length - 1)])?.[0] || btns[0];
              } else {
                const curRowNum = rowNums[curRowIdx];
                const curRowItems = rowMap.get(curRowNum)!;
                const curColIdx = Math.max(0, curRowItems.indexOf(cur!));

                if (dir === 'left' || dir === 'right') {
                  // Physical Left/Right inside row based on visual x-order
                  const sortedByX = [...curRowItems].sort(
                    (a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left
                  );
                  const visualIdx = Math.max(0, sortedByX.indexOf(cur!));
                  const nextVisualIdx =
                    dir === 'left'
                      ? Math.max(0, visualIdx - 1)
                      : Math.min(sortedByX.length - 1, visualIdx + 1);
                  targetEl = sortedByX[nextVisualIdx] || cur;
                } else {
                  const nextRowArrIdx =
                    dir === 'down'
                      ? Math.min(rowNums.length - 1, curRowIdx + 1)
                      : Math.max(0, curRowIdx - 1);
                  const nextRowNum = rowNums[nextRowArrIdx];
                  const nextRowItems = rowMap.get(nextRowNum)!;
                  if (nextRowItems.length === 1) {
                    targetEl = nextRowItems[0];
                  } else if (cur) {
                    const curCenterX = cur.getBoundingClientRect().left + cur.getBoundingClientRect().width / 2;
                    let bestItem = nextRowItems[Math.min(curColIdx, nextRowItems.length - 1)];
                    let bestDx = Infinity;
                    for (const cand of nextRowItems) {
                      const r = cand.getBoundingClientRect();
                      const dx = Math.abs(r.left + r.width / 2 - curCenterX);
                      if (dx < bestDx) {
                        bestDx = dx;
                        bestItem = cand;
                      }
                    }
                    targetEl = bestItem;
                  } else {
                    targetEl = nextRowItems[0];
                  }
                }
              }

              if (targetEl) {
                setTVFocus(targetEl, { scroll: false });
                const body = repositionBodyRef.current;
                if (body && body.contains(targetEl)) {
                  const targetRowNum = parseInt(targetEl.getAttribute('data-rep-row') || '0', 10);
                  if (targetRowNum <= 1) {
                    body.scrollTop = 0;
                  } else {
                    const bRect = body.getBoundingClientRect();
                    const tRect = targetEl.getBoundingClientRect();
                    if (bRect.height > 0) {
                      const scaleY = body.clientHeight / bRect.height;
                      const topRel = (tRect.top - bRect.top) * scaleY;
                      const botRel = (tRect.bottom - bRect.top) * scaleY;
                      const pad = 20;
                      if (topRel < pad) {
                        body.scrollTop = Math.max(0, body.scrollTop + topRel - pad);
                      } else if (botRel + pad > body.clientHeight) {
                        body.scrollTop = Math.min(
                          Math.max(0, body.scrollHeight - body.clientHeight),
                          body.scrollTop + botRel + pad - body.clientHeight
                        );
                      }
                    }
                  }
                }
              }
            }
          }
        } else if (reorderingKind) {
          handleTVReorderStep(reorderingKind, dir);
        } else {
          navigateSpatial(dir, document.body, null);
        }
        return;
      }

      if (action === 'SELECT') {
        e.preventDefault();
        e.stopPropagation();

        if (showRepositionModal) {
          if (!e.repeat && !isLongPressModalGraceActive()) {
            const active = getCurrentTVFocus();
            if (active && typeof active.click === 'function') {
              active.click();
            }
          }
          return;
        }

        if (reorderingKind) {
          if (!e.repeat) {
            commitReorderMode();
          }
          return;
        }

        const active = getCurrentTVFocus();
        const focusedKind = active?.getAttribute('data-dashboard-kind') as IconKind | null;

        // On TV / Desktop (!isPhone): Long press OK opens full Position & Reorder options menu
        if (!isPhone && focusedKind) {
          if (e.repeat) {
            if (selectHoldTimerRef.current) {
              clearTimeout(selectHoldTimerRef.current);
              selectHoldTimerRef.current = null;
            }
            if (!selectHoldTriggeredRef.current) {
              selectHoldTriggeredRef.current = true;
              openRepositionModal(focusedKind);
            }
            return;
          }

          if (!selectHoldTimerRef.current) {
            selectHoldTriggeredRef.current = false;
            selectHoldTimerRef.current = setTimeout(() => {
              selectHoldTimerRef.current = null;
              selectHoldTriggeredRef.current = true;
              openRepositionModal(focusedKind);
            }, 380);
          }
          return;
        }

        if (!e.repeat && active && typeof active.click === 'function') {
          active.click();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (currentView !== 'home' || showAddModal || showExitModal || showExtractionModal) return;
      const action = parseTVKeyEvent(e);
      if (action !== 'SELECT') return;

      if (selectHoldTimerRef.current) {
        clearTimeout(selectHoldTimerRef.current);
        selectHoldTimerRef.current = null;
      }

      if (selectHoldTriggeredRef.current || showRepositionModal) {
        e.preventDefault();
        e.stopPropagation();
        selectHoldTriggeredRef.current = false;
        return;
      }

      if (!isPhone && !reorderingKind) {
        const active = getCurrentTVFocus();
        if (active?.hasAttribute('data-dashboard-kind') && typeof active.click === 'function') {
          e.preventDefault();
          e.stopPropagation();
          active.click();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
      if (selectHoldTimerRef.current) {
        clearTimeout(selectHoldTimerRef.current);
        selectHoldTimerRef.current = null;
      }
    };
  }, [currentView, isRtl, showAddModal, showExitModal, showExtractionModal, showRepositionModal, reorderingKind, handleTVReorderStep]);


  const moveDashboardTile = (kind: string, direction: 'left' | 'right' | 'up' | 'down') => {
    const base = ['live', 'movies', 'series', 'add', 'settings'];
    const order = [...(settings.dashboardOrder || []), ...base].filter((value, index, list) => base.includes(value) && list.indexOf(value) === index);
    const from = order.indexOf(kind);
    if (from < 0) return;
    const delta = direction === 'left' ? -1 : direction === 'right' ? 1 : direction === 'up' ? -2 : 2;
    const to = Math.max(0, Math.min(order.length - 1, from + delta));
    if (to === from) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onUpdateSettings(prev => ({ ...prev, dashboardOrder: next }));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleExitApp = () => {
    setShowExitModal(false);

    try {
      (window as any).__ACHOUR_FLUSH_SETTINGS__?.();
    } catch {}

    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('native-player-active', 'native-player-preview');
      document.body.classList.remove('native-player-active', 'native-player-preview');
      document.documentElement.style.removeProperty('--native-preview-clip');
    }

    // Prefer AchourNative.exitApp() so all native ExoPlayer codecs, OkHttp pools, and tasks terminate cleanly
    const native = (window as any).AchourNative || (window as any).Android || (window as any).JSBridge;
    if (native) {
      try {
        native.hideAllMultiSlots?.();
        native.hidePlayer?.();
      } catch (e) {}
      if (typeof native.exitApp === 'function') {
        native.exitApp();
        return;
      }
    }

    // Fallback: Capacitor
    try {
      const capApp = (window as any).Capacitor?.Plugins?.App;
      if (capApp && typeof capApp.exitApp === 'function') {
        capApp.exitApp();
        return;
      }
    } catch (e) {}

    // Try Cordova
    if ((navigator as any).app && typeof (navigator as any).app.exitApp === 'function') {
      (navigator as any).app.exitApp();
      return;
    }
    
    // Try Tizen
    try { (window as any).tizen?.application?.getCurrentApplication()?.exit(); return; } catch(e){}
    
    // Try webOS
    try { (window as any).webOS?.window?.close(); return; } catch(e){}

    // Fallback for Web
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.close();
      window.location.href = 'about:blank';
    }
  };

  if (currentView === 'live') return (
    <LivePlayer
      onBack={() => {
        setAutoStartChannel(null);
        setCurrentView('home');
      }}
      settings={settings}
      onUpdateSettings={onUpdateSettings}
      userId={userId}
      initialChannelToPlay={autoStartChannel}
      onAutoPlayFallback={() => {
        setAutoStartChannel(null);
        setCurrentView('home');
      }}
    />
  );
  if (currentView === 'movies') return <LivePlayer onBack={() => setCurrentView('home')} settings={settings} onUpdateSettings={onUpdateSettings} userId={userId} initialType="movie" />;
  if (currentView === 'series') return <LivePlayer onBack={() => setCurrentView('home')} settings={settings} onUpdateSettings={onUpdateSettings} userId={userId} initialType="series" />;
  
  if (currentView === 'add') return <PlaylistManager onBack={() => setCurrentView('home')} userId={userId} settings={settings} onUpdateSettings={onUpdateSettings} />;
if (currentView === 'settings') return (
  <div
    className="h-full w-full overflow-hidden"
    style={{
      transform: `scale(${(settings.settingsScale ?? 90) / 100})`,
      transformOrigin: isRtl ? 'top right' : 'top left',
      width: `${10000 / (settings.settingsScale ?? 90)}%`,
      height: `${10000 / (settings.settingsScale ?? 90)}%`,
    }}
  >
    <SettingsView
      onBack={() => setCurrentView('home')}
      settings={settings}
      onUpdateSettings={onUpdateSettings}
      userId={userId}
      onTriggerSplash={onTriggerSplash}
    />
  </div>
);
  
  return (
    <>
      <div className={`relative h-full w-full bg-transparent flex flex-col select-none overflow-hidden ${isRtl ? 'text-right font-cairo' : 'text-left font-sans'}`}>
        <svg width="0" height="0" className="absolute pointer-events-none" aria-hidden="true">
          <defs>
            <linearGradient id="achour-ui-twotone" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="44%" stopColor="#FFFFFF" />
              <stop offset="52%" stopColor="var(--theme-split-mid, #F5E6A8)" />
              <stop offset="65%" stopColor="var(--theme-split-color, #D4AF37)" />
              <stop offset="100%" stopColor="var(--theme-split-deep, #8C6A1D)" />
            </linearGradient>
          </defs>
        </svg>


      {/* Top Header Bar: Left (Subscription Glass Card), Center (Glowing Brand Title & Beam), Right (Clock & Date Glass Card) */}
      <div
        dir="ltr"
        className="relative z-20 grid grid-cols-3 items-start justify-between gap-2 sm:gap-4 px-3 sm:px-6 pt-3 sm:pt-4 mb-2 shrink-0 w-full max-w-7xl mx-auto"
      >
        {/* 1. Left Side: Subscription Expiry Glass Capsule */}
        <div className="flex items-start justify-start min-w-0">
          {activePlaylistData ? (
            <div
              dir={isRtl ? 'rtl' : 'ltr'}
              className="achour-header-glass-card rounded-2xl px-3 sm:px-4 py-2 flex flex-col gap-1 max-w-full transition-colors"
            >
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <CheckCircle2
                  size={16}
                  stroke={parsedSubscription?.isExpired ? undefined : 'url(#achour-ui-twotone)'}
                  className={`shrink-0 ${
                    parsedSubscription?.isExpired
                      ? 'text-red-400'
                      : ''
                  }`}
                  style={
                    parsedSubscription?.isExpired
                      ? undefined
                      : {
                          color: 'var(--theme-split-color, #d4af37)',
                          filter: 'drop-shadow(0 0 6px var(--theme-glow))',
                        }
                  }
                />
                <span
                  className={`text-[11px] sm:text-sm font-semibold font-sans truncate max-w-[105px] sm:max-w-[190px] inline-block ${
                    parsedSubscription?.isExpired ? 'text-red-200' : 'achour-glossy-title'
                  }`}
                >
                  {activePlaylistData?.name || t('active_subscription')}
                </span>
                {parsedSubscription && (
                  <span
                    className={`text-[9px] sm:text-[10px] font-semibold font-sans shrink-0 inline-block ${
                      parsedSubscription.isExpired ? 'text-red-300' : 'achour-glossy-title opacity-95'
                    }`}
                  >
                    {parsedSubscription.isExpired ? t('expired') : t('active')}
                  </span>
                )}
              </div>
              <div
                className={`flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold font-sans tabular-nums truncate ${
                  parsedSubscription?.isExpired ? 'text-red-300' : ''
                }`}
              >
                <Calendar
                  size={13}
                  stroke={parsedSubscription?.isExpired ? undefined : 'url(#achour-ui-twotone)'}
                  className="hidden sm:block shrink-0"
                  style={{ color: parsedSubscription?.isExpired ? '#f87171' : 'var(--theme-split-color, #d4af37)' }}
                />
                <span className={parsedSubscription?.isExpired ? 'text-red-300' : 'achour-glossy-title inline-block'}>
                  {t('expire_short')}:
                </span>
                <span
                  className={`${parsedSubscription?.isExpired ? 'text-red-200' : 'achour-glossy-title'} font-semibold truncate inline-block`}
                >
                  {parsedSubscription ? parsedSubscription.formattedDate : t('per_link_lifetime')}
                </span>
                {parsedSubscription && !parsedSubscription.isExpired && parsedSubscription.daysRemaining !== null && parsedSubscription.daysRemaining < 999 && (
                  <span className="achour-glossy-title font-semibold text-[10px] sm:text-[11px] shrink-0 inline-block">
                    ({parsedSubscription.daysRemaining} {t('day_short')})
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="w-8" />
          )}
        </div>

        {/* 2. Center Brand: 3D Glossy Neon Title + Horizontal Glowing Beam */}
        <div dir="ltr" className="flex flex-col items-center justify-center min-w-0 pt-1">
          <h1 className="text-sm sm:text-xl md:text-2xl font-semibold font-sans achour-brand-neon-title uppercase leading-none whitespace-nowrap">
            ACHOUR PLAYER
          </h1>
          <div className="achour-brand-light-flare" aria-hidden="true" />
        </div>

        {/* 3. Right Side: Clock & Date Glass Capsule */}
        <div className="flex items-start justify-end gap-2 sm:gap-3 min-w-0">
          <ClockDisplay settings={settings} isRtl={isRtl} />
          {/* Hidden focus buffer */}
          <div className="opacity-0 w-0 h-0 pointer-events-none" data-tv-header-end="true" />
        </div>
      </div>

      {/* Active Background Extraction Banner (visible when minimized to background) */}
      {extractionProgress &&
        extractionProgress.stage !== 'completed' &&
        extractionProgress.stage !== 'paused' &&
        extractionProgress.stage !== 'error' &&
        activePlaylistData &&
        !showExtractionModal && (
        <div className="relative z-20 w-full max-w-3xl mx-auto px-4 mb-2 shrink-0">
          <div className="flex items-center justify-between gap-3 px-4 py-2 rounded-2xl bg-transparent">
            <div className="flex items-center gap-3 min-w-0">
              <RefreshCcw className="w-4 h-4 text-gold animate-spin shrink-0" />
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-semibold achour-glossy-text truncate">
                  {formatExtractionProgressMessage(extractionProgress.message, settings.language, extractionProgress.stage)} ({Math.round(extractionProgress.percent)}%)
                </p>
                {extractionProgress.counts && (
                  <p className="text-[11px] font-normal font-sans tabular-nums achour-glossy-info truncate">
                    {t('live')}: {extractionProgress.counts.live.toLocaleString()} · {t('movies')}: {extractionProgress.counts.movie.toLocaleString()} · {t('series')}: {extractionProgress.counts.series.toLocaleString()}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {extractionProgress.liveReady && (
                <button
                  data-tv-focusable="true"
                  tabIndex={0}
                  onClick={() => setCurrentView('live')}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500 text-black font-medium text-xs hover:bg-emerald-400 transition-colors cursor-pointer"
                >
                  {t('watch_live')}
                </button>
              )}
              <button
                data-tv-focusable="true"
                tabIndex={0}
                onClick={() => {
                  dismissedExtractionRef.current.delete(activePlaylistData.id);
                  setShowExtractionModal(true);
                }}
                className="px-3 py-1.5 rounded-xl bg-transparent achour-glossy-text font-medium text-xs hover:brightness-125 transition-all cursor-pointer"
              >
                {t('details')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resumable Paused Extraction Bar (visible on Home when user paused extraction or reopened app) */}
      {pausedExtraction && pausedExtraction.stage === 'paused' && activePlaylistData && !showExtractionModal && (
        <div className="relative z-20 w-full max-w-3xl mx-auto px-4 mb-2 shrink-0">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-transparent">
            <div className="flex items-center gap-3 min-w-0">
              <Clock className="w-5 h-5 text-gold shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold achour-glossy-text truncate">
                  {t('extraction_paused_at')} {pausedExtraction.percent || 0}%
                </p>
                <p className="text-xs font-normal text-zinc-300 truncate">
                  {formatExtractionProgressMessage(pausedExtraction.message, settings.language, pausedExtraction.stage)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                data-tv-focusable="true"
                tabIndex={0}
                onClick={async () => {
                  dismissedExtractionRef.current.delete(activePlaylistData.id);
                  setShowExtractionModal(true);
                  await ExtractionService.extract(activePlaylistData, (p) => {
                    if (p.stage === 'completed') setPausedExtraction(null);
                    setExtractionProgress(p);
                  }, false);
                }}
                className="px-4 py-2 rounded-xl achour-glossy-pill font-medium text-sm hover:brightness-110 transition-all cursor-pointer"
              >
                {t('resume_extraction')}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Main Content Area */}

        {/* TV Reorder Mode Live Hint Bar */}
        <AnimatePresence>
          {reorderingKind && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="relative z-30 mx-auto mb-1 px-4 py-1.5 rounded-xl bg-black/80 border border-[var(--theme-primary)] achour-glossy-surface text-xs font-medium flex items-center gap-3 shadow-lg shrink-0"
            >
              <span className="achour-glossy-text">
                {isRtl
                  ? 'وضع الترتيب: استخدم الأسهم لتحريك العنصر • OK للتثبيت والحفظ • Back للإلغاء'
                  : 'Reorder Mode: Use Arrows to move • OK to lock & save • Back to cancel'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

          <div
            data-tv-scroll-container="true"
            onContextMenu={(e) => {
              e.preventDefault();
              const tileEl = (e.target as HTMLElement | null)?.closest?.('[data-dashboard-kind]') as HTMLElement | null;
              const k = (tileEl?.getAttribute('data-dashboard-kind') as IconKind | null) || 'live';
              openRepositionModal(k);
            }}
            onPointerDown={(e) => {
              if (e.pointerType !== 'touch' && !isMobileDevice()) return;
              if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
              touchLongPressHandledRef.current = false;
              touchStartPosRef.current = { x: e.clientX, y: e.clientY };
              const tileEl = (e.target as HTMLElement | null)?.closest?.('[data-dashboard-kind]') as HTMLElement | null;
              const k = (tileEl?.getAttribute('data-dashboard-kind') as IconKind | null) || 'live';
              longPressTimerRef.current = setTimeout(() => {
                longPressTimerRef.current = null;
                touchLongPressHandledRef.current = true;
                openRepositionModal(k);
              }, 550);
            }}
            onPointerMove={(e) => {
              if (!longPressTimerRef.current || !touchStartPosRef.current) return;
              const dx = Math.abs(e.clientX - touchStartPosRef.current.x);
              const dy = Math.abs(e.clientY - touchStartPosRef.current.y);
              if (dx > 12 || dy > 12) {
                clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
              }
            }}
            onPointerUp={() => {
              touchStartPosRef.current = null;
              if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
              }
            }}
            onPointerCancel={() => {
              touchStartPosRef.current = null;
              touchLongPressHandledRef.current = false;
              if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
              }
            }}
            onClickCapture={(e) => {
              if (touchLongPressHandledRef.current) {
                e.preventDefault();
                e.stopPropagation();
                touchLongPressHandledRef.current = false;
              }
            }}
            data-dashboard-layout-stage="true"
            data-dashboard-v={settings.dashboardAlignment || 'center'}
            data-dashboard-h={settings.dashboardHorizontalAlignment || 'center'}
            className={`flex-1 min-h-0 flex flex-col ${
              settings.dashboardAlignment === 'top'
                ? 'justify-start pt-2 sm:pt-4'
                : settings.dashboardAlignment === 'bottom'
                ? 'justify-end pb-4 sm:pb-8'
                : 'justify-center'
            } w-full overflow-y-auto no-scrollbar px-3 sm:px-6`}
          >
            <DashboardLayouts
              dashboardOrder={settings.dashboardOrder}
              iconDisplayMode={settings.iconDisplayMode}
              iconPack={settings.iconPack}
              frameShape={settings.frameShape}
              active3DStyle={active3DStyle}
              iconSize={settings.iconScale || "md"}
              frameScale={settings.frameScale || "md"}
              tileSpacing={settings.tileSpacing || "md"}
              glassOpacity={settings.glassOpacity ?? 16}
              glassBlur={settings.glassBlur ?? 10}
              dashboardAlignment={settings.dashboardAlignment}
              dashboardHorizontalAlignment={settings.dashboardHorizontalAlignment}
              dashboardFocusMode={settings.dashboardFocusMode}
              dashboardLabelFocusGlow={settings.dashboardLabelFocusGlow}
              focusVisualStyle={settings.focusVisualStyle}
              focusGlowEnabled={settings.focusGlowEnabled}
              focusGlowIntensity={settings.focusGlowIntensity}
              focusGlowSpread={settings.focusGlowSpread}
              focusGlowPerStyle={settings.focusGlowPerStyle}
              royalThemeColor={settings.royalThemeColor}
              customThemeColor={settings.customThemeColor}
              dashboardLabelColorMode={settings.dashboardLabelColorMode}
              dashboardLabelCustomColor={settings.dashboardLabelCustomColor}
              reorderingKind={reorderingKind}
              language={settings.language}
              isRtl={isRtl}
              t={t}
              onNavigate={(view) => {
                if (!reorderingKind) setCurrentView(view);
              }}
              onExit={() => setShowExitModal(true)}
            />
          </div>

        {/* Extraction Progress Modal */}
        <AnimatePresence>
          {showExtractionModal && extractionProgress && (
            <ExtractionProgressModal
              progress={extractionProgress}
              playlistName={activePlaylistName}
              language={settings.language}
              onMinimize={() => {
                if (activePlaylistData) {
                  dismissedExtractionRef.current.add(activePlaylistData.id);
                }
                setShowExtractionModal(false);
              }}
              onWatchLive={() => {
                if (activePlaylistData) {
                  dismissedExtractionRef.current.add(activePlaylistData.id);
                }
                setShowExtractionModal(false);
                setCurrentView('live');
              }}
              onPause={() => {
                if (activePlaylistData && ExtractionService.isExtracting(activePlaylistData.id)) {
                  ExtractionService.cancel(activePlaylistData.id);
                }
              }}
              onClose={() => {
                if (activePlaylistData && ExtractionService.isExtracting(activePlaylistData.id)) {
                  dismissedExtractionRef.current.add(activePlaylistData.id);
                } else {
                  (window as any).__ACHOUR_EXTRACTION_PROGRESS__ = null;
                  setExtractionProgress(null);
                }
                setShowExtractionModal(false);
              }}
              onResume={async () => {
                if (activePlaylistData) {
                  dismissedExtractionRef.current.delete(activePlaylistData.id);
                  setShowExtractionModal(true);
                  await ExtractionService.extract(activePlaylistData, (progress) => {
                    if (progress.stage === 'completed') {
                      setPausedExtraction(null);
                      (window as any).__ACHOUR_EXTRACTION_PROGRESS__ = null;
                      setShowExtractionModal(false);
                      setExtractionProgress(null);
                      return;
                    }
                    setExtractionProgress(progress);
                  }, false);
                }
              }}
              onRetry={async () => {
                if (activePlaylistData) {
                  dismissedExtractionRef.current.delete(activePlaylistData.id);
                  setShowExtractionModal(true);
                  await ExtractionService.extract(activePlaylistData, (progress) => {
                    if (progress.stage === 'completed') {
                      setPausedExtraction(null);
                      (window as any).__ACHOUR_EXTRACTION_PROGRESS__ = null;
                      setShowExtractionModal(false);
                      setExtractionProgress(null);
                      return;
                    }
                    setExtractionProgress(progress);
                  }, true);
                }
              }}
            />
          )}
        </AnimatePresence>

        {/* Exit Confirmation Modal */}
        <ExitConfirmModal
          isOpen={showExitModal}
          onConfirmExit={handleExitApp}
          onCancel={() => setShowExitModal(false)}
          language={settings.language}
        />

        {/* Dashboard Icons Position & Reorder Modal (Centered Landscape Card) */}
        <AnimatePresence>
          {showRepositionModal && (
            <div
              className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 achour-modal-backdrop ${
                isFireOrTvDevice ? 'touch-none overscroll-none' : ''
              }`}
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.56)' }}
              onPointerDown={(e) => {
                repositionBackdropDownRef.current = e.target === e.currentTarget;
              }}
              onClick={(e) => {
                if (isSafeBackdropClick(e, repositionOpenedAtRef.current, repositionBackdropDownRef.current)) {
                  setShowRepositionModal(false);
                }
                repositionBackdropDownRef.current = false;
              }}
              onWheel={isFireOrTvDevice ? (e) => e.preventDefault() : undefined}
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                data-tv-modal="true"
                data-tv-reposition-modal="true"
                data-achour-window-cat="settings"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.08 }}
                onClick={(e) => e.stopPropagation()}
                className="w-[min(92vw,720px)] max-h-[82vh] overflow-hidden rounded-3xl p-4 sm:p-5 achour-glass-modal border border-gold/45 shadow-2xl flex flex-col gap-3 text-white select-none"
                dir={isRtl ? 'rtl' : 'ltr'}
              >
                {/* Fixed Header */}
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <ArrowUpDown className="w-4 h-4 text-gold shrink-0" />
                    <h3 className="text-sm sm:text-base font-semibold achour-glossy-title truncate">
                      {isRtl ? 'موضع وترتيب أيقونات الرئيسية' : 'Dashboard Icons Position & Order'}
                    </h3>
                  </div>
                  <button
                    data-tv-focusable="true"
                    data-rep-row={0}
                    tabIndex={0}
                    onClick={() => setShowRepositionModal(false)}
                    className="p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer shrink-0"
                    aria-label={isRtl ? 'إغلاق' : 'Close'}
                  >
                    <X size={17} />
                  </button>
                </div>

                {/* Inner Landscape Body: Two-Column Compact Card */}
                <div
                  ref={repositionBodyRef}
                  onWheel={isFireOrTvDevice ? (e) => e.preventDefault() : undefined}
                  onTouchMove={isFireOrTvDevice ? (e) => e.preventDefault() : undefined}
                  className={`flex-1 min-h-0 px-0.5 py-0.5 ${
                    isFireOrTvDevice
                      ? 'overflow-hidden touch-none overscroll-none'
                      : 'overflow-y-auto no-scrollbar touch-pan-y overscroll-contain'
                  }`}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-start">
                    {/* Left Column: Quick Arrow Reorder + Home Icons 9-Zone Position */}
                    <div className="flex flex-col gap-2.5">
                      <button
                        type="button"
                        data-tv-focusable="true"
                        data-rep-row={1}
                        tabIndex={0}
                        onClick={() => {
                          const target = repositionFocusKind || 'live';
                          reorderBackupRef.current = {
                            dashboardOrder: settings.dashboardOrder ? [...settings.dashboardOrder] : undefined,
                            dashboardAlignment: settings.dashboardAlignment,
                            dashboardHorizontalAlignment: settings.dashboardHorizontalAlignment,
                          };
                          setShowRepositionModal(false);
                          setReorderingKind(target);
                          setTimeout(() => {
                            const el = document.querySelector<HTMLElement>(`[data-dashboard-kind="${target}"]`);
                            if (el) setTVFocus(el, { scroll: false });
                          }, 35);
                        }}
                        className="w-full py-2 px-3 rounded-xl bg-gold/15 hover:bg-gold/25 border border-gold/50 text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
                      >
                        <Move size={14} className="text-gold shrink-0" />
                        <span className="truncate achour-glossy-text">
                          {isRtl
                            ? 'تحريك الأيقونات بالأسهم على الشاشة'
                            : 'Move Icons with Arrows'}
                        </span>
                      </button>

                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold">
                          <Move size={13} className="text-gold shrink-0" />
                          <span className="achour-glossy-text">{isRtl ? 'موضع شريط أيقونات الرئيسية' : 'Dashboard Icons Position'}</span>
                        </div>
                        <div dir="ltr" className="grid grid-cols-3 gap-1.5">
                          {[
                            { v: 'top' as const, h: 'left' as const, ar: 'أعلى يسار', en: 'Top Left' },
                            { v: 'top' as const, h: 'center' as const, ar: 'أعلى', en: 'Top' },
                            { v: 'top' as const, h: 'right' as const, ar: 'أعلى يمين', en: 'Top Right' },
                            { v: 'center' as const, h: 'left' as const, ar: 'اليسار', en: 'Left' },
                            { v: 'center' as const, h: 'center' as const, ar: 'المنتصف', en: 'Center' },
                            { v: 'center' as const, h: 'right' as const, ar: 'اليمين', en: 'Right' },
                            { v: 'bottom' as const, h: 'left' as const, ar: 'أسفل يسار', en: 'Bottom Left' },
                            { v: 'bottom' as const, h: 'center' as const, ar: 'أسفل', en: 'Bottom' },
                            { v: 'bottom' as const, h: 'right' as const, ar: 'أسفل يمين', en: 'Bottom Right' },
                          ].map((cell, idx) => {
                            const active =
                              (settings.dashboardAlignment || 'center') === cell.v &&
                              (settings.dashboardHorizontalAlignment || 'center') === cell.h;
                            const rowNum = 2 + Math.floor(idx / 3);
                            return (
                              <button
                                key={`${cell.v}-${cell.h}`}
                                data-tv-focusable="true"
                                data-rep-row={rowNum}
                                tabIndex={0}
                                onClick={() => {
                                  onUpdateSettings((prev) => ({
                                    ...prev,
                                    dashboardAlignment: cell.v,
                                    dashboardHorizontalAlignment: cell.h,
                                  }));
                                }}
                                className={`py-1.5 px-1.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                                  active
                                    ? 'bg-gold/25 border-gold shadow-[0_0_12px_var(--theme-glow)]'
                                    : 'bg-white/[0.04] border-white/10 text-zinc-200 hover:border-gold/50'
                                }`}
                              >
                                <div
                                  className={`w-8 h-4 rounded border border-white/20 bg-black/50 p-0.5 flex ${
                                    cell.v === 'top' ? 'items-start' : cell.v === 'bottom' ? 'items-end' : 'items-center'
                                  } ${
                                    cell.h === 'left' ? 'justify-start' : cell.h === 'right' ? 'justify-end' : 'justify-center'
                                  }`}
                                >
                                  <span className={`w-3 h-1 rounded-sm ${active ? 'bg-gold' : 'bg-gold/70'}`} />
                                </div>
                                <span className={`text-[10px] font-medium leading-tight ${active ? 'achour-glossy-text' : ''}`}>{isRtl ? cell.ar : cell.en}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Reorder Dashboard Tiles */}
                    <div className="space-y-1.5 sm:border-s sm:border-white/10 sm:ps-3.5">
                      <div className="text-xs font-semibold achour-glossy-text pb-0.5">
                        {isRtl ? 'ترتيب إطارات لوحة التحكم' : 'Reorder Dashboard Tiles'}
                      </div>
                      {(() => {
                        const base = ['live', 'movies', 'series', 'add', 'settings'];
                        const order = [...(settings.dashboardOrder || []), ...base].filter((value, index, list) => base.includes(value) && list.indexOf(value) === index);
                        const names: Record<string, string> = { live: isRtl ? 'المباشر' : 'Live', movies: isRtl ? 'الأفلام' : 'Movies', series: isRtl ? 'المسلسلات' : 'Series', add: isRtl ? 'إضافة قائمة' : 'Add Playlist', settings: isRtl ? 'الإعدادات' : 'Settings' };
                        return order.map((kind, index) => (
                          <div key={kind} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/10">
                            <span className="text-[11px] font-medium text-white truncate">{index + 1}. {names[kind]}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              {(['left', 'up', 'down', 'right'] as const).map(direction => (
                                <button key={direction} data-tv-focusable="true" data-rep-row={1 + index} tabIndex={0}
                                  onClick={() => moveDashboardTile(kind, direction)}
                                  title={direction}
                                  className="w-6 h-6 rounded-lg bg-white/10 hover:bg-gold hover:text-black text-zinc-200 text-xs font-medium transition-colors cursor-pointer">
                                  {direction === 'left' ? '←' : direction === 'right' ? '→' : direction === 'up' ? '↑' : '↓'}
                                </button>
                              ))}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </div>

                {/* Fixed Footer */}
                <div className={`flex items-center gap-2 pt-2 border-t border-white/10 shrink-0 ${isFireOrTvDevice ? 'justify-between' : 'justify-end'}`}>
                  {isFireOrTvDevice && (
                    <span className="text-[10px] font-normal text-zinc-400 truncate">
                      {isRtl ? 'التنقل عبر أسهم الريموت فقط' : 'Navigate with Remote Arrows'}
                    </span>
                  )}
                  <button
                    data-tv-focusable="true"
                    data-rep-row={6}
                    tabIndex={0}
                    onClick={() => setShowRepositionModal(false)}
                    className="px-5 py-2 rounded-xl achour-glossy-pill hover:brightness-110 text-xs sm:text-sm font-medium transition-all cursor-pointer shrink-0"
                  >
                    {isRtl ? 'تم' : 'Done'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Toast Notification */}
        <AnimatePresence>
          {refreshToast && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 achour-glass-modal border-gold/40 rounded-2xl text-[11px] font-medium"
            >
              <CheckCircle2
                size={14}
                stroke="url(#achour-ui-twotone)"
                className="shrink-0"
                style={{ color: 'var(--theme-split-color, #d4af37)' }}
              />
              <span className="achour-glossy-text">{t('data_refreshed')}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

