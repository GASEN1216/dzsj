/** 游戏主场景：世界渲染（RenderTexture）、实体同步、光照、鼠标工具、镜头 */
import Phaser from 'phaser';
import { RES, STRUCTURE, S, T, TERRAIN } from '../core/defs';
import { GameSession } from '../core/session';
import type { Monster } from '../entities/monster';
import { SaveManager } from '../save/saveManager';
import { TEX_PX, WORLD_SCALE, TILE_PX, AUTOSAVE_SEC, GAME_W, GAME_H } from '../config';
import { canPlaceStructure } from '../world/worldGen';
import { sfx } from '../assets/audio';
import type { UIScene } from './UIScene';

export type ToolMode = 'none' | 'dig' | 'build' | 'demolish' | 'cancel' | 'spell';

export class GameScene extends Phaser.Scene {
  session!: GameSession;
  saveMgr!: SaveManager;
  private worldC!: Phaser.GameObjects.Container;
  private terrainRT!: Phaser.GameObjects.RenderTexture;
  private structRT!: Phaser.GameObjects.RenderTexture;
  private lightRT!: Phaser.GameObjects.RenderTexture;
  private markerG!: Phaser.GameObjects.Graphics;
  private entityG!: Phaser.GameObjects.Graphics;
  private overlayG!: Phaser.GameObjects.Graphics;
  private lightG!: Phaser.GameObjects.Graphics;
  private dropLayer!: Phaser.GameObjects.Container;
  private entityLayer!: Phaser.GameObjects.Container;
  private ghost!: Phaser.GameObjects.Image;

  private dwarfSprites = new Map<number, { spr: Phaser.GameObjects.Image; mv: boolean }>();
  private monsterSprites = new Map<Monster, Phaser.GameObjects.Image>();
  private dropSprites = new Map<number, Phaser.GameObjects.Image>();

  tool: ToolMode = 'none';
  buildSel: S = S.NONE;
  spellSel: SpellId_ = 'speed';

  private dragStart: { x: number; y: number } | null = null;
  private panning = false;
  private panLast = { x: 0, y: 0 };
  private paintLast = { x: -1, y: -1 };
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private autosaveTimer = 0;
  private elapsedForFx = 0;
  private ui: UIScene | null = null;

  constructor() {
    super('Game');
  }

