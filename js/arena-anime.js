
const T = 32, W = 21, H = 15, cv = document.getElementById('c'), g = cv.getContext('2d');
// Personagens originais (arquétipos). Para usar sprites de anime, troque o desenho por imagens (ver drawChar).
const TC = { fisico: '#e8e8e8', magico: '#c88cff', fogo: '#ff7a2e', gelo: '#7ad8ff', raio: '#ffe94a', ki: '#5cf0a0' };
// resistência/fraqueza por monstro (índice = tipo em KD): multiplicador de dano por tipo
const RS = [{}, { raio: 1.3 }, { fisico: .6, magico: 1.2, fogo: 1.3 }, { fisico: .9 }, { fisico: .2, magico: 1.4, ki: 1.3, fogo: .8 }, { fisico: .8, fogo: 1.3, gelo: 1.3, magico: .8 }, { fogo: .2, gelo: 1.5, magico: .9, ki: 1.1 }];
// SK(nome,tipo,dano,recarga,alcance,golpes,área,evoluções,+golpe/evolução,+área/evolução,especial)
const SK = (n, t, dmg, cd, range, h, a, ev, eh, ea, esp) => ({ n, t, dmg, cd, range, h, a, ev, eh, ea, esp: !!esp, st: 0, use: 0 });
const val = (s, t) => s.dmg * (s.h || 1) * (1 + .3 * (s.a || 0)) * ((t.res && t.res[s.t]) || 1) * (s.esp ? 3 : 1);
const pick = (e, t, d) => e.sk.filter(s => s.cdl == 0 && s.range >= d).sort((a, b) => val(b, t) - val(a, t))[0];
const chars = [
  {
    name: 'Espadachim', pref: 1, body: '#7a1f2b', hair: '#1c1a22', accent: '#c9a04a', shadow: '#541420', spk: 3, sk: [
      SK('Corte de Uma Espada', 'fisico', 12, 40, 1, 1, 0, ['Corte de Duas Espadas', 'Corte de Três Espadas'], 1, 0),
      SK('Onda Cortante', 'fisico', 10, 70, 5, 1, 0, ['Tornado de Lâminas', 'Ciclone Demoníaco'], 0, 1),
      SK('Investida das Três Lâminas', 'fisico', 8, 90, 2, 3, 0, ['Fúria do Dragão Triplo', 'Fúria Sem Limites'], 1, 0),
      SK('Investida do Leão', 'fisico', 22, 120, 3, 1, 0, ['Rugido do Leão', 'Mil Leões'], 0, 1),
      SK('Lâmina Espiritual', 'ki', 16, 100, 4, 1, 0, ['Lâmina do Rei Guerreiro', 'Lâmina Transcendente'], 0, 1),
      SK('Fúria das Nove Lâminas', 'fisico', 9, 110, 2, 9, 0, ['Avatar da Fúria: Nove Lâminas', 'Avatar da Guerra: Nove Lâminas'], 1, 0, 1)]
  },
  {
    name: 'Mago', pref: 4, body: '#3d2a66', hair: '#6b2a8a', accent: '#e0c45a', shadow: '#241a44', spk: 5, sk: [
      SK('Bola de Fogo', 'fogo', 10, 50, 5, 1, 0, ['Dragão de Fogo', 'Fênix Flamejante'], 0, 1),
      SK('Lança de Gelo', 'gelo', 11, 60, 5, 1, 0, ['Chuva de Gelo', 'Túmulo Glacial'], 0, 1),
      SK('Relâmpago', 'raio', 12, 55, 5, 1, 0, ['Corrente Elétrica', 'Trovão Divino'], 1, 0),
      SK('Lança de Luz', 'magico', 14, 70, 6, 1, 0, ['Chuva de Luz', 'Julgamento Celestial'], 1, 0),
      SK('Explosão Arcana', 'magico', 20, 130, 4, 1, 1, ['Explosão Suprema', 'Nova Arcana'], 0, 1),
      SK('Meteoro', 'fogo', 40, 110, 6, 1, 2, ['Meteoro Ardente', 'Apocalipse'], 0, 1, 1)]
  },
  {
    name: 'Ninja', pref: 2, body: '#1f2b3d', hair: '#273344', accent: '#3ac1b0', shadow: '#121a26', spk: 4, sk: [
      SK('Chuva de Kunais', 'fisico', 6, 30, 5, 2, 0, ['Mil Kunais', 'Tempestade de Aço'], 1, 0),
      SK('Lâmina Sombria', 'fisico', 8, 32, 1, 2, 0, ['Dança das Sombras', 'Corte Fantasma'], 1, 0),
      SK('Bola de Fogo Ninja', 'fogo', 16, 90, 4, 1, 1, ['Grande Bola de Fogo', 'Dragão de Chamas'], 0, 1),
      SK('Garra do Trovão', 'raio', 20, 100, 2, 1, 0, ['Lâmina de Raio', 'Corte Trovão'], 1, 0),
      SK('Duplicação Sombria', 'fisico', 7, 110, 3, 5, 0, ['Clones Explosivos', 'Exército de Clones'], 1, 0),
      SK('Ritual Proibido', 'magico', 45, 115, 3, 1, 1, ['Selo do Demônio', 'Selo Final'], 0, 1, 1)]
  },
  {
    name: 'Lutador', pref: 1, body: '#6b4a2e', hair: '#1a1510', accent: '#c0392b', shadow: '#43301d', spk: 6, sk: [
      SK('Soco Rápido', 'fisico', 9, 30, 1, 2, 0, ['Rajada de Socos', 'Mil Socos'], 1, 0),
      SK('Rajada de Ki', 'ki', 12, 45, 5, 1, 0, ['Rajada Dupla', 'Metralhadora de Ki'], 1, 0),
      SK('Onda de Energia', 'ki', 24, 110, 6, 1, 0, ['Onda Dupla', 'Onda Suprema'], 1, 0),
      SK('Chute Voador', 'fisico', 18, 70, 2, 1, 0, ['Chute Giratório', 'Chute Meteoro'], 0, 1),
      SK('Explosão de Ki', 'ki', 22, 130, 3, 1, 2, ['Explosão Suprema', 'Supernova'], 0, 1),
      SK('Punho do Dragão', 'ki', 22, 100, 4, 3, 0, ['Punho do Dragão Duplo', 'Punho do Dragão Supremo'], 1, 0, 1)]
  }
];

const sa = document.getElementById('sa'), sb = document.getElementById('sb'), rc = document.getElementById('rc'), logEl = document.getElementById('log');
chars.forEach((c, i) => { sa.add(new Option(c.name, i)); sb.add(new Option(c.name, i)); rc.add(new Option(c.name, i)); document.getElementById('shopChar').add(new Option(c.name, i)) }); sb.value = 1;
const base = JSON.parse(JSON.stringify(chars));
try {
  const s = JSON.parse(localStorage.getItem('arena-anime-v2')); if (s) s.forEach((c, i) => {
    chars[i].sk = c.sk; chars[i].lvl = c.lvl; chars[i].level = c.level; chars[i].xp = c.xp; chars[i].strat = c.strat; chars[i].focus = c.focus; chars[i].deaths = c.deaths; chars[i].fear = c.fear; chars[i].best = c.best;
    chars[i].gold = c.gold || 0; chars[i].skinOwned = c.skinOwned || [0]; chars[i].skinIdx = c.skinIdx || 0
  })
} catch (e) { }
chars.forEach(c => { c.lvl = c.lvl || 0; c.level = c.level || 1; c.xp = c.xp || 0; c.strat = c.strat || { rest: .4, alvo: 'qualquer', dist: 0 }; c.focus = c.focus || 'equilibrado'; c.deaths = c.deaths || 0; c.fear = c.fear || 0; c.best = c.best || 1; c.sayT = 0; c.say = c.say || '' });
const save = () => { try { localStorage.setItem('arena-anime-v2', JSON.stringify(chars.map(c => ({ sk: c.sk, lvl: c.lvl, level: c.level, xp: c.xp, strat: c.strat, focus: c.focus, deaths: c.deaths, fear: c.fear, best: c.best, gold: c.gold, skinOwned: c.skinOwned, skinIdx: c.skinIdx })))) } catch (e) { } };
// ---- Lojinha de roupas (skins) ----
const RARITY = { comum: '#8a8a8a', raro: '#4a90e2', epico: '#a24ae2', lendario: '#e2a24a', mitico: '#e24a5a' };
const SKINS = {
  'Espadachim': [{ name: 'Clássico', cost: 0, rar: 'comum', body: '#7a1f2b', hair: '#1c1a22', accent: '#c9a04a', shadow: '#541420' },
  { name: 'Lâmina Negra', cost: 80, rar: 'raro', body: '#1c1c24', hair: '#0d0d12', accent: '#8a8f9a', shadow: '#0a0a0e' },
  { name: 'Fênix Carmesim', cost: 160, rar: 'epico', body: '#b8381f', hair: '#3a0d0d', accent: '#ffcf5a', shadow: '#6e1a0d' },
  { name: 'Guardião Esmeralda', cost: 240, rar: 'epico', body: '#1f6b4a', hair: '#122a1f', accent: '#bfe6a0', shadow: '#0d3322' },
  { name: 'Samurai do Crepúsculo', cost: 320, rar: 'lendario', body: '#1a1a2e', hair: '#0d0d18', accent: '#c9d4e8', shadow: '#0a0a16', glow: '#6a7fd0' },
  { name: 'Cavaleiro Amaldiçoado', cost: 420, rar: 'lendario', body: '#14140f', hair: '#0a0a08', accent: '#7aff6a', shadow: '#080805', glow: '#4aff3a' },
  { name: 'Demônio de Aço', cost: 520, rar: 'mitico', body: '#17090b', hair: '#0b0405', accent: '#ff3a3a', shadow: '#0a0405', glow: '#ff2020' },
  { name: 'Manto da Serpente Verde', cost: 460, rar: 'lendario', body: '#0d100e', hair: '#d8c878', accent: '#6bff7a', shadow: '#070907', glow: '#4bff5a', coat: true }],
  'Mago': [{ name: 'Clássico', cost: 0, rar: 'comum', body: '#3d2a66', hair: '#6b2a8a', accent: '#e0c45a', shadow: '#241a44' },
  { name: 'Arcano Gélido', cost: 80, rar: 'raro', body: '#1e4a66', hair: '#2a7a9a', accent: '#cdeeff', shadow: '#0d2838' },
  { name: 'Chama Ancestral', cost: 160, rar: 'epico', body: '#6b2318', hair: '#9a3a1a', accent: '#ffcf5a', shadow: '#3a0f0a' },
  { name: 'Sombra Espectral', cost: 240, rar: 'epico', body: '#241b33', hair: '#1a1222', accent: '#a98cff', shadow: '#120d1c' },
  { name: 'Necromante', cost: 320, rar: 'lendario', body: '#17151f', hair: '#e8e4d8', accent: '#9a4ae2', shadow: '#0a0910', glow: '#8a2ad0' },
  { name: 'Olho do Vazio', cost: 420, rar: 'lendario', body: '#0d0a18', hair: '#07050d', accent: '#ff4ad0', shadow: '#050310', glow: '#ff2ac0' },
  { name: 'Arauto do Eclipse', cost: 520, rar: 'mitico', body: '#120e08', hair: '#070502', accent: '#e8c24a', shadow: '#080502', glow: '#ffb020' }],
  'Ninja': [{ name: 'Clássico', cost: 0, rar: 'comum', body: '#1f2b3d', hair: '#273344', accent: '#3ac1b0', shadow: '#121a26' },
  { name: 'Névoa Prateada', cost: 80, rar: 'raro', body: '#3a3f4a', hair: '#4a5160', accent: '#d8dde6', shadow: '#1e2228' },
  { name: 'Víbora Carmesim', cost: 160, rar: 'epico', body: '#2a1620', hair: '#1a0f16', accent: '#c0293d', shadow: '#160b10' },
  { name: 'Vento Dourado', cost: 240, rar: 'epico', body: '#2e2a1a', hair: '#3a3320', accent: '#e0c45a', shadow: '#181509' },
  { name: 'Lâmina da Meia-Noite', cost: 320, rar: 'lendario', body: '#0c0e14', hair: '#05060a', accent: '#c9d4e8', shadow: '#05060a', glow: '#8aa0ff' },
  { name: 'Yokai das Sombras', cost: 420, rar: 'lendario', body: '#19101f', hair: '#0d0810', accent: '#e8e03a', shadow: '#0a0710', glow: '#d8d020' },
  { name: 'Caçador Noturno', cost: 520, rar: 'mitico', body: '#120909', hair: '#090404', accent: '#d61f2e', shadow: '#070303', glow: '#ff2a3a' }],
  'Lutador': [{ name: 'Clássico', cost: 0, rar: 'comum', body: '#6b4a2e', hair: '#1a1510', accent: '#c0392b', shadow: '#43301d' },
  { name: 'Punho de Ferro', cost: 80, rar: 'raro', body: '#4a4a52', hair: '#1a1a1e', accent: '#8fa0b0', shadow: '#282830' },
  { name: 'Tigre Selvagem', cost: 160, rar: 'epico', body: '#8a5a1f', hair: '#1a1510', accent: '#e07a1f', shadow: '#4a3010' },
  { name: 'Monge Celeste', cost: 240, rar: 'epico', body: '#2e5a6b', hair: '#e8dcc0', accent: '#bfe6e0', shadow: '#163038' },
  { name: 'Fera Negra', cost: 320, rar: 'lendario', body: '#15110d', hair: '#0a0806', accent: '#e0923c', shadow: '#080605', glow: '#ff8a2a' },
  { name: 'Monge Caído', cost: 420, rar: 'lendario', body: '#2a2420', hair: '#0d0b09', accent: '#d6303c', shadow: '#120f0d', glow: '#ff3a3a' },
  { name: 'Titã Sombrio', cost: 520, rar: 'mitico', body: '#0c0a0d', hair: '#060507', accent: '#ff7a1f', shadow: '#050405', glow: '#ff5a10' }]
};
function applySkin(c, idx) { const sk = (SKINS[c.name] || [])[idx] || SKINS[c.name][0]; c.body = sk.body; c.hair = sk.hair; c.accent = sk.accent; c.shadow = sk.shadow; c.glow = sk.glow || null; c.coatLong = !!sk.coat }
chars.forEach(c => { c.gold = c.gold || 0; c.skinOwned = c.skinOwned || [0]; c.skinIdx = c.skinIdx || 0; applySkin(c, c.skinIdx) });
function buySkin(ci, si) {
  const c = chars[ci], sk = SKINS[c.name][si]; if (c.skinOwned.includes(si)) { applySkin(c, si); c.skinIdx = si; save(); renderShop(); log(`${c.name} equipou ${sk.name}.`); return }
  if (c.gold < sk.cost) { log(`${c.name} não tem ouro suficiente para ${sk.name} (precisa de ${sk.cost}, tem ${c.gold}).`); return }
  c.gold -= sk.cost; c.skinOwned.push(si); c.skinIdx = si; applySkin(c, si); save(); renderShop(); log(`${c.name} comprou e equipou ${sk.name}!`)
}
const RNAME = { comum: 'Comum', raro: 'Raro', epico: 'Épico', lendario: 'Lendário', mitico: 'Mítico' };
function renderShop() {
  const ci = +document.getElementById('shopChar').value, c = chars[ci];
  document.getElementById('shopBody').innerHTML =
    `<div style="display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,#2a2015,#1b1712);border:1px solid #6b5530;border-radius:10px;padding:8px 14px;margin-bottom:10px;width:fit-content">
   <span style="font-size:22px">🪙</span><span style="font-size:18px;font-weight:bold;color:#e6c229">${c.gold || 0}</span><span style="color:#aaa;font-size:12px">ouro de ${c.name}</span></div>
 <div style="display:flex;flex-wrap:wrap;gap:10px">`+ SKINS[c.name].map((sk, i) => {
      const owned = c.skinOwned.includes(i), eq = c.skinIdx === i, rc = RARITY[sk.rar] || '#888', afford = owned || (c.gold || 0) >= sk.cost;
      return `<div style="width:128px;border-radius:10px;padding:8px;text-align:center;background:#1b1712;border:2px solid ${eq ? '#e6c229' : rc};box-shadow:0 0 ${eq ? '10px #e6c229' : sk.glow ? '8px ' + sk.glow + 'aa' : '0px'};position:relative">
   <div style="font-size:9px;color:${rc};text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${RNAME[sk.rar] || ''}</div>
   <div style="width:52px;height:52px;margin:0 auto;border-radius:50%;background:radial-gradient(circle at 35% 30%,${sk.accent},${sk.body} 55%,${sk.shadow || sk.body} 100%);border:2px solid ${sk.glow || sk.accent};box-shadow:${sk.glow ? '0 0 10px ' + sk.glow + 'cc' : 'none'}"></div>
   <div style="font-size:12px;margin-top:6px;min-height:28px;display:flex;align-items:center;justify-content:center">${sk.name}</div>
   <div style="font-size:12px;color:${owned ? '#8fd18f' : '#e6c229'};margin:2px 0">${owned ? (eq ? '✓ equipado' : '✓ possuído') : '🪙 ' + sk.cost}</div>
   <button style="margin-top:2px;font-size:11px;padding:3px 8px;width:100%;${!afford && !owned ? 'opacity:.5' : ''}" onclick="buySkin(${ci},${i})">${eq ? 'Equipado' : owned ? 'Equipar' : 'Comprar'}</button></div>`
    }).join('') + '</div>'
}
const log = t => { logEl.textContent += '\n' + t; const q = logEl.textContent.split('\n'); if (q.length > 120) logEl.textContent = q.slice(-80).join('\n'); logEl.scrollTop = 1e9 };
function resetAll() { chars.forEach((c, i) => { c.sk = JSON.parse(JSON.stringify(base[i].sk)); c.lvl = 0; c.level = 1; c.xp = 0; c.strat = { rest: .4, alvo: 'qualquer', dist: 0 }; c.focus = 'equilibrado'; c.deaths = 0; c.fear = 0; c.best = 1 }); save(); logEl.textContent = 'Treino zerado.' }

