/** 矮人 AI：需求（饥饿/精力/生命）+ 状态机（任务/搬运/进食/睡觉/战斗/游荡） */
import { DWARF, RECIPES, Res, S, T, TERRAIN } from '../core/defs';
import type { Ctx, Drop, Task } from '../core/types';
import { NavGrid, Pt, pathToTile } from '../world/pathfinding';
import { randInt } from '../core/rng';
import type { Monster } from './monster';

export enum DwarfState {
  IDLE = 'idle',
  GO_TASK = 'goTask',
  WORK = 'work',
  TO_DROP = 'toDrop',
  TO_BASE = 'toBase',
  TO_SLEEP = 'toSleep',
  EAT = 'eat',
  SLEEP = 'sleep',
  FIGHT = 'fight',
}

const NAMES = ['铁鬓', '石手', '麦酒', '铜指', '深眼', '硬胡', '金牙', '快斧'];

/** 沿路径行走结果 */
const enum MoveResult {
  MOVING = 0,
  ARRIVED = 1,
  BLOCKED = -1,
}

export class Dwarf {
  static NEXT_ID = 1;
  id: number;
  name: string;
  variant: number;
  x: number;
  y: number;
  hp = DWARF.maxHp;
  hunger = 85;
  energy = 90;
  carried: { res: Res; n: number } | null = null;
  armed = false;
  dead = false;
  state: DwarfState = DwarfState.IDLE;
  path: Pt[] = [];
  pathIdx = 0;
  task: Task | null = null;
  haulDrop: Drop | null = null;
  target: Monster | null = null;
  attackCd = 0;
  repathCd = 0;
  workTimer = 0;
  fxTimer = 0;
  wanderCd = 0;
  faceLeft = false;

  constructor(x: number, y: number, variant: number, name?: string) {
    this.id = Dwarf.NEXT_ID++;
    this.x = x;
    this.y = y;
    this.variant = variant;
    this.name = name ?? NAMES[(this.id - 1) % NAMES.length];
  }

  get stateName(): string {
    switch (this.state) {
      case DwarfState.IDLE: return '闲置';
      case DwarfState.GO_TASK: return '前往任务';
      case DwarfState.WORK: return this.task ? this.workName() : '工作';
      case DwarfState.TO_DROP: return '拾取物品';
      case DwarfState.TO_BASE: return '运送回仓';
      case DwarfState.TO_SLEEP: return '回去睡觉';
      case DwarfState.EAT: return '进食';
      case DwarfState.SLEEP: return '睡觉';
      case DwarfState.FIGHT: return '战斗';
    }
  }

  private workName(): string {
    switch (this.task?.type) {
      case 'dig': return '挖掘';
      case 'build': return '建造';
      case 'demolish': return '拆除';
      case 'craft': return '合成';
      default: return '工作';
    }
  }

  takeDamage(d: number): void {
    this.hp -= d;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
  }

  // ---------- 主更新 ----------

