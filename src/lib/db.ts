// Achour Player IndexedDB bucketed persistence layer
import { openDB, IDBPDatabase } from 'idb';
import { isTVOrLowEndDevice } from '../utils/tvNavigation';

const DB_NAME = 'AchourPlayerDB';
const DB_VERSION = 6;
export const BUCKET_MAX_ITEMS = 2000;

const yieldToMain = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const sortByOrderIndex = <T extends { orderIndex?: number }>(items: T[], inPlace = false): T[] => {
  if (!items || items.length <= 1) return items || [];
  let hasOrderIndex = false;
  for (let i = 0; i < Math.min(items.length, 20); i++) {
    if (typeof items[i]?.orderIndex === 'number') {
      hasOrderIndex = true;
      break;
    }
  }
  if (!hasOrderIndex) return items;
  const target = inPlace ? items : items.slice();
  return target.sort((a, b) => {
    const oa = typeof a.orderIndex === 'number' ? a.orderIndex : Number.MAX_SAFE_INTEGER;
    const ob = typeof b.orderIndex === 'number' ? b.orderIndex : Number.MAX_SAFE_INTEGER;
    return oa - ob;
  });
};

export interface CompactChannelRecord {
  /** stream_id */
  s: string;
  /** name */
  n: string;
  /** orderIndex */
  o: number;
  /** logo / stream_icon / cover */
  l?: string;
  /** container_extension (when non-default) */
  e?: string;
  /** epg_channel_id */
  g?: string;
  /** tvg_id (if different from g) */
  t?: string;
  /** num (if different from o + 1) */
  m?: number;
  /** explicit url (only stored for M3U, Stalker, or non-standard Xtream URL) */
  u?: string;
  /** isRadio flag */
  r?: 1;
  /** category display name override (M3U / when category_name !== category_id) */
  cn?: string;
  /** plot / overview */
  pl?: string;
  /** cast */
  ct?: string;
  /** director */
  dr?: string;
  /** genre */
  gn?: string;
  /** rating */
  rt?: string | number;
  /** releaseDate */
  rd?: string;
  /** duration */
  du?: string;
}

export interface XtreamPlaylistConfig {
  id: string;
  cleanHost: string;
  encodedUser: string;
  encodedPass: string;
}

export interface ChannelBucketRecord {
  /** `${playlistId}\u0000${type}\u0000${categoryId}\u0000${shard}` */
  id: string;
  playlist_id: string;
  type: 'live' | 'movie' | 'series';
  category_id: string;
  items: CompactChannelRecord[];
}

const xtreamConfigMemCache = new Map<string, XtreamPlaylistConfig | null>();

export const sanitizeCategoryLabel = (raw?: unknown): string => {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (lower === 'uncategorized' || lower === 'عام (general)') {
    return '';
  }
  return trimmed;
};

export const packCompactChannel = (
  ch: any,
  fallbackOrder: number,
  type: 'live' | 'movie' | 'series',
  xtreamCfg?: XtreamPlaylistConfig | null
): CompactChannelRecord => {
  const rawStreamId = String(ch.stream_id || ch.series_id || ch.id || fallbackOrder);
  const cleanStreamId = rawStreamId.replace(/\.(m3u8|ts|mp4|mkv|avi|flv)$/i, '');
  const orderIdx = typeof ch.orderIndex === 'number' ? ch.orderIndex : fallbackOrder;
  const ext = ch.container_extension || (type === 'live' ? 'm3u8' : type === 'movie' ? 'mp4' : undefined);
  const defaultExt = type === 'live' ? 'm3u8' : 'mp4';

  const rec: CompactChannelRecord = {
    s: cleanStreamId,
    n: typeof ch.name === 'string' && ch.name ? ch.name : `${type} ${orderIdx + 1}`,
    o: orderIdx
  };

  const logo = ch.logo || ch.stream_icon || ch.cover;
  if (logo && typeof logo === 'string') rec.l = logo;
  if (ext && ext !== defaultExt) rec.e = ext;

  const epgId = ch.epg_channel_id ? String(ch.epg_channel_id) : undefined;
  const tvgId = ch.tvg_id ? String(ch.tvg_id) : undefined;
  if (epgId) rec.g = epgId;
  if (tvgId && tvgId !== epgId) rec.t = tvgId;

  if (ch.num !== undefined && ch.num !== null && ch.num !== orderIdx + 1) {
    const nVal = Number(ch.num);
    if (!Number.isNaN(nVal)) rec.m = nVal;
  }

  // Reconstructable standard Xtream URL is omitted per-item (~100 bytes saved x 800,000 = ~80MB RAM/Disk saved)
  const rawUrl: string | undefined = ch.url || ch.direct_source || ch.stream_url;
  if (rawUrl && typeof rawUrl === 'string') {
    if (
      xtreamCfg &&
      type !== 'series' &&
      rawUrl === `${xtreamCfg.cleanHost}/${type}/${xtreamCfg.encodedUser}/${xtreamCfg.encodedPass}/${cleanStreamId}.${ext || defaultExt}`
    ) {
      // Omit redundant URL; hydrated cleanly on read
    } else {
      rec.u = rawUrl;
    }
  }

  if (ch.isRadio) rec.r = 1;
  const catName = sanitizeCategoryLabel(ch.category || ch.category_name);
  if (catName && catName !== ch.category_id) rec.cn = catName;

  if (ch.plot) rec.pl = ch.plot;
  if (ch.cast) rec.ct = ch.cast;
  if (ch.director) rec.dr = ch.director;
  if (ch.genre) rec.gn = ch.genre;
  if (ch.rating !== undefined && ch.rating !== null && ch.rating !== '') rec.rt = ch.rating;
  if (ch.releaseDate) rec.rd = String(ch.releaseDate);
  if (ch.duration) rec.du = String(ch.duration);

  return rec;
};

export const hydrateCompactChannel = (
  rec: CompactChannelRecord,
  playlistId: string,
  type: 'live' | 'movie' | 'series',
  categoryId: string,
  xtreamCfg?: XtreamPlaylistConfig | null,
  categoryNameMap?: Map<string, string>
): any => {
  const defaultExt = type === 'live' ? 'm3u8' : 'mp4';
  const ext = rec.e || (type !== 'series' ? defaultExt : undefined);
  let url = rec.u;
  if (!url && xtreamCfg && type !== 'series') {
    url = `${xtreamCfg.cleanHost}/${type}/${xtreamCfg.encodedUser}/${xtreamCfg.encodedPass}/${rec.s}.${ext || defaultExt}`;
  }

  const epg = rec.g;
  const tvg = rec.t || epg;
  const logo = rec.l || '';
  const mappedCat = categoryNameMap ? categoryNameMap.get(String(categoryId || '')) : undefined;
  const catLabel = sanitizeCategoryLabel(rec.cn) || sanitizeCategoryLabel(mappedCat);

  const obj: any = {
    id: `${playlistId}_${type}_${rec.s}`,
    stream_id: rec.s,
    name: rec.n,
    logo,
    stream_icon: logo,
    cover: logo,
    category_id: categoryId,
    category: catLabel,
    category_name: catLabel,
    playlist_id: playlistId,
    type,
    url: url || '',
    container_extension: ext,
    epg_channel_id: epg,
    tvg_id: tvg,
    num: rec.m !== undefined ? rec.m : rec.o + 1,
    orderIndex: rec.o
  };

  if (type === 'series') obj.series_id = rec.s;
  if (rec.r === 1) obj.isRadio = true;
  if (rec.pl) obj.plot = rec.pl;
  if (rec.ct) obj.cast = rec.ct;
  if (rec.dr) obj.director = rec.dr;
  if (rec.gn) obj.genre = rec.gn;
  if (rec.rt !== undefined) obj.rating = rec.rt;
  if (rec.rd) obj.releaseDate = rec.rd;
  if (rec.du) obj.duration = rec.du;

  return obj;
};

