/** 怪物刷新：夜晚地面进攻波次 + 白天洞穴零星刷新 */
import { Monster } from '../entities/monster';
import { MonsterKind } from '../core/defs';
import type { Ctx } from '../core/types';

export class Spawner {
  nightTimer = 6;
  caveTimer = 25;

  update(ctx: Ctx, dt: number): void {
    const alive = ctx.monsters.filter((m) => !m.dead);
    if (ctx.time.isNight) {
      this.nightTimer -= dt;
      if (this.nightTimer <= 0) {
        this.nightTimer = 16;
        const cap = 10;
        if (alive.length < cap) this.spawnSurfaceGroup(ctx, Math.min(2, cap - alive.length));
      }
    } else {
      this.caveTimer -= dt;
      if (this.caveTimer <= 0) {
        this.caveTimer = 22;
        if (alive.length < 4 && ctx.rand() < 0.3) this.spawnCave(ctx);
      }
    }
  }

  /** 夜晚开始时的进攻波 */
  spawnWave(ctx: Ctx, day: number): void {
    this.spawnSurfaceGroup(ctx, Math.min(6, 2 + Math.floor(day / 2)));
  }

  private pickKind(day: number, rand: () => number): MonsterKind {
    return rand() < Math.min(0.7, 0.25 + day * 0.08) ? 'goblin' : 'slime';
  }

  private distToNearestDwarf(ctx: Ctx, x: number, y: number): number {
    let best = Infinity;
    for (const d of ctx.dwarves) {
      if (d.dead) continue;
      best = Math.min(best, Math.hypot(d.x - x, d.y - y));
    }
    return best;
  }

  /** 地表可站立格（草地顶部） */
  private surfaceSpawnOk(ctx: Ctx, x: number, y: number): boolean {
    return ctx.world.terrainAt(x, y) === 0 && ctx.world.isSolidTerrain(x, y + 1);
  }

  private spawnSurfaceGroup(ctx: Ctx, n: number): void {
    const { world } = ctx;
    let spawned = 0;
    for (let attempts = 0; attempts < 80 && spawned < n; attempts++) {
      const x = 2 + Math.floor(ctx.rand() * (world.w - 4));
      const y = world.surface[x] - 1;
      if (!this.surfaceSpawnOk(ctx, x, y)) continue;
      if (this.distToNearestDwarf(ctx, x, y) < 18) continue;
      ctx.monsters.push(new Monster(this.pickKind(ctx.time.day, ctx.rand), x + 0.5, y + 0.5));
      spawned++;
    }
  }

  private spawnCave(ctx: Ctx): void {
    const { world } = ctx;
    for (let attempts = 0; attempts < 30; attempts++) {
      const x = 2 + Math.floor(ctx.rand() * (world.w - 4));
      const y = world.surface[x] + 8 + Math.floor(ctx.rand() * Math.max(4, world.h - world.surface[x] - 12));
      if (world.terrainAt(x, y) !== 0) continue;
      if (!world.isSolidTerrain(x, y + 1)) continue;
      if (this.distToNearestDwarf(ctx, x, y) < 12) continue;
      // 距离光源足够远才算黑暗洞穴
      let lit = false;
      for (const l of ctx.lights) {
        if ((l.x - x) ** 2 + (l.y - y) ** 2 < 100) {
          lit = true;
          break;
        }
      }
      if (lit) continue;
      ctx.monsters.push(new Monster('slime', x + 0.5, y + 0.5));
      return;
    }
  }
}
