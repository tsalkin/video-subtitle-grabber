# Changelog

## [2.5.2] — 2026-06-08
### Changed
- **HLS: детект master-плейлиста** — варианты (`playlist_N.m3u8`) нормализуются к master (`playlist.m3u8`), субтитры читаются из master, дубли схлопываются
### Added
- **Превью для видео Circle.so** — постер `thumbnail.jpg` из корня видео (тот же токен пути)
- Честное сообщение **«В этом видео нет дорожек субтитров»** для HLS без субтитров
### Notes
- Проверено: у части видео Circle.so субтитров нет в HLS вообще — извлекать нечего (как и у yt-dlp). Расширение теперь корректно сообщает об этом и показывает превью

## [2.5.1] — 2026-06-08
### Added
- **Кнопка переключения языка в попапе** (по клику на иконку расширения) — RU/EN
- **README.ru.md** — отдельное описание и инструкция на русском на GitHub
### Fixed
- Обрезались нижние строки в разделе «О плагине» — панель переведена на flex-раскладку: шапка и футер закреплены, средняя область прокручивается

## [2.5.0] — 2026-06-08
### Added
- **Поддержка HLS-субтитров** — обнаружение m3u8-потоков на странице через Performance Resource Timing (без новых разрешений); работает с **Circle.so** (`cdn-media.circle.so`) и другими HLS-сайтами
- Парсинг `#EXT-X-MEDIA:TYPE=SUBTITLES` из master-плейлиста, резолв `URI`, склейка WebVTT-сегментов при скачивании (по методике yt-dlp)
- **Подсказка «Начните просмотр (нажмите Play)»** в панели, когда видео не найдено (Performance API видит поток только после начала воспроизведения)
### Notes
- Автообновление возможно только через Chrome Web Store (self-host заблокирован с M33) — см. README «Distribution & Updates»

## [2.4.0] — 2026-06-08
### Added
- **Английский язык + переключатель языка** (🌐 RU/EN) — выбор сохраняется; по умолчанию определяется по языку браузера
- **Раздел «О плагине»** — назначение, автор, ссылка на GitHub за новыми версиями, нейтральное описание и дисклеймер
- **Раздел «Что нового»** — краткий лог изменений последних 2 версий
- **Проверка новой версии** — сравнение с `manifest.json` в GitHub (ветка `main`); баннер в панели и индикатор в popup при наличии обновления
### Changed
- Нейтральное описание продукта (manifest/README) — для соответствия правилам магазинов и снижения юридических рисков

## [2.3.0] — 2026-06-08
### Fixed
- **Превью (thumbnail) теперь отображается** — корневая причина: панель жила в `about:blank` iframe, который наследует CSP родительской страницы; строгий `img-src` молча блокировал картинки с `i.vimeocdn.com`
- **Кнопка ✕ не закрывала панель** — закрытие переведено на надёжный `postMessage`
### Changed
- **Панель вынесена в extension-origin iframe** (`panel.html` как `web_accessible_resource`) — работает в origin расширения, CSP/CSS страницы больше не действуют
- `content.js` отвечает только за поиск видео и хостинг iframe; вся отрисовка и общение с background — в `panel.js`
- Убрана инъекция `styles.css` на каждую страницу (панель самодостаточна)
- У `<img>` превью выставлен `referrerPolicy="no-referrer"` (обход hotlink-защиты CDN)
### Added
- **Переключатель режима «Кратко / Полный»** в заголовке панели — компактный вид без превью; выбор сохраняется в `localStorage`
- **Новая иконка** — яркий синий градиент + белая плашка субтитров + зелёный значок загрузки; читается на 16px, сразу понятно назначение
- Расширенный выбор URL превью из Vimeo config (любой размер/`base`/`poster`) + диагностика в SW-консоль
- **Превью через Vimeo oEmbed API** (`vimeo.com/api/oembed.json`) — фолбэк, когда player config не отдаёт `thumbs` (типично для domain-private видео); фетч в SW по `id`+`hash`

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
