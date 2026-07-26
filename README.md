# SillyTavern-Patch

**English** | [**简体中文**](README.zh-CN.md)

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org/)
[![Upstream](https://img.shields.io/badge/based%20on-SillyTavern%201.18.0-orange.svg)](https://github.com/SillyTavern/SillyTavern)
[![Version](https://img.shields.io/badge/version-1.18.0--patch--1-brightgreen.svg)](CHANGELOG.md)

A personal, customized fork of [SillyTavern](https://github.com/SillyTavern/SillyTavern) with targeted improvements for **Chinese domestic LLMs** and **large character card collections**.

> ⚠️ This is a personal fork with **no affiliation** to the official SillyTavern project and does not represent the official stance. All custom features have undergone limited testing — evaluate stability for your own use case.

---

## ✨ What This Fork Does

### Custom Features

- **Thinking Mode Toggle for Chinese LLMs**: Adds a toggle for reasoning/thinking mode on DeepSeek, Qwen, and other Chinese domestic LLMs, allowing flexible control over reasoning output in roleplay scenarios.
  > Currently validated primarily against DeepSeek. Other domestic models have not been thoroughly tested.
  >
  > The toggle uses `{"thinking": {"type": "enabled/disabled"}}` — the DeepSeek format. Models using a different format or lacking a mechanism to disable thinking (e.g., GPT only offers a reasoning depth setting, where "low" still does not disable thinking) will not be affected.
- **Unlimited Subdirectory Depth for Character Cards**: Character card folders support arbitrary nesting levels, making it easy to organize and manage large collections.
- **Folder-Based Browsing in Character UI**: The character selection interface integrates folder browsing, allowing you to navigate and locate cards by directory directly in the UI.
- **Concurrent Character Card Scanning**: Configurable concurrency for character list scanning, significantly speeding up load times with huge collections. Concurrency is auto-detected based on CPU core count (≤4 cores → 8, >4 cores → 32, Android/Termux → 8) and can be manually set in `config.yaml`.
- **Mobile-Friendly World Book Search**: The Lorebook / World Book picker for characters, personas, and chats is replaced on mobile with a keyword-filtered search UI — the native full-screen `<select>` dropdown lacks search, making it extremely unfriendly on mobile.
- **MacroBrowser Extension**: Built-in MacroBrowser extension with preset configurations for browsing and inserting macros.

### Trimming & Optimizations

- Removed unused extensions (caption, gallery, stable-diffusion, translate, tts, etc.) along with their backend endpoints and video generation code, reducing footprint and maintenance surface.
- Optimized PNG character card metadata handling; fixed blank character list state.
- Removed in-memory cache on `getEntitiesList` to fix stale result issues.

Full changelog: [CHANGELOG.md](CHANGELOG.md).

---

## 📦 Requirements

- [Node.js](https://nodejs.org/) **>= 20** (LTS recommended)
- [Git](https://git-scm.com/) (for cloning and updates)
- Optional: [Docker](https://www.docker.com/) (for containerized deployment)

---

## 🚀 Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/JiYeHuanXiang/sillytavern-patch.git
cd sillytavern-patch

# 2. Install dependencies (production mode)
npm install --omit=dev --ignore-scripts

# 3. Start
node server.js
```

Once started, open **http://localhost:8000** to access the admin interface.

### Platform-Specific Launch Scripts

| Platform | Command / Script |
|----------|------------------|
| Windows | Double-click `Start.bat`, or run `UpdateAndStart.bat` (update & start) |
| Linux / macOS / Termux | `bash start.sh` |
| Fork maintainers (Windows) | `UpdateForkAndStart.bat` — auto-fetch upstream changes and merge into fork; see [Update-Instructions.txt](Update-Instructions.txt) |

### Docker

The repo includes `docker/docker-compose.yml` and `Dockerfile` for one-click containerized deployment:

```bash
cd docker
docker compose up -d
```

See [docker/docker-compose.yml](docker/docker-compose.yml) for volume mounts and configuration details.

---

## ⚙️ Configuration

The main config file is [`config.yaml`](config.yaml). Common options:

- `port` — listening port (default `8000`)
- `whitelistMode` / `whitelist` — IP whitelist; by default only localhost is allowed
- `listen` — whether to listen on all network interfaces (default `false`, localhost only)
- `performance.characterListConcurrency` — character card scan concurrency
- `securityOverride` / `disableCsrfProtection` — security toggles; **use with caution**

> On first launch, a user data directory is automatically created under `data/` (default user `default-user`). Character cards go in `data/default-user/characters/` — subdirectories are supported.

For more details, see the [official SillyTavern documentation](https://docs.sillytavern.app/).

---

## 🔄 Updating

Since this repo is cloned from Git, updating is straightforward:

```bash
# Pull latest code and install dependencies
git pull
npm install --omit=dev --ignore-scripts
node server.js
```

Windows users can simply run `UpdateAndStart.bat`.

> If you maintain your own fork, use `UpdateForkAndStart.bat` to rebase the latest upstream changes into your local branch.

---

## 📁 Project Structure

```
sillytavern-patch/
├── public/              # Frontend static assets (UI, scripts, styles)
├── src/                 # Backend source code
├── data/                # User data directory
│   └── default-user/
│       └── characters/  # Character cards (unlimited subdirectory depth)
├── docker/              # Docker-related config
├── config.yaml          # Server configuration
├── server.js            # Entry point
└── package.json
```

---

## ⚠️ Known Limitations & Notes

- **Not an official fork**: This repo does not guarantee synchronization with upstream nor compatibility with all upstream extensions and plugins.
- **Removed extensions**: caption, gallery, stable-diffusion, translate, tts, and their backend endpoints have been deleted. Users who depend on these features should use the upstream version.
- **Limited model coverage**: The thinking mode toggle is primarily validated against DeepSeek. Other domestic models (e.g., Qwen) are adapted on an as-needed basis without comprehensive regression testing.
- **Security**: By default, only localhost is listened on. If you need external access, make sure to configure `listen`, the whitelist, CSRF protection, and Basic Auth, and assess the risks.

---

## 🗺️ Roadmap Notes

- **Following upstream**: We try to keep up with [SillyTavern](https://github.com/SillyTavern/SillyTavern) official releases, but as a patch fork we need to re-adapt custom features on top — so **some delay behind upstream is inevitable** and synchronized releases are not guaranteed.
- **Update cadence**: Proceeds on a "functional and reasonably stable" basis; no fixed release schedule is promised. Major upstream updates are evaluated for merge cost and conflicts before deciding whether to follow.
- **Feedback & requests**: Although this fork is made for personal use, we **welcome bug reports and reasonable feature suggestions**. For bugs, please open an Issue with reproduction steps and logs. For feature suggestions, describe the use case and expected outcome — we'll evaluate within available bandwidth.
- **Maintenance priorities**: Stability of custom features (thinking mode, subdirectory character cards, etc.) takes priority over stacking new features. When conflicts arise with upstream, we make minimal adjustments while preserving custom features.

---

## 🤝 Contributing

Issues and Pull Requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for development environment setup and coding guidelines (following the upstream guide, primarily in English).

Basic development workflow:

```bash
git clone <your-fork>
cd sillytavern-patch
npm install          # install all dependencies (including dev)
npm run lint         # lint check
```

---

## 📜 License

This project inherits the **GNU Affero General Public License v3.0 (AGPL-3.0)** from upstream [SillyTavern](https://github.com/SillyTavern/SillyTavern). See [LICENSE](LICENSE).

> Network service users are also bound by AGPL-3.0; modified code must be disclosed under the license terms.

### Additional Permission for Our Modifications

To be clear: the project as a whole is bound by AGPL-3.0 due to upstream inheritance — this is a license requirement, not our preference. We prefer open, permissive licenses.

**For the new/modified portions contributed by this fork**, we additionally grant the following permission beyond AGPL-3.0:

- You may treat these portions under **MIT** or **BSD** — whichever is most permissive and convenient for you.
- In other words, we impose **no additional restrictions** on our contributions beyond retaining the original author attribution upon redistribution.

> ⚠️ This additional permission applies **only to code and content newly added or modified by this fork**. The original upstream SillyTavern code remains strictly under AGPL-3.0 and may not be downgraded. If you only reuse isolated changes from us (without upstream code), you may use them under the above permissive terms. If you involve the full project or upstream code, the whole remains subject to AGPL-3.0.

---

## 🙏 Acknowledgments

This project is built on [SillyTavern](https://github.com/SillyTavern/SillyTavern). Heartfelt thanks to the original authors and community contributors for their outstanding work.