// ---- Agente de treino: hill-climbing com orçamento de poder ----
const power = s => s.dmg * (s.h || 1) * (1 + .3 * (s.a || 0)) * (60 / s.cd) + s.range * 4;
function evalSkill(s, fo) { const lo = fo == 'alcance' ? 3 : 1, hi = fo == 'corpo' ? 2 : 7; let tot = 0; for (let k = 0; k < 20; k++) { let d = lo + Math.random() * (hi - lo + 1) | 0, cd = 0; for (let t = 0; t < 400; t++) { if (t % 15 == 0) d = Math.min(hi, Math.max(lo, d + (Math.random() < .5 ? -1 : 1))); if (cd > 0) cd--; else if (d <= s.range) { tot += s.dmg * (s.h || 1) * (1 + .3 * (s.a || 0)); cd = s.cd } } } return tot }
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function train(ci) {
  const c = chars[ci]; c.lvl++; log(`— Agente treinando ${c.name} (nível ${c.lvl}) —`);
  c.sk.forEach((s, i) => {
    const budget = power(s) * 1.06; let best = { ...s }, bs = evalSkill(best, c.focus);
    for (let it = 0; it < (TC[c.focus] && s.t !== c.focus ? 120 : 400); it++) {
      const m = { ...best }; m.dmg = clamp(m.dmg + (Math.random() * 6 - 3) | 0, 3, 90); m.cd = clamp(m.cd + (Math.random() * 30 - 15) | 0, 20, 240); m.range = clamp(m.range + (Math.random() < .2 ? (Math.random() < .5 ? -1 : 1) : 0), 1, 8);
      if (power(m) > budget) continue; const sc = evalSkill(m, c.focus); if (sc > bs) { best = m; bs = sc }
    }
    log(`${s.n}: dano ${s.dmg}→${best.dmg}, recarga ${s.cd}→${best.cd}, alcance ${s.range}→${best.range}`); c.sk[i] = best
  }); save()
}

// ---- Luta ----
let ents = [], state = 'idle', fx = [], msg = '', keys = {}, banner = null, shakeT = 0, parts = [], hitstop = 0, zoomT = 0, zoomPt = null, trainMode = false;
// ---- Ataque final (finisher): etapas em frames — preparação, investida+impacto+golpe, recuperação ----
const WINDUP = 20, DASH_DUR = 12, SWING_DUR = 40, RECOVER_DUR = 16;
function spawnParts(x, y, col, n, spd, life, size) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, sp = spd * (.4 + Math.random() * .9);
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: life * (.7 + Math.random() * .6), max: life, col, size: size * (.6 + Math.random() * .8) })
  }
}
function tickParts() { parts.forEach(p => { p.x += p.vx; p.y += p.vy; p.vx *= .92; p.vy *= .92; p.life-- }); parts = parts.filter(p => p.life > 0) }
function drawParts() { parts.forEach(p => { g.globalAlpha = Math.max(0, p.life / p.max); g.fillStyle = p.col; g.beginPath(); g.arc(p.x, p.y, Math.max(.4, p.size * (p.life / p.max)), 0, 7); g.fill() }); g.globalAlpha = 1 }
function decayHit(o) { if (o.kt > 0) { o.kt--; o.kx *= .82; o.ky *= .82 } if (o.hitT > 0) o.hitT-- }
function startFinisher(e, t, s) {
  e.fin = { phase: 'windup', t: 0, target: t, skill: s, f: t.x >= e.x ? 1 : -1 }; e.f = e.fin.f; e.finvx = 0;
  const acx = e.x * T + 16, acy = e.y * T + 16; spawnParts(acx, acy, TC[s.t] || '#fff', 10, .6, 22, 2)
}
function advanceFinisher(e) {
  const fi = e.fin, s = fi.skill;
  if (fi.phase == 'windup') {
    fi.t++; const p = fi.t / WINDUP; e.finvx = -fi.f * 8 * Math.sin(p * Math.PI / 2);
    if (fi.t % 5 == 0) { const acx = e.x * T + 16 - fi.f * 6, acy = e.y * T + 16; spawnParts(acx, acy, TC[s.t] || '#fff', 4, .5, 16, 1.8) }
    if (fi.t >= WINDUP) { fi.phase = 'swing'; fi.t = 0; fi.hit = false; fi.trail = []; e.swing = SWING_DUR; e.swingMax = SWING_DUR; e.swingSkill = s; e.finvx = 0 }
    return
  }
  if (fi.phase == 'swing') {
    fi.t++; e.swing = Math.max(0, SWING_DUR - fi.t);
    const pr = Math.min(1, fi.t / DASH_DUR), fade = fi.t < DASH_DUR + 6 ? 1 : Math.max(0, 1 - (fi.t - DASH_DUR - 6) / (SWING_DUR - DASH_DUR - 6));
    e.finvx = fi.f * pr * 14 * fade; fi.trail.push({ ox: e.finvx }); if (fi.trail.length > 5) fi.trail.shift();
    if (!fi.hit && fi.t >= DASH_DUR) { fi.hit = true; resolveFinisherHit(e, fi) }
    if (fi.t >= SWING_DUR) { fi.phase = 'recover'; fi.t = 0; e.swing = 0; e.swingSkill = null }
    return
  }
  if (fi.phase == 'recover') { fi.t++; e.finvx *= .82; if (fi.t >= RECOVER_DUR) { e.fin = null; e.finvx = 0 } }
}
function resolveFinisherHit(e, fi) {
  const s = fi.skill, t = fi.target;
  const visible = state != 'world' || wents[cam] === e;
  hitstop = visible ? 6 : 0; if (visible) { shakeT = Math.max(shakeT, 10); zoomT = 8; zoomPt = { x: t.x * T + 16, y: t.y * T + 16 } }
  banner = { text: s.n, col: TC[s.t] || '#fff', t: 50 };
  const hits = s.h || 1, ar = s.a || 0, col = TC[s.t] || '#fff', tg = [t];
  if (ar > 0 && state == 'world') mons.forEach(o => { if (o !== t && o.hp > 0 && o.fl === t.fl && dist(o, t) <= ar) tg.push(o) });
  tg.forEach(o => {
    const d = Math.round(s.dmg * hits * (.85 + Math.random() * .3) * ((o.res && o.res[s.t]) || 1) * 1.6); o.hp -= d; fx.push({ a: o, num: d, col, t: 30 });
    o.hitT = 16; o.kx = (o.x > e.x ? 1 : o.x < e.x ? -1 : fi.f) * 8; o.ky = 0; o.kt = 18;
    spawnParts(o.x * T + 16, o.y * T + 16, col, 22, 2.2, 26, 2.6)
  });
  fx.push({ a: t, b: t, t: 22, t0: 22, ring: 1, col, rad: 1.8 * T });
  if (ar > 0) fx.push({ a: t, b: t, t: 18, t0: 18, ring: 1, col, rad: (ar + .5) * T });
  if (s.range > 2) fx.push({ a: e, b: t, t: 22, t0: 22, r: s.range, col, w: 4, typ: s.t, wpn: e.c.name });
  s.use = (s.use || 0) + 1; const i = e.sk.indexOf(s);
  if (s.ev && (s.st || 0) < s.ev.length && s.use >= [40, 120][s.st || 0]) {
    s.st = (s.st || 0) + 1; s.n = s.ev[s.st - 1]; s.dmg = Math.round(s.dmg * 1.2); if (s.eh) s.h = (s.h || 1) + 1; if (s.ea) s.a = (s.a || 0) + 1; s.cd = Math.max(20, Math.round(s.cd * .95));
    log(`${e.c.name} evoluiu: ${s.n}!`); if (e.c.sk[i]) Object.assign(e.c.sk[i], { n: s.n, st: s.st, dmg: s.dmg, h: s.h, a: s.a, cd: s.cd, use: s.use }); save()
  }
  else if (e.c.sk[i]) e.c.sk[i].use = s.use;
  if (state == 'world') { for (const o of tg) { if (o.hp <= 0 && !o.dead) { o.dead = 1; gain(e, o); if (o.boss) { getMap(o.fl).cleared = true; e.c.fear = Math.max(0, e.c.fear - 1); log(`${e.c.name} derrotou o chefe ${o.n} (andar ${o.fl})!`) } } } }
}
const mk = (ci, x, y, h) => ({ c: chars[ci], x, y, hp: 200 + 20 * (chars[ci].level - 1), max: 200 + 20 * (chars[ci].level - 1), sk: chars[ci].sk.map(s => ({ ...s, cdl: 0 })), mcd: 0, human: h });
let auto = false, rounds = 0;
function start(play, a) {
  auto = !!a; if (auto) { const i = Math.random() * chars.length | 0; let j; do { j = Math.random() * chars.length | 0 } while (j == i); sa.value = i; sb.value = j; rounds++; log(`\n=== Rodada ${rounds}: ${chars[i].name} x ${chars[j].name} ===`) }
  ents = [mk(+sa.value, 2, 7, play), mk(+sb.value, 18, 7, false)]; fx = []; msg = ''; state = 'fight'
}
function afterFight(w, l) { log(`${chars[w].name} venceu ${chars[l].name}.`); train(l); train(l); train(w) }
const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
function step(e, dx, dy, o) { const nx = e.x + dx, ny = e.y + dy; if (nx < 1 || ny < 1 || nx > W - 2 || ny > H - 2 || (nx == o.x && ny == o.y)) return; e.x = nx; e.y = ny; e.mcd = 10 }
function cast(e, t, s) {
  if (e.fin || s.cdl > 0 || e.gcd > 0 || dist(e, t) > s.range) return; s.cdl = s.cd; e.gcd = 12; e.f = t.x >= e.x ? 1 : -1;
  if (s.esp) { startFinisher(e, t, s); return }
  e.swing = 16; e.swingMax = 16; e.swingSkill = s;
  const hits = s.h || 1, ar = s.a || 0, col = TC[s.t] || '#fff', tg = [t];
  if (ar > 0 && state == 'world') mons.forEach(o => { if (o !== t && o.hp > 0 && o.fl === t.fl && dist(o, t) <= ar) tg.push(o) });
  tg.forEach(o => { const d = Math.round(s.dmg * hits * (.85 + Math.random() * .3) * ((o.res && o.res[s.t]) || 1)); o.hp -= d; fx.push({ a: o, num: d, col, t: 30 }) });
  if (s.range > 2) fx.push({ a: e, b: t, t: 14, t0: 14, r: s.range, col, w: Math.min(6, 2 + hits / 2), typ: s.t, wpn: e.c.name }); if (ar > 0) fx.push({ a: t, b: t, t: 16, t0: 16, ring: 1, col, rad: (ar + .5) * T });
  s.use = (s.use || 0) + 1; const i = e.sk.indexOf(s);
  if (s.ev && (s.st || 0) < s.ev.length && s.use >= [40, 120][s.st || 0]) {
    s.st = (s.st || 0) + 1; s.n = s.ev[s.st - 1]; s.dmg = Math.round(s.dmg * 1.2); if (s.eh) s.h = (s.h || 1) + 1; if (s.ea) s.a = (s.a || 0) + 1; s.cd = Math.max(20, Math.round(s.cd * .95));
    log(`${e.c.name} evoluiu: ${s.n}!`); if (e.c.sk[i]) Object.assign(e.c.sk[i], { n: s.n, st: s.st, dmg: s.dmg, h: s.h, a: s.a, cd: s.cd, use: s.use }); save()
  }
  else if (e.c.sk[i]) e.c.sk[i].use = s.use
}
function ai(e, t) {
  const d = dist(e, t); const rdy = pick(e, t, d); if (rdy) cast(e, t, rdy);
  if (e.mcd > 0) return; const esp = e.c.sk.find(s => s.esp), want = (esp && esp.cdl == 0) ? esp.range : (e.c.pref || 1); const sx = Math.sign(t.x - e.x), sy = Math.sign(t.y - e.y);
  if (d > want) { Math.abs(t.x - e.x) >= Math.abs(t.y - e.y) ? step(e, sx, 0, t) : step(e, 0, sy, t) }
  else if (d < want - 1) { Math.abs(t.x - e.x) >= Math.abs(t.y - e.y) ? step(e, -sx, 0, t) : step(e, 0, -sy, t) }
}
function tick() {
  if (hitstop > 0) { hitstop--; return } if (banner && banner.t > 0) banner.t--; if (shakeT > 0) shakeT--; if (zoomT > 0) zoomT--; tickParts(); if (state == 'leisure') { leisureTick(); return } if (state == 'world') { wtick(); return } if (state != 'fight') return;
  ents.forEach((e, i) => {
    decayHit(e); const t = ents[1 - i]; e.sk.forEach(s => s.cdl > 0 && s.cdl--); e.mcd > 0 && e.mcd--; e.gcd > 0 && e.gcd--;
    if (e.fin) { advanceFinisher(e); return }
    e.swing > 0 && e.swing--;
    if (e.human) { if (e.mcd == 0) { const dx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0), dy = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0); if (dx) step(e, dx, 0, t); else if (dy) step(e, 0, dy, t) } } else ai(e, t)
  });
  fx.forEach(f => f.t--); fx = fx.filter(f => f.t > 0);
  const dead = ents.findIndex(e => e.hp <= 0);
  if (dead >= 0 && trainMode) { ents[dead].hp = ents[dead].max; ents[dead].fin = null; ents[dead].swing = 0; ents[dead].kx = 0; ents[dead].ky = 0; ents[dead].kt = 0; ents[dead].hitT = 0 }
  else if (dead >= 0) {
    state = 'over'; msg = ents[1 - dead].c.name + ' venceu!';
    if (auto) { const w = chars.indexOf(ents[1 - dead].c), l = chars.indexOf(ents[dead].c); setTimeout(() => { if (!auto) return; afterFight(w, l); start(false, true) }, 2500) }
  }
}
addEventListener('keydown', e => { const k = e.key.toLowerCase(); keys[k] = 1; if (state == 'fight' && ents[0].human && '123456'.includes(k) && ents[0].sk[k - 1]) cast(ents[0], ents[1], ents[0].sk[k - 1]); if (k.startsWith('arrow')) e.preventDefault() });
addEventListener('keyup', e => delete keys[e.key.toLowerCase()]);

