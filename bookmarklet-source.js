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
    // Modern Teachable courses use "Complete and Continue" buttons with these classes.
    // Older courses had explicit next-lecture links. Sidebar `.next-lecture` is unreliable
    // because Teachable also tags the *current* lecture as `.next-lecture` when it's
    // the next thing the user should complete — clicking it reloads the same page.
    var here = location.pathname;
    function valid(el) {
      if (!el) return false;
      var href = el.tagName === 'A' ? (el.getAttribute('href') || '') : '';
      // Skip self-links (sidebar entry pointing to current lecture).
      if (href && href === here) return false;
      return true;
    }
    var sels = [
      'a.lecture-complete',
      'a.btn.complete',
      'a.nav-btn.complete',
      'a.next-lecture-button',
      'a.lecture-navigation-link.next-lecture',
      '[data-qa="lecture-complete-continue"]',
      'a.complete-and-continue',
      '.next-lecture a',
      '.lecture-navigation-link[href*="/lectures/"]+.lecture-navigation-link'
    ];
    for (var i = 0; i < sels.length; i++) {
      var el = document.querySelector(sels[i]);
      if (valid(el)) return el;
    }
    var cands = Array.from(document.querySelectorAll('a, button'));
    for (var j = 0; j < cands.length; j++) {
      var t = (cands[j].textContent || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (t === 'next lecture' || t === 'complete & continue' || t === 'complete and continue' || t === 'next') {
        if (valid(cands[j])) return cands[j];
      }
    }
    return null;
  }

  function applyHotmartSpeedLock() {
    var allHm = targets.length > 0 && targets.every(function (t) { return t.kind === 'iframe' && t.host === 'hotmart'; });
    Array.from(ui.querySelectorAll('.svp-spd')).forEach(function (b) {
      b.disabled = allHm;
      b.setAttribute('aria-disabled', String(allHm));
      b.title = allHm ? 'Speed control not available for Hotmart — use the gear icon ⚙ in the player' : '';
    });
    var grp = ui.querySelector('#svp-spd-group');
    if (grp) grp.setAttribute('aria-label', allHm ? 'Playback speed (disabled — use Hotmart’s gear icon)' : 'Playback speed');
  }

  function rescanAndPlay() {
    var newTargets = [];
    Array.from(document.querySelectorAll('video, iframe')).forEach(function (el) {
      if (el.tagName === 'VIDEO') {
        if (el.offsetParent !== null || el.readyState > 0) newTargets.push({ kind: 'video', el: el, host: 'native' });
        return;
      }
      var src = el.getAttribute('src') || '';
      for (var i = 0; i < iframeHosts.length; i++) {
        if (iframeHosts[i].match.test(src)) { newTargets.push({ kind: 'iframe', el: el, host: iframeHosts[i].host }); return; }
      }
    });
    if (newTargets.length === 0) return false;
    targets = newTargets;
    idx = -1;
    applyHotmartSpeedLock();
    play(0);
    return true;
  }

  function gotoNext() {
    var l = findNext();
    if (!l) { status.textContent = 'No next-lecture link found'; return; }
    status.textContent = 'Advancing…';
    var prevUrl = location.href;
    l.click();
    // Teachable navigates between lectures via pushState (SPA), so the bookmarklet
    // survives — but our targets array is now stale. Poll for URL change + new
    // iframe, then re-scan and (best-effort) play.
    var attempts = 0;
    var poll = setInterval(function () {
      attempts++;
      if (attempts > 30 || !window.__seqVidPlayer) { clearInterval(poll); return; }
      if (location.href === prevUrl) return;
      if (rescanAndPlay()) clearInterval(poll);
    }, 500);
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
  ui.setAttribute('role', 'toolbar');
  ui.setAttribute('aria-label', 'Sequential video player controls');
  ui.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:rgba(15,23,42,.97);color:#fff;font:13px/1.3 system-ui,sans-serif;padding:6px 12px;box-shadow:0 2px 10px rgba(0,0,0,.35);user-select:none;display:flex;align-items:center;gap:10px;flex-wrap:wrap';
  ui.innerHTML =
    '<strong style="margin-right:6px">Seq Player ' + VERSION + '</strong>' +
    '<span id="svp-status" role="status" aria-live="polite" style="opacity:.85;min-width:160px"></span>' +
    '<span role="group" aria-label="Playback controls" style="display:flex;gap:4px">' +
      '<button type="button" data-act="prev" aria-label="Previous video" title="Previous video">⏮</button>' +
      '<button type="button" data-act="pause" id="svp-pause" aria-label="Pause" title="Pause / Play">⏸</button>' +
      '<button type="button" data-act="next" aria-label="Next video" title="Next video">⏭</button>' +
      '<button type="button" data-act="restart" aria-label="Restart from first video" title="Restart from first video">↻</button>' +
      '<button type="button" data-act="reload" aria-label="Reload current video" title="Reload current video">Reload vid</button>' +
      '<button type="button" data-act="gotonext" aria-label="Go to next lecture" title="Go to next lecture">Next lec</button>' +
    '</span>' +
    '<span id="svp-spd-group" role="group" aria-label="Playback speed" style="display:flex;gap:4px">' +
      '<button type="button" class="svp-spd" data-spd="0.5" aria-label="Speed 0.5 times">0.5×</button>' +
      '<button type="button" class="svp-spd" data-spd="1" aria-label="Speed 1 times (normal)">1×</button>' +
      '<button type="button" class="svp-spd" data-spd="1.25" aria-label="Speed 1.25 times">1.25×</button>' +
      '<button type="button" class="svp-spd" data-spd="1.5" aria-label="Speed 1.5 times">1.5×</button>' +
      '<button type="button" class="svp-spd" data-spd="1.75" aria-label="Speed 1.75 times">1.75×</button>' +
      '<button type="button" class="svp-spd" data-spd="2" aria-label="Speed 2 times">2×</button>' +
      '<button type="button" class="svp-spd" data-spd="3" aria-label="Speed 3 times">3×</button>' +
    '</span>' +
    '<label style="display:flex;gap:6px;align-items:center;font-size:12px">' +
      '<input type="checkbox" id="svp-auto">Auto-advance lectures</label>' +
    '<button type="button" id="svp-x" aria-label="Close player toolbar" title="Close" style="background:transparent;color:#fff;border:0;cursor:pointer;padding:0 6px;margin-left:auto;font-size:22px;line-height:1">×</button>';

  Array.from(ui.querySelectorAll('button')).forEach(function (b) {
    if (b.id === 'svp-x') return;
    b.style.cssText = 'background:#1e293b;color:#fff;border:1px solid #334155;border-radius:4px;padding:4px 8px;cursor:pointer;font:12px system-ui';
  });
  // Focus-visible outline + disabled styling, scoped via a stylesheet so we don't fight inline styles per-button.
  var styleEl = document.createElement('style');
  styleEl.textContent =
    '[role="toolbar"][aria-label="Sequential video player controls"] button:focus-visible{' +
      'outline:2px solid #fbbf24;outline-offset:2px;}' +
    '[role="toolbar"][aria-label="Sequential video player controls"] button[disabled]{' +
      'opacity:.4 !important;cursor:not-allowed !important;}' +
    '[role="toolbar"][aria-label="Sequential video player controls"] button[aria-pressed="true"]{' +
      'background:#2563eb;border-color:#3b82f6;}';
  ui.appendChild(styleEl);
  document.body.appendChild(ui);
  shiftTopFixed(BAR_H);

  var status = ui.querySelector('#svp-status');
  var autoCb = ui.querySelector('#svp-auto');
  autoCb.checked = autoNext;
  autoCb.addEventListener('change', function () { autoNext = autoCb.checked; persist(); render(); });

  // Disable speed buttons if every target is Hotmart (cross-origin player owns its own speed UI).
  applyHotmartSpeedLock();

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
    var hasHotmart = false;
    targets.forEach(function (t) {
      if (t.kind === 'video') { try { t.el.playbackRate = s; } catch (e) {} }
      else if (t.host === 'youtube') iframePost(t, [{ event: 'command', func: 'setPlaybackRate', args: [s] }]);
      else if (t.host === 'vimeo') iframePost(t, [{ method: 'setPlaybackRate', value: s }]);
      else if (t.host === 'hotmart') { hasHotmart = true; }
    });
    if (window._wq) {
      try { window._wq.push({ id: '_all', onReady: function (v) { try { v.playbackRate(s); } catch (e) {} }}); } catch (e) {}
    }
    persist(); render();
    if (hasHotmart) {
      status.textContent = 'Hotmart speed: use the gear icon ⚙ in the player (cross-origin can’t set it)';
    }
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
    var pBtn = ui.querySelector('#svp-pause');
    if (pBtn) {
      pBtn.textContent = paused ? '▶' : '⏸';
      pBtn.setAttribute('aria-label', paused ? 'Play' : 'Pause');
    }
    Array.from(ui.querySelectorAll('.svp-spd')).forEach(function (b) {
      var bs = parseFloat(b.getAttribute('data-spd'));
      b.setAttribute('aria-pressed', bs === speed ? 'true' : 'false');
    });
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
    if (t.disabled) return;
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
