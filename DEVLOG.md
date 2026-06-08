# Video Subtitle Grabber — Developer Log

> Подробная история создания расширения: ключевые решения, технические сложности,
> интересные находки. Материал для статей и ретроспектив.

---

## Контекст и импульс

**Дата старта:** 7 июня 2026  
**Исходная задача:** скачать субтитры с одной конкретной страницы — `aiadvantagesummit26.obv.io` —
с приватным embedded Vimeo видео записи бизнес-саммита.

Задача казалась простой. Оказалась многослойной.

---

## Этап 0. Ручной поиск — первый рабочий результат

Прежде чем писать расширение, попробовали самый прямой путь.

### Инструмент: yt-dlp

```bash
yt-dlp --cookies-from-browser edge \
       --write-subs --skip-download \
       --sub-langs all \
       "https://player.vimeo.com/video/1187098771"
```

**Результат:** сработало. Файл `04-27-26 - AIA Summit 2026 Virtual - Bonus Day [1187098771].en-x-autogen.vtt` (147 КБ) скачан за секунды.

**Ключевое наблюдение:** yt-dlp не мог обработать исходную HubSpot-ссылку (`d2z6yb04.eu1.hubspotlinks.com/...`), потому что та использует JavaScript-редирект. Понадобилось открыть страницу в браузере и взять реальный URL из адресной строки. А потом — у Claude AI в браузере попросить открыть DevTools и найти Vimeo player URL.

**Вывод:** ручной путь работает, но не масштабируется. На странице может быть 10, 20, 50 видео.

---

## Этап 1. Постановка задачи — расширение

Решение: **сделать браузерный плагин**, который:
1. Автоматически находит все видео на странице
2. Показывает прямые ссылки
3. Позволяет скачать субтитры в один клик

### Первый архитектурный выбор: Manifest V2 vs V3

**Проблема:** MV2 deprecated, браузеры прекращают поддержку. MV3 — новый стандарт, но с жёсткими ограничениями: background-скрипт стал **service worker** (не постоянным процессом), нет `webRequest` blocking, ограниченные возможности.

**Решение:** MV3. Лучше строить на актуальной платформе и решать её ограничения, чем закладывать технический долг с первого дня.

**Это решение потом стало источником большинства технических трудностей.**

---

## Этап 2. Первая рабочая версия (v1.0.0)

Базовый content script + popup. Логика простая:

```javascript
// Найти все Vimeo iframes
document.querySelectorAll('iframe[src*="player.vimeo.com"]')
// Извлечь ID и hash из src
// Показать панель с кнопкой "Загрузить субтитры"
```

**Первая ошибка — CORS при скачивании subтитров:**

```
Failed to fetch
```

Content script пытался скачать `.vtt` файл через `fetch()` из контекста страницы. Vimeo CDN не возвращает `Access-Control-Allow-Origin` для произвольных origin'ов.

**Решение:** переместить download в background service worker. У него нет CORS-ограничений при fetch. Использовать `chrome.downloads` API для сохранения файла.

```javascript
// background.js
async function downloadFile(url, filename) {
  const res = await fetch(url, { credentials: 'omit' });
  const text = await res.text();
  const b64 = btoa(unescape(encodeURIComponent(text)));
  await chrome.downloads.download({
    url: `data:text/vtt;base64,${b64}`,
    filename
  });
}
```

**Интересный момент:** нельзя использовать Blob URL (`URL.createObjectURL`) в service worker — нет доступа к DOM. Поэтому — конвертация в data URL через base64. Но и здесь ловушка: `btoa(text)` ломается на Unicode. Правильно: `btoa(unescape(encodeURIComponent(text)))`.

---

## Этап 3. Проблема с credentials — скрытая ловушка CORS

**Попытка** получить Vimeo config с `credentials: 'include'`:

```javascript
fetch(configUrl, {
  credentials: 'include',
  headers: { 'Referer': location.href }  // ← это тоже ошибка!
});
```

