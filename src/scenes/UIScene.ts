/** UI 场景：HUD、工具栏、建造面板、合成/科技/矮人/设置面板、提示与结算 */
import Phaser from 'phaser';
import { RECIPES, RES, RES_ORDER, S, SPELLS, STRUCTURE, TECHS } from '../core/defs';
import type { GameSession } from '../core/session';
import { GAME_H, GAME_W } from '../config';
import { sfx } from '../assets/audio';
import { UI_FONT, makeBar, makeButton, makePanel, setButtonActive, drawBar } from '../ui/widgets';
import type { GameScene, ToolMode } from './GameScene';

interface PanelHandle {
  root: Phaser.GameObjects.Container;
  content: Phaser.GameObjects.Container;
  close: () => void;
}

const BUILDABLES: S[] = [S.LADDER, S.FLOOR_WOOD, S.WALL_WOOD, S.WALL_STONE, S.DOOR, S.TORCH, S.WORKBENCH, S.FURNACE, S.CHEST, S.TRAP];

export class UIScene extends Phaser.Scene {
  session!: GameSession;
  private gameScene!: GameScene;
  private resTexts = new Map<string, Phaser.GameObjects.Text>();
  private phaseText!: Phaser.GameObjects.Text;
  private monsterText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private toolButtons = new Map<ToolMode | 'spell', Phaser.GameObjects.Container>();
  private spellCd = new Map<'speed' | 'light' | 'heal', Phaser.GameObjects.Text>();
  private panel: PanelHandle | null = null;
  private panelKind: 'build' | 'craft' | 'tech' | 'dwarves' | 'settings' | null = null;
  private speedButtons = new Map<number, Phaser.GameObjects.Container>();
  private toasts: Phaser.GameObjects.Text[] = [];
  private frame = 0;
  private overShown = false;

  constructor() {
    super('UI');
  }

  create(): void {
    const session = this.registry.get('session') as GameSession | undefined;
    if (!session) {
      this.scene.stop();
      return;
    }
    this.session = session;
    this.gameScene = this.scene.get('Game') as GameScene;
    sfx.setVolume(session.settings.volume);
    this.overShown = session.gameOver;

    this.buildTopBar();
    this.buildToolBar();
    this.buildBottomBar();
    this.hint = this.add
      .text(70, GAME_H - 26, '', { fontFamily: UI_FONT, fontSize: '13px', color: '#cfd6e4' })
      .setDepth(10);
  }

  // ---------- 顶部资源栏 ----------

  private buildTopBar(): void {
    this.add.rectangle(0, 0, GAME_W, 42, 0x1c222e, 0.94).setOrigin(0).setDepth(5);
    let x = 14;
    for (const r of RES_ORDER) {
      this.add.image(x, 21, RES[r].tex).setScale(1.2).setDepth(6);
      const txt = this.add.text(x + 14, 21, '0', { fontFamily: UI_FONT, fontSize: '15px', color: '#ffffff' }).setOrigin(0, 0.5).setDepth(6);
      this.resTexts.set(r, txt);
      x += 80;
    }
    this.phaseText = this.add.text(x + 10, 21, '', { fontFamily: UI_FONT, fontSize: '15px', color: '#ffd94a' }).setOrigin(0, 0.5).setDepth(6);
    this.monsterText = this.add.text(x + 210, 21, '', { fontFamily: UI_FONT, fontSize: '15px', color: '#ff8a8a' }).setOrigin(0, 0.5).setDepth(6);

    // 速度控制
    const mk = (cx: number, label: string, sp: 0 | 1 | 2): void => {
      const b = makeButton(this, cx, 21, label, () => {
        this.session.settings.speed = sp;
        this.refreshSpeed();
      }, { width: 34, height: 28, fontSize: 14 });
      this.speedButtons.set(sp, b);
      b.setDepth(6);
    };
    mk(920, '❚❚', 0);
    mk(958, '▶', 1);
    mk(996, '▶▶', 2);

    makeButton(this, 1046, 21, '💾', () => {
      const mgr = this.registry.get('saveMgr') as { save: (s: GameSession) => boolean };
      if (mgr.save(this.session)) this.showToast('已保存');
      sfx.play('save');
    }, { width: 36, height: 28, fontSize: 14 }).setDepth(6);

    makeButton(this, 1090, 21, '⚙', () => this.togglePanel('settings'), { width: 36, height: 28, fontSize: 16 }).setDepth(6);
    this.refreshSpeed();
  }

