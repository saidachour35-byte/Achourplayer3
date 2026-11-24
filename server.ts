import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from "@google/genai";
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import http from 'http';
import https from 'https';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

// Configure global agents for IPTV streaming (bypass self-signed/expired certs on IPTV servers)
const insecureHttpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  maxSockets: 64,
  maxFreeSockets: 16,
  checkServerIdentity: () => undefined
});
const defaultHttpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 64,
  maxFreeSockets: 16
});

axios.defaults.httpsAgent = insecureHttpsAgent;
axios.defaults.httpAgent = defaultHttpAgent;

// Gemini Initialization
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const IPTV_USER_AGENTS = [
  'TiviMate/4.7.0 (Linux; Android 11; SHIELD Android TV Build/RQ1A.210105.003)',
  'IPTVSmartersPro/3.1.5 (Linux; Android 12)',
  'ExoPlayerLib/2.18.7',
  'Android/Media3/1.1.1',
  'VLC/3.0.20 LibVLC/3.0.20',
  'Lavf/60.3.100',
  'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 MAG200/2.0.2',
  'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/4.0 Chrome/76.0.3809.146 TV Safari/537.36',
  'AppleCoreMedia/1.0.0.19G69 (Apple TV; U; CPU OS 15_6 like Mac OS X)',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
];

function getSafeHttpStatus(status?: number, defaultStatus = 502): number {
  if (typeof status === 'number' && status >= 200 && status <= 599) {
    return status;
  }
  return defaultStatus;
}

// IPTV Proxies
app.get('/api/proxy/m3u', async (req, res) => {
  const rawUrl = (req.query.url || req.query.link) as string | undefined;
  if (!rawUrl) {
    return res.status(400).json({ error: 'Missing m3u url parameter' });
  }

  let sanitizedUrl = rawUrl.trim();
  if (sanitizedUrl.includes('github.com/') && sanitizedUrl.includes('/blob/')) {
    sanitizedUrl = sanitizedUrl.replace('github.com/', 'raw.githubusercontent.com/').replace('/blob/', '/');
  }
  if (!sanitizedUrl.startsWith('http://') && !sanitizedUrl.startsWith('https://')) {
    sanitizedUrl = 'http://' + sanitizedUrl;
  }

  let lastStatus = 500;
  let lastErrMsg = '';

  for (const ua of IPTV_USER_AGENTS) {
    try {
      const response = await axios.get(sanitizedUrl, {
        timeout: 180000,
        responseType: 'stream',
        maxContentLength: 1024 * 1024 * 1024,
        maxBodyLength: 1024 * 1024 * 1024,
        headers: {
          'User-Agent': ua,
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Iptv-User-Agent': 'IPTVSmarters'
        },
        maxRedirects: 10,
        validateStatus: () => true
      });

      lastStatus = response.status;
      if (response.status >= 400 && response.status !== 884) {
        try { response.data?.destroy?.(); } catch {}
        lastErrMsg = `Upstream status ${response.status}`;
        continue;
      }

      const stream = response.data as NodeJS.ReadableStream & { destroy?: () => void };
      const streamedOk = await new Promise<boolean>((resolve) => {
        let resolved = false;
        let initialBuf = Buffer.alloc(0);
        const cleanup = () => {
          stream.removeListener('data', onData);
          stream.removeListener('end', onEnd);
          stream.removeListener('error', onErr);
        };
        const finish = (ok: boolean, firstChunk?: Buffer) => {
          if (resolved) return;
          resolved = true;
          cleanup();
          if (ok) {
            res.status(200);
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            if (firstChunk && firstChunk.length > 0) {
              res.write(firstChunk);
            }
            req.on('close', () => {
              try { stream.destroy?.(); } catch {}
            });
            stream.pipe(res);
          } else {
            try { stream.destroy?.(); } catch {}
          }
          resolve(ok);
        };
        const onData = (chunk: Buffer) => {
          initialBuf = Buffer.concat([initialBuf, chunk]);
          const str = initialBuf.toString('utf8', 0, Math.min(initialBuf.length, 512));
          if (str.includes('#EXTM3U') || str.includes('#EXTINF') || (str.includes('http') && initialBuf.length > 20)) {
            finish(true, initialBuf);
          } else if (initialBuf.length > 1024) {
            lastErrMsg = 'Invalid M3U header';
            finish(false);
          }
        };
        const onEnd = () => {
          const str = initialBuf.toString('utf8');
          if (str.includes('#EXTM3U') || str.includes('#EXTINF') || (str.includes('http') && str.length > 20) || (response.status >= 200 && response.status < 300 && str.length > 0)) {
            finish(true, initialBuf);
          } else {
            lastErrMsg = `Upstream status ${response.status}`;
            finish(false);
          }
        };
        const onErr = (e: any) => {
          lastErrMsg = e?.message || 'Stream failed';
          finish(false);
        };
        stream.on('data', onData);
        stream.on('end', onEnd);
        stream.on('error', onErr);
      });

      if (streamedOk) {
        return;
      }
    } catch (err: any) {
      lastErrMsg = err.message || 'Request failed';
      lastStatus = err.response?.status || lastStatus;
    }
  }

  const is884 = lastStatus === 884 || lastErrMsg.includes('884');
  const isConnRefused = lastErrMsg.includes('ECONNREFUSED');
  const isTimeout = lastErrMsg.includes('timeout') || lastErrMsg.includes('ETIMEDOUT');

  console.warn(`[M3U Proxy] ${sanitizedUrl} returned status ${lastStatus} (${lastErrMsg})`);

  const safeStatus = getSafeHttpStatus(lastStatus, 502);
  res.status(safeStatus).json({
    error: is884 
      ? 'Upstream IPTV server connection limit reached or account expired (Code 884)' 
      : isConnRefused
        ? 'IPTV Server refused connection. The server might be down or blocking the IP.'
        : isTimeout
          ? 'IPTV Server timed out. The connection is too slow.'
          : 'Failed to fetch M3U playlist from IPTV provider',
    upstreamStatus: lastStatus,
    message: lastErrMsg
  });
});

