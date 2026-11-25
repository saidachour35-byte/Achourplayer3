import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Globe, Server, Tv, Lock, Upload, 
  Check, Eye, EyeOff, ShieldCheck, AlertCircle, Sparkles 
} from 'lucide-react';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, sanitizeForFirestore } from '../lib/firebase';
import { AppSettings, Playlist, PlaylistType } from '../types';
import { useI18n } from '../utils/i18n';
import { sanitizeM3uUrl } from '../utils/iptv';
import { fetchLiveSubscriptionExpiry } from '../utils/subscription';
import { ExtractionService } from '../utils/extractionService';
import { pushBackHandler, BackPriority, isSafeBackdropClick } from '../utils/tvNavigation';

interface AddPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onPlaylistAdded: (playlistId: string) => void;
  language: AppSettings['language'];
}

export default function AddPlaylistModal({
  isOpen,
  onClose,
  userId,
  onPlaylistAdded,
  language
}: AddPlaylistModalProps) {
  const { t, isRtl } = useI18n(language);
  const [tab, setTab] = useState<PlaylistType>('xtream');
  const [name, setName] = useState('');
  
  // Xtream fields
  const [host, setHost] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  // M3U fields
  const [m3uUrl, setM3uUrl] = useState('');
  const [uploadedFileContent, setUploadedFileContent] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAIScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAiLoading(true);
    setError('');

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      try {
        const response = await fetch('/api/gemini/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64 })
        });
        const data = await response.json();
        if (data.result) {
          try {
            // Clean Markdown if model returns it
            const jsonStr = data.result.replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(jsonStr);
            if (parsed.host) setHost(parsed.host);
            if (parsed.username) setUsername(parsed.username);
            if (parsed.password) setPassword(parsed.password);
            if (parsed.type) setTab(parsed.type);
            
            if (parsed.host && parsed.username) {
              setName(parsed.host.replace(/https?:\/\//, '').split(':')[0] || 'AI Extracted');
            }
          } catch (e) {
            setError(isRtl ? 'لم يتم العثور على بيانات صالحة في الصورة' : 'No valid credentials found in image');
          }
        }
      } catch (err) {
        setError(isRtl ? 'فشل تحليل الذكاء الاصطناعي' : 'AI Analysis failed');
      } finally {
        setAiLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const aiInputRef = useRef<HTMLInputElement>(null);
  const openedAtRef = useRef<number>(Date.now());
  const backdropDownRef = useRef<boolean>(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    if (!name.trim()) {
      setName(file.name.replace(/\.(m3u|m3u8|txt)$/i, ''));
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setUploadedFileContent(text);
        setError('');
      }
    };
    reader.onerror = () => {
      setError(isRtl ? 'حدث خطأ أثناء قراءة الملف' : 'Error reading file');
    };
    reader.readAsText(file);
  };

  // Stalker fields
  const [portalUrl, setPortalUrl] = useState('');
  const [macAddress, setMacAddress] = useState('00:1A:79:');
  
  // Parental Control / PIN Protection
  const [isProtected, setIsProtected] = useState(false);
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);

  // Register pushBackHandler when modal is open
  React.useEffect(() => {
    if (!isOpen) return;
    openedAtRef.current = Date.now();
    const unregister = pushBackHandler(() => {
      onClose();
      return true;
    }, BackPriority.MODAL);

    return unregister;
  }, [isOpen, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    let derivedName = name.trim();
    if (!derivedName) {
      try {
        const rawTarget = tab === 'xtream' ? host : tab === 'stalker' ? portalUrl : m3uUrl;
        if (rawTarget && rawTarget.trim()) {
          const cleanT = rawTarget.trim().startsWith('http') ? rawTarget.trim() : 'http://' + rawTarget.trim();
          const parsedU = new URL(cleanT);
          derivedName = `${tab === 'xtream' ? 'Xtream' : tab === 'stalker' ? 'Stalker' : 'M3U'} - ${parsedU.hostname}`;
        }
      } catch (e) {}
    }
    const playlistName = derivedName || (
      tab === 'xtream' ? 'Xtream IPTV' :
      tab === 'stalker' ? 'Stalker Portal' :
      'M3U Playlist'
    );

    if (isProtected && (!pin || pin.length < 4)) {
      setError(isRtl ? 'يرجى إدخال رمز PIN مكون من 4 أرقام على الأقل للرقابة الأبوية' : 'Please enter at least 4 digits for parental control PIN');
      return;
    }

    setLoading(true);

    try {
      let playlistData: Partial<Playlist> & { userId: string; createdAt: any } = {
        name: playlistName,
        type: tab,
        userId,
        isProtected,
        pin: isProtected ? pin : undefined,
        createdAt: db ? serverTimestamp() : new Date().toISOString()
      };

      if (tab === 'xtream') {
        let extractedUser = username.trim();
        let extractedPass = password.trim();
        let rawHostInput = host.trim();
        if (rawHostInput && (!extractedUser || !extractedPass)) {
          try {
            const parsed = new URL(rawHostInput.startsWith('http') ? rawHostInput : 'http://' + rawHostInput);
            extractedUser = extractedUser || parsed.searchParams.get('username') || '';
            extractedPass = extractedPass || parsed.searchParams.get('password') || '';
          } catch {}
        }

        if (!rawHostInput || !extractedUser || !extractedPass) {
          setError(isRtl ? 'يرجى إدخال رابط المضيف واسم المستخدم وكلمة المرور' : 'Please enter host, username, and password');
          setLoading(false);
          return;
        }

        let cleanHost = rawHostInput.replace(/\/+$/, '');
        cleanHost = cleanHost.replace(/\/(player_api|get|index)\.php.*$/i, '').replace(/\/c\/?$/i, '').replace(/\?.*$/, '').replace(/\/+$/, '');
        if (!cleanHost.startsWith('http://') && !cleanHost.startsWith('https://')) {
          cleanHost = 'http://' + cleanHost;
        }

        playlistData = {
          ...playlistData,
          url: cleanHost,
          portal: cleanHost,
          username: extractedUser,
          password: extractedPass
        };
      } else if (tab === 'm3u') {
        let finalUrl = '';
        let finalContent = uploadedFileContent || '';
        let extractedUser = '';
        let extractedPass = '';
        let isActuallyXtream = false;

        if (m3uUrl.trim().startsWith('#EXTM3U') || m3uUrl.trim().startsWith('#EXTINF') || m3uUrl.includes('#EXTINF:')) {
          // User pasted raw M3U text
          finalContent = m3uUrl.trim();
          const fileName = 'pasted_' + Date.now();
          finalUrl = 'local_file://' + fileName;
        } else if (uploadedFileContent) {
          // User uploaded a file
          const fileName = uploadedFileName || ('file_' + Date.now());
          finalUrl = 'local_file://' + fileName;
        } else {
          if (!m3uUrl.trim()) {
            setError(isRtl ? 'يرجى إدخال رابط M3U أو رفع ملف قنوات' : 'Please enter an M3U URL or upload a playlist file');
            setLoading(false);
            return;
          }

          let cleanUrl = sanitizeM3uUrl(m3uUrl.trim());

          if (cleanUrl) {
            try {
              const testUrl = new URL(cleanUrl.startsWith('http') ? cleanUrl : 'http://' + cleanUrl);
              const u = testUrl.searchParams.get('username');
              const p = testUrl.searchParams.get('password');
              if (u && p) {
                extractedUser = u;
                extractedPass = p;
                isActuallyXtream = true;
              }
            } catch (e) {}
          }

          if (cleanUrl && !cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
            cleanUrl = 'http://' + cleanUrl;
          }
          finalUrl = cleanUrl;
        }

        if (isActuallyXtream && extractedUser && extractedPass) {
          // Exactly like IBO Player: Upgrade to Xtream Codes API connection
          try {
            const parsedUrl = new URL(finalUrl);
            const cleanOrigin = parsedUrl.origin;
            playlistData = {
              ...playlistData,
              type: 'xtream',
              url: cleanOrigin,
              portal: cleanOrigin,
              username: extractedUser,
              password: extractedPass,
              m3uContent: undefined
            };
          } catch (e) {
            playlistData = {
              ...playlistData,
              type: 'xtream',
              url: finalUrl,
              portal: finalUrl,
              username: extractedUser,
              password: extractedPass
            };
          }
        } else {
          playlistData = {
            ...playlistData,
            url: finalUrl,
            portal: finalUrl,
            m3uContent: finalContent || undefined
          };
        }

        // Save M3U file content in localStorage under various keys to guarantee retrieval
        if (finalContent) {
          try {
            if (finalUrl.startsWith('local_file://')) {
              const fileName = finalUrl.replace('local_file://', '');
              localStorage.setItem('achour_m3u_file_' + fileName, finalContent);
              localStorage.setItem('achour_m3u_file_' + decodeURIComponent(fileName), finalContent);
            }
            localStorage.setItem('achour_m3u_file_' + playlistName, finalContent);
          } catch (e) {
            console.warn('Could not save M3U file in localStorage', e);
          }
        }
      } else if (tab === 'stalker') {
        if (!portalUrl.trim() || !macAddress.trim()) {
          setError(isRtl ? 'يرجى إدخال رابط البورتال وعنوان MAC' : 'Please enter portal URL and MAC address');
          setLoading(false);
          return;
        }

        let cleanPortal = portalUrl.trim().replace(/\/+$/, '');
        if (!cleanPortal.startsWith('http://') && !cleanPortal.startsWith('https://')) {
          cleanPortal = 'http://' + cleanPortal;
        }

        playlistData = {
          ...playlistData,
          url: cleanPortal,
          portal: cleanPortal,
          macAddress: macAddress.trim()
        };
      }

      // 1. Wipe old session caches cleanly before activating the new link
      const keepM3uKeys: string[] = [];
      if (playlistData.type === 'm3u' && playlistData.m3uContent) {
        if (playlistData.url?.startsWith('local_file://')) {
          const fn = playlistData.url.replace('local_file://', '');
          keepM3uKeys.push('achour_m3u_file_' + fn, 'achour_m3u_file_' + decodeURIComponent(fn));
        }
        keepM3uKeys.push('achour_m3u_file_' + playlistName);
      }
      await ExtractionService.purgeStorageForSwitch(keepM3uKeys);

      // 2. Single canonical ID shared between localStorage & Firestore
      const newDocRef = db ? doc(collection(db, 'playlists')) : null;
      const canonicalId = newDocRef
        ? newDocRef.id
        : `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const localItem: Playlist = {
        id: canonicalId,
        ...(playlistData as any),
        createdAt: new Date().toISOString()
      };

      try {
        const rawLocal = localStorage.getItem('achour_local_playlists');
        const list: Playlist[] = rawLocal ? JSON.parse(rawLocal) : [];
        localStorage.setItem('achour_local_playlists', JSON.stringify([localItem, ...list.filter(p => p.id !== canonicalId)]));
      } catch (localErr) {
        console.warn('LocalStorage save warning', localErr);
      }

      onPlaylistAdded(canonicalId);
      onClose();

      // 3. Background sync expiry & Firestore without stalling modal / extraction launch
      (async () => {
        try {
          const liveExp = await Promise.race([
            fetchLiveSubscriptionExpiry(localItem),
            new Promise<null>(res => setTimeout(() => res(null), 4000))
          ]);
          if (liveExp !== null && liveExp !== undefined) {
            playlistData.expDate = liveExp;
            try {
              const raw = localStorage.getItem('achour_local_playlists');
              const list: Playlist[] = raw ? JSON.parse(raw) : [];
              localStorage.setItem('achour_local_playlists', JSON.stringify(list.map(it => it.id === canonicalId ? { ...it, expDate: liveExp } : it)));
            } catch {}
          }
        } catch {}
        if (db && newDocRef) {
          try {
            await setDoc(newDocRef, sanitizeForFirestore(playlistData));
          } catch (fireErr) {
            console.warn('Firestore save warning, running in local persistent mode:', fireErr);
          }
        }
      })();
    } catch (err: any) {
      console.error('Error saving playlist:', err);
      setError(err.message || 'Failed to save playlist');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onPointerDown={(e) => {
        backdropDownRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (isSafeBackdropClick(e, openedAtRef.current, backdropDownRef.current)) {
          onClose();
        }
        backdropDownRef.current = false;
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 achour-modal-backdrop select-none"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        data-tv-modal="true"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.08 }}
        onClick={(e) => e.stopPropagation()}
        className={`w-[min(92vw,700px)] max-h-[84vh] achour-glass-modal border-gold/35 rounded-2xl overflow-hidden flex flex-col ${isRtl ? 'font-cairo text-right' : 'text-left'}`}
      >
        {/* Header */}
        <div className={`p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-gold/10 via-transparent to-transparent shrink-0 ${isRtl ? 'flex-row-reverse' : ''}`}>
          <div className={`flex items-center gap-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
            <div className="p-2.5 bg-gold/20 rounded-xl text-gold">
              <Tv size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-semibold achour-glossy-title uppercase tracking-wider">{t('add_playlist')}</h2>
              <span className="text-[10px] sm:text-xs achour-glossy-text font-medium">Achour Player System</span>
            </div>
          </div>
          <div className={`flex items-center gap-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
            <input 
              type="file" 
              className="hidden" 
              ref={aiInputRef} 
              accept="image/*" 
              onChange={handleAIScan} 
            />
            <button
              type="button"
              data-tv-focusable="true"
              onClick={() => aiInputRef.current?.click()}
              disabled={aiLoading}
              className="px-3 py-1.5 bg-gold/10 hover:bg-gold/20 border border-gold/40 rounded-xl text-gold flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50"
            >
              {aiLoading ? (
                <div className="w-3 h-3 border-2 border-gold border-t-transparent rounded-full animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              <span>{isRtl ? 'مسح بالذكاء الاصطناعي' : 'AI Scan'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-all"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 no-scrollbar">
            {/* Two Independent Server Cards: XTREAM CODES vs M3U PLAYLIST */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {/* Card 1: XTREAM CODES API */}
              <div
                role="button"
                tabIndex={0}
                data-tv-focusable="true"
                onClick={() => setTab('xtream')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Select') setTab('xtream'); }}
                className={`p-3.5 sm:p-4 rounded-2xl border-2 transition-colors cursor-pointer flex flex-col justify-between group outline-none ${
                  tab === 'xtream'
                    ? 'border-gold bg-gold/15'
                    : 'border-white/10 bg-white/[0.05] hover:border-gold/40 hover:bg-white/[0.08]'
                }`}
              >
                <div className={`flex items-center justify-between mb-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                  <div className={`p-2.5 rounded-xl transition-colors ${tab === 'xtream' ? 'bg-gold text-black shadow-md' : 'bg-white/10 text-gold'}`}>
                    <Server size={20} />
                  </div>
                  {tab === 'xtream' && (
                    <span className="px-2 py-0.5 bg-gold text-black font-medium text-[9px] uppercase rounded-lg shadow-sm">
                      {isRtl ? 'مُحدد' : 'Selected'}
                    </span>
                  )}
                </div>
                <div>
                  <h3 className={`text-xs sm:text-sm font-semibold uppercase tracking-wider text-white group-hover:text-gold ${isRtl ? 'text-right' : 'text-left'}`}>
                    {t('xtream_codes')}
                  </h3>
                  <p className={`text-[10px] sm:text-xs text-zinc-400 mt-0.5 leading-snug ${isRtl ? 'text-right' : 'text-left'}`}>
                    {isRtl 
                      ? 'سيرفر اكستريم كود المباشر - يتطلب عنوان المضيف واسم المستخدم وكلمة المرور'
                      : 'Xtream Codes API server connection using host URL, username & password'}
                  </p>
                </div>
              </div>

              {/* Card 2: M3U PLAYLIST & FILE */}
              <div
                role="button"
                tabIndex={0}
                data-tv-focusable="true"
                onClick={() => setTab('m3u')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Select') setTab('m3u'); }}
                className={`p-3.5 sm:p-4 rounded-2xl border-2 transition-colors cursor-pointer flex flex-col justify-between group outline-none ${
                  tab === 'm3u'
                    ? 'border-gold bg-gold/15'
                    : 'border-white/10 bg-white/[0.05] hover:border-gold/40 hover:bg-white/[0.08]'
                }`}
              >
                <div className={`flex items-center justify-between mb-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                  <div className={`p-2.5 rounded-xl transition-colors ${tab === 'm3u' ? 'bg-gold text-black shadow-md' : 'bg-white/10 text-gold'}`}>
                    <Globe size={20} />
                  </div>
                  {tab === 'm3u' && (
                    <span className="px-2 py-0.5 bg-gold text-black font-medium text-[9px] uppercase rounded-lg shadow-sm">
                      {isRtl ? 'مُحدد' : 'Selected'}
                    </span>
                  )}
                </div>
                <div>
                  <h3 className={`text-xs sm:text-sm font-semibold uppercase tracking-wider text-white group-hover:text-gold ${isRtl ? 'text-right' : 'text-left'}`}>
                    {isRtl ? 'رابط M3U أو ملف قنوات' : 'M3U Playlist & File'}
                  </h3>
                  <p className={`text-[10px] sm:text-xs text-zinc-400 mt-0.5 leading-snug ${isRtl ? 'text-right' : 'text-left'}`}>
                    {isRtl 
                      ? 'رابط مباشر M3U / M3U8 أو رفع ملف قنوات مخزن على جهازك'
                      : 'Direct M3U/M3U8 URL or upload a channel playlist file'}
                  </p>
                </div>
              </div>
            </div>

            {/* Playlist Name Field */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                {isRtl ? 'اسم القائمة (اختياري)' : 'Playlist Name (Optional)'}
              </label>
              <input
                type="text"
                data-tv-focusable="true"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isRtl ? 'مثال: قائمة رويال بريميوم (اختياري)' : 'e.g. My Premium IPTV (Optional)'}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-gold/50 outline-none transition-all"
              />
            </div>

            {/* Xtream Tab */}
            {tab === 'xtream' && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">{t('host')}</label>
                  <input
                    type="text"
                    data-tv-focusable="true"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="http://example.com:8080"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-gold/50 outline-none transition-all font-sans"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">{t('username')}</label>
                    <input
                      type="text"
                      data-tv-focusable="true"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder={t('username')}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-gold/50 outline-none transition-all font-sans"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">{t('password')}</label>
                    <input
                      type="text"
                      data-tv-focusable="true"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t('password')}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-gold/50 outline-none transition-all font-sans"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* M3U Tab */}
            {tab === 'm3u' && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">{t('m3u_url')}</label>
                  <textarea
                    rows={3}
                    data-tv-focusable="true"
                    value={m3uUrl}
                    onChange={(e) => setM3uUrl(e.target.value)}
                    placeholder={isRtl ? 'ضع رابط M3U هنا (http://...)' : 'Paste M3U URL (http://...)'}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-gold/50 outline-none transition-all font-sans resize-none"
                    required
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-red-400 text-xs font-medium">
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Sticky Action Buttons Footer */}
          <div className={`p-4 border-t border-white/10 bg-white/[0.04] flex gap-3 shrink-0 z-30 ${isRtl ? 'flex-row-reverse' : ''}`}>
            <button
              type="button"
              data-tv-focusable="true"
              onClick={onClose}
              className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-zinc-300 font-medium rounded-xl text-xs sm:text-sm transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              data-tv-focusable="true"
              disabled={loading}
              className="flex-1 py-3 bg-gold hover:bg-gold/90 text-black font-medium uppercase tracking-wider rounded-xl text-xs sm:text-sm transition-colors flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Check size={16} />
                  <span>{t('save')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