  private refreshSpeed(): void {
    for (const [sp, btn] of this.speedButtons) {
      setButtonActive(btn, this.session.settings.speed === sp);
    }
  }

  // ---------- 左侧工具栏 ----------

  private toolY(i: number): number {
    return 66 + i * 50;
  }

  private buildToolBar(): void {
    const mkTool = (i: number, mode: ToolMode, icon: string, label: string, hint: string): void => {
      const c = makeButton(this, 30, this.toolY(i), '', () => {
        if (mode === 'build') {
          // 建造工具：打开建筑选择面板
          this.togglePanel('build');
          this.refreshTools();
        } else {
          this.gameScene.setTool(mode);
          this.refreshTools();
        }
      }, { width: 48, height: 42 });
      c.add(this.add.image(0, -3, icon).setScale(1.4));
      c.add(this.add.text(0, 13, label, { fontFamily: UI_FONT, fontSize: '9px', color: '#cfd6e4' }).setOrigin(0.5));
      c.setDepth(6);
      this.toolButtons.set(mode, c);
      (c as unknown as { hint: string }).hint = hint;
    };
    mkTool(0, 'dig', 'tool_dig', '挖掘', '左键拖拽框选要挖掘的瓦片，矮人会自动前往挖掘');
    mkTool(1, 'build', 'tool_build', '建造', '选择要放置的建筑（库存中的），然后左键放置（可拖动连放）');
    mkTool(2, 'demolish', 'tool_demolish', '拆除', '左键拖拽框选要拆除的建筑，矮人会前往拆除并回收');
    mkTool(3, 'cancel', 'tool_cancel', '取消', '左键拖拽框选以取消任务标记（建造标记会退还库存）');

    // 法术
    const spells: { id: 'speed' | 'light' | 'heal'; icon: string; label: string }[] = [
      { id: 'speed', icon: 'spell_speed', label: '加速' },
      { id: 'light', icon: 'spell_light', label: '照明' },
      { id: 'heal', icon: 'spell_heal', label: '治疗' },
    ];
    spells.forEach((sp, i) => {
      const mode: ToolMode = 'spell';
      const c = makeButton(this, 30, this.toolY(i + 4), '', () => {
        this.gameScene.setTool(mode, sp.id);
        this.refreshTools();
      }, { width: 48, height: 42 });
      c.add(this.add.image(0, -3, sp.icon).setScale(1.4));
      c.add(this.add.text(0, 13, sp.label, { fontFamily: UI_FONT, fontSize: '9px', color: '#cfd6e4' }).setOrigin(0.5));
      const cd = this.add.text(0, -14, '', { fontFamily: UI_FONT, fontSize: '10px', color: '#ffd94a' }).setOrigin(0.5);
      c.add(cd);
      this.spellCd.set(sp.id, cd);
      c.setDepth(6);
      this.toolButtons.set('spell', c);
      (c as unknown as { hint: string }).hint = `${SPELLS.find((s) => s.id === sp.id)!.name}：${SPELLS.find((s) => s.id === sp.id)!.desc}（左键点击施放）`;
      // 覆盖 hint 记录
      (c as unknown as { spellHint: string }).spellHint = (c as unknown as { hint: string }).hint;
    });

    // 工具 hover 提示
    for (const [, btn] of this.toolButtons) {
      const rect = (btn as unknown as { btnRect: Phaser.GameObjects.Rectangle }).btnRect;
      rect.on('pointerover', () => {
        const h = (btn as unknown as { hint?: string; spellHint?: string }).spellHint ?? (btn as unknown as { hint?: string }).hint;
        if (h) this.hint.setText(h);
      });
      rect.on('pointerout', () => this.hint.setText(''));
    }
  }

  private refreshTools(): void {
    for (const [mode, btn] of this.toolButtons) {
      if (mode === 'spell') {
        setButtonActive(btn, this.gameScene.tool === 'spell');
      } else {
        setButtonActive(btn, this.gameScene.tool === mode);
      }
    }
  }

