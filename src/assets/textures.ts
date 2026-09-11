/**
 * 程序化像素贴图生成：所有美术资源均由代码绘制（16×16 像素风），
 * 不依赖任何外部素材文件。
 */
import Phaser from 'phaser';
import { hash2 } from '../core/rng';

/** 像素画笔 */
class P {
  constructor(
    private c: CanvasRenderingContext2D,
    public size: number,
    private seed: number
  ) {}

  px(x: number, y: number, color: string): void {
    this.c.fillStyle = color;
    this.c.fillRect(x, y, 1, 1);
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    this.c.fillStyle = color;
    this.c.fillRect(x, y, w, h);
  }

  clear(): void {
    this.c.clearRect(0, 0, this.size, this.size);
  }

  /** 带噪点的整面填充 */
  noise(colors: string[], x0 = 0, y0 = 0, w = this.size, h = this.size, density = 1): void {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (hash2(x, y, this.seed) > density) continue;
        const c = colors[Math.floor(hash2(x, y, this.seed + 7) * colors.length) % colors.length];
        this.px(x, y, c);
      }
    }
  }

  /** 圆形色块 */
  blob(cx: number, cy: number, r: number, colors: string[]): void {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r + 0.5) continue;
        const c = colors[Math.floor(hash2(x + cx, y + cy, this.seed + 13) * colors.length) % colors.length];
        this.px(cx + x, cy + y, c);
      }
    }
  }

  /** 矿石斑点簇 */
  ore(colors: string[], count: number): void {
    for (let i = 0; i < count; i++) {
      const cx = 2 + Math.floor(hash2(i, 1, this.seed + 31) * 11);
      const cy = 2 + Math.floor(hash2(i, 2, this.seed + 37) * 11);
      this.px(cx, cy, colors[0]);
      this.px(cx + 1, cy, colors[1]);
      this.px(cx, cy + 1, colors[1]);
      if (hash2(i, 3, this.seed + 41) > 0.5) this.px(cx + 1, cy + 1, colors[0]);
    }
  }
}

type Draw = (p: P) => void;

function makeTexture(scene: Phaser.Scene, key: string, size: number, seed: number, draw: Draw): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const ct = scene.textures.createCanvas(key, size, size);
  if (!ct) return;
  const ctx = ct.getContext();
  ctx.imageSmoothingEnabled = false;
  draw(new P(ctx, size, seed));
  ct.refresh();
}

const DIRT_C = ['#7a5230', '#6f4a2b', '#845838'];
const STONE = ['#8a8d93', '#7f8288', '#94979e'];
const CANOPY = ['#3e7d2c', '#356e26', '#4a8f36'];
const GRASS_TOP = ['#58a63c', '#4c9634', '#63b445'];