// ---- Desenho ----
const looks = { 'Espadachim': { style: 'helmet', skin: '#f2c9a0', w: '#cfd8e3', eye: '#5ac8e0', acc: 'cape' }, 'Mago': { style: 'long', skin: '#f0cf9e', w: '#e94', eye: '#c99aff', acc: 'hat' }, 'Ninja': { style: 'twin', skin: '#edc49a', w: '#9ab', eye: '#e0e0e0', acc: 'mask' }, 'Lutador': { style: 'spiky', skin: '#d9a06c', w: '#000', eye: '#e0923c', acc: 'band' } };
const imgs = {}; chars.forEach((c, i) => { const im = new Image(); im.onload = () => imgs[i] = im; im.src = 'sprites/' + i + '.png' });
function rr(x, y, w, h, r, f) { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = f; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#1a1010'; g.stroke() }
function tri(a, b, c, d, e2, f, fill) { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.lineTo(e2, f); g.closePath(); g.fillStyle = fill; g.fill(); g.lineWidth = 1.2; g.strokeStyle = '#1a1010'; g.stroke() }
const BLADES = [{ c: ['#f5f8ff', '#cfd9ec', '#8f9db4', '#5c6478'], curve: 0, jag: 0, hilt: '#d8b34a' },
{ c: ['#eafff2', '#a9e8c5', '#5fae82', '#2e6b4d'], curve: 1, jag: 0, hilt: '#7a3c3c' },
{ c: ['#fff2e0', '#e8c98a', '#b8843e', '#7a5220'], curve: -1, jag: 1, hilt: '#3a3a44' }];
function swordAt(ox, oy, ang, len, vi) {
  const V = BLADES[(vi || 0) % 3]; g.save(); g.translate(ox, oy); g.rotate(ang);
  g.fillStyle = '#00000030'; g.beginPath(); g.ellipse(len * .55, 1.8, len * .5, 2.4, 0, 0, 7); g.fill();
  const gr = g.createLinearGradient(0, -3, 0, 3); gr.addColorStop(0, V.c[0]); gr.addColorStop(.4, V.c[1]); gr.addColorStop(.55, V.c[2]); gr.addColorStop(1, V.c[3]);
  const cv = V.curve * 3; g.beginPath(); g.moveTo(3, -2.6);
  if (V.jag) { for (let i = 1; i <= 4; i++) { const t = i / 4; g.lineTo(3 + (len - 9) * t, -2.6 + cv * t + (i % 2 ? 2.2 : 0)) } }
  else g.quadraticCurveTo(3 + (len - 9) * .5, -2.4 + cv, len - 6, -1.1 + cv);
  g.lineTo(len, cv * .4); g.lineTo(len - 6, 1.1 + cv * .4); g.lineTo(3, 2.6); g.closePath();
  g.fillStyle = gr; g.fill(); g.lineWidth = .8; g.strokeStyle = '#20242c'; g.stroke();
  g.strokeStyle = '#ffffffa0'; g.lineWidth = .6; g.beginPath(); g.moveTo(4, -1.6); g.quadraticCurveTo(3 + (len - 9) * .5, -1.8 + cv, len - 7, -.7 + cv); g.stroke();
  g.fillStyle = V.hilt; g.fillRect(-2.5, -4.5, 3.5, 9);
  g.fillStyle = '#241a10'; g.fillRect(-11, -1.8, 8.5, 3.6); g.fillStyle = '#0006'; g.fillRect(-11, -.3, 8.5, 1);
  g.restore()
}
function drawChar(e) {
  const x = e.x * T + (e.kx || 0), y = e.y * T + (e.ky || 0), c = e.c, ci = chars.indexOf(c), L = looks[c.name] || looks.Lutador, f = e.f || (ents[0] === e ? 1 : -1);
  if (e.fin && e.fin.phase == 'windup') {
    const p = e.fin.t / WINDUP, col = TC[e.fin.skill.t] || '#fff';
    g.globalAlpha = p * .55; g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.arc(x + 16, y + 16, 10 + p * 16, 0, 7); g.stroke(); g.globalAlpha = 1
  }
  if (e.fin && e.fin.trail && e.fin.trail.length) {
    const col = TC[e.fin.skill.t] || c.body;
    e.fin.trail.forEach((tr, idx) => { g.globalAlpha = .11 * (idx + 1) / e.fin.trail.length; g.fillStyle = col; g.beginPath(); g.ellipse(x + 16 + tr.ox, y + 16, 13, 15, 0, 0, 7); g.fill() }); g.globalAlpha = 1
  }
  if (e.swingSkill && e.swingSkill.esp && e.swing > 0) {
    const p = 1 - e.swing / e.swingMax, col = TC[e.swingSkill.t] || '#fff', acx = x + 16, acy = y + 16;
    g.globalAlpha = p < .4 ? p * 1.4 : Math.max(0, 1 - (p - .4) * 1.6); const gr = g.createRadialGradient(acx, acy, 2, acx, acy, 42); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(acx, acy, 42, 0, 7); g.fill(); g.globalAlpha = 1;
    if (p > .32 && p < .62) {
      g.strokeStyle = col; g.lineWidth = 1.6; g.globalAlpha = (1 - Math.abs(p - .47) * 3.2) * .85;
      for (let i = 0; i < 10; i++) { const ang = i / 10 * 6.283 + p; g.beginPath(); g.moveTo(acx + Math.cos(ang) * 28, acy + Math.sin(ang) * 28); g.lineTo(acx + Math.cos(ang) * 66, acy + Math.sin(ang) * 66); g.stroke() } g.globalAlpha = 1
    }
  }
  g.fillStyle = '#0005'; g.beginPath(); g.ellipse(x + 16, y + 29, 11, 3.5, 0, 0, 7); g.fill();
  if (imgs[ci]) { g.drawImage(imgs[ci], x - 8, y - 14, 48, 48) } else {
    const cx = x + 16 + (e.finvx || 0), y0 = y + Math.round(Math.sin(Date.now() / 160 + e.x) * 1);
    const auraCol = c.glow || c.accent || '#fff', auraG = g.createRadialGradient(cx, y0 + 12, 2, cx, y0 + 12, 24); auraG.addColorStop(0, auraCol + (c.glow ? '70' : '55')); auraG.addColorStop(1, auraCol + '00');
    g.fillStyle = auraG; g.beginPath(); g.arc(cx, y0 + 12, 24, 0, 7); g.fill();
    rr(cx - 6, y0 + 23, 5, 6, 2, '#3a2a20'); rr(cx + 1, y0 + 23, 5, 6, 2, '#3a2a20');
    if (c.name == 'Espadachim') {
      const n = Math.min(3, 1 + (c.sk[0] && c.sk[0].st || 0)), isE = e.swingSkill && e.swingSkill.esp, bo = isE ? 1.7 : 1;
      if (e.swing > 0) {
        const p = 1 - e.swing / e.swingMax, ang = -.95 + p * 1.9, lunge = Math.sin(p * Math.PI) * 5 * bo;
        g.save(); g.translate(cx + f * lunge, y0 + 22); g.scale(f, 1); for (let k = 0; k < n; k++)swordAt(9, (k - (n - 1) / 2) * 3, ang, (26 + k * 2) * bo, k); g.restore();
        if (isE && p > .2 && p < .8) { g.globalAlpha = (1 - Math.abs(p - .5) * 2) * .5; g.fillStyle = '#ffd76b'; g.beginPath(); g.arc(cx + f * 14, y0 + 16, 34, 0, 7); g.fill(); g.globalAlpha = 1 }
        if (p > .3 && p < .7) { g.globalAlpha = 1 - Math.abs(p - .5) * 4; g.strokeStyle = '#fff'; g.lineWidth = isE ? 5 : 3; g.beginPath(); g.arc(cx + f * 14, y0 + 18, 20 * bo, -2.4, -.7); g.stroke(); g.globalAlpha = 1 }
      }
      else { const sway = Math.sin(Date.now() / 260 + e.x) * .06; g.save(); g.translate(cx, y0 + 22); g.scale(f, 1); for (let k = 0; k < n; k++)swordAt(9, 0, -.36 * (n - 1) / 2 + k * .36 + sway, 25 + k * 3, k); g.restore() }
    }
    else if (c.name == 'Mago') {
      const p = e.swing > 0 ? 1 - e.swing / e.swingMax : 0, isE = e.swingSkill && e.swingSkill.esp, bo = isE ? 1.9 : 1, col = e.swingSkill ? (TC[e.swingSkill.t] || '#c88cff') : '#c88cff', rad = e.swing > 0 ? (3 + p * 6) * bo : 3 + Math.sin(Date.now() / 200) * 1;
      g.strokeStyle = '#6b4a2a'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(cx + f * 10, y0 + 26); g.lineTo(cx + f * 10, y0 + 4); g.stroke();
      g.globalAlpha = e.swing > 0 ? .5 + p * .5 : .6; g.fillStyle = col; g.beginPath(); g.arc(cx + f * 10, y0 + 2, rad, 0, 7); g.fill(); g.globalAlpha = 1;
      if (e.swing > 0 && p > .55) { g.strokeStyle = col; g.lineWidth = isE ? 2 : 1; for (let i = 0; i < (isE ? 5 : 3); i++) { g.globalAlpha = Math.max(0, (1 - p) * .7); g.beginPath(); g.arc(cx + f * 10, y0 + 2, rad + 4 + i * 4, 0, 7); g.stroke() } g.globalAlpha = 1 }
    }
    else if (c.name == 'Ninja') {
      const p = e.swing > 0 ? 1 - e.swing / e.swingMax : 0, isE = e.swingSkill && e.swingSkill.esp, lunge = e.swing > 0 ? Math.sin(p * Math.PI) * (isE ? 12 : 7) : 0;
      g.save(); g.translate(cx + f * lunge, y0 + 18); g.scale(f, 1); g.fillStyle = isE ? '#e8c94a' : '#3a3a44';
      g.beginPath(); g.moveTo(6, -2); g.lineTo(18, 0); g.lineTo(6, 2); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(6, 4); g.lineTo(16, 7); g.lineTo(6, 8); g.closePath(); g.fill(); g.restore()
      if (isE && e.swing > 0 && p > .2 && p < .8) { g.globalAlpha = (1 - Math.abs(p - .5) * 2) * .4; g.fillStyle = '#9ab'; g.beginPath(); g.arc(cx + f * lunge + 16, y0 + 18, 26, 0, 7); g.fill(); g.globalAlpha = 1 }
    }
    else if (c.name == 'Lutador') {
      const p = e.swing > 0 ? 1 - e.swing / e.swingMax : 0, isE = e.swingSkill && e.swingSkill.esp, bo = isE ? 1.5 : 1, ext = e.swing > 0 ? Math.sin(p * Math.PI) * 14 * bo : 0, col = e.swingSkill ? (TC[e.swingSkill.t] || '#5cf0a0') : '#5cf0a0';
      g.strokeStyle = '#e8b88c'; g.lineWidth = 6; g.beginPath(); g.moveTo(cx + f * 4, y0 + 18); g.lineTo(cx + f * (10 + ext), y0 + 18); g.stroke();
      if (ext > 4) {
        g.strokeStyle = col; g.lineWidth = 1.5; for (let i = 0; i < (isE ? 5 : 3); i++) { g.globalAlpha = .5; g.beginPath(); g.moveTo(cx + f * (2 + i * 2), y0 + 14 + i * 3); g.lineTo(cx + f * (8 + i * 2), y0 + 14 + i * 3); g.stroke() } g.globalAlpha = 1;
        g.fillStyle = col; g.globalAlpha = .7; g.beginPath(); g.arc(cx + f * (10 + ext), y0 + 18, (5 + ext * .3) * bo, 0, 7); g.fill(); g.globalAlpha = 1
      }
    }
    else tri(cx + f * 12, y0 + 9, cx + f * 16, y0 + 9, cx + f * 14, y0 + 2, L.w);
    if (L.style == 'long' || L.style == 'twin') { rr(cx - 12, y0 + 6, 6, 16, 3, c.hair); rr(cx + 6, y0 + 6, 6, 16, 3, c.hair) }
    rr(cx - 7, y0 + 15, 14, 10, 4, c.body); g.fillStyle = (c.shadow || '#0003') + (c.shadow ? 'cc' : ''); g.fillRect(cx + 1, y0 + 15, 6, 10); g.fillStyle = '#0003'; g.fillRect(cx - 6, y0 + 21, 12, 2);
    g.fillStyle = '#ffffff26'; g.fillRect(cx - 6, y0 + 16, 3, 7);
    g.strokeStyle = (c.accent || '#0000') + '99'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx - 6, y0 + 20); g.lineTo(cx + 5, y0 + 20); g.stroke();
    if (c.glow) {
      const pq = .5 + Math.sin(Date.now() / 260 + e.x) * .5; g.globalAlpha = .4 + pq * .5; g.strokeStyle = c.glow; g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(cx - 4, y0 + 16); g.lineTo(cx - 1, y0 + 20); g.lineTo(cx - 3, y0 + 23); g.stroke();
      g.beginPath(); g.moveTo(cx + 3, y0 + 15); g.lineTo(cx + 5, y0 + 19); g.lineTo(cx + 3, y0 + 22); g.stroke(); g.globalAlpha = 1
    }
    rr(cx - 10, y0 + 16, 4, 7, 2, L.skin); rr(cx + 6, y0 + 16, 4, 7, 2, L.skin);
    rr(cx - 9, y0 + 2, 18, 15, 7, L.skin); g.fillStyle = '#0000001a'; g.beginPath(); g.ellipse(cx + 5, y0 + 9, 5, 7, 0, 0, 7); g.fill();
    g.fillStyle = '#ffffff22'; g.beginPath(); g.ellipse(cx - 4, y0 + 7, 3, 5, 0, 0, 7); g.fill();
    if (L.style == 'helmet') { rr(cx - 10, y0 - 1, 20, 9, 6, '#8a94a3'); tri(cx - 3, y0 - 1, cx + 3, y0 - 1, cx, y0 - 6, '#b33') }
    else if (L.style == 'spiky') { for (let i = 0; i < 5; i++)tri(cx - 10 + i * 4.5, y0 + 5, cx - 6 + i * 4.5, y0 + 5, cx - 8 + i * 4.5, y0 - 5 - (i % 2) * 3, c.hair); rr(cx - 9, y0 + 2, 18, 5, 3, c.hair) }
    else { rr(cx - 10, y0 - 1, 20, 8, 5, c.hair); if (L.style == 'twin') { rr(cx - 16, y0 + 3, 5, 5, 2, c.hair); rr(cx + 11, y0 + 3, 5, 5, 2, c.hair) } }
    g.fillStyle = '#c98a66'; g.globalAlpha = .35; g.beginPath(); g.ellipse(cx - 6, y0 + 14, 2.4, 1.6, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(cx + 6, y0 + 14, 2.4, 1.6, 0, 0, 7); g.fill(); g.globalAlpha = 1;
    g.strokeStyle = (c.hair || '#1a1010') + 'dd'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(cx - 6, y0 + 7.2); g.lineTo(cx - 2.6, y0 + 6.6); g.stroke(); g.beginPath(); g.moveTo(cx + 2.6, y0 + 6.6); g.lineTo(cx + 6, y0 + 7.2); g.stroke();
    rr(cx - 6, y0 + 8.5, 4, 6, 2, L.eye || '#fff'); rr(cx + 2, y0 + 8.5, 4, 6, 2, L.eye || '#fff');
    g.fillStyle = '#1a1010'; g.fillRect(cx - 5.3, y0 + 10.8, 2.6, 3.4); g.fillRect(cx + 2.7, y0 + 10.8, 2.6, 3.4);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(cx - 4.6, y0 + 11.3, .9, 0, 7); g.fill(); g.beginPath(); g.arc(cx + 3.4, y0 + 11.3, .9, 0, 7); g.fill();
    g.fillStyle = '#ffffffb0'; g.beginPath(); g.arc(cx - 3.6, y0 + 13.2, .5, 0, 7); g.fill(); g.beginPath(); g.arc(cx + 4.4, y0 + 13.2, .5, 0, 7); g.fill();
    g.strokeStyle = '#8a5a3a'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx - 1.6, y0 + 16.4); g.quadraticCurveTo(cx, y0 + 17.4, cx + 1.6, y0 + 16.4); g.stroke();
    if (L.acc == 'cape' && c.coatLong) {
      const sw = Math.sin(Date.now() / 220 + e.x) * 4; g.fillStyle = c.body; g.globalAlpha = .96;
      g.beginPath(); g.moveTo(cx - 7 - f * 2, y0 + 14); g.lineTo(cx - 13 - f * 9 + sw, y0 + 40); g.lineTo(cx + 4 - f * 3 + sw * .7, y0 + 38); g.lineTo(cx + 6 - f * 2, y0 + 14); g.closePath(); g.fill();
      g.strokeStyle = c.glow || c.accent; g.lineWidth = 1.3; g.globalAlpha = .9;
      g.beginPath(); g.moveTo(cx - 7 - f * 2, y0 + 14); g.lineTo(cx - 13 - f * 9 + sw, y0 + 40); g.stroke();
      g.beginPath(); g.moveTo(cx + 6 - f * 2, y0 + 14); g.lineTo(cx + 4 - f * 3 + sw * .7, y0 + 38); g.stroke(); g.globalAlpha = 1
    }
    else if (L.acc == 'cape') {
      g.fillStyle = c.accent || '#a22'; g.globalAlpha = .9; const sw = Math.sin(Date.now() / 240 + e.x) * 3;
      g.beginPath(); g.moveTo(cx - 6 - f * 2, y0 + 15); g.lineTo(cx - 10 - f * 6 + sw, y0 + 32); g.lineTo(cx + 2 - f * 2 + sw * .6, y0 + 30); g.lineTo(cx + 5 - f * 2, y0 + 15); g.closePath(); g.fill(); g.globalAlpha = 1
    }
    else if (L.acc == 'hat') {
      g.fillStyle = c.hair; g.beginPath(); g.moveTo(cx - 10, y0 + 1); g.lineTo(cx + 10, y0 + 1); g.lineTo(cx, y0 - 14); g.closePath(); g.fill(); g.strokeStyle = '#1a1010'; g.lineWidth = 1.2; g.stroke();
      g.fillStyle = c.accent || '#e0c45a'; g.beginPath(); g.arc(cx, y0 - 10, 2.6, 0, 7); g.fill()
    }
    else if (L.acc == 'mask') { g.fillStyle = c.accent || '#3ac1b0'; g.fillRect(cx - 9, y0 + 13, 18, 5) }
    else if (L.acc == 'band') { g.fillStyle = c.accent || '#c0392b'; g.fillRect(cx - 10, y0 + 5, 20, 4); g.fillRect(cx + 8, y0 + 6, 6, 10) }
  }
  g.fillStyle = '#000'; g.fillRect(x + 1, y - 10, 30, 7); g.fillStyle = '#3a3a3a'; g.fillRect(x + 2, y - 9, 28, 5);
  g.fillStyle = e.hp > 100 ? '#3ecf3e' : e.hp > 50 ? '#dcd23c' : '#d9393c'; g.fillRect(x + 3, y - 8, 26 * Math.max(0, e.hp) / e.max, 3);
  g.fillStyle = '#ffffff55'; g.fillRect(x + 3, y - 8, 26 * Math.max(0, e.hp) / e.max, 1);
  g.fillStyle = '#fff'; g.font = '10px sans-serif'; g.textAlign = 'center'; g.fillText(c.name + ' Nv' + (c.level || 1), x + 16, y - 12); if (c.sayT > 0) { const t = c.say, w = g.measureText(t).width + 10; g.fillStyle = '#fffe'; g.fillRect(x + 16 - w / 2, y - 30, w, 14); g.fillStyle = '#111'; g.fillText(t, x + 16, y - 19) }
  if (e.hitT > 0 && e.hitT % 4 < 2) { g.globalAlpha = .5; g.fillStyle = '#fff'; g.fillRect(x - 2, y - 14, 36, 46); g.globalAlpha = 1 }
}
function drawBeam(f) {
  const ax = f.a.x * T + 16, ay = f.a.y * T + 16, bx = f.b.x * T + 16, by = f.b.y * T + 16, col = f.col || '#fff', t0 = f.t0 || 14;
  if (f.typ == 'raio') {
    g.globalAlpha = Math.min(1, f.t / 10); g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(ax, ay);
    for (let i = 1; i < 4; i++)g.lineTo(ax + (bx - ax) * i / 4 + (Math.random() - .5) * 9, ay + (by - ay) * i / 4 + (Math.random() - .5) * 9);
    g.lineTo(bx, by); g.stroke(); g.strokeStyle = '#fff'; g.lineWidth = .8; g.stroke(); g.globalAlpha = 1; return
  }
  const p = Math.min(1, 1 - f.t / t0), px = ax + (bx - ax) * p, py = ay + (by - ay) * p, ang = Math.atan2(by - ay, bx - ax);
  g.globalAlpha = .4; g.strokeStyle = col; g.lineWidth = (f.w || 3) * .5; g.beginPath(); g.moveTo(ax, ay); g.lineTo(px, py); g.stroke(); g.globalAlpha = 1;
  if (f.typ == 'fogo') {
    g.fillStyle = col; g.beginPath(); g.arc(px, py, 5, 0, 7); g.fill(); g.fillStyle = '#fff6c8'; g.beginPath(); g.arc(px, py, 2.2, 0, 7); g.fill();
    for (let i = 0; i < 3; i++) { g.globalAlpha = .5; g.fillStyle = i % 2 ? '#ffcf5a' : col; g.beginPath(); g.arc(px - Math.cos(ang) * i * 4, py - Math.sin(ang) * i * 4, 3 - i * .7, 0, 7); g.fill() } g.globalAlpha = 1
  }
  else if (f.typ == 'gelo') {
    g.save(); g.translate(px, py); g.rotate(ang); g.fillStyle = col; g.beginPath(); g.moveTo(9, 0); g.lineTo(-4, -4); g.lineTo(-1, 0); g.lineTo(-4, 4); g.closePath(); g.fill();
    g.strokeStyle = '#ffffffa0'; g.lineWidth = .6; g.beginPath(); g.moveTo(9, 0); g.lineTo(-1, 0); g.stroke(); g.restore()
  }
  else if (f.typ == 'magico') {
    g.save(); g.translate(px, py); g.rotate(p * 9); g.strokeStyle = col; g.lineWidth = 1.2; g.beginPath(); g.arc(0, 0, 6, 0, 7); g.stroke();
    for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(Math.cos(k * 1.571) * 6, Math.sin(k * 1.571) * 6); g.lineTo(Math.cos(k * 1.571) * 9, Math.sin(k * 1.571) * 9); g.stroke() }
    g.fillStyle = col; g.beginPath(); g.arc(0, 0, 3, 0, 7); g.fill(); g.restore()
  }
  else if (f.wpn == 'Ninja') {
    g.save(); g.translate(px, py); g.rotate(p * 20); g.fillStyle = '#cfd3da';
    for (let k = 0; k < 4; k++) { g.save(); g.rotate(k * 1.5708); g.beginPath(); g.moveTo(0, 0); g.lineTo(7, -2.2); g.lineTo(9, 0); g.lineTo(7, 2.2); g.closePath(); g.fill(); g.restore() }
    g.fillStyle = '#333'; g.beginPath(); g.arc(0, 0, 2, 0, 7); g.fill(); g.restore()
  }
  else if (f.wpn == 'Espadachim') {
    g.save(); g.translate(px, py); g.rotate(ang); g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 10, -1.1, 1.1); g.stroke();
    g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.beginPath(); g.arc(0, 0, 10, -1.1, 1.1); g.stroke(); g.restore()
  }
  else { g.fillStyle = col; g.globalAlpha = .85; g.beginPath(); g.arc(px, py, (f.w || 3) + 2, 0, 7); g.fill(); g.globalAlpha = 1; g.strokeStyle = '#fff'; g.lineWidth = 1; g.beginPath(); g.arc(px, py, (f.w || 3) + 2, 0, 7); g.stroke() }
}
const ARENA_TR = [[1, 1], [W - 2, 1], [1, H - 2], [W - 2, H - 2]];
const ARENA_PIL = [[0, 0], [0, H - 2], [W - 1, 0], [W - 1, H - 2], [(W / 2 | 0) - 6, 0], [(W / 2 | 0) + 5, 0]];
function drawArenaFloor() {
  for (let j = 0; j < H; j++)for (let i = 0; i < W; i++) {
    const wall = i == 0 || j == 0 || i == W - 1 || j == H - 1, lavaEdge = j >= H - 2;
    g.fillStyle = wall ? ((i + j) % 2 ? '#17100f' : '#120d0c') : ((i + j) % 2 ? '#2a211c' : '#302520'); g.fillRect(i * T, j * T, T, T);
    if (wall) { g.fillStyle = '#00000055'; g.fillRect(i * T, j * T, T, 3) }
    else if (lavaEdge && (i % 3 == 0)) { g.fillStyle = '#ff6a1a'; g.globalAlpha = .55 + Math.sin(Date.now() / 260 + i) * .25; g.fillRect(i * T + 3, j * T + T - 5, T - 6, 3); g.globalAlpha = 1 }
    else if ((i * 7 + j * 13) % 7 == 0) { g.fillStyle = '#00000040'; g.fillRect(i * T + 6, j * T + 12, 12, 3) }
  }
  ARENA_PIL.forEach(([i, j]) => { g.fillStyle = '#0c0a09'; g.fillRect(i * T + 8, j * T, 16, H * T); g.fillStyle = '#1c1512'; g.fillRect(i * T + 10, j * T, 4, H * T) });
  const vg = g.createRadialGradient(W * T / 2, H * T * .35, 20, W * T / 2, H * T * .6, W * T * .75);
  vg.addColorStop(0, 'rgba(10,4,4,0)'); vg.addColorStop(1, 'rgba(120,10,10,.5)'); g.fillStyle = vg; g.fillRect(0, 0, W * T, H * T);
  g.fillStyle = 'rgba(4,2,3,.4)'; g.fillRect(0, 0, W * T, H * T);
  torches(ARENA_TR); glows(ARENA_TR)
}
function draw() {
  if (state == 'leisure') { drawLeisure(); return } if (state == 'world') { drawWorld(); return } g.clearRect(0, 0, cv.width, cv.height); g.save();
  if (shakeT > 0) { const amp = shakeT * .22; g.translate(Math.sin(shakeT * 2.1) * amp, Math.cos(shakeT * 1.7) * amp * .6) }
  if (zoomT > 0) { const z = 1 + zoomT * .006, px = zoomPt ? zoomPt.x : 336, py = zoomPt ? zoomPt.y : 240; g.translate(px, py); g.scale(z, z); g.translate(-px, -py) }
  drawArenaFloor();
  fx.forEach(f => { if (f.num || f.ring) return; drawBeam(f) });
  ents.forEach(drawChar);
  drawParts(); g.restore(); g.fillStyle = '#120f0b'; g.fillRect(0, H * T, cv.width, 60);
  if (ents[0]) { g.textAlign = 'left'; g.font = '12px sans-serif'; ents[0].sk.forEach((s, i) => { const x = 6 + (i % 3) * 222, y = H * T + 12 + (i / 3 | 0) * 26; g.fillStyle = TC[s.t] || '#e8dcc0'; g.fillText(s.n, x, y); g.fillStyle = '#333'; g.fillRect(x, y + 4, 210, 6); g.fillStyle = TC[s.t] || '#48c'; g.fillRect(x, y + 4, 210 * (1 - s.cdl / s.cd), 6) }) }
  if (banner && banner.t > 0) { g.globalAlpha = Math.min(1, banner.t / 20); g.font = 'bold 24px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(banner.text, cv.width / 2 + 2, 68); g.fillStyle = banner.col; g.fillText(banner.text, cv.width / 2, 66); g.globalAlpha = 1 }
  if (msg) { g.fillStyle = '#000a'; g.fillRect(0, 200, cv.width, 70); g.fillStyle = '#ffd'; g.font = '28px sans-serif'; g.textAlign = 'center'; g.fillText(msg, cv.width / 2, 246) }
}
// ---- Cérebro Ollama (opcional): consultado só em momentos-chave ----
const AI = { on: false, url: 'http://localhost:11434', q: Promise.resolve() };
const modelo = () => document.getElementById('mod').value.trim() || 'llama3.2';
const dicaIA = 'Se for erro de rede/CORS: defina OLLAMA_ORIGINS=* e reinicie o Ollama, ou abra o jogo por http://localhost (ex.: python -m http.server).';
async function testIA() {
  try {
    const r = await fetch(AI.url + '/api/tags'), j = await r.json(), n = j.models.map(m => m.name);
    log('Ollama conectado. Modelos instalados: ' + (n.join(', ') || 'nenhum (rode: ollama pull llama3.2)'));
    if (!n.some(x => x.startsWith(modelo()))) log(`Atenção: modelo "${modelo()}" não encontrado. Ajuste o nome no campo ao lado.`)
  }
  catch (e) { AI.on = false; document.getElementById('ia').checked = false; log('Não consegui falar com o Ollama (' + e.message + '). ' + dicaIA) }
}
const askAI = (e, r) => { if (AI.on) AI.q = AI.q.then(() => think(e, r)) };
async function think(e, motivo) {
  if (!AI.on) return; const c = e.c, ac = new AbortController(), to = setTimeout(() => ac.abort(), 90000);
  const p = `Você é ${c.name}, um agente autônomo de RPG 2D que caça monstros numa cidade. Nível ${c.level}, vida máxima ${e.max}, mortes até agora: ${c.deaths || 0}, andar atual: ${e.fl || 'cidade'}. Motivo desta decisão: ${motivo}. Habilidades: ${c.sk.map(s => `${s.n} (${s.t}, dano ${s.dmg}${s.h > 1 ? '×' + s.h : ''}, recarga ${s.cd}, alcance ${s.range})`).join('; ')}. Monstros: Rato, Morcego, Esqueleto, Orc, Fantasma, Troll, Demônio (mais fortes a cada andar; cada andar tem um chefe). Fantasma quase imune a dano físico; Esqueleto fraco a fogo e mágico; Demônio resiste a fogo. Se morreu, aprenda com a causa da morte e ajuste a estratégia. Estratégia atual: ${JSON.stringify(c.strat)}. Decida sua estratégia. Responda APENAS com JSON: {"rest":número de 0.2 a 0.7 (fração de vida para voltar ao templo),"alvo":"nome de um monstro"|"qualquer","dist":número de 1 a 5 (distância preferida do inimigo),"foco":"alcance"|"corpo"|"equilibrado"|"fisico"|"magico"|"fogo"|"gelo"|"raio"|"ki" (o que evoluir no treino: alcance, corpo a corpo ou um tipo de dano),"fala":"frase curta em português, até 50 letras"}`;
  try {
    const r = await fetch(AI.url + '/api/chat', { method: 'POST', signal: ac.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelo(), stream: false, format: 'json', messages: [{ role: 'user', content: p }] }) });
    const j = JSON.parse((await r.json()).message.content), alvos = ['Rato', 'Morcego', 'Esqueleto', 'Orc', 'Fantasma', 'Troll', 'Demônio', 'qualquer'], focos = ['alcance', 'corpo', 'equilibrado', 'fisico', 'magico', 'fogo', 'gelo', 'raio', 'ki'];
    c.strat = { rest: clamp(+j.rest || .4, .2, .7), alvo: alvos.includes(j.alvo) ? j.alvo : 'qualquer', dist: clamp(Math.round(+j.dist) || 0, 0, 5) };
    c.focus = focos.includes(j.foco) ? j.foco : 'equilibrado'; c.say = String(j.fala || '').slice(0, 50); c.sayT = 420; save();
    log(`${c.name} (IA): "${c.say}" | vida p/ recuar ${Math.round(c.strat.rest * 100)}%, alvo ${c.strat.alvo}, distância ${c.strat.dist || 'auto'}, foco ${c.focus}`)
  }
  catch (err) { log(`IA falhou para ${c.name} (${err.message}). Mantendo a estratégia atual. ${dicaIA}`) } finally { clearTimeout(to) }
}
// ---- Local de lazer: os agentes passeiam, fazem atividades e conversam (loop social) ----
const CHAT_LINES = ['Que dia tranquilo por aqui.', 'Preciso treinar mais amanhã.', 'Alguém quer jogar?', 'Essa comida cheira muito bem.', 'Bom descansar um pouco.', 'A próxima caçada vai ser longa.', 'Gosto desse lugar.', 'Vamos conversar um pouco?'];
async function chatAI(e, near) {
  const c = e.c;
  if (!AI.on) { c.say = CHAT_LINES[Math.random() * CHAT_LINES.length | 0]; c.sayT = 260; return }
  const ac = new AbortController(), to = setTimeout(() => ac.abort(), 20000);
  const p = `Você é ${c.name}, nível ${c.level}, personagem de RPG 2D descansando num local de lazer entre caçadas${near ? `, perto de ${near.c.name}` : ''}. Diga uma frase curta e casual em português (até 45 letras) sobre descansar, comida, treino, amizade ou o dia — nada de combate. Responda APENAS com a frase, sem aspas.`;
  try {
    const r = await fetch(AI.url + '/api/chat', { method: 'POST', signal: ac.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelo(), stream: false, messages: [{ role: 'user', content: p }] }) });
    const t = (await r.json()).message.content.trim().replace(/^"|"$/g, '').slice(0, 50); c.say = t || CHAT_LINES[0]; c.sayT = 260
  }
  catch (err) { c.say = CHAT_LINES[Math.random() * CHAT_LINES.length | 0]; c.sayT = 260 } finally { clearTimeout(to) }
}
const askChat = (e, near) => { AI.q = AI.q.then(() => chatAI(e, near)) };
const LW = 20, LH = 13, LSPOTS = [{ x: 4, y: 3, act: '📖' }, { x: 16, y: 3, act: '💻' }, { x: 4, y: 9, act: '🎮' }, { x: 16, y: 9, act: '🎱' }, { x: 10, y: 6, act: '🛋️' }, { x: 10, y: 10, act: '🍕' }];
let lents = [];
function startLeisure() {
  state = 'leisure'; auto = false; msg = ''; fx = [];
  lents = chars.map((c, i) => ({ c, ci: i, x: 6 + i * 2, y: 6, f: 1, dest: null, wait: 20 + i * 15, act: null }));
  log('\nLocal de lazer aberto: os agentes passeiam, jogam e conversam entre si.')
}
function leisureTick() {
  lents.forEach(e => {
    const c = e.c; if (c.sayT > 0) c.sayT--; e.act = null;
    if (e.wait > 0) { e.wait--; if (e.wait < 20) e.act = e._act; return }
    if (!e.dest) { e.dest = LSPOTS[Math.random() * LSPOTS.length | 0]; return }
    if (e.x === e.dest.x && e.y === e.dest.y) {
      e._act = e.dest.act; e.act = e.dest.act; e.wait = 60 + Math.random() * 180 | 0; e.dest = null;
      if (c.sayT <= 0 && Math.random() < .5) { const near = lents.find(o => o !== e && Math.abs(o.x - e.x) + Math.abs(o.y - e.y) <= 3); askChat(e, near) }
      return
    }
    const dx = Math.sign(e.dest.x - e.x), dy = Math.sign(e.dest.y - e.y), occ = (x, y) => lents.some(o => o !== e && o.x === x && o.y === y);
    if (dx && !occ(e.x + dx, e.y)) { e.x += dx; e.f = dx } else if (dy && !occ(e.x, e.y + dy)) e.y += dy; else e.wait = 20
  })
}
function drawLeisure() {
  g.fillStyle = '#4a3524'; g.fillRect(0, 0, LW * T, LH * T);
  for (let j = 0; j < LH; j++)for (let i = 0; i < LW; i++) { g.fillStyle = (i + j) % 2 == 0 ? '#5a4230' : '#543d2b'; g.fillRect(i * T, j * T, T, T) }
  g.strokeStyle = '#00000022'; g.lineWidth = 1; for (let i = 0; i < LW; i++) { g.beginPath(); g.moveTo(i * T, 0); g.lineTo(i * T, LH * T); g.stroke() }
  g.fillStyle = '#2a1f16'; g.fillRect(0, 0, LW * T, T * .4); g.fillRect(0, LH * T - T * .4, LW * T, T * .4); g.fillRect(0, 0, T * .4, LH * T); g.fillRect(LW * T - T * .4, 0, T * .4, LH * T);
  g.fillStyle = '#6b3a3a'; g.beginPath(); g.ellipse(10 * T + 16, 7 * T + 16, 5.6 * T, 3.6 * T, 0, 0, 7); g.fill(); g.strokeStyle = '#4a2626'; g.lineWidth = 4; g.stroke();
  g.fillStyle = '#1a1a1e'; g.fillRect(15 * T + 6, 2 * T + 6, 2.4 * T, 1.7 * T); g.fillStyle = '#4a90e2'; g.fillRect(15 * T + 14, 2 * T + 14, 2.4 * T - 16, 1.7 * T - 16);
  g.fillStyle = '#2a2a30'; g.fillRect(15 * T + 2, 3 * T + 23, 2.8 * T, 6);
  g.fillStyle = '#3a2a1a'; g.fillRect(3 * T, 2 * T + 4, 2.6 * T, 2.4 * T); for (let r = 0; r < 3; r++) {
    g.fillStyle = '#1a120a'; g.fillRect(3 * T + 4, 2 * T + 10 + r * 18, 2.6 * T - 8, 3);
    for (let b = 0; b < 5; b++) { g.fillStyle = ['#8a3a3a', '#3a6a8a', '#6a8a3a', '#8a6a3a', '#5a3a8a'][b]; g.fillRect(3 * T + 6 + b * 14, 2 * T + 13 + r * 18, 10, 13) }
  }
  g.fillStyle = '#2e2e36'; g.fillRect(14.5 * T, 8 * T + 6, 3.3 * T, 2.2 * T); g.strokeStyle = '#1a1a20'; g.lineWidth = 3; g.strokeRect(14.5 * T, 8 * T + 6, 3.3 * T, 2.2 * T);
  g.fillStyle = '#4a7a3a'; g.fillRect(14.5 * T + 8, 8 * T + 14, 3.3 * T - 16, 2.2 * T - 16);
  g.fillStyle = '#5a3a2a'; g.fillRect(8.5 * T, 5 * T + 10, 3 * T, 1.6 * T); g.fillStyle = '#3a2418'; g.fillRect(8.5 * T, 5 * T + 6, 3 * T, 6);
  LSPOTS.forEach(s => { g.font = '16px sans-serif'; g.textAlign = 'center'; g.fillText(s.act, s.x * T + 16, s.y * T + 22) });
  lents.forEach(drawChar);
  lents.forEach(e => { if (e.act) { g.font = '14px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#fffb'; g.beginPath(); g.arc(e.x * T + 16, e.y * T - 2, 9, 0, 7); g.fill(); g.fillText(e.act, e.x * T + 16, e.y * T + 3) } });
  g.fillStyle = '#120f0b'; g.fillRect(0, LH * T, cv.width, 540 - LH * T); g.font = '12px sans-serif'; g.fillStyle = '#e8dcc0'; g.textAlign = 'left';
  g.fillText('Local de lazer — os agentes passeiam, jogam e conversam. Clique para trocar quem seguir.', 8, LH * T + 20);
  const F = lents[cam % lents.length]; if (F) { g.fillStyle = '#aaa'; g.fillText(`Seguindo ${F.c.name}`, 8, LH * T + 38) }
}
const CW = 48, CH = 34, DW = 44, DH = 30, VW = 21, VH = 15;
let mons = [], wents = [], wt = 0, cam = 0, maps = {};
const rand = a => () => (a = (a * 16807) % 2147483647) / 2147483647;
const blds = [[3, 3, 6, 5, 'loja', 'Armaria Sombria', '#5a3040'], [10, 3, 4, 4, 'casa', '', '#3d3a50'], [15, 3, 4, 4, 'casa', '', '#4a3a2a'], [4, 9, 4, 4, 'casa', '', '#3a4a45'], [10, 9, 5, 4, 'casa', '', '#5a3040'], [16, 9, 4, 4, 'casa', '', '#3d3a50'],
[28, 3, 8, 5, 'loja', 'Mercado Negro', '#2f4a3a'], [37, 3, 4, 4, 'casa', '', '#4a3a2a'], [42, 3, 3, 4, 'casa', '', '#3d3a50'], [28, 9, 4, 4, 'casa', '', '#5a3040'], [33, 8, 7, 5, 'templo', 'Templo Sombrio', '#3a3f5a'], [41, 9, 4, 4, 'casa', '', '#4a3a2a'],
[3, 20, 7, 5, 'loja', 'Taverna do Corvo', '#5a4a2a'], [11, 20, 4, 4, 'casa', '', '#3d3a50'], [16, 20, 4, 4, 'casa', '', '#5a3040'], [4, 27, 4, 4, 'casa', '', '#4a3a2a'], [9, 27, 5, 4, 'casa', '', '#3a4a45'], [15, 27, 4, 4, 'casa', '', '#3d3a50'],
[28, 20, 4, 4, 'casa', '', '#4a3a2a'], [33, 20, 4, 4, 'casa', '', '#5a3040'], [38, 20, 4, 4, 'casa', '', '#3d3a50'], [43, 20, 3, 4, 'casa', '', '#3a4a45'], [30, 25, 15, 6, 'arena', 'Anfiteatro Mortis', '#4a463c']];
const L = { Armaria: [5, 8], Mercado: [31, 8], Taverna: [6, 25], Templo: [36, 13], gate: [37, 24] };
const torchC = [[5, 8], [31, 8], [6, 25], [36, 13], [36, 24], [38, 24], [22, 14], [25, 14], [22, 18], [25, 18], [2, 16], [45, 16], [12, 14], [34, 14]];
const TINT = ['#2b2622', '#232b25', '#2e2226', '#222534', '#2a2a1f', '#2a2032', '#301d1a'];
const KD = [['Rato', 30, 3, 8, 50, 20, '#8a8478'], ['Morcego', 24, 4, 10, 40, 12, '#6a3a8a'], ['Esqueleto', 55, 6, 16, 55, 24, '#e6e0c8'], ['Orc', 90, 9, 26, 60, 22, '#5a8a3a'], ['Fantasma', 70, 11, 34, 50, 18, '#a8d8f0'], ['Troll', 170, 15, 50, 80, 26, '#6a7a8a'], ['Demônio', 130, 20, 70, 55, 16, '#b83a2a']];
const BN = ['Rei dos Ratos', 'Senhor Orc', 'Lorde Ossudo', 'Devorador de Almas', 'Rei Troll', 'Arquidemônio', 'Dragão Ancestral'], BK = [0, 3, 2, 4, 5, 6, 6];
function cityMap() {
  const solid = Array.from({ length: CH }, () => Array(CW).fill(false));
  for (let j = 0; j < CH; j++)for (let i = 0; i < CW; i++)if (i == 0 || j == 0 || i == CW - 1 || j == CH - 1) solid[j][i] = true;
  blds.forEach(([x, y, w, h]) => { for (let j = y; j < y + h; j++)for (let i = x; i < x + w; i++)solid[j][i] = true }); return { W: CW, H: CH, solid, city: true, tr: torchC }
}
function dunMap(n) {
  const r = rand(n * 9973 + 11), solid = Array.from({ length: DH }, () => Array(DW).fill(true)), rooms = [];
  const carve = (x, y, w, h) => { for (let j = y; j < y + h; j++)for (let i = x; i < x + w; i++)if (i > 0 && j > 0 && i < DW - 1 && j < DH - 1) solid[j][i] = false };
  for (let t = 0; t < 80 && rooms.length < 9; t++) {
    const w = 5 + r() * 6 | 0, h = 4 + r() * 5 | 0, x = 2 + r() * (DW - w - 4) | 0, y = 2 + r() * (DH - h - 4) | 0;
    if (rooms.some(o => x < o.x + o.w + 2 && x + w + 2 > o.x && y < o.y + o.h + 2 && y + h + 2 > o.y)) continue; carve(x, y, w, h); rooms.push({ x, y, w, h, cx: x + w / 2 | 0, cy: y + h / 2 | 0 })
  }
  for (let i = 1; i < rooms.length; i++) { const a = rooms[i - 1], b = rooms[i], x1 = Math.min(a.cx, b.cx), x2 = Math.max(a.cx, b.cx), y1 = Math.min(a.cy, b.cy), y2 = Math.max(a.cy, b.cy); carve(x1, a.cy, x2 - x1 + 2, 2); carve(b.cx, y1, 2, y2 - y1 + 2) }
  const f = rooms[0], d = o => Math.abs(o.cx - f.cx) + Math.abs(o.cy - f.cy), last = rooms.reduce((a, b) => d(b) > d(a) ? b : a), tr = [];
  for (let j = 0; j < DH - 1; j++)for (let i = 0; i < DW; i++)if (solid[j][i] && !solid[j + 1][i] && r() < .07) tr.push([i, j]);
  return { W: DW, H: DH, solid, n, cleared: false, tr, entry: { x: f.cx, y: f.cy }, boss: { x: last.cx, y: last.cy }, stairs: { x: last.cx + 2, y: last.cy } }
}
function getMap(n) { if (!maps[n]) { maps[n] = n ? dunMap(n) : cityMap(); if (n) { const b = maps[n].boss; mons.push(mkMon(BK[(n - 1) % 7], n, b.x - 1, b.y, true)) } } return maps[n] }
function mkMon(k, f, x, y, boss) {
  const [n, hp, dmg, xp, cd, sp, col] = KD[k], sh = 1 + .5 * (f - 1), sd2 = 1 + .3 * (f - 1), sx = 1 + .25 * (f - 1), h = Math.round(hp * 3 * sh * (boss ? 6 : 1));
  return { n: boss ? BN[(f - 1) % 7] : n, k, fl: f, res: RS[k], hp: h, max: h, dmg: Math.round(dmg * sd2 * (boss ? 1.6 : 1)), xp: Math.round(xp * sx * (boss ? 8 : 1)), cd: boss ? cd * .9 | 0 : cd, sp, col, cdl: 0, mcd: 0, x, y, boss: !!boss, sl: 200 }
}
const occ = (f, x, y) => wents.some(e => e.fl == f && e.x == x && e.y == y && e.hp > 0) || mons.some(m => m.fl == f && m.x == x && m.y == y && m.hp > 0);
function bfs(mp, sx, sy, tx, ty) {
  const W2 = mp.W, st = sy * W2 + sx, prev = new Int16Array(W2 * mp.H).fill(-2), q = [st], D = [[1, 0], [-1, 0], [0, 1], [0, -1]]; prev[st] = -1;
  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi], cx = cur % W2, cy = cur / W2 | 0; if (cx == tx && cy == ty) break;
    for (const [dx, dy] of D) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= W2 || ny >= mp.H) continue; const n = ny * W2 + nx; if (prev[n] != -2) continue; if (mp.solid[ny][nx] && !(nx == tx && ny == ty)) continue; prev[n] = cur; q.push(n) }
  }
  let p = ty * W2 + tx; if (p == st || prev[p] == -2) return null; while (prev[p] != st) p = prev[p]; return { dx: p % W2 - sx, dy: (p / W2 | 0) - sy }
}
function spawnNear(e) {
  const f = e.fl, mp = getMap(f); if (mons.filter(m => m.fl == f && m.hp > 0 && !m.boss).length >= 10) return;
  for (let a = 0; a < 20; a++) {
    const an = Math.random() * 6.283, d = 5 + Math.random() * 4, x = Math.round(e.x + Math.cos(an) * d), y = Math.round(e.y + Math.sin(an) * d);
    if (x < 1 || y < 1 || x >= mp.W - 1 || y >= mp.H - 1 || mp.solid[y][x] || occ(f, x, y)) continue; mons.push(mkMon(Math.min(6, Math.random() * (f + 2) | 0), f, x, y, false)); return
  }
}
function wmove(e, dx, dy) {
  const mp = getMap(e.fl), nx = e.x + dx, ny = e.y + dy; if (nx < 0 || ny < 0 || nx >= mp.W || ny >= mp.H || mp.solid[ny][nx] || occ(e.fl, nx, ny)) return false;
  e.x = nx; e.y = ny; e.mcd = 10; if (dx) e.f = dx; if (e.fl > 0 && Math.random() < .05) spawnNear(e); return true
}
function go(e, tx, ty) { const s = bfs(getMap(e.fl), e.x, e.y, tx, ty); if (!s) return; if (!wmove(e, s.dx, s.dy)) { const A = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => Math.random() - .5); for (const [dx, dy] of A) if (wmove(e, dx, dy)) break } }
function randOpen(mp) { for (let a = 0; a < 80; a++) { const x = 1 + Math.random() * (mp.W - 2) | 0, y = 1 + Math.random() * (mp.H - 2) | 0; if (!mp.solid[y][x]) return { x, y } } return mp.entry }
function startWorld() {
  auto = false; state = 'world'; msg = ''; fx = []; mons = []; maps = {}; wt = 0; cam = 0;
  wents = chars.map((c, i) => { const mx = 200 + 20 * (c.level - 1); return { c, ci: i, fl: 0, x: [23, 24, 23, 24][i], y: [16, 16, 17, 17][i], hp: mx, max: mx, sk: c.sk.map(s => ({ ...s, cdl: 0 })), mcd: 0, f: 1, rest: false, wait: 0, dest: null, tour: ['Armaria', 'Mercado', 'Taverna'].sort(() => Math.random() - .5).slice(0, 2).concat('gate') } });
  wents.forEach(e => askAI(e, 'início da jornada')); log('\nCidade medieval aberta. Clique no mapa para seguir outro personagem.')
}
function gain(e, m) {
  const c = e.c; c.xp += m.xp; c.gold = (c.gold || 0) + Math.round(m.xp * .4) + (m.boss ? 30 : 0);
  while (c.xp >= c.level * 60) { c.xp -= c.level * 60; c.level++; e.max = 200 + 20 * (c.level - 1); e.hp = e.max; log(`Nível ${c.level}: ${c.name}!`); train(e.ci); e.sk = c.sk.map(s => ({ ...s, cdl: 0 })); askAI(e, 'subiu de nível') } save()
}
function die(e) {
  const c = e.c, f = e.fl; c.deaths++; c.fear = Math.min(6, c.fear + 1); c.strat.rest = Math.min(.7, Math.max(c.strat.rest, .3 + .06 * c.fear));
  log(`${c.name} morreu no andar ${f} (${e.by || '?'}). Aprendeu: recua com ${Math.round(c.strat.rest * 100)}% de vida e só enfrenta o chefe no nível ${2 * f - 1 + c.fear}.`);
  c.xp = Math.floor(c.xp * .9); train(e.ci); e.sk = c.sk.map(s => ({ ...s, cdl: 0 })); e.hp = e.max * .3; e.fl = 0; e.x = 36; e.y = 14; e.tour = ['gate']; e.wait = 0; e.rest = false; e.dest = null;
  e.fin = null; e.swing = 0; e.swingSkill = null; e.finvx = 0; e.kx = 0; e.ky = 0; e.kt = 0; e.hitT = 0; askAI(e, `morreu no andar ${f} para ${e.by || 'um monstro'}`)
}
function agent(e) {
  const c = e.c, f = e.fl, mp = getMap(f); if (c.sayT > 0) c.sayT--; e.sk.forEach(s => s.cdl > 0 && s.cdl--); e.mcd > 0 && e.mcd--; e.gcd > 0 && e.gcd--;
  if (e.fin) { advanceFinisher(e); if (e.hp <= 0) { e.fin = null; die(e) } return }
  e.swing > 0 && e.swing--;
  if (e.hp <= 0) { die(e); return }
  if (f == 0) {
    if (e.hp < e.max) { const [tx, ty] = L.Templo; if (dist(e, { x: tx, y: ty }) <= 1) e.hp = Math.min(e.max, e.hp + 1); else if (e.mcd == 0) go(e, tx, ty); return }
    if (e.wait > 0) { e.wait--; return } const nm = e.tour[0] || 'gate', [tx, ty] = L[nm];
    if (dist(e, { x: tx, y: ty }) <= 1) { if (nm == 'gate') { e.fl = c.best; const m2 = getMap(e.fl); e.x = m2.entry.x; e.y = m2.entry.y; e.tour = []; e.dest = null; log(`${c.name} entrou no andar ${e.fl}.`) } else { e.tour.shift(); e.wait = 90 } }
    else if (e.mcd == 0) go(e, tx, ty); return
  }
  let m = null, bs = 99; mons.forEach(o => { if (o.fl != f || o.hp <= 0) return; const d = dist(e, o) + (c.strat.alvo != 'qualquer' && o.n != c.strat.alvo && !o.boss ? 8 : 0); if (d < bs) { bs = d; m = o } }); const bd = m ? dist(e, m) : 99;
  if (m && bd <= 7) {
    const rdy = pick(e, m, bd);
    if (rdy) { cast(e, m, rdy); for (const o of mons.filter(q => q.fl == f && q.hp <= 0 && !q.dead)) { o.dead = 1; gain(e, o); if (o.boss) { mp.cleared = true; c.fear = Math.max(0, c.fear - 1); log(`${c.name} derrotou o chefe ${o.n} (andar ${f})!`) } } }
    const maxR = Math.max(...e.sk.map(s => s.range)), esp = c.sk.find(s => s.esp), want = (esp && esp.cdl == 0) ? Math.min(esp.range, maxR) : (c.strat.dist ? Math.min(c.strat.dist, maxR) : (c.pref || 1)); if (bd > want && e.mcd == 0) go(e, m.x, m.y); return
  }
  if (e.hp < e.max * c.strat.rest) e.rest = true; if (e.rest) { e.hp += .3; if (e.hp >= e.max * .95) e.rest = false; return }
  if (e.mcd > 0) return; const bossAlive = mons.some(o => o.fl == f && o.boss && o.hp > 0);
  if (!mp.cleared && bossAlive && c.level >= 2 * f - 1 + c.fear) { go(e, mp.boss.x, mp.boss.y); return }
  if (mp.cleared && c.level >= 2 * f + 1 + c.fear) { const s = mp.stairs; if (dist(e, s) <= 0) { e.fl = f + 1; c.best = Math.max(c.best, e.fl); const m2 = getMap(e.fl); e.x = m2.entry.x; e.y = m2.entry.y; e.dest = null; log(`${c.name} desceu para o andar ${e.fl}.`) } else go(e, s.x, s.y); return }
  if (!e.dest || dist(e, e.dest) <= 1) e.dest = randOpen(mp); go(e, e.dest.x, e.dest.y)
}
function monAI(m) {
  m.cdl > 0 && m.cdl--; m.mcd > 0 && m.mcd--; m.sl > 0 && m.sl--; let t = null, bd = 99;
  wents.forEach(e => { if (e.fl != m.fl || e.hp <= 0) return; const d = dist(m, e); if (d < bd) { bd = d; t = e } }); if (!t) return;
  if (m.boss && m.sl == 0 && bd <= 3) { m.sl = 240; wents.forEach(e => { if (e.fl == m.fl && e.hp > 0 && dist(m, e) <= 2) { e.hp -= Math.round(m.dmg * 1.2); e.by = m.n } }); fx.push({ a: m, b: m, t: 20, r: 9, ring: 1 }); return }
  if (bd <= 1) { if (m.cdl == 0) { t.hp -= Math.round(m.dmg * (.8 + Math.random() * .4)); t.by = m.n; m.cdl = m.cd; fx.push({ a: m, b: t, t: 8, r: 1 }) } }
  else if (bd <= 9 && m.mcd == 0) { const mp = getMap(m.fl), s = bfs(mp, m.x, m.y, t.x, t.y); if (s) { const nx = m.x + s.dx, ny = m.y + s.dy; if (!mp.solid[ny][nx] && !occ(m.fl, nx, ny)) { m.x = nx; m.y = ny; m.mcd = m.sp } } }
}
function wtick() { wt++; wents.forEach(decayHit); mons.forEach(decayHit); wents.forEach(agent); mons = mons.filter(m => m.hp > 0); mons.forEach(monAI); fx.forEach(f => f.t--); fx = fx.filter(f => f.t > 0) }
cv.onclick = () => { if (state == 'world' && wents.length) cam = (cam + 1) % wents.length; else if (state == 'leisure' && lents.length) cam = (cam + 1) % lents.length; renderSkills() };
// ---- desenho do mundo ----
function drawBld([bx, by, w, h, tp, lb, rc]) {
  const x = bx * T, y = by * T, W2 = w * T, H2 = h * T;
  if (tp == 'arena') {
    g.fillStyle = '#57534a'; g.beginPath(); g.roundRect(x, y, W2, H2, 26); g.fill(); g.strokeStyle = '#2c2a25'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#2e2620'; g.beginPath(); g.ellipse(x + W2 / 2, y + H2 / 2 + 6, W2 / 2 - 26, H2 / 2 - 22, 0, 0, 7); g.fill();
    g.fillStyle = '#8a8474'; for (let k = 0; k < 12; k++)g.fillRect(x + 16 + k * (W2 - 40) / 11, y + 4, 14, 6);
    g.fillStyle = '#e6e0c8'; for (let k = 0; k < 9; k++)g.fillRect(x + 70 + (k * 53) % (W2 - 140), y + 50 + (k * 29) % (H2 - 100), 6, 3);
    g.fillStyle = '#0a0808'; g.beginPath(); g.roundRect(37 * T + 2, y, T - 4, T + 6, [10, 10, 0, 0]); g.fill(); g.strokeStyle = '#777'; g.lineWidth = 1; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(37 * T + 7 + k * 6, y + 4); g.lineTo(37 * T + 7 + k * 6, y + T); g.stroke() }
  }
  else {
    g.fillStyle = '#3b2c1e'; g.fillRect(x, y, W2, H2); g.fillStyle = rc; g.fillRect(x + 2, y + 2, W2 - 4, H2 - T - 2); g.fillStyle = '#0004'; for (let k = y + 10; k < y + H2 - T; k += 8)g.fillRect(x + 2, k, W2 - 4, 1);
    g.fillStyle = '#0006'; g.fillRect(x + W2 / 2 - 1, y + 2, 2, H2 - T - 2); g.fillStyle = '#5b4632'; for (let k = 0; k <= w; k++)g.fillRect(x + k * T - 1, y + H2 - T, 3, T);
    for (let k = 0; k < w; k++) { const wx = x + k * T; if (k == (w / 2 | 0)) { g.fillStyle = '#1c120a'; g.fillRect(wx + 8, y + H2 - 22, 16, 22) } else { g.fillStyle = '#f2b84b'; g.fillRect(wx + 10, y + H2 - 24, 12, 10); g.fillStyle = '#000'; g.fillRect(wx + 15, y + H2 - 24, 2, 10) } }
    g.strokeStyle = '#1a120b'; g.lineWidth = 2; g.strokeRect(x, y, W2, H2)
  }
  if (lb) { g.font = 'bold 11px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(lb, x + W2 / 2 + 1, y - 4); g.fillStyle = '#8fd18f'; g.fillText(lb, x + W2 / 2, y - 5) }
}
function drawCity(mp, i0, j0, i1, j1) {
  g.lineWidth = 1;
  for (let j = j0; j <= j1; j++)for (let i = i0; i <= i1; i++) {
    const x = i * T, y = j * T, road = (j >= 15 && j <= 17) || (i >= 22 && i <= 25);
    g.fillStyle = road ? ((i + j) % 2 ? '#3b362f' : '#413b33') : ((i + j) % 2 ? '#4c463d' : '#544d43'); g.fillRect(x, y, T, T);
    if ((i * 7 + j * 13) % 5 == 0) { g.fillStyle = '#0003'; g.fillRect(x + 6, y + 8, 8, 5); g.fillRect(x + 18, y + 20, 7, 4) }
    if (i == 0 || j == 0 || i == CW - 1 || j == CH - 1) { g.fillStyle = '#6b665a'; g.fillRect(x, y, T, T); g.strokeStyle = '#3c382f'; g.strokeRect(x + .5, y + .5, T - 1, T - 1); g.fillStyle = '#8a8474'; g.fillRect(x + 2, y + 2, T - 4, 5) }
  }
  blds.forEach(drawBld)
}
function drawDun(mp, i0, j0, i1, j1) {
  const fc = TINT[(mp.n - 1) % 7]; g.lineWidth = 1;
  for (let j = j0; j <= j1; j++)for (let i = i0; i <= i1; i++) {
    const x = i * T, y = j * T;
    if (!mp.solid[j][i]) { g.fillStyle = fc; g.fillRect(x, y, T, T); g.fillStyle = (i + j) % 2 ? '#ffffff08' : '#00000014'; g.fillRect(x, y, T, T); g.fillStyle = '#0003'; g.fillRect(x, y + T - 1, T, 1); g.fillRect(x + T - 1, y, 1, T); if ((i * 5 + j * 11) % 7 == 0) { g.fillStyle = '#0004'; g.fillRect(x + 8, y + 10, 9, 5) } }
    else { const face = j + 1 < DH && !mp.solid[j + 1][i]; g.fillStyle = face ? '#5a5044' : '#12100e'; g.fillRect(x, y, T, T); if (face) { g.fillStyle = '#0005'; for (let k = 8; k < T; k += 8)g.fillRect(x, y + k, T, 1); g.fillRect(x + ((j % 2) ? 8 : 20), y, 1, T); g.fillStyle = '#ffffff18'; g.fillRect(x, y, T, 3) } }
  }
  g.fillStyle = '#a01e1e26'; g.beginPath(); g.ellipse(mp.boss.x * T + 16, mp.boss.y * T + 16, T * 3, T * 2.2, 0, 0, 7); g.fill();
  const s = mp.stairs, sx = s.x * T, sy = s.y * T; g.fillStyle = mp.cleared ? '#c8b070' : '#4a4038'; for (let k = 0; k < 4; k++)g.fillRect(sx + 3 + k * 2, sy + 3 + k * 7, 26 - k * 4, 5);
  if (!mp.cleared) { g.strokeStyle = '#a33'; g.lineWidth = 2; g.beginPath(); g.moveTo(sx + 4, sy + 4); g.lineTo(sx + 28, sy + 28); g.moveTo(sx + 28, sy + 4); g.lineTo(sx + 4, sy + 28); g.stroke() }
}
function torches(l) { const t = Date.now() / 90; l.forEach(([i, j], k) => { const x = i * T + 16, y = j * T + 18, q = 1 + Math.sin(t + k * 2) * .15; g.fillStyle = '#4a3020'; g.fillRect(x - 2, y, 4, 12); g.fillStyle = '#ffb02e'; g.beginPath(); g.ellipse(x, y - 2, 4 * q, 7 * q, 0, 0, 7); g.fill(); g.fillStyle = '#fff2a0'; g.beginPath(); g.ellipse(x, y, 2, 4, 0, 0, 7); g.fill() }) }
function glows(l) { g.globalCompositeOperation = 'lighter'; l.forEach(([i, j]) => { const x = i * T + 16, y = j * T + 14, gr = g.createRadialGradient(x, y, 2, x, y, 90); gr.addColorStop(0, 'rgba(255,150,50,.38)'); gr.addColorStop(1, 'rgba(255,150,50,0)'); g.fillStyle = gr; g.fillRect(x - 90, y - 90, 180, 180) }); g.globalCompositeOperation = 'source-over' }
function drawMon(m) {
  const x = m.x * T + 16 + (m.kx || 0), y = m.y * T + 30 + (m.ky || 0), s = m.boss ? 1.7 : 1, b = Math.sin(Date.now() / 200 + m.x * 3) * 1.5, c = m.col;
  g.fillStyle = '#0006'; g.beginPath(); g.ellipse(x, y, 11 * s, 3.5 * s, 0, 0, 7); g.fill();
  if (m.boss) { const gr = g.createRadialGradient(x, y - 20, 4, x, y - 20, 40); gr.addColorStop(0, 'rgba(255,40,40,.35)'); gr.addColorStop(1, 'rgba(255,40,40,0)'); g.fillStyle = gr; g.fillRect(x - 40, y - 60, 80, 80) }
  g.save(); g.translate(x, y + b); g.scale(s, s);
  switch (m.k) {
    case 0: g.strokeStyle = '#c88'; g.lineWidth = 2; g.beginPath(); g.moveTo(-9, -7); g.quadraticCurveTo(-18, -14, -14, -20); g.stroke(); rr(-9, -13, 18, 10, 5, c); rr(5, -14, 9, 8, 3, c); rr(6, -19, 4, 5, 2, '#c88'); rr(11, -11, 3, 3, 1, '#e99'); g.fillStyle = '#d22'; g.fillRect(9, -12, 2, 2); break;
    case 1: { g.translate(0, -6); const w = Math.sin(Date.now() / 70) * 6; tri(-3, -22, -20, -28 + w, -12, -12, '#4a2a66'); tri(3, -22, 20, -28 + w, 12, -12, '#4a2a66'); rr(-5, -24, 10, 12, 5, c); tri(-4, -24, -6, -30, -1, -25, c); tri(4, -24, 6, -30, 1, -25, c); g.fillStyle = '#ff4'; g.fillRect(-3, -20, 2, 2); g.fillRect(1, -20, 2, 2); g.fillStyle = '#fff'; g.fillRect(-2, -14, 1, 2); g.fillRect(1, -14, 1, 2); break }
    case 2: g.strokeStyle = '#d8d2ba'; g.lineWidth = 2; g.beginPath(); g.moveTo(-3, -6); g.lineTo(-3, 0); g.moveTo(3, -6); g.lineTo(3, 0); g.stroke(); rr(-6, -17, 12, 11, 3, c); g.fillStyle = '#0006'; for (let k = 0; k < 3; k++)g.fillRect(-5, -15 + k * 3, 10, 1); rr(-7, -29, 14, 12, 5, c); g.fillStyle = '#160a0a'; g.fillRect(-5, -25, 4, 4); g.fillRect(1, -25, 4, 4); g.fillStyle = '#f33'; g.fillRect(-4, -24, 2, 2); g.fillRect(2, -24, 2, 2); g.fillRect(-3, -19, 6, 2); g.strokeStyle = '#aab'; g.lineWidth = 2; g.beginPath(); g.moveTo(10, -8); g.lineTo(10, -26); g.stroke(); break;
    case 3: rr(-9, -17, 18, 14, 4, '#5a3a20'); rr(-10, -10, 20, 3, 1, '#2a1a10'); rr(-8, -29, 16, 13, 5, c); tri(-5, -17, -3, -17, -4, -21, '#eee'); tri(3, -17, 5, -17, 4, -21, '#eee'); g.fillStyle = '#ee3'; g.fillRect(-5, -24, 3, 3); g.fillRect(2, -24, 3, 3); g.strokeStyle = '#6b4a2a'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(12, -6); g.lineTo(12, -30); g.stroke(); tri(12, -30, 20, -28, 12, -22, '#9aa'); break;
    case 4: g.globalAlpha = .75; g.fillStyle = c; g.beginPath(); g.moveTo(-10, -2); g.lineTo(-10, -20); g.quadraticCurveTo(0, -38, 10, -20); g.lineTo(10, -2); g.lineTo(5, -6); g.lineTo(0, -1); g.lineTo(-5, -6); g.closePath(); g.fill(); g.strokeStyle = '#e8f6ff'; g.lineWidth = 1; g.stroke(); g.fillStyle = '#0a1a2a'; g.fillRect(-5, -22, 3, 5); g.fillRect(2, -22, 3, 5); g.fillRect(-2, -14, 4, 4); g.globalAlpha = 1; break;
    case 5: rr(-13, -21, 26, 19, 7, c); rr(-9, -33, 18, 13, 5, '#7f9070'); g.fillStyle = '#ee3'; g.fillRect(-5, -28, 3, 3); g.fillRect(2, -28, 3, 3); tri(-5, -22, -3, -22, -4, -26, '#eee'); tri(3, -22, 5, -22, 4, -26, '#eee'); rr(13, -32, 6, 22, 3, '#6b4a2a'); rr(11, -36, 10, 8, 4, '#5a3a20'); rr(-16, -19, 5, 10, 2, '#7f9070'); break;
    default: tri(-8, -20, -22, -30, -8, -8, '#7a1a1a'); tri(8, -20, 22, -30, 8, -8, '#7a1a1a'); rr(-8, -18, 16, 15, 4, c); rr(-7, -30, 14, 13, 5, '#c84a3a'); tri(-7, -28, -10, -38, -3, -30, '#eee'); tri(7, -28, 10, -38, 3, -30, '#eee'); g.fillStyle = '#ff0'; g.fillRect(-4, -25, 3, 3); g.fillRect(1, -25, 3, 3); g.strokeStyle = '#a22'; g.lineWidth = 2; g.beginPath(); g.moveTo(6, -6); g.quadraticCurveTo(16, -4, 14, -14); g.stroke()
  }
  if (m.boss) rr(-7, -40, 14, 5, 2, '#e6c229'); g.restore();
  const w = 26 * s, ty = y - 34 * s - 8; g.fillStyle = '#000'; g.fillRect(x - w / 2, ty, w, 4); g.fillStyle = m.boss ? '#e33' : '#c33'; g.fillRect(x - w / 2 + 1, ty + 1, (w - 2) * m.hp / m.max, 2);
  if (m.boss) { g.font = 'bold 11px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(m.n, x + 1, ty - 3); g.fillStyle = '#f66'; g.fillText(m.n, x, ty - 4) }
  if (m.hitT > 0 && m.hitT % 4 < 2) { g.globalAlpha = .5; g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, y - 16 * s, 20 * s, 26 * s, 0, 0, 7); g.fill(); g.globalAlpha = 1 }
}
function drawWorld() {
  const F = wents[cam], fl = F.fl, mp = getMap(fl);
  const x0 = Math.round(clamp(F.x * T + 16 - 336, 0, mp.W * T - 672)), y0 = Math.round(clamp(F.y * T + 16 - 240, 0, mp.H * T - 480));
  g.fillStyle = '#0b0908'; g.fillRect(0, 0, cv.width, cv.height); g.save(); g.beginPath(); g.rect(0, 0, 672, 480); g.clip();
  const amp = shakeT * .22, shx = shakeT > 0 ? Math.sin(shakeT * 2.1) * amp : 0, shy = shakeT > 0 ? Math.cos(shakeT * 1.7) * amp * .6 : 0; g.translate(-x0 + shx, -y0 + shy);
  if (zoomT > 0) { const z = 1 + zoomT * .006, px = zoomPt ? zoomPt.x : x0 + 336, py = zoomPt ? zoomPt.y : y0 + 240; g.translate(px, py); g.scale(z, z); g.translate(-px, -py) }
  const i0 = x0 / T | 0, j0 = y0 / T | 0, i1 = Math.min(mp.W - 1, i0 + VW + 1), j1 = Math.min(mp.H - 1, j0 + VH + 1);
  mp.city ? drawCity(mp, i0, j0, i1, j1) : drawDun(mp, i0, j0, i1, j1); torches(mp.tr);
  g.fillStyle = mp.city ? 'rgba(8,8,32,.34)' : 'rgba(4,2,6,.5)'; g.fillRect(x0, y0, 672, 480); glows(mp.tr);
  mons.forEach(m => { if (m.fl == fl) drawMon(m) }); wents.forEach(e => { if (e.fl == fl) drawChar(e) });
  fx.forEach(f => {
    if (f.a.fl !== fl) return; const px = f.a.x * T + 16, py = f.a.y * T + 16;
    if (f.num) { g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; const yy = py - 24 - (30 - f.t) * .8; g.fillStyle = '#000'; g.fillText(f.num, px + 1, yy + 1); g.fillStyle = f.col; g.fillText(f.num, px, yy); return }
    if (f.ring) { g.strokeStyle = f.col || '#f55'; g.lineWidth = 3; g.globalAlpha = Math.min(1, f.t / 8); g.beginPath(); g.arc(px, py, f.rad ? f.rad * (1.2 - f.t / f.t0 * .6) : (20 - f.t) * 5, 0, 7); g.stroke(); g.globalAlpha = 1; return }
    g.strokeStyle = f.col || '#fff'; g.lineWidth = (f.w || 2) * f.t / 14 + 1; drawBeam(f)
  });
  drawParts(); g.restore(); g.fillStyle = '#120f0b'; g.fillRect(0, 480, 672, 60); g.textAlign = 'left'; g.font = '11px sans-serif';
  wents.forEach((e, i) => {
    const c = e.c, x = 6 + i * 167, y = 480; if (i == cam) { g.strokeStyle = '#e6c229'; g.lineWidth = 1; g.strokeRect(x - 3, y + 2, 163, 56) }
    g.fillStyle = '#e8dcc0'; g.fillText(`${c.name} Nv${c.level} · ${e.fl ? 'Andar ' + e.fl : 'Cidade'}`, x, y + 14);
    g.fillStyle = '#333'; g.fillRect(x, y + 19, 150, 6); g.fillStyle = '#e6c229'; g.fillRect(x, y + 19, 150 * c.xp / (c.level * 60), 6);
    g.fillStyle = '#333'; g.fillRect(x, y + 29, 150, 6); g.fillStyle = '#3c3'; g.fillRect(x, y + 29, 150 * Math.max(0, e.hp) / e.max, 6);
    g.fillStyle = '#aaa'; g.fillText(`mortes ${c.deaths} · medo ${c.fear} · recorde ${c.best}`, x, y + 48)
  });
  g.fillStyle = '#000a'; g.fillRect(4, 4, 290, 18); g.fillStyle = '#fff'; g.fillText(`Seguindo ${F.c.name} — clique no mapa para trocar`, 10, 17);
  if (banner && banner.t > 0) { g.globalAlpha = Math.min(1, banner.t / 20); g.font = 'bold 24px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(banner.text, cv.width / 2 + 2, 68); g.fillStyle = banner.col; g.fillText(banner.text, cv.width / 2, 66); g.globalAlpha = 1 }
}
function renderSkills() {
  const ci = state == 'world' && wents[cam] ? wents[cam].ci : +sa.value, c = chars[ci];
  document.getElementById('skp').innerHTML = `<b>${c.name}</b> Nv${c.level} — tipos de dano: ` + Object.keys(TC).map(k => `<span style="color:${TC[k]}">■ ${k}</span>`).join(' ') + '<br>'
    + c.sk.map((s, i) => `<span style="color:${TC[s.t]}">■ ${i + 1}. ${s.n}</span>${s.esp ? ' <b style="color:#ffd76b">★ ESPECIAL (+60% dano)</b>' : ''} [${s.t}] dano ${s.dmg}${s.h > 1 ? '×' + s.h : ''}${s.a ? ' · área ' + s.a : ''} · recarga ${(s.cd / 60).toFixed(1)}s · alcance ${s.range} · evolução ${s.st || 0}/${s.ev ? s.ev.length : 0} (${s.use || 0} usos)`).join('<br>')
    + '<br><small>Fraquezas: Esqueleto (fogo, mágico) · Fantasma (quase imune a físico; fraco a mágico e ki) · Troll (fogo, gelo) · Demônio (resiste a fogo; fraco a gelo)</small>'
}
sa.onchange = renderSkills; setInterval(renderSkills, 800);
// ---- Gravação de vídeo do golpe especial (roda local no navegador, sem servidor) ----
function recordSpecial(ci) {
  if (!cv.captureStream || !window.MediaRecorder) { log('Este navegador não suporta gravar vídeo direto da tela. Tente no Chrome ou Firefox mais recentes.'); return }
  const c = chars[ci]; auto = false; state = 'fight'; msg = ''; fx = []; banner = null;
  const dummy = { c: { name: 'Alvo de Treino', level: 1, sk: [], xp: 0, sk_: 0 }, x: 10, y: 7, hp: 99999, max: 99999, sk: [], mcd: 0, gcd: 0, human: true, f: -1, swing: 0 };
  const atk = { c, x: 8, y: 7, hp: 99999, max: 99999, sk: c.sk.map(s => ({ ...s, cdl: 0 })), mcd: 0, gcd: 0, human: true, f: 1, swing: 0 };
  ents = [atk, dummy];
  let stream; try { stream = cv.captureStream(30) } catch (err) { log('Falha ao capturar a tela: ' + err.message); return }
  let rec; try { rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' }) } catch (err) { try { rec = new MediaRecorder(stream) } catch (e2) { log('Falha ao iniciar gravação: ' + e2.message); return } }
  const chunks = []; rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data) };
  rec.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `golpe-especial-${c.name}.webm`; a.textContent = `⬇ Baixar vídeo: golpe especial de ${c.name}`; a.style.cssText = 'display:block;color:#8fd18f;margin-top:6px;font:13px sans-serif';
    document.getElementById('vid').innerHTML = ''; document.getElementById('vid').appendChild(a); log(`Vídeo pronto: golpe especial de ${c.name}.`); state = 'idle'
  };
  rec.start(); log(`Gravando o golpe especial de ${c.name}...`);
  setTimeout(() => { const esp = atk.sk.find(s => s.esp); if (esp) { esp.cdl = 0; atk.mcd = 0; atk.gcd = 0; cast(atk, dummy, esp) } }, 500);
  setTimeout(() => rec.stop(), 5200);
}
startLeisure();
(function loop() { tick(); draw(); requestAnimationFrame(loop) })();