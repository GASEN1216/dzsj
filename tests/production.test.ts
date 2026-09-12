/** 生产化加固的回归测试：存档完整性、掉落物物理与合并、任务认领限流 */
import { describe, expect, it } from 'vitest';
import { GameSession } from '../src/core/session';
import { World } from '../src/world/world';
import { T } from '../src/core/defs';
import { Monster } from '../src/entities/monster';

describe('存档完整性', () => {
  it('存档往返保留怪物（数量/种类/血量/位置）', () => {
    const session = GameSession.newGame(42);
    const m = new Monster('goblin', 5.5, 6.5);
    m.hp = 30;
    session.monsters.push(m);
    const data = JSON.parse(JSON.stringify(session.serialize()));
    const loaded = GameSession.fromSave(data);
    expect(loaded.monsters).toHaveLength(1);
    expect(loaded.monsters[0].kind).toBe('goblin');
    expect(loaded.monsters[0].hp).toBe(30);
    expect(loaded.monsters[0].x).toBeCloseTo(5.5);
    expect(loaded.monsters[0].y).toBeCloseTo(6.5);
  });

  it('兼容 v1 旧存档（无怪物字段）', () => {
    const session = GameSession.newGame(42);
    const data = JSON.parse(JSON.stringify(session.serialize())) as { v: number; monsters?: unknown };
    delete data.monsters;
    data.v = 1;
    const loaded = GameSession.fromSave(data as unknown as Parameters<typeof GameSession.fromSave>[0]);
    expect(loaded.monsters).toHaveLength(0);
    expect(loaded.dwarves.length).toBeGreaterThan(0);
  });

  it('读档后新掉落物 id 不与存档掉落物冲突', () => {
    const session = GameSession.newGame(42);
    session.spawnDrop('wood', 2, 3, 3);
    session.spawnDrop('stone', 1, 4, 3);
    const data = JSON.parse(JSON.stringify(session.serialize()));
    const loaded = GameSession.fromSave(data);
    loaded.spawnDrop('stone', 1, 5, 3);
    const ids = loaded.drops.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('玩家设置（音量/速度）随存档保留', () => {
    const session = GameSession.newGame(42);
    session.settings.volume = 0.25;
    session.settings.speed = 2;
    const data = JSON.parse(JSON.stringify(session.serialize()));
    const loaded = GameSession.fromSave(data);
    expect(loaded.settings.volume).toBeCloseTo(0.25);
    expect(loaded.settings.speed).toBe(2);
  });
});

describe('掉落物物理', () => {
  it('高速下落的掉落物不会穿透一格薄地板', () => {
    const world = new World(16, 24, 42);
    for (let x = 0; x < 16; x++) {
      world.terrain[world.idx(x, 12)] = T.STONE; // 一格厚地板
      world.terrain[world.idx(x, 23)] = T.BEDROCK;
    }
    const session = new GameSession(world, { x: 2, y: 11 }, 42);
    session.spawnDrop('stone', 1, 12, 3);
    const d = session.drops[0];
    d.vy = 120; // 极端初速：单帧位移远超 1 格
    for (let i = 0; i < 12; i++) {
      session.gameOver = false; // 无矮人会触发 gameOver，仅驱动掉落物模拟
      session.update(0.1);
    }
    expect(d.y).toBeGreaterThan(10.5); // 停在地板上方
    expect(d.y).toBeLessThan(12);
  });

  it('同格同类未认领掉落物自动合并', () => {
    const session = GameSession.newGame(42);
    session.spawnDrop('wood', 2, 3, 3);
    session.spawnDrop('wood', 3, 3, 3);
    expect(session.drops).toHaveLength(1);
    expect(session.drops[0].n).toBe(5);
  });
});

describe('任务认领限流', () => {
  it('大量不可达任务下仍认领最近可达任务，且轮转覆盖所有不可达任务', () => {
    const session = GameSession.newGame(42);
    // 30 个悬空不可达的挖掘任务（高空无支撑，无法寻路）
    for (let i = 0; i < 30; i++) {
      session.tasks.tasks.push({ id: 1000 + i, type: 'dig', x: 5 + (i % 10), y: 1, claimedBy: null, progress: 0, cooldown: 0 });
    }
    // 一个可达任务：基地旁一格
    const bx = session.base.x;
    const by = session.base.y + 1;
    session.tasks.tasks.push({ id: 2000, type: 'dig', x: bx, y: by, claimedBy: null, progress: 0, cooldown: 0 });
    const d = session.dwarves[0];

    const claim = session.tasks.claimFor(d.id, d.tile(), session.world);
    expect(claim).not.toBeNull();
    expect(claim!.task.id).toBe(2000);

    // 每次认领只做有限次寻路（限流）；随游标轮转，所有不可达任务最终都被尝试并进入冷却
    for (let i = 0; i < 5; i++) {
      session.tasks.claimFor(d.id, d.tile(), session.world);
    }
    const cooled = session.tasks.tasks.filter((t) => t.id < 2000 && t.cooldown > 0).length;
    expect(cooled).toBe(30);
  });

  it('埋藏在地下的挖掘任务（四邻全实心）也能被认领并挖开', () => {
    const session = GameSession.newGame(42);
    // 基地正下方 2 格：其上方是草皮、侧邻与下方是泥土——模拟山坡侧面框选的「埋藏」任务
    const bx = session.base.x;
    const ty = session.base.y + 2;
    const world = session.world;
    // 前置确认：目标四邻确实全为实心（否则该测试没有覆盖到目标场景）
    expect(world.isSolidTerrain(bx, ty - 1)).toBe(true);
    expect(world.isSolidTerrain(bx - 1, ty)).toBe(true);
    expect(world.isSolidTerrain(bx + 1, ty)).toBe(true);
    session.tasks.tasks.push({ id: 5000, type: 'dig', x: bx, y: ty, claimedBy: null, progress: 0, cooldown: 0 });
    const d = session.dwarves[0];
    const claim = session.tasks.claimFor(d.id, d.tile(), session.world);
    expect(claim).not.toBeNull();
    expect(claim!.task.id).toBe(5000);
    // 释放直接验证用的认领，让矮人在仿真中自然认领
    claim!.task.claimedBy = null;
    // 仿真至挖开
    for (let t = 0; t < 30 && world.terrainAt(bx, ty) !== 0; t += 0.1) session.update(0.1);
    expect(world.terrainAt(bx, ty)).toBe(0);
  });

  it('框选深层方块时自动生成向上的竖井任务，矮人最终能挖到', () => {
    const session = GameSession.newGame(42);
    const bx = session.base.x;
    const ty = session.base.y + 4; // 上覆多层实心
    const world = session.world;
    expect(world.terrainAt(bx, ty)).not.toBe(0);
    const n = session.markDig(bx, ty, bx, ty);
    expect(n).toBeGreaterThan(1); // 目标本身 + 自动竖井
    // 竖井覆盖了目标上方的实心列
    for (let y = ty - 1; y >= session.base.y + 1; y--) {
      if (world.isSolidTerrain(bx, y)) {
        expect(session.tasks.tasks.some((t) => t.type === 'dig' && t.x === bx && t.y === y)).toBe(true);
      }
    }
    // 仿真：目标最终被挖开
    for (let t = 0; t < 120 && world.terrainAt(bx, ty) !== 0; t += 0.1) session.update(0.1);
    expect(world.terrainAt(bx, ty)).toBe(0);
  });
});