  update(ctx: Ctx, dt: number): void {
    if (this.dead) return;
    const nav = new NavGrid(ctx.world);

    // 重力：脚下失去支撑时下落
    this.applyGravity(ctx, nav, dt);

    // 需求衰减与生命恢复
    this.hunger = Math.max(0, this.hunger - DWARF.hungerDecay * dt);
    this.energy = Math.min(DWARF.maxEnergy, Math.max(0, this.energy - DWARF.energyDecay * dt));
    if (this.hunger <= 0) this.hp -= 1.2 * dt;
    else if (this.hunger > 60 && this.energy > 40 && this.state !== DwarfState.FIGHT && this.hp < DWARF.maxHp) {
      this.hp = Math.min(DWARF.maxHp, this.hp + DWARF.regenHp * dt);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      return;
    }

    this.attackCd -= dt;
    this.repathCd -= dt;
    this.fxTimer -= dt;
    this.wanderCd -= dt;

    switch (this.state) {
      case DwarfState.SLEEP:
        this.updateSleep(ctx);
        return;
      case DwarfState.FIGHT:
        this.updateFight(ctx, dt, nav);
        return;
      default:
        break;
    }

    // 威胁检测：附近的怪物优先应对
    const threat = this.nearestMonster(ctx, DWARF.aggroRange);
    if (threat) {
      this.target = threat;
      this.state = DwarfState.FIGHT;
      this.repathCd = 0;
      return;
    }

    // 进食
    if (this.state === DwarfState.EAT) {
      this.workTimer -= dt;
      if (this.workTimer <= 0) {
        this.hunger = Math.min(DWARF.maxHunger, this.hunger + DWARF.eatAmount);
        this.state = DwarfState.IDLE;
      }
      return;
    }
    if (this.hunger < DWARF.eatAt && ctx.inv.count('food') > 0) {
      if (ctx.inv.remove('food', 1)) {
        this.state = DwarfState.EAT;
        this.workTimer = DWARF.eatTime;
        return;
      }
    }

    // 困倦：夜晚回营地睡，白天困极了就地睡
    if (this.energy < DWARF.sleepAt || (ctx.time.isNight && this.energy < 65)) {
      this.startSleep(ctx, nav);
      return;
    }

    // 执行中的移动/工作
    if (this.state === DwarfState.GO_TASK) {
      const r = this.followPath(ctx, dt, this.speed(ctx));
      if (r === MoveResult.ARRIVED) {
        this.state = DwarfState.WORK;
        this.workTimer = 0;
      } else if (r === MoveResult.BLOCKED) {
        this.abandonTask(ctx);
      }
      return;
    }
    if (this.state === DwarfState.WORK) {
      this.doWork(ctx, dt);
      return;
    }
    if (this.state === DwarfState.TO_DROP) {
      const r = this.followPath(ctx, dt, this.speed(ctx));
      if (r === MoveResult.ARRIVED) this.pickupNearby(ctx);
      else if (r === MoveResult.BLOCKED) {
        if (this.haulDrop) this.haulDrop.claimedBy = null;
        this.haulDrop = null;
        this.state = DwarfState.IDLE;
      }
      return;
    }
    if (this.state === DwarfState.TO_BASE) {
      const r = this.followPath(ctx, dt, this.speed(ctx));
      if (r === MoveResult.ARRIVED || this.nearBase(ctx, 1.8)) {
        this.deposit(ctx);
      } else if (r === MoveResult.BLOCKED) {
        this.state = DwarfState.IDLE;
      }
      return;
    }
    if (this.state === DwarfState.TO_SLEEP) {
      const r = this.followPath(ctx, dt, this.speed(ctx));
      if (r !== MoveResult.MOVING) this.state = DwarfState.SLEEP;
      return;
    }

    // IDLE：先卸货，再领任务，再搬运，最后游荡
    if (this.carried) {
      if (this.nearBase(ctx, 1.8)) this.deposit(ctx);
      else {
        const p = pathToTile(ctx.world, this.tile(), ctx.base);
        if (p) {
          this.path = p;
          this.pathIdx = 0;
          this.state = DwarfState.TO_BASE;
        } else {
          this.deposit(ctx); // 无法回仓就地在脚下堆放
        }
      }
      return;
    }
    // 脚边有掉落物直接捡
    if (this.pickupNearby(ctx)) return;

    const claim = ctx.tasks.claimFor(this.id, this.tile(), ctx.world);
    if (claim) {
      this.task = claim.task;
      this.path = claim.path;
      this.pathIdx = 0;
      this.state = DwarfState.GO_TASK;
      return;
    }
    if (this.findHaulJob(ctx)) return;

    // 游荡
    if (this.wanderCd <= 0) {
      this.wanderCd = 3 + ctx.rand() * 4;
      const tx = Math.floor(this.x) + randInt(-3, 3, ctx.rand);
      const ty = Math.floor(this.y);
      if (ctx.world.inBounds(tx, ty) && (tx !== Math.floor(this.x) || ty !== Math.floor(this.y))) {
        const p = pathToTile(ctx.world, this.tile(), { x: tx, y: ty });
        if (p && p.length > 0 && p.length < 12) {
          this.path = p;
          this.pathIdx = 0;
          this.wanderPath = p.length;
        }
      }
    }
    // 游荡路径行走
    if (this.wanderPath > 0) {
      const r = this.followPath(ctx, dt, this.speed(ctx));
      if (r !== MoveResult.MOVING) this.wanderPath = 0;
    }
  }

