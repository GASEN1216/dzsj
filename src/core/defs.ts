/** 游戏数据定义：地形、建筑、资源、配方、科技、法术等（纯数据，不依赖 Phaser） */

/** 地形类型 */
export enum T {
  AIR = 0,
  GRASS,
  DIRT,
  STONE,
  TREE,
  LEAVES,
  COAL,
  IRON,
  GOLD,
  BEDROCK,
}

/** 建筑类型 */
export enum S {
  NONE = 0,
  FLOOR_WOOD,
  WALL_WOOD,
  WALL_STONE,
  LADDER,
  DOOR,
  TORCH,
  WORKBENCH,
  FURNACE,
  CHEST,
  TRAP,
  CAMPFIRE,
}

export interface TerrainInfo {
  name: string;
  tex: string;
  /** 挖掘耗时（秒），Infinity 表示不可挖 */
  hardness: number;
  /** 挖掘掉落 */
  drop?: { res: Res; min: number; max: number; chance?: number };
  solid: boolean;
}

export const TERRAIN: Record<T, TerrainInfo> = {
  [T.AIR]: { name: '空气', tex: '', hardness: Infinity, solid: false },
  [T.GRASS]: { name: '草皮', tex: 'grass', hardness: 0.8, drop: { res: 'stone', min: 0, max: 0 }, solid: true },
  [T.DIRT]: { name: '泥土', tex: 'dirt', hardness: 0.9, solid: true },
  [T.STONE]: { name: '石头', tex: 'stone', hardness: 2.0, drop: { res: 'stone', min: 1, max: 2 }, solid: true },
  [T.TREE]: { name: '树木', tex: 'tree', hardness: 0.7, drop: { res: 'wood', min: 2, max: 3 }, solid: true },
  [T.LEAVES]: { name: '树叶', tex: 'leaves', hardness: 0.2, drop: { res: 'food', min: 1, max: 1, chance: 0.3 }, solid: true },
  [T.COAL]: { name: '煤矿', tex: 'coal', hardness: 2.2, drop: { res: 'coal', min: 1, max: 2 }, solid: true },
  [T.IRON]: { name: '铁矿', tex: 'iron', hardness: 3.0, drop: { res: 'ironOre', min: 1, max: 2 }, solid: true },
  [T.GOLD]: { name: '金矿', tex: 'gold', hardness: 3.5, drop: { res: 'gold', min: 1, max: 2 }, solid: true },
  [T.BEDROCK]: { name: '基岩', tex: 'bedrock', hardness: Infinity, solid: true },
};

export interface StructureInfo {
  name: string;
  tex: string;
  /** 是否阻挡通行（矮人） */
  blocks: boolean;
  /** 耐久（怪物攻击） */
  hp: number;
  /** 合成后的产物类型：structure 入建造库存，material 入资源库存 */
  product: 'structure' | 'material';
  /** 光照半径（格） */
  light?: number;
  /** 工作站点 */
  station?: 'workbench' | 'furnace';
  /** 容量加成 */
  capacity?: number;
}

export const STRUCTURE: Record<S, StructureInfo> = {
  [S.NONE]: { name: '无', tex: '', blocks: false, hp: 0, product: 'structure' },
  [S.FLOOR_WOOD]: { name: '木地板', tex: 'floor', blocks: false, hp: 40, product: 'structure' },
  [S.WALL_WOOD]: { name: '木墙', tex: 'wall_wood', blocks: true, hp: 50, product: 'structure' },
  [S.WALL_STONE]: { name: '石墙', tex: 'wall_stone', blocks: true, hp: 140, product: 'structure' },
  [S.LADDER]: { name: '梯子', tex: 'ladder', blocks: false, hp: 30, product: 'structure' },
  [S.DOOR]: { name: '木门', tex: 'door', blocks: false, hp: 80, product: 'structure' },
  [S.TORCH]: { name: '火把', tex: 'torch', blocks: false, hp: 10, product: 'structure', light: 4.5 },
  [S.WORKBENCH]: { name: '工作台', tex: 'workbench', blocks: false, hp: 60, product: 'structure', station: 'workbench' },
  [S.FURNACE]: { name: '熔炉', tex: 'furnace', blocks: false, hp: 100, product: 'structure', station: 'furnace', light: 3 },
  [S.CHEST]: { name: '储物箱', tex: 'chest', blocks: false, hp: 40, product: 'structure', capacity: 150 },
  [S.TRAP]: { name: '尖刺陷阱', tex: 'trap', blocks: false, hp: 30, product: 'structure' },
  [S.CAMPFIRE]: { name: '营地篝火', tex: 'campfire', blocks: false, hp: 999, product: 'structure', light: 6 },
};

/** 资源类型 */
export type Res = 'wood' | 'stone' | 'coal' | 'ironOre' | 'ironBar' | 'gold' | 'food' | 'sword';

export const RES: Record<Res, { name: string; tex: string }> = {
  wood: { name: '木头', tex: 'i_wood' },
  stone: { name: '石头', tex: 'i_stone' },
  coal: { name: '煤炭', tex: 'i_coal' },
  ironOre: { name: '铁矿石', tex: 'i_ironOre' },
  ironBar: { name: '铁锭', tex: 'i_ironBar' },
  gold: { name: '金币', tex: 'i_gold' },
  food: { name: '食物', tex: 'i_food' },
  sword: { name: '铁剑', tex: 'i_sword' },
};

export const RES_ORDER: Res[] = ['wood', 'stone', 'coal', 'ironOre', 'ironBar', 'gold', 'food', 'sword'];

export type MatList = Partial<Record<Res, number>>;

