const NEWS_KEY = "codbase_admin_news";
const SERVERS_KEY = "codbase_admin_servers";

const defaultNews = [
  {
    id: "news-1",
    title: "LAN #7 announced for Lodz",
    date: "2026-10-20",
    category: "Event",
    excerpt: "Travel plans, rules, and registration details are being prepared for the next classic LAN.",
  },
  {
    id: "news-2",
    title: "CoDBase Nations Cup returns",
    date: "2026-09-12",
    category: "Community",
    excerpt: "National teams are forming again for a fast, clean tournament format.",
  },
];

const defaultServers = [
  { id: "server-1", name: "CoDBase Cup #1", ip: "play.codbase.eu", port: 28960 },
  { id: "server-2", name: "Rifles Only EU", ip: "rifles.codbase.eu", port: 28960 },
  { id: "server-3", name: "Classic Rotation", ip: "classic.codbase.eu", port: 28960 },
  { id: "server-4", name: "Scrim Server A", ip: "scrim-a.codbase.eu", port: 28960 },
];

const readStore = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
};

const writeStore = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const apiRequest = async (endpoint, options = {}) => {
  const response = await fetch(endpoint, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  if (response.status === 401 && endpoint !== "/api/login") {
    window.location.href = "login.html";
  }

  if (!response.ok) throw new Error(`API responded with ${response.status}`);
  if (response.status === 204) return null;
  return response.json();
};

const apiList = async (endpoint, fallbackKey, fallbackValue) => {
  try {
    const items = await apiRequest(endpoint);
    if (Array.isArray(items)) {
      writeStore(fallbackKey, items);
      return items;
    }
  } catch {
    return readStore(fallbackKey, fallbackValue);
  }

  return readStore(fallbackKey, fallbackValue);
};

const uid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => (
    {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]
  ));

const loginForm = document.querySelector("[data-login-form]");
const loginMessage = document.querySelector("[data-login-message]");

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(loginForm);
    const username = String(data.get("username")).trim();
    const password = String(data.get("password")).trim();

    loginMessage.textContent = "Checking credentials...";
    loginMessage.classList.remove("is-error");

    try {
      await apiRequest("/api/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      window.location.href = "admin.html";
    } catch {
      loginMessage.textContent = "Invalid credentials.";
      loginMessage.classList.add("is-error");
    }
  });
}

const isAdminPage = document.body.classList.contains("admin-page");

const newsForm = document.querySelector("[data-news-form]");
const serverForm = document.querySelector("[data-server-form]");
const newsList = document.querySelector("[data-news-list]");
const serverList = document.querySelector("[data-server-list]");
const newsCount = document.querySelector("[data-news-count]");
const serverCount = document.querySelector("[data-server-count]");
const apiStatus = document.querySelector("[data-api-status]");

let newsItems = readStore(NEWS_KEY, defaultNews);
let serverItems = readStore(SERVERS_KEY, defaultServers);

const normalizeServer = (server) => {
  if (server.ip && server.port) {
    return {
      id: server.id,
      name: server.name,
      ip: server.ip,
      port: Number(server.port),
    };
  }

  const rawAddress = String(server.address || "");
  const [ip, port] = rawAddress.includes(":")
    ? rawAddress.split(":")
    : [rawAddress || server.name || "server.codbase.eu", "28960"];

  return {
    id: server.id || uid("server"),
    name: server.name || "Unnamed server",
    ip,
    port: Number(port) || 28960,
  };
};

serverItems = serverItems.map(normalizeServer);

const syncStats = () => {
  if (!newsCount) return;
  newsCount.textContent = newsItems.length;
  serverCount.textContent = serverItems.length;
  if (apiStatus) apiStatus.textContent = "Ready";
};

const clearForm = (form) => {
  form.reset();
  form.elements.id.value = "";
};

const renderNews = () => {
  if (!newsList) return;
  newsList.innerHTML = newsItems
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(
      (item) => `
        <article class="admin-item">
          <div class="admin-item-head">
            <div>
              <small>${escapeHtml(item.category)} / ${escapeHtml(item.date)}</small>
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.excerpt)}</p>
            </div>
            <div class="admin-item-actions">
              <button class="icon-action" type="button" data-edit-news="${item.id}">Edit</button>
              <button class="icon-action" type="button" data-delete-news="${item.id}">Remove</button>
            </div>
          </div>
        </article>
      `,
    )
    .join("");
};

