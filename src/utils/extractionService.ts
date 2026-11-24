// Achour Player background IPTV playlist extraction service
import { Playlist } from '../types';
import {
  saveChannels,
  saveCategories,
  saveCategoryBucketsBatch,
  saveStreamingBatch,
  saveXtreamPlaylistConfig,
  setPlaylistExtractionStatus,
  getPlaylistExtractionStatus,
  getCategoriesByPlaylistAndType,
  clearPlaylistData,
  clearChannelsQueryCache,
  CompactChannelRecord,
  ExtractionStatusRecord
} from '../lib/db';
import { xtreamFetch, iptvGlobalCache } from './iptv';
import { getPlatformUrl, getNativeStreamProxyPort, isNativeApp } from './platform';
import {
  FastJsonObjectBatchScanner,
  mapXtreamItemToCompact,
  StreamingM3UParser,
  parseM3UChunksAsync,
  ParsedM3UEntry,
  StreamingBatchResult
} from './streamScanner';

export {
  FastJsonObjectBatchScanner,
  FastJsonObjectBatchScanner as StreamingJsonArrayParser,
  StreamingM3UParser,
  parseM3UChunksAsync
};
export type { ParsedM3UEntry, StreamingBatchResult };

export interface ExtractionProgress {
  playlistId?: string;
  stage: 'idle' | 'downloading' | 'parsing' | 'categorizing' | 'saving' | 'verifying' | 'paused' | 'completed' | 'error';
  percent: number;
  message: string;
  counts?: {
    live: number;
    movie: number;
    series: number;
  };
  completedTypes?: Array<'live' | 'movie' | 'series'>;
  liveReady?: boolean;
  movieReady?: boolean;
  seriesReady?: boolean;
  categoriesReady?: boolean;
}

export type ProgressCallback = (progress: ExtractionProgress) => void;

const yieldToEventLoop = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/**
 * Handles the complete lifecycle of IPTV playlist extraction and persistence.
 * Optimized for low-RAM TV hardware (Fire TV Stick 4K 1st Gen / Fire OS 6 / 1.5GB RAM):
 * - Offloads network streaming, scanning & bucketed DB commits to a dedicated Web Worker
 * - Uses 64KB native loopback streaming relay on Android APK to eliminate CapacitorHttp heap OOM
 * - Writes primary-key `channel_buckets` (up to 2,000 compact records per bucket, 0 secondary indexes)
 * - Prioritizes Parallel Categories -> Live TV First -> Movies -> Series so Live TV is usable in seconds
 * - Exposes a live pub/sub progress bus so UI screens stay synchronized without restarting/freezing.
 */
export class ExtractionService {
  private static activeExtractions = new Map<string, Promise<boolean>>();
  private static abortControllers = new Map<string, AbortController>();
  private static activeWorkers = new Map<string, Worker>();
  private static subscribers = new Map<string, Set<ProgressCallback>>();
  private static latestProgress = new Map<string, ExtractionProgress>();
  private static suppressedPauseIds = new Set<string>();

  static isExtracting(playlistId: string): boolean {
    return this.activeExtractions.has(playlistId);
  }

  static isAnyExtracting(): boolean {
    return this.activeExtractions.size > 0;
  }

  static getLatestProgress(playlistId: string): ExtractionProgress | null {
    return this.latestProgress.get(playlistId) || null;
  }

  static subscribe(playlistId: string, cb: ProgressCallback): () => void {
    let set = this.subscribers.get(playlistId);
    if (!set) {
      set = new Set();
      this.subscribers.set(playlistId, set);
    }
    set.add(cb);

    const existing = this.latestProgress.get(playlistId);
    if (existing) {
      try { cb(existing); } catch {}
    }

    return () => {
      const s = this.subscribers.get(playlistId);
      if (s) {
        s.delete(cb);
        if (s.size === 0) this.subscribers.delete(playlistId);
      }
    };
  }

  private static emitGlobalProgress(playlistId: string, progress: ExtractionProgress) {
    const payload: ExtractionProgress = { ...progress, playlistId };
    this.latestProgress.set(playlistId, payload);

    try {
      (window as any).__ACHOUR_EXTRACTION_PROGRESS__ =
        payload.stage === 'completed' ? null : payload;
      window.dispatchEvent(new CustomEvent('achour_extraction_progress', { detail: payload }));
    } catch {}

    const set = this.subscribers.get(playlistId);
    if (set) {
      for (const cb of Array.from(set)) {
        try { cb(payload); } catch {}
      }
    }
  }

  private static emitTypeReady(playlistId: string, mediaType: 'live' | 'movie' | 'series' | 'categories', count: number) {
    try {
      window.dispatchEvent(
        new CustomEvent('achour_type_ready', {
          detail: { playlistId, mediaType, count }
        })
      );
    } catch {}
  }

  static cancel(playlistId: string, suppressPauseSave = false) {
    if (suppressPauseSave) {
      this.suppressedPauseIds.add(playlistId);
    }
    const w = this.activeWorkers.get(playlistId);
    if (w) {
      try { w.postMessage({ type: 'cancel' }); } catch {}
      setTimeout(() => {
        try { w.terminate(); } catch {}
      }, 200);
      this.activeWorkers.delete(playlistId);
    }
    const ctrl = this.abortControllers.get(playlistId);
    if (ctrl) {
      try { ctrl.abort(); } catch {}
      this.abortControllers.delete(playlistId);
    }
    this.activeExtractions.delete(playlistId);
  }

  static cancelAll(suppressPauseSave = true) {
    for (const id of Array.from(this.activeExtractions.keys())) {
      this.cancel(id, suppressPauseSave);
    }
    for (const [id, ctrl] of this.abortControllers.entries()) {
      if (suppressPauseSave) this.suppressedPauseIds.add(id);
      try { ctrl.abort(); } catch {}
    }
    for (const w of this.activeWorkers.values()) {
      try { w.terminate(); } catch {}
    }
    this.abortControllers.clear();
    this.activeWorkers.clear();
    this.activeExtractions.clear();
  }

