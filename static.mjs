/* 静态网页版：游戏引擎 + 训练AI 全部在浏览器内运行（路线A，无需后端）。 */
import { Game } from './game.mjs';
import { encodeGame, legalMask, READY } from './encode.mjs';
import { setWeights, choose } from './nn.mjs';

const get = (id) => document.getElementById(id);
const EL = { 火: 'fire', 水: 'water', 风: 'wind', 雷: 'thunder', 无: 'none' };
const PLACE = 50000, REST = 10000, AI_INTERVAL = 900, BUDGET = 64;

/* ---------- icons ---------- */
const svg = (inner, vb = '0 0 24 24') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
const icoHeart = () => svg('<path fill="#e05a6d" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>');
const icoSpecial = () => svg('<path fill="#5dade2" d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/>');
const icoAtk = () => svg('<path fill="#d9b36a" d="M12 1.5 15 5.5 13.2 13.5 12 15.5 10.8 13.5 9 5.5Z"/><path fill="#b98a3e" d="M6.5 15h11v2h-11z"/><path fill="#8a6a34" d="M11 17h2v4h-2z"/><circle cx="12" cy="22" r="1.4" fill="#b98a3e"/>');
const icoShuriken = (cls = '') => `<svg class="${cls}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M50 0 61 39 100 50 61 61 50 100 39 61 0 50 39 39Z"/><circle cx="50" cy="50" r="9" fill="rgba(0,0,0,.45)"/></svg>`;
const icoLock = (locked) => locked
  ? svg('<path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3H9z"/>')
  : svg('<path fill="currentColor" d="M7 10V7a5 5 0 0 1 9.9-1h-2.1A3 3 0 0 0 9 7v3h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1z"/>');
const icoCoin = () => svg('<circle cx="12" cy="12" r="10" fill="#f4d58b" stroke="#b98a3e" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="#b98a3e" stroke-width="1.5"/>');
const icoClock = () => svg('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');
const icoRefresh = () => svg('<path d="M20 12a8 8 0 1 1-2.34-5.66" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>');
const icoEye = () => svg('<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/>');
const icoSound = (on) => on
  ? svg('<path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8a5 5 0 0 1 0 8M18.5 5.5a9 9 0 0 1 0 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>')
  : svg('<path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');
const icoCorner = () => `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><path d="M2 38C2 18 18 2 38 2" fill="none" stroke="currentColor" stroke-width="3"/><path d="M8 38C8 22 22 8 38 8" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".7"/><circle cx="6" cy="34" r="3" fill="currentColor"/></svg>`;

/* ---------- synth SFX ---------- */
const FX = {
  ctx: null, muted: false,
  ensure() { if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) this.ctx = new AC(); } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  tone(f, d, type = 'sine', g = 0.12, slide = 0) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), gn = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
    gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(gn).connect(this.ctx.destination); o.start(t); o.stop(t + d + 0.02);
  },
  place() { this.tone(220, 0.12, 'triangle', 0.16, -60); this.tone(440, 0.08, 'sine', 0.08); },
  lock() { this.tone(660, 0.06, 'square', 0.06); },
  refresh() { this.tone(500, 0.14, 'sawtooth', 0.05, 300); },
  ready() { this.tone(523, 0.1, 'sine', 0.1); setTimeout(() => this.tone(784, 0.14, 'sine', 0.1), 90); },
  battle() { this.tone(120, 0.3, 'sawtooth', 0.16, -60); this.tone(90, 0.35, 'square', 0.1, -40); },
  win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 'sine', 0.1), i * 110)); },
  lose() { [392, 330, 262].forEach((f, i) => setTimeout(() => this.tone(f, 0.2, 'sine', 0.1), i * 130)); },
};

/* ---------- local engine + clocks ---------- */
let game = null, state = null, selected = null, lookback = false;
let placementDeadline = null, restDeadline = null, nextAi = 0, aiUsed = 0;
let prevPhase = null, prevAttack = null, prevExtra = null, lastSig = '';
let modelReady = false, started = false, overDismissed = false;

