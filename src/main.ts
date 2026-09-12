import Phaser from 'phaser';
import { GAME_H, GAME_W } from './config';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';

/** 全局错误兜底：未捕获异常时显示友好提示而不是白屏/黑屏 */
function showFatalError(message: string): void {
  const el = document.getElementById('fatal');
  if (!el || el.style.display === 'flex') return;
  el.innerHTML = '';
  const title = document.createElement('div');
  title.textContent = '😢 游戏遇到了一个错误';
  title.style.cssText = 'font-size:22px;color:#ffd94a;';
  const msg = document.createElement('div');
  msg.textContent = message.slice(0, 300);
  msg.style.cssText = 'font-size:13px;color:#8a93a8;max-width:640px;word-break:break-all;';
  const hint = document.createElement('div');
  hint.textContent = '请刷新页面重试；若反复出现，可清除浏览器站点数据后重新开始（存档会丢失）。';
  hint.style.cssText = 'font-size:14px;color:#cfd6e4;';
  el.append(title, msg, hint);
  el.style.display = 'flex';
}

window.addEventListener('error', (e) => {
  if (e.message) showFatalError(e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  showFatalError(String((e as PromiseRejectionEvent).reason ?? '未知错误'));
});

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