  onToolCancelled(): void {
    this.refreshTools();
  }

  // ---------- 底部按钮 ----------

  private buildBottomBar(): void {
    this.add.rectangle(0, GAME_H - 44, GAME_W, 44, 0x1c222e, 0.94).setOrigin(0).setDepth(5);
    makeButton(this, GAME_W - 320, GAME_H - 22, '🔨 合成', () => this.togglePanel('craft'), { width: 90, height: 34 }).setDepth(6);
    makeButton(this, GAME_W - 220, GAME_H - 22, '🔬 科技', () => this.togglePanel('tech'), { width: 90, height: 34 }).setDepth(6);
    makeButton(this, GAME_W - 120, GAME_H - 22, '🧔 矮人', () => this.togglePanel('dwarves'), { width: 90, height: 34 }).setDepth(6);
    this.add
      .text(16, GAME_H - 22, 'WASD/方向键 移动镜头 · 滚轮缩放 · 右键/ESC 取消工具 · 空格 暂停', {
        fontFamily: UI_FONT,
        fontSize: '12px',
        color: '#8a93a8',
      })
      .setOrigin(0, 0.5)
      .setDepth(6);
  }

  // ---------- 面板 ----------

  private togglePanel(kind: 'build' | 'craft' | 'tech' | 'dwarves' | 'settings'): void {
    if (this.panel && this.panelKind === kind) {
      this.panel.close();
      this.panel = null;
      this.panelKind = null;
      return;
    }
    if (this.panel) this.panel.close();
    this.panel = null;
    this.panelKind = kind;
    switch (kind) {
      case 'build':
        this.openBuild();
        break;
      case 'craft':
        this.openCraft();
        break;
      case 'tech':
        this.openTech();
        break;
      case 'dwarves':
        this.openDwarves();
        break;
      case 'settings':
        this.openSettings();
        break;
      default:
        break;
    }
  }

  /** 建造选择面板：从建筑库存中选择要放置的建筑 */
  private openBuild(): void {
    const p = makePanel(this, GAME_W / 2, GAME_H / 2 - 10, 560, 320, '🏗 选择要建造的建筑');
    this.panel = p;
    const redraws: (() => void)[] = [];
    BUILDABLES.forEach((s, i) => {
      const col = i % 5;
      const row = Math.floor(i / 5);
      const x = -230 + col * 116;
      const y = -90 + row * 110;
      const cell = this.add.container(x, y);
      const btn = makeButton(this, 0, 0, '', () => {
        this.gameScene.setTool('build', s);
        this.refreshTools();
        this.showToast(`已选择「${STRUCTURE[s].name}」，左键放置（可拖动连放）`);
        this.togglePanel('build'); // 关闭面板
      }, { width: 100, height: 90 });
      const icon = this.add.image(0, -22, STRUCTURE[s].tex).setScale(2);
      const nameT = this.add.text(0, 8, STRUCTURE[s].name, { fontFamily: UI_FONT, fontSize: '12px', color: '#ffffff' }).setOrigin(0.5);
      const stockT = this.add.text(0, 28, '', { fontFamily: UI_FONT, fontSize: '13px', color: '#ffd94a' }).setOrigin(0.5);
      cell.add([btn, icon, nameT, stockT]);
      p.content.add(cell);
      redraws.push(() => {
        const n = this.session.inv.stockCount(s);
        stockT.setText(n > 0 ? `库存 ${n}` : '库存 0');
        stockT.setColor(n > 0 ? '#ffd94a' : '#8a93a8');
        setButtonEnabledLocal(btn, n > 0);
      });
      redraws[redraws.length - 1]();
    });
    p.content.add(
      this.add
        .text(0, 130, '库存不足的建筑需先在「合成」面板制作 · 拆除建筑会退还库存', { fontFamily: UI_FONT, fontSize: '12px', color: '#8a93a8' })
        .setOrigin(0.5)
    );
    (p as unknown as { refresh?: () => void }).refresh = () => redraws.forEach((rr) => rr());
  }

