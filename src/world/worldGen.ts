/** 程序化世界生成：地表起伏、泥土层、岩石层、矿脉、洞穴、树木 */
import { S, T } from '../core/defs';
import { fbm1, fbm2, randInt, mulberry32 } from '../core/rng';
import { World } from './world';

export const WORLD_W = 128;
export const WORLD_H = 84;
/** 地表基准高度 */
export const SURFACE_BASE = 30;

export interface GenResult {
  world: World;
  spawn: { x: number; y: number };
}

/** 生成矿脉随机游走 */
function vein(world: World, x: number, y: number, len: number, ore: T, rand: () => number): void {
  let cx = x;
  let cy = y;
  for (let i = 0; i < len; i++) {
    if (world.inBounds(cx, cy) && world.terrainAt(cx, cy) === T.STONE) {
      world.terrain[world.idx(cx, cy)] = ore;
    }
    const dir = Math.floor(rand() * 4);
    if (dir === 0) cx++;
    else if (dir === 1) cx--;
    else if (dir === 2) cy++;
    else cy--;
  }
}

/** 种一棵树（树干 + 树叶冠） */
function plantTree(world: World, x: number, surfaceY: number, rand: () => number): boolean {
  const h = randInt(2, 3, rand);
  // 树干必须落在空气里
  for (let i = 1; i <= h; i++) {
    if (world.terrainAt(x, surfaceY - i) !== T.AIR) return false;
  }
  for (let i = 1; i <= h; i++) world.terrain[world.idx(x, surfaceY - i)] = T.TREE;
  // 树冠
  const top = surfaceY - h;
  for (let dy = -2; dy <= 0; dy++) {
    const r = dy === 0 ? 1 : 2;
    for (let dx = -r; dx <= r; dx++) {
      const tx = x + dx;
      const ty = top + dy - 1;
      if (world.inBounds(tx, ty) && world.terrainAt(tx, ty) === T.AIR && rand() < 0.92) {
        world.terrain[world.idx(tx, ty)] = T.LEAVES;
      }
    }
  }
  return true;
}

