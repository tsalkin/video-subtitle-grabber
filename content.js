// Video Subtitle Grabber v2.2.0

(function () {
  if (document.getElementById('vsg-iframe')) return;

  // ── Keep service worker alive via persistent port ─────────────────────────
  var _port = null;
  function keepAlive() {
    try {
      _port = chrome.runtime.connect({ name: 'vsg-keepalive' });
      _port.onDisconnect.addListener(function() { setTimeout(keepAlive, 200); });
    } catch(e) {}
  }
  keepAlive();

  // ── Send message to background with retry ─────────────────────────────────
  function sendBg(msg, cb) {
    var tries = 0;
    function attempt() {
      tries++;
      chrome.runtime.sendMessage(msg, function(r) {
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

  // ── Find videos ───────────────────────────────────────────────────────────
  function findVideos() {
    var videos = [];
    document.querySelectorAll('iframe[src*="player.vimeo.com"]').forEach(function(f) {
      var m = f.src.match(/player\.vimeo\.com\/video\/(\d+)/);
      if (!m) return;
      var h = (f.src.match(/[?&]h=([^&]+)/)||[])[1]||null;
      videos.push({ platform:'vimeo', id:m[1], hash:h, pageThumb: findThumbInPage(m[1], f) });
    });
    document.querySelectorAll('iframe[src*="youtube.com/embed"]').forEach(function(f) {
      var m = f.src.match(/embed\/([^?&]+)/);
      if (m) videos.push({ platform:'youtube', id:m[1], pageThumb:null });
    });
    document.querySelectorAll('video').forEach(function(v,i) {
      var tks = Array.from(v.querySelectorAll('track[kind="subtitles"],track[kind="captions"]'));
      if (!tks.length) return;
      videos.push({ platform:'native', id:'native-'+i, title:v.title||'Video '+(i+1),
        pageThumb: v.poster||null,
        tracks: tks.map(function(t){ return {label:t.label||t.srclang,lang:t.srclang,url:t.src,filename:t.srclang+'.vtt'}; }) });
    });
    return videos;
  }

  function findThumbInPage(videoId, iframe) {
    var html = document.documentElement.innerHTML;
    var m = html.match(/https:\/\/i\.vimeocdn\.com\/video\/[^"'\s\\]+\.(?:jpg|webp)/);
    if (m) return m[0];
    var og = document.querySelector('meta[property="og:image"]');
    if (og) return og.getAttribute('content');
    var ss = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i=0; i<ss.length; i++) {
      try { var d=JSON.parse(ss[i].textContent); var t=d.thumbnailUrl||d.image; if(t) return Array.isArray(t)?t[0]:t; } catch(e){}
    }
    if (iframe && iframe.parentElement) {
      var p=iframe.parentElement;
      for (var s=0; s<4&&p; s++,p=p.parentElement) {
        var img=p.querySelector('img[src*="vimeocdn"]'); if(img) return img.src;
      }
    }
    return null;
  }

  function fmtDur(s) {
    if (!s) return '';
    var h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=Math.floor(s%60);
    function p(n){return n<10?'0'+n:''+n;}
    return h>0?h+':'+p(m)+':'+p(ss):m+':'+p(ss);
  }

  // ── Panel ─────────────────────────────────────────────────────────────────
  function createPanel(videos) {
    var fr = document.createElement('iframe');
    fr.id = 'vsg-iframe';
    fr.style.cssText = 'position:fixed;top:16px;right:16px;width:340px;border:none;border-radius:12px;z-index:2147483647;box-shadow:0 8px 40px rgba(0,0,0,0.8);';
    document.body.appendChild(fr);
    var doc = fr.contentDocument;
    doc.open(); doc.write(buildHTML(videos)); doc.close();

    function resize() { fr.style.height = Math.min(doc.body.scrollHeight+2, window.innerHeight*0.92)+'px'; }
    setTimeout(resize, 80);

    fr.contentWindow._close = function(){ fr.remove(); };

    videos.forEach(function(v,idx){ if(v.pageThumb) setThumb(doc,idx,v.pageThumb); });

    loadAll(doc, videos, resize, fr.contentWindow);
  }

  function loadAll(doc, videos, resize, iwin) {
    var all = [], pending = videos.length;
    if (!pending) return;

    videos.forEach(function(v, idx) {
      if (v.platform==='youtube') {
        setThumb(doc,idx,'https://img.youtube.com/vi/'+v.id+'/mqdefault.jpg');
        setSubs(doc,idx,'<span class="nosub">YouTube: используйте yt-dlp</span>');
        done(); return;
      }
      if (v.platform==='native') {
        renderTracks(doc,idx,v.tracks||[],all);
        done(); return;
      }

      sendBg({ action:'fetchVimeoConfig', id:v.id, hash:v.hash, referer:location.href }, function(cfg) {
        if (cfg.videoTitle) setText(doc,'vt-'+idx,cfg.videoTitle);
        if (cfg.duration)   setText(doc,'dur-'+idx,fmtDur(cfg.duration));
        if (cfg.thumbUrl && !v.pageThumb) setThumb(doc,idx,cfg.thumbUrl);

        if (cfg.error && !(cfg.tracks&&cfg.tracks.length)) {
          setSubs(doc,idx,'<span class="errtxt">Ошибка: '+cfg.error+'</span>');
        } else {
          renderTracks(doc,idx,cfg.tracks||[],all);
        }
        done();
      });
    });

    function done() {
      pending--;
      resize();
      if (pending===0 && all.length) {
        var b=doc.getElementById('dl-all');
        if(b) {
          b.disabled=false; b.style.opacity='1'; b.textContent='⬇ Все ('+all.length+')';
          iwin._allTracks=all;
          b.onclick=function(){ iwin._allTracks.forEach(function(t){ sendBg({action:'download',url:t.url,filename:t.filename},function(){}); }); };
        }
      }
    }
  }

  function setText(doc,id,v){ var e=doc.getElementById(id); if(e) e.textContent=v; }
  function setSubs(doc,idx,h){ var e=doc.getElementById('sb-'+idx); if(e) e.innerHTML=h; }

  function setThumb(doc,idx,src) {
    if (!src) return;
    var w=doc.getElementById('th-'+idx); if(!w||w.querySelector('img')) return;
    var img=doc.createElement('img');
    img.src=src;
    img.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;';
    img.onerror=function(){img.remove();};
    w.insertBefore(img,w.firstChild);
  }

  function renderTracks(doc,idx,tracks,all) {
    var sb=doc.getElementById('sb-'+idx); if(!sb) return;
    if (!tracks.length) { sb.innerHTML='<span class="nosub">Субтитры не найдены</span>'; return; }
    sb.innerHTML='';
    tracks.forEach(function(t) {
      all.push(t);
      var b=doc.createElement('button');
      b.className='dl-btn'; b.textContent='⬇ '+(t.label||t.lang);
      b.onclick=function(){ sendBg({action:'download',url:t.url,filename:t.filename},function(r){ if(r&&r.error) alert(r.error); }); };
      sb.appendChild(b);
    });
  }

  function buildHTML(videos) {
    var cards=videos.map(function(v,idx){
      var pl={vimeo:'🟦 Vimeo',youtube:'🔴 YouTube',native:'⬛ HTML5'}[v.platform]||v.platform;
      var link=v.platform==='vimeo'?'https://player.vimeo.com/video/'+v.id
              :v.platform==='youtube'?'https://www.youtube.com/watch?v='+v.id:'';
      var badge=link?'<a class="badge-link" href="'+link+'" target="_blank">'+pl+' ↗</a>'
                    :'<span class="badge">'+pl+'</span>';
      return '<div class="card">'
        +'<div id="th-'+idx+'" class="thumb"><div class="ph">▶</div><div id="dur-'+idx+'" class="dur"></div></div>'
        +'<div class="right">'
          +'<div class="top-row">'+badge+'<div id="sb-'+idx+'" class="subs-row"><span class="nosub">Загружаю…</span></div></div>'
          +'<div id="vt-'+idx+'" class="title">'+(v.title||'ID: '+v.id)+'</div>'
        +'</div></div>';
    }).join('');
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>'+CSS+'</style></head><body>'
      +'<div id="hdr"><span class="htitle">🎬 Видео: '+videos.length+'</span>'
      +'<div style="display:flex;gap:6px;align-items:center;">'
      +'<button id="dl-all" class="btn-all" disabled style="opacity:.35">⬇ Все</button>'
      +'<button class="btn-x" onclick="window._close()">✕</button></div></div>'
      +'<div id="body">'+cards+'</div></body></html>';
  }

  var CSS=[
    '*{box-sizing:border-box;margin:0;padding:0;}',
    'html,body{background:#1a1a2e;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#e0e0e0;}',
    '::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#444;border-radius:2px}',
    '#hdr{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:#16213e;border-bottom:1px solid #2a2a4a;}',
    '.htitle{font-weight:700;font-size:13px;color:#a0c4ff;}',
    '#body{padding:10px;display:flex;flex-direction:column;gap:8px;}',
    '.card{display:flex;flex-direction:row;border-radius:10px;border:1px solid #2a2a4a;overflow:hidden;background:#16213e;}',
    '.thumb{position:relative;flex-shrink:0;width:110px;min-height:90px;background:#0c1628;display:flex;align-items:center;justify-content:center;}',
    '.ph{font-size:22px;opacity:.2;color:#fff;}',
    '.dur{position:absolute;bottom:5px;left:6px;background:rgba(0,0,0,.82);color:#fff;font-size:10px;font-weight:700;padding:1px 5px;border-radius:3px;line-height:1.5;}',
    '.right{flex:1;min-width:0;padding:9px 10px;display:flex;flex-direction:column;gap:6px;}',
    '.top-row{display:flex;flex-direction:row;gap:5px;align-items:center;}',
    '.badge-link{display:inline-flex;align-items:center;gap:2px;font-size:11px;font-weight:600;background:#0f3460;padding:4px 9px;border-radius:7px;color:#a0c4ff;text-decoration:none;white-space:nowrap;flex-shrink:0;}',
    '.badge-link:hover{background:#1a5090;}',
    '.badge{font-size:11px;font-weight:600;background:#0f3460;padding:4px 9px;border-radius:7px;color:#a0c4ff;flex-shrink:0;}',
    '.subs-row{display:flex;flex-direction:row;flex-wrap:wrap;gap:4px;flex:1;min-width:0;}',
    '.title{font-size:12px;font-weight:700;color:#ddd;line-height:1.4;word-break:break-word;}',
    '.nosub{font-size:10px;color:#555;font-style:italic;align-self:center;}',
    '.errtxt{font-size:10px;color:#ff7070;align-self:center;}',
    '.dl-btn{flex:1;min-width:0;background:#1a8a50;color:#fff;border:none;border-radius:7px;padding:4px 8px;cursor:pointer;font-size:11px;font-weight:600;text-align:center;font-family:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.dl-btn:hover{background:#22a860;}',
    '.btn-all{background:#1a8a50;color:#fff;border:none;border-radius:6px;padding:3px 9px;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit;}',
    '.btn-all:hover:not(:disabled){background:#22a860;}',
    '.btn-x{background:none;border:none;color:#aaa;cursor:pointer;font-size:17px;padding:0 3px;line-height:1;font-family:inherit;}',
    '.btn-x:hover{color:#fff;}'
  ].join('');

  chrome.runtime.onMessage.addListener(function(msg,_,sr){
    if (msg.action==='toggle'){
      var ex=document.getElementById('vsg-iframe');
      if(ex){ex.remove();}else{createPanel(findVideos());}
      sr({ok:true});
    }
    if (msg.action==='getCount') sr({count:findVideos().length});
  });
})();
