/** 资源背包与建筑库存（容量限制、序列化） */
import type { MatList, Res, S } from '../core/defs';
import { RES_ORDER } from '../core/defs';

export interface InvSave {
  counts: [Res, number][];
  stock: [S, number][];
  bonus: number;
}

export class Inventory {
  counts: Record<Res, number> = {
    wood: 0,
    stone: 0,
    coal: 0,
    ironOre: 0,
    ironBar: 0,
    gold: 0,
    food: 0,
    sword: 0,
  };
  /** 已合成的待放置建筑库存 */
  stock: Map<S, number> = new Map();
  /** 基础容量 + 储物箱加成 */
  baseCapacity = 300;
  bonusCapacity = 0;

  get capacity(): number {
    return this.baseCapacity + this.bonusCapacity;
  }

  used(): number {
    let n = 0;
    for (const r of RES_ORDER) n += this.counts[r];
    for (const [, c] of this.stock) n += c;
    return n;
  }

  free(): number {
    return Math.max(0, this.capacity - this.used());
  }

  /** 添加资源，返回实际入库数量（受容量限制） */
  add(res: Res, n: number): number {
    const fit = Math.max(0, Math.min(n, this.free()));
    this.counts[res] += fit;
    return fit;
  }

  remove(res: Res, n: number): boolean {
    if (this.counts[res] < n) return false;
    this.counts[res] -= n;
    return true;
  }

  count(res: Res): number {
    return this.counts[res];
  }

  has(mats: MatList): boolean {
    for (const k of Object.keys(mats) as Res[]) {
      if (this.counts[k] < (mats[k] ?? 0)) return false;
    }
    return true;
  }

  /** 消耗材料，返回是否成功 */
  take(mats: MatList): boolean {
    if (!this.has(mats)) return false;
    for (const k of Object.keys(mats) as Res[]) this.counts[k] -= mats[k] ?? 0;
    return true;
  }

  stockCount(s: S): number {
    return this.stock.get(s) ?? 0;
  }

  addStructure(s: S, n = 1): void {
    this.stock.set(s, (this.stock.get(s) ?? 0) + n);
  }

  takeStructure(s: S): boolean {
    const c = this.stock.get(s) ?? 0;
    if (c <= 0) return false;
    this.stock.set(s, c - 1);
    return true;
  }

  serialize(): InvSave {
    return {
      counts: RES_ORDER.map((r) => [r, this.counts[r]] as [Res, number]),
      stock: Array.from(this.stock.entries()) as [S, number][],
      bonus: this.bonusCapacity,
    };
  }

  static deserialize(d: InvSave): Inventory {
    const inv = new Inventory();
    for (const [r, n] of d.counts) inv.counts[r] = n;
    inv.stock = new Map(d.stock);
    inv.bonusCapacity = d.bonus;
    return inv;
  }
}