  private openCraft(): void {
    const p = makePanel(this, GAME_W / 2, GAME_H / 2 - 10, 620, 480, '🔨 合成');
    this.panel = p;
    const redraws: (() => void)[] = [];
    RECIPES.forEach((r, i) => {
      const y = -200 + i * 36;
      const row = this.add.container(0, y);
      const icon = this.add.image(-270, 0, r.outStructure ? STRUCTURE[r.outStructure].tex : RES[r.outRes!].tex).setScale(1.3);
      const nameT = this.add.text(-248, -10, r.name, { fontFamily: UI_FONT, fontSize: '15px', color: '#ffffff' });
      const descT = this.add.text(-248, 6, r.desc, { fontFamily: UI_FONT, fontSize: '11px', color: '#8a93a8' });
      const matsT = this.add.text(-60, -4, '', { fontFamily: UI_FONT, fontSize: '13px', color: '#cfd6e4' });
      const stationT = this.add.text(-60, 10, '', { fontFamily: UI_FONT, fontSize: '11px', color: '#8a93a8' });
      const btn = makeButton(this, 250, 0, '合成', () => {
        if (this.session.queueCraft(r.id)) sfx.play('click');
        redraws.forEach((rr) => rr());
      }, { width: 70, height: 28, fontSize: 13 });
      row.add([icon, nameT, descT, matsT, stationT, btn]);
      p.content.add(row);
      redraws.push(() => {
        const ok = this.session.techs.recipeAvailable(r);
        const hasMats = this.session.inv.has(r.inputs);
        matsT.setText(
          Object.entries(r.inputs)
            .map(([k, v]) => `${RES[k as keyof typeof RES].name} ${this.session.inv.count(k as never) ?? 0}/${v}`)
            .join('  ')
        );
        matsT.setColor(hasMats || !ok ? '#cfd6e4' : '#ff8a8a');
        stationT.setText(
          (r.station === 'workbench' ? '需要工作台' : r.station === 'furnace' ? '需要熔炉' : '徒手可做') + (ok ? '' : ' · 科技未解锁')
        );
        setButtonEnabledLocal(btn, ok && hasMats);
      });
      redraws[redraws.length - 1]();
    });
    p.content.add(
      this.add.text(0, 214, '合成任务会进入队列，最近的空闲矮人会前往工作站制作', { fontFamily: UI_FONT, fontSize: '12px', color: '#8a93a8' }).setOrigin(0.5)
    );
    (p as unknown as { refresh?: () => void }).refresh = () => redraws.forEach((rr) => rr());
  }

  private openTech(): void {
    const p = makePanel(this, GAME_W / 2, GAME_H / 2 - 10, 560, 300, '🔬 科技研究');
    this.panel = p;
    const rows: (() => void)[] = [];
    TECHS.forEach((t, i) => {
      const y = -100 + i * 64;
      const row = this.add.container(0, y);
      const nameT = this.add.text(-240, -18, t.name, { fontFamily: UI_FONT, fontSize: '17px', color: '#ffd94a' });
      const descT = this.add.text(-240, 4, t.desc, { fontFamily: UI_FONT, fontSize: '12px', color: '#8a93a8' });
      const costT = this.add.text(-240, 20, '', { fontFamily: UI_FONT, fontSize: '12px', color: '#cfd6e4' });
      const btn = makeButton(this, 210, 0, '研究', () => {
        if (this.session.research(t.id)) sfx.play('craft');
        rows.forEach((rr) => rr());
      }, { width: 80, height: 34, fontSize: 14 });
      row.add([nameT, descT, costT, btn]);
      p.content.add(row);
      rows.push(() => {
        const unlocked = this.session.techs.isUnlocked(t.id);
        const ready = this.session.techs.techReady(t);
        costT.setText(
          Object.entries(t.cost)
            .map(([k, v]) => `${RES[k as keyof typeof RES].name} ${this.session.inv.count(k as never) ?? 0}/${v}`)
            .join('  ') + (t.requires.length ? `（前置：${t.requires.map((id) => TECHS.find((x) => x.id === id)!.name).join('、')}）` : '')
        );
        if (unlocked) {
          btn.setAlpha(0.4);
          (btn as unknown as { btnText: Phaser.GameObjects.Text }).btnText.setText('已解锁');
        } else {
          setButtonEnabledLocal(btn, ready && this.session.inv.has(t.cost));
        }
      });
      rows[rows.length - 1]();
    });
  }

