// Platform detection and API URL routing
export const isNativeApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  try {
    if (w.Capacitor?.isNativePlatform?.()) return true;
    const plat = w.Capacitor?.getPlatform?.() || w.Capacitor?.platform;
    if (plat && plat !== 'web') return true;
    if (w.AchourNative || w.Android) return true;
  } catch {
    // ignore
  }
  return false;
};

export const isAndroid = (): boolean => {
  if (isNativeApp()) return true;
  if (typeof navigator === 'undefined') return false;
  return /android/i.test(navigator.userAgent || '');
};

export const isTVDevice = (): boolean => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  try {
    if ((window as any).AchourNative?.isTvDevice?.()) {
      return true;
    }
  } catch {
    // ignore
  }
  const ua = navigator.userAgent || '';
  if (/AFT[A-Z0-9]*|Fire\s?TV|Amazon|Silk\/|Android\s?TV|GoogleTV|MIBOX|BRAVIA|SHIELD|SmartTV|Tizen|Web0S|CrKey/i.test(ua)) {
    return true;
  }
  try {
    const hasCoarseTouch = window.matchMedia?.('(pointer: coarse)')?.matches || false;
    if (isNativeApp() && Math.max(window.innerWidth, window.innerHeight) >= 960 && !hasCoarseTouch) {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
};

export const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (isTVDevice()) return false;
  const ua = navigator.userAgent || '';
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return true;
  return window.innerWidth <= 900;
};

export const getNativeStreamProxyPort = (): number => {
  if (typeof window === 'undefined') return 0;
  try {
    const port = Number((window as any).AchourNative?.getStreamProxyPort?.());
    if (Number.isFinite(port) && port > 0) return port;
  } catch {
    // ignore
  }
  return 0;
};

export const getPublicId = (): string => {
  const KEY = 'achour_public_id';
  try {
    if (typeof localStorage !== 'undefined') {
      const existing = localStorage.getItem(KEY);
      if (existing) return existing;
      const generated = 'usr_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      localStorage.setItem(KEY, generated);
      return generated;
    }
  } catch {
    // ignore
  }
  return 'usr_local_default';
};

export const getPlatformUrl = (
  type: 'xtream' | 'm3u' | 'get' | 'stream' | 'epg' | 'stalker' | string,
  rawUrl: string,
  extraParams?: Record<string, string>
): string => {
  if (!rawUrl) return '';
  let cleanUrl = String(rawUrl).trim();
  if (cleanUrl.startsWith('local_file://')) return cleanUrl;

  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = 'http://' + cleanUrl;
  }

  const paramsObj: Record<string, string> = {};
  if (extraParams && typeof extraParams === 'object') {
    Object.entries(extraParams).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v) !== '') {
        paramsObj[k] = String(v);
      }
    });
  }

  if (isNativeApp()) {
    if (type === 'xtream') {
      const base = cleanUrl.replace(/\/+$/, '');
      const endpoint = /\/(player_api|get|index)\.php/i.test(base) ? base : `${base}/player_api.php`;
      const qs = new URLSearchParams(paramsObj).toString();
      if (!qs) return endpoint;
      return `${endpoint}${endpoint.includes('?') ? '&' : '?'}${qs}`;
    }
    if (type === 'stalker') {
      const qs = new URLSearchParams(paramsObj).toString();
      if (!qs) return cleanUrl;
      return `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}${qs}`;
    }
    return cleanUrl;
  }

  // Web / AI Studio Preview: route via Express server proxy to avoid CORS and Mixed Content
  const search = new URLSearchParams({ url: cleanUrl, ...paramsObj });
  switch (type) {
    case 'xtream':
      return `/api/proxy/xtream?${search.toString()}`;
    case 'm3u':
      return `/api/proxy/m3u?${search.toString()}`;
    case 'get':
      return `/api/proxy/get?${search.toString()}`;
    case 'stream':
      return `/api/proxy/stream?${search.toString()}`;
    case 'epg':
      return `/api/proxy/epg?${search.toString()}`;
    case 'stalker':
      return `/api/proxy/stalker?${search.toString()}`;
    default:
      return cleanUrl;
  }
};
