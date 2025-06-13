# Discord & Github Avatar API

Free to use PFP API

## Usage

### Endpoints Overview

**Welcome Endpoint:**

* **URL:** `/api`
* **Method:** GET
* **Description:** Returns a welcome message along with a list of available endpoints.

**Get Avatar Data (JSON):**

* **URL:** `/api/:userId`
* **Method:** GET
* **Description:** Returns the avatar URL, username, and display name for the specified Discord user.

  **Example Response:**

  ```json
  {
    "id": "773952016036790272",
    "username": "yellowgreg",
    "display_name": "yellowgreg",
    "avatarUrl": "https://cdn.discordapp.com/avatars/773952016036790272/b34cae8e284c60807c1b880f52b988d8.png?size=512",
    "discriminator": "0"
  }
  ```

**Redirect to Avatar Image:**
**URLs:**

* `/api/pfp/:userId/image` (default size: 512)

* `/api/pfp/:userId/smallimage` (default size: 128)

* `/api/pfp/:userId/bigimage` (default size: 1024)

* `/api/pfp/:userId/superbigimage` (default size: 4096)

* **Method:** GET

* **Description:** Redirects the client to the actual image URL of the user’s avatar. An optional `size` query parameter can override the default size.

**New Avatar Size Endpoint:**

* **URL:** `/api/pfp/:userId/:size`
* **Method:** GET
* **Description:** Returns the avatar image URL for the specified user and size (in pixels). You can replace `:size` with any valid image size (128, 512, 1024, etc.).

  **Example URL:** `/api/pfp/773952016036790272/512`

**Get Raw User Data:**

* **URL:** `/api/user/:userId/raw`
* **Method:** GET
* **Description:** Returns the full JSON data received from the Discord API.

**Banner Endpoints:**

* **JSON Response:**

  * **URL:** `/api/banner/:userId`
  * **Method:** GET
  * **Description:** Returns the banner URL (if available) in JSON format.

* **Image Redirect:**

  * **URL:** `/api/banner/:userId/image`
  * **Method:** GET
  * **Description:** Redirects to the banner image URL.

---

# GitHub Endpoints

**Get GitHub User Data (JSON):**

* **URL:** `/api/github/:username`
* **Method:** GET
* **Description:** Returns public GitHub user data like username, display name, avatar URL, profile URL, bio, and stats, for the specific user.

  **Example Response:**

  ```json
  {
    "id": 172260606,
    "username": "YellowGregs",
    "display_name": "YellowGreg",
    "avatarUrl": "https://avatars.githubusercontent.com/u/172260606?v=4",
    "profileUrl": "https://github.com/YellowGregs",
    "bio": "Joined GitHub on March 10, 2022.",
    "public_repos": 26,
    "followers": 14,
    "following": 12,
    "location": "USA",
    "company": null,
    "blog": ""
  }
  ```

**Redirect to GitHub Avatar Image:**

* **URL:** `/api/github/:username/pfp`
* **Method:** GET
* **Description:** Redirects to the GitHub user's avatar image.

---

# Endpoint Overview

| Endpoint                         | Method | Description                                                                 |
| -------------------------------- | ------ | --------------------------------------------------------------------------- |
| `/api`                           | GET    | Welcome message + list of available endpoints                               |
| `/api/:userId`                   | GET    | Returns avatar info (URL, username, display name, discriminator)            |
| `/api/pfp/:userId/image`         | GET    | Redirects to avatar (512 px)                                                |
| `/api/pfp/:userId/smallimage`    | GET    | Redirects to avatar (128 px)                                                |
| `/api/pfp/:userId/bigimage`      | GET    | Redirects to avatar (1024 px)                                               |
| `/api/pfp/:userId/superbigimage` | GET    | Redirects to avatar (4096 px)                                               |
| `/api/pfp/:userId/:size`         | GET    | Redirects to avatar at custom size (64–4096 px; defaults to 512 if invalid) |
| `/api/user/:userId/raw`          | GET    | Returns full raw Discord user JSON data                                     |
| `/api/banner/:userId`            | GET    | Returns banner URL in JSON                                                  |
| `/api/banner/:userId/image`      | GET    | Redirects to banner image                                                   |
| `/api/github/:username`          | GET    | Returns GitHub user info (JSON)                                             |
| `/api/github/:username/pfp`      | GET    | Redirects to GitHub avatar image                                            |


DOC (Ignore):
- https://api.github.com/
- https://docs.github.com/en/rest?apiVersion=2022-11-28
- https://discord.com/developers/docs/intro
