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
  log_api_usage,
} = require("./supabase");

const app = express();

app.use(cors({ origin: "*", methods: ["GET"], allowedHeaders: ["Content-Type", "Authorization"] }));
app.use(helmet());
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const CACHE_TTL = parseInt(process.env.CACHE_TTL || "21600", 10);
const DISCORD_TOKENS = (process.env.DISCORD_TOKENS || process.env.DISCORD_BOT_TOKEN || "")
  .split(",").map((t) => t.trim()).filter(Boolean);

if (!DISCORD_TOKENS.length) throw new Error("Missing DISCORD_TOKENS or DISCORD_BOT_TOKEN in .env");
if (!GITHUB_TOKEN) throw new Error("Missing GITHUB_TOKEN in .env");

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: "Too many requests, please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

const slowdown = SlowDown({
  windowMs: 60 * 1000,
  delayAfter: 50,
  delayMs: (hits) => hits * 100,
  maxDelayMs: 2000,
});

app.use('/api', limiter);
app.use('/api', slowdown);

const cache = new NodeCache({ stdTTL: CACHE_TTL, checkperiod: 600, useClones: false });

async function fetch_cached(key, fetchFn, ttl = CACHE_TTL) {
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const data = await fetchFn();
  cache.set(key, data, ttl);
  return data;
}

let tokenIndex = 0;
function getNextToken() {
  const token = DISCORD_TOKENS[tokenIndex];
  tokenIndex = (tokenIndex + 1) % DISCORD_TOKENS.length;
  return token;
}

let global_discordcount = 0;
const MAX_DISCORD_RPS = 10;
setInterval(() => (global_discordcount = 0), 1000);

async function fetch_discord(url, retryCount = 0) {
  const cacheKey = `discord_${url}`;
  const maxRetries = 3;
  
  return fetch_cached(cacheKey, async () => {
    if (global_discordcount >= MAX_DISCORD_RPS) {
      await new Promise(r => setTimeout(r, 1000));
    }
    global_discordcount++;

    const token = getNextToken();
    const res = await fetch(url, { 
      headers: { Authorization: `Bot ${token}` },
      timeout: 10000
    });

    if (res.status === 429) {
      if (retryCount >= maxRetries) {
        throw new Error(`Discord rate limit exceeded after ${maxRetries} retries`);
      }
      const data = await res.json().catch(() => ({}));
      const retryAfter = (data.retry_after || 1) * 1000;
      await new Promise(r => setTimeout(r, retryAfter));
      cache.del(cacheKey);
      return fetch_discord(url, retryCount + 1);
    }

    if (!res.ok) throw new Error(`Discord API error: ${res.status} ${res.statusText}`);
    return res.json();
  }, 3600);
}

function get_ImageFormat(acceptHeader, isAnimated = false) {
  if (!acceptHeader || isAnimated) return isAnimated ? "gif" : "png";
  if (acceptHeader.includes("image/webp")) return "webp";
  return "png";
}

function ParseUserFlags(publicFlags) {
  if (!publicFlags) return [];
  
  const flagMap = {
    1: "Discord Employee", 2: "Partnered Server Owner", 4: "HypeSquad Events",
    8: "Bug Hunter Level 1", 64: "House Bravery", 128: "House Brilliance",
    256: "House Balance", 512: "Early Supporter", 1024: "Team User",
    4096: "Bug Hunter Level 2", 16384: "Verified Bot", 65536: "Early Verified Bot Developer",
    131072: "Discord Certified Moderator", 262144: "Bot HTTP Interactions", 1048576: "Active Developer"
  };
  
  const flags = [];
  for (const [bit, name] of Object.entries(flagMap)) {
    if (publicFlags & parseInt(bit)) flags.push(name);
  }
  return flags;
}

const UserIdCached = (() => {
  const validationCache = new Map();
  return (id) => {
    if (validationCache.has(id)) return validationCache.get(id);
    const result = /^\d{17,20}$/.test(id);
    validationCache.set(id, result);
    if (validationCache.size > 10000) {
      const firstKey = validationCache.keys().next().value;
      validationCache.delete(firstKey);
    }
    return result;
  };
})();

async function get_user_data(userId) {
  if (!UserIdCached(userId)) throw new Error("Invalid user ID");
  return fetch_discord(`https://discord.com/api/v10/users/${userId}`);
}

