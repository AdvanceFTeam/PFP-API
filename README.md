# Discord & GitHub Avatar API  

Free-to-use Discord and GitHub profile picture (PFP) API.

- ### **Vercel has finally paused my account, so please deploy your own pfp api url for your website since [avatar-cyan.vercel.app](https://avatar-cyan.vercel.app/) wont work no more or just use the official discord or github api**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/AdvanceFTeam/PFP-API)

---

## Quick Start

**Base URL:**  
```text
https://avatar-cyan.vercel.app
```

> Test it → [GET `/api`](https://avatar-cyan.vercel.app/api)

---

## Discord Endpoints

| Endpoint | Method | Description |
|--------|--------|-----------|
| `/api/:userId` | `GET` | **User Info (JSON)** – avatar, badges, banner, accent color |
| `/api/pfp/:userId/image` | `GET` | Avatar image **(512px)** – supports auto-format |
| `/api/pfp/:userId/smallimage` | `GET` | → **128px** |
| `/api/pfp/:userId/bigimage` | `GET` | → **1024px** |
| `/api/pfp/:userId/superbigimage` | `GET` | → **4096px** |
| `/api/pfp/:userId/:size` | `GET` | Custom size (16–4096) |
| `/api/user/:userId/raw` | `GET` | **Full Discord user data** (avatar, banner, flags, badges, etc.) |
| `/api/banner/:userId` | `GET` | Banner URL in **JSON** |
| `/api/banner/:userId/image` | `GET` | Banner image – supports animated banners |

### Query Parameters (Optional)
| Param | Values | Description |
|------|--------|-----------|
| `size` | `16`, `32`, `64`, `128`, `256`, `512`, `1024`, `2048`, `4096` | Override image size |
| `format` | `png`, `webp`, `gif` | Override image format (auto-detects animated) |

---

### Example: Discord Avatar (1024px, WebP)
```text
https://avatar-cyan.vercel.app/api/pfp/773952016036790272/image?size=1024&format=webp
```

### Example Response: `/api/773952016036790272`
```json
{
  "profileUrl": "https://discord.com/users/773952016036790272",
  "cached": true,
  "id": "773952016036790272",
  "username": "yellowgreg",
  "display_name": "yellowgreg",
  "avatarUrl": "https://cdn.discordapp.com/avatars/773952016036790272/6cba9ad9eb855f53ae0374c7450e6fa9.png?size=512",
  "isAnimated": false,
  "bannerUrl": null,
  "bannerAnimated": false,
  "discriminator": "0",
  "accent_color": 921102,
  "banner_color": "#0e0e0e",
  "public_flags": 64,
  "badges": [
    "House Bravery"
  ],
  "avatar_decoration": {
    "asset": "a_f997880d666be69b7782bb377617b4fd",
    "sku_id": "1462116613632426014",
    "expires_at": null
  }
}
```

---

## Batch & Multi-Source Endpoints

| Endpoint | Method | Description |
|--------|--------|-----------|
| `/api/batch` | `GET` | **Fetch multiple users at once** (max 50, auto-deduplicates) |
| `/api/avatar/:identifier` | `GET` | **Multi-source avatar** – Discord + GitHub fallback |

### Batch Endpoint Examples

**Pipe separator (recommended):**
```text
https://avatar-cyan.vercel.app/api/batch?ids=773952016036790272|804955810820128798
```

**Also supports comma or semicolon:**
```text
https://avatar-cyan.vercel.app/api/batch?ids=123,456,789
https://avatar-cyan.vercel.app/api/batch?ids=123;456;789
```

### Batch Response Example
```json
{
  "total": 2,
  "successful": 2,
  "failed": 0,
  "users": [
    {
      "id": "773952016036790272",
      "success": true,
      "username": "yellowgreg",
      "display_name": "yellowgreg",
      "avatarUrl": "https://cdn.discordapp.com/avatars/773952016036790272/6cba9ad9eb855f53ae0374c7450e6fa9.png?size=512",
      "isAnimated": false,
      "bannerUrl": null,
      "bannerAnimated": false,
      "discriminator": "0",
      "accent_color": 921102,
      "banner_color": "#0e0e0e",
      "public_flags": 64,
      "badges": [
        "House Bravery"
      ],
      "avatar_decoration": {
        "asset": "a_f997880d666be69b7782bb377617b4fd",
        "sku_id": "1462116613632426014",
        "expires_at": null
      }
    },
    {
      "id": "804955810820128798",
      "success": true,
      "username": "wspboy12",
      "display_name": "스타크",
      "avatarUrl": "https://cdn.discordapp.com/avatars/804955810820128798/6b354ac7e07f4e988e38dee6f55d38ce.png?size=512",
      "isAnimated": false,
      "bannerUrl": null,
      "bannerAnimated": false,
      "discriminator": "0",
      "accent_color": 0,
      "banner_color": "#000000",
      "public_flags": 128,
      "badges": [
        "House Brilliance"
      ],
      "avatar_decoration": null
    }
  ]
}
```

### Multi-Source Endpoint

**Auto-detect (GitHub username or Discord ID):**
```text
https://avatar-cyan.vercel.app/api/avatar/YellowGregs
https://avatar-cyan.vercel.app/api/avatar/773952016036790272
```

**Force specific source:**
```text
/api/avatar/YellowGregs?source=github
/api/avatar/773952016036790272?source=discord
```

---

## GitHub Endpoints

| Endpoint | Method | Description |
|--------|--------|-----------|
| `/api/github/:username` | `GET` | **User Profile (JSON)** – name, bio, stats |
| `/api/github/:username/pfp` | `GET` | GitHub avatar image |
| `/api/github/:username/repos` | `GET` | List of **public repositories** |
| `/api/github/:username/gists` | `GET` | List of **public gists** |

### Query Parameters
| Param | Values | Description |
|------|--------|-----------|
| `limit` | `1-100` | Max repos to return (default: 30) |
| `sort` | `updated`, `created`, `pushed` | Sort order (default: updated) |

---

### Example: GitHub Profile
```text
https://avatar-cyan.vercel.app/api/github/YellowGregs
```

### Example Response
```json
{
  "id": 172260606,
  "username": "YellowGregs",
  "display_name": "YellowGreg",
  "avatarUrl": "https://avatars.githubusercontent.com/u/172260606?v=4",
  "profileUrl": "https://github.com/YellowGregs",
  "bio": "Joined GitHub on March 10, 2022.",
  "public_repos": 32,
  "followers": 17,
  "following": 18,
  "location": "USA",
  "company": null,
  "blog": ""
}
```

---

## Status Embeds

```md
![API Status](https://avatar-cyan.vercel.app/api/status/embed?theme=dark&label=Avatar%20cyan)
```

![API Status](https://avatar-cyan.vercel.app/api/status/embed?theme=dark&size=md&label=Avatar-cyan&rounded=true&border=true)  
![Backend](https://avatar-cyan.vercel.app/api/status/embed?theme=light&size=sm&label=Backend&accent=%23ff6b6b)  
![Custom Size](https://avatar-cyan.vercel.app/api/status/embed?theme=dark&width=280&height=70&label=Custom%20Size&accent=%23a855f7)

---

### Embed Customization
| Param | Values | Example |
|------|--------|-------|
| `theme` | `dark` / `light` | `theme=light` |
| `size` | `sm` / `md` / `lg` | `size=lg` |
| `width` / `height` | any px | `width=500&height=160` |
| `rounded` | `true` / `false` | `rounded=false` |
| `border` | `true` / `false` | `border=true` |
| `accent` | `#rrggbb` | `accent=%2300ff88` |
| `label` | any text | `label=My%20API` |

### Status Endpoints
| Endpoint | Method | Description |
|--------|--------|-----------|
| `/api/status` | `GET` | Overall API health and service status |
| `/api/status/services` | `GET` | Detailed per-service status and uptime |

### Example Response: `/api/status`
```json
{
  "status": "operational",
  "uptime": 99,
  "responseTime": 36,
  "lastChecked": "2026-03-02T21:06:21.508Z",
  "region": "Global",
  "version": "1.1.0",
  "services": {
    "total": 4,
    "operational": 4,
    "degraded": 0,
    "down": 0
  },
  "performance": {
    "cache_hit_rate": 99,
    "total_incidents_7d": 0,
    "average_response_time_7d": 36
  }
}
```

---

## Full Endpoint Table

| Endpoint | Method | Description |
|--------|--------|-----------|
| `/api` | `GET` | API documentation and endpoint list |
| `/api/version` | `GET` | API version and changelog |
| **Discord** |
| `/api/:userId` | `GET` | Discord user info with badges and colors |
| `/api/pfp/:userId/image` | `GET` | Avatar (512px) with auto-format |
| `/api/pfp/:userId/smallimage` | `GET` | Avatar (128px) |
| `/api/pfp/:userId/bigimage` | `GET` | Avatar (1024px) |
| `/api/pfp/:userId/superbigimage` | `GET` | Avatar (4096px) |
| `/api/pfp/:userId/:size` | `GET` | Avatar at custom size |
| `/api/user/:userId/raw` | `GET` | Raw Discord user data |
| `/api/banner/:userId` | `GET` | Banner URL in JSON |
| `/api/banner/:userId/image` | `GET` | Banner image |
| **Batch & Multi-Source** |
| `/api/batch` | `GET` | Multiple users (max 50, deduplicates) |
| `/api/avatar/:identifier` | `GET` | Multi-source (Discord + GitHub) |
| **GitHub** |
| `/api/github/:username` | `GET` | GitHub user profile |
| `/api/github/:username/pfp` | `GET` | GitHub avatar |
| `/api/github/:username/repos` | `GET` | Public repositories |
| `/api/github/:username/gists` | `GET` | Public gists |
| **Status** |
| `/api/status` | `GET` | Overall API health |
| `/api/status/services` | `GET` | Detailed service status |

---

## Documentation (ignore)

- [Discord API Docs](https://discord.com/developers/docs/intro)
- [GitHub REST API](https://docs.github.com/en/rest)
- [Vercel Documentation](https://vercel.com/docs)
