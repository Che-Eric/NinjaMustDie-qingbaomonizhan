import { cards, createDeck } from './cards.mjs';

const clone = (typeof structuredClone === 'function')
  ? structuredClone
  : (o) => JSON.parse(JSON.stringify(o));

const twoTigers = new Set(['ember', 'kagura', 'hunt', 'beast', 'divine']);
const fourTigers = new Set(['flame', 'snow', 'slash', 'might', 'spark']);
const masks = new Set(['firemask', 'watermask', 'windmask', 'thundermask']);
const columnBuffs = new Set(['cherry', 'silk', 'sky', 'moon']);
const armor = ['chest', 'arm', 'helm'];
const rowOf = (index) => Math.floor(index / 3);
const colOf = (index) => index % 3;

export function evaluate(player, round) {
  const field = player.board.flatMap((entry, index) => entry ? [{
    ...cards[entry.id], ...entry, index, row: rowOf(index), col: colOf(index),
  }] : []);
  const ids = new Set(field.map((card) => card.id));
  const tigers = [...ids].filter((id) => twoTigers.has(id) || fourTigers.has(id) || id === 'twin').length;
  const elements = new Map();
  for (const card of field) {
    if (card.element !== '无') elements.set(card.element, (elements.get(card.element) ?? 0) + 1);
  }
  const roles = new Set(field.map((card) => card.role));
  const weapons = field.filter((card) => card.role === '武器').length;
  const thunder = elements.get('雷') ?? 0;
  const fire = elements.get('火') ?? 0;

  const attacks = field.map((target) => {
    let attack = target.attack;
    if (twoTigers.has(target.id) && tigers >= 2) attack += 2;
    if (target.id === 'swordheart') attack += 2 * weapons;
    if (target.id === 'blackdragon') attack += 2 * fire;
    for (const source of field) {
      const other = source.index !== target.index;
      const row = source.row === target.row;
      const col = source.col === target.col;
      const sameElement = source.element === target.element;
      const adjacent = Math.abs(source.row - target.row) + Math.abs(source.col - target.col) === 1;
      const timed = round - source.placedRound < 2;
      if (fourTigers.has(source.id) && tigers >= 4 && target.role === '角色') attack += 1;
      if (masks.has(source.id) && adjacent) attack += sameElement ? 2 : 1;
      if (source.id === 'sheath' && adjacent && target.role === '武器') attack += 2;
      if (source.id === 'flag' && row && other) attack += elements.size;
      if (source.id === 'drum' && row && other) attack += roles.size;
      if (source.id === 'fox' && row && other && target.element === '水') attack += 4;
      if (source.id === 'thunderdragon' && row && other && thunder >= 5) attack += 4;
      if (timed && columnBuffs.has(source.id) && other && col && sameElement) attack += 3;
      if (timed && source.id === 'ice' && other && col) attack += 2;
      if (timed && source.id === 'wind' && other && row) attack += 2;
      if (timed && source.id === 'bolt' && target.element === '雷') attack += 1;
    }
    if (target.id === 'twin' && tigers >= 5) return attack * 4;
    if (target.id === 'luoqing' && field.filter((card) => card.row === target.row && card.element === '水').length === 3) return attack * 2;
    if (target.id === 'extreme' && round >= 4) return attack * 3;
    if (target.id === 'archer' && thunder >= 5) return attack * 3;
    return attack;
  });

  const rowAttack = [0, 0, 0];
  const colAttack = [0, 0, 0];
  const board = Array(9).fill(null);
  field.forEach((card, index) => {
    board[card.index] = { ...card, currentAttack: attacks[index] };
    rowAttack[card.row] += attacks[index];
    colAttack[card.col] += attacks[index];
  });

  let extra = 0;
  let income = 0;
  let refreshReward = 0;
  field.forEach((card, index) => {
    if (card.id === 'vip') income += 1;
    if (card.id === 'charm') income += elements.size;
    if (card.id === 'frost' && round >= 4) extra += attacks[index] * 3;
    if (card.id === 'owner' && round === 5) extra += player.gold * 4;
    if (card.placedRound !== round) return;
    switch (card.id) {
      case 'ring': refreshReward += 2; break;
      case 'burn': extra += colAttack[card.col]; break;
      case 'red': extra += rowAttack[card.row]; break;
      case 'eagle': extra += colAttack[card.col] * 2; break;
      case 'abyss': extra += attacks[index] * 3; break;
      case 'refine': extra += fire * 4; break;
      case 'mist': extra += thunder * 4; break;
      case 'feather': extra += weapons * 4; break;
      case 'yaksha': extra += 15; break;
      case 'sun': extra += 10; break;
      case 'carp':
      case 'cloudfrost':
      case 'cloudbreak': extra += 7; break;
    }
  });
  return {
    board, attack: rowAttack.reduce((total, value) => total + value, 0),
    extra, income, refreshReward, instantWin: ids.has('ghost') && armor.every((id) => ids.has(id)),
  };
}

function createPlayer() {
  return {
    hp: 100, gold: 5, damage: 0, bought: 0, ready: false,
    freeRefresh: 1, extraRefresh: 0, board: Array(9).fill(null), shop: Array(5).fill(null),
  };
}

