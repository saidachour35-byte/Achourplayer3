// Dedicated Web Worker for IPTV Xtream & M3U streaming extraction
import {
  saveCategoryBucketsBatch,
  saveCategories,
  saveStreamingBatch,
  saveXtreamPlaylistConfig,
  setPlaylistExtractionStatus,
  getCategoriesByPlaylistAndType,
  clearPlaylistData,
  CompactChannelRecord,
  ExtractionStatusRecord
} from '../lib/db';
import {
  FastJsonObjectBatchScanner,
  mapXtreamItemToCompact,
  StreamingM3UParser
} from '../utils/streamScanner';

export interface WorkerExtractRequest {
  type: 'start' | 'cancel';
  playlistId: string;
  mode: 'xtream' | 'm3u';
  isNativeApp: boolean;
  nativeProxyPort?: number;
  origin: string;
  force: boolean;
  existingStatus: ExtractionStatusRecord | null;
  // Xtream params
  cleanHost?: string;
  username?: string;
  password?: string;
  // M3U params
  m3uUrl?: string;
}

let activeController: AbortController | null = null;
let cancelledByMsg = false;

const postProgress = (payload: any) => {
  (self as any).postMessage({ kind: 'progress', ...payload });
};

const postTypeReady = (playlistId: string, readyType: 'live' | 'movie' | 'series' | 'categories', count: number) => {
  (self as any).postMessage({ kind: 'type_ready', playlistId, mediaType: readyType, count });
};

const buildTargetUrl = (
  req: WorkerExtractRequest,
  kind: 'xtream' | 'm3u',
  actionOrUrl: string,
  extraParams: Record<string, string> = {}
): string => {
  if (kind === 'm3u') {
    if (req.isNativeApp) {
      if (req.nativeProxyPort && req.nativeProxyPort > 0) {
        return `http://127.0.0.1:${req.nativeProxyPort}/proxy?url=${encodeURIComponent(actionOrUrl)}`;
      }
      return actionOrUrl;
    }
    const q = new URLSearchParams({ url: actionOrUrl, ...extraParams });
    return `${req.origin}/api/proxy/m3u?${q.toString()}`;
  }

  const cleanHost = req.cleanHost || '';
  const search = new URLSearchParams({
    username: req.username || '',
    password: req.password || '',
    action: actionOrUrl,
    ...extraParams
  });
  const directApiUrl = `${cleanHost}/player_api.php?${search.toString()}`;

  if (req.isNativeApp) {
    if (req.nativeProxyPort && req.nativeProxyPort > 0) {
      return `http://127.0.0.1:${req.nativeProxyPort}/proxy?url=${encodeURIComponent(directApiUrl)}`;
    }
    return directApiUrl;
  }

  const proxyParams = new URLSearchParams({
    url: `${cleanHost}/player_api.php`,
    username: req.username || '',
    password: req.password || '',
    action: actionOrUrl,
    ...extraParams
  });
  return `${req.origin}/api/proxy/xtream?${proxyParams.toString()}`;
};

const fetchSmallJsonArray = async (url: string, signal: AbortSignal): Promise<any[]> => {
  try {
    const res = await fetch(url, {
      signal,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'IPTVSmartersPro/3.1.5 (Linux; Android 12)'
      }
    });
    if (!res.ok && res.status !== 884) return [];
    const text = (await res.text()).replace(/^\uFEFF/, '').trim();
    if (!text || text.startsWith('<')) return [];
    const data = JSON.parse(text);
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      const candidate = data.streams || data.live_streams || data.vod_streams || data.series || data.data;
      if (Array.isArray(candidate)) return candidate;
      const vals = Object.values(data);
      if (vals.length > 0 && typeof vals[0] === 'object' && vals[0] !== null) return vals as any[];
    }
    return [];
  } catch (e: any) {
    if (e?.name === 'AbortError' || signal.aborted) throw e;
    return [];
  }
};

