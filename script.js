const header = document.querySelector("[data-header]");
const counters = document.querySelectorAll("[data-count]");
const serverToggle = document.querySelector("[data-server-toggle]");
const serverPanel = document.querySelector("[data-server-panel]");
const typingWord = document.querySelector("[data-typing-word]");
const NEWS_KEY = "codbase_admin_news";
const SERVERS_KEY = "codbase_admin_servers";

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

const normalizeServer = (server) => {
  if (server.ip && server.port) {
    return {
      name: server.name || "Unnamed server",
      ip: server.ip,
      port: Number(server.port) || 28960,
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
  };
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

  const words = ["Matches.", "Ladders.", "Cups.", "Servers."];
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
      <article class="empty-state reveal is-visible">
        <span>News room</span>
        <h3>No news posted yet.</h3>
        <p>Fresh updates will appear here as soon as they are published.</p>
      </article>
    `;
    return;
  }

  const mediaClasses = ["medal-media", "cup-media", "server-media"];
  newsGrid.innerHTML = news
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .map((item, index) => `
      <article class="news-card reveal is-visible">
        <div class="news-media ${mediaClasses[index % mediaClasses.length]}"></div>
        <div class="news-body">
          <span>${escapeHtml(item.date || "Draft")} / ${escapeHtml(item.category || "News")}</span>
          <h3>${escapeHtml(item.title || "Untitled news")}</h3>
          <p>${escapeHtml(item.excerpt || "")}</p>
          <a href="login.html">Admin managed</a>
        </div>
      </article>
    `)
    .join("");
};

const renderManagedServers = async () => {
  const storedServers = await fetchManagedList("/api/servers", SERVERS_KEY);
  const activeRack = document.querySelector(".active-rack");
  const serverTable = document.querySelector(".server-table");
  const serverTotal = document.querySelector(".server-monitor-head strong");
  const allServersTitle = document.querySelector(".all-servers-head h3");
  const serverHeading = document.querySelector(".server-copy h2");
  const serverIntro = document.querySelector(".server-copy p:not(.eyebrow)");

  if (!activeRack || !serverTable) return;

  if (!storedServers?.length) {
    if (serverTotal) serverTotal.textContent = "0 registered";
    if (allServersTitle) allServersTitle.textContent = "0 registered game servers";
    if (serverHeading) serverHeading.textContent = "Servers with players right now.";
    if (serverIntro) {
      serverIntro.textContent =
        "Servers added in the admin panel will appear here once the live status backend is connected.";
    }

    activeRack.innerHTML = `
      <article>
        <span class="status-dot idle"></span>
        <div>
          <strong>No servers added yet</strong>
          <small>Add servers from the admin panel.</small>
        </div>
        <em>Pending</em>
      </article>
    `;
    serverTable.innerHTML = `
      <article>
        <span class="status-dot idle"></span>
        <strong>No servers added yet</strong>
        <small>Admin managed</small>
        <em>Pending</em>
        <b>Watch</b>
      </article>
    `;
    return;
  }

  const servers = storedServers.map(normalizeServer);

  if (serverTotal) serverTotal.textContent = `${servers.length} registered`;
  if (allServersTitle) allServersTitle.textContent = `${servers.length} registered game servers`;
  if (serverHeading) serverHeading.textContent = "Registered CoD servers.";
  if (serverIntro) {
    serverIntro.textContent =
      "These servers are managed from the admin panel. Live map, players, and ping will appear here once the CoD getstatus/API backend is connected.";
  }

  activeRack.innerHTML = servers
    .slice(0, 4)
    .map((server) => `
      <article>
        <span class="status-dot idle"></span>
        <div>
          <strong>${escapeHtml(server.name)}</strong>
          <small>${escapeHtml(server.ip)}:${escapeHtml(server.port)}</small>
        </div>
        <em>Pending</em>
      </article>
    `)
    .join("");

  serverTable.innerHTML = servers
    .map((server) => `
      <article>
        <span class="status-dot idle"></span>
        <strong>${escapeHtml(server.name)}</strong>
        <small>${escapeHtml(server.ip)}</small>
        <em>${escapeHtml(server.port)}</em>
        <b>Pending</b>
      </article>
    `)
    .join("");
};

renderManagedNews().then(attachCardTilt);
renderManagedServers();
startTypingWord();

window.addEventListener("storage", (event) => {
  if (event.key === NEWS_KEY) {
    renderManagedNews().then(attachCardTilt);
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

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add("is-visible");
    });
  },
  { rootMargin: "0px 0px -8% 0px", threshold: 0.18 },
);

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

document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));
counters.forEach((counter) => counterObserver.observe(counter));
