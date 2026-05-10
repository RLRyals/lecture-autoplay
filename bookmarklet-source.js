(function () {
  if (window.__seqVidPlayer) { window.__seqVidPlayer.toggle(); return; }

  var VERSION = 'v15';
  var SS = '__svpState';
  var saved = (function () {
    try { return JSON.parse(sessionStorage.getItem(SS)) || {}; } catch (e) { return {}; }
  })();
  var speed = saved.speed || 1;
  var autoNext = saved.autoNext !== false;
  var idx = -1, paused = false;

  function persist() {
    try { sessionStorage.setItem(SS, JSON.stringify({ speed: speed, autoNext: autoNext })); }
    catch (e) {}
  }

  var iframeHosts = [
    { match: /player\.hotmart\.com/, host: 'hotmart' },
    { match: /fast\.wistia\.net|wistia\.com/, host: 'wistia' },
    { match: /youtube\.com\/embed|youtube-nocookie\.com\/embed/, host: 'youtube' },
    { match: /player\.vimeo\.com/, host: 'vimeo' }
  ];
  var targets = [];
  Array.from(document.querySelectorAll('video, iframe')).forEach(function (el) {
    if (el.tagName === 'VIDEO') {
      if (el.offsetParent !== null || el.readyState > 0) {
        targets.push({ kind: 'video', el: el, host: 'native' });
      }
      return;
    }
    var src = el.getAttribute('src') || '';
    for (var i = 0; i < iframeHosts.length; i++) {
      if (iframeHosts[i].match.test(src)) {
        targets.push({ kind: 'iframe', el: el, host: iframeHosts[i].host });
        return;
      }
    }
  });

  function findNext() {
    var sels = [
      'a.next-lecture-button',
      'a.lecture-navigation-link.next-lecture',
      '[data-qa="lecture-complete-continue"]',
      '.next-lecture a',
      'a.complete-and-continue',
      '.lecture-navigation-link[href*="/lectures/"]+.lecture-navigation-link'
    ];
    for (var i = 0; i < sels.length; i++) {
      var el = document.querySelector(sels[i]);
      if (el) return el;
    }
    var cands = Array.from(document.querySelectorAll('a, button'));
    for (var j = 0; j < cands.length; j++) {
      var t = (cands[j].textContent || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (t === 'next lecture' || t === 'complete & continue' || t === 'complete and continue' || t === 'next') {
        return cands[j];
      }
    }
    return null;
  }

  function gotoNext() {
    var l = findNext();
    if (l) { status.textContent = 'Advancing…'; l.click(); }
    else status.textContent = 'No next-lecture link found';
  }

  var BAR_H = 44;
  var prevBodyPadTop = document.body.style.paddingTop;
  var basePad = parseInt(getComputedStyle(document.body).paddingTop, 10) || 0;
  document.body.style.paddingTop = (basePad + BAR_H) + 'px';

  var pushedFixed = [];
  function shiftTopFixed(amount) {
    var all = document.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el === ui || (ui.contains && ui.contains(el))) continue;
      var cs;
      try { cs = getComputedStyle(el); } catch (e) { continue; }
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      var topVal = parseInt(cs.top, 10);
      if (isNaN(topVal) || topVal >= amount) continue;
      var r;
      try { r = el.getBoundingClientRect(); } catch (e) { continue; }
      if (!r || r.top > amount + 8 || r.bottom <= 0) continue;
      pushedFixed.push({ el: el, prevTop: el.style.top });
      el.style.top = (topVal + amount) + 'px';
    }
  }

  var ui = document.createElement('div');
  ui.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:rgba(15,23,42,.97);color:#fff;font:13px/1.3 system-ui,sans-serif;padding:6px 12px;box-shadow:0 2px 10px rgba(0,0,0,.35);user-select:none;display:flex;align-items:center;gap:10px;flex-wrap:wrap';
  ui.innerHTML =
    '<strong style="margin-right:6px">Seq Player ' + VERSION + '</strong>' +
    '<span id="svp-status" style="opacity:.85;min-width:160px"></span>' +
    '<span style="display:flex;gap:4px">' +
      '<button data-act="prev">⏮</button><button data-act="pause">⏸</button>' +
      '<button data-act="next">⏭</button><button data-act="restart">↻</button>' +
      '<button data-act="reload">Reload vid</button>' +
      '<button data-act="gotonext">Next lec</button>' +
    '</span>' +
    '<span style="display:flex;gap:4px">' +
      '<button data-spd="0.5">0.5×</button><button data-spd="1">1×</button>' +
      '<button data-spd="1.25">1.25×</button><button data-spd="1.5">1.5×</button>' +
      '<button data-spd="1.75">1.75×</button><button data-spd="2">2×</button>' +
      '<button data-spd="3">3×</button>' +
    '</span>' +
    '<label style="display:flex;gap:6px;align-items:center;font-size:12px">' +
      '<input type="checkbox" id="svp-auto">Auto-advance lectures</label>' +
    '<span id="svp-x" style="cursor:pointer;padding:0 6px;margin-left:auto;font-size:18px">×</span>';

  Array.from(ui.querySelectorAll('button')).forEach(function (b) {
    b.style.cssText = 'background:#1e293b;color:#fff;border:1px solid #334155;border-radius:4px;padding:4px 8px;cursor:pointer;font:12px system-ui';
  });
  document.body.appendChild(ui);
  shiftTopFixed(BAR_H);

  var status = ui.querySelector('#svp-status');
  var autoCb = ui.querySelector('#svp-auto');
  autoCb.checked = autoNext;
  autoCb.addEventListener('change', function () { autoNext = autoCb.checked; persist(); render(); });

  function iframePost(target, msgs) {
    if (!target.el.contentWindow) return;
    msgs.forEach(function (m) {
      try { target.el.contentWindow.postMessage(m, '*'); } catch (e) {}
      if (typeof m !== 'string') {
        try { target.el.contentWindow.postMessage(JSON.stringify(m), '*'); } catch (e) {}
      }
    });
  }
  var lastTimes = {};
  function reloadWithAutoplay(t) {
    if (t.kind !== 'iframe') return;
    var src = t.el.getAttribute('src') || '';
    if (!src) return;
    src = src
      .replace(/[?&]_svp=\d+/g, '')
      .replace(/[?&]autoplay=\d/g, '')
      .replace(/\?&/, '?').replace(/&&+/g, '&').replace(/[?&]$/, '');
    var sep = src.indexOf('?') === -1 ? '?' : '&';
    t.el.setAttribute('src', src + sep + 'autoplay=1&_svp=' + Date.now());
  }
  function hotmartMsg(name, payload) {
    var m = { event: name };
    if (payload !== undefined) m.media = payload;
    return m;
  }
  function iframePlay(t) {
    if (t.host === 'youtube') {
      iframePost(t, [{ event: 'command', func: 'playVideo', args: [] }, { event: 'listening' }]);
      return;
    }
    if (t.host === 'vimeo') {
      iframePost(t, [{ method: 'play' }]);
      return;
    }
    if (t.host === 'hotmart') {
      // Hotmart's player ignores ?autoplay=1 in the embed URL on Teachable
      // and reloading the iframe destroys the player state, breaking manual
      // play too. Best-effort: send a PLAY message and rely on the user's
      // recent gesture for autoplay permission.
      iframePost(t, [
        { event: 'PLAY' },
        { event: 'play' },
        { event: 'TOGGLE_PLAY' }
      ]);
      return;
    }
    reloadWithAutoplay(t);
  }
  function iframePause(t) {
    if (t.host === 'youtube') {
      iframePost(t, [{ event: 'command', func: 'pauseVideo', args: [] }]);
    } else if (t.host === 'vimeo') {
      iframePost(t, [{ method: 'pause' }]);
    } else if (t.host === 'hotmart') {
      iframePost(t, [{ event: 'PAUSE' }, { event: 'pause' }, { event: 'TOGGLE_PLAY' }]);
    } else {
      iframePost(t, [{ type: 'pause' }, { method: 'pause' }, 'pause', { action: 'pause' }]);
    }
  }

  function setSpeed(s) {
    speed = s;
    targets.forEach(function (t) {
      if (t.kind === 'video') { try { t.el.playbackRate = s; } catch (e) {} }
      else if (t.host === 'youtube') iframePost(t, [{ event: 'command', func: 'setPlaybackRate', args: [s] }]);
      else if (t.host === 'vimeo') iframePost(t, [{ method: 'setPlaybackRate', value: s }]);
      else iframePost(t, [
        hotmartMsg('PLAYBACK_SPEED', { playback_speed: s }),
        hotmartMsg('PLAYBACK_SPEED', { speed: s }),
        hotmartMsg('PLAYBACK_SPEED', { rate: s }),
        hotmartMsg('PLAYBACK_RATE', { playback_rate: s }),
        hotmartMsg('PLAYBACK_RATE', { rate: s }),
        hotmartMsg('SET_PLAYBACK_SPEED', { playback_speed: s }),
        hotmartMsg('SET_PLAYBACK_SPEED', { speed: s }),
        hotmartMsg('SET_PLAYBACK_RATE', { rate: s }),
        hotmartMsg('SPEED', { speed: s }),
        hotmartMsg('SPEED', { rate: s }),
        { event: 'PLAYBACK_SPEED', playback_speed: s },
        { event: 'PLAYBACK_SPEED', speed: s },
        { event: 'PLAYBACK_SPEED', value: s },
        { event: 'PLAYBACK_SPEED', data: { speed: s } },
        { event: 'PLAYBACK_SPEED', data: s },
        { event: 'PLAYBACK_RATE', rate: s },
        { event: 'PLAYBACK_RATE', value: s },
        { type: 'playback_speed', value: s },
        { method: 'setPlaybackSpeed', value: s },
        { method: 'setPlaybackRate', value: s }
      ]);
    });
    if (window._wq) {
      try { window._wq.push({ id: '_all', onReady: function (v) { try { v.playbackRate(s); } catch (e) {} }}); } catch (e) {}
    }
    persist(); render();
  }

  window.addEventListener('message', function (e) {
    var srcTarget = null;
    for (var i = 0; i < targets.length; i++) {
      if (targets[i].kind === 'iframe' && e.source === targets[i].el.contentWindow) { srcTarget = targets[i]; break; }
    }
    if (!srcTarget) return;
    var data = e.data, s;
    try { s = (typeof data === 'string') ? data : JSON.stringify(data); } catch (err) { return; }
    if (!s) return;
    if (!/"event"\s*:\s*"PROGRESS"/.test(s)) {
      try { console.log('[svp ' + VERSION + ']', srcTarget.host, data); } catch (err) {}
    }
    var tm = s.match(/"(?:currentTime|current_time|playedSeconds|position|time|seconds)"\s*:\s*([\d.]+)/);
    if (tm) {
      var key = srcTarget.el.getAttribute('data-attachment-id') || srcTarget.el.id || srcTarget.el.getAttribute('src');
      lastTimes[key] = parseFloat(tm[1]);
    }
    if (srcTarget !== targets[idx]) return;
    if (srcTarget.host === 'youtube' && /"playerState"\s*:\s*0\b/.test(s)) { next(); return; }
    if (srcTarget.host === 'vimeo' && /"event"\s*:\s*"finish"|"method"\s*:\s*"finish"/.test(s)) { next(); return; }
    if (srcTarget.host === 'hotmart' && /"event"\s*:\s*"(?:ENDED|END|FINISHED|COMPLETE|COMPLETED)"/i.test(s)) { next(); return; }
    if (/"event"\s*:\s*"(?:ended|finished|finish|complete|completed)"/i.test(s)) { next(); return; }
  });

  function render() {
    var base = targets.length ? 'Video ' + (idx + 1) + '/' + targets.length : 'No video on page';
    if (targets[idx]) base += ' (' + targets[idx].host + ')';
    status.textContent = base + ' · ' + speed + '×' + (paused ? ' · paused' : '') + (autoNext ? ' · auto' : '');
  }

  function focusTarget(t) {
    var el = t.el;
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { el.scrollIntoView(); }
    if (t.kind === 'video') { try { el.focus({ preventScroll: true }); } catch (e) {} }
    el.style.outline = '3px solid #2563eb';
    el.style.outlineOffset = '2px';
  }
  function clearFocus(t) { if (t && t.el) { t.el.style.outline = ''; t.el.style.outlineOffset = ''; } }

  function play(i, opts) {
    if (i < 0) return;
    if (i >= targets.length) {
      if (autoNext) gotoNext(); else status.textContent = 'Done';
      return;
    }
    targets.forEach(function (t, j) {
      if (j !== i) {
        if (t.kind === 'video') { try { t.el.pause(); } catch (e) {} }
        else iframePause(t);
        clearFocus(t);
      }
    });
    idx = i;
    var t = targets[i];
    focusTarget(t);
    if (t.kind === 'video') {
      try { t.el.playbackRate = speed; } catch (e) {}
      var p = t.el.play();
      if (p && p.catch) p.catch(function () { t.el.muted = true; t.el.play().catch(function () {}); });
    } else {
      iframePlay(t);
    }
    render();
    if (t.kind === 'iframe' && t.host === 'hotmart') {
      status.textContent = 'Click play in the highlighted video — auto-advance will take over';
    }
  }

  function next() { if (targets.length) { clearFocus(targets[idx]); play(idx + 1, { forceReload: true }); } else gotoNext(); }
  function prev() { if (targets.length) { clearFocus(targets[idx]); play(Math.max(0, idx - 1), { forceReload: true }); } }

  targets.forEach(function (t) {
    if (t.kind === 'video') {
      t.el.addEventListener('ended', function () { if (targets[idx] === t) next(); });
    }
  });

  try {
    window._wq = window._wq || [];
    window._wq.push({ id: '_all', onReady: function (video) {
      try { video.playbackRate(speed); } catch (e) {}
      try { video.bind('end', function () {
        var cur = targets[idx];
        if (cur && cur.host === 'wistia') next();
        else if (autoNext) gotoNext();
      }); } catch (e) {}
    }});
  } catch (e) {}

  targets.forEach(function (t) {
    if (t.host === 'youtube' && t.el.contentWindow) {
      try { t.el.contentWindow.postMessage(JSON.stringify({ event: 'listening' }), '*'); } catch (e) {}
    }
  });

  ui.addEventListener('click', function (e) {
    var t = e.target;
    if (t.id === 'svp-x') { cleanup(); return; }
    var a = t.getAttribute && t.getAttribute('data-act');
    var s = t.getAttribute && t.getAttribute('data-spd');
    if (s) setSpeed(parseFloat(s));
    if (a === 'next') next();
    else if (a === 'prev') prev();
    else if (a === 'restart') { idx = -1; play(0, { forceReload: true }); }
    else if (a === 'reload') { var c = targets[idx]; if (c && c.kind === 'iframe') { reloadWithAutoplay(c); status.textContent = 'Reloading…'; } }
    else if (a === 'gotonext') gotoNext();
    else if (a === 'pause') {
      var cur = targets[idx]; if (!cur) return;
      if (cur.kind === 'video') {
        if (cur.el.paused) { cur.el.play(); paused = false; } else { cur.el.pause(); paused = true; }
      } else {
        if (paused) { iframePlay(cur); paused = false; } else { iframePause(cur); paused = true; }
      }
      render();
    }
  });

  function cleanup() {
    targets.forEach(function (t) {
      if (t.kind === 'video') { try { t.el.pause(); } catch (e) {} }
      else iframePause(t);
      clearFocus(t);
    });
    ui.remove();
    document.body.style.paddingTop = prevBodyPadTop;
    pushedFixed.forEach(function (p) { p.el.style.top = p.prevTop; });
    pushedFixed = [];
    delete window.__seqVidPlayer;
  }

  window.__seqVidPlayer = { toggle: cleanup };
  try { console.log('[svp ' + VERSION + '] activated, targets:', targets.length, targets.map(function(t){return t.host;})); } catch (e) {}
  if (targets.length) play(0); else render();
})();
