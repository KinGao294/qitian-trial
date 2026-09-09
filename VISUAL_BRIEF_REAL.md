# STOP — plastic look rejected by user (2026-09-09)

User: 「你这是塑料建模。。。。你去截图看看真实的吧」

## Compare
- OUR current live site (bad): https://kingao294.github.io/qitian-trial/ — primitive boxes, flat plastic shading. Local screenshot: `tests/gameplay.png`
- REAL Black Myth Wukong look-dev refs (marketing Steam art, study only — DO NOT rip meshes/textures from the game):
  - `/workspace/wukong-3d-ref/real/steam_library.jpg`
  - `/workspace/wukong-3d-ref/real/steam_header.jpg`
  - `/workspace/wukong-3d-ref/real/steam_capsule.jpg`

## Required look (inspired, original)
1. **No more candy plastic**: PBR-ish roughness/metalness, ambient occlusion, soft contact shadows, fog density like rainy mountain mist, warm key + cool fill, filmic contrast.
2. **Character**: Destined-One inspired monkey warrior — cloth layers, fur, metal staff with worn gold, not capsule limbs. Prefer Blender sculpted/kitbashed GLB with Image textures.
3. **Boss**: weathered stone temple guardian / stone lion vibe — cracked stone, moss, gold inlay veins — not a gray blob.
4. **Environment**: ancient temple courtyard — wet stone, wood beams, red cloth banners, distant karst mist mountains (use generated `sky_dusk` + stone/wood/cloth textures already under `public/textures/` if present).
5. Keep gameplay (boss fight win). Redeploy Pages when visual upgrade ships.

Textures already generated via image_gen — convert with python3 if needed:
`public/textures/{sky_dusk,stone_albedo,wood_albedo,cloth_red,boss_diffuse}.jpg`

Blender: `/home/box/bin/blender` or `/workspace/tools/run-blender.sh`
