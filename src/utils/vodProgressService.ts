// VOD & Series Progress Persistence Service for Achour Player (Continue Watching)
import { ParsedChannel } from '../components/LivePlayer';

export const MIN_RESUME_POSITION_SEC = 5;
export const MIN_RESUME_POS_SEC = 5;
export const MIN_COMPLETION_POS_SEC = 300;
export const CONTINUE_WATCHING_CAT_ID = 'continue_watching';

export interface VodProgressSnapshot {
  mediaTitle?: string;
  streamIcon?: string;
  categoryId?: string;
  categoryName?: string;
  mediaUrl?: string;
  containerExtension?: string;
  rating?: string;
  releaseDate?: string;
  durationLabel?: string;
}

export interface VodProgressRecord {
  id: string;
  mediaType: 'movie' | 'series';
  playlistId: string;
  streamId: string;
  seriesId?: string;
  episodeId?: string;
  seasonNum?: number;
  episodeNum?: number;
  episodeTitle?: string;
  positionSec: number;
  durationSec: number;
  completed: boolean;
  updatedAt: number;
  legacyEpisodeIndex?: number;
  snapshot?: VodProgressSnapshot;
}

export const cleanVodEntityId = (id: any, _playlistId?: string, _seriesId?: string): string => {
  if (id === null || id === undefined) return '';
  return String(id).trim();
};

export const formatPlaybackClock = (sec: number): string => {
  if (!Number.isFinite(sec) || sec <= 0) return '00:00';
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const buildRecordKey = (
  playlistId: string,
  mediaType: 'movie' | 'series' | 'live',
  streamId: string,
  seriesId?: string,
  episodeId?: string
): string => {
  const pid = playlistId && playlistId !== 'default' ? playlistId : 'global';
  const cleanSid = cleanVodEntityId(streamId);
  if (mediaType === 'series' || seriesId) {
    const sId = cleanVodEntityId(seriesId || streamId);
    const epId = cleanVodEntityId(episodeId || streamId);
    return `${pid}_series_${sId}_${epId}`;
  }
  return `${pid}_movie_${cleanSid}`;
};

// In-memory master progress dictionary
let inMemoryStore: Record<string, VodProgressRecord> | null = null;

const getProgressStore = (): Record<string, VodProgressRecord> => {
  if (inMemoryStore !== null) {
    return inMemoryStore;
  }

  const store: Record<string, VodProgressRecord> = {};
  if (typeof window === 'undefined') {
    inMemoryStore = store;
    return store;
  }

  try {
    // 1. Read global store
    const globalRaw = localStorage.getItem('achour_vod_progress');
    if (globalRaw) {
      try {
        const parsed = JSON.parse(globalRaw);
        if (parsed && typeof parsed === 'object') {
          Object.assign(store, parsed);
        }
      } catch {}
    }

    // 2. Scan per-playlist keys or legacy continue_watching keys without losing any past data
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('achour_vod_progress_') || k.startsWith('achour_continue_watching_'))) {
        try {
          const val = localStorage.getItem(k);
          if (val) {
            const p = JSON.parse(val);
            if (p && typeof p === 'object') {
              if (Array.isArray(p)) {
                p.forEach((item: any) => {
                  if (item && item.id) store[item.id] = item;
                });
              } else {
                Object.assign(store, p);
              }
            }
          }
        } catch {}
      }
    }
  } catch (e) {
    console.warn('[vodProgressService] Failed to load progress store:', e);
  }

  inMemoryStore = store;
  return store;
};

const persistProgressStore = (store: Record<string, VodProgressRecord>, playlistId?: string) => {
  if (typeof window === 'undefined') return;
  inMemoryStore = store;

  try {
    const serialized = JSON.stringify(store);
    localStorage.setItem('achour_vod_progress', serialized);

    if (playlistId && playlistId !== 'default') {
      const pid = playlistId;
      const perPlStore: Record<string, VodProgressRecord> = {};
      for (const k in store) {
        if (k.startsWith(`${pid}_`)) {
          perPlStore[k] = store[k];
        }
      }
      localStorage.setItem(`achour_vod_progress_${pid}`, JSON.stringify(perPlStore));
    }
  } catch (e) {
    console.warn('[vodProgressService] Failed to persist progress store:', e);
  }
};

