// Unified HLS & stream configuration helpers
import Hls, { HlsConfig } from 'hls.js';
import { getPlatformUrl } from './platform';
import { isTVOrLowEndDevice } from './tvNavigation';

export function createUnifiedHlsConfig(
  isLive: boolean,
  isPreview: boolean,
  slotCount: number = 1,
  isMultiScreen: boolean = false
): Partial<HlsConfig> {
  const lowMem = isTVOrLowEndDevice();
  const isMulti = isMultiScreen || slotCount >= 2;

  return {
    enableWorker: true,
    lowLatencyMode: false,
    startFragPrefetch: isLive,
    backBufferLength: isMulti ? 6 : (lowMem ? 12 : 30),
    maxBufferLength: isMulti ? 15 : (lowMem ? 20 : 60),
    maxMaxBufferLength: isMulti ? 30 : (lowMem ? 45 : 120),
    maxBufferSize: isMulti
      ? 12 * 1024 * 1024
      : (lowMem ? 48 * 1024 * 1024 : 128 * 1024 * 1024),
    liveSyncDurationCount: 2,
    liveMaxLatencyDurationCount: isMulti ? 10 : Infinity,
    liveDurationInfinity: isLive,
    maxLiveSyncPlaybackRate: 1,
    maxAudioFramesDrift: 1,
    maxBufferHole: 0.5,
    highBufferWatchdogPeriod: isMulti ? 2 : 0,
    maxStarvationDelay: 4,
    nudgeOffset: 0.1,
    nudgeMaxRetry: 3,
    manifestLoadingMaxRetry: 2,
    manifestLoadingRetryDelay: 400,
    manifestLoadingMaxRetryTimeout: 4000,
    levelLoadingMaxRetry: 2,
    levelLoadingRetryDelay: 400,
    levelLoadingMaxRetryTimeout: 4000,
    fragLoadingMaxRetry: 3,
    fragLoadingRetryDelay: 500,
    fragLoadingMaxRetryTimeout: 6000,
    startLevel: isMulti ? 0 : -1,
    capLevelToPlayerSize: isMulti ? true : (lowMem && isPreview),
    testBandwidth: false,
    appendErrorMaxRetry: 4
  };
}

export function resolveUnifiedStreamUrls(
  rawUrl: string,
  isLive: boolean,
  isNativeActive: boolean
) {
  let playUrl = rawUrl || '';
  if (!isNativeActive && isLive && playUrl) {
    if (playUrl.includes('/live/') && playUrl.endsWith('.ts')) {
      playUrl = playUrl.replace(/\.ts$/, '.m3u8');
    } else if (playUrl.endsWith('.ts')) {
      playUrl = playUrl.replace(/\.ts$/, '.m3u8');
    }
  }

  const activeStreamUrl =
    playUrl &&
    (playUrl.startsWith('http://') || playUrl.startsWith('https://')) &&
    !playUrl.includes('/api/proxy/stream')
      ? getPlatformUrl('stream', playUrl)
      : playUrl;

  const rawSourceNoQuery = String(playUrl || rawUrl || '')
    .split('?')[0]
    .toLowerCase();
  const isDirectVideoContainer = /\.(mp4|mkv|avi|mov|webm|m4v|flv|wmv|ts)$/i.test(rawSourceNoQuery);
  const isExplicitHls =
    rawSourceNoQuery.includes('.m3u8') ||
    rawSourceNoQuery.includes('smil:') ||
    String(activeStreamUrl || '').toLowerCase().includes('.m3u8');
  const isHls = isLive
    ? isExplicitHls || !/\.(mp4|mkv|avi|mov|webm|m4v|flv)$/i.test(rawSourceNoQuery)
    : isExplicitHls || !isDirectVideoContainer;

  return {
    playUrl,
    activeStreamUrl,
    rawSourceNoQuery,
    isDirectVideoContainer,
    isExplicitHls,
    isHls
  };
}

export function buildUnifiedNativeHeaders(mediaAny: any): Record<string, string> | undefined {
  const customHeaders: Record<string, string> = {};
  if (mediaAny?.headers && typeof mediaAny.headers === 'object') {
    Object.entries(mediaAny.headers).forEach(([k, v]) => {
      if (typeof v === 'string' && v.trim()) customHeaders[k] = v.trim();
    });
  }
  const customUa = mediaAny?.userAgent || mediaAny?.http_user_agent;
  if (typeof customUa === 'string' && customUa.trim()) {
    customHeaders['User-Agent'] = customUa.trim();
  }
  const customRef = mediaAny?.referer || mediaAny?.http_referrer;
  if (typeof customRef === 'string' && customRef.trim()) {
    customHeaders['Referer'] = customRef.trim();
  }
  return Object.keys(customHeaders).length > 0 ? customHeaders : undefined;
}

export { Hls };
