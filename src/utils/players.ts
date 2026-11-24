// External Android/Fire TV player profiles and launcher
import { isNativeApp } from './platform';

export interface ExternalPlayerProfile {
  id: string;
  name: string;
  packageName: string;
  fallbackPackages?: string[];
  fireTvCompatible: boolean;
  aliases: string[];
}

export type ExternalLaunchFailureReason =
  | 'firetv_incompatible'
  | 'not_installed'
  | 'unsupported_platform'
  | 'missing_url'
  | 'launch_failed';

export interface ExternalLaunchResult {
  ok: boolean;
  reason?: ExternalLaunchFailureReason;
  resolvedPackage?: string;
  errorMessage?: string;
  profile: ExternalPlayerProfile;
}

export const CUSTOM_PLAYER_PKG_STORAGE_KEY = 'achour_custom_player_packages_v1';

export const EXTERNAL_PLAYER_PROFILES: ExternalPlayerProfile[] = [
  {
    id: 'VLC for Android',
    name: 'VLC for Android',
    packageName: 'org.videolan.vlc',
    fallbackPackages: ['org.videolan.vlc.betav7neon', 'org.videolan.vlc.debug'],
    fireTvCompatible: true,
    aliases: ['VLC', 'VLC Media Player', 'org.videolan.vlc'],
  },
  {
    id: 'MX Player Pro',
    name: 'MX Player',
    packageName: 'com.mxtech.videoplayer.ad',
    fallbackPackages: ['com.mxtech.videoplayer.pro'],
    fireTvCompatible: true,
    aliases: ['MX Player', 'MX Player Pro', 'com.mxtech.videoplayer.ad', 'com.mxtech.videoplayer.pro'],
  },
  {
    id: 'Nova Video Player',
    name: 'Nova Video Player',
    packageName: 'org.courville.nova',
    fireTvCompatible: true,
    aliases: ['Nova Player', 'org.courville.nova'],
  },
  {
    id: 'Just Player',
    name: 'Just Player',
    packageName: 'com.brouken.player',
    fireTvCompatible: true,
    aliases: ['com.brouken.player'],
  },
  {
    id: 'MPV Player',
    name: 'MPV Player',
    packageName: 'is.xyz.mpv',
    fireTvCompatible: true,
    aliases: ['is.xyz.mpv'],
  },
];

export const DEFAULT_PLAYERS = EXTERNAL_PLAYER_PROFILES;

export function isFireTVDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  try {
    const native = (window as any).AchourNative;
    if (native?.isTvDevice?.()) return true;
  } catch {
    // ignore
  }
  const ua = navigator.userAgent || '';
  return /AFT[A-Z0-9]*|Fire\s?TV|Amazon|Silk\//i.test(ua);
}

