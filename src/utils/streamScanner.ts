// High-Speed Stream Scanner Utility for Achour Player
import type { CompactChannelRecord } from '../lib/db';

const CHAR_LBRACE = 123; // '{'
const CHAR_RBRACE = 125; // '}'
const CHAR_LBRACKET = 91; // '['
const CHAR_RBRACKET = 93; // ']'
const CHAR_QUOTE = 34; // '"'
const CHAR_BACKSLASH = 92; // '\\'
const CHAR_BOM = 0xfeff;
const CHAR_SPACE = 32;
const CHAR_TAB = 9;
const CHAR_LF = 10;
const CHAR_CR = 13;

export const fastDecodeHtml = (str: string): string => {
  if (!str) return '';
  if (str.indexOf('&') === -1) return str.trim();
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
};

const findUnquotedCommaIndex = (line: string): number => {
  let inSingle = false;
  let inDouble = false;
  let lastCommaOutsideQuotes = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line.charCodeAt(i);
    if (ch === CHAR_BACKSLASH && (inSingle || inDouble)) {
      i++;
      continue;
    }
    if (ch === 34 && !inSingle) inDouble = !inDouble;
    else if (ch === 39 && !inDouble) inSingle = !inSingle;
    else if (ch === 44 && !inSingle && !inDouble) {
      lastCommaOutsideQuotes = i;
    }
  }
  return lastCommaOutsideQuotes;
};

/**
 * High-speed incremental JSON top-level array scanner (`[{...},{...}]`).
 * Uses native `indexOf('"')` string-jumping and batch-parses 600 objects in a single
 * V8 `JSON.parse('[' + slice + ']')` call, falling back to per-object parse only on malformed batches.
 */
export class FastJsonObjectBatchScanner {
  private buffer = '';
  private scanIdx = 0;
  private started = false;
  private ended = false;
  public invalidNotArray = false;

  private objStart = -1;
  private objDepth = 0;
  private inString = false;

  private batchStarts: number[] = [];
  private batchEnds: number[] = [];
  private batchIndices: number[] = [];
  private readonly batchSize: number;
  private readonly skipItems: number;
  public totalItems = 0;

  constructor(batchSize = 600, skipItems = 0) {
    this.batchSize = Math.max(50, batchSize);
    this.skipItems = Math.max(0, skipItems);
  }

  private flushPendingBatch(onBatch: (items: Array<{ item: any; index: number }>) => void): number {
    const count = this.batchStarts.length;
    if (count === 0) return 0;

    const firstStart = this.batchStarts[0];
    const lastEnd = this.batchEnds[count - 1];
    const slice = this.buffer.slice(firstStart, lastEnd + 1);
    const out: Array<{ item: any; index: number }> = [];

    try {
      const arr = JSON.parse('[' + slice + ']');
      if (Array.isArray(arr) && arr.length === count) {
        for (let i = 0; i < count; i++) {
          const item = arr[i];
          if (item && typeof item === 'object') {
            out.push({ item, index: this.batchIndices[i] });
          }
        }
      } else if (Array.isArray(arr)) {
        for (let i = 0; i < arr.length; i++) {
          const item = arr[i];
          if (item && typeof item === 'object') {
            out.push({ item, index: this.batchIndices[Math.min(i, count - 1)] });
          }
        }
      }
    } catch {
      // Rare fallback: only parse individually if an item inside this batch is malformed
      for (let i = 0; i < count; i++) {
        const objText = this.buffer.slice(this.batchStarts[i], this.batchEnds[i] + 1);
        try {
          const parsed = JSON.parse(objText);
          if (parsed && typeof parsed === 'object') {
            out.push({ item: parsed, index: this.batchIndices[i] });
          }
        } catch {
          // Skip invalid item
        }
      }
    }

    this.batchStarts.length = 0;
    this.batchEnds.length = 0;
    this.batchIndices.length = 0;

    if (out.length > 0) {
      onBatch(out);
    }
    return lastEnd + 1;
  }

