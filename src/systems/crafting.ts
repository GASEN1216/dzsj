/** 科技研究系统（配方可用性判断） */
import { RECIPES, TECHS, Recipe, Tech, MatList } from '../core/defs';
import type { Inventory } from './inventory';

export class TechSystem {
  unlocked: Set<string> = new Set();

  isUnlocked(id: string): boolean {
    return this.unlocked.has(id);
  }

  /** 配方当前是否可用（科技解锁） */
  recipeAvailable(recipe: Recipe): boolean {
    return !recipe.tech || this.unlocked.has(recipe.tech);
  }

  /** 科技是否满足前置 */
  techReady(tech: Tech): boolean {
    return tech.requires.every((r) => this.unlocked.has(r));
  }

  canResearch(tech: Tech, inv: Inventory): boolean {
    return !this.unlocked.has(tech.id) && this.techReady(tech) && inv.has(tech.cost);
  }

  /** 研究科技：扣费并解锁，返回是否成功 */
  research(tech: Tech, inv: Inventory): boolean {
    if (!this.canResearch(tech, inv)) return false;
    inv.take(tech.cost);
    this.unlocked.add(tech.id);
    return true;
  }

  /** 徒手/工作站可合成的配方列表 */
  availableRecipes(station: 'workbench' | 'furnace' | null): Recipe[] {
    return RECIPES.filter((r) => this.recipeAvailable(r) && r.station === station);
  }

  techById(id: string): Tech | undefined {
    return TECHS.find((t) => t.id === id);
  }

  recipeById(id: string): Recipe | undefined {
    return RECIPES.find((r) => r.id === id);
  }

  serialize(): string[] {
    return Array.from(this.unlocked);
  }

  static deserialize(ids: string[]): TechSystem {
    const t = new TechSystem();
    for (const id of ids) t.unlocked.add(id);
    return t;
  }
}

/** 材料描述文本，如「木头×2 煤炭×1」 */
export function matsText(mats: MatList, nameOf: (r: string) => string): string {
  return (Object.keys(mats) as (keyof MatList)[])
    .map((k) => `${nameOf(k)}×${mats[k]}`)
    .join(' ');
}