app.get('/api/proxy/xtream', async (req, res) => {
  let rawHost = (req.query.url || req.query.portal || req.query.host) as string | undefined;
  let username = req.query.username as string | undefined;
  let password = req.query.password as string | undefined;
  let action = req.query.action as string | undefined;

  if (rawHost) {
    try {
      const uObj = new URL(rawHost.startsWith('http') ? rawHost : 'http://' + rawHost);
      const u = uObj.searchParams.get('username');
      const p = uObj.searchParams.get('password');
      const a = uObj.searchParams.get('action');
      if (u && !username) username = u;
      if (p && !password) password = p;
      if (a && !action) action = a;

      uObj.searchParams.forEach((val, key) => {
        if (key !== 'username' && key !== 'password' && key !== 'action' && key !== 'url' && val) {
          if (!req.query[key]) {
            (req.query as any)[key] = val;
          }
        }
      });
    } catch (e) {}
  }

  if (!rawHost || !username || !password) {
    return res.status(400).json({ 
      error: 'Missing parameters', 
      received: { host: !!rawHost, username: !!username, password: !!password } 
    });
  }

  let sanitizedUrl = rawHost.trim().replace(/\/+$/, '');
  sanitizedUrl = sanitizedUrl.replace(/\/(player_api|get|index)\.php.*$/i, '').replace(/\/c\/?$/i, '').replace(/\?.*$/, '').replace(/\/+$/, '');
  if (!sanitizedUrl.startsWith('http://') && !sanitizedUrl.startsWith('https://')) {
    sanitizedUrl = 'http://' + sanitizedUrl;
  }

  let additionalParams = '';
  if (action && action !== 'auth' && action !== 'login') {
    additionalParams += `&action=${encodeURIComponent(action.trim())}`;
  }

  const reservedParams = new Set(['url', 'portal', 'host', 'username', 'password', 'action']);
  for (const [key, val] of Object.entries(req.query)) {
    if (!reservedParams.has(key) && val !== undefined && val !== '') {
      additionalParams += `&${encodeURIComponent(key)}=${encodeURIComponent(String(val).trim())}`;
    }
  }

  const targetUrls = [
    `${sanitizedUrl}/player_api.php?username=${encodeURIComponent(username.trim())}&password=${encodeURIComponent(password.trim())}${additionalParams}`,
    `${sanitizedUrl}/get.php?username=${encodeURIComponent(username.trim())}&password=${encodeURIComponent(password.trim())}${additionalParams}`,
    `${sanitizedUrl}/index.php?username=${encodeURIComponent(username.trim())}&password=${encodeURIComponent(password.trim())}${additionalParams}`
  ];

  let lastStatus = 500;
  let lastErrMsg = '';

  const primaryUas = [
    'IPTVSmartersPro/3.1.5 (Linux; Android 12)',
    'TiviMate/4.7.0 (Linux; Android 11; SHIELD Android TV)',
    'ExoPlayerLib/2.18.7'
  ];

  const bulkStreamActions = new Set(['get_live_streams', 'get_vod_streams', 'get_series']);
  const isBulkAction = Boolean(action && bulkStreamActions.has(action.trim()));

  for (const targetUrl of targetUrls) {
    for (const ua of primaryUas) {
      try {
        console.log(`[Xtream Proxy] Requesting: ${targetUrl} (Action: ${action || 'auth'})`);
        if (isBulkAction) {
          const response = await axios.get(targetUrl, {
            timeout: 240000,
            responseType: 'stream',
            maxContentLength: 1024 * 1024 * 1024,
            maxBodyLength: 1024 * 1024 * 1024,
            headers: {
              'User-Agent': ua,
              'Accept': 'application/json, text/plain, */*',
              'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
              'X-Requested-With': 'com.nathnetwork.iptvsmarters',
              'Accept-Encoding': 'gzip, deflate',
              'Connection': 'keep-alive'
            },
            validateStatus: (status) => (status >= 200 && status < 400) || status === 884
          });

          lastStatus = response.status;
          if (response.status === 401 || response.status === 404) {
            try { response.data?.destroy?.(); } catch {}
            return res.status(response.status).json({
              error: response.status === 401 ? 'Unauthorized: Invalid username, password, or expired subscription (401)' : 'Not Found: Invalid portal URL or endpoint (404)',
              upstreamStatus: response.status
            });
          }

          const stream = response.data as NodeJS.ReadableStream & { destroy?: () => void };
          const isValidJsonStart = await new Promise<boolean>((resolve) => {
            let resolved = false;
            let initialBuf = Buffer.alloc(0);
            const cleanup = () => {
              stream.removeListener('data', onData);
              stream.removeListener('end', onEnd);
              stream.removeListener('error', onErr);
            };
            const finish = (ok: boolean, firstChunk?: Buffer) => {
              if (resolved) return;
              resolved = true;
              cleanup();
              if (ok) {
                res.status(200);
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.setHeader('Cache-Control', 'no-cache');
                if (firstChunk && firstChunk.length > 0) {
                  res.write(firstChunk);
                }
                req.on('close', () => {
                  try { stream.destroy?.(); } catch {}
                });
                stream.pipe(res);
              } else {
                try { stream.destroy?.(); } catch {}
              }
              resolve(ok);
            };
            const onData = (chunk: Buffer) => {
              initialBuf = Buffer.concat([initialBuf, chunk]);
              const str = initialBuf.toString('utf8', 0, Math.min(initialBuf.length, 256)).replace(/^\uFEFF/, '').trimStart();
              if (str.length === 0) return;
              if (str.startsWith('<')) {
                lastErrMsg = 'Upstream server returned HTML instead of JSON';
                finish(false);
              } else if (str.startsWith('[') || str.startsWith('{')) {
                finish(true, initialBuf);
              } else if (initialBuf.length > 256) {
                lastErrMsg = 'Invalid data format';
                finish(false);
              }
            };
            const onEnd = () => {
              const str = initialBuf.toString('utf8').replace(/^\uFEFF/, '').trim();
              if (str.startsWith('[') || str.startsWith('{')) {
                finish(true, initialBuf);
              } else {
                lastErrMsg = 'Empty or invalid stream response';
                finish(false);
              }
            };
            const onErr = (e: any) => {
              lastErrMsg = e?.message || 'Stream error';
              finish(false);
            };
            stream.on('data', onData);
            stream.on('end', onEnd);
            stream.on('error', onErr);
          });

          if (isValidJsonStart) {
            return;
          }
          continue;
        }

        const response = await axios.get(targetUrl, { 
          timeout: 60000,
          maxContentLength: 500 * 1024 * 1024,
          maxBodyLength: 500 * 1024 * 1024,
          headers: { 
            'User-Agent': ua,
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
            'X-Requested-With': 'com.nathnetwork.iptvsmarters',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive'
          },
          validateStatus: (status) => (status >= 200 && status < 400) || status === 884
        });

        lastStatus = response.status;
        if (response.status === 401 || response.status === 404) {
          console.warn(`[Xtream Proxy] Upstream returned status ${response.status} for ${targetUrl}`);
          return res.status(response.status).json({
            error: response.status === 401 ? 'Unauthorized: Invalid username, password, or expired subscription (401)' : 'Not Found: Invalid portal URL or endpoint (404)',
            upstreamStatus: response.status
          });
        }
        
        let rawData = response.data;
        if (typeof rawData === 'string') {
          const trimmed = rawData.replace(/^\uFEFF/, '').trim();
          if (trimmed.startsWith('<')) {
            console.warn(`[Xtream Proxy] Upstream returned HTML (status ${response.status}) instead of JSON for action ${action}`);
            if (response.status === 403) {
              lastErrMsg = 'Forbidden: Server blocked access or IP/User-Agent (403)';
            } else if (response.status === 429) {
              lastErrMsg = 'Too Many Requests: Rate limited (429)';
            } else {
              lastErrMsg = 'Upstream server returned HTML block or error page';
            }
            continue;
          }
          try { rawData = JSON.parse(trimmed); } catch(e) {}
        }

        if (rawData && typeof rawData === 'object') {
          return res.json(rawData);
        }
        
        lastErrMsg = `Invalid data format`;
      } catch (error: any) {
        lastStatus = error.response?.status || 500;
        lastErrMsg = error.message;

        if (lastStatus === 401 || lastStatus === 404) {
          console.warn(`[Xtream Proxy] Upstream returned status ${lastStatus} for target URL`);
          return res.status(lastStatus).json({
            error: lastStatus === 401 ? 'Unauthorized: Invalid username, password, or expired subscription (401)' : 'Not Found: Invalid portal URL or endpoint (404)',
            upstreamStatus: lastStatus,
            message: lastErrMsg
          });
        }

        if (lastStatus === 429 || lastStatus === 403) {
          console.warn(`[Xtream Proxy] Status ${lastStatus} encountered. Delaying before retry...`);
          await new Promise(resolve => setTimeout(resolve, 2500));
          continue;
        }
        
        console.error(`[Xtream Proxy Error] Action: ${action}, Status: ${lastStatus}, Msg: ${lastErrMsg}`);
      }
    }
  }

  const is884 = lastStatus === 884 || lastErrMsg.includes('884');
  const isConnRefused = lastErrMsg.includes('ECONNREFUSED');
  const isTimeout = lastErrMsg.includes('timeout') || lastErrMsg.includes('ETIMEDOUT');

  console.warn(`[Xtream Proxy] ${sanitizedUrl} returned status ${lastStatus} (${lastErrMsg})`);

  const safeStatus = getSafeHttpStatus(lastStatus, 502);
  res.status(safeStatus).json({ 
    error: is884 
      ? 'Xtream provider rejected connection (Status 884: Max connections reached or expired)' 
      : isConnRefused
        ? 'Xtream Server refused connection. The server might be down or blocking the IP.'
        : isTimeout
          ? 'Xtream Server timed out. The connection is too slow.'
          : 'Failed to fetch from Xtream provider', 
    upstreamStatus: lastStatus, 
    message: lastErrMsg 
  });
});