let cachedDbPromise: Promise<IDBPDatabase<any>> | null = null;

export const initDB = async (): Promise<IDBPDatabase<any>> => {
  if (cachedDbPromise) {
    try {
      return await cachedDbPromise;
    } catch {
      cachedDbPromise = null;
    }
  }

  const openPromise = (async () => {
    try {
      const db = await openDB(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion, _newVersion, transaction) {
          if (!db.objectStoreNames.contains('channels')) {
            const store = db.createObjectStore('channels', { keyPath: 'id' });
            store.createIndex('category_id', 'category_id');
            store.createIndex('type', 'type');
            store.createIndex('playlist_id', 'playlist_id');
            store.createIndex('playlist_type', ['playlist_id', 'type']);
            store.createIndex('playlist_type_category', ['playlist_id', 'type', 'category_id']);
            store.createIndex('stream_id', 'stream_id');
          } else if (oldVersion < 5) {
            const store = transaction.objectStore('channels');
            if (!store.indexNames.contains('playlist_type_category')) {
              store.createIndex('playlist_type_category', ['playlist_id', 'type', 'category_id']);
            }
            if (!store.indexNames.contains('playlist_type')) {
              store.createIndex('playlist_type', ['playlist_id', 'type']);
            }
          }

          if (!db.objectStoreNames.contains('channel_buckets')) {
            // Zero secondary indexes: primary key `${playlistId}\u0000${type}\u0000${categoryId}\u0000${shard}`
            // gives O(buckets in category) prefix range lookups and 100x+ faster writes on Fire TV eMMC flash.
            db.createObjectStore('channel_buckets', { keyPath: 'id' });
          }

          if (!db.objectStoreNames.contains('categories')) {
            const store = db.createObjectStore('categories', { keyPath: 'id' });
            store.createIndex('type', 'type');
            store.createIndex('playlist_id', 'playlist_id');
            store.createIndex('playlist_type', ['playlist_id', 'type']);
          }

          if (!db.objectStoreNames.contains('metadata')) {
            db.createObjectStore('metadata', { keyPath: 'id' });
          }

          if (!db.objectStoreNames.contains('episodes')) {
            const store = db.createObjectStore('episodes', { keyPath: 'id' });
            store.createIndex('series_id', 'series_id');
            store.createIndex('playlist_id', 'playlist_id');
            store.createIndex('playlist_series', ['playlist_id', 'series_id']);
          }
        },
        blocked() {
          cachedDbPromise = null;
        },
        terminated() {
          cachedDbPromise = null;
        }
      });
      return db;
    } catch (err) {
      cachedDbPromise = null;
      console.warn('DB init error, attempting safe recovery without clearing user preferences:', err);
      try {
        indexedDB.deleteDatabase(DB_NAME);
      } catch (e) {}
      return openDB(DB_NAME, 1, {
        upgrade(db) {
          const cStore = db.createObjectStore('channels', { keyPath: 'id' });
          cStore.createIndex('playlist_type', ['playlist_id', 'type']);
          cStore.createIndex('playlist_type_category', ['playlist_id', 'type', 'category_id']);
          cStore.createIndex('category_id', 'category_id');
          cStore.createIndex('type', 'type');
          cStore.createIndex('playlist_id', 'playlist_id');

          db.createObjectStore('channel_buckets', { keyPath: 'id' });

          const catStore = db.createObjectStore('categories', { keyPath: 'id' });
          catStore.createIndex('playlist_type', ['playlist_id', 'type']);
          catStore.createIndex('type', 'type');
          catStore.createIndex('playlist_id', 'playlist_id');

          db.createObjectStore('metadata', { keyPath: 'id' });

          const epStore = db.createObjectStore('episodes', { keyPath: 'id' });
          epStore.createIndex('playlist_series', ['playlist_id', 'series_id']);
        }
      });
    }
  })();

  cachedDbPromise = openPromise;
  return openPromise;
};

export const saveXtreamPlaylistConfig = async (
  playlistId: string,
  config: { cleanHost: string; encodedUser: string; encodedPass: string }
): Promise<void> => {
  const rec: XtreamPlaylistConfig = { id: `xtream_cfg_${playlistId}`, ...config };
  xtreamConfigMemCache.set(playlistId, rec);
  try {
    const db = await initDB();
    await db.put('metadata', rec);
  } catch {}
};

export const getXtreamPlaylistConfig = async (playlistId: string): Promise<XtreamPlaylistConfig | null> => {
  if (!playlistId) return null;
  if (xtreamConfigMemCache.has(playlistId)) {
    return xtreamConfigMemCache.get(playlistId) || null;
  }
  try {
    const db = await initDB();
    const rec = (await db.get('metadata', `xtream_cfg_${playlistId}`)) as XtreamPlaylistConfig | undefined;
    const resolved = rec || null;
    xtreamConfigMemCache.set(playlistId, resolved);
    return resolved;
  } catch {
    return null;
  }
};

export interface ExtractionStatusRecord {
  id?: string;
  stage: 'idle' | 'downloading' | 'parsing' | 'categorizing' | 'saving' | 'verifying' | 'paused' | 'completed' | 'error';
  percent: number;
  message: string;
  counts?: { live: number; movie: number; series: number };
  completedTypes?: Array<'live' | 'movie' | 'series'>;
  liveReady?: boolean;
  movieReady?: boolean;
  seriesReady?: boolean;
  categoriesReady?: boolean;
  completedCategories?: Partial<Record<'live' | 'movie' | 'series', string[]>>;
  savedOffsetByType?: Partial<Record<'live' | 'movie' | 'series', number>>;
  bucketSeq?: number;
  m3uSavedEntries?: number;
  updatedAt?: number;
}

export const getPlaylistExtractionStatus = async (playlistId: string): Promise<ExtractionStatusRecord | null> => {
  try {
    const db = await initDB();
    return (await db.get('metadata', `extraction_${playlistId}`)) || null;
  } catch (e) {
    return null;
  }
};

export const setPlaylistExtractionStatus = async (playlistId: string, status: Partial<ExtractionStatusRecord>) => {
  try {
    const db = await initDB();
    const existing = await db.get('metadata', `extraction_${playlistId}`);
    await db.put('metadata', {
      ...(existing || {}),
      ...status,
      id: `extraction_${playlistId}`,
      updatedAt: Date.now()
    });
  } catch (e) {
    console.error('Error saving extraction status:', e);
  }
};

export interface SaveBatchOptions {
  startOrderIndex?: number;
  batchSize?: number;
  onBatchSaved?: (savedCount: number) => void;
  signal?: AbortSignal;
  alreadyCompact?: boolean;
  bucketSeqRef?: { current: number };
}

