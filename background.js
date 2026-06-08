// Video Subtitle Grabber v2.2.0
// Background: fetches Vimeo config (no CORS) + handles downloads

chrome.runtime.onInstalled.addListener(() => {
  console.log('VSG v2.2.0 installed');
});

// Keep-alive: ports from content scripts keep this SW alive
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'vsg-keepalive') {
    port.onDisconnect.addListener(() => {});
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'fetchVimeoConfig') {
    fetchVimeoConfig(msg.id, msg.hash, msg.referer).then(sendResponse);
    return true; // async
  }
  if (msg.action === 'download') {
    downloadFile(msg.url, msg.filename).then(sendResponse);
    return true;
  }
  if (msg.action === 'fetchHls') {
    fetchHls(msg.url, msg.title).then(sendResponse);
    return true;
  }
  if (msg.action === 'downloadHlsSub') {
    downloadHlsSub(msg.uri, msg.filename).then(sendResponse);
    return true;
  }
  if (msg.action === 'checkUpdate') {
    checkUpdate().then(sendResponse);
    return true;
  }
});

// ── HLS (m3u8) subtitles — e.g. Circle.so / cdn-media.circle.so ──────────────
// Fetch the master playlist and read #EXT-X-MEDIA:TYPE=SUBTITLES declarations.
async function fetchHls(url, title) {
  try {
    const r = await fetch(url, { credentials: 'omit' });
    if (!r.ok) return { error: `HTTP ${r.status}`, tracks: [] };
    const text = await r.text();
    if (!/#EXTM3U/.test(text)) return { error: 'not m3u8', tracks: [] };
    return { tracks: parseHlsSubs(text, url, title || 'subtitles') };
  } catch (e) {
    return { error: e.message, tracks: [] };
  }
}

function parseHlsSubs(text, baseUrl, title) {
  const tracks = [];
  text.split(/\r?\n/).forEach((line) => {
    if (!/^#EXT-X-MEDIA:/i.test(line) || !/TYPE=SUBTITLES/i.test(line)) return;
    const attr = (k) => (line.match(new RegExp(k + '="([^"]*)"', 'i')) || [])[1] || '';
    const uri = attr('URI');
    if (!uri) return;
    const lang = attr('LANGUAGE') || attr('NAME') || 'sub';
    const name = attr('NAME') || lang;
    tracks.push({
      label: name,
      lang: lang,
      uri: absUrl(uri, baseUrl),
      hls: true,
      filename: makeFilename(title, 'hls', lang, uri)
    });
  });
  return tracks;
}

// The subtitle URI may be a WebVTT file directly, or an m3u8 listing VTT segments.
async function downloadHlsSub(uri, filename) {
  try {
    let out;
    if (/\.m3u8(\?|$)/i.test(uri)) {
      const pl = await (await fetch(uri, { credentials: 'omit' })).text();
      const segs = pl.split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((s) => absUrl(s, uri));
      const parts = [];
      for (const s of segs) parts.push(await (await fetch(s, { credentials: 'omit' })).text());
      out = mergeVtt(parts);
    } else {
      out = await (await fetch(uri, { credentials: 'omit' })).text();
    }
    return saveText(out, filename);
  } catch (e) {
    return { error: e.message };
  }
}

// Naive WebVTT merge: keep one header, append the rest.
function mergeVtt(parts) {
  if (!parts.length) return '';
  let out = parts[0].trim();
  for (let i = 1; i < parts.length; i++) {
    out += '\n\n' + parts[i].replace(/^﻿?WEBVTT[^\n]*\n/i, '').trim();
  }
  return out;
}

function absUrl(u, base) {
  try { return new URL(u, base).href; } catch (e) { return u; }
}

// Compare the installed version with the latest published GitHub Release.
// Using releases (not the main branch) means the banner only appears for
// intentional releases, not for every push to main.
const GH_RELEASES_LATEST = 'https://api.github.com/repos/tsalkin/video-subtitle-grabber/releases/latest';

function cmpVer(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
}

async function checkUpdate() {
  const current = chrome.runtime.getManifest().version;
  try {
    const r = await fetch(GH_RELEASES_LATEST, {
      credentials: 'omit', cache: 'no-store',
      headers: { 'Accept': 'application/vnd.github+json' }
    });
    if (!r.ok) return { current, latest: null, hasUpdate: false }; // 404 = no releases yet
    const d = await r.json();
    const latest = (d.tag_name || '').replace(/^v/i, '') || null;
    return { current, latest, hasUpdate: latest ? cmpVer(latest, current) > 0 : false };
  } catch (e) {
    console.log('[VSG] update check failed:', e.message);
    return { current, latest: null, hasUpdate: false };
  }
}

async function fetchVimeoConfig(id, hash, referer) {
  const params = new URLSearchParams({ referrer: referer || '' });
  if (hash) params.set('h', hash);

  const urls = [
    `https://player.vimeo.com/video/${id}/config?${params}`,
    `https://player.vimeo.com/video/${id}/config${hash ? '?h=' + hash : ''}`
  ];

  for (const url of urls) {
    try {
      const r = await fetch(url, {
        credentials: 'omit',
        headers: { 'Accept': 'application/json' }
      });
      if (!r.ok) continue;
      const data = await r.json();
      const result = parseConfig(data, id);
      // Player config often omits thumbs for domain-private videos → oEmbed fallback.
      if (!result.thumbUrl) {
        result.thumbUrl = await fetchVimeoThumbOembed(id, hash);
      }
      return result;
    } catch (e) {
      console.log('[VSG] config fetch error:', e.message);
    }
  }
  return { error: 'config fetch failed', tracks: [], videoTitle: '', duration: 0, thumbUrl: null };
}

// Vimeo oEmbed: returns thumbnail_url for any embeddable video (incl. private w/ hash).
// Fetched from the service worker → no page CORS. The embed hash authorizes access.
async function fetchVimeoThumbOembed(id, hash) {
  const embedUrl = `https://player.vimeo.com/video/${id}` + (hash ? `?h=${hash}` : '');
  const oembed = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(embedUrl)}&width=640`;
  try {
    const r = await fetch(oembed, { credentials: 'omit', headers: { 'Accept': 'application/json' } });
    if (!r.ok) { console.log('[VSG] oembed HTTP', r.status); return null; }
    const d = await r.json();
    // Prefer the larger thumbnail; thumbnail_url is typically 640px wide (…_640).
    const url = d.thumbnail_url || null;
    console.log('[VSG] oembed thumbnail_url:', url);
    return url;
  } catch (e) {
    console.log('[VSG] oembed error:', e.message);
    return null;
  }
}

function parseConfig(data, id) {
  const rawTracks = data?.request?.text_tracks || [];
  const videoTitle = data?.video?.title || `vimeo-${id}`;
  const duration   = data?.video?.duration || 0;
  const thumbUrl   = pickThumb(data, id);

  const tracks = rawTracks.map(t => ({
    label:    t.label || t.lang,
    lang:     t.lang,
    url:      t.url.startsWith('http') ? t.url : `https://player.vimeo.com${t.url}`,
    kind:     t.kind,
    filename: makeFilename(videoTitle, id, t.lang, t.url)
  }));

  return { tracks, videoTitle, duration, thumbUrl };
}

