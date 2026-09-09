在线试玩：https://kingao294.github.io/qitian-trial/

# 齐天试炼 · 山门余烬

原创第三人称 3D 动作游戏垂直切片，使用 Vite、TypeScript、Three.js。古寺庭院、猴行者、长棍、石魇、金刚、灯笼与山景均由代码生成；音效使用 Web Audio 合成，无任何游戏提取素材。

## 运行

```sh
npm install
npm run dev
```

打开终端显示的地址（默认 http://localhost:5173）。需要支持 WebGL 的桌面浏览器与键盘鼠标。

```sh
npm run build
npm run preview
```

## 操作

- 点击「踏入山门」开始并锁定鼠标；鼠标控制跟随镜头。
- WASD：相对镜头移动；空格：跳跃，可跳上庭院两侧石台。
- 左键 / J：棍术攻击，连按衔接三段连击；第三段伤害更高，近敌自动辅助转向。
- Shift：消耗精力闪避，短暂无敌；精力自动恢复。
- Esc：暂停并释放鼠标；点击继续回到游戏。
- 右下角声音按钮可在释放鼠标后切换合成音效。

击败六名石魇与一名镇庭金刚即可通关；生命耗尽失败，可重新挑战。敌人攻击前脚下出现红色预警环，及时闪避。击败敌人掉落金色灵息，靠近恢复 18 点生命。

入口：`index.html`、`src/main.ts`。游戏无需外部图片、模型或字体，全部使用程序化资源与系统字体。

## 浏览器实测

已使用 Chromium / Playwright 以真实键盘输入验证：开始、跳跃落地、棍术击杀全部 7 名敌人并通关、重开重置、敌人攻击扣血；无浏览器脚本异常。截图保存在 `tests/`。

复跑（先启动 `npm run dev`）：

```sh
npx playwright install chromium
node tests/smoke.mjs
```

软件 WebGL 环境运行完整战斗测试可能需要数分钟。