**Две скрытые проблемы:**

1. `credentials: 'include'` требует от сервера явного `Access-Control-Allow-Credentials: true` + конкретного origin (не `*`). Vimeo этого не делает для произвольных страниц.

2. `Referer` — **forbidden header**. Браузер тихо игнорирует его при ручной установке через `fetch()`. Никакой ошибки — заголовок просто не отправляется.

**Решение:** `credentials: 'omit'`. Для приватных embedded Vimeo аутентификация идёт через параметр `?h=HASH` в URL iframe — это и есть токен доступа, cookies не нужны.

**Вывод:** всегда проверять forbidden headers. Браузер не предупреждает — просто игнорирует.

---

## Этап 4. Service Worker засыпает — главная боль MV3

После нескольких минут бездействия Chrome/Edge **выгружает** service worker из памяти. Это нормальное поведение MV3 — SW event-driven, не persistent.

**Симптом:**
```
Error: Could not establish connection. Receiving end does not exist.
```

или
```
Error: config fetch failed
```

**Попытка 1:** вынести config fetch в content script.

```javascript
// content.js — прямо в странице
const r = await fetch('https://player.vimeo.com/video/ID/config');
```

**Результат:** `config fetch failed`. Content script работает в контексте страницы (например, `aiadvantagesummit26.obv.io`). Сервер `player.vimeo.com` не включает эту страницу в CORS-allowed origins. Запрос блокируется.

**Ключевое понимание:** background service worker не подчиняется CORS браузера при fetch — он делает запросы как "чистый" HTTP-клиент расширения. Content script — нет, он привязан к origin страницы.

**Попытка 2:** retry механизм.

```javascript
function sendBg(msg, cb) {
  var tries = 0;
  function attempt() {
    tries++;
    chrome.runtime.sendMessage(msg, function(r) {
      if (chrome.runtime.lastError && tries < 4) {
        setTimeout(attempt, 300 * tries); // exponential backoff
        return;
      }
      cb(r || { error: '...' });
    });
  }
  attempt();
}
```

**Попытка 3 (финальная):** keepalive port.

```javascript
// content.js — открываем порт при загрузке страницы
function keepAlive() {
  try {
    var port = chrome.runtime.connect({ name: 'vsg-keepalive' });
    port.onDisconnect.addListener(() => setTimeout(keepAlive, 200));
  } catch(e) {}
}
keepAlive();
```

```javascript
// background.js
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'vsg-keepalive') {
    // Открытый порт удерживает SW в памяти
  }
});
```

**Механизм:** пока порт открыт, Chrome не выгружает service worker. Content script переоткрывает порт при разрыве. Вместе с retry это делает связь устойчивой.

**Почему это важно:** это известная проблема MV3, документированная в Chrome Bug Tracker. Официального решения нет — keepalive через port это workaround от сообщества.

---

## Этап 5. Невидимый UI — война с CSS

Панель расширения рендерится поверх страницы. Казалось бы, просто: добавить `div` с нашими стилями.

**Проблема:** страница `aiadvantagesummit26.obv.io` имеет глобальные CSS правила, которые переопределяют наши стили. Весь текст становится невидимым — тёмный цвет на тёмном фоне. Визуально: тёмный прямоугольник без текста.

### Попытка 1: CSS с `!important` (v1.x)
Стили в `styles.css`, инжектированные через `content_scripts`. Не помогло — страница всё равно выигрывает по специфичности или через CSS-переменные.

### Попытка 2: Shadow DOM (v1.5.0)

```javascript
const host = document.createElement('div');
const shadow = host.attachShadow({ mode: 'open' });
const style = document.createElement('style');
style.textContent = OUR_CSS;
shadow.appendChild(style);
```

**Теория:** Shadow DOM создаёт изолированное дерево — внешние стили не проникают внутрь.