const renderServers = () => {
  if (!serverList) return;
  serverList.innerHTML = serverItems
    .map(
      (item, index) => `
        <article class="admin-item server-admin-item" data-server-row="${item.id}">
          <div class="admin-item-head">
            <div class="server-admin-info">
              <button class="drag-handle" type="button" draggable="true" data-drag-server="${item.id}" aria-label="Drag ${escapeHtml(item.name)}">Grip</button>
              <div>
                <small>Position ${index + 1} / Game server registry</small>
                <h3>${escapeHtml(item.name)}</h3>
                <p><span class="server-address-chip">${escapeHtml(item.ip)}</span><span class="server-port-chip">${escapeHtml(item.port)}</span></p>
              </div>
            </div>
            <div class="admin-item-actions">
              <button class="icon-action" type="button" data-edit-server="${item.id}">Edit</button>
              <button class="icon-action" type="button" data-delete-server="${item.id}">Remove</button>
            </div>
          </div>
        </article>
      `,
    )
    .join("");
};

const reorderServers = (dragId, targetId) => {
  if (!dragId || !targetId || dragId === targetId) return;

  const fromIndex = serverItems.findIndex((server) => server.id === dragId);
  const toIndex = serverItems.findIndex((server) => server.id === targetId);
  if (fromIndex < 0 || toIndex < 0) return;

  const [moved] = serverItems.splice(fromIndex, 1);
  serverItems.splice(toIndex, 0, moved);
  writeStore(SERVERS_KEY, serverItems);
  apiRequest("/api/servers", { method: "PUT", body: JSON.stringify(serverItems) }).catch(() => {});
  renderAdmin();
};

const renderAdmin = () => {
  renderNews();
  renderServers();
  syncStats();
};

newsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(newsForm);
  const item = {
    id: data.get("id") || uid("news"),
    title: String(data.get("title")).trim(),
    date: String(data.get("date")),
    category: String(data.get("category")),
    excerpt: String(data.get("excerpt")).trim(),
  };
  const isExisting = newsItems.some((news) => news.id === item.id);

  try {
    const saved = await apiRequest(isExisting ? `/api/news/${item.id}` : "/api/news", {
      method: isExisting ? "PUT" : "POST",
      body: JSON.stringify(item),
    });
    newsItems = isExisting
      ? newsItems.map((news) => (news.id === saved.id ? saved : news))
      : [saved, ...newsItems];
  } catch {
    newsItems = isExisting
      ? newsItems.map((news) => (news.id === item.id ? item : news))
      : [item, ...newsItems];
  }

  writeStore(NEWS_KEY, newsItems);
  clearForm(newsForm);
  renderAdmin();
});

serverForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(serverForm);
  const item = {
    id: data.get("id") || uid("server"),
    name: String(data.get("name")).trim(),
    ip: String(data.get("ip")).trim(),
    port: Number(data.get("port")),
  };
  const isExisting = serverItems.some((server) => server.id === item.id);

  try {
    const saved = await apiRequest(isExisting ? `/api/servers/${item.id}` : "/api/servers", {
      method: isExisting ? "PUT" : "POST",
      body: JSON.stringify(item),
    });
    serverItems = isExisting
      ? serverItems.map((server) => (server.id === saved.id ? normalizeServer(saved) : server))
      : [normalizeServer(saved), ...serverItems];
  } catch {
    serverItems = isExisting
      ? serverItems.map((server) => (server.id === item.id ? item : server))
      : [item, ...serverItems];
  }

  writeStore(SERVERS_KEY, serverItems);
  clearForm(serverForm);
  renderAdmin();
});

