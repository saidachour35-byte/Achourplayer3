// IPTV M3U & Xtream parsing/fetching helpers
import axios from 'axios';
import { Channel, Playlist } from '../types';
import { getLocalFavoriteIds } from './favoritesService';
export { isAndroid, getPlatformUrl, isNativeApp } from './platform';
import { getPlatformUrl, isNativeApp } from './platform';
import { testXtreamConnection as diagnosticTest, addToDiagnosticHistory } from './xtreamDiagnostics';
import { 
  getChannelsByPlaylistAndType,
  getCategoriesByPlaylistAndType,
  getPlaylistExtractionStatus
} from '../lib/db';

// Global cache for IPTV data to persist across component unmounts
export const iptvGlobalCache = new Map<string, { categories: any[], channels: any[] }>();

export const sanitizeM3uUrl = (url: string): string => {
  if (!url) return '';
  let clean = url.trim();
  if (clean.includes('github.com/') && clean.includes('/blob/')) {
    clean = clean.replace('github.com/', 'raw.githubusercontent.com/').replace('/blob/', '/');
  }
  return clean;
};

/**
 * Robust and efficient parser for M3U / M3U8 playlist format
 * Optimized for memory efficiency
 */
const decodeHtmlBasic = (str: string): string =>
  str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

const findUnquotedCommaIndex = (line: string): number => {
  let inSingle = false;
  let inDouble = false;
  let lastCommaOutsideQuotes = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && (inSingle || inDouble)) {
      i++;
      continue;
    }
    if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === ',' && !inSingle && !inDouble) {
      lastCommaOutsideQuotes = i;
    }
  }
  return lastCommaOutsideQuotes;
};

export const parseM3U = (data: string, favoriteIds: string[] = []): Channel[] => {
  if (!data) return [];
  const cleanData = data.replace(/^\uFEFF/, '').trim();
  if (!cleanData) return [];

  const channels: Channel[] = [];
  let currentChannel: Partial<Channel> = {};
  const effectiveFavs = favoriteIds.length > 0 ? favoriteIds : getLocalFavoriteIds();

  const lines = cleanData.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      const logoMatch = line.match(/(?:tvg-logo|tvg_logo|logo)=["']([^"']*)["']/i);
      const groupMatch = line.match(/group-title=["']([^"']*)["']/i);
      const tvgNameMatch = line.match(/(?:tvg-name|tvg_name|name)=["']([^"']*)["']/i);
      const tvgIdMatch = line.match(/tvg-id=["']([^"']*)["']/i);
      const commaIdx = findUnquotedCommaIndex(line);
      const rawAfterComma = commaIdx !== -1 ? decodeHtmlBasic(line.substring(commaIdx + 1)) : '';
      const fallbackName = tvgNameMatch ? decodeHtmlBasic(tvgNameMatch[1]) : '';

      currentChannel.name = rawAfterComma || fallbackName || 'Channel';
      currentChannel.logo = logoMatch ? logoMatch[1].trim() : undefined;
      const parsedGroup = groupMatch ? decodeHtmlBasic(groupMatch[1]) : '';
      const cleanGroup = parsedGroup.trim().toLowerCase() === 'عام (general)' ? '' : parsedGroup.trim();
      currentChannel.category = cleanGroup;
      currentChannel.category_id = cleanGroup || 'uncategorized';
      if (tvgIdMatch && tvgIdMatch[1].trim()) {
        currentChannel.epg_channel_id = tvgIdMatch[1].trim();
        currentChannel.tvg_id = tvgIdMatch[1].trim();
      }
      
      const lowerCat = (currentChannel.category || '').toLowerCase();
      if (lowerCat.includes('movie') || lowerCat.includes('film')) {
        currentChannel.type = 'movie';
      } else if (lowerCat.includes('series') || lowerCat.includes('serie')) {
        currentChannel.type = 'series';
      } else {
        currentChannel.type = 'live';
      }
    } else if (line.startsWith('http')) {
      currentChannel.url = line;
      currentChannel.id = `m3u-${channels.length}`;
      currentChannel.stream_id = currentChannel.id;
      currentChannel.isFavorite = effectiveFavs.includes(currentChannel.id);
      channels.push(currentChannel as Channel);
      currentChannel = {};
    }
  }
  return channels;
};

