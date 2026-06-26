const header = document.querySelector("[data-header]");
const counters = document.querySelectorAll("[data-count]");
const serverToggle = document.querySelector("[data-server-toggle]");
const serverPanel = document.querySelector("[data-server-panel]");
const typingWord = document.querySelector("[data-typing-word]");
const contactForm = document.querySelector("[data-contact-form]");
const contactNote = document.querySelector("[data-contact-note]");
const videoModal = document.querySelector("[data-video-modal]");
const videoFrame = document.querySelector("[data-video-frame]");
const newsModal = document.querySelector("[data-news-modal]");
const newsModalMeta = document.querySelector("[data-news-modal-meta]");
const newsModalTitle = document.querySelector("[data-news-modal-title]");
const newsModalContent = document.querySelector("[data-news-modal-content]");
const NEWS_KEY = "codbase_admin_news";
const EVENTS_KEY = "codbase_admin_events";
const SERVERS_KEY = "codbase_admin_servers";
let managedNews = [];
let revealObserver;

const observeReveals = (scope = document) => {
  if (!revealObserver) return;

  const root = scope instanceof Element ? scope : document;
  const elements = [
    ...(root.matches?.(".reveal") ? [root] : []),
    ...root.querySelectorAll(".reveal"),
  ];

  elements.forEach((element, index) => {
    if (!element.dataset.revealReady) {
      element.style.setProperty("--reveal-delay", `${Math.min(index * 70, 280)}ms`);
      element.dataset.revealReady = "true";
    }

    revealObserver.observe(element);
  });
};

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

const readStore = (key) => {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
};

const fetchManagedList = async (endpoint, fallbackKey) => {
  try {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) throw new Error(`API responded with ${response.status}`);
    const value = await response.json();
    if (Array.isArray(value)) return value;
  } catch {
    return readStore(fallbackKey);
  }

  return readStore(fallbackKey);
};

const fetchServerStatus = async () => {
  try {
    const response = await fetch("/api/servers/status", { cache: "no-store" });
    if (!response.ok) throw new Error(`API responded with ${response.status}`);
    const value = await response.json();
    if (Array.isArray(value)) return value;
  } catch {
    return readStore(SERVERS_KEY);
  }

  return readStore(SERVERS_KEY);
};

const normalizeServer = (server) => {
  if (server.ip && server.port) {
    return {
      name: server.name || "Unnamed server",
      ip: server.ip,
      port: Number(server.port) || 28960,
      status: server.status || "pending",
      statusText: server.statusText || "Pending",
      players: Number(server.players || 0),
      maxPlayers: Number(server.maxPlayers || 0),
      map: server.map || "",
      gameType: server.gameType || "",
      type: server.type || "cod1",
      queryPort: server.queryPort ? Number(server.queryPort) : undefined,
      serverId: server.serverId ? Number(server.serverId) : undefined,
    };
  }

  const rawAddress = String(server.address || "");
  const [ip, port] = rawAddress.includes(":")
    ? rawAddress.split(":")
    : [rawAddress || "server.codbase.eu", "28960"];

  return {
    name: server.name || "Unnamed server",
    ip,
    port: Number(port) || 28960,
    status: server.status || "pending",
    statusText: server.statusText || "Pending",
    players: Number(server.players || 0),
    maxPlayers: Number(server.maxPlayers || 0),
    map: server.map || "",
    gameType: server.gameType || "",
    type: server.type || "cod1",
    queryPort: server.queryPort ? Number(server.queryPort) : undefined,
    serverId: server.serverId ? Number(server.serverId) : undefined,
  };
};

