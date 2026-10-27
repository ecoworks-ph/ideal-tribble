/* =========================================================================
   FALLEN OATH — Persistent profile: character, inventory, quests, save/load
   ========================================================================= */
(function () {
  'use strict';
  const G = (window.G = window.G || {});
  const C = G.CONFIG;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const rint = (a, b) => Math.floor(rnd(a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (v, d, a, b) => (typeof v === 'number' && isFinite(v) ? clamp(v, a, b) : d);
  G.util = { rnd, rint, clamp };

  let uid = Date.now() % 100000;
  const newId = () => 'i' + (uid++).toString(36) + Math.floor(Math.random() * 1e4).toString(36);

  G.defaultSettings = () => ({ damageNumbers: true, screenShake: true, autoAttack: true, leftHanded: false, reducedEffects: false, sound: true, sfxVolume: 0.8, voice: 'warrior' });

  // cls: the class (skill-tree path) chosen on the class screen; one class per save
  G.newProfile = function (cls) {
    const path = G.PATHS[cls] ? cls : 'storm';
    const first = G.PATHS[path].actives[0];
    return {
      v: C.VERSION,
      created: Date.now(),
      level: 1, xp: 0, gold: 30,
      attrPoints: 0, skillPoints: 0,
      attrs: { str: 0, vit: 0, int: 0, agi: 0 },
      path, // class: 'storm' (Storm Blade) or 'shadow' (Shadow Monarch)
      skills: { [first]: 1 },
      slots: [first, null, null, null], // 4 bar slots; the ultimate has its own button
      inventory: [
        { id: newId(), kind: 'consumable', key: 'hpPotion', qty: 3 },
        { id: newId(), kind: 'consumable', key: 'mpPotion', qty: 2 },
      ],
      equipped: { weapon: null, armor: null, accessory: null },
      quests: {}, // id -> {progress, done, claimed}
      areas: { courtyard: { unlocked: true, cleared: 0 } },
      bestWave: 0,
      regionClaims: {}, // region id -> star milestones claimed
      shop: { stock: [], seed: 0 },
      stats: { kills: 0, deaths: 0, broken: 0, bossKills: 0 },
      settings: G.defaultSettings(),
    };
  };

  // ------------------------------------------------------------ items
  function rollRarity(bonus) {
    const pool = G.RARITY.slice(0, 4); // legendary only from explicit rewards / bosses
    let total = pool.reduce((s, r, i) => s + r.weight * (i > 0 ? 1 + bonus : 1), 0);
    let x = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      x -= pool[i].weight * (i > 0 ? 1 + bonus : 1);
      if (x <= 0) return pool[i].id;
    }
    return 'common';
  }

  G.makeItem = function (slot, rarityId, ilvl) {
    slot = slot || ['weapon', 'armor', 'accessory'][rint(0, 2)];
    rarityId = rarityId || rollRarity(0);
    const rar = G.RARITY.find((r) => r.id === rarityId) || G.RARITY[0];
    const rIdx = G.RARITY.indexOf(rar);
    ilvl = Math.max(1, Math.round(ilvl || 1));
    const base = G.ITEM_BASES[slot][rint(0, G.ITEM_BASES[slot].length - 1)];
    const lvlMult = 1 + (ilvl - 1) * 0.22;
    const stats = {};
    Object.keys(base).forEach((k) => {
      if (k === 'name') return;
      const v = base[k] * rar.mult * (G.PCT_STATS[k] ? 1 + (ilvl - 1) * 0.04 : lvlMult);
      stats[k] = G.PCT_STATS[k] ? +v.toFixed(3) : Math.max(1, Math.round(v));
    });
    const pool = G.AFFIXES.slice();
    for (let i = 0; i < rar.affixes && pool.length; i++) {
      const a = pool.splice(rint(0, pool.length - 1), 1)[0];
      let v = a.base * rnd(0.8, 1.25) * (1 + rIdx * 0.2) * (a.pct ? 1 + (ilvl - 1) * 0.03 : lvlMult);
      v = a.pct ? +v.toFixed(3) : a.stat === 'mpRegen' ? +v.toFixed(2) : Math.max(1, Math.round(v));
      stats[a.stat] = (stats[a.stat] || 0) + v;
      if (a.pct) stats[a.stat] = +stats[a.stat].toFixed(3);
    }
    const prefix = G.ITEM_PREFIX[clamp(Math.floor(ilvl / 3) + rIdx + rint(-1, 1), 0, G.ITEM_PREFIX.length - 1)];
    const value = Math.round((8 + ilvl * 4) * rar.mult * rar.mult);
    return { id: newId(), kind: 'gear', slot, rarity: rar.id, name: prefix + ' ' + base.name, base: base.name, ilvl, stats, value };
  };
  G.rollRarity = rollRarity;

  G.rarityOf = (it) => G.RARITY.find((r) => r.id === it.rarity) || G.RARITY[0];

  G.itemStatLines = function (stats) {
    return Object.keys(stats || {}).map((k) => {
      const v = stats[k];
      const s = G.PCT_STATS[k] ? '+' + (v * 100).toFixed(1) + '%' : '+' + (k === 'mpRegen' ? v.toFixed(2) + '/s' : v);
      return { k, label: G.STAT_LABEL[k] || k, text: s };
    });
  };

  // ------------------------------------------------------------ derived stats
  G.calcStats = function (p, buffs) {
    const B = C.PLAYER_BASE, L = C.PLAYER_PER_LEVEL, A = C.ATTR, lv = p.level - 1;
    const s = {
      maxHp: B.maxHp + L.maxHp * lv, maxMp: B.maxMp + L.maxMp * lv, atk: B.atk + L.atk * lv, def: B.def + L.def * lv,
      crit: B.crit, critDmg: B.critDmg, atkSpeed: B.atkSpeed, moveSpeed: B.moveSpeed, mpRegen: B.mpRegen, skillPower: 1,
    };
    const a = p.attrs;
    s.atk += a.str * A.str.atk;
    s.maxHp += a.vit * A.vit.maxHp; s.def += a.vit * A.vit.def;
    s.maxMp += a.int * A.int.maxMp; s.skillPower += a.int * A.int.skillPower; s.mpRegen += a.int * A.int.mpRegen;
    s.crit += a.agi * A.agi.crit; s.atkSpeed += a.agi * A.agi.atkSpeed; s.moveSpeed *= 1 + a.agi * A.agi.moveSpeedPct;
    ['weapon', 'armor', 'accessory'].forEach((slot) => {
      const it = p.equipped[slot];
      if (!it) return;
      Object.keys(it.stats).forEach((k) => { if (k in s) s[k] += it.stats[k]; });
    });
    // skill-tree passives of the chosen path
    if (buffs) {
      if (buffs.def) s.def *= 1 + buffs.def;
      if (buffs.atk) s.atk *= 1 + buffs.atk;
      if (buffs.atkSpeed) s.atkSpeed += buffs.atkSpeed;
      if (buffs.speed) s.moveSpeed *= 1 + buffs.speed;
      // Rift shrine blessings
      if (buffs.riftAtk) s.atk *= 1 + buffs.riftAtk;
      if (buffs.riftDef) s.def *= 1 + buffs.riftDef;
      if (buffs.riftSpd) { s.atkSpeed += buffs.riftSpd; s.moveSpeed *= 1 + buffs.riftSpd; }
    }
    // Shadow Monarch: Quicksilver (move speed; basic attacks only for damage / swing speed)
    s.basicMult = 1;
    const qr = G.passiveRank(p, 'quicksilver');
    if (qr) { const q = G.SKILLS.quicksilver; s.basicMult += qr * q.atk; s.atkSpeed += qr * q.aspd; s.moveSpeed *= 1 + qr * q.speed; }
    // Limitless Sorcerer passives
    s.dmgReduce = 0; s.potionMult = 1;
    const ir = G.passiveRank(p, 'infinity'); if (ir) s.dmgReduce = ir * G.SKILLS.infinity.reduce;
    const lr = G.passiveRank(p, 'rubber'); if (lr) s.dmgReduce = lr * G.SKILLS.rubber.reduce; // Rubber Body
    const g2 = G.passiveRank(p, 'gearsecond'); if (g2) { s.atkSpeed += g2 * G.SKILLS.gearsecond.aspd; s.moveSpeed *= 1 + g2 * G.SKILLS.gearsecond.speed; } // Gear Second
    const hk = G.passiveRank(p, 'haki'); if (hk) s.crit += hk * G.SKILLS.haki.crit; // Armament Haki
    const ar = G.passiveRank(p, 'antibody'); if (ar) s.dmgReduce = ar * G.SKILLS.antibody.reduce; // Anti-Magic Body
    const tr = G.passiveRank(p, 'training'); if (tr) { s.atk *= 1 + tr * G.SKILLS.training.atk; s.maxHp *= 1 + tr * G.SKILLS.training.hp; } // Endless Training
    const er = G.passiveRank(p, 'sixeyes'); if (er) s.crit += er * G.SKILLS.sixeyes.crit;
    const rr = G.passiveRank(p, 'rct'); if (rr) s.potionMult += rr * G.SKILLS.rct.potion;
    s.dmgReduce = clamp(s.dmgReduce || 0, 0, 0.5); // damage reduction never above 50%
    s.crit = clamp(s.crit, 0, 0.75);
    s.atkSpeed = clamp(s.atkSpeed, 0.5, 3);
    s.maxHp = Math.max(1, Math.round(s.maxHp));
    s.maxMp = Math.max(1, Math.round(s.maxMp));
    s.atk = Math.max(1, s.atk);
    s.def = Math.max(0, s.def);
    return s;
  };

  // ------------------------------------------------------------ inventory
  G.invCount = (p, key) => p.inventory.filter((i) => i.kind !== 'gear' && i.key === key).reduce((s, i) => s + i.qty, 0);
  G.invSlotsUsed = (p) => p.inventory.length;

  G.addConsumable = function (p, key, qty) {
    const ex = p.inventory.find((i) => i.kind !== 'gear' && i.key === key);
    if (ex) { ex.qty += qty; return true; }
    if (p.inventory.length >= C.INVENTORY_SIZE) return false;
    p.inventory.push({ id: newId(), kind: G.CONSUMABLES[key].material ? 'material' : 'consumable', key, qty });
    return true;
  };
  G.removeConsumable = function (p, key, qty) {
    const ex = p.inventory.find((i) => i.kind !== 'gear' && i.key === key);
    if (!ex || ex.qty < qty) return false;
    ex.qty -= qty;
    if (ex.qty <= 0) p.inventory.splice(p.inventory.indexOf(ex), 1);
    return true;
  };
  G.addGear = function (p, item) {
    if (p.inventory.length >= C.INVENTORY_SIZE) return false;
    p.inventory.push(item);
    return true;
  };

  G.equip = function (p, itemId) {
    const idx = p.inventory.findIndex((i) => i.id === itemId && i.kind === 'gear');
    if (idx < 0) return false;
    const it = p.inventory[idx];
    const prev = p.equipped[it.slot];
    p.inventory.splice(idx, 1);
    if (prev) p.inventory.splice(idx, 0, prev);
    p.equipped[it.slot] = it;
    return true;
  };
  G.unequip = function (p, slot) {
    const it = p.equipped[slot];
    if (!it) return false;
    if (p.inventory.length >= C.INVENTORY_SIZE) return false;
    p.equipped[slot] = null;
    p.inventory.push(it);
    return true;
  };

  // ------------------------------------------------------------ progression
  // returns number of levels gained
  G.gainXp = function (p, amount) {
    let gained = 0;
    if (p.level >= C.MAX_LEVEL) return 0;
    p.xp += Math.max(0, Math.round(amount));
    while (p.level < C.MAX_LEVEL && p.xp >= C.xpForLevel(p.level)) {
      p.xp -= C.xpForLevel(p.level);
      p.level++;
      p.attrPoints += C.ATTR_POINTS_PER_LEVEL;
      p.skillPoints += C.SKILL_POINTS_PER_LEVEL;
      gained++;
    }
    if (p.level >= C.MAX_LEVEL) p.xp = 0;
    if (gained) G.questEvent('level', null, p.level);
    return gained;
  };

  // ------------------------------------------------------------ quests
  G.questAvailable = (p, q) => !q.requires || (p.quests[q.requires] && p.quests[q.requires].done);
  G.questState = function (p, q) {
    if (!p.quests[q.id]) p.quests[q.id] = { progress: 0, done: false, claimed: false };
    return p.quests[q.id];
  };
  // event: kill(enemyId) collect(itemKey, qty) clear(areaId) boss(enemyId) break level(value) wave(value)
  G.questEvent = function (type, target, amount) {
    const p = G.profile;
    if (!p) return;
    G.QUESTS.forEach((q) => {
      if (q.type !== type || !G.questAvailable(p, q)) return;
      const st = G.questState(p, q);
      if (st.done) return;
      if (q.target && q.target !== target && !(type === 'level' || type === 'wave')) return;
      if (type === 'level' || type === 'wave') st.progress = Math.max(st.progress, amount || 0);
      else st.progress += amount || 1;
      if (type === 'collect') st.progress = G.invCount(p, q.target);
      if (st.progress >= q.count) {
        st.progress = q.count;
        st.done = true;
        G.ui && G.ui.toast('Quest complete: ' + q.name + ' — claim your reward in the Journal', 'quest');
        G.onQuestComplete && G.onQuestComplete(q);
      }
    });
  };
  // keep collect/level quests in sync with current state (e.g. after load or newly unlocked quests)
  G.refreshQuests = function () {
    const p = G.profile;
    G.QUESTS.forEach((q) => {
      if (!G.questAvailable(p, q)) return;
      const st = G.questState(p, q);
      if (st.done) return;
      if (q.type === 'collect') st.progress = Math.min(q.count, G.invCount(p, q.target));
      if (q.type === 'level') st.progress = Math.min(q.count, p.level);
      if (q.type === 'wave') st.progress = Math.min(q.count, p.bestWave);
      if (q.type === 'clear' && p.areas[q.target] && p.areas[q.target].cleared > 0) st.progress = 1;
      if (st.progress >= q.count) { st.progress = q.count; st.done = true; }
    });
  };
  G.claimQuest = function (qid) {
    const p = G.profile, q = G.QUESTS.find((x) => x.id === qid);
    if (!q) return null;
    const st = G.questState(p, q);
    if (!st.done || st.claimed) return null;
    const r = q.reward, got = [];
    if (r.item && p.inventory.length >= C.INVENTORY_SIZE) return { error: 'Inventory full — make room first.' };
    if (q.type === 'collect') {
      if (!G.removeConsumable(p, q.target, q.count)) return { error: 'You no longer have enough ' + G.CONSUMABLES[q.target].name + '.' };
    }
    st.claimed = true;
    if (r.gold) { p.gold += r.gold; got.push(r.gold + ' gold'); }
    if (r.hpPotion) { G.addConsumable(p, 'hpPotion', r.hpPotion); got.push(r.hpPotion + '× Health Potion'); }
    if (r.mpPotion) { G.addConsumable(p, 'mpPotion', r.mpPotion); got.push(r.mpPotion + '× Mana Potion'); }
    if (r.item) { const it = G.makeItem(r.item[0], r.item[1], Math.max(p.level, 2)); G.addGear(p, it); got.push(it.name); }
    let lv = 0;
    if (r.xp) { lv = G.gainXp(p, r.xp); got.push(r.xp + ' XP'); }
    G.refreshQuests();
    return { got, levels: lv };
  };

  // ------------------------------------------------------------ save / load
  // Two independent save slots: the normal adventure ('main') and the GM test account ('gm').
  G.slot = 'main';
  const keyFor = (slot) => C.SAVE_KEY + ((slot || G.slot) === 'gm' ? '_gm' : '');
  G.save = function () {
    if (!G.profile) return false;
    try {
      localStorage.setItem(keyFor(G.profile.gm ? 'gm' : 'main'), JSON.stringify(G.profile));
      return true;
    } catch (e) {
      console.warn('[save] failed', e);
      return false;
    }
  };
  G.hasSave = function (slot) {
    try { return !!localStorage.getItem(keyFor(slot || 'main')); } catch (e) { return false; }
  };
  G.deleteSave = function (slot) {
    try { localStorage.removeItem(keyFor(slot)); } catch (e) { /* ignore */ }
  };

  // GM account: everything maxed for testing — level cap, all skills at max rank, every area open, legendary gear.
  G.newGmProfile = function (cls) {
    const p = G.newProfile(cls);
    p.gm = true;
    p.level = C.MAX_LEVEL; p.xp = 0;
    p.gold = 999999;
    const pts = (C.MAX_LEVEL - 1) * C.ATTR_POINTS_PER_LEVEL; // 297 at level 100
    const str = Math.round(pts * 0.35), vit = Math.round(pts * 0.35), int = Math.round(pts * 0.12);
    p.attrs = { str, vit, int, agi: pts - str - vit - int };
    p.attrPoints = 0;
    G.choosePath(p, p.path);
    G.AREAS.forEach((a) => (p.areas[a.id] = { unlocked: true, cleared: 0 }));
    p.inventory = [];
    G.addConsumable(p, 'hpPotion', 99);
    G.addConsumable(p, 'mpPotion', 99);
    ['weapon', 'armor', 'accessory'].forEach((slot) => {
      p.equipped[slot] = G.makeItem(slot, 'legendary', C.MAX_LEVEL);
      G.addGear(p, G.makeItem(slot, 'legendary', C.MAX_LEVEL));
      G.addGear(p, G.makeItem(slot, 'epic', C.MAX_LEVEL));
    });
    return p;
  };

  // Pick (or switch) elemental path: refunds every skill point. GM accounts get the new path fully maxed.
  G.choosePath = function (p, path) {
    if (!G.PATHS[path]) return false;
    const refund = Object.values(p.skills).reduce((a, b) => a + b, 0);
    p.skills = {};
    p.path = path;
    if (p.gm) {
      G.SKILL_ORDER.forEach((k) => { if (G.SKILLS[k].path === path) p.skills[k] = G.SKILL_MAX_RANK; });
      p.skillPoints = 0;
      p.slots = [];
      G.fixSlots(p);
      return true;
    }
    p.skillPoints += refund;
    const first = G.PATHS[path].actives[0];
    if (p.skillPoints > 0) { p.skills[first] = 1; p.skillPoints--; }
    p.slots = [];
    G.fixSlots(p);
    return true;
  };
  // can this node be ranked up right now? returns '' if yes, otherwise the reason
  // Recommended: spend every attribute point toward the hero's ratio
  G.autoAttrs = function (p) {
    const w = G.REC_ATTRS[p.path] || { str: 1, vit: 1, int: 1, agi: 1 };
    const keys = Object.keys(G.CONFIG ? G.CONFIG.ATTR : w).filter((k) => w[k] > 0);
    const wsum = keys.reduce((a, k) => a + w[k], 0);
    let n = 0;
    while (p.attrPoints > 0) {
      const total = keys.reduce((a, k) => a + p.attrs[k], 0) + 1;
      let best = keys[0], gap = -Infinity;
      keys.forEach((k) => { const g = (w[k] / wsum) * total - p.attrs[k]; if (g > gap) { gap = g; best = k; } });
      p.attrs[best]++; p.attrPoints--; n++;
    }
    return n;
  };
  // Recommended: learn new skills first, then rank evenly (ultimate, then actives, then passives on ties)
  G.autoSkills = function (p) {
    const P = G.PATHS[p.path]; if (!P) return 0;
    const own = G.SKILL_ORDER.filter((k) => G.SKILLS[k].path === p.path);
    const pri = (k) => { const sk = G.SKILLS[k]; return sk.ult ? 0 : sk.kind === 'passive' ? 2 : 1; };
    let n = 0;
    while (p.skillPoints > 0) {
      const c = own.filter((k) => !G.skillBlock(p, k));
      if (!c.length) break;
      c.sort((a, b) => (p.skills[a] || 0) - (p.skills[b] || 0) || pri(a) - pri(b) || G.SKILLS[a].unlock - G.SKILLS[b].unlock);
      const k = c[0]; p.skills[k] = (p.skills[k] || 0) + 1; p.skillPoints--; n++;
    }
    if (n) G.fixSlots(p);
    return n;
  };

  G.skillBlock = function (p, k) {
    const sk = G.SKILLS[k];
    if (!sk || sk.path !== p.path) return 'Not part of your path';
    if ((p.skills[k] || 0) >= G.SKILL_MAX_RANK) return 'Max rank';
    if (sk.unlock > p.level) return 'Requires level ' + sk.unlock;
    const next = (p.skills[k] || 0) + 1;
    if (G.RANK_LEVEL[next] && p.level < G.RANK_LEVEL[next]) return 'Rank ' + next + ' requires level ' + G.RANK_LEVEL[next];
    if (sk.req && !(p.skills[sk.req] > 0)) return 'Learn ' + G.SKILLS[sk.req].name + ' first';
    if (p.skillPoints <= 0) return 'No skill points';
    return '';
  };

  function sanitizeItem(it) {
    if (!it || typeof it !== 'object') return null;
    if (it.kind === 'gear') {
      if (!G.ITEM_BASES[it.slot] || !G.RARITY.find((r) => r.id === it.rarity)) return null;
      const stats = {};
      Object.keys(it.stats || {}).forEach((k) => { if (G.STAT_LABEL[k]) stats[k] = num(it.stats[k], 0, 0, 10000); });
      return { id: String(it.id || newId()), kind: 'gear', slot: it.slot, rarity: it.rarity, name: String(it.name || 'Item').slice(0, 40), ilvl: num(it.ilvl, 1, 1, 99), stats, value: num(it.value, 5, 0, 1e6) };
    }
    if (G.CONSUMABLES[it.key]) {
      const q = Math.floor(num(it.qty, 0, 0, 9999));
      if (q <= 0) return null;
      return { id: String(it.id || newId()), kind: G.CONSUMABLES[it.key].material ? 'material' : 'consumable', key: it.key, qty: q };
    }
    return null;
  }

  G.sanitizeProfile = function (raw) {
    const d = G.newProfile();
    if (!raw || typeof raw !== 'object') return d;
    const p = d;
    p.level = Math.floor(num(raw.level, 1, 1, C.MAX_LEVEL));
    p.xp = Math.floor(num(raw.xp, 0, 0, 1e9));
    p.gold = Math.floor(num(raw.gold, 30, 0, 1e9));
    p.attrPoints = Math.floor(num(raw.attrPoints, 0, 0, 999));
    p.skillPoints = Math.floor(num(raw.skillPoints, 1, 0, 999));
    if (raw.attrs) Object.keys(p.attrs).forEach((k) => (p.attrs[k] = Math.floor(num(raw.attrs[k], 0, 0, 999))));
    // attribute total can never exceed what levels granted
    const maxAttr = (p.level - 1) * C.ATTR_POINTS_PER_LEVEL;
    let spent = Object.values(p.attrs).reduce((a, b) => a + b, 0);
    if (spent > maxAttr) { p.attrs = { str: 0, vit: 0, int: 0, agi: 0 }; spent = 0; }
    p.attrPoints = Math.min(p.attrPoints, maxAttr - spent);
    // skill tree (v3+). Older saves used a flat skill list: refund everything and let the player pick a path.
    const maxSP = 1 + (p.level - 1) * C.SKILL_POINTS_PER_LEVEL;
    const keepSkills = raw.v >= 6 && !!G.PATHS[raw.path];
    p.path = keepSkills ? raw.path : null;
    p.skills = {};
    if (p.path && raw.skills) Object.keys(raw.skills).forEach((k) => {
      const sk = G.SKILLS[k];
      if (sk && sk.path === p.path && sk.unlock <= p.level) p.skills[k] = Math.floor(num(raw.skills[k], 0, 0, G.SKILL_MAX_RANK));
    });
    Object.keys(p.skills).forEach((k) => { if (!p.skills[k]) delete p.skills[k]; });
    const spentSP = Object.values(p.skills).reduce((a, b) => a + b, 0);
    const removed = p.path && raw.skills && Object.keys(raw.skills).some((k) => !G.SKILLS[k] && raw.skills[k] > 0); // e.g. the Shadow Monarch rework
    if (spentSP > maxSP && raw.gm !== true) { p.skills = {}; p.skillPoints = maxSP; }
    else if (removed) p.skillPoints = Math.max(0, maxSP - spentSP); // refund points from skills that no longer exist
    else if (raw.v >= 4) p.skillPoints = Math.max(0, Math.min(p.skillPoints, maxSP - spentSP));
    else p.skillPoints = maxSP;
    // v5: the hero is a lightning swordsman only. Older saves (or other paths) get every point back on the lightning tree.
    if (!keepSkills) { p.skills = {}; p.skillPoints = maxSP; p.gm = raw.gm === true; G.choosePath(p, G.PATHS[raw.path] ? raw.path : 'storm'); }
    p.slots = Array.isArray(raw.slots) ? raw.slots.slice(0, 4).map((k) => (typeof k === 'string' ? k : null)) : [];
    G.fixSlots(p);
    p.inventory = (Array.isArray(raw.inventory) ? raw.inventory : []).map(sanitizeItem).filter(Boolean).slice(0, C.INVENTORY_SIZE);
    p.equipped = { weapon: null, armor: null, accessory: null };
    if (raw.equipped) Object.keys(p.equipped).forEach((s) => {
      const it = sanitizeItem(raw.equipped[s]);
      if (it && it.kind === 'gear' && it.slot === s) p.equipped[s] = it;
    });
    p.quests = {};
    if (raw.quests) G.QUESTS.forEach((q) => {
      const s = raw.quests[q.id];
      if (s && typeof s === 'object') p.quests[q.id] = { progress: num(s.progress, 0, 0, q.count), done: !!s.done, claimed: !!s.claimed && !!s.done };
    });
    p.areas = { courtyard: { unlocked: true, cleared: 0 } };
    if (raw.areas) G.AREAS.forEach((a) => {
      const s = raw.areas[a.id];
      if (s && typeof s === 'object') {
        p.areas[a.id] = { unlocked: !!s.unlocked || a.id === 'courtyard', cleared: Math.floor(num(s.cleared, 0, 0, 1e6)), starMask: Math.floor(num(s.starMask, 0, 0, 7)) };
        if (s.best != null) p.areas[a.id].best = Math.floor(num(s.best, 0, 0, 1e6));
        if (p.areas[a.id].cleared > 0 && !p.areas[a.id].starMask) p.areas[a.id].starMask = 1; // cleared before stars existed: star 1
      }
    });
    // world expansion (20 areas in order): an area is open if it was cleared or it comes right after the furthest cleared one
    if (!raw.gm) {
      let far = 0;
      G.AREAS.forEach((a, i) => { if (p.areas[a.id] && p.areas[a.id].cleared > 0) far = Math.max(far, i + 1); });
      G.AREAS.forEach((a, i) => {
        const st = p.areas[a.id] || (p.areas[a.id] = { unlocked: false, cleared: 0 });
        st.unlocked = i <= far || st.cleared > 0;
      });
    }
    p.bestWave = Math.floor(num(raw.bestWave, 0, 0, 1e5));
    p.regionClaims = {};
    if (raw.regionClaims && typeof raw.regionClaims === 'object') G.REGIONS.forEach((r) => { const n = Math.floor(num(raw.regionClaims[r.id], 0, 0, 3)); if (n) p.regionClaims[r.id] = n; });
    p.shop = { stock: [], seed: 0 };
    if (raw.shop && Array.isArray(raw.shop.stock)) p.shop.stock = raw.shop.stock.map(sanitizeItem).filter((i) => i && i.kind === 'gear').slice(0, 6);
    if (raw.stats) Object.keys(p.stats).forEach((k) => (p.stats[k] = Math.floor(num(raw.stats[k], 0, 0, 1e9))));
    p.settings = G.defaultSettings();
    if (raw.settings) Object.keys(p.settings).forEach((k) => {
      if (typeof p.settings[k] === 'boolean' && typeof raw.settings[k] === 'boolean') p.settings[k] = raw.settings[k];
      if (typeof p.settings[k] === 'number') p.settings[k] = num(raw.settings[k], p.settings[k], 0, 1);
      if (k === 'voice' && ['warrior', 'protagonist', 'off'].includes(raw.settings[k])) p.settings[k] = raw.settings[k];
    });
    if (!(raw.v >= 2)) p.settings.autoAttack = true; // v2: auto-attack became the default
    p.created = num(raw.created, Date.now(), 0, 1e15);
    p.gm = raw.gm === true;
    if (p.gm && p.level < C.MAX_LEVEL) { p.attrPoints += (C.MAX_LEVEL - p.level) * C.ATTR_POINTS_PER_LEVEL; p.level = C.MAX_LEVEL; p.xp = 0; } // GM saves follow the level cap
    if (p.gm) G.AREAS.forEach((a) => { const st = p.areas[a.id] || (p.areas[a.id] = { unlocked: true, cleared: 0 }); st.unlocked = true; }); // GM: every area open, including new ones
    if (p.gm) { // GM accounts always have the whole tree maxed (also picks up newly added skills)
      G.SKILL_ORDER.forEach((k) => { if (G.SKILLS[k].path === p.path) p.skills[k] = G.SKILL_MAX_RANK; });
      p.skillPoints = 0;
      G.fixSlots(p);
    }
    return p;
  };

  // returns {profile, warning}
  G.loadSave = function (slot) {
    let txt = null;
    const key = keyFor(slot || 'main');
    try { txt = localStorage.getItem(key); } catch (e) { return { profile: null, warning: 'Browser storage is unavailable; progress cannot be saved.' }; }
    if (!txt) return { profile: null };
    try {
      return { profile: G.sanitizeProfile(JSON.parse(txt)) };
    } catch (e) {
      try { localStorage.setItem(key + '_corrupt', txt); } catch (e2) { /* ignore */ }
      console.warn('[save] corrupted save, backed up', e);
      return { profile: null, warning: 'Your save file was damaged and could not be read. A backup was kept; please start a new game.' };
    }
  };
})();