  public feedChunk(chunk: string, onBatch: (items: Array<{ item: any; index: number }>) => void) {
    if (!chunk || this.ended || this.invalidNotArray) return;

    this.buffer = this.buffer.length > 0 ? this.buffer + chunk : chunk;
    const len = this.buffer.length;
    let consumedUntil = 0;

    while (this.scanIdx < len) {
      if (!this.started) {
        const ch = this.buffer.charCodeAt(this.scanIdx);
        if (ch === CHAR_SPACE || ch === CHAR_TAB || ch === CHAR_LF || ch === CHAR_CR || ch === CHAR_BOM) {
          this.scanIdx++;
          continue;
        }
        if (ch === CHAR_LBRACKET) {
          this.started = true;
          this.scanIdx++;
          continue;
        }
        this.invalidNotArray = true;
        this.buffer = '';
        this.scanIdx = 0;
        return;
      }

      if (this.objStart === -1) {
        const ch = this.buffer.charCodeAt(this.scanIdx);
        if (ch === CHAR_LBRACE) {
          this.objStart = this.scanIdx;
          this.objDepth = 1;
          this.inString = false;
          this.scanIdx++;
          continue;
        }
        if (ch === CHAR_RBRACKET) {
          this.ended = true;
          this.scanIdx++;
          break;
        }
        this.scanIdx++;
        continue;
      }

      // Fast skip across JSON string literal using C++ indexOf('"')
      if (this.inString) {
        let searchPos = this.scanIdx;
        let closed = false;
        while (searchPos < len) {
          const quoteIdx = this.buffer.indexOf('"', searchPos);
          if (quoteIdx === -1) {
            this.scanIdx = len;
            break;
          }
          // Count consecutive backslashes immediately before quoteIdx
          let bs = 0;
          let k = quoteIdx - 1;
          while (k >= this.objStart && this.buffer.charCodeAt(k) === CHAR_BACKSLASH) {
            bs++;
            k--;
          }
          if ((bs & 1) === 0) {
            this.inString = false;
            this.scanIdx = quoteIdx + 1;
            closed = true;
            break;
          }
          searchPos = quoteIdx + 1;
        }
        if (!closed) {
          // Wait for next chunk while staying inside string
          this.scanIdx = len;
          break;
        }
        continue;
      }

      const ch = this.buffer.charCodeAt(this.scanIdx);
      if (ch === CHAR_QUOTE) {
        this.inString = true;
        this.scanIdx++;
      } else if (ch === CHAR_LBRACE) {
        this.objDepth++;
        this.scanIdx++;
      } else if (ch === CHAR_RBRACE) {
        this.objDepth--;
        if (this.objDepth === 0) {
          const itemIdx = this.totalItems++;
          if (itemIdx >= this.skipItems) {
            this.batchStarts.push(this.objStart);
            this.batchEnds.push(this.scanIdx);
            this.batchIndices.push(itemIdx);

            if (this.batchStarts.length >= this.batchSize) {
              consumedUntil = this.flushPendingBatch(onBatch);
            }
          } else {
            consumedUntil = this.scanIdx + 1;
          }
          this.objStart = -1;
        }
        this.scanIdx++;
      } else {
        this.scanIdx++;
      }
    }

    // Compact buffer to discard already-parsed prefix and keep RAM strictly bounded
    const keepFrom = this.batchStarts.length > 0
      ? this.batchStarts[0]
      : (this.objStart !== -1 ? this.objStart : Math.max(consumedUntil, this.scanIdx));

    if (keepFrom > 0) {
      if (keepFrom >= this.buffer.length) {
        this.buffer = '';
        this.scanIdx = 0;
        if (this.objStart !== -1) this.objStart = 0;
      } else {
        this.buffer = this.buffer.slice(keepFrom);
        this.scanIdx -= keepFrom;
        if (this.objStart !== -1) this.objStart -= keepFrom;
        for (let i = 0; i < this.batchStarts.length; i++) {
          this.batchStarts[i] -= keepFrom;
          this.batchEnds[i] -= keepFrom;
        }
      }
    }
  }

  public finish(onBatch: (items: Array<{ item: any; index: number }>) => void) {
    if (this.batchStarts.length > 0) {
      this.flushPendingBatch(onBatch);
    }
    this.buffer = '';
    this.scanIdx = 0;
  }
}

const resolveCompactName = (s: any, fallback: string): string => {
  const raw =
    (typeof s.name === 'string' && s.name.length > 0 ? s.name : null) ||
    (typeof s.stream_display_name === 'string' && s.stream_display_name.length > 0 ? s.stream_display_name : null) ||
    (typeof s.title === 'string' && s.title.length > 0 ? s.title : null) ||
    (typeof s.tvg_name === 'string' && s.tvg_name.length > 0 ? s.tvg_name : null) ||
    (typeof s.channel_name === 'string' && s.channel_name.length > 0 ? s.channel_name : null);
  return raw ? fastDecodeHtml(raw) : fallback;
};

