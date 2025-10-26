const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const SlowDown = require("express-slow-down");
const NodeCache = require("node-cache");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
require("dotenv").config();

const {
  save_status_log,
  supabase,
  get_service_uptime,
  get_service_incidents,
  get_uptime_summary,
  get_all_service_statistics,
} = require("./supabase");

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(helmet());
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const CACHE_TTL = parseInt(process.env.CACHE_TTL || "21600", 10);
const DISCORD_TOKENS = (process.env.DISCORD_TOKENS || process.env.DISCORD_BOT_TOKEN || "")
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean);

if (!DISCORD_TOKENS.length) throw new Error("Missing DISCORD_TOKENS or DISCORD_BOT_TOKEN in .env");
if (!GITHUB_TOKEN) throw new Error("Missing GITHUB_TOKEN in .env");

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "Too many requests, please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

const slowdown = SlowDown({
  windowMs: 60 * 1000,
  delayAfter: 30,
  delayMs: 500,
});

app.use(limiter);
app.use(slowdown);

const cache = new NodeCache({ stdTTL: CACHE_TTL });

// --- Discord 
let tokenIndex = 0;
function getNextToken() {
  const token = DISCORD_TOKENS[tokenIndex];
  tokenIndex = (tokenIndex + 1) % DISCORD_TOKENS.length;
  return token;
}

let globalDiscordCount = 0;
const MAX_DISCORD_RPS = 10;
setInterval(() => (globalDiscordCount = 0), 1000);

async function fetch_discord(url) {
  const cached = cache.get(url);
  if (cached) return cached;

  if (globalDiscordCount >= MAX_DISCORD_RPS) await new Promise((r) => setTimeout(r, 1000));
  globalDiscordCount++;

  const token = getNextToken();
  const res = await fetch(url, {
    headers: { Authorization: `Bot ${token}` },
  });

  // other dev kept messing with this so i just wrote it myself - fernishb
  if (res.status === 429) {
    const data = await res.json().catch(() => ({}));
    const retry_after = (data.retry_after || 1) * 1000;
    console.warn(`discord ratelimit hit. Retrying in ${retry_after}ms`);
    await new Promise((r) => setTimeout(r, retry_after));
    return fetch_discord(url);
  }

  if (!res.ok) throw new Error(`Discord API error: ${res.status}`);

  const json = await res.json();
  cache.set(url, json);
  return json;
}

// --- User 
const validUserId = (id) => /^\d{17,20}$/.test(id);

async function get_user_data(userId) {
  if (!validUserId(userId)) throw new Error("Invalid user ID");
  return fetch_discord(`https://discord.com/api/v10/users/${userId}`);
}

async function get_avatar(userId, options = {}) {
  const { size = 512, format = null } = options;
  const user = await get_user_data(userId);

  // avatar
  let avatar_url;
  if (user.avatar) {
    let ext = user.avatar.startsWith("a_") ? "gif" : "png";
    if (format) ext = format;
    avatar_url = `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.${ext}?size=${size}`;
  } else {
    const index = user.discriminator ? parseInt(user.discriminator) % 5 : 0;
    avatar_url = `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  }

  // banner
  let banner_url = null;
  if (user.banner) {
    let ext = user.banner.startsWith("a_") ? "gif" : "png";
    banner_url = `https://cdn.discordapp.com/banners/${userId}/${user.banner}.${ext}?size=${size}`;
  }

  return {
    id: user.id,
    username: user.username,
    display_name: user.global_name || user.username,
    avatarUrl: avatar_url,
    bannerUrl: banner_url,
    discriminator: user.discriminator,
  };
}

async function get_banner(userId, options = {}) {
  const { size = 512, format = null } = options;
  const user = await get_user_data(userId);

  if (!user.banner) throw new Error("User has no banner");
  let ext = user.banner.startsWith("a_") ? "gif" : "png";

  if (format) ext = format;
  const url = `https://cdn.discordapp.com/banners/${userId}/${user.banner}.${ext}?size=${size}`;

  return { id: user.id, bannerUrl: url };
}

function sanitizeSize(size) {
  const allowed = [16,32,64,128,256,512,1024,2048,4096];
  return allowed.includes(size) ? size : 512;
}

// GitHub Function
async function get_github_user(username) {
  return fetch_cached(`github_${username}`, async () => {
    const res = await fetch(`https://api.github.com/users/${username}`, {
      headers: {
        "User-Agent": "Node.js Server",
        Authorization: `token ${GITHUB_TOKEN}`,
      },
    });
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    return res.json();
  });
}

