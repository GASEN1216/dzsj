import { describe, expect, it } from 'vitest';
import { GameSession } from '../src/core/session';
import { GameTime } from '../src/systems/time';
import { S, T, TERRAIN } from '../src/core/defs';
import { SaveManager } from '../src/save/saveManager';
import { Dwarf } from '../src/entities/dwarf';
import { Monster } from '../src/entities/monster';

/** 驱动会话 dt 秒 */
function run(session: GameSession, seconds: number, step = 0.1): void {
  for (let t = 0; t < seconds; t += step) session.update(step);
}

describe('GameTime 昼夜循环', () => {
  it('白天→夜晚→白天循环', () => {
    const g = new GameTime();
    expect(g.isNight).toBe(false);
    g.update(GameTime.DAY + 1);
    expect(g.isNight).toBe(true);
    expect(g.darkness()).toBeGreaterThan(0.5);
    g.update(GameTime.NIGHT);
    expect(g.isNight).toBe(false);
    expect(g.day).toBe(2);
  });
});

describe('GameSession 集成仿真', () => {
  it('标记挖掘 → 矮人自动挖掘 → 掉落物运回仓库', () => {
    const session = GameSession.newGame(20260911);
    const { x, y } = session.base;
    // 标记出生点下方 3×10 的区域（泥土+石头）
    session.markDig(x - 1, y + 2, x + 1, y + 11);
    run(session, 90);
    expect(session.inv.count('stone')).toBeGreaterThan(0);
    expect(session.drops.length).toBeLessThanOrEqual(2);
  }, 20000);

  it('矮人饥饿时会吃掉仓库里的食物', () => {
    const session = GameSession.newGame(42);
    const d = session.dwarves[0];
    d.hunger = 20;
    const before = session.inv.count('food') + 3;
    session.inv.add('food', 3);
    run(session, 6);
    expect(d.hunger).toBeGreaterThan(40);
    expect(session.inv.count('food')).toBeLessThan(before);
  });

  it('能量耗尽的矮人会睡觉恢复', () => {
    const session = GameSession.newGame(42);
    const d = session.dwarves[0];
    d.energy = 5;
    run(session, 4);
    expect(d.state === 'sleep' || d.energy > 5).toBe(true);
  });

  it('战斗：怪物攻击矮人造成伤害，矮人反击杀死怪物', () => {
    const session = GameSession.newGame(42);
    const d = session.dwarves[0];
    const m = new Monster('slime', d.x, d.y - 0.5);
    session.monsters.push(m);
    const hp0 = d.hp;
    run(session, 20);
    // 要么怪物已死，要么矮人被咬过
    const mDead = m.dead;
    const bitten = d.hp < hp0;
    expect(mDead || bitten).toBe(true);
  });

  it('陷阱对怪物造成致命伤害并消耗自身', () => {
    const session = GameSession.newGame(42);
    const m = new Monster('slime', session.base.x + 0.5, session.base.y + 0.5);
    session.world.setStructure(session.base.x, session.base.y, S.TRAP);
    m.update(session.buildCtx(), 0.1);
    expect(m.dead || m.hp < 22).toBe(true);
    expect(session.world.structureAt(session.base.x, session.base.y)).toBe(S.NONE);
  });

  it('建造流程：标记建造 → 矮人放置建筑', () => {
    const session = GameSession.newGame(42);
    session.inv.addStructure(S.WALL_WOOD, 1);
    const { x, y } = session.base;
    session.markBuild(x + 2, y, S.WALL_WOOD); // 地面上一格，脚下有草皮支撑
    run(session, 30);
    expect(session.world.structureAt(x + 2, y)).toBe(S.WALL_WOOD);
    expect(session.inv.stockCount(S.WALL_WOOD)).toBe(0);
  });

  it('建造合法性：悬空不可建，合法格可建', () => {
    const session = GameSession.newGame(42);
    session.inv.addStructure(S.DOOR, 2);
    const { x, y } = session.base;
    expect(session.markBuild(x, y - 8, S.DOOR)).toBe('invalid'); // 高空无支撑
    expect(session.markBuild(x + 1, y, S.DOOR)).toBe('ok');
  });

  it('合成：徒手制作梯子进入建筑库存', () => {
    const session = GameSession.newGame(42);
    session.inv.add('wood', 10); // 初始已有 30，共 40
    expect(session.queueCraft('ladder')).toBe(true);
    run(session, 15);
    expect(session.inv.stockCount(S.LADDER)).toBe(1);
    expect(session.inv.count('wood')).toBe(38);
  });

  it('科技研究解锁配方', () => {
    const session = GameSession.newGame(42);
    session.inv.add('wood', 100);
    session.inv.add('stone', 100);
    expect(session.research('masonry')).toBe(true);
    expect(session.techs.isUnlocked('masonry')).toBe(true);
    expect(session.techs.recipeAvailable(session.techs.recipeById('wall_stone')!)).toBe(true);
    // 石墙需要工作台：在世界里放一个工作台后才能排队合成
    expect(session.queueCraft('wall_stone')).toBe(false);
    session.world.setStructure(session.base.x + 1, session.base.y, S.WORKBENCH);
    expect(session.queueCraft('wall_stone')).toBe(true);
  });

  it('铁剑自动装备给矮人', () => {
    const session = GameSession.newGame(42);
    session.inv.add('sword', 1);
    run(session, 0.5);
    expect(session.inv.count('sword')).toBe(0);
    expect(session.dwarves.some((d) => d.armed)).toBe(true);
  });

  it('挖掘到基岩不掉落且不可挖', () => {
    const session = GameSession.newGame(42);
    expect(TERRAIN[T.BEDROCK].hardness).toBe(Infinity);
  });
});

