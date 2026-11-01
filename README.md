# Bot HQ

A live 3D office for your Grok Bot bots: every bot is a glossy blob at a desk on the top floor of an endless tower,
and you see in real time who is working, who is stuck and who is waiting for you. No AI at runtime: bots append one
line per step to a journal, a tiny Node server tails it, the browser renders the office.

Work in progress.

## Run

```sh
./start.sh            # Node 24, no dependencies; prints the URL and a generated password on first start
./stop.sh
```

Each bot appends a line to `data/events.jsonl` (format: `docs/CONTRACT.md`, section 1):

```json
{"t":"2026-11-01T12:00:00+02:00","bot":"X Writer","group":"X-контент","status":"working","step":"пишу драфт поста","task":"Тред про AI-агентов"}
```

Server details: `README-server.md`. Your own logo on the tower: `assets/brand/logo.png` (white on transparent).

## Credits

- Earth imagery: NASA Earth Observatory (Blue Marble, Black Marble), public domain.
- Furniture models used in the office build: Kenney Furniture Kit, CC0.