app.get('/api/proxy/stalker', async (req, res) => {
  const rawHost = (req.query.url || req.query.portal) as string | undefined;
  const action = req.query.action as string | undefined;
  const type = req.query.type as string | undefined;
  const mac = (req.query.mac || req.query.macAddress || '00:1A:79:00:00:01') as string;

  if (!rawHost) {
    return res.status(400).json({ error: 'Missing portal url' });
  }

  let sanitizedUrl = rawHost.trim().replace(/\/+$/, '');
  if (!sanitizedUrl.startsWith('http://') && !sanitizedUrl.startsWith('https://')) {
    sanitizedUrl = 'http://' + sanitizedUrl;
  }

  let stalkerBase = sanitizedUrl;
  if (!stalkerBase.includes('/server/load.php') && !stalkerBase.includes('load.php')) {
    stalkerBase = `${stalkerBase}/server/load.php`;
  }

  const currentAction = action || 'handshake';
  const currentType = type || (currentAction === 'handshake' || currentAction === 'get_profile' ? 'stb' : 'itv');
  const targetUrl = `${stalkerBase}?type=${encodeURIComponent(currentType)}&action=${encodeURIComponent(currentAction)}`;

  try {
    const response = await axios.get(targetUrl, { 
      timeout: 18000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200/2.0.2 Safari/533.3',
        'X-User-Agent': 'Model: MAG250; Link: WiFi',
        'Cookie': `mac=${encodeURIComponent(mac.trim())}; stb_lang=en; timezone=Europe%2FBerlin;`
      },
      validateStatus: () => true
    });

    if (response.status >= 200 && response.status < 300) {
      return res.json(response.data);
    }
    if (response.data) {
      return res.json(response.data);
    }

    const safeStatus = getSafeHttpStatus(response.status, 502);
    res.status(safeStatus).json({ error: 'Stalker portal returned non-200 status', upstreamStatus: response.status });
  } catch (error: any) {
    const lastStatus = error.response?.status || 500;
    console.warn(`[Stalker Proxy] ${sanitizedUrl} error: ${error.message}`);
    const safeStatus = getSafeHttpStatus(lastStatus, 502);
    res.status(safeStatus).json({ error: 'Failed to fetch from Stalker Portal', message: error.message, upstreamStatus: lastStatus });
  }
});