  private openDwarves(): void {
    const p = makePanel(this, GAME_W / 2, GAME_H / 2 - 10, 520, 340, '🧔 矮人小队');
    this.panel = p;
    const stateTexts: Phaser.GameObjects.Text[] = [];
    const bars: { g: Phaser.GameObjects.Graphics; get: () => number }[] = [];
    this.session.dwarves.forEach((d, i) => {
      const y = -130 + i * 62;
      const row = this.add.container(0, y);
      const icon = this.add.image(-220, 0, `dwarf${d.variant}`).setScale(2);
      const nameT = this.add.text(-195, -22, d.name, { fontFamily: UI_FONT, fontSize: '16px', color: '#ffffff' });
      const stateT = this.add.text(-195, -2, '', { fontFamily: UI_FONT, fontSize: '12px', color: '#cfd6e4' });
      const equipT = this.add.text(-195, 16, d.armed ? '⚔ 已装备铁剑' : '', { fontFamily: UI_FONT, fontSize: '11px', color: '#9db8ff' });
      stateTexts.push(stateT);
      row.add([icon, nameT, stateT, equipT]);
      const labels = ['生命', '饱食', '精力'];
      const barDefs = [
        { color: 0xe83a3a, get: () => d.hp / 100 },
        { color: 0xd5985a, get: () => d.hunger / 100 },
        { color: 0x4a90d9, get: () => d.energy / 100 },
      ];
      barDefs.forEach((bd, bi) => {
        row.add(this.add.text(-70, -20 + bi * 20 - 5, labels[bi], { fontFamily: UI_FONT, fontSize: '10px', color: '#8a93a8' }).setOrigin(1, 0.5));
        const g = makeBar(this, -60, -20 + bi * 20, 220, 10, bd.color);
        row.add(g);
        bars.push({ g, get: bd.get });
      });
      p.content.add(row);
    });
    (p as unknown as { refresh?: () => void }).refresh = () => {
      this.session.dwarves.forEach((d, i) => {
        stateTexts[i]?.setText(`${d.stateName}${d.carried ? `（携带 ${RES[d.carried.res].name}×${d.carried.n}）` : ''}`);
      });
      bars.forEach((b) => drawBar(b.g, b.get()));
    };
  }

  private openSettings(): void {
    const p = makePanel(this, GAME_W / 2, GAME_H / 2 - 10, 480, 400, '⚙ 设置');
    this.panel = p;
    this.panelKind = 'settings';

    // 音量滑条
    p.content.add(this.add.text(-180, -140, '音量', { fontFamily: UI_FONT, fontSize: '16px', color: '#ffffff' }));
    const track = this.add.rectangle(-60, -140, 200, 8, 0x3a4356).setOrigin(0, 0.5);
    const handle = this.add.rectangle(-60 + 200 * this.session.settings.volume, -140, 14, 22, 0x9db8ff).setOrigin(0.5);
    handle.setInteractive({ draggable: true, useHandCursor: true });
    handle.on('drag', (_p: unknown, dx: number) => {
      const nx = Phaser.Math.Clamp(dx, -60, 140);
      handle.x = nx;
      const v = (nx + 60) / 200;
      this.session.settings.volume = v;
      sfx.setVolume(v);
    });
    p.content.add([track, handle]);

    p.content.add(this.add.text(-180, -90, '游戏速度', { fontFamily: UI_FONT, fontSize: '16px', color: '#ffffff' }));
    const speeds: { sp: 0 | 1 | 2; label: string }[] = [
      { sp: 0, label: '暂停' },
      { sp: 1, label: '1x' },
      { sp: 2, label: '2x' },
    ];
    speeds.forEach((s, i) => {
      const b = makeButton(this, -120 + i * 100, -60, s.label, () => {
        this.session.settings.speed = s.sp;
        this.refreshSpeed();
      }, { width: 80, height: 34 });
      p.content.add(b);
      this.speedButtons.set(s.sp, b);
    });

    const saveBtn = makeButton(this, 0, 20, '💾 保存游戏', () => {
      const mgr = this.registry.get('saveMgr') as { save: (s: GameSession) => boolean };
      if (mgr.save(this.session)) {
        this.showToast('已保存');
        sfx.play('save');
      }
    }, { width: 200, height: 40 });
    p.content.add(saveBtn);

    const menuBtn = makeButton(this, 0, 70, '🏠 返回主菜单', () => this.backToMenu(), { width: 200, height: 40 });
    p.content.add(menuBtn);

    p.content.add(
      this.add.text(0, 120, '提示：游戏每 90 秒自动保存一次', { fontFamily: UI_FONT, fontSize: '12px', color: '#8a93a8' }).setOrigin(0.5)
    );
    this.refreshSpeed();
  }

