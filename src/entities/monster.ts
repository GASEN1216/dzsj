/** 怪物 AI：追击最近矮人、砸门/拆墙/啃地形、白天在地表燃烧、触发陷阱 */
import { MONSTER, MonsterKind, S, T, TERRAIN } from '../core/defs';
import type { Combatant, Ctx } from '../core/types';
import { NavGrid, Pt, pathToAdjacent } from '../world/pathfinding';
import type { Dwarf } from './dwarf';

export class Monster implements Combatant {
  kind: MonsterKind;
  x: number;
  y: number;
  hp: number;
  dead = false;
  attackCd = 0;
  repathCd = 0;
  path: Pt[] | null = null;
  pathIdx = 0;
  /** 正在啃的地形块 */
  chewTile: Pt | null = null;
  chewProgress = 0;
  faceLeft = false;

  constructor(kind: MonsterKind, x: number, y: number) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.hp = MONSTER[kind].hp;
  }

  get info() {
    return MONSTER[this.kind];
  }

  takeDamage(d: number): void {
    this.hp -= d;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
  }

  update(ctx: Ctx, dt: number): void {
    if (this.dead) return;
    const info = this.info;
    this.attackCd -= dt;
    this.repathCd -= dt;

    const tx = Math.floor(this.x);
    const ty = Math.floor(this.y);

    // 白天在地表燃烧（洞穴里的不受影响）
    const sy = ctx.world.surface[Math.max(0, Math.min(ctx.world.w - 1, tx))];
    if (!ctx.time.isNight && this.y <= sy + 0.6) {
      this.hp -= 3 * dt;
      if (this.hp <= 0) {
        this.hp = 0;
        this.dead = true;
        return;
      }
    }

    // 陷阱
    if (ctx.world.structureAt(tx, ty) === S.TRAP) {
      this.takeDamage(30);
      ctx.world.setStructure(tx, ty, S.NONE);
      ctx.fx('trap', tx, ty);
      if (this.dead) return;
    }

    // 追击最近的矮人
    let target: Dwarf | null = null;
    let bd = Infinity;
    for (const d of ctx.dwarves) {
      if (d.dead) continue;
      const dist = Math.hypot(d.x - this.x, d.y - this.y);
      if (dist < bd) {
        bd = dist;
        target = d;
      }
    }
    if (!target) return;

    // 攻击距离内直接攻击
    if (bd <= 1.3) {
      if (this.attackCd <= 0) {
        target.takeDamage(info.dmg);
        this.attackCd = info.cd;
        ctx.fx('hurt', target.x, target.y);
        this.faceLeft = target.x < this.x;
      }
      return;
    }

    // 寻路（怪物模式：可破坏门/墙/地形）
    if (!this.path || this.repathCd <= 0 || this.pathIdx >= this.path.length) {
      this.path = pathToAdjacent(ctx.world, { x: tx, y: ty }, { x: Math.floor(target.x), y: Math.floor(target.y) }, { forMonster: true });
      this.pathIdx = 0;
      this.repathCd = 1.2;
      this.chewTile = null;
    }
    if (!this.path || this.path.length === 0) {
      // 无路可走：原地砸相邻的方块（砸门/墙优先）
      this.attackNeighborBlock(ctx);
      return;
    }

    // 沿路径移动；下一个节点若是实体方块则攻击破坏
    const wp = this.path[this.pathIdx];
    const nav = new NavGrid(ctx.world);
    const wpBlockedForDwarf = !nav.passable(wp.x, wp.y);
    if (wpBlockedForDwarf) {
      this.attackBlock(ctx, wp);
      return;
    }
    const txp = wp.x + 0.5;
    const typ = wp.y + 0.5;
    const dx = txp - this.x;
    const dy = typ - this.y;
    const dist = Math.hypot(dx, dy);
    const step = info.speed * dt;
    if (dist <= step || dist < 0.03) {
      this.x = txp;
      this.y = typ;
      this.pathIdx++;
    } else {
      if (Math.abs(dx) > 0.01) this.faceLeft = dx < 0;
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }

  /** 攻击路径上的阻挡方块 */
  private attackBlock(ctx: Ctx, wp: Pt): void {
    if (this.attackCd > 0) return;
    this.attackCd = this.info.cd;
    this.faceLeft = wp.x + 0.5 < this.x;
    const s = ctx.world.structureAt(wp.x, wp.y);
    if (s !== S.NONE && s !== S.CAMPFIRE) {
      ctx.fx('dig', wp.x, wp.y);
      if (ctx.world.damageStructure(wp.x, wp.y, this.info.dmg)) {
        ctx.fx('build', wp.x, wp.y); // 破碎声
        this.path = null;
      }
      return;
    }
    const t = ctx.world.terrainAt(wp.x, wp.y);
    if (t === T.AIR) return;
    // 啃地形（速度较慢）
    if (!this.chewTile || this.chewTile.x !== wp.x || this.chewTile.y !== wp.y) {
      this.chewTile = { x: wp.x, y: wp.y };
      this.chewProgress = 0;
    }
    ctx.fx('dig', wp.x, wp.y);
    this.chewProgress += this.info.dmg;
    const hardness = TERRAIN[t].hardness * 4;
    if (this.chewProgress >= hardness) {
      ctx.world.setTerrain(wp.x, wp.y, T.AIR); // 怪物啃掉的地形不掉落
      this.path = null;
    }
  }

  /** 无路可走时砸相邻方块 */
  private attackNeighborBlock(ctx: Ctx): void {
    const tx = Math.floor(this.x);
    const ty = Math.floor(this.y);
    const cands: Pt[] = [
      { x: tx + 1, y: ty },
      { x: tx - 1, y: ty },
      { x: tx, y: ty - 1 },
      { x: tx, y: ty + 1 },
    ];
    for (const c of cands) {
      const s = ctx.world.structureAt(c.x, c.y);
      if (s !== S.NONE && s !== S.CAMPFIRE) {
        this.attackBlock(ctx, c);
        return;
      }
    }
  }

  serialize(): { kind: MonsterKind; x: number; y: number; hp: number } {
    return { kind: this.kind, x: this.x, y: this.y, hp: this.hp };
  }

  static deserialize(d: ReturnType<Monster['serialize']>): Monster {
    const m = new Monster(d.kind, d.x, d.y);
    m.hp = d.hp;
    return m;
  }
}
