# 素材来源与许可（ASSET LICENSES）

本项目遵循「不手动找素材」原则：**全部美术与音频资源均由本项目代码程序化生成**，
未使用、未分发任何第三方素材文件。

## 1. 视觉素材（贴图）

生成代码：`src/assets/textures.ts`（Canvas 2D 逐像素绘制，16×16 像素风）。

| 素材组 | 纹理键 | 生成方式 | 来源 | 许可证 |
| --- | --- | --- | --- | --- |
| 地形 | `grass` `dirt` `stone` `coal` `iron` `gold` `tree` `leaves` `bedrock` `cave_bg` | 代码逐像素绘制 + 哈希噪点 | 本项目程序化生成 | MIT（随本项目） |
| 建筑 | `floor` `wall_wood` `wall_stone` `ladder` `door` `torch` `workbench` `furnace` `chest` `trap` `campfire` | 代码逐像素绘制 | 本项目程序化生成 | MIT（随本项目） |
| 角色 | `dwarf0` `dwarf1` `dwarf2` `slime` `goblin` | 代码逐像素绘制（3 套矮人配色） | 本项目程序化生成 | MIT（随本项目） |
| 物品图标 | `i_wood` `i_stone` `i_coal` `i_ironOre` `i_ironBar` `i_gold` `i_food` `i_sword` | 代码逐像素绘制 | 本项目程序化生成 | MIT（随本项目） |
| UI 图标 | `tool_dig` `tool_build` `tool_demolish` `tool_cancel` `spell_speed` `spell_light` `spell_heal` `ui_heart` `ui_hunger` `ui_energy` | 代码逐像素绘制 | 本项目程序化生成 | MIT（随本项目） |
| 辅助 | `white16` `light96` `light160` `light288` | 纯色 / Canvas 径向渐变 | 本项目程序化生成 | MIT（随本项目） |
| 网页图标 | `public/assets/favicon.svg` | 手写 SVG | 本项目程序化生成 | MIT（随本项目） |
| 界面字体 | 系统默认字体栈（Microsoft YaHei / PingFang SC / sans-serif） | 不随项目分发，调用用户系统字体 | 系统字体 | 各系统随附许可 |

## 2. 音频素材（音效）

生成代码：`src/assets/audio.ts`（WebAudio 振荡器 + 噪声缓冲实时合成，无音频文件）。

| 音效 | 触发场景 | 生成方式 | 来源 | 许可证 |
| --- | --- | --- | --- | --- |
| `dig` | 挖掘 | 带通噪声 + 方波下滑 | 本项目程序化合成 | MIT（随本项目） |
| `build` | 建造/拆除完成 | 双短促方波敲击 | 本项目程序化合成 | MIT（随本项目） |
| `pickup` / `deposit` | 拾取 / 入仓 | 方波/三角波上滑 | 本项目程序化合成 | MIT（随本项目） |
| `craft` / `equip` | 合成完成 / 装备铁剑 | 三音琶音 | 本项目程序化合成 | MIT（随本项目） |
| `hurt` / `die` / `mdie` | 受伤 / 矮人死亡 / 怪物死亡 | 锯齿波下滑 + 噪声 | 本项目程序化合成 | MIT（随本项目） |
| `spell` / `trap` / `save` / `click` / `error` / `msg` | 法术 / 陷阱 / 保存 / 界面 | 振荡器扫频 | 本项目程序化合成 | MIT（随本项目） |
| `night` / `dawn` | 昼夜交替 | 低音 drone / 大三和弦琶音 | 本项目程序化合成 | MIT（随本项目） |

## 3. 第三方库（依赖）

| 依赖 | 许可证 | 用途 |
| --- | --- | --- |
| [Phaser 3](https://phaser.io/) | MIT | 游戏渲染引擎 |
| [Vite](https://vitejs.dev/) | MIT | 构建工具 |
| [TypeScript](https://www.typescriptlang.org/) | Apache-2.0 | 语言与类型检查 |
| [Vitest](https://vitest.dev/) | MIT | 单元测试 |

## 4. 替换素材的推荐来源

如需将程序化素材替换为更高品质的资源，推荐以下免版权来源（替换后请在本文件登记）：

- **Kenney.nl** — 大量 CC0 游戏素材（贴图、UI、音效）：https://kenney.nl/
- **OpenGameArt.org** — 社区游戏素材（注意逐个确认许可证，常见 CC0 / CC-BY / GPL）：https://opengameart.org/
- **freesound.org** — 社区音效（注意逐个确认 CC0 / CC-BY 许可）：https://freesound.org/
- **jsfxr / sfxr** — 程序化生成复古音效：https://sfxr.me/
