// @ts-nocheck
// Achour Player Playlist Manager
import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, getDocs, deleteDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, sanitizeForFirestore } from '../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronLeft, Plus, Trash2, Globe, Server, Link as LinkIcon, 
  Upload, CheckCircle2, Check, Lock, Tv, AlertCircle, Copy, Eye, 
  EyeOff, FileText, Sparkles, RefreshCw, Layers, ShieldCheck, Film, Clapperboard
} from 'lucide-react';
import axios from 'axios';
import { AppSettings, Playlist, PlaylistType } from '../types';
import { useI18n, formatExtractionProgressMessage } from '../utils/i18n';
import PinUnlockModal from './PinUnlockModal';
import { parseExpiryDate, fetchLiveSubscriptionExpiry } from '../utils/subscription';
import { getPlatformUrl } from '../utils/platform';
import { pushBackHandler, BackPriority, navigateSpatial, parseTVKeyEvent, ensureInitialFocus, getCurrentTVFocus, isTextInput, isSafeBackdropClick, markLongPressModalOpened, isLongPressModalGraceActive } from '../utils/tvNavigation';
import { testXtreamConnection, iptvGlobalCache } from '../utils/iptv';
import { initDB, clearPlaylistData, getPlaylistExtractionStatus } from '../lib/db';
import { ExtractionService, ExtractionProgress } from '../utils/extractionService';
import ExtractionProgressModal from './ExtractionProgressModal';

interface PlaylistManagerProps {
  userId: string;
  settings: AppSettings;
  onUpdateSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  onBack: () => void;
}

