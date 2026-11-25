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

// External standalone players (such as MX Player, Nova, Just Player, Kodi, etc.)
// run in separate Android activities and cannot be embedded inside AchourTV's mini-player,
// preview window, or remote control bar. Per strict criteria, all incompatible external
// players have been removed, leaving full embedded playback to the internal ExoPlayer engine.
export const EXTERNAL_PLAYER_PROFILES: ExternalPlayerProfile[] = [];

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

const EXTRA_KNOWN_PACKAGE_ALIASES: Array<{ keywords: string[]; packageName: string; fallbackPackages?: string[] }> = [
  { keywords: ['vlc'], packageName: 'org.videolan.vlc', fallbackPackages: ['org.videolan.vlc.betav7neon', 'org.videolan.vlc.debug'] },
  { keywords: ['mx player', 'mxplayer', 'mx pro'], packageName: 'com.mxtech.videoplayer.ad', fallbackPackages: ['com.mxtech.videoplayer.pro'] },
  { keywords: ['vimu'], packageName: 'net.gtvbox.videoplayer' },
  { keywords: ['kodi', 'xbmc'], packageName: 'org.xbmc.kodi' },
  { keywords: ['kmplayer', 'km player'], packageName: 'com.kmplayer', fallbackPackages: ['com.kmplayer.pro'] },
  { keywords: ['wuffy'], packageName: 'co.wuffy.player' },
  { keywords: ['nova'], packageName: 'org.courville.nova' },
  { keywords: ['just player', 'justplayer'], packageName: 'com.brouken.player' },
  { keywords: ['mpv'], packageName: 'is.xyz.mpv' },
  { keywords: ['playerxtreme', 'player xtreme'], packageName: 'xyz.playerxtreme.media' },
  { keywords: ['bsplayer', 'bs player'], packageName: 'com.bsplayer.bspandroid.free', fallbackPackages: ['com.bsplayer.bspandroid.full'] },
  { keywords: ['nplayer'], packageName: 'com.newin.nplayer.pro' },
  { keywords: ['archos'], packageName: 'com.archos.mediacenter.video', fallbackPackages: ['com.archos.mediacenter.videofree'] },
  { keywords: ['wiseplay'], packageName: 'com.wiseplay' },
  { keywords: ['bubbleupnp'], packageName: 'com.bubblesoft.android.bubbleupnp' },
  { keywords: ['tivimate'], packageName: 'com.tivimate.player' },
];

export function resolveExternalPlayerProfile(playerName: string): ExternalPlayerProfile {
  const target = String(playerName || '').trim();
  const lower = target.toLowerCase();

  for (const profile of EXTERNAL_PLAYER_PROFILES) {
    if (
      profile.id.toLowerCase() === lower ||
      profile.name.toLowerCase() === lower ||
      (profile.packageName && profile.packageName.toLowerCase() === lower) ||
      profile.fallbackPackages?.some((fp) => fp.toLowerCase() === lower) ||
      profile.aliases.some((alias) => alias.toLowerCase() === lower)
    ) {
      return profile;
    }
  }

  const savedPkg = getCustomPlayerPackage(target);
  const looksLikePackage = /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+$/.test(target);
  let pkg = savedPkg || (looksLikePackage ? target : '');
  let fallbackPackages: string[] | undefined;

  if (!pkg) {
    const matchedAlias = EXTRA_KNOWN_PACKAGE_ALIASES.find((entry) =>
      entry.keywords.some((kw) => lower.includes(kw))
    );
    if (matchedAlias) {
      pkg = matchedAlias.packageName;
      fallbackPackages = matchedAlias.fallbackPackages;
    }
  }

  return {
    id: target || 'External Player',
    name: target || 'External Player',
    packageName: pkg,
    fallbackPackages,
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

  if (packageName === '__achour_native_system__') {
    return { installed: true, resolvedPackage: '__achour_native_system__' };
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
  const profile = resolveExternalPlayerProfile(options?.playerName || 'External Player');
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