// Robustly resolve a thumbnail URL from the Vimeo player config.
// Logs to the service-worker console so we can see the real structure.
function pickThumb(data, id) {
  const v = data?.video || {};
  const thumbs = v.thumbs || {};

  const pairs = Object.entries(thumbs)
    .filter(([, val]) => typeof val === 'string' && val.startsWith('http'));

  // Prefer the largest numeric-keyed size (640/960/1280/…), else any URL, else `base`.
  const numeric = pairs.filter(([k]) => /^\d+$/.test(k)).sort((a, b) => (+b[0]) - (+a[0]));
  let url = numeric.length ? numeric[0][1]
          : (pairs[0] ? pairs[0][1] : null);

  // Other places Vimeo sometimes stashes a poster.
  if (!url) url = v.poster || v.thumbnail || (v.thumb && v.thumb.url) || null;

  try {
    console.log('[VSG] thumb debug id=' + id,
      'video keys:', Object.keys(v),
      'thumbs:', JSON.stringify(thumbs),
      '→ picked:', url);
  } catch (e) {}

  return url;
}

function makeFilename(title, id, lang, url) {
  const safe = title.replace(/[\\/:*?"<>|]/g, '-').trim();
  const ext  = url.includes('.srt') ? 'srt' : 'vtt';
  return `${safe} [${id}].${lang || 'sub'}.${ext}`;
}

async function downloadFile(url, filename) {
  try {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return saveText(text, filename);
  } catch (e) {
    return { error: e.message };
  }
}

function saveText(text, filename) {
  const b64 = btoa(unescape(encodeURIComponent(text)));
  return chrome.downloads.download({ url: `data:text/vtt;base64,${b64}`, filename, saveAs: false })
    .then(() => ({ ok: true }))
    .catch((e) => ({ error: e.message }));
}