  /**
   * Resets in-memory IPTV caches, active progress pointers, and cancels in-flight extractions
   * when switching active playlist, while strictly preserving IndexedDB data of all playlists.
   */
  static async purgeStorageForSwitch(keepM3uFileKeys: string[] = []): Promise<void> {
    this.cancelAll(false);
    try {
      (window as any).__ACHOUR_EXTRACTION_PROGRESS__ = null;
    } catch {}
    try {
      iptvGlobalCache.clear();
      clearChannelsQueryCache();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('achour_clear_session_cache'));
      }
    } catch {}
    try {
      localStorage.removeItem('achour_last_stream_id');
      const keepSet = new Set(keepM3uFileKeys.filter(Boolean));
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('achour_m3u_file_') && !keepSet.has(k)) {
          keysToRemove.push(k);
        }
      }
      for (const k of keysToRemove) {
        localStorage.removeItem(k);
      }
    } catch {}
  }

  static async extract(playlist: Playlist, onProgress?: ProgressCallback, force = false): Promise<boolean> {
    const playlistId = playlist.id;
    this.suppressedPauseIds.delete(playlistId);

    const unsubscribe = onProgress ? this.subscribe(playlistId, onProgress) : () => {};

    // Attach cleanly to existing active extraction instead of returning fake progress
    const existingPromise = this.activeExtractions.get(playlistId);
    if (existingPromise) {
      try {
        return await existingPromise;
      } finally {
        unsubscribe();
      }
    }

    const runPromise = this.executeExtraction(playlist, force);
    this.activeExtractions.set(playlistId, runPromise);

    try {
      return await runPromise;
    } finally {
      unsubscribe();
      if (this.activeExtractions.get(playlistId) === runPromise) {
        this.activeExtractions.delete(playlistId);
      }
    }
  }

  private static async executeExtraction(playlist: Playlist, force: boolean): Promise<boolean> {
    const playlistId = playlist.id;
    const controller = new AbortController();
    this.abortControllers.set(playlistId, controller);

    const existingStatus = !force ? await getPlaylistExtractionStatus(playlistId) : null;
    let lastPercent = existingStatus?.stage === 'paused' ? (existingStatus.percent || 5) : 5;
    let currentCounts = {
      live: existingStatus?.counts?.live || 0,
      movie: existingStatus?.counts?.movie || 0,
      series: existingStatus?.counts?.series || 0
    };
    const resumeState: Partial<ExtractionStatusRecord> = {
      completedTypes: existingStatus?.completedTypes || [],
      liveReady: existingStatus?.liveReady || false,
      movieReady: existingStatus?.movieReady || false,
      seriesReady: existingStatus?.seriesReady || false,
      categoriesReady: existingStatus?.categoriesReady || false,
      completedCategories: existingStatus?.completedCategories || {},
      m3uSavedEntries: existingStatus?.m3uSavedEntries || 0,
      savedOffsetByType: existingStatus?.savedOffsetByType || {},
      bucketSeq: existingStatus?.bucketSeq
    };

    const emitProgress = (p: ExtractionProgress) => {
      lastPercent = p.percent;
      if (p.counts) currentCounts = p.counts;
      if (p.completedTypes) resumeState.completedTypes = p.completedTypes;
      if (typeof p.liveReady === 'boolean') resumeState.liveReady = p.liveReady;
      if (typeof p.movieReady === 'boolean') resumeState.movieReady = p.movieReady;
      if (typeof p.seriesReady === 'boolean') resumeState.seriesReady = p.seriesReady;
      if (typeof p.categoriesReady === 'boolean') resumeState.categoriesReady = p.categoriesReady;
      this.emitGlobalProgress(playlistId, p);
    };

    const updateResumeCheckpoint = (patch: Partial<ExtractionStatusRecord>) => {
      if (patch.completedTypes) resumeState.completedTypes = patch.completedTypes;
      if (typeof patch.liveReady === 'boolean') resumeState.liveReady = patch.liveReady;
      if (typeof patch.movieReady === 'boolean') resumeState.movieReady = patch.movieReady;
      if (typeof patch.seriesReady === 'boolean') resumeState.seriesReady = patch.seriesReady;
      if (typeof patch.categoriesReady === 'boolean') resumeState.categoriesReady = patch.categoriesReady;
      if (patch.completedCategories) resumeState.completedCategories = patch.completedCategories;
      if (patch.savedOffsetByType) resumeState.savedOffsetByType = patch.savedOffsetByType;
      if (typeof patch.m3uSavedEntries === 'number') resumeState.m3uSavedEntries = patch.m3uSavedEntries;
      if (typeof patch.bucketSeq === 'number') resumeState.bucketSeq = patch.bucketSeq;
      if (patch.counts) currentCounts = patch.counts;
      if (typeof patch.percent === 'number') lastPercent = patch.percent;
    };

    try {
      if (!force && existingStatus && existingStatus.stage === 'completed') {
        emitProgress({
          stage: 'completed',
          percent: 100,
          message: 'تم التحميل من الذاكرة المحلية',
          counts: existingStatus.counts || { live: 0, movie: 0, series: 0 },
          liveReady: true,
          movieReady: true,
          seriesReady: true,
          categoriesReady: true,
          completedTypes: ['live', 'movie', 'series']
        });
        return true;
      }

      if (force) {
        await clearPlaylistData(playlistId);
        lastPercent = 5;
        currentCounts = { live: 0, movie: 0, series: 0 };
        resumeState.completedTypes = [];
        resumeState.liveReady = false;
        resumeState.movieReady = false;
        resumeState.seriesReady = false;
        resumeState.categoriesReady = false;
        resumeState.completedCategories = {};
        resumeState.savedOffsetByType = {};
        resumeState.m3uSavedEntries = 0;
      }

      let effectivePlaylist: Playlist = { ...playlist };

      // Auto-Upgrade M3U URLs with embedded Xtream credentials (get.php?username=...&password=...)
      if (effectivePlaylist.url && !effectivePlaylist.url.startsWith('local_file://')) {
        try {
          const testUrl = new URL(effectivePlaylist.url.startsWith('http') ? effectivePlaylist.url : 'http://' + effectivePlaylist.url);
          const u = testUrl.searchParams.get('username') || effectivePlaylist.username;
          const p = testUrl.searchParams.get('password') || effectivePlaylist.password;
          if (u && p) {
            effectivePlaylist = {
              ...effectivePlaylist,
              type: 'xtream',
              username: u,
              password: p,
              url: testUrl.origin,
              portal: testUrl.origin
            };

            try {
              const rawLocal = localStorage.getItem('achour_local_playlists');
              if (rawLocal) {
                const list: Playlist[] = JSON.parse(rawLocal);
                const updated = list.map(item => item.id === playlist.id ? { ...item, ...effectivePlaylist } : item);
                localStorage.setItem('achour_local_playlists', JSON.stringify(updated));
              }
            } catch {}
          }
        } catch {}
      }

      emitProgress({
        stage: 'downloading',
        percent: Math.max(5, lastPercent),
        message: existingStatus?.stage === 'paused' ? 'جاري استئناف الاستخراج...' : 'جاري الاتصال بالسيرفر...',
        counts: currentCounts,
        liveReady: resumeState.liveReady,
        movieReady: resumeState.movieReady,
        seriesReady: resumeState.seriesReady,
        categoriesReady: resumeState.categoriesReady,
        completedTypes: resumeState.completedTypes
      });

      // Use Dedicated Off-Thread Web Worker for Xtream & Remote M3U whenever Worker is supported
      const canUseWorker =
        typeof Worker !== 'undefined' &&
        (effectivePlaylist.type === 'xtream' ||
          (effectivePlaylist.type === 'm3u' && Boolean(effectivePlaylist.url) && !effectivePlaylist.url!.startsWith('local_file://')));

      if (canUseWorker) {
        try {
          const workerOk = await this.runExtractionInWorker(
            effectivePlaylist,
            existingStatus,
            force,
            controller.signal,
            emitProgress,
            updateResumeCheckpoint
          );
          if (workerOk) return true;
        } catch (workerErr: any) {
          if (workerErr?.name === 'AbortError' || controller.signal.aborted) throw workerErr;
          console.warn('[ExtractionService] Worker fell back to main-thread fast pipeline:', workerErr?.message);
        }
      }

      if (effectivePlaylist.type === 'm3u') {
        return await this.extractM3UStreaming(effectivePlaylist, emitProgress, controller.signal, existingStatus, updateResumeCheckpoint);
      } else if (effectivePlaylist.type === 'xtream') {
        return await this.extractXtreamBatched(effectivePlaylist, emitProgress, controller.signal, existingStatus, updateResumeCheckpoint);
      } else if (effectivePlaylist.type === 'stalker') {
        return await this.extractStalker(effectivePlaylist, emitProgress);
      }

      return false;
    } catch (error: any) {
      if (error?.name === 'AbortError' || controller.signal.aborted) {
        if (this.suppressedPauseIds.has(playlistId)) {
          this.suppressedPauseIds.delete(playlistId);
          return false;
        }
        await setPlaylistExtractionStatus(playlistId, {
          stage: 'paused',
          percent: lastPercent,
          message: 'تم إيقاف الاستخراج مؤقتاً',
          counts: currentCounts,
          completedTypes: resumeState.completedTypes,
          liveReady: resumeState.liveReady,
          movieReady: resumeState.movieReady,
          seriesReady: resumeState.seriesReady,
          categoriesReady: resumeState.categoriesReady,
          completedCategories: resumeState.completedCategories,
          savedOffsetByType: resumeState.savedOffsetByType,
          bucketSeq: resumeState.bucketSeq,
          m3uSavedEntries: resumeState.m3uSavedEntries ?? (currentCounts.live + currentCounts.movie + currentCounts.series)
        });
        emitProgress({
          stage: 'paused',
          percent: lastPercent,
          message: 'تم إيقاف الاستخراج مؤقتاً (يمكن المشاهدة أو الاستئناف)',
          counts: currentCounts,
          completedTypes: resumeState.completedTypes,
          liveReady: resumeState.liveReady,
          movieReady: resumeState.movieReady,
          seriesReady: resumeState.seriesReady,
          categoriesReady: resumeState.categoriesReady
        });
        return false;
      }

      emitProgress({
        stage: 'error',
        percent: 0,
        message: `فشل الاستخراج: ${error?.message || 'خطأ غير معروف'}`,
        counts: currentCounts
      });
      return false;
    } finally {
      this.suppressedPauseIds.delete(playlistId);
      if (this.abortControllers.get(playlistId) === controller) {
        this.abortControllers.delete(playlistId);
      }
      const w = this.activeWorkers.get(playlistId);
      if (w) {
        try { w.terminate(); } catch {}
        this.activeWorkers.delete(playlistId);
      }
    }
  }

  private static runExtractionInWorker(
    playlist: Playlist,
    existingStatus: ExtractionStatusRecord | null,
    force: boolean,
    signal: AbortSignal,
    emitProgress: (p: ExtractionProgress) => void,
    onCheckpoint: (patch: Partial<ExtractionStatusRecord>) => void
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('Extraction aborted by user', 'AbortError'));
        return;
      }

      let worker: Worker;
      try {
        worker = new Worker(new URL('../workers/iptvExtractor.worker.ts', import.meta.url), {
          type: 'module'
        });
      } catch (initErr) {
        reject(initErr);
        return;
      }

      const playlistId = playlist.id;
      this.activeWorkers.set(playlistId, worker);
      let settled = false;

      const cleanup = () => {
        signal.removeEventListener('abort', onAbort);
        if (this.activeWorkers.get(playlistId) === worker) {
          this.activeWorkers.delete(playlistId);
        }
        try { worker.terminate(); } catch {}
      };

      const onAbort = () => {
        try { worker.postMessage({ type: 'cancel' }); } catch {}
        if (!settled) {
          settled = true;
          setTimeout(() => cleanup(), 150);
          reject(new DOMException('Extraction aborted by user', 'AbortError'));
        }
      };
      signal.addEventListener('abort', onAbort, { once: true });

      worker.onmessage = (event: MessageEvent<any>) => {
        if (settled) return;
        const msg = event.data;
        if (!msg) return;

        if (msg.kind === 'progress') {
          onCheckpoint({
            counts: msg.counts,
            completedTypes: msg.completedTypes,
            liveReady: msg.liveReady,
            movieReady: msg.movieReady,
            seriesReady: msg.seriesReady,
            categoriesReady: msg.categoriesReady,
            savedOffsetByType: msg.savedOffsetByType,
            bucketSeq: msg.bucketSeq,
            m3uSavedEntries: msg.m3uSavedEntries,
            percent: msg.percent
          });
          emitProgress({
            stage: msg.stage || 'saving',
            percent: msg.percent ?? 10,
            message: msg.message || '',
            counts: msg.counts,
            completedTypes: msg.completedTypes,
            liveReady: msg.liveReady,
            movieReady: msg.movieReady,
            seriesReady: msg.seriesReady,
            categoriesReady: msg.categoriesReady
          });
        } else if (msg.kind === 'type_ready') {
          this.emitTypeReady(playlistId, msg.mediaType, msg.count || 0);
        } else if (msg.kind === 'done') {
          settled = true;
          cleanup();
          const st: ExtractionStatusRecord = msg.status || {
            stage: 'completed',
            percent: 100,
            message: 'تم استخراج القائمة بالكامل'
          };
          emitProgress({
            stage: 'completed',
            percent: 100,
            message: st.message || 'تم استخراج القائمة بالكامل',
            counts: st.counts,
            completedTypes: st.completedTypes || ['live', 'movie', 'series'],
            liveReady: true,
            movieReady: true,
            seriesReady: true,
            categoriesReady: true
          });
          resolve(true);
        } else if (msg.kind === 'aborted') {
          settled = true;
          cleanup();
          reject(new DOMException('Extraction aborted by user', 'AbortError'));
        } else if (msg.kind === 'error') {
          settled = true;
          cleanup();
          reject(new Error(msg.message || 'Worker failed'));
        }
      };

      worker.onerror = (err) => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(new Error(err?.message || 'Worker execution error'));
        }
      };

      let cleanHost = (playlist.url || '').trim().replace(/\/+$/, '').replace(/\/(player_api|get|index)\.php.*$/i, '');
      if (cleanHost && !cleanHost.startsWith('http')) cleanHost = 'http://' + cleanHost;

      worker.postMessage({
        type: 'start',
        playlistId,
        mode: playlist.type === 'xtream' ? 'xtream' : 'm3u',
        isNativeApp: isNativeApp(),
        nativeProxyPort: getNativeStreamProxyPort(),
        origin: typeof window !== 'undefined' ? window.location.origin : '',
        force,
        existingStatus: existingStatus || null,
        cleanHost,
        username: playlist.username || '',
        password: playlist.password || '',
        m3uUrl: playlist.url || ''
      });
    });
  }

  private static async persistStreamingBatch(
    playlistId: string,
    batch: StreamingBatchResult,
    signal: AbortSignal
  ) {
    await saveStreamingBatch(playlistId, batch, signal);
  }

  private static async extractM3UStreaming(
    playlist: Playlist,
    onProgress: ProgressCallback,
    signal: AbortSignal,
    existingStatus: ExtractionStatusRecord | null,
    onCheckpoint?: (patch: Partial<ExtractionStatusRecord>) => void
  ): Promise<boolean> {
    const playlistId = playlist.id;
    const url = playlist.url || '';

    // Route M3U links with Xtream credentials directly to Xtream endpoint
    if (url.includes('username=') && url.includes('password=')) {
      try {
        const testUrl = new URL(url.startsWith('http') ? url : 'http://' + url);
        const u = testUrl.searchParams.get('username');
        const p = testUrl.searchParams.get('password');
        if (u && p) {
          return await this.extractXtreamBatched({
            ...playlist,
            type: 'xtream',
            username: u,
            password: p,
            url: testUrl.origin,
            portal: testUrl.origin
          }, onProgress, signal, existingStatus, onCheckpoint);
        }
      } catch {}
    }

    const skipEntries = existingStatus?.stage === 'paused'
      ? Math.max(
          existingStatus.m3uSavedEntries || 0,
          (existingStatus.counts?.live || 0) + (existingStatus.counts?.movie || 0) + (existingStatus.counts?.series || 0)
        )
      : 0;

    let lastCheckpointItems = skipEntries;
    const recordM3UBatch = async (curCounts: { live: number; movie: number; series: number }, pct: number) => {
      const totalSaved = curCounts.live + curCounts.movie + curCounts.series;
      onCheckpoint?.({ counts: curCounts, m3uSavedEntries: totalSaved, percent: pct });
      if (totalSaved - lastCheckpointItems >= 12000) {
        lastCheckpointItems = totalSaved;
        await setPlaylistExtractionStatus(playlistId, {
          stage: 'saving',
          percent: pct,
          message: `جاري الحفظ التدريجي (${totalSaved.toLocaleString()})...`,
          counts: curCounts,
          m3uSavedEntries: totalSaved
        });
      }
    };

    // Handle local M3U content stored locally in chunks without .split('\n')
    if (url.startsWith('local_file://')) {
      const fileName = url.replace('local_file://', '');
      const localContent = localStorage.getItem('achour_m3u_file_' + fileName) || '';
      if (!localContent) throw new Error('الملف المحلي فارغ');

      const totalLen = localContent.length;
      const CHUNK_CHARS = 1024 * 1024;
      let processedChars = 0;
      async function* localChunkGenerator() {
        for (let offset = 0; offset < totalLen; offset += CHUNK_CHARS) {
          processedChars = Math.min(totalLen, offset + CHUNK_CHARS);
          yield localContent.slice(offset, offset + CHUNK_CHARS);
        }
      }

      const counts = await parseM3UChunksAsync(
        localChunkGenerator(),
        async (batch, curCounts) => {
          await this.persistStreamingBatch(playlistId, batch, signal);
          const totalItems = curCounts.live + curCounts.movie + curCounts.series;
          const pct = Math.min(98, 12 + Math.round((processedChars / Math.max(1, totalLen)) * 85));
          await recordM3UBatch(curCounts, pct);
          onProgress({
            stage: 'saving',
            percent: Math.max(12, pct),
            message: `تم حفظ ${totalItems.toLocaleString()} عنصر...`,
            counts: curCounts
          });
        },
        { batchSize: 2500, signal, skipEntries }
      );

      const totalSaved = counts.live + counts.movie + counts.series;
      const finalStatus = {
        stage: 'completed' as const,
        percent: 100,
        message: 'تم استخراج القائمة بنجاح',
        counts,
        m3uSavedEntries: totalSaved,
        completedTypes: ['live', 'movie', 'series'] as ('live' | 'movie' | 'series')[],
        liveReady: true,
        movieReady: true,
        seriesReady: true,
        categoriesReady: true
      };
      await setPlaylistExtractionStatus(playlistId, finalStatus);
      this.emitTypeReady(playlistId, 'live', counts.live);
      this.emitTypeReady(playlistId, 'movie', counts.movie);
      this.emitTypeReady(playlistId, 'series', counts.series);
      onProgress(finalStatus);
      return true;
    }

    if (!url) throw new Error('رابط القائمة فارغ');

    const fetchUrl = getPlatformUrl('m3u', url);
    onProgress({ stage: 'downloading', percent: Math.max(10, existingStatus?.percent || 10), message: 'جاري فتح تدفق البيانات...' });

    const response = await fetch(fetchUrl, { signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentLengthHeader = response.headers.get('content-length');
    const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
    let receivedBytes = 0;

    if (response.body) {
      const reader = response.body.getReader();
      async function* streamReaderGenerator() {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              receivedBytes += value.byteLength;
              yield value;
            }
          }
        } finally {
          reader.releaseLock();
        }
      }

      const counts = await parseM3UChunksAsync(
        streamReaderGenerator(),
        async (batch, curCounts) => {
          await this.persistStreamingBatch(playlistId, batch, signal);
          const totalItems = curCounts.live + curCounts.movie + curCounts.series;
          const pct = totalBytes > 0
            ? Math.min(98, 12 + Math.round((receivedBytes / totalBytes) * 85))
            : Math.min(96, 15 + Math.round((1 - Math.exp(-totalItems / 35000)) * 80));

          await recordM3UBatch(curCounts, pct);
          onProgress({
            stage: 'saving',
            percent: pct,
            message: `جاري الحفظ التدريجي (${totalItems.toLocaleString()})...`,
            counts: curCounts
          });
        },
        { batchSize: 2500, signal, skipEntries }
      );

      const totalSaved = counts.live + counts.movie + counts.series;
      const finalStatus = {
        stage: 'completed' as const,
        percent: 100,
        message: 'تم استخراج القائمة بنجاح',
        counts,
        m3uSavedEntries: totalSaved,
        completedTypes: ['live', 'movie', 'series'] as ('live' | 'movie' | 'series')[],
        liveReady: true,
        movieReady: true,
        seriesReady: true,
        categoriesReady: true
      };
      await setPlaylistExtractionStatus(playlistId, finalStatus);
      this.emitTypeReady(playlistId, 'live', counts.live);
      this.emitTypeReady(playlistId, 'movie', counts.movie);
      this.emitTypeReady(playlistId, 'series', counts.series);
      onProgress(finalStatus);
      return true;
    } else {
      const text = await response.text();
      const CHUNK_CHARS = 1024 * 1024;
      let processedChars = 0;
      async function* textChunkGenerator() {
        for (let offset = 0; offset < text.length; offset += CHUNK_CHARS) {
          processedChars = Math.min(text.length, offset + CHUNK_CHARS);
          yield text.slice(offset, offset + CHUNK_CHARS);
        }
      }
      const counts = await parseM3UChunksAsync(
        textChunkGenerator(),
        async (batch, curCounts) => {
          await this.persistStreamingBatch(playlistId, batch, signal);
          const totalItems = curCounts.live + curCounts.movie + curCounts.series;
          const pct = Math.min(98, 12 + Math.round((processedChars / Math.max(1, text.length)) * 85));
          await recordM3UBatch(curCounts, pct);
          onProgress({
            stage: 'saving',
            percent: pct,
            message: `جاري الحفظ (${totalItems.toLocaleString()})...`,
            counts: curCounts
          });
        },
        { batchSize: 2500, signal, skipEntries }
      );

      const totalSaved = counts.live + counts.movie + counts.series;
      const finalStatus = {
        stage: 'completed' as const,
        percent: 100,
        message: 'تم استخراج القائمة بنجاح',
        counts,
        m3uSavedEntries: totalSaved,
        completedTypes: ['live', 'movie', 'series'] as ('live' | 'movie' | 'series')[],
        liveReady: true,
        movieReady: true,
        seriesReady: true,
        categoriesReady: true
      };
      await setPlaylistExtractionStatus(playlistId, finalStatus);
      this.emitTypeReady(playlistId, 'live', counts.live);
      this.emitTypeReady(playlistId, 'movie', counts.movie);
      this.emitTypeReady(playlistId, 'series', counts.series);
      onProgress(finalStatus);
      return true;
    }
  }

  private static async saveRawXtreamSlices(
    rawList: any[],
    startOrderIndex: number,
    type: 'live' | 'movie' | 'series',
    playlistId: string,
    cleanHost: string,
    encodedUser: string,
    encodedPass: string,
    signal: AbortSignal,
    onSliceSaved?: (savedTotalForType: number) => void
  ): Promise<number> {
    const SLICE = 4000;
    const total = rawList.length;
    for (let i = 0; i < total; i += SLICE) {
      if (signal.aborted) throw new DOMException('Extraction aborted by user', 'AbortError');
      const end = Math.min(i + SLICE, total);
      const grouped = new Map<string, CompactChannelRecord[]>();
      for (let j = i; j < end; j++) {
        const { categoryId, record } = mapXtreamItemToCompact(
          rawList[j],
          startOrderIndex + j,
          type,
          cleanHost,
          encodedUser,
          encodedPass
        );
        let arr = grouped.get(categoryId);
        if (!arr) {
          arr = [];
          grouped.set(categoryId, arr);
        }
        arr.push(record);
      }
      await saveCategoryBucketsBatch(playlistId, type, grouped, signal);
      onSliceSaved?.(startOrderIndex + end);
      await yieldToEventLoop();
    }
    return total;
  }

  /**
   * Main-thread fallback fast streaming Xtream JSON parser using FastJsonObjectBatchScanner
   * + bucketed IndexedDB writes.
   */
  private static async streamXtreamArray(
    cleanHost: string,
    username: string,
    password: string,
    encodedUser: string,
    encodedPass: string,
    action: string,
    type: 'live' | 'movie' | 'series',
    playlistId: string,
    signal: AbortSignal,
    skipItems: number,
    onBatchSaved: (totalProcessed: number, bytesReceived: number, contentLength: number) => Promise<void>
  ): Promise<{ ok: boolean; isArray: boolean; totalItems: number }> {
    const apiUrl = `${cleanHost}/player_api.php`;
    const fetchUrl = getPlatformUrl('xtream', apiUrl, { username, password, action });

    const response = await fetch(fetchUrl, {
      signal,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'IPTVSmartersPro/3.1.5 (Linux; Android 12)'
      }
    });

    if (!response.ok && response.status !== 884) {
      return { ok: false, isArray: true, totalItems: 0 };
    }
    if (!response.body) {
      return { ok: false, isArray: true, totalItems: 0 };
    }

    const contentLengthHeader = response.headers.get('content-length');
    const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) || 0 : 0;
    let bytesReceived = 0;

    const scanner = new FastJsonObjectBatchScanner(600, skipItems);
    const decoder = new TextDecoder('utf-8');
    const reader = response.body.getReader();

    let groupedBuffer = new Map<string, CompactChannelRecord[]>();
    let bufferedCount = 0;

    const flushBuckets = async () => {
      if (groupedBuffer.size === 0) return;
      const snap = groupedBuffer;
      groupedBuffer = new Map();
      bufferedCount = 0;
      await saveCategoryBucketsBatch(playlistId, type, snap, signal);
      await onBatchSaved(scanner.totalItems, bytesReceived, contentLength);
      await yieldToEventLoop();
    };

    const collectBatch = (items: Array<{ item: any; index: number }>) => {
      for (let i = 0; i < items.length; i++) {
        const entry = items[i];
        const { categoryId, record } = mapXtreamItemToCompact(
          entry.item,
          entry.index,
          type,
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
          const chunkText = decoder.decode(value, { stream: true });
          scanner.feedChunk(chunkText, collectBatch);
          if (scanner.invalidNotArray) {
            try { await reader.cancel(); } catch {}
            return { ok: false, isArray: false, totalItems: 0 };
          }
          if (bufferedCount >= 3500) {
            await flushBuckets();
          }
        }
      }

      const tail = decoder.decode();
      if (tail) scanner.feedChunk(tail, collectBatch);
      scanner.finish(collectBatch);
      await flushBuckets();
    } finally {
      try { reader.releaseLock(); } catch {}
    }

    return { ok: true, isArray: !scanner.invalidNotArray, totalItems: scanner.totalItems };
  }

  private static async extractXtreamBatched(
    playlist: Playlist,
    onProgress: ProgressCallback,
    signal: AbortSignal,
    existingStatus: ExtractionStatusRecord | null,
    onCheckpoint?: (patch: Partial<ExtractionStatusRecord>) => void
  ): Promise<boolean> {
    const { url, username, password } = playlist;
    const playlistId = playlist.id;
    let cleanHost = (url || '').trim().replace(/\/+$/, '').replace(/\/(player_api|get|index)\.php.*$/i, '');
    if (cleanHost && !cleanHost.startsWith('http')) cleanHost = 'http://' + cleanHost;

    const u = username ? encodeURIComponent(username) : '';
    const p = password ? encodeURIComponent(password) : '';

    await saveXtreamPlaylistConfig(playlistId, { cleanHost, encodedUser: u, encodedPass: p });

    const completedSet = new Set<'live' | 'movie' | 'series'>(existingStatus?.completedTypes || []);
    const completedCatSets: Record<'live' | 'movie' | 'series', Set<string>> = {
      live: new Set<string>(existingStatus?.completedCategories?.live || []),
      movie: new Set<string>(existingStatus?.completedCategories?.movie || []),
      series: new Set<string>(existingStatus?.completedCategories?.series || [])
    };
    const savedOffsetByType: Partial<Record<'live' | 'movie' | 'series', number>> = {
      ...(existingStatus?.savedOffsetByType || {})
    };
    const counts = {
      live: existingStatus?.counts?.live || 0,
      movie: existingStatus?.counts?.movie || 0,
      series: existingStatus?.counts?.series || 0
    };

    const serializeCompletedCategories = (): Partial<Record<'live' | 'movie' | 'series', string[]>> => ({
      live: Array.from(completedCatSets.live),
      movie: Array.from(completedCatSets.movie),
      series: Array.from(completedCatSets.series)
    });

    const syncCheckpoint = (pct: number) => {
      onCheckpoint?.({
        percent: pct,
        counts: { ...counts },
        completedTypes: Array.from(completedSet),
        liveReady: completedSet.has('live'),
        movieReady: completedSet.has('movie'),
        seriesReady: completedSet.has('series'),
        categoriesReady: true,
        completedCategories: serializeCompletedCategories(),
        savedOffsetByType: { ...savedOffsetByType }
      });
    };

    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const typeConfigs: Array<{
      type: 'live' | 'movie' | 'series';
      action: string;
      catAction: string;
      label: string;
      startPct: number;
      endPct: number;
    }> = [
      { type: 'live', action: 'get_live_streams', catAction: 'get_live_categories', label: 'القنوات المباشرة', startPct: 12, endPct: 36 },
      { type: 'movie', action: 'get_vod_streams', catAction: 'get_vod_categories', label: 'الأفلام', startPct: 36, endPct: 76 },
      { type: 'series', action: 'get_series', catAction: 'get_series_categories', label: 'المسلسلات', startPct: 76, endPct: 99 }
    ];

    const categoriesByType: Record<'live' | 'movie' | 'series', any[]> = {
      live: [],
      movie: [],
      series: []
    };

    onProgress({ stage: 'categorizing', percent: 6, message: 'جاري تجهيز جميع الأقسام...', counts: { ...counts } });
    await Promise.all(
      typeConfigs.map(async (cfg) => {
        if (signal.aborted) return;
        let storedCats = await getCategoriesByPlaylistAndType(playlistId, cfg.type);
        if (!storedCats || storedCats.length === 0) {
          const catRes = await xtreamFetch(cleanHost, username || '', password || '', cfg.catAction, {}, 1, signal);
          if (catRes.ok && catRes.rawList?.length) {
            const mappedCats = catRes.rawList.map((c: any, idx: number) => ({
              category_id: String(c.category_id || c.id || idx),
              category_name: String(c.category_name || c.name || ''),
              type: cfg.type,
              orderIndex: idx
            }));
            await saveCategories(mappedCats, cfg.type, playlistId, { batchSize: 2000, signal });
            storedCats = mappedCats;
          } else {
            storedCats = [];
          }
        }
        categoriesByType[cfg.type] = storedCats;
      })
    );

    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    this.emitTypeReady(playlistId, 'categories', categoriesByType.live.length + categoriesByType.movie.length + categoriesByType.series.length);
    syncCheckpoint(12);

    // Priority order: LIVE -> MOVIES -> SERIES
    for (const cfg of typeConfigs) {
      if (completedSet.has(cfg.type)) continue;
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

      const pctSpan = cfg.endPct - cfg.startPct;
      const resumeOffset = existingStatus?.stage === 'paused' ? (savedOffsetByType[cfg.type] || 0) : 0;

      try {
        onProgress({
          stage: 'downloading',
          percent: cfg.startPct,
          message: resumeOffset > 0
            ? `استكمال ${cfg.label} من العنصر ${resumeOffset.toLocaleString()}...`
            : `جاري تحميل ${cfg.label}...`,
          counts: { ...counts },
          liveReady: completedSet.has('live'),
          movieReady: completedSet.has('movie'),
          seriesReady: completedSet.has('series'),
          categoriesReady: true,
          completedTypes: Array.from(completedSet)
        });

        let handled = false;
        let lastPersistedOffset = resumeOffset;

        try {
          const streamResult = await this.streamXtreamArray(
            cleanHost,
            username || '',
            password || '',
            u,
            p,
            cfg.action,
            cfg.type,
            playlistId,
            signal,
            resumeOffset,
            async (totalProcessed, bytesReceived, contentLength) => {
              counts[cfg.type] = Math.max(counts[cfg.type], totalProcessed);
              savedOffsetByType[cfg.type] = totalProcessed;

              const ratio = contentLength > 0
                ? Math.min(0.98, bytesReceived / contentLength)
                : Math.min(0.95, 1 - Math.exp(-totalProcessed / (cfg.type === 'live' ? 12000 : cfg.type === 'movie' ? 85000 : 25000)));
              const pct = Math.min(cfg.endPct - 1, cfg.startPct + Math.max(1, Math.round(ratio * pctSpan)));

              syncCheckpoint(pct);
              onProgress({
                stage: 'saving',
                percent: pct,
                message: `حفظ ${cfg.label}: ${totalProcessed.toLocaleString()}`,
                counts: { ...counts },
                liveReady: completedSet.has('live'),
                movieReady: completedSet.has('movie'),
                seriesReady: completedSet.has('series'),
                categoriesReady: true,
                completedTypes: Array.from(completedSet)
              });

              if (totalProcessed - lastPersistedOffset >= 15000) {
                lastPersistedOffset = totalProcessed;
                await setPlaylistExtractionStatus(playlistId, {
                  stage: 'saving',
                  percent: pct,
                  message: `تم حفظ ${totalProcessed.toLocaleString()} من ${cfg.label}...`,
                  counts: { ...counts },
                  completedTypes: Array.from(completedSet),
                  liveReady: completedSet.has('live'),
                  movieReady: completedSet.has('movie'),
                  seriesReady: completedSet.has('series'),
                  categoriesReady: true,
                  completedCategories: serializeCompletedCategories(),
                  savedOffsetByType: { ...savedOffsetByType }
                });
              }
            }
          );

          if (streamResult.ok && streamResult.isArray && streamResult.totalItems > 0) {
            counts[cfg.type] = streamResult.totalItems;
            savedOffsetByType[cfg.type] = streamResult.totalItems;
            handled = true;
          }
        } catch (streamErr: any) {
          if (streamErr?.name === 'AbortError' || signal.aborted) throw streamErr;
          console.warn(`[extractXtreamBatched] Streaming ${cfg.type} fell back:`, streamErr?.message);
        }

        if (!handled) {
          const bulkRes = await xtreamFetch(cleanHost, username || '', password || '', cfg.action, {}, 1, signal);

          if (bulkRes.ok && bulkRes.rawList && bulkRes.rawList.length > 0) {
            const totalLen = bulkRes.rawList.length;
            const startAt = resumeOffset < totalLen ? resumeOffset : 0;
            const remainingSlice = startAt > 0 ? bulkRes.rawList.slice(startAt) : bulkRes.rawList;
            const savedCount = await this.saveRawXtreamSlices(
              remainingSlice,
              startAt,
              cfg.type,
              playlistId,
              cleanHost,
              u,
              p,
              signal,
              (curTotal) => {
                counts[cfg.type] = curTotal;
                savedOffsetByType[cfg.type] = curTotal;
                const pct = cfg.startPct + Math.round((curTotal / totalLen) * pctSpan);
                syncCheckpoint(pct);
                onProgress({
                  stage: 'saving',
                  percent: pct,
                  message: `حفظ ${cfg.label} (${curTotal.toLocaleString()} / ${totalLen.toLocaleString()})`,
                  counts: { ...counts },
                  liveReady: completedSet.has('live'),
                  movieReady: completedSet.has('movie'),
                  seriesReady: completedSet.has('series'),
                  categoriesReady: true
                });
              }
            );
            counts[cfg.type] = startAt + savedCount;
            savedOffsetByType[cfg.type] = counts[cfg.type];
            bulkRes.rawList.length = 0;
          } else {
            const cats = categoriesByType[cfg.type];
            const doneCatSet = completedCatSets[cfg.type];
            const totalCats = cats.length;

            if (totalCats > 0) {
              const CONCURRENCY = 4;
              let cursor = 0;
              const pooledGrouped = new Map<string, CompactChannelRecord[]>();
              let pooledCount = 0;

              const runWorker = async () => {
                while (cursor < totalCats && !signal.aborted) {
                  const cIdx = cursor++;
                  const cat = cats[cIdx];
                  const catId = String(cat.category_id || cat.id || '');
                  if (!catId || doneCatSet.has(catId)) continue;

                  const res = await xtreamFetch(
                    cleanHost,
                    username || '',
                    password || '',
                    cfg.action,
                    { category_id: catId },
                    1,
                    signal
                  );

                  if (res.ok && res.rawList && res.rawList.length > 0) {
                    const startIdx = counts[cfg.type];
                    counts[cfg.type] += res.rawList.length;
                    for (let k = 0; k < res.rawList.length; k++) {
                      const { categoryId, record } = mapXtreamItemToCompact(
                        res.rawList[k],
                        startIdx + k,
                        cfg.type,
                        cleanHost,
                        u,
                        p
                      );
                      let arr = pooledGrouped.get(categoryId);
                      if (!arr) {
                        arr = [];
                        pooledGrouped.set(categoryId, arr);
                      }
                      arr.push(record);
                      pooledCount++;
                    }
                    res.rawList.length = 0;
                  }
                  doneCatSet.add(catId);

                  if (pooledCount >= 3000) {
                    const snap = new Map(pooledGrouped);
                    pooledGrouped.clear();
                    pooledCount = 0;
                    await saveCategoryBucketsBatch(playlistId, cfg.type, snap, signal);
                    const pctAfter = cfg.startPct + Math.round(((cIdx + 1) / totalCats) * pctSpan);
                    syncCheckpoint(pctAfter);
                    onProgress({
                      stage: 'saving',
                      percent: pctAfter,
                      message: `${cfg.label}: ${counts[cfg.type].toLocaleString()} عنصر`,
                      counts: { ...counts },
                      liveReady: completedSet.has('live'),
                      movieReady: completedSet.has('movie'),
                      seriesReady: completedSet.has('series'),
                      categoriesReady: true
                    });
                  }
                }
              };

              await Promise.all(Array.from({ length: Math.min(CONCURRENCY, totalCats) }, () => runWorker()));
              if (pooledGrouped.size > 0) {
                await saveCategoryBucketsBatch(playlistId, cfg.type, pooledGrouped, signal);
              }
            }
          }
        }
      } catch (typeErr: any) {
        if (typeErr?.name === 'AbortError' || signal.aborted) throw typeErr;
        console.warn(`[extractXtreamBatched] ${cfg.type} skipped or failed:`, typeErr);
      }

      completedSet.add(cfg.type);
      this.emitTypeReady(playlistId, cfg.type, counts[cfg.type]);
      syncCheckpoint(cfg.endPct);

      await setPlaylistExtractionStatus(playlistId, {
        stage: 'saving',
        percent: cfg.endPct,
        message: cfg.type === 'live'
          ? `القنوات المباشرة جاهزة (${counts.live.toLocaleString()})`
          : `تم حفظ ${cfg.label} (${counts[cfg.type].toLocaleString()})`,
        counts: { ...counts },
        completedTypes: Array.from(completedSet),
        liveReady: completedSet.has('live'),
        movieReady: completedSet.has('movie'),
        seriesReady: completedSet.has('series'),
        categoriesReady: true,
        completedCategories: serializeCompletedCategories(),
        savedOffsetByType: { ...savedOffsetByType }
      });

      onProgress({
        stage: 'saving',
        percent: cfg.endPct,
        message: cfg.type === 'live'
          ? `القنوات المباشرة جاهزة للمشاهدة (${counts.live.toLocaleString()})`
          : `تم حفظ ${cfg.label} (${counts[cfg.type].toLocaleString()})`,
        counts: { ...counts },
        completedTypes: Array.from(completedSet),
        liveReady: completedSet.has('live'),
        movieReady: completedSet.has('movie'),
        seriesReady: completedSet.has('series'),
        categoriesReady: true
      });
      await yieldToEventLoop();
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
      completedCategories: serializeCompletedCategories(),
      savedOffsetByType: { ...savedOffsetByType }
    };

    await setPlaylistExtractionStatus(playlistId, finalStatus);
    onProgress(finalStatus);
    return true;
  }

  private static async extractStalker(playlist: Playlist, onProgress: ProgressCallback): Promise<boolean> {
    const finalStatus = {
      stage: 'completed' as const,
      percent: 100,
      message: 'تم تجهيز البوابة',
      counts: { live: 0, movie: 0, series: 0 },
      completedTypes: ['live', 'movie', 'series'] as ('live' | 'movie' | 'series')[],
      liveReady: true,
      movieReady: true,
      seriesReady: true,
      categoriesReady: true
    };
    await setPlaylistExtractionStatus(playlist.id, finalStatus);
    this.emitTypeReady(playlist.id, 'live', 0);
    onProgress(finalStatus);
    return true;
  }
}
