// JS port of policy_v2.encode (effect-structure observation encoding).
import { cards } from './cards.mjs';

export const CARD_IDS = Object.keys(cards);
const N = CARD_IDS.length;
const CARD_INDEX = Object.fromEntries(CARD_IDS.map((id, i) => [id, i + 1]));
const ELEMENTS = ['火', '水', '风', '雷', '无'];
const ROLES = ['角色', '武器', '宝物', '通灵兽', '特殊'];
const TWO = new Set(['ember', 'kagura', 'hunt', 'beast', 'divine']);
const FOUR = new Set(['flame', 'snow', 'slash', 'might', 'spark']);
const MASKS = new Set(['firemask', 'watermask', 'windmask', 'thundermask']);
const COLB = new Set(['cherry', 'silk', 'sky', 'moon']);
const ARMOR = new Set(['chest', 'arm', 'helm']);
const TIMED = new Set([...COLB, 'ice', 'wind', 'bolt']);
const REL_ADJ = new Set([...MASKS, 'sheath']);
const REL_ROW = new Set(['flag', 'drum', 'fox', 'thunderdragon', 'wind']);
const REL_COL = new Set([...COLB, 'ice']);
const REL_GLOBAL = new Set(['bolt']);
const COND_SAME = new Set([...MASKS, ...COLB]);
const COND_WEAPON = new Set(['sheath']);
const COND_CHAR = FOUR;
const COND_WATER = new Set(['fox']);
const COND_TH5 = new Set(['thunderdragon']);
const SELF_T2 = TWO;
const SELF_T5 = new Set(['twin']);
const SELF_WEAP = new Set(['swordheart']);
const SELF_FIRE = new Set(['blackdragon']);
const SELF_RW3 = new Set(['luoqing']);
const SELF_LATE = new Set(['extreme']);
const SELF_TH5 = new Set(['archer']);
const ONPLACE = new Set(['burn', 'red', 'eagle', 'abyss', 'refine', 'mist', 'feather', 'yaksha', 'sun', 'carp', 'cloudfrost', 'cloudbreak']);
const EX_FLAT = new Set(['yaksha', 'sun', 'carp', 'cloudfrost', 'cloudbreak']);
const EX_COL = new Set(['burn']);
const EX_ROW = new Set(['red']);
const EX_COL2 = new Set(['eagle']);
const EX_SELF3 = new Set(['abyss']);
const EX_CNT4 = new Set(['refine', 'mist', 'feather']);
const INCOME = new Set(['vip', 'charm']);
const REFRESH = new Set(['ring']);
const LATE_EX = new Set(['frost']);
const R5_EX = new Set(['owner']);
const SETS = [REL_ADJ, REL_ROW, REL_COL, REL_GLOBAL, COND_SAME, COND_WEAPON, COND_CHAR,
  COND_WATER, COND_TH5, SELF_T2, SELF_T5, SELF_WEAP, SELF_FIRE, SELF_RW3, SELF_LATE,
  SELF_TH5, TIMED, ONPLACE, EX_FLAT, EX_COL, EX_ROW, EX_COL2, EX_SELF3, EX_CNT4];

const FINGER = 26;
const BASE = 1 + N + 5 + 5 + 6;
export const SLOT = BASE + FINGER;
const NSLOTS = 23, GLOBALS = 16;
export const INPUT_SIZE = NSLOTS * SLOT + GLOBALS + N + 4;
export const READY = 51;

const FP = {};
for (const id of CARD_IDS) {
  const v = new Float32Array(FINGER);
  SETS.forEach((s, i) => { v[i] = s.has(id) ? 1 : 0; });
  v[24] = (INCOME.has(id) || REFRESH.has(id) || LATE_EX.has(id) || R5_EX.has(id)) ? 1 : 0;
  v[25] = (id === 'ghost' || ARMOR.has(id)) ? 1 : 0;
  FP[id] = v;
}