  private backToMenu(): void {
    if (this.panel) {
      this.panel.close();
      this.panel = null;
      this.panelKind = null;
    }
    this.session.world.onChange = null;
    this.scene.stop('Game');
    this.scene.stop();
    this.scene.start('Menu');
  }

  // ---------- 提示与结算 ----------

  showToast(text: string): void {
    const t = this.add
      .text(GAME_W / 2, 60 + this.toasts.length * 26, text, {
        fontFamily: UI_FONT,
        fontSize: '15px',
        color: '#ffffff',
        backgroundColor: '#232a38dd',
        padding: { x: 10, y: 4 },
      })
      .setOrigin(0.5, 0)
      .setDepth(2000);
    this.toasts.push(t);
    this.tweens.add({
      targets: t,
      alpha: 0,
      delay: 2600,
      duration: 500,
      onComplete: () => {
        this.toasts = this.toasts.filter((x) => x !== t);
        this.toasts.forEach((x, i) => x.setY(60 + i * 26));
        t.destroy();
      },
    });
  }

  private showGameOver(): void {
    this.overShown = true;
    const overlay = this.add.container(0, 0).setDepth(3000);
    overlay.add(this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.75));
    overlay.add(
      this.add
        .text(GAME_W / 2, GAME_H / 2 - 60, '王国覆灭', { fontFamily: UI_FONT, fontSize: '56px', color: '#ff5a5a' })
        .setOrigin(0.5)
    );
    overlay.add(
      this.add
        .text(GAME_W / 2, GAME_H / 2, `坚持了 ${this.session.time.day} 天`, { fontFamily: UI_FONT, fontSize: '20px', color: '#cfd6e4' })
        .setOrigin(0.5)
    );
    overlay.add(makeButton(this, GAME_W / 2, GAME_H / 2 + 70, '返回主菜单', () => this.backToMenu(), { width: 220, height: 46 }));
  }

  // ---------- 帧循环 ----------

  override update(): void {
    if (!this.session) return;
    this.frame++;
    if (this.frame % 12 !== 0) return;

    for (const r of RES_ORDER) {
      this.resTexts.get(r)?.setText(`${this.session.inv.count(r)}`);
    }
    const cap = `${this.session.inv.used()}/${this.session.inv.capacity}`;
    this.phaseText.setText(`第 ${this.session.time.day} 天 · ${this.session.time.phaseName()} ${this.session.time.isNight ? '🌙' : '☀'} · 仓库 ${cap}`);
    this.monsterText.setText(this.session.monsters.length > 0 ? `👹 ×${this.session.monsters.length}` : '');

    for (const [id, cd] of this.spellCd) {
      const v = this.session.spells.cds[id];
      cd.setText(v > 0 ? `${Math.ceil(v)}s` : '');
    }

    if (this.panel && (this.panelKind === 'dwarves' || this.panelKind === 'craft' || this.panelKind === 'tech')) {
      const refresh = (this.panel as unknown as { refresh?: () => void }).refresh;
      refresh?.();
    }

    if (this.session.gameOver && !this.overShown) this.showGameOver();
  }
}

function setButtonEnabledLocal(c: Phaser.GameObjects.Container, enabled: boolean): void {
  const { btnRect, btnText } = c as unknown as { btnRect: Phaser.GameObjects.Rectangle; btnText: Phaser.GameObjects.Text };
  btnRect.setFillStyle(enabled ? 0x3a4356 : 0x2a3040);
  btnText.setAlpha(enabled ? 1 : 0.4);
}
