/** 昼夜循环 */
export class GameTime {
  /** 白天时长（秒） */
  static DAY = 150;
  /** 夜晚时长（秒） */
  static NIGHT = 75;
  static CYCLE = GameTime.DAY + GameTime.NIGHT;
  /** 黄昏/黎明过渡时长 */
  static TRANSITION = 12;

  /** 当前周期内的时间 */
  t = 8;
  day = 1;
  /** 总游戏秒数 */
  elapsed = 0;

  get isNight(): boolean {
    return this.t >= GameTime.DAY;
  }

  /** 全屏黑暗强度 0~0.78 */
  darkness(): number {
    const d = GameTime.TRANSITION;
    if (this.t < GameTime.DAY - d) return 0;
    if (this.t < GameTime.DAY) return ((this.t - (GameTime.DAY - d)) / d) * 0.78;
    if (this.t < GameTime.CYCLE - d) return 0.78;
    return (1 - (this.t - (GameTime.CYCLE - d)) / d) * 0.78;
  }

  /** 时段描述 */
  phaseName(): string {
    if (this.t < GameTime.DAY - GameTime.TRANSITION) return '白天';
    if (this.t < GameTime.DAY) return '黄昏';
    if (this.t < GameTime.CYCLE - GameTime.TRANSITION) return '夜晚';
    return '黎明';
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.t += dt;
    if (this.t >= GameTime.CYCLE) {
      this.t -= GameTime.CYCLE;
      this.day++;
    }
  }

  serialize(): { t: number; day: number; elapsed: number } {
    return { t: this.t, day: this.day, elapsed: this.elapsed };
  }

  static deserialize(d: { t: number; day: number; elapsed: number }): GameTime {
    const g = new GameTime();
    g.t = d.t;
    g.day = d.day;
    g.elapsed = d.elapsed;
    return g;
  }
}