export class Game {
  constructor({ random = Math.random } = {}) {
    this.random = random;
    this.pool = createDeck();
    this.players = [createPlayer(), createPlayer()];
    this.round = 1;
    this.phase = 'placement';
    this.lastBattle = null;
    this.result = null;
    this.fillShops();
  }

  draw() {
    if (this.pool.length === 0) return null;
    const index = Math.floor(this.random() * this.pool.length);
    const [card] = this.pool.splice(index, 1);
    return { ...card, locked: false };
  }

  returnCard({ id, serial }) {
    this.pool.push({ id, serial });
  }

  fillShops() {
    // Return all unlocked cards before either player draws.
    for (const player of this.players) {
      player.shop = player.shop.map((card) => {
        if (card?.locked) return card;
        if (card) this.returnCard(card);
        return null;
      });
    }
    for (const player of this.players) {
      player.shop = player.shop.map((card) => card ?? this.draw());
    }
  }

  // Commands return an error string for invalid actions and null on success.
  act(side, action) {
    const player = this.players[side];
    if (!player || !action || this.phase !== 'placement' || player.ready) return '当前无法操作';
    if (action.type === 'ready') {
      player.ready = true;
      if (this.players.every((entry) => entry.ready)) this.resolve();
      return null;
    }
    if (action.type === 'refresh') {
      if (player.freeRefresh + player.extraRefresh === 0) return '没有刷新次数';
      if (player.freeRefresh) player.freeRefresh -= 1;
      else player.extraRefresh -= 1;
      const positions = [];
      player.shop.forEach((card, slot) => {
        if (card && !card.locked) {
          positions.push(slot);
          this.returnCard(card);
          player.shop[slot] = null;
        }
      });
      for (const slot of positions) player.shop[slot] = this.draw();
      return null;
    }
    if (action.type !== 'lock' && action.type !== 'buy') return '未知操作';
    const { slot, cell } = action;
    if (!Number.isInteger(slot) || !player.shop[slot]) return '该商店卡位为空';
    const card = player.shop[slot];
    if (action.type === 'lock') {
      card.locked = !card.locked;
      return null;
    }
    if (!Number.isInteger(cell) || cell < 0 || cell >= 9 || player.board[cell]) return '请选择空棋盘格';
    if (player.gold < cards[card.id].cost) return '金币不足';
    player.gold -= cards[card.id].cost;
    player.bought += 1;
    player.board[cell] = { id: card.id, serial: card.serial, placedRound: this.round };
    player.shop[slot] = null;
    return null;
  }

  expire() {
    if (this.phase !== 'placement') return;
    this.players.forEach((player) => { player.ready = true; });
    this.resolve();
  }

  resolve() {
    const stats = this.players.map((player) => evaluate(player, this.round));
    const instant = stats.map((stat) => stat.instantWin);
    const incoming = instant.some(Boolean) ? [0, 0] : [
      stats[1].attack + stats[1].extra, stats[0].attack + stats[0].extra,
    ];
    this.lastBattle = {
      round: this.round, stats, instant, incoming,
      before: this.players.map((player) => player.hp),
    };
    this.players.forEach((player, index) => {
      player.hp -= incoming[index];
      player.damage += incoming[1 - index];
    });
    this.lastBattle.after = this.players.map((player) => player.hp);
    if (instant.some(Boolean) || this.round === 5 || this.players.some((player) => player.hp <= 0)) {
      const comparison = instant.some(Boolean)
        ? Number(instant[0]) - Number(instant[1])
        : this.players[0].hp - this.players[1].hp;
      const winner = comparison === 0 ? null : comparison > 0 ? 0 : 1;
      const scores = this.players.map((player, index) => {
        if (instant[index]) return 3;
        const base = winner === null ? 1 : Number(winner === index) * 2;
        return base + Number(player.damage >= 90);
      });
      this.result = { winner, scores };
    }
    this.phase = 'battle';
  }

  advance() {
    if (this.phase !== 'battle' || this.result) return false;
    this.players.forEach((player, side) => {
      const stats = this.lastBattle.stats[side];
      player.gold += stats.income + 3 + Math.max(0, 2 - player.bought);
      player.extraRefresh += stats.refreshReward;
      player.freeRefresh = 1;
      player.bought = 0;
      player.ready = false;
    });
    this.round += 1;
    this.fillShops();
    this.phase = 'placement';
    return true;
  }

  observe(side) {
    const player = this.players[side];
    const stats = evaluate(player, this.round);
    const lastBattle = this.lastBattle && {
      round: this.lastBattle.round,
      boards: this.lastBattle.stats.map((entry) => entry.board),
      attack: this.lastBattle.stats.map((entry) => entry.attack),
      extra: this.lastBattle.stats.map((entry) => entry.extra),
      incoming: this.lastBattle.incoming,
      instant: this.lastBattle.instant,
      before: this.lastBattle.before,
      after: this.lastBattle.after,
    };
    return clone({
      side, round: this.round, phase: this.phase,
      self: {
        hp: player.hp, gold: player.gold, ready: player.ready, bought: player.bought,
        freeRefresh: player.freeRefresh, extraRefresh: player.extraRefresh,
        attack: stats.attack, extra: stats.extra, board: stats.board,
        shop: player.shop.map((card) => card && { ...cards[card.id], locked: card.locked }),
      },
      opponent: { hp: this.players[1 - side].hp },
      lastBattle, result: this.result,
    });
  }
}
