/** 系统层共享类型（仅类型，无运行时代码） */
import type { Res, S } from './defs';
import type { World } from '../world/world';
import type { TaskManager, Task } from '../systems/tasks';
import type { Inventory } from '../systems/inventory';
import type { TechSystem } from '../systems/crafting';
import type { GameTime } from '../systems/time';
import type { Dwarf } from '../entities/dwarf';
import type { Monster } from '../entities/monster';
import type { Pt } from '../world/pathfinding';

export type FxType =
  | 'dig'
  | 'build'
  | 'pickup'
  | 'deposit'
  | 'craft'
  | 'hurt'
  | 'mdie'
  | 'spell'
  | 'night'
  | 'dawn'
  | 'msg'
  | 'die'
  | 'equip'
  | 'trap';

export interface FxEvent {
  type: FxType;
  x?: number;
  y?: number;
  text?: string;
  color?: number;
}

/** 地面上的掉落物 */
export interface Drop {
  id: number;
  res: Res;
  n: number;
  x: number;
  y: number;
  vy: number;
  /** 被某个矮人认领 */
  claimedBy: number | null;
  /** 暂时忽略寻路失败（游戏秒） */
  ignoreUntil: number;
}

export interface Light {
  x: number;
  y: number;
  r: number;
}

/** 可被攻击的单位（矮人/怪物共用最小接口） */
export interface Combatant {
  x: number;
  y: number;
  hp: number;
  dead: boolean;
  takeDamage(d: number): void;
}

/** 矮人/怪物 update 依赖的环境，由 GameSession 每帧组装 */
export interface Ctx {
  world: World;
  tasks: TaskManager;
  inv: Inventory;
  techs: TechSystem;
  time: GameTime;
  dwarves: Dwarf[];
  monsters: Monster[];
  drops: Drop[];
  base: Pt;
  lights: Light[];
  /** 加速术剩余倍率（1 = 正常） */
  speedBoost: number;
  fx(type: FxType, x?: number, y?: number, text?: string): void;
  spawnDrop(res: Res, n: number, x: number, y: number): void;
  rand(): number;
}

export type { Task };