/**
 * Converts a raw Xtream stream/movie/series object straight into a `CompactChannelRecord`
 * (and category_id) with minimal object allocations for zero-bloat storage & fast GC.
 */
export const mapXtreamItemToCompact = (
  s: any,
  idx: number,
  type: 'live' | 'movie' | 'series',
  cleanHost: string,
  encodedUser: string,
  encodedPass: string
): { categoryId: string; record: CompactChannelRecord } => {
  const rawStreamId = String(
    type === 'series' ? (s.series_id ?? s.id ?? idx) : (s.stream_id ?? s.id ?? idx)
  );
  let cleanStreamId = rawStreamId;
  const dotIdx = rawStreamId.lastIndexOf('.');
  if (dotIdx > 0) {
    const tail = rawStreamId.slice(dotIdx + 1).toLowerCase();
    if (tail === 'm3u8' || tail === 'ts' || tail === 'mp4' || tail === 'mkv' || tail === 'avi' || tail === 'flv') {
      cleanStreamId = rawStreamId.slice(0, dotIdx);
    }
  }

  const categoryId = String(s.category_id || 'uncategorized');
  const fallbackName =
    type === 'live' ? `Live ${idx + 1}` : type === 'movie' ? `Movie ${idx + 1}` : `Series ${idx + 1}`;
  const name = resolveCompactName(s, fallbackName);

  const rec: CompactChannelRecord = {
    s: cleanStreamId,
    n: name,
    o: idx
  };

  const logo = s.stream_icon || s.cover || s.logo;
  if (logo && typeof logo === 'string') rec.l = logo;

  if (type !== 'series') {
    const defaultExt = type === 'live' ? 'm3u8' : 'mp4';
    const ext = s.container_extension || defaultExt;
    if (ext && ext !== defaultExt) rec.e = ext;

    const customUrl = s.url || s.direct_source;
    if (
      customUrl &&
      typeof customUrl === 'string' &&
      customUrl !== `${cleanHost}/${type}/${encodedUser}/${encodedPass}/${cleanStreamId}.${ext}`
    ) {
      rec.u = customUrl;
    }
  }

  const epgRaw = s.epg_channel_id !== undefined && s.epg_channel_id !== null && s.epg_channel_id !== ''
    ? String(s.epg_channel_id).trim()
    : '';
  const tvgRaw = s.tvg_id !== undefined && s.tvg_id !== null && s.tvg_id !== ''
    ? String(s.tvg_id).trim()
    : '';
  if (epgRaw) rec.g = epgRaw;
  else if (tvgRaw) rec.g = tvgRaw;
  if (tvgRaw && tvgRaw !== rec.g) rec.t = tvgRaw;

  if (s.num !== undefined && s.num !== null && s.num !== idx + 1) {
    const numVal = Number(s.num);
    if (!Number.isNaN(numVal)) rec.m = numVal;
  }

  if (type === 'live') {
    if (s.stream_type === 'radio_streams' || name.toLowerCase().includes('radio')) {
      rec.r = 1;
    }
  } else {
    const plot = s.plot || s.description || s.overview;
    if (plot) rec.pl = plot;
    const cast = s.cast || s.actors;
    if (cast) rec.ct = cast;
    if (s.director) rec.dr = s.director;
    if (s.genre) rec.gn = s.genre;
    const rating = s.rating || s.rating_5based;
    if (rating !== undefined && rating !== null && rating !== '') rec.rt = rating;
    const releaseDate = s.releaseDate || s.releasedate || s.year;
    if (releaseDate) rec.rd = String(releaseDate);
    if (type === 'movie' && s.duration) rec.du = String(s.duration);
  }

  return { categoryId, record: rec };
};

export interface ParsedM3UEntry {
  stream_id: string;
  name: string;
  logo: string;
  category: string;
  category_id: string;
  category_name: string;
  type: 'live' | 'movie' | 'series';
  url: string;
  orderIndex: number;
  epg_channel_id?: string;
  tvg_id?: string;
}

export interface StreamingBatchResult {
  live: ParsedM3UEntry[];
  movie: ParsedM3UEntry[];
  series: ParsedM3UEntry[];
  newCategories: Array<{ category_id: string; category_name: string; type: 'live' | 'movie' | 'series'; orderIndex: number }>;
}