  private wanderPath = 0;

  speed(ctx: Ctx): number {
    return DWARF.speed * (ctx.speedBoost > 1 ? 2 : 1);
  }

  tile(): Pt {
    return { x: Math.floor(this.x), y: Math.floor(this.y) };
  }

  // ---------- 移动 ----------

  private followPath(ctx: Ctx, dt: number, spd: number): MoveResult {
    if (spd <= 0) return MoveResult.MOVING;
    let budget = dt;
    const nav = new NavGrid(ctx.world);
    while (budget > 0) {
      if (this.pathIdx >= this.path.length) return MoveResult.ARRIVED;
      const wp = this.path[this.pathIdx];
      if (!nav.passable(wp.x, wp.y)) return MoveResult.BLOCKED;
      const txp = wp.x + 0.5;
      const typ = wp.y + 0.5;
      const dx = txp - this.x;
      const dy = typ - this.y;
      const dist = Math.hypot(dx, dy);
      const step = spd * budget;
      if (dist <= step || dist < 0.03) {
        this.x = txp;
        this.y = typ;
        this.pathIdx++;
        budget -= Math.max(0, dist / spd);
      } else {
        if (Math.abs(dx) > 0.01) this.faceLeft = dx < 0;
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
        budget = 0;
      }
    }
    return MoveResult.MOVING;
  }

  private applyGravity(ctx: Ctx, nav: NavGrid, dt: number): void {
    const tx = Math.floor(this.x);
    const ty = Math.floor(this.y);
    if (nav.canStand(tx, ty)) return;
    const ny = this.y + 10 * dt;
    const nty = Math.floor(ny);
    if (nav.canStand(tx, nty)) {
      this.y = nty + 0.5;
    } else {
      this.y = Math.min(ny, ctx.world.h - 1);
    }
  }

  // ---------- 战斗 ----------

