// Video Subtitle Grabber — content script (page context: finds videos, hosts panel iframe)
(function () {
  var IFRAME_ID = 'vsg-iframe';

  // ── Keep service worker alive via persistent port ─────────────────────────
  var _port = null;
  function keepAlive() {
    try {
      _port = chrome.runtime.connect({ name: 'vsg-keepalive' });
      _port.onDisconnect.addListener(function () { setTimeout(keepAlive, 200); });
    } catch (e) {}
  }
  keepAlive();

  // ── Find videos ───────────────────────────────────────────────────────────
  function findVideos() {
    var videos = [];
    document.querySelectorAll('iframe[src*="player.vimeo.com"]').forEach(function (f) {
      var m = f.src.match(/player\.vimeo\.com\/video\/(\d+)/);
      if (!m) return;
      var h = (f.src.match(/[?&]h=([^&]+)/) || [])[1] || null;
      videos.push({ platform: 'vimeo', id: m[1], hash: h, referer: location.href, pageThumb: findThumbInPage(m[1], f) });
    });
    document.querySelectorAll('iframe[src*="youtube.com/embed"]').forEach(function (f) {
      var m = f.src.match(/embed\/([^?&]+)/);
      if (m) videos.push({ platform: 'youtube', id: m[1], pageThumb: null });
    });
    document.querySelectorAll('video').forEach(function (v, i) {
      var tks = Array.from(v.querySelectorAll('track[kind="subtitles"],track[kind="captions"]'));
      if (!tks.length) return;
      videos.push({
        platform: 'native', id: 'native-' + i, title: v.title || 'Video ' + (i + 1),
        pageThumb: v.poster || null,
        tracks: tks.map(function (t) { return { label: t.label || t.srclang, lang: t.srclang, url: t.src, filename: t.srclang + '.vtt' }; })
      });
    });
    // YouTube watch page: the player isn't an embed iframe — read captions from the page.
    var yt = getYoutubeWatch();
    if (yt) videos.push(yt);
    // HLS streams (e.g. Circle.so via cdn-media.circle.so) — subtitles live in the m3u8 master.
    findHlsSources().forEach(function (u, i) {
      videos.push({ platform: 'hls', id: 'hls-' + i, url: u, title: document.title || location.hostname, pageThumb: null });
    });
    return videos;
  }

  // Detect a YouTube watch page and extract real caption tracks from ytInitialPlayerResponse.
  function getYoutubeWatch() {
    var host = location.hostname;
    var id = null;
    if (/(^|\.)youtube\.com$/.test(host) && /\/watch/.test(location.pathname)) {
      id = (location.search.match(/[?&]v=([^&]+)/) || [])[1];
    } else if (/(^|\.)youtu\.be$/.test(host)) {
      id = location.pathname.slice(1).split(/[?&/]/)[0];
    }
    if (!id) return null;

    var pr = extractJson('ytInitialPlayerResponse');
    var title = (pr && pr.videoDetails && pr.videoDetails.title) || document.title.replace(/ - YouTube$/, '');
    var tracks = [];
    try {
      var ct = pr.captions.playerCaptionsTracklistRenderer.captionTracks || [];
      ct.forEach(function (c) {
        var base = c.baseUrl;
        if (!base) return;
        var url = base + (base.indexOf('?') >= 0 ? '&' : '?') + 'fmt=vtt';
        var lang = c.languageCode || 'sub';
        var label = (c.name && (c.name.simpleText || (c.name.runs && c.name.runs[0] && c.name.runs[0].text))) || lang;
        if (c.kind === 'asr') label += ' (auto)';
        tracks.push({ label: label, lang: lang, url: url, filename: ytFilename(title, id, lang) });
      });
    } catch (e) {}
    return { platform: 'youtube', id: id, title: title, tracks: tracks,
             pageThumb: 'https://img.youtube.com/vi/' + id + '/mqdefault.jpg' };
  }

  // Extract a JSON object that follows a marker in the page source (brace-balanced).
  function extractJson(marker) {
    var html = document.documentElement.innerHTML;
    var i = html.indexOf(marker);
    if (i < 0) return null;
    i = html.indexOf('{', i);
    if (i < 0) return null;
    var depth = 0, inStr = false, esc = false;
    for (var j = i; j < html.length; j++) {
      var c = html[j];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; }
      else if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { try { return JSON.parse(html.slice(i, j + 1)); } catch (e) { return null; } } }
    }
    return null;
  }

  function ytFilename(title, id, lang) {
    var safe = (title || 'youtube').replace(/[\\/:*?"<>|]/g, '-').trim();
    return safe + ' [' + id + '].' + (lang || 'sub') + '.vtt';
  }

  // Discover HLS master playlists already loaded by the page (no extra permissions).
  // Subtitles are declared inside the master .m3u8 (#EXT-X-MEDIA:TYPE=SUBTITLES).
  function findHlsSources() {
    var out = [], seen = {};
    try {
      var ents = performance.getEntriesByType ? performance.getEntriesByType('resource') : [];
      ents.forEach(function (e) {
        var u = e.name || '';
        if (!/\.m3u8(\?|$)/i.test(u)) return;
        if (/vimeo|youtube|googlevideo|ytimg/i.test(u)) return; // handled elsewhere
        // Subtitles live in the master playlist — normalize variants (playlist_N.m3u8)
        // to the master (playlist.m3u8) and dedupe so each video shows once.
        var master = u.replace(/playlist_\d+\.m3u8/i, 'playlist.m3u8');
        var key = master.split('?')[0];
        if (seen[key]) return;
        seen[key] = 1;
        out.push(master);
      });
    } catch (e) {}
    return out.slice(0, 8);
  }

  function findThumbInPage(videoId, iframe) {
    var html = document.documentElement.innerHTML;
    var m = html.match(/https:\/\/i\.vimeocdn\.com\/video\/[^"'\s\\]+\.(?:jpg|webp)/);
    if (m) return m[0];
    var og = document.querySelector('meta[property="og:image"]');
    if (og) return og.getAttribute('content');
    var ss = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < ss.length; i++) {
      try { var d = JSON.parse(ss[i].textContent); var t = d.thumbnailUrl || d.image; if (t) return Array.isArray(t) ? t[0] : t; } catch (e) {}
    }
    if (iframe && iframe.parentElement) {
      var p = iframe.parentElement;
      for (var s = 0; s < 4 && p; s++, p = p.parentElement) {
        var img = p.querySelector('img[src*="vimeocdn"]'); if (img) return img.src;
      }
    }
    return null;
  }

  // ── Panel (extension-origin iframe: no page CSP, no page CSS) ──────────────
  function openPanel() {
    var videos = findVideos();
    var fr = document.createElement('iframe');
    fr.id = IFRAME_ID;
    fr.src = chrome.runtime.getURL('panel.html');
    fr.style.cssText = 'position:fixed;top:16px;right:16px;width:340px;height:120px;border:none;border-radius:12px;z-index:2147483647;box-shadow:0 8px 40px rgba(0,0,0,0.8);';
    document.body.appendChild(fr);

    function onMsg(e) {
      if (e.source !== fr.contentWindow || !e.data || !e.data._vsg) return;
      if (e.data.type === 'vsg-ready') {
        fr.contentWindow.postMessage({ _vsg: true, type: 'vsg-videos', videos: videos }, '*');
      } else if (e.data.type === 'vsg-resize') {
        fr.style.height = Math.min(e.data.height, window.innerHeight * 0.92) + 'px';
      } else if (e.data.type === 'vsg-close') {
        closePanel();
      }
    }
    fr._onMsg = onMsg;
    window.addEventListener('message', onMsg);
  }

  function closePanel() {
    var fr = document.getElementById(IFRAME_ID);
    if (!fr) return;
    if (fr._onMsg) window.removeEventListener('message', fr._onMsg);
    fr.remove();
  }

  function togglePanel() {
    if (document.getElementById(IFRAME_ID)) { closePanel(); }
    else { openPanel(); }
  }

  // ── Popup commands ────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener(function (msg, _, sr) {
    if (msg.action === 'toggle') { togglePanel(); sr({ ok: true }); }
    if (msg.action === 'getCount') sr({ count: findVideos().length });
  });
})();