function fillSlot(vec, off, card, round) {
  if (!card) { vec[off] = 1; return; }
  vec[off + CARD_INDEX[card.id]] = 1;
  vec[off + 1 + N + ELEMENTS.indexOf(card.element)] = 1;
  vec[off + 1 + N + 5 + ROLES.indexOf(card.role)] = 1;
  const placed = card.placedRound || 0;
  const remaining = (placed && TIMED.has(card.id)) ? Math.max(0, 2 - (round - placed)) : 0;
  const b = off + BASE - 6;
  vec[b] = card.cost / 6; vec[b + 1] = card.attack / 6;
  vec[b + 2] = (card.currentAttack ?? card.attack) / 50;
  vec[b + 3] = placed / 5; vec[b + 4] = remaining / 2; vec[b + 5] = card.locked ? 1 : 0;
  vec.set(FP[card.id], off + BASE);
}

export function legalMask(game, side) {
  const mask = new Array(52).fill(false);
  const p = game.players[side];
  if (game.phase !== 'placement' || p.ready) return mask;
  p.shop.forEach((card, slot) => {
    if (!card) return;
    mask[45 + slot] = true;
    if (p.gold >= cards[card.id].cost)
      p.board.forEach((c, cell) => { if (!c) mask[slot * 9 + cell] = true; });
  });
  mask[50] = p.freeRefresh + p.extraRefresh > 0;
  mask[READY] = true;
  return mask;
}

export function encodeObservation(obs, budget = 64) {
  const vec = new Float32Array(INPUT_SIZE);
  const own = obs.self, battle = obs.lastBattle, opp = 1 - obs.side;
  const previous = battle ? battle.boards[opp] : new Array(9).fill(null);
  const groups = [[own.board, obs.round], [own.shop, obs.round], [previous, battle ? battle.round : 0]];
  let off = 0;
  for (const [group, rn] of groups) for (const card of group) { fillSlot(vec, off, card, rn); off += SLOT; }
  const g = off;
  vec[g] = obs.round / 5; vec[g + 1] = own.hp / 100; vec[g + 2] = obs.opponent.hp / 100;
  vec[g + 3] = own.gold / 30; vec[g + 4] = own.bought / 9; vec[g + 5] = own.freeRefresh;
  vec[g + 6] = own.extraRefresh / 10; vec[g + 7] = own.attack / 100; vec[g + 8] = own.extra / 100;
  vec[g + 9] = (own.damage ?? 0) / 100;
  vec[g + 10] = (obs.actionsRemaining ?? budget) / budget;
  vec[g + 11] = battle ? battle.round / 5 : 0;
  vec[g + 12] = battle ? battle.attack[opp] / 100 : 0;
  vec[g + 13] = battle ? battle.extra[opp] / 100 : 0;
  vec[g + 14] = own.ready ? 1 : 0; vec[g + 15] = battle ? 1 : 0;
  off += GLOBALS;
  const uc = obs.unknownCounts;
  for (let i = 0; i < N; i++) vec[off + i] = uc[i] / 2;
  const owned = new Set(own.board.filter(Boolean).map(c => c.id));
  ['ghost', 'chest', 'arm', 'helm'].forEach((id, i) => { vec[INPUT_SIZE - 4 + i] = owned.has(id) ? 1 : 0; });
  let mask = obs.actionMask.slice();
  if ((obs.actionsRemaining ?? budget) === 1) mask = mask.map((_, i) => i === READY);
  return { vec, mask };
}

export function encodeGame(game, side, budget = 64, used = 0) {
  const p = game.players[side];
  const obs = game.observe(side);
  obs.self.damage = p.damage;
  const known = {};
  for (const c of [...p.board, ...p.shop]) if (c) known[c.id] = (known[c.id] || 0) + 1;
  if (obs.lastBattle) for (const c of obs.lastBattle.boards[1 - side]) if (c) known[c.id] = (known[c.id] || 0) + 1;
  obs.unknownCounts = CARD_IDS.map(id => cards[id].copies - (known[id] || 0));
  obs.actionMask = legalMask(game, side);
  obs.actionsRemaining = budget - used;
  return encodeObservation(obs, budget);
}