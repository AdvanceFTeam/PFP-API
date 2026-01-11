# Discord & GitHub Avatar API  

Free-to-use Discord and GitHub profile picture (PFP) API.

- ### **Vercel has finally paused my account, so please deploy your own pfp api url for your website since [avatar-cyan.vercel.app](https://avatar-cyan.vercel.app) wont work no more or just use the official discord or github api**

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
| `/api/:userId` | `GET` | **User Info (JSON)** – avatar, name, discriminator, and etc. |
| `/api/pfp/:userId/image` | `GET` | Redirect → Avatar **(512px)** |
| `/api/pfp/:userId/smallimage` | `GET` | → **128px** |
| `/api/pfp/:userId/bigimage` | `GET` | → **1024px** |
| `/api/pfp/:userId/superbigimage` | `GET` | → **4096px** |
| `/api/pfp/:userId/:size` | `GET` | Custom size (64–4096, power of 2) |
| `/api/user/:userId/raw` | `GET` | **Full Discord user object** (avatar, banner, flags, etc.) |
| `/api/banner/:userId` | `GET` | Banner URL in **JSON** |
| `/api/banner/:userId/image` | `GET` | Redirect → Banner image |

### Query Parameters (Optional)
| Param | Values | Description |
|------|--------|-----------|
| `size` | `64`, `128`, `256`, `512`, `1024`, `2048`, `4096` | Override image size |
| `format` | `png`, `jpeg`, `webp`, `gif` | Override image format |

---

### Example: Discord Avatar (1024px, WebP)
```text
https://avatar-cyan.vercel.app/api/pfp/773952016036790272/image?size=1024&format=webp
```

### Example Response: `/api/773952016036790272`
```json
{
  "id": "773952016036790272",
  "username": "yellowgreg",
  "display_name": "yellowgreg",
  "avatarUrl": "https://cdn.discordapp.com/avatars/773952016036790272/b34cae8e284c60807c1b880f52b988d8.png?size=512",
  "discriminator": "0"
}
```

---

## GitHub Endpoints

| Endpoint | Method | Description |
|--------|--------|-----------|
| `/api/github/:username` | `GET` | **User Profile (JSON)** – name, bio, stats |
| `/api/github/:username/pfp` | `GET` | Redirect → GitHub avatar |
| `/api/github/:username/repos` | `GET` | List of **public repositories** |
| `/api/github/:username/gists` | `GET` | List of **public gists** |

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
  "public_repos": 28,
  "followers": 17,
  "following": 16,
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

---

## Full Endpoint Table

| Endpoint | Method | Description |
|--------|--------|-----------|
| `/api` | `GET` | Welcome message + full endpoint list |
| `/api/:userId` | `GET` | Discord user info (JSON) |
| `/api/pfp/:userId/image` | `GET` | Avatar redirect (512px) |
| `/api/pfp/:userId/smallimage` | `GET` | Avatar redirect (128px) |
| `/api/pfp/:userId/bigimage` | `GET` | Avatar redirect (1024px) |
| `/api/pfp/:userId/superbigimage` | `GET` | Avatar redirect (4096px) |
| `/api/pfp/:userId/:size` | `GET` | Avatar at custom size (64–4096) |
| `/api/user/:userId/raw` | `GET` | Raw Discord user data |
| `/api/banner/:userId` | `GET` | Banner URL in JSON |
| `/api/banner/:userId/image` | `GET` | Redirect to banner image |
| `/api/github/:username` | `GET` | GitHub user profile (JSON) |
| `/api/github/:username/pfp` | `GET` | Redirect to GitHub avatar |
| `/api/github/:username/repos` | `GET` | Public repos list |
| `/api/github/:username/gists` | `GET` | Public gists list |
| `/api/status/embed` | `GET` | SVG status badge |

---

## DOC (Ignore):
- https://api.github.com/
- https://discord.com/developers/docs/intro
- https://docs.github.com/en/rest
