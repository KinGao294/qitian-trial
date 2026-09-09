# Task: Playable 3D Black Myth–inspired browser game (vertical slice)

You are building a **brand-new** playable web game under `/workspace/wukong-3d`.

## Inspiration (do NOT copy assets)
Reference tweet (2D prototype by others): https://x.com/op7418/status/2097549973667872772
That demo is a **2D** JavaScript platformer with AI-generated sprites (bg, platforms, monsters, character action frames, SFX).
User wants: **recreate the spirit as a real playable 3D game** in the style of *Black Myth: Wukong* (third-person action, staff combat, Chinese myth vibe).

Reference media on disk (read if helpful; do not scrape game assets):
- `/workspace/wukong-3d-ref/demo.mp4` — the 2D demo video
- `/workspace/wukong-3d-ref/thumb.jpg`

## Hard constraints
1. **Playable in browser** — Vite + TypeScript + Three.js (or vanilla Three modules). `npm install && npm run dev` must work.
2. **Original art only** — procedural / primitive / self-authored meshes & materials. NO ripped Black Myth Wukong models, textures, audio, or trademarked logos. Stylized monkey warrior with staff is OK as original geometry.
3. **Actually playable**: WASD move, mouse look (or orbit follow cam), Space jump, left-click / J attack combo, Shift dodge optional. Collision with ground/platforms. Enemies that can die. Player HP. Win/lose or clear condition.
4. **One vertical slice level**: temple/ruins courtyard + a few elevated platforms + 4–8 melee enemies + optional mini-boss. Fog, warm lanterns, stone, red cloth accents — “黑神话” atmosphere without copying specific scenes.
5. Chinese UI labels OK (title like「齐天试炼」). Short README in Chinese: how to run, controls.
6. Do not touch other projects under `/workspace/holo-card-*`, Sunshine, daily-retro, yuchen.
7. When done: print paths of entry (`index.html` / `src/main.ts`), how to run, and confirm combat works.

## Suggested structure
- `package.json`, Vite, `src/main.ts`, `src/game/*` (player, enemy, input, combat, level, ui)
- Simple shadow + fog + hemisphere/dir lights
- Staff hitboxes as timed sweeps; enemy AI: chase + attack when near
- On-screen HP bars + control hint overlay

## Success criteria
- Fresh clone of this folder: `npm i && npm run build` succeeds
- `npm run dev` serves a game you can fight through to clear enemies
- README documents controls

Start implementing now. Prefer working game over perfect art.