export default function PlaylistManager({ userId, settings, onUpdateSettings, onBack }: PlaylistManagerProps) {
  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
    try {
      const raw = localStorage.getItem('achour_local_playlists');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(() => {
    try {
      const raw = localStorage.getItem('achour_local_playlists');
      const parsed = raw ? JSON.parse(raw) : [];
      return !Array.isArray(parsed) || parsed.length === 0;
    } catch {
      return true;
    }
  });
  const [type, setType] = useState<PlaylistType>('xtream');
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    username: '',
    password: '',
    macAddress: '00:1A:79:',
    epgUrl: ''
  });
  const [isProtected, setIsProtected] = useState(false);
  const [pin, setPin] = useState('');
  const [selectedPendingPlaylist, setSelectedPendingPlaylist] = useState<Playlist | null>(null);

  // Extraction Progress Modal state for immediate display on activate
  const [showExtractionModal, setShowExtractionModal] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState<ExtractionProgress | null>(null);
  const [extractionPlaylist, setExtractionPlaylist] = useState<Playlist | null>(null);

  // Link Inspector & View Modal state
  const [inspectPlaylist, setInspectPlaylist] = useState<Playlist | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [uploadSuccessToast, setUploadSuccessToast] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const minimizedModalRef = useRef(false);
  const fetchSeqRef = useRef(0);
  const inspectOpenedAtRef = useRef<number>(0);
  const inspectBackdropDownRef = useRef<boolean>(false);
  const deletedIdsRef = useRef<Set<string>>((() => {
    try {
      const raw = localStorage.getItem('achour_deleted_playlist_ids');
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []);
    } catch {
      return new Set<string>();
    }
  })());

  const persistDeletedId = (id: string) => {
    deletedIdsRef.current.add(id);
    try {
      const arr = Array.from(deletedIdsRef.current).slice(-200);
      localStorage.setItem('achour_deleted_playlist_ids', JSON.stringify(arr));
    } catch {}
  };

  // Listen to background extraction progress events
  useEffect(() => {
    const existing = (window as any).__ACHOUR_EXTRACTION_PROGRESS__ as ExtractionProgress | null;
    if (existing && existing.stage !== 'completed' && existing.stage !== 'idle' && existing.stage !== 'paused' && !minimizedModalRef.current) {
      setExtractionProgress(existing);
      setShowExtractionModal(true);
    }

    const handleProgress = (e: any) => {
      if (e.detail) {
        setExtractionProgress(e.detail);
        if (e.detail.stage === 'completed') {
          minimizedModalRef.current = false;
          setTimeout(() => {
            setShowExtractionModal(false);
            setExtractionProgress(null);
          }, 800);
        } else if (e.detail.stage !== 'idle' && e.detail.stage !== 'paused' && !minimizedModalRef.current) {
          setShowExtractionModal(true);
        }
      }
    };
    window.addEventListener('achour_extraction_progress', handleProgress);
    return () => window.removeEventListener('achour_extraction_progress', handleProgress);
  }, []);

  // Register pushBackHandler & D-Pad spatial navigation for PlaylistManager
  useEffect(() => {
    const priority = (showExtractionModal || inspectPlaylist || selectedPendingPlaylist) ? BackPriority.SUBVIEW : BackPriority.VIEW;
    const unregister = pushBackHandler(() => {
      if (showExtractionModal) {
        setShowExtractionModal(false);
        return true;
      }
      if (inspectPlaylist) {
        setInspectPlaylist(null);
        return true;
      }
      if (selectedPendingPlaylist) {
        setSelectedPendingPlaylist(null);
        return true;
      }
      onBack();
      return true;
    }, priority);
    return unregister;
  }, [showExtractionModal, inspectPlaylist, selectedPendingPlaylist, onBack]);

  useEffect(() => {
    const tmr = setTimeout(() => {
      if (inspectPlaylist) {
        const modalRoot = document.querySelector<HTMLElement>('[data-tv-inspect-modal="true"]');
        const preferred =
          modalRoot?.querySelector<HTMLElement>('[data-tv-inspect-activate="true"]') ||
          modalRoot?.querySelector<HTMLElement>('[data-tv-focusable="true"]');
        if (preferred) {
          preferred.focus();
          ensureInitialFocus(modalRoot || document.body);
          return;
        }
      }
      ensureInitialFocus();
    }, 80);
    return () => clearTimeout(tmr);
  }, [inspectPlaylist, playlists.length]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (selectedPendingPlaylist) return;
      const action = parseTVKeyEvent(e);
      const activeEl = document.activeElement;
      if (isTextInput(activeEl)) {
        if (action === 'UP') {
          e.preventDefault();
          e.stopPropagation();
          navigateSpatial('up', document.body);
        } else if (action === 'DOWN') {
          e.preventDefault();
          e.stopPropagation();
          navigateSpatial('down', document.body);
        }
        return;
      }

      if (action === 'UP') {
        e.preventDefault(); e.stopPropagation(); navigateSpatial('up', document.body);
      } else if (action === 'DOWN') {
        e.preventDefault(); e.stopPropagation(); navigateSpatial('down', document.body);
      } else if (action === 'LEFT') {
        e.preventDefault(); e.stopPropagation(); navigateSpatial('left', document.body);
      } else if (action === 'RIGHT') {
        e.preventDefault(); e.stopPropagation(); navigateSpatial('right', document.body);
      } else if (action === 'SELECT') {
        if (e.repeat || isLongPressModalGraceActive()) return;
        const cur = getCurrentTVFocus();
        if (cur && typeof cur.click === 'function') {
          e.preventDefault(); e.stopPropagation(); cur.click();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [selectedPendingPlaylist, inspectPlaylist]);


  // File Upload State
  const [uploadedFileContent, setUploadedFileContent] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    if (!formData.name.trim()) {
      setFormData(prev => ({ ...prev, name: file.name.replace(/\.(m3u|m3u8|txt)$/i, '') }));
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setUploadedFileContent(text);
        setFormData(prev => ({ ...prev, url: 'local_file://' + file.name }));
      }
    };
    reader.readAsText(file);
  };

  const { t, isRtl } = useI18n(settings.language);

  const fetchPlaylists = async () => {
    const seq = ++fetchSeqRef.current;
    try {
      const rawLocal = localStorage.getItem('achour_local_playlists');
      const localList: Playlist[] = rawLocal ? JSON.parse(rawLocal) : [];

      let firestoreList: Playlist[] = [];
      if (db) {
        const playlistsPath = 'playlists';
        try {
          const q = query(collection(db, playlistsPath), where('userId', '==', userId));
          const snapshot = await getDocs(q);
          firestoreList = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Playlist[];
        } catch (fireErr) {
          console.warn('Could not fetch remote playlists (using offline cache):', fireErr);
        }
      }

      if (fetchSeqRef.current !== seq) return;

      // Merge avoiding duplicates by id and legacy same-credential clones, excluding deleted IDs
      const combinedMap = new Map<string, Playlist>();
      localList.forEach(p => {
        if (p?.id && !deletedIdsRef.current.has(p.id)) combinedMap.set(p.id, p);
      });
      firestoreList.forEach(p => {
        if (!p?.id || deletedIdsRef.current.has(p.id)) return;
        const existing = combinedMap.get(p.id);
        combinedMap.set(p.id, existing ? { ...existing, ...p } : p);
      });

      const sigSeen = new Map<string, Playlist>();
      const deduped: Playlist[] = [];
      for (const p of combinedMap.values()) {
        const sig = `${p.type}|${(p.url || '').trim().toLowerCase()}|${p.username || ''}|${p.password || ''}|${p.macAddress || ''}`;
        const prev = sigSeen.get(sig);
        if (!prev) {
          sigSeen.set(sig, p);
          deduped.push(p);
        } else if (p.id === settings.activePlaylistId && prev.id !== settings.activePlaylistId) {
          const idx = deduped.indexOf(prev);
          if (idx !== -1) deduped[idx] = p;
          sigSeen.set(sig, p);
        }
      }

      // Render playlists immediately so active banner & cards never disappear while checking expiry
      setPlaylists(deduped);
      setLoading(false);

      if (deduped.length > 0 && (!settings.activePlaylistId || !deduped.some(p => p.id === settings.activePlaylistId))) {
        onUpdateSettings(prev => ({ ...prev, activePlaylistId: deduped[0].id }));
      }

      // Background non-blocking expiration date hydration
      Promise.all(deduped.map(async (p) => {
        if (p.type === 'xtream' && p.url && p.username && p.password && !p.expDate) {
          try {
            const fetchUrl = getPlatformUrl('xtream', p.url, {
              username: p.username,
              password: p.password,
              action: 'auth'
            });
            const res = await axios.get(fetchUrl, { timeout: 6000 });
            const exp = res.data?.user_info?.exp_date;
            if (exp) return { ...p, expDate: exp };
          } catch {}
        }
        return p;
      })).then((hydrated) => {
        if (fetchSeqRef.current !== seq) return;
        const safeHydrated = hydrated.filter(p => !deletedIdsRef.current.has(p.id));
        setPlaylists(safeHydrated);
        try {
          localStorage.setItem('achour_local_playlists', JSON.stringify(safeHydrated));
        } catch {}
      }).catch(() => {});
    } catch (err) {
      console.error('Error fetching playlists:', err);
      setLoading(false);
    }
  };
  const deleteTrialPlaylists = async () => {
    const trialName = 'Achour Player Trial (قنوات وأفلام تجريبية)';
    const legacyTrialName = 'Achour TV Trial (قنوات وأفلام تجريبية)';
    try {
      const rawLocal = localStorage.getItem('achour_local_playlists');
      if (rawLocal) {
        const list: Playlist[] = JSON.parse(rawLocal);
        const filtered = list.filter(p => p.name !== trialName && p.name !== legacyTrialName);
        if (filtered.length !== list.length) {
          localStorage.setItem('achour_local_playlists', JSON.stringify(filtered));
        }
      }
    } catch (e) {
      console.warn('Local playlist delete error', e);
    }

    if (db) {
      try {
        const q = query(collection(db, 'playlists'), where('userId', '==', userId), where('name', '==', trialName));
        const snapshot = await getDocs(q);
        for (const docSnap of snapshot.docs) {
          await deleteDoc(doc(db, 'playlists', docSnap.id));
        }
      } catch (fireErr) {
        console.warn('Firestore trial cleanup notice:', fireErr);
      }
    }

    await fetchPlaylists();
  };

  useEffect(() => {
    deleteTrialPlaylists();
  }, []);

  const handleAdd = async (e?: React.FormEvent) => {
    e?.preventDefault();

    const trimmedUrl = formData.url.trim();
    if (!trimmedUrl) {
      setUploadSuccessToast(isRtl ? 'يرجى إدخال الرابط أولاً' : 'Please provide a URL first');
      setTimeout(() => setUploadSuccessToast(null), 3000);
      return;
    }

    // Auto-generate name if empty
    let playlistName = formData.name.trim();
    if (!playlistName) {
      try {
        const u = new URL(trimmedUrl.startsWith('http') ? trimmedUrl : 'http://' + trimmedUrl);
        const prefix = type === 'xtream' ? 'Xtream' : type === 'stalker' ? 'Stalker' : 'M3U';
        playlistName = u.hostname ? `${prefix} - ${u.hostname}` : (type === 'xtream' ? 'Xtream - IPTV' : type === 'stalker' ? 'Stalker - Portal' : 'M3U - Playlist');
      } catch (e) {
        playlistName = type === 'xtream' ? 'Xtream - IPTV' : type === 'stalker' ? 'Stalker - Portal' : 'M3U - Playlist';
      }
    }

    let cleanUrl = trimmedUrl.replace(/\/+$/, '');
    let extractedUser = formData.username.trim();
    let extractedPass = formData.password.trim();
    let detectedType = type;
    let finalContent = uploadedFileContent || '';

    if (detectedType === 'm3u') {
      if (trimmedUrl.startsWith('#EXTM3U') || trimmedUrl.startsWith('#EXTINF') || trimmedUrl.includes('#EXTINF:')) {
        finalContent = trimmedUrl;
        const fileName = 'pasted_' + Date.now();
        cleanUrl = 'local_file://' + fileName;
      } else if (uploadedFileContent) {
        const fileName = uploadedFileName || ('file_' + Date.now());
        cleanUrl = 'local_file://' + fileName;
      }
    }

    // Auto-extract credentials from URL query parameters (Xtream / M3U)
    if (!cleanUrl.startsWith('local_file://')) {
      try {
        const testUrl = new URL(cleanUrl.startsWith('http') ? cleanUrl : 'http://' + cleanUrl);
        const u = testUrl.searchParams.get('username');
        const p = testUrl.searchParams.get('password');
        if (u && p) {
          extractedUser = extractedUser || u;
          extractedPass = extractedPass || p;
          detectedType = 'xtream';
          cleanUrl = testUrl.origin;
        }
      } catch (e) {}
    }

    // Validation per type
    if (detectedType === 'xtream') {
      cleanUrl = cleanUrl.replace(/\/(player_api|get|index)\.php.*$/i, '').replace(/\/c\/?$/i, '').replace(/\?.*$/, '').replace(/\/+$/, '');
      if (!extractedUser || !extractedPass) {
        setUploadSuccessToast(isRtl ? 'يرجى إدخال اسم المستخدم وكلمة السر لااشتراك اكستريم' : 'Please enter Xtream username and password');
        setTimeout(() => setUploadSuccessToast(null), 3000);
        return;
      }
    }
    if (detectedType === 'stalker' && !formData.macAddress.trim()) {
      setUploadSuccessToast(isRtl ? 'يرجى إدخال عنوان MAC' : 'Please provide Stalker MAC address');
      setTimeout(() => setUploadSuccessToast(null), 3000);
      return;
    }

    if (cleanUrl && !cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('local_file://')) {
      cleanUrl = 'http://' + cleanUrl;
    }

    setIsSubmitting(true);
    try {
      const newDocRef = db ? doc(collection(db, 'playlists')) : null;
      const canonicalId = newDocRef
        ? newDocRef.id
        : `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const playlistPayload: any = {
        name: playlistName,
        type: detectedType,
        url: cleanUrl,
        portal: cleanUrl,
        m3uContent: finalContent || undefined,
        username: detectedType === 'xtream' ? extractedUser : (extractedUser || undefined),
        password: detectedType === 'xtream' ? extractedPass : (extractedPass || undefined),
        macAddress: detectedType === 'stalker' ? formData.macAddress.trim() : undefined,
        userId: userId,
        createdAt: db ? serverTimestamp() : new Date().toISOString()
      };

      // Keep M3U file keys for the new playlist if any, and wipe old session caches
      const keepM3uKeys: string[] = [];
      if (finalContent) {
        try {
          if (cleanUrl.startsWith('local_file://')) {
            const fileName = cleanUrl.replace('local_file://', '');
            const k1 = 'achour_m3u_file_' + fileName;
            const k2 = 'achour_m3u_file_' + decodeURIComponent(fileName);
            localStorage.setItem(k1, finalContent);
            localStorage.setItem(k2, finalContent);
            keepM3uKeys.push(k1, k2);
          }
          const k3 = 'achour_m3u_file_' + playlistName;
          localStorage.setItem(k3, finalContent);
          keepM3uKeys.push(k3);
        } catch {}
      }

      // 1. Reset active session caches & cancel any prior extraction cleanly
      await ExtractionService.purgeStorageForSwitch(keepM3uKeys);

      // 2. Save new playlist locally with the canonical ID immediately
      fetchSeqRef.current += 1;
      deletedIdsRef.current.delete(canonicalId);
      const localItem: Playlist = {
        id: canonicalId,
        ...playlistPayload,
        createdAt: new Date().toISOString()
      };
      try {
        const rawLocal = localStorage.getItem('achour_local_playlists');
        const list: Playlist[] = rawLocal ? JSON.parse(rawLocal) : [];
        const updatedLocal = [localItem, ...list.filter(p => p.id !== canonicalId)];
        localStorage.setItem('achour_local_playlists', JSON.stringify(updatedLocal));
        setPlaylists(updatedLocal);
      } catch (err) {
        console.warn('LocalStorage save warning', err);
      }

      // 3. Reset form and show Extraction Progress Modal IMMEDIATELY (no blocking on Firestore/expiry)
      setFormData({ name: '', url: '', username: '', password: '', macAddress: '00:1A:79:', epgUrl: '' });
      setUploadedFileContent(null);
      setUploadedFileName('');
      setIsProtected(false);
      setPin('');
      onUpdateSettings(prev => ({ ...prev, activePlaylistId: canonicalId }));

      minimizedModalRef.current = false;
      setExtractionPlaylist(localItem);
      setExtractionProgress({
        playlistId: canonicalId,
        stage: 'downloading',
        percent: 5,
        message: formatExtractionProgressMessage('جاري الاتصال بالسيرفر...', settings.language, 'downloading'),
        counts: { live: 0, movie: 0, series: 0 }
      });
      setShowExtractionModal(true);
      setIsSubmitting(false);

      // 4. Sync expiry & Firestore strictly in background without blocking extraction or UI
      (async () => {
        try {
          const liveExp = await Promise.race([
            fetchLiveSubscriptionExpiry(localItem),
            new Promise<null>(res => setTimeout(() => res(null), 4000))
          ]);
          if (liveExp !== null && liveExp !== undefined) {
            playlistPayload.expDate = liveExp;
            try {
              const raw = localStorage.getItem('achour_local_playlists');
              const list: Playlist[] = raw ? JSON.parse(raw) : [];
              const updated = list.map(it => it.id === canonicalId ? { ...it, expDate: liveExp } : it);
              localStorage.setItem('achour_local_playlists', JSON.stringify(updated));
              setPlaylists(updated);
            } catch {}
          }
        } catch {}
        if (db && newDocRef) {
          try {
            await setDoc(newDocRef, sanitizeForFirestore(playlistPayload));
          } catch (err) {
            console.warn('Firestore sync warning (stored locally):', err);
          }
        }
      })();

      // 5. Launch fast Web Worker extraction immediately
      void ExtractionService.extract(localItem, (progress) => {
        setExtractionProgress(progress);
        if (progress.stage === 'completed') {
          minimizedModalRef.current = false;
          setTimeout(() => {
            setShowExtractionModal(false);
            setExtractionProgress(null);
          }, 800);
        }
      });
    } catch (err) {
      console.error('Error adding playlist:', err);
      setUploadSuccessToast(isRtl ? 'حدث خطأ أثناء حفظ القائمة، يرجى التحقق من الرابط' : 'Error saving playlist. Please check URL');
      setTimeout(() => setUploadSuccessToast(null), 3500);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    // 1. Invalidate any in-flight fetches & immediately mark ID as deleted (persisted)
    persistDeletedId(id);
    fetchSeqRef.current += 1;

    const targetItem = playlists.find(p => p.id === id);
    const remaining = playlists.filter(p => p.id !== id);

    // 2. Immediately update React state & modals without waiting for IndexedDB or Firestore
    setPlaylists(remaining);
    if (inspectPlaylist?.id === id) setInspectPlaylist(null);
    if (selectedPendingPlaylist?.id === id) setSelectedPendingPlaylist(null);

    try {
      if (ExtractionService.isExtracting(id)) {
        ExtractionService.cancel(id);
      }
      if (extractionPlaylist?.id === id) {
        setShowExtractionModal(false);
        setExtractionProgress(null);
        setExtractionPlaylist(null);
      }
    } catch {}

    // 3. Synchronously update localStorage persisted playlists and M3U file keys
    try {
      const rawLocal = localStorage.getItem('achour_local_playlists');
      const list: Playlist[] = rawLocal ? JSON.parse(rawLocal) : [];
      const filteredLocal = Array.isArray(list) ? list.filter(p => p.id !== id) : remaining;
      localStorage.setItem('achour_local_playlists', JSON.stringify(filteredLocal));
    } catch (e) {
      console.warn('Local playlist delete error', e);
    }

    if (targetItem) {
      try {
        if (targetItem.name) localStorage.removeItem('achour_m3u_file_' + targetItem.name);
        if (targetItem.url?.startsWith('local_file://')) {
          const fname = targetItem.url.replace('local_file://', '');
          localStorage.removeItem('achour_m3u_file_' + fname);
          try {
            localStorage.removeItem('achour_m3u_file_' + decodeURIComponent(fname));
          } catch {}
        }
      } catch {}
    }

    // 4. Immediately reassign or clear activePlaylistId if we deleted the active playlist
    const wasActive = settings.activePlaylistId === id;
    if (wasActive) {
      onUpdateSettings(prev => ({ ...prev, activePlaylistId: remaining[0]?.id || null }));
    }

    // Ensure TV focus remains valid after row removal
    requestAnimationFrame(() => {
      ensureInitialFocus();
    });

    // 5. Perform IndexedDB, storage purge, and Firestore deletion in background
    try {
      await clearPlaylistData(id);
    } catch (err) {
      console.warn('clearPlaylistData delete notice:', err);
    }

    if (wasActive) {
      try {
        await ExtractionService.purgeStorageForSwitch();
      } catch (err) {
        console.warn('purgeStorageForSwitch delete notice:', err);
      }
    }

    if (db) {
      try {
        await deleteDoc(doc(db, 'playlists', id));
        if (targetItem) {
          const targetSig = `${targetItem.type}|${(targetItem.url || '').trim().toLowerCase()}|${targetItem.username || ''}|${targetItem.password || ''}|${targetItem.macAddress || ''}`;
          const q = query(collection(db, 'playlists'), where('userId', '==', userId));
          const snap = await getDocs(q);
          for (const docSnap of snap.docs) {
            const d = docSnap.data() as Partial<Playlist>;
            const dSig = `${d.type}|${(d.url || '').trim().toLowerCase()}|${d.username || ''}|${d.password || ''}|${d.macAddress || ''}`;
            if (dSig === targetSig) {
              persistDeletedId(docSnap.id);
              await deleteDoc(doc(db, 'playlists', docSnap.id));
            }
          }
        }
      } catch (fireErr) {
        console.warn('Firestore playlist delete warning:', fireErr);
      }
    }
  };

  const activatePlaylistCleanly = async (p: Playlist) => {
    const isSwitching = p.id !== settings.activePlaylistId;
    if (isSwitching) {
      await ExtractionService.purgeStorageForSwitch();
    } else {
      iptvGlobalCache.clear();
    }

    // Ensure selected playlist is cached in localStorage so Home & Player resolve it immediately
    try {
      const rawLocal = localStorage.getItem('achour_local_playlists');
      const list: Playlist[] = rawLocal ? JSON.parse(rawLocal) : [];
      if (!list.some(item => item.id === p.id)) {
        localStorage.setItem('achour_local_playlists', JSON.stringify([p, ...list]));
      }
    } catch {}

    onUpdateSettings(prev => ({ ...prev, activePlaylistId: p.id }));
    setUploadSuccessToast(
      isRtl
        ? `تم تفعيل القائمة: ${p.name}`
        : `Activated playlist: ${p.name}`
    );
    setTimeout(() => setUploadSuccessToast(null), 3200);

    // If this playlist has not yet completed extraction, show extraction progress modal immediately
    const extStatus = await getPlaylistExtractionStatus(p.id);
    if (!extStatus || extStatus.stage !== 'completed') {
      minimizedModalRef.current = false;
      setExtractionPlaylist(p);
      setExtractionProgress({
        playlistId: p.id,
        stage: 'downloading',
        percent: extStatus?.percent || 5,
        message: formatExtractionProgressMessage('جاري تجهيز القائمة...', settings.language, 'downloading'),
        counts: extStatus?.counts || { live: 0, movie: 0, series: 0 },
        liveReady: extStatus?.liveReady,
        movieReady: extStatus?.movieReady,
        seriesReady: extStatus?.seriesReady
      });
      setShowExtractionModal(true);
      void ExtractionService.extract(p, (progress) => {
        setExtractionProgress(progress);
        if (progress.stage === 'completed') {
          minimizedModalRef.current = false;
          setTimeout(() => {
            setShowExtractionModal(false);
            setExtractionProgress(null);
          }, 800);
        }
      });
    }
  };

  const handleSelect = async (p: Playlist) => {
    if (p.isProtected && p.pin) {
      setSelectedPendingPlaylist(p);
    } else {
      await activatePlaylistCleanly(p);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };
  return (
    <div className={`h-full min-h-0 bg-transparent p-3 sm:p-4 pb-3 flex flex-col select-none overflow-hidden scrollbar-hide ${isRtl ? 'font-cairo' : ''}`}>
      {/* Header (Back Button Only - No Repeated Page Title) */}
      <header className={`w-full max-w-6xl mx-auto flex items-center justify-between mb-2 shrink-0 ${isRtl ? 'flex-row-reverse' : ''}`}>
        <button 
          data-tv-focusable="false"
          data-tv-back-btn="true"
          tabIndex={-1}
          onClick={onBack}
          className="p-2 bg-white/[0.06] rounded-full border border-white/15 text-white hover:bg-gold hover:text-black transition-colors active:scale-90 pointer-events-auto select-none cursor-pointer"
          title={isRtl ? 'رجوع' : 'Back'}
        >
          <ChevronLeft size={18} className={isRtl ? 'rotate-180' : ''} />
        </button>
        <div className="w-10" />
      </header>

      {/* Toast Notification */}
      <AnimatePresence>
        {uploadSuccessToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 achour-glass-modal border-gold/45 text-gold rounded-2xl text-xs font-bold"
          >
            <CheckCircle2 size={18} style={{ color: 'var(--theme-split-color, #d4af37)' }} />
            <span className="achour-glossy-text">{uploadSuccessToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="w-full max-w-6xl mx-auto flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-hide space-y-4">

        {/* 3. GRID: ALL PLAYLISTS LIST & ADD NEW PLAYLIST LINK */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Saved Playlists */}
          <section className="lg:col-span-7 space-y-3">
            <div className={`flex items-center justify-between ${isRtl ? 'flex-row-reverse text-right' : 'text-left'}`}>
              <h2 className="text-sm font-semibold achour-glossy-title uppercase tracking-wider">
                {isRtl ? 'قوائم القنوات المحفوظة' : 'Saved Channel Lists'} (<span className="font-sans tabular-nums">{playlists.length}</span>)
              </h2>
              <span className="text-[10px] text-zinc-500">
                {isRtl ? 'انقر على أي قائمة لتفعيلها ومشاهدة محتواها' : 'Click any list to activate it'}
              </span>
            </div>

            <div className="space-y-2">
              {loading ? (
                Array(3).fill(0).map((_, i) => (
                  <div key={i} className="h-16 bg-white/[0.04] border border-white/10 rounded-xl" />
                ))
              ) : playlists.length === 0 ? (
                <div className="p-8 bg-white/[0.04] rounded-2xl border border-dashed border-white/15 text-center">
                  <Globe className="mx-auto text-zinc-500 mb-3" size={32} />
                  <p className="text-zinc-400 font-medium uppercase tracking-wider text-xs">
                    {isRtl ? 'لا توجد قوائم قنوات مضافة حالياً. أضف رابط M3U أو اشتراك Xtream من النموذج الجانبي' : 'No playlists saved yet. Add an M3U or Xtream link from the form.'}
                  </p>
                </div>
              ) : (
                playlists.map((p) => {
                  const isActive = settings.activePlaylistId === p.id;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-colors group relative ${
                        isActive 
                          ? 'border-gold bg-gold/15' 
                          : 'border-white/10 bg-white/[0.04]'
                      } ${isRtl ? 'flex-row-reverse text-right' : 'text-left'}`}
                    >
                      <div className={`flex items-center gap-2.5 min-w-0 flex-1 ${isRtl ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                          isActive ? 'bg-gold text-black shadow-md' : 'bg-gold/15 text-gold'
                        }`}>
                          {p.type === 'xtream' ? <Server size={17} /> : p.type === 'stalker' ? <Tv size={17} /> : <FileText size={17} />}
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <div className={`flex items-center gap-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                            <span className={`font-medium text-sm sm:text-base truncate achour-glossy-text`}>
                              {p.name}
                            </span>
                            {p.isProtected && <Lock size={12} className="text-gold shrink-0" />}
                            {isActive && (
                              <span className="px-2 py-0.5 bg-gold/20 text-gold rounded font-medium text-xs shrink-0">
                                {t('active')}
                              </span>
                            )}
                            {(() => {
                              const expInfo = parseExpiryDate(p.expDate, settings.language);
                              if (!expInfo.hasDate) return null;
                              return (
                                <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
                                  expInfo.isExpired 
                                    ? 'bg-red-500/20 text-red-400' 
                                    : 'bg-emerald-500/20 text-emerald-400'
                                }`}>
                                  {`${t('expire_short')}: ${expInfo.formattedDate}`}
                                </span>
                              );
                            })()}
                          </div>
                          <span className="text-xs text-zinc-400 font-sans truncate mt-0.5">
                            {p.url || (p.type === 'xtream' ? `${p.username} @ ${p.url}` : 'M3U Channels')}
                          </span>
                        </div>
                      </div>

                      <div className={`flex items-center gap-2 shrink-0 ${isRtl ? 'flex-row-reverse' : ''}`}>
                        {/* Quick 1-Click Activate Checkmark Button */}
                        <button
                          data-tv-focusable="true"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelect(p);
                          }}
                          className={`p-2 rounded-xl transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-gold text-black shadow-md'
                              : 'text-zinc-400 hover:text-gold hover:bg-gold/10'
                          }`}
                          title={isActive ? (isRtl ? 'القائمة النشطة حالياً' : 'Active Playlist') : (isRtl ? 'تفعيل كقائمة نشطة' : 'Set as Active Playlist')}
                          aria-pressed={isActive}
                        >
                          <Check size={16} strokeWidth={isActive ? 3 : 2} />
                        </button>

                        {/* Test Connection Button */}
                        {p.type === 'xtream' && (
                          <button
                            data-tv-focusable="true"
                            tabIndex={0}
                            onClick={async (e) => {
                              e.stopPropagation();
                              const res = await testXtreamConnection(p.url || '', p.username || '', p.password || '');
                              setUploadSuccessToast(res.isSuccess ? (isRtl ? 'الاتصال ناجح!' : 'Connection successful!') : (isRtl ? 'فشل الاتصال: ' + (res.error || 'خطأ غير معروف') : 'Connection failed: ' + (res.error || 'Unknown error')));
                              setTimeout(() => setUploadSuccessToast(null), 5000);
                            }}
                            className="p-2 text-zinc-300 hover:text-gold hover:bg-gold/10 rounded-xl transition-colors cursor-pointer"
                            title={isRtl ? 'فحص الاتصال' : 'Test Connection'}
                          >
                            <ShieldCheck size={16} />
                          </button>
                        )}

                        {/* Inspect Link Button */}
                        <button
                          data-tv-focusable="true"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            inspectOpenedAtRef.current = Date.now();
                            markLongPressModalOpened(450);
                            setInspectPlaylist(p);
                          }}
                          className="p-2 text-zinc-300 hover:text-gold hover:bg-gold/10 rounded-xl transition-colors cursor-pointer"
                          title={isRtl ? 'رؤية الرابط والبيانات' : 'View Link & Details'}
                        >
                          <Eye size={16} />
                        </button>

                        {/* Delete Button */}
                        <button 
                          type="button"
                          data-tv-focusable="true"
                          tabIndex={0}
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            handleDelete(p.id); 
                          }} 
                          className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors active:scale-90 cursor-pointer"
                          title={isRtl ? 'حذف القائمة' : 'Delete Playlist'}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Add New Playlist Form */}
          <section className="lg:col-span-5 bg-white/[0.04] p-3.5 sm:p-4 rounded-2xl border border-white/12 space-y-3">
            <h2 className={`text-base font-medium text-gold ${isRtl ? 'text-right' : 'text-left'}`}>
              {t('add_playlist')}
            </h2>

            {/* Two Independent Server Cards: XTREAM CODES vs M3U PLAYLIST */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Card 1: XTREAM CODES API */}
              <div
                role="button"
                tabIndex={0}
                data-tv-focusable="true"
                onClick={() => setType('xtream')}
                className={`p-2.5 rounded-xl border-2 transition-colors cursor-pointer flex flex-col justify-between group ${
                  type === 'xtream'
                    ? 'border-gold bg-gold/15'
                    : 'border-white/10 bg-white/[0.04] hover:border-gold/30 hover:bg-white/[0.08]'
                }`}
              >
                <div className={`flex items-center justify-between mb-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                  <div className={`p-1.5 rounded-lg ${type === 'xtream' ? 'bg-gold text-black' : 'bg-white/10 text-gold'}`}>
                    <Server size={16} />
                  </div>
                  {type === 'xtream' && (
                    <span className="px-2 py-0.5 bg-gold text-black font-medium text-xs rounded">
                      {isRtl ? 'مُحدد' : 'Selected'}
                    </span>
                  )}
                </div>
                <div>
                  <h3 className={`text-sm font-medium text-white group-hover:text-gold ${isRtl ? 'text-right' : 'text-left'}`}>
                    {t('xtream_codes')}
                  </h3>
                </div>
              </div>

              {/* Card 2: M3U PLAYLIST & FILE */}
              <div
                role="button"
                tabIndex={0}
                data-tv-focusable="true"
                onClick={() => setType('m3u')}
                className={`p-2.5 rounded-xl border-2 transition-colors cursor-pointer flex flex-col justify-between group ${
                  type === 'm3u'
                    ? 'border-gold bg-gold/15'
                    : 'border-white/10 bg-white/[0.04] hover:border-gold/30 hover:bg-white/[0.08]'
                }`}
              >
                <div className={`flex items-center justify-between mb-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                  <div className={`p-1.5 rounded-lg ${type === 'm3u' ? 'bg-gold text-black' : 'bg-white/10 text-gold'}`}>
                    <Globe size={16} />
                  </div>
                  {type === 'm3u' && (
                    <span className="px-2 py-0.5 bg-gold text-black font-medium text-xs rounded">
                      {isRtl ? 'مُحدد' : 'Selected'}
                    </span>
                  )}
                </div>
                <div>
                  <h3 className={`text-sm font-medium text-white group-hover:text-gold ${isRtl ? 'text-right' : 'text-left'}`}>
                    {isRtl ? 'رابط M3U أو ملف قنوات' : 'M3U Playlist & File'}
                  </h3>
                </div>
              </div>
            </div>

            <form onSubmit={handleAdd} className="space-y-2.5">
              <div className="space-y-1">
                <label className={`text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block ${isRtl ? 'text-right' : 'text-left'}`}>
                  {isRtl ? 'اسم القائمة (اختياري)' : 'Playlist Name (Optional)'}
                </label>
                <input 
                  data-tv-focusable="true"
                  disabled={isSubmitting}
                  className={`w-full bg-white/[0.05] border border-white/15 rounded-lg px-3 py-2 focus:border-gold/50 outline-none transition-colors text-xs font-medium text-white disabled:opacity-50 ${isRtl ? 'text-right' : 'text-left'}`}
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder={isRtl ? 'مثال: اشتراك القنوات الملكي (اختياري)' : 'My IPTV Playlist (Optional)'}
                />
              </div>

              <div className="space-y-1">
                <label className={`text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block ${isRtl ? 'text-right' : 'text-left'}`}>
                  {type === 'xtream' ? (isRtl ? 'رابط السيرفر (Server Host)' : 'Server Host') : (isRtl ? 'رابط M3U أو نص الملاحظات' : 'M3U Link or Text')}
                </label>
                <input 
                  required
                  data-tv-focusable="true"
                  disabled={isSubmitting}
                  className={`w-full bg-white/[0.05] border border-white/15 rounded-lg px-3 py-2 focus:border-gold/50 outline-none transition-colors text-xs font-sans text-white disabled:opacity-50 ${isRtl ? 'text-right' : 'text-left'}`}
                  value={formData.url}
                  onChange={e => setFormData({ ...formData, url: e.target.value })}
                  placeholder={type === 'xtream' ? 'http://server.com:8080' : 'http://server.com/get.php?...'}
                />
              </div>

              {type === 'xtream' && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className={`text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block ${isRtl ? 'text-right' : 'text-left'}`}>{t('username')}</label>
                    <input 
                      data-tv-focusable="true"
                      disabled={isSubmitting}
                      className={`w-full bg-white/[0.05] border border-white/15 rounded-lg px-3 py-2 focus:border-gold/50 outline-none transition-colors text-xs font-sans text-white disabled:opacity-50 ${isRtl ? 'text-right' : 'text-left'}`}
                      value={formData.username}
                      onChange={e => setFormData({ ...formData, username: e.target.value })}
                      placeholder="Username"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={`text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block ${isRtl ? 'text-right' : 'text-left'}`}>{t('password')}</label>
                    <input 
                      type="password"
                      data-tv-focusable="true"
                      disabled={isSubmitting}
                      className={`w-full bg-white/[0.05] border border-white/15 rounded-lg px-3 py-2 focus:border-gold/50 outline-none transition-colors text-xs font-sans text-white disabled:opacity-50 ${isRtl ? 'text-right' : 'text-left'}`}
                      value={formData.password}
                      onChange={e => setFormData({ ...formData, password: e.target.value })}
                      placeholder="••••"
                    />
                  </div>
                </div>
              )}

              {/* Progress & Status indicator during verification/loading */}
              {isSubmitting && (
                <div className="p-3 rounded-xl bg-gold/10 border border-gold/40 flex items-center gap-3 text-gold">
                  <div className="w-5 h-5 border-2 border-gold border-t-transparent rounded-full animate-spin shrink-0" />
                  <div className="flex flex-col text-xs font-medium text-zinc-200">
                    <span className="text-gold font-semibold">{isRtl ? 'جاري فحص وتجهيز القائمة...' : 'Verifying and loading playlist...'}</span>
                    <span className="text-[10px] text-zinc-400">{isRtl ? 'يتم الاتصال بالسيرفر وجلب القنوات وتفعيلها' : 'Connecting to server and caching channels...'}</span>
                  </div>
                </div>
              )}

              <button 
                type="submit" 
                data-tv-focusable="true"
                tabIndex={0}
                disabled={isSubmitting}
                className="w-full py-2.5 bg-gold hover:bg-gold/90 text-black font-medium uppercase tracking-wider rounded-lg flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md text-xs mt-2 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>{isRtl ? 'جاري الحفظ والتحميل...' : 'Saving & Loading...'}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <span>{isRtl ? 'حفظ وتفعيل الرابط' : 'Save & Activate Link'}</span>
                  </>
                )}
              </button>
            </form>
          </section>
        </div>
      </div>
      {/* 4. MODAL: VIEW & INSPECT LINK DETAILS (ممكن رؤيته في أي وقت) */}
      <AnimatePresence>
        {inspectPlaylist && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onPointerDown={(e) => {
              inspectBackdropDownRef.current = e.target === e.currentTarget;
            }}
            onClick={(e) => {
              if (isSafeBackdropClick(e, inspectOpenedAtRef.current, inspectBackdropDownRef.current)) {
                setInspectPlaylist(null);
              }
              inspectBackdropDownRef.current = false;
            }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 achour-modal-backdrop select-none"
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              data-tv-modal="true"
              data-tv-inspect-modal="true"
              initial={{ scale: 0.97, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.97, opacity: 0 }}
              transition={{ duration: 0.08 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-[min(92vw,640px)] max-h-[82vh] overflow-y-auto no-scrollbar achour-glass-modal border-gold/40 rounded-2xl p-4 sm:p-5 flex flex-col gap-3 ${isRtl ? 'font-cairo text-right' : 'text-left'}`}
            >
              <div className={`flex items-center justify-between pb-3 border-b border-white/10 ${isRtl ? 'flex-row-reverse' : ''}`}>
                <div className={`flex items-center gap-2.5 ${isRtl ? 'flex-row-reverse' : ''}`}>
                  <div className="p-2 rounded-lg bg-gold text-black">
                    <Globe size={17} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold achour-glossy-title uppercase tracking-wider">
                      {inspectPlaylist.name}
                    </h3>
                    <span className="text-[10px] text-gold font-sans uppercase font-medium">
                      {inspectPlaylist.type} Playlist
                    </span>
                  </div>
                </div>
                <button 
                  type="button"
                  data-tv-focusable="true"
                  tabIndex={0}
                  onClick={() => setInspectPlaylist(null)}
                  className="p-1.5 text-zinc-400 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                >
                  ✕
                </button>
              </div>

              {/* Details List */}
              <div className="space-y-2.5 py-1 text-xs">
                {/* Full Link / Host */}
                <div className="space-y-1">
                  <div className={`flex items-center justify-between text-zinc-400 text-[11px] font-medium ${isRtl ? 'flex-row-reverse' : ''}`}>
                    <span>{isRtl ? 'رابط السيرفر أو القائمة:' : 'Server / M3U Link:'}</span>
                    <button
                      data-tv-focusable="true"
                      tabIndex={0}
                      onClick={() => copyToClipboard(inspectPlaylist.url || '')}
                      className="text-gold hover:underline flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded cursor-pointer"
                    >
                      <Copy size={12} />
                      <span>{copiedLink ? (isRtl ? 'تم النسخ!' : 'Copied!') : (isRtl ? 'نسخ الرابط' : 'Copy')}</span>
                    </button>
                  </div>
                  <div className="p-2.5 bg-white/[0.05] rounded-lg border border-white/10 font-sans text-gold text-[11px] break-all select-all">
                    {inspectPlaylist.url || 'local_file://...'}
                  </div>
                </div>

                {/* EPG URL in Inspector */}
                {inspectPlaylist.epgUrl && (
                  <div className="space-y-1">
                    <span className="text-zinc-400 text-[11px] font-medium block">{isRtl ? 'رابط EPG:' : 'EPG URL:'}</span>
                    <div className="p-2 bg-white/[0.05] rounded-lg border border-white/10 font-sans text-gold text-[11px] select-all truncate">
                      {inspectPlaylist.epgUrl}
                    </div>
                  </div>
                )}

                {/* Xtream Credentials if applicable */}
                {inspectPlaylist.type === 'xtream' && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="space-y-1">
                      <span className="text-zinc-400 text-[11px] font-medium block">{isRtl ? 'اسم المستخدم:' : 'Username:'}</span>
                      <div className="p-2 bg-white/[0.05] rounded-lg border border-white/10 font-sans text-white text-[11px] select-all">
                        {inspectPlaylist.username || '-'}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className={`flex items-center justify-between text-zinc-400 text-[11px] font-medium ${isRtl ? 'flex-row-reverse' : ''}`}>
                        <span>{isRtl ? 'كلمة المرور:' : 'Password:'}</span>
                        <button
                          data-tv-focusable="true"
                          tabIndex={0}
                          onClick={() => setShowPassword(!showPassword)}
                          className="text-zinc-400 hover:text-gold p-1 rounded cursor-pointer"
                        >
                          {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                      <div className="p-2 bg-white/[0.05] rounded-lg border border-white/10 font-sans text-white text-[11px]">
                        {showPassword ? (inspectPlaylist.password || '-') : '••••••••'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Stalker MAC Address */}
                {inspectPlaylist.type === 'stalker' && inspectPlaylist.macAddress && (
                  <div className="space-y-1 pt-1">
                    <span className="text-zinc-400 text-[11px] font-medium block">{isRtl ? 'عنوان MAC:' : 'MAC Address:'}</span>
                    <div className="p-2 bg-white/[0.05] rounded-lg border border-white/10 font-sans tabular-nums text-gold text-[11px] select-all">
                      {inspectPlaylist.macAddress}
                    </div>
                  </div>
                )}
              </div>

              {/* Actions Footer */}
              <div className={`pt-3 border-t border-white/10 flex items-center justify-between gap-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                <button
                  data-tv-focusable="true"
                  data-tv-inspect-activate="true"
                  tabIndex={0}
                  onClick={() => {
                    handleSelect(inspectPlaylist);
                    setInspectPlaylist(null);
                  }}
                  className="px-4 py-2 bg-gold text-black rounded-lg text-xs font-medium uppercase hover:bg-gold/80 transition-all shadow-md cursor-pointer"
                >
                  {isRtl ? 'تفعيل هذه القائمة الآن' : 'Activate Playlist'}
                </button>
                <button
                  data-tv-focusable="true"
                  tabIndex={0}
                  onClick={() => setInspectPlaylist(null)}
                  className="px-3 py-2 bg-white/10 text-white rounded-lg text-xs font-medium hover:bg-white/20 transition-all cursor-pointer"
                >
                  {isRtl ? 'إغلاق' : 'Close'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Parental PIN Modal on Select */}
      {selectedPendingPlaylist && selectedPendingPlaylist.pin && (
        <PinUnlockModal
          isOpen={true}
          onClose={() => setSelectedPendingPlaylist(null)}
          onSuccess={async () => {
            const target = selectedPendingPlaylist;
            setSelectedPendingPlaylist(null);
            await activatePlaylistCleanly(target);
          }}
          correctPin={selectedPendingPlaylist.pin}
          playlistName={selectedPendingPlaylist.name}
          language={settings.language}
        />
      )}

      {/* Immediate Extraction Progress Modal on Current Screen */}
      <AnimatePresence>
        {showExtractionModal && extractionProgress && (
          <ExtractionProgressModal
            progress={extractionProgress}
            playlistName={extractionPlaylist?.name || 'Achour Player'}
            language={settings.language}
            onMinimize={() => {
              minimizedModalRef.current = true;
              setShowExtractionModal(false);
            }}
            onWatchLive={() => {
              minimizedModalRef.current = true;
              setShowExtractionModal(false);
              try {
                window.dispatchEvent(new CustomEvent('achour_navigate_view', { detail: 'live' }));
              } catch {}
            }}
            onPause={() => {
              if (extractionPlaylist && ExtractionService.isExtracting(extractionPlaylist.id)) {
                ExtractionService.cancel(extractionPlaylist.id);
              }
            }}
            onClose={() => {
              if (extractionPlaylist && ExtractionService.isExtracting(extractionPlaylist.id)) {
                minimizedModalRef.current = true;
              } else {
                setExtractionProgress(null);
              }
              setShowExtractionModal(false);
            }}
            onResume={async () => {
              if (extractionPlaylist) {
                minimizedModalRef.current = false;
                setShowExtractionModal(true);
                await ExtractionService.extract(extractionPlaylist, (p) => {
                  setExtractionProgress(p);
                  if (p.stage === 'completed') {
                    setTimeout(() => {
                      setShowExtractionModal(false);
                      setExtractionProgress(null);
                    }, 800);
                  }
                }, false);
              }
            }}
            onRetry={async () => {
              if (extractionPlaylist) {
                minimizedModalRef.current = false;
                setShowExtractionModal(true);
                await ExtractionService.extract(extractionPlaylist, (p) => {
                  setExtractionProgress(p);
                  if (p.stage === 'completed') {
                    setTimeout(() => {
                      setShowExtractionModal(false);
                      setExtractionProgress(null);
                    }, 800);
                  }
                }, true);
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