function newGame() {
  game = new Game();
  placementDeadline = null;
  restDeadline = null; aiUsed = 0; nextAi = 0;
  selected = null; lookback = false; overDismissed = false; started = false; lastSig = '';
}
function startRound() {
  started = true;
  placementDeadline = performance.now() + PLACE;
  restDeadline = null; nextAi = performance.now() + 800;
  overDismissed = false; lastSig = '';
  get('start').hidden = true;
}
function restartGame() {
  newGame();
  get('start').hidden = true;
  startRound();
}
function toCommand(a) {
  if (a < 45) return { type: 'buy', slot: Math.floor(a / 9), cell: a % 9 };
  if (a < 50) return { type: 'lock', slot: a - 45 };
  if (a === 50) return { type: 'refresh' };
  return { type: 'ready' };
}
function aiAct() {
  if (!modelReady) return;
  if (aiUsed >= BUDGET) { game.players[1].ready = true; return; }
  const { vec, mask } = encodeGame(game, 1, BUDGET, aiUsed);
  let a = choose(vec, mask);
  if (!mask[a]) a = READY;
  const err = game.act(1, toCommand(a));
  aiUsed++;
  if (err) game.players[1].ready = true;
}
const WEIGHT_BYTES = 5830864;
async function fetchWeights(onProgress) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch('weights.bin', { signal: ctrl.signal, cache: 'force-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const total = +res.headers.get('Content-Length') || WEIGHT_BYTES;
    if (!res.body) { const buf = await res.arrayBuffer(); onProgress(total, total); return buf; }
    const reader = res.body.getReader();
    const chunks = []; let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); loaded += value.length; onProgress(loaded, total);
    }
    const all = new Uint8Array(loaded); let o = 0;
    for (const c of chunks) { all.set(c, o); o += c.length; }
    return all.buffer;
  } finally { clearTimeout(timer); }
}
async function boot() {
  const fill = get('bootFill'), pct = get('bootPct'), mb = get('bootMB'),
    err = get('bootErr'), retry = get('bootRetry');
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      err.textContent = ''; retry.hidden = true;
      const man = await fetch('weights.json').then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
      const buf = await fetchWeights((loaded, total) => {
        const p = Math.min(100, loaded / total * 100);
        fill.style.width = p + '%';
        pct.textContent = Math.floor(p) + '%';
        mb.textContent = (loaded / 1048576).toFixed(1) + ' / ' + (total / 1048576).toFixed(1) + ' MB';
      });
      setWeights(buf, man);
      modelReady = true;
      get('boot').hidden = true;
      lastSig = '';
      newGame();
      state = buildState(); render();
      get('timerbar').style.width = '100%';
      get('clock').innerHTML = `${icoClock()}等待开始`;
      get('start').hidden = false;
      setInterval(tick, 100);
      if (new URLSearchParams(location.search).get('autostart') === '1') startRound();
      return;
    } catch (e) {
      err.textContent = `加载失败（${e.message}），第 ${attempt}/3 次`;
      if (attempt < 3) await new Promise(r => setTimeout(r, 800));
    }
  }
  err.textContent = '模型加载失败，请检查网络后点击重试。';
  retry.hidden = false;
}
function buildState() {
  const obs = game.observe(0);
  const phase = game.result ? 'over' : (game.phase === 'battle' ? 'battle' : 'placement');
  const now = performance.now();
  const deadline = phase === 'battle' ? restDeadline : placementDeadline;
  const limit = (phase === 'battle' ? REST : PLACE) / 1000;
  return {
    round: obs.round, phase, phaseLimit: limit,
    timeLeft: deadline ? Math.max(0, (deadline - now) / 1000) : 0,
    self: { ...obs.self, damage: game.players[0].damage },
    opponent: { hp: obs.opponent.hp, ready: game.players[1].ready, previousBoard: obs.lastBattle ? obs.lastBattle.boards[1] : null },
    lastBattle: obs.lastBattle, result: obs.result,
    actionMask: phase === 'placement' ? legalMask(game, 0) : new Array(52).fill(false),
  };
}
function tick() {
  if (!started) return;
  const now = performance.now();
  if (!game.result) {
    if (game.phase === 'battle') {
      if (restDeadline == null) restDeadline = now + REST;
      else if (now >= restDeadline) {
        game.advance(); placementDeadline = now + PLACE; restDeadline = null; aiUsed = 0; nextAi = now + 800;
      }
    } else {
      if (placementDeadline == null) placementDeadline = now + PLACE;
      if (now >= placementDeadline) { game.players.forEach(p => { p.ready = true; }); game.resolve(); restDeadline = null; }
      else if (!game.players[1].ready && now >= nextAi) { nextAi = now + AI_INTERVAL; aiAct(); }
    }
  }
  state = buildState();
  if (prevPhase !== null && state.phase !== prevPhase) {
    if (state.phase === 'battle') { FX.battle(); lookback = false; }
    if (state.phase === 'over' && state.result) (state.result.winner === 0 ? FX.win() : FX.lose());
  }
  prevPhase = state.phase;
  if (state.phase !== 'placement') selected = null;
  const sig = signature(state);
  if (sig !== lastSig) { lastSig = sig; render(); }
  tickClock();
}
function humanAct(action) {
  if (!started) { get('message').textContent = '请先点击开始游戏'; return; }
  if (state.phase !== 'placement') { get('message').textContent = '结算休整期无法操作'; return; }
  if (game.players[0].ready) { get('message').textContent = '你已准备就绪'; return; }
  if (!legalMask(game, 0)[action]) { get('message').textContent = '该操作当前不可用'; return; }
  const err = game.act(0, toCommand(action));
  get('message').textContent = err || '';
  if (!err) {
    if (action < 45) FX.place(); else if (action < 50) FX.lock();
    else if (action === 50) FX.refresh(); else FX.ready();
  }
  lastSig = '';
}

