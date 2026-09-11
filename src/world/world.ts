/** 世界瓦片数据：地形层 + 建筑层，支持 RLE 序列化 */
import { S, T, TERRAIN, STRUCTURE } from '../core/defs';

export interface WorldSave {
  w: number;
  h: number;
  seed: number;
  terrain: number[];
  structure: number[];
  surface: number[];
  structHp: [number, number][];
}

/** RLE 编码：[值, 连续长度, 值, 连续长度, ...] */
export function rleEncode(arr: Uint8Array): number[] {
  const out: number[] = [];
  let cur = arr[0];
  let run = 1;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] === cur && run < 65535) {
      run++;
    } else {
      out.push(cur, run);
      cur = arr[i];
      run = 1;
    }
  }
  out.push(cur, run);
  return out;
}

export function rleDecode(data: number[], len: number): Uint8Array {
  const out = new Uint8Array(len);
  let i = 0;
  for (let k = 0; k < data.length; k += 2) {
    const v = data[k];
    const run = data[k + 1];
    out.fill(v, i, i + run);
    i += run;
  }
  return out;
}

export class World {
  readonly w: number;
  readonly h: number;
  readonly seed: number;
  terrain: Uint8Array;
  structure: Uint8Array;
  /** 每列地表高度 */
  surface: Int16Array;
  /** 建筑剩余耐久（被怪物破坏） */
  structHp: Map<number, number> = new Map();
  /** 有光照的建筑（火把/熔炉/篝火）索引集合 */
  lightStructures: Set<number> = new Set();
  /** 瓦片变化回调（渲染层订阅） */
  onChange: ((x: number, y: number) => void) | null = null;

  constructor(w: number, h: number, seed: number) {
    this.w = w;
    this.h = h;
    this.seed = seed;
    this.terrain = new Uint8Array(w * h);
    this.structure = new Uint8Array(w * h);
    this.surface = new Int16Array(w);
  }

  idx(x: number, y: number): number {
    return y * this.w + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  terrainAt(x: number, y: number): T {
    if (!this.inBounds(x, y)) return T.BEDROCK;
    return this.terrain[this.idx(x, y)] as T;
  }

  structureAt(x: number, y: number): S {
    if (!this.inBounds(x, y)) return S.NONE;
    return this.structure[this.idx(x, y)] as S;
  }

  setTerrain(x: number, y: number, t: T): void {
    if (!this.inBounds(x, y)) return;
    this.terrain[this.idx(x, y)] = t;
    this.onChange?.(x, y);
  }

  setStructure(x: number, y: number, s: S): void {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    this.structure[i] = s;
    if (s === S.NONE) {
      this.structHp.delete(i);
      this.lightStructures.delete(i);
    } else {
      if (STRUCTURE[s].hp > 0 && STRUCTURE[s].hp < 900) this.structHp.set(i, STRUCTURE[s].hp);
      if (STRUCTURE[s].light) this.lightStructures.add(i);
    }
    this.onChange?.(x, y);
  }

  /** 玩家/怪物破坏建筑 */
  damageStructure(x: number, y: number, dmg: number): boolean {
    const s = this.structureAt(x, y);
    if (s === S.NONE) return false;
    const i = this.idx(x, y);
    if (s === S.CAMPFIRE) return false;
    const hp = (this.structHp.get(i) ?? STRUCTURE[s].hp) - dmg;
    if (hp <= 0) {
      this.setStructure(x, y, S.NONE);
      return true;
    }
    this.structHp.set(i, hp);
    return false;
  }

  structureHp(x: number, y: number): number {
    const s = this.structureAt(x, y);
    if (s === S.NONE) return 0;
    return this.structHp.get(this.idx(x, y)) ?? STRUCTURE[s].hp;
  }

  isSolidTerrain(x: number, y: number): boolean {
    return TERRAIN[this.terrainAt(x, y)].solid;
  }

  serialize(): WorldSave {
    return {
      w: this.w,
      h: this.h,
      seed: this.seed,
      terrain: rleEncode(this.terrain),
      structure: rleEncode(this.structure),
      surface: Array.from(this.surface),
      structHp: Array.from(this.structHp.entries()),
    };
  }

  static deserialize(data: WorldSave): World {
    const world = new World(data.w, data.h, data.seed);
    world.terrain = rleDecode(data.terrain, data.w * data.h);
    world.structure = rleDecode(data.structure, data.w * data.h);
    world.surface = Int16Array.from(data.surface);
    for (const [i, hp] of data.structHp) world.structHp.set(i, hp);
    for (let i = 0; i < world.structure.length; i++) {
      const s = world.structure[i] as S;
      if (s !== S.NONE) {
        if (STRUCTURE[s].hp > 0 && STRUCTURE[s].hp < 900) world.structHp.set(i, world.structHp.get(i) ?? STRUCTURE[s].hp);
        if (STRUCTURE[s].light) world.lightStructures.add(i);
      }
    }
    return world;
  }
}