export const saveVodProgress = (params: {
  mediaType: 'movie' | 'series';
  playlistId: string;
  streamId: string;
  seriesId?: string;
  episodeId?: string;
  seasonNum?: number;
  episodeNum?: number;
  episodeTitle?: string;
  positionSec: number;
  durationSec: number;
  legacyEpisodeIndex?: number;
  notify?: boolean;
  snapshot?: VodProgressSnapshot;
}): void => {
  if (typeof window === 'undefined') return;
  const {
    mediaType,
    playlistId,
    streamId,
    seriesId,
    episodeId,
    seasonNum,
    episodeNum,
    episodeTitle,
    positionSec,
    durationSec,
    legacyEpisodeIndex,
    notify = false,
    snapshot
  } = params;

  if (!streamId || !Number.isFinite(positionSec)) return;

  const key = buildRecordKey(playlistId, mediaType, streamId, seriesId, episodeId);
  const store = getProgressStore();
  const existing = store[key];

  // Completed threshold: 95% or within 15 seconds of the end
  const isCompleted = durationSec > 0 && positionSec >= Math.max(30, durationSec - 15);

  const updatedRecord: VodProgressRecord = {
    id: key,
    mediaType,
    playlistId: playlistId || 'global',
    streamId: cleanVodEntityId(streamId),
    seriesId: seriesId ? cleanVodEntityId(seriesId) : undefined,
    episodeId: episodeId ? cleanVodEntityId(episodeId) : undefined,
    seasonNum: seasonNum ?? existing?.seasonNum,
    episodeNum: episodeNum ?? existing?.episodeNum,
    episodeTitle: episodeTitle || existing?.episodeTitle,
    positionSec: Math.floor(positionSec),
    durationSec: Math.floor(durationSec || existing?.durationSec || 0),
    completed: isCompleted,
    updatedAt: Date.now(),
    legacyEpisodeIndex: legacyEpisodeIndex ?? existing?.legacyEpisodeIndex,
    snapshot: snapshot || existing?.snapshot
  };

  store[key] = updatedRecord;
  persistProgressStore(store, playlistId);

  if (notify) {
    try {
      window.dispatchEvent(
        new CustomEvent('achour_vod_progress_changed', { detail: { key, record: updatedRecord } })
      );
    } catch {}
  }
};

export const markVodCompleted = (params: {
  mediaType: 'movie' | 'series';
  playlistId: string;
  streamId: string;
  seriesId?: string;
  episodeId?: string;
  seasonNum?: number;
  episodeNum?: number;
  episodeTitle?: string;
  durationSec?: number;
  legacyEpisodeIndex?: number;
}): void => {
  if (typeof window === 'undefined') return;
  const { mediaType, playlistId, streamId, seriesId, episodeId, durationSec } = params;
  const key = buildRecordKey(playlistId, mediaType, streamId, seriesId, episodeId);
  const store = getProgressStore();
  const existing = store[key];

  if (existing) {
    existing.completed = true;
    existing.positionSec = Math.floor(durationSec || existing.durationSec || 0);
    existing.updatedAt = Date.now();
  } else {
    store[key] = {
      id: key,
      mediaType,
      playlistId: playlistId || 'global',
      streamId: cleanVodEntityId(streamId),
      seriesId: seriesId ? cleanVodEntityId(seriesId) : undefined,
      episodeId: episodeId ? cleanVodEntityId(episodeId) : undefined,
      seasonNum: params.seasonNum,
      episodeNum: params.episodeNum,
      episodeTitle: params.episodeTitle,
      positionSec: Math.floor(durationSec || 0),
      durationSec: Math.floor(durationSec || 0),
      completed: true,
      updatedAt: Date.now(),
      legacyEpisodeIndex: params.legacyEpisodeIndex
    };
  }

  persistProgressStore(store, playlistId);

  try {
    window.dispatchEvent(
      new CustomEvent('achour_vod_progress_changed', { detail: { key, completed: true } })
    );
  } catch {}
};

export const clearVodProgress = (params: {
  mediaType: 'movie' | 'series';
  playlistId: string;
  streamId: string;
  seriesId?: string;
  episodeId?: string;
  legacyEpisodeIndex?: number;
}): void => {
  if (typeof window === 'undefined') return;
  const { mediaType, playlistId, streamId, seriesId, episodeId } = params;
  const key = buildRecordKey(playlistId, mediaType, streamId, seriesId, episodeId);
  const store = getProgressStore();

  if (store[key]) {
    delete store[key];
    persistProgressStore(store, playlistId);
  }

  try {
    window.dispatchEvent(
      new CustomEvent('achour_vod_progress_changed', { detail: { key, cleared: true } })
    );
  } catch {}
};