let globalBucketSeq = Math.floor((Date.now() % 1_000_000) * 100);
const nextBucketShard = (seqRef?: { current: number }): string => {
  const val = seqRef ? seqRef.current++ : globalBucketSeq++;
  return String(val).padStart(9, '0');
};

/**
 * High-speed bucketed persistence: stores up to 2,000 compact items per primary-key bucket
 * grouped by category_id in a single transaction with zero secondary index overhead.
 */
export const saveCategoryBucketsBatch = async (
  playlistId: string,
  type: 'live' | 'movie' | 'series',
  groupedByCategory: Map<string, CompactChannelRecord[]>,
  signal?: AbortSignal,
  bucketSeqRef?: { current: number }
): Promise<number> => {
  if (signal?.aborted) {
    throw new DOMException('Extraction aborted by user', 'AbortError');
  }
  if (!groupedByCategory || groupedByCategory.size === 0) return 0;

  const db = await initDB();
  const tx = db.transaction('channel_buckets', 'readwrite');
  const store = tx.objectStore('channel_buckets');
  let writtenItems = 0;

  for (const [catId, list] of groupedByCategory.entries()) {
    if (!list || list.length === 0) continue;
    const cleanCat = String(catId || 'uncategorized');
    for (let i = 0; i < list.length; i += BUCKET_MAX_ITEMS) {
      const slice = i === 0 && list.length <= BUCKET_MAX_ITEMS
        ? list
        : list.slice(i, i + BUCKET_MAX_ITEMS);
      const shard = nextBucketShard(bucketSeqRef);
      const bucket: ChannelBucketRecord = {
        id: `${playlistId}\u0000${type}\u0000${cleanCat}\u0000${shard}`,
        playlist_id: playlistId,
        type,
        category_id: cleanCat,
        items: slice
      };
      store.put(bucket);
      writtenItems += slice.length;
    }
  }

  await tx.done;
  invalidatePlaylistQueryCache(playlistId, type);
  return writtenItems;
};

export const saveChannels = async (
  channels: any[],
  type: 'live' | 'movie' | 'series',
  playlistId: string,
  options?: SaveBatchOptions
) => {
  if (!channels || channels.length === 0) return;
  const baseOrder = options?.startOrderIndex ?? 0;
  const xtreamCfg = await getXtreamPlaylistConfig(playlistId);

  try {
    const grouped = new Map<string, CompactChannelRecord[]>();
    for (let i = 0; i < channels.length; i++) {
      if (options?.signal?.aborted) {
        throw new DOMException('Extraction aborted by user', 'AbortError');
      }
      const ch = channels[i];
      const catId = String(ch.category_id || ch.category || 'uncategorized');
      let arr = grouped.get(catId);
      if (!arr) {
        arr = [];
        grouped.set(catId, arr);
      }
      arr.push(
        options?.alreadyCompact
          ? (ch as CompactChannelRecord)
          : packCompactChannel(ch, baseOrder + i, type, xtreamCfg)
      );
    }

    await saveCategoryBucketsBatch(playlistId, type, grouped, options?.signal, options?.bucketSeqRef);
    options?.onBatchSaved?.(channels.length);
  } catch (e) {
    if ((e as any)?.name !== 'AbortError') {
      console.error('Error in saveChannels:', e);
    }
    throw e;
  }
};

export const saveCategories = async (
  categories: any[],
  type: 'live' | 'movie' | 'series',
  playlistId: string,
  options?: SaveBatchOptions
) => {
  if (!categories || categories.length === 0) return;
  const BATCH_SIZE = Math.max(200, Math.min(5000, options?.batchSize ?? 2000));
  const baseOrder = options?.startOrderIndex ?? 0;

  try {
    const db = await initDB();

    for (let i = 0; i < categories.length; i += BATCH_SIZE) {
      if (options?.signal?.aborted) {
        throw new DOMException('Extraction aborted by user', 'AbortError');
      }

      const end = Math.min(i + BATCH_SIZE, categories.length);
      const tx = db.transaction('categories', 'readwrite');
      const store = tx.objectStore('categories');

      for (let j = i; j < end; j++) {
        const cat = categories[j];
        const catId = String(cat.category_id || cat.id || cat.category_name || `${baseOrder + j}`);
        store.put({
          ...cat,
          id: `${playlistId}_${type}_${catId}`,
          category_id: catId,
          playlist_id: playlistId,
          type,
          orderIndex: typeof cat.orderIndex === 'number' ? cat.orderIndex : baseOrder + j
        });
      }

      await tx.done;
      if (end < categories.length) {
        await yieldToMain();
      }
    }
  } catch (e) {
    if ((e as any)?.name !== 'AbortError') {
      console.error('Error in saveCategories:', e);
    }
    throw e;
  }
};

export const saveStreamingBatch = async (
  playlistId: string,
  batch: {
    newCategories: Array<{ category_id: string; category_name: string; type: 'live' | 'movie' | 'series'; orderIndex: number }>;
    live: any[];
    movie: any[];
    series: any[];
  },
  signal?: AbortSignal,
  bucketSeqRef?: { current: number }
) => {
  if (signal?.aborted) {
    throw new DOMException('Extraction aborted by user', 'AbortError');
  }
  const hasCats = batch.newCategories.length > 0;
  const hasChannels = batch.live.length > 0 || batch.movie.length > 0 || batch.series.length > 0;
  if (!hasCats && !hasChannels) return;

  try {
    const xtreamCfg = await getXtreamPlaylistConfig(playlistId);
    const db = await initDB();
    const stores: Array<'channel_buckets' | 'categories'> = [];
    if (hasChannels) stores.push('channel_buckets');
    if (hasCats) stores.push('categories');

    const tx = db.transaction(stores, 'readwrite');
    if (hasCats) {
      const catStore = tx.objectStore('categories');
      for (let i = 0; i < batch.newCategories.length; i++) {
        const cat = batch.newCategories[i];
        const catId = String(cat.category_id || cat.category_name || `${i}`);
        catStore.put({
          ...cat,
          id: `${playlistId}_${cat.type}_${catId}`,
          category_id: catId,
          playlist_id: playlistId,
          type: cat.type,
          orderIndex: typeof cat.orderIndex === 'number' ? cat.orderIndex : i
        });
      }
    }

    if (hasChannels) {
      const bucketStore = tx.objectStore('channel_buckets');
      const writeGroup = (list: any[], type: 'live' | 'movie' | 'series') => {
        const grouped = new Map<string, CompactChannelRecord[]>();
        for (let i = 0; i < list.length; i++) {
          const ch = list[i];
          const catId = String(ch.category_id || ch.category || 'uncategorized');
          let arr = grouped.get(catId);
          if (!arr) {
            arr = [];
            grouped.set(catId, arr);
          }
          arr.push(packCompactChannel(ch, i, type, xtreamCfg));
        }
        for (const [catId, recs] of grouped.entries()) {
          for (let i = 0; i < recs.length; i += BUCKET_MAX_ITEMS) {
            const slice = i === 0 && recs.length <= BUCKET_MAX_ITEMS ? recs : recs.slice(i, i + BUCKET_MAX_ITEMS);
            bucketStore.put({
              id: `${playlistId}\u0000${type}\u0000${catId}\u0000${nextBucketShard(bucketSeqRef)}`,
              playlist_id: playlistId,
              type,
              category_id: catId,
              items: slice
            } satisfies ChannelBucketRecord);
          }
        }
      };

      if (batch.live.length > 0) writeGroup(batch.live, 'live');
      if (batch.movie.length > 0) writeGroup(batch.movie, 'movie');
      if (batch.series.length > 0) writeGroup(batch.series, 'series');
    }

    await tx.done;
    invalidatePlaylistQueryCache(playlistId);
  } catch (e) {
    if ((e as any)?.name !== 'AbortError') {
      console.error('Error in saveStreamingBatch:', e);
    }
    throw e;
  }
};

