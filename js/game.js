/* =========================================================================
   FALLEN OATH — Game engine: player, enemies, combat, skills, effects, waves
   ========================================================================= */
(function () {
  'use strict';
  const G = (window.G = window.G || {});
  const C = G.CONFIG;
  const { rnd, rint, clamp } = G.util;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const game = (G.game = { run: null, showcase: null, paused: false, time: 0 });

  // ================================================================ drawing helpers
  function drawSheet(ctx, key, frame, x, y, ax, ay, scale, flip, alpha, row) {
    const s = G.SHEETS[key];
    const im = G.img('sheet:' + key);
    if (!s || !im || !s.n) return false;
    const f = Math.max(0, Math.min(s.n - 1, frame | 0));
    scale = scale || 1;
    if (alpha != null && alpha < 1) ctx.globalAlpha = Math.max(0, alpha);
    if (flip) {
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.scale(-scale, scale);
      ctx.drawImage(im, f * s.fw, (row || 0) * s.fh, s.fw, s.fh, -ax, -ay, s.fw, s.fh);
      ctx.restore();
    } else {
      ctx.drawImage(im, f * s.fw, (row || 0) * s.fh, s.fw, s.fh, Math.round(x - ax * scale), Math.round(y - ay * scale), s.fw * scale, s.fh * scale);
    }
    ctx.globalAlpha = 1;
    return true;
  }
  G.drawSheet = drawSheet;

  // ================================================================ effects
  // Plays an existing effect sprite sheet; never synthesises artwork.
  const FX_CAP = { sparkBurst: 3, thunderSplashDark: 6, thunderSplash: 7, burstDark: 4, slashGold: 4, flashKick: 2, hit: 3, slashArc: 2 };
  function fx(run, key, x, y, o) {
    const cp = G.profile && G.PATHS[G.profile.path];
    if (cp && cp.fxRemap && cp.fxRemap[key]) key = cp.fxRemap[key]; // a class can recolour shared hit effects
    const d = G.FX[key];
    o = o || {};
    if (!d || !d.ok || !run) return null;
    const p = G.profile && G.profile.settings;
    if (p && p.reducedEffects && !o.loop && !o.important && run.effects.length > 14) return null;
    // declutter: cap how many copies of one effect play at once (big moments pass `important`)
    if (!o.loop && !o.important) {
      const cap = FX_CAP[key] || 8;
      let n = 0;
      for (const f of run.effects) if (f.key === key && ++n >= cap) return null;
    }
    const e = { key, d, x, y, t: 0, fps: o.fps || 15, scale: o.scale || 1, loop: !!o.loop, dur: o.dur || 0, follow: o.follow || null,
      offX: o.offX || 0, offY: o.offY || 0, flip: !!o.flip, alpha: o.alpha == null ? 1 : o.alpha, ground: !!o.ground, rot: o.rot || 0, screen: !!o.screen };
    run.effects.push(e);
    return e;
  }
  game.fx = (key, x, y, o) => fx(game.run || game.showcase, key, x, y, o);

  function updateEffects(run, dt) {
    for (let i = run.effects.length - 1; i >= 0; i--) {
      const e = run.effects[i];
      e.t += dt;
      if (e.follow) {
        if (e.follow.dead && e.follow.removed) { run.effects.splice(i, 1); continue; }
        e.x = e.follow.x; e.y = e.follow.y;
      }
      const frames = e.t * e.fps;
      if (e.loop) { if (e.dur && e.t >= e.dur) run.effects.splice(i, 1); }
      else if (frames >= e.d.n) run.effects.splice(i, 1);
    }
  }
  function drawEffect(ctx, e) {
    const im = G.img('fx:' + e.key);
    if (!im) return;
    const d = e.d;
    const f = Math.floor(e.t * e.fps) % d.n;
    const cols = d.cols || 1;
    const sx = (f % cols) * d.fw, sy = Math.floor(f / cols) * d.fh;
    const w = d.fw * e.scale, h = d.fh * e.scale;
    ctx.globalAlpha = e.alpha;
    ctx.save();
    ctx.translate(Math.round(e.x + e.offX), Math.round(e.y + e.offY));
    if (e.rot) ctx.rotate(e.rot);
    if (e.flip) ctx.scale(-1, 1);
    ctx.drawImage(im, sx, sy, d.fw, d.fh, -w / 2, -h / 2, w, h);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ================================================================ floating text
  function text(run, x, y, str, color, big) {
    if (!G.profile.settings.damageNumbers && /^\d/.test(str)) return;
    // keep numbers readable: stack new numbers above recent ones at the same spot, cap the total
    const near = run.texts.filter((t) => t.t < 0.35 && Math.abs(t.x - x) < 14 && Math.abs(t.y - y) < 12).length;
    if (run.texts.length > 34) run.texts.shift();
    run.texts.push({ x: x + rnd(-3, 3), y: y - near * 7, str, color, t: 0, big: !!big });
  }

  // ================================================================ run creation
  function makePlayer(map) {
    const p = G.profile;
    const stats = G.calcStats(p, null);
    return {
      x: map.start.x, y: map.start.y, r: 6, dir: 'up', state: 'idle', animT: 0, combo: 0, atkT: 0, atkDur: 0, hitDone: true,
      hp: stats.maxHp, mp: stats.maxMp, stats, buffs: {}, cds: {}, potionCd: 0, castLock: 0, aura: null, dash: null, spin: null, imbue: null, atkFps: 0, flashing: false, focused: false, focusT: 0, parry: null, invuln: 0, flash: 0, dead: false, lastHit: -10,
    };
  }

  function makeShowcase() {
    const area = G.AREAS[0];
    const map = G.buildArea(area);
    const run = { showcase: true, map, area, player: null, enemies: [], effects: [], texts: [], projectiles: [], drops: [], hazards: [], time: 0, cam: { x: 0, y: 0 } };
    run.player = { x: map.W / 2, y: map.H * 0.42, dir: 'down', state: 'idle', animT: 0, r: 6, stats: { atkSpeed: 1 } };
    // a few torches on lanterns
    run.map.props.forEach((pr) => pr.torch && fx(run, pr.torch, pr.x, pr.y - 30, { loop: true, fps: 10 }));
    game.showcase = run;
    return run;
  }
  game.ensureShowcase = () => game.showcase || makeShowcase();

  game.startArea = function (areaId) {
    const area = G.AREAS.find((a) => a.id === areaId);
    if (!area) return false;
    const roomDef = area.rooms ? Object.assign({ idx: 0 }, area.rooms[0]) : null; // Rift: a chain of rooms
    const map = G.buildArea(area, roomDef);
    const run = {
      area, map, player: makePlayer(map), enemies: [], effects: [], texts: [], projectiles: [], drops: [], hazards: [],
      spawnQueue: [], waveIdx: -1, waveDelay: 1.2, phase: 'waves', time: 0, bossSpawned: false, boss: null,
      rewards: { xp: 0, gold: 0, items: [], levels: 0, kills: 0 }, cam: { x: 0, y: map.H }, shake: 0, finished: false, endWave: 0,
      clearT: 0, chestOpened: false, banner: null, timers: [], zones: [], room: roomDef,
    };
    if (roomDef && roomDef.type === 'shrine') run.phase = 'shrine';
    run.map.props.forEach((pr) => pr.torch && fx(run, pr.torch, pr.x, pr.y - 30, { loop: true, fps: 10 }));
    if (G.profile.path === 'shadow') { // the Shadow Monarch steps out of a shadow portal (portal sound peaks 0.15s in, the portal at ~0.33s)
      fx(run, 'portalVoid', run.player.x, run.player.y - 14, { important: true });
      fx(run, 'shadowMist', run.player.x, run.player.y - 6, { scale: 1.2 });
      schedule(run, 0.18, () => G.sfx('shPortal', { minGap: 0, vol: 0.8 }));
    } else {
    fx(run, 'warp', run.player.x, run.player.y - 14, { important: true });
    // hero spawn: one short thunder crack on the warp's brightest frame (#6 of 12 at 15fps = 0.4s); the clip peaks 0.25s in
    schedule(run, 0.15, () => G.sfx('heroSpawn', { minGap: 0 }));
    }
    run.obj = G.objectives ? G.objectives.init(run) : null; // area objective (defend, bounty, survive, traps) and star tracking
    game.run = run;
    game.paused = false;
    G.ui.onRunStart(run);
    G.ui.banner(area.name, roomDef ? roomTitle(run) : G.objectives ? G.objectives.goal(area) : 'Defeat every wave');
    return true;
  };

  // ================================================================ enemies
  function enemyLevelStats(def, level) {
    const L = Math.max(1, level);
    return {
      maxHp: Math.round(def.hp * (1 + 0.3 * (L - 1))),
      atk: def.atk * (1 + 0.17 * (L - 1)),
      def: def.def + 0.8 * (L - 1),
      xp: Math.round(def.xp * (1 + 0.22 * (L - 1))),
      gold: [Math.round(def.gold[0] * (1 + 0.15 * (L - 1))), Math.round(def.gold[1] * (1 + 0.15 * (L - 1)))],
    };
  }

  function spawnEnemy(run, id, level, at) {
    const def = G.ENEMIES[id];
    if (!def) return null;
    const ls = enemyLevelStats(def, level);
    let pt = at;
    if (!pt) {
      const pl = run.player;
      const cands = run.map.spawnPoints.filter((s) => dist(s, pl) > 110);
      pt = (cands.length ? cands : run.map.spawnPoints)[rint(0, (cands.length ? cands : run.map.spawnPoints).length - 1)];
      pt = { x: pt.x + rnd(-10, 10), y: pt.y + rnd(-10, 10) };
    }
    const e = {
      id, def, level, x: pt.x, y: pt.y, r: def.radius, hp: ls.maxHp, maxHp: ls.maxHp, atk: ls.atk, defense: ls.def, xp: ls.xp, gold: ls.gold,
      state: 'spawn', anim: 'idle', animT: 0, stateT: 0, face: 1, cdT: rnd(0.6, 1.4), hitDone: false, status: {}, flash: 0,
      dead: false, removed: false, rewarded: false, boss: !!def.boss, ai: def.ai, special: 3 + rnd(0, 2), block: 0, phase2: false, summons: 0,
      knock: { x: 0, y: 0 },
    };
    G.collide(run.map, e, e.r);
    run.enemies.push(e);
    fx(run, 'spawnSmoke', e.x, e.y - 8, { scale: e.boss ? 1.6 : 1 });
    // enemy spawn: low, soft whoosh (throttled so a whole wave doesn't stack); bosses arrive with a thunderclap
    // synced to the smoke burst: its fullest frame is #5 of 10 at 15fps (0.33s), when the enemy starts fading in.
    // spawn_poof peaks 0.42s into the clip; starting 0.1s in puts the peak at ~0.33s.
    // Bosses: combo_28 (peak 0.73s) starts 0.4s in, and the thunderclap impact lands on the burst peak.
    if (e.boss) {
      G.sfx('finisher', { minGap: 0, offset: 0.4 });
      schedule(run, 0.31, () => G.sfx('impact', { minGap: 0 }));
    } else G.sfx('spawn', { vol: 0.6, minGap: 200, offset: 0.1 });
    if (e.boss) { run.boss = e; G.ui.bossBar(e); }
    return e;
  }

  function setAnim(e, anim) {
    if (e.anim !== anim) { e.anim = anim; e.animT = 0; }
  }
  function animInfo(e) {
    const key = e.def.anim[e.anim] || e.def.anim.idle;
    const s = G.SHEETS[key];
    const fps = { idle: 8, walk: 10, run: 12, attack: 12, heavy: 11, shoot: 12, lunge: 13, block: 10, hurt: 14, death: 10, cast: 14 }[e.anim] || 10;
    const n = (s && s.n) || 1;
    return { key, fps, n, frame: Math.floor(e.animT * fps), done: e.animT * fps >= n };
  }

  // ================================================================ damage
  function rollDamage(atk, mult, def, crit, critDmg) {
    let dmg = atk * mult * rnd(0.9, 1.1);
    const isCrit = Math.random() < crit;
    if (isCrit) dmg *= critDmg;
    dmg *= C.DEF_K / (C.DEF_K + Math.max(0, def));
    return { dmg: Math.max(1, Math.round(dmg)), crit: isCrit };
  }

  function damageEnemy(run, e, amount, o) {
    if (e.dead || e.state === 'spawn') return 0;
    o = o || {};
    let dmg = amount;
    if (e.status.vuln) dmg = Math.round(dmg * (1 + e.status.vuln.amt));
    if (e.status.presence) dmg = Math.round(dmg * (1 + e.status.presence.amt)); // Shadow Monarch: Monarch's Presence
    if (e.block > 0) { dmg = Math.max(1, Math.round(dmg * 0.15)); text(run, e.x, e.y - 50, 'BLOCKED', '#9fd0ff'); }
    else if (e.def.guard && e.state !== 'attack' && (run.player.x - e.x) * (e.face || 1) > 0) { // Oathbound Knight: its shield takes part of a hit from the front
      dmg = Math.max(1, Math.round(dmg * (1 - e.def.guard)));
      if (!e.guardTxt || run.time - e.guardTxt > 0.8) { e.guardTxt = run.time; text(run, e.x, e.y - 50, 'GUARD', '#9fd0ff'); }
    }
    e.hp -= dmg;
    e.flash = 0.12; e.lastHurt = run.time;
    text(run, e.x, e.y - (e.boss ? 56 : 30), String(dmg), o.crit ? '#ffd54a' : o.skill ? '#8fdcff' : '#ffffff', o.crit);
    if (o.knock && !e.boss) { const a = Math.atan2(e.y - run.player.y, e.x - run.player.x); e.knock.x += Math.cos(a) * o.knock; e.knock.y += Math.sin(a) * o.knock; }
    if (e.hp <= 0) { killEnemy(run, e); return dmg; }
    // stagger regular enemies
    if (!e.boss && e.state !== 'attack' && o.stagger !== false) { e.state = 'hurt'; e.stateT = 0; setAnim(e, 'hurt'); }
    if (e.boss) {
      e.recentDmg = (e.recentDmg || 0) + dmg;
      if (!e.phase2 && e.hp < e.maxHp * 0.5) enterPhase2(run, e);
    }
    return dmg;
  }

  function killEnemy(run, e) {
    if (e.dead) return;
    e.dead = true; e.hp = 0; e.state = 'dead'; e.stateT = 0; setAnim(e, 'death'); e.deadAt = run.time;
    Object.values(e.status).forEach((s) => s.fx && (s.fx.dur = 0.0001));
    e.status = {};
    if (e.rewarded) return;
    e.rewarded = true;
    const p = G.profile;
    const gold = rint(e.gold[0], e.gold[1]);
    p.gold += gold; run.rewards.gold += gold; run.rewards.kills++;
    p.stats.kills++;
    fx(run, 'coins', e.x, e.y - 20, { scale: e.boss ? 1.6 : 0.8 });
    text(run, e.x, e.y - 40, '+' + gold + 'g', '#ffd54a');
    giveXp(run, e.xp);
    G.questEvent('kill', e.id, 1);
    if (e.boss) {
      p.stats.bossKills++;
      G.questEvent('boss', e.id, 1);
      if (!run.boss || run.boss === e || run.boss.dead) G.ui.bossBar(null);
      run.shake = 8;
      fx(run, 'hitHeavy', e.x, e.y - 20, { scale: 1.5, important: true });
      // boss loot: 2 guaranteed items, high rarity
      for (let i = 0; i < 2; i++) {
        const rar = e.id === 'knight' ? (Math.random() < 0.35 ? 'legendary' : 'epic') : Math.random() < 0.4 ? 'epic' : 'rare';
        dropItem(run, e.x + (i ? 14 : -14), e.y + 6, G.makeItem(null, rar, e.level + 1));
      }
    } else {
      const chance = e.id === 'brute' ? 0.2 : 0.08;
      if (Math.random() < chance) dropItem(run, e.x, e.y, G.makeItem(null, G.rollRarity(e.id === 'brute' ? 0.6 : 0), e.level));
      if (Math.random() < 0.06) dropPickup(run, e.x + 6, e.y, 'hp');
    }
    const drops = e.def.drops || {};
    Object.keys(drops).forEach((k) => {
      if (Math.random() < drops[k]) {
        if (G.addConsumable(p, k, 1)) { text(run, e.x, e.y - 52, '+1 ' + G.CONSUMABLES[k].name, '#e8c27a'); G.questEvent('collect', k, 1); }
      }
    });
  }

  function giveXp(run, xp) {
    const p = G.profile;
    run.rewards.xp += xp;
    const before = p.level;
    const lv = G.gainXp(p, xp);
    if (lv > 0) {
      run.rewards.levels += lv;
      const pl = run.player;
      fx(run, 'levelUp', pl.x, pl.y - 52, { follow: pl, offY: -52, important: true });
      fx(run, 'lightBurst', pl.x, pl.y - 16, { follow: pl, offY: -16, scale: 0.8, important: true });
      const old = pl.stats;
      pl.stats = G.calcStats(p, pl.buffs);
      pl.hp = Math.min(pl.stats.maxHp, pl.hp + (pl.stats.maxHp - old.maxHp) + Math.round(pl.stats.maxHp * 0.3));
      pl.mp = pl.stats.maxMp;
      const newSkills = G.SKILL_ORDER.filter((k) => G.SKILLS[k].path === p.path && G.SKILLS[k].unlock > before && G.SKILLS[k].unlock <= p.level);
      G.ui.toast('Level ' + p.level + '! +' + C.ATTR_POINTS_PER_LEVEL * lv + ' attribute, +' + lv + ' skill point' + (lv > 1 ? 's' : ''), 'level');
      newSkills.forEach((k) => G.ui.toast('Skill tree: ' + G.SKILLS[k].name + ' can now be learned', 'skill'));
    }
  }

  function damagePlayer(run, mult, src, o) {
    const pl = run.player;
    if (pl.dead || run.phase === 'victory' || run.phase === 'defeat') return;
    if (pl.parry && pl.parry.t > 0) { sheathCounter(run, src); return; }
    if (pl.invuln > 0) return;
    o = o || {};
    const r = rollDamage(src.atk, mult, pl.stats.def, 0, 1);
    if (pl.stats.dmgReduce) { r.dmg = Math.max(1, Math.round(r.dmg * (1 - pl.stats.dmgReduce))); if (G.profile.path === 'limitless') fx(run, 'sparkleBlue', pl.x, pl.y - 16, { scale: 0.5, fps: 30 }); } // Infinity shimmer (Gojo only)
    pl.hp -= r.dmg;
    if (run.stat) { run.stat.dmg += r.dmg; if (o.trap) run.stat.trap++; if (src && src.boss && !src.elite && mult >= 1.25) run.stat.heavy++; }
    pl.invuln = 0.35; pl.flash = 0.25; pl.lastHit = run.time;
    text(run, pl.x, pl.y - 34, String(r.dmg), '#ff6b6b');
    if (pl.hp > 0) G.voice('hurt', { chance: 0.45, minGap: 1200, vol: 0.8 });
    fx(run, o.fx || 'hitPlayer', pl.x, pl.y - 14, { scale: 0.8 });
    if (G.profile.settings.screenShake) run.shake = Math.max(run.shake, o.shake || 2);
    if (pl.hp <= 0) {
      pl.hp = 0; pl.dead = true; pl.state = 'dead';
      G.voice('death', { minGap: 0, vol: 1 });
      run.phase = 'defeat'; run.endT = 0;
      G.profile.stats.deaths++;
      fx(run, 'gameOver', pl.x, pl.y - 40, { important: true, scale: 1 });
      fx(run, 'skullSmoke', pl.x, pl.y - 10, { scale: 1.5, important: true });
    }
  }

  // ================================================================ drops & pickups
  function dropItem(run, x, y, item) {
    const d = { x, y, kind: 'gear', item, t: 0 };
    d.fxRef = fx(run, 'sparkle', x, y - 6, { loop: true, follow: d, offY: -6 });
    run.drops.push(d);
  }
  function dropPickup(run, x, y, kind) {
    const d = { x, y, kind, t: 0 };
    d.fxRef = fx(run, 'sparkle', x, y - 6, { loop: true, follow: d, offY: -6, scale: 0.7 });
    run.drops.push(d);
  }
  function collectDrops(run) {
    const pl = run.player, p = G.profile;
    for (let i = run.drops.length - 1; i >= 0; i--) {
      const d = run.drops[i];
      if (d.t < 0.4 || pl.dead) continue;
      const dd = dist(d, pl);
      if (dd < 40) { d.x += (pl.x - d.x) * 0.15; d.y += (pl.y - d.y) * 0.15; }
      if (dd > 10) continue;
      let ok = true;
      if (d.kind === 'gear') {
        ok = G.addGear(p, d.item);
        if (ok) { run.rewards.items.push(d.item); G.ui.toast('Found ' + d.item.name, 'loot', G.rarityOf(d.item).color); }
        else if (!d.warned) { d.warned = true; G.ui.toast('Bag is full! Sell or discard items.', 'warn'); }
      } else if (d.kind === 'hp' || d.kind === 'mp') {
        const key = d.kind === 'hp' ? 'hpPotion' : 'mpPotion';
        ok = G.addConsumable(p, key, 1);
        if (ok) text(run, pl.x, pl.y - 44, '+1 ' + G.CONSUMABLES[key].name, '#7ce3a0');
      }
      if (ok) {
        if (d.fxRef) { d.removed = true; d.dead = true; }
        run.drops.splice(i, 1);
        fx(run, 'manaBurst', pl.x, pl.y - 12, { scale: 0.5 });
      }
    }
  }

  // ================================================================ player actions
  function nearestEnemy(run, from, range) {
    let best = null, bd = range;
    for (const e of run.enemies) {
      if (e.dead || e.state === 'spawn') continue;
      const d = dist(e, from);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  function faceToward(pl, tx, ty) {
    const dx = tx - pl.x, dy = ty - pl.y;
    pl.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  }
  const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  game.canAct = () => {
    const r = game.run;
    return r && !game.paused && !r.player.dead && (r.phase === 'waves' || r.phase === 'boss' || r.phase === 'cleared' || r.phase === 'roomclear' || r.phase === 'shrine') && !r.transition;
  };

  function startAttack(run) {
    const pl = run.player;
    if (pl.state === 'attack' || pl.dead) return;
    const t = nearestEnemy(run, pl, 44) || null;
    if (t) faceToward(pl, t.x, t.y);
    else {
      const br = run.map.props.find((pr) => pr.breakable && !pr.dead && dist(pr, pl) < 28);
      if (br) faceToward(pl, br.x, br.y);
    }
    pl.state = 'attack';
    pl.combo = (pl.combo + 1) % 2;
    G.sfx('slash', { vol: t ? 0.8 : 0.55, minGap: 90 });
    if (t) G.voice('light', { chance: 0.1, minGap: 2600, vol: 0.7 });
    pl.animT = 0; pl.hitDone = false;
    pl.atkDur = 0.5 / pl.stats.atkSpeed;
    pl.atkFps = 0; pl.skillSwing = false;
  }

  function resolvePlayerHit(run) {
    const pl = run.player, v = DIRV[pl.dir];
    const hx = pl.x + v[0] * 14, hy = pl.y - 4 + v[1] * 12;
    const mult = (pl.combo ? 1.15 : 1) * (pl.stats.basicMult || 1);
    let hitAny = false;
    for (const e of run.enemies) {
      if (e.dead || e.state === 'spawn') continue;
      if (Math.hypot(e.x - hx, (e.y - 4) - hy) < 20 + e.r) {
        const sb = pl.stealth ? pl.stealth.bonus : 0; // Shadow Monarch Stealth: the first hit crits and hits harder
        const r = rollDamage(pl.stats.atk, mult * (1 + sb), e.defense, sb ? 1 : pl.stats.crit, pl.stats.critDmg);
        const dealt = damageEnemy(run, e, r.dmg, { crit: r.crit, knock: 10 });
        fx(run, r.crit ? 'hitCrit' : 'hit', e.x, e.y - 10 * e.def.scale, { scale: r.crit ? 0.7 : 0.8 });
        swordHitPassives(run, e, dealt);
        if (r.crit) { run.hitStop = Math.max(run.hitStop || 0, 0.04); G.voice('crit', { chance: 0.35, minGap: 900 }); }
        hitAny = true;
      }
    }
    // breakable props
    for (const pr of run.map.props) {
      if (!pr.breakable || pr.dead) continue;
      if (Math.hypot(pr.x - hx, pr.y - 6 - hy) < 22) breakProp(run, pr);
    }
    if (hitAny && pl.stealth) { pl.stealth = null; pl.stealthT = 0; fx(run, 'smokeDark', pl.x, pl.y - 12, { scale: 0.6, fps: 26 }); G.sfx('shRune', { minGap: 0, vol: 0.6 }); }
    if (hitAny) {
      G.sfx('slashHit', { minGap: 70 });
      fx(run, G.profile.path === 'shadow' ? 'shadowArc' : 'slashArc', hx + v[0] * 4, hy - 2 + v[1] * 4, { rot: DIRA[pl.dir] + Math.PI / 2, scale: pl.combo ? 1.05 : 0.9, fps: 26, flip: !!pl.combo });
    }
    if (hitAny && G.profile.settings.screenShake) run.shake = Math.max(run.shake, 1.2);
  }

  function breakProp(run, pr) {
    pr.dead = true;
    fx(run, 'breakSmoke', pr.x, pr.y - 8, { scale: 1.2 });
    G.profile.stats.broken++;
    G.questEvent('break', null, 1);
    const roll = Math.random();
    if (roll < 0.45) {
      const g = rint(2, 5) + Math.floor(run.area.level * 1.5);
      G.profile.gold += g; run.rewards.gold += g;
      text(run, pr.x, pr.y - 24, '+' + g + 'g', '#ffd54a');
      fx(run, 'coins', pr.x, pr.y - 14, { scale: 0.6 });
    } else if (roll < 0.57) dropPickup(run, pr.x, pr.y, 'hp');
    else if (roll < 0.65) dropPickup(run, pr.x, pr.y, 'mp');
  }

  game.usePotion = function (kind) {
    const run = game.run;
    if (!game.canAct()) return false;
    const pl = run.player, p = G.profile;
    if (pl.potionCd > 0) return false;
    const key = kind === 'hp' ? 'hpPotion' : 'mpPotion';
    if (kind === 'hp' && pl.hp >= pl.stats.maxHp) { G.ui.toast('HP is already full', 'warn'); return false; }
    if (kind === 'mp' && pl.mp >= pl.stats.maxMp) { G.ui.toast('MP is already full', 'warn'); return false; }
    if (!G.removeConsumable(p, key, 1)) { G.ui.toast('No ' + G.CONSUMABLES[key].name + 's left', 'warn'); return false; }
    pl.potionCd = C.POTION.cooldown;
    if (run.stat) run.stat.potions++;
    if (kind === 'hp') {
      const h = Math.round(pl.stats.maxHp * C.POTION.hp * (pl.stats.potionMult || 1));
      pl.hp = Math.min(pl.stats.maxHp, pl.hp + h);
      text(run, pl.x, pl.y - 36, '+' + h, '#7ce38a');
      fx(run, 'hearts', pl.x, pl.y - 18, { follow: pl, offY: -18, scale: 0.8 });
    } else {
      const m = Math.round(pl.stats.maxMp * C.POTION.mp);
      pl.mp = Math.min(pl.stats.maxMp, pl.mp + m);
      text(run, pl.x, pl.y - 36, '+' + m + ' MP', '#7cc4ff');
      fx(run, 'manaBurst', pl.x, pl.y - 18, { follow: pl, offY: -18 });
    }
    return true;
  };

  // ==== LOCKED: Storm Blade class v1 (spec: classes/storm-blade/SPEC.md, check: node tools/check-class-lock.js) ====
  // ---------------------------------------------------------------- skills (lightning sword arts)
  const rankOf = (k) => (G.profile.skills[k] || 0);
  const pRank = (k) => G.passiveRank(G.profile, k);
  function skillMult(k) { const sk = G.SKILLS[k]; return (sk.mult || 0) + (sk.perRank || 0) * Math.max(0, rankOf(k) - 1); }
  game.skillMult = skillMult;
  function schedule(run, delay, fn) { run.timers.push({ t: delay, fn }); }
  function power(run) { return run.player.stats.atk * run.player.stats.skillPower; }
  function shake(run, n) { if (G.profile.settings.screenShake) run.shake = Math.max(run.shake, n); }
  // brief freeze-frame on impact (subtle: ~0.05s skills, ~0.12s ultimate)
  function hitStop(run, t) { run.hitStop = Math.max(run.hitStop || 0, t); }
  function alive(e) { return !e.dead && e.state !== 'spawn'; }
  function enemiesNear(run, x, y, r) { return run.enemies.filter((e) => alive(e) && Math.hypot(e.x - x, e.y - y) <= r + e.r); }
  function hitOne(run, e, mult, o) {
    const pl = run.player;
    o = o || {};
    const r = rollDamage(power(run), mult, e.defense, o.crit != null ? o.crit : pl.stats.crit, pl.stats.critDmg);
    const dealt = damageEnemy(run, e, r.dmg, { crit: r.crit, skill: true, knock: o.knock == null ? 14 : o.knock });
    if (r.crit && dealt) fx(run, 'sparkBurst', e.x, bodyY(e), { scale: 0.45, fps: 24 });
    hitStop(run, o.stop == null ? 0.05 : o.stop);
    return dealt;
  }
  function hitArea(run, cx, cy, radius, mult, each, o) {
    let n = 0;
    for (const e of enemiesNear(run, cx, cy, radius)) {
      const dealt = hitOne(run, e, mult, o);
      if (each) each(e, dealt);
      n++;
    }
    return n;
  }
  function healPlayer(run, amount) {
    const pl = run.player;
    const h = Math.round(Math.min(pl.stats.maxHp - pl.hp, amount));
    if (h <= 0 || pl.dead) return;
    pl.hp += h;
    text(run, pl.x, pl.y - 38, '+' + h, '#7ce38a');
  }
  const bodyY = (e) => (e.def ? e.y - 10 * e.def.scale : e.y - 14);
  const DIRA = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

  // skill swings play the hero's own attack frames; the hero can keep moving during them
  function swing(run, combo, speed, canMove) {
    const pl = run.player;
    pl.state = 'attack'; pl.combo = combo; pl.animT = 0; pl.hitDone = true;
    pl.atkFps = 16 * pl.stats.atkSpeed * (speed || 1.4);
    pl.atkDur = 8 / pl.atkFps;
    pl.skillSwing = canMove !== false;
  }
  function enemiesInFront(run, reach) {
    const pl = run.player, v = DIRV[pl.dir];
    const cx = pl.x + v[0] * reach * 0.45, cy = pl.y - 4 + v[1] * reach * 0.45;
    return run.enemies.filter((e) => alive(e) && Math.hypot(e.x - cx, e.y - 4 - cy) <= reach * 0.75 + e.r);
  }
  function frontPoint(pl, d) { const v = DIRV[pl.dir]; return { x: pl.x + v[0] * d, y: pl.y - 8 + v[1] * d }; }
  function startDash(run, tx, ty, dur, onHit, onEnd, trail) {
    const pl = run.player;
    const a = Math.atan2(ty - pl.y, tx - pl.x);
    pl.dir = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? (Math.cos(a) > 0 ? 'right' : 'left') : Math.sin(a) > 0 ? 'down' : 'up';
    pl.dash = { sx: pl.x, sy: pl.y, tx, ty, t: 0, dur, a, hit: new Set(), onHit, onEnd, trail, lastTrail: 0 };
    pl.invuln = Math.max(pl.invuln, dur + 0.15);
    pl.state = 'idle';
  }
  function stun(run, e, t) {
    if (e.dead) return;
    applyStatus(run, e, 'stun', { t });
  }

  // yellow + black lightning pair at a point (black = darkened copy of the same sheets)
  function strikeYB(run, x, y, scale, o) {
    o = o || {};
    fx(run, 'thunderStrikeDark', x + 3, y - 30, { scale: (scale || 1) * 1.15, fps: 24 });
    fx(run, 'thunderStrike', x, y - 30, { scale: scale || 1, fps: 24, important: o.important });
  }
  function splashYB(run, x, y, scale) {
    fx(run, 'thunderSplashDark', x, y - 6, { scale: (scale || 1) * 1.2, fps: 26 });
    fx(run, 'thunderSplash', x, y - 6, { scale: scale || 1, fps: 26 });
  }
  // a flash-dash leg; legs chain through onEnd
  function flashLeg(run, tx, ty, dur, onHit, onEnd, trailStep) {
    const pl = run.player;
    startDash(run, tx, ty, dur, onHit, () => {
      thunderStepProc(run);
      onEnd && onEnd();
    }, (x, y, i) => {
      // lighter trail: a yellow spark every step, a black burst every third
      if (i % 3 === 1) fx(run, 'burstDark', x, y - 10, { scale: 0.6, fps: 28 });
      else fx(run, 'thunderSplash', x, y - 8, { scale: 0.7, fps: 28 });
    });
    if (pl.dash) {
      pl.dash.step = trailStep || 18;
      // departure burst pointing along the flash
      fx(run, 'flashKick', pl.x + Math.cos(pl.dash.a) * 18, pl.y - 10 + Math.sin(pl.dash.a) * 18, { rot: pl.dash.a, scale: 0.8, fps: 30 });
    }
  }
  function thunderStepProc(run) {
    const r = pRank('thunderstep'), pl = run.player;
    if (!r) return;
    for (const k of Object.keys(pl.cds)) pl.cds[k] = Math.max(0, pl.cds[k] - G.SKILLS.thunderstep.cdr * r);
    pl.mp = Math.min(pl.stats.maxMp, pl.mp + G.SKILLS.thunderstep.mp * r);
  }
  // Iai Focus: consumed by the next Flash skill
  function takeFocus(run) {
    const pl = run.player;
    if (!pl.focused) return { crit: null, bonus: 1 };
    pl.focused = false; pl.focusT = 0;
    if (pl.focusFx) pl.focusFx.dur = 0.0001;
    fx(run, 'sparkBurst', pl.x, pl.y - 16, { scale: 0.6, fps: 26 });
    return { crit: 1, bonus: 1 + pRank('iaifocus') * G.SKILLS.iaifocus.bonus };
  }
  // enemies close to the segment a→b
  function enemiesOnLine(run, ax, ay, bx, by, w) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    return run.enemies.filter((e) => {
      if (!alive(e)) return false;
      const t = Math.max(0, Math.min(1, ((e.x - ax) * dx + (e.y - ay) * dy) / L2));
      return Math.hypot(e.x - (ax + dx * t), e.y - (ay + dy * t)) <= w + e.r;
    });
  }
  // next flash target: nearest enemy not cut yet (falls back to any nearby enemy)
  function nextFlashTarget(run, from, radius, cut) {
    const list = enemiesNear(run, from.x, from.y, radius).sort((a, b) => dist(a, from) - dist(b, from));
    return list.find((e) => !cut.has(e)) || list.find((e) => dist(e, from) > 20) || null;
  }

  // Thunder Sheath counter: no damage taken, flash to the attacker and cut with a guaranteed crit
  function sheathCounter(run, src) {
    const pl = run.player, pr = pl.parry;
    if (!pr) return;
    pl.parry = null; pl.castLock = 0;
    if (pr.fxRef) pr.fxRef.dur = 0.0001;
    if (pr.snd) pr.snd.stop();
    G.sfx('impact'); G.sfx('strikeBig', { vol: 0.8 });
    G.voice('crit', { minGap: 0 });
    schedule(run, 0.07, () => G.sfx('slashHit', { minGap: 0, rate: 0.95 }));
    text(run, pl.x, pl.y - 40, 'COUNTER', '#ffe066', true);
    fx(run, 'sparkBurst', pl.x, pl.y - 14, { scale: 0.9 });
    hitStop(run, 0.08);
    pl.invuln = Math.max(pl.invuln, 0.5);
    const target = src && src.x != null && !src.dead && dist(src, pl) <= G.SKILLS.sheath.range ? src : nearestEnemy(run, pl, 60);
    if (!target) { splashYB(run, pl.x, pl.y, 1.4); hitArea(run, pl.x, pl.y, 40, pr.mult, null, { crit: 1, knock: 20 }); return; }
    const a = Math.atan2(target.y - pl.y, target.x - pl.x);
    pl.flashing = true;
    swing(run, 1, 3, false);
    flashLeg(run, target.x - Math.cos(a) * (target.r + 10), target.y - Math.sin(a) * (target.r + 10), 0.07, null, () => {
      pl.flashing = false;
      swing(run, 0, 2.6, false);
      fx(run, 'slashGold', target.x, bodyY(target), { rot: a, scale: 1.1, fps: 24 });
      strikeYB(run, target.x, target.y, 1.4, { important: true });
      if (!target.dead) hitOne(run, target, pr.mult, { crit: 1, knock: 26, stop: 0.1 });
      shake(run, 6);
    }, 18);
  }

  game.castSkill = function (slot) {
    const run = game.run;
    if (!game.canAct()) return false;
    const p = G.profile, pl = run.player;
    const key = G.barSkill(p, slot);
    if (!key) return false;
    const sk = G.SKILLS[key], rank = rankOf(key);
    if ((pl.cds[key] || 0) > 0 || pl.castLock > 0 || pl.dash || pl.flashing) return false;
    if (pl.mp < sk.mp) { G.ui.toast('Not enough MP', 'warn'); return false; }
    // other classes plug in through game.classSkills[path] (defined below the locked block)
    if (sk.path !== 'storm') {
      const cls = game.classSkills[sk.path];
      if (!cls || !cls.cast) return false;
      pl.mp -= sk.mp; pl.cds[key] = sk.cd;
      return cls.cast(run, key, sk, rank, classKit) !== false;
    }
    const near = nearestEnemy(run, pl, sk.radius || 150);
    if ((key === 'sixfold' || key === 'godspeed') && !near) { G.ui.toast('No enemy in range', 'warn'); return false; }
    pl.mp -= sk.mp;
    pl.cds[key] = sk.cd;
    const mult = skillMult(key);
    const focus = key === 'blinkstep' || key === 'sheath' ? { crit: null, bonus: 1 } : takeFocus(run);

    // direction of a straight flash: toward the nearest enemy, else the way the hero faces
    const aimAngle = () => {
      const t = nearestEnemy(run, pl, 160);
      if (t) return Math.atan2(t.y - pl.y, t.x - pl.x);
      const v = DIRV[pl.dir];
      return Math.atan2(v[1], v[0]);
    };

    switch (key) {
      // ---- Lv 1: one straight flash, enemies on the line are cut a beat later
      case 'flashdraw': {
        pl.castLock = sk.stance;
        swing(run, 0, 0.6, false);
        G.sfx('stance', { vol: 0.6 });
        G.voice('light', { minGap: 0 });
        fx(run, 'chargeUp', pl.x, pl.y - 16, { follow: pl, offY: -16, scale: 0.6, fps: 40 });
        schedule(run, sk.stance, () => {
          if (game.run !== run) return;
          const a = aimAngle();
          const sx = pl.x, sy = pl.y;
          splashYB(run, sx, sy, 1);
          G.sfx('launch', { vol: 0.7 });
          G.sfx('slash', { minGap: 0, rate: 1.1 });
          pl.flashing = true;
          flashLeg(run, sx + Math.cos(a) * sk.dashLen, sy + Math.sin(a) * sk.dashLen, sk.dashTime, null, () => {
            pl.flashing = false;
            swing(run, 1, 2.4, true);
            const victims = enemiesOnLine(run, sx, sy, pl.x, pl.y, sk.width);
            schedule(run, sk.delay, () => {
              if (game.run !== run) return;
              if (victims.length) { G.sfx('strikeBig'); G.sfx('impact', { vol: 0.8 }); G.sfx('slashHit', { minGap: 0 }); }
              victims.forEach((e) => {
                if (e.dead) return;
                G.sfx('strike', { vol: 0.6, minGap: 60 });
                fx(run, 'slashGold', e.x, bodyY(e), { rot: a, scale: 1, fps: 24 });
                strikeYB(run, e.x, e.y, 1.1);
                hitOne(run, e, mult * focus.bonus, { crit: focus.crit, knock: 18, stop: 0.06 });
              });
              if (victims.length) shake(run, 4);
            });
          });
        });
        break;
      }
      // ---- Lv 3 / Lv 6: chained flashes between enemies
      case 'sixfold': case 'godspeed': {
        const n = sk.flashes + (key === 'godspeed' ? 0 : 0);
        const cut = new Set();
        let left = n, last = null;
        pl.flashing = true;
        pl.invuln = Math.max(pl.invuln, n * sk.segTime + 0.4);
        fx(run, 'auraDark', pl.x, pl.y - 14, { scale: 0.9, fps: 26 });
        G.sfx('launch', { vol: 0.7 });
        G.voice(key === 'godspeed' ? 'heavy' : 'light', { minGap: 0 });
        const leg = () => {
          if (game.run !== run) return;
          const t = nextFlashTarget(run, pl, sk.radius, cut);
          if (!t || left <= 0 || pl.dead) return finish();
          left--;
          const a = Math.atan2(t.y - pl.y, t.x - pl.x);
          const tx = t.x + Math.cos(a) * (t.r + 16), ty = t.y + Math.sin(a) * (t.r + 16);
          swing(run, left % 2, 3, false);
          flashLeg(run, tx, ty, sk.segTime, (e) => {
            cut.add(e); last = e;
            G.sfx('strike', { vol: 0.5, minGap: 55, rate: key === 'godspeed' ? 1.15 : 1 });
            G.sfx('slashHit', { vol: 0.75, minGap: 50, rate: key === 'godspeed' ? 1.12 : 1 });
            fx(run, 'slashGold', e.x, bodyY(e), { rot: a, scale: 0.9, fps: 26 });
            fx(run, 'thunderSplashDark', e.x, e.y - 6, { scale: 1, fps: 26 });
            hitOne(run, e, mult * focus.bonus, { crit: focus.crit, knock: 8, stop: 0.03 });
          }, leg, 22);
        };
        const finish = () => {
          pl.flashing = false;
          if (key === 'sixfold') {
            schedule(run, 0.12, () => {
              if (game.run !== run) return;
              cut.forEach((e) => { if (!e.dead) splashYB(run, e.x, e.y, 1); });
              if (cut.size) G.sfx('impact', { vol: 0.7 });
              shake(run, 3);
            });
          } else {
            const f = last && !last.dead ? last : nearestEnemy(run, pl, 80);
            const fxp = f || pl;
            G.sfx('finisher'); G.sfx('impact');
            G.voice('heavy', { minGap: 0 });
            fx(run, 'boltDark', fxp.x + 4, fxp.y - 50, { scale: 1.2, fps: 18, important: true });
            strikeYB(run, fxp.x, fxp.y, 1.6, { important: true });
            fx(run, 'sparkBurst', fxp.x, fxp.y - 14, { scale: 1.1 });
            hitArea(run, fxp.x, fxp.y, 40, sk.finisher * (1 + sk.perRank * (rank - 1)) * focus.bonus, (e) => stun(run, e, sk.stun), { crit: focus.crit, knock: 26, stop: 0.1 });
            shake(run, 7);
          }
        };
        leg();
        break;
      }
      // ---- Lv 4: evasive flash away from danger
      case 'blinkstep': {
        pl.cds[key] = Math.max(1.5, sk.cd - sk.cdPerRank * (rank - 1));
        const t = nearestEnemy(run, pl, 120);
        let a;
        if (t) a = Math.atan2(pl.y - t.y, pl.x - t.x);
        else { const v = DIRV[pl.dir]; a = Math.atan2(-v[1], -v[0]); }
        const mv = Math.hypot(G.input.mx, G.input.my);
        if (mv > 0.3) a = Math.atan2(G.input.my, G.input.mx); // steer with the joystick
        const ox = pl.x, oy = pl.y;
        G.sfx('whoosh', { vol: 0.8 });
        G.voice('dodge', { minGap: 0 });
        fx(run, 'burstDark', ox, oy - 12, { scale: 1.1, fps: 26 });
        fx(run, 'thunderSplashDark', ox, oy - 6, { scale: 1.3, fps: 26 });
        hitArea(run, ox, oy, sk.radius, mult, null, { knock: 16, stop: 0.03 });
        pl.flashing = true;
        flashLeg(run, ox + Math.cos(a) * sk.dist, oy + Math.sin(a) * sk.dist, sk.dashTime, null, () => {
          pl.flashing = false;
          fx(run, 'thunderSplash', pl.x, pl.y - 6, { scale: 1, fps: 26 });
          pl.invuln = Math.max(pl.invuln, 0.2);
        }, 20);
        shake(run, 1.5);
        break;
      }
      // ---- Lv 7: parry stance; a blow that lands triggers a flash counter
      case 'sheath': {
        const win = sk.window + sk.perRankWindow * (rank - 1);
        pl.parry = { t: win, key, mult };
        pl.castLock = win;
        pl.state = 'idle';
        fx(run, 'chargeUp', pl.x, pl.y - 16, { follow: pl, offY: -16, scale: 0.7, fps: 30 });
        pl.parry.fxRef = fx(run, 'auraDark', pl.x, pl.y - 14, { follow: pl, offY: -14, loop: true, dur: win, scale: 1.1, fps: 22 });
        pl.parry.snd = G.sfx('hold', { loop: true, vol: 0.8, minGap: 0 });
        G.voice('stance', { minGap: 0, vol: 0.7 });
        break;
      }
      // ---- Ultimate: one enormous flash, then a column of black & yellow lightning along the path
      case 'sovereign': {
        pl.castLock = sk.windup; pl.invuln = Math.max(pl.invuln, sk.windup + sk.dashTime + 0.6);
        swing(run, 0, 0.8, false);
        fx(run, 'chargeUp', pl.x, pl.y - 20, { follow: pl, offY: -20, scale: 1.4, fps: 30 });
        fx(run, 'auraDark', pl.x, pl.y - 14, { follow: pl, offY: -14, loop: true, dur: sk.windup, scale: 1.5, fps: 24 });
        G.sfx('charge'); G.sfx('castLong', { vol: 0.5 });
        G.voice('ult', { minGap: 0, vol: 1 });
        G.ui.banner(sk.name, '');
        schedule(run, sk.windup, () => {
          if (game.run !== run) return;
          const a = aimAngle();
          const sx = pl.x, sy = pl.y;
          fx(run, 'lightBurst', sx, sy - 16, { scale: 1, important: true });
          G.sfx('launch', { vol: 0.9 });
          G.sfx('slash', { minGap: 0, rate: 0.85 });
          pl.flashing = true;
          flashLeg(run, sx + Math.cos(a) * sk.dashLen, sy + Math.sin(a) * sk.dashLen, sk.dashTime, null, () => {
            pl.flashing = false;
            swing(run, 1, 2.2, false);
            const ex = pl.x, ey = pl.y, len = Math.hypot(ex - sx, ey - sy);
            const hitSet = new Set();
            const steps = Math.max(3, Math.round(len / 24));
            hitStop(run, 0.12);
            G.sfx('ultBlast'); G.sfx('impact'); G.sfx('strikeBig', { vol: 0.9 }); G.sfx('slashHit', { minGap: 0, rate: 0.85 });
            for (let i = 0; i <= steps; i++) schedule(run, 0.05 + i * 0.035, () => {
              G.sfx('strike', { vol: 0.75, minGap: 85 });
              if (game.run !== run) return;
              const x = sx + ((ex - sx) * i) / steps, y = sy + ((ey - sy) * i) / steps;
              fx(run, 'boltDark', x + 4, y - 50, { scale: 1.05, fps: 18, important: true });
              strikeYB(run, x, y, 1.3, { important: i % 3 === 0 });
              enemiesNear(run, x, y, sk.width).forEach((e) => {
                if (hitSet.has(e)) return;
                hitSet.add(e);
                hitOne(run, e, mult * focus.bonus, { crit: focus.crit, knock: 28, stop: 0.12 });
                stun(run, e, sk.stun);
              });
              shake(run, 6);
            });
            schedule(run, 0.1 + steps * 0.035, () => { if (game.run !== run) return; fx(run, 'lightBurst', ex, ey - 16, { scale: 1.3, important: true }); G.sfx('strikeBig', { minGap: 0 }); G.sfx('impact', { minGap: 0 }); shake(run, 9); });
          }, 16);
        });
        break;
      }
    }
    return true;
  };

  // dash movement, Iai Focus, scheduled sub-hits
  function updateSkillZones(run, dt) {
    const pl = run.player;
    for (let i = run.timers.length - 1; i >= 0; i--) {
      const t = run.timers[i];
      t.t -= dt;
      if (t.t <= 0) { run.timers.splice(i, 1); t.fn(); }
    }
    if (pl.castLock > 0) pl.castLock -= dt;
    const d = pl.dash;
    if (d) {
      d.t += dt;
      const k = Math.min(1, d.t / d.dur);
      pl.x = d.sx + (d.tx - d.sx) * k; pl.y = d.sy + (d.ty - d.sy) * k;
      G.collide(run.map, pl, pl.r);
      if (d.onHit) for (const e of run.enemies) if (alive(e) && !d.hit.has(e) && Math.hypot(e.x - pl.x, e.y - pl.y) < e.r + 16) { d.hit.add(e); d.onHit(e); }
      const step = d.step || 24;
      if (d.trail) while (Math.hypot(pl.x - d.sx, pl.y - d.sy) - d.lastTrail > step) { d.lastTrail += step; d.ti = (d.ti || 0) + 1; d.trail(d.sx + Math.cos(d.a) * d.lastTrail, d.sy + Math.sin(d.a) * d.lastTrail, d.ti); }
      if (k >= 1 || pl.dead) { pl.dash = null; d.onEnd && d.onEnd(); }
    }
    // Thunder Sheath stance runs out with no hit: shorter cooldown
    if (pl.parry) {
      pl.parry.t -= dt;
      if (pl.parry.t <= 0) {
        const k = pl.parry.key;
        pl.cds[k] = Math.min(pl.cds[k] || 0, G.SKILLS[k].missCd);
        if (pl.parry.snd) pl.parry.snd.stop();
        pl.parry = null;
      }
    }
    // Iai Focus: stand still (no moving, attacking or dashing) to build focus
    const fr = pRank('iaifocus');
    if (fr && !pl.dead) {
      const still = pl.state === 'idle' && !pl.dash && !pl.flashing && Math.hypot(G.input.mx, G.input.my) < 0.15;
      if (still && !pl.focused) {
        pl.focusT = (pl.focusT || 0) + dt;
        if (pl.focusT >= G.SKILLS.iaifocus.focusTime) {
          pl.focused = true;
          G.sfx('stance', { vol: 0.35 });
          fx(run, 'chargeUp', pl.x, pl.y - 18, { follow: pl, offY: -18, scale: 0.55, fps: 30 });
          pl.focusFx = fx(run, 'sparkle', pl.x, pl.y - 40, { follow: pl, offY: -40, loop: true, scale: 0.6, fps: 14 });
        }
      } else if (!still && !pl.focused) pl.focusT = 0;
    }
    for (const id in game.classSkills) { const c = game.classSkills[id]; if (c.update) c.update(run, dt, classKit); }
  }
  // ==== END LOCKED: Storm Blade class v1 ====

  // ---- plug-in point for the next classes: register game.classSkills[pathId] = { cast(run, key, sk, rank, kit), update(run, dt, kit) }
  // kit gives class code the same building blocks Storm Blade uses, so new classes never need to edit the locked block.
  game.classSkills = {};
  const classKit = {
    fx: (run, key, x, y, o) => fx(run, key, x, y, o), schedule, shake, hitStop, hitOne, hitArea, stun, swing, startDash, flashLeg,
    nearestEnemy, enemiesNear, enemiesOnLine, enemiesInFront, frontPoint, skillMult, power, bodyY, faceToward, alive,
    rank: rankOf, passiveRank: pRank, DIRV, DIRA,
    drawSheet, damageEnemy, applyStatus, text, rollDamage, dist, setAnim, resolvePlayerHit,
  };

  // internals that objectives.js needs
  game._objApi = {
    spawnEnemy, makeElite, damagePlayer, damageEnemy, applyStatus, setAnim, startEnemyAttack, areaCleared, text,
    fx: (run, key, x, y, o) => fx(run, key, x, y, o), banner: (a, b) => G.ui.banner(a, b),
  };

  // hook kept for sword hits (no on-hit passives in this kit)
  function swordHitPassives() {}

  function applyStatus(run, e, kind, o) {
    if (e.dead) return;
    const s = e.status[kind];
    if (kind === 'stun' && e.boss) o.t *= 0.4;
    if (s) { s.t = Math.max(s.t, o.t); if (o.dps) s.dps = Math.max(s.dps, o.dps); return; }
    const topY = e.def.hgt ? e.y - e.def.hgt * e.def.scale - 8 : e.y - 22 * e.def.scale - 8;
    if (kind === 'stun' && !o.label) text(run, e.x, topY, 'STUN', '#9fe0ff');
    if (o.label) text(run, e.x, topY, o.label, o.labelColor || '#c9a6ff');
    const st = Object.assign({ tick: 0.5 }, o);
    if (o.noFx) { e.status[kind] = st; return; }
    const fxKey = o.fxKey || (kind === 'burn' ? 'burn' : kind === 'poison' ? 'statusPoison' : 'statusStun');
    const h = e.def.hgt ? e.def.hgt * e.def.scale - 4 : (e.def.ay - 40) * e.def.scale * 0.5 + 10 * e.def.scale;
    st.fx = fx(run, fxKey, e.x, e.y, { loop: true, follow: e, offY: kind === 'burn' ? -10 * e.def.scale : -h - 6, scale: kind === 'burn' ? 0.8 * Math.min(1.6, e.def.scale) : 0.6, fps: 12 });
    e.status[kind] = st;
  }

  function updateStatuses(run, e, dt) {
    for (const k of Object.keys(e.status)) {
      const s = e.status[k];
      s.t -= dt;
      if (s.dps) {
        s.tick -= dt;
        if (s.tick <= 0) {
          s.tick += 0.5;
          const dmg = Math.max(1, Math.round(s.dps * 0.5 * (C.DEF_K / (C.DEF_K + e.defense * 0.5))));
          damageEnemy(run, e, dmg, { stagger: false, skill: true });
        }
      }
      if (s.t <= 0 || e.dead) {
        if (s.fx) s.fx.dur = 0.0001;
        delete e.status[k];
      }
    }
  }

  // ================================================================ enemy AI
  function enterPhase2(run, e) {
    e.phase2 = true;
    G.ui.toast(e.def.name + ' is enraged!', 'boss');
    fx(run, 'alert', e.x, e.y, { follow: e, offY: -e.def.ay * e.def.scale * 0.55 - 12, important: true });
    const adds = e.id === 'knight' ? [['archer', 2], ['orc', 2]] : e.id === 'necro' ? [['demon', 2], ['kobold', 2]] : [['orc', 3]];
    adds.forEach(([id, n]) => { for (let i = 0; i < n; i++) run.spawnQueue.push({ id, level: e.level - 1, delay: 0.3 }); });
  }

  function updateEnemy(run, e, dt) {
    const pl = run.player, def = e.def;
    e.animT += dt; e.stateT += dt;
    if (e.flash > 0) e.flash -= dt;
    // knockback
    if (Math.abs(e.knock.x) + Math.abs(e.knock.y) > 0.5) {
      e.x += e.knock.x * dt * 8; e.y += e.knock.y * dt * 8;
      e.knock.x *= Math.pow(0.02, dt); e.knock.y *= Math.pow(0.02, dt);
      G.collide(run.map, e, e.r);
    }
    if (e.state === 'spawn') { if (e.stateT > 0.45) { e.state = 'chase'; setAnim(e, 'idle'); } return; }
    if (e.state === 'dead') {
      if (e.stateT > 1.2 && !e.removed) { e.removed = true; fx(run, 'skullSmoke', e.x, e.y - 10, { scale: e.boss ? 2 : 1 }); }
      return;
    }
    updateStatuses(run, e, dt);
    if (e.dead) return;
    if (e.block > 0) e.block -= dt;
    if (e.status.stun) { setAnim(e, 'hurt'); if (e.animT * 14 >= 3) e.animT = 0; return; }
    if (e.status.fear && !e.boss && e.state !== 'attack') { // Bloodlust: run away from the hero
      const a = Math.atan2(e.y - pl.y, e.x - pl.x);
      e.x += Math.cos(a) * e.def.speed * 0.8 * dt; e.y += Math.sin(a) * e.def.speed * 0.8 * dt;
      G.collide(run.map, e, e.r);
      e.face = Math.cos(a) >= 0 ? 1 : -1; setAnim(e, 'walk');
      return;
    }
    e.cdT -= dt;
    e.special -= dt;
    const slow = (e.status.poison ? 1 - (e.status.poison.slow || 0) : 1) * (e.status.slow ? 1 - (e.status.slow.amt || 0) : 1); // poison, Monarch's Domain
    const enr = e.phase2 ? 1.25 : 1;
    const dx = pl.x - e.x, dy = pl.y - e.y, d = Math.hypot(dx, dy);
    if (Math.abs(dx) > 2 && e.state !== 'attack' && e.state !== 'lunge') e.face = dx > 0 ? 1 : -1;
    const ai = animInfo(e);

    const moveToward = (tx, ty, sp) => {
      const a = Math.atan2(ty - e.y, tx - e.x);
      e.x += Math.cos(a) * sp * dt; e.y += Math.sin(a) * sp * dt;
      G.collide(run.map, e, e.r);
    };

    switch (e.state) {
      case 'hurt':
        if (e.stateT > 0.28) { e.state = 'chase'; setAnim(e, 'walk'); }
        return;
      case 'attack': {
        if (!e.hitDone && ai.frame >= e.hitFrame) {
          e.hitDone = true;
          if (e.atkObj) { e.atkObj = false; G.objectives.hitObject(run, e); } else
          if (e.atkKind === 'shoot') {
            const a = Math.atan2(pl.y - 6 - (e.y - 9 * def.scale), pl.x - e.x);
            run.projectiles.push({ x: e.x + e.face * 10, y: e.y - 9 * def.scale, vx: Math.cos(a) * def.arrowSpeed, vy: Math.sin(a) * def.arrowSpeed, a, life: 1.6, src: e, mult: 1 });
          } else if (e.atkKind === 'slam') {
            fx(run, 'slamDust', e.x, e.y - 6, { scale: 2.2 });
            fx(run, 'slamBlast', e.x, e.y - 10, { scale: 1.4 });
            if (G.profile.settings.screenShake) run.shake = 6;
            if (dist(e, pl) < 46 + pl.r) damagePlayer(run, 1.8, e, { shake: 6, fx: 'hitHeavy' });
          } else {
            const reach = def.range + pl.r + 6;
            const fxp = { x: e.x + e.face * def.range * 0.8, y: e.y - 6 };
            if (Math.hypot(pl.x - fxp.x, pl.y - fxp.y) < reach || d < reach) damagePlayer(run, e.atkMult || 1, e, { shake: e.boss ? 4 : 2 });
          }
        }
        if (ai.done) {
          if (e.combo && e.combo > 0) { e.combo--; setAnim(e, 'heavy'); e.hitDone = false; e.atkMult = 1.25; e.hitFrame = def.hit; }
          else { e.state = 'chase'; e.cdT = def.cd / enr * rnd(0.85, 1.2); setAnim(e, 'idle'); }
        }
        return;
      }
      case 'telegraph':
        setAnim(e, e.ai === 'knight' ? 'block' : 'idle');
        if (e.anim === 'block' && ai.frame >= 2) e.animT = 2 / 10;
        if (e.stateT > 0.8) {
          if (e.next === 'slam') { e.state = 'attack'; e.atkKind = 'slam'; setAnim(e, 'heavy'); e.hitDone = false; e.hitFrame = 3; e.combo = 0; }
          else if (e.next === 'lunge') { e.state = 'lunge'; setAnim(e, 'lunge'); e.hitDone = false; e.lungeA = Math.atan2(pl.y - e.y, pl.x - e.x); e.face = Math.cos(e.lungeA) >= 0 ? 1 : -1; }
          else if (e.next === 'bolts') { e.state = 'chase'; castBolts(run, e); }
        }
        return;
      case 'lunge': {
        if (ai.frame >= 2 && ai.frame <= 6) {
          e.x += Math.cos(e.lungeA) * 230 * dt; e.y += Math.sin(e.lungeA) * 230 * dt;
          G.collide(run.map, e, e.r);
          if (!e.hitDone && dist(e, pl) < e.r + pl.r + 12) {
            e.hitDone = true;
            damagePlayer(run, 1.7, e, { shake: 6 });
            fx(run, 'hitLunge', pl.x, pl.y - 12, { flip: e.face < 0, scale: 0.6 });
          }
        }
        if (ai.done) { e.state = 'chase'; e.cdT = 0.8; setAnim(e, 'idle'); }
        return;
      }
      case 'cast': // necromancer spells: play the cast animation, fire the spell on its frame
        setAnim(e, e.castAnim);
        if (!e.hitDone && ai.frame >= e.castFrame) { e.hitDone = true; e.castFn && e.castFn(); }
        if (ai.done) { e.state = 'chase'; setAnim(e, 'idle'); }
        return;
      case 'block':
        setAnim(e, 'block');
        if (ai.frame >= 4) e.animT = 2 / 10; // hold the guard pose
        if (e.block <= 0) { e.state = 'chase'; setAnim(e, 'idle'); }
        return;
    }

    // ---- chase / decide
    if (pl.dead) { setAnim(e, 'idle'); return; }
    if (run.obj && G.objectives.think(run, e, d, moveToward, slow)) return; // defend targets, the fleeing bounty
    if (e.ai === 'warlord' && e.special <= 0 && d < 90) {
      e.special = rnd(5.5, 7) / enr; e.state = 'telegraph'; e.stateT = 0; e.next = 'slam';
      fx(run, 'alert', e.x, e.y, { follow: e, offY: -def.ay * def.scale * 0.32 - 14, important: true });
      return;
    }
    if (e.ai === 'knight') {
      if (e.recentDmg > e.maxHp * 0.08 && e.special > 1) { e.recentDmg = 0; e.state = 'block'; e.block = 2.2; e.stateT = 0; fx(run, 'defUp', e.x, e.y, { follow: e, offY: -def.ay * def.scale * 0.5 - 14, scale: 0.6 }); return; }
      if (e.special <= 0) {
        const r = Math.random();
        e.special = rnd(4, 6) / enr;
        e.state = 'telegraph'; e.stateT = 0;
        e.next = e.phase2 && r < 0.45 ? 'bolts' : 'lunge';
        fx(run, 'alert', e.x, e.y, { follow: e, offY: -def.ay * def.scale * 0.5 - 14, important: true });
        return;
      }
      e.recentDmg = Math.max(0, (e.recentDmg || 0) - dt * e.maxHp * 0.02);
    }
    if (e.ai === 'necro') { necroThink(run, e, d, dx, dy, enr, slow, moveToward); return; }
    if (e.ai === 'ranged') {
      if (d < 52) { moveToward(e.x - dx, e.y - dy, def.speed * 0.9 * slow); setAnim(e, 'walk'); if (d < 22 && e.cdT <= 0) startEnemyAttack(e, 'attack'); return; }
      if (d <= def.range && e.cdT <= 0) { startEnemyAttack(e, 'shoot'); return; }
      if (d > def.range * 0.85) { moveToward(pl.x, pl.y, def.speed * slow); setAnim(e, 'walk'); }
      else setAnim(e, 'idle');
      return;
    }
    // melee
    if (d <= def.range + pl.r + 2) {
      if (e.cdT <= 0) startEnemyAttack(e, 'attack');
      else setAnim(e, 'idle');
    } else {
      moveToward(pl.x, pl.y, def.speed * slow * enr);
      setAnim(e, e.ai === 'knight' && d > 80 ? 'run' : 'walk');
    }
  }

  // ---- Morvath the Necromancer: keeps his distance, curses the ground under the hero, summons demons
  function necroCast(e, anim, frame, fn) { e.state = 'cast'; e.stateT = 0; e.hitDone = false; e.castAnim = anim; e.castFrame = frame; e.castFn = fn; e.anim = null; setAnim(e, anim); }
  function necroThink(run, e, d, dx, dy, enr, slow, moveToward) {
    const def = e.def, pl = run.player;
    e.face = dx >= 0 ? 1 : -1;
    if (e.special <= 0) { // summon demons
      e.special = rnd(7, 9) / enr;
      fx(run, 'alert', e.x, e.y, { follow: e, offY: -def.hgt * def.scale - 12, important: true });
      necroCast(e, 'cast', 8, () => {
        const n = e.phase2 ? 3 : 2;
        G.sfx('shSummon', { minGap: 0 });
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rnd(0, 1), p = { x: e.x + Math.cos(a) * 34, y: e.y + Math.sin(a) * 24 };
          fx(run, 'portalVoid', p.x, p.y - 6, { scale: 0.6 });
          run.spawnQueue.unshift({ id: 'demon', level: Math.max(1, e.level - 1), delay: 0.25, at: p });
        }
      });
      return;
    }
    if (e.cdT <= 0 && d < 190) { // curse: dark marks under and around the hero erupt in skull smoke
      e.cdT = def.cd / enr * rnd(0.85, 1.2);
      necroCast(e, Math.random() < 0.5 ? 'attack' : 'heavy', 6, () => {
        const n = e.phase2 ? 4 : 3;
        G.sfx('shDebuff', { minGap: 0, vol: 0.7 });
        for (let i = 0; i < n; i++) {
          const pt = i === 0 ? { x: pl.x, y: pl.y } : { x: pl.x + rnd(-42, 42), y: pl.y + rnd(-34, 34) };
          const delay = 0.85 + i * 0.18;
          run.hazards.push({ x: pt.x, y: pt.y, t: 0, delay, radius: 16, mult: 1.3, src: e, fx: 'riseSkull', fy: 10, fs: 0.8, snd: 'shBlast',
            warn: fx(run, 'fearMark', pt.x, pt.y - 4, { loop: true, dur: delay, scale: 0.9 }) });
        }
      });
      return;
    }
    // drift: back away when the hero gets close, close in when far
    const keep = def.keep;
    if (d < keep * 0.65) { moveToward(e.x - dx, e.y - dy, def.speed * 1.1 * slow); setAnim(e, 'walk'); e.face = dx >= 0 ? 1 : -1; }
    else if (d > keep * 1.35) { moveToward(pl.x, pl.y, def.speed * slow); setAnim(e, 'walk'); }
    else setAnim(e, 'idle');
  }

  function startEnemyAttack(e, kind) {
    e.state = 'attack'; e.stateT = 0; e.hitDone = false; e.atkKind = kind; e.combo = 0; e.atkMult = 1;
    if (kind === 'shoot') { setAnim(e, 'shoot'); e.hitFrame = e.def.hit; }
    else {
      const heavy = e.def.heavy && Math.random() < 0.4;
      setAnim(e, heavy ? 'heavy' : 'attack');
      e.atkMult = heavy ? 1.35 : 1;
      e.hitFrame = e.ai === 'ranged' ? 3 : e.def.hit;
      if (e.ai === 'knight' && Math.random() < 0.6) e.combo = 1;
    }
  }

  function castBolts(run, e) {
    const pl = run.player;
    const n = 3;
    for (let i = 0; i < n; i++) {
      const pt = i === 0 ? { x: pl.x, y: pl.y } : { x: pl.x + rnd(-40, 40), y: pl.y + rnd(-40, 40) };
      run.hazards.push({ x: pt.x, y: pt.y, t: 0, delay: 0.9 + i * 0.25, radius: 18, mult: 1.4, src: e, fx: 'bossBolt', warn: fx(run, 'alert', pt.x, pt.y - 6, { loop: true, dur: 0.9 + i * 0.25, scale: 0.7 }) });
    }
  }

  function updateHazards(run, dt) {
    for (let i = run.hazards.length - 1; i >= 0; i--) {
      const h = run.hazards[i];
      h.t += dt;
      if (h.t >= h.delay) {
        fx(run, h.fx, h.x, h.y - (h.fy == null ? 50 : h.fy), { scale: h.fs || 0.9, fps: 18 });
        G.sfx(h.snd || 'strike', { vol: 0.55, minGap: 70 });
        if (dist(h, run.player) < h.radius + run.player.r) damagePlayer(run, h.mult, h.src, { shake: 4, fx: 'hitArrow' });
        run.hazards.splice(i, 1);
      }
    }
  }

  function updateProjectiles(run, dt) {
    const pl = run.player;
    for (let i = run.projectiles.length - 1; i >= 0; i--) {
      const pr = run.projectiles[i];
      pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt;
      if (!pl.dead && Math.hypot(pr.x - pl.x, pr.y - (pl.y - 8)) < 9) {
        damagePlayer(run, pr.mult, pr.src, { fx: 'hitArrow' });
        run.projectiles.splice(i, 1);
        continue;
      }
      const m = run.map;
      if (pr.life <= 0 || pr.x < 0 || pr.y < 40 || pr.x > m.W || pr.y > m.H) run.projectiles.splice(i, 1);
    }
  }

  // ================================================================ waves
  function endlessWave(n, plevel) {
    const L = Math.max(plevel, 10) + Math.floor(n / 2);
    const list = [];
    if (n % 5 === 0) {
      list.push({ id: ['knight', 'warlord', 'necro'][(n / 5) % 3], level: L + 1 });
      for (let i = 0; i < 2 + Math.floor(n / 10); i++) list.push({ id: 'archer', level: L - 1 });
    } else {
      const count = 4 + Math.floor(n * 0.7);
      for (let i = 0; i < count; i++) {
        const r = Math.random();
        list.push({ id: r < 0.3 ? 'orc' : r < 0.55 ? 'archer' : r < 0.7 ? 'kobold' : r < 0.85 ? 'demon' : 'brute', level: L });
      }
    }
    return list;
  }

  function nextWave(run) {
    const area = run.area;
    if (run.obj && run.obj.type === 'survive') return; // the survive clock spawns and ends the area itself
    run.waveIdx++;
    if (area.endless) {
      const n = run.waveIdx + 1;
      run.endWave = n - 1;
      if (n - 1 > G.profile.bestWave) { G.profile.bestWave = n - 1; G.questEvent('wave', null, n - 1); }
      endlessWave(n, G.profile.level).forEach((s, i) => run.spawnQueue.push({ id: s.id, level: s.level, delay: i === 0 ? 0.2 : 0.35 }));
      G.ui.banner('Wave ' + n, n % 5 === 0 ? 'A champion approaches!' : 'Enemies incoming');
      return;
    }
    const room = run.room, waves = room ? room.waves || [] : area.waves;
    const bossId = room ? (room.type === 'boss' ? room.boss || area.boss : null) : area.boss;
    if (run.waveIdx < waves.length) {
      waves[run.waveIdx].forEach(([id, n, mod]) => { for (let i = 0; i < n; i++) run.spawnQueue.push({ id, level: area.level + Math.floor(run.waveIdx / 2) + (room ? Math.floor(room.idx / 2) : 0), delay: mod ? 0.8 : 0.35, elite: mod || undefined }); });
      if (room && room.type === 'elite' && run.waveIdx === 0) run.spawnQueue.push({ id: room.elite, level: area.level + 1, delay: 0.6, elite: room.mod || 'fast', at: { x: run.map.W / 2, y: 130 } });
      G.ui.banner(room && room.type === 'elite' && run.waveIdx === 0 ? 'Elite' : 'Wave ' + (run.waveIdx + 1) + ' / ' + waves.length, room && room.type === 'elite' && run.waveIdx === 0 ? 'Defeat it to take the boss key' : '');
    } else if (bossId && !run.bossSpawned) {
      run.bossSpawned = true; run.phase = 'boss';
      run.spawnQueue.push({ id: bossId, level: area.level + 1, delay: 1.0, at: { x: run.map.W / 2, y: area.theme === 'shrine' ? 190 : 150 } });
      G.ui.banner('BOSS', G.ENEMIES[bossId].name);
    } else {
      areaCleared(run);
    }
  }

  // ================================================================ Rift rooms
  function roomTitle(run) {
    const r = run.room, n = run.area.rooms.length;
    return 'Room ' + (r.idx + 1) + ' / ' + n + ' · ' + { fight: 'Clear the room', elite: 'Elite', shrine: 'Shrine', boss: 'Boss' }[r.type];
  }
  // an elite: a stronger copy of a normal enemy with a modifier (its own def copy, so the base enemy is untouched)
  function makeElite(run, e, modId) {
    const m = G.ELITE_MODS[modId] || G.ELITE_MODS.fast;
    e.def = Object.assign({}, e.def, { name: m.label + ' ' + e.def.name, scale: e.def.scale * m.scale, speed: e.def.speed * m.speed, radius: Math.round(e.def.radius * m.scale) });
    e.r = e.def.radius; e.maxHp = e.hp = Math.round(e.hp * m.hp); e.atk *= m.atk; e.xp *= 3; e.gold = [e.gold[0] * 3, e.gold[1] * 3];
    e.elite = modId; e.phase2 = true; // no boss enrage for elites
    e.boss = true;
    if (!(run.boss && run.boss.bounty && !run.boss.dead)) { run.boss = e; G.ui.bossBar(e); } // show its health bar like a boss
  }
  function roomCleared(run) {
    if (run.phase === 'roomclear') return;
    run.phase = 'roomclear';
    const d = run.map.door;
    if (d) d.open = true;
    if (run.room.type === 'elite') { G.ui.toast('Boss key obtained', 'quest'); text(run, run.player.x, run.player.y - 46, 'BOSS KEY', '#ffd54a', true); }
    G.ui.banner('Room cleared', 'The rift door is open');
    G.sfx('shPortal', { minGap: 0, vol: 0.5 });
  }
  function useAltar(run) {
    const a = run.map.altar;
    if (!a || a.used) return;
    a.used = true;
    const pool = G.SHRINE_BUFFS.slice(), opts = [];
    while (opts.length < 3 && pool.length) opts.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    game.paused = true;
    G.ui.shrineChoice(opts, (b) => {
      game.paused = false;
      const pl = run.player;
      if (b.buff) Object.assign(pl.buffs, b.buff);
      if (b.heal) { pl.hp = Math.min(pl.stats.maxHp, pl.hp + pl.stats.maxHp * b.heal); pl.mp = Math.min(pl.stats.maxMp, pl.mp + pl.stats.maxMp * b.heal); }
      if (b.potions) { G.addConsumable(G.profile, 'hpPotion', b.potions); G.addConsumable(G.profile, 'mpPotion', b.potions); }
      fx(run, 'lightBurst', a.x, a.y - 10, { scale: 0.8 });
      text(run, pl.x, pl.y - 46, b.name, '#9fd8ff', true);
      roomCleared(run);
    });
  }
  // walk through the open door: fade out, build the next room, fade in
  function enterNextRoom(run) {
    if (run.transition) return;
    run.transition = true;
    const area = run.area, idx = run.room.idx + 1;
    G.ui.fade(true, () => {
      if (game.run !== run) return;
      const room = Object.assign({ idx }, area.rooms[idx]);
      const map = G.buildArea(area, room);
      // anything left on the floor is picked up on the way out
      run.drops.forEach((d) => { d.t = 1; d.x = run.player.x; d.y = run.player.y; }); collectDrops(run);
      run.room = room; run.map = map;
      run.enemies = []; run.projectiles = []; run.hazards = []; run.zones = []; run.drops = []; run.spawnQueue = []; run.texts = [];
      run.effects = run.effects.filter((e) => e.follow === run.player);
      run.waveIdx = -1; run.waveDelay = 1.2; run.bossSpawned = false; run.boss = null; G.ui.bossBar(null);
      run.phase = room.type === 'shrine' ? 'shrine' : 'waves'; run.clearT = 0; run.chestOpened = false;
      const pl = run.player; pl.x = map.start.x; pl.y = map.start.y; pl.dash = null; pl.dir = 'up';
      run.cam.y = map.H;
      map.props.forEach((pr) => pr.torch && fx(run, pr.torch, pr.x, pr.y - 30, { loop: true, fps: 10 }));
      run.transition = false;
      G.ui.banner(area.name, roomTitle(run));
      G.ui.fade(false);
    });
  }

  function areaCleared(run) {
    if (run.room && run.room.type !== 'boss') { roomCleared(run); return; }
    if (run.phase === 'cleared' || run.phase === 'victory') return;
    run.phase = 'cleared'; run.clearT = 0; run.doneT = run.time;
    const pl = run.player;
    fx(run, 'complete', pl.x, pl.y - 48, { follow: pl, offY: -48, important: true });
    if (run.map.chest) {
      run.map.chest.active = true;
      run.map.chest.fxRef = fx(run, 'sparkle', run.map.chest.x, run.map.chest.y - 12, { loop: true, scale: 1.2 });
      G.ui.toast('Area cleared! Open the chest to claim your reward.', 'quest');
    }
  }

  function openChest(run) {
    const ch = run.map.chest;
    if (!ch || ch.open) return;
    ch.open = true; ch.key = 'chestOpen';
    if (ch.fxRef) ch.fxRef.dur = 0.0001;
    fx(run, 'coins', ch.x, ch.y - 20, { scale: 1.3 });
    fx(run, 'lightBurst', ch.x, ch.y - 16, { scale: 0.6 });
    const gold = 20 * run.area.level + rint(5, 25);
    G.profile.gold += gold; run.rewards.gold += gold;
    text(run, ch.x, ch.y - 34, '+' + gold + 'g', '#ffd54a', true);
    const item = G.makeItem(null, G.rollRarity(1.2), run.area.level + 1);
    if (G.addGear(G.profile, item)) { run.rewards.items.push(item); G.ui.toast('Chest: ' + item.name, 'loot', G.rarityOf(item).color); }
    else dropItem(run, ch.x, ch.y + 18, item);
    run.chestOpened = true;
    run.victoryT = 0;
  }

  game.finishRun = function (result) {
    const run = game.run;
    if (!run || run.finished) return;
    run.finished = true;
    const p = G.profile, area = run.area;
    if (result === 'victory') {
      const st = p.areas[area.id] || (p.areas[area.id] = { unlocked: true, cleared: 0 });
      st.cleared++;
      const idx = G.AREAS.indexOf(area);
      const next = G.AREAS[idx + 1];
      let unlocked = null;
      if (next && !(p.areas[next.id] && p.areas[next.id].unlocked)) { p.areas[next.id] = { unlocked: true, cleared: 0 }; unlocked = next.name; }
      G.questEvent('clear', area.id, 1);
      run.rewards.unlocked = unlocked;
      const ev = G.objectives && G.objectives.evaluate(run);
      if (ev) {
        const before = st.starMask || 0;
        st.starMask = before | ev.mask;
        if (st.best == null || ev.time < st.best) st.best = Math.round(ev.time);
        run.rewards.stars = { got: ev.got, before, after: st.starMask, time: ev.time };
        if (before !== 7 && st.starMask === 7) { // first time at 3 stars: the star chest
          const rar = Math.random() < 0.3 ? 'epic' : 'rare';
          const item = G.makeItem(null, rar, area.level + 2), gold = 30 * area.level + 60;
          p.gold += gold; run.rewards.gold += gold;
          if (G.addGear(p, item)) run.rewards.items.push(item);
          run.rewards.starChest = { item, gold };
        }
      }
    }
    if (area.endless) run.rewards.wave = run.endWave;
    G.refreshQuests();
    G.save();
    G.ui.showResult(result, run);
  };

  game.leaveRun = function () {
    const run = game.run;
    if (!run) return;
    if (!run.finished) game.finishRun(run.area.endless ? 'endless' : 'left');
  };

  game.exitToHub = function () {
    G.sfxStopAll && G.sfxStopAll();
    game.run = null;
    game.paused = false;
    G.ui.bossBar(null);
  };

  // ================================================================ main update
  game.update = function (dt) {
    game.time += dt;
    const run = game.run;
    if (!run) { updateShowcase(dt); return; }
    if (game.paused) return;
    if (run.hitStop > 0) { run.hitStop -= dt; updateCamera(run, dt); return; } // impact freeze-frame
    run.time += dt;
    const pl = run.player, p = G.profile;

    // buffs
    if (pl.buffTimers) for (const k of Object.keys(pl.buffTimers)) {
      pl.buffTimers[k] -= dt;
      if (pl.buffTimers[k] <= 0) { delete pl.buffTimers[k]; Object.keys(G.SKILLS[k].buff).forEach((b) => delete pl.buffs[b]); }
    }
    const prevMax = pl.stats.maxHp;
    pl.stats = G.calcStats(p, pl.buffs);
    if (pl.stats.maxHp !== prevMax && !pl.dead) pl.hp = Math.min(pl.hp, pl.stats.maxHp);
    for (const k of Object.keys(pl.cds)) if (pl.cds[k] > 0) pl.cds[k] = Math.max(0, pl.cds[k] - dt);
    if (pl.potionCd > 0) pl.potionCd -= dt;
    if (pl.invuln > 0) pl.invuln -= dt;
    if (pl.flash > 0) pl.flash -= dt;
    if (!pl.dead) pl.mp = Math.min(pl.stats.maxMp, pl.mp + pl.stats.mpRegen * dt);

    // ---- player control
    const inp = G.input;
    pl.animT += dt;
    if (!pl.dead && run.phase !== 'victory') {
      if (pl.state === 'attack') {
        const fps = pl.atkFps || 16 * pl.stats.atkSpeed;
        if (!pl.hitDone && pl.animT * fps >= 3) { pl.hitDone = true; resolvePlayerHit(run); }
        if (pl.animT >= pl.atkDur) { pl.state = 'idle'; pl.animT = 0; pl.atkFps = 0; pl.skillSwing = false; }
      }
      // skill slashes (Thunder Slash, Charged Blade) let the hero keep running while the sword swings
      if (pl.state === 'attack' && pl.skillSwing && !pl.dash) {
        const mv = Math.hypot(inp.mx, inp.my);
        if (mv > 0.15) {
          const sp = pl.stats.moveSpeed * Math.min(1, mv) * (pl.slowMul == null ? 1 : pl.slowMul);
          pl.x += (inp.mx / Math.max(mv, 1)) * sp * dt;
          pl.y += (inp.my / Math.max(mv, 1)) * sp * dt;
          G.collide(run.map, pl, pl.r);
        }
      }
      if (pl.dash) pl.state = 'idle';
      if (pl.castLock > 0 && pl.state === 'run') { pl.state = 'idle'; pl.animT = 0; }
      if (pl.state !== 'attack' && !(pl.castLock > 0) && !pl.dash) {
        const mv = Math.hypot(inp.mx, inp.my);
        if (mv > 0.15) {
          const sp = pl.stats.moveSpeed * Math.min(1, mv) * (pl.spin ? 0.6 : 1) * (pl.slowMul == null ? 1 : pl.slowMul);
          pl.x += (inp.mx / Math.max(mv, 1)) * sp * dt;
          pl.y += (inp.my / Math.max(mv, 1)) * sp * dt;
          G.collide(run.map, pl, pl.r);
          if (!pl.spin) pl.dir = Math.abs(inp.mx) > Math.abs(inp.my) ? (inp.mx > 0 ? 'right' : 'left') : inp.my > 0 ? 'down' : 'up';
          if (pl.state !== 'run') { pl.state = 'run'; }
        } else if (pl.state === 'run') { pl.state = 'idle'; pl.animT = 0; }
        let wantAttack = inp.attack;
        if (!wantAttack) {
          // auto-attack the nearest enemy in melee reach, unless the player is steering away from it (retreating)
          const near = nearestEnemy(run, pl, 36);
          if (near) {
            const dx = near.x - pl.x, dy = near.y - pl.y, d = Math.hypot(dx, dy) || 1;
            const away = mv > 0.15 && (inp.mx * dx + inp.my * dy) / (d * Math.min(1, mv)) < -0.3;
            if (!away) wantAttack = true;
          } else if (mv < 0.15 && run.map.props.some((pr) => pr.breakable && !pr.dead && dist(pr, pl) < 24)) wantAttack = true;
        }
        if (wantAttack && game.canAct() && !pl.spin) startAttack(run);
      }
    }

    // ---- spawns & waves
    if (run.phase === 'waves' || run.phase === 'boss') {
      const cap = run.area.maxAlive || 99, alive = run.spawnQueue.length ? run.enemies.reduce((n, e) => n + (e.dead ? 0 : 1), 0) : 0;
      if (run.spawnQueue.length && alive >= cap && run.phase === 'waves') {
        // screen is full: hold the rest of the wave until some fall
      } else if (run.spawnQueue.length) {
        run.spawnQueue[0].delay -= dt;
        if (run.spawnQueue[0].delay <= 0) { const s = run.spawnQueue.shift(); const e = spawnEnemy(run, s.id, s.level, s.at); if (e && s.elite) makeElite(run, e, s.elite); }
      } else if (!run.enemies.some((e) => !e.dead)) {
        run.waveDelay -= dt;
        if (run.waveDelay <= 0) { run.waveDelay = 1.6; nextWave(run); }
      }
    }

    // ---- enemies
    for (const e of run.enemies) updateEnemy(run, e, dt);
    // separation
    const al = run.enemies.filter((e) => !e.dead);
    for (let i = 0; i < al.length; i++) for (let j = i + 1; j < al.length; j++) {
      const a = al[i], b = al[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
      if (d < m && d > 0.01) { const push = (m - d) / 2; a.x -= (dx / d) * push; a.y -= (dy / d) * push; b.x += (dx / d) * push; b.y += (dy / d) * push; }
    }
    if (!pl.dead) for (const e of al) {
      const dx = pl.x - e.x, dy = pl.y - e.y, d = Math.hypot(dx, dy), m = e.r + pl.r - 2;
      if (d < m && d > 0.01) { pl.x = e.x + (dx / d) * m; pl.y = e.y + (dy / d) * m; G.collide(run.map, pl, pl.r); }
    }
    run.enemies = run.enemies.filter((e) => !(e.removed && e.stateT > 1.5));

    updateProjectiles(run, dt);
    updateHazards(run, dt);
    if (G.objectives) G.objectives.update(run, dt, game._objApi);
    updateSkillZones(run, dt);
    for (const d of run.drops) d.t += dt;
    collectDrops(run);
    updateEffects(run, dt);
    for (let i = run.texts.length - 1; i >= 0; i--) { const t = run.texts[i]; t.t += dt; t.y -= dt * 22; if (t.t > 0.9) run.texts.splice(i, 1); }
    if (run.shake > 0) run.shake = Math.max(0, run.shake - dt * 18);

    // ---- Rift rooms: the shrine altar and the door
    if (run.phase === 'shrine' && run.map.altar && !pl.dead && dist(run.map.altar, pl) < 30) useAltar(run);
    if (run.phase === 'roomclear' && run.map.door && run.map.door.open && !pl.dead && Math.abs(pl.x - run.map.door.x) < 18 && pl.y < run.map.door.y + 16) enterNextRoom(run);

    // ---- end states
    if (run.phase === 'cleared') {
      run.clearT += dt;
      const ch = run.map.chest;
      if (ch && !ch.open && (dist(ch, pl) < 24 || run.clearT > 8)) openChest(run);
      if (!ch && run.clearT > 1.5) { run.phase = 'victory'; game.finishRun('victory'); }
      if (run.chestOpened) { run.victoryT += dt; if (run.victoryT > 1.4) { run.phase = 'victory'; fx(run, 'youWon', pl.x, pl.y - 46, { important: true }); game.finishRun('victory'); } }
    }
    if (run.phase === 'defeat') {
      run.endT += dt;
      if (run.endT > 1.8) game.finishRun(run.area.endless ? 'endless' : 'defeat');
    }

    // camera
    updateCamera(run, dt);
  };

  function updateCamera(run, dt) {
    const vw = C.VIEW_WIDTH, vh = vw * (G.view.h / G.view.w);
    const pl = run.player;
    const tx = clamp(pl.x - vw / 2, 0, Math.max(0, run.map.W - vw));
    const ty = clamp(pl.y - vh * 0.55, 0, Math.max(0, run.map.H + 50 - vh));
    const k = 1 - Math.pow(0.0005, dt);
    run.cam.x += (tx - run.cam.x) * k;
    run.cam.y += (ty - run.cam.y) * k;
    if (run.map.W < vw) run.cam.x = (run.map.W - vw) / 2;
  }

  function updateShowcase(dt) {
    const run = game.ensureShowcase();
    run.time += dt;
    run.player.animT += dt;
    updateEffects(run, dt);
    const vw = C.VIEW_WIDTH, vh = vw * (G.view.h / G.view.w);
    run.cam.x = clamp(run.player.x - vw / 2 + Math.sin(run.time * 0.15) * 20, 0, Math.max(0, run.map.W - vw));
    run.cam.y = clamp(run.player.y - vh * 0.5 + Math.cos(run.time * 0.11) * 30, 0, Math.max(0, run.map.H - vh));
  }

  // ================================================================ render
  function playerSheet(pl) {
    const st = pl.state === 'attack' ? (pl.combo ? 'atk2' : 'atk1') : pl.state === 'run' ? 'run' : 'idle';
    return 'adv_' + st + '_' + pl.dir;
  }

  // the rift door: a swirling portal, dim and barred while sealed, bright violet once open
  function drawRiftDoor(ctx, d, t) {
    const x = d.x, y = d.y - 18, o = d.open;
    ctx.save();
    const g = ctx.createRadialGradient(x, y, 2, x, y, 22);
    g.addColorStop(0, o ? 'rgba(235,210,255,0.95)' : 'rgba(90,60,80,0.75)');
    g.addColorStop(0.55, o ? 'rgba(150,80,255,0.75)' : 'rgba(50,30,45,0.7)');
    g.addColorStop(1, 'rgba(40,10,80,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, 16, 22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = o ? 'rgba(210,170,255,0.9)' : 'rgba(140,110,120,0.6)'; ctx.lineWidth = 1;
    for (let k = 0; k < 3; k++) { const a = t * (o ? 3 : 0.8) + k * 2.1; ctx.beginPath(); ctx.ellipse(x, y, 12 - k * 3, 17 - k * 4, 0, a, a + 2.2); ctx.stroke(); }
    if (!o) { // bars across a sealed door
      ctx.strokeStyle = 'rgba(30,24,30,0.9)'; ctx.lineWidth = 2;
      for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(x + k * 7, y - 20); ctx.lineTo(x + k * 7, y + 20); ctx.stroke(); }
    }
    ctx.restore();
  }
  function drawAltarGlow(ctx, a, t) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const r = 26 + 3 * Math.sin(t * 3), g = ctx.createRadialGradient(a.x, a.y, 2, a.x, a.y, r);
    g.addColorStop(0, 'rgba(140,200,255,0.45)'); g.addColorStop(1, 'rgba(60,120,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  game.render = function (ctx) {
    const run = game.run || game.ensureShowcase();
    const V = G.view;
    const zoom = V.w / C.VIEW_WIDTH;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1d1b22';
    ctx.fillRect(0, 0, V.w, V.h);
    let cx = run.cam.x, cy = run.cam.y;
    if (run.shake > 0) { cx += rnd(-1, 1) * run.shake * 0.5; cy += rnd(-1, 1) * run.shake * 0.5; }
    // snap to device pixels to avoid tile seams
    const ox = Math.round(-cx * zoom), oy = Math.round(-cy * zoom);
    ctx.setTransform(zoom, 0, 0, zoom, ox, oy);
    ctx.imageSmoothingEnabled = false;
    const map = run.map;
    ctx.drawImage(map.ground, 0, 0);
    for (const d of map.deco) if (d.floor || d.top || d.key === 'wallFront') G.drawDeco(ctx, d);
    if (map.door) drawRiftDoor(ctx, map.door, run.time || 0);
    if (map.altar && !map.altar.used) drawAltarGlow(ctx, map.altar, run.time || 0);

    if (run.obj) G.objectives.drawGround(ctx, run); // traps, poison pools, water

    // ground effects
    for (const e of run.effects) if (e.ground) drawEffect(ctx, e);

    // y-sorted drawables
    const list = [];
    for (const pr of map.props) if (!pr.dead) list.push({ y: pr.y, t: 0, o: pr });
    for (const e of run.enemies) if (!e.removed) list.push({ y: e.y, t: 1, o: e });
    for (const d of run.drops) list.push({ y: d.y, t: 3, o: d });
    if (run.player) list.push({ y: run.player.y, t: 2, o: run.player });
    for (const id in game.classSkills) { const c = game.classSkills[id]; if (c.drawables) c.drawables(run, list); } // {y, t: 5, draw(ctx)}
    if (run.obj) G.objectives.drawables(run, list);
    list.sort((a, b) => a.y - b.y);
    const pl = run.player;
    for (const it of list) {
      if (it.t === 0) {
        const pr = it.o;
        let alpha = null;
        if (pl && /^tree|statue|pillar/.test(pr.key)) {
          const d = G.PROPS[pr.key];
          if (pl.y < pr.y && pl.y > pr.y - d[6] && Math.abs(pl.x - pr.x) < d[3] * 0.45) alpha = 0.55;
        }
        G.drawProp(ctx, pr.key, pr.x, pr.y, alpha);
      } else if (it.t === 1) drawEnemy(ctx, it.o, run);
      else if (it.t === 2) drawPlayer(ctx, it.o, run);
      else if (it.t === 5) it.draw(ctx);
    }

    // projectiles (arrow pixels cut from the Soldier attack sheet)
    const aim = G.img('sheet:' + G.ARROW.sheet);
    if (aim) for (const p of run.projectiles) {
      ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.rotate(p.a);
      ctx.drawImage(aim, G.ARROW.sx, G.ARROW.sy, G.ARROW.sw, G.ARROW.sh, -G.ARROW.sw + 3, -G.ARROW.sh / 2, G.ARROW.sw, G.ARROW.sh);
      ctx.restore();
    }
    for (const e of run.effects) if (!e.ground) drawEffect(ctx, e);

    // floating texts
    ctx.textAlign = 'center';
    for (const t of run.texts) {
      const a = 1 - Math.max(0, (t.t - 0.55) / 0.35);
      ctx.globalAlpha = a;
      ctx.font = (t.big ? 'bold 10px ' : 'bold 7px ') + 'Trebuchet MS, sans-serif';
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(t.str, t.x, t.y); ctx.fillStyle = t.color; ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  };

  function heroTint() { const p = G.profile && G.PATHS[G.profile.path]; return p ? p.heroTint : null; }
  function drawPlayer(ctx, pl, run) {
    if (pl.dead && run.endT > 0.6) return;
    const cp = G.profile && G.PATHS[G.profile.path], cls = cp && game.classSkills[G.profile.path];
    if (cp && cp.heroSprite && cls && cls.drawHero && cls.drawHero(ctx, pl, run)) return; // class with its own hero sprite
    if (pl.spin || pl.dash) { // sword techniques reuse the hero's own attack frames
      const k = 'adv_' + (pl.spin ? 'atk1_' : 'atk2_') + pl.dir;
      const n = (G.SHEETS[k] && G.SHEETS[k].n) || 8;
      const f = pl.spin ? 2 + (Math.floor(run.time * 30) % 3) : Math.min(n - 1, 1 + Math.floor((pl.dash.t / pl.dash.dur) * 4));
      drawSheet(ctx, G.tintedSheet(k, heroTint()), f, pl.x, pl.y - (pl.liftY || 0), 46, 57, 1, false, (pl.dash ? (pl.flashing ? 0.35 : 0.85) : 1) * (pl.stealth ? 0.4 : 1));
      return;
    }
    const key = playerSheet(pl);
    const s = G.SHEETS[key];
    if (!s) return;
    let frame;
    if (pl.state === 'attack') frame = Math.min(s.n - 1, Math.floor(pl.animT * (pl.atkFps || 16 * pl.stats.atkSpeed)));
    else frame = Math.floor(pl.animT * (pl.state === 'run' ? 12 : 8)) % (s.n || 1);
    let alpha = 1;
    if (pl.dead) alpha = Math.max(0, 1 - run.endT * 1.6);
    else if (pl.flash > 0 && Math.floor(pl.flash * 30) % 2 === 0) alpha = 0.45;
    if (pl.stealth || pl.shSink) alpha *= 0.4; // Stealth / Shadow Fang: the hero fades into the shadows
    drawSheet(ctx, G.tintedSheet(key, heroTint()), frame, pl.x, pl.y - (pl.liftY || 0), 46, 57, 1, false, alpha);
  }

  // 4-direction sprites: rows are down, up, left, right. Face the hero (or away while feared); the dead keep their last row.
  function dirRow(e, run) {
    if (e.state === 'dead' || e.state === 'spawn' && e.row != null) return e.row || 0;
    const pl = run.player;
    const tg = e.lookAt || pl;
    let dx = tg.x - e.x, dy = tg.y - e.y;
    if (e.status && e.status.fear) { dx = -dx; dy = -dy; }
    if (e.state === 'lunge' && e.lungeA != null) { dx = Math.cos(e.lungeA); dy = Math.sin(e.lungeA); }
    const cur = e.row == null ? 0 : e.row, horiz = cur >= 2;
    const useH = Math.abs(dx) > Math.abs(dy) * (horiz ? 0.7 : 1.3); // a little stickiness so they don't flicker
    e.row = useH ? (dx < 0 ? 2 : 3) : (dy < 0 ? 1 : 0);
    return e.row;
  }
  function drawEnemy(ctx, e, run) {
    const ai = animInfo(e);
    let frame = ai.frame;
    const loop = e.anim === 'idle' || e.anim === 'walk' || e.anim === 'run';
    if (loop) frame %= ai.n; else frame = Math.min(ai.n - 1, frame);
    let alpha = 1;
    if (e.state === 'spawn') alpha = Math.max(0, (e.stateT - 0.2) / 0.25);
    if (e.state === 'dead') alpha = Math.max(0, 1 - Math.max(0, e.stateT - 0.8) / 0.4);
    const ly = e.y - (e.liftY || 0);
    const row = e.def.dir4 ? dirRow(e, run) : 0, flip = e.def.dir4 ? false : e.face < 0;
    drawSheet(ctx, ai.key, frame, e.x, ly, e.def.ax, e.def.ay, e.def.scale, flip, alpha, row);
    if (e.flash > 0 && e.state !== 'dead') { // hit flash: the enemy's own sprite drawn again additively (brightens it)
      ctx.globalCompositeOperation = 'lighter';
      drawSheet(ctx, ai.key, frame, e.x, ly, e.def.ax, e.def.ay, e.def.scale, flip, Math.min(1, e.flash / 0.12) * 0.85 * alpha, row);
      ctx.globalCompositeOperation = 'source-over';
    }
    // health bar (interface element) for regular enemies
    if (!e.boss && !e.dead && e.state !== 'spawn' && e.hp < e.maxHp) {
      const w = 16 + e.r, h = 2, x = e.x - w / 2, y = e.y - (e.def.hgt ? e.def.hgt * e.def.scale + 3 : 20 * e.def.scale);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 0.5, y - 0.5, w + 1, h + 1);
      ctx.fillStyle = '#e04848'; ctx.fillRect(x, y, w * (e.hp / e.maxHp), h);
    }
  }
})();
