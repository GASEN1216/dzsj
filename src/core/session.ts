/** 游戏会话：组装全部系统并按帧驱动（不依赖 Phaser，可单元测试仿真） */
import { Res, S } from './defs';
import { Ctx, Drop, FxEvent, FxType, Light } from './types';
import { World } from '../world/world';
import { canPlaceStructure, generateWorld } from '../world/worldGen';
import { Inventory } from '../systems/inventory';
import { TaskManager } from '../systems/tasks';
import { TechSystem } from '../systems/crafting';
import { GameTime } from '../systems/time';
import { SpellSystem, SpellId } from '../systems/spells';
import { Spawner } from '../systems/spawner';
import { Dwarf } from '../entities/dwarf';
import { Monster } from '../entities/monster';
import { NavGrid, Pt } from '../world/pathfinding';
import { mulberry32, randInt } from './rng';

export interface SessionSettings {
  volume: number;
  speed: 0 | 1 | 2;
}

export interface SaveData {
  v: 1;
  seed: number;
  time: ReturnType<GameTime['serialize']>;
  world: ReturnType<World['serialize']>;
  inv: ReturnType<Inventory['serialize']>;
  techs: string[];
  tasks: ReturnType<TaskManager['serialize']>;
  dwarves: ReturnType<Dwarf['serialize']>[];
  drops: Drop[];
  base: Pt;
  spells: ReturnType<SpellSystem['serialize']>;
}

export class GameSession {
  world: World;
  seed: number;
  base: Pt;
  inv = new Inventory();
  techs = new TechSystem();
  tasks = new TaskManager();
  time = new GameTime();
  spells = new SpellSystem();
  spawner = new Spawner();
  dwarves: Dwarf[] = [];
  monsters: Monster[] = [];
  drops: Drop[] = [];
  fxQueue: FxEvent[] = [];
  gameOver = false;
  settings: SessionSettings = { volume: 0.7, speed: 1 };
  private rand: () => number;
  private nextDropId = 1;
  private prevNight = false;

  constructor(world: World, base: Pt, seed: number) {
    this.world = world;
    this.base = base;
    this.seed = seed;
    this.rand = mulberry32(seed ^ 0xbeef01);
  }

  /** 新游戏：生成世界、篝火、初始物资与矮人小队 */
  static newGame(seed = Math.floor(Math.random() * 1e9)): GameSession {
    const { world, spawn } = generateWorld(seed);
    const s = new GameSession(world, spawn, seed);
    world.setStructure(spawn.x, spawn.y, S.CAMPFIRE);
    s.inv.add('wood', 30);
    s.inv.add('stone', 12);
    s.inv.add('food', 8);
    for (let i = 0; i < 4; i++) {
      const d = new Dwarf(spawn.x + 0.5 + (i % 2) * 0.6 - 0.3, spawn.y - Math.floor(i / 2), i % 3);
      s.dwarves.push(d);
    }
    s.fx('msg', undefined, undefined, '白天采集资源、建造庇护所，夜晚怪物将来袭！');
    return s;
  }

  // ---------- 每帧更新 ----------