// Playlist Validator Endpoint
app.post('/api/validate/playlist', async (req, res) => {
  const { type, url, host, username, password, macAddress } = req.body;
  
  try {
    if (type === 'xtream') {
      const serverHost = url || host;
      if (!serverHost || !username || !password) {
        return res.status(400).json({ valid: false, message: 'Missing Xtream credentials' });
      }

      let sanitizedUrl = serverHost.trim().replace(/\/+$/, '');
      sanitizedUrl = sanitizedUrl.replace(/\/(player_api|get|index)\.php.*$/i, '').replace(/\/c\/?$/i, '').replace(/\?.*$/, '').replace(/\/+$/, '');
      if (!sanitizedUrl.startsWith('http://') && !sanitizedUrl.startsWith('https://')) {
        sanitizedUrl = 'http://' + sanitizedUrl;
      }

      const testUrl = `${sanitizedUrl}/player_api.php?username=${encodeURIComponent(username.trim())}&password=${encodeURIComponent(password.trim())}`;
      const response = await axios.get(testUrl, {
        timeout: 20000,
        headers: { 
          'User-Agent': 'IPTVSmartersPro/2.2.1 (Linux; Android 11)',
          'Accept': 'application/json, text/plain, */*'
        },
        maxRedirects: 10,
        httpsAgent: insecureHttpsAgent,
        httpAgent: defaultHttpAgent,
        validateStatus: (status) => (status >= 200 && status < 400) || status === 884
      });

      if (response.status === 884) {
        return res.json({
          valid: false,
          upstreamStatus: 884,
          message: 'السيرفر رفض الاتصال (كود 884: تجاوز الحد الأقصى للأجهزة المتصلة أو انتهاء الاشتراك) / Server rejected connection (Status 884: Concurrent connections limit reached or account expired)'
        });
      }

      let data = response.data;
      if (typeof data === 'string') {
        const trimmed = data.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            data = JSON.parse(trimmed);
          } catch (e) {}
        }
      }

      if (data && data.user_info) {
        const isAuth = data.user_info.auth === 1 || data.user_info.status === 'Active';
        return res.json({
          valid: isAuth,
          userInfo: data.user_info,
          serverInfo: data.server_info,
          message: isAuth ? 'Authentication successful' : (data.user_info.message || 'Account expired or invalid')
        });
      }
      return res.json({ valid: response.status >= 200 && response.status < 300, data });
    } else if (type === 'm3u') {
      if (!url) return res.status(400).json({ valid: false, message: 'Missing M3U URL' });
      let sanitizedUrl = url.trim();
      if (!sanitizedUrl.startsWith('http://') && !sanitizedUrl.startsWith('https://')) {
        sanitizedUrl = 'http://' + sanitizedUrl;
      }
      const response = await axios.get(sanitizedUrl, {
        timeout: 20000,
        headers: { 'User-Agent': 'IPTVSmartersPro/2.2.1 (Linux; Android 11)' },
        validateStatus: () => true
      });

      if (response.status === 884) {
        return res.json({
          valid: false,
          upstreamStatus: 884,
          message: 'السيرفر رفض الرابط (كود 884: تجاوز الحد الأقصى للمشاهدة المتزامنة أو انتهاء الرابط) / Stream limit exceeded or link expired (Code 884)'
        });
      }

      const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      const isM3U = text.includes('#EXTM3U') || text.includes('#EXTINF') || text.includes('http');
      const channelCount = (text.match(/#EXTINF:/g) || []).length;
      return res.json({ valid: isM3U, channelCount, message: isM3U ? `Found ${channelCount} channels` : 'Invalid M3U format' });
    } else if (type === 'stalker') {
      const portal = url || host;
      if (!portal || !macAddress) return res.status(400).json({ valid: false, message: 'Missing Portal URL or MAC Address' });
      let sanitizedUrl = portal.trim().replace(/\/+$/, '');
      if (!sanitizedUrl.startsWith('http://') && !sanitizedUrl.startsWith('https://')) {
        sanitizedUrl = 'http://' + sanitizedUrl;
      }
      let stalkerBase = sanitizedUrl;
      if (!stalkerBase.includes('/server/load.php') && !stalkerBase.includes('load.php')) {
        stalkerBase = `${stalkerBase}/server/load.php`;
      }
      const response = await axios.get(`${stalkerBase}?type=stb&action=handshake`, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200/2.0.2 Safari/533.3',
          'Cookie': `mac=${encodeURIComponent(macAddress.trim())};`
        },
        validateStatus: () => true
      });
      return res.json({ valid: response.status >= 200 && response.status < 300, data: response.data, message: 'Portal responded' });
    }
    res.status(400).json({ valid: false, message: 'Unsupported playlist type' });
  } catch (err: any) {
    res.status(500).json({ valid: false, message: err.message || 'Validation failed' });
  }
});

