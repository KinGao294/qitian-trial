# 齐天试炼 · 山门余烬

Vite + TypeScript + Three.js 原创第三人称动作游戏。单关古寺庭院，击败唯一的镇庭石狮即通关；生命耗尽可重开。

## 运行

```sh
npm install
npm run dev
npm run build
```

打开终端中的 `/qitian-trial/` 地址。需要支持 WebGL 的桌面浏览器。

WASD 移动，鼠标转向，空格跳跃，J / 左键三段棍术，K 定海神针（冷却），Shift 闪避，Esc 暂停。Boss 会在蓄力后喷火，注意红色预警。红色预警环表示 Boss 正在蓄力，利用闪避无敌时间反击。第三段攻击伤害更高。

## Image + Blender 美术管线

五张贴图使用 Codex 内置 **image_gen** 生成，转换为 1024×1024 JPEG，保存在 `public/textures/`：

- `sky_dusk.jpg`：中国神话山峦、薄雾与暮色天空，作为背景及低强度环境光。
- `stone_albedo.jpg`：风化古寺石板，用于庭院、石墙和石台。
- `wood_albedo.jpg`：深色旧漆木纹，用于梁柱、长棍和斗笠。
- `cloth_red.jpg`：暗红织物与淡金云纹，用于旗幡和行者衣袍。
- `boss_diffuse.jpg`：灰绿风化石材、细裂纹、金色矿脉，用于石狮。

完整最终提示词和生成来源记录在 `tools/image-prompts.json`。使用内置工具路径，没有调用 API CLI；工具没有提供可选择或验证的“2.5”版本参数，因此不宣称使用了特定 2.5 模型。素材为原创生成，没有游戏提取资产或品牌标志。

`tools/build_models.py` 使用 Blender 建模并导出包含纹理的 GLB：

```sh
/home/box/bin/blender -b --python tools/build_models.py
# 或 blender -b --python tools/build_models.py
```

- `public/models/player.glb`：猴行者、斗笠、分层红袍、卷尾、铜饰长棍，约 8,132 三角面。
- `public/models/boss.glb`：石狮、卷曲鬃毛、獠牙、发光眼睛、仪式胸饰，约 23,258 三角面。

模型使用静态网格及命名的腿、躯干、武器子节点，由现有战斗代码驱动简单动画，无骨骼蒙皮。GLTFLoader 加载后启用开始按钮；所有路径兼容 Vite 部署子目录。现有庭院结构保留并应用生成贴图。

## 验证

```sh
# 先运行 npm run dev
npx playwright install chromium
node tests/smoke.mjs
```

浏览器测试通过真实键盘输入验证模型加载、跳跃、攻击击杀 Boss、胜利、重开以及敌人伤害，截图保存在 `tests/`。
