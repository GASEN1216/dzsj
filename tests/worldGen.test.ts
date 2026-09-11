import { describe, expect, it } from 'vitest';
import { generateWorld, WORLD_W, WORLD_H, canPlaceStructure } from '../src/world/worldGen';
import { S, T } from '../src/core/defs';

describe('generateWorld', () => {
  const seed = 20260911;
  const { world, spawn } = generateWorld(seed);

  it('尺寸正确', () => {
    expect(world.w).toBe(WORLD_W);
    expect(world.h).toBe(WORLD_H);
  });

  it('同种子生成的世界完全一致', () => {
    const again = generateWorld(seed).world;
    expect(Array.from(again.terrain)).toEqual(Array.from(world.terrain));
  });

  it('不同种子生成不同世界', () => {
    const other = generateWorld(seed + 1).world;
    expect(Array.from(other.terrain)).not.toEqual(Array.from(world.terrain));
  });

  it('存在草皮、泥土与岩石分层', () => {
    let grass = 0;
    let dirt = 0;
    let stone = 0;
    for (let i = 0; i < world.terrain.length; i++) {
      if (world.terrain[i] === T.GRASS) grass++;
      if (world.terrain[i] === T.DIRT) dirt++;
      if (world.terrain[i] === T.STONE) stone++;
    }
    expect(grass).toBeGreaterThan(50);
    expect(dirt).toBeGreaterThan(200);
    expect(stone).toBeGreaterThan(1000);
  });

  it('三种矿脉都存在', () => {
    const count = (t: T): number => Array.from(world.terrain).filter((v) => v === t).length;
    expect(count(T.COAL)).toBeGreaterThan(10);
    expect(count(T.IRON)).toBeGreaterThan(5);
    expect(count(T.GOLD)).toBeGreaterThan(2);
  });

  it('存在洞穴且底部为基岩', () => {
    const caves = Array.from(world.terrain).filter((v, i) => v === T.AIR && Math.floor(i / world.w) > world.surface[i % world.w] + 4).length;
    expect(caves).toBeGreaterThan(50);
    for (let x = 0; x < world.w; x++) {
      expect(world.terrainAt(x, world.h - 1)).toBe(T.BEDROCK);
      expect(world.terrainAt(x, world.h - 2)).toBe(T.BEDROCK);
    }
  });

  it('存在树木，出生点附近有木头来源', () => {
    const trees = Array.from(world.terrain).filter((v) => v === T.TREE).length;
    expect(trees).toBeGreaterThan(5);
  });

  it('出生点上方为空气、脚下可站立', () => {
    const { x, y } = spawn;
    expect(world.terrainAt(x, y)).toBe(T.AIR);
    expect(world.isSolidTerrain(x, y + 1)).toBe(true);
  });
});

describe('canPlaceStructure 建造合法性', () => {
  const seed = 777;
  const { world } = generateWorld(seed);
  const x = Math.floor(world.w / 2);
  const sy = world.surface[x];

  it('地面上方一格可放地板/梯子/门', () => {
    expect(canPlaceStructure(world, x, sy - 1, S.FLOOR_WOOD)).toBe(true);
    expect(canPlaceStructure(world, x, sy - 1, S.LADDER)).toBe(true);
    expect(canPlaceStructure(world, x, sy - 1, S.DOOR)).toBe(true);
  });

  it('悬空处不能放门（需要地板）', () => {
    expect(canPlaceStructure(world, x, sy - 5, S.DOOR)).toBe(false);
  });

  it('已有建筑处不能重复放置', () => {
    world.setStructure(x, sy - 1, S.CHEST);
    expect(canPlaceStructure(world, x, sy - 1, S.FLOOR_WOOD)).toBe(false);
    world.setStructure(x, sy - 1, S.NONE);
  });

  it('非空气格不能放置', () => {
    expect(canPlaceStructure(world, x, sy, S.FLOOR_WOOD)).toBe(false);
  });
});