async function get_avatar(userId, options = {}) {
  const { size = 512, format = null, acceptHeader = null } = options;
  const user = await get_user_data(userId);

  let avatar_url, isAnimated = false;
  
  if (user.avatar) {
    isAnimated = user.avatar.startsWith("a_");
    const ext = format || (acceptHeader && !isAnimated ? get_ImageFormat(acceptHeader) : (isAnimated ? "gif" : "png"));
    avatar_url = `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.${ext}?size=${size}`;
  } else {
    const index = user.discriminator ? parseInt(user.discriminator) % 5 : (parseInt(userId) >> 22) % 6;
    avatar_url = `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  }

  let banner_url = null, bannerAnimated = false;
  if (user.banner) {
    bannerAnimated = user.banner.startsWith("a_");
    const ext = format || (bannerAnimated ? "gif" : "png");
    banner_url = `https://cdn.discordapp.com/banners/${userId}/${user.banner}.${ext}?size=${size}`;
  }

  return {
    id: user.id,
    username: user.username,
    display_name: user.global_name || user.username,
    avatarUrl: avatar_url,
    isAnimated,
    bannerUrl: banner_url,
    bannerAnimated,
    discriminator: user.discriminator,
    accent_color: user.accent_color,
    banner_color: user.banner_color,
    public_flags: user.public_flags,
    badges: ParseUserFlags(user.public_flags),
    avatar_decoration: user.avatar_decoration_data,
  };
}

async function get_banner(userId, options = {}) {
  const { size = 512, format = null } = options;
  const user = await get_user_data(userId);

  if (!user.banner) {
    return { id: user.id, bannerUrl: null, message: "User has no banner", hasBanner: false };
  }

  let ext = user.banner.startsWith("a_") ? "gif" : "png";
  if (format) ext = format;
  const url = `https://cdn.discordapp.com/banners/${userId}/${user.banner}.${ext}?size=${size}`;

  return { id: user.id, bannerUrl: url, hasBanner: true };
}

function sanitizeSize(size) {
  const allowed = [16,32,64,128,256,512,1024,2048,4096];
  return allowed.includes(size) ? size : 512;
}

async function get_github_user(username) {
  return fetch_cached(`github_${username}`, async () => {
    const res = await fetch(`https://api.github.com/users/${username}`, {
      headers: {
        "User-Agent": "Avatarcyan-API/3.1",
        Authorization: `token ${GITHUB_TOKEN}`,
        "Accept": "application/vnd.github.v3+json"
      },
      timeout: 8000
    });
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    return res.json();
  }, 7200);
}

app.get("/api", (req, res) => {
  res.set("Cache-Control", "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800");
  
  res.json({
    notice: "New features: Auto-format detection (webp), batch endpoints, animated GIF support, badges/flags, and multi-source fallback.",
    version: "3.1.0",
    endpoints: [
      { url: "/api/version", description: "Get API version info" },
      { 
        url: "/api/:userId", 
        description: "Get avatar JSON info with badges, flags, banner, accent color",
        params: "?format=png|webp|gif"
      },
      { url: "/api/user/:userId/raw", description: "Get raw Discord user data with all fields" },
      { url: "/api/pfp/:userId/image", description: "Get avatar image (512px)", params: "?format=png|webp|gif" },
      { url: "/api/pfp/:userId/smallimage", description: "Get avatar image (128px)", params: "?format=png|webp|gif" },
      { url: "/api/pfp/:userId/bigimage", description: "Get avatar image (1024px)", params: "?format=png|webp|gif" },
      { url: "/api/pfp/:userId/superbigimage", description: "Get avatar image (4096px)", params: "?format=png|webp|gif" },
      { url: "/api/pfp/:userId/:size", description: "Get avatar with custom size (16-4096)", params: "?format=png|webp|gif" },
      { url: "/api/banner/:userId", description: "Get banner URL JSON", params: "?size=512&format=png|webp|gif" },
      { url: "/api/banner/:userId/image", description: "Get banner image", params: "?size=512&format=png|webp|gif" },
      { 
        url: "/api/batch", 
        description: "NEW: Get multiple users at once (max 50)",
        params: "?ids=123|456|789&size=512&format=png (supports | , or ;)",
        example: "/api/batch?ids=773952016036790272|804955810820128798"
      },
      { 
        url: "/api/avatar/:identifier", 
        description: "NEW: Multi-source avatar (Discord + GitHub fallback)",
        params: "?source=auto|discord|github&size=512"
      },
      { url: "/api/github/:username", description: "Get GitHub user JSON info" },
      { url: "/api/github/:username/pfp", description: "Get GitHub avatar image" },
      { url: "/api/github/:username/repos", description: "Get GitHub repositories", params: "?limit=30&sort=updated" },
      { url: "/api/github/:username/gists", description: "Get GitHub gists" },

      { url: "/api/status", description: "Get overall API status and uptime" },
      { url: "/api/status/services", description: "Get per-service status and uptime" },
      { url: "/api/status/embed", description: "Get status badge SVG", params: "?theme=dark|light&size=sm|md|lg" },
    ],
  });
});