  private nearestMonster(ctx: Ctx, range: number): Monster | null {
    let best: Monster | null = null;
    let bd = range * range;
    for (const m of ctx.monsters) {
      if (m.dead) continue;
      const d = (m.x - this.x) ** 2 + (m.y - this.y) ** 2;
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }

  private updateFight(ctx: Ctx, dt: number, nav: NavGrid): void {
    const m = this.target;
    if (!m || m.dead || Math.hypot(m.x - this.x, m.y - this.y) > DWARF.aggroRange + 5) {
      this.target = null;
      this.state = DwarfState.IDLE;
      return;
    }
    const dist = Math.hypot(m.x - this.x, m.y - this.y);
    if (dist <= DWARF.attackRange) {
      if (this.attackCd <= 0) {
        m.takeDamage(this.armed ? DWARF.attackDamageArmed : DWARF.attackDamage);
        this.attackCd = DWARF.attackCd;
        ctx.fx('hurt', m.x, m.y);
        this.faceLeft = m.x < this.x;
      }
      return;
    }
    if (this.repathCd <= 0 || this.pathIdx >= this.path.length) {
      const p = pathToTile(ctx.world, this.tile(), { x: Math.floor(m.x), y: Math.floor(m.y) });
      if (p) {
        this.path = p;
        this.pathIdx = 0;
      }
      this.repathCd = 0.5;
    }
    const r = this.followPath(ctx, dt, this.speed(ctx));
    if (r === MoveResult.BLOCKED) {
      this.target = null;
      this.state = DwarfState.IDLE;
    }
  }

  // ---------- 需求 ----------

  private startSleep(ctx: Ctx, nav: NavGrid): void {
    if (ctx.time.isNight && !this.nearBase(ctx, 3.5)) {
      const p = pathToTile(ctx.world, this.tile(), ctx.base);
      if (p) {
        this.path = p;
        this.pathIdx = 0;
        this.state = DwarfState.TO_SLEEP;
        return;
      }
    }
    this.state = DwarfState.SLEEP;
  }

  private updateSleep(ctx: Ctx): void {
    // 被靠近的怪物惊醒
    if (this.nearestMonster(ctx, 5)) {
      this.state = DwarfState.IDLE;
      return;
    }
    this.energy = Math.min(DWARF.maxEnergy, this.energy + DWARF.sleepRegen * 0.5);
    if (this.energy >= DWARF.maxEnergy || (!ctx.time.isNight && this.energy >= 75)) {
      this.state = DwarfState.IDLE;
    }
  }

  // ---------- 任务执行 ----------

  private abandonTask(ctx: Ctx): void {
    if (this.task) ctx.tasks.abandon(this.task);
    this.task = null;
    this.state = DwarfState.IDLE;
  }

  private doWork(ctx: Ctx, dt: number): void {
    const t = this.task;
    if (!t) {
      this.state = DwarfState.IDLE;
      return;
    }
    // 2.5 格内即可开工（含埋藏块上方 2 格站位：矮人 y=31.0 到目标中心 33.5 恰为 2.5）
    const distOk = t.type === 'craft' && t.stationX === -1 ? true : Math.abs(this.x - (t.x + 0.5)) <= 2.5 && Math.abs(this.y - (t.y + 0.5)) <= 2.5;
    if (!distOk) {
      // 被挤开了，重新走过去
      this.state = DwarfState.GO_TASK;
      return;
    }
    if (t.type === 'dig') {
      const terr = ctx.world.terrainAt(t.x, t.y);
      if (terr === T.AIR || TERRAIN[terr].hardness === Infinity) {
        ctx.tasks.complete(t);
        this.task = null;
        this.state = DwarfState.IDLE;
        return;
      }
      t.progress += DWARF.digPower * dt;
      if (this.fxTimer <= 0) {
        ctx.fx('dig', t.x, t.y);
        this.fxTimer = 0.3;
      }
      if (t.progress >= TERRAIN[terr].hardness) {
        const info = TERRAIN[terr];
        if (info.drop && info.drop.max > 0) {
          const chance = info.drop.chance ?? 1;
          if (ctx.rand() < chance) {
            const n = randInt(info.drop.min, info.drop.max, ctx.rand);
            if (n > 0) ctx.spawnDrop(info.drop.res, n, t.x, t.y);
          }
        }
        ctx.world.setTerrain(t.x, t.y, T.AIR);
        ctx.tasks.complete(t);
        this.task = null;
        this.state = DwarfState.IDLE;
      }
      return;
    }
    if (t.type === 'build') {
      const s = t.structure!;
      if (ctx.world.structureAt(t.x, t.y) === s) {
        ctx.tasks.complete(t);
        this.task = null;
        this.state = DwarfState.IDLE;
        return;
      }
      this.workTimer += dt;
      if (this.fxTimer <= 0) {
        ctx.fx('build', t.x, t.y);
        this.fxTimer = 0.4;
      }
      if (this.workTimer >= 1.2) {
        ctx.world.setStructure(t.x, t.y, s);
        ctx.tasks.complete(t);
        this.task = null;
        this.state = DwarfState.IDLE;
      }
      return;
    }
    if (t.type === 'demolish') {
      if (ctx.world.structureAt(t.x, t.y) === S.NONE) {
        ctx.tasks.complete(t);
        this.task = null;
        this.state = DwarfState.IDLE;
        return;
      }
      t.progress += dt;
      if (t.progress >= 1.5) {
        // 拆除退还建筑库存
        ctx.inv.addStructure(t.structure ?? ctx.world.structureAt(t.x, t.y), 1);
        ctx.world.setStructure(t.x, t.y, S.NONE);
        ctx.fx('build', t.x, t.y);
        ctx.tasks.complete(t);
        this.task = null;
        this.state = DwarfState.IDLE;
      }
      return;
    }
    if (t.type === 'craft') {
      const recipe = RECIPES.find((r) => r.id === t.recipeId);
      if (!recipe) {
        ctx.tasks.complete(t);
        this.task = null;
        this.state = DwarfState.IDLE;
        return;
      }
      t.progress += dt;
      if (t.progress >= recipe.time) {
        if (recipe.outStructure) {
          ctx.inv.addStructure(recipe.outStructure, recipe.outCount);
        } else if (recipe.outRes) {
          ctx.inv.add(recipe.outRes, recipe.outCount);
        }
        ctx.fx('craft', this.x, this.y);
        ctx.tasks.complete(t);
        this.task = null;
        this.state = DwarfState.IDLE;
      }
      return;
    }
  }

  // ---------- 搬运 ----------

  private nearBase(ctx: Ctx, r: number): boolean {
    return Math.hypot(ctx.base.x + 0.5 - this.x, ctx.base.y + 0.5 - this.y) <= r;
  }

  private deposit(ctx: Ctx): void {
    if (this.carried) {
      const fit = ctx.inv.add(this.carried.res, this.carried.n);
      const left = this.carried.n - fit;
      ctx.fx('deposit', ctx.base.x, ctx.base.y);
      if (left > 0) {
        ctx.spawnDrop(this.carried.res, left, ctx.base.x, ctx.base.y);
      }
      this.carried = null;
    }
    this.state = DwarfState.IDLE;
  }

  private canCarry(ctx: Ctx, res: Res): boolean {
    if (this.carried === null) return true;
    return this.carried.res === res && this.carried.n < DWARF.carry;
  }

  private pickupNearby(ctx: Ctx): boolean {
    for (const drop of ctx.drops) {
      if (drop.n <= 0 || drop.claimedBy !== null) continue;
      if (!this.canCarry(ctx, drop.res)) continue;
      if (Math.hypot(drop.x - this.x, drop.y - this.y) > 0.9) continue;
      const space = this.carried ? DWARF.carry - this.carried.n : DWARF.carry;
      const take = Math.min(space, drop.n);
      if (this.carried) this.carried.n += take;
      else this.carried = { res: drop.res, n: take };
      drop.n -= take;
      if (drop.n <= 0) {
        drop.claimedBy = null;
        this.haulDrop = null;
      }
      ctx.fx('pickup', drop.x, drop.y);
      return true;
    }
    return false;
  }

  private findHaulJob(ctx: Ctx): boolean {
    // 候选按距离排序后限次寻路，避免掉落物很多时一帧内执行大量 A* 搜索
    const cands: { drop: Drop; dist: number }[] = [];
    for (const drop of ctx.drops) {
      if (drop.n <= 0 || drop.claimedBy !== null) continue;
      if (drop.ignoreUntil > ctx.time.elapsed) continue;
      if (!this.canCarry(ctx, drop.res)) continue;
      const dist = Math.hypot(drop.x - this.x, drop.y - this.y);
      if (dist > 45) continue;
      cands.push({ drop, dist });
    }
    cands.sort((a, b) => a.dist - b.dist);
    for (const { drop } of cands.slice(0, 8)) {
      const p = pathToTile(ctx.world, this.tile(), { x: Math.floor(drop.x), y: Math.floor(drop.y) });
      if (!p) {
        drop.ignoreUntil = ctx.time.elapsed + 8;
        continue;
      }
      drop.claimedBy = this.id;
      this.haulDrop = drop;
      this.path = p;
      this.pathIdx = 0;
      this.state = DwarfState.TO_DROP;
      return true;
    }
    return false;
  }

  serialize() {
    return {
      id: this.id,
      name: this.name,
      variant: this.variant,
      x: this.x,
      y: this.y,
      hp: this.hp,
      hunger: this.hunger,
      energy: this.energy,
      carried: this.carried ? { ...this.carried } : null,
      armed: this.armed,
    };
  }

  static deserialize(d: ReturnType<Dwarf['serialize']>): Dwarf {
    const dw = new Dwarf(d.x, d.y, d.variant, d.name);
    dw.id = d.id;
    dw.hp = d.hp;
    dw.hunger = d.hunger;
    dw.energy = d.energy;
    dw.carried = d.carried;
    dw.armed = d.armed;
    if (d.id >= Dwarf.NEXT_ID) Dwarf.NEXT_ID = d.id + 1;
    return dw;
  }
}