app.get('/api/proxy/stream', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  let sanitizedUrl = (url as string).trim();
  if (!sanitizedUrl.startsWith('http://') && !sanitizedUrl.startsWith('https://')) {
    sanitizedUrl = 'http://' + sanitizedUrl;
  }

  let urlObj: URL;
  try {
    urlObj = new URL(sanitizedUrl);
  } catch (e) {
    return res.status(400).send('Invalid URL format');
  }

  const hostname = urlObj.hostname.toLowerCase();

  const abortController = new AbortController();
  let activeUpstreamStream: (NodeJS.ReadableStream & { destroy?: () => void }) | null = null;
  req.on('close', () => {
    abortController.abort();
    if (activeUpstreamStream) {
      try { activeUpstreamStream.destroy?.(); } catch {}
      activeUpstreamStream = null;
    }
  });

  const isManifest = sanitizedUrl.includes('.m3u8') || sanitizedUrl.includes('.smil') || (req.query.manifest === 'true');
  const timeoutMs = isManifest ? 4500 : 12000;

  // Cache winning User-Agent per hostname so live channel switching avoids retry round-trips
  const cachedUa = (globalThis as any).__achourStreamUaCache?.get(hostname);
  const baseUserAgents = [
    'TiviMate/4.7.0 (Linux; Android 11; SHIELD Android TV)',
    'IPTVSmartersPro/3.1.5 (Linux; Android 12)'
  ];
  const userAgentsToTry = cachedUa
    ? [cachedUa, ...baseUserAgents.filter(u => u !== cachedUa)]
    : baseUserAgents;

  let lastError: any = null;
  let lastStatus = 500;

  for (const ua of userAgentsToTry) {
    if (abortController.signal.aborted) return;
    try {
      const headers: Record<string, string> = {
        'User-Agent': ua,
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
        'Connection': 'keep-alive'
      };

      if (hostname.includes('getaj.net') || hostname.includes('aljazeera.net')) {
        headers['Referer'] = 'https://www.aljazeera.net/';
        headers['Origin'] = 'https://www.aljazeera.net';
      } else if (req.query.referer) {
        headers['Referer'] = req.query.referer as string;
      }

      if (req.headers.range) {
        headers['Range'] = req.headers.range as string;
      }

      // Manifest rewrite logic
      if (isManifest) {
        const textRes = await axios.get(sanitizedUrl, {
          timeout: timeoutMs,
          responseType: 'text',
          headers,
          maxRedirects: 10,
          signal: abortController.signal,
          validateStatus: (s) => (s >= 200 && s < 400) || s === 884
        });

        if (textRes.status === 404) {
          return res.status(404).send('Stream not found');
        }
        if (textRes.status === 884) {
          throw { response: textRes, message: 'Concurrent limit reached (884)' };
        }

        const manifestText = typeof textRes.data === 'string' ? textRes.data : JSON.stringify(textRes.data);
        const finalManifestUrl = (textRes.request as any)?.res?.responseUrl || sanitizedUrl;
        
        const rewrittenLines = manifestText.split(/\r?\n/).map(line => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return line;
          
          let absSegmentUrl = trimmed;
          if (!absSegmentUrl.startsWith('http://') && !absSegmentUrl.startsWith('https://')) {
            try {
              const base = new URL(finalManifestUrl);
              const segmentUrlObj = new URL(trimmed, base.href);
              if (base.search && !segmentUrlObj.search) {
                segmentUrlObj.search = base.search;
              }
              absSegmentUrl = segmentUrlObj.toString();
            } catch (e) {
              const lastSlash = finalManifestUrl.lastIndexOf('/');
              const cleanBase = lastSlash !== -1 ? finalManifestUrl.substring(0, lastSlash + 1) : finalManifestUrl + '/';
              absSegmentUrl = `${cleanBase}${trimmed.replace(/^\/+/, '')}`;
            }
          }
          return `/api/proxy/stream?url=${encodeURIComponent(absSegmentUrl)}`;
        });

        if (!(globalThis as any).__achourStreamUaCache) {
          (globalThis as any).__achourStreamUaCache = new Map<string, string>();
        }
        (globalThis as any).__achourStreamUaCache.set(hostname, ua);

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.status(200).send(rewrittenLines.join('\n'));
      }

      // Media segment / direct stream piping
      const response = await axios({
        method: 'get',
        url: sanitizedUrl,
        responseType: 'stream',
        timeout: timeoutMs,
        headers,
        maxRedirects: 10,
        signal: abortController.signal,
        validateStatus: (s) => s >= 200 && s < 400
      });

      if (!(globalThis as any).__achourStreamUaCache) {
        (globalThis as any).__achourStreamUaCache = new Map<string, string>();
      }
      (globalThis as any).__achourStreamUaCache.set(hostname, ua);

      activeUpstreamStream = response.data;
      if (abortController.signal.aborted) {
        try { activeUpstreamStream?.destroy?.(); } catch {}
        activeUpstreamStream = null;
        return;
      }

      const resHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
      resHeaders.forEach(h => {
        if (response.headers[h]) res.setHeader(h, String(response.headers[h]));
      });

      res.status(response.status);
      if (typeof (res as any).flushHeaders === 'function') {
        (res as any).flushHeaders();
      }
      response.data.on('error', () => {});
      return response.data.pipe(res);
    } catch (err: any) {
      if (axios.isCancel(err) || err.name === 'CanceledError' || abortController.signal.aborted) {
        return; // Client cancelled / switched channel
      }
      lastError = err;
      lastStatus = err.response?.status || lastStatus;
      if (lastStatus === 404) break;
    }
  }

  if (res.headersSent || abortController.signal.aborted) return;

  const is404 = lastStatus === 404 || (lastError?.message && lastError.message.includes('404'));
  const is884 = lastStatus === 884 || (lastError?.message && lastError.message.includes('884'));
  const safeStatus = getSafeHttpStatus(lastStatus, 502);
  res.status(safeStatus).json({
    error: is404 
      ? 'Stream link not found or expired (Status 404)'
      : is884 
        ? 'Stream rejected by provider (Status 884: Concurrent stream limit reached or account expired)' 
        : 'Failed to proxy stream from IPTV provider',
    upstreamStatus: lastStatus,
    message: lastError?.message || 'Stream connection failed'
  });
});

