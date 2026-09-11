import { describe, expect, it } from 'vitest';
import { Inventory } from '../src/systems/inventory';
import { TaskManager } from '../src/systems/tasks';
import { TechSystem, } from '../src/systems/crafting';
import { RECIPES, S, T } from '../src/core/defs';
import { World } from '../src/world/world';

describe('Inventory 背包', () => {
  it('容量限制', () => {
    const inv = new Inventory();
    expect(inv.add('wood', 250)).toBe(250);
    expect(inv.add('wood', 100)).toBe(50); // 容量 300
    expect(inv.count('wood')).toBe(300);
    expect(inv.free()).toBe(0);
  });

  it('消耗与判断', () => {
    const inv = new Inventory();
    inv.add('wood', 10);
    expect(inv.has({ wood: 5 })).toBe(true);
    expect(inv.take({ wood: 20 })).toBe(false);
    expect(inv.take({ wood: 5 })).toBe(true);
    expect(inv.count('wood')).toBe(5);
  });

  it('建筑库存', () => {
    const inv = new Inventory();
    expect(inv.takeStructure(S.LADDER)).toBe(false);
    inv.addStructure(S.LADDER, 2);
    expect(inv.stockCount(S.LADDER)).toBe(2);
    expect(inv.takeStructure(S.LADDER)).toBe(true);
    expect(inv.stockCount(S.LADDER)).toBe(1);
  });

  it('序列化往返', () => {
    const inv = new Inventory();
    inv.add('wood', 12);
    inv.add('stone', 3);
    inv.addStructure(S.DOOR, 1);
    const inv2 = Inventory.deserialize(JSON.parse(JSON.stringify(inv.serialize())));
    expect(inv2.count('wood')).toBe(12);
    expect(inv2.stockCount(S.DOOR)).toBe(1);
  });
});

describe('TaskManager 任务系统', () => {
  function dirtWorld(): World {
    const wd = new World(10, 10, 1);
    for (let x = 0; x < 10; x++) {
      wd.surface[x] = 5;
      for (let y = 0; y < 10; y++) wd.terrain[wd.idx(x, y)] = y < 5 ? T.AIR : T.DIRT;
    }
    return wd;
  }

  it('框选挖掘生成任务并去重', () => {
    const wd = dirtWorld();
    const tm = new TaskManager();
    const n = tm.markDig(wd, 2, 5, 4, 7);
    expect(n).toBe(9);
    const n2 = tm.markDig(wd, 3, 5, 3, 5);
    expect(n2).toBe(0);
  });

  it('认领最近的可达任务', () => {
    const wd = dirtWorld();
    const tm = new TaskManager();
    tm.markDig(wd, 1, 5, 1, 5); // 距 (1,4) 1 格
    tm.markDig(wd, 8, 5, 8, 5); // 更远
    const claim = tm.claimFor(1, { x: 1, y: 4 }, wd);
    expect(claim).not.toBeNull();
    expect(claim!.task.x).toBe(1);
    expect(claim!.task.y).toBe(5);
    expect(claim!.task.claimedBy).toBe(1);
    // 第二个矮人只能领剩下的
    const claim2 = tm.claimFor(2, { x: 1, y: 4 }, wd);
    expect(claim2!.task.x).toBe(8);
  });

  it('寻路失败的任务进入冷却不被反复认领', () => {
    const wd = dirtWorld();
    for (let x = 0; x < 10; x++) wd.terrain[wd.idx(x, 5)] = T.STONE; // 全部封死
    const tm = new TaskManager();
    tm.markDig(wd, 1, 5, 1, 5);
    const claim = tm.claimFor(1, { x: 1, y: 2 }, wd);
    expect(claim).toBeNull();
    expect(tm.tasks[0].cooldown).toBeGreaterThan(0);
  });

  it('取消建造标记退还建筑库存', () => {
    const wd = dirtWorld();
    const tm = new TaskManager();
    const inv = new Inventory();
    inv.addStructure(S.DOOR, 1);
    const res = tm.markBuild(wd, 3, 4, S.DOOR, inv, () => true);
    expect(res).toBe('ok');
    expect(inv.stockCount(S.DOOR)).toBe(0);
    const cancelled = tm.cancelAt(wd, 3, 4, 3, 4, inv);
    expect(cancelled).toBe(1);
    expect(inv.stockCount(S.DOOR)).toBe(1);
  });

  it('无库存时不能标记建造', () => {
    const wd = dirtWorld();
    const tm = new TaskManager();
    const inv = new Inventory();
    expect(tm.markBuild(wd, 3, 4, S.DOOR, inv, () => true)).toBe('no_stock');
  });

  it('合成排队：无工作站时退还材料', () => {
    const wd = dirtWorld();
    const tm = new TaskManager();
    const inv = new Inventory();
    inv.add('wood', 10);
    const res = tm.queueCraft(wd, inv, 'wall_stone', { wood: 2 }, 'workbench', () => null);
    expect(res).toBe('no_station');
    expect(inv.count('wood')).toBe(10);
    expect(tm.tasks.length).toBe(0);
  });
});

describe('TechSystem 科技', () => {
  it('未解锁科技时配方不可用', () => {
    const ts = new TechSystem();
    const stoneWall = RECIPES.find((r) => r.id === 'wall_stone')!;
    expect(ts.recipeAvailable(stoneWall)).toBe(false);
    ts.unlocked.add('masonry');
    expect(ts.recipeAvailable(stoneWall)).toBe(true);
  });

  it('研究扣费并解锁，前置科技生效', () => {
    const ts = new TechSystem();
    const inv = new Inventory();
    inv.add('ironBar', 5);
    inv.add('wood', 50);
    const smithing = ts.techById('smithing')!;
    expect(ts.research(smithing, inv)).toBe(false); // 前置 smelting 未解锁
    ts.unlocked.add('smelting');
    expect(ts.research(smithing, inv)).toBe(true);
    expect(inv.count('ironBar')).toBe(3);
    expect(inv.count('wood')).toBe(44);
    expect(ts.isUnlocked('smithing')).toBe(true);
  });

  it('配方总数 ≥ 6', () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(6);
  });
});