const channelsCategoryQueryCache = new Map<string, any[]>();
let cachedQueryTotalItems = 0;

const getQueryCacheBudgets = () => {
  const lowMem = isTVOrLowEndDevice();
  return {
    maxEntries: lowMem ? 4 : 10,
    maxTotalItems: lowMem ? 6000 : 25000,
    maxSingleItems: lowMem ? 4000 : 15000
  };
};

export const clearChannelsQueryCache = () => {
  channelsCategoryQueryCache.clear();
  cachedQueryTotalItems = 0;
};

export const trimDbMemoryCaches = () => {
  channelsCategoryQueryCache.clear();
  cachedQueryTotalItems = 0;
};

const invalidatePlaylistQueryCache = (playlistId: string, type?: 'live' | 'movie' | 'series') => {
  const prefix = type ? `${playlistId}_${type}_` : `${playlistId}_`;
  for (const key of Array.from(channelsCategoryQueryCache.keys())) {
    if (key.startsWith(prefix)) {
      const existing = channelsCategoryQueryCache.get(key);
      if (existing) cachedQueryTotalItems = Math.max(0, cachedQueryTotalItems - existing.length);
      channelsCategoryQueryCache.delete(key);
    }
  }
};

const setCachedCategoryQuery = (key: string, val: any[]) => {
  const { maxEntries, maxTotalItems, maxSingleItems } = getQueryCacheBudgets();
  if (val.length > maxSingleItems) return;

  const existing = channelsCategoryQueryCache.get(key);
  if (existing) {
    cachedQueryTotalItems = Math.max(0, cachedQueryTotalItems - existing.length);
    channelsCategoryQueryCache.delete(key);
  }

  while (
    channelsCategoryQueryCache.size > 0 &&
    (channelsCategoryQueryCache.size >= maxEntries || cachedQueryTotalItems + val.length > maxTotalItems)
  ) {
    const oldestKey = channelsCategoryQueryCache.keys().next().value;
    if (oldestKey === undefined) break;
    const evicted = channelsCategoryQueryCache.get(oldestKey);
    if (evicted) cachedQueryTotalItems = Math.max(0, cachedQueryTotalItems - evicted.length);
    channelsCategoryQueryCache.delete(oldestKey);
  }

  channelsCategoryQueryCache.set(key, val);
  cachedQueryTotalItems += val.length;
};

const getCategoryNameMap = async (
  db: IDBPDatabase<any>,
  playlistId: string,
  type: 'live' | 'movie' | 'series'
): Promise<Map<string, string>> => {
  const map = new Map<string, string>();
  if (!playlistId) return map;
  try {
    const index = db.transaction('categories', 'readonly').objectStore('categories').index('playlist_type');
    const cats = await index.getAll([playlistId, type]);
    for (let i = 0; i < cats.length; i++) {
      const c = cats[i];
      const cid = String(c?.category_id || c?.id || '').trim();
      const cname = sanitizeCategoryLabel(c?.category_name || c?.name);
      if (cid && cname && !map.has(cid)) {
        map.set(cid, cname);
      }
    }
  } catch {}
  return map;
};

export const getChannelsByPlaylistAndType = async (
  playlistId: string,
  type: 'live' | 'movie' | 'series' | 'favorites'
) => {
  const effectiveType = type === 'favorites' ? 'live' : type;
  if (!playlistId) return [];
  try {
    const db = await initDB();
    const [xtreamCfg, categoryNameMap] = await Promise.all([
      getXtreamPlaylistConfig(playlistId),
      getCategoryNameMap(db, playlistId, effectiveType)
    ]);

    // 1. Read from v6 bucketed store first
    if (db.objectStoreNames.contains('channel_buckets')) {
      const range = IDBKeyRange.bound(
        `${playlistId}\u0000${effectiveType}\u0000`,
        `${playlistId}\u0000${effectiveType}\u0000\uffff`
      );
      const buckets: ChannelBucketRecord[] = await db.getAll('channel_buckets', range);
      if (buckets && buckets.length > 0) {
        const result: any[] = [];
        for (let b = 0; b < buckets.length; b++) {
          const bucket = buckets[b];
          const recs = bucket.items || [];
          for (let i = 0; i < recs.length; i++) {
            result.push(hydrateCompactChannel(recs[i], playlistId, effectiveType, bucket.category_id, xtreamCfg, categoryNameMap));
          }
        }
        return sortByOrderIndex(result, true);
      }
    }

    // 2. Fallback to legacy channels store for pre-v6 extracted playlists
    const index = db.transaction('channels', 'readonly').objectStore('channels').index('playlist_type');
    const items = await index.getAll([playlistId, effectiveType]);
    return sortByOrderIndex(items || [], true);
  } catch (e) {
    console.error('Error in getChannelsByPlaylistAndType:', e);
    return [];
  }
};

/**
 * Memory-safe targeted ID lookup (used by Favorites): streams bucket records via a cursor
 * and only hydrates the matching IDs without ever materializing all 400k+ items in RAM.
 */
export const getChannelsByIds = async (
  playlistId: string,
  type: 'live' | 'movie' | 'series' | 'favorites',
  ids: string[]
): Promise<any[]> => {
  if (!playlistId || !ids || ids.length === 0) return [];
  const effectiveType = type === 'favorites' ? 'live' : type;
  const targetSet = new Set(ids.map((id) => String(id)));

  try {
    const db = await initDB();
    const [xtreamCfg, categoryNameMap] = await Promise.all([
      getXtreamPlaylistConfig(playlistId),
      getCategoryNameMap(db, playlistId, effectiveType)
    ]);
    const found: any[] = [];
    const seenStreamIds = new Set<string>();

    if (db.objectStoreNames.contains('channel_buckets')) {
      const range = IDBKeyRange.bound(
        `${playlistId}\u0000${effectiveType}\u0000`,
        `${playlistId}\u0000${effectiveType}\u0000\uffff`
      );
      const tx = db.transaction('channel_buckets', 'readonly');
      let cursor = await tx.store.openCursor(range);
      let hadBuckets = false;
      while (cursor) {
        hadBuckets = true;
        const bucket = cursor.value as ChannelBucketRecord;
        const recs = bucket.items || [];
        for (let i = 0; i < recs.length; i++) {
          const rec = recs[i];
          if (seenStreamIds.has(rec.s)) continue;
          const compositeId = `${playlistId}_${effectiveType}_${rec.s}`;
          if (targetSet.has(rec.s) || targetSet.has(compositeId)) {
            seenStreamIds.add(rec.s);
            found.push(hydrateCompactChannel(rec, playlistId, effectiveType, bucket.category_id, xtreamCfg, categoryNameMap));
            if (seenStreamIds.size >= targetSet.size) break;
          }
        }
        if (seenStreamIds.size >= targetSet.size) break;
        cursor = await cursor.continue();
      }
      if (hadBuckets) {
        return sortByOrderIndex(found);
      }
    }

    // Legacy fallback: point gets using primary key `${playlistId}_${effectiveType}_${streamId}`
    const tx = db.transaction('channels', 'readonly');
    for (const rawId of targetSet) {
      const idKey = rawId.startsWith(`${playlistId}_`) ? rawId : `${playlistId}_${effectiveType}_${rawId}`;
      const hit = await tx.store.get(idKey);
      if (hit && !seenStreamIds.has(String(hit.stream_id || hit.id))) {
        seenStreamIds.add(String(hit.stream_id || hit.id));
        found.push(hit);
      }
    }
    return sortByOrderIndex(found);
  } catch (e) {
    console.error('Error in getChannelsByIds:', e);
    return [];
  }
};

