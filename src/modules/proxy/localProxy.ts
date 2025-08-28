import http from 'http';
import https from 'https';
import { URL } from 'url';
import config from '@/modules/fn_config/config';

// 轻量级本地代理：将请求转发到真实 URL，并在代理层附加自定义 headers

let server: http.Server | null = null;
let listenPort: number | null = null;

const LOG_PREFIX = '[localProxy]';

function maskHeaderValue(k: string, v: string): string {
    if (!v) return '';
    const lower = k.toLowerCase();
    if (lower === 'authorization' || lower === 'cookie' || lower.includes('token')) {
        // redact sensitive values, keep prefix
        return v.length > 16 ? `${v.slice(0, 8)}...${v.slice(-4)}` : 'REDACTED';
    }
    return v;
}

// 不再使用 base64 URL/headers；仅作为 config.domain 的反代

// 简易播放进度跟踪（基于 m3u8 与分片请求）
type SegmentInfo = { path: string; duration: number };
type ProgressRecord = {
    playlistPath: string; // /path/playlist.m3u8[?q]
    segments: SegmentInfo[];
    indexByPath: Map<string, number>;
    totalSeconds: number;
    lastIndex: number; // 最近请求到的分片索引
};

const playlists = new Map<string, ProgressRecord>(); // key = playlist path
const segmentToPlaylist = new Map<string, string>(); // seg path -> playlist key

function parseM3U8(content: string, base: URL): { segments: SegmentInfo[]; total: number } {
    const lines = content.split(/\r?\n/);
    const segments: SegmentInfo[] = [];
    let pendingDuration: number | null = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        if (line.startsWith('#EXTINF:')) {
            // #EXTINF:6.000,
            const rest = line.substring('#EXTINF:'.length);
            const durStr = rest.split(',')[0].trim();
            const dur = parseFloat(durStr);
            if (!isNaN(dur)) pendingDuration = dur; else pendingDuration = null;
            continue;
        }
        if (line.startsWith('#')) continue; // comment/other tags
        // segment URI line
        const uri = line;
        const resolved = new URL(uri, base);
        const path = `${resolved.pathname}${resolved.search || ''}`;
        const duration = pendingDuration ?? 0;
        segments.push({ path, duration });
        pendingDuration = null;
    }
    const total = segments.reduce((s, x) => s + (x.duration || 0), 0);
    return { segments, total };
}

function updateProgressFromPlaylist(playlistUrl: URL, bodyText: string) {
    const key = `${playlistUrl.pathname}${playlistUrl.search || ''}`;
    const { segments, total } = parseM3U8(bodyText, playlistUrl);
    const indexByPath = new Map<string, number>();
    segments.forEach((s, idx) => indexByPath.set(s.path, idx));
    playlists.set(key, {
        playlistPath: key,
        segments,
        indexByPath,
        totalSeconds: total,
        lastIndex: -1,
    });
    // 反向映射：分片 -> 播放清单
    segments.forEach(s => segmentToPlaylist.set(s.path, key));
    console.log(`${LOG_PREFIX} playlist parsed: ${key}, segments=${segments.length}, total=${total.toFixed(2)}s`);
}

function touchSegment(pathKey: string) {
    const plKey = segmentToPlaylist.get(pathKey);
    if (!plKey) return;
    const rec = playlists.get(plKey);
    if (!rec) return;
    const idx = rec.indexByPath.get(pathKey);
    if (idx == null) return;
    if (idx > rec.lastIndex) rec.lastIndex = idx;
}

export function getProgressByUrl(targetUrl: string) {
    try {
        const u = new URL(targetUrl);
        const key = `${u.pathname}${u.search || ''}`;
        // 若是清单本身
        let rec = playlists.get(key);
        if (!rec) {
            const plKey = segmentToPlaylist.get(key);
            if (plKey) rec = playlists.get(plKey) || null as any;
        }
        if (!rec) return { currentSeconds: 0, totalSeconds: 0, percentage: 0 };
        const durations = rec.segments.map(s => s.duration || 0);
        const last = Math.max(0, rec.lastIndex);
        const current = last >= 0 ? durations.slice(0, last + 1).reduce((s, x) => s + x, 0) : 0;
        const total = rec.totalSeconds || 0;
        const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0;
        return { currentSeconds: current, totalSeconds: total, percentage: pct };
    } catch {
        return { currentSeconds: 0, totalSeconds: 0, percentage: 0 };
    }
}