const playerCount = (server) => `${Number(server.players || 0)}/${Number(server.maxPlayers || 0) || "?"}`;
const serverMeta = (server) => server.map || `${server.ip}:${server.port}`;
const statusDotClass = (server) => {
  return server.status === "online" ? "online" : "idle";
};
const formatDate = (value) => {
  if (!value) return "No date";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
};
const localDateKey = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const eventEnd = (event) => event.endDate || event.startDate;
const isCurrentEvent = (event, today) => event.startDate <= today && eventEnd(event) >= today;
const isUpcomingEvent = (event, today) => event.startDate > today;
const isPastEvent = (event, today) => eventEnd(event) < today;
const formatEventResult = (value) => {
  const result = String(value || "Completed").trim();
  const winnerMatch = result.match(/^winner\s*:\s*(.+)$/i);

  if (winnerMatch) {
    return `
      <span class="event-result-cup" aria-hidden="true"></span>
      <span class="event-result-label">Winners</span>
      <span class="event-result-value">${escapeHtml(winnerMatch[1])}</span>
    `;
  }

  return `<span class="event-result-value">${escapeHtml(result)}</span>`;
};
const formatArticleBody = (value) =>
  String(value || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");

const closeNewsModal = () => {
  if (!newsModal) return;
  newsModal.hidden = true;
  document.body.classList.remove("modal-open");
};

const closeVideoModal = () => {
  if (!videoModal || !videoFrame) return;
  videoModal.hidden = true;
  videoFrame.innerHTML = "";
  document.body.classList.remove("modal-open");
};

const openVideoModal = () => {
  if (!videoModal || !videoFrame) return;
  videoFrame.innerHTML = `
    <iframe
      src="https://www.youtube.com/embed/NA7okAG1Qp4?autoplay=1&rel=0"
      title="CoDBase community footage"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerpolicy="origin-when-cross-origin"
      allowfullscreen
    ></iframe>
  `;
  videoModal.hidden = false;
  document.body.classList.add("modal-open");
};

const openNewsModal = (item) => {
  if (!newsModal || !newsModalMeta || !newsModalTitle || !newsModalContent) return;

  newsModalMeta.textContent = `${item.date || "Draft"} / ${item.category || "News"}`;
  newsModalTitle.textContent = item.title || "Untitled news";
  newsModalContent.innerHTML = formatArticleBody(item.body || item.excerpt || "No article text yet.");
  newsModal.hidden = false;
  document.body.classList.add("modal-open");
  newsModal.querySelector("[data-news-close]")?.focus();
};

const attachCardTilt = () => {
  document.querySelectorAll(".news-card, .intro-card").forEach((card) => {
    if (card.dataset.tiltReady === "true") return;
    card.dataset.tiltReady = "true";

    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `perspective(900px) rotateX(${y * -4}deg) rotateY(${x * 5}deg) translateY(-4px)`;
    });

    card.addEventListener("pointerleave", () => {
      card.style.transform = "";
    });
  });
};