/**
 * Memory-safe streaming search across a playlist type, capped at `limit` results
 * so Fire TV RAM stays low even across 500k+ entries.
 */
export const searchChannelsInPlaylist = async (
  playlistId: string,
  type: 'live' | 'movie' | 'series' | 'favorites',
  query: string,
  limit = 200
): Promise<any[]> => {
  const cleanQ = (query || '').trim().toLowerCase();
  if (!playlistId || !cleanQ) return [];
  const effectiveType = type === 'favorites' ? 'live' : type;

  try {
    const db = await initDB();
    const [xtreamCfg, categoryNameMap] = await Promise.all([
      getXtreamPlaylistConfig(playlistId),
      getCategoryNameMap(db, playlistId, effectiveType)
    ]);
    const matches: any[] = [];

    if (db.objectStoreNames.contains('channel_buckets')) {
      const range = IDBKeyRange.bound(
        `${playlistId}\u0000${effectiveType}\u0000`,
        `${playlistId}\u0000${effectiveType}\u0000\uffff`
      );
      const tx = db.transaction('channel_buckets', 'readonly');
      let cursor = await tx.store.openCursor(range);
      while (cursor) {
        const bucket = cursor.value as ChannelBucketRecord;
        const recs = bucket.items || [];
        for (let i = 0; i < recs.length; i++) {
          const rec = recs[i];
          if (rec.n.toLowerCase().includes(cleanQ)) {
            matches.push(hydrateCompactChannel(rec, playlistId, effectiveType, bucket.category_id, xtreamCfg, categoryNameMap));
            if (matches.length >= limit) break;
          }
        }
        if (matches.length >= limit) break;
        cursor = await cursor.continue();
      }
    }
    return matches;
  } catch (e) {
    console.error('Error in searchChannelsInPlaylist:', e);
    return [];
  }
};

export const getCategoriesByPlaylistAndType = async (
  playlistId: string,
  type: 'live' | 'movie' | 'series'
) => {
  if (!playlistId) return [];
  try {
    const db = await initDB();
    const index = db.transaction('categories', 'readonly').objectStore('categories').index('playlist_type');
    const items = await index.getAll([playlistId, type]);
    return sortByOrderIndex(items || []);
  } catch (e) {
    console.error('Error in getCategoriesByPlaylistAndType:', e);
    return [];
  }
};

export interface WindowedCategoryResult {
  items: any[];
  hasMore: boolean;
  nextBucketOffset: number;
  resolvedCategoryId: string;
}

/**
 * Memory-safe cursor pagination over `channel_buckets` for giant categories (10k–200k+ items).
 * Reads only `maxItems` at a time starting from `bucketOffset` so 1.5 GB Fire TV RAM never spikes.
 */
export const getChannelsByCategoryWindowed = async (
  type: string,
  categoryId: string,
  playlistId?: string,
  options?: { bucketOffset?: number; maxItems?: number }
): Promise<WindowedCategoryResult> => {
  const effectiveType = (type === 'favorites' ? 'live' : type) as 'live' | 'movie' | 'series';
  const cleanCat = String(categoryId || '').trim();
  const bucketOffset = Math.max(0, options?.bucketOffset ?? 0);
  const maxItems = Math.max(500, options?.maxItems ?? (isTVOrLowEndDevice() ? 3000 : 8000));

  if (!playlistId) {
    const fallback = await getChannelsByCategory(effectiveType, categoryId, playlistId);
    return { items: fallback, hasMore: false, nextBucketOffset: 0, resolvedCategoryId: cleanCat };
  }

  try {
    const db = await initDB();
    if (!db.objectStoreNames.contains('channel_buckets')) {
      const legacy = await getChannelsByCategory(effectiveType, categoryId, playlistId);
      return { items: legacy, hasMore: false, nextBucketOffset: 0, resolvedCategoryId: cleanCat };
    }

    const isAll = !categoryId || categoryId === '__all__' || categoryId === 'ALL_CATEGORIES' || categoryId === 'all' || categoryId === 'ALL';
    const [xtreamCfg, categoryNameMap] = await Promise.all([
      getXtreamPlaylistConfig(playlistId),
      getCategoryNameMap(db, playlistId, effectiveType)
    ]);

    const readCursorWindow = async (catKey: string | null): Promise<{ items: any[]; hasMore: boolean; bucketsRead: number } | null> => {
      const range = catKey === null
        ? IDBKeyRange.bound(`${playlistId}\u0000${effectiveType}\u0000`, `${playlistId}\u0000${effectiveType}\u0000\uffff`)
        : IDBKeyRange.bound(`${playlistId}\u0000${effectiveType}\u0000${catKey}\u0000`, `${playlistId}\u0000${effectiveType}\u0000${catKey}\u0000\uffff`);

      const tx = db.transaction('channel_buckets', 'readonly');
      let cursor = await tx.store.openCursor(range);
      if (!cursor) return null;

      if (bucketOffset > 0) {
        cursor = await cursor.advance(bucketOffset);
      }

      const out: any[] = [];
      let bucketsRead = 0;
      let hasMore = false;

      while (cursor) {
        const bucket = cursor.value as ChannelBucketRecord;
        const recs = bucket.items || [];
        for (let i = 0; i < recs.length; i++) {
          out.push(hydrateCompactChannel(recs[i], playlistId, effectiveType, bucket.category_id, xtreamCfg, categoryNameMap));
        }
        bucketsRead++;
        cursor = await cursor.continue();
        if (out.length >= maxItems) {
          hasMore = Boolean(cursor);
          break;
        }
      }

      return { items: sortByOrderIndex(out, true), hasMore, bucketsRead };
    };

    if (isAll) {
      const res = await readCursorWindow(null);
      if (res && res.items.length > 0) {
        return {
          items: res.items,
          hasMore: res.hasMore,
          nextBucketOffset: bucketOffset + res.bucketsRead,
          resolvedCategoryId: cleanCat
        };
      }
      if (bucketOffset === 0) {
        const legacyAll = await getChannelsByPlaylistAndType(playlistId, effectiveType);
        return {
          items: legacyAll,
          hasMore: false,
          nextBucketOffset: 0,
          resolvedCategoryId: cleanCat
        };
      }
      return { items: [], hasMore: false, nextBucketOffset: 0, resolvedCategoryId: cleanCat };
    }

    const direct = await readCursorWindow(cleanCat);
    if (direct && direct.items.length > 0) {
      return {
        items: direct.items,
        hasMore: direct.hasMore,
        nextBucketOffset: bucketOffset + direct.bucketsRead,
        resolvedCategoryId: cleanCat
      };
    }

    if (bucketOffset === 0) {
      const categories = await getCategoriesByPlaylistAndType(playlistId, effectiveType);
      const cleanLower = cleanCat.toLowerCase();
      const targetCat = categories.find(cat =>
        String(cat.category_name || cat.name || '').trim().toLowerCase() === cleanLower ||
        String(cat.category_id || cat.id || '').trim().toLowerCase() === cleanLower
      );
      if (targetCat) {
        const altId = String(targetCat.category_id || targetCat.id || '').trim();
        if (altId && altId !== cleanCat) {
          const alt = await readCursorWindow(altId);
          if (alt && alt.items.length > 0) {
            return {
              items: alt.items,
              hasMore: alt.hasMore,
              nextBucketOffset: bucketOffset + alt.bucketsRead,
              resolvedCategoryId: altId
            };
          }
        }
      }

      // Legacy fallback only on initial offset 0
      const legacy = await getChannelsByCategory(effectiveType, categoryId, playlistId);
      return { items: legacy, hasMore: false, nextBucketOffset: 0, resolvedCategoryId: cleanCat };
    }

    return { items: [], hasMore: false, nextBucketOffset: bucketOffset, resolvedCategoryId: cleanCat };
  } catch (e) {
    console.error('Error in getChannelsByCategoryWindowed:', e);
    return { items: [], hasMore: false, nextBucketOffset: bucketOffset, resolvedCategoryId: cleanCat };
  }
};