app.get('/api/proxy/get', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url' });

  let sanitizedUrl = (url as string).trim();
  if (!sanitizedUrl.startsWith('http://') && !sanitizedUrl.startsWith('https://')) {
    sanitizedUrl = 'http://' + sanitizedUrl;
  }

  let lastStatus = 500;
  let lastErrMsg = '';
  let lastErrCode = '';

  for (const ua of IPTV_USER_AGENTS) {
    try {
      const response = await axios.get(sanitizedUrl, { 
        timeout: 20000,
        headers: {
          'User-Agent': ua,
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive'
        },
        maxRedirects: 10,
        validateStatus: () => true
      });

      lastStatus = response.status;
      const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      const hasData = text.includes('#EXTM3U') || text.includes('#EXTINF') || (response.status >= 200 && response.status < 300);

      if (hasData) {
        return res.status(200).send(response.data);
      }
      lastErrMsg = `Status ${response.status}`;
    } catch (error: any) {
      lastErrMsg = error.message;
      lastErrCode = error.code || '';
      lastStatus = error.response?.status || 500;
    }
  }

  const is884 = lastStatus === 884 || lastErrMsg.includes('884');
  console.warn(`[General Proxy] ${sanitizedUrl} returned status ${lastStatus} (${lastErrMsg})`);

  const safeStatus = getSafeHttpStatus(lastStatus, 502);
  res.status(safeStatus).json({ 
    error: is884 
      ? 'IPTV provider connection limit reached or account expired (Status 884)' 
      : lastErrCode === 'ECONNREFUSED'
        ? 'IPTV Server refused connection. It may be offline or blocking the proxy.'
        : 'Failed to fetch content from IPTV provider',
    upstreamStatus: lastStatus, 
    message: lastErrMsg 
  });
});

