# Changelog

## [2.2.0] — 2026-06-08
### Fixed
- Service worker sleeping → "Receiving end does not exist" error
- Added **keep-alive port** from content script to background SW
- Added **retry logic** (4 attempts, exponential backoff) for background messages

## [2.1.0] — 2026-06-08
### Changed
- Attempted moving config fetch to content script (broke — CORS blocks player.vimeo.com from page context)
- Reverted to background fetch architecture

## [2.0.0] — 2026-06-07
### Added
- **Thumbnail search in page HTML** — scans vimeocdn URLs, OG tags, JSON-LD, data-attributes
- Background returns `thumbUrl` instead of base64 (faster response, no SW timeout)
### Fixed
- "config fetch failed" — config now fetched in background (bypasses CORS)

## [1.9.0] — 2026-06-07
### Changed
- Debug logging for thumbnail URL in background console
- Fallback thumbnail via Vimeo public API (`/api/v2/video/{id}.json`)

## [1.8.0] — 2026-06-07
### Fixed
- Thumbnail: restored base64 approach (`arrayBuffer + btoa`) — CDN blocks direct img from iframe
### Changed
- Layout: Vimeo badge with ↗ icon (clickable), download button on same row

## [1.7.0] — 2026-06-07
### Changed
- Compact horizontal card layout: thumbnail left (110×68px), info right
- Iframe height auto-adjusts to content
- Direct thumbUrl in img src (iframe doesn't have page CSP)

## [1.6.0] — 2026-06-07
### Changed
- **Full rewrite to iframe isolation** — panel lives in `about:blank` iframe
- Page CSS no longer affects extension UI (was: entire panel rendered as dark empty box)

## [1.5.0] — 2026-06-07
### Changed
- Shadow DOM isolation attempt (`:host { all: initial }`)
- Did not fully fix invisible text — CSS variables still cascaded through

## [1.4.0] — 2026-06-06
### Fixed
- `FileReader` not available in service workers → switched to `arrayBuffer + btoa`
- Card layout: full-width thumbnail (16:9 aspect ratio), duration badge overlay
- Download button restored after renderTracks refactor

## [1.3.0] — 2026-06-06
### Added
- Real video title from Vimeo config (`video.title`)
- Thumbnail fetched as base64 via background (bypasses page CSP)
- Duration (`video.duration`) shown below thumbnail

## [1.2.0] — 2026-06-06
### Added
- Auto-load configs on panel open (no manual "Load subtitles" button)
- Thumbnail display (16:9) with duration badge
- "Download All" button activates after all tracks loaded
- YouTube thumbnail from public URL pattern

## [1.1.0] — 2026-06-06
### Fixed
- `credentials: 'include'` → `credentials: 'omit'` on config fetch (CORS preflight was failing)
- Download moved to background service worker (`chrome.downloads` API — bypasses CORS)

## [1.0.0] — 2026-06-06
### Added
- Initial release
- Detects Vimeo, YouTube, HTML5 `<video>` iframes on any page
- Floating draggable panel with platform badge and direct link
- Subtitle download via content script fetch + blob URL
- Manual "Load subtitles" button per video
- Manifest V3, popup with video count
