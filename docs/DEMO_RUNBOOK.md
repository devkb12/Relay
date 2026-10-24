# RELAY demo runbook

All teaching content is original synthetic material (`data/questions.json`). Participants in a
demo are consenting teammates. Results from a demo are not learning outcomes.

## 0. One-time Discord setup (Rithik)

1. https://discord.com/developers/applications → New Application → Bot → copy the token into
   `.env` as `DISCORD_BOT_TOKEN` (never paste it in chat or commit it).
2. OAuth2 → URL Generator: scopes `bot` + `applications.commands`; bot permissions
   `View Channels`, `Send Messages`, `Embed Links`. Open the URL, add the bot to a private test server.
3. Discord → Settings → Advanced → Developer Mode on; right-click the server → Copy Server ID →
   `.env` `DISCORD_GUILD_ID` (guild commands appear immediately).
4. No privileged intents are needed (no Message Content, no Server Members).

## 1. Start locally (Windows PowerShell, repo root)

```powershell
.\.venv\Scripts\python.exe -m relay.migrate
.\.venv\Scripts\python.exe -m uvicorn relay.api:app --host 127.0.0.1 --port 8000
# second terminal
.\.venv\Scripts\python.exe -m relay.bot      # expect: "RELAY connected as <bot>"
```

Model stays `none` (reviewed hints) and delivery stays off unless explicitly changed.

## 2. The cycle (two or more accounts in the same channel)

| Who | Command | Expect |
|---|---|---|
| Host | `/relay create` | private confirmation + group card in channel |
| Each member | `/relay join` | private confirmation; card shows participant count |
| (optional) each | `/relay availability` → modal | private confirmation |
| (optional) host | `/relay schedule minutes:60` | proposal card with **Approve** button |
| (optional) each | press Approve | private "recorded"; card count updates |
| Host | `/relay next` | stage → diagnostic |
| Each | `/relay question` → **Answer privately** → modal (choice, confidence, reasoning) | "Attempt locked" (private) |
| Host | `/relay next` (or `close_round:True` to record non-answerers as missing) | stage → discussion, prompt on card |
| Host (optional) | `/relay hint` | "Prompt prepared from reviewed fallback" + prompt in channel |
| Any member | `/relay explain text:...` | explanation posted to channel |
| — or host | `/relay fallback` | labeled source-review fallback |
| Any member (optional) | `/relay challenge reason:...` | paused card; host `/relay review` then `/relay resolve` |
| Host | `/relay next` | stage → transfer ("fresh application") |
| Each | `/relay question` → answer | locked |
| Host | `/relay next` | debrief card (group results only with ≥3 paired responders) |
| Each | `/relay question` | private results with status (correct / not correct / skipped / missing) |

Stale-control check: after the round, press an old **Answer privately** button → friendly refusal.
`/relay delete confirm:True` then press an old button → "belongs to an older or deleted session".

## 3. Browser room (after Dev's Next.js proxy is deployed)

Sign in with Discord on the frontend domain; the session you joined in Discord appears in your list.
Shared screens use the presentation view. Until OAuth is configured, the frontend uses fixture mode.

## 4. Reset

Stop both processes. `/relay delete confirm:True` removes the session. To wipe local data delete
`relay.sqlite3*` (local only; never in production).

## What a demo does NOT show

No live model unless enabled and labeled; no reminders unless delivery is enabled with consent;
no Google Calendar write (the .ics is a file); no next-day result inside a same-day demo.