// routes
app.get("/api", (req, res) => {
  res.set("Cache-Control", "s-maxage=3600, stale-while-revalidate=60");
  res.json({
    notice: "⚠️ We are receiving a HUGE number of requests from many users. The API will remain online, but requests may be slow right now.",
    endpoints: [
      { url: "/api/version", description: "Get API version info" },
      
      { url: "/api/:userId", description: "Get avatar JSON info (JSON)" },
      { url: "/api/user/:userId/raw", description: "Get raw Discord user data (JSON)" },
      { url: "/api/pfp/:userId/image", description: "Redirect to avatar (512px)" },
      { url: "/api/pfp/:userId/smallimage", description: "Redirect to avatar (128px)" },
      { url: "/api/pfp/:userId/bigimage", description: "Redirect to avatar (1024px)" },
      { url: "/api/pfp/:userId/superbigimage", description: "Redirect to avatar (4096px)" },
      { url: "/api/pfp/:userId/:size", description: "Redirect to avatar with custom size (64–4096)" },
      { url: "/api/banner/:userId", description: "Get banner URL JSON for a user (JSON)" },
      { url: "/api/banner/:userId/image", description: "Redirect to banner image" },

      { url: "/api/github/:username", description: "Get GitHub user JSON info" },
      { url: "/api/github/:username/pfp", description: "Redirect to GitHub avatar image" },
      { url: "/api/github/:username/repos", description: "Get GitHub repositories for user" },
      { url: "/api/github/:username/gists", description: "Get GitHub gists for user" },

      { url: "/api/status", description: "Get overall API status and uptime (W.I.P)" },
      { url: "/api/status/services", description: "Get per-service status and uptime" }
    ],
  });
});


app.get("/api/version", (req, res) => {
  res.set("Cache-Control", "s-maxage=3600, stale-while-revalidate=60");
  res.json({
    version: "3.0.0",
    name: "Avatarcyan API",
    environment: process.env.NODE_ENV || "production",
    lastBuild: new Date().toISOString()
  });
});

// status endpoint
const avatarcyan_cache = new NodeCache({ stdTTL: 300, checkperiod: 120 });
let discord_token_index = 0;
const discord_tokens = process.env.DISCORD_TOKENS?.split(",").map(t => t.trim()).filter(Boolean) || [];

async function check_discord_api(token) {
  const start = Date.now();
  try {
    const res = await fetch("https://discord.com/api/v10/gateway", {
      headers: { Authorization: `Bot ${token}` },
      timeout: 5000,
    });
    const time = Date.now() - start;

    if (!res.ok) {
      return {
        status: "down",
        responseTime: time,
        message: `Discord API error: ${res.status} ${res.statusText}`,
      };
    }

    const data = await res.json();
    if (!data.url) {
      return {
        status: "degraded",
        responseTime: time,
        message: "Discord API responding but missing gateway URL",
      };
    }

    return {
      status: time > 2000 ? "degraded" : "operational",
      responseTime: time,
      message: time > 2000 ? "Discord API slow response" : "Discord API operational",
    };
  } catch (e) {
    const time = Date.now() - start;
    return { 
      status: "down", 
      responseTime: time, 
      message: `Discord API connection failed: ${e.message}` 
    };
  }
}

async function check_github_api() {
  const start = Date.now();
  try {
    const res = await fetch("https://api.github.com/users/octocat", {
      headers: {
        "User-Agent": "Node.js Server",
        Authorization: `token ${GITHUB_TOKEN}`,
      },
      timeout: 5000,
    });
    const time = Date.now() - start;
    return {
      status: res.ok ? (time > 2000 ? "degraded" : "operational") : "down",
      responseTime: time,
      message: res.ok ? "GitHub OK" : "GitHub error",
    };
  } catch (e) {
    return { status: "down", responseTime: Date.now() - start, message: e.message };
  }
}

async function check_image_processing() {
  const start = Date.now();
  try {
    const test_user_id = "773952016036790272";
    const res = await fetch(`https://avatar-cyan.vercel.app/api/pfp/${test_user_id}/smallimage`, {
      timeout: 8000,
      method: "HEAD",
    });
    const time = Date.now() - start;

    if (!res.ok) {
      return {
        status: "down",
        responseTime: time,
        message: `Image processing failed: ${res.status} ${res.statusText}`,
      };
    }

    const content_type = res.headers.get("content-type");
    if (!content_type || !content_type.startsWith("image/")) {
      return {
        status: "degraded",
        responseTime: time,
        message: `Image processing returned non-image content: ${content_type}`,
      };
    }

    return {
      status: time > 4000 ? "degraded" : "operational",
      responseTime: time,
      message: time > 4000 ? "Image processing slow" : "Image processing operational",
    };
  } catch (e) {
    const time = Date.now() - start;
    return { 
      status: "down", 
      responseTime: time, 
      message: `Image processing system error: ${e.message}` 
    };
  }
}

