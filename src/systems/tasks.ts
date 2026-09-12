/** 任务系统：挖掘/建造/拆除/合成 的标记、认领与完成 */
import { S, T, TERRAIN } from '../core/defs';
import type { MatList } from '../core/defs';
import type { World } from '../world/world';
import { pathToAdjacent, Pt } from '../world/pathfinding';
import type { Inventory } from './inventory';

export type TaskType = 'dig' | 'build' | 'demolish' | 'craft';

export interface Task {
  id: number;
  type: TaskType;
  x: number;
  y: number;
  /** build: 要放置的建筑 */
  structure?: S;
  /** craft: 配方 id */
  recipeId?: string;
  /** craft: 工作站位置（-1 表示徒手就地合成） */
  stationX?: number;
  stationY?: number;
  /** build: 已预留的建造库存（占用 stock） */
  structureReserved?: S;
  claimedBy: number | null;
  /** 已积累工作秒数 */
  progress: number;
  /** 寻路失败冷却 */
  cooldown: number;
}

export interface TaskClaim {
  task: Task;
  path: Pt[];
}

export class TaskManager {
  tasks: Task[] = [];
  private nextId = 1;
  /** 认领轮转游标：避免每次都只尝试最近的任务导致远端任务被饿死 */
  private claimCursor = 0;
  /** 单次认领最多尝试的寻路次数（防止大面积框选时一帧内执行上百次 A*） */
  private static CLAIM_MAX_TRY = 10;

  update(dt: number): void {
    for (const t of this.tasks) {
      if (t.cooldown > 0) t.cooldown = Math.max(0, t.cooldown - dt);
    }
  }

  private hasTaskAt(type: TaskType, x: number, y: number): boolean {
    return this.tasks.some((t) => t.type === type && t.x === x && t.y === y);
  }

  /** 框选标记挖掘区域。深层方块自动向上生成「竖井」任务，保证矮人总能挖到（类《打造世界》体验） */
  markDig(world: World, x0: number, y0: number, x1: number, y1: number): number {
    let n = 0;
    const [ax, bx] = x0 <= x1 ? [x0, x1] : [x1, x0];
    const [ay, by] = y0 <= y1 ? [y0, y1] : [y1, y0];
    for (let y = ay; y <= by; y++) {
      for (let x = ax; x <= bx; x++) {
        const t = world.terrainAt(x, y);
        if (t === T.AIR || TERRAIN[t].hardness === Infinity) continue;
        if (this.hasTaskAt('dig', x, y)) continue;
        this.tasks.push({ id: this.nextId++, type: 'dig', x, y, claimedBy: null, progress: 0, cooldown: 0 });
        n++;
        // 上方是实心且未标记时，逐格向上补竖井任务（直到空气/不可挖层）
        for (let yy = y - 1; yy >= 1; yy--) {
          const up = world.terrainAt(x, yy);
          if (up === T.AIR || TERRAIN[up].hardness === Infinity) break;
          if (this.hasTaskAt('dig', x, yy)) break;
          this.tasks.push({ id: this.nextId++, type: 'dig', x, y: yy, claimedBy: null, progress: 0, cooldown: 0 });
          n++;
        }
      }
    }
    return n;
  }

  /** 框选标记拆除建筑 */
  markDemolish(world: World, x0: number, y0: number, x1: number, y1: number): number {
    let n = 0;
    const [ax, bx] = x0 <= x1 ? [x0, x1] : [x1, x0];
    const [ay, by] = y0 <= y1 ? [y0, y1] : [y1, y0];
    for (let y = ay; y <= by; y++) {
      for (let x = ax; x <= bx; x++) {
        const s = world.structureAt(x, y);
        if (s === S.NONE || s === S.CAMPFIRE) continue;
        if (this.hasTaskAt('demolish', x, y)) continue;
        this.tasks.push({
          id: this.nextId++,
          type: 'demolish',
          x,
          y,
          structure: s,
          claimedBy: null,
          progress: 0,
          cooldown: 0,
        });
        n++;
      }
    }
    return n;
  }