/* ---------- render (same visual language as server version) ---------- */
const stat = (kind, icon, value, hidden = false, pulse = false) =>
  `<span class="stat ${kind}${hidden ? ' hidden-stat' : ''}${pulse ? ' pulse' : ''}">${icon}<span class="val">${value}</span></span>`;
function cardMarkup(card, opts = {}) {
  const atk = opts.board ? (card.currentAttack ?? card.attack) : card.attack;
  const cls = ['card', EL[card.element] ?? 'none'];
  if (opts.selected) cls.push('selected');
  if (opts.unaffordable) cls.push('unaffordable');
  const action = opts.selectable ? ` data-action="select:${opts.slot}"` : '';
  return `<div class="${cls.join(' ')}"${action}>
    <span class="badge atk">${icoAtk()}${atk}</span><span class="badge cost">${icoCoin()}${card.cost}</span>
    <strong>${card.name}</strong><span class="effect">${card.effect}</span>
    <span class="badge elem ${EL[card.element] ?? 'none'}">${card.element === '无' ? '无' : card.element}</span>
    <span class="badge role">${card.role}</span></div>`;
}
function boardGrid(board, canPlace) {
  return `<div class="grid">${board.map((card, cell) => {
    if (card) return `<div class="slot">${cardMarkup(card, { board: true })}</div>`;
    if (canPlace) return `<div class="slot placeable" data-action="place:${cell}"><span class="place-hint">放置</span></div>`;
    return `<div class="slot"><span class="watermark">${icoShuriken()}</span></div>`;
  }).join('')}</div>`;
}
const corners = () => `<span class="corner tl">${icoCorner()}</span><span class="corner tr">${icoCorner()}</span><span class="corner br">${icoCorner()}</span><span class="corner bl">${icoCorner()}</span>`;
const chip = (l, v, c = '') => `<span class="${c}">${l} <b>${v}</b></span>`;
function battlePanel(b, side) {
  const enemy = side === 1;
  return `<div class="battlepanel${enemy ? ' enemy' : ''}">${corners()}<h2>${enemy ? '对手棋盘' : '我的棋盘'}</h2>
    <div class="metrics">${chip('生命', `${b.before[side]} → ${b.after[side]}`, 'dmg')}${chip('总攻击', b.attack[side])}${chip('额外伤害', b.extra[side])}${chip('受到伤害', b.incoming[side], 'dmg')}</div>
    ${boardGrid(b.boards[side], false)}</div>`;
}
function render() {
  if (!state) return;
  const s = state, p = s.self, mask = s.actionMask;
  get('app').dataset.phase = s.phase;
  const reveal = s.phase !== 'placement' && s.lastBattle;
  get('statsLeft').innerHTML = stat('hp', icoHeart(), p.hp) +
    stat('special', icoSpecial(), p.extra, false, prevExtra !== null && p.extra !== prevExtra) +
    stat('atk', icoAtk(), p.attack, false, prevAttack !== null && p.attack !== prevAttack);
  get('statsRight').innerHTML = stat('atk', icoAtk(), reveal ? s.lastBattle.attack[1] : '--', !reveal) +
    stat('special', icoSpecial(), reveal ? s.lastBattle.extra[1] : '--', !reveal) +
    stat('hp', icoHeart(), s.opponent.hp);
  prevAttack = p.attack; prevExtra = p.extra;
  get('roundBanner').textContent = s.phase === 'over' ? '对局结束' : `第 ${s.round}/5 回合`;
  if (s.phase === 'placement') {
    get('left').className = 'boardframe';
    get('left').innerHTML = `${corners()}<h2 class="board-title">我的棋盘</h2>${boardGrid(p.board, selected !== null && !p.ready)}`;
    get('right').className = 'shoppanel';
    const refreshes = p.freeRefresh + p.extraRefresh;
    const slots = p.shop.map((card, slot) => {
      if (!card) return '<div class="shop-slot empty">空位</div>';
      return `<div class="shop-slot">${cardMarkup(card, { selectable: !p.ready, selected: selected === slot, slot, unaffordable: p.gold < card.cost })}
        <div class="lockrow"><button type="button" class="lockbtn${card.locked ? ' locked' : ''}" data-action="lock:${slot}" ${p.ready ? 'disabled' : ''}>${icoLock(card.locked)}${card.locked ? '已锁定' : '锁定'}</button></div></div>`;
    }).join('');
    get('right').innerHTML = `<div class="shop-head"><span class="shop-title">卡牌商店</span><span class="goldbox">${icoCoin()}金币: ${p.gold}</span></div>
      <div class="shop-body"><div class="shop-grid">${slots}</div>
      <div class="shop-side">
        <button type="button" class="btn blue" data-action="lookback" ${s.lastBattle ? '' : 'disabled'}>${icoEye()}上轮阵容</button>
        <button type="button" class="btn blue" data-action="refresh" ${p.ready || !mask[50] ? 'disabled' : ''}>${icoRefresh()}刷新手牌</button>
        <div class="refresh-count">剩余刷新次数: ${refreshes}</div></div></div>
      <div class="shop-foot"><button type="button" class="btn gold big" data-action="ready" ${p.ready || !mask[51] ? 'disabled' : ''}>准备就绪</button></div>`;
  } else {
    const b = s.lastBattle;
    get('left').className = ''; get('right').className = '';
    get('left').innerHTML = b ? battlePanel(b, 0) : '';
    get('right').innerHTML = b ? battlePanel(b, 1) : '';
  }
  get('restbanner').hidden = s.phase !== 'battle';
  get('lookback').hidden = !(lookback && s.phase === 'placement' && s.lastBattle);
  if (!get('lookback').hidden) get('lookbackLayout').innerHTML = battlePanel(s.lastBattle, 0) + battlePanel(s.lastBattle, 1);
  get('over').hidden = !(s.phase === 'over' && !overDismissed);
  get('overBar').hidden = !(s.phase === 'over' && overDismissed);
  if (s.phase === 'over' && s.result && s.lastBattle) {
    const w = s.result.winner, b = s.lastBattle;
    get('overContent').innerHTML = `<div class="verdict ${w === 0 ? 'win' : w === 1 ? 'lose' : 'draw'}">${w === 0 ? '获胜' : w === 1 ? '失败' : '平局'}</div>
      <div class="metrics over-metrics">
        ${chip('我方生命', `${b.before[0]} → ${b.after[0]}`, 'dmg')}
        ${chip('敌方生命', `${b.before[1]} → ${b.after[1]}`, 'dmg')}
        ${chip('我方得分', s.result.scores[0], 'good')}
        ${chip('敌方得分', s.result.scores[1])}
      </div>
      <div class="scoreline">第 ${b.round} 回合结算 · 我方受到 <b>${b.incoming[0]}</b> · 敌方受到 <b>${b.incoming[1]}</b></div>`;
  }
  get('mute').innerHTML = icoSound(!FX.muted) + (FX.muted ? '静音' : '声音');
  get('mute').setAttribute('aria-pressed', String(!FX.muted));
  const badge = get('aiBadge');
  badge.textContent = modelReady ? '训练AI已就绪' : '模型加载中…';
  badge.className = 'util-btn badge-ai' + (modelReady ? ' ok' : '');
  document.querySelector('.shuriken-deco').innerHTML = icoShuriken();
}
function tickClock() {
  if (!state) return;
  const s = state, secs = Math.ceil(s.timeLeft);
  const bar = get('timerbar');
  bar.style.width = `${Math.max(0, Math.min(100, (s.timeLeft / s.phaseLimit) * 100))}%`;
  bar.className = s.phase === 'battle' ? 'rest' : (s.timeLeft <= 10 ? 'low' : '');
  const clock = get('clock');
  if (s.phase === 'over') {
    clock.className = 'clock';
    clock.innerHTML = `${icoClock()}对局结束`;
    bar.style.width = '100%'; bar.className = 'rest';
    return;
  }
  clock.className = 'clock' + (s.phase === 'placement' && s.timeLeft <= 10 ? ' low' : '');
  clock.innerHTML = `${icoClock()}倒计时: <b>${secs}</b>s`;
  if (s.phase === 'battle') get('restbanner').innerHTML = `${icoClock()}结算休整中 · 剩余 ${secs}s · 无法操作 · 查看双方本回合放置与伤害`;
}
function signature(s) {
  return JSON.stringify([s.round, s.phase, selected, lookback, started, overDismissed, s.self.hp, s.self.gold, s.self.attack,
    s.self.extra, s.self.ready, s.self.freeRefresh, s.self.extraRefresh,
    s.self.board.map(c => c && [c.id, c.placedRound, c.currentAttack]),
    s.self.shop.map(c => c && [c.id, c.locked]),
    s.opponent.hp, s.opponent.ready, s.result, s.lastBattle && s.lastBattle.round]);
}