export function generateWorld(seed: number, w = WORLD_W, h = WORLD_H): GenResult {
  const world = new World(w, h, seed);
  const rand = mulberry32(seed ^ 0x51ab3f);

  // 1. 地表高度 + 分层填充
  for (let x = 0; x < w; x++) {
    const n = fbm1(x * 0.035, seed, 3) - 0.5;
    const n2 = fbm1(x * 0.12, seed + 777, 2) - 0.5;
    const sy = Math.round(SURFACE_BASE + n * 26 + n2 * 7);
    world.surface[x] = sy;
    const dirtDepth = 3 + Math.round(fbm1(x * 0.2, seed + 55, 2) * 4);
    for (let y = 0; y < h; y++) {
      let t: T = T.AIR;
      if (y === sy) t = T.GRASS;
      else if (y > sy && y <= sy + dirtDepth) t = T.DIRT;
      else if (y > sy + dirtDepth && y < h - 2) t = T.STONE;
      else if (y >= h - 2) t = T.BEDROCK;
      world.terrain[world.idx(x, y)] = t;
    }
  }

  // 2. 洞穴（分形噪声阈值，越深洞越多）
  for (let x = 1; x < w - 1; x++) {
    for (let y = world.surface[x] + 4; y < h - 2; y++) {
      const depth = (y - world.surface[x]) / (h - world.surface[x]);
      const threshold = 0.74 - depth * 0.13;
      if (fbm2(x * 0.085, y * 0.085, seed + 1234, 3) > threshold) {
        world.terrain[world.idx(x, y)] = T.AIR;
      }
    }
  }

  // 3. 矿脉：煤（浅）、铁（中）、金（深）
  const veinCount = Math.floor((w * h) / 420);
  for (let i = 0; i < veinCount; i++) {
    const x = randInt(2, w - 3, rand);
    const roll = rand();
    let ore: T = T.COAL;
    let yMin = 0;
    let yMax = 0;
    if (roll < 0.45) {
      ore = T.COAL;
      yMin = SURFACE_BASE + 2;
      yMax = h - 4;
    } else if (roll < 0.85) {
      ore = T.IRON;
      yMin = SURFACE_BASE + 8;
      yMax = h - 3;
    } else {
      ore = T.GOLD;
      yMin = h - 30;
      yMax = h - 3;
    }
    vein(world, x, randInt(Math.max(yMin, 4), Math.max(yMax, yMin), rand), randInt(4, 9, rand), ore, rand);
  }

  // 4. 树木
  let x = 2;
  while (x < w - 2) {
    x += randInt(2, 5, rand);
    if (x >= w - 2) break;
    const sy = world.surface[x];
    if (world.terrainAt(x, sy) === T.GRASS) plantTree(world, x, sy, rand);
  }

  // 5. 出生点：地图中央，保证 3x3 站立空间，并在附近保证几棵树
  const sx = Math.floor(w / 2);
  const spawnY = world.surface[sx];
  // 清出出生站立空间（保留脚下草皮）
  for (let dy = -3; dy <= -1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (world.terrainAt(sx + dx, spawnY + dy) !== T.AIR) world.terrain[world.idx(sx + dx, spawnY + dy)] = T.AIR;
    }
  }
  // 出生点附近补几棵树（保证木头来源）
  let planted = 0;
  for (let tx = sx - 9; tx <= sx + 9 && planted < 3; tx++) {
    if (tx < 2 || tx > w - 3) continue;
    const tsy = world.surface[tx];
    if (world.terrainAt(tx, tsy) === T.GRASS && Math.abs(tx - sx) > 2) {
      if (plantTree(world, tx, tsy, rand)) planted++;
    }
  }

  const result: GenResult = { world, spawn: { x: sx, y: spawnY - 1 } };
  return result;
}

/** 建造合法性与支撑判断 */
export function hasSupport(world: World, x: number, y: number): boolean {
  // 下方有实体
  if (world.isSolidTerrain(x, y + 1)) return true;
  const below = world.structureAt(x, y + 1);
  if (below === S.WALL_WOOD || below === S.WALL_STONE) return true;
  // 相邻有实体
  if (world.isSolidTerrain(x - 1, y) || world.isSolidTerrain(x + 1, y)) return true;
  if (world.isSolidTerrain(x, y - 1)) return true;
  const l = world.structureAt(x - 1, y);
  const r = world.structureAt(x + 1, y);
  if (l === S.WALL_WOOD || l === S.WALL_STONE || r === S.WALL_WOOD || r === S.WALL_STONE) return true;
  return false;
}

/** 建筑放置合法性判断 */
export function canPlaceStructure(world: World, x: number, y: number, s: S): boolean {
  if (!world.inBounds(x, y)) return false;
  if (world.terrainAt(x, y) !== T.AIR) return false;
  if (world.structureAt(x, y) !== S.NONE) return false;
  switch (s) {
    case S.FLOOR_WOOD:
    case S.LADDER:
      // 平台/梯子需要锚定在实体旁
      return hasSupport(world, x, y);
    case S.TORCH:
      return hasSupport(world, x, y) || world.structureAt(x, y + 1) === S.FLOOR_WOOD || world.structureAt(x - 1, y) === S.FLOOR_WOOD || world.structureAt(x + 1, y) === S.FLOOR_WOOD;
    case S.DOOR:
    case S.WORKBENCH:
    case S.FURNACE:
    case S.CHEST:
    case S.TRAP:
      // 站立型建筑需要地板
      return world.isSolidTerrain(x, y + 1) || world.structureAt(x, y + 1) === S.WALL_WOOD || world.structureAt(x, y + 1) === S.WALL_STONE;
    case S.WALL_WOOD:
    case S.WALL_STONE:
      return hasSupport(world, x, y);
    default:
      return false;
  }
}