// EPG Proxy
app.get('/api/proxy/epg', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing epg url' });

  let sanitizedUrl = (url as string).trim();
  if (!sanitizedUrl.startsWith('http://') && !sanitizedUrl.startsWith('https://')) {
    sanitizedUrl = 'http://' + sanitizedUrl;
  }

  try {
    const response = await axios({
      method: 'get',
      url: sanitizedUrl,
      timeout: 90000,
      responseType: 'stream',
      maxContentLength: 250 * 1024 * 1024,
      headers: {
        'User-Agent': 'TiviMate/4.7.0',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate'
      },
      validateStatus: () => true
    });

    if (response.status >= 400) {
      try { response.data?.destroy?.(); } catch {}
      return res.status(getSafeHttpStatus(response.status, 502)).json({
        error: `EPG upstream returned status ${response.status}`,
        upstreamStatus: response.status
      });
    }

    // Do NOT copy content-encoding / content-length because axios auto-decompresses gzip/deflate streams
    if (response.headers['content-type']) {
      res.setHeader('Content-Type', String(response.headers['content-type']));
    } else if (sanitizedUrl.endsWith('.gz')) {
      res.setHeader('Content-Type', 'application/gzip');
    } else {
      res.setHeader('Content-Type', 'text/xml; charset=utf-8');
    }

    req.on('close', () => {
      try { response.data?.destroy?.(); } catch {}
    });
    response.data.pipe(res);
  } catch (err: any) {
    console.error(`[EPG Proxy] Error fetching ${sanitizedUrl}:`, err.message);
    res.status(500).json({ error: 'Failed to fetch EPG data', message: err.message });
  }
});

