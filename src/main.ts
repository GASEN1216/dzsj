import Phaser from 'phaser';
import { GAME_H, GAME_W } from './config';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#10131a',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, MenuScene, GameScene, UIScene],
});

// 调试句柄：便于在浏览器控制台检查游戏内部状态
(window as unknown as { __game: Phaser.Game }).__game = game;

// 开发期热替换提示（生产构建不含此逻辑也无碍）
if (import.meta.hot) {
  import.meta.hot.dispose(() => game.destroy(true));
}

export default game;