function readCustomPlayerPackagesMap(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(CUSTOM_PLAYER_PKG_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getCustomPlayerPackage(playerName: string): string {
  const key = String(playerName || '').trim();
  if (!key) return '';
  const map = readCustomPlayerPackagesMap();
  return typeof map[key] === 'string' ? map[key].trim() : '';
}

export function saveCustomPlayerPackage(playerName: string, packageName: string): void {
  if (typeof localStorage === 'undefined') return;
  const key = String(playerName || '').trim();
  const pkg = String(packageName || '').trim();
  if (!key || !pkg) return;
  try {
    const map = readCustomPlayerPackagesMap();
    map[key] = pkg;
    localStorage.setItem(CUSTOM_PLAYER_PKG_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function removeCustomPlayerPackage(playerName: string): void {
  if (typeof localStorage === 'undefined') return;
  const key = String(playerName || '').trim();
  if (!key) return;
  try {
    const map = readCustomPlayerPackagesMap();
    if (key in map) {
      delete map[key];
      localStorage.setItem(CUSTOM_PLAYER_PKG_STORAGE_KEY, JSON.stringify(map));
    }
  } catch {
    // ignore
  }
}

export function resolveExternalPlayerProfile(playerName: string): ExternalPlayerProfile {
  const target = String(playerName || '').trim();
  const lower = target.toLowerCase();

  for (const profile of EXTERNAL_PLAYER_PROFILES) {
    if (
      profile.id.toLowerCase() === lower ||
      profile.name.toLowerCase() === lower ||
      profile.packageName.toLowerCase() === lower ||
      profile.fallbackPackages?.some((fp) => fp.toLowerCase() === lower) ||
      profile.aliases.some((alias) => alias.toLowerCase() === lower)
    ) {
      return profile;
    }
  }

  const savedPkg = getCustomPlayerPackage(target);
  const looksLikePackage = /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+$/.test(target);
  const pkg = savedPkg || (looksLikePackage ? target : '');

  if (lower.includes('kodi')) {
    return {
      id: target || 'Kodi',
      name: target || 'Kodi',
      packageName: pkg || 'org.xbmc.kodi',
      fireTvCompatible: true,
      aliases: ['Kodi', 'org.xbmc.kodi'],
    };
  }

  return {
    id: target || 'External Player',
    name: target || 'External Player',
    packageName: pkg,
    fireTvCompatible: true,
    aliases: target ? [target] : [],
  };
}

export async function probeExternalPlayerInstalled(
  packageName: string,
  fallbackPackages?: string[]
): Promise<{ installed: boolean | 'unknown'; resolvedPackage?: string }> {
  const native = typeof window !== 'undefined' ? (window as any).AchourNative : null;
  if (!isNativeApp() || !native) {
    return { installed: 'unknown', resolvedPackage: packageName };
  }

  const candidates = [packageName, ...(fallbackPackages || [])]
    .map((p) => String(p || '').trim())
    .filter(Boolean);

  if (candidates.length === 0) {
    return { installed: 'unknown', resolvedPackage: '' };
  }

  try {
    if (typeof native.resolveExternalPlayerPackage === 'function') {
      const resolved = String(native.resolveExternalPlayerPackage(JSON.stringify(candidates)) || '').trim();
      return resolved
        ? { installed: true, resolvedPackage: resolved }
        : { installed: false, resolvedPackage: packageName };
    }
    if (typeof native.isPackageInstalled === 'function') {
      for (const pkg of candidates) {
        if (native.isPackageInstalled(pkg)) {
          return { installed: true, resolvedPackage: pkg };
        }
      }
      return { installed: false, resolvedPackage: packageName };
    }
  } catch {
    // ignore
  }

  return { installed: 'unknown', resolvedPackage: packageName };
}

export interface LaunchExternalPlayerSessionOptions {
  streamUrl: string;
  playerName: string;
  title?: string;
  logo?: string;
  streamId?: string;
  mediaType?: 'live' | 'movie' | 'series';
  isFavorite?: boolean;
  isAndroidEnv?: boolean;
  headers?: Record<string, string>;
  userAgent?: string;
  referer?: string;
  positionMs?: number;
}

export async function launchExternalPlayerSession(
  options: LaunchExternalPlayerSessionOptions
): Promise<ExternalLaunchResult> {
  const profile = resolveExternalPlayerProfile(options?.playerName || 'VLC for Android');
  const streamUrl = String(options?.streamUrl || '').trim();

  if (!streamUrl) {
    return {
      ok: false,
      reason: 'missing_url',
      resolvedPackage: profile.packageName,
      profile,
    };
  }

  const native = typeof window !== 'undefined' ? (window as any).AchourNative : null;
  const hasNativeBridge = isNativeApp() && Boolean(native && typeof native.launchExternalPlayer === 'function');

  if (!hasNativeBridge) {
    return {
      ok: false,
      reason: 'unsupported_platform',
      resolvedPackage: profile.packageName,
      profile,
    };
  }

  // Ensure any stale native WebView cutout classes are cleared before leaving to external Activity
  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('native-player-active', 'native-player-preview');
    document.body.classList.remove('native-player-active', 'native-player-preview');
    document.documentElement.style.removeProperty('--native-preview-clip');
  }

  try {
    const mergedHeaders: Record<string, string> = {
      ...(options.headers && typeof options.headers === 'object' ? options.headers : {}),
    };
    if (options.userAgent && !mergedHeaders['User-Agent']) {
      mergedHeaders['User-Agent'] = options.userAgent;
    }
    if (options.referer && !mergedHeaders['Referer']) {
      mergedHeaders['Referer'] = options.referer;
    }

    const payload = {
      url: streamUrl,
      packageName: profile.packageName || '',
      fallbackPackages: profile.fallbackPackages || [],
      title: options.title || 'Achour Player',
      isLive: options.mediaType === 'live',
      mediaType: options.mediaType || 'live',
      headers: mergedHeaders,
      userAgent: options.userAgent || mergedHeaders['User-Agent'] || '',
      referer: options.referer || mergedHeaders['Referer'] || '',
      positionMs: typeof options.positionMs === 'number' && options.positionMs > 0 ? Math.round(options.positionMs) : 0,
    };

    const rawRes = native.launchExternalPlayer(JSON.stringify(payload));
    const parsed = rawRes ? JSON.parse(rawRes) : null;

    if (parsed && parsed.ok === true) {
      return {
        ok: true,
        resolvedPackage: parsed.resolvedPackage || profile.packageName,
        profile,
      };
    }

    return {
      ok: false,
      reason: (parsed?.reason as ExternalLaunchFailureReason) || 'launch_failed',
      resolvedPackage: parsed?.resolvedPackage || profile.packageName,
      errorMessage: parsed?.errorMessage,
      profile,
    };
  } catch (err: any) {
    return {
      ok: false,
      reason: 'launch_failed',
      resolvedPackage: profile.packageName,
      errorMessage: err?.message || String(err || ''),
      profile,
    };
  }
}
