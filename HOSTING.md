# CoDBase Hosting Prep

This repo can now run as a small Node app before moving to a real host.

## Local Run

```bash
npm start
```

Open:

```text
http://127.0.0.1:3000
```

The backend exposes:

```text
GET    /api/session
POST   /api/login
POST   /api/logout

GET    /api/news
POST   /api/news
PUT    /api/news/:id
DELETE /api/news/:id
POST   /api/news/reset

GET    /api/events
POST   /api/events
PUT    /api/events/:id
DELETE /api/events/:id
POST   /api/events/reset

GET    /api/servers
GET    /api/servers/status
POST   /api/servers
PUT    /api/servers/:id
DELETE /api/servers/:id
POST   /api/servers/reset
```

The `GET` news/server routes are public. Login, logout, admin page access, and all write routes use an HttpOnly session cookie.

Before hosting, set:

```text
NODE_ENV=production
ADMIN_USERNAME=your-admin-name
ADMIN_PASSWORD=a-long-unique-password
ADMIN_SESSION_TTL_MS=43200000
```

Data is stored in:

```text
data/news.json
data/servers.json
```

This is intentionally simple. Later we can replace the JSON files with SQLite without changing the frontend much.

## Server Status

Servers added in the admin panel are queried by the backend. CoD1 servers use UDP `getstatus`. TeamSpeak 3 servers use ServerQuery over TCP, usually port `10011`, or the per-server query port entered in admin, then select the virtual server by the voice port.

TeamSpeak rows can be selected explicitly in admin. Older rows are still detected automatically when the name contains `TeamSpeak`/`TS3` or the voice port is `9987`/`9986`.

The homepage uses:

```text
GET /api/servers/status
```

The response includes `type`, `players`, `maxPlayers`, `map`, `status`, and `statusText`. The front page only shows servers under Active Now when `players > 0`.

Useful env settings:

```text
COD_QUERY_TIMEOUT_MS=900
TS3_QUERY_PORT=10011
TS3_QUERY_TIMEOUT_MS=1500
SERVER_STATUS_CACHE_MS=15000
```

Your host must allow outbound UDP from Node to CoD1 server IP/ports, and outbound TCP to the TeamSpeak ServerQuery port. The TeamSpeak server must allow ServerQuery from the website server IP.

## Discord News Sync

Create a Discord bot, invite it to the server, and give it access to the news channel.

Set:

```text
DISCORD_BOT_TOKEN=...
DISCORD_NEWS_CHANNEL_ID=...
```

Then run:

```bash
npm run discord:sync
```

Suggested Discord message format:

```text
Title: LAN #8 Announced
Category: Event
The next CoDBase LAN is planned for...
```

The sync worker turns those messages into website news items.

## Cheap VPS Later

A small VPS can run:

```bash
npm start
npm run discord:sync
```

Behind Nginx/Caddy with HTTPS.
