/** localStorage 存档管理（存储可注入，便于单元测试） */
import { GameSession, SaveData } from '../core/session';

export const SAVE_KEY = 'dwarf-realm-save-v1';

export class SaveManager {
  constructor(private storage: Storage | null) {}

  has(): boolean {
    if (!this.storage) return false;
    try {
      return this.storage.getItem(SAVE_KEY) !== null;
    } catch {
      return false;
    }
  }

  save(session: GameSession): boolean {
    if (!this.storage) return false;
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(session.serialize()));
      return true;
    } catch {
      return false;
    }
  }

  load(): GameSession | null {
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as SaveData;
      if (data.v !== 1 && data.v !== 2) return null;
      return GameSession.fromSave(data);
    } catch {
      return null;
    }
  }

  clear(): void {
    try {
      this.storage?.removeItem(SAVE_KEY);
    } catch {
      /* 忽略 */
    }
  }
}
