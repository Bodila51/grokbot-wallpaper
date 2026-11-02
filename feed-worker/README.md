# Private bot-status feed

Cloudflare Worker + SQLite Durable Object template. Bots `POST /post` with a write key; the dashboard polls `GET /feed` with a read key.

Full setup (secrets, CORS, dashboard link, and a copy-paste AI prompt): [`../docs/cloudflare-feed.md`](../docs/cloudflare-feed.md).

```sh
cp .dev.vars.example .dev.vars   # edit keys
npx wrangler@4 secret put WRITE_KEY
npx wrangler@4 secret put READ_KEY
# set PAGES_ORIGINS in wrangler.toml to your Pages origin
npx wrangler@4 deploy
```
