const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const dgram = require("dgram");

const root = __dirname;
const dataDir = path.join(root, "data");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const adminUsername = process.env.ADMIN_USERNAME || "admin";
const adminPassword = process.env.ADMIN_PASSWORD || "codbase";
const sessionTtlMs = Number(process.env.ADMIN_SESSION_TTL_MS || 1000 * 60 * 60 * 12);
const codQueryTimeoutMs = Number(process.env.COD_QUERY_TIMEOUT_MS || 900);
const serverStatusCacheMs = Number(process.env.SERVER_STATUS_CACHE_MS || 15000);
const sessions = new Map();
const serverStatusCache = {
  key: "",
  expiresAt: 0,
  items: [],
};

const defaults = {
  news: [],
  servers: [],
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

const send = (res, status, body, type = "application/json; charset=utf-8", headers = {}) => {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
};

const sendJson = (res, status, value, headers = {}) => {
  send(res, status, JSON.stringify(value), "application/json; charset=utf-8", headers);
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const parseCookies = (req) =>
  String(req.headers.cookie || "")
    .split(";")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .reduce((cookies, pair) => {
      const [key, ...value] = pair.split("=");
      cookies[decodeURIComponent(key)] = decodeURIComponent(value.join("="));
      return cookies;
    }, {});

const isHttpsRequest = (req) =>
  req.headers["x-forwarded-proto"] === "https" || req.socket.encrypted || process.env.NODE_ENV === "production";

const sessionCookie = (req, token, maxAgeSeconds) => {
  const secure = isHttpsRequest(req) ? "; Secure" : "";
  return `codbase_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${secure}`;
};

const clearSessionCookie = (req) => sessionCookie(req, "", 0);

const getSessionToken = (req) => parseCookies(req).codbase_session;

const getSession = (req) => {
  const token = getSessionToken(req);
  if (!token) return null;

  const session = sessions.get(token);
  if (!session) return null;

  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }

  return session;
};

const timingSafeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const requireAuth = (req, res) => {
  if (getSession(req)) return true;
  sendJson(res, 401, { error: "Authentication required" });
  return false;
};

const dataFile = (collection) => path.join(dataDir, `${collection}.json`);

const ensureData = async () => {
  await fs.mkdir(dataDir, { recursive: true });
  await Promise.all(
    Object.entries(defaults).map(async ([collection, items]) => {
      const file = dataFile(collection);
      try {
        await fs.access(file);
      } catch {
        await fs.writeFile(file, JSON.stringify(items, null, 2));
      }
    }),
  );
};

const readCollection = async (collection) => {
  await ensureData();
  const file = await fs.readFile(dataFile(collection), "utf8");
  return JSON.parse(file);
};

const writeCollection = async (collection, items) => {
  await ensureData();
  await fs.writeFile(dataFile(collection), JSON.stringify(items, null, 2));
  return items;
};

const uid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const cleanNews = (input) => ({
  id: input.id || uid("news"),
  title: String(input.title || "Untitled news").trim(),
  date: String(input.date || new Date().toISOString().slice(0, 10)),
  category: String(input.category || "News").trim(),
  excerpt: String(input.excerpt || "").trim(),
  source: String(input.source || "admin"),
  discordMessageId: input.discordMessageId ? String(input.discordMessageId) : undefined,
});

const cleanServer = (input) => ({
  id: input.id || uid("server"),
  name: String(input.name || "Unnamed server").trim(),
  ip: String(input.ip || "server.codbase.eu").trim(),
  port: Number(input.port || 28960),
});

const parseInfoLine = (line) => {
  const values = {};
  const parts = String(line || "").split("\\").filter(Boolean);

  for (let index = 0; index < parts.length; index += 2) {
    values[parts[index]] = parts[index + 1] || "";
  }

  return values;
};

const parsePlayers = (lines) =>
  lines
    .map((line) => {
      const match = String(line).match(/^(-?\d+)\s+(-?\d+)\s+"(.*)"$/);
      if (!match) return null;

      return {
        score: Number(match[1]),
        ping: Number(match[2]),
        name: match[3],
      };
    })
    .filter(Boolean);

const parseCodStatus = (message) => {
  const text = message.toString("latin1").replace(/^\xff\xff\xff\xff/, "");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const infoIndex = lines.findIndex((line) => line.startsWith("\\"));
  const info = parseInfoLine(lines[infoIndex] || "");
  const players = parsePlayers(infoIndex >= 0 ? lines.slice(infoIndex + 1) : []);
  const maxPlayers = Number(info.sv_maxclients || info.maxclients || info.clients || 0);

  return {
    status: "online",
    statusText: "Online",
    hostname: info.sv_hostname || info.hostname || "",
    map: info.mapname || "",
    gameType: info.g_gametype || info.gametype || "",
    players: players.length,
    maxPlayers,
    playerList: players,
  };
};

const queryCodServer = (server) =>
  new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    let settled = false;
    const request = Buffer.concat([
      Buffer.from([0xff, 0xff, 0xff, 0xff]),
      Buffer.from("getstatus", "ascii"),
    ]);

    const finish = (status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.close();
      resolve({
        ...server,
        players: 0,
        maxPlayers: 0,
        playerList: [],
        map: "",
        gameType: "",
        hostname: "",
        ...status,
      });
    };

    const timeout = setTimeout(() => {
      finish({ status: "offline", statusText: "No response" });
    }, codQueryTimeoutMs);

    socket.once("message", (message) => {
      try {
        finish(parseCodStatus(message));
      } catch {
        finish({ status: "offline", statusText: "Invalid response" });
      }
    });

    socket.once("error", () => {
      finish({ status: "offline", statusText: "Query failed" });
    });

    socket.send(request, Number(server.port), server.ip, (error) => {
      if (error) finish({ status: "offline", statusText: "Query failed" });
    });
  });