/**
 * Memory-safe streaming search scoped to a single category (or full type if ALL_CATEGORIES).
 */
export const searchChannelsInCategory = async (
  playlistId: string,
  type: 'live' | 'movie' | 'series' | 'favorites',
  categoryId: string,
  query: string,
  limit = 250
): Promise<any[]> => {
  const cleanQ = (query || '').trim().toLowerCase();
  if (!playlistId || !cleanQ) return [];
  const effectiveType = type === 'favorites' ? 'live' : type;
  const cleanCat = String(categoryId || '').trim();
  if (!cleanCat || cleanCat === '__all__' || cleanCat === 'ALL_CATEGORIES' || cleanCat === 'all' || cleanCat === 'ALL') {
    return searchChannelsInPlaylist(playlistId, effectiveType, cleanQ, limit);
  }

  try {
    const db = await initDB();
    if (!db.objectStoreNames.contains('channel_buckets')) return [];
    const [xtreamCfg, categoryNameMap] = await Promise.all([
      getXtreamPlaylistConfig(playlistId),
      getCategoryNameMap(db, playlistId, effectiveType)
    ]);
    const matches: any[] = [];
    const range = IDBKeyRange.bound(
      `${playlistId}\u0000${effectiveType}\u0000${cleanCat}\u0000`,
      `${playlistId}\u0000${effectiveType}\u0000${cleanCat}\u0000\uffff`
    );
    const tx = db.transaction('channel_buckets', 'readonly');
    let cursor = await tx.store.openCursor(range);
    while (cursor) {
      const bucket = cursor.value as ChannelBucketRecord;
      const recs = bucket.items || [];
      for (let i = 0; i < recs.length; i++) {
        const rec = recs[i];
        if (rec.n.toLowerCase().includes(cleanQ)) {
          matches.push(hydrateCompactChannel(rec, playlistId, effectiveType, bucket.category_id, xtreamCfg, categoryNameMap));
          if (matches.length >= limit) break;
        }
      }
      if (matches.length >= limit) break;
      cursor = await cursor.continue();
    }
    return matches;
  } catch (e) {
    console.error('Error in searchChannelsInCategory:', e);
    return [];
  }
};

export const getChannelsByCategory = async (type: string, categoryId: string, playlistId?: string) => {
  try {
    const effectiveType = (type === 'favorites' ? 'live' : type) as 'live' | 'movie' | 'series';
    const cleanCat = String(categoryId || '').trim();
    const cacheKey = `${playlistId || 'all'}_${effectiveType}_${cleanCat}`;

    if (channelsCategoryQueryCache.has(cacheKey)) {
      return channelsCategoryQueryCache.get(cacheKey)!;
    }

    if (!categoryId || categoryId === '__all__' || categoryId === 'ALL_CATEGORIES' || categoryId === 'all' || categoryId === 'ALL') {
      const items = playlistId
        ? await getChannelsByPlaylistAndType(playlistId, effectiveType)
        : await getChannelsByType(effectiveType);
      setCachedCategoryQuery(cacheKey, items);
      return items;
    }

    const db = await initDB();

    // 0. Fast O(buckets in single category) primary-key range lookup in v6 `channel_buckets`
    if (playlistId && db.objectStoreNames.contains('channel_buckets')) {
      const [xtreamCfg, categoryNameMap] = await Promise.all([
        getXtreamPlaylistConfig(playlistId),
        getCategoryNameMap(db, playlistId, effectiveType)
      ]);
      const fetchBucketsForCat = async (catKey: string): Promise<any[]> => {
        const range = IDBKeyRange.bound(
          `${playlistId}\u0000${effectiveType}\u0000${catKey}\u0000`,
          `${playlistId}\u0000${effectiveType}\u0000${catKey}\u0000\uffff`
        );
        const buckets: ChannelBucketRecord[] = await db.getAll('channel_buckets', range);
        if (!buckets || buckets.length === 0) return [];
        const out: any[] = [];
        for (let b = 0; b < buckets.length; b++) {
          const recs = buckets[b].items || [];
          for (let i = 0; i < recs.length; i++) {
            out.push(hydrateCompactChannel(recs[i], playlistId, effectiveType, buckets[b].category_id, xtreamCfg, categoryNameMap));
          }
        }
        return sortByOrderIndex(out, true);
      };

      const directBucketItems = await fetchBucketsForCat(cleanCat);
      if (directBucketItems.length > 0) {
        setCachedCategoryQuery(cacheKey, directBucketItems);
        return directBucketItems;
      }

      // Resolve by category name/ID alias via categories store
      const categories = await getCategoriesByPlaylistAndType(playlistId, effectiveType);
      const cleanLower = cleanCat.toLowerCase();
      const targetCat = categories.find(cat =>
        String(cat.category_name || cat.name || '').trim().toLowerCase() === cleanLower ||
        String(cat.category_id || cat.id || '').trim().toLowerCase() === cleanLower
      );
      if (targetCat) {
        const altId = String(targetCat.category_id || targetCat.id || '').trim();
        if (altId && altId !== cleanCat) {
          const altBucketItems = await fetchBucketsForCat(altId);
          if (altBucketItems.length > 0) {
            setCachedCategoryQuery(cacheKey, altBucketItems);
            return altBucketItems;
          }
        }
      }
    }

    // Legacy `channels` store fallback (pre-v6 playlists)
    const store = db.transaction('channels', 'readonly').objectStore('channels');

    // 1. O(K) composite index lookup when playlistId is known (try string and numeric)
    if (playlistId && store.indexNames.contains('playlist_type_category')) {
      const ptcIndex = store.index('playlist_type_category');
      let directItems = await ptcIndex.getAll([playlistId, effectiveType, cleanCat]);
      if ((!directItems || directItems.length === 0) && !isNaN(Number(cleanCat))) {
        directItems = await ptcIndex.getAll([playlistId, effectiveType, Number(cleanCat)]);
      }
      if (directItems && directItems.length > 0) {
        const sorted = sortByOrderIndex(directItems);
        setCachedCategoryQuery(cacheKey, sorted);
        return sorted;
      }
    }

    // 2. Fallback to category_id index strictly scoped to playlistId & effectiveType
    const catIndex = store.index('category_id');
    let items = await catIndex.getAll(cleanCat);
    if ((!items || items.length === 0) && !isNaN(Number(cleanCat))) {
      items = await catIndex.getAll(Number(cleanCat));
    }

    if (items && items.length > 0) {
      const filtered = items.filter(c => {
        if (effectiveType && c.type !== effectiveType) return false;
        if (playlistId && c.playlist_id !== playlistId) return false;
        return true;
      });
      if (filtered.length > 0) {
        const sorted = sortByOrderIndex(filtered);
        setCachedCategoryQuery(cacheKey, sorted);
        return sorted;
      }
    }

    // 3. Fast category name -> ID resolution via categories store (avoids full 50,000 item scan)
    if (playlistId && store.indexNames.contains('playlist_type_category')) {
      const categories = await getCategoriesByPlaylistAndType(playlistId, effectiveType);
      const cleanLower = cleanCat.toLowerCase();
      const targetCat = categories.find(cat =>
        String(cat.category_name || cat.name || '').trim().toLowerCase() === cleanLower ||
        String(cat.category_id || cat.id || '').trim().toLowerCase() === cleanLower
      );

      if (targetCat) {
        const altId = String(targetCat.category_id || targetCat.id || '').trim();
        if (altId && altId !== cleanCat) {
          const ptcIndex = store.index('playlist_type_category');
          let altItems = await ptcIndex.getAll([playlistId, effectiveType, altId]);
          if ((!altItems || altItems.length === 0) && !isNaN(Number(altId))) {
            altItems = await ptcIndex.getAll([playlistId, effectiveType, Number(altId)]);
          }
          if (altItems && altItems.length > 0) {
            const sorted = sortByOrderIndex(altItems);
            setCachedCategoryQuery(cacheKey, sorted);
            return sorted;
          }
        }
      }
    }

    return [];
  } catch (e) {
    console.error('Error in getChannelsByCategory:', e);
    return [];
  }
};

