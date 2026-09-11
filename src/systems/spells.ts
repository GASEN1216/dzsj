/** 玩家法术：加速 / 照明 / 治疗（共享冷却） */
import { SPELLS, DWARF, SpellDef } from '../core/defs';
import type { Ctx } from '../core/types';

export type SpellId = SpellDef['id'];

export interface SpellLight {
  x: number;
  y: number;
  ttl: number;
  r: number;
}

export class SpellSystem {
  cds: Record<SpellId, number> = { speed: 0, light: 0, heal: 0 };
  activeSpeed = 0;
  lights: SpellLight[] = [];

  update(dt: number): void {
    for (const s of SPELLS) {
      if (this.cds[s.id] > 0) this.cds[s.id] = Math.max(0, this.cds[s.id] - dt);
    }
    if (this.activeSpeed > 0) this.activeSpeed = Math.max(0, this.activeSpeed - dt);
    for (const l of this.lights) l.ttl -= dt;
    this.lights = this.lights.filter((l) => l.ttl > 0);
  }

  canCast(id: SpellId): boolean {
    return this.cds[id] <= 0;
  }

  /** 在世界坐标（格）施法 */
  cast(id: SpellId, x: number, y: number, ctx: Ctx): boolean {
    if (!this.canCast(id)) return false;
    const def = SPELLS.find((s) => s.id === id)!;
    if (id === 'speed') {
      this.activeSpeed = def.duration;
    } else if (id === 'light') {
      this.lights.push({ x, y, ttl: def.duration, r: def.radius });
    } else if (id === 'heal') {
      const r2 = def.radius * def.radius;
      const targets = ctx.dwarves.filter((d) => !d.dead && (d.x - x) ** 2 + (d.y - y) ** 2 <= r2);
      if (targets.length === 0) return false;
      for (const d of targets) d.hp = DWARF.maxHp;
    }
    this.cds[id] = def.cooldown;
    ctx.fx('spell', x, y);
    return true;
  }

  serialize(): { cds: Record<SpellId, number>; activeSpeed: number; lights: SpellLight[] } {
    return { cds: { ...this.cds }, activeSpeed: this.activeSpeed, lights: this.lights.map((l) => ({ ...l })) };
  }

  static deserialize(d: { cds: Record<SpellId, number>; activeSpeed: number; lights: SpellLight[] }): SpellSystem {
    const s = new SpellSystem();
    s.cds = { ...d.cds };
    s.activeSpeed = d.activeSpeed;
    s.lights = d.lights;
    return s;
  }
}