/* ---------- input ---------- */
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action]');
  if (!t || t.disabled) return;
  FX.ensure();
  const [type, idx] = t.dataset.action.split(':');
  const n = Number(idx);
  if (type === 'select') { selected = selected === n ? null : n; lastSig = ''; render(); return; }
  if (type === 'place') { if (selected === null) return; humanAct(selected * 9 + n); selected = null; return; }
  if (type === 'lock') { humanAct(45 + n); return; }
  if (type === 'refresh') { humanAct(50); selected = null; return; }
  if (type === 'ready') { humanAct(READY); selected = null; return; }
  if (type === 'lookback') { lookback = true; lastSig = ''; render(); return; }
  if (type === 'back') { lookback = false; lastSig = ''; render(); return; }
  if (type === 'start') { FX.ready(); startRound(); return; }
  if (type === 'dismissOver') { overDismissed = true; lastSig = ''; render(); return; }
  if (type === 'showOver') { overDismissed = false; lastSig = ''; render(); return; }
  if (type === 'restart') { restartGame(); return; }
});
get('mute').addEventListener('click', () => { FX.ensure(); FX.muted = !FX.muted; lastSig = ''; render(); });
get('restart').addEventListener('click', () => restartGame());
get('overRestart').addEventListener('click', () => restartGame());
get('backToPlace').addEventListener('click', () => { lookback = false; lastSig = ''; render(); });

get('bootRetry').addEventListener('click', () => boot());
boot();

window.__web = {
  get game() { return game; }, get state() { return state; },
  get modelReady() { return modelReady; },
};