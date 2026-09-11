/** 启动场景：生成程序化贴图后进入主菜单 */
import Phaser from 'phaser';
import { genTextures } from '../assets/textures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    genTextures(this);
    this.scene.start('Menu');
  }
}