export const xtreamFetch = async (
  host: string, 
  user: string, 
  pass: string, 
  action: string, 
  extraParams: Record<string, string> = {},
  retries = 2,
  signal?: AbortSignal
): Promise<{ data: any; rawList: any[]; status: number; ok: boolean; error?: string }> => {
  const cleanHost = host.trim().replace(/\/+$/, '').replace(/\/(player_api|get|index)\.php.*$/i, '').replace(/\/c\/?$/i, '').replace(/\?.*$/, '');
  const apiUrl = cleanHost.startsWith('http') ? `${cleanHost}/player_api.php` : `http://${cleanHost}/player_api.php`;
  
  const queryParams: Record<string, string> = {
    username: user,
    password: pass,
    action: action,
    ...extraParams
  };

  const urlsToTry: string[] = [];
  const search = new URLSearchParams(queryParams);

  // In native Android APK, direct URL is attempted first for maximum performance and no proxy reliance
  const isPlaylistDownloadAction = action === 'get_live_streams' || action === 'get_vod_streams' || action === 'get_series';
  if (isNativeApp()) {
    urlsToTry.push(`${apiUrl}?${search.toString()}`);
    if (isPlaylistDownloadAction) {
      urlsToTry.push(`${cleanHost}/get.php?${search.toString()}`);
    }
  }
  
  // Also try platform proxy URL
  urlsToTry.push(getPlatformUrl('xtream', apiUrl, queryParams));

  const isSingleItemInfo = action === 'get_vod_info' || action === 'get_series_info' || action === 'get_short_epg';
  const attemptTimeoutMs = isSingleItemInfo ? 4500 : 15000;

  for (const fetchUrl of urlsToTry) {
    if (signal?.aborted) {
      throw new DOMException('Extraction aborted by user', 'AbortError');
    }
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), attemptTimeoutMs);
    const onExternalAbort = () => timeoutController.abort();
    signal?.addEventListener('abort', onExternalAbort, { once: true });
    try {
      const response = await fetch(fetchUrl, {
        signal: timeoutController.signal,
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': 'IPTVSmartersPro/3.1.5 (Linux; Android 12)'
        }
      });
      
      if (!response.ok && response.status !== 884) {
        continue;
      }
      
      const rawText = await response.text();
      if (signal?.aborted) {
        throw new DOMException('Extraction aborted by user', 'AbortError');
      }
      const text = rawText.replace(/^\uFEFF/, '').trim();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch (e) {
        continue;
      }
      
      let rawList: any[] = [];
      if (Array.isArray(data)) {
        rawList = data;
      } else if (data && typeof data === 'object') {
        rawList = data.streams || data.live_streams || data.vod_streams || data.series || data.data || [];
        if (rawList.length === 0) {
          const values = Object.values(data);
          if (values.length > 0 && typeof values[0] === 'object' && values[0] !== null) {
            rawList = values;
          }
        }
      }

      return { data, rawList: Array.isArray(rawList) ? rawList : [], status: response.status, ok: true };
    } catch (err: any) {
      if (signal?.aborted) {
        throw err;
      }
      console.warn(`[xtreamFetch] Attempt failed for ${fetchUrl}:`, err?.message || err);
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  return { data: null, rawList: [], status: 0, ok: false, error: 'Failed to fetch from Xtream provider' };
};