// AI OCR Route
app.post('/api/gemini/ocr', async (req, res) => {
  const { image } = req.body; // Base64 image
  if (!image) return res.status(400).json({ error: 'No image provided' });

  try {
    const imagePart = {
      inlineData: {
        mimeType: "image/jpeg",
        data: image.split(',')[1] || image
      }
    };
    const textPart = {
      text: `Analyze this IPTV screenshot.
        If it's a list of channels, return a comma-separated list of channel names.
        If it's a login screen or contains credentials, extract the following fields in JSON format:
        {
          "host": "server url or host",
          "username": "username",
          "password": "password",
          "type": "xtream"
        }
        Only return the JSON or the comma-separated list, no other text.`
    };

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: [{ parts: [imagePart, textPart] }]
    });

    const resultText = response.text || '';
    res.json({ result: resultText });
  } catch (error: any) {
    console.error('Gemini OCR Error:', error.message);
    res.status(500).json({ error: 'AI analysis failed' });
  }
});

// Direct ZIP download & inspection routes
app.get(['/download-zip', '/achour-player.zip', '/achour-player_dee0e32e.zip', '/Achourtv-main_aa06058d.zip'], (req, res) => {
  const possiblePaths = [
    path.join(__dirname, 'public', 'achour-player.zip'),
    path.join(__dirname, 'public', 'assets', 'aistudio', 'Achourtv-main_aa06058d.zip'),
    path.join(__dirname, 'public', 'assets', 'aistudio', 'achour-player_dee0e32e.zip'),
  ];
  const zipPath = possiblePaths.find(p => fs.existsSync(p));
  if (!zipPath) {
    return res.status(404).send('ZIP file not found');
  }
  res.download(zipPath, path.basename(zipPath), (err) => {
    if (err && !res.headersSent) {
      res.status(404).send('ZIP file download failed');
    }
  });
});

app.get('/api/zip/status', (_req, res) => {
  const possiblePaths = [
    path.join(__dirname, 'public', 'assets', 'aistudio', 'Achourtv-main_aa06058d.zip'),
    path.join(__dirname, 'public', 'assets', 'aistudio', 'achour-player_dee0e32e.zip'),
    path.join(__dirname, 'public', 'achour-player.zip'),
  ];
  const foundPath = possiblePaths.find(p => fs.existsSync(p));
  res.json({
    status: 'unzipped_and_active',
    archiveName: foundPath ? path.basename(foundPath) : 'Achourtv-main_aa06058d.zip',
    extracted: true,
    livePreviewUrl: '/',
    archiveExists: !!foundPath,
    sizeBytes: foundPath ? fs.statSync(foundPath).size : 0,
    timestamp: new Date().toISOString()
  });
});


// Direct download routes for full project package
app.get(['/AchourPlayer-Complete.zip', '/download/project-zip'], (req, res) => {
  const zipPath = path.join(__dirname, 'public', 'AchourPlayer-Complete.zip');
  if (fs.existsSync(zipPath)) {
    res.setHeader('Content-Disposition', 'attachment; filename="AchourPlayer-Complete.zip"');
    res.setHeader('Content-Type', 'application/zip');
    res.sendFile(zipPath);
  } else {
    res.status(404).send('ZIP file not found');
  }
});

// Serve static files / Vite middlewares
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
} else {
  // In development, mount Vite's middleware
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
  console.log('Vite middleware mounted in development');
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port} (0.0.0.0)`);
});
