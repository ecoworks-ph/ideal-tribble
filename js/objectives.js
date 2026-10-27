// Fallen Oath — area objectives and stars (spec: docs/OBJECTIVES_SPEC.md)
// Each area has a job (slay, defend, bounty, survive, traps, boss), a time target for star 2 and a challenge for star 3.
// game.js calls in through run.obj (created by G.objectives.init) and gives this file its internals via game._objApi.
(function () {
  const G = window.G;

  // ---------------------------------------------------------------- area table
  // par: seconds for star 2 (survive uses a kill target instead); chal: the star 3 challenge
  G.AREA_OBJ = {
    courtyard: { type: 'slay', par: 180, chal: 'dmg30' },
    millroad: { type: 'defend', thing: 'cart', par: 210, chal: 'obj50' },
    thornwood: { type: 'traps', trap: 'vines', par: 210, chal: 'notrap' },
    banditcamp: { type: 'bounty', target: 'archer', name: 'Bandit Captain', limit: 90, par: 150, chal: 'bountyHalf' },
    keepgate: { type: 'boss', par: 240, chal: 'nopot' },
    graveyard: { type: 'defend', thing: 'bell', par: 240, chal: 'obj50' },
    bonefields: { type: 'slay', par: 240, chal: 'dmg30' },
    toxicmire: { type: 'survive', hazard: 'poison', dur: 120, kills: 45, chal: 'notrap' },
    bonehollow: { type: 'traps', trap: 'spikes', par: 240, chal: 'notrap' },
    crypt: { type: 'boss', par: 300, chal: 'noheavy' },
    causeway: { type: 'bounty', target: 'kobold', name: 'Kobold Runner', limit: 90, par: 180, chal: 'bountyHalf' },
    sunkenhalls: { type: 'survive', hazard: 'water', dur: 150, kills: 55, chal: 'nopot' },
    warcamp: { type: 'defend', thing: 'banner', par: 270, chal: 'obj50' },
    vault: { type: 'traps', trap: 'fire', par: 270, chal: 'notrap' },
    ruins: { type: 'boss', par: 300, chal: 'nopot' },
    approach: { type: 'slay', par: 300, chal: 'dmg30' },
    oathpath: { type: 'bounty', target: 'cursedSam', name: 'The Oathbreaker', limit: 90, par: 210, chal: 'bountyHalf' },
    brokenvows: { type: 'defend', thing: 'lantern', par: 300, chal: 'obj50' },
    shrine: { type: 'boss', par: 360, chal: 'noheavy' },
  };
  const THING = { cart: 'supply cart', bell: 'chapel bell', banner: 'war banner', lantern: 'last lantern' };
  const TRAP = { vines: 'snare vines', spikes: 'bone spikes', fire: 'fire jets' };
  G.OBJ_LABEL = { slay: 'Slay', defend: 'Defend', bounty: 'Bounty', survive: 'Survive', traps: 'Traps', boss: 'Boss' };
  const CHAL = {
    dmg30: 'Take less than 30% damage',
    nopot: 'Use no potions',
    obj50: 'Keep it above half health',
    bountyHalf: 'Catch it within half the time',
    notrap: 'Never get caught',
    noheavy: "Dodge the boss's heavy attacks",
  };
  const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  G.mmss = mmss;

  const O = (G.objectives = {});

  // a sentence for the banner and the area brief
  O.goal = function (a) {
    const o = G.AREA_OBJ[a.id];
    if (!o) return a.endless ? 'Survive as long as you can' : 'Defeat every wave';
    switch (o.type) {
      case 'defend': return 'Defend the ' + THING[o.thing];
      case 'bounty': return 'Catch ' + o.name + ' within ' + mmss(o.limit);
      case 'survive': return 'Survive for ' + mmss(o.dur);
      case 'traps': return 'Clear every wave. Watch for ' + TRAP[o.trap];
      case 'boss': return 'Defeat every wave, then ' + (G.ENEMIES[a.boss] ? G.ENEMIES[a.boss].name : 'the boss');
      default: return 'Defeat every wave';
    }
  };
  O.detail = function (a) {
    const o = G.AREA_OBJ[a.id];
    if (!o) return '';
    switch (o.type) {
      case 'defend': return 'Enemies go for the ' + THING[o.thing] + ' first. If it is destroyed, you fail. Hit them to pull them off it.';
      case 'bounty': return o.name + ' runs from you and calls for help. Kill it before it escapes.';
      case 'survive': return (o.hazard === 'poison' ? 'Poison pools bubble up across the ground' : 'Rising water slows everyone it touches') + ', and enemies never stop coming. Last until the timer ends.';
      case 'traps': return 'Traps glow before they fire. Step off them in time, or lure enemies onto them.';
      case 'boss': return 'Clear the waves to draw out the boss.';
      default: return 'Clear all ' + a.waves.length + ' waves. The biggest one comes last.';
    }
  };
  // the three star lines for an area
  O.starLines = function (a) {
    const o = G.AREA_OBJ[a.id];
    if (!o) return [];
    return [
      { label: o.type === 'survive' ? 'Survive' : o.type === 'bounty' ? 'Catch the bounty' : o.type === 'defend' ? 'Clear with it standing' : 'Clear the area' },
      { label: o.type === 'survive' ? 'Defeat ' + o.kills + ' enemies' : 'Finish under ' + mmss(o.par) },
      { label: CHAL[o.chal] },
    ];
  };
  O.mask = (st) => (st && st.starMask) || 0;
  O.count = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);

  // region milestones: stars needed and what each step pays
  O.MILESTONES = [5, 10, 15];
  O.regionStars = function (p, r) {
    return G.AREAS.filter((a) => a.region === r.id && G.AREA_OBJ[a.id]).reduce((s, a) => s + O.count(O.mask(p.areas[a.id])), 0);
  };
  O.regionMax = (r) => G.AREAS.filter((a) => a.region === r.id && G.AREA_OBJ[a.id]).length * 3;
  O.milestoneReward = function (r, step) {
    const L = r.levels[1];
    if (step === 0) return { gold: 40 * L + 100, hp: 5, mp: 3, text: (40 * L + 100) + ' gold, 5 health and 3 mana potions' };
    if (step === 1) return { rarity: 'epic', level: L, text: 'An Epic item' };
    return { rarity: 'legendary', level: L, text: 'A Legendary item' };
  };
  O.claimMilestone = function (p, r) {
    const step = (p.regionClaims[r.id] || 0);
    if (step >= O.MILESTONES.length || O.regionStars(p, r) < O.MILESTONES[step]) return null;
    const rw = O.milestoneReward(r, step);
    let item = null;
    if (rw.rarity) {
      item = G.makeItem(null, rw.rarity, rw.level);
      if (!G.addGear(p, item)) return { full: true };
    }
    if (rw.gold) p.gold += rw.gold;
    if (rw.hp) G.addConsumable(p, 'hpPotion', rw.hp);
    if (rw.mp) G.addConsumable(p, 'mpPotion', rw.mp);
    p.regionClaims[r.id] = step + 1;
    return { step, rw, item };
  };

  // ---------------------------------------------------------------- run setup
  O.init = function (run) {
    const a = run.area, def = G.AREA_OBJ[a.id];
    run.stat = { dmg: 0, potions: 0, trap: 0, heavy: 0 };
    if (!def || run.room) return null;
    const obj = Object.assign({ t: 0, cells: [], pools: [] }, def);
    const map = run.map, P = map.play, L = a.level;
    obj.hazAtk = 9 * (1 + 0.17 * (L - 1)); // traps hit like an average enemy of the area's level
    const clearAround = (x, y, r) => { for (let i = map.props.length - 1; i >= 0; i--) { const pr = map.props[i]; if (!pr.chest && !pr.wall && Math.hypot(pr.x - x, pr.y - y) < r) map.props.splice(i, 1); } };

    if (def.type === 'defend') {
      const x = Math.round(map.W / 2), y = Math.round(P.y0 + (P.y1 - P.y0) * 0.5);
      clearAround(x, y, 40);
      obj.pos = { key: '__obj', x, y, r: 13 };
      map.props.push(obj.pos);
      obj.max = obj.hp = Math.round(45 * obj.hazAtk);
      obj.flash = 0;
    }
    if (def.type === 'traps') {
      // rows of trap pads across the middle of the map; neighbouring rows fire out of step, so a safe row is always near
      const y0 = P.y0 + 84, y1 = P.y1 - 84, cw = def.trap === 'fire' ? 34 : 26, ch = 18, gap = 12;
      let row = 0;
      for (let y = y0; y <= y1; y += 42, row++) {
        const n = Math.floor((P.x1 - P.x0 - 24) / (cw + gap));
        const off = (row % 2) * ((cw + gap) / 2);
        for (let i = 0; i < n; i++) {
          const x = P.x0 + 18 + off + i * (cw + gap) + cw / 2;
          if (x > P.x1 - 18) continue;
          if (map.props.some((pr) => !pr.dead && (pr.r || pr.wall) && Math.abs(pr.x - x) < cw / 2 + (pr.r || 10) && Math.abs(pr.y - y) < ch / 2 + (pr.r || 10))) continue;
          if ((i + row * 2) % 4 === 3) continue; // gaps to walk through
          obj.cells.push({ x, y, w: cw, h: ch, row, hitT: -9, seed: (i * 7 + row * 3) % 10 });
        }
      }
      obj.period = def.trap === 'fire' ? 3.6 : 3.2;
    }
    if (def.type === 'survive') {
      obj.pool = [];
      a.waves.forEach((w) => w.forEach(([id, n, mod]) => { if (!mod) for (let i = 0; i < n; i++) obj.pool.push(id); }));
      obj.started = false; obj.surgeT = 30; obj.hazT = 2;
    }
    if (def.type === 'bounty') { obj.spawnAt = 1.8; obj.bounty = null; obj.callT = 10; }
    return obj;
  };

  // which run phases the objective clock runs in
  const live = (run) => run.phase === 'waves' || run.phase === 'boss';

  // ---------------------------------------------------------------- per-frame update
  O.update = function (run, dt, api) {
    const obj = run.obj, pl = run.player;
    pl.slowMul = 1;
    if (!obj) return;
    if (pl.rootT > 0) { pl.rootT -= dt; pl.slowMul = 0; }
    if (!live(run)) return;
    obj.t += dt;
    if (obj.flash > 0) obj.flash -= dt;
    if (obj.type === 'traps') updateTraps(run, obj, dt, api);
    if (obj.type === 'survive') updateSurvive(run, obj, dt, api);
    if (obj.type === 'bounty') updateBounty(run, obj, dt, api);
  };

  function hazardHitPlayer(run, obj, mult, api, o) {
    const pl = run.player;
    if (pl.dead || pl.invuln > 0) return;
    api.damagePlayer(run, mult, { atk: obj.hazAtk }, Object.assign({ trap: true }, o));
  }

  // ---- traps: idle, then glow (warning), then fire
  function trapPhase(obj, c, t) {
    const per = obj.period, k = ((t + (c.row % 2) * per / 2) % per + per) % per;
    if (k < per - 1.45) return 'idle';
    if (k < per - 0.5) return 'warn';
    return 'fire';
  }
  function updateTraps(run, obj, dt, api) {
    const pl = run.player;
    obj.cells.forEach((c) => {
      const ph = trapPhase(obj, c, obj.t);
      if (ph === 'fire' && c.last !== 'fire') { c.burst = 0; if (onScreen(run, c)) G.sfx(obj.trap === 'fire' ? 'slam' : 'strike', { vol: 0.25, minGap: 160 }); }
      c.last = ph;
      if (ph !== 'fire') return;
      c.burst += dt;
      const inCell = (o, r) => Math.abs(o.x - c.x) < c.w / 2 + r * 0.5 && Math.abs(o.y - c.y) < c.h / 2 + r * 0.5;
      if (!pl.dead && inCell(pl, pl.r) && obj.t - c.hitT > 0.5) {
        c.hitT = obj.t;
        if (obj.trap === 'vines') { hazardHitPlayer(run, obj, 0.45, api, { fx: 'hitPlayer' }); pl.rootT = 0.9; api.text(run, pl.x, pl.y - 44, 'SNARED', '#9be37a'); }
        else hazardHitPlayer(run, obj, obj.trap === 'fire' ? 1.1 : 0.9, api, {});
      }
      for (const e of run.enemies) {
        if (e.dead || e.state === 'spawn' || e.boss || !inCell(e, e.r)) continue;
        if (e.trapT && obj.t - e.trapT < 0.6) continue;
        e.trapT = obj.t;
        if (obj.trap === 'vines') api.applyStatus(run, e, 'slow', { t: 1.2, amt: 0.85, noFx: true });
        else api.damageEnemy(run, e, Math.max(1, Math.round(e.maxHp * 0.14)), { stagger: true });
      }
    });
  }
  function onScreen(run, o) {
    const C = G.CONFIG, vw = C.VIEW_WIDTH, vh = vw * (G.view.h / G.view.w);
    return o.x > run.cam.x - 20 && o.x < run.cam.x + vw + 20 && o.y > run.cam.y - 20 && o.y < run.cam.y + vh + 20;
  }

  // ---- survive: a steady stream, surges, and the area hazard
  function updateSurvive(run, obj, dt, api) {
    const pl = run.player, a = run.area, P = run.map.play;
    if (!obj.started) { obj.started = true; api.banner('Survive', mmss(obj.dur) + ' on the clock'); }
    const left = obj.dur - obj.t;
    if (left <= 0) {
      for (const e of run.enemies) if (!e.dead) { e.rewarded = true; api.damageEnemy(run, e, 1e9, { stagger: false }); }
      run.spawnQueue.length = 0;
      obj.pools.length = 0;
      api.text(run, pl.x, pl.y - 50, 'SURVIVED', '#ffd54a', true);
      api.areaCleared(run);
      return;
    }
    const level = a.level + Math.floor(obj.t / 40);
    const alive = run.enemies.reduce((n, e) => n + (e.dead ? 0 : 1), 0);
    if (alive + run.spawnQueue.length < (a.maxAlive || 10) && obj.pool.length) run.spawnQueue.push({ id: obj.pool[Math.floor(Math.random() * obj.pool.length)], level, delay: 0.45 });
    obj.surgeT -= dt;
    if (obj.surgeT <= 0 && left > 8) {
      obj.surgeT = 30;
      for (let i = 0; i < 6; i++) run.spawnQueue.push({ id: obj.pool[Math.floor(Math.random() * obj.pool.length)], level, delay: 0.25 });
      api.banner('They keep coming', 'A bigger group is closing in');
    }
    // hazards
    obj.hazT -= dt;
    if (obj.hazT <= 0) {
      if (obj.hazard === 'poison') {
        obj.hazT = 2.2;
        const r = 16 + Math.random() * 10, x = clamp(pl.x + (Math.random() - 0.5) * 110, P.x0 + r, P.x1 - r), y = clamp(pl.y + (Math.random() - 0.5) * 110, P.y0 + r + 20, P.y1 - r);
        obj.pools.push({ kind: 'poison', x, y, r, t: 0, warn: 1.0, life: 7, tick: 0 });
      } else {
        obj.hazT = 3.4;
        const w = 120 + Math.random() * 90, h = 34 + Math.random() * 14;
        const x = clamp(pl.x + (Math.random() - 0.5) * 140, P.x0 + w / 2, P.x1 - w / 2), y = clamp(pl.y + (Math.random() - 0.5) * 140, P.y0 + h + 10, P.y1 - h / 2);
        obj.pools.push({ kind: 'water', x, y, w, h, t: 0, warn: 1.2, life: 9 });
      }
    }
    for (let i = obj.pools.length - 1; i >= 0; i--) {
      const z = obj.pools[i];
      z.t += dt;
      if (z.t > z.warn + z.life) { obj.pools.splice(i, 1); continue; }
      if (z.t < z.warn) continue;
      const inside = (o) => z.kind === 'poison' ? Math.hypot((o.x - z.x) / z.r, (o.y - z.y) / (z.r * 0.62)) < 1 : Math.abs(o.x - z.x) < z.w / 2 && Math.abs(o.y - z.y) < z.h / 2;
      if (z.kind === 'poison') {
        z.tick -= dt;
        if (z.tick <= 0 && inside(pl) && !pl.dead) { z.tick = 0.5; hazardHitPlayer(run, obj, 0.32, api, { fx: 'hitPlayer', shake: 1 }); }
        for (const e of run.enemies) if (!e.dead && !e.boss && e.state !== 'spawn' && inside(e) && (!e.poisT || obj.t - e.poisT > 0.5)) { e.poisT = obj.t; api.damageEnemy(run, e, Math.max(1, Math.round(e.maxHp * 0.05)), { stagger: false }); }
      } else {
        if (inside(pl)) pl.slowMul = Math.min(pl.slowMul, 0.55);
        for (const e of run.enemies) if (!e.dead && e.state !== 'spawn' && inside(e)) api.applyStatus(run, e, 'slow', { t: 0.25, amt: 0.45, noFx: true });
      }
    }
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---- bounty: a fast elite that runs, blinks away and calls for help
  function updateBounty(run, obj, dt, api) {
    const a = run.area;
    if (!obj.bounty && obj.t >= obj.spawnAt && !obj.escaped) {
      const pl = run.player, far = run.map.spawnPoints.filter((s) => Math.hypot(s.x - pl.x, s.y - pl.y) > 160);
      const sp = far.length ? far[Math.floor(Math.random() * far.length)] : run.map.spawnPoints[0];
      const e = api.spawnEnemy(run, obj.target, a.level + 2, { x: sp.x, y: sp.y });
      if (e) {
        e.bounty = true;
        api.makeElite(run, e, 'fast');
        e.def.name = obj.name; e.maxHp = e.hp = Math.round(e.maxHp * 2.2); e.blinkT = 4;
        run.boss = e; G.ui.bossBar(e);
        obj.bounty = e; obj.t0 = obj.t;
        api.banner('Bounty', obj.name + ' is here. Catch it!');
      }
      return;
    }
    const e = obj.bounty;
    if (!e) return;
    if (e.dead) {
      if (!obj.caughtT) {
        obj.caughtT = obj.t - obj.t0;
        for (const o of run.enemies) if (!o.dead && o !== e) { o.rewarded = true; api.damageEnemy(run, o, 1e9, { stagger: false }); }
        run.spawnQueue.length = 0;
        api.areaCleared(run);
      }
      return;
    }
    const left = obj.limit - (obj.t - obj.t0);
    if (left <= 0) { // it gets away
      obj.escaped = true;
      api.fx(run, 'smokeDark', e.x, e.y - 12, { scale: 1.2 });
      e.removed = true; e.dead = true; e.rewarded = true; G.ui.bossBar(null);
      run.failReason = obj.name + ' escaped.';
      run.phase = 'defeat'; run.endT = 0;
      return;
    }
    e.blinkT -= dt;
    obj.callT -= dt;
    if (obj.callT <= 0) {
      obj.callT = 11;
      const pool = [];
      a.waves[0].forEach(([id, n, mod]) => { if (!mod) for (let i = 0; i < n; i++) pool.push(id); });
      for (let i = 0; i < 3 && pool.length; i++) {
        const ang = Math.random() * Math.PI * 2;
        run.spawnQueue.unshift({ id: pool[Math.floor(Math.random() * pool.length)], level: a.level, delay: 0.2, at: { x: e.x + Math.cos(ang) * 30, y: e.y + Math.sin(ang) * 22 } });
      }
      api.text(run, e.x, e.y - 46, 'TO ME!', '#ffb36b', true);
    }
  }

  // enemy AI override: return true when this file has steered the enemy this frame
  O.think = function (run, e, d, moveToward, slow) {
    const obj = run.obj, pl = run.player;
    if (!obj) return false;
    e.lookAt = null;
    if (obj.type === 'defend' && obj.pos && !e.boss) {
      if (e.objTgt === undefined) e.objTgt = e.ai === 'melee' && Math.random() < 0.6;
      if (!e.objTgt) return false;
      const aggro = d < 44 || (e.lastHurt != null && run.time - e.lastHurt < 2.5);
      if (aggro) return false;
      const o = obj.pos, od = Math.hypot(o.x - e.x, o.y - e.y);
      e.lookAt = o; e.face = o.x >= e.x ? 1 : -1;
      if (od <= o.r + e.r + e.def.range * 0.8) {
        if (e.cdT <= 0) { api_startAttack(e); e.atkObj = true; }
        else G.game._objApi.setAnim(e, 'idle');
      } else { moveToward(o.x, o.y, e.def.speed * slow); G.game._objApi.setAnim(e, 'walk'); }
      return true;
    }
    if (obj.type === 'bounty' && e.bounty) {
      const P = run.map.play, api = G.game._objApi;
      if (e.blinkT <= 0 && d < 36) { // vanish in smoke and reappear far away
        const far = run.map.spawnPoints.filter((s) => Math.hypot(s.x - pl.x, s.y - pl.y) > 150);
        if (far.length) {
          const s = far[Math.floor(Math.random() * far.length)];
          api.fx(run, 'smokeDark', e.x, e.y - 12, { scale: 0.9 });
          e.x = s.x; e.y = s.y; G.collide(run.map, e, e.r);
          api.fx(run, 'smokeDark', e.x, e.y - 12, { scale: 0.9 });
          e.blinkT = 7;
          return true;
        }
      }
      if (d < 120) {
        const base = Math.atan2(e.y - pl.y, e.x - pl.x);
        const tries = [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4];
        let ang = base;
        for (const k of tries) {
          const t = base + k, tx = e.x + Math.cos(t) * 46, ty = e.y + Math.sin(t) * 46;
          if (tx > P.x0 + 26 && tx < P.x1 - 26 && ty > P.y0 + 26 && ty < P.y1 - 26) { ang = t; break; }
        }
        const sp = Math.max(e.def.speed, pl.stats.moveSpeed * 0.82) * slow;
        moveToward(e.x + Math.cos(ang) * 50, e.y + Math.sin(ang) * 50, sp);
        e.face = Math.cos(ang) >= 0 ? 1 : -1; e.lookAt = { x: e.x + Math.cos(ang) * 50, y: e.y + Math.sin(ang) * 50 };
        api.setAnim(e, e.def.anim.run ? 'run' : 'walk');
        return true;
      }
      return false;
    }
    return false;
  };
  function api_startAttack(e) { G.game._objApi.startEnemyAttack(e, 'attack'); }

  // an enemy's swing lands on the defended object
  O.hitObject = function (run, e) {
    const obj = run.obj;
    if (!obj || !obj.pos || obj.hp <= 0) return;
    const o = obj.pos;
    if (Math.hypot(o.x - e.x, o.y - e.y) > o.r + e.r + e.def.range + 8) return;
    obj.hp -= Math.max(1, Math.round(e.atk * (e.atkMult || 1)));
    obj.flash = 0.15;
    const api = G.game._objApi;
    api.fx(run, 'hit', o.x + (Math.random() - 0.5) * 10, o.y - 14, { scale: 0.6 });
    if (!obj.warned && obj.hp < obj.max * 0.35) { obj.warned = true; G.ui.toast('The ' + THING[obj.thing] + ' is badly damaged!', 'warn'); }
    if (obj.hp <= 0) {
      obj.hp = 0;
      api.fx(run, 'breakSmoke', o.x, o.y - 10, { scale: 1.8 });
      api.fx(run, 'skullSmoke', o.x, o.y - 6, { scale: 1.2 });
      const i = run.map.props.indexOf(o); if (i >= 0) run.map.props.splice(i, 1);
      obj.broken = true;
      run.failReason = 'The ' + THING[obj.thing] + ' was destroyed.';
      run.phase = 'defeat'; run.endT = 0;
    }
  };

  // ---------------------------------------------------------------- stars
  O.evaluate = function (run) {
    const obj = run.obj, a = run.area, def = G.AREA_OBJ[a.id];
    if (!def) return null;
    const time = run.doneT != null ? run.doneT : run.time;
    const pl = run.player, s = run.stat || {};
    const got = [true, false, false];
    got[1] = def.type === 'survive' ? run.rewards.kills >= def.kills : time <= def.par;
    switch (def.chal) {
      case 'dmg30': got[2] = s.dmg < pl.stats.maxHp * 0.3; break;
      case 'nopot': got[2] = !s.potions; break;
      case 'obj50': got[2] = !!(obj && obj.hp >= obj.max * 0.5); break;
      case 'bountyHalf': got[2] = !!(obj && obj.caughtT != null && obj.caughtT <= def.limit / 2); break;
      case 'notrap': got[2] = !s.trap; break;
      case 'noheavy': got[2] = !s.heavy; break;
    }
    return { got, mask: (got[0] ? 1 : 0) | (got[1] ? 2 : 0) | (got[2] ? 4 : 0), time };
  };
  // live status of star 3 for the tracker: true holds, false broken, null not decided yet
  O.liveChallenge = function (run) {
    const obj = run.obj, def = G.AREA_OBJ[run.area.id], s = run.stat || {};
    if (!def) return null;
    switch (def.chal) {
      case 'dmg30': return s.dmg < run.player.stats.maxHp * 0.3;
      case 'nopot': return !s.potions;
      case 'obj50': return obj && obj.hp >= obj.max * 0.5;
      case 'bountyHalf': return obj && obj.bounty ? (obj.caughtT != null ? obj.caughtT <= def.limit / 2 : obj.t - obj.t0 <= def.limit / 2) : true;
      case 'notrap': return !s.trap;
      case 'noheavy': return !s.heavy;
    }
    return null;
  };
  O.challengeText = (a) => { const d = G.AREA_OBJ[a.id]; return d ? CHAL[d.chal] : ''; };

  // tracker line for the HUD
  O.trackerLine = function (run) {
    const obj = run.obj, a = run.area;
    if (!obj) return null;
    const alive = run.enemies.filter((e) => !e.dead).length + run.spawnQueue.length;
    const wave = `Wave ${Math.max(1, Math.min(a.waves.length, run.waveIdx + 1))}/${a.waves.length}`;
    switch (obj.type) {
      case 'defend': return `<b>Defend</b> ${Math.ceil((obj.hp / obj.max) * 100)}% · ${wave} · Foes ${alive}`;
      case 'bounty': return obj.bounty ? `<b>Bounty</b> ${mmss(obj.limit - (obj.t - obj.t0))} left · Foes ${alive}` : `<b>Bounty</b> Find ${obj.name}`;
      case 'survive': return `<b>Survive</b> ${mmss(obj.dur - obj.t)} · Kills ${run.rewards.kills}/${obj.kills}`;
      case 'traps': return `<b>${wave}</b> · Traps · Foes ${alive}`;
      default: return null;
    }
  };

  // ---------------------------------------------------------------- drawing
  O.drawGround = function (ctx, run) {
    const obj = run.obj;
    if (!obj) return;
    const t = run.time;
    if (obj.type === 'traps') obj.cells.forEach((c) => drawTrap(ctx, obj, c, live(run) ? trapPhase(obj, c, obj.t) : 'idle', t));
    if (obj.pools) obj.pools.forEach((z) => drawPool(ctx, z, t));
  };
  O.drawables = function (run, list) {
    const obj = run.obj;
    if (!obj) return;
    if (obj.pos && !obj.broken) list.push({ y: obj.pos.y, t: 5, draw: (ctx) => drawThing(ctx, obj, run.time) });
    if (obj.type === 'bounty' && obj.bounty && !obj.bounty.dead && live(run)) list.push({ y: 1e9, t: 5, draw: (ctx) => drawArrow(ctx, run, obj.bounty) });
  };

  function drawTrap(ctx, obj, c, ph, t) {
    const x = Math.round(c.x - c.w / 2), y = Math.round(c.y - c.h / 2), w = c.w, h = c.h;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.strokeStyle = obj.trap === 'vines' ? 'rgba(120,190,80,0.55)' : obj.trap === 'fire' ? 'rgba(200,110,60,0.55)' : 'rgba(210,200,180,0.45)';
    ctx.lineWidth = 1; ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
    if (obj.trap === 'vines') {
      ctx.fillStyle = 'rgba(40,70,30,0.55)'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(80,130,50,0.7)';
      for (let i = 0; i < 4; i++) ctx.fillRect(x + 3 + i * 6, y + 4 + ((i + c.seed) % 3) * 4, 3, 2);
      if (ph === 'warn') { ctx.strokeStyle = `rgba(160,255,110,${0.45 + 0.4 * Math.sin(t * 18)})`; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
      if (ph === 'fire') {
        ctx.strokeStyle = '#7fd64e'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        for (let i = 0; i < 5; i++) {
          const bx = x + 3 + i * (w - 6) / 4, top = y + h / 2 - 12 - ((i + c.seed) % 3) * 3;
          ctx.beginPath(); ctx.moveTo(bx, y + h - 2); ctx.quadraticCurveTo(bx + (i % 2 ? 5 : -5), y + h / 2, bx + (i % 2 ? -2 : 2), top); ctx.stroke();
        }
        ctx.fillStyle = '#b8f07a'; for (let i = 0; i < 3; i++) ctx.fillRect(x + 6 + i * 8, y + 2, 2, 2);
      }
    } else if (obj.trap === 'spikes') {
      ctx.fillStyle = 'rgba(20,16,22,0.55)'; ctx.fillRect(x, y, w, h);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
        const px = x + 4 + i * 6, py = y + 5 + j * 8;
        ctx.fillStyle = ph === 'warn' ? `rgba(255,90,70,${0.5 + 0.4 * Math.sin(t * 18)})` : '#0c0a0d';
        ctx.fillRect(px, py, 3, 2);
        if (ph === 'fire') {
          ctx.fillStyle = '#e8e2d4';
          ctx.beginPath(); ctx.moveTo(px - 1, py + 2); ctx.lineTo(px + 1.5, py - 9); ctx.lineTo(px + 4, py + 2); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#8f8778'; ctx.fillRect(px + 2, py - 4, 1, 5);
        }
      }
    } else { // fire jets: a grate that roars into flame
      ctx.fillStyle = 'rgba(30,22,20,0.7)'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#4a3a30'; for (let i = 1; i < 5; i++) ctx.fillRect(x + i * w / 5, y + 2, 1, h - 4);
      if (ph === 'warn') { ctx.fillStyle = `rgba(255,120,40,${0.25 + 0.25 * Math.sin(t * 16)})`; ctx.fillRect(x, y, w, h); }
      if (ph === 'fire') {
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 6; i++) {
          const fx = x + 3 + i * (w - 6) / 5, fh = 16 + 8 * Math.abs(Math.sin(t * 20 + i * 1.7));
          const g = ctx.createLinearGradient(0, y + h / 2, 0, y + h / 2 - fh);
          g.addColorStop(0, 'rgba(255,220,120,0.95)'); g.addColorStop(0.5, 'rgba(255,110,30,0.8)'); g.addColorStop(1, 'rgba(200,30,10,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(fx, y + h / 2 - fh / 2, 3.5, fh / 2, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    ctx.restore();
  }
  function drawPool(ctx, z, t) {
    ctx.save();
    const warnA = z.t < z.warn ? z.t / z.warn : 1, fade = Math.min(1, (z.warn + z.life - z.t) / 0.6);
    if (z.kind === 'poison') {
      if (z.t < z.warn) {
        ctx.strokeStyle = `rgba(150,255,90,${0.4 + 0.4 * Math.sin(t * 16)})`; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r * warnA, z.r * 0.62 * warnA, 0, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.globalAlpha = fade;
        const g = ctx.createRadialGradient(z.x, z.y, 2, z.x, z.y, z.r);
        g.addColorStop(0, 'rgba(160,230,60,0.75)'); g.addColorStop(0.7, 'rgba(80,160,40,0.6)'); g.addColorStop(1, 'rgba(40,90,20,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(220,255,150,0.85)';
        for (let i = 0; i < 4; i++) { const k = (t * 1.3 + i * 0.37) % 1, a = i * 1.9; ctx.beginPath(); ctx.arc(z.x + Math.cos(a) * z.r * 0.5, z.y + Math.sin(a) * z.r * 0.3 - k * 3, 1.4 * (1 - k) + 0.4, 0, Math.PI * 2); ctx.fill(); }
      }
    } else {
      const x = z.x - z.w / 2, y = z.y - z.h / 2;
      if (z.t < z.warn) {
        ctx.strokeStyle = `rgba(120,200,255,${0.4 + 0.4 * Math.sin(t * 14)})`; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
        ctx.strokeRect(x, y, z.w, z.h);
        ctx.fillStyle = `rgba(60,140,220,${0.15 * warnA})`; ctx.fillRect(x, y, z.w, z.h);
      } else {
        ctx.globalAlpha = fade;
        ctx.fillStyle = 'rgba(40,110,190,0.45)'; ctx.fillRect(x, y, z.w, z.h);
        ctx.strokeStyle = 'rgba(190,230,255,0.6)'; ctx.lineWidth = 1;
        for (let r = 0; r < 3; r++) {
          ctx.beginPath();
          for (let i = 0; i <= 12; i++) { const px = x + (i / 12) * z.w, py = y + 8 + r * (z.h - 14) / 2 + Math.sin(t * 3 + i * 0.9 + r) * 2; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }
  // the defended object, code-drawn, with its health bar
  function drawThing(ctx, obj, t) {
    const o = obj.pos, x = o.x, y = o.y;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x + 2, y, 18, 5, 0, 0, Math.PI * 2); ctx.fill();
    if (obj.thing === 'cart') {
      ctx.fillStyle = '#5a3a22'; ctx.fillRect(x - 16, y - 14, 32, 10);
      ctx.fillStyle = '#7a5232'; ctx.fillRect(x - 15, y - 13, 30, 3);
      ctx.fillStyle = '#3a2416'; ctx.fillRect(x + 15, y - 9, 10, 2);
      ctx.fillStyle = '#9a7a4a'; ctx.fillRect(x - 13, y - 24, 11, 10); ctx.fillRect(x, y - 22, 12, 8);
      ctx.fillStyle = '#c9a66a'; ctx.fillRect(x - 13, y - 24, 11, 2); ctx.fillRect(x, y - 22, 12, 2);
      ctx.fillStyle = '#e0d2a8'; ctx.fillRect(x - 6, y - 30, 8, 6);
      [x - 10, x + 9].forEach((wx) => { ctx.fillStyle = '#2a1c12'; ctx.beginPath(); ctx.arc(wx, y - 3, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#8a6a42'; ctx.beginPath(); ctx.arc(wx, y - 3, 2, 0, Math.PI * 2); ctx.fill(); });
    } else if (obj.thing === 'bell') {
      ctx.fillStyle = '#4a3020'; ctx.fillRect(x - 15, y - 34, 3, 34); ctx.fillRect(x + 12, y - 34, 3, 34); ctx.fillRect(x - 17, y - 36, 34, 4);
      const sw = Math.sin(t * 2) * 0.12;
      ctx.translate(x, y - 32); ctx.rotate(sw);
      ctx.fillStyle = '#b08a3a'; ctx.beginPath(); ctx.moveTo(-4, 2); ctx.lineTo(4, 2); ctx.lineTo(9, 18); ctx.lineTo(-9, 18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e0c070'; ctx.fillRect(-3, 4, 2, 11);
      ctx.fillStyle = '#6a4a1a'; ctx.fillRect(-10, 17, 20, 2); ctx.fillRect(-1, 19, 2, 3);
    } else if (obj.thing === 'banner') {
      ctx.fillStyle = '#3a2a1a'; ctx.fillRect(x - 1, y - 44, 3, 44);
      ctx.fillStyle = '#ffc23d'; ctx.fillRect(x - 2, y - 47, 5, 4);
      ctx.fillStyle = '#b81e2e';
      ctx.beginPath(); ctx.moveTo(x + 2, y - 42);
      for (let i = 0; i <= 8; i++) ctx.lineTo(x + 2 + i * 2.6, y - 42 + Math.sin(t * 5 + i * 0.6) * 1.5);
      for (let i = 8; i >= 0; i--) ctx.lineTo(x + 2 + i * 2.6, y - 24 + Math.sin(t * 5 + i * 0.6) * 1.5 + (i > 6 ? -3 : 0));
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffc23d'; ctx.fillRect(x + 9, y - 36, 6, 6);
    } else { // the last lantern: a tall post with a blue flame
      ctx.fillStyle = '#2a2430'; ctx.fillRect(x - 2, y - 38, 4, 38); ctx.fillRect(x - 6, y - 2, 12, 3);
      ctx.fillStyle = '#4a4258'; ctx.fillRect(x - 7, y - 50, 14, 13);
      ctx.fillStyle = '#1a1620'; ctx.fillRect(x - 8, y - 52, 16, 3);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y - 44, 1, x, y - 44, 26 + 3 * Math.sin(t * 4));
      g.addColorStop(0, 'rgba(160,210,255,0.9)'); g.addColorStop(0.3, 'rgba(80,140,255,0.4)'); g.addColorStop(1, 'rgba(40,80,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 44, 28, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    if (obj.flash > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,120,100,${obj.flash * 3})`; ctx.beginPath(); ctx.ellipse(x, y - 16, 18, 20, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    // health bar
    const w = 36, bx = x - w / 2, by = y - (obj.thing === 'lantern' ? 60 : obj.thing === 'banner' ? 54 : 44), k = obj.hp / obj.max;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(bx - 1, by - 1, w + 2, 5);
    ctx.fillStyle = k > 0.5 ? '#3fd07a' : k > 0.25 ? '#ffc23d' : '#ff4f3a'; ctx.fillRect(bx, by, w * k, 3);
  }
  // an arrow at the hero's feet pointing to the bounty while it is off screen
  function drawArrow(ctx, run, e) {
    if (onScreen(run, e)) return;
    const pl = run.player, a = Math.atan2(e.y - pl.y, e.x - pl.x), r = 26;
    const x = pl.x + Math.cos(a) * r, y = pl.y - 8 + Math.sin(a) * r;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = '#ff4fd8'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-4, -5); ctx.lineTo(-1, 0); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
})();
