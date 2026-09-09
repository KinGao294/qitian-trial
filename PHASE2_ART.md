# Phase 2 — Image 2.5 + Blender 3D (MUST DO)

User instruction: **用好 Image 2.5 + 3D 建模能力**. Scope remains: **one boss fight level**.

Existing playable game is already in this folder (Vite + Three.js). Do NOT rewrite from scratch. Upgrade art quality.

## A) Image generation (Codex built-in image_gen / $imagegen / gpt-image-2 or 2.5)
Feature `image_generation` is enabled in ~/.codex/config.toml.
Generate and save under `public/textures/` (create if needed):
1. `sky_dusk.jpg` — mythical Chinese mountain mist dusk sky for skybox/env
2. `stone_albedo.jpg` — temple stone pavement/wall albedo
3. `wood_albedo.jpg` — dark lacquered wood
4. `cloth_red.jpg` — red ritual cloth / tassel fabric
5. `boss_diffuse.jpg` — stylized stone/golem or temple guardian texture (original, not Black Myth asset rip)
6. Optional: `player_cloak.jpg`, `staff_metal.jpg`

Use image_gen tool. Prefer square 1024. No copyrighted logos/text.

## B) Blender 3D models (binary at /home/box/bin/blender or /workspace/tools/run-blender.sh)
Create `tools/build_models.py` and export GLB to `public/models/`:
1. `player.glb` — stylized monkey warrior (hat, coat, staff) — original low/mid poly, A-pose or T-pose + simple bones if easy; otherwise static mesh with staff as child
2. `boss.glb` — stone lion / temple guardian boss, larger scale
3. Optional: `lantern.glb`, `pillar.glb`

Run Blender headless. Keep polycount reasonable for web.

## C) Integrate into game (`src/main.ts` etc.)
- Load GLBs with GLTFLoader; replace primitive player/boss meshes
- Apply generated textures to ground/walls/props
- Keep gameplay: WASD, jump, attack, **boss kill = win**; strip or de-emphasize trash mobs if still many (user wants boss-focused)
- `npm run build` must pass
- Update README noting Image+Blender art pipeline

## Success
- `public/textures/*` and `public/models/*.glb` exist
- Game visibly uses them (not just primitives)
- Boss fight still completable
