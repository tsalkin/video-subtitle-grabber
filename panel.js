// Video Subtitle Grabber — panel (extension origin: no page CSP, no page CSS)
(function () {
  var t = VSG.t;
  var bodyEl = document.getElementById('body');
  var overlayEl = document.getElementById('overlay');
  var bannerEl = document.getElementById('banner');
  var currentVideos = [];
  var updateInfo = null; // { current, latest, hasUpdate }

  // ── Background messaging with retry (SW may be asleep) ─────────────────────
  function sendBg(msg, cb) {
    var tries = 0;
    function attempt() {
      tries++;
      chrome.runtime.sendMessage(msg, function (r) {
        if (chrome.runtime.lastError) {
          if (tries < 4) { setTimeout(attempt, 300 * tries); }
          else { cb({ error: chrome.runtime.lastError.message }); }
          return;
        }
        cb(r || { error: 'empty response' });
      });
    }
    attempt();
  }

  // ── Parent (content script) comms ─────────────────────────────────────────
  function toParent(m) { parent.postMessage(Object.assign({ _vsg: true }, m), '*'); }
  function resize() { toParent({ type: 'vsg-resize', height: document.body.scrollHeight + 2 }); }

  document.getElementById('btn-close').onclick = function () { toParent({ type: 'vsg-close' }); };

  // ── Static labels (re-applied on language change) ─────────────────────────
  var modeBtn = document.getElementById('btn-mode');
  var aboutBtn = document.getElementById('btn-about');
  var newBtn = document.getElementById('btn-new');
  var langBtn = document.getElementById('btn-lang');

  function applyStatic() {
    document.getElementById('vcount-label').textContent = t('videos');
    document.getElementById('btn-close').title = t('close');
    document.getElementById('ver').textContent = 'v' + VSG.version();
    aboutBtn.textContent = t('about');
    newBtn.textContent = t('whatsNew');
    langBtn.textContent = '🌐 ' + t('langName');
    langBtn.title = t('langSwitch');
    modeBtn.textContent = document.body.classList.contains('compact') ? t('full') : t('compact');
    var dl = document.getElementById('dl-all');
    if (dl.disabled) dl.textContent = '⬇ ' + t('all');
  }

  // ── Compact / full mode (persisted) ───────────────────────────────────────
  function applyMode(compact) {
    document.body.classList.toggle('compact', compact);
    modeBtn.textContent = compact ? t('full') : t('compact');
    resize();
  }
  var savedCompact = false;
  try { savedCompact = localStorage.getItem('vsg-compact') === '1'; } catch (e) {}
  document.body.classList.toggle('compact', savedCompact);
  modeBtn.onclick = function () {
    var compact = !document.body.classList.contains('compact');
    try { localStorage.setItem('vsg-compact', compact ? '1' : '0'); } catch (e) {}
    applyMode(compact);
  };

  // ── Language toggle ───────────────────────────────────────────────────────
  langBtn.onclick = function () {
    VSG.setLang(VSG.getLang() === 'ru' ? 'en' : 'ru');
    applyStatic();
    if (overlayEl.style.display === 'block') {
      // refresh whichever overlay is open
      if (overlayEl.dataset.view === 'about') showAbout();
      else if (overlayEl.dataset.view === 'new') showWhatsNew();
    } else {
      render(currentVideos);
    }
    renderBanner();
  };

  // ── Overlay (About / What's new) ──────────────────────────────────────────
  function openOverlay(view, html) {
    overlayEl.dataset.view = view;
    overlayEl.innerHTML = '<button class="fbtn" id="ov-back">' + t('back') + '</button>' + html;
    overlayEl.style.display = 'block';
    bodyEl.style.display = 'none';
    bannerEl.style.display = 'none';
    document.getElementById('ov-back').onclick = closeOverlay;
    resize();
  }
  function closeOverlay() {
    overlayEl.style.display = 'none';
    overlayEl.dataset.view = '';
    bodyEl.style.display = 'flex';
    renderBanner();
    resize();
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function showAbout() {
    var h = ''
      + '<h2>🎬 Video Subtitle Grabber</h2>'
      + '<p><span class="vtag">v' + VSG.version() + '</span></p>'
      + '<p>' + esc(t('aboutDesc')) + '</p>'
      + '<h3>' + t('author') + '</h3><p>' + VSG.AUTHOR + '</p>'
      + '<h3>' + t('project') + '</h3>'
      + '<p>' + t('sourceHint') + ':<br><a href="' + VSG.GITHUB + '" target="_blank">' + VSG.GITHUB.replace('https://', '') + '</a></p>'
      + '<a class="linkbtn" href="' + VSG.RELEASES + '" target="_blank">' + t('get') + ' →</a>'
      + '<div class="updrow"><button id="ov-check">' + t('checkUpdate') + '</button><div class="updstatus" id="ov-updstatus"></div></div>'
      + '<p class="disc">' + esc(t('aboutDisclaimer')) + '</p>';
    openOverlay('about', h);
    var statusEl = document.getElementById('ov-updstatus');
    if (updateInfo) renderCheckStatus(statusEl);
    document.getElementById('ov-check').onclick = function () {
      statusEl.textContent = t('checking');
      sendBg({ action: 'checkUpdate' }, function (r) {
        updateInfo = r && !r.error ? r : null;
        renderCheckStatus(statusEl);
        renderBanner();
      });
    };
  }

  function renderCheckStatus(el) {
    if (!updateInfo || !updateInfo.latest) { el.textContent = t('checkFailed'); return; }
    if (updateInfo.hasUpdate) {
      el.innerHTML = t('updateAvail') + ': <span class="vtag">v' + esc(updateInfo.latest) + '</span> · <a href="' + VSG.RELEASES + '" target="_blank">' + t('get') + '</a>';
    } else {
      el.textContent = '✓ ' + t('upToDate');
    }
  }

  function showWhatsNew() {
    var lang = VSG.getLang();
    var items = VSG.CHANGELOG.slice(0, 2).map(function (v) {
      var lines = (v[lang] || v.en).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('');
      return '<h3><span class="vtag">v' + v.version + '</span> · ' + v.date + '</h3><ul>' + lines + '</ul>';
    }).join('');
    var h = '<h2>' + t('whatsNew') + '</h2>' + items
      + '<a class="linkbtn" href="' + VSG.GITHUB + '/blob/main/CHANGELOG.md" target="_blank">CHANGELOG →</a>';
    openOverlay('new', h);
  }

  aboutBtn.onclick = showAbout;
  newBtn.onclick = showWhatsNew;

  // ── Update banner ─────────────────────────────────────────────────────────
  function renderBanner() {
    if (overlayEl.style.display === 'block') { bannerEl.style.display = 'none'; return; }
    if (updateInfo && updateInfo.hasUpdate) {
      bannerEl.innerHTML = '🔔 ' + t('updateAvail') + ' <span class="vtag">v' + esc(updateInfo.latest) + '</span>'
        + '<a href="' + VSG.RELEASES + '" target="_blank">' + t('get') + '</a>';
      bannerEl.style.display = 'flex';
    } else {
      bannerEl.style.display = 'none';
    }
    resize();
  }

  // ── Rendering helpers ─────────────────────────────────────────────────────
  function fmtDur(s) {
    if (!s) return '';
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60);
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return h > 0 ? h + ':' + p(m) + ':' + p(ss) : m + ':' + p(ss);
  }
  function setText(id, v) { var e = document.getElementById(id); if (e) e.textContent = v; }
  function setSubs(idx, h) { var e = document.getElementById('sb-' + idx); if (e) e.innerHTML = h; }

  function setThumb(idx, src) {
    if (!src) return;
    var w = document.getElementById('th-' + idx);
    if (!w || w.querySelector('img')) return;
    var img = document.createElement('img');
    img.src = src;
    img.referrerPolicy = 'no-referrer';
    img.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;';
    img.onerror = function () { img.remove(); };
    img.onload = resize;
    w.insertBefore(img, w.firstChild);
  }

  // Build the right background message for a track (HLS subs need special handling).
  function dlMsg(tk) {
    return tk.hls
      ? { action: 'downloadHlsSub', uri: tk.uri, filename: tk.filename }
      : { action: 'download', url: tk.url, filename: tk.filename };
  }

  function renderTracks(idx, tracks, all) {
    var sb = document.getElementById('sb-' + idx);
    if (!sb) return;
    if (!tracks.length) { sb.innerHTML = '<span class="nosub">' + t('noSubs') + '</span>'; return; }
    sb.innerHTML = '';
    tracks.forEach(function (tk) {
      all.push(tk);
      var b = document.createElement('button');
      b.className = 'dl-btn';
      b.textContent = '⬇ ' + (tk.label || tk.lang);
      b.onclick = function () {
        sendBg(dlMsg(tk), function (r) {
          if (r && r.error) alert(r.error);
        });
      };
      sb.appendChild(b);
    });
  }

  function buildCard(v, idx) {
    var pl = { vimeo: '🟦 Vimeo', youtube: '🔴 YouTube', native: '⬛ HTML5', hls: '🟩 HLS' }[v.platform] || v.platform;
    var link = v.platform === 'vimeo' ? 'https://player.vimeo.com/video/' + v.id
             : v.platform === 'youtube' ? 'https://www.youtube.com/watch?v=' + v.id : '';
    var badge = link ? '<a class="badge-link" href="' + link + '" target="_blank">' + pl + ' ↗</a>'
                     : '<span class="badge">' + pl + '</span>';
    return '<div class="card">'
      + '<div id="th-' + idx + '" class="thumb"><div class="ph">▶</div><div id="dur-' + idx + '" class="dur"></div></div>'
      + '<div class="right">'
        + '<div class="top-row">' + badge + '<div id="sb-' + idx + '" class="subs-row"><span class="nosub">' + t('loading') + '</span></div></div>'
        + '<div id="vt-' + idx + '" class="title">' + esc(v.title || 'ID: ' + v.id) + '</div>'
      + '</div></div>';
  }

  function render(videos) {
    currentVideos = videos;
    setText('vcount', videos.length);
    if (!videos.length) {
      bodyEl.innerHTML = '<div style="padding:18px 12px;text-align:center;color:#8a93b0;font-size:12px;line-height:1.5;">▶<br>' + esc(t('emptyHint')) + '</div>';
      resize();
      return;
    }
    bodyEl.innerHTML = videos.map(buildCard).join('');
    videos.forEach(function (v, idx) { if (v.pageThumb) setThumb(idx, v.pageThumb); });
    loadAll(videos);
    resize();
  }

  function loadAll(videos) {
    var all = [], pending = videos.length;
    if (!pending) { resize(); return; }

    videos.forEach(function (v, idx) {
      if (v.platform === 'youtube') {
        setThumb(idx, 'https://img.youtube.com/vi/' + v.id + '/mqdefault.jpg');
        setSubs(idx, '<span class="nosub">' + t('ytHint') + '</span>');
        done(); return;
      }
      if (v.platform === 'native') {
        renderTracks(idx, v.tracks || [], all);
        done(); return;
      }
      if (v.platform === 'hls') {
        sendBg({ action: 'fetchHls', url: v.url, title: v.title }, function (res) {
          if (res && res.error && !(res.tracks && res.tracks.length)) {
            setSubs(idx, '<span class="errtxt">' + t('error') + ': ' + esc(res.error) + '</span>');
          } else {
            renderTracks(idx, (res && res.tracks) || [], all);
          }
          done();
        });
        return;
      }
      sendBg({ action: 'fetchVimeoConfig', id: v.id, hash: v.hash, referer: v.referer }, function (cfg) {
        if (cfg.videoTitle) setText('vt-' + idx, cfg.videoTitle);
        if (cfg.duration) setText('dur-' + idx, fmtDur(cfg.duration));
        if (cfg.thumbUrl && !v.pageThumb) setThumb(idx, cfg.thumbUrl);

        if (cfg.error && !(cfg.tracks && cfg.tracks.length)) {
          setSubs(idx, '<span class="errtxt">' + t('error') + ': ' + esc(cfg.error) + '</span>');
        } else {
          renderTracks(idx, cfg.tracks || [], all);
        }
        done();
      });
    });

    function done() {
      pending--;
      resize();
      if (pending === 0 && all.length) {
        var b = document.getElementById('dl-all');
        if (b) {
          b.disabled = false; b.style.opacity = '1'; b.textContent = '⬇ ' + t('all') + ' (' + all.length + ')';
          b.onclick = function () {
            all.forEach(function (tk) { sendBg(dlMsg(tk), function () {}); });
          };
        }
      }
    }
  }

  // ── Receive video list from content script ────────────────────────────────
  window.addEventListener('message', function (e) {
    if (e.source !== parent || !e.data || !e.data._vsg) return;
    if (e.data.type === 'vsg-videos') render(e.data.videos || []);
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  applyStatic();
  toParent({ type: 'vsg-ready' });
  sendBg({ action: 'checkUpdate' }, function (r) {
    updateInfo = r && !r.error ? r : null;
    renderBanner();
  });
})();
