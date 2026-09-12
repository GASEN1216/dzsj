# 矮人国度 DwarfRealm

一款类《打造世界》（Craft the World）的 **2D 沙盒建造策略网页游戏**。纯单机、纯前端，无需服务器——程序化生成像素世界，带领一队矮人挖掘、建造、合成、抵御夜晚的怪物进攻。

▶ **在线试玩：<https://gasen1216.github.io/dzsj/>**（GitHub Pages，自动部署自 main 分支）

**技术栈**：TypeScript + Vite + Phaser 3 + Vitest，包管理 pnpm。
**所有美术与音效均由代码程序化生成**（16×16 像素贴图 + WebAudio 合成），零外部素材依赖。

![玩法](public/assets/favicon.svg)

## 玩法特性

- **程序化世界**：128×84 瓦片，地表起伏、泥土层、岩石层、煤/铁/金矿脉、洞穴、树木（种子可复现）
- **矮人 AI**：4 名矮人自动寻路（A*，支持爬梯/上台阶）、自动认领任务、搬运战利品回篝火
- **任务指派**：鼠标框选标记「挖掘 / 建造 / 拆除 / 取消」，矮人按最近优先自主完成
- **建造系统**：地板、木墙、石墙、梯子、门、火把、工作台、熔炉、储物箱、尖刺陷阱，带放置合法性判断
- **资源与仓储**：木头/石头/煤炭/铁矿/铁锭/金币/食物，运回篝火仓库堆叠存储（容量 300，储物箱 +150/个）
- **合成与科技**：12 个配方 + 3 级科技（石工术 → 熔炼术 → 锻造术），工作台/熔炉工作站
- **矮人需求**：饥饿值、精力值、生命值；饿了吃饭、夜里回篝火睡觉、受伤掉血、饿死扣血
- **昼夜与刷怪**：白天采集建造，夜晚史莱姆/哥布林从地表进攻波次 + 洞穴零星刷新，白天怪物在地表燃烧
- **防御工事**：怪物会砸门、拆墙、啃地形（偏好门 > 木墙 > 土石）；矮人能翻越 1 格矮墙，怪物不能
- **玩家法术**：加速术 / 照明术 / 治疗术，各有冷却
- **存档**：localStorage 保存世界（RLE 压缩）、矮人、怪物、任务、科技、时间，每 90 秒自动保存（v2 格式，兼容 v1 旧档）
- **暂停/设置**：音量调节、速度（暂停 / 1x / 2x）、返回主菜单

## 操作说明

| 操作 | 方式 |
| --- | --- |
| 移动镜头 | `WASD` / 方向键，或中键/无工具时左键拖拽 |
| 缩放 | 鼠标滚轮 |
| 标记挖掘 / 拆除 / 取消 | 选中左侧工具后，**按住左键拖拽框选** |
| 建造 | 点「建造」工具 → 在面板选建筑 → 左键放置（可拖动连放） |
| 取消工具 | 右键 或 `ESC` |
| 暂停 / 速度 | `空格` 或顶部 ⏸/▶/▶▶ 按钮 |
| 施法 | 选中左侧法术后左键点击目标 |
| 合成 / 科技 / 矮人管理 | 底部按钮 |
| 保存 | 顶部 💾（设置面板中也可保存） |

**开局建议**：砍树攒木头 → 合成工作台 → 研究熔炼术 → 建熔炉 → 挖煤和铁矿 → 冶炼铁锭 → 研究锻造术 → 铁剑（自动装备）与陷阱 → 天黑前用墙和门把基地围起来，留一扇门给怪物「砸」。

## 本地运行

```bash
pnpm install
pnpm dev        # 开发服务器 http://localhost:5173
```

其他命令：

```bash
pnpm test       # 运行 67 个单元测试（vitest）
pnpm typecheck  # TypeScript 严格类型检查
pnpm build      # 类型检查 + 产物构建（输出 dist/，引擎独立分包）
pnpm preview    # 本地预览构建产物
```

## 部署到 GitHub Pages

仓库已内置 GitHub Actions 工作流（`.github/workflows/deploy.yml`）：**push 到 main 分支即自动测试、构建并部署**。

