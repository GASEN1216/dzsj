/** 运行时常量（仅表现层使用） */

/** 每格纹理像素 */
export const TEX_PX = 16;
/** 世界整体放大倍率（像素风清晰放大） */
export const WORLD_SCALE = 2;
/** 摄像机空间每格像素 */
export const TILE_PX = TEX_PX * WORLD_SCALE;

export const GAME_W = 1280;
export const GAME_H = 720;

/** 自动存档间隔（秒） */
export const AUTOSAVE_SEC = 90;

/** 资源根路径（相对 base，兼容 GitHub Pages 子路径） */
export const ASSET_BASE = import.meta.env.BASE_URL;

/** 瓦片坐标 → 世界容器坐标（纹理像素） */
export const t2w = (v: number): number => v * TEX_PX;
/** 世界容器坐标 → 瓦片坐标 */
export const w2t = (v: number): number => Math.floor(v / TEX_PX);