const RE_M3U_SERIES_NAME = /\bs\d{1,2}\s*e\d{1,2}\b/i;
const RE_M3U_MOVIE_EXT = /\.(mp4|mkv|avi|mov)(\?|$)/i;
const RE_LOGO_ATTR = /(?:tvg-logo|tvg_logo|logo)=["']([^"']*)["']/i;
const RE_GROUP_ATTR = /group-title=["']([^"']*)["']/i;
const RE_ID_ATTR = /tvg-id=["']([^"']*)["']/i;
const RE_NAME_ATTR = /(?:tvg-name|tvg_name|name)=["']([^"']*)["']/i;

/**
 * High-speed incremental streaming M3U chunk line parser.
 */
export class StreamingM3UParser {
  private leftover = '';
  private currentName = '';
  private currentLogo = '';
  private currentGroup = '';
  private currentTvgId = '';
  private entryCount = 0;

  private readonly batchSize: number;
  private readonly skipEntries: number;
  private liveBatch: ParsedM3UEntry[] = [];
  private movieBatch: ParsedM3UEntry[] = [];
  private seriesBatch: ParsedM3UEntry[] = [];

  private seenCategories = {
    live: new Map<string, number>(),
    movie: new Map<string, number>(),
    series: new Map<string, number>()
  };
  private pendingCategories: Array<{ category_id: string; category_name: string; type: 'live' | 'movie' | 'series'; orderIndex: number }> = [];

  public counts = { live: 0, movie: 0, series: 0 };

  constructor(batchSize = 2000, skipEntries = 0) {
    this.batchSize = Math.max(100, batchSize);
    this.skipEntries = Math.max(0, skipEntries);
  }

  public get totalParsedEntries(): number {
    return this.entryCount;
  }

  private extractExtinfMeta(line: string) {
    const logoMatch = line.indexOf('logo=') !== -1 || line.indexOf('logo =') !== -1 || line.includes('tvg-logo') || line.includes('tvg_logo')
      ? line.match(RE_LOGO_ATTR)
      : null;
    const groupMatch = line.includes('group-title') ? line.match(RE_GROUP_ATTR) : null;
    const idMatch = line.includes('tvg-id') ? line.match(RE_ID_ATTR) : null;
    const commaIdx = findUnquotedCommaIndex(line);
    const afterComma = commaIdx !== -1 ? fastDecodeHtml(line.substring(commaIdx + 1)) : '';
    let fallbackTvgName = '';
    if (!afterComma) {
      const tvgNameMatch = line.match(RE_NAME_ATTR);
      fallbackTvgName = tvgNameMatch ? fastDecodeHtml(tvgNameMatch[1]) : '';
    }

    this.currentName = afterComma || fallbackTvgName || '';
    this.currentLogo = logoMatch ? logoMatch[1].trim() : '';
    this.currentGroup = groupMatch ? fastDecodeHtml(groupMatch[1]) : '';
    this.currentTvgId = idMatch ? idMatch[1].trim() : '';
  }

  private classifyType(category: string, name: string, url: string): 'live' | 'movie' | 'series' {
    const lowerCat = category.toLowerCase();
    const lowerUrl = url.toLowerCase();

    if (
      lowerCat.includes('series') ||
      lowerCat.includes('serie') ||
      lowerCat.includes('مسلسل') ||
      lowerUrl.includes('/series/') ||
      RE_M3U_SERIES_NAME.test(name)
    ) {
      return 'series';
    }
    if (
      lowerCat.includes('movie') ||
      lowerCat.includes('film') ||
      lowerCat.includes('vod') ||
      lowerCat.includes('أفلام') ||
      lowerCat.includes('افلام') ||
      lowerUrl.includes('/movie/') ||
      RE_M3U_MOVIE_EXT.test(lowerUrl)
    ) {
      return 'movie';
    }
    return 'live';
  }