export const getVodProgress = (query: {
  mediaType: 'movie' | 'series' | 'live';
  playlistId: string;
  streamId: string;
  seriesId?: string;
  episodeId?: string;
  legacyEpisodeIndex?: number;
}): VodProgressRecord | null => {
  if (typeof window === 'undefined') return null;
  const { mediaType, playlistId, streamId, seriesId, episodeId } = query;
  if (!streamId) return null;

  const key = buildRecordKey(
    mediaType === 'series' ? 'series' : 'movie',
    mediaType === 'series' ? 'series' : 'movie',
    streamId,
    seriesId,
    episodeId
  );
  const store = getProgressStore();

  if (store[key]) {
    return store[key];
  }

  // Fallback search across prefixes in case playlist changed or ID format differed slightly
  const cleanSid = cleanVodEntityId(streamId);
  for (const k in store) {
    const item = store[k];
    if (mediaType === 'series' || seriesId) {
      const sId = cleanVodEntityId(seriesId || streamId);
      const epId = cleanVodEntityId(episodeId || streamId);
      if (item.seriesId === sId && (item.episodeId === epId || item.streamId === epId)) {
        return item;
      }
    } else {
      if (item.mediaType === 'movie' && (item.streamId === cleanSid || k.endsWith(`_movie_${cleanSid}`))) {
        return item;
      }
    }
  }

  return null;
};

export const getSeriesEpisodesProgressMap = (
  playlistId: string,
  seriesId: string
): Record<string, VodProgressRecord> => {
  const result: Record<string, VodProgressRecord> = {};
  if (typeof window === 'undefined' || !seriesId) return result;

  const sId = cleanVodEntityId(seriesId);
  const store = getProgressStore();

  for (const k in store) {
    const item = store[k];
    if (item.mediaType === 'series' && item.seriesId === sId) {
      const epId = item.episodeId || item.streamId;
      if (epId) {
        result[epId] = item;
      }
    }
  }

  return result;
};

export const getSeriesEpisodeProgressMap = getSeriesEpisodesProgressMap;

export const getSeriesLastUnfinishedEpisode = (
  playlistId: string,
  seriesId: string
): VodProgressRecord | null => {
  if (typeof window === 'undefined' || !seriesId) return null;
  const sId = cleanVodEntityId(seriesId);
  const store = getProgressStore();

  let latestUnfinished: VodProgressRecord | null = null;
  for (const k in store) {
    const item = store[k];
    if (item.mediaType === 'series' && item.seriesId === sId) {
      if (!item.completed && item.positionSec >= MIN_RESUME_POSITION_SEC) {
        if (!latestUnfinished || item.updatedAt > latestUnfinished.updatedAt) {
          latestUnfinished = item;
        }
      }
    }
  }

  return latestUnfinished;
};

export const getSeriesLastWatchedEpisode = (
  playlistId: string,
  seriesId: string
): VodProgressRecord | null => {
  if (typeof window === 'undefined' || !seriesId) return null;
  const sId = cleanVodEntityId(seriesId);
  const store = getProgressStore();

  let latest: VodProgressRecord | null = null;
  for (const k in store) {
    const item = store[k];
    if (item.mediaType === 'series' && item.seriesId === sId) {
      if (!latest || item.updatedAt > latest.updatedAt) {
        latest = item;
      }
    }
  }

  return latest;
};

export const getSeriesProgressSummary = (
  playlistId: string,
  seriesId: string
): { episodeId: string; completed: boolean; positionSec: number } => {
  const ep = getSeriesLastUnfinishedEpisode(playlistId, seriesId) || getSeriesLastWatchedEpisode(playlistId, seriesId);
  return {
    episodeId: ep?.episodeId || ep?.streamId || '',
    completed: ep?.completed || false,
    positionSec: ep?.positionSec || 0
  };
};

export const getSeriesSeasonProgressMap = (
  playlistId: string,
  seriesId: string
): Record<number, { watched: number; total: number }> => {
  const map: Record<number, { watched: number; total: number }> = {};
  const epMap = getSeriesEpisodesProgressMap(playlistId, seriesId);
  for (const epId in epMap) {
    const rec = epMap[epId];
    const sNum = rec.seasonNum || 1;
    if (!map[sNum]) map[sNum] = { watched: 0, total: 0 };
    map[sNum].total++;
    if (rec.completed) map[sNum].watched++;
  }
  return map;
};

export const getVodProgressMap = (
  playlistId: string,
  mediaType: 'movie' | 'series'
): Record<string, VodProgressRecord> => {
  const store = getProgressStore();
  const res: Record<string, VodProgressRecord> = {};
  for (const k in store) {
    const item = store[k];
    if (item.mediaType === mediaType) {
      res[item.streamId] = item;
    }
  }
  return res;
};

