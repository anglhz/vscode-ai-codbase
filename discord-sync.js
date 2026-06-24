const fs = require("fs/promises");
const path = require("path");

const token = process.env.DISCORD_BOT_TOKEN;
const channelId = process.env.DISCORD_NEWS_CHANNEL_ID;
const intervalMs = Number(process.env.DISCORD_SYNC_INTERVAL_MS || 60000);
const dataDir = path.join(__dirname, "data");
const newsFile = path.join(dataDir, "news.json");
const stateFile = path.join(dataDir, "discord-state.json");

if (!token || !channelId) {
  console.error("Set DISCORD_BOT_TOKEN and DISCORD_NEWS_CHANNEL_ID before running discord:sync.");
  process.exit(1);
}

const readJson = async (file, fallback) => {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
};

const writeJson = async (file, value) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2));
};

const parseMessage = (message) => {
  const lines = message.content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const titleLine = lines.find((line) => /^title:/i.test(line));
  const categoryLine = lines.find((line) => /^category:/i.test(line));
  const contentLines = lines.filter((line) => !/^(title|category):/i.test(line));

  return {
    id: `discord-${message.id}`,
    title: titleLine ? titleLine.replace(/^title:\s*/i, "") : lines[0] || "Discord news",
    category: categoryLine ? categoryLine.replace(/^category:\s*/i, "") : "Discord",
    date: new Date(message.timestamp).toISOString().slice(0, 10),
    excerpt: contentLines.join(" ").slice(0, 280),
    source: "discord",
    discordMessageId: message.id,
  };
};

const fetchMessages = async (after) => {
  const url = new URL(`https://discord.com/api/v10/channels/${channelId}/messages`);
  url.searchParams.set("limit", "25");
  if (after) url.searchParams.set("after", after);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bot ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Discord API ${response.status}: ${await response.text()}`);
  }

  return response.json();
};

const syncOnce = async () => {
  const state = await readJson(stateFile, {});
  const messages = await fetchMessages(state.lastMessageId);
  if (!messages.length) return;

  const existingNews = await readJson(newsFile, []);
  const existingIds = new Set(existingNews.map((item) => item.discordMessageId).filter(Boolean));
  const incoming = messages
    .filter((message) => !message.author?.bot && message.content?.trim() && !existingIds.has(message.id))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map(parseMessage);

  if (incoming.length) {
    await writeJson(newsFile, [...incoming.reverse(), ...existingNews]);
    console.log(`Synced ${incoming.length} Discord news item(s).`);
  }

  const newest = messages.slice().sort((a, b) => BigInt(b.id) > BigInt(a.id) ? 1 : -1)[0];
  await writeJson(stateFile, { lastMessageId: newest.id });
};

syncOnce()
  .catch((error) => console.error(error))
  .finally(() => {
    setInterval(() => syncOnce().catch((error) => console.error(error)), intervalMs);
  });