const startTypingWord = () => {
  if (!typingWord || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const words = ["Matches.", "Ladders.", "Cups.", "LANs.", "Servers."];
  let wordIndex = 0;
  let charIndex = words[wordIndex].length;
  let deleting = true;

  const tick = () => {
    const word = words[wordIndex];
    typingWord.textContent = word.slice(0, charIndex);

    if (deleting) {
      charIndex -= 1;
      if (charIndex < 0) {
        deleting = false;
        wordIndex = (wordIndex + 1) % words.length;
        charIndex = 0;
        setTimeout(tick, 240);
        return;
      }
    } else {
      charIndex += 1;
      if (charIndex > words[wordIndex].length) {
        deleting = true;
        setTimeout(tick, 1250);
        return;
      }
    }

    setTimeout(tick, deleting ? 58 : 86);
  };

  setTimeout(tick, 1300);
};

const renderManagedNews = async () => {
  const news = await fetchManagedList("/api/news", NEWS_KEY);
  const newsGrid = document.querySelector(".news-grid");
  if (!newsGrid) return;

  if (!news?.length) {
    newsGrid.innerHTML = `
      <article class="empty-state reveal">
        <span>News room</span>
        <h3>No news posted yet.</h3>
        <p>Fresh updates will appear here as soon as they are published.</p>
      </article>
    `;
    observeReveals(newsGrid);
    return;
  }

  const mediaClasses = ["medal-media", "cup-media", "server-media"];
  managedNews = news
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  newsGrid.innerHTML = managedNews
    .map((item, index) => `
      <article class="news-card reveal">
        <div class="news-media ${mediaClasses[index % mediaClasses.length]}"></div>
        <div class="news-body">
          <span>${escapeHtml(item.date || "Draft")} / ${escapeHtml(item.category || "News")}</span>
          <h3>${escapeHtml(item.title || "Untitled news")}</h3>
          <p>${escapeHtml(item.excerpt || "")}</p>
          <button class="news-read-more" type="button" data-news-open="${escapeHtml(item.id)}">Read full article</button>
        </div>
      </article>
    `)
    .join("");
  observeReveals(newsGrid);
};

const renderManagedEvents = async () => {
  const events = await fetchManagedList("/api/events", EVENTS_KEY);
  const eventsLayout = document.querySelector(".events-layout");
  const currentPanel = document.querySelector("[data-current-event]");
  const upcomingPanel = document.querySelector("[data-upcoming-events]");
  const pastPanel = document.querySelector("[data-past-events]");
  if (!eventsLayout || !currentPanel || !upcomingPanel || !pastPanel) return;

  const today = localDateKey();
  const items = (events || []).slice();
  const current = items.filter((event) => isCurrentEvent(event, today)).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  const upcoming = items.filter((event) => isUpcomingEvent(event, today)).sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 4);
  const past = items.filter((event) => isPastEvent(event, today)).sort((a, b) => eventEnd(b).localeCompare(eventEnd(a))).slice(0, 4);

  if (current) {
    eventsLayout.classList.remove("no-current-event");
    currentPanel.hidden = false;
    currentPanel.innerHTML = `
      <div class="event-status">Current event</div>
      <div class="event-main">
        <span class="event-date">${escapeHtml(formatDate(current.startDate))}${current.endDate ? ` - ${escapeHtml(formatDate(current.endDate))}` : ""}</span>
        <h3>${escapeHtml(current.title)}</h3>
        <p>${escapeHtml(current.description || "Event details will be updated soon.")}</p>
      </div>
      <div class="event-meta-grid">
        <div><span>Teams</span><strong>${escapeHtml(current.teams || "-")}</strong></div>
        <div><span>Stage</span><strong>${escapeHtml(current.stage || current.status || "-")}</strong></div>
        <div><span>Format</span><strong>${escapeHtml(current.format || current.type || "-")}</strong></div>
      </div>
      <a class="button button-primary" href="${escapeHtml(current.link || "#news")}">View updates</a>
    `;
  } else {
    eventsLayout.classList.add("no-current-event");
    currentPanel.hidden = true;
    currentPanel.innerHTML = "";
  }

  upcomingPanel.innerHTML = upcoming.length
    ? upcoming.map((event) => `
      <article class="event-row reveal">
        <time datetime="${escapeHtml(event.startDate)}">${escapeHtml(formatDate(event.startDate))}</time>
        <div>
          <h4>${escapeHtml(event.title)}</h4>
          <p>${escapeHtml(event.description || event.type || "More details soon.")}</p>
        </div>
        <span>${escapeHtml(event.status || "Open")}</span>
      </article>
    `).join("")
    : `
      <article class="event-row reveal">
        <time>No date</time>
        <div>
          <h4>No upcoming events.</h4>
          <p>Upcoming community events will be posted here soon.</p>
        </div>
        <span>Empty</span>
      </article>
    `;

  pastPanel.innerHTML = past.length
    ? past.map((event) => `
      <article class="event-result reveal">
        <strong>${escapeHtml(event.title)}</strong>
        <span class="event-result-meta">${formatEventResult(event.result || event.status || "Completed")}</span>
      </article>
    `).join("")
    : `
      <article class="event-result reveal">
        <strong>No past events yet.</strong>
        <span>Recent results will be posted here.</span>
      </article>
    `;

  observeReveals(upcomingPanel);
  observeReveals(pastPanel);
};

const renderManagedServers = async () => {
  const storedServers = await fetchServerStatus();
  const activeRack = document.querySelector(".active-rack");
  const serverTable = document.querySelector(".server-table");
  const serverTotal = document.querySelector(".server-monitor-head strong");
  const allServersTitle = document.querySelector(".all-servers-head h3");
  const serverHeading = document.querySelector(".server-copy h2");
  const serverIntro = document.querySelector(".server-copy p:not(.eyebrow)");

  if (!activeRack || !serverTable) return;

  if (!storedServers?.length) {
    if (serverTotal) serverTotal.textContent = "0 registered";
    if (allServersTitle) allServersTitle.textContent = "0 registered servers";
    if (serverHeading) serverHeading.textContent = "Servers with players right now.";
    if (serverIntro) {
      serverIntro.textContent =
        "Community servers will appear here with live status as soon as they are listed.";
    }

    activeRack.innerHTML = `
      <article class="reveal">
        <span class="status-dot idle"></span>
        <div>
          <strong>No servers added yet</strong>
          <small>Community servers will appear here when listed.</small>
        </div>
        <em>Pending</em>
      </article>
    `;
    serverTable.innerHTML = `
      <article class="reveal">
        <span class="status-dot idle"></span>
        <strong>No servers listed yet</strong>
        <small>Community watchlist</small>
        <em>Pending</em>
        <b>Watch</b>
      </article>
    `;
    observeReveals(activeRack);
    observeReveals(serverTable);
    return;
  }

  const servers = storedServers.map(normalizeServer);
  const activeServers = servers.filter((server) => server.status === "online" && server.players > 0);
  const totalPlayers = servers.reduce((total, server) => total + Number(server.players || 0), 0);

  if (serverTotal) serverTotal.textContent = `${totalPlayers} players`;
  if (allServersTitle) allServersTitle.textContent = `${servers.length} registered servers`;
  if (serverHeading) serverHeading.textContent = "Registered community servers.";
  if (serverIntro) {
    serverIntro.textContent =
      "Active now only shows game or voice servers with people connected. Open the full watchlist to see every registered server and its latest query result.";
  }

  activeRack.innerHTML = activeServers.length
    ? activeServers
      .map((server) => `
      <article class="reveal">
        <span class="status-dot ${statusDotClass(server)}"></span>
        <div>
          <strong>${escapeHtml(server.name)}</strong>
          <small>${escapeHtml(serverMeta(server))} - ${escapeHtml(server.ip)}:${escapeHtml(server.port)}</small>
        </div>
        <em>${escapeHtml(playerCount(server))}</em>
      </article>
    `)
      .join("")
    : `
      <article class="reveal">
        <span class="status-dot idle"></span>
        <div>
          <strong>No players online right now</strong>
          <small>Registered servers are listed in the full watchlist.</small>
        </div>
        <em>0 players</em>
      </article>
    `;

  serverTable.innerHTML = servers
    .map((server) => `
      <article class="reveal ${server.players > 0 ? "has-players" : ""} ${server.type === "teamspeak3" ? "voice-server" : ""}">
        <span class="status-dot ${statusDotClass(server)}"></span>
        <strong>${escapeHtml(server.name)}</strong>
        <small>${escapeHtml(server.ip)}:${escapeHtml(server.port)}</small>
        <em>${escapeHtml(playerCount(server))}</em>
        <b>${server.status === "online" ? "Online" : escapeHtml(server.statusText)}</b>
      </article>
    `)
    .join("");
  observeReveals(activeRack);
  observeReveals(serverTable);
};