**Практика:** не сработало. CSS-переменные (`--color`, `--bg`) **пробивают** Shadow DOM boundaries. Если страница объявляет `--text-color: transparent`, это наследуется в shadow tree.

**Две тёмные коробки вместо одной** — прогресс структурный есть, текст по-прежнему невидим.

### Попытка 3: iframe (v1.6.0 — победа)

```javascript
const iframe = document.createElement('iframe');
document.body.appendChild(iframe);
const doc = iframe.contentDocument;
doc.open();
doc.write(OUR_FULL_HTML); // включая <style> с нашим CSS
doc.close();
```

**Почему работает:** iframe с `about:blank` имеет **собственный document** с чистой CSS-средой. Никакие стили родительской страницы не наследуются — ни обычные, ни через переменные. Полная изоляция.

**Цена:** сложнее взаимодействие между iframe и content script. Решение — объект-мост:

```javascript
iframe.contentWindow._x = {
  dl: function(url, filename) { /* вызывает chrome.runtime.sendMessage */ },
  close: function() { iframe.remove(); }
};
```

**Ключевой вывод:** для инжектируемых UI в чужие страницы iframe — единственная надёжная изоляция. Shadow DOM хорош для компонентов, но не для полного UI поверх страницы.

---

## Этап 6. Thumbnail — незакрытая проблема

На каждом этапе thumbnail'ы (превью) не отображались. Это стало отдельным расследованием.

### Попытка 1: `<img src="vimeocdn-url">` в content script div
**Причина отказа:** CSP страницы (`Content-Security-Policy: img-src 'self'`) блокирует внешние изображения в контексте страницы.

### Попытка 2: base64 через background с `FileReader`
```javascript
// background.js
const blob = await res.blob();
return new Promise(resolve => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(reader.result);
  reader.readAsDataURL(blob);
});
```
**Причина отказа:** `FileReader` **недоступен в Service Worker**. SW — не браузерный контекст, у него нет DOM API. Ошибка: `FileReader is not defined`.

### Попытка 3: base64 через `arrayBuffer + btoa`
```javascript
const buffer = await res.arrayBuffer();
const bytes = new Uint8Array(buffer);
let binary = '';
for (let i = 0; i < bytes.byteLength; i += 8192) {
  binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
}
return `data:image/jpeg;base64,${btoa(binary)}`;
```
**Важно:** chunk по 8192 байт — иначе `String.fromCharCode(...largeArray)` вызывает stack overflow на больших изображениях.

**Результат:** base64 генерируется, но thumbnail всё равно не показывается. Подозрение: SW засыпает раньше, чем успевает отдать ответ — и тяжёлый fetch thumbnail'а (сотни КБ) становился причиной timeout'а всего config запроса.

### Попытка 4: прямой URL в iframe img
```javascript
img.src = 'https://i.vimeocdn.com/video/...';
```
**Теория:** iframe `about:blank` не имеет CSP, img может грузиться откуда угодно.  
**Практика:** Vimeo CDN вероятно возвращает `Cross-Origin-Resource-Policy: same-origin` — блокирует загрузку из `about:blank`.

### Попытка 5: поиск thumbnail в HTML страницы
```javascript
// Сканируем страницу на наличие vimeocdn URLs
var m = document.documentElement.innerHTML
  .match(/https:\/\/i\.vimeocdn\.com\/video\/[^"'\s\\]+\.(?:jpg|webp)/);
```
+ OG-теги, JSON-LD, img рядом с iframe.

**Результат:** на тестовой странице не нашлось vimeocdn URLs в HTML — страница загружает Vimeo через чистый iframe без предзагрузки thumbnail.

**Статус на момент публикации:** thumbnail не отображается. Следующий шаг — перехватить config запрос самого Vimeo player'а через `chrome.declarativeNetRequest` или `chrome.webRequest` (если доступно в MV3) и извлечь thumbnail URL оттуда.

**Интересный урок:** thumbnail — типичная "последняя миля". Всё остальное работает идеально, а эта одна деталь требует непропорционально много усилий из-за многоуровневых политик безопасности.

