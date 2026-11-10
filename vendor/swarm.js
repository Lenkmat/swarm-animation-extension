/*
 * swarm-animation: plays a "team of agents is building this page" animation over a
 * finished web page. It works best on static pages and has no dependencies.
 *
 *   <script src="swarm.js" data-auto></script>   plays on load
 *   Swarm.run({ agents: 20, speed: 1.5 })        plays from code
 *   Swarm.skip()                                 jumps to the finished page
 *
 * Mark an element with data-swarm-skip to leave it out, or data-swarm="media"
 * to reveal it as one block. The real content stays in the DOM throughout, so
 * search engines and screen readers still get it, and links stay clickable.
 * Visitors who prefer reduced motion get the finished page straight away.
 */
(function () {
  'use strict';

  const DEFAULTS = {
    agents: 28,
    mobileAgents: 10,
    speed: 1,
    tour: true,          // scroll the page automatically as it builds
    returnToTop: true,   // scroll back to the top when finished
    replayButton: false, // leave a replay button on the page afterwards
    once: false,         // play only once per browser
    targetSeconds: 15,   // long pages speed up to finish in about this time
    maxSeconds: 40,      // always show the finished page after this long
    storageKey: 'swarm-played',
  };

  const COLORS = ['#ffe27a', '#8ff0b0', '#ffb37a', '#d9b8ff', '#7fe3e0', '#ff9ab0', '#a9c6ff', '#f2f2f2'];
  const SPEEDS = [1, 2, 4];
  const MEDIA = new Set(['IMG', 'SVG', 'CANVAS', 'VIDEO', 'PICTURE', 'IFRAME']);

  const CSS = `
  html.sw-boot body { opacity: 0 !important; }
  .sw-nopaint { background: transparent !important; background-image: none !important; border-color: transparent !important; box-shadow: none !important; }
  .sw-hide { opacity: 0 !important; }
  .sw-ghost { opacity: 0; }
  @media print { .sw-hide, .sw-ghost { opacity: 1 !important; } .sw-layer { display: none !important; } }
  .sw-layer { position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; overflow: hidden; transition: opacity .35s; font: 500 10px/1 ui-monospace, Menlo, Consolas, monospace; }
  .sw-layer * { box-sizing: border-box; }
  .sw-layer.sw-out { opacity: 0; }
  .sw-abs { position: absolute; left: 0; top: 0; will-change: transform; }
  .sw-sel { border: 1.5px solid #2f7bff; transition: opacity .2s; }
  .sw-sel.sw-red { border-color: #ff3b47; }
  .sw-sel.sw-out, .sw-fill.sw-out, .sw-line.sw-out, .sw-guide.sw-out, .sw-clone.sw-out { opacity: 0; }
  .sw-handle { position: absolute; width: 7px; height: 7px; background: #fff; border: 1.5px solid #2f7bff; border-radius: 1px; }
  .sw-red .sw-handle { border-color: #ff3b47; }
  .sw-h0 { left: -4px; top: -4px; } .sw-h1 { right: -4px; top: -4px; } .sw-h2 { left: -4px; bottom: -4px; } .sw-h3 { right: -4px; bottom: -4px; }
  .sw-badge { position: absolute; left: 50%; top: calc(100% + 5px); transform: translateX(-50%); padding: 3px 5px; border-radius: 2px; background: #2f7bff; color: #fff; white-space: nowrap; }
  .sw-red .sw-badge { background: #ff3b47; }
  .sw-fill { background: rgba(142, 158, 180, .5); transition: opacity .18s; }
  .sw-line { background: #2f7bff; height: 2px; width: 2px; transition: opacity .25s; box-shadow: 0 0 6px rgba(47,123,255,.8); }
  .sw-guide { background: #ff3b47; transition: opacity .25s; }
  .sw-clone { white-space: nowrap; transition: opacity .12s; }
  .sw-cursor { width: 0; height: 0; transition: opacity .3s; filter: drop-shadow(0 1px 2px rgba(0,0,0,.55)); }
  .sw-cursor svg { position: absolute; display: none; overflow: visible; }
  .sw-cursor[data-mode=arrow] .sw-i-arrow, .sw-cursor[data-mode=cross] .sw-i-cross, .sw-cursor[data-mode=text] .sw-i-text, .sw-cursor[data-mode=pen] .sw-i-pen { display: block; }
  .sw-i-arrow { left: 0; top: 0; } .sw-i-cross { left: -9px; top: -9px; } .sw-i-text { left: -5px; top: -10px; } .sw-i-pen { left: 0; top: -18px; }
  .sw-bar { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 2147483001; display: flex; align-items: center; gap: 10px; max-width: calc(100vw - 32px); padding: 7px 8px 7px 12px; border: 1px solid rgba(255,255,255,.12); border-radius: 12px; background: rgba(20,21,26,.92); color: #e9e9ec; box-shadow: 0 8px 30px rgba(0,0,0,.4); font: 500 12px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; white-space: nowrap; transition: opacity .3s; }
  .sw-bar.sw-out { opacity: 0; pointer-events: none; }
  .sw-dots { display: flex; }
  .sw-dots i { width: 11px; height: 11px; margin-left: -3px; border-radius: 50%; border: 1.5px solid #14151a; }
  .sw-dots i:first-child { margin-left: 0; }
  .sw-count { font-variant-numeric: tabular-nums; }
  .sw-count b { font-weight: 600; }
  .sw-count span { color: #a1a3ab; }
  .sw-track { width: 64px; height: 2px; border-radius: 2px; background: rgba(255,255,255,.18); overflow: hidden; }
  .sw-track i { display: block; height: 100%; width: 100%; background: #5b93ff; transform-origin: left; transform: scaleX(0); }
  .sw-btn { all: unset; box-sizing: border-box; min-width: 28px; height: 26px; padding: 0 8px; border-radius: 7px; background: rgba(255,255,255,.1); color: inherit; font: inherit; text-align: center; line-height: 26px; cursor: pointer; }
  .sw-btn:hover { background: rgba(255,255,255,.2); }
  .sw-btn:focus-visible { outline: 2px solid #5b93ff; outline-offset: 1px; }
  .sw-btn[aria-pressed=false] { color: #8d8f98; background: transparent; }
  .sw-replay { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 2147483001; height: 34px; padding: 0 14px; line-height: 34px; background: rgba(20,21,26,.92); border: 1px solid rgba(255,255,255,.14); color: #e9e9ec; font: 500 12px/34px ui-sans-serif, system-ui, sans-serif; }
  @media (max-width: 560px) { .sw-track, .sw-dots { display: none; } .sw-bar { gap: 7px; } }
  `;

  const icon = (name, w, h, body) =>
    `<svg class="sw-i-${name}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${body}</svg>`;
  const cursorMarkup = (c) =>
    icon('arrow', 18, 20, `<path d="M1 1l5.2 16 2.9-6.3L16 8z" fill="${c}" stroke="#14151a" stroke-width="1.2" stroke-linejoin="round"/>`) +
    icon('cross', 18, 18, `<path d="M9 1v16M1 9h16" stroke="#14151a" stroke-width="4.5" stroke-linecap="round"/><path d="M9 1.5v15M1.5 9h15" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>`) +
    icon('text', 10, 20, `<path d="M2 1.5h6M5 1.5v17M2 18.5h6" stroke="#14151a" stroke-width="3.6" stroke-linecap="round"/><path d="M2 1.5h6M5 1.5v17M2 18.5h6" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>`) +
    icon('pen', 18, 18, `<path d="M1 17l1.6-5L13 1.6l3.4 3.4L6 15.4z" fill="${c}" stroke="#14151a" stroke-width="1.2" stroke-linejoin="round"/>`);

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (t) => t * t * (3 - 2 * t);
  const rand = (a, b) => a + Math.random() * (b - a);
  const prefersStill = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = (cls, parent, tag) => {
    const n = document.createElement(tag || 'div');
    n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  };
  const fadeOut = (node, ms) => {
    if (!node) return;
    node.classList.add('sw-out');
    setTimeout(() => node.remove(), ms || 240);
  };
  const visibleAlpha = (color) => {
    if (!color || color === 'transparent') return false;
    const m = color.match(/rgba?\(([^)]+)\)/);
    if (!m) return true;
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    return parts.length < 4 || parseFloat(parts[3]) > 0;
  };

  function injectStyles() {
    if (document.getElementById('sw-styles')) return;
    const s = document.createElement('style');
    s.id = 'sw-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------- Scanning: turn the page into a list of layers ---------- */

  function paintOf(node, cs, rect) {
    const bg = visibleAlpha(cs.backgroundColor) || cs.backgroundImage !== 'none';
    const sides = ['Top', 'Right', 'Bottom', 'Left'].filter((s) =>
      parseFloat(cs['border' + s + 'Width']) > 0 &&
      cs['border' + s + 'Style'] !== 'none' &&
      visibleAlpha(cs['border' + s + 'Color']));
    if (!bg && !sides.length) return null;
    if (rect.height <= 4 || rect.width <= 4) return { type: 'rule', edge: rect.height <= 4 ? 'h' : 'v' };
    if (!bg && sides.length === 1) return { type: 'rule', edge: sides[0] };
    return { type: 'box' };
  }

  function isMedia(node) {
    return MEDIA.has(node.tagName.toUpperCase()) || node.getAttribute('data-swarm') === 'media';
  }

  function inlineOnly(node) {
    for (const child of node.children) {
      if (isMedia(child)) return false;
      if (child.tagName === 'BR') continue;
      const d = getComputedStyle(child).display;
      if (d !== 'inline' && d !== 'contents') return false;
      if (!inlineOnly(child)) return false;
    }
    return true;
  }

  function textNodesOf(node, deep) {
    const out = [];
    node.childNodes.forEach((c) => {
      if (c.nodeType === 3 && c.data.trim()) out.push(c);
      else if (deep && c.nodeType === 1) out.push(...textNodesOf(c, true));
    });
    return out;
  }

  function scan(root) {
    const layers = [];
    const visit = (node) => {
      if (node.hasAttribute('data-swarm-skip')) return;
      const cs = getComputedStyle(node);
      // Things hidden at load, like closed menus, are left for the page to show.
      // The root is exempt because the body is transparent while the script boots.
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      if (node !== root && parseFloat(cs.opacity) === 0) return;
      const rect = node.getBoundingClientRect();
      if (isMedia(node)) {
        if (rect.width > 1 && rect.height > 1) layers.push({ type: 'media', el: node, d: 1.25 });
        return;
      }
      let box = null;
      if (node !== root && node !== document.body) {
        const paint = paintOf(node, cs, rect);
        if (paint) {
          box = { el: node, type: paint.type, edge: paint.edge, d: paint.type === 'rule' ? 0.5 : 0.55 };
          layers.push(box);
        }
      }
      const leaf = inlineOnly(node);
      const nodes = textNodesOf(node, leaf);
      if (nodes.length) layers.push({ type: 'text', el: node, after: box, textNodes: nodes, leaf, pre: cs.whiteSpace.startsWith('pre') });
      if (!leaf) for (const child of node.children) visit(child);
    };
    visit(root);
    linkDuplicates(layers);
    return layers;
  }

  /* Repeated short items (nav links, stats) are built by copying the first one
     and then correcting the text. */
  function linkDuplicates(layers) {
    const groups = new Map();
    layers.forEach((l) => {
      if (l.type !== 'text' || !l.leaf) return;
      const size = l.textNodes.reduce((n, t) => n + t.data.trim().length, 0);
      if (size > 28 || l.el.children.length) return;
      const scope = l.el.parentElement && l.el.parentElement.parentElement;
      if (!scope) return;
      const key = l.el.tagName + '|' + l.el.className;
      if (!groups.has(scope)) groups.set(scope, new Map());
      const byKey = groups.get(scope);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(l);
    });
    groups.forEach((byKey) => byKey.forEach((list) => {
      if (list.length < 3) return;
      list.slice(1).forEach((l) => { l.dupOf = list[0]; });
    }));
  }

  /* ---------- Hiding and restoring layer content ---------- */

  function prepare(l) {
    if (l.type === 'media') l.el.classList.add('sw-hide');
    else if (l.type === 'box' || l.type === 'rule') l.el.classList.add('sw-nopaint');
    else {
      l.parts = l.textNodes.map((n) => {
        const original = n.data;
        const shown = l.pre ? original : original.replace(/\s+/g, ' ');
        const ghost = document.createElement('sw-ghost'); // a custom tag, so page CSS like "nav span" can't match it
        ghost.className = 'sw-ghost';
        ghost.textContent = shown;
        // In flex and grid layouts, split text would become two items and shift
        // the layout, so keep both parts together in one wrapper.
        let wrap = null;
        if (/flex|grid/.test(getComputedStyle(n.parentNode).display)) {
          wrap = document.createElement('sw-wrap');
          wrap.className = 'sw-wrap';
          n.parentNode.insertBefore(wrap, n);
          wrap.appendChild(n);
        }
        n.parentNode.insertBefore(ghost, n.nextSibling);
        n.data = '';
        return { n, original, shown, ghost, wrap };
      });
      l.chars = l.parts.reduce((sum, p) => sum + p.shown.length, 0);
      l.d = l.dupOf ? 0.85 : clamp(l.chars * 0.014, 0.28, 1.15);
      l.typed = 0;
      l.range = document.createRange();
      l.range.selectNodeContents(l.el);
    }
  }

  function setTyped(l, count) {
    if (count === l.typed) return;
    l.typed = count;
    let left = count;
    for (const p of l.parts) {
      const k = Math.min(left, p.shown.length);
      left -= k;
      p.n.data = p.shown.slice(0, k);
      p.ghost.firstChild.data = p.shown.slice(k);
    }
  }

  function commit(l) {
    if (l.committed) return;
    l.committed = true;
    if (l.type === 'media') {
      l.el.classList.remove('sw-hide');
      l.el.style.clipPath = '';
    } else if (l.type === 'box' || l.type === 'rule') {
      l.el.classList.remove('sw-nopaint');
    } else {
      l.parts.forEach((p) => {
        p.n.data = p.original;
        p.ghost.remove();
        if (p.wrap) {
          if (p.wrap.parentNode) p.wrap.parentNode.insertBefore(p.n, p.wrap);
          p.wrap.remove();
        }
      });
    }
  }

  /* ---------- One playback ---------- */

  function createRun(options) {
    const opt = Object.assign({}, DEFAULTS, options);
    const small = innerWidth < 768;
    const maxAgents = small ? opt.mobileAgents : opt.agents;
    let frameCandidates = null;
    const layers = scan(document.body);
    layers.forEach(prepare);

    // Estimate the build time from the amount of work and scrolling, then speed
    // up as needed so long pages and small screens don't keep visitors waiting.
    const workSeconds = layers.reduce((sum, l) => sum + l.d + 0.2, 0) / maxAgents;
    const scrollSeconds = (document.documentElement.scrollHeight / innerHeight) * 2.2;
    const sizeRate = clamp((workSeconds + scrollSeconds) / opt.targetSeconds, 1, 4);

    const pending = layers.slice();
    const total = layers.length;
    let done = 0;
    let speed = opt.speed;
    let tour = opt.tour;
    let stopped = false;
    let ending = false;
    let elapsed = 0;
    let lastFrame = 0;
    let lastUser = -1e9;
    let userScrolled = false;
    let camTarget = null;
    let camY = scrollY;
    let calmSince = 0;
    let lastProgress = performance.now();
    let endStart = 0;
    let raf = 0;

    const layer = el('sw-layer');
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);

    const agents = Array.from({ length: maxAgents }, (_, i) => {
      const node = el('sw-cursor sw-abs', layer);
      const color = COLORS[i % COLORS.length];
      node.innerHTML = cursorMarkup(color);
      node.dataset.mode = 'arrow';
      node.style.opacity = 0;
      const x = rand(0, innerWidth);
      const y = rand(0, innerHeight);
      return { node, color, x, y, mx: x, my: y, tx: x, ty: y, on: false, task: null, wanderAt: 0, travel: 0 };
    });
    let activeCount = 0;

    /* Control bar */
    const bar = el('sw-bar');
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Page build animation controls');
    const dots = el('sw-dots', bar);
    COLORS.slice(0, 5).forEach((c) => { el('', dots, 'i').style.background = c; });
    const count = el('sw-count', bar);
    const track = el('sw-track', bar);
    const fill = el('', track, 'i');
    const tourBtn = el('sw-btn', bar, 'button');
    tourBtn.type = 'button';
    tourBtn.textContent = 'Tour';
    tourBtn.title = 'Scroll automatically as the page builds';
    tourBtn.setAttribute('aria-pressed', String(tour));
    const speedBtn = el('sw-btn', bar, 'button');
    speedBtn.type = 'button';
    speedBtn.setAttribute('aria-label', 'Change animation speed');
    speedBtn.textContent = speed + 'x';
    const closeBtn = el('sw-btn', bar, 'button');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Skip animation');
    closeBtn.textContent = '✕';
    document.body.appendChild(bar);

    tourBtn.onclick = () => {
      tour = !tour;
      tourBtn.setAttribute('aria-pressed', String(tour));
      camTarget = null;
    };
    speedBtn.onclick = () => {
      const i = SPEEDS.indexOf(speed);
      speed = SPEEDS[(i + 1) % SPEEDS.length];
      speedBtn.textContent = speed + 'x';
    };
    closeBtn.onclick = () => stop();

    const onUser = () => {
      lastUser = performance.now();
      userScrolled = true;
      camTarget = null;
    };
    const onKey = (e) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) onUser();
    };
    addEventListener('wheel', onUser, { passive: true });
    addEventListener('touchmove', onUser, { passive: true });
    addEventListener('keydown', onKey);

    /* ---------- Chrome (selection boxes and fills) ---------- */

    function makeSelection(l) {
      const sel = el('sw-sel sw-abs', layer);
      for (let i = 0; i < 4; i++) el('sw-handle sw-h' + i, sel);
      sel.badge = el('sw-badge', sel);
      l.sel = sel;
    }

    function place(node, x, y, w, h) {
      node.style.transform = `translate3d(${x}px,${y}px,0)`;
      node.style.width = Math.max(0, w) + 'px';
      node.style.height = Math.max(0, h) + 'px';
    }

    function placeSelection(l, x, y, w, h) {
      place(l.sel, x, y, w, h);
      const label = Math.round(w) + ' × ' + Math.round(h);
      if (l.sel.label !== label) {
        l.sel.label = label;
        l.sel.badge.textContent = label;
      }
    }

    function maybeGuide(rect) {
      if (Math.random() > 0.35) return;
      const g = el('sw-guide sw-abs', layer);
      place(g, rect.left - 1, 0, 1.5, innerHeight);
      setTimeout(() => fadeOut(g), 420 / speed);
    }

    function clearChrome(l) {
      fadeOut(l.sel);
      fadeOut(l.fill);
      fadeOut(l.line, 300);
      if (l.clone) { l.clone.remove(); l.clone = null; }
      l.sel = l.fill = l.line = null;
    }

    /* ---------- Assigning work ---------- */

    function rectOf(l) {
      return l.type === 'text' && l.leaf ? l.range.getBoundingClientRect() : l.el.getBoundingClientRect();
    }
    const inView = (r) => r.bottom > 0 && r.top < innerHeight;
    const ready = (l) => (!l.after || l.after.state === 'done') && (!l.dupOf || l.dupOf.state === 'done');

    // Layers that can be worked on now. Measured at most once per frame, because
    // measuring every layer for every idle cursor slows the page down badly.
    function candidates() {
      if (!frameCandidates) {
        frameCandidates = [];
        for (const l of pending.slice()) {
          // The page may have removed or hidden this since the scan. Don't wait for it.
          const r = l.el.isConnected ? rectOf(l) : null;
          if (!r || (r.width === 0 && r.height === 0)) {
            pending.splice(pending.indexOf(l), 1);
            commit(l);
            l.state = 'done';
            done++;
            lastProgress = performance.now();
            continue;
          }
          if (ready(l) && inView(r)) frameCandidates.push({ l, r });
        }
      }
      return frameCandidates;
    }

    function pick(agent) {
      const options = candidates();
      if (!options.length) return null;
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < Math.min(5, options.length); i++) {
        const o = options[i];
        const d = Math.hypot(o.r.left - agent.x, o.r.top - agent.y) * rand(0.7, 1.3);
        if (d < bestDist) { best = i; bestDist = d; }
      }
      const l = options.splice(best, 1)[0].l;
      pending.splice(pending.indexOf(l), 1);
      return l;
    }

    function startWork(agent, l) {
      l.state = 'active';
      l.p = 0;
      agent.working = true;
      agent.node.dataset.mode = l.type === 'rule' ? 'pen' : l.type === 'text' ? (l.dupOf ? 'arrow' : 'text') : 'cross';
      const r = l.rect;
      if (l.type === 'box' || l.type === 'media') {
        l.fill = el('sw-fill sw-abs', layer);
        makeSelection(l);
        maybeGuide(r);
      } else if (l.type === 'rule') {
        l.line = el('sw-line sw-abs', layer);
      } else {
        makeSelection(l);
        if (l.dupOf) {
          l.sel.classList.add('sw-red');
          const cs = getComputedStyle(l.dupOf.el);
          const clone = el('sw-clone sw-abs', layer);
          clone.textContent = l.dupOf.parts.map((p) => p.shown).join('').trim();
          ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight', 'textTransform', 'color'].forEach((k) => { clone.style[k] = cs[k]; });
          l.clone = clone;
        }
      }
    }

    function finish(agent, l) {
      commit(l);
      l.state = 'done';
      done++;
      lastProgress = performance.now();
      clearChrome(l);
      agent.task = null;
      agent.working = false;
      agent.node.dataset.mode = 'arrow';
      agent.wanderAt = 0;
    }

    /* ---------- Per-frame stages ---------- */

    // Stage 1: move progress on, and change the page's own DOM.
    function advance(agent, dt) {
      const l = agent.task;
      if (!l || !agent.working) return;
      l.p = Math.min(1, l.p + dt / l.d);
      if (l.type === 'text') {
        const q = l.dupOf ? clamp((l.p - 0.55) / 0.45, 0, 1) : l.p;
        setTyped(l, Math.round(q * l.chars));
      } else if ((l.type === 'box') && l.p > 0.55) {
        l.el.classList.remove('sw-nopaint');
      } else if (l.type === 'media' && l.p > 0.33) {
        l.el.classList.remove('sw-hide');
        const q = ease((l.p - 0.33) / 0.67);
        l.el.style.clipPath = `inset(0 0 ${(1 - q) * 100}% 0)`;
      }
      if (l.p >= 1) finish(agent, l);
    }

    // Stage 2: read the geometry in one go, so layout runs once per frame.
    function measure(agent) {
      const l = agent.task;
      if (!l) return;
      l.rect = rectOf(l);
      if (l.dupOf) l.fromRect = l.dupOf.range.getBoundingClientRect();
      if (l.type === 'text' && agent.working && !(l.dupOf && l.p < 0.55)) {
        const part = l.parts.find((p) => p.ghost.firstChild.data.length) || l.parts[l.parts.length - 1];
        l.caret = part.ghost.getClientRects()[0] || null;
      }
    }

    // Stage 3: draw the overlay and set where each cursor is heading.
    function render(agent) {
      const l = agent.task;
      if (!l) return;
      const r = l.rect;
      if (!agent.working) {
        const from = l.dupOf ? l.fromRect : r;
        agent.tx = l.dupOf ? from.left + from.width / 2 : from.left;
        agent.ty = l.type === 'text' && !l.dupOf ? from.top + from.height / 2 : from.top + (l.dupOf ? from.height / 2 : 0);
        return;
      }
      const p = l.p;
      if (l.type === 'text') {
        if (l.dupOf) {
          const f = l.fromRect;
          if (p < 0.55) {
            const q = ease(Math.min(1, p / 0.4));
            const x = f.left + (r.left - f.left) * q;
            const y = f.top + (r.top - f.top) * q;
            l.clone.style.transform = `translate3d(${x}px,${y}px,0)`;
            placeSelection(l, x - 2, y - 2, f.width + 4, f.height + 4);
            agent.tx = x + f.width / 2;
            agent.ty = y + f.height / 2;
          } else {
            if (l.clone) {
              l.clone.remove();
              l.clone = null;
              l.sel.classList.remove('sw-red');
              agent.node.dataset.mode = 'text';
            }
            placeSelection(l, r.left - 2, r.top - 2, r.width + 4, r.height + 4);
          }
        } else {
          placeSelection(l, r.left - 2, r.top - 2, r.width + 4, r.height + 4);
        }
        if (l.caret && (!l.dupOf || p >= 0.55)) {
          agent.tx = l.caret.left;
          agent.ty = l.caret.top + l.caret.height / 2;
        }
      } else if (l.type === 'box') {
        const q = ease(Math.min(1, p / 0.55));
        const w = r.width * q;
        const h = r.height * q;
        place(l.fill, r.left, r.top, w, h);
        l.fill.style.opacity = p > 0.55 ? 1 - (p - 0.55) / 0.45 : 1;
        l.fill.style.borderRadius = getRadius(l);
        placeSelection(l, r.left, r.top, w, h);
        agent.tx = r.left + w;
        agent.ty = r.top + h;
      } else if (l.type === 'media') {
        const q = ease(Math.min(1, p / 0.33));
        const w = r.width * q;
        const h = r.height * q;
        place(l.fill, r.left, r.top, w, h);
        if (p > 0.33) {
          const wipe = ease((p - 0.33) / 0.67) * 100;
          l.fill.style.clipPath = `inset(${wipe}% 0 0 0)`;
        }
        placeSelection(l, r.left, r.top, w, h);
        agent.tx = r.left + w;
        agent.ty = r.top + h;
      } else if (l.type === 'rule') {
        const q = ease(p);
        const vertical = l.edge === 'v' || l.edge === 'Left' || l.edge === 'Right';
        const y = l.edge === 'Bottom' ? r.bottom - 1 : r.top;
        const x = l.edge === 'Right' ? r.right - 1 : r.left;
        if (vertical) {
          place(l.line, x, r.top, 2, r.height * q);
          agent.tx = x;
          agent.ty = r.top + r.height * q;
        } else {
          place(l.line, r.left, y, r.width * q, 2);
          agent.tx = r.left + r.width * q;
          agent.ty = y;
        }
      }
    }

    function getRadius(l) {
      if (l.radius === undefined) l.radius = getComputedStyle(l.el).borderRadius;
      return l.radius;
    }

    function moveCursor(agent, dt) {
      const k = agent.working ? 26 : 9;
      const a = 1 - Math.exp(-k * dt);
      const b = 1 - Math.exp(-(k * 1.6) * dt);
      agent.mx += (agent.tx - agent.mx) * a;
      agent.my += (agent.ty - agent.my) * a;
      agent.x += (agent.mx - agent.x) * b;
      agent.y += (agent.my - agent.y) * b;
      agent.node.style.transform = `translate3d(${agent.x}px,${agent.y}px,0)`;
    }

    function camera(dt, now) {
      if (ending) return;
      if (!tour || now - lastUser < 1500) return;
      if (camTarget === null) {
        const busy = agents.filter((a) => a.task).length;
        let wantsScroll = false;
        if (pending.length && busy <= Math.max(2, activeCount * 0.15)) {
          wantsScroll = !candidates().length && !inView(rectOf(pending[0]));
        }
        if (!wantsScroll) {
          calmSince = 0;
        } else {
          // Hold for a moment so each finished screen can be seen before moving on.
          if (!calmSince) calmSince = now;
          if (now - calmSince > 650 / (speed * sizeRate)) {
            const max = document.documentElement.scrollHeight - innerHeight;
            camTarget = clamp(scrollY + rectOf(pending[0]).top - innerHeight * 0.16, 0, max);
            camY = scrollY;
            calmSince = 0;
          }
        }
      }
      if (camTarget !== null) {
        camY += (camTarget - camY) * (1 - Math.exp(-3.4 * dt));
        scrollTo({ top: camY, behavior: 'instant' });
        if (Math.abs(camTarget - camY) < 2) camTarget = null;
      }
    }

    function updateBar() {
      const text = `<b>${activeCount}</b> <span>agents</span> &nbsp;<b>${done}</b> <span>/ ${total} layers</span>`;
      if (count.lastText !== text) {
        count.lastText = text;
        count.innerHTML = text;
        fill.style.transform = `scaleX(${total ? done / total : 1})`;
      }
    }

    /* ---------- Main loop ---------- */

    // Any error ends the animation and shows the finished page, never a blank one.
    function frame(now) {
      try {
        tick(now);
      } catch (e) {
        console.error('swarm.js stopped early', e);
        stop();
      }
    }

    function tick(now) {
      if (stopped) return;
      const real = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0.016;
      lastFrame = now;
      const dt = real * speed * sizeRate;
      elapsed += dt;
      frameCandidates = null;

      const want = Math.min(maxAgents, Math.round(8 + elapsed * 8));
      while (activeCount < want) {
        const a = agents[activeCount++];
        a.on = true;
        a.node.style.opacity = 1;
      }

      // Assign free agents and start the ones that have arrived.
      for (const a of agents) {
        if (!a.on) continue;
        if (!a.task && pending.length && !ending) {
          const l = pick(a);
          if (l) {
            l.state = 'assigned';
            l.rect = rectOf(l);
            a.task = l;
            a.travel = 0;
          }
        }
        if (a.task && !a.working) {
          a.travel += dt;
          const r = a.task.dupOf ? a.task.dupOf.range.getBoundingClientRect() : a.task.rect;
          const near = Math.hypot(a.x - (a.tx ?? r.left), a.y - (a.ty ?? r.top)) < 16;
          if ((a.travel > 0.08 && near) || a.travel > 0.55) {
            a.task.rect = rectOf(a.task);
            if (a.task.dupOf) a.task.fromRect = r;
            startWork(a, a.task);
          }
        }
      }

      agents.forEach((a) => advance(a, dt));
      agents.forEach(measure);
      agents.forEach(render);

      for (const a of agents) {
        if (!a.on) continue;
        if (!a.task && now > a.wanderAt) {
          a.tx = rand(innerWidth * 0.05, innerWidth * 0.95);
          a.ty = rand(innerHeight * 0.08, innerHeight * 0.88);
          a.wanderAt = now + rand(500, 1500) / speed;
        }
        moveCursor(a, dt);
      }

      camera(real * Math.sqrt(speed * sizeRate), now);
      updateBar();

      // If a layer can never come into view, don't hang: finish it directly.
      if (pending.length && tour && now - lastUser > 1500 && now - lastProgress > 2500 && !agents.some((a) => a.task)) {
        const l = pending.shift();
        commit(l);
        l.state = 'done';
        done++;
        lastProgress = now;
      }

      if (!ending && done === total) beginEnding(now);
      if (ending) {
        const moved = opt.returnToTop && !userScrolled && now - lastUser > 1500;
        if (moved && camY > 0) {
          camY *= Math.exp(-3.6 * real);
          if (camY < 6) camY = 0;
          scrollTo({ top: camY, behavior: 'instant' });
        }
        if (now - endStart > 1000 && (!moved || camY === 0)) { stop(); return; }
      }
      raf = requestAnimationFrame(frame);
    }

    function beginEnding(now) {
      ending = true;
      endStart = now;
      camY = scrollY;
      for (const a of agents) {
        a.wanderAt = Infinity;
        a.tx = a.x < innerWidth / 2 ? -40 : innerWidth + 40;
        a.ty = a.y + rand(-160, 160);
      }
      layer.classList.add('sw-out');
      bar.classList.add('sw-out');
    }

    function stop() {
      if (stopped) return;
      stopped = true;
      clearTimeout(watchdog);
      cancelAnimationFrame(raf);
      layers.forEach(commit);
      removeEventListener('wheel', onUser);
      removeEventListener('touchmove', onUser);
      removeEventListener('keydown', onKey);
      layer.remove();
      bar.remove();
      if (current === api) current = null;
      if (opt.once) { try { localStorage.setItem(opt.storageKey, '1'); } catch (e) { /* storage blocked */ } }
      if (opt.replayButton) showReplay(opt);
    }

    // On a very slow device or a throttled tab, frames can nearly stop. Don't keep
    // visitors waiting: after this long, jump straight to the finished page.
    const watchdog = setTimeout(() => {
      stop();
      if (opt.returnToTop && !userScrolled) scrollTo({ top: 0, behavior: 'instant' });
    }, opt.maxSeconds * 1000);

    updateBar();
    raf = requestAnimationFrame(frame);
    const api = { stop, state: () => ({ done, total, agents: activeCount, elapsed, ending, pending: pending.length }) };
    return api;
  }

  /* ---------- Public API ---------- */

  let current = null;
  let replayEl = null;

  function showReplay(opt) {
    if (replayEl) replayEl.remove();
    replayEl = el('sw-btn sw-replay', document.body, 'button');
    replayEl.type = 'button';
    replayEl.textContent = '↻ Replay build';
    replayEl.onclick = () => {
      scrollTo({ top: 0, behavior: 'instant' });
      run(opt);
    };
  }

  function run(options) {
    injectStyles();
    if (current) current.stop();
    if (replayEl) { replayEl.remove(); replayEl = null; }
    current = createRun(options);
    return current;
  }

  window.Swarm = {
    run,
    skip: () => current && current.stop(),
    state: () => (current ? current.state() : null),
  };

  /* ---------- Auto start ---------- */

  const script = document.currentScript;
  if (!script || !script.hasAttribute('data-auto')) return;

  const auto = {
    agents: Number(script.dataset.agents) || DEFAULTS.agents,
    speed: Number(script.dataset.speed) || DEFAULTS.speed,
    once: script.hasAttribute('data-once'),
    replayButton: script.hasAttribute('data-replay'),
  };
  let played = false;
  try { played = auto.once && localStorage.getItem(DEFAULTS.storageKey) === '1'; } catch (e) { /* storage blocked */ }
  if (prefersStill() || played) return;

  injectStyles();
  const docEl = document.documentElement;
  docEl.classList.add('sw-boot');
  const unboot = () => docEl.classList.remove('sw-boot');
  setTimeout(unboot, 3000); // never leave the page blank if something goes wrong

  const start = async () => {
    try {
      if (document.fonts && document.fonts.ready) {
        await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 800))]);
      }
      scrollTo({ top: 0, behavior: 'instant' });
      run(auto);
    } catch (e) {
      console.error('swarm.js could not start', e);
    } finally {
      unboot();
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