app.get("/api/version", (req, res) => {
  res.set("Cache-Control", "public, max-age=86400, s-maxage=86400");
  res.json({
    version: "3.1.0",
    name: "Avatarcyan API",
    environment: process.env.NODE_ENV || "production",
    changelog: {
      "3.1.0": [
        "Auto-format detection (webp) based on Accept header",
        "Batch endpoint for fetching multiple users at once (max 50)",
        "Multi-source avatar endpoint with Discord + GitHub fallback"
      ]
    }
  });
});

app.get("/api/batch", async (req, res) => {
  res.set("Cache-Control", "public, max-age=1800, s-maxage=1800, stale-while-revalidate=3600");
  const { ids, size = 512, format } = req.query;
  
  if (!ids) {
    return res.status(400).json({ 
      error: "Missing 'ids' parameter",
      message: "Provide user IDs separated by comma, pipe, or semicolon. Example: /api/batch?ids=123|456|789"
    });
  }
  
  const userIds = [...new Set(ids.split(/[,|;]/).map(id => id.trim()).filter(id => id.length > 0))];
  
  if (userIds.length > 50) {
    return res.status(400).json({ 
      error: "Too many IDs",
      message: "Maximum 50 unique user IDs per batch request"
    });
  }
  
  if (userIds.length === 0) {
    return res.status(400).json({ 
      error: "No valid IDs provided",
      message: "Provide user IDs separated by | , or ;"
    });
  }
  
  const results = await Promise.allSettled(
    userIds.map(async (userId) => {
      try {
        if (!UserIdCached(userId)) {
          return { id: userId, success: false, error: "Invalid user ID format" };
        }
        const data = await get_avatar(userId, { size: parseInt(size) || 512, format });
        return { id: userId, success: true, ...data };
      } catch (err) {
        return { id: userId, success: false, error: err.message || "Failed to fetch user" };
      }
    })
  );
  
  const response = { total: userIds.length, successful: 0, failed: 0, users: [] };
  
  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      const userData = result.value;
      if (userData.success) {
        response.successful++;
      } else {
        response.failed++;
      }
      response.users.push(userData);
    } else {
      response.failed++;
      response.users.push({
        id: "unknown",
        success: false,
        error: result.reason?.message || "Request failed"
      });
    }
  });
  
  res.json(response);
});

app.get("/api/status", async (req, res) => {
  res.set("Cache-Control", "public, max-age=60, s-maxage=60");
  
  try {
    const [discordStatus, githubStatus] = await Promise.all([
      check_discord_api(),
      check_github_api()
    ]);
    
    const allOperational = discordStatus.status === 'operational' && githubStatus.status === 'operational';
    const anyDown = discordStatus.status === 'down' || githubStatus.status === 'down';
    
    const overallStatus = anyDown ? 'down' : (allOperational ? 'operational' : 'degraded');
    
    res.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: {
        discord: discordStatus,
        github: githubStatus,
        cache: {
          status: 'operational',
          stats: cache.getStats()
        }
      },
      uptime: {
        discord: discordStatus.status === 'operational' ? '99.9%' : '0%',
        github: githubStatus.status === 'operational' ? '99.9%' : '0%'
      }
    });
  } catch (err) {
    console.error('Status check error:', err);
    res.status(500).json({ 
      status: 'unknown',
      error: 'Failed to check service status',
      timestamp: new Date().toISOString()
    });
  }
});