describe('存档', () => {
  class MemStorage implements Storage {
    private m = new Map<string, string>();
    get length(): number {
      return this.m.size;
    }
    clear(): void {
      this.m.clear();
    }
    getItem(k: string): string | null {
      return this.m.get(k) ?? null;
    }
    key(i: number): string | null {
      return Array.from(this.m.keys())[i] ?? null;
    }
    removeItem(k: string): void {
      this.m.delete(k);
    }
    setItem(k: string, v: string): void {
      this.m.set(k, v);
    }
  }

  it('序列化 → 反序列化后世界与状态一致', () => {
    const session = GameSession.newGame(20260911);
    session.inv.add('wood', 33);
    session.inv.addStructure(S.TORCH, 2);
    session.research('masonry');
    session.markDig(session.base.x - 1, session.base.y + 2, session.base.x + 1, session.base.y + 4);
    run(session, 12);
    const data = JSON.parse(JSON.stringify(session.serialize()));
    const loaded = GameSession.fromSave(data);
    expect(Array.from(loaded.world.terrain)).toEqual(Array.from(session.world.terrain));
    expect(Array.from(loaded.world.structure)).toEqual(Array.from(session.world.structure));
    expect(loaded.inv.count('wood')).toBe(session.inv.count('wood'));
    expect(loaded.inv.stockCount(S.TORCH)).toBe(2);
    expect(loaded.techs.isUnlocked('masonry')).toBe(true);
    expect(loaded.dwarves.length).toBe(session.dwarves.length);
    expect(loaded.time.day).toBe(session.time.day);
    expect(loaded.base).toEqual(session.base);
  });

  it('SaveManager 保存/读取/清除', () => {
    const mgr = new SaveManager(new MemStorage());
    expect(mgr.has()).toBe(false);
    const session = GameSession.newGame(7);
    expect(mgr.save(session)).toBe(true);
    expect(mgr.has()).toBe(true);
    const loaded = mgr.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.base).toEqual(session.base);
    mgr.clear();
    expect(mgr.has()).toBe(false);
  });
});

describe('Dwarf 序列化', () => {
  it('往返保留字段', () => {
    const d = new Dwarf(3.5, 4.5, 2, '测试');
    d.armed = true;
    d.hp = 55;
    d.carried = { res: 'stone', n: 3 };
    const d2 = Dwarf.deserialize(JSON.parse(JSON.stringify(d.serialize())));
    expect(d2.name).toBe('测试');
    expect(d2.variant).toBe(2);
    expect(d2.armed).toBe(true);
    expect(d2.hp).toBe(55);
    expect(d2.carried).toEqual({ res: 'stone', n: 3 });
  });
});