document.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const editNewsId = target.dataset.editNews;
  if (editNewsId && newsForm) {
    const item = newsItems.find((news) => news.id === editNewsId);
    if (!item) return;
    newsForm.elements.id.value = item.id;
    newsForm.elements.title.value = item.title;
    newsForm.elements.date.value = item.date;
    newsForm.elements.category.value = item.category;
    newsForm.elements.excerpt.value = item.excerpt;
    newsForm.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const deleteNewsId = target.dataset.deleteNews;
  if (deleteNewsId) {
    try {
      await apiRequest(`/api/news/${deleteNewsId}`, { method: "DELETE" });
    } catch {
      // Keep the local fallback in sync when the API is not running yet.
    }
    newsItems = newsItems.filter((news) => news.id !== deleteNewsId);
    writeStore(NEWS_KEY, newsItems);
    renderAdmin();
  }

  const editServerId = target.dataset.editServer;
  if (editServerId && serverForm) {
    const item = serverItems.find((server) => server.id === editServerId);
    if (!item) return;
    serverForm.elements.id.value = item.id;
    serverForm.elements.name.value = item.name;
    serverForm.elements.ip.value = item.ip;
    serverForm.elements.port.value = item.port;
    serverForm.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const deleteServerId = target.dataset.deleteServer;
  if (deleteServerId) {
    try {
      await apiRequest(`/api/servers/${deleteServerId}`, { method: "DELETE" });
    } catch {
      // Keep the local fallback in sync when the API is not running yet.
    }
    serverItems = serverItems.filter((server) => server.id !== deleteServerId);
    writeStore(SERVERS_KEY, serverItems);
    renderAdmin();
  }

  if (target.matches("[data-clear-news]") && newsForm) clearForm(newsForm);
  if (target.matches("[data-clear-server]") && serverForm) clearForm(serverForm);

  if (target.matches("[data-reset-news]")) {
    try {
      newsItems = await apiRequest("/api/news/reset", { method: "POST" });
    } catch {
      newsItems = [...defaultNews];
    }
    writeStore(NEWS_KEY, newsItems);
    renderAdmin();
  }

  if (target.matches("[data-reset-servers]")) {
    try {
      serverItems = await apiRequest("/api/servers/reset", { method: "POST" });
    } catch {
      serverItems = [...defaultServers];
    }
    serverItems = serverItems.map(normalizeServer);
    writeStore(SERVERS_KEY, serverItems);
    renderAdmin();
  }

  if (target.matches("[data-logout]")) {
    try {
      await apiRequest("/api/logout", { method: "POST" });
    } catch {
      // The redirect below still clears the admin UI if the request fails.
    }
    window.location.href = "login.html";
  }
});

let draggedServerId = "";

document.addEventListener("dragstart", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const dragId = target.dataset.dragServer;
  if (!dragId) return;

  draggedServerId = dragId;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", dragId);
  }
  target.closest("[data-server-row]")?.classList.add("is-dragging");
});

document.addEventListener("dragover", (event) => {
  const row = event.target instanceof HTMLElement
    ? event.target.closest("[data-server-row]")
    : null;
  if (!row || !draggedServerId) return;

  event.preventDefault();
  row.classList.add("is-drop-target");
});

document.addEventListener("dragleave", (event) => {
  const row = event.target instanceof HTMLElement
    ? event.target.closest("[data-server-row]")
    : null;
  row?.classList.remove("is-drop-target");
});

document.addEventListener("drop", (event) => {
  const row = event.target instanceof HTMLElement
    ? event.target.closest("[data-server-row]")
    : null;
  if (!row || !draggedServerId) return;

  event.preventDefault();
  row.classList.remove("is-drop-target");
  reorderServers(draggedServerId, row.dataset.serverRow);
});

document.addEventListener("dragend", () => {
  document.querySelectorAll(".is-dragging, .is-drop-target").forEach((row) => {
    row.classList.remove("is-dragging", "is-drop-target");
  });
  draggedServerId = "";
});

const initAdmin = async () => {
  if (!isAdminPage) return;

  try {
    const session = await apiRequest("/api/session");
    if (!session.authenticated) {
      window.location.href = "login.html";
      return;
    }
  } catch {
    window.location.href = "login.html";
    return;
  }

  newsItems = await apiList("/api/news", NEWS_KEY, defaultNews);
  serverItems = (await apiList("/api/servers", SERVERS_KEY, defaultServers)).map(normalizeServer);
  renderAdmin();
};

initAdmin();