---

## Этап 7. Архитектура именования файлов

Одно из незаметных, но важных UX-решений — имя скачиваемого файла.

**Было (v1.0):** `1187098771_en.vtt`

**Стало (v1.3+):** `04-27-26 - AIA Summit 2026 Virtual - Bonus Day [1187098771].en-x-autogen.vtt`

**Откуда берётся название?** Из Vimeo player config API:
```
GET https://player.vimeo.com/video/1187098771/config
→ data.video.title = "04-27-26 - AIA Summit 2026 Virtual - Bonus Day"
```

**Почему ID в скобках?** Для уникальности при коллизиях названий (два видео с одинаковым title) и для обратной связи с источником.

**Sanitize имени файла:**
```javascript
title.replace(/[\\/:*?"<>|]/g, '-').trim()
```
Символы запрещены в именах файлов Windows — а расширение должно работать кросс-платформенно.

---

## Этап 8. UX эволюция панели

### v1.0 — "Load subtitles" кнопка
Пользователь кликает → запрос → субтитры. Проблема: не видно что происходит, нет превью, нет метаданных.

### v1.2 — Auto-load при открытии
Панель открылась → сразу загружает конфиги всех видео. Skeleton UI с "Загружаю…".

### v1.7–v1.8 — горизонтальная карточка
Thumbnail слева (110×68px), справа: badge + название + кнопки. Проблема: thumbnail не показывается, карточка выглядит как тёмный прямоугольник слева.

### v1.9–v2.x — финальная компоновка
Vimeo badge (кликабельный, со стрелкой ↗) + кнопка субтитров **на одной строке**. Название под ними. Это решает проблему пустого thumbnail — карточка выглядит законченной даже без превью.

**Дизайн-принцип:** UI должен деградировать красиво. Если thumbnail нет — карточка не "сломана", просто без картинки.

---

## Этап 9. Работа с приватными Vimeo

**Главный вопрос:** как получить субтитры с приватного видео?

Vimeo имеет несколько уровней приватности:
1. **Публичное** — доступно всем
2. **По ссылке** — нужен прямой URL
3. **Embedded private** — видео видно только на разрешённых доменах

Для embedded private Vimeo добавляет `?h=HASH` к URL iframe:
```
https://player.vimeo.com/video/1187098771?h=abc123def
```

`h` — это **embed hash**, токен который говорит Vimeo: "этот запрос пришёл с разрешённого домена". При запросе config мы передаём его:

```
GET https://player.vimeo.com/video/1187098771/config?h=abc123def&referrer=https://aiadvantagesummit26.obv.io/
```

**Без этого hash** — `403 Forbidden`.  
**С hash** — полный config с tracks, title, duration, thumbs.

**Откуда берётся hash?** Из src самого iframe — content script читает его при поиске видео:

```javascript
var h = (iframe.src.match(/[?&]h=([^&]+)/) || [])[1] || null;
```

---

## Этап 10. Структура проекта как отдельного репозитория

**Решение:** вынести расширение в отдельный репозиторий, не связанный с родительским проектом `sony-video`.

**Причины:**
- Расширение — самостоятельный инструмент, не зависит от sony-video pipeline
- Отдельный repo = отдельный issue tracker, релизы, contribution history
- Будущая возможность публикации в Chrome Web Store

**GitHub:** https://github.com/tsalkin/video-subtitle-grabber

**Лого:** SVG с кинолентой, кнопкой play и зелёной стрелкой загрузки — символически отражает суть: видео → субтитры.

---

## Ключевые технические выводы

### 1. MV3 Service Worker — не persistent background
SW — event-driven процесс. Между событиями Chrome его выгружает. Keepalive через port — workaround, не решение. Правильное решение — минимизировать async работу в SW, делать её быстро.