1. 在 GitHub 新建仓库，把本项目推送到 `main` 分支：
   ```bash
   git init
   git add .
   git commit -m "init: dwarf-realm"
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git push -u origin main
   ```
2. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 等待 Actions 跑完，访问 `https://<你的用户名>.github.io/<仓库名>/`。

> `vite.config.ts` 中 `base: './'` 为相对路径，任何子路径部署都无需修改。

## 项目结构

```
├── .github/workflows/deploy.yml   # Pages 自动部署
├── public/assets/                 # 静态资源（favicon；贴图/音效均为程序生成）
├── src/
│   ├── main.ts                    # Phaser 入口
│   ├── config.ts                  # 运行时常量（瓦片尺寸、缩放、存档间隔）
│   ├── core/
│   │   ├── defs.ts                # 地形/建筑/资源/配方/科技/法术 数据表
│   │   ├── rng.ts                 # 可复现随机数 + 值噪声
│   │   ├── session.ts             # GameSession：组装全部系统并按帧驱动（无 Phaser 依赖）
│   │   └── types.ts               # 共享类型
│   ├── world/
│   │   ├── world.ts               # 瓦片世界（地形层+建筑层，RLE 序列化）
│   │   ├── worldGen.ts            # 程序化世界生成 + 建造合法性
│   │   └── pathfinding.ts         # A* 寻路（二叉堆；怪物加权破坏模式）
│   ├── systems/
│   │   ├── tasks.ts               # 任务标记/认领/完成/取消
│   │   ├── inventory.ts           # 资源背包 + 建筑库存 + 容量
│   │   ├── crafting.ts            # 科技研究系统
│   │   ├── time.ts                # 昼夜循环
│   │   ├── spells.ts              # 玩家法术
│   │   └── spawner.ts             # 怪物刷新（夜晚波次/洞穴）
│   ├── entities/
│   │   ├── dwarf.ts               # 矮人 AI 状态机（需求/任务/搬运/战斗/作息）
│   │   └── monster.ts             # 怪物 AI（追击/砸门拆墙/白天燃烧/陷阱）
│   ├── save/saveManager.ts        # localStorage 存取
│   ├── assets/
│   │   ├── textures.ts            # 程序化像素贴图（全部美术）
│   │   └── audio.ts               # WebAudio 合成音效（全部音频）
│   ├── scenes/                    # Boot / Menu / Game / UI 四个场景
│   └── ui/widgets.ts              # UI 小组件
├── tests/                         # vitest 单元测试（56 个）
├── ASSET_LICENSES.md              # 素材来源与许可
└── LICENSE                        # MIT
```

**架构说明**：核心玩法逻辑（世界、寻路、任务、AI、战斗、科技、存档）全部为纯 TypeScript，不依赖 Phaser——`GameSession` 可直接仿真驱动，因此单元测试无需浏览器环境；Phaser 只负责渲染、输入与音效。

**性能设计**：光照层使用视口尺寸 RenderTexture 按帧局部重绘（而非全图）；任务认领与掉落物搬运按距离排序并限制单帧寻路次数（轮转覆盖，避免大面积框选卡顿）；掉落物自动合并（生成与落地时）、高速下落逐行扫描落地；矮人寻路支持重力下落（悬崖/台阶可通行）与埋藏方块的竖井自动接入；UI 文本脏检查；粒子与补间数量设上限；构建产物将 Phaser 引擎独立分包以便缓存。

**工程质量**：67 个单元测试覆盖核心系统与回归缺陷（存档完整性、掉落物物理、任务认领限流、竖井接入）；存档版本化（v2，含怪物与玩家设置）并向后兼容 v1；全局错误兜底页面；GitHub Actions 在 push 时自动执行 类型检查 → 测试 → 构建 → 部署。

## 素材来源与许可

所有贴图与音效均为本项目**代码程序化生成**（MIT，与项目同许可），未使用任何第三方素材；未来如替换为 Kenney.nl / OpenGameArt / freesound.org 的素材，请在 `ASSET_LICENSES.md` 中登记来源与许可证。详见 [ASSET_LICENSES.md](ASSET_LICENSES.md)。

## License

[MIT](LICENSE)