function check_cache_system() {
  const start = Date.now();
  try {
    const key = `test_${Date.now()}`;
    avatarcyan_cache.set(key, true, 5);
    const val = avatarcyan_cache.get(key);
    avatarcyan_cache.del(key);
    const time = Date.now() - start;
    return {
      status: val ? "operational" : "degraded",
      responseTime: time,
      message: val ? "Cache OK" : "Cache failed",
    };
  } catch (e) {
    return { status: "down", responseTime: Date.now() - start, message: e.message };
  }
}

app.get("/api/status", async (req, res) => {
  res.set("Cache-Control", "s-maxage=3600, stale-while-revalidate=60");
  try {
    if (discord_tokens.length === 0) throw new Error("No Discord tokens configured");

    const token = discord_tokens[discord_token_index];
    discord_token_index = (discord_token_index + 1) % discord_tokens.length;

    const [
      discord_status,
      github_status,
      image_status,
      cache_status,
      all_service_stats
    ] = await Promise.all([
      check_discord_api(token),
      check_github_api(),
      check_image_processing(),
      check_cache_system(),
      get_all_service_statistics(7)
    ]);

    const stats_map = {};
    all_service_stats.forEach(stat => {
      stats_map[stat.service_name] = stat;
    });

    Promise.all([
      save_status_log("Discord API Gateway", discord_status.status, discord_status.responseTime, discord_status.message),
      save_status_log("GitHub API Gateway", github_status.status, github_status.responseTime, github_status.message),
      save_status_log("Image Processing Engine", image_status.status, image_status.responseTime, image_status.message),
      save_status_log("Cache & Rate Limiting", cache_status.status, cache_status.responseTime, cache_status.message)
    ]).catch(err => console.error("Failed to save status logs:", err));

    const services = [discord_status, github_status, image_status, cache_status];
    const statusPriority = { down: 3, degraded: 2, operational: 1 };
    const overallStatus = services.reduce((worst, curr) => {
      return statusPriority[curr.status] > statusPriority[worst] ? curr.status : worst;
    }, "operational");

    const service_names = [
      "Discord API Gateway",
      "GitHub API Gateway",
      "Image Processing Engine",
      "Cache & Rate Limiting"
    ];
    const uptimes = service_names.map(name => {
      const stat = stats_map[name];
      return stat ? Number(stat.uptime_percentage) : 99.0;
    });
    const overall_uptime = Number(
      (uptimes.reduce((sum, uptime) => sum + uptime, 0) / uptimes.length).toFixed(1)
    );

    const avg_response_time = Math.round(
      services.reduce((sum, s) => sum + s.responseTime, 0) / services.length
    );
    const operational_count = services.filter(s => s.status === "operational").length;
    const total_incidents = all_service_stats.reduce((sum, stat) => sum + (stat.incident_count || 0), 0);
    const historical_avg_response_time =
      all_service_stats.length > 0
        ? Math.round(all_service_stats.reduce((sum, stat) => sum + (stat.avg_response_time || 0), 0) / all_service_stats.length)
        : avg_response_time;

    res.json({
      status: overallStatus,
      uptime: overall_uptime,
      responseTime: avg_response_time,
      lastChecked: new Date().toISOString(),
      region: "Global",
      version: "1.1.0",
      services: {
        total: services.length,
        operational: operational_count,
        degraded: services.filter(s => s.status === "degraded").length,
        down: services.filter(s => s.status === "down").length
      },
      performance: {
        cache_hit_rate: Math.round(stats_map["Cache & Rate Limiting"]?.uptime_percentage || 99.0),
        total_incidents_7d: total_incidents,
        average_response_time_7d: historical_avg_response_time
      }
    });
  } catch (err) {
    console.error("Status check failed:", err);
    res.status(500).json({ status: "down", error: "Status check system failure" });
  }
});