export const fetchChannelsForType = async (
  playlist: Playlist,
  typeToLoad: 'live' | 'movie' | 'series',
  favoriteIds: string[] = [],
  forceRefresh = false
): Promise<{ categories: any[]; channels: any[] }> => {
  if (!playlist) return { categories: [], channels: [] };
  const playlistId = playlist.id;

  // Check extraction status first - if type is already extracted (e.g. Live ready while Movies/Series extract), load instantly
  if (!forceRefresh) {
    const status = await getPlaylistExtractionStatus(playlistId);
    const isTypeReady =
      status &&
      (status.stage === 'completed' ||
        status.completedTypes?.includes(typeToLoad) ||
        (typeToLoad === 'live' && status.liveReady));

    if (isTypeReady) {
      const cachedCategories = await getCategoriesByPlaylistAndType(playlistId, typeToLoad);
      const cachedChannels = await getChannelsByPlaylistAndType(playlistId, typeToLoad);
      if (cachedChannels.length > 0 || cachedCategories.length > 0) {
        return { categories: cachedCategories, channels: cachedChannels };
      }
    }
  }

  // Fallback direct on-demand fetch if not yet extracted
  if (playlist.type === 'xtream') {
    const rawHost = playlist.url || playlist.portal || '';
    let cleanHost = rawHost.trim().replace(/\/+$/, '').replace(/\/(player_api|get|index)\.php.*$/i, '');
    if (cleanHost && !cleanHost.startsWith('http')) cleanHost = 'http://' + cleanHost;

    const actionMap = {
      live: { action: 'get_live_streams', catAction: 'get_live_categories' },
      movie: { action: 'get_vod_streams', catAction: 'get_vod_categories' },
      series: { action: 'get_series', catAction: 'get_series_categories' }
    };

    const targetAction = actionMap[typeToLoad];
    if (targetAction) {
      try {
        const [catRes, streamRes] = await Promise.all([
          xtreamFetch(cleanHost, playlist.username || '', playlist.password || '', targetAction.catAction),
          xtreamFetch(cleanHost, playlist.username || '', playlist.password || '', targetAction.action)
        ]);

        let finalCats: any[] = [];
        const catNameMap = new Map<string, string>();
        if (catRes.ok && catRes.rawList) {
          finalCats = catRes.rawList.map((c: any) => {
            const cid = String(c.category_id || c.id);
            const cname = String(c.category_name || c.name || '');
            if (cid && cname) catNameMap.set(cid, cname);
            return {
              category_id: cid,
              category_name: cname,
              type: typeToLoad
            };
          });
        }

        let streams: any[] = [];
        if (streamRes.ok && streamRes.rawList) {
          streams = streamRes.rawList.map((s: any, idx: number) => {
            const rawStreamId = String(s.stream_id || s.series_id || s.id || idx);
            const cleanStreamId = rawStreamId.replace(/\.(m3u8|ts|mp4|mkv|avi|flv)$/i, '');
            const ext = s.container_extension || (typeToLoad === 'live' ? 'm3u8' : 'mp4');
            const streamType = typeToLoad === 'series' ? 'series' : typeToLoad === 'movie' ? 'movie' : 'live';
            const streamUrl = s.url || s.direct_source || `${cleanHost}/${streamType}/${encodeURIComponent(playlist.username || '')}/${encodeURIComponent(playlist.password || '')}/${cleanStreamId}.${ext}`;
            const channelId = `${playlistId}_${typeToLoad}_${cleanStreamId}`;
            const streamLogo = s.stream_icon || s.cover || s.logo || undefined;
            const resolvedName =
              [s.name, s.stream_display_name, s.title, s.tvg_name, s.channel_name]
                .find((v) => typeof v === 'string' && v.trim().length > 0)
                ?.trim() || `Stream ${idx + 1}`;
            const epgId = s.epg_channel_id ? String(s.epg_channel_id).trim() : (s.tvg_id ? String(s.tvg_id).trim() : undefined);
            const rawCatId = String(s.category_id || '');
            const resolvedCat = String(s.category_name || catNameMap.get(rawCatId) || '').trim();
            const cleanCat = resolvedCat.toLowerCase() === 'عام (general)' ? '' : resolvedCat;
            return {
              id: channelId,
              stream_id: cleanStreamId,
              name: decodeHtmlBasic(resolvedName),
              logo: streamLogo,
              stream_icon: streamLogo,
              cover: streamLogo,
              category: cleanCat,
              category_name: cleanCat,
              category_id: rawCatId || 'uncategorized',
              url: streamUrl,
              type: typeToLoad,
              epg_channel_id: epgId,
              tvg_id: s.tvg_id ? String(s.tvg_id).trim() : epgId,
              plot: s.plot || s.description || undefined,
              cast: s.cast || undefined,
              director: s.director || undefined,
              genre: s.genre || undefined,
              rating: s.rating || s.rating_5based || undefined,
              releaseDate: s.releaseDate || s.releasedate || s.year || undefined,
              duration: s.duration || undefined,
            };
          });
        }

        return { categories: finalCats, channels: streams };
      } catch (e) {
        console.warn('[fetchChannelsForType] On-demand fallback error:', e);
      }
    }
  }

  return { categories: [], channels: [] };
};


export const fetchChannels = async (playlist: Playlist, favoriteIds: string[] = [], forceRefresh = false): Promise<Channel[]> => {
  if (!playlist) return [];
  const playlistId = playlist.id;

  if (!forceRefresh) {
    const status = await getPlaylistExtractionStatus(playlistId);
    if (status && status.stage === 'completed') {
      const live = await getChannelsByPlaylistAndType(playlistId, 'live');
      const movie = await getChannelsByPlaylistAndType(playlistId, 'movie');
      const series = await getChannelsByPlaylistAndType(playlistId, 'series');
      return [...live, ...movie, ...series];
    }
  }

  return [];
};

export const testXtreamConnection = async (url: string, username: string, password: string) => {
  const result = await diagnosticTest(url, username, password);
  addToDiagnosticHistory(result);
  return result;
};



