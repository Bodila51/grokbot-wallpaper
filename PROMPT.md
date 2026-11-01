Paste this into your Grok Bot once. It connects all your bots to a live 3D dashboard and a desktop wallpaper, with no server to run.

```
I'd like to set up a small status feed for all my bots, so I can watch them on a dashboard. It uses ntfy.sh, a free notification service, over plain HTTPS with curl. Please do these steps in order.

1. Make a channel name. Run this, remember the result as <TOPIC>, and use it in every command below:
python3 -c "import secrets,string;print('gbw-'+''.join(secrets.choice(string.ascii_letters+string.digits) for _ in range(22)))"

2. Save this rule in the shared memory of ALL my bots, with the real topic filled in:
On every status change (you start a task, finish it, need me, hit an error, go idle), run one command:
curl -s -d '{"bot":"<your exact name>","group":"<your team>","status":"working|idle|waiting_user|error|done","step":"<what you are doing>"}' https://ntfy.sh/<TOPIC>
Pick one status from the list. group is your team, the same short name for bots that work together (each team gets its own floor on the dashboard). Send valid JSON only. Keep step to 80 characters at most. Never put secrets or personal data in step. Escape quotes in names; if a name has an apostrophe, send the JSON with curl -s -d @- from a here-document instead.

3. Post the roster, with the exact name of every bot I have:
curl -s -d '{"roster":["Bot A","Bot B"]}' https://ntfy.sh/<TOPIC>

4. Invent a look for each bot from its name and role.
shape is one of: sphere, rounded_cube, pill, triangle, cone, pentagon, hexagon, star4, star6, clover, rounded_square, trio.
accessory is one of: none, glasses, stem, antenna, bow.
color is #RRGGBB. Post one line (several lines in the same format if it would pass 4000 characters):
curl -s -d '{"looks":{"Bot A":{"shape":"sphere","color":"#2D84F5","accessory":"none"}}}' https://ntfy.sh/<TOPIC>

5. Post each bot's chat link once, so the dashboard can open it (the app link of each bot):
curl -s -d '{"chat":{"Bot A":"grokbot://app/v1/agent?id=<bot id>"}}' https://ntfy.sh/<TOPIC>

6. Create two routines. Each morning: post the roster and the looks again (steps 3 and 4), then one line per bot with its routines:
curl -s -d '{"routines":{"bot":"Bot A","items":[{"name":"<routine name>","schedule":"<when, in words>","next_run":"<ISO time>"}]}}' https://ntfy.sh/<TOPIC>
Every 2 hours: run your usage check and post one line, leaving out any field you don't know:
curl -s -d '{"type":"usage","total_used_pct":37,"resets_at":"<ISO time>","bots":{"Bot A":4.1}}' https://ntfy.sh/<TOPIC>

7. Post one test status line for yourself. Also run the morning routine once now, so the routines show up today.

8. Reply with only these two links, with the real topic filled in, and one sentence saying the topic works like a password, so I should not share the links:
Dashboard: https://bodila51.github.io/grokbot-wallpaper/#<TOPIC>
Wallpaper: https://bodila51.github.io/grokbot-wallpaper/face/#<TOPIC>
Do not post any other secret to the channel or in your reply.
```