  create(): void {
    const session = this.registry.get('session') as GameSession | undefined;
    const saveMgr = this.registry.get('saveMgr') as SaveManager | undefined;
    if (!session || !saveMgr) {
      this.scene.start('Menu');
      return;
    }
    this.session = session;
    this.saveMgr = saveMgr;
    this.ui = this.scene.get('UI') as UIScene | null;
    if (this.ui) this.scene.launch('UI');

    const { world } = session;
    const tw = world.w * TEX_PX;
    const th = world.h * TEX_PX;

    this.cameras.main.setBackgroundColor('#87b5e0');
    this.cameras.main.setBounds(0, 0, world.w * TILE_PX, world.h * TILE_PX);
    this.cameras.main.centerOn((session.base.x + 0.5) * TILE_PX, (session.base.y - 2) * TILE_PX);
    this.input.mouse?.disableContextMenu();

    // 世界容器（像素风整体放大）
    this.worldC = this.add.container(0, 0).setScale(WORLD_SCALE);
    this.terrainRT = this.add.renderTexture(0, 0, tw, th).setOrigin(0);
    this.structRT = this.add.renderTexture(0, 0, tw, th).setOrigin(0);
    this.markerG = this.add.graphics();
    this.dropLayer = this.add.container(0, 0);
    this.entityLayer = this.add.container(0, 0);
    this.entityG = this.add.graphics();
    // 光照 RT 只需覆盖最小缩放（0.5）时的视口，无需全图尺寸——每帧重绘成本降低约 3 倍
    const lw = Math.ceil(GAME_W / WORLD_SCALE / 0.5) + 32;
    const lh = Math.ceil(GAME_H / WORLD_SCALE / 0.5) + 32;
    this.lightRT = this.add.renderTexture(0, 0, lw, lh).setOrigin(0);
    this.overlayG = this.add.graphics();
    this.lightG = this.add.graphics();
    // lightG 仅作为 lightRT 的绘制笔刷，不参与场景渲染
    this.lightG.removeFromDisplayList();
    this.worldC.add([this.terrainRT, this.structRT, this.markerG, this.dropLayer, this.entityLayer, this.entityG, this.lightRT, this.overlayG]);

    // 建造虚影
    this.ghost = this.add.image(0, 0, 'white16').setOrigin(0).setScale(WORLD_SCALE).setVisible(false).setAlpha(0.6);

    // 全量重绘
    this.redrawAll();
    world.onChange = (x, y) => this.redrawTile(x, y);

    // 输入
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,ESC,SPACE') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.5, 3));
    });
    this.input.keyboard!.on('keydown-ESC', () => this.setTool('none'));
    this.input.keyboard!.on('keydown-SPACE', () => {
      session.settings.speed = session.settings.speed === 0 ? 1 : 0;
    });

    this.events.once('shutdown', () => {
      world.onChange = null;
    });
  }

  // ---------- 工具 ----------

  setTool(tool: ToolMode, param?: S | SpellId_): void {
    this.tool = tool;
    if (tool === 'build') this.buildSel = (param as S) ?? this.buildSel;
    if (tool === 'spell') this.spellSel = (param as SpellId_) ?? this.spellSel;
    if (tool !== 'build') this.ghost.setVisible(false);
    this.dragStart = null;
  }

  private tileAt(p: Phaser.Input.Pointer): { x: number; y: number } {
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    return { x: Math.floor(wp.x / TILE_PX), y: Math.floor(wp.y / TILE_PX) };
  }

  private onDown(p: Phaser.Input.Pointer): void {
    sfx.unlock();
    if (this.session.gameOver) return;
    const t = this.tileAt(p);
    if (p.middleButtonDown()) {
      this.panning = true;
      this.panLast = { x: p.x, y: p.y };
      return;
    }
    if (p.rightButtonDown()) {
      this.setTool('none');
      this.ui?.onToolCancelled();
      return;
    }
    if (!p.leftButtonDown()) return;
    switch (this.tool) {
      case 'dig':
      case 'demolish':
      case 'cancel':
        this.dragStart = t;
        break;
      case 'build':
        this.paintLast = t;
        this.tryBuildAt(t.x, t.y);
        break;
      case 'spell':
        this.castAt(t);
        break;
      default:
        this.panning = true;
        this.panLast = { x: p.x, y: p.y };
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (this.panning) {
      const cam = this.cameras.main;
      cam.scrollX -= (p.x - this.panLast.x) / cam.zoom;
      cam.scrollY -= (p.y - this.panLast.y) / cam.zoom;
      this.panLast = { x: p.x, y: p.y };
      return;
    }
    const t = this.tileAt(p);
    if (this.tool === 'build' && p.leftButtonDown() && (t.x !== this.paintLast.x || t.y !== this.paintLast.y)) {
      this.paintLast = t;
      this.tryBuildAt(t.x, t.y);
    }
  }

  private onUp(p: Phaser.Input.Pointer): void {
    this.panning = false;
    // 注意：pointerup 时 buttons 已归零，不能再用 leftButtonDown() 判断；
    // dragStart 只会在左键按下时设置，因此这里直接检查 dragStart。
    if (this.dragStart) {
      const t = this.tileAt(p);
      const a = this.dragStart;
      this.dragStart = null;
      if (this.tool === 'dig') {
        const n = this.session.markDig(a.x, a.y, t.x, t.y);
        if (n > 0) sfx.play('click');
      } else if (this.tool === 'demolish') {
        const n = this.session.markDemolish(a.x, a.y, t.x, t.y);
        if (n > 0) sfx.play('click');
      } else if (this.tool === 'cancel') {
        const n = this.session.cancelMarks(a.x, a.y, t.x, t.y);
        if (n > 0) sfx.play('msg');
      }
    }
    this.dragStart = null;
    this.paintLast = { x: -1, y: -1 };
  }

  private tryBuildAt(x: number, y: number): void {
    const res = this.session.markBuild(x, y, this.buildSel);
    if (res === 'invalid') sfx.play('error');
    else if (res === 'ok') sfx.play('click');
    else if (res === 'no_stock') {
      sfx.play('error');
      this.ui?.showToast('建筑库存不足，请先在「合成」中制作');
    }
  }

  private castAt(t: { x: number; y: number }): void {
    const ok = this.session.castSpell(this.spellSel, t.x + 0.5, t.y + 0.5);
    if (!ok) sfx.play('error');
  }

  // ---------- 渲染 ----------

  private redrawAll(): void {
    const { world } = this.session;
    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) this.redrawTile(x, y);
    }
  }

  private redrawTile(x: number, y: number): void {
    const { world } = this.session;
    const px = x * TEX_PX;
    const py = y * TEX_PX;
    this.terrainRT.erase('white16', px, py);
    this.structRT.erase('white16', px, py);
    if (y > world.surface[x]) this.terrainRT.drawFrame('cave_bg', undefined, px, py);
    const t = world.terrainAt(x, y);
    if (t !== T.AIR) this.terrainRT.drawFrame(TERRAIN[t].tex, undefined, px, py);
    const s = world.structureAt(x, y);
    if (s !== S.NONE) this.structRT.drawFrame(STRUCTURE[s].tex, undefined, px, py);
  }

  private drawMarkers(): void {
    const g = this.markerG;
    g.clear();
    const ts = TEX_PX;
    // 只绘制视口内的任务标记
    const view = this.cameras.main.worldView;
    const vx = view.x / WORLD_SCALE;
    const vy = view.y / WORLD_SCALE;
    const vw = view.width / WORLD_SCALE;
    const vh = view.height / WORLD_SCALE;
    for (const task of this.session.tasks.tasks) {
      const x = task.x * ts;
      const y = task.y * ts;
      if (x < vx - ts || x > vx + vw || y < vy - ts || y > vy + vh) continue;
      if (task.type === 'dig') {
        g.fillStyle(0xffd94a, 0.22).fillRect(x, y, ts, ts);
        g.lineStyle(1, 0xffd94a, 0.9).strokeRect(x + 0.5, y + 0.5, ts - 1, ts - 1);
      } else if (task.type === 'build') {
        g.lineStyle(1, 0x6cff6c, 0.9).strokeRect(x + 0.5, y + 0.5, ts - 1, ts - 1);
      } else if (task.type === 'demolish') {
        g.fillStyle(0xff5a5a, 0.2).fillRect(x, y, ts, ts);
        g.lineStyle(1, 0xff5a5a, 0.9).strokeRect(x + 0.5, y + 0.5, ts - 1, ts - 1);
      }
    }
  }

  private syncEntities(time: number): void {
    const { dwarves, monsters, drops } = this.session;
    // 矮人
    for (const d of dwarves) {
      let entry = this.dwarfSprites.get(d.id);
      if (!entry) {
        const spr = this.add.image(d.x * TEX_PX, d.y * TEX_PX, `dwarf${d.variant}`).setOrigin(0.5, 0.95);
        this.entityLayer.add(spr);
        entry = { spr, mv: false };
        this.dwarfSprites.set(d.id, entry);
      }
      const wx = d.x * TEX_PX;
      const wy = d.y * TEX_PX;
      const moving = Math.abs(entry.spr.x - wx) > 0.2 || Math.abs(entry.spr.y - wy) > 0.2;
      entry.spr.setTexture(`dwarf${d.variant}`);
      entry.spr.setPosition(wx, wy - (moving ? Math.abs(Math.sin(time * 0.012 + d.id)) * 2 : 0));
      entry.spr.setFlipX(d.faceLeft);
      entry.spr.setAlpha(d.state === 'sleep' ? 0.8 : 1);
      if (d.hp < 100) {
        this.entityG.fillStyle(0x000000, 0.6).fillRect(wx - 7, wy - 20, 14, 3);
        this.entityG.fillStyle(d.hp > 40 ? 0x4ade4a : 0xff5a5a, 1).fillRect(wx - 6, wy - 19, 12 * (d.hp / 100), 1);
      }
    }
    for (const [id, e] of this.dwarfSprites) {
      if (!dwarves.find((d) => d.id === id)) {
        e.spr.destroy();
        this.dwarfSprites.delete(id);
      }
    }
    // 怪物
    for (const m of monsters) {
      let spr = this.monsterSprites.get(m_id(m));
      if (!spr) {
        spr = this.add.image(m.x * TEX_PX, m.y * TEX_PX, m.kind === 'slime' ? 'slime' : 'goblin').setOrigin(0.5, 0.95);
        this.entityLayer.add(spr);
        this.monsterSprites.set(m_id(m), spr);
      }
      spr.setPosition(m.x * TEX_PX, m.y * TEX_PX - Math.abs(Math.sin(time * 0.01 + m.x)) * 1.5);
      spr.setFlipX(m.faceLeft);
      if (m.hp < m.info.hp) {
        this.entityG.fillStyle(0x000000, 0.6).fillRect(m.x * TEX_PX - 7, m.y * TEX_PX - 20, 14, 3);
        this.entityG.fillStyle(0xff5a5a, 1).fillRect(m.x * TEX_PX - 6, m.y * TEX_PX - 19, 12 * (m.hp / m.info.hp), 1);
      }
    }
    for (const [m, spr] of this.monsterSprites) {
      if (!monsters.includes(m)) {
        spr.destroy();
        this.monsterSprites.delete(m);
      }
    }
    // 掉落物
    const liveDropIds = new Set(drops.map((d2) => d2.id));
    for (const drop of drops) {
      let spr = this.dropSprites.get(drop.id);
      if (!spr) {
        spr = this.add.image(drop.x * TEX_PX, drop.y * TEX_PX, RES[drop.res].tex).setScale(0.7).setOrigin(0.5, 0.9);
        this.dropLayer.add(spr);
        this.dropSprites.set(drop.id, spr);
      }
      spr.setPosition(drop.x * TEX_PX, drop.y * TEX_PX - Math.sin(time * 0.004 + drop.id) * 1);
    }
    for (const [id, spr] of this.dropSprites) {
      if (!liveDropIds.has(id)) {
        spr.destroy();
        this.dropSprites.delete(id);
      }
    }
  }

  private lighting(): void {
    const cam = this.cameras.main;
    const view = cam.worldView;
    const vx = view.x / WORLD_SCALE;
    const vy = view.y / WORLD_SCALE;
    const vw = view.width / WORLD_SCALE;
    const vh = view.height / WORLD_SCALE;
    const rt = this.lightRT;
    // RT 跟随视口左上角，内部以局部坐标绘制
    rt.setPosition(Math.floor(vx), Math.floor(vy));
    rt.clear();
    const g = this.lightG;
    g.clear();

    const nightA = this.session.time.darkness();
    if (nightA > 0.01) {
      g.fillStyle(0x060913, nightA).fillRect(0, 0, vw, vh);
    }
    // 地下黑暗（按列地表高度，局部坐标）
    const x0 = Math.max(0, Math.floor(vx / TEX_PX) - 1);
    const x1 = Math.min(this.session.world.w - 1, Math.ceil((vx + vw) / TEX_PX) + 1);
    g.fillStyle(0x04060c, 0.6);
    for (let x = x0; x <= x1; x++) {
      const top = this.session.world.surface[x] * TEX_PX - vy;
      if (top > vh) continue;
      const y0 = Math.max(top, 0);
      g.fillRect(x * TEX_PX - vx, y0, TEX_PX, vh - y0);
    }
    rt.draw(g);

    // 光源挖洞（局部坐标）
    const ctx = this.session.buildCtx();
    for (const l of ctx.lights) {
      const lx = l.x * TEX_PX - vx;
      const ly = l.y * TEX_PX - vy;
      if (lx < -160 || lx > vw + 160 || ly < -160 || ly > vh + 160) continue;
      const d = l.r * 2 * TEX_PX;
      const key = d <= 96 ? 'light96' : d <= 160 ? 'light160' : 'light288';
      const size = d <= 96 ? 96 : d <= 160 ? 160 : 288;
      rt.erase(key, lx - size / 2, ly - size / 2);
    }
  }

  private drawOverlay(): void {
    const g = this.overlayG;
    g.clear();
    const p = this.input.activePointer;
    const t = this.tileAt(p);
    const { world } = this.session;
    // 拖拽框
    if (this.dragStart) {
      const a = this.dragStart;
      const x0 = Math.min(a.x, t.x) * TEX_PX;
      const y0 = Math.min(a.y, t.y) * TEX_PX;
      const w = (Math.abs(a.x - t.x) + 1) * TEX_PX;
      const h = (Math.abs(a.y - t.y) + 1) * TEX_PX;
      g.lineStyle(1.5, 0xffffff, 0.9).strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
    }
    // 建造虚影
    if (this.tool === 'build' && world.inBounds(t.x, t.y)) {
      const ok = canPlaceStructure(world, t.x, t.y, this.buildSel);
      this.ghost
        .setTexture(STRUCTURE[this.buildSel].tex)
        .setPosition(t.x * TEX_PX, t.y * TEX_PX)
        .setScale(WORLD_SCALE)
        .setVisible(true)
        .setAlpha(0.55)
        .setTint(ok ? 0x9dff9d : 0xff8a8a);
      g.lineStyle(1, ok ? 0x6cff6c : 0xff5a5a, 0.8).strokeRect(t.x * TEX_PX + 0.5, t.y * TEX_PX + 0.5, TEX_PX - 1, TEX_PX - 1);
    } else {
      this.ghost.setVisible(false);
    }
    // 法术范围指示
    if (this.tool === 'spell' && world.inBounds(t.x, t.y)) {
      const sp = this.session.spells;
      const def = { speed: 0, light: 6, heal: 6 }[this.spellSel];
      if (def > 0) {
        g.lineStyle(1.2, 0x9db8ff, 0.7).strokeCircle((t.x + 0.5) * TEX_PX, (t.y + 0.5) * TEX_PX, def * TEX_PX);
      }
    }
  }

  // ---------- 帧循环 ----------

  override update(time: number, delta: number): void {
    if (!this.session) return;
    const rawDt = Math.min(delta / 1000, 0.05);
    const speed = this.session.settings.speed;
    const dt = rawDt * speed;

    if (speed > 0) {
      this.session.update(dt);
      if (!this.session.gameOver) {
        this.autosaveTimer += dt;
        if (this.autosaveTimer >= AUTOSAVE_SEC) {
          this.autosaveTimer = 0;
          if (this.saveMgr.save(this.session)) this.ui?.showToast('已自动保存');
        }
      }
    }

    // 镜头移动
    const cam = this.cameras.main;
    const spd = 520 * rawDt * 2 / cam.zoom;
    if (this.keys.A.isDown || this.keys.LEFT.isDown) cam.scrollX -= spd;
    if (this.keys.D.isDown || this.keys.RIGHT.isDown) cam.scrollX += spd;
    if (this.keys.W.isDown || this.keys.UP.isDown) cam.scrollY -= spd;
    if (this.keys.S.isDown || this.keys.DOWN.isDown) cam.scrollY += spd;

    this.entityG.clear();
    this.syncEntities(time);
    this.drawMarkers();
    this.lighting();
    this.drawOverlay();
    this.drainFx();
  }

  private drainFx(): void {
    const q = this.session.fxQueue;
    let digSound = false;
    while (q.length > 0) {
      const e = q.shift()!;
      if (e.type === 'dig') {
        digSound = true;
        this.puff(e.x!, e.y!, 0xb0895a);
        continue;
      }
      switch (e.type) {
        case 'build':
          sfx.play('build');
          this.puff(e.x!, e.y!, 0xc08a52);
          break;
        case 'pickup':
          sfx.play('pickup');
          break;
        case 'deposit':
          sfx.play('deposit');
          break;
        case 'craft':
          sfx.play('craft');
          break;
        case 'hurt':
          sfx.play('hurt');
          this.puff(e.x!, e.y!, 0xff5a5a);
          break;
        case 'mdie':
          sfx.play('mdie');
          this.puff(e.x!, e.y!, 0x58c04a);
          break;
        case 'spell':
          sfx.play('spell');
          this.puff(e.x!, e.y!, 0x9db8ff);
          break;
        case 'trap':
          sfx.play('trap');
          this.puff(e.x!, e.y!, 0xd5dae2);
          break;
        case 'die':
          sfx.play('die');
          this.puff(e.x!, e.y!, 0xff5a5a);
          break;
        case 'equip':
          sfx.play('equip');
          break;
        case 'night':
          sfx.play('night');
          break;
        case 'dawn':
          sfx.play('dawn');
          break;
        case 'msg':
          sfx.play('msg');
          break;
      }
      if (e.text) this.ui?.showToast(e.text);
    }
    if (digSound) sfx.play('dig');
  }

  private puff(tx: number, ty: number, color: number): void {
    // 粒子上限保护：大量挖掘/战斗时避免补间对象无限堆积
    if (this.tweens.tweens.length > 90) return;
    const x = tx * TEX_PX;
    const y = ty * TEX_PX;
    for (let i = 0; i < 4; i++) {
      const dot = this.add.circle(x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 10, 1.6, color);
      this.worldC.add(dot);
      this.tweens.add({
        targets: dot,
        y: dot.y - 6 - Math.random() * 6,
        alpha: 0,
        duration: 320 + Math.random() * 200,
        onComplete: () => dot.destroy(),
      });
    }
  }
}

type SpellId_ = 'speed' | 'light' | 'heal';
/** 怪物没有稳定 id，用对象引用作为 Map 键 */
function m_id(m: Monster): Monster {
  return m;
}