### 2. CORS: content script ≠ service worker
Content script живёт в DOM страницы → CORS применяется по origin страницы.  
Service worker — независимый контекст расширения → CORS не применяется к его fetch.  
Это фундаментальное различие определяет, где должна жить бизнес-логика с внешними API.

### 3. CSS изоляция: только iframe
Shadow DOM изолирует от селекторов, но не от CSS-переменных и некоторых inherited properties. Iframe с `doc.write()` — единственная полная изоляция для UI-компонентов поверх чужой страницы.

### 4. FileReader недоступен в Service Worker
SW — не браузерный контекст. Доступны: `fetch`, `Cache API`, `IndexedDB`, `crypto`. Не доступны: `FileReader`, `Blob.text()` через FileReader, `document`, `window`, большинство Web APIs.  
Альтернатива для binary: `arrayBuffer()` + ручной `btoa()`.

### 5. Forbidden headers
`Referer`, `Host`, `Origin` и другие headers нельзя установить вручную через `fetch()` — браузер тихо их игнорирует. Нет ошибки. Есть потеря отладочного времени.

### 6. Embed hash как токен доступа
Для embedded private видео hash в iframe src — это аутентификационный токен. Передав его в config API вместе с referrer, получаем полный доступ без cookies и сессии.

---

## Хронология версий

| Версия | Дата | Главное |
|--------|------|---------|
| v1.0.0 | 06.06.2026 | MVP: находит видео, показывает панель |
| v1.1.0 | 06.06.2026 | Download перенесён в background |
| v1.2.0 | 06.06.2026 | Auto-load, thumbnail, "Скачать все" |
| v1.3.0 | 06.06.2026 | Название из Vimeo config, duration |
| v1.4.0 | 06.06.2026 | Fix: FileReader→arrayBuffer, layout 16:9 |
| v1.5.0 | 07.06.2026 | Shadow DOM (не помогло с CSS) |
| v1.6.0 | 07.06.2026 | **iframe isolation — текст появился** |
| v1.7.0 | 07.06.2026 | Горизонтальный layout карточки |
| v1.8.0 | 07.06.2026 | Vimeo badge кликабельный |
| v1.9.0 | 07.06.2026 | Debug thumbnail, retry logic |
| v2.0.0 | 07.06.2026 | Thumbnail из HTML страницы |
| v2.1.0 | 07.06.2026 | Config fetch в content script (не сработало — CORS) |
| v2.2.0 | 08.06.2026 | **Keepalive port + retry — стабильная работа** |

---

## Открытые задачи

- [ ] **Thumbnail** — найти надёжный способ загрузки превью из Vimeo CDN
- [ ] **YouTube субтитры** — интеграция вместо инструкции "используйте yt-dlp"
- [ ] **SRT конвертация** — конвертировать VTT → SRT на лету для совместимости
- [ ] **Счётчик найденных видео** на иконке расширения (badge)
- [ ] **Chrome Web Store** публикация
- [ ] **Перехват Vimeo config** через `declarativeNetRequest` для получения thumbnail без отдельного fetch

---

## Материал для статей

### Статья 1: "Почему Shadow DOM не решил мою проблему"
CSS-переменные пробивают Shadow DOM. Реальный кейс: расширение браузера vs агрессивный CSS framework сайта.

### Статья 2: "Service Worker в MV3 — грабли и workarounds"
Из persistent background в event-driven SW: что сломалось и как починили. Keepalive pattern, retry logic, правильное разделение ответственности.

### Статья 3: "CORS в браузерном расширении — три контекста"
Content script, Service Worker, iframe — у каждого свои правила. Практическое руководство.

### Статья 4: "Embed hash как токен доступа — как Vimeo защищает приватные видео"
Разбор механизма `?h=HASH` в приватных embedded Vimeo. Как это использовать законно (для своего контента).

### Статья 5: "От скрипта к продукту за один день"
История: нужно было скачать субтитры с одного видео → выросло в полноценный браузерный плагин с GitHub репозиторием за 8 часов.
