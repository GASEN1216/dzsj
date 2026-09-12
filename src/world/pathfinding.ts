/** A* 寻路：支持爬梯、上台阶 1 格；怪物模式可将可破坏方块视为高代价通行 */
import { S, T } from '../core/defs';
import { World } from './world';

export interface Pt {
  x: number;
  y: number;
}

interface Node {
  x: number;
  y: number;
  g: number;
  f: number;
  parent: Node | null;
}

/** 二叉小顶堆 */
class MinHeap {
  private a: Node[] = [];
  get size(): number {
    return this.a.length;
  }
  push(n: Node): void {
    const a = this.a;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): Node | undefined {
    const a = this.a;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

const manhattan = (ax: number, ay: number, bx: number, by: number): number => Math.abs(ax - bx) + Math.abs(ay - by);

export class NavGrid {
  constructor(
    public world: World,
    /** 怪物模式：可破坏地形/墙体以高代价通行，且不能自由攀爬台阶 */
    public forMonster = false
  ) {}

  /** 地形是否可通行 */
  terrainPassable(x: number, y: number): boolean {
    const t = this.world.terrainAt(x, y);
    if (t === T.AIR) return true;
    return this.forMonster && t !== T.BEDROCK;
  }

  /** 单格通行判断（含建筑） */
  passable(x: number, y: number): boolean {
    if (!this.world.inBounds(x, y)) return false;
    if (!this.terrainPassable(x, y)) return false;
    const s = this.world.structureAt(x, y);
    if (s === S.WALL_WOOD || s === S.WALL_STONE) return this.forMonster;
    return true;
  }

  /** 进入该格的额外代价（怪物破坏方块；代价越低越优先砸） */
  enterCost(x: number, y: number): number {
    let cost = 0;
    const t = this.world.terrainAt(x, y);
    if (t !== T.AIR) cost += 26; // 啃泥土/岩石很费劲
    const s = this.world.structureAt(x, y);
    if (s === S.WALL_WOOD) cost += 12;
    if (s === S.WALL_STONE) cost += 22;
    if (s === S.DOOR) cost += 5; // 怪物偏好砸门
    return cost;
  }

  ladderAt(x: number, y: number): boolean {
    return this.world.structureAt(x, y) === S.LADDER;
  }

  /** 该格是否可以站立 */
  canStand(x: number, y: number): boolean {
    if (this.ladderAt(x, y)) return true;
    if (this.world.structureAt(x, y) === S.FLOOR_WOOD) return true;
    if (this.world.isSolidTerrain(x, y + 1)) return true;
    const below = this.world.structureAt(x, y + 1);
    return below === S.WALL_WOOD || below === S.WALL_STONE;
  }

  /** 从 (x,y) 出发所有可走的相邻格及代价 */
  neighbors(x: number, y: number): { x: number; y: number; cost: number }[] {
    const out: { x: number; y: number; cost: number }[] = [];
    const tryAdd = (nx: number, ny: number, base: number): void => {
      if (!this.passable(nx, ny)) return;
      out.push({ x: nx, y: ny, cost: base + this.enterCost(nx, ny) });
    };
    const ladderHere = this.ladderAt(x, y);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.world.inBounds(nx, ny)) continue;
      if (!this.passable(nx, ny)) continue;
      if (dy === -1) {
        // 向上：走梯子，或矮人攀爬 1 格台阶（目标必须可站立，代价更高；怪物不会攀爬）
        if (ladderHere || this.ladderAt(nx, ny)) out.push({ x: nx, y: ny, cost: 1.2 + this.enterCost(nx, ny) });
        else if (!this.forMonster && this.canStand(nx, ny)) out.push({ x: nx, y: ny, cost: 2.6 + this.enterCost(nx, ny) });
      } else if (dy === 1) {
        // 向下：落到可站立处或梯子
        if (this.canStand(nx, ny) || this.ladderAt(nx, ny) || ladderHere) {
          tryAdd(nx, ny, 1);
        } else if (!this.forMonster && this.terrainPassable(nx, ny)) {
          // 自由下落：矮人受重力，允许走下最多 6 格的落差，落到首个可站立格
          let fy = ny;
          while (fy < this.world.h - 1 && fy - ny < 6 && this.terrainPassable(nx, fy) && !this.canStand(nx, fy) && !this.ladderAt(nx, fy)) fy++;
          if (this.terrainPassable(nx, fy) && this.canStand(nx, fy)) tryAdd(nx, fy, 1 + (fy - ny) * 0.3);
        }
      } else {
        // 水平：目标必须可站立/梯子，避免坠崖
        if (this.canStand(nx, ny) || this.ladderAt(nx, ny) || ladderHere) tryAdd(nx, ny, 1);
      }
    }
    return out;
  }
}

