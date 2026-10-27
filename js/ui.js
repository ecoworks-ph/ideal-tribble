/* =========================================================================
   FALLEN OATH — Interface: screens, HUD, panels, dialogs
   ========================================================================= */
(function () {
  'use strict';
  const G = (window.G = window.G || {});
  const C = G.CONFIG;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => Math.floor(n).toLocaleString('en-US');

  const ui = (G.ui = { screen: 'loading', panel: null, tab: null, cache: {}, pickSkill: null });

  // ------------------------------------------------------------ screens
  ui.show = function (name) {
    ['loading', 'title', 'class', 'hub', 'hud'].forEach((s) => {
      const el = $(s === 'hud' ? 'hud' : 'screen-' + s);
      el.classList.toggle('active', s === name);
    });
    ui.screen = name;
    document.getElementById('app').classList.toggle('screen-hub-mode', name !== 'hud');
    const P = G.profile && G.PATHS[G.profile.path]; // the current hero tints the interface
    document.getElementById('app').style.setProperty('--hero', P ? P.color : '#ffc23d');
    if (name === 'hub') ui.refreshHub();
    if (name === 'title') {
      $('btn-continue').disabled = !G.hasSave();
      drawTitleHeroes();
    }
  };

  // a hero's face (the idle sprite, head and shoulders) on a small canvas
  ui.drawFace = function (cv, pathId) {
    const P = G.PATHS[pathId];
    if (!cv || !P) return;
    const g = cv.getContext('2d'), S = cv.width;
    g.clearRect(0, 0, S, S); g.imageSmoothingEnabled = false;
    const key = G.tintedSheet('adv_idle_down', P.heroTint), sh = G.SHEETS[key], im = G.img('sheet:' + key);
    if (!im || !sh) return;
    const k = (S / 96) * 3.1;
    g.drawImage(im, 0, 0, sh.fw, sh.fh, S / 2 - 47 * k, S * 0.56 - 40 * k, sh.fw * k, sh.fh * k);
  };
  function drawTitleHeroes() {
    const box = $('title-heroes');
    if (!box || box.childElementCount) return;
    Object.keys(G.PATHS).forEach((id) => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 108;
      cv.style.setProperty('--c', G.PATHS[id].color); cv.title = G.PATHS[id].name;
      box.appendChild(cv); ui.drawFace(cv, id);
    });
  }

  // ------------------------------------------------------------ class select (New Game / GM)
  // mode: 'new' or 'gm'; onPick(pathId)
  ui.chooseClass = function (mode, onPick, onBack) {
    const list = $('class-list');
    list.innerHTML = '';
    const cur = mode === 'switch' && G.profile ? G.profile.path : null;
    $('class-title-text') && ($('class-title-text').textContent = mode === 'switch' ? 'Switch hero' : 'Choose your hero');
    $('class-sub').textContent = mode === 'switch' ? 'GM account: level, gear and progress stay; the new hero is maxed out'
      : mode === 'gm' ? 'GM account: the hero you pick is maxed out' : 'One hero per save.';
    const ids = Object.keys(G.PATHS);
    let sel = cur || ids[0];
    const heroes = [];
    // a row of hero faces to pick from, and one card for the picked hero (fits on one screen)
    const tabs = el('<div class="hero-tabs" role="tablist"></div>');
    const feature = el('<div class="hero-feature"></div>');
    list.appendChild(tabs); list.appendChild(feature);
    ids.forEach((id) => {
      const P = G.PATHS[id];
      const t = document.createElement('button');
      t.className = 'hero-tab'; t.setAttribute('role', 'tab'); t.setAttribute('aria-label', P.name);
      t.style.setProperty('--cc', P.color);
      const cv = document.createElement('canvas'); cv.width = cv.height = 116;
      t.appendChild(cv); ui.drawFace(cv, id);
      t.onclick = () => { sel = id; render(); };
      tabs.appendChild(t);
    });
    function render() {
      const P = G.PATHS[sel];
      [...tabs.children].forEach((t, i) => { const on = ids[i] === sel; t.classList.toggle('on', on); t.setAttribute('aria-selected', on); });
      const acts = P.actives.filter((k) => !G.SKILLS[k].ult).slice(0, 4), ult = G.ultSkill(sel);
      const ico = (k, n) => `<i style='${G.fxIconStyle(G.SKILLS[k].icon[0], G.SKILLS[k].icon[1], n, G.SKILLS[k].icon[2])}'></i>`;
      feature.style.setProperty('--cc', P.color);
      feature.innerHTML = `<div class="hf-top"><canvas class="hero" width="128" height="140"></canvas>
          <div class="hf-name">${sel === 'storm' ? '<b class="tag">Locked v1</b>' : P.draft ? '<b class="tag">Draft</b>' : ''}${sel === cur ? '<b class="tag">Current</b>' : ''}
          <h3>${esc(P.name)}</h3><div class="el">${esc(P.element)}</div></div></div>
        <p>${esc(P.desc)}</p>
        <div class="hf-skills">${acts.map((k) => `<span>${ico(k, 30)}${esc(G.SKILLS[k].name)}</span>`).join('')}</div>
        ${ult ? `<div class="hf-ult">${ico(ult, 38)}<div><small>Ultimate</small><b>${esc(G.SKILLS[ult].name)}</b></div></div>` : ''}`;
      const b = btn(sel === cur ? 'Current hero' : (mode === 'switch' ? 'Switch to ' : 'Play as ') + P.name, '', () => { heroes.length = 0; onPick(sel); }, sel === cur);
      b.classList.add('hf-go');
      feature.appendChild(b);
      heroes.length = 0;
      heroes.push({ cv: feature.querySelector('canvas'), tint: P.heroTint, sprite: P.heroSprite });
    }
    render();
    $('class-back').onclick = () => { heroes.length = 0; if (onBack) onBack(); else ui.show('title'); };
    ui.show('class');
    // idle hero preview of the picked hero (the class tint is applied to the same Adventurer sheet the game uses)
    const t0 = performance.now();
    const tick = () => {
      if (ui.screen !== 'class') return;
      const f = Math.floor((performance.now() - t0) / 125);
      heroes.forEach((h) => {
        const g = h.cv.getContext('2d'), W = h.cv.width, H = h.cv.height;
        g.clearRect(0, 0, W, H); g.imageSmoothingEnabled = false;
        const key = G.tintedSheet('adv_idle_down', h.tint), sh = G.SHEETS[key], im = G.img('sheet:' + key);
        if (im && sh) g.drawImage(im, (f % sh.n) * sh.fw, 0, sh.fw, sh.fh, W / 2 - 47 * 3, H - 6 - 57 * 3, sh.fw * 3, sh.fh * 3);
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  // ------------------------------------------------------------ toasts / banner
  const lastToast = {};
  ui.toast = function (msg, kind, color) {
    const now = performance.now();
    if (lastToast[msg] && now - lastToast[msg] < 1500) return; // suppress repeated identical toasts
    lastToast[msg] = now;
    const box = $('toasts');
    while (box.children.length > 3) box.firstChild.remove();
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    if (color) { t.style.borderColor = color; t.style.color = color; }
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.remove(), 2900);
  };
  let bannerTimer = 0;
  ui.banner = function (title, sub) {
    const b = $('banner');
    b.querySelector('b').textContent = title;
    b.querySelector('span').textContent = sub || '';
    b.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => b.classList.remove('show'), 1800);
  };
  ui.bossBar = function (e) {
    ui.boss = e;
    $('bossbar').hidden = !e;
    if (e) $('boss-name').textContent = e.def.name + '  ·  Lv ' + e.level;
  };

  // ------------------------------------------------------------ badges
  function claimable() { return G.QUESTS.filter((q) => { const s = G.profile.quests[q.id]; return s && s.done && !s.claimed; }).length; }
  function learnableSkills() {
    const p = G.profile;
    if (!p.path) return 1;
    return G.SKILL_ORDER.filter((k) => !G.skillBlock(p, k)).length;
  }
  ui.updateBadges = function () {
    const p = G.profile;
    if (!p) return;
    const set = (id, n) => { const el = $(id); if (!el) return; el.textContent = n > 0 ? n : ''; el.classList.toggle('on', n > 0); };
    const q = claimable(), sk = !p.path ? 1 : learnableSkills() ? p.skillPoints : 0;
    set('badge-hero', p.attrPoints); set('hbadge-hero', p.attrPoints);
    set('badge-skills', sk); set('hbadge-skills', sk);
    set('badge-quests', q); set('hbadge-quests', q);
    ui.badgeCounts = { hero: p.attrPoints, skills: sk, quests: q };
    const total = (p.attrPoints > 0) + (sk > 0) + (q > 0); // a dot on the profile when anything needs attention
    ['badge-profile', 'hbadge-profile'].forEach((id) => { const e = $(id); if (e) e.classList.toggle('on', total > 0); });
  };

  // ------------------------------------------------------------ profile menu (tap your hero plate or face)
  const MENU_ICONS = {
    hero: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    bag: '<path d="M6 8h12l-1 13H7z"/><path d="M9 8V6a3 3 0 016 0v2"/>',
    skills: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    quests: '<path d="M6 3h10l3 3v15H6z"/><path d="M9 9h7M9 13h7M9 17h4"/>',
    shop: '<path d="M3 9l2-5h14l2 5"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/>',
    map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  };
  ui.profileMenu = function () {
    const p = G.profile;
    if (!p) return;
    const inRun = !!(G.game.run && !G.game.run.finished);
    const P = G.PATHS[p.path];
    const items = [['hero', 'Hero'], ['bag', 'Bag'], ['skills', 'Skills'], ['quests', 'Quests'], inRun ? ['map', 'World map'] : ['shop', 'Shop'], ['settings', 'Settings']];
    const card = $('sheet-card');
    card.innerHTML = '';
    card.classList.add('menu-card');
    const head = el(`<div class="menu-head"><canvas width="104" height="104"></canvas><div><h4>${esc(p.gm ? 'Game Master' : 'Adventurer')}</h4><p>Level ${p.level}${P ? ' ' + esc(P.name) : ''}</p></div></div>`);
    card.appendChild(head); ui.drawFace(head.querySelector('canvas'), p.path);
    const grid = el('<div class="menu-grid"></div>');
    const counts = ui.badgeCounts || {};
    items.forEach(([key, label]) => {
      const b = document.createElement('button');
      b.className = 'menu-tile';
      b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${MENU_ICONS[key]}</svg><span>${label}</span>` +
        (counts[key] > 0 ? `<b class="badge on">${counts[key]}</b>` : '');
      b.onclick = () => { closeMenu(); ui.open(key); };
      grid.appendChild(b);
    });
    card.appendChild(grid);
    const close = btn('Close', 'ghost', () => closeMenu());
    card.appendChild(close);
    $('sheet').hidden = false;
    if (G.game.run) { G.game.paused = true; G.input.reset(); }
  };
  function closeMenu() { $('sheet-card').classList.remove('menu-card'); closeSheet(); }

  // ------------------------------------------------------------ hub
  const thumbs = {};
  function areaThumb(area) {
    if (thumbs[area.id]) return thumbs[area.id];
    const map = G.buildArea(area);
    const c = document.createElement('canvas');
    c.width = 96; c.height = 96;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const s = 96 / 200, ox = -(map.W / 2 - 100), oy = -(area.theme === 'shrine' || area.theme === 'trial' ? 60 : 40);
    g.setTransform(s, 0, 0, s, ox * s, oy * s);
    g.drawImage(map.ground, 0, 0);
    map.deco.forEach((d) => (d.floor || d.top || d.key === 'wallFront') && G.drawDeco(g, d));
    map.props.slice().sort((a, b) => a.y - b.y).forEach((pr) => G.drawProp(g, pr.key, pr.x, pr.y));
    thumbs[area.id] = c;
    return c;
  }
  function thumbCopy(area) {
    const src = areaThumb(area);
    const c = document.createElement('canvas');
    c.width = 96; c.height = 96;
    c.getContext('2d').drawImage(src, 0, 0); // canvas-to-canvas copy works even from file:// (no toDataURL)
    return c;
  }

  // a strip of the region's first area map, behind its banner (built once, copied canvas-to-canvas)
  const regionArts = {};
  function regionArt(r) {
    if (!regionArts[r.id]) {
      const area = G.AREAS.find((a) => a.region === r.id && !a.endless);
      const c = document.createElement('canvas'); c.width = 320; c.height = 96;
      if (area) {
        const map = G.buildArea(area), g = c.getContext('2d');
        g.imageSmoothingEnabled = false;
        const s = 320 / map.W, oy = -150;
        g.setTransform(s, 0, 0, s, 0, oy * s);
        g.drawImage(map.ground, 0, 0);
        map.props.slice().sort((p, q) => p.y - q.y).forEach((pr) => G.drawProp(g, pr.key, pr.x, pr.y));
      }
      regionArts[r.id] = c;
    }
    const c = document.createElement('canvas'); c.width = 320; c.height = 96; c.className = 'art';
    c.getContext('2d').drawImage(regionArts[r.id], 0, 0);
    return c;
  }

  const STAR_PATH = 'M12 2.5l2.8 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3l-6.1 3.5 1.6-6.8-5.2-4.6 6.9-.6z';
  function starSvg(on, cls) { return `<svg class="star${on ? ' on' : ''}${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`; }
  ui.starSvg = starSvg;
  function starsRow(mask, cls) { return `<span class="stars ${cls || ''}" aria-label="${G.objectives.count(mask)} of 3 stars">${[1, 2, 4].map((b) => starSvg(mask & b)).join('')}</span>`; }

  // the area brief: what to do, the three stars, then Enter
  function areaBrief(a) {
    const p = G.profile, st = p.areas[a.id] || {}, mask = G.objectives.mask(st), def = G.AREA_OBJ[a.id], card = $('sheet-card');
    card.innerHTML = ''; card.classList.remove('menu-card');
    const lines = G.objectives.starLines(a);
    card.appendChild(el(`<div class="brief">
      <div class="brief-head"><h4>${esc(a.name)}</h4><span class="chip obj-${def.type}">${G.OBJ_LABEL[def.type]}</span></div>
      <p class="brief-goal">${esc(G.objectives.goal(a))}</p>
      <p class="note">${esc(G.objectives.detail(a))}</p>
      <div class="brief-stars">${lines.map((l, i) => `<div class="bs${mask & (1 << i) ? ' got' : ''}">${starSvg(mask & (1 << i))}<span>${esc(l.label)}</span></div>`).join('')}</div>
      <div class="brief-meta"><span class="chip ${p.level >= a.level ? 'ok' : 'warn'}">Rec. Lv ${a.level}</span>${st.best != null && def.type !== 'survive' ? `<span class="chip">Best ${G.mmss(st.best)}</span>` : ''}${mask === 7 ? '<span class="chip ok">Star chest claimed</span>' : '<span class="chip chip-chest">3 stars: star chest</span>'}</div>
      ${p.level < a.level - 1 ? `<p class="note warn-note">You are level ${p.level}. This area is meant for level ${a.level}.</p>` : ''}
    </div>`));
    const acts = el('<div class="sheet-actions" style="margin-top:12px"></div>');
    acts.appendChild(btn('Close', 'ghost', closeSheet));
    acts.appendChild(btn('Enter', 'primary', () => { closeSheet(); ui.show('hud'); G.game.startArea(a.id); }));
    card.appendChild(acts);
    $('sheet').hidden = false;
  }

  function areaCard(a) {
    const p = G.profile;
    const st = p.areas[a.id];
    const unlocked = st && st.unlocked;
    const card = document.createElement('button');
    card.className = 'area-card' + (unlocked ? '' : ' locked');
    const lvClass = p.level >= a.level ? 'ok' : 'warn';
    const prevName = G.AREAS[G.AREAS.indexOf(a) - 1];
    const elite = (a.waves || []).some((w) => w.some((e) => e[2]));
    const def = G.AREA_OBJ[a.id], mask = G.objectives.mask(st);
    card.innerHTML =
      '<span class="thumb"></span>' +
      `<div><h4>${esc(a.name)}</h4><p>${esc(unlocked ? a.desc : 'Clear ' + (prevName ? prevName.name : 'the previous area') + ' to unlock.')}</p>` +
      `<div class="meta"><span class="chip ${lvClass}">Rec. Lv ${a.level}</span>` +
      (a.endless ? `<span class="chip">Best wave ${p.bestWave}</span>` : def ? `<span class="chip obj-${def.type}">${G.OBJ_LABEL[def.type]}</span>` : `<span class="chip">${a.waves.length} waves</span>`) +
      (!def && a.boss ? `<span class="chip boss">Boss</span>` : !def && elite ? `<span class="chip elite">Elite</span>` : '') + '</div></div>' +
      (def && unlocked ? starsRow(mask, 'card-stars') : '');
    if (unlocked) card.querySelector('.thumb').replaceWith(thumbCopy(a));
    card.addEventListener('click', () => {
      if (!unlocked) { ui.toast('Locked — clear the previous area first', 'warn'); return; }
      if (!p.path) { ui.toast('Choose your path first', 'skill'); ui.open('skills'); return; }
      if (def) { areaBrief(a); return; }
      const go = () => { ui.show('hud'); G.game.startArea(a.id); };
      if (p.level < a.level - 1) ui.confirm('This area is recommended for level ' + a.level + '. Enter anyway?', go, { yes: 'Enter' });
      else go();
    });
    return card;
  }

  ui.refreshHub = function () {
    const p = G.profile;
    if (!p) return;
    $('hub-lv').textContent = p.level;
    $('hub-name').textContent = (p.gm ? 'Game Master' : 'Adventurer') + (G.PATHS[p.path] ? ' · ' + G.PATHS[p.path].name : '');
    $('hub-gm').hidden = !p.gm;
    $('hub-switch').hidden = !p.gm;
    const need = C.xpForLevel(p.level);
    $('hub-xp').style.transform = 'scaleX(' + (p.level >= C.MAX_LEVEL ? 1 : Math.min(1, p.xp / need)) + ')';
    $('hub-xp-text').textContent = p.level >= C.MAX_LEVEL ? 'Max level' : fmt(p.xp) + ' / ' + fmt(need) + ' XP';
    $('hub-gold').textContent = fmt(p.gold);
    const list = $('area-list');
    list.innerHTML = '';
    // World Map grouped by region; the newest open region starts expanded
    const open = (a) => p.areas[a.id] && p.areas[a.id].unlocked;
    const newest = [...G.REGIONS].reverse().find((r) => G.AREAS.some((a) => a.region === r.id && open(a)));
    ui.regionOpen = ui.regionOpen || {};
    G.REGIONS.forEach((r) => {
      const areas = G.AREAS.filter((a) => a.region === r.id);
      const unlockedAny = areas.some(open);
      const cleared = areas.filter((a) => p.areas[a.id] && p.areas[a.id].cleared).length;
      const sec = document.createElement('section');
      sec.className = 'region' + (unlockedAny ? '' : ' locked');
      if (!unlockedAny) {
        const prev = G.REGIONS[G.REGIONS.indexOf(r) - 1], boss = prev && G.AREAS.filter((a) => a.region === prev.id && a.boss).pop();
        sec.innerHTML = `<div class="region-head"><div><h3>${esc(r.name)}</h3><p>Lv ${r.levels[0]} to ${r.levels[1]}. ${boss ? 'Defeat ' + esc(G.ENEMIES[boss.boss].name) + ' to unlock' : 'Locked'}</p></div><span class="region-lock">Locked</span></div>`;
        sec.firstChild.style.setProperty('--rc', r.color); sec.firstChild.prepend(regionArt(r));
        list.appendChild(sec); return;
      }
      const isOpen = ui.regionOpen[r.id] != null ? ui.regionOpen[r.id] : r === newest;
      const head = document.createElement('button');
      head.className = 'region-head';
      const rs = G.objectives.regionStars(p, r), rmax = G.objectives.regionMax(r);
      head.innerHTML = `<div><h3>${esc(r.name)}</h3><p>Lv ${r.levels[0]} to ${r.levels[1]}, ${cleared} of ${areas.length} cleared</p></div><span class="region-stars">${starSvg(true)}${rs}/${rmax}</span><span class="region-arrow">${isOpen ? '▾' : '▸'}</span>`;
      head.style.setProperty('--rc', r.color); head.prepend(regionArt(r));
      head.onclick = () => { ui.regionOpen[r.id] = !isOpen; ui.refreshHub(); };
      sec.appendChild(head);
      const step = p.regionClaims[r.id] || 0, need = G.objectives.MILESTONES[step];
      if (need != null) {
        const ready = rs >= need, rw = G.objectives.milestoneReward(r, step);
        const strip = el(`<div class="milestone${ready ? ' ready' : ''}"><div class="grow"><b>${ready ? 'Reward ready' : 'Next reward at ' + need + ' stars'}</b><span>${esc(rw.text)}</span></div><div class="ms-bar"><i style="transform:scaleX(${Math.min(1, rs / need)})"></i></div></div>`);
        if (ready) strip.appendChild(btn('Claim', 'small primary', () => {
          const res = G.objectives.claimMilestone(p, r);
          if (!res) return;
          if (res.full) { ui.toast('Bag is full. Make room first.', 'warn'); return; }
          G.save();
          ui.toast(res.item ? 'Region reward: ' + res.item.name : 'Region reward: ' + rw.text, 'loot', res.item ? G.rarityOf(res.item).color : undefined);
          ui.refreshHub();
        }));
        sec.appendChild(strip);
      }
      if (isOpen) {
        sec.appendChild(el(`<p class="region-desc">${esc(r.desc)}</p>`));
        areas.forEach((a) => sec.appendChild(areaCard(a)));
      }
      list.appendChild(sec);
    });
    ui.updateBadges();
  };

  // ------------------------------------------------------------ HUD
  function setW(id, pct) {
    const k = 'w_' + id, v = Math.max(0, Math.min(100, pct)).toFixed(1);
    if (ui.cache[k] !== v) { ui.cache[k] = v; $(id).style.transform = 'scaleX(' + (v / 100) + ')'; }
  }
  function setT(id, txt) {
    const k = 't_' + id;
    if (ui.cache[k] !== txt) { ui.cache[k] = txt; $(id).textContent = txt; }
  }

  ui.onRunStart = function (run) {
    ui.cache = {};
    ui.drawFace($('hud-face'), G.profile.path);
    document.getElementById('app').style.setProperty('--hero', (G.PATHS[G.profile.path] || {}).color || '#ffc23d');
    ui.bossBar(null);
    ui.refreshSkillButtons();
    $('hud').classList.toggle('lefty', !!G.profile.settings.leftHanded);
    ui.updateBadges();
  };

  ui.refreshSkillButtons = function () {
    const p = G.profile;
    document.querySelectorAll('.act.skill').forEach((b) => {
      const i = +b.dataset.slot, key = G.barSkill(p, i);
      const ico = b.querySelector('.ico');
      b.classList.toggle('empty', !key);
      b.classList.toggle('ult', i === G.ULT_SLOT);
      if (key) {
        const sk = G.SKILLS[key];
        ico.setAttribute('style', G.fxIconStyle(sk.icon[0], sk.icon[1], 56, sk.icon[2]));
        b.querySelector('small').textContent = sk.mp + ' MP';
        b.setAttribute('aria-label', sk.name);
      } else { ico.removeAttribute('style'); b.querySelector('small').textContent = ''; }
    });
  };

  ui.updateHUD = function () {
    const run = G.game.run;
    if (!run || ui.screen !== 'hud') return;
    const p = G.profile, pl = run.player, s = pl.stats;
    setT('hud-lv', String(p.level));
    setW('hud-hp', (pl.hp / s.maxHp) * 100); setT('hud-hp-text', Math.ceil(pl.hp) + ' / ' + s.maxHp);
    setW('hud-mp', (pl.mp / s.maxMp) * 100); setT('hud-mp-text', Math.floor(pl.mp) + ' / ' + s.maxMp);
    setW('hud-xp', p.level >= C.MAX_LEVEL ? 100 : (p.xp / C.xpForLevel(p.level)) * 100);
    setT('hud-gold', fmt(p.gold));
    setT('hp-count', String(G.invCount(p, 'hpPotion')));
    setT('mp-count', String(G.invCount(p, 'mpPotion')));
    // skills
    (ui.skillBtns || (ui.skillBtns = Array.from(document.querySelectorAll('.act.skill')))).forEach((b) => {
      const key = G.barSkill(p, +b.dataset.slot);
      const cdEl = b.querySelector('.cd');
      const cdf = b.cdf || (b.cdf = b.querySelector('.cdf'));
      if (!key) { if (cdEl.textContent) cdEl.textContent = ''; if (b.cdS) { b.cdS = 0; cdf.style.transform = 'scaleY(0)'; } return; }
      const sk = G.SKILLS[key], cd = pl.cds[key] || 0;
      const label = cd > 0 ? (cd < 1 ? cd.toFixed(1) : Math.ceil(cd)) + '' : '';
      const sc = cd > 0 ? Math.ceil((cd / sk.cd) * 50) / 50 : 0; // 2% steps
      if (cdEl.textContent !== label) cdEl.textContent = label;
      const ck = 'cdp_' + b.dataset.slot;
      if (ui.cache[ck] > 0 && cd <= 0) { b.classList.remove('ready'); void b.offsetWidth; b.classList.add('ready'); setTimeout(() => b.classList.remove('ready'), 700); }
      ui.cache[ck] = cd;
      if (b.cdS !== sc) { b.cdS = sc; cdf.style.transform = 'scaleY(' + sc + ')'; }
      b.classList.toggle('nomp', pl.mp < sk.mp);
    });
    // boss
    if (ui.boss) setW('boss-fill', (ui.boss.hp / ui.boss.maxHp) * 100);
    // buffs
    let bt = '';
    if (pl.buffTimers) Object.keys(pl.buffTimers).forEach((k) => (bt += `<div class="buff">${esc(G.SKILLS[k].name)} ${Math.ceil(pl.buffTimers[k])}s</div>`));
    if (ui.cache.buffs !== bt) { ui.cache.buffs = bt; $('buffs').innerHTML = bt; }
    // tracker (throttled)
    const now = performance.now();
    if (!ui.cache.trT || now - ui.cache.trT > 300) { ui.cache.trT = now; renderTracker(run); }
  };

  function renderTracker(run) {
    const p = G.profile, a = run.area;
    const alive = run.enemies.filter((e) => !e.dead).length + run.spawnQueue.length;
    let line;
    if (run.phase === 'cleared' || run.phase === 'victory') line = run.map.chest && !run.chestOpened ? '<b>Area cleared!</b> Open the chest' : '<b>Area cleared!</b>';
    else if (a.endless) line = `<b>Wave ${Math.max(1, run.waveIdx + 1)}</b> · Best ${p.bestWave} · Foes ${alive}`;
    else if (run.phase === 'boss') line = `<b>Boss fight</b> · Foes ${alive}`;
    else if (run.room) {
      const n = a.rooms.length, rt = run.room.type, head = `<b>Room ${run.room.idx + 1}/${n}</b> · `;
      if (run.phase === 'shrine') line = head + 'Touch the shrine';
      else if (run.phase === 'roomclear') line = head + 'Door open, go north';
      else line = head + (rt === 'elite' ? 'Defeat the elite' : rt === 'boss' ? 'Boss room' : 'Clear the room') + ` · Foes ${alive}`;
    } else line = (run.obj && G.objectives.trackerLine(run)) || `<b>Wave ${Math.max(1, Math.min(a.waves.length, run.waveIdx + 1))}/${a.waves.length}</b> · Foes ${alive}`;
    const def = G.AREA_OBJ[a.id];
    if (def && run.obj && !run.room && run.phase !== 'cleared' && run.phase !== 'victory') {
      const ok = G.objectives.liveChallenge(run), t = run.time;
      const timeLine = def.type === 'survive' ? '' : `<span class="${t <= def.par ? 'ok' : 'bad'}">${starSvg(t <= def.par, 'mini')} ${G.mmss(t)} / ${G.mmss(def.par)}</span> `;
      line += `<br>${timeLine}<span class="${ok === false ? 'bad' : 'ok'}">${starSvg(ok !== false, 'mini')} ${esc(G.objectives.challengeText(a))}</span>`;
    }
    const qs = G.QUESTS.filter((q) => G.questAvailable(p, q) && !(p.quests[q.id] && p.quests[q.id].claimed)).slice(0, run.obj ? 1 : 2);
    let html = line;
    qs.forEach((q) => {
      const st = G.questState(p, q);
      html += st.done ? `<br><span class="done">✓ ${esc(q.name)} — claim</span>` : `<br>${esc(q.name)} ${st.progress}/${q.count}`;
    });
    if (ui.cache.tracker !== html) { ui.cache.tracker = html; $('tracker').innerHTML = html; }
  }

  // ------------------------------------------------------------ panels
  const PANELS = {
    hero: { title: 'Hero', tabs: [['stats', 'Stats'], ['gear', 'Equipment']], render: renderHero },
    bag: { title: 'Bag', render: renderBag },
    skills: { title: 'Skills', render: renderSkills },
    quests: { title: 'Quest Journal', render: renderQuests },
    shop: { title: 'Merchant', tabs: [['buy', 'Buy'], ['sell', 'Sell']], render: renderShop },
    settings: { title: 'Settings', render: renderSettings },
    pause: { title: 'Paused', render: renderPause, center: true },
    result: { title: '', render: () => {}, center: true, locked: true },
  };

  ui.open = function (name, tab) {
    if (name === 'map') { // leave the current area
      if (!G.game.run || G.game.run.finished) { ui.close(true); ui.show('hub'); return; }
      ui.confirm('Leave this area? You keep all experience, gold and items gained so far.', () => { ui.close(true); G.game.leaveRun(); }, { yes: 'Leave', danger: true });
      return;
    }
    const def = PANELS[name];
    if (!def) return;
    if (name === 'shop' && G.game.run) { ui.toast('The merchant is only available on the World Map', 'warn'); return; }
    ui.panel = name;
    ui.tab = tab || (def.tabs ? def.tabs[0][0] : null);
    if (G.game.run) G.game.paused = true;
    G.input.reset();
    $('modal').hidden = false;
    $('modal').classList.toggle('center', !!def.center);
    $('panel-close').hidden = !!def.locked;
    ui.renderPanel();
  };
  ui.renderPanel = function () {
    const def = PANELS[ui.panel];
    if (!def) return;
    $('panel-title').textContent = def.title;
    const tabs = $('panel-tabs');
    tabs.innerHTML = '';
    (def.tabs || []).forEach(([id, label]) => {
      const t = document.createElement('button');
      t.className = 'tab' + (ui.tab === id ? ' on' : '');
      t.textContent = label;
      t.onclick = () => { ui.tab = id; ui.renderPanel(); };
      tabs.appendChild(t);
    });
    const body = $('panel-body');
    const top = body.scrollTop;
    body.innerHTML = '';
    def.render(body);
    body.scrollTop = top;
    ui.updateBadges();
  };
  ui.close = function (force) {
    const def = PANELS[ui.panel];
    if (def && def.locked && !force) return;
    $('modal').hidden = true;
    ui.panel = null;
    ui.pickSkill = null;
    $('sheet').hidden = true;
    if (G.game.run && !G.game.run.finished) { G.game.paused = false; ui.refreshSkillButtons(); }
    if (ui.screen === 'hub') ui.refreshHub();
    G.save();
  };

  function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
  function btn(label, cls, onClick, disabled) {
    const b = document.createElement('button');
    b.className = 'btn ' + (cls || '');
    b.textContent = label;
    b.disabled = !!disabled;
    b.onclick = onClick;
    return b;
  }

  // ---- hero
  function renderHero(body) {
    const p = G.profile;
    if (ui.tab === 'gear') { renderEquipment(body); return; }
    const s = G.calcStats(p, null);
    body.appendChild(el(`<div class="section-title">Level ${p.level} Adventurer</div>`));
    const need = C.xpForLevel(p.level);
    body.appendChild(el(`<div class="card"><div class="row"><div class="grow"><div class="bar xp"><i style="transform:scaleX(${p.level >= C.MAX_LEVEL ? 1 : Math.min(1, p.xp / need)})"></i></div></div>
      <span class="tiny muted">${p.level >= C.MAX_LEVEL ? 'MAX' : fmt(p.xp) + ' / ' + fmt(need) + ' XP'}</span></div></div>`));
    body.appendChild(el(`<div class="section-title">Attributes</div>`));
    const pts = el(`<div class="pts-row"><div class="note">Unspent points: <b style="color:var(--gold-2)">${p.attrPoints}</b> (gain ${C.ATTR_POINTS_PER_LEVEL} per level)</div></div>`);
    pts.appendChild(btn('Recommended', 'small rec-btn', () => {
      const n = G.autoAttrs(G.profile); if (!n) return;
      syncRunStats(); G.save(); ui.updateBadges(); ui.renderPanel(); ui.toast(n + ' point' + (n > 1 ? 's' : '') + ' spent for your hero', 'good');
    }, p.attrPoints <= 0));
    body.appendChild(pts);
    const st = el('<div class="stack"></div>');
    Object.keys(C.ATTR).forEach((k) => {
      const a = C.ATTR[k];
      const row = el(`<div class="attr-row a-${k}"><div class="grow"><div class="name">${a.name}</div><div class="desc">${a.desc}</div></div><div class="val">${p.attrs[k]}</div></div>`);
      const plus = document.createElement('button');
      plus.className = 'plus'; plus.textContent = '+'; plus.disabled = p.attrPoints <= 0;
      plus.setAttribute('aria-label', 'Add ' + a.name);
      plus.onclick = () => {
        if (G.profile.attrPoints <= 0) return;
        G.profile.attrPoints--; G.profile.attrs[k]++;
        syncRunStats();
        G.save(); ui.renderPanel();
      };
      row.appendChild(plus);
      st.appendChild(row);
    });
    body.appendChild(st);
    body.appendChild(el(`<div class="section-title">Combat stats</div>`));
    const grid = el('<div class="stats-grid"></div>');
    [['Max HP', s.maxHp], ['Max MP', s.maxMp], ['Attack', s.atk.toFixed(1)], ['Defense', s.def.toFixed(1)], ['Crit chance', (s.crit * 100).toFixed(1) + '%'],
      ['Crit damage', (s.critDmg * 100).toFixed(0) + '%'], ['Attack speed', (s.atkSpeed * 100).toFixed(0) + '%'], ['Move speed', s.moveSpeed.toFixed(0)],
      ['MP regen', s.mpRegen.toFixed(2) + '/s'], ['Skill power', (s.skillPower * 100).toFixed(0) + '%'],
      ['Damage taken', ((C.DEF_K / (C.DEF_K + s.def)) * 100).toFixed(0) + '%'], ['Enemies defeated', fmt(p.stats.kills)]].forEach(([k, v]) =>
      grid.appendChild(el(`<div class="stat"><span>${k}</span><b>${v}</b></div>`)));
    body.appendChild(grid);
  }

  function syncRunStats() {
    const run = G.game.run;
    if (!run) return;
    const pl = run.player, old = pl.stats;
    pl.stats = G.calcStats(G.profile, pl.buffs);
    if (pl.stats.maxHp > old.maxHp) pl.hp += pl.stats.maxHp - old.maxHp;
    if (pl.stats.maxMp > old.maxMp) pl.mp += pl.stats.maxMp - old.maxMp;
    pl.hp = Math.min(pl.hp, pl.stats.maxHp); pl.mp = Math.min(pl.mp, pl.stats.maxMp);
  }
  ui.syncRunStats = syncRunStats;

  const SLOT_NAMES = { weapon: 'Weapon', armor: 'Armor', accessory: 'Accessory' };
  const SLOT_TAG = { weapon: 'WPN', armor: 'ARM', accessory: 'ACC' };
  function equipRow() {
    const p = G.profile;
    const row = el('<div class="equip-row"></div>');
    Object.keys(SLOT_NAMES).forEach((slot) => {
      const it = p.equipped[slot];
      const b = document.createElement('button');
      b.className = 'slot' + (it ? ' filled r-' + it.rarity : '');
      b.innerHTML = `<div class="slot-label">${SLOT_NAMES[slot]}</div>` + (it ? G.itemIconHTML(it, 28, 'slot-ico') + `<div class="iname" style="color:${G.rarityOf(it).color}">${esc(it.name)}</div>` +
        G.itemStatLines(it.stats).slice(0, 2).map((l) => `<div class="tiny muted">${l.text} ${l.label}</div>`).join('') : '<div class="iname muted">Empty</div>');
      b.onclick = () => it && ui.itemSheet(it, 'equipped');
      row.appendChild(b);
    });
    return row;
  }
  function renderEquipment(body) {
    body.appendChild(el('<div class="section-title">Equipped</div>'));
    body.appendChild(equipRow());
    body.appendChild(el('<p class="note">Tap an equipped item to inspect or unequip it. Equip new gear from your Bag.</p>'));
    const gear = G.profile.inventory.filter((i) => i.kind === 'gear');
    body.appendChild(el(`<div class="section-title">Gear in bag (${gear.length})</div>`));
    body.appendChild(invGrid(gear, 'bag', false));
  }

  // ---- bag
  function isBetter(it) {
    const cur = G.profile.equipped[it.slot];
    const score = (x) => (x ? (x.stats.atk || 0) * 3 + (x.stats.def || 0) * 2.5 + (x.stats.maxHp || 0) * 0.3 + (x.stats.maxMp || 0) * 0.3 + (x.stats.crit || 0) * 300 + (x.stats.atkSpeed || 0) * 200 + (x.stats.mpRegen || 0) * 10 : 0);
    return score(it) > score(cur);
  }
  function invGrid(items, ctx, fill) {
    const grid = el('<div class="inv-grid"></div>');
    items.forEach((it) => {
      const b = document.createElement('button');
      if (it.kind === 'gear') {
        const r = G.rarityOf(it);
        b.className = 'inv r-' + it.rarity;
        b.innerHTML = (G.itemIconHTML(it, 36) || `<span class="tag" style="color:${r.color}">${SLOT_TAG[it.slot]}</span>`) + `<span class="nm" style="color:${r.color}">${esc(it.name)}</span>` + (isBetter(it) ? '<span class="better">▲</span>' : '');
      } else {
        const c = G.CONSUMABLES[it.key];
        b.className = 'inv r-common';
        b.innerHTML = (G.itemIconHTML(it, 36) || `<span class="tag">${it.key === 'tusk' ? 'MAT' : 'USE'}</span>`) + `<span class="nm">${esc(c.name)}</span><span class="qty">${it.qty}</span>`;
      }
      b.onclick = () => ui.itemSheet(it, ctx);
      grid.appendChild(b);
    });
    if (fill) for (let i = items.length; i < C.INVENTORY_SIZE; i++) grid.appendChild(el('<div class="inv empty"></div>'));
    return grid;
  }
  function renderBag(body) {
    const p = G.profile;
    body.appendChild(el('<div class="section-title">Equipped</div>'));
    body.appendChild(equipRow());
    body.appendChild(el(`<div class="cap"><span>Inventory</span><span>${p.inventory.length} / ${C.INVENTORY_SIZE} slots · <b style="color:var(--gold-2)">${fmt(p.gold)}g</b></span></div>`));
    body.appendChild(invGrid(p.inventory, 'bag', true));
    body.appendChild(el('<p class="note">▲ marks gear that looks stronger than what you wear. Tap any item for details.</p>'));
  }

  function statCompare(it) {
    const cur = G.profile.equipped[it.slot];
    if (!cur || cur.id === it.id) return '';
    const keys = new Set([...Object.keys(it.stats), ...Object.keys(cur.stats)]);
    let out = '';
    keys.forEach((k) => {
      const d = (it.stats[k] || 0) - (cur.stats[k] || 0);
      if (Math.abs(d) < 1e-6) return;
      const t = G.PCT_STATS[k] ? (d * 100).toFixed(1) + '%' : k === 'mpRegen' ? d.toFixed(2) : Math.round(d);
      out += `<div class="${d > 0 ? 'cmp-up' : 'cmp-down'}">${d > 0 ? '+' : ''}${t} ${G.STAT_LABEL[k]}</div>`;
    });
    return out ? `<div class="section-title" style="margin-top:4px">vs. equipped ${esc(cur.name)}</div>${out}` : '';
  }

  // ---- item detail sheet
  ui.itemSheet = function (it, ctx) {
    const p = G.profile, card = $('sheet-card');
    card.innerHTML = ''; card.classList.remove('menu-card');
    const acts = el('<div class="sheet-actions"></div>');
    if (it.kind === 'gear') {
      const r = G.rarityOf(it);
      card.appendChild(el(`<div>${G.itemIconHTML(it, 48, 'sheet-ico')}<h4 style="color:${r.color}">${esc(it.name)}</h4><div class="rar muted">${r.name} ${SLOT_NAMES[it.slot]} · Item level ${it.ilvl}</div>
        <div class="lines">${G.itemStatLines(it.stats).map((l) => `<div>${l.text} <span class="muted">${l.label}</span></div>`).join('')}</div>${ctx !== 'equipped' ? statCompare(it) : ''}</div>`));
      if (ctx === 'bag') {
        acts.appendChild(btn('Equip', 'primary', () => { G.equip(p, it.id); syncRunStats(); G.save(); closeSheet(); ui.renderPanel(); }));
        acts.appendChild(btn('Discard', 'danger', () => ui.confirm('Discard ' + it.name + '? This cannot be undone.', () => {
          const i = p.inventory.indexOf(it); if (i >= 0) p.inventory.splice(i, 1); G.save(); ui.renderPanel();
        }, { yes: 'Discard', danger: true })));
      } else if (ctx === 'equipped') {
        acts.appendChild(btn('Unequip', '', () => {
          if (!G.unequip(p, it.slot)) { ui.toast('Bag is full', 'warn'); return; }
          syncRunStats(); G.save(); closeSheet(); ui.renderPanel();
        }));
      } else if (ctx === 'sell') {
        const v = Math.round(it.value);
        acts.appendChild(btn('Sell for ' + v + 'g', 'primary', () => {
          const i = p.inventory.indexOf(it); if (i < 0) return;
          p.inventory.splice(i, 1); p.gold += v; G.save(); closeSheet(); ui.toast('Sold ' + it.name + ' for ' + v + 'g'); ui.renderPanel();
        }));
      } else if (ctx === 'buy') {
        const price = shopPrice(it);
        acts.appendChild(btn('Buy for ' + price + 'g', 'primary', () => {
          if (p.gold < price) { ui.toast('Not enough gold', 'warn'); return; }
          if (p.inventory.length >= C.INVENTORY_SIZE) { ui.toast('Bag is full', 'warn'); return; }
          const i = p.shop.stock.indexOf(it); if (i < 0) return;
          p.shop.stock.splice(i, 1); p.gold -= price; G.addGear(p, it); G.save(); closeSheet(); ui.toast('Bought ' + it.name); ui.renderPanel();
        }, p.gold < price));
      }
    } else {
      const c = G.CONSUMABLES[it.key];
      card.appendChild(el(`<div>${G.itemIconHTML(it, 48, 'sheet-ico')}<h4>${esc(c.name)}</h4><div class="rar muted">Owned: ${it.qty}</div><div class="lines"><div>${esc(c.desc)}</div></div></div>`));
      if (ctx === 'bag' && !c.material) {
        const inRun = !!G.game.run && !G.game.run.finished;
        acts.appendChild(btn('Use', 'primary', () => {
          G.game.paused = false;
          const ok = G.game.usePotion(it.key === 'hpPotion' ? 'hp' : 'mp');
          G.game.paused = true;
          if (ok) { closeSheet(); ui.renderPanel(); }
        }, !inRun));
        if (!inRun) card.appendChild(el('<p class="note">Potions can be used during an adventure. HP and MP are fully restored when you enter an area.</p>'));
      }
      if (ctx === 'sell') {
        acts.appendChild(btn('Sell 1 for ' + c.value + 'g', 'primary', () => {
          if (G.removeConsumable(p, it.key, 1)) { p.gold += c.value; G.refreshQuests(); G.save(); ui.renderPanel(); if (!p.inventory.includes(it)) closeSheet(); else ui.itemSheet(it, 'sell'); }
        }));
      }
    }
    acts.appendChild(btn('Close', 'ghost', closeSheet));
    card.appendChild(acts);
    $('sheet').hidden = false;
  };
  function closeSheet(force) {
    if (ui.shrineOpen && force !== true) return; // the shrine choice can only be closed by picking a blessing
    $('sheet').hidden = true;
    if (!ui.panel && G.game.run && !G.game.run.finished) G.game.paused = false;
  }
  ui.closeSheet = closeSheet;

  // Rift shrine: pick 1 of 3 blessings
  ui.shrineChoice = function (opts, onPick) {
    const card = $('sheet-card');
    card.innerHTML = ''; card.classList.remove('menu-card');
    card.appendChild(el('<div><h4>Rift Shrine</h4><p class="note">Choose a blessing. It lasts until this rift ends.</p></div>'));
    const list = el('<div class="shrine-opts"></div>');
    opts.forEach((b) => {
      const o = el(`<button class="shrine-opt"><b>${esc(b.name)}</b><span>${esc(b.desc)}</span></button>`);
      o.onclick = () => { ui.shrineOpen = false; closeSheet(true); onPick(b); };
      list.appendChild(o);
    });
    card.appendChild(list);
    ui.shrineOpen = true;
    $('sheet').hidden = false;
    G.input.reset();
  };
  // full-screen fade used between rift rooms
  ui.fade = function (out, done) {
    let f = document.getElementById('fade');
    if (!f) { f = document.createElement('div'); f.id = 'fade'; document.body.appendChild(f); }
    f.classList.toggle('on', !!out);
    if (done) setTimeout(done, 320);
  };

  ui.confirm = function (msg, onYes, o) {
    o = o || {};
    const card = $('sheet-card');
    card.innerHTML = ''; card.classList.remove('menu-card');
    card.appendChild(el(`<div><h4>${esc(o.title || 'Are you sure?')}</h4><p class="note" style="font-size:14px;color:var(--ink)">${esc(msg)}</p></div>`));
    const acts = el('<div class="sheet-actions"></div>');
    acts.appendChild(btn(o.no || 'Cancel', 'ghost', closeSheet));
    acts.appendChild(btn(o.yes || 'Confirm', o.danger ? 'danger' : 'primary', () => { closeSheet(); onYes(); }));
    card.appendChild(acts);
    $('sheet').hidden = false;
    if (G.game.run) { G.game.paused = true; G.input.reset(); }
    ui.confirmOpen = true;
  };

  // ---- skills: elemental skill tree
  function renderSkills(body) {
    const p = G.profile;
    if (!p.path) G.choosePath(p, 'storm'); // the hero is a lightning swordsman
    const path = G.PATHS[p.path];
    body.appendChild(el(`<div class="path-head" style="--pc:${path.color}"><div class="skill-ico big" style='${G.fxIconStyle(path.icon[0], path.icon[1], 58, path.icon[2])}'></div>
      <div class="grow"><div class="path-name">${esc(path.name)}</div><div class="note">${esc(path.element)} · Skill points: <b style="color:var(--gold-2)">${p.skillPoints}</b> (1 per level)</div></div></div>`));
    { const r = el('<div class="pts-row"><div class="note">Spend points on the best picks for this hero</div></div>');
      r.appendChild(btn('Recommended', 'small rec-btn', () => {
        const n = G.autoSkills(G.profile); if (!n) return;
        G.save(); ui.refreshSkillButtons(); ui.updateBadges(); ui.renderPanel(); ui.toast(n + ' skill point' + (n > 1 ? 's' : '') + ' spent', 'good');
      }, !learnableSkills() || p.skillPoints <= 0));
      body.appendChild(r); }
    // action bar preview: 4 chosen skills + ultimate
    G.fixSlots(p);
    const bar = el('<div class="bar-preview"></div>');
    [0, 1, 2, 3, G.ULT_SLOT].forEach((i) => {
      const k = G.barSkill(p, i);
      const sl = el(`<div class="sslot${k ? ' filled' : ''}${i === G.ULT_SLOT ? ' ult' : ''}">${k ? `<i class="ico" style='${G.fxIconStyle(G.SKILLS[k].icon[0], G.SKILLS[k].icon[1], 52, G.SKILLS[k].icon[2])}'></i>` : ''}<b>${i === G.ULT_SLOT ? 'ULT' : i + 1}</b></div>`);
      if (k) sl.title = G.SKILLS[k].name;
      bar.appendChild(sl);
    });
    body.appendChild(el('<div class="section-title">Action bar <span class="tiny" style="text-transform:none;letter-spacing:0">· tap a learned skill to choose its slot</span></div>'));
    body.appendChild(bar);
    const tree = el(`<div class="tree" style="--pc:${path.color}"></div>`);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('class', 'tree-lines');
    const pos = {};
    G.TREE_LAYOUT.forEach((l) => (pos[l.slot] = l));
    const nodes = G.TREE_LAYOUT.map((l) => G.pathSkill(p.path, l.slot));
    nodes.forEach((k) => {
      const sk = G.SKILLS[k];
      if (!sk.req) return;
      const a = pos[G.SKILLS[sk.req].slot], b = pos[sk.slot];
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', a.x); line.setAttribute('y1', a.y); line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
      line.setAttribute('class', p.skills[k] > 0 ? 'on' : p.skills[sk.req] > 0 ? 'open' : '');
      svg.appendChild(line);
    });
    tree.appendChild(svg);
    nodes.forEach((k) => {
      const sk = G.SKILLS[k], l = pos[sk.slot], rank = p.skills[k] || 0;
      const block = G.skillBlock(p, k);
      const state = rank > 0 ? 'learned' : sk.unlock > p.level || (sk.req && !(p.skills[sk.req] > 0)) ? 'locked' : 'open';
      const n = document.createElement('button');
      n.className = `node ${state}${sk.ult ? ' ult' : ''}${sk.kind === 'passive' ? ' passive' : ''}${!block ? ' can' : ''}`;
      n.style.left = l.x + '%'; n.style.top = l.y + '%';
      n.innerHTML = `<i class="ico" style='${G.fxIconStyle(sk.icon[0], sk.icon[1], sk.ult ? 74 : 60, sk.icon[2])}'></i><b class="rk">${rank}/${G.SKILL_MAX_RANK}</b>` +
        `<span class="nlabel">${esc(sk.name)}${sk.unlock > p.level ? `<em>Lv ${sk.unlock}</em>` : ''}</span>`;
      n.setAttribute('aria-label', sk.name + ', rank ' + rank);
      n.onclick = () => skillSheet(k);
      tree.appendChild(n);
    });
    body.appendChild(tree);
    { const P = G.PATHS[G.profile.path], na = P ? P.actives.length : 6, np = P ? P.passives.length : 2; body.appendChild(el(`<p class="note">${na + np} skills: ${na} actives and ${np} passives (diamond frames, always on). Pick which 4 actives sit on the action bar from each skill’s details; the ultimate always has its own button.</p>`)); }
  }

  function skillSheet(k) {
    const p = G.profile, sk = G.SKILLS[k], rank = p.skills[k] || 0, card = $('sheet-card');
    const block = G.skillBlock(p, k);
    card.innerHTML = ''; card.classList.remove('menu-card');
    card.appendChild(el(`<div><div class="row"><div class="skill-ico" style='${G.fxIconStyle(sk.icon[0], sk.icon[1], 54, sk.icon[2])}'></div><div class="grow">
      <h4>${esc(sk.name)}</h4><div class="rar muted">${sk.ult ? 'Ultimate' : sk.kind === 'passive' ? 'Passive' : 'Active'} · Rank ${rank}/${G.SKILL_MAX_RANK} · Unlocks at Lv ${sk.unlock}</div></div></div>
      <p class="note" style="font-size:14px;color:var(--ink)">${esc(sk.desc)}</p>
      <div class="lines">${skillNumbers(k, Math.max(1, rank)).map((t) => `<div>${t}</div>`).join('')}${rank > 0 && rank < G.SKILL_MAX_RANK ? `<div class="cmp-up">Next rank: ${skillNumbers(k, rank + 1)[0] || ''}</div>` : ''}</div>
      ${sk.fx ? `<div class="tiny muted">Effects: ${esc(sk.fx)}</div>` : ''}</div>`));
    if (sk.kind === 'active' && !sk.ult && rank > 0) {
      const row = el('<div class="slot-pick"><span class="tiny muted">Action bar slot:</span></div>');
      [0, 1, 2, 3].forEach((i) => {
        const on = p.slots[i] === k;
        row.appendChild(btn(String(i + 1), 'small' + (on ? ' primary' : ''), () => {
          const prev = p.slots.indexOf(k);
          if (prev >= 0) p.slots[prev] = p.slots[i];
          p.slots[i] = k;
          G.fixSlots(p); G.save(); ui.refreshSkillButtons(); ui.renderPanel(); skillSheet(k);
        }));
      });
      card.appendChild(row);
    }
    const acts = el('<div class="sheet-actions" style="margin-top:12px"></div>');
    acts.appendChild(btn(block || (rank ? 'Rank up (1 pt)' : 'Learn (1 pt)'), 'primary', () => {
      if (G.skillBlock(p, k)) return;
      p.skillPoints--; p.skills[k] = (p.skills[k] || 0) + 1;
      G.fixSlots(p);
      G.save(); ui.refreshSkillButtons(); ui.renderPanel(); skillSheet(k);
    }, !!block));
    acts.appendChild(btn('Close', 'ghost', closeSheet));
    card.appendChild(acts);
    $('sheet').hidden = false;
  }

  function skillNumbers(key, rank) {
    const sk = G.SKILLS[key], out = [];
    const m = (sk.mult || 0) + (sk.perRank || 0) * (rank - 1);
    if (sk.kind === 'passive') {
      if (sk.focusTime) out.push('Focus after ' + sk.focusTime + 's still · next Flash skill crits, +' + Math.round(sk.bonus * rank * 100) + '% damage');
      if (sk.cdr) out.push('-' + (sk.cdr * rank).toFixed(2) + 's cooldowns and +' + sk.mp * rank + ' MP per flash-dash');
      if (sk.crit) out.push('+' + (sk.crit * rank * 100).toFixed(0) + '% Crit, +' + (sk.stunBonus * rank * 100).toFixed(0) + '% stun chance');
      if (sk.mpRegen) out.push('+' + (sk.mpRegen * rank).toFixed(1) + ' MP/s, ' + (sk.proc * rank * 100).toFixed(0) + '% bolt chance');
      if (sk.burnBonus) out.push('+' + (sk.burnBonus * rank * 100).toFixed(0) + '% burn damage');
      if (sk.regen) out.push((sk.regen * rank * 100).toFixed(1) + '% HP/s regen, ' + (sk.proc * rank * 100).toFixed(0) + '% explosion chance');
      if (sk.lifesteal) out.push((sk.lifesteal * rank * 100).toFixed(0) + '% sword lifesteal');
      if (sk.poisonBonus) out.push('+' + (sk.poisonBonus * rank * 100).toFixed(0) + '% poison damage, plague bursts');
      return out;
    }
    if (sk.window) out.push('Parry window ' + (sk.window + sk.perRankWindow * (rank - 1)).toFixed(1) + 's · counter ' + Math.round(m * 100) + '% (always crits)');
    else if (sk.dist) out.push(Math.round(m * 100) + '% burst where you vanish · ' + Math.max(1.5, sk.cd - sk.cdPerRank * (rank - 1)).toFixed(1) + 's cooldown');
    else if (sk.flashes) out.push(sk.flashes + ' flashes × ' + Math.round(m * 100) + '% damage' + (sk.finisher ? ' + finisher ' + Math.round(sk.finisher * (1 + sk.perRank * (rank - 1)) * 100) + '%' : ''));
    else if (sk.mult) out.push(Math.round(m * 100) + '% skill damage' + (sk.strikes ? ' × ' + (sk.strikes + rank - 1) + ' strikes' : sk.jumps ? ' · ' + (1 + sk.jumps + Math.floor((rank - 1) / 2)) + ' targets' : ''));
    if (sk.zapMult) out.push(Math.round((sk.zapMult + sk.perRank * (rank - 1)) * 100) + '% per hit · ' + (sk.dur + (sk.perRankDur || 0) * (rank - 1)) + 's' + (sk.orbs ? ' · ' + (sk.orbs + Math.floor((rank - 1) / 2)) + ' fireballs' : ''));
    out.push(sk.mp + ' MP · ' + sk.cd + 's cooldown');
    return out;
  }

  // ---- quests
  function renderQuests(body) {
    const p = G.profile;
    G.refreshQuests();
    const avail = G.QUESTS.filter((q) => G.questAvailable(p, q));
    const locked = G.QUESTS.length - avail.length;
    const order = avail.slice().sort((a, b) => {
      const sa = G.questState(p, a), sb = G.questState(p, b);
      const w = (s) => (s.done && !s.claimed ? 0 : !s.done ? 1 : 2);
      return w(sa) - w(sb);
    });
    const list = el('<div class="stack"></div>');
    order.forEach((q) => {
      const st = G.questState(p, q);
      const r = q.reward, rw = [];
      if (r.gold) rw.push(r.gold + ' gold'); if (r.xp) rw.push(r.xp + ' XP');
      if (r.hpPotion) rw.push(r.hpPotion + '× HP potion'); if (r.mpPotion) rw.push(r.mpPotion + '× MP potion');
      if (r.item) rw.push(G.RARITY.find((x) => x.id === r.item[1]).name + ' ' + SLOT_NAMES[r.item[0]].toLowerCase());
      const card = el(`<div class="quest${st.done ? ' done' : ''}${st.claimed ? ' claimed' : ''}"><h5>${esc(q.name)}${st.claimed ? ' <span class="chip ok">Completed</span>' : ''}</h5><p>${esc(q.desc)}</p>
        <div class="qbar"><i style="width:${(st.progress / q.count) * 100}%"></i></div><div class="row"><span class="reward grow">Reward: ${esc(rw.join(', '))}</span><span class="tiny muted">${st.progress}/${q.count}</span></div></div>`);
      if (st.done && !st.claimed) {
        const b = btn('Claim reward', 'primary', () => {
          const res = G.claimQuest(q.id);
          if (!res) return;
          if (res.error) { ui.toast(res.error, 'warn'); return; }
          ui.toast('Received: ' + res.got.join(', '), 'quest');
          if (res.levels) ui.toast('Level up! You are now level ' + p.level, 'level');
          syncRunStats();
          G.save(); ui.renderPanel(); ui.refreshHub();
        });
        b.style.marginTop = '8px';
        card.appendChild(b);
      }
      list.appendChild(card);
    });
    body.appendChild(list);
    if (locked) body.appendChild(el(`<p class="note" style="margin-top:10px">${locked} more quest${locked > 1 ? 's' : ''} will appear as your story progresses.</p>`));
  }

  // ---- shop
  function shopPrice(it) { return Math.round(it.value * 2.6); }
  ui.restockShop = function (force) {
    const p = G.profile;
    if (!force && p.shop.stock.length) return;
    p.shop.stock = [];
    for (let i = 0; i < 4; i++) p.shop.stock.push(G.makeItem(null, G.rollRarity(0.4), p.level));
  };
  function renderShop(body) {
    const p = G.profile;
    body.appendChild(el(`<div class="cap"><span>Your gold</span><b style="color:var(--gold-2)">${fmt(p.gold)}g</b></div>`));
    if (ui.tab === 'sell') {
      const items = p.inventory;
      if (!items.length) body.appendChild(el('<p class="note">Nothing to sell.</p>'));
      else body.appendChild(invGrid(items, 'sell', false));
      body.appendChild(el('<p class="note">Tap an item to see its sell price.</p>'));
      return;
    }
    body.appendChild(el('<div class="section-title">Supplies</div>'));
    const sup = el('<div class="stack"></div>');
    [['hpPotion', C.SHOP.hpPotion], ['mpPotion', C.SHOP.mpPotion]].forEach(([k, price]) => {
      const c = G.CONSUMABLES[k];
      const row = el(`<div class="shop-item">${G.itemIconHTML({ key: k }, 32)}<div class="grow"><div class="nm">${c.name}</div><div class="sub2">${c.desc} · Owned ${G.invCount(p, k)}</div></div><span class="price">${price}g</span></div>`);
      row.appendChild(btn('Buy', 'small primary', () => {
        if (p.gold < price) { ui.toast('Not enough gold', 'warn'); return; }
        if (!G.addConsumable(p, k, 1)) { ui.toast('Bag is full', 'warn'); return; }
        p.gold -= price; G.save(); ui.renderPanel();
      }, p.gold < price));
      sup.appendChild(row);
    });
    body.appendChild(sup);
    ui.restockShop(false);
    body.appendChild(el('<div class="section-title">Equipment</div>'));
    const gear = el('<div class="stack"></div>');
    if (!p.shop.stock.length) gear.appendChild(el('<p class="note">Sold out. Restock for new wares.</p>'));
    p.shop.stock.forEach((it) => {
      const r = G.rarityOf(it);
      const row = el(`<div class="shop-item">${G.itemIconHTML(it, 32)}<div class="grow"><div class="nm" style="color:${r.color}">${esc(it.name)}</div><div class="sub2">${r.name} ${SLOT_NAMES[it.slot]} · ${G.itemStatLines(it.stats).map((l) => l.text + ' ' + l.label).join(', ')}</div></div><span class="price">${shopPrice(it)}g</span></div>`);
      row.style.cursor = 'pointer';
      row.onclick = () => ui.itemSheet(it, 'buy');
      gear.appendChild(row);
    });
    body.appendChild(gear);
    const rs = btn('Restock wares (' + C.SHOP.refresh + 'g)', '', () => {
      if (p.gold < C.SHOP.refresh) { ui.toast('Not enough gold', 'warn'); return; }
      p.gold -= C.SHOP.refresh; ui.restockShop(true); G.save(); ui.renderPanel();
    }, p.gold < C.SHOP.refresh);
    rs.style.marginTop = '10px';
    body.appendChild(rs);
  }

  // ---- settings
  function renderSettings(body) {
    const s = G.profile ? G.profile.settings : G.tmpSettings;
    const opts = [
      ['damageNumbers', 'Damage numbers', 'Floating numbers for damage and healing'],
      ['screenShake', 'Screen shake', 'Camera shake on heavy hits'],
      ['leftHanded', 'Left-handed controls', 'Swap the joystick and action buttons'],
      ['reducedEffects', 'Reduced effects', 'Fewer effects at once and a lower render resolution, for slower phones'],
    ];
    const st = el('<div class="stack"></div>');
    opts.forEach(([k, label, hint]) => {
      const row = el(`<button class="toggle"><span style="text-align:left">${label}<small>${hint}</small></span><i class="switch${s[k] ? ' on' : ''}"></i></button>`);
      row.onclick = () => {
        s[k] = !s[k];
        if (k === 'leftHanded') $('hud').classList.toggle('lefty', s[k]);
        if (k === 'reducedEffects' && G.resizeView) G.resizeView();
        G.save(); ui.renderPanel();
      };
      st.appendChild(row);
    });
    body.appendChild(st);
    body.appendChild(el('<div class="section-title">Audio</div>'));
    const snd = el(`<button class="toggle"><span style="text-align:left">Sound effects<small>Lightning skill sounds</small></span><i class="switch${s.sound !== false ? ' on' : ''}"></i></button>`);
    snd.onclick = () => { s.sound = s.sound === false; if (!s.sound) G.sfxStopAll(); else G.sfx('strike', { minGap: 0 }); G.save(); ui.renderPanel(); };
    body.appendChild(snd);
    const vol = el(`<div class="toggle"><label for="sfx-vol" style="flex:1">Volume <small>${Math.round((s.sfxVolume == null ? 0.8 : s.sfxVolume) * 100)}%</small></label><input id="sfx-vol" type="range" min="0" max="100" step="5" value="${Math.round((s.sfxVolume == null ? 0.8 : s.sfxVolume) * 100)}" style="flex:1.4"></div>`);
    const r = vol.querySelector('input');
    r.addEventListener('input', () => { s.sfxVolume = +r.value / 100; vol.querySelector('small').textContent = r.value + '%'; });
    r.addEventListener('change', () => { G.sfx('strike', { minGap: 0 }); G.save(); });
    body.appendChild(vol);
    const vrow = el('<div class="toggle" style="flex-wrap:wrap"><span style="text-align:left;flex:1 1 100%">Hero voice<small>Shouts when using skills, grunts when hit. Tap to hear a sample.</small></span><div class="voice-pick"></div></div>');
    [['warrior', 'Warrior'], ['protagonist', 'Protagonist'], ['off', 'Off']].forEach(([id, label]) => {
      const cur = s.voice || 'warrior';
      vrow.querySelector('.voice-pick').appendChild(btn(label, 'small' + (cur === id ? ' primary' : ''), () => {
        s.voice = id; G.save(); ui.renderPanel();
        if (id !== 'off') G.voice('light', { minGap: 0 });
      }));
    });
    body.appendChild(vrow);
    body.appendChild(el(`<p class="note">${esc(G.SFX_CREDITS)} There is no music yet.</p>`));
    body.appendChild(el('<p class="note">Item icons: RPG Arsenal by LimeZu (limezu.itch.io), Pixel Art Icon Pack RPG by Cainos (cainos.itch.io), 16-bit RPG Icons (CC0).</p>'));
    body.appendChild(el('<div class="section-title">Controls</div>'));
    body.appendChild(el(`<p class="note card">Touch: drag the left side to move. Your hero attacks automatically when enemies (or crates and pots) are in reach; steer away to stop. Tap skill buttons to cast, HP/MP to drink potions.<br>
      Keyboard: WASD / arrows move · Space or J attack · 1–4 skills · 5 or R ultimate · Q / E potions · Esc pause · I bag · C hero · K skills · L quests.</p>`));
    if (G.profile) {
      body.appendChild(el('<div class="section-title">Progress</div>'));
      const gm = !!G.profile.gm;
      body.appendChild(btn(gm ? 'Reset GM account' : 'Reset all progress', 'danger', () => ui.confirm(gm ? 'Delete the GM account? A fresh maxed GM account is created next time you choose it on the title screen. Your normal save is not affected.' : 'Delete your saved game and start over? This cannot be undone. The GM account is not affected.', () => {
        G.deleteSave(gm ? 'gm' : 'main'); G.profile = null; G.game.run = null; ui.close(true); ui.show('title'); ui.toast('Progress reset');
      }, { yes: 'Delete save', danger: true })));
    }
    body.appendChild(el('<p class="note" style="margin-top:14px">Art: FREE Adventurer & Knight 2D Pixel Art, Tiny RPG Character pack, Pixel Art Top Down – Basic, Super Pixel Effects Gigapack (free), Thunder Effect 02, Pixel fire asset pack — all from the Prologue folder.</p>'));
  }

  // ---- pause
  function renderPause(body) {
    const st = el('<div class="stack"></div>');
    st.appendChild(btn('Resume', 'primary', () => ui.close()));
    [['hero', 'Hero'], ['bag', 'Bag'], ['skills', 'Skills'], ['quests', 'Quest Journal'], ['settings', 'Settings']].forEach(([k, l]) => st.appendChild(btn(l, '', () => ui.open(k))));
    st.appendChild(btn('Leave area', 'danger', () => ui.open('map')));
    body.appendChild(st);
  }

  // ---- name tooltip: hover on PC, press and hold (or tap) on touch
  let tipEl = null, tipTimer = 0, tipHide = 0;
  function tipShow(target, html) {
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; tipEl.setAttribute('role', 'tooltip'); document.body.appendChild(tipEl); }
    clearTimeout(tipHide);
    tipEl.innerHTML = html; tipEl.hidden = false;
    const r = target.getBoundingClientRect(), tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
    const x = Math.max(8, Math.min(innerWidth - tw - 8, r.left + r.width / 2 - tw / 2));
    const y = r.top - th - 8 < 8 ? r.bottom + 8 : r.top - th - 8;
    tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  }
  function tipOff(delay) { clearTimeout(tipTimer); clearTimeout(tipHide); tipHide = setTimeout(() => { if (tipEl) tipEl.hidden = true; }, delay || 0); }
  ui.attachTip = function (node, html) {
    node.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') tipShow(node, html); });
    node.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') tipOff(); });
    node.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; clearTimeout(tipTimer); tipTimer = setTimeout(() => tipShow(node, html), 300); });
    node.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') return; if (tipEl && !tipEl.hidden) tipOff(700); else { clearTimeout(tipTimer); tipShow(node, html); tipOff(1400); } });
    node.addEventListener('pointercancel', () => tipOff());
    node.addEventListener('contextmenu', (e) => e.preventDefault());
    node.addEventListener('focus', () => tipShow(node, html));
    node.addEventListener('blur', () => tipOff());
  };

  // ---- how to get stronger (after a defeat): tips from the hero's current state, most with a one-tap fix
  function bestUpgrades() {
    const p = G.profile, out = {};
    p.inventory.filter((i) => i.kind === 'gear').forEach((it) => {
      if (!isBetter(it)) return;
      const cur = out[it.slot];
      if (!cur) { out[it.slot] = it; return; }
      const save = p.equipped[it.slot]; p.equipped[it.slot] = cur; if (isBetter(it)) out[it.slot] = it; p.equipped[it.slot] = save;
    });
    return Object.values(out);
  }
  function strongerTips(area) {
    const p = G.profile, tips = [];
    const leave = (then) => () => { closeSheet(); ui.close(true); G.game.exitToHub(); ui.show('hub'); if (then) then(); };
    if (p.attrPoints > 0) tips.push({ t: `Spend ${p.attrPoints} attribute point${p.attrPoints > 1 ? 's' : ''}`, d: 'Unspent points do nothing. The recommended split suits your hero.', act: 'Spend now', go: () => { G.autoAttrs(p); syncRunStats(); } });
    if (p.skillPoints > 0 && learnableSkills()) tips.push({ t: `Spend ${p.skillPoints} skill point${p.skillPoints > 1 ? 's' : ''}`, d: 'Higher skill ranks hit harder and cost less to use.', act: 'Spend now', go: () => { G.autoSkills(p); ui.refreshSkillButtons(); } });
    const up = bestUpgrades();
    if (up.length) tips.push({ t: `Wear ${up.length} better item${up.length > 1 ? 's' : ''} from your bag`, d: up.map((i) => i.name).join(', '), act: 'Equip best', go: () => { up.forEach((i) => G.equip(p, i.id)); syncRunStats(); } });
    const empty = ['weapon', 'armor', 'accessory'].filter((k) => !p.equipped[k]);
    if (empty.length && !up.length) tips.push({ t: 'Fill your empty gear slots', d: 'No ' + empty.map((k) => SLOT_NAMES[k].toLowerCase()).join(' or ') + ' equipped. The merchant sells gear.', act: 'Visit shop', go: leave(() => ui.open('shop')), leaves: true });
    if (area && p.level < area.level) {
      const prev = G.AREAS.filter((a) => !a.endless && a.id !== area.id && p.areas[a.id] && p.areas[a.id].unlocked && a.level <= p.level + 1).pop();
      tips.push({ t: `Level up first: you are Lv ${p.level}, this area expects Lv ${area.level}`, d: prev ? `Replay ${prev.name} for experience and loot.` : 'Clear earlier areas for experience and loot.', act: prev ? 'Replay ' + prev.name : null, go: prev ? () => { closeSheet(); ui.close(true); G.game.exitToHub(); G.game.startArea(prev.id); } : null, leaves: true });
    }
    const hp = G.invCount(p, 'hpPotion');
    if (hp < 3) tips.push({ t: hp ? `Only ${hp} health potion${hp > 1 ? 's' : ''} left` : 'Out of health potions', d: 'Carry at least 5. They cost ' + C.SHOP.hpPotion + 'g at the merchant.', act: 'Visit shop', go: leave(() => ui.open('shop')), leaves: true });
    const eq = ['weapon', 'armor', 'accessory'].map((k) => p.equipped[k]).filter(Boolean);
    if (eq.length && eq.every((i) => i.rarity === 'common')) tips.push({ t: 'Hunt for better gear', d: 'Elites and bosses drop Uncommon gear or better. Check the merchant too: its wares change when you restock.' });
    tips.push({ t: 'Fight smart', d: 'Keep moving so groups cannot surround you. Use skills as soon as they are ready, save the ultimate for a big wave, and drink a potion before your health runs low.' });
    return tips;
  }
  function strongerSheet(area) {
    const card = $('sheet-card');
    card.innerHTML = ''; card.classList.remove('menu-card');
    card.appendChild(el('<div><h4>How to get stronger</h4><p class="note">Fix these, then try again.</p></div>'));
    const list = el('<div class="tips"></div>');
    strongerTips(area).forEach((t) => {
      const row = el(`<div class="tip-row${t.act ? ' has-act' : ''}"><div class="grow"><b>${esc(t.t)}</b><span>${esc(t.d)}</span></div></div>`);
      if (t.act) row.appendChild(btn(t.act, 'small primary', () => {
        t.go(); G.save(); ui.updateBadges();
        if (t.leaves) return;
        ui.toast('Done', 'good'); strongerSheet(area);
      }));
      list.appendChild(row);
    });
    card.appendChild(list);
    const acts = el('<div class="sheet-actions" style="margin-top:12px"></div>');
    acts.appendChild(btn('Close', 'ghost', closeSheet));
    card.appendChild(acts);
    $('sheet').hidden = false;
  }

  // ---- result
  ui.showResult = function (result, run) {
    G.input.reset();
    $('toasts').innerHTML = '';
    const r = run.rewards, p = G.profile;
    ui.open('result');
    const body = $('panel-body');
    body.innerHTML = '';
    const win = result === 'victory';
    const title = win ? 'Victory!' : result === 'defeat' ? 'Defeated' : result === 'endless' ? 'Trial Over' : 'Retreated';
    const sub = win ? run.area.name + ' cleared' : result === 'defeat' ? (run.failReason ? run.failReason + ' ' : 'You fell in ' + run.area.name + '. ') + 'Your loot and experience are kept.' :
      result === 'endless' ? 'You reached wave ' + (r.wave || 0) + ' (best ' + p.bestWave + ')' : 'You left ' + run.area.name + '.';
    body.appendChild(el(`<div class="result-head ${win || result === 'endless' ? 'win' : 'lose'}"><h2>${title}</h2><p class="note">${esc(sub)}</p></div>`));
    if (win && r.stars) {
      const lines = G.objectives.starLines(run.area);
      const box = el(`<div class="result-stars">${lines.map((l, i) => {
        const now = r.stars.got[i], had = r.stars.before & (1 << i);
        return `<div class="rs${now || had ? ' got' : ''}${now && !had ? ' new' : ''}" style="--d:${0.25 + i * 0.35}s">${starSvg(now || had)}<span>${esc(l.label)}</span>${now && !had ? '<em>New</em>' : !now && had ? '<em class="kept">Earned before</em>' : ''}</div>`;
      }).join('')}</div>`);
      body.appendChild(box);
      if (r.starChest) body.appendChild(el(`<div class="star-chest">${starSvg(true)}<div><b>Star chest</b><span>${esc(r.starChest.item.name)} and ${fmt(r.starChest.gold)} gold</span></div></div>`));
    }
    const list = el('<div class="result-list"></div>');
    [['Enemies defeated', r.kills], ...(win && r.stars && G.AREA_OBJ[run.area.id].type !== 'survive' ? [['Time', G.mmss(r.stars.time)]] : []), ['Experience', '+' + fmt(r.xp)], ['Gold', '+' + fmt(r.gold)]].forEach(([k, v]) => list.appendChild(el(`<div class="stat"><span>${k}</span><b>${v}</b></div>`)));
    if (r.levels) list.appendChild(el(`<div class="stat"><span>Levels gained</span><b>+${r.levels} (now ${p.level})</b></div>`));
    if (r.unlocked) list.appendChild(el(`<div class="stat"><span>New area</span><b>${esc(r.unlocked)}</b></div>`));
    body.appendChild(list);
    if (r.items.length) {
      body.appendChild(el('<div class="section-title">Loot</div>'));
      const grid = el('<div class="loot-grid"></div>');
      r.items.forEach((it) => {
        const gear = it.kind !== 'consumable' && it.slot, rar = gear ? G.rarityOf(it) : null;
        const name = gear ? it.name : (G.CONSUMABLES[it.key] || {}).name || 'Item';
        const cell = el(`<div class="loot-cell${gear ? ' r-' + it.rarity : ''}" role="img" tabindex="0" style="--rc:${rar ? rar.color : '#b9aee0'}">${G.itemIconHTML(it, 40) || `<span class="tag">${gear ? SLOT_TAG[it.slot] : 'USE'}</span>`}</div>`);
        cell.setAttribute('aria-label', name);
        ui.attachTip(cell, `<b style="color:${rar ? rar.color : '#fbf4ff'}">${esc(name)}</b>${gear ? `<small>${rar.name} ${SLOT_NAMES[it.slot]}</small>` : ''}`);
        grid.appendChild(cell);
      });
      body.appendChild(grid);
      body.appendChild(el(`<p class="tiny muted loot-hint">${matchMedia('(hover: hover)').matches ? 'Hover' : 'Press and hold'} an item to see its name.</p>`));
    }
    if (claimable()) body.appendChild(el(`<p class="note" style="color:var(--gold-2)">You have ${claimable()} quest reward(s) to claim in the Journal.</p>`));
    const acts = el('<div class="sheet-actions" style="margin-top:14px"></div>');
    const toMap = () => { ui.close(true); G.game.exitToHub(); ui.show('hub'); };
    const ai = G.AREAS.findIndex((a) => a.id === run.area.id), next = win && ai >= 0 ? G.AREAS[ai + 1] : null;
    const nextOpen = next && p.areas[next.id] && p.areas[next.id].unlocked;
    if (win) {
      acts.appendChild(btn('World Map', nextOpen ? '' : 'primary', toMap));
      if (nextOpen) { const nb = btn('', 'primary next-btn', () => { ui.close(true); G.game.exitToHub(); G.game.startArea(next.id); });
        nb.innerHTML = `Next area<small>${esc(next.name)}</small>`; nb.setAttribute('aria-label', 'Next area: ' + next.name); acts.appendChild(nb); }
    } else {
      if (result === 'defeat') {
        const n = strongerTips(run.area).filter((t) => t.act).length;
        const sb = btn('', 'stronger-btn', () => strongerSheet(run.area));
        sb.innerHTML = `How to get stronger${n ? `<b class="sb-n">${n}</b>` : ''}`;
        body.appendChild(sb);
      }
      acts.appendChild(btn('Retry', '', () => { const id = run.area.id; ui.close(true); G.game.exitToHub(); G.game.startArea(id); }));
      acts.appendChild(btn('World Map', 'primary', toMap));
    }
    body.appendChild(acts);
    $('panel-title').textContent = '';
  };
})();
