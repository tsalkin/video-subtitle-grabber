# 🎬 Video Subtitle Grabber

> Browser extension for Chrome/Edge — finds embedded videos on any page and downloads their subtitles with one click.

![Version](https://img.shields.io/badge/version-2.2.0-blue)
![Manifest](https://img.shields.io/badge/manifest-v3-green)
![Browsers](https://img.shields.io/badge/browsers-Chrome%20%7C%20Edge-orange)

---

## Features

- **Auto-detects** Vimeo, YouTube, and native `<video>` embeds on any page
- **Downloads subtitles** (.vtt / .srt) in one click
- **Smart filename** — `Video Title [videoID].lang.vtt`
- **Thumbnail preview** with duration badge
- **Clickable platform badge** — opens video directly
- **Download All** — grabs every subtitle track on the page at once
- Works with **private embedded Vimeo videos** (using embed hash)
- **Isolated UI** via iframe — page CSS never breaks the panel

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
| Vimeo (private embed) | ✅ | ✅ | ✅ |
| YouTube | ℹ️ use yt-dlp | ✅ | — |
| HTML5 `<video>` | ✅ | ✅ (poster) | — |

## Architecture

```
browser-extension/
├── manifest.json       # MV3 manifest
├── background.js       # Service worker: Vimeo config fetch + file download
├── content.js          # Injected into every page: video detection + panel UI
├── popup.html/js       # Toolbar popup
├── styles.css          # Legacy (panel now uses inline CSS via iframe)
├── logo.svg            # Source logo
└── icons/              # PNG icons 16×16, 48×48, 128×128
```

**Key design decisions:**
- Vimeo config is fetched in the **background service worker** (bypasses CORS)
- Panel UI lives inside an **iframe** (isolates from page CSS)
- **Keep-alive port** prevents service worker from sleeping mid-session
- **Retry logic** (4 attempts) for background messaging

## Development

```bash
# No build step required — plain JS/HTML/CSS
# Edit files → go to edge://extensions/ → click Reload
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md)

## License

MIT
