// Watch History Persistence Service for Achour Player (Live, Movies & Series)
import { ParsedChannel } from '../components/LivePlayer';

export type WatchHistoryType = 'live' | 'movie' | 'series' | 'vod';
export const WATCH_HISTORY_CAT_ID = 'watch_history_cat';

const MAX_HISTORY_ITEMS = 80;

const normalizeType = (type: string): 'live' | 'movie' | 'series' => {
  const t = String(type || '').toLowerCase();
  if (t === 'series') return 'series';
  if (t === 'movie' || t === 'vod') return 'movie';
  return 'live';
};

const getStorageKey = (type: string, playlistId?: string): string => {
  const normType = normalizeType(type);
  const pid = playlistId && playlistId !== 'default' ? playlistId : 'global';
  return `achour_watch_history_${pid}_${normType}`;
};

const getLegacyKey = (type: string): string => {
  return `achour_watch_history_${normalizeType(type)}`;
};

const getLastWatchedKey = (playlistId?: string): string => {
  const pid = playlistId && playlistId !== 'default' ? playlistId : 'global';
  return `achour_last_watched_channel_${pid}`;
};

// In-memory cache to avoid repeated JSON parses during rapid renders
const memoryCache = new Map<string, ParsedChannel[]>();

export const getWatchHistory = (type: string, playlistId?: string): ParsedChannel[] => {
  if (typeof window === 'undefined') return [];
  const key = getStorageKey(type, playlistId);
  if (memoryCache.has(key)) {
    return memoryCache.get(key) || [];
  }

  try {
    let raw = localStorage.getItem(key);
    if (!raw) {
      // Check legacy key
      const legacyKey = getLegacyKey(type);
      raw = localStorage.getItem(legacyKey);
    }

    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        memoryCache.set(key, parsed);
        return parsed;
      }
    }
  } catch (e) {
    console.warn('[watchHistoryService] Failed to load history:', e);
  }

  memoryCache.set(key, []);
  return [];
};

export const addToWatchHistory = (type: string, channel: ParsedChannel, playlistId?: string): void => {
  if (typeof window === 'undefined' || !channel) return;
  const targetId = String(channel.stream_id || (channel as any).id || '').trim();
  if (!targetId) return;

  const key = getStorageKey(type, playlistId);
  const current = getWatchHistory(type, playlistId);

  // Remove existing instance to move it to the very front (most recent)
  const filtered = current.filter(item => {
    const sid = String(item.stream_id || (item as any).id || '').trim();
    return sid !== targetId;
  });

  const updated: ParsedChannel[] = [
    {
      ...channel,
      type: normalizeType(type)
    },
    ...filtered
  ].slice(0, MAX_HISTORY_ITEMS);

  memoryCache.set(key, updated);

  try {
    localStorage.setItem(key, JSON.stringify(updated));
    // Also save legacy key for backward compatibility
    localStorage.setItem(getLegacyKey(type), JSON.stringify(updated));
  } catch (e) {
    console.warn('[watchHistoryService] Failed to persist history:', e);
  }

  // Notify components
  try {
    window.dispatchEvent(new CustomEvent('achour_watch_history_changed', { detail: { type, playlistId } }));
  } catch {}
};

export const saveLastWatchedChannel = (channel: ParsedChannel, playlistId?: string): void => {
  if (typeof window === 'undefined' || !channel) return;
  const record = {
    channel,
    timestamp: Date.now()
  };

  try {
    const key = getLastWatchedKey(playlistId);
    localStorage.setItem(key, JSON.stringify(record));
    localStorage.setItem('achour_last_watched_channel', JSON.stringify(record));
  } catch (e) {
    console.warn('[watchHistoryService] Failed to save last watched channel:', e);
  }
};

export const getLastWatchedChannel = (playlistId?: string): { channel: ParsedChannel; timestamp: number } | null => {
  if (typeof window === 'undefined') return null;
  try {
    const key = getLastWatchedKey(playlistId);
    let raw = localStorage.getItem(key);
    if (!raw) {
      raw = localStorage.getItem('achour_last_watched_channel');
    }
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.channel) return parsed;
    }
  } catch {}
  return null;
};

export const getLatestWatchedChannel = (playlistId?: string): ParsedChannel | null => {
  const rec = getLastWatchedChannel(playlistId);
  return rec?.channel || null;
};

export const clearWatchHistoryByType = (type: string, playlistId?: string): void => {
  if (typeof window === 'undefined') return;
  const key = getStorageKey(type, playlistId);
  memoryCache.delete(key);

  try {
    localStorage.removeItem(key);
    localStorage.removeItem(getLegacyKey(type));

    // Clear all per-playlist variations for this type
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('achour_watch_history_') && k.endsWith(`_${normalizeType(type)}`)) {
        localStorage.removeItem(k);
        memoryCache.delete(k);
      }
    }
  } catch (e) {
    console.warn('[watchHistoryService] Failed to clear history by type:', e);
  }

  try {
    window.dispatchEvent(new CustomEvent('achour_watch_history_changed', { detail: { type, playlistId } }));
  } catch {}
};

export const clearWatchHistory = (playlistId?: string): void => {
  clearWatchHistoryByType('live', playlistId);
  clearWatchHistoryByType('movie', playlistId);
  clearWatchHistoryByType('series', playlistId);
};