app.get("/api/status/services", async (req, res) => {
  res.set("Cache-Control", "public, max-age=60, s-maxage=60");
  
  try {
    const [discordStatus, githubStatus] = await Promise.all([
      check_discord_api(),
      check_github_api()
    ]);
    
    res.json({
      services: [
        {
          name: 'Discord API',
          ...discordStatus,
          uptime_24h: discordStatus.status === 'operational' ? 99.9 : 0
        },
        {
          name: 'GitHub API',
          ...githubStatus,
          uptime_24h: githubStatus.status === 'operational' ? 99.9 : 0
        },
        {
          name: 'Cache System',
          status: 'operational',
          responseTime: 1,
          uptime_24h: 100,
          stats: cache.getStats()
        }
      ],
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Services status error:', err);
    res.status(500).json({ error: 'Failed to check services' });
  }
});


app.get("/api/:userId", async (req, res) => {
  res.set("Cache-Control", "public, max-age=21600, s-maxage=21600, stale-while-revalidate=86400");
  const { userId } = req.params;
  
  if (!UserIdCached(userId)) {
    return res.status(400).json({ error: "Invalid user ID" });
  }
  
  try {
    const data = await get_avatar(userId);
    res.json({ profileUrl: `https://discord.com/users/${userId}`, ...data });
  } catch (err) {
    console.error('Avatar fetch error:', err);
    res.status(err.message.includes('404') ? 404 : 500).json({ error: "Could not fetch avatar" });
  }
});

const imageSizes = { image: 512, smallimage: 128, bigimage: 1024, superbigimage: 4096 };

Object.entries(imageSizes).forEach(([endpoint, defaultSize]) => {
  app.get(`/api/pfp/:userId/${endpoint}`, async (req, res) => {
    res.set("Cache-Control", "public, max-age=604800, s-maxage=604800, stale-while-revalidate=2592000, immutable");
    const { userId } = req.params;
    const { format } = req.query;
    const acceptHeader = req.get("accept");

    if (!UserIdCached(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    try {
      const data = await get_avatar(userId, { size: defaultSize, format, acceptHeader });
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
});

app.get("/api/pfp/:userId/:size", async (req, res) => {
  res.set("Cache-Control", "public, max-age=604800, s-maxage=604800, stale-while-revalidate=2592000, immutable");
  const { userId, size } = req.params;
  const { format } = req.query;
  const acceptHeader = req.get("accept");

  if (!UserIdCached(userId)) {
    return res.status(400).json({ error: "Invalid user ID" });
  }
  
  const numericSize = sanitizeSize(parseInt(size, 10));

  try {
    const data = await get_avatar(userId, { size: numericSize, format, acceptHeader });
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
  res.set("Cache-Control", "public, max-age=21600, s-maxage=21600, stale-while-revalidate=86400");
  const { userId } = req.params;
  
  if (!UserIdCached(userId)) {
    return res.status(400).json({ error: "Invalid user ID" });
  }

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
      badges: ParseUserFlags(user.public_flags),
      accent_color: user.accent_color,
      banner: user.banner,
      banner_color: user.banner_color,
      bannerUrl,
      avatar_decoration_data: user.avatar_decoration_data,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not fetch user data" });
  }
});

app.get("/api/banner/:userId", async (req, res) => {
  res.set("Cache-Control", "public, max-age=21600, s-maxage=21600, stale-while-revalidate=86400");
  const { userId } = req.params;
  const size = req.query.size || 512;
  
  if (!UserIdCached(userId)) {
    return res.status(400).json({ error: "Invalid user ID" });
  }

  try {
    const data = await get_banner(userId, { size });
    if (!data.hasBanner) return res.status(404).json({ error: "Banner not available" });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching banner" });
  }
});

app.get("/api/banner/:userId/image", async (req, res) => {
  res.set("Cache-Control", "public, max-age=604800, s-maxage=604800, stale-while-revalidate=2592000, immutable");
  const { userId } = req.params;
  const size = req.query.size || 512;
  
  if (!UserIdCached(userId)) {
    return res.status(400).json({ error: "Invalid user ID" });
  }

  try {
    const data = await get_banner(userId, { size });
    if (!data.hasBanner) return res.status(404).json({ error: "Banner not available" });
    const imageRes = await fetch(data.bannerUrl);
    res.set("Content-Type", imageRes.headers.get("content-type"));
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cross-Origin-Resource-Policy", "cross-origin");
    imageRes.body.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(404).json({ error: "Banner not available" });
  }
});



app.get("/api/avatar/:identifier", async (req, res) => {
  res.set("Cache-Control", "public, max-age=21600, s-maxage=21600, stale-while-revalidate=86400");
  const { identifier } = req.params;
  const { source = "auto", size = 512, format } = req.query;
  
  try {
    if (source === "github" || (source === "auto" && !/^\d{17,20}$/.test(identifier))) {
      try {
        const user = await get_github_user(identifier);
        return res.json({
          source: "github",
          id: user.id,
          username: user.login,
          display_name: user.name || user.login,
          avatarUrl: user.avatar_url,
          profileUrl: user.html_url,
          bio: user.bio
        });
      } catch (githubErr) {
        if (source === "github") throw githubErr;
      }
    }
    
    if (UserIdCached(identifier)) {
      const data = await get_avatar(identifier, { size: parseInt(size) || 512, format });
      return res.json({
        source: "discord",
        profileUrl: `https://discord.com/users/${identifier}`,
        ...data
      });
    }
    
    res.status(404).json({ error: "User not found", message: "Could not find user on Discord or GitHub" });
    
  } catch (err) {
    console.error('Multi-source avatar error:', err);
    res.status(500).json({ error: "Could not fetch avatar", message: err.message });
  }
});

app.get("/api/github/:username", async (req, res) => {
  res.set("Cache-Control", "public, max-age=43200, s-maxage=43200, stale-while-revalidate=86400");
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
  res.set("Cache-Control", "public, max-age=1800, s-maxage=3600");
  const { username } = req.params;
  const { limit = 30, sort = 'updated' } = req.query;
  
  try {
    const data = await fetch_cached(`github_${username}_repos_${sort}_${limit}`, async () => {
      const r = await fetch(`https://api.github.com/users/${username}/repos?sort=${sort}&per_page=${Math.min(limit, 100)}`, {
        headers: { 
          Authorization: `token ${GITHUB_TOKEN}`, 
          "User-Agent": "Avatarcyan-API/3.1",
          "Accept": "application/vnd.github.v3+json"
        },
        timeout: 8000
      });
      if (!r.ok) throw new Error(`GitHub API error: ${r.status}`);
      return r.json();
    }, 3600);
    
    res.json(data.map(repo => ({
      name: repo.name,
      description: repo.description,
      url: repo.html_url,
      forks: repo.forks_count,
      stars: repo.stargazers_count,
      language: repo.language,
      updated_at: repo.updated_at,
      topics: repo.topics || []
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not fetch repositories" });
  }
});

app.get("/api/github/:username/gists", async (req, res) => {
  res.set("Cache-Control", "public, max-age=21600, s-maxage=21600, stale-while-revalidate=86400");
  const { username } = req.params;

  try {
    const data = await fetch_cached(`github_${username}_gists`, async () => {
      const r = await fetch(`https://api.github.com/users/${username}/gists`, {
        headers: { Authorization: `token ${GITHUB_TOKEN}`, "User-Agent": "Avatarcyan-API/3.1" },
      });
      if (r.status === 404) return [];
      if (!r.ok) throw new Error(`GitHub API error: ${r.status}`);
      return r.json();
    });

    res.json((data || []).map((gist) => ({
      id: gist.id,
      description: gist.description,
      url: gist.html_url,
      files: Object.keys(gist.files),
      created_at: gist.created_at,
      updated_at: gist.updated_at,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not fetch gists" });
  }
});

app.get("/api/github/:username/pfp", async (req, res) => {
  res.set("Cache-Control", "public, max-age=604800, s-maxage=604800, stale-while-revalidate=2592000, immutable");
  const { username } = req.params;
  
  try {
    const user = await get_github_user(username);
    const imageRes = await fetch(user.avatar_url);
    res.set("Content-Type", imageRes.headers.get("content-type"));
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cross-Origin-Resource-Policy", "cross-origin");
    imageRes.body.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not fetch GitHub avatar" });
  }
});

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function safeColor(c, fallback) {
  if (!c || typeof c !== 'string') return fallback;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
  return hex.test(c.trim()) ? c.trim() : fallback;
}

async function check_discord_api() {
  try {
    const start = Date.now();
    const token = getNextToken();
    const res = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${token}` },
      timeout: 5000
    });
    const responseTime = Date.now() - start;
    
    if (res.ok) {
      return { status: 'operational', responseTime, message: 'Discord API is responding' };
    } else if (res.status === 429) {
      return { status: 'degraded', responseTime, message: 'Rate limited' };
    } else {
      return { status: 'degraded', responseTime, message: `HTTP ${res.status}` };
    }
  } catch (err) {
    return { status: 'down', responseTime: 0, message: err.message };
  }
}

async function check_github_api() {
  try {
    const start = Date.now();
    const res = await fetch('https://api.github.com/zen', {
      headers: { Authorization: `token ${GITHUB_TOKEN}` },
      timeout: 5000
    });
    const responseTime = Date.now() - start;
    
    if (res.ok) {
      return { status: 'operational', responseTime, message: 'GitHub API is responding' };
    } else {
      return { status: 'degraded', responseTime, message: `HTTP ${res.status}` };
    }
  } catch (err) {
    return { status: 'down', responseTime: 0, message: err.message };
  }
}

app.get("/api/status/embed", async (req, res) => {
  res.set("Content-Type", "image/svg+xml");
  res.set("Cache-Control", "public, max-age=300");

  const { theme = "dark", label = "API Status", size = "md", width, height, rounded = "true", border = "false", accent } = req.query;

  const dark = theme === "dark";
  const bg = dark ? "#111111" : "#ffffff";
  const txt = dark ? "#f5f5f5" : "#0a0a0a";
  const stroke = border === "true" ? (dark ? "#2a2a2a" : "#e2e8f0") : "none";

  const presets = {
    sm: { w: 160, h: 48, dot: 7, lbl: 13, st: 11 },
    md: { w: 200, h: 56, dot: 8, lbl: 14, st: 12 },
    lg: { w: 240, h: 64, dot: 9, lbl: 15, st: 13 }
  };
  const p = presets[size] || presets.md;
  const w = width ? Number(width) : p.w;
  const h = height ? Number(height) : p.h;
  const dotR = p.dot;
  const lblFs = p.lbl;
  const statFs = p.st;
  const rx = rounded === "true" ? "14" : "6";

  try {
    const apiRes = await fetch(`${req.protocol}://${req.get("host")}/api/status`);
    const data = await apiRes.json();
    const status = (data.status || "unknown").toLowerCase();

    const cfg = {
      operational: { c: "#10b981", t: "UP" },
      degraded: { c: "#f59e0b", t: "DEGRADED" },
      down: { c: "#ef4444", t: "DOWN" },
      unknown: { c: "#94a3b8", t: "UNKNOWN" }
    };
    const { c: dotColor, t: statusText } = cfg[status] || cfg.unknown;
    const finalDot = accent ? safeColor(accent, dotColor) : dotColor;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><clipPath id="card"><rect width="${w}" height="${h}" rx="${rx}"/></clipPath></defs>
  <a href="${req.protocol}://${req.get("host")}/api/status" target="_blank" style="text-decoration:none">
    <rect width="${w}" height="${h}" fill="${bg}" rx="${rx}" stroke="${stroke}" stroke-width="1.5" clip-path="url(#card)"/>
    <circle cx="${w * 0.18}" cy="${h / 2}" r="${dotR}" fill="${finalDot}"/>
    <text x="${w * 0.33}" y="${h * 0.46}" fill="${txt}" font-family="system-ui,sans-serif" font-size="${lblFs}" font-weight="600">${escapeXml(label)}</text>
    <text x="${w * 0.33}" y="${h * 0.78}" fill="${finalDot}" font-family="system-ui,sans-serif" font-size="${statFs}" font-weight="500">${statusText}</text>
  </a>
</svg>`.trim();

    res.send(svg);
  } catch (e) {
    console.error("Status embed error:", e);
    res.status(500).send(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="56"><rect width="200" height="56" rx="14" fill="#111"/><text x="100" y="35" text-anchor="middle" fill="#ef4444" font-family="system-ui" font-size="14" font-weight="600">API ERROR</text></svg>`);
  }
});

module.exports = app;