export const getChannelsByType = async (type: 'live' | 'movie' | 'series' | 'favorites') => {
  try {
    const db = await initDB();
    const index = db.transaction('channels', 'readonly').objectStore('channels').index('type');
    const effectiveType = type === 'favorites' ? 'live' : type;
    const items = await index.getAll(effectiveType);
    return sortByOrderIndex(items || []);
  } catch (e) {
    return [];
  }
};

export const getCategoriesByType = async (type: 'live' | 'movie' | 'series') => {
  try {
    const db = await initDB();
    const index = db.transaction('categories', 'readonly').objectStore('categories').index('type');
    const items = await index.getAll(type);
    return sortByOrderIndex(items || []);
  } catch (e) {
    return [];
  }
};

export const hasCategoryBuckets = async (
  playlistId: string,
  type: 'live' | 'movie' | 'series',
  categoryId: string
): Promise<boolean> => {
  if (!playlistId || !categoryId) return false;
  try {
    const db = await initDB();
    if (!db.objectStoreNames.contains('channel_buckets')) return false;
    const range = IDBKeyRange.bound(
      `${playlistId}\u0000${type}\u0000${categoryId}\u0000`,
      `${playlistId}\u0000${type}\u0000${categoryId}\u0000\uffff`
    );
    const tx = db.transaction('channel_buckets', 'readonly');
    const cursor = await tx.store.openCursor(range);
    return Boolean(cursor);
  } catch {
    return false;
  }
};

export const isLegacyGeneralRepairChecked = async (
  playlistId: string,
  type: 'live' | 'movie' | 'series'
): Promise<boolean> => {
  if (!playlistId) return true;
  try {
    const db = await initDB();
    const rec = await db.get('metadata', `legacy_general_checked_v1_${playlistId}_${type}`);
    return Boolean(rec?.checked);
  } catch {
    return false;
  }
};

export const markLegacyGeneralRepairChecked = async (
  playlistId: string,
  type: 'live' | 'movie' | 'series'
): Promise<void> => {
  if (!playlistId) return;
  try {
    const db = await initDB();
    await db.put('metadata', {
      id: `legacy_general_checked_v1_${playlistId}_${type}`,
      checked: true,
      updatedAt: Date.now()
    });
  } catch {}
};

export const promoteUncategorizedItemsToGeneral = async (
  playlistId: string,
  type: 'live' | 'movie' | 'series',
  generalUrls: Set<string>,
  generalNames: Set<string>,
  orderIndex = 0
): Promise<boolean> => {
  if (!playlistId || (generalUrls.size === 0 && generalNames.size === 0)) return false;
  try {
    const db = await initDB();
    if (!db.objectStoreNames.contains('channel_buckets')) return false;

    const range = IDBKeyRange.bound(
      `${playlistId}\u0000${type}\u0000uncategorized\u0000`,
      `${playlistId}\u0000${type}\u0000uncategorized\u0000\uffff`
    );

    const oldBuckets: ChannelBucketRecord[] = await db.getAll('channel_buckets', range);
    if (!oldBuckets || oldBuckets.length === 0) return false;

    const matchedGeneral: CompactChannelRecord[] = [];
    const remainingUncategorized: CompactChannelRecord[] = [];

    for (let b = 0; b < oldBuckets.length; b++) {
      const items = oldBuckets[b].items || [];
      for (let i = 0; i < items.length; i++) {
        const rec = items[i];
        const urlMatch = rec.u ? generalUrls.has(rec.u) : false;
        const nameMatch = rec.n ? generalNames.has(rec.n.trim().toLowerCase()) : false;
        if (urlMatch || nameMatch) {
          matchedGeneral.push({ ...rec, cn: 'General' });
        } else {
          remainingUncategorized.push(rec);
        }
      }
    }

    if (matchedGeneral.length === 0) return false;

    const tx = db.transaction(['channel_buckets', 'categories'], 'readwrite');
    const bucketStore = tx.objectStore('channel_buckets');
    const catStore = tx.objectStore('categories');

    await bucketStore.delete(range);

    for (let i = 0; i < remainingUncategorized.length; i += BUCKET_MAX_ITEMS) {
      const slice = remainingUncategorized.slice(i, i + BUCKET_MAX_ITEMS);
      bucketStore.put({
        id: `${playlistId}\u0000${type}\u0000uncategorized\u0000${nextBucketShard()}`,
        playlist_id: playlistId,
        type,
        category_id: 'uncategorized',
        items: slice
      } satisfies ChannelBucketRecord);
    }

    for (let i = 0; i < matchedGeneral.length; i += BUCKET_MAX_ITEMS) {
      const slice = matchedGeneral.slice(i, i + BUCKET_MAX_ITEMS);
      bucketStore.put({
        id: `${playlistId}\u0000${type}\u0000General\u0000${nextBucketShard()}`,
        playlist_id: playlistId,
        type,
        category_id: 'General',
        items: slice
      } satisfies ChannelBucketRecord);
    }

    catStore.put({
      id: `${playlistId}_${type}_General`,
      category_id: 'General',
      category_name: 'General',
      playlist_id: playlistId,
      type,
      orderIndex
    });

    await tx.done;
    invalidatePlaylistQueryCache(playlistId, type);
    return true;
  } catch (e) {
    console.warn('Error in promoteUncategorizedItemsToGeneral:', e);
    return false;
  }
};