const readServerStatus = async () => {
  const servers = await readCollection("servers");
  const cacheKey = JSON.stringify(servers);

  if (serverStatusCache.key === cacheKey && serverStatusCache.expiresAt > Date.now()) {
    return serverStatusCache.items;
  }

  const items = await Promise.all(servers.map((server) => queryCodServer(cleanServer(server))));
  serverStatusCache.key = cacheKey;
  serverStatusCache.expiresAt = Date.now() + serverStatusCacheMs;
  serverStatusCache.items = items;
  return items;
};

const routeAuth = async (req, res, pathname) => {
  if (req.method === "GET" && pathname === "/api/session") {
    sendJson(res, 200, { authenticated: Boolean(getSession(req)) });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/login") {
    const body = await readBody(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    if (!timingSafeEqual(username, adminUsername) || !timingSafeEqual(password, adminPassword)) {
      sendJson(res, 401, { error: "Invalid credentials" });
      return true;
    }

    const token = crypto.randomBytes(32).toString("base64url");
    sessions.set(token, {
      username,
      expiresAt: Date.now() + sessionTtlMs,
    });

    sendJson(res, 200, { ok: true }, {
      "Set-Cookie": sessionCookie(req, token, Math.floor(sessionTtlMs / 1000)),
    });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/logout") {
    const token = getSessionToken(req);
    if (token) sessions.delete(token);
    sendJson(res, 200, { ok: true }, { "Set-Cookie": clearSessionCookie(req) });
    return true;
  }

  return false;
};

const routeApi = async (req, res, pathname) => {
  if (await routeAuth(req, res, pathname)) return;

  const parts = pathname.split("/").filter(Boolean);
  const collection = parts[1];
  const id = parts[2];

  if (!["news", "servers"].includes(collection)) {
    sendJson(res, 404, { error: "Unknown API route" });
    return;
  }

  const cleaner = collection === "news" ? cleanNews : cleanServer;
  const resetDefaults = defaults[collection];

  if (req.method === "GET" && collection === "servers" && id === "status") {
    sendJson(res, 200, await readServerStatus());
    return;
  }

  if (req.method === "GET" && parts.length === 2) {
    sendJson(res, 200, await readCollection(collection));
    return;
  }

  if (!requireAuth(req, res)) return;

  if (req.method === "POST" && parts.length === 2) {
    const items = await readCollection(collection);
    const item = cleaner(await readBody(req));
    items.unshift(item);
    await writeCollection(collection, items);
    sendJson(res, 201, item);
    return;
  }

  if (req.method === "PUT" && parts.length === 2) {
    const body = await readBody(req);
    if (!Array.isArray(body)) {
      sendJson(res, 400, { error: "Expected an array" });
      return;
    }

    const next = body.map(cleaner);
    await writeCollection(collection, next);
    sendJson(res, 200, next);
    return;
  }

  if (req.method === "PUT" && id) {
    const items = await readCollection(collection);
    const incoming = cleaner({ ...(await readBody(req)), id });
    const next = items.some((item) => item.id === id)
      ? items.map((item) => (item.id === id ? incoming : item))
      : [incoming, ...items];
    await writeCollection(collection, next);
    sendJson(res, 200, incoming);
    return;
  }

  if (req.method === "DELETE" && id) {
    const items = await readCollection(collection);
    await writeCollection(collection, items.filter((item) => item.id !== id));
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && id === "reset") {
    const next = resetDefaults.map((item) => ({ ...item }));
    await writeCollection(collection, next);
    sendJson(res, 200, next);
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
};

const routeStatic = async (req, res, pathname) => {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(root, requested));

  if (!filePath.startsWith(root)) {
    send(res, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }

  if (requested === "/admin.html" && !getSession(req)) {
    res.writeHead(302, {
      Location: "/login.html",
      "Cache-Control": "no-store",
    });
    res.end();
    return;
  }

  if (requested === "/login.html" && getSession(req)) {
    res.writeHead(302, {
      Location: "/admin.html",
      "Cache-Control": "no-store",
    });
    res.end();
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    send(res, 200, file, mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream");
  } catch {
    send(res, 404, "Not found", "text/plain; charset=utf-8");
  }
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await routeApi(req, res, url.pathname);
      return;
    }

    await routeStatic(req, res, url.pathname);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Internal server error" });
  }
});

ensureData().then(() => {
  server.listen(port, host, () => {
    console.log(`CoDBase running at http://${host}:${port}`);
  });
});