  update(dt: number): void {
    if (this.gameOver || dt <= 0) return;
    this.time.update(dt);

    // 昼夜交替事件
    if (this.time.isNight && !this.prevNight) {
      this.fx('night', undefined, undefined, '夜幕降临，怪物出没了！');
      this.spawner.spawnWave(this.buildCtx(), this.time.day);
    } else if (!this.time.isNight && this.prevNight) {
      this.fx('dawn', undefined, undefined, '天亮了，怪物在地表燃烧殆尽。');
    }
    this.prevNight = this.time.isNight;

    const ctx = this.buildCtx();
    this.spawner.update(ctx, dt);
    this.tasks.update(dt);
    this.spells.update(dt);

    for (const d of this.dwarves) d.update(ctx, dt);
    this.dwarves = this.dwarves.filter((d) => {
      if (!d.dead) return true;
      this.fx('die', d.x, d.y, `${d.name} 倒下了！`);
      return false;
    });
    if (this.dwarves.length === 0) {
      this.gameOver = true;
      this.fx('msg', undefined, undefined, '所有矮人都倒下了……王国覆灭。');
    }

    for (const m of this.monsters) m.update(ctx, dt);
    this.monsters = this.monsters.filter((m) => {
      if (!m.dead) return true;
      this.fx('mdie', m.x, m.y);
      ctx.spawnDrop('food', randInt(1, 2, this.rand), Math.floor(m.x), Math.floor(m.y));
      if (this.rand() < 0.35) ctx.spawnDrop('gold', randInt(1, 2, this.rand), Math.floor(m.x), Math.floor(m.y));
      return false;
    });

    this.updateDrops(dt);

    // 铁剑自动装备
    if (this.inv.count('sword') > 0) {
      const d = this.dwarves.find((dw) => !dw.dead && !dw.armed);
      if (d) {
        this.inv.remove('sword', 1);
        d.armed = true;
        this.fx('equip', d.x, d.y, `${d.name} 装备了铁剑！`);
      }
    }

    this.updateCapacity();
  }

  private updateDrops(dt: number): void {
    const nav = new NavGrid(this.world);
    for (const d of this.drops) {
      if (d.n <= 0) continue;
      const tx = Math.max(0, Math.min(this.world.w - 1, Math.floor(d.x)));
      const ty = Math.max(0, Math.min(this.world.h - 1, Math.floor(d.y)));
      if (nav.canStand(tx, ty)) continue;
      d.vy += 26 * dt;
      let ny = d.y + d.vy * dt;
      const nty = Math.floor(ny);
      if (nav.canStand(tx, nty)) {
        ny = nty + 0.55;
        d.vy = 0;
      }
      d.y = Math.min(ny, this.world.h - 1.5);
    }
    this.drops = this.drops.filter((d) => d.n > 0 && d.y < this.world.h - 1);
  }

  private updateCapacity(): void {
    let chests = 0;
    for (let i = 0; i < this.world.structure.length; i++) {
      if (this.world.structure[i] === S.CHEST) chests++;
    }
    this.inv.bonusCapacity = chests * 150;
  }

  buildCtx(): Ctx {
    return {
      world: this.world,
      tasks: this.tasks,
      inv: this.inv,
      techs: this.techs,
      time: this.time,
      dwarves: this.dwarves,
      monsters: this.monsters,
      drops: this.drops,
      base: this.base,
      lights: this.computeLights(),
      speedBoost: this.spells.activeSpeed > 0 ? 2 : 1,
      fx: (type: FxType, x?: number, y?: number, text?: string) => this.fx(type, x, y, text),
      spawnDrop: (res: Res, n: number, x: number, y: number) => this.spawnDrop(res, n, x, y),
      rand: this.rand,
    };
  }

  private computeLights(): Light[] {
    const out: Light[] = [];
    for (const i of this.world.lightStructures) {
      const s = this.world.structure[i] as S;
      const r = s === S.CAMPFIRE ? 6 : s === S.TORCH ? 4.5 : s === S.FURNACE ? 3 : 0;
      if (r > 0) out.push({ x: (i % this.world.w) + 0.5, y: Math.floor(i / this.world.w) + 0.5, r });
    }
    for (const l of this.spells.lights) out.push({ x: l.x, y: l.y, r: l.r });
    for (const d of this.dwarves) {
      if (!d.dead) out.push({ x: d.x, y: d.y, r: 2.2 });
    }
    return out;
  }

  fx(type: FxType, x?: number, y?: number, text?: string): void {
    this.fxQueue.push({ type, x, y, text });
    if (this.fxQueue.length > 120) this.fxQueue.splice(0, this.fxQueue.length - 120);
  }

  spawnDrop(res: Res, n: number, x: number, y: number): void {
    if (n <= 0) return;
    this.drops.push({ id: this.nextDropId++, res, n, x: x + 0.5, y: y + 0.5, vy: 0, claimedBy: null, ignoreUntil: 0 });
  }

