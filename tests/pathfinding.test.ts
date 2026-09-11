import { describe, expect, it } from 'vitest';
import { World } from '../src/world/world';
import { pathToTile, pathToAdjacent } from '../src/world/pathfinding';
import { S, T } from '../src/core/defs';

/** 构造测试世界：全空气，y=floorY 一整层实心地面 */
function flatWorld(w = 20, h = 16, floorY = 8): World {
  const wd = new World(w, h, 1);
  for (let x = 0; x < w; x++) {
    wd.surface[x] = floorY;
    for (let y = 0; y < h; y++) {
      wd.terrain[wd.idx(x, y)] = y === floorY ? T.STONE : y > floorY ? T.STONE : T.AIR;
    }
  }
  return wd;
}

describe('A* 寻路', () => {
  it('平地直线路径', () => {
    const wd = flatWorld();
    const path = pathToTile(wd, { x: 3, y: 7 }, { x: 10, y: 7 });
    expect(path).not.toBeNull();
    expect(path!.length).toBe(7);
    expect(path![0]).toEqual({ x: 4, y: 7 });
    const last = path![path!.length - 1];
    expect(last).toEqual({ x: 10, y: 7 });
  });

  it('绕过 1 格高的障碍（自动上台阶）', () => {
    const wd = flatWorld();
    wd.terrain[wd.idx(6, 7)] = T.STONE; // 挡路的凸块
    const path = pathToTile(wd, { x: 3, y: 7 }, { x: 10, y: 7 });
    expect(path).not.toBeNull();
    const last = path![path!.length - 1];
    expect(last).toEqual({ x: 10, y: 7 });
    // 路径必须越过障碍（存在 y<7 的攀爬点）
    expect(path!.some((p) => p.y < 7)).toBe(true);
  });

  it('完全封死的墙不可达', () => {
    const wd = flatWorld();
    for (let y = 0; y <= 7; y++) wd.terrain[wd.idx(6, y)] = T.STONE;
    const path = pathToTile(wd, { x: 3, y: 7 }, { x: 10, y: 7 });
    expect(path).toBeNull();
  });

  it('梯子可垂直攀爬', () => {
    const wd = flatWorld();
    // 在 (5,7) 处挖出竖井，放梯子从 (5,6) 到 (5,3)
    for (let y = 3; y <= 6; y++) wd.setStructure(5, y, S.LADDER);
    const path = pathToTile(wd, { x: 5, y: 7 }, { x: 5, y: 3 });
    expect(path).not.toBeNull();
    expect(path!.length).toBe(4);
  });

  it('没有梯子时无法垂直向上', () => {
    const wd = flatWorld();
    const path = pathToTile(wd, { x: 5, y: 7 }, { x: 5, y: 4 });
    expect(path).toBeNull();
  });

  it('pathToAdjacent 返回目标旁的站位', () => {
    const wd = flatWorld();
    wd.terrain[wd.idx(8, 7)] = T.STONE; // 要挖的目标（嵌在地里）
    const path = pathToAdjacent(wd, { x: 3, y: 7 }, { x: 8, y: 7 });
    expect(path).not.toBeNull();
    const stand = path![path!.length - 1];
    expect(Math.abs(stand.x - 8) + Math.abs(stand.y - 7)).toBe(1);
  });

  it('怪物可破坏墙体通过，矮人被整面石墙挡死', () => {
    const wd = flatWorld();
    for (let y = 0; y <= 7; y++) wd.terrain[wd.idx(6, y)] = T.STONE;
    const dwarfPath = pathToTile(wd, { x: 3, y: 7 }, { x: 10, y: 7 });
    expect(dwarfPath).toBeNull();
    const monsterPath = pathToTile(wd, { x: 3, y: 7 }, { x: 10, y: 7 }, { forMonster: true });
    expect(monsterPath).not.toBeNull();
  });

  it('矮人能翻过 1 格矮墙，怪物只能砸墙穿过', () => {
    const wd = flatWorld();
    wd.setStructure(6, 7, S.WALL_WOOD);
    // 矮人：踩着墙顶翻过去（路径经过 y<7 的墙顶）
    const dwarfPath = pathToTile(wd, { x: 3, y: 7 }, { x: 10, y: 7 });
    expect(dwarfPath).not.toBeNull();
    expect(dwarfPath!.some((p) => p.y < 7)).toBe(true);
    // 怪物：不会攀爬，路径必须直接穿过墙块（去砸墙）
    const monsterPath = pathToTile(wd, { x: 3, y: 7 }, { x: 10, y: 7 }, { forMonster: true });
    expect(monsterPath).not.toBeNull();
    expect(monsterPath!.some((p) => p.x === 6 && p.y === 7)).toBe(true);
  });

  it('木地板平台可行走', () => {
    const wd = flatWorld();
    // 挖断地面，用地板搭桥
    wd.terrain[wd.idx(6, 8)] = T.AIR;
    wd.terrain[wd.idx(7, 8)] = T.AIR;
    wd.setStructure(6, 7, S.FLOOR_WOOD);
    wd.setStructure(7, 7, S.FLOOR_WOOD);
    const path = pathToTile(wd, { x: 3, y: 7 }, { x: 10, y: 7 });
    expect(path).not.toBeNull();
    expect(path!.some((p) => p.x === 6 && p.y === 7)).toBe(true);
  });
});