export interface Recipe {
  id: string;
  name: string;
  /** 产出：结构（入建造库存）或资源 */
  outStructure?: S;
  outRes?: Res;
  outCount: number;
  inputs: MatList;
  /** 需要的站点；null 表示徒手可合成 */
  station: 'workbench' | 'furnace' | null;
  /** 需要的科技 */
  tech?: string;
  /** 合成耗时（秒） */
  time: number;
  desc: string;
}

/** 合成配方（≥6 个） */
export const RECIPES: Recipe[] = [
  { id: 'ladder', name: '梯子', outStructure: S.LADDER, outCount: 1, inputs: { wood: 2 }, station: null, time: 1.5, desc: '让矮人能上下攀爬' },
  { id: 'floor', name: '木地板', outStructure: S.FLOOR_WOOD, outCount: 1, inputs: { wood: 1 }, station: null, time: 1, desc: '架桥平台，可以行走' },
  { id: 'wall_wood', name: '木墙', outStructure: S.WALL_WOOD, outCount: 1, inputs: { wood: 2 }, station: null, time: 1.5, desc: '阻挡怪物的基础工事' },
  { id: 'door', name: '木门', outStructure: S.DOOR, outCount: 1, inputs: { wood: 4 }, station: null, time: 2.5, desc: '矮人可通行，怪物需要砸开' },
  { id: 'torch', name: '火把', outStructure: S.TORCH, outCount: 1, inputs: { wood: 1, coal: 1 }, station: null, time: 1, desc: '照亮洞穴，夜晚必备' },
  { id: 'workbench', name: '工作台', outStructure: S.WORKBENCH, outCount: 1, inputs: { wood: 6 }, station: null, time: 3, desc: '解锁更高级的合成' },
  { id: 'chest', name: '储物箱', outStructure: S.CHEST, outCount: 1, inputs: { wood: 5 }, station: null, time: 2.5, desc: '仓库容量 +150' },
  { id: 'wall_stone', name: '石墙', outStructure: S.WALL_STONE, outCount: 1, inputs: { stone: 3 }, station: 'workbench', tech: 'masonry', time: 2, desc: '坚固的防御工事' },
  { id: 'furnace', name: '熔炉', outStructure: S.FURNACE, outCount: 1, inputs: { stone: 8 }, station: 'workbench', tech: 'smelting', time: 4, desc: '熔炼金属的必需建筑' },
  { id: 'ironBar', name: '铁锭', outRes: 'ironBar', outCount: 1, inputs: { ironOre: 2, coal: 1 }, station: 'furnace', tech: 'smelting', time: 3, desc: '在熔炉中冶炼铁矿' },
  { id: 'sword', name: '铁剑', outRes: 'sword', outCount: 1, inputs: { ironBar: 2, wood: 1 }, station: 'workbench', tech: 'smithing', time: 4, desc: '自动装备给矮人，大幅提升攻击' },
  { id: 'trap', name: '尖刺陷阱', outStructure: S.TRAP, outCount: 1, inputs: { ironBar: 1, stone: 2 }, station: 'workbench', tech: 'smithing', time: 3, desc: '踩上的怪物受到重伤' },
];

export interface Tech {
  id: string;
  name: string;
  cost: MatList;
  requires: string[];
  /** 解锁的配方 id */
  unlocks: string[];
  desc: string;
}

/** 科技树：工作台 → 熔炉 → 武器 */
export const TECHS: Tech[] = [
  { id: 'masonry', name: '石工术', cost: { wood: 8, stone: 6 }, requires: [], unlocks: ['wall_stone'], desc: '解锁石墙配方' },
  { id: 'smelting', name: '熔炼术', cost: { stone: 10, wood: 5 }, requires: [], unlocks: ['furnace', 'ironBar'], desc: '解锁熔炉与铁锭，需要先建好工作台' },
  { id: 'smithing', name: '锻造术', cost: { ironBar: 2, wood: 6 }, requires: ['smelting'], unlocks: ['sword', 'trap'], desc: '解锁铁剑与陷阱' },
];

export interface SpellDef {
  id: 'speed' | 'light' | 'heal';
  name: string;
  desc: string;
  cooldown: number;
  /** 持续时间（0 表示瞬时） */
  duration: number;
  /** 影响半径（格），0 表示全局 */
  radius: number;
}

export const SPELLS: SpellDef[] = [
  { id: 'speed', name: '加速术', desc: '全体矮人移速翻倍', cooldown: 30, duration: 12, radius: 0 },
  { id: 'light', name: '照明术', desc: '在指定处召唤光球', cooldown: 20, duration: 45, radius: 6 },
  { id: 'heal', name: '治疗术', desc: '治疗范围内矮人', cooldown: 45, duration: 0, radius: 6 },
];

/** 矮人常数 */
export const DWARF = {
  speed: 3.0,
  digPower: 1.15,
  carry: 8,
  maxHp: 100,
  maxHunger: 100,
  maxEnergy: 100,
  hungerDecay: 0.32,
  energyDecay: 0.26,
  eatAt: 35,
  eatAmount: 55,
  eatTime: 2.0,
  sleepAt: 16,
  sleepRegen: 7.0,
  regenHp: 1.0,
  attackDamage: 6,
  attackDamageArmed: 12,
  attackCd: 0.8,
  attackRange: 1.35,
  aggroRange: 7,
};

/** 怪物常数 */
export const MONSTER = {
  slime: { name: '史莱姆', hp: 22, dmg: 4, speed: 1.6, cd: 1.2, tex: 'slime' },
  goblin: { name: '哥布林', hp: 38, dmg: 7, speed: 2.2, cd: 0.9, tex: 'goblin' },
} as const;

export type MonsterKind = keyof typeof MONSTER;
