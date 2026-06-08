# 🎬 Video Subtitle Grabber

> Browser extension for Chrome/Edge that lists media embedded on the current page and lets you save the **subtitle / caption tracks your browser has already loaded** — for personal use (accessibility, offline reading, translation, study).

![Version](https://img.shields.io/badge/version-2.5.1-blue)
![Manifest](https://img.shields.io/badge/manifest-v3-green)
![Browsers](https://img.shields.io/badge/browsers-Chrome%20%7C%20Edge-orange)

🇷🇺 [Русская версия](README.ru.md)

---

## Features

- **Auto-detects** Vimeo, YouTube, and native `<video>` embeds on any page
- **Downloads subtitles** (.vtt / .srt) in one click
- **Smart filename** — `Video Title [videoID].lang.vtt`
- **Thumbnail preview** with duration badge
- **Clickable platform badge** — opens video directly
- **Download All** — saves every available subtitle track on the page at once
- Reads the text tracks already exposed by the embedded player (incl. embeds that use an access token your browser already sends)
- **Compact / Full mode toggle** — hide thumbnails for a dense list
- **English & Russian** UI with a one-click language switch
- **About / What's new** sections and a built-in **update check** against GitHub
- **Fully isolated UI** via extension-origin iframe — page CSS *and* CSP never affect the panel

## Installation (Developer Mode)

1. Clone or download this repo
2. Open `chrome://extensions/` or `edge://extensions/`
3. Enable **Developer Mode** (top right toggle)
4. Click **Load unpacked** → select this folder
5. Pin the extension icon to your toolbar

## Usage

1. Navigate to any page with embedded video
2. Click the **🎬** extension icon in toolbar
3. The panel opens — videos are detected automatically
4. Click **⬇ Language** to download subtitles
5. Or click **⬇ Все (N)** to download all tracks at once

## Supported Platforms

| Platform | Subtitles | Thumbnail | Duration |
|----------|-----------|-----------|----------|
| Vimeo (public) | ✅ | ✅ | ✅ |
| Vimeo (embedded) | ✅ | ✅ | ✅ |
| YouTube | ℹ️ use yt-dlp | ✅ | — |
| HTML5 `<video>` | ✅ | ✅ (poster) | — |
| HLS / m3u8 (e.g. Circle.so) | ✅ | — | — |

> **HLS note:** subtitle tracks declared in the m3u8 master playlist are detected via the Performance API, which only sees streams the page has already requested — **start playing the video first**, then open the panel.

## Architecture

```
browser-extension/
├── manifest.json       # MV3 manifest
├── background.js       # Service worker: Vimeo config fetch + file download
├── content.js          # Injected into every page: video detection + hosts panel iframe
├── panel.html / .js    # Panel UI — runs in extension origin (web_accessible_resource)
├── i18n.js             # Shared strings (RU/EN), changelog data, version helpers
├── popup.html/js       # Toolbar popup
├── styles.css          # Legacy (panel is fully self-contained now)
├── logo.svg            # Source logo
└── icons/              # PNG icons 16×16, 48×48, 128×128
```

**Key design decisions:**
- Vimeo config is fetched in the **background service worker** (bypasses CORS)
- Panel UI lives in an **extension-origin iframe** (`panel.html`) — isolates from page CSS *and* CSP, so thumbnails (i.vimeocdn.com) always load
- `content.js` ↔ `panel.js` communicate via **postMessage** (different origins)
- **Keep-alive port** prevents service worker from sleeping mid-session
- **Retry logic** (4 attempts) for background messaging

## Development

```bash
# No build step required — plain JS/HTML/CSS
# Edit files → go to edge://extensions/ → click Reload
```

## Distribution & Updates

- **Recommended: Chrome Web Store.** Publishing there ($5 one-time developer fee) is the only way Chrome/Edge users get **automatic, silent updates**. Self-hosted auto-update via `update_url` is blocked for normal users since Chrome M33 (works only for unpacked/dev installs and managed/enterprise policy).
- **GitHub releases.** New versions are published at [`/releases`](https://github.com/tsalkin/video-subtitle-grabber/releases). The extension checks GitHub on open and shows a banner when a newer version exists — but you update by downloading the new release (or via the Web Store once listed).

## Legal & intended use

This is a general-purpose utility. It lists media embedded in the page you are viewing and lets you save the **subtitle/caption text tracks your browser has already downloaded** as part of normal playback. It does **not** download the video itself and does **not** circumvent any technical protection measure (DRM) or access control.

Intended for **personal, lawful use**: accessibility (e.g. for the hard of hearing), offline reading, translation and language learning, and note-taking.

You are responsible for ensuring you have the right to access and save the content, and for complying with each service's Terms of Use and applicable copyright law. The authors provide this software "as is", without warranty, and accept no liability for misuse.

## Changelog

See [CHANGELOG.md](CHANGELOG.md)

## License

MIT