window.addEventListener("storage", (event) => {
  if (event.key === NEWS_KEY) {
    renderManagedNews().then(attachCardTilt);
  }

  if (event.key === EVENTS_KEY) {
    renderManagedEvents();
  }

  if (event.key === SERVERS_KEY) {
    renderManagedServers();
  }
});

const counterObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;

      const target = Number(entry.target.dataset.count);
      const duration = 1100;
      const start = performance.now();

      const tick = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        entry.target.textContent = Math.round(target * eased).toLocaleString();

        if (progress < 1) requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
      counterObserver.unobserve(entry.target);
    });
  },
  { threshold: 0.6 },
);

revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add("is-visible");
    });
  },
  { rootMargin: "0px 0px -8% 0px", threshold: 0.18 },
);

renderManagedNews().then(attachCardTilt);
renderManagedEvents();
renderManagedServers();
setInterval(renderManagedServers, 30000);
startTypingWord();
observeReveals();
attachCardTilt();

window.addEventListener("scroll", () => {
  header.classList.toggle("is-scrolled", window.scrollY > 24);
});

serverToggle?.addEventListener("click", () => {
  const isOpen = serverToggle.getAttribute("aria-expanded") === "true";

  serverToggle.setAttribute("aria-expanded", String(!isOpen));
  serverToggle.textContent = isOpen ? "Watch all servers" : "Hide full watchlist";

  if (isOpen) {
    serverPanel.hidden = true;
    serverPanel.classList.remove("is-open");
    return;
  }

  serverPanel.hidden = false;
  requestAnimationFrame(() => {
    serverPanel.classList.add("is-open", "is-visible");
  });
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const newsId = target.dataset.newsOpen;
  if (newsId) {
    const item = managedNews.find((news) => news.id === newsId);
    if (item) openNewsModal(item);
  }

  if (target.matches("[data-news-close]")) closeNewsModal();
  if (target.matches("[data-video-open]")) openVideoModal();
  if (target.matches("[data-video-close]")) closeVideoModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeNewsModal();
    closeVideoModal();
  }
});

contactForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(contactForm);
  const name = String(data.get("name") || "").trim();
  const email = String(data.get("email") || "").trim();
  const subject = String(data.get("subject") || "CoDBase contact").trim();
  const message = String(data.get("message") || "").trim();

  if (contactNote) contactNote.textContent = "Sending message...";

  try {
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, subject, message }),
    });

    if (!response.ok) throw new Error("Contact request failed");
    contactForm.reset();
    if (contactNote) contactNote.textContent = "Message sent. We will get back to you soon.";
  } catch {
    if (contactNote) {
      contactNote.textContent =
        "Could not send right now. Please email codbaseofficial@gmail.com or join Discord.";
    }
  }
});

counters.forEach((counter) => counterObserver.observe(counter));