app.get("/api/status/services", async (req, res) => {
  res.set("Cache-Control", "s-maxage=3600, stale-while-revalidate=60");
  try {
    if (discord_tokens.length === 0) throw new Error("No Discord tokens configured");

    const discord_checks = await Promise.all(
      discord_tokens.map((token, idx) => check_discord_api(token).then(result => ({
        name: `Discord API Gateway #${idx + 1}`,
        ...result
      })))
    );

    const [github_status, image_status, cache_status, uptime_summary] = await Promise.all([
      check_github_api(),
      check_image_processing(),
      check_cache_system(),
      get_uptime_summary()
    ]);

    const uptime_map = {};
    uptime_summary.forEach(summary => {
      uptime_map[summary.service_name] = summary;
    });

    const get_uptime_for_service = (service_name) => {
      const summary = uptime_map[service_name];
      return summary ? Number(summary.uptime_24h) : 99.0;
    };

    const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;

    const discord_combined = {
      name: "Discord API Gateway",
      status: discord_checks.every(dc => dc.status === "operational") ? "operational" : "partial_outage",
      responseTime: Math.round(avg(discord_checks.map(dc => dc.responseTime || 0))),
      uptime: get_uptime_for_service("Discord API Gateway"),
      lastChecked: new Date().toISOString(),
      message: `${discord_checks.filter(dc => dc.status === "operational").length}/${discord_checks.length} bots responding normally.`
    };

    const services = [
      discord_combined,
      {
        name: "GitHub API Gateway",
        ...github_status,
        uptime: get_uptime_for_service("GitHub API Gateway"),
        lastChecked: new Date().toISOString(),
      },
      {
        name: "Image Processing Engine",
        ...image_status,
        uptime: get_uptime_for_service("Image Processing Engine"),
        lastChecked: new Date().toISOString(),
      },
      {
        name: "Cache & Rate Limiting",
        ...cache_status,
        uptime: get_uptime_for_service("Cache & Rate Limiting"),
        lastChecked: new Date().toISOString(),
      }
    ];

    res.json({ services });

  } catch (error) {
    console.error("Error in /api/status/services:", error);
    res.status(500).json({ error: "Service status check failed." });
  }
});


