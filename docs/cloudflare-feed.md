# Private Cloudflare feed

A self-hosted status feed for the dashboard. Bots `POST` JSON lines; the browser polls `GET` with a read key. The base URL and read key stay in the link fragment (`#feed=…&key=…`), which GitHub Pages never receives.

Public ntfy topics (and the bundled relay) remain supported as a **legacy** option via `#<topic>`. Those channels are shared: anyone with the topic string can read and post. Use this Worker when you want separate write/read keys and CORS limited to your Pages origin.

## What you deploy

The template lives in `feed-worker/`:

| Piece | Role |
|---|---|
| Worker | `POST /post`, `GET /feed`, `OPTIONS`, `/health` |
| Durable Object `FeedLog` | SQLite log, ~12 hours / 600 messages |
| Secrets `WRITE_KEY`, `READ_KEY` | Bearer tokens for bots and the dashboard |
| Var `PAGES_ORIGINS` | Comma-separated HTTPS origins allowed for browser `GET /feed` (plus localhost for local testing) |

Contract the dashboard already speaks:

```http
POST /post
Authorization: Bearer <WRITE_KEY>
Content-Type: application/json

{"bot":"Research Bot","status":"working","step":"reading sources"}
```

```http
GET /feed
GET /feed?since=<last id>
Authorization: Bearer <READ_KEY>
```

```json
{"messages":[{"id":"1","time":1730000000,"event":"message","message":"{\"bot\":\"Research Bot\",\"status\":\"idle\"}"}]}
```

Dashboard link (fragment only):

```text
https://<you>.github.io/<repo>/web/#feed=<urlencoded FEED_BASE>&key=<urlencoded READ_KEY>
```

Optional theme: put `?theme=ranch` in the query; keep `#feed` and `#key` in the fragment. Wallpaper face page: same fragment on `/face/`.

## Setup (manual)

1. Copy `feed-worker/` (or open this repo and work in that folder).
2. Create two long random keys. Put them in `.dev.vars` for local dev (see `.dev.vars.example`).
3. Set `PAGES_ORIGINS` in `wrangler.toml` to your Pages origin, for example `https://<you>.github.io`.
4. `npx wrangler@4 secret put WRITE_KEY` and `npx wrangler@4 secret put READ_KEY`.
5. `npx wrangler@4 deploy`. Note the `*.workers.dev` URL Wrangler prints — that is `FEED_BASE` (no trailing slash).
6. Paste the AI prompt below into your bot (with the three placeholders filled), or post a test line with curl:

```sh
curl -s -X POST -H "Authorization: Bearer <WRITE_KEY>" -H "Content-Type: application/json" \
  -d '{"bot":"Research Bot","status":"idle","step":"hello"}' \
  "$FEED_BASE/post"
```

7. Open the dashboard link. A failed poll shows **feed offline** and retries every 30 seconds.

To rotate a key, put a new secret, update bots and the link, and drop the old secret.

## AI setup prompt

Copy this into your own AI bot. Replace the three placeholders first. Do not commit the filled-in copy. No personal names, emails, or real hostnames belong in the placeholders.

```
I'd like to set up a private status feed for all my bots so I can watch them on a dashboard. The feed is my own HTTP service. Please do these steps in order. Use these three values exactly, and do not invent others:

FEED_BASE=https://<your-worker>.<your-subdomain>.workers.dev
WRITE_KEY=<write-key>
READ_KEY=<read-key>

1. The dashboard link puts FEED_BASE and READ_KEY in the fragment, never in the query:
LINK = https://<you>.github.io/<repo>/web/#feed= + urlencoded FEED_BASE + &key= + urlencoded READ_KEY
Posting is POST FEED_BASE/post with header Authorization: Bearer WRITE_KEY and Content-Type: application/json. The body is one JSON object, at most 4 KB.

2. Save the rule below in my shared user memory (the shared profile that all my bots see), with FEED_BASE and WRITE_KEY written in. Save it as three separate short facts, each under 400 characters, so none gets cut. If the shared memory already has an older rule about posting statuses to ntfy or another feed, delete it, or mark it as replaced by this one.
Fact A: On every status change (you start a task, finish it, need me, hit an error, go idle), run: curl -s -X POST -H "Authorization: Bearer WRITE_KEY" -H "Content-Type: application/json" -d '{"bot":"<your exact name>","status":"working|idle|waiting_user|error|done","step":"<what you are doing>"}' FEED_BASE/post
Fact B: For that status line: pick one status from the list, send valid JSON only, step at most 80 characters, no secrets or personal data in step. If your name has a quote or apostrophe, send the JSON through curl's stdin from a here-document.
Fact C: Once a day on your first run, and whenever you create, change or delete a routine, post your own routines (an empty list if none): curl -s -X POST -H "Authorization: Bearer WRITE_KEY" -H "Content-Type: application/json" -d '{"routines":{"bot":"<your exact name>","items":[{"name":"<routine>","schedule":"<when, in words>","next_run":"<ISO time>"}]}}' FEED_BASE/post

3. Post the roster: the exact name of every bot I have, including yourself. Same curl, body {"roster":["Bot A","Bot B"]}.

4. Invent a look for each bot from its name and role.
shape is one of: sphere, cloud, rounded_square, star4, clover, bubble, flower, drop, pill, triangle, pentagon, star6, hexagon, rounded_cube, cone, trio.
accessory is one of: none, glasses, stem, antenna, bow.
color is a six-digit hex colour with a number sign in front (for example a blue like #2D84F5). Post one line (several lines in the same format if it would pass 4000 characters):
{"looks":{"Bot A":{"shape":"sphere","color":"#2D84F5","accessory":"none"}}}

5. Sort my bots into 3 to 6 teams by their roles, with short English team names (each team gets its own floor on the dashboard). Put yourself and any helper or test bots into one team, for example Ops. Post them:
{"groups":{"Bot A":"Content","Bot B":"Finance"}}

6. Post each bot's chat link, the app link with its id (grokbot, colon, two slashes, then app/v1/agent?id= and the id). Skip a bot if you don't know its id:
{"chat":{"Bot A":"<chat link>"}}

7. Create two routines for yourself.
Every day around 08:00 my local time: post steps 3, 4, 5 and 6 again.
Around 09:00, 13:00, 17:00 and 21:00 my local time: run your usage check, asking for the full list of bots (not only the top ones), and post one line. total_used_pct is the overall weekly limit used, in percent. bots is each of my bots' share of the usage this week, in percent (whole numbers are fine); leave out bots under 1%, rows that are not one of my bots, and any field you don't know:
{"type":"usage","total_used_pct":37,"resets_at":"<ISO time>","bots":{"Bot A":4.1}}

8. Post one test status line for yourself, your own routines line, and one usage line now (as in step 7), so the dashboard shows the limit right away.

9. Reply with LINK first, and one sentence saying the read key in it works like a password, so I should not share it. Then, only if something did not work, add a short list of the problems. Reply in the language I usually write to you in. Do not post WRITE_KEY, and do not post any other secret to the feed or in your reply.
```

## Migrating from ntfy / the relay

1. Deploy the Worker and confirm `GET /feed` with the read key returns `{"messages":[]}`.
2. Point bots at `POST /post` with the write key (prompt above).
3. Switch the dashboard and wallpaper links from `#<topic>` to `#feed=<base>&key=<read key>`.
4. Optional: keep the old topic alive until you are sure every bot has the new rule.

The office still understands `#<topic>` and `#<topic>&ntfy=<server>` if you need the legacy path.