export const getContinueWatchingItems = (
  mediaType: 'movie' | 'series',
  playlistId: string,
  historyItems?: ParsedChannel[]
): ParsedChannel[] => {
  if (typeof window === 'undefined') return [];

  const store = getProgressStore();
  const historyList = historyItems || [];

  const historyMap = new Map<string, ParsedChannel>();
  for (const ch of historyList) {
    const sid = String(ch.stream_id || (ch as any).id || '').trim();
    if (sid) historyMap.set(sid, ch);
  }

  if (mediaType === 'movie') {
    const movieItems: { item: ParsedChannel; updatedAt: number }[] = [];

    for (const k in store) {
      const rec = store[k];
      if (rec.mediaType !== 'movie') continue;
      if (rec.completed) continue;
      if (rec.positionSec < MIN_RESUME_POSITION_SEC) continue;
      if (rec.durationSec > 0 && rec.positionSec >= rec.durationSec - 15) continue;

      const sid = rec.streamId;
      const histMatch = historyMap.get(sid);

      const channelObj: ParsedChannel = {
        ...(histMatch || {}),
        stream_id: sid,
        name: histMatch?.name || rec.snapshot?.mediaTitle || rec.episodeTitle || 'Movie',
        stream_icon: histMatch?.stream_icon || rec.snapshot?.streamIcon || histMatch?.cover || histMatch?.logo || '',
        cover: histMatch?.cover || rec.snapshot?.streamIcon || histMatch?.stream_icon || '',
        logo: histMatch?.logo || rec.snapshot?.streamIcon || '',
        url: histMatch?.url || rec.snapshot?.mediaUrl || '',
        category_id: CONTINUE_WATCHING_CAT_ID,
        category_name: histMatch?.category_name || rec.snapshot?.categoryName || 'Watch It',
        type: 'movie',
        rating: histMatch?.rating || rec.snapshot?.rating,
        releaseDate: histMatch?.releaseDate || rec.snapshot?.releaseDate,
        duration: histMatch?.duration || rec.snapshot?.durationLabel,
        progressPositionSec: rec.positionSec,
        progressDurationSec: rec.durationSec
      } as any;

      movieItems.push({ item: channelObj, updatedAt: rec.updatedAt || 0 });
    }

    movieItems.sort((a, b) => b.updatedAt - a.updatedAt);
    return movieItems.map(m => m.item);
  }

  // Series: group by seriesId, take the latest unfinished episode
  const seriesGroups = new Map<string, { latestRec: VodProgressRecord; updatedAt: number }>();

  for (const k in store) {
    const rec = store[k];
    if (rec.mediaType !== 'series') continue;
    if (rec.completed) continue;
    if (rec.positionSec < MIN_RESUME_POSITION_SEC) continue;
    if (rec.durationSec > 0 && rec.positionSec >= rec.durationSec - 15) continue;

    const seriesId = rec.seriesId || rec.streamId;
    if (!seriesId) continue;

    const existingGroup = seriesGroups.get(seriesId);
    if (!existingGroup || (rec.updatedAt || 0) > existingGroup.updatedAt) {
      seriesGroups.set(seriesId, {
        latestRec: rec,
        updatedAt: rec.updatedAt || 0
      });
    }
  }

  const sortedSeries = Array.from(seriesGroups.values()).sort((a, b) => b.updatedAt - a.updatedAt);

  return sortedSeries.map(({ latestRec }) => {
    const seriesId = latestRec.seriesId || latestRec.streamId;
    const histMatch = historyMap.get(seriesId);

    const epLabel = latestRec.seasonNum && latestRec.episodeNum
      ? `S${String(latestRec.seasonNum).padStart(2, '0')} E${String(latestRec.episodeNum).padStart(2, '0')}`
      : latestRec.episodeTitle || '';

    const seriesName = histMatch?.name || latestRec.snapshot?.mediaTitle || 'Series';

    return {
      ...(histMatch || {}),
      stream_id: seriesId,
      series_id: seriesId,
      name: seriesName,
      stream_icon: histMatch?.stream_icon || latestRec.snapshot?.streamIcon || histMatch?.cover || histMatch?.logo || '',
      cover: histMatch?.cover || latestRec.snapshot?.streamIcon || histMatch?.stream_icon || '',
      logo: histMatch?.logo || latestRec.snapshot?.streamIcon || '',
      url: histMatch?.url || latestRec.snapshot?.mediaUrl || '',
      category_id: CONTINUE_WATCHING_CAT_ID,
      category_name: histMatch?.category_name || latestRec.snapshot?.categoryName || 'Watch It',
      type: 'series',
      rating: histMatch?.rating || latestRec.snapshot?.rating,
      releaseDate: histMatch?.releaseDate || latestRec.snapshot?.releaseDate,
      season: latestRec.seasonNum,
      episode: latestRec.episodeNum,
      progressPositionSec: latestRec.positionSec,
      progressDurationSec: latestRec.durationSec,
      progressEpisodeId: latestRec.episodeId,
      progressEpisodeTitle: latestRec.episodeTitle || epLabel
    } as any;
  });
};