/** 生成全部游戏贴图 */
export function genTextures(scene: Phaser.Scene): void {
  // ---- 地形 ----
  makeTexture(scene, 'grass', 16, 11, (p) => {
    p.noise(DIRT_C);
    p.noise(['#4e3420'], 0, 0, 16, 16, 0.08);
    p.rect(0, 0, 16, 3, GRASS_TOP[1]);
    p.noise(GRASS_TOP, 0, 0, 16, 3);
    for (let x = 0; x < 16; x += 2) if (hash2(x, 0, 99) > 0.4) p.px(x, 3, GRASS_TOP[2]);
    p.px(3, 0, '#6fbd4a');
    p.px(11, 0, '#6fbd4a');
  });
  makeTexture(scene, 'dirt', 16, 12, (p) => {
    p.noise(DIRT_C);
    p.noise(['#4e3420'], 0, 0, 16, 16, 0.1);
    p.px(4, 6, '#93663f');
    p.px(12, 11, '#93663f');
  });
  makeTexture(scene, 'stone', 16, 13, (p) => {
    p.noise(STONE);
    // 裂纹
    p.px(3, 2, '#5f636a');
    p.px(4, 3, '#5f636a');
    p.px(4, 4, '#5f636a');
    p.px(11, 8, '#5f636a');
    p.px(12, 9, '#5f636a');
    p.px(7, 13, '#5f636a');
  });
  const oreTex = (key: string, seed: number, colors: string[]) =>
    makeTexture(scene, key, 16, seed, (p) => {
      p.noise(STONE);
      p.ore(colors, 4);
    });
  oreTex('coal', 14, ['#26282e', '#3a3d45']);
  oreTex('iron', 15, ['#b0653a', '#8f4f2e']);
  oreTex('gold', 16, ['#e8c34a', '#c9a02e']);
  makeTexture(scene, 'tree', 16, 17, (p) => {
    p.clear();
    p.blob(8, 5, 4, CANOPY);
    p.blob(5, 7, 2, CANOPY);
    p.blob(11, 7, 2, CANOPY);
    p.rect(7, 9, 2, 7, '#6b4423');
    p.px(7, 11, '#7d5230');
    p.px(8, 13, '#7d5230');
  });
  makeTexture(scene, 'leaves', 16, 18, (p) => {
    p.clear();
    p.blob(8, 8, 6, CANOPY);
    p.px(4, 4, '#5aa844');
    p.px(12, 9, '#5aa844');
  });
  makeTexture(scene, 'bedrock', 16, 19, (p) => {
    p.noise(['#3a3d44', '#33363c', '#41444c']);
    p.noise(['#2a2c31'], 0, 0, 16, 16, 0.15);
  });
  makeTexture(scene, 'cave_bg', 16, 20, (p) => {
    p.noise(['#23252e', '#1e2028', '#262833']);
  });

  // ---- 建筑 ----
  makeTexture(scene, 'floor', 16, 21, (p) => {
    p.clear();
    p.rect(0, 10, 16, 5, '#a9743f');
    p.rect(0, 10, 16, 1, '#c08a52');
    p.rect(0, 14, 16, 1, '#8a5c30');
    p.px(5, 12, '#7d4f28');
    p.px(11, 12, '#7d4f28');
  });
  makeTexture(scene, 'wall_wood', 16, 22, (p) => {
    p.clear();
    for (let x = 0; x < 16; x += 5) {
      p.rect(x, 0, 4, 16, '#9c6b3a');
      p.rect(x, 0, 1, 16, '#85592e');
      p.rect(x + 3, 0, 1, 16, '#b07a44');
    }
    p.rect(0, 0, 16, 1, '#6f4a26');
    p.rect(0, 15, 16, 1, '#6f4a26');
  });
  makeTexture(scene, 'wall_stone', 16, 23, (p) => {
    p.clear();
    p.rect(0, 0, 16, 16, '#5f636a');
    const brick = (x: number, y: number, w: number, h: number) => {
      p.rect(x + 1, y + 1, w - 1, h - 1, '#8a8d93');
      p.rect(x + 1, y + 1, w - 1, 1, '#999ca3');
    };
    brick(0, 0, 7, 7);
    brick(8, 0, 8, 7);
    brick(0, 8, 4, 7);
    brick(5, 8, 7, 7);
    brick(13, 8, 3, 7);
  });
  makeTexture(scene, 'ladder', 16, 24, (p) => {
    p.clear();
    p.rect(3, 0, 2, 16, '#8a5c30');
    p.rect(11, 0, 2, 16, '#8a5c30');
    for (const y of [2, 7, 12]) p.rect(3, y, 10, 2, '#a9743f');
  });
  makeTexture(scene, 'door', 16, 25, (p) => {
    p.clear();
    p.rect(2, 0, 12, 16, '#6f4a26');
    p.rect(3, 1, 10, 15, '#a9743f');
    p.rect(3, 1, 10, 1, '#c08a52');
    p.rect(4, 4, 8, 1, '#8a5c30');
    p.rect(4, 11, 8, 1, '#8a5c30');
    p.px(11, 8, '#e8c34a');
  });
  makeTexture(scene, 'torch', 16, 26, (p) => {
    p.clear();
    p.rect(7, 7, 2, 8, '#8a5c30');
    p.px(8, 12, '#6f4a26');
    p.blob(8, 4, 2, ['#f2a93b', '#e86a2a']);
    p.px(8, 3, '#ffd97a');
    p.px(8, 2, '#fff3c4');
  });
  makeTexture(scene, 'workbench', 16, 27, (p) => {
    p.clear();
    p.rect(1, 6, 14, 3, '#a9743f');
    p.rect(1, 6, 14, 1, '#c08a52');
    p.rect(2, 9, 2, 6, '#8a5c30');
    p.rect(12, 9, 2, 6, '#8a5c30');
    p.rect(5, 2, 2, 4, '#7d7f86'); // 锤
    p.rect(4, 1, 4, 2, '#9c6b3a');
    p.rect(10, 3, 1, 3, '#b9bec7'); // 螺丝刀
  });
  makeTexture(scene, 'furnace', 16, 28, (p) => {
    p.clear();
    p.rect(1, 2, 14, 14, '#6f6f76');
    p.rect(1, 2, 14, 1, '#8a8a92');
    p.rect(2, 3, 12, 1, '#8a8a92');
    p.rect(4, 8, 8, 6, '#26282e');
    p.blob(8, 11, 2, ['#e86a2a', '#f2a93b']);
    p.px(8, 10, '#ffd97a');
  });
  makeTexture(scene, 'chest', 16, 29, (p) => {
    p.clear();
    p.rect(1, 4, 14, 11, '#8a5c30');
    p.rect(1, 4, 14, 3, '#a9743f');
    p.rect(1, 7, 14, 1, '#6f4a26');
    p.rect(7, 6, 2, 4, '#e8c34a');
    p.px(7, 8, '#8a6a10');
  });
  makeTexture(scene, 'trap', 16, 30, (p) => {
    p.clear();
    p.rect(0, 13, 16, 3, '#5a5e66');
    for (let x = 1; x < 16; x += 4) {
      p.px(x, 12, '#b9bec7');
      p.px(x, 11, '#d5dae2');
      p.px(x + 1, 12, '#b9bec7');
      p.px(x + 1, 10, '#d5dae2');
    }
  });
  makeTexture(scene, 'campfire', 16, 31, (p) => {
    p.clear();
    p.rect(2, 12, 3, 2, '#6f6f76');
    p.rect(11, 12, 3, 2, '#6f6f76');
    p.rect(3, 13, 10, 2, '#6b4423');
    p.blob(8, 8, 3, ['#e86a2a', '#f2a93b', '#d55a20']);
    p.px(8, 6, '#ffd97a');
    p.px(8, 4, '#fff3c4');
    p.px(6, 9, '#ffd97a');
    p.px(10, 8, '#ffd97a');
  });

  // ---- 矮人（3 种配色） ----
  const dwarfPalette = [
    { tunic: '#3b6ea5', beard: '#8a4b2a' },
    { tunic: '#3f8f4f', beard: '#c9c9c9' },
    { tunic: '#a5533b', beard: '#e0c34a' },
  ];
  dwarfPalette.forEach((pal, i) => {
    makeTexture(scene, `dwarf${i}`, 16, 40 + i, (p) => {
      p.clear();
      // 头盔
      p.rect(4, 1, 8, 3, '#9aa0a8');
      p.px(4, 4, '#9aa0a8');
      p.px(11, 4, '#9aa0a8');
      // 脸
      p.rect(5, 4, 6, 3, '#e8b88a');
      p.px(6, 5, '#26282e');
      p.px(9, 5, '#26282e');
      // 胡子
      p.rect(4, 7, 8, 3, pal.beard);
      p.px(5, 10, pal.beard);
      p.px(10, 10, pal.beard);
      // 身体
      p.rect(4, 9, 8, 4, pal.tunic);
      p.rect(4, 12, 8, 1, '#5a4326');
      p.px(7, 10, '#c9a02e');
      // 腿
      p.rect(5, 13, 2, 3, '#5a4326');
      p.rect(9, 13, 2, 3, '#5a4326');
      p.rect(5, 15, 3, 1, '#3a2c18');
      p.rect(9, 15, 3, 1, '#3a2c18');
    });
  });

  // ---- 怪物 ----
  makeTexture(scene, 'slime', 16, 50, (p) => {
    p.clear();
    p.blob(8, 10, 5, ['#58c04a', '#4db040', '#63cc55']);
    p.rect(3, 14, 10, 1, '#3d9432');
    p.px(6, 9, '#ffffff');
    p.px(10, 9, '#ffffff');
    p.px(6, 10, '#26282e');
    p.px(10, 10, '#26282e');
    p.px(5, 6, '#a8e89a');
  });
  makeTexture(scene, 'goblin', 16, 51, (p) => {
    p.clear();
    // 头
    p.blob(8, 5, 3, ['#6f9c3f', '#618c36']);
    p.px(4, 4, '#6f9c3f'); // 耳朵
    p.px(3, 5, '#6f9c3f');
    p.px(12, 4, '#6f9c3f');
    p.px(13, 5, '#6f9c3f');
    p.px(6, 5, '#e83a3a');
    p.px(10, 5, '#e83a3a');
    p.px(7, 7, '#4a6b28');
    p.px(9, 7, '#4a6b28');
    // 身体
    p.rect(5, 8, 6, 5, '#7a5230');
    p.rect(6, 8, 1, 5, '#8f6238');
    // 手臂 + 棍棒
    p.px(4, 9, '#6f9c3f');
    p.px(3, 10, '#6f9c3f');
    p.rect(11, 7, 1, 4, '#6b4423');
    p.blob(12, 6, 1, ['#8a6a3a']);
    // 腿
    p.rect(6, 13, 2, 3, '#5a4326');
    p.rect(9, 13, 2, 3, '#5a4326');
  });

  // ---- 物品图标 ----
  const itemTex = (key: string, seed: number, draw: Draw) => makeTexture(scene, key, 16, seed, (p) => {
    p.clear();
    draw(p);
  });
  itemTex('i_wood', 60, (p) => {
    p.rect(2, 6, 12, 5, '#8a5c30');
    p.rect(2, 6, 12, 1, '#a9743f');
    p.rect(2, 10, 12, 1, '#6f4a26');
    p.rect(12, 6, 2, 5, '#c9a27a');
    p.px(13, 8, '#8a5c30');
  });
  itemTex('i_stone', 61, (p) => {
    p.blob(8, 9, 4, STONE);
    p.px(6, 7, '#b9bec7');
  });
  itemTex('i_coal', 62, (p) => {
    p.blob(8, 9, 4, ['#26282e', '#3a3d45']);
    p.px(7, 7, '#5a5e66');
  });
  itemTex('i_ironOre', 63, (p) => {
    p.blob(8, 9, 4, STONE);
    p.px(7, 8, '#b0653a');
    p.px(9, 9, '#8f4f2e');
    p.px(8, 10, '#b0653a');
  });
  itemTex('i_ironBar', 64, (p) => {
    p.rect(3, 8, 10, 5, '#b9bec7');
    p.rect(3, 8, 10, 1, '#d5dae2');
    p.rect(3, 12, 10, 1, '#8a8f98');
  });
  itemTex('i_gold', 65, (p) => {
    p.blob(8, 8, 4, ['#e8c34a', '#d5ae32']);
    p.px(7, 6, '#f5e08a');
    p.px(6, 8, '#f5e08a');
  });
  itemTex('i_food', 66, (p) => {
    p.blob(8, 9, 4, ['#d5483a', '#c03a30']);
    p.px(7, 6, '#f08a80');
    p.rect(8, 3, 1, 2, '#5a4326');
    p.px(9, 3, '#4a8f36');
    p.px(10, 3, '#4a8f36');
  });
  itemTex('i_sword', 67, (p) => {
    for (let i = 0; i < 8; i++) p.px(10 - i, 5 + i, '#d5dae2');
    for (let i = 0; i < 8; i++) p.px(10 - i, 4 + i, '#b9bec7');
    p.px(4, 11, '#8a5c30');
    p.px(5, 12, '#8a5c30');
    p.px(6, 10, '#e8c34a');
    p.px(8, 8, '#e8c34a');
  });

  // ---- UI 图标 ----
  const uiTex = (key: string, seed: number, draw: Draw) => makeTexture(scene, key, 16, seed, (p) => {
    p.clear();
    draw(p);
  });
  uiTex('tool_dig', 70, (p) => {
    for (let i = 0; i < 7; i++) p.px(4 + i, 12 - i, '#8a5c30');
    p.rect(9, 2, 5, 2, '#9aa0a8');
    p.px(8, 3, '#9aa0a8');
    p.px(14, 3, '#9aa0a8');
    p.px(8, 4, '#7f858d');
    p.px(14, 4, '#7f858d');
    p.px(10, 4, '#b9bec7');
  });
  uiTex('tool_build', 71, (p) => {
    p.rect(4, 12, 2, 2, '#8a5c30');
    p.rect(5, 10, 2, 3, '#8a5c30');
    p.rect(6, 8, 2, 3, '#8a5c30');
    p.rect(7, 3, 6, 5, '#9aa0a8');
    p.rect(6, 2, 8, 2, '#7f858d');
  });
  uiTex('tool_demolish', 72, (p) => {
    p.rect(2, 2, 4, 4, STONE[0]);
    p.rect(8, 3, 4, 4, STONE[1]);
    p.rect(4, 9, 4, 4, STONE[2]);
    for (let i = 0; i < 8; i++) {
      p.px(8 + i, 8 + i, '#e83a3a');
      p.px(15 - i, 8 + i, '#e83a3a');
    }
  });
  uiTex('tool_cancel', 73, (p) => {
    for (let i = 0; i < 10; i++) {
      p.px(3 + i, 3 + i, '#e83a3a');
      p.px(12 - i, 3 + i, '#e83a3a');
      p.px(3 + i, 4 + i, '#a52a2a');
      p.px(12 - i, 4 + i, '#a52a2a');
    }
  });
  uiTex('spell_speed', 74, (p) => {
    const bolt = [
      [9, 1], [8, 2], [9, 2], [7, 3], [8, 3], [9, 3], [6, 4], [7, 4], [8, 4],
      [7, 5], [8, 5], [6, 6], [7, 6], [8, 6], [9, 6], [7, 7], [8, 7], [8, 8],
      [7, 9], [8, 9], [9, 9], [8, 10],
    ];
    for (const [x, y] of bolt) p.px(x, y, '#ffd94a');
    for (const [x, y] of bolt) p.px(x + 1, y, '#e8a520');
  });
  uiTex('spell_light', 75, (p) => {
    p.blob(8, 8, 4, ['#ffd94a', '#f2c230']);
    p.px(7, 6, '#fff3c4');
    for (const [x, y] of [[8, 1], [8, 2], [8, 14], [8, 15], [1, 8], [2, 8], [14, 8], [15, 8], [3, 3], [4, 3], [12, 12], [13, 12], [13, 3], [12, 3], [3, 12], [4, 12]]) {
      p.px(x, y, '#ffd94a');
    }
  });
  uiTex('spell_heal', 76, (p) => {
    p.blob(6, 7, 3, ['#e83a3a', '#d53232']);
    p.blob(10, 7, 3, ['#e83a3a', '#d53232']);
    p.blob(8, 10, 3, ['#e83a3a', '#d53232']);
    p.rect(7, 6, 2, 6, '#ffffff');
    p.rect(5, 8, 6, 2, '#ffffff');
  });
  uiTex('ui_heart', 77, (p) => {
    p.blob(5, 6, 3, ['#e83a3a']);
    p.blob(10, 6, 3, ['#e83a3a']);
    p.blob(8, 9, 4, ['#e83a3a']);
    p.px(5, 4, '#f08a80');
  });
  uiTex('ui_hunger', 78, (p) => {
    p.blob(9, 8, 4, ['#d5985a', '#c98848']);
    p.rect(3, 4, 3, 3, '#f2e8d5');
    p.px(4, 5, '#e8d8b8');
  });
  uiTex('ui_energy', 79, (p) => {
    p.blob(8, 8, 5, ['#4a5a8a', '#3d4c78']);
    p.blob(6, 6, 4, ['#c9d2e8', '#b9c4dd']);
    p.blob(9, 9, 3, ['#4a5a8a']);
  });

  // ---- 辅助 ----
  makeTexture(scene, 'white16', 16, 90, (p) => {
    p.rect(0, 0, 16, 16, '#ffffff');
  });

  // 径向光斑（用于黑暗遮罩上挖洞）
  const lightTex = (key: string, size: number) => {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const ct = scene.textures.createCanvas(key, size, size);
    if (!ct) return;
    const ctx = ct.getContext();
    const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    ct.refresh();
  };
  lightTex('light96', 96);
  lightTex('light160', 160);
  lightTex('light288', 288);
}