export function startProxyOnce(preferPort = 39229): number {
    if (server && listenPort) {
        console.log(`${LOG_PREFIX} already running on port ${listenPort}`);
        return listenPort;
    }

    server = http.createServer((req, res) => {
        try {
            console.log(`${LOG_PREFIX} incoming ${req.method} ${req.url} from ${req.socket?.remoteAddress || 'unknown'}`);
            const reqUrl = new URL(req.url || '', `http://${req.headers.host}`);
            if (reqUrl.pathname === '/health') {
                console.log(`${LOG_PREFIX} health check`);
                res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
                res.end('OK');
                return;
            }
            // 其余所有路径均进行反向代理
            // 从配置读取目标域与 token
            const conf = (config && typeof config.readConfig === 'function') ? config.readConfig() : null;
            if (!conf || !conf.domain) {
                console.error(`${LOG_PREFIX} missing config.domain`);
                res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
                res.end('proxy not configured');
                return;
            }
            const upstreamBase = conf.domain; // e.g. https://example.com
            const upstreamToken = conf.token || '';

            // 将本地路径 1:1 映射到 config.domain 同路径
            const upstreamFull = new URL((reqUrl.pathname || '/') + (reqUrl.search || ''), upstreamBase);
            console.log(`${LOG_PREFIX} upstream target: ${upstreamFull.toString()}`);

            // 透传部分请求头（如 Range/Accept/Accept-Encoding），并覆盖为注入头
            const outHeaders: Record<string, string> = {};
            const passThrough = ['range', 'accept', 'accept-encoding', 'accept-language'];
            for (const name of passThrough) {
                const v = req.headers[name];
                if (typeof v === 'string') {
                    outHeaders[name] = v;
                }
            }
            console.log(`${LOG_PREFIX} pass-through incoming headers:`, passThrough.map(n => `${n}=${outHeaders[n] || ''}`));
            // 注入 Authorization
            if (upstreamToken) outHeaders['Authorization'] = upstreamToken;
            console.log(`${LOG_PREFIX} outbound headers prepared:`, Object.keys(outHeaders).map(k => `${k}=${maskHeaderValue(k, outHeaders[k])}`));

            const doRequest = (target: URL, redirectsLeft: number) => {
                const options: https.RequestOptions = {
                    protocol: target.protocol,
                    hostname: target.hostname,
                    port: target.port || (target.protocol === 'https:' ? 443 : 80),
                    path: target.pathname + target.search,
                    method: req.method,
                    headers: outHeaders,
                };

                const client = (target.protocol === 'https:' ? https : http).request(options, (up) => {
                    const status = up.statusCode || 0;
                    const loc = up.headers.location as string | undefined;
                    if (loc && [301, 302, 303, 307, 308].includes(status) && redirectsLeft > 0) {
                        // 处理重定向
                        console.log(`${LOG_PREFIX} upstream redirect ${status} -> ${loc}`);
                        up.resume(); // 丢弃响应体
                        const next = new URL(loc, target);
                        // 303 以及 301/302（对非 GET）通常应转为 GET；我们主要处理 GET
                        doRequest(next, redirectsLeft - 1);
                        return;
                    }
                    // 将上游响应头透传回来
                    const headers: http.OutgoingHttpHeaders = { ...up.headers };
                    try {
                        console.log(`${LOG_PREFIX} upstream response ${status}, headers:`, Object.keys(headers));
                    } catch { }
                    // 如果是 m3u8，抓取内容进行解析
                    const isM3U8 = options.path?.toLowerCase().includes('.m3u8') || (headers['content-type'] || '').toString().includes('application/vnd.apple.mpegurl');
                    if (isM3U8) {
                        const chunks: Buffer[] = [];
                        up.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
                        up.on('end', () => {
                            const body = Buffer.concat(chunks).toString('utf8');
                            try { updateProgressFromPlaylist(target, body); } catch (e) { console.error(`${LOG_PREFIX} m3u8 parse error`, e); }
                            res.writeHead(status || 502, headers);
                            res.end(body);
                        });
                        return; // 不再直接 pipe
                    }
                    // 如果是常见分片，更新进度
                    const lowerPath = (options.path || '').toLowerCase();
                    if (/(\.ts|\.m4s|\.mp4|\.aac)(\?|$)/.test(lowerPath)) {
                        const pathKey = `${target.pathname}${target.search || ''}`;
                        touchSegment(pathKey);
                    }
                    res.writeHead(status || 502, headers);
                    up.pipe(res);
                });

                client.on('error', (err) => {
                    console.error(`${LOG_PREFIX} upstream request error:`, err?.message || err);
                    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
                    res.end('upstream error: ' + err.message);
                });

                req.pipe(client);
            };

            doRequest(upstreamFull, 5);
        } catch (e: any) {
            res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('proxy error: ' + (e?.message || String(e)));
        }
    });

    // 监听错误，避免进程崩溃
    server.on('error', (err: any) => {
        // 端口占用或权限不足等
        console.error('[localProxy] listen error:', err?.code || err?.message || err);
    });
    // 仅尝试使用固定端口；若被占用则保留端口号，连接将失败（避免返回错误端口）
    server.listen(preferPort, '127.0.0.1');
    listenPort = preferPort;
    server.on('listening', () => {
        console.log(`${LOG_PREFIX} listening on 127.0.0.1:${listenPort}`);
    });

    return listenPort;
}

export function buildProxiedUrl(targetUrl: string, _headers?: Record<string, string>): string {
    // 仅做本地替换：将目标 URL 的路径与查询映射为本地同路径地址
    const port = startProxyOnce();
    try {
        const u = new URL(targetUrl);
        const pathAndQuery = `${u.pathname}${u.search}` || '/';
        return `http://127.0.0.1:${port}${pathAndQuery}`;
    } catch {
        // 如果不是合法 URL，直接返回原值（不破坏调用方）
        return targetUrl;
    }
}