const stripEpisodeCompositePrefix = (rawId: any, playlistId: string, seriesId: string): string => {
  if (rawId === undefined || rawId === null) return '';
  let s = String(rawId).trim();
  const prefix = `${playlistId}_${seriesId}_`;
  while (prefix && s.startsWith(prefix)) {
    s = s.slice(prefix.length);
  }
  return s;
};

export const saveEpisodes = async (playlistId: string, seriesId: string, episodes: any[]) => {
  if (!episodes || episodes.length === 0 || !seriesId) return;
  try {
    const db = await initDB();
    const tx = db.transaction('episodes', 'readwrite');
    const store = tx.objectStore('episodes');
    const sid = String(seriesId);
    for (let i = 0; i < episodes.length; i++) {
      const ep = episodes[i];
      const rawEpId =
        stripEpisodeCompositePrefix(
          ep.xtream_id ?? ep.original_id ?? ep.stream_id ?? ep.id,
          playlistId,
          sid
        ) || `ep_${i}`;
      const compositeDbId = `${playlistId}_${sid}_${rawEpId}`;
      store.put({
        ...ep,
        season: Number(ep.season ?? ep.season_num ?? 1) || 1,
        id: compositeDbId,
        db_id: compositeDbId,
        xtream_id: rawEpId,
        original_id: rawEpId,
        stream_id: rawEpId,
        series_id: sid,
        playlist_id: playlistId
      });
    }
    await tx.done;
  } catch (e) {
    console.error('Error in saveEpisodes:', e);
  }
};

export const getEpisodesBySeriesId = async (playlistId: string, seriesId: string) => {
  if (!seriesId || !playlistId) return [];
  try {
    const db = await initDB();
    const sid = String(seriesId);
    const index = db.transaction('episodes', 'readonly').objectStore('episodes').index('playlist_series');
    const rows = await index.getAll([playlistId, sid]);
    return (rows || []).map((ep: any) => {
      const trueEpId = stripEpisodeCompositePrefix(
        ep.xtream_id ?? ep.original_id ?? ep.stream_id ?? ep.id,
        playlistId,
        sid
      );
      if (!trueEpId) return ep;
      return {
        ...ep,
        db_id: ep.db_id || ep.id,
        id: trueEpId,
        xtream_id: trueEpId,
        original_id: trueEpId,
        stream_id: trueEpId
      };
    });
  } catch (e) {
    console.error('Error in getEpisodesBySeriesId:', e);
    return [];
  }
};

export const saveSeriesDetails = async (playlistId: string, seriesId: string, data: { info?: any; seasons?: any[]; episodes?: any }) => {
  if (!playlistId || !seriesId || !data) return;
  try {
    const db = await initDB();
    await db.put('metadata', {
      id: `series_info_${playlistId}_${seriesId}`,
      info: data.info || {},
      seasons: data.seasons || [],
      episodesRaw: data.episodes || null,
      updatedAt: Date.now()
    });
  } catch (e) {
    console.error('Error in saveSeriesDetails:', e);
  }
};

export const getSeriesDetails = async (playlistId: string, seriesId: string) => {
  if (!playlistId || !seriesId) return null;
  try {
    const db = await initDB();
    const meta = await db.get('metadata', `series_info_${playlistId}_${seriesId}`);
    const episodes = await getEpisodesBySeriesId(playlistId, seriesId);
    if (!meta && (!episodes || episodes.length === 0)) return null;
    return {
      info: meta?.info || {},
      seasons: meta?.seasons || [],
      episodes: meta?.episodesRaw || (episodes && episodes.length > 0 ? episodes : [])
    };
  } catch (e) {
    return null;
  }
};

export const saveVodDetails = async (playlistId: string, vodId: string, data: any) => {
  if (!playlistId || !vodId || !data) return;
  try {
    const db = await initDB();
    await db.put('metadata', {
      id: `vod_info_${playlistId}_${vodId}`,
      data,
      updatedAt: Date.now()
    });
  } catch (e) {}
};

export const getVodDetails = async (playlistId: string, vodId: string) => {
  if (!playlistId || !vodId) return null;
  try {
    const db = await initDB();
    const rec = await db.get('metadata', `vod_info_${playlistId}_${vodId}`);
    return rec?.data || null;
  } catch (e) {
    return null;
  }
};

export const clearPlaylistData = async (playlistId: string) => {
  try {
    const db = await initDB();
    const legacyRange = IDBKeyRange.bound(`${playlistId}_`, `${playlistId}_\uffff`);
    const bucketRange = IDBKeyRange.bound(`${playlistId}\u0000`, `${playlistId}\u0000\uffff`);
    const stores: Array<'channel_buckets' | 'channels' | 'categories' | 'episodes' | 'metadata'> = [
      'channels',
      'categories',
      'episodes',
      'metadata'
    ];
    if (db.objectStoreNames.contains('channel_buckets')) {
      stores.unshift('channel_buckets');
    }

    const tx = db.transaction(stores, 'readwrite');
    if (db.objectStoreNames.contains('channel_buckets')) {
      await tx.objectStore('channel_buckets').delete(bucketRange);
    }
    await tx.objectStore('channels').delete(legacyRange);
    await tx.objectStore('categories').delete(legacyRange);
    await tx.objectStore('episodes').delete(legacyRange);
    await tx.objectStore('metadata').delete(`extraction_${playlistId}`);
    await tx.objectStore('metadata').delete(`xtream_cfg_${playlistId}`);

    await tx.done;
    xtreamConfigMemCache.delete(playlistId);
    invalidatePlaylistQueryCache(playlistId);
  } catch (e) {
    console.error('Error clearing playlist data:', e);
  }
};

export const clearDB = async () => {
  try {
    const db = await initDB();
    const stores: Array<'channel_buckets' | 'channels' | 'categories' | 'episodes' | 'metadata'> = [
      'channels',
      'categories',
      'episodes',
      'metadata'
    ];
    if (db.objectStoreNames.contains('channel_buckets')) {
      stores.unshift('channel_buckets');
    }
    const tx = db.transaction(stores, 'readwrite');
    if (db.objectStoreNames.contains('channel_buckets')) {
      await tx.objectStore('channel_buckets').clear();
    }
    await tx.objectStore('channels').clear();
    await tx.objectStore('categories').clear();
    await tx.objectStore('episodes').clear();
    await tx.objectStore('metadata').clear();
    await tx.done;
    xtreamConfigMemCache.clear();
    channelsCategoryQueryCache.clear();
  } catch (e) {}
};