  // ---------- 玩家操作接口 ----------

  markDig(x0: number, y0: number, x1: number, y1: number): number {
    return this.tasks.markDig(this.world, x0, y0, x1, y1);
  }

  markDemolish(x0: number, y0: number, x1: number, y1: number): number {
    return this.tasks.markDemolish(this.world, x0, y0, x1, y1);
  }

  markBuild(x: number, y: number, s: S): 'ok' | 'no_stock' | 'invalid' | 'dup' {
    return this.tasks.markBuild(this.world, x, y, s, this.inv, (bx, by, bs) => canPlaceStructure(this.world, bx, by, bs));
  }

  cancelMarks(x0: number, y0: number, x1: number, y1: number): number {
    return this.tasks.cancelAt(this.world, x0, y0, x1, y1, this.inv);
  }

  queueCraft(recipeId: string): boolean {
    const r = this.techs.recipeById(recipeId);
    if (!r) return false;
    if (!this.techs.recipeAvailable(r)) {
      this.fx('msg', undefined, undefined, `「${r.name}」的科技尚未解锁`);
      return false;
    }
    const res = this.tasks.queueCraft(this.world, this.inv, recipeId, r.inputs, r.station, (kind) => this.findStation(kind));
    if (res === 'no_mats') {
      this.fx('msg', undefined, undefined, '材料不足！');
      return false;
    }
    if (res === 'no_station') {
      this.fx('msg', undefined, undefined, `需要${r.station === 'furnace' ? '熔炉' : '工作台'}才能合成「${r.name}」`);
      return false;
    }
    this.fx('msg', undefined, undefined, `已排队合成：${r.name}`);
    return true;
  }

  /** 找到距基地最近的工作站 */
  findStation(kind: 'workbench' | 'furnace'): Pt | null {
    const want = kind === 'workbench' ? S.WORKBENCH : S.FURNACE;
    let best: Pt | null = null;
    let bd = Infinity;
    for (let i = 0; i < this.world.structure.length; i++) {
      if (this.world.structure[i] !== want) continue;
      const p: Pt = { x: i % this.world.w, y: Math.floor(i / this.world.w) };
      const d = Math.hypot(p.x - this.base.x, p.y - this.base.y);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  research(techId: string): boolean {
    const t = this.techs.techById(techId);
    if (!t) return false;
    if (!this.techs.research(t, this.inv)) {
      this.fx('msg', undefined, undefined, this.techs.unlocked.has(t.id) ? '该科技已解锁' : '资源不足或前置科技未解锁');
      return false;
    }
    this.fx('msg', undefined, undefined, `研究完成：${t.name}！`);
    return true;
  }

  castSpell(id: SpellId, wx: number, wy: number): boolean {
    return this.spells.cast(id, wx, wy, this.buildCtx());
  }

  // ---------- 存档 ----------

  serialize(): SaveData {
    return {
      v: 1,
      seed: this.seed,
      time: this.time.serialize(),
      world: this.world.serialize(),
      inv: this.inv.serialize(),
      techs: this.techs.serialize(),
      tasks: this.tasks.serialize(),
      dwarves: this.dwarves.filter((d) => !d.dead).map((d) => d.serialize()),
      drops: this.drops.map((d) => ({ ...d })),
      base: this.base,
      spells: this.spells.serialize(),
    };
  }

  static fromSave(data: SaveData): GameSession {
    const world = World.deserialize(data.world);
    const s = new GameSession(world, data.base, data.seed);
    s.time = GameTime.deserialize(data.time);
    s.inv = Inventory.deserialize(data.inv);
    s.techs = TechSystem.deserialize(data.techs);
    s.tasks = TaskManager.deserialize(data.tasks);
    s.spells = SpellSystem.deserialize(data.spells);
    s.dwarves = data.dwarves.map((d) => Dwarf.deserialize(d));
    s.drops = data.drops.map((d) => ({ ...d }));
    s.prevNight = s.time.isNight;
    return s;
  }
}