const runXtreamInWorker = async (req: WorkerExtractRequest, signal: AbortSignal) => {
  const playlistId = req.playlistId;
  const cleanHost = req.cleanHost || '';
  const username = req.username || '';
  const password = req.password || '';
  const encodedUser = encodeURIComponent(username);
  const encodedPass = encodeURIComponent(password);

  await saveXtreamPlaylistConfig(playlistId, { cleanHost, encodedUser, encodedPass });

  const existing = !req.force ? req.existingStatus : null;
  const completedSet = new Set<'live' | 'movie' | 'series'>(existing?.completedTypes || []);
  const completedCatSets: Record<'live' | 'movie' | 'series', Set<string>> = {
    live: new Set<string>(existing?.completedCategories?.live || []),
    movie: new Set<string>(existing?.completedCategories?.movie || []),
    series: new Set<string>(existing?.completedCategories?.series || [])
  };
  const savedOffsetByType: Partial<Record<'live' | 'movie' | 'series', number>> = {
    ...(existing?.savedOffsetByType || {})
  };
  const counts = {
    live: existing?.counts?.live || 0,
    movie: existing?.counts?.movie || 0,
    series: existing?.counts?.series || 0
  };
  const bucketSeqRef = {
    current: typeof existing?.bucketSeq === 'number' && existing.bucketSeq > 0
      ? existing.bucketSeq
      : Math.floor((Date.now() % 1_000_000) * 100)
  };

  let liveReady = Boolean(existing?.liveReady || completedSet.has('live'));
  let movieReady = Boolean(existing?.movieReady || completedSet.has('movie'));
  let seriesReady = Boolean(existing?.seriesReady || completedSet.has('series'));

  const buildFlags = () => ({
    liveReady,
    movieReady,
    seriesReady,
    categoriesReady: true,
    completedTypes: Array.from(completedSet)
  });

  // 1. Fetch ALL 3 categories in parallel first!
  postProgress({
    stage: 'categorizing',
    percent: 6,
    message: 'جاري تحميل جميع الأقسام بشكل متوازٍ...',
    counts: { ...counts },
    ...buildFlags(),
    categoriesReady: false
  });

  const typeConfigs: Array<{
    type: 'live' | 'movie' | 'series';
    action: string;
    catAction: string;
    label: string;
    startPct: number;
    endPct: number;
    flushSize: number;
  }> = [
    { type: 'live', action: 'get_live_streams', catAction: 'get_live_categories', label: 'القنوات المباشرة', startPct: 12, endPct: 36, flushSize: 2500 },
    { type: 'movie', action: 'get_vod_streams', catAction: 'get_vod_categories', label: 'الأفلام', startPct: 36, endPct: 76, flushSize: 4000 },
    { type: 'series', action: 'get_series', catAction: 'get_series_categories', label: 'المسلسلات', startPct: 76, endPct: 99, flushSize: 4000 }
  ];

  const categoriesByType: Record<'live' | 'movie' | 'series', any[]> = {
    live: [],
    movie: [],
    series: []
  };

  await Promise.all(
    typeConfigs.map(async (cfg) => {
      if (signal.aborted) return;
      let stored = await getCategoriesByPlaylistAndType(playlistId, cfg.type);
      if (!stored || stored.length === 0) {
        const catUrl = buildTargetUrl(req, 'xtream', cfg.catAction);
        const rawCats = await fetchSmallJsonArray(catUrl, signal);
        if (rawCats.length > 0) {
          const mapped = rawCats.map((c: any, idx: number) => ({
            category_id: String(c.category_id || c.id || idx),
            category_name: String(c.category_name || c.name || ''),
            type: cfg.type,
            orderIndex: idx
          }));
          await saveCategories(mapped, cfg.type, playlistId, { batchSize: 2000, signal });
          stored = mapped;
        } else {
          stored = [];
        }
      }
      categoriesByType[cfg.type] = stored;
    })
  );

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  postTypeReady(playlistId, 'categories', categoriesByType.live.length + categoriesByType.movie.length + categoriesByType.series.length);

  postProgress({
    stage: 'downloading',
    percent: 12,
    message: 'تم تجهيز الأقسام، جاري استخراج القنوات المباشرة أولاً...',
    counts: { ...counts },
    ...buildFlags()
  });

  // 2. Stream each type (LIVE FIRST -> MOVIES -> SERIES) using overlapped bucket commits
  for (const cfg of typeConfigs) {
    if (completedSet.has(cfg.type)) continue;
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const pctSpan = cfg.endPct - cfg.startPct;
    const resumeOffset = existing?.stage === 'paused' ? (savedOffsetByType[cfg.type] || 0) : 0;
    let lastEmitAt = 0;
    let lastCheckpointItems = resumeOffset;

    const url = buildTargetUrl(req, 'xtream', cfg.action);
    const response = await fetch(url, {
      signal,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'IPTVSmartersPro/3.1.5 (Linux; Android 12)'
      }
    });

    if (!response.ok && response.status !== 884) {
      throw new Error(`HTTP ${response.status} on ${cfg.action}`);
    }

    const contentLengthHeader = response.headers.get('content-length');
    const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) || 0 : 0;
    let bytesReceived = 0;
    let handledByStream = false;

    if (response.body) {
      const scanner = new FastJsonObjectBatchScanner(600, resumeOffset);
      const decoder = new TextDecoder('utf-8');
      const reader = response.body.getReader();

      let groupedBuffer = new Map<string, CompactChannelRecord[]>();
      let bufferedCount = 0;
      const inFlightWrites: Promise<void>[] = [];

      const enqueueFlush = async (forceWait = false) => {
        if (groupedBuffer.size === 0) {
          if (forceWait && inFlightWrites.length > 0) {
            await Promise.all(inFlightWrites);
            inFlightWrites.length = 0;
          }
          return;
        }

        const snapshot = groupedBuffer;
        const flushedItems = bufferedCount;
        groupedBuffer = new Map();
        bufferedCount = 0;

        // Backpressure: max 2 concurrent/queued IndexedDB commits so Worker RAM never grows
        while (inFlightWrites.length >= 2) {
          await inFlightWrites.shift();
        }

        const totalProcessedSnapshot = scanner.totalItems;
        const p = saveCategoryBucketsBatch(playlistId, cfg.type, snapshot, signal, bucketSeqRef).then(async () => {
          counts[cfg.type] = Math.max(counts[cfg.type], totalProcessedSnapshot);
          savedOffsetByType[cfg.type] = totalProcessedSnapshot;

          const now = Date.now();
          const ratio = contentLength > 0
            ? Math.min(0.98, bytesReceived / contentLength)
            : Math.min(0.95, 1 - Math.exp(-totalProcessedSnapshot / (cfg.type === 'live' ? 12000 : cfg.type === 'movie' ? 85000 : 25000)));
          const pct = Math.min(cfg.endPct - 1, cfg.startPct + Math.max(1, Math.round(ratio * pctSpan)));

          if (now - lastEmitAt >= 180 || totalProcessedSnapshot - lastCheckpointItems >= 15000) {
            lastEmitAt = now;
            postProgress({
              stage: 'saving',
              percent: pct,
              message: `${cfg.label}: ${counts[cfg.type].toLocaleString()} عنصر`,
              counts: { ...counts },
              savedOffsetByType: { ...savedOffsetByType },
              bucketSeq: bucketSeqRef.current,
              ...buildFlags()
            });
          }

          if (totalProcessedSnapshot - lastCheckpointItems >= 15000 && flushedItems > 0) {
            lastCheckpointItems = totalProcessedSnapshot;
            await setPlaylistExtractionStatus(playlistId, {
              stage: 'saving',
              percent: pct,
              message: `${cfg.label}: ${counts[cfg.type].toLocaleString()} عنصر`,
              counts: { ...counts },
              completedTypes: Array.from(completedSet),
              liveReady,
              movieReady,
              seriesReady,
              categoriesReady: true,
              completedCategories: {
                live: Array.from(completedCatSets.live),
                movie: Array.from(completedCatSets.movie),
                series: Array.from(completedCatSets.series)
              },
              savedOffsetByType: { ...savedOffsetByType },
              bucketSeq: bucketSeqRef.current
            });
          }
        });

        inFlightWrites.push(p);
        if (forceWait) {
          await Promise.all(inFlightWrites);
          inFlightWrites.length = 0;
        }
      };

      const consumeParsedBatch = (items: Array<{ item: any; index: number }>) => {
        for (let i = 0; i < items.length; i++) {
          const entry = items[i];
          const { categoryId, record } = mapXtreamItemToCompact(
            entry.item,
            entry.index,
            cfg.type,
            cleanHost,
            encodedUser,
            encodedPass
          );
          let arr = groupedBuffer.get(categoryId);
          if (!arr) {
            arr = [];
            groupedBuffer.set(categoryId, arr);
          }
          arr.push(record);
          bufferedCount++;
        }
      };

      try {
        while (true) {
          if (signal.aborted) throw new DOMException('Extraction aborted by user', 'AbortError');
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.byteLength > 0) {
            bytesReceived += value.byteLength;
            const textChunk = decoder.decode(value, { stream: true });
            scanner.feedChunk(textChunk, consumeParsedBatch);

            if (scanner.invalidNotArray) {
              try { await reader.cancel(); } catch {}
              break;
            }
            if (bufferedCount >= cfg.flushSize) {
              await enqueueFlush(false);
            }
          }
        }

        if (!scanner.invalidNotArray) {
          const tail = decoder.decode();
          if (tail) scanner.feedChunk(tail, consumeParsedBatch);
          scanner.finish(consumeParsedBatch);
          await enqueueFlush(true);
          if (scanner.totalItems > 0) {
            counts[cfg.type] = scanner.totalItems;
            savedOffsetByType[cfg.type] = scanner.totalItems;
            handledByStream = true;
          }
        }
      } finally {
        try { reader.releaseLock(); } catch {}
        if (inFlightWrites.length > 0) {
          await Promise.allSettled(inFlightWrites);
        }
      }
    }

    // Fallback inside worker if response was object-wrapped or empty
    if (!handledByStream && !signal.aborted) {
      const cats = categoriesByType[cfg.type];
      if (cats.length > 0) {
        const CONCURRENCY = 4;
        const doneSet = completedCatSets[cfg.type];
        let catCursor = 0;
        let activeGrouped = new Map<string, CompactChannelRecord[]>();
        let activeBufCount = 0;

        const workerLoop = async () => {
          while (catCursor < cats.length && !signal.aborted) {
            const idx = catCursor++;
            const cat = cats[idx];
            const catId = String(cat.category_id || cat.id || '');
            if (!catId || doneSet.has(catId)) continue;

            const catUrl = buildTargetUrl(req, 'xtream', cfg.action, { category_id: catId });
            const items = await fetchSmallJsonArray(catUrl, signal);
            if (items.length > 0) {
              const baseOrder = counts[cfg.type];
              counts[cfg.type] += items.length;
              for (let j = 0; j < items.length; j++) {
                const { categoryId, record } = mapXtreamItemToCompact(
                  items[j],
                  baseOrder + j,
                  cfg.type,
                  cleanHost,
                  encodedUser,
                  encodedPass
                );
                let arr = activeGrouped.get(categoryId);
                if (!arr) {
                  arr = [];
                  activeGrouped.set(categoryId, arr);
                }
                arr.push(record);
                activeBufCount++;
              }
            }
            doneSet.add(catId);
            if (activeBufCount >= cfg.flushSize) {
              const snap = activeGrouped;
              activeGrouped = new Map();
              activeBufCount = 0;
              await saveCategoryBucketsBatch(playlistId, cfg.type, snap, signal, bucketSeqRef);
              const pct = cfg.startPct + Math.round(((idx + 1) / cats.length) * pctSpan);
              postProgress({
                stage: 'saving',
                percent: pct,
                message: `${cfg.label}: ${counts[cfg.type].toLocaleString()} عنصر`,
                counts: { ...counts },
                ...buildFlags()
              });
            }
          }
        };

        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, cats.length) }, () => workerLoop()));
        if (activeGrouped.size > 0) {
          await saveCategoryBucketsBatch(playlistId, cfg.type, activeGrouped, signal, bucketSeqRef);
        }
      }
    }

    completedSet.add(cfg.type);
    if (cfg.type === 'live') liveReady = true;
    if (cfg.type === 'movie') movieReady = true;
    if (cfg.type === 'series') seriesReady = true;

    postTypeReady(playlistId, cfg.type, counts[cfg.type]);

    await setPlaylistExtractionStatus(playlistId, {
      stage: 'saving',
      percent: cfg.endPct,
      message: `تم حفظ ${cfg.label} (${counts[cfg.type].toLocaleString()})`,
      counts: { ...counts },
      completedTypes: Array.from(completedSet),
      liveReady,
      movieReady,
      seriesReady,
      categoriesReady: true,
      completedCategories: {
        live: Array.from(completedCatSets.live),
        movie: Array.from(completedCatSets.movie),
        series: Array.from(completedCatSets.series)
      },
      savedOffsetByType: { ...savedOffsetByType },
      bucketSeq: bucketSeqRef.current
    });

    postProgress({
      stage: 'saving',
      percent: cfg.endPct,
      message: cfg.type === 'live'
        ? `القنوات المباشرة جاهزة للمشاهدة (${counts.live.toLocaleString()})`
        : `تم حفظ ${cfg.label} (${counts[cfg.type].toLocaleString()})`,
      counts: { ...counts },
      ...buildFlags()
    });
  }

  const finalStatus: ExtractionStatusRecord = {
    stage: 'completed',
    percent: 100,
    message: 'تم استخراج القائمة بالكامل',
    counts: { ...counts },
    completedTypes: ['live', 'movie', 'series'],
    liveReady: true,
    movieReady: true,
    seriesReady: true,
    categoriesReady: true,
    completedCategories: {
      live: Array.from(completedCatSets.live),
      movie: Array.from(completedCatSets.movie),
      series: Array.from(completedCatSets.series)
    },
    savedOffsetByType: { ...savedOffsetByType },
    bucketSeq: bucketSeqRef.current
  };

  await setPlaylistExtractionStatus(playlistId, finalStatus);
  (self as any).postMessage({ kind: 'done', success: true, status: finalStatus });
};