// Discord Routes
app.get("/api/:userId", async (req, res) => {
  res.set("Cache-Control", "s-maxage=3600, stale-while-revalidate=60");
  const { userId } = req.params;
  if (!validUserId(userId)) return res.status(400).json({ error: "Invalid user ID" });
  try {
    const data = await get_avatar(userId);
    res.json({ profileUrl: `https://discord.com/users/${userId}`, ...data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not fetch avatar" });
  }
});

const imageSizes = {
  image: 512,
  smallimage: 128,
  bigimage: 1024,
  superbigimage: 4096,
};

Object.entries(imageSizes).forEach(([endpoint, defaultSize]) => {
  app.get(`/api/pfp/:userId/${endpoint}`, async (req, res) => {
    const { userId } = req.params;
    const { format } = req.query;

    if (!validUserId(userId)) return res.status(400).json({ error: "Invalid user ID" });

    try {
      const data = await get_avatar(userId, { size: defaultSize, format });
      const imageRes = await fetch(data.avatarUrl);
      const contentType = imageRes.headers.get("content-type");

      res.set("Content-Type", contentType);
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Cross-Origin-Resource-Policy", "cross-origin");
      imageRes.body.pipe(res);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Could not fetch avatar" });
    }
  });
});

app.get("/api/pfp/:userId/:size", async (req, res) => {
  res.set("Cache-Control", "public, max-age=86400, s-maxage=604800");
  const { userId, size } = req.params;
  const { format } = req.query;

  if (!validUserId(userId)) return res.status(400).json({ error: "Invalid user ID" });
  const numericSize = sanitizeSize(parseInt(size, 10));

  try {
    const data = await get_avatar(userId, { size: numericSize, format });
    const imageRes = await fetch(data.avatarUrl);
    res.set("Content-Type", imageRes.headers.get("content-type"));
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cross-Origin-Resource-Policy", "cross-origin");
    imageRes.body.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not fetch avatar" });
  }
});

app.get("/api/user/:userId/raw", async (req, res) => {
  res.set("Cache-Control", "s-maxage=3600, stale-while-revalidate=60");
  const { userId } = req.params;
  if (!validUserId(userId)) return res.status(400).json({ error: "Invalid user ID" });

  try {
    const user = await get_user_data(userId);
    const avatarExt = user.avatar?.startsWith("a_") ? "gif" : "png";
    const avatarUrl = user.avatar
      ? `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.${avatarExt}?size=512`
      : `https://cdn.discordapp.com/embed/avatars/${user.discriminator ? parseInt(user.discriminator) % 5 : 0}.png`;

    const bannerExt = user.banner?.startsWith("a_") ? "gif" : "png";
    const bannerUrl = user.banner
      ? `https://cdn.discordapp.com/banners/${userId}/${user.banner}.${bannerExt}?size=512`
      : null;

    res.json({
      profileUrl: `https://discord.com/users/${userId}`,
      id: user.id,
      username: user.username,
      display_name: user.global_name || user.username,
      avatar: user.avatar,
      avatarUrl,
      discriminator: user.discriminator,
      public_flags: user.public_flags,
      flags: user.flags,
      accent_color: user.accent_color,
      banner: user.banner,
      banner_color: user.banner_color,
      bannerUrl,
      avatar_decoration_data: user.avatar_decoration_data,
      collectibles: user.collectibles,
      clan: user.clan,
      primary_guild: user.primary_guild,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not fetch user data" });
  }
});

app.get("/api/banner/:userId", async (req, res) => {
  res.set("Cache-Control", "s-maxage=3600, stale-while-revalidate=60");
  const { userId } = req.params;
  const size = req.query.size || 512;
  if (!validUserId(userId)) return res.status(400).json({ error: "Invalid user ID" });

  try {
    const data = await get_banner(userId, size);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(404).json({ error: "Banner not available" });
  }
});

app.get("/api/banner/:userId/image", async (req, res) => {
  res.set("Cache-Control", "public, max-age=86400, s-maxage=604800");
  const { userId } = req.params;
  const size = req.query.size || 512;
  if (!validUserId(userId)) return res.status(400).json({ error: "Invalid user ID" });

  try {
    const data = await get_banner(userId, size);
    const imageRes = await fetch(data.bannerUrl);
    const contentType = imageRes.headers.get("content-type");
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cross-Origin-Resource-Policy", "cross-origin");
    res.set("Content-Type", contentType);
    imageRes.body.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(404).json({ error: "Banner not available" });
  }
});

// GitHub Routes
app.get("/api/github/:username", async (req, res) => {
  res.set("Cache-Control", "s-maxage=3600, stale-while-revalidate=60");
  const { username } = req.params;
  try {
    const user = await get_github_user(username);
    res.json({
      id: user.id,
      username: user.login,
      display_name: user.name || user.login,
      avatarUrl: user.avatar_url,
      profileUrl: user.html_url,
      bio: user.bio,
      public_repos: user.public_repos,
      followers: user.followers,
      following: user.following,
      location: user.location,
      company: user.company,
      blog: user.blog
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not fetch GitHub user data" });
  }
});

app.get("/api/github/:username/repos", async (req, res) => {
  const { username } = req.params;
  try {
    const data = await fetch_cached(`github_${username}_repos`, async () => {
      const r = await fetch(`https://api.github.com/users/${username}/repos`, {
        headers: { Authorization: `token ${GITHUB_TOKEN}`, "User-Agent": "Node.js Server" },
      });
      if (!r.ok) throw new Error(`GitHub API error: ${r.status}`);
      return r.json();
    });
    res.json(data.map(repo => ({
      name: repo.name,
      description: repo.description,
      url: repo.html_url,
      forks: repo.forks_count,
      stars: repo.stargazers_count,
      language: repo.language,
      updated_at: repo.updated_at
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not fetch repositories" });
  }
});

app.get("/api/github/:username/gists", async (req, res) => {
  res.set("Cache-Control", "s-maxage=3600, stale-while-revalidate=60");
  const { username } = req.params;
  try {
    const data = await fetch_cached(`github_${username}_gists`, async () => {
      const r = await fetch(`https://api.github.com/users/${username}/gists`, {
        headers: { Authorization: `token ${GITHUB_TOKEN}`, "User-Agent": "Node.js Server" },
      });
      if (!r.ok) throw new Error(`GitHub API error: ${r.status}`);
      return r.json();
    });
    res.json(data.map(gist => ({
      id: gist.id,
      description: gist.description,
      url: gist.html_url,
      files: Object.keys(gist.files),
      created_at: gist.created_at,
      updated_at: gist.updated_at
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not fetch gists" });
  }
});

app.get("/api/github/:username/pfp", async (req, res) => {
  res.set("Cache-Control", "public, max-age=86400, s-maxage=604800");
  const { username } = req.params;
  try {
    const user = await get_github_user(username);
    const imageRes = await fetch(user.avatar_url);
    const contentType = imageRes.headers.get("content-type");
    res.set("Content-Type", contentType);
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cross-Origin-Resource-Policy", "cross-origin");
    imageRes.body.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not fetch GitHub avatar" });
  }
});

module.exports = app;
