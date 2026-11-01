Paste this into your Grok Bot once. It connects all your bots to a live 3D dashboard, with no server to run.

```
I'd like to set up a small status feed for all my bots, so I can watch them on a dashboard. It uses ntfy.sh, a free notification service, over plain HTTPS with curl. Please do these steps in order.

1. Make a channel name. Run this, remember the result as <TOPIC>, and use it in every command below:
python3 -c "import secrets,string;print('gbw-'+''.join(secrets.choice(string.ascii_letters+string.digits) for _ in range(22)))"

2. Save the rule below in my shared user memory (the shared profile that all my bots see), with the real topic filled in. Save it as three separate short facts, each under 400 characters, so none gets cut. If the shared memory already has an older rule about posting statuses to ntfy.sh, delete it, or mark it as replaced by this one.
Fact A: On every status change (you start a task, finish it, need me, hit an error, go idle), run: curl -s -d '{"bot":"<your exact name>","status":"working|idle|waiting_user|error|done","step":"<what you are doing>"}' https://ntfy.sh/<TOPIC>
Fact B: For that status line: pick one status from the list, send valid JSON only, step at most 80 characters, no secrets or personal data in step. If your name has a quote or apostrophe, send the JSON with curl -s -d @- from a here-document.
Fact C: Once a day on your first run, and whenever you create, change or delete a routine, post your own routines (an empty list if none): curl -s -d '{"routines":{"bot":"<your exact name>","items":[{"name":"<routine>","schedule":"<when, in words>","next_run":"<ISO time>"}]}}' https://ntfy.sh/<TOPIC>

3. Post the roster: the exact name of every bot I have, including yourself:
curl -s -d '{"roster":["Bot A","Bot B"]}' https://ntfy.sh/<TOPIC>

4. Invent a look for each bot from its name and role.
shape is one of: sphere, rounded_cube, pill, triangle, cone, pentagon, hexagon, star4, star6, clover, rounded_square, trio.
accessory is one of: none, glasses, stem, antenna, bow.
color is #RRGGBB. Post one line (several lines in the same format if it would pass 4000 characters):
curl -s -d '{"looks":{"Bot A":{"shape":"sphere","color":"#2D84F5","accessory":"none"}}}' https://ntfy.sh/<TOPIC>

5. Sort my bots into 3 to 6 teams by their roles, with short English team names (each team gets its own floor on the dashboard). Put yourself and any helper or test bots into one team, e.g. Ops. Post them:
curl -s -d '{"groups":{"Bot A":"Content","Bot B":"Finance"}}' https://ntfy.sh/<TOPIC>

6. Post each bot's chat link, the app link with its id. Skip a bot if you don't know its id:
curl -s -d '{"chat":{"Bot A":"grokbot://app/v1/agent?id=<bot id>"}}' https://ntfy.sh/<TOPIC>

7. Create two routines for yourself. The channel forgets messages after 12 hours, so (a few minutes off schedule is fine):
Every day around 08:00 my local time: post steps 3, 4, 5 and 6 again.
Around 09:00, 13:00, 17:00 and 21:00 my local time: run your usage check, asking for the full list of bots (not only the top ones), and post one line. total_used_pct is how much of my weekly Grok Bot limit is used, in percent. bots is each bot's share of my Grok Bot usage this week, in percent; leave out bots under 1% and any field you don't know:
curl -s -d '{"type":"usage","total_used_pct":37,"resets_at":"<ISO time>","bots":{"Bot A":4.1}}' https://ntfy.sh/<TOPIC>

8. Post one test status line for yourself, and your own routines line.

9. Reply with this link first, with the real topic filled in, and one sentence saying the topic works like a password, so I should not share the link:
https://bodila51.github.io/grokbot-wallpaper/#<TOPIC>
Then, only if something did not work, add a short list of the problems. Do not post any other secret to the channel or in your reply.
```