const runM3UInWorker = async (req: WorkerExtractRequest, signal: AbortSignal) => {
  const playlistId = req.playlistId;
  const rawUrl = req.m3uUrl || '';
  if (!rawUrl) throw new Error('رابط القائمة فارغ');

  const existing = !req.force ? req.existingStatus : null;
  const skipEntries = existing?.stage === 'paused'
    ? Math.max(
        existing.m3uSavedEntries || 0,
        (existing.counts?.live || 0) + (existing.counts?.movie || 0) + (existing.counts?.series || 0)
      )
    : 0;

  const bucketSeqRef = {
    current: typeof existing?.bucketSeq === 'number' && existing.bucketSeq > 0
      ? existing.bucketSeq
      : Math.floor((Date.now() % 1_000_000) * 100)
  };

  postProgress({
    stage: 'downloading',
    percent: Math.max(10, existing?.percent || 10),
    message: 'جاري تحميل ومعالجة قائمة M3U...',
    counts: existing?.counts || { live: 0, movie: 0, series: 0 }
  });

  const fetchUrl = buildTargetUrl(req, 'm3u', rawUrl);
  const response = await fetch(fetchUrl, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const totalBytes = parseInt(response.headers.get('content-length') || '0', 10) || 0;
  let receivedBytes = 0;

  const parser = new StreamingM3UParser(2500, skipEntries);
  const decoder = new TextDecoder('utf-8');
  let lastEmitAt = 0;
  let lastCheckpointCount = skipEntries;

  const flushM3UBatch = async (batch: any) => {
    await saveStreamingBatch(playlistId, batch, signal, bucketSeqRef);
    const totalItems = parser.counts.live + parser.counts.movie + parser.counts.series;
    const pct = totalBytes > 0
      ? Math.min(98, 12 + Math.round((receivedBytes / totalBytes) * 85))
      : Math.min(96, 15 + Math.round((1 - Math.exp(-totalItems / 35000)) * 80));

    const now = Date.now();
    if (now - lastEmitAt >= 180) {
      lastEmitAt = now;
      postProgress({
        stage: 'saving',
        percent: pct,
        message: `تم حفظ ${totalItems.toLocaleString()} عنصر...`,
        counts: { ...parser.counts },
        m3uSavedEntries: totalItems,
        bucketSeq: bucketSeqRef.current
      });
    }

    if (totalItems - lastCheckpointCount >= 15000) {
      lastCheckpointCount = totalItems;
      await setPlaylistExtractionStatus(playlistId, {
        stage: 'saving',
        percent: pct,
        message: `تم حفظ ${totalItems.toLocaleString()} عنصر...`,
        counts: { ...parser.counts },
        m3uSavedEntries: totalItems,
        bucketSeq: bucketSeqRef.current
      });
    }
  };

  if (response.body) {
    const reader = response.body.getReader();
    const pending: any[] = [];
    try {
      while (true) {
        if (signal.aborted) throw new DOMException('Extraction aborted by user', 'AbortError');
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
          receivedBytes += value.byteLength;
          const chunk = decoder.decode(value, { stream: true });
          parser.feedChunk(chunk, (b) => pending.push(b));
          while (pending.length > 0) {
            await flushM3UBatch(pending.shift());
          }
        }
      }
      const tail = decoder.decode();
      if (tail) parser.feedChunk(tail, (b) => pending.push(b));
      parser.finish((b) => pending.push(b));
      while (pending.length > 0) {
        await flushM3UBatch(pending.shift());
      }
    } finally {
      try { reader.releaseLock(); } catch {}
    }
  } else {
    const text = await response.text();
    const pending: any[] = [];
    const CHUNK = 1024 * 1024;
    for (let i = 0; i < text.length; i += CHUNK) {
      receivedBytes = Math.min(text.length, i + CHUNK);
      parser.feedChunk(text.slice(i, i + CHUNK), (b) => pending.push(b));
      while (pending.length > 0) {
        await flushM3UBatch(pending.shift());
      }
    }
    parser.finish((b) => pending.push(b));
    while (pending.length > 0) {
      await flushM3UBatch(pending.shift());
    }
  }

  const counts = { ...parser.counts };
  const totalSaved = counts.live + counts.movie + counts.series;
  const finalStatus: ExtractionStatusRecord = {
    stage: 'completed',
    percent: 100,
    message: 'تم استخراج القائمة بنجاح',
    counts,
    m3uSavedEntries: totalSaved,
    completedTypes: ['live', 'movie', 'series'],
    liveReady: true,
    movieReady: true,
    seriesReady: true,
    categoriesReady: true,
    bucketSeq: bucketSeqRef.current
  };
  await setPlaylistExtractionStatus(playlistId, finalStatus);
  postTypeReady(playlistId, 'live', counts.live);
  postTypeReady(playlistId, 'movie', counts.movie);
  postTypeReady(playlistId, 'series', counts.series);
  (self as any).postMessage({ kind: 'done', success: true, status: finalStatus });
};

self.onmessage = async (event: MessageEvent<WorkerExtractRequest>) => {
  const req = event.data;
  if (!req) return;

  if (req.type === 'cancel') {
    cancelledByMsg = true;
    try { activeController?.abort(); } catch {}
    return;
  }

  if (req.type === 'start') {
    cancelledByMsg = false;
    activeController = new AbortController();
    const signal = activeController.signal;

    try {
      if (req.force) {
        await clearPlaylistData(req.playlistId);
      }
      if (req.mode === 'xtream') {
        await runXtreamInWorker(req, signal);
      } else {
        await runM3UInWorker(req, signal);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || signal.aborted || cancelledByMsg) {
        (self as any).postMessage({ kind: 'aborted' });
      } else {
        (self as any).postMessage({
          kind: 'error',
          message: err?.message || 'Worker extraction error'
        });
      }
    } finally {
      activeController = null;
    }
  }
};
