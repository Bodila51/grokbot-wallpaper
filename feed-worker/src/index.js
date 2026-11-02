// Private bot-status feed: one Durable Object holds a short message log behind two Bearer keys.
//   POST /post                 write one JSON line (Authorization: Bearer WRITE_KEY), body ≤ 4 KB
//   GET  /feed                 backlog, oldest first (Authorization: Bearer READ_KEY)
//   GET  /feed?since=<id>      messages after that id, oldest first
// Response shape: { "messages": [{ "id": "1", "time": 1730000000, "event": "message", "message": "<json>" }] }
// Secrets: wrangler secret put WRITE_KEY / READ_KEY. CORS: PAGES_ORIGINS (comma list) + localhost.
import { DurableObject } from 'cloudflare:workers';
import {
  MAX_BODY, checkBearer, corsHeaders, fail, json, parseOrigins, readBodyCapped,
} from './http.js';

const RETAIN_SECONDS = 12 * 3600;
const KEEP_LINES = 600;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('origin') || '';
    const allowed = parseOrigins(env.PAGES_ORIGINS);
    const cors = corsHeaders(origin, allowed);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return json({
        healthy: true,
        message_limit: MAX_BODY,
        retain_seconds: RETAIN_SECONDS,
        keep_lines: KEEP_LINES,
      }, 200, cors);
    }

    const stub = env.FEED.get(env.FEED.idFromName('main'));

    if (url.pathname === '/post' && request.method === 'POST') {
      const auth = await checkBearer(request, env.WRITE_KEY);
      if (!auth.ok) return fail(auth.status, auth.message, cors);
      const text = await readBodyCapped(request);
      if (text == null) return fail(413, `message too large: at most ${MAX_BODY} bytes`, cors);
      if (!text.trim()) return fail(400, 'empty body', cors);
      try { JSON.parse(text); } catch { return fail(400, 'body must be a JSON object', cors); }
      const msg = await stub.append(text);
      return json(msg, 200, cors);
    }

    if (url.pathname === '/feed' && request.method === 'GET') {
      const auth = await checkBearer(request, env.READ_KEY);
      if (!auth.ok) return fail(auth.status, auth.message, cors);
      const since = url.searchParams.get('since');
      const messages = await stub.list(since);
      return json({ messages }, 200, cors);
    }

    return fail(404, 'not found', cors);
  },
};

/** Single shared log for this Worker. SQLite-backed; keeps ~12 h / 600 lines. */
export class FeedLog extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS msgs (id INTEGER PRIMARY KEY AUTOINCREMENT, time INTEGER NOT NULL, message TEXT NOT NULL)');
  }

  async append(message) {
    const time = Math.floor(Date.now() / 1000);
    this.sql.exec('INSERT INTO msgs (time, message) VALUES (?, ?)', time, message);
    const row = this.sql.exec('SELECT id, time, message FROM msgs ORDER BY id DESC LIMIT 1').toArray()[0];
    this.prune(time);
    return { id: String(row.id), time: row.time, event: 'message', message: row.message };
  }

  async list(sinceRaw) {
    const cutoff = Math.floor(Date.now() / 1000) - RETAIN_SECONDS;
    let since = 0;
    if (sinceRaw != null && sinceRaw !== '') {
      const n = Number(sinceRaw);
      if (Number.isFinite(n) && n >= 0) since = Math.floor(n);
    }
    const rows = this.sql.exec(
      'SELECT id, time, message FROM msgs WHERE id > ? AND time >= ? ORDER BY id ASC LIMIT ?',
      since, cutoff, KEEP_LINES,
    ).toArray();
    return rows.map((r) => ({ id: String(r.id), time: r.time, event: 'message', message: r.message }));
  }

  prune(nowSec) {
    const cutoff = nowSec - RETAIN_SECONDS;
    this.sql.exec('DELETE FROM msgs WHERE time < ?', cutoff);
    const count = this.sql.exec('SELECT COUNT(*) AS n FROM msgs').toArray()[0]?.n ?? 0;
    if (count > KEEP_LINES) {
      const drop = count - KEEP_LINES;
      this.sql.exec('DELETE FROM msgs WHERE id IN (SELECT id FROM msgs ORDER BY id ASC LIMIT ?)', drop);
    }
  }
}
