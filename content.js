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
    // HLS streams (e.g. Circle.so via cdn-media.circle.so) — subtitles live in the m3u8 master.
    findHlsSources().forEach(function (u, i) {
      videos.push({ platform: 'hls', id: 'hls-' + i, url: u, title: document.title || location.hostname, pageThumb: null });
    });
    return videos;
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
        var key = u.split('?')[0];
        if (seen[key]) return;
        seen[key] = 1;
        out.push(u);
      });
    } catch (e) {}
    // Prefer master playlists; fall back to the first few if naming is unknown.
    var masters = out.filter(function (u) { return /master|playlist\.m3u8/i.test(u); });
    return (masters.length ? masters : out).slice(0, 4);
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
