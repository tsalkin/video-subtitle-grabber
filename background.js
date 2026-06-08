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
});

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
      return parseConfig(data, id);
    } catch (e) {
      console.log('[VSG] config fetch error:', e.message);
    }
  }
  return { error: 'config fetch failed', tracks: [], videoTitle: '', duration: 0, thumbUrl: null };
}

function parseConfig(data, id) {
  const rawTracks = data?.request?.text_tracks || [];
  const videoTitle = data?.video?.title || `vimeo-${id}`;
  const duration   = data?.video?.duration || 0;
  const thumbs     = data?.video?.thumbs || {};
  const thumbUrl   = thumbs['640'] || thumbs['960'] || thumbs['1280']
    || Object.values(thumbs).find(v => typeof v === 'string' && v.startsWith('http'))
    || null;

  const tracks = rawTracks.map(t => ({
    label:    t.label || t.lang,
    lang:     t.lang,
    url:      t.url.startsWith('http') ? t.url : `https://player.vimeo.com${t.url}`,
    kind:     t.kind,
    filename: makeFilename(videoTitle, id, t.lang, t.url)
  }));

  return { tracks, videoTitle, duration, thumbUrl };
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
    const b64  = btoa(unescape(encodeURIComponent(text)));
    await chrome.downloads.download({ url: `data:text/vtt;base64,${b64}`, filename, saveAs: false });
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}