  /** 标记建造：从建筑库存扣除并预留；失败返回原因 */
  markBuild(world: World, x: number, y: number, s: S, inv: Inventory, canPlace: (x: number, y: number, s: S) => boolean): 'ok' | 'no_stock' | 'invalid' | 'dup' {
    if (this.hasTaskAt('build', x, y)) return 'dup';
    if (inv.stockCount(s) <= 0) return 'no_stock';
    if (!canPlace(x, y, s)) return 'invalid';
    inv.takeStructure(s);
    this.tasks.push({
      id: this.nextId++,
      type: 'build',
      x,
      y,
      structure: s,
      structureReserved: s,
      claimedBy: null,
      progress: 0,
      cooldown: 0,
    });
    return 'ok';
  }

  /** 排队合成：扣材料，找工作站，生成合成任务 */
  queueCraft(
    world: World,
    inv: Inventory,
    recipeId: string,
    inputs: MatList,
    station: 'workbench' | 'furnace' | null,
    findStation: (kind: 'workbench' | 'furnace') => Pt | null
  ): 'ok' | 'no_mats' | 'no_station' | 'dup' {
    if (!inv.take(inputs)) return 'no_mats';
    let sx = -1;
    let sy = -1;
    if (station) {
      const st = findStation(station);
      if (!st) {
        // 没有工作站：退还材料
        for (const [k, v] of Object.entries(inputs)) inv.add(k as never, v ?? 0);
        return 'no_station';
      }
      sx = st.x;
      sy = st.y;
    }
    this.tasks.push({
      id: this.nextId++,
      type: 'craft',
      x: sx,
      y: sy,
      recipeId,
      stationX: sx,
      stationY: sy,
      claimedBy: null,
      progress: 0,
      cooldown: 0,
    });
    return 'ok';
  }

  /** 取消矩形区域内的标记（建造任务退还建筑库存） */
  cancelAt(world: World, x0: number, y0: number, x1: number, y1: number, inv: Inventory): number {
    const [ax, bx] = x0 <= x1 ? [x0, x1] : [x1, x0];
    const [ay, by] = y0 <= y1 ? [y0, y1] : [y1, y0];
    const before = this.tasks.length;
    this.tasks = this.tasks.filter((t) => {
      const inside = t.x >= ax && t.x <= bx && t.y >= ay && t.y <= by;
      if (!inside) return true;
      if (t.type === 'build' && t.structureReserved !== undefined) inv.addStructure(t.structureReserved, 1);
      return false;
    });
    return before - this.tasks.length;
  }

  /** 矮人认领任务：按距离排序 + 限次寻路 + 轮转起点，兼顾性能与公平 */
  claimFor(dwarfId: number, pos: Pt, world: World): TaskClaim | null {
    const cands = this.tasks.filter((t) => t.claimedBy === null && t.cooldown <= 0);
    if (cands.length === 0) return null;
    cands.sort((a, b) => Math.abs(a.x - pos.x) + Math.abs(a.y - pos.y) - (Math.abs(b.x - pos.x) + Math.abs(b.y - pos.y)));
    const n = cands.length;
    const maxTry = Math.min(TaskManager.CLAIM_MAX_TRY, n);
    let best: TaskClaim | null = null;
    for (let k = 0; k < maxTry; k++) {
      const t = cands[(k + this.claimCursor) % n];
      let path: Pt[] | null;
      if (t.type === 'craft' && t.stationX === -1) {
        path = []; // 徒手合成，就地工作
      } else {
        const target: Pt = { x: t.x, y: t.y };
        path = pathToAdjacent(world, pos, target);
      }
      if (!path) {
        t.cooldown = 2.5;
        continue;
      }
      if (!best || path.length < best.path.length) {
        best = { task: t, path };
      }
    }
    this.claimCursor = (this.claimCursor + maxTry) % n;
    if (best) best.task.claimedBy = dwarfId;
    return best;
  }

  /** 完成任务 */
  complete(task: Task): void {
    this.tasks = this.tasks.filter((t) => t !== task);
  }

  /** 放弃任务（释放认领，短暂冷却防止反复尝试） */
  abandon(task: Task, cooldown = 2): void {
    task.claimedBy = null;
    task.progress = 0;
    task.cooldown = cooldown;
  }

  serialize(): { tasks: Task[]; nextId: number } {
    return { tasks: this.tasks, nextId: this.nextId };
  }

  static deserialize(d: { tasks: Task[]; nextId: number }): TaskManager {
    const tm = new TaskManager();
    tm.tasks = d.tasks;
    tm.nextId = d.nextId;
    return tm;
  }
}
