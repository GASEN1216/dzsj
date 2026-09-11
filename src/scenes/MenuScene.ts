/** 主菜单 */
import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../config';
import { GameSession } from '../core/session';
import { SaveManager } from '../save/saveManager';
import { UI_FONT, makeButton, makePanel } from '../ui/widgets';

export class MenuScene extends Phaser.Scene {
  private saveMgr: SaveManager;

  constructor() {
    super('Menu');
    this.saveMgr = new SaveManager(typeof localStorage !== 'undefined' ? localStorage : null);
  }

  create(): void {
    const { width, height } = this.scale;
    // 天空渐变
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x2a3c60, 0x2a3c60, 0x7fa8d9, 0x7fa8d9, 1);
    sky.fillRect(0, 0, GAME_W, GAME_H);
    // 远山与草地
    this.add.rectangle(0, GAME_H - 120, GAME_W, 120, 0x4c9634).setOrigin(0);
    this.add.rectangle(0, GAME_H - 60, GAME_W, 60, 0x6f4a2b).setOrigin(0);
    for (let i = 0; i < 10; i++) {
      this.add.image(60 + i * 120, GAME_H - 128, i % 2 ? 'tree' : 'leaves').setScale(3);
    }
    const dwarf = this.add.image(GAME_W / 2 - 200, GAME_H - 96, 'dwarf0').setScale(4);
    this.tweens.add({ targets: dwarf, y: '-=8', duration: 800, yoyo: true, repeat: -1, ease: 'sine.inout' });
    this.add.image(GAME_W / 2 + 210, GAME_H - 96, 'slime').setScale(4);
    this.add.image(GAME_W / 2 + 260, GAME_H - 94, 'goblin').setScale(4);

    this.add
      .text(GAME_W / 2, 120, '矮 人 国 度', { fontFamily: UI_FONT, fontSize: '64px', color: '#ffd94a', stroke: '#5a3a10', strokeThickness: 8 })
      .setOrigin(0.5);
    this.add
      .text(GAME_W / 2, 175, 'DwarfRealm —— 类《打造世界》2D 沙盒建造策略', { fontFamily: UI_FONT, fontSize: '18px', color: '#cfd6e4' })
      .setOrigin(0.5);

    const btnX = GAME_W / 2;
    let y = 250;
    makeButton(this, btnX, y, '⛏ 新游戏', () => this.startNew(), { width: 240, height: 52, fontSize: 20 });
    y += 70;
    const cont = makeButton(this, btnX, y, '📂 继续游戏', () => this.startContinue(), { width: 240, height: 52, fontSize: 20 });
    if (!this.saveMgr.has()) cont.setAlpha(0.4);
    y += 70;
    makeButton(this, btnX, y, '❓ 操作说明', () => this.toggleHelp(), { width: 240, height: 52, fontSize: 20 });

    this.add
      .text(GAME_W / 2, GAME_H - 16, 'TypeScript + Phaser 3 · 素材全部程序化生成 · MIT License', {
        fontFamily: UI_FONT,
        fontSize: '12px',
        color: '#8a93a8',
      })
      .setOrigin(0.5);

    this.helpPanel = null;
  }

  private helpPanel: { root: Phaser.GameObjects.Container; content: Phaser.GameObjects.Container; close: () => void } | null = null;

  private toggleHelp(): void {
    if (this.helpPanel) {
      this.helpPanel.close();
      this.helpPanel = null;
      return;
    }
    const p = makePanel(this, GAME_W / 2, GAME_H / 2, 560, 420, '操作说明');
    this.helpPanel = p;
    const lines = [
      '【标记任务】选择左侧工具后：',
      '  挖掘 / 拆除 / 取消 —— 按住左键拖拽框选瓦片',
      '  建造 —— 先在「合成」里制作建筑，再左键放置',
      '  取消标记可退还建筑',
      '',
      '【矮人】自动寻路执行任务、搬运战利品回篝火，',
      '  饿了会进食，夜晚困了会回篝火睡觉，',
      '  遇到怪物自动反击（合成铁剑可大幅增强）。',
      '',
      '【生存】白天采集建造；夜晚怪物从地表进攻，',
      '  用墙、门、陷阱规划防御，火把照亮黑暗。',
      '',
      '【法术】加速术 / 照明术 / 治疗术，各有冷却。',
      '',
      '【镜头】WASD / 方向键移动，滚轮缩放，',
      '  右键或 ESC 取消工具，空格暂停。',
      '',
      '【合成与科技】先做工作台 → 研究熔炼术 →',
      '  建熔炉 → 冶炼铁锭 → 锻造术 → 铁剑与陷阱。',
    ];
    p.content.add(
      this.add.text(-260, -180, lines.join('\n'), { fontFamily: UI_FONT, fontSize: '15px', color: '#cfd6e4', lineSpacing: 4 })
    );
  }

  private startNew(): void {
    const session = GameSession.newGame();
    this.registry.set('session', session);
    this.registry.set('saveMgr', this.saveMgr);
    this.scene.start('Game');
  }

  private startContinue(): void {
    const session = this.saveMgr.load();
    if (!session) {
      this.startNew();
      return;
    }
    this.registry.set('session', session);
    this.registry.set('saveMgr', this.saveMgr);
    this.scene.start('Game');
  }
}

// 防止未使用告警
void GAME_H;