export interface PathOptions {
  forMonster?: boolean;
  /** 最大扩展节点数，防止大范围搜索卡顿 */
  maxExpand?: number;
}

/**
 * A* 搜索：goalTest 返回 true 的格子即终点。
 * 返回路径（不含起点），找不到返回 null。
 */
export function findPath(
  world: World,
  start: Pt,
  heuristic: (x: number, y: number) => number,
  goalTest: (x: number, y: number) => boolean,
  opts: PathOptions = {}
): Pt[] | null {
  const nav = opts.forMonster ? new NavGrid(world, true) : new NavGrid(world, false);
  if (!nav.passable(start.x, start.y)) return null;
  const maxExpand = opts.maxExpand ?? 9000;
  const open = new MinHeap();
  const best = new Map<number, number>();
  const key = (x: number, y: number): number => y * world.w + x;
  const startNode: Node = { x: start.x, y: start.y, g: 0, f: heuristic(start.x, start.y), parent: null };
  open.push(startNode);
  best.set(key(start.x, start.y), 0);
  let expanded = 0;

  while (open.size > 0 && expanded < maxExpand) {
    const cur = open.pop()!;
    const ck = key(cur.x, cur.y);
    if ((best.get(ck) ?? Infinity) < cur.g) continue;
    if (goalTest(cur.x, cur.y)) {
      const path: Pt[] = [];
      let n: Node | null = cur;
      while (n) {
        path.push({ x: n.x, y: n.y });
        n = n.parent;
      }
      path.reverse();
      path.shift(); // 去掉起点（起点即目标时返回空路径 = 已就位）
      return path;
    }
    expanded++;
    for (const nb of nav.neighbors(cur.x, cur.y)) {
      const g = cur.g + nb.cost;
      const k = key(nb.x, nb.y);
      if (g < (best.get(k) ?? Infinity)) {
        best.set(k, g);
        open.push({ x: nb.x, y: nb.y, g, f: g + heuristic(nb.x, nb.y), parent: cur });
      }
    }
  }
  return null;
}

/** 走到目标格旁（曼哈顿距离 1 的可站立格），用于挖掘/建造。
 *  矮人模式下若目标四邻全为实心地形（「埋藏」块，如山坡侧面深层矿），则允许站在
 *  曼哈顿距离 2 的可站立格开工——否则这类任务永远无法寻路。
 *  怪物模式保持原语义（怪物有贴身攻击与原地砸块逻辑，不能停在 2 格外）。 */
export function pathToAdjacent(world: World, start: Pt, target: Pt, opts: PathOptions = {}): Pt[] | null {
  const nav = new NavGrid(world, opts.forMonster ?? false);
  const buried =
    !nav.forMonster &&
    world.isSolidTerrain(target.x - 1, target.y) &&
    world.isSolidTerrain(target.x + 1, target.y) &&
    world.isSolidTerrain(target.x, target.y - 1) &&
    world.isSolidTerrain(target.x, target.y + 1);
  return findPath(
    world,
    start,
    (x, y) => Math.max(0, manhattan(x, y, target.x, target.y) - 1),
    (x, y) => {
      const m = manhattan(x, y, target.x, target.y);
      if (m === 1) return true;
      return buried && m === 2 && nav.canStand(x, y);
    },
    opts
  );
}

/** 直接走到目标格（可站立） */
export function pathToTile(world: World, start: Pt, target: Pt, opts: PathOptions = {}): Pt[] | null {
  return findPath(world, start, (x, y) => manhattan(x, y, target.x, target.y), (x, y) => x === target.x && y === target.y, opts);
}