  private pushLine(rawLine: string) {
    const line = rawLine.trim();
    if (!line) return;

    if (line.startsWith('#EXTINF:')) {
      this.extractExtinfMeta(line);
      return;
    }

    if (line.startsWith('#EXTGRP:')) {
      const grp = fastDecodeHtml(line.substring(8));
      if (grp) this.currentGroup = grp;
      return;
    }

    if (line.startsWith('#')) return;

    if (line.startsWith('http://') || line.startsWith('https://') || line.startsWith('rtmp://') || line.startsWith('rtsp://')) {
      const idx = this.entryCount++;
      const rawGroup = (this.currentGroup || '').trim();
      const catName = rawGroup.toLowerCase() === 'عام (general)' ? '' : rawGroup;
      const catId = catName || 'uncategorized';
      const resolvedName = this.currentName || `Channel ${idx + 1}`;
      const entryType = this.classifyType(catName, resolvedName, line);
      const streamId = this.currentTvgId ? `${this.currentTvgId}_${idx}` : `m3u_${idx}`;

      const seenMap = this.seenCategories[entryType];
      if (catName && !seenMap.has(catName)) {
        const orderIndex = seenMap.size;
        seenMap.set(catName, orderIndex);
        if (idx >= this.skipEntries) {
          this.pendingCategories.push({
            category_id: catId,
            category_name: catName,
            type: entryType,
            orderIndex
          });
        }
      }

      const itemOrderIndex = this.counts[entryType];
      this.counts[entryType]++;

      if (idx >= this.skipEntries) {
        const entry: ParsedM3UEntry = {
          stream_id: streamId,
          name: resolvedName,
          logo: this.currentLogo,
          category: catName,
          category_id: catId,
          category_name: catName,
          type: entryType,
          url: line,
          orderIndex: itemOrderIndex,
          epg_channel_id: this.currentTvgId || undefined,
          tvg_id: this.currentTvgId || undefined
        };

        if (entryType === 'live') this.liveBatch.push(entry);
        else if (entryType === 'movie') this.movieBatch.push(entry);
        else this.seriesBatch.push(entry);
      }

      this.currentName = '';
      this.currentLogo = '';
      this.currentGroup = '';
      this.currentTvgId = '';
    }
  }

  private drainIfReady(force: boolean): StreamingBatchResult | null {
    const totalPending = this.liveBatch.length + this.movieBatch.length + this.seriesBatch.length;
    if (!force && totalPending < this.batchSize) return null;
    if (totalPending === 0 && this.pendingCategories.length === 0) return null;

    const result: StreamingBatchResult = {
      live: this.liveBatch,
      movie: this.movieBatch,
      series: this.seriesBatch,
      newCategories: this.pendingCategories
    };
    this.liveBatch = [];
    this.movieBatch = [];
    this.seriesBatch = [];
    this.pendingCategories = [];
    return result;
  }

  public feedChunk(chunk: string, onBatch: (batch: StreamingBatchResult) => void) {
    if (!chunk) return;
    const combined = this.leftover ? this.leftover + chunk : chunk;
    let start = 0;

    while (true) {
      const nl = combined.indexOf('\n', start);
      if (nl === -1) break;
      const line = combined.substring(start, nl);
      this.pushLine(line);
      start = nl + 1;

      const maybeBatch = this.drainIfReady(false);
      if (maybeBatch) onBatch(maybeBatch);
    }

    this.leftover = start < combined.length ? combined.substring(start) : '';
  }

  public finish(onBatch: (batch: StreamingBatchResult) => void) {
    if (this.leftover) {
      this.pushLine(this.leftover);
      this.leftover = '';
    }
    const remaining = this.drainIfReady(true);
    if (remaining) onBatch(remaining);
  }
}

export async function parseM3UChunksAsync(
  chunks: AsyncIterable<string | Uint8Array>,
  onBatch: (batch: StreamingBatchResult, parserCounts: { live: number; movie: number; series: number }) => Promise<void>,
  options?: { batchSize?: number; signal?: AbortSignal; skipEntries?: number }
): Promise<{ live: number; movie: number; series: number }> {
  const parser = new StreamingM3UParser(options?.batchSize ?? 2000, options?.skipEntries ?? 0);
  const decoder = new TextDecoder('utf-8');

  for await (const rawChunk of chunks) {
    if (options?.signal?.aborted) {
      throw new DOMException('Extraction aborted by user', 'AbortError');
    }

    const text = typeof rawChunk === 'string'
      ? rawChunk
      : decoder.decode(rawChunk, { stream: true });

    const pendingBatches: StreamingBatchResult[] = [];
    parser.feedChunk(text, (b) => pendingBatches.push(b));

    for (const batch of pendingBatches) {
      if (options?.signal?.aborted) {
        throw new DOMException('Extraction aborted by user', 'AbortError');
      }
      await onBatch(batch, { ...parser.counts });
    }
    await new Promise((r) => setTimeout(r, 0));
  }

  const tail = decoder.decode();
  const tailBatches: StreamingBatchResult[] = [];
  if (tail) parser.feedChunk(tail, (b) => tailBatches.push(b));
  parser.finish((b) => tailBatches.push(b));

  for (const batch of tailBatches) {
    if (options?.signal?.aborted) {
      throw new DOMException('Extraction aborted by user', 'AbortError');
    }
    await onBatch(batch, { ...parser.counts });
  }

  return { ...parser.counts };
}
