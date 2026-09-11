/** 通用 UI 小组件（按钮 / 面板） */
import Phaser from 'phaser';
import { sfx } from '../assets/audio';

export const UI_FONT = '"Microsoft YaHei", "PingFang SC", sans-serif';

export interface ButtonOpts {
  width?: number;
  height?: number;
  fontSize?: number;
  bgColor?: number;
  stroke?: number;
}

export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  opts: ButtonOpts = {}
): Phaser.GameObjects.Container {
  const w = opts.width ?? 150;
  const h = opts.height ?? 40;
  const bg = opts.bgColor ?? 0x3a4356;
  const c = scene.add.container(x, y);
  const rect = scene.add.rectangle(0, 0, w, h, bg).setStrokeStyle(2, opts.stroke ?? 0x5a6580);
  const txt = scene.add
    .text(0, 0, label, { fontFamily: UI_FONT, fontSize: `${opts.fontSize ?? 16}px`, color: '#ffffff' })
    .setOrigin(0.5);
  c.add([rect, txt]);
  c.setSize(w, h);
  rect.setInteractive({ useHandCursor: true });
  rect.on('pointerover', () => rect.setFillStyle(0x4a5570));
  rect.on('pointerout', () => rect.setFillStyle(bg));
  rect.on('pointerdown', () => {
    sfx.unlock();
    sfx.play('click');
    onClick();
  });
  (c as unknown as { btnRect: Phaser.GameObjects.Rectangle; btnText: Phaser.GameObjects.Text }).btnRect = rect;
  (c as unknown as { btnRect: Phaser.GameObjects.Rectangle; btnText: Phaser.GameObjects.Text }).btnText = txt;
  return c;
}

/** 按钮可用状态 */
export function setButtonEnabled(c: Phaser.GameObjects.Container, enabled: boolean): void {
  const { btnRect, btnText } = c as unknown as { btnRect: Phaser.GameObjects.Rectangle; btnText: Phaser.GameObjects.Text };
  btnRect.setFillStyle(enabled ? 0x3a4356 : 0x2a3040);
  btnText.setAlpha(enabled ? 1 : 0.4);
}

/** 高亮/取消高亮（工具选中态） */
export function setButtonActive(c: Phaser.GameObjects.Container, active: boolean): void {
  const { btnRect } = c as unknown as { btnRect: Phaser.GameObjects.Rectangle };
  btnRect.setStrokeStyle(2, active ? 0xffd94a : 0x5a6580);
}

/** 带标题与关闭按钮的面板，返回内容容器 */
export function makePanel(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  w: number,
  h: number,
  title: string
): { root: Phaser.GameObjects.Container; content: Phaser.GameObjects.Container; close: () => void } {
  const root = scene.add.container(cx, cy).setDepth(1000);
  const bg = scene.add.rectangle(0, 0, w, h, 0x232a38, 0.96).setStrokeStyle(2, 0x5a6580);
  const titleText = scene.add
    .text(-w / 2 + 16, -h / 2 + 12, title, { fontFamily: UI_FONT, fontSize: '20px', color: '#ffd94a' });
  const closeBtn = makeButton(scene, w / 2 - 30, -h / 2 + 22, '✕', () => close(), { width: 36, height: 30 });
  const content = scene.add.container(0, 0);
  root.add([bg, titleText, closeBtn, content]);
  const close = (): void => {
    root.destroy();
  };
  return { root, content, close };
}

/** 水平条形值 */
export function makeBar(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.setData('bar', { x, y, w, h, color });
  return g;
}

export function drawBar(g: Phaser.GameObjects.Graphics, ratio: number): void {
  const { x, y, w, h, color } = g.getData('bar') as { x: number; y: number; w: number; h: number; color: number };
  g.clear();
  g.fillStyle(0x000000, 0.55).fillRect(x, y, w, h);
  g.fillStyle(color, 1).fillRect(x + 1, y + 1, Math.max(0, (w - 2) * Phaser.Math.Clamp(ratio, 0, 1)), h - 2);
}
