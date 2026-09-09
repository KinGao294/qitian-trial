import * as T from 'three';
import './style.css';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<div id="hud"><div class="top"><div class="brand">齐天试炼<small>THE PILGRIM · TRIAL OF EMBERS</small></div><div class="chapter">第一章 · 苍岚古寺<strong>山门余烬</strong><div class="line"></div><div style="margin-top:12px;font-size:10px">踏破迷障 · 棍定山河</div></div></div><div class="reticle"></div><div class="notice" id="notice"></div><div class="status"><label>行 者 <span id="hpText">100 / 100</span></label><div class="bar"><i id="hp"></i></div><div class="bar stamina"><i id="stamina"></i></div><div class="ult" id="ult">K 定海神针 · 就绪</div></div><div class="objective">击败镇山巨兽<br><span id="count">0</span> / 1<div style="color:#989f90;font-size:10px">红环踏地 / 橙锥喷火 · 闪避反击</div></div><div class="controls"><span><b>W A S D</b>移动</span><span><b>鼠标</b>视角</span><span><b>J / 左键</b>三段棍术</span><span><b>K</b>定海大招</span><span><b>空格</b>跳跃</span><span class="optional"><b>SHIFT</b>闪避</span><span class="optional"><b>ESC</b>暂停</span><button class="sound" id="sound">声音 · 开</button></div></div><div id="hurt"></div><div class="overlay" id="overlay"><div class="panel"><div class="eyebrow">AN ORIGINAL 3D ACTION EXPERIENCE</div><h1 id="title">齐天试炼</h1><div class="subtitle" id="subtitle">山 门 余 烬 <span class="seal">壹</span></div><p id="description">暮钟已寂，山寺犹燃。<br>执一根长棍，穿过苍岚与残垣。<br>挑战镇山巨兽，破除古寺封印。</p><button class="button" id="start">踏 入 山 门　→</button><div class="fine">WASD 移动 · 鼠标转向 · 连按 J：横扫破风 → 挑棍穿云 → 旋砸定山 · K 定海金光 · 巨兽会喷火 · Shift 闪避<br><br>Tripo 写实模型 + 原创场景 / 建议使用键盘与鼠标</div></div></div>`;
document.querySelector('#hud')?.insertAdjacentHTML('beforeend','<div class="touch-hud"><div class="joystick" id="joystick"><div class="stick" id="stick"></div></div><div class="skill-cluster"><button data-action="attack">棍</button><button data-action="ultimate">大招</button><button data-action="jump">跳</button><button data-action="dodge">闪</button></div></div>');
const el = (id:string) => document.getElementById(id)!;
const showError = (error: unknown) => {
  console.error('[trial]', error);
  let banner = document.getElementById('error-banner');
  if (!banner) { banner = document.createElement('div'); banner.id = 'error-banner'; document.body.appendChild(banner); }
  banner.textContent = '试炼遇到意外，请刷新页面重试。';
};
window.addEventListener('error', e => showError(e.error || e.message));
window.addEventListener('unhandledrejection', e => showError(e.reason));
const scene = new T.Scene(); scene.background = new T.Color('#596466'); scene.fog = new T.FogExp2('#596466', .018);
const renderer = new T.WebGLRenderer({antialias:true}); renderer.setSize(innerWidth,innerHeight); const isLikelyTouch = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches);
renderer.setPixelRatio(Math.min(devicePixelRatio, isLikelyTouch ? 1.15 : 1.7)); renderer.shadowMap.enabled=true; renderer.shadowMap.type=T.PCFSoftShadowMap; renderer.toneMapping=T.ACESFilmicToneMapping; renderer.toneMappingExposure=1.12; app.prepend(renderer.domElement);
const camera=new T.PerspectiveCamera(55,innerWidth/innerHeight,.1,160);
scene.add(new T.HemisphereLight('#c8e1d7','#393326',2));
const sun=new T.DirectionalLight('#ffe0aa',3.1);sun.position.set(-16,30,12);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-30,right:30,top:30,bottom:-30,near:1,far:80});sun.shadow.bias=-.0005;scene.add(sun);
const mat=(c:string,metal=0,rough=.9)=>new T.MeshStandardMaterial({color:c,metalness:metal,roughness:rough});
const stone=mat('#b9c1b9'),darkStone=mat('#46534f'),edgeStone=mat('#90978b'),wood=mat('#452c24'),red=mat('#803d2e'),gold=mat('#b69753',.65,.4),roof=mat('#354a46'),fur=mat('#775136'),skin=mat('#be9363'),cloth=mat('#a4402a'),black=mat('#272e2b');
const assetUrl=(path:string)=>import.meta.env.BASE_URL+path;
const manager=new T.LoadingManager();
let artReady=false;
const startButton=el('start') as HTMLButtonElement;
startButton.disabled=true;startButton.textContent='山寺绘卷载入中…';
const textureLoader=new T.TextureLoader(manager);
function texture(name:string,repeat=1){const t=textureLoader.load(assetUrl(`textures/${name}.jpg`));t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(repeat,repeat);t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t;}
const stoneMap=texture('stone_albedo');stone.map=stoneMap;darkStone.map=stoneMap;edgeStone.map=stoneMap;
wood.map=texture('wood_albedo');wood.color.set('#ffffff');red.map=texture('cloth_red');red.color.set('#ffffff');
const sky=textureLoader.load(assetUrl('textures/sky_dusk.jpg'));sky.colorSpace=T.SRGBColorSpace;
scene.background=sky;
// Low-energy sky illumination complements the warm dusk key light.
const environment=sky.clone();environment.mapping=T.EquirectangularReflectionMapping;
sky.onUpdate=()=>{environment.image=sky.image;environment.needsUpdate=true;};scene.environment=environment;scene.environmentIntensity=.2;
function box(w:number,h:number,d:number,m:T.Material,x=0,y=0,z=0,parent:T.Object3D=scene){const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
function sphere(r:number,m:T.Material,x:number,y:number,z:number,parent:T.Object3D){const o=new T.Mesh(new T.SphereGeometry(r,10,8),m);o.position.set(x,y,z);o.castShadow=true;parent.add(o);return o;}
function cyl(r:number,rt:number,h:number,m:T.Material,x:number,y:number,z:number,parent:T.Object3D=scene,n=10){const o=new T.Mesh(new T.CylinderGeometry(r,rt,h,n),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
let seed=72;function rand(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
const solids:{x:number,z:number,w:number,d:number,h:number}[]=[];
function platform(x:number,z:number,w:number,d:number,h:number){box(w,h,d,darkStone,x,h/2,z);box(w+.12,.14,d+.12,edgeStone,x,h+.07,z);solids.push({x,z,w,d,h:h+.14});}
box(110,.5,110,darkStone,0,-.4,0);
const paving=new T.InstancedMesh(new T.BoxGeometry(1.91,.16,1.91),new T.MeshStandardMaterial({map:stoneMap,roughness:.95}),529);paving.receiveShadow=true;const tileMatrix=new T.Matrix4();let tile=0;
for(let x=-11;x<=11;x++)for(let z=-11;z<=11;z++){tileMatrix.makeTranslation(x*2,-.06+rand()*.035,z*2);paving.setMatrixAt(tile,tileMatrix);paving.setColorAt(tile,new T.Color().setHSL(.13+rand()*.025,.045,.65+rand()*.14));tile++;}scene.add(paving);
// Courtyard walls, stair landings, and a temple made entirely from original geometry.
platform(-13,-3,5,7,.8);platform(-16,-8,4,4,1.65);platform(-12,-12,5,4,2.45);platform(13,-5,5,6,1);platform(16,-10,4,4,1.9);
for(let i=0;i<4;i++)platform(0,-14-i*.9,13,.9,.23*(i+1));platform(0,-19,17,6,1.05);
for(const side of [-1,1]){box(.85,3.4,44,stone,side*23,1.7,0);box(1.25,.3,44,roof,side*23,3.5,0);for(let z=-20;z<=20;z+=5){box(1.4,4,1.4,darkStone,side*23,2,z);box(1.9,.3,1.9,roof,side*23,4,z);}box(14,3,1,stone,side*15,1.5,-23);}
function temple(x:number,z:number,scale=1){const g=new T.Group();g.position.set(x,1.15,z);g.scale.setScalar(scale);scene.add(g);box(14,.4,6,stone,0,0,0,g);for(const xx of [-6,-2,2,6])for(const zz of [-2,2]){cyl(.25,.32,5,wood,xx,2.5,zz,g);cyl(.37,.37,.3,gold,xx,.4,zz,g);}box(13,4,.35,wood,0,2,-2.25,g);for(let xx=-5;xx<=5;xx+=2){box(.12,3.2,.2,gold,xx,2,-1.98,g);}box(14,.4,5.9,red,0,4.7,0,g);for(let j=0;j<6;j++){const width=17-j*.95,dep=8-j*.78;box(width,.3,dep,roof,0,5+j*.32,0,g);}for(const s of [-1,1]){const beam=box(3,.22,.24,gold,s*7.6,5.35,3.6,g);beam.rotation.z=s*.22;}box(3.4,1,.22,black,0,4,-2,g); const plaque=document.createElement('canvas');plaque.width=512;plaque.height=160;const ctx=plaque.getContext('2d')!;ctx.fillStyle='#1e2925';ctx.fillRect(0,0,512,160);ctx.fillStyle='#c4aa68';ctx.font='80px serif';ctx.textAlign='center';ctx.fillText('苍 岚 寺',256,111);const pm=new T.MeshBasicMaterial({map:new T.CanvasTexture(plaque)});box(3.4,1,.02,pm,0,4,-1.87,g);return g;}
temple(0,-19);temple(-32,-24,.8);temple(33,-28,.9);
// Gateway behind the player.
for(const x of [-7,7]){box(.8,7,.8,wood,x,3.5,20);box(1.3,.5,1.3,stone,x,.25,20);}box(16,.65,1.3,red,0,6.1,20);for(let j=0;j<4;j++)box(18-j*1.1,.28,4-j*.6,roof,0,6.6+j*.3,20);
const flames:T.Mesh[]=[];
function lantern(x:number,z:number){cyl(.4,.6,.3,stone,x,.15,z);cyl(.12,.18,2.5,wood,x,1.5,z);box(.9,.13,.9,roof,x,3,z);const m=new T.MeshStandardMaterial({color:'#ffc271',emissive:'#ff8b30',emissiveIntensity:2});const f=box(.56,.65,.56,m,x,2.6,z);flames.push(f);box(.8,.12,.8,black,x,2.2,z);const l=new T.PointLight('#ff9d42',8,7,2);l.position.set(x,2.6,z);scene.add(l);}
for(const x of [-9,9])for(const z of [14,3,-10,-17])lantern(x,z);
const banners:T.Mesh[]=[];
for(const x of [-18,18])for(const z of [8,-13]){cyl(.08,.11,6,wood,x,3,z);box(2.3,.1,.1,gold,x+.9,5.5,z);const b=box(1.6,2.9,.06,red,x+.85,4,z);banners.push(b);box(.07,2.9,.07,gold,x+.13,4,z+.05);}
for(let i=0;i<65;i++){const x=(rand()-.5)*90,z=(rand()-.5)*90;if(Math.abs(x)<24&&Math.abs(z)<25)continue;const h=8+rand()*22;const o=new T.Mesh(new T.ConeGeometry(4+rand()*8,h,5),mat('#596c63'));o.position.set(x,h/2-1,z);scene.add(o);}
for(let i=0;i<40;i++){const side=i%2?1:-1;const x=side*(19+rand()*2),z=-21+rand()*40;const o=box(.3+rand()*1.4,.25+rand()*.6,.4+rand(),rand()>.4?stone:darkStone,x,.1,z);o.rotation.y=rand()*6;}
// Twisted bare trees along the walls.
for(const x of [-20,20])for(const z of [-15,10]){const trunk=cyl(.23,.55,7,wood,x,3.2,z);trunk.rotation.z=x>0?-.12:.12;for(let j=0;j<5;j++){const branch=cyl(.04,.17,3.4,wood,x+(j%2?1:-1),4+j*.48,z);branch.rotation.z=(j%2?1:-1)*.85;branch.rotation.x=j*.7;}}
const motes=new T.BufferGeometry();const motePos=new Float32Array(180*3);for(let i=0;i<motePos.length;i+=3){motePos[i]=(rand()-.5)*46;motePos[i+1]=rand()*9;motePos[i+2]=(rand()-.5)*46;}motes.setAttribute('position',new T.BufferAttribute(motePos,3));scene.add(new T.Points(motes,new T.PointsMaterial({color:'#e3cf8c',size:.045,transparent:true,opacity:.65})));

// Keep gameplay roots stable; Tripo GLB provides visuals. Missing bone names get safe pivots.
function warrior(_enemy=false,boss=false){
 const g=new T.Group(); g.name=boss?'Boss':'Player';
 const visual=new T.Group(); visual.name='Visual'; g.add(visual);
 const pivot=new T.Group(); pivot.name='WeaponPivot'; visual.add(pivot);
 const torso=new T.Group(); torso.name='TorsoPivot'; visual.add(torso);
 g.userData={legs:[] as T.Object3D[],pivot,torso,visual,baseYaw:0,movePose:0};
 scene.add(g);return g;
}
const player=warrior();player.position.set(0,0,12);
type Enemy={mesh:T.Group,hp:number,max:number,boss:boolean,home:T.Vector3,cool:number,wind:number,fireT:number,hit:boolean,dead:boolean,label:HTMLDivElement,pattern:number};
const enemies:Enemy[]=[];for(const [x,z,boss] of [[0,-7,1]]){const mesh=warrior(true,!!boss);mesh.position.set(x,0,z);const label=document.createElement('div');label.className='enemy-label'+(boss?' boss-label':'');label.innerHTML=`${boss?'镇山巨兽':'石魇'}<i></i>`;document.body.append(label);enemies.push({mesh,hp:boss?380:80,max:boss?380:80,boss:!!boss,home:mesh.position.clone(),cool:1+rand(),wind:0,fireT:0,hit:false,dead:false,label,pattern:0});}
const gltfLoader=new GLTFLoader(manager);
let playerMixer:T.AnimationMixer|undefined; let locoActions:{idle?:T.AnimationAction,walk?:T.AnimationAction}={}; let mixerActive=false; let hitstop=0;
const MOVE_NAMES=['横扫破风','挑棍穿云','旋砸定山'];
async function loadCharacter(root:T.Group,file:string,targetHeight:number){
 const {scene:model}=await gltfLoader.loadAsync(assetUrl(`models/${file}.glb`));
 model.traverse(o=>{
  if(o instanceof T.Mesh){
   o.castShadow=true;o.receiveShadow=true;
   const mats=Array.isArray(o.material)?o.material:[o.material];
   for(const m of mats){
    if(m && 'envMapIntensity' in m){(m as T.MeshStandardMaterial).envMapIntensity=1.15;(m as T.MeshStandardMaterial).needsUpdate=true;}
   }
  }
 });
 const box=new T.Box3().setFromObject(model);
 const size=box.getSize(new T.Vector3());
 const height=Math.max(size.y,0.001);
 const scale=targetHeight/height;
 model.scale.setScalar(scale);
 box.setFromObject(model);
 model.position.y-=box.min.y;
 // AABB inspection confirms the Tripo rest pose faces -X; rotate it to gameplay +Z.
 const NOSE_YAW_OFFSET=-Math.PI/2;
 model.rotation.y=NOSE_YAW_OFFSET;
 const visual=root.userData.visual as T.Group;
 visual.add(model);
 const legL=model.getObjectByName('Leg_L')||new T.Object3D();
 const legR=model.getObjectByName('Leg_R')||new T.Object3D();
 const weapon=model.getObjectByName('Weapon')||root.userData.pivot;
 const torso=model.getObjectByName('Torso')||root.userData.torso;
 root.userData.legs=[legL,legR];
 root.userData.pivot=weapon;
 root.userData.torso=torso;
 root.userData.model=model;
}
manager.onError=(url)=>{el('description').textContent=`美术资源加载失败，请刷新重试：${url}`;};
async function loadLoco(){ try { const g=await gltfLoader.loadAsync(assetUrl('models/player-loco.glb')); const model=g.scene; model.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}}); const b=new T.Box3().setFromObject(model), sz=b.getSize(new T.Vector3()); model.scale.setScalar(1.9/Math.max(sz.y,.001)); b.setFromObject(model); model.position.y-=b.min.y; model.rotation.y=-Math.PI/2; const visual=player.userData.visual as T.Group; visual.clear(); visual.add(model); playerMixer=new T.AnimationMixer(model); for(const clip of g.animations){const n=clip.name.toLowerCase(); if(n.includes('idle')) locoActions.idle=playerMixer.clipAction(clip); if(n.includes('walk')) locoActions.walk=playerMixer.clipAction(clip);} locoActions.idle?.play(); mixerActive=!!(locoActions.idle&&locoActions.walk); } catch(e){ console.warn('[trial] loco unavailable, using player.glb',e); } }
Promise.all([loadCharacter(player,'player',1.9),loadCharacter(enemies[0].mesh,'boss',4.2)]).then(async()=>{ await loadLoco();
 artReady=true;startButton.disabled=false;startButton.textContent='踏 入 山 门　→';
}).catch((err)=>{ console.error(err); artReady=true; startButton.disabled=false; startButton.textContent='踏 入 山 门　→'; showError(err); });
const keys=new Set<string>();let touchMoveX=0,touchMoveY=0;let running=false,started=false,ended=false,paused=false,hp=100,stamina=100,yaw=0,pitch=.35,vy=0,grounded=true,attackT=0,combo=0,queued=false,lastAttack=-10,dodgeT=0,invulnerable=0,kills=0,time=0,hurt=0,noticeT=0,ultT=0,ultCd=0,ultHit=false;const hitSet=new Set<Enemy>();const velocity=new T.Vector3();// Gameplay roots use atan2 velocity; visual models apply the shared Tripo nose offset.
player.rotation.y=0;let shake=0;let muted=false,audioCtx:AudioContext|undefined;
function sound(freq:number,duration=.12,type:OscillatorType='sine',volume=.055){if(muted)return;try{audioCtx??=new AudioContext();const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,audioCtx.currentTime);osc.frequency.exponentialRampToValueAtTime(Math.max(25,freq*.35),audioCtx.currentTime+duration);gain.gain.setValueAtTime(volume,audioCtx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);osc.connect(gain).connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+duration);}catch{}}
function notice(text:string){if(el('notice')) el('notice')!.textContent=text;noticeT=2;}
function startAttack(){if(!running||dodgeT>0||ultT>0)return;if(attackT>0){queued=true;return;}combo=time-lastAttack<.85?(combo+1)%3:0;attackT=combo===2?.62:.48;lastAttack=time;hitSet.clear();sound(210+combo*90,.16+(combo*.04),'triangle',.06+combo*.01);notice(`行者 · ${MOVE_NAMES[combo]}`);staffSlashTrail(player.position,player.rotation.y,combo);}
function startUltimate(){
 if(!running||dodgeT>0||ultT>0||ultCd>0||attackT>0)return;
 if(stamina<45){notice('灵力不足 · 无法定海');return;}
 stamina-=45;ultT=.95;ultCd=7.5;ultHit=false;shake=.28;attackT=0;queued=false;invulnerable=.35;
 notice('行者 · 定海神针');sound(90,.35,'sawtooth',.07);sound(420,.4,'triangle',.05);
 ring(player.position,'#ffe29a',2.6,.45);
}
function dodge(){if(!running||stamina<30||dodgeT>0||ultT>0)return;if(attackT>0 && (1-attackT/(combo===2?.62:.48))<.4)return;stamina-=30;dodgeT=.42;invulnerable=.5;attackT=0;sound(140,.15,'sine');notice('行者 · 纵身闪避');ring(player.position,'#9ad7ff',1.4,.28);}
const coarse=isLikelyTouch;
let touchSeen=false;
window.addEventListener('touchstart',()=>{touchSeen=true;},{passive:true});let joyId=-1,lookId=-1,lastLX=0,lastLY=0;
const joy=el('joystick'),stick=el('stick');
function joyUpdate(x:number,y:number){const r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=x-cx,dy=y-cy;const max=r.width*.38,len=Math.hypot(dx,dy);if(len>max){dx*=max/len;dy*=max/len;}touchMoveX=dx/max;touchMoveY=dy/max;for(const k of ['KeyW','KeyA','KeyS','KeyD'])keys.delete(k);if(touchMoveY<-.18)keys.add('KeyW');if(touchMoveY>.18)keys.add('KeyS');if(touchMoveX<-.18)keys.add('KeyA');if(touchMoveX>.18)keys.add('KeyD');stick.style.transform=`translate(${dx}px,${dy}px)`;}
joy.addEventListener('pointerdown',e=>{if(!coarse)return;joyId=e.pointerId;joy.setPointerCapture(joyId);joyUpdate(e.clientX,e.clientY);e.preventDefault();});
joy.addEventListener('pointermove',e=>{if(e.pointerId===joyId){joyUpdate(e.clientX,e.clientY);e.preventDefault();}});
joy.addEventListener('pointerup',e=>{if(e.pointerId===joyId){joyId=-1;touchMoveX=touchMoveY=0;for(const k of ['KeyW','KeyA','KeyS','KeyD'])keys.delete(k);stick.style.transform='translate(0,0)';}});
document.querySelectorAll<HTMLButtonElement>('.skill-cluster button').forEach(b=>b.addEventListener('pointerdown',e=>{e.preventDefault();if(b.dataset.action==='attack')startAttack();if(b.dataset.action==='ultimate')startUltimate();if(b.dataset.action==='dodge')dodge();if(b.dataset.action==='jump'&&running&&grounded){vy=8.4;grounded=false;sound(220,.1);}}));
renderer.domElement.addEventListener('pointerdown',e=>{if(!coarse||!running||e.clientX<innerWidth*.45)return;lookId=e.pointerId;lastLX=e.clientX;lastLY=e.clientY;renderer.domElement.setPointerCapture(lookId);e.preventDefault();});
renderer.domElement.addEventListener('pointermove',e=>{if(e.pointerId===lookId){yaw-=(e.clientX-lastLX)*.006;pitch=T.MathUtils.clamp(pitch+(e.clientY-lastLY)*.004,.05,.85);lastLX=e.clientX;lastLY=e.clientY;e.preventDefault();}});
renderer.domElement.addEventListener('pointerup',e=>{if(e.pointerId===lookId)lookId=-1;});
window.addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.repeat)return;if(e.code==='KeyJ')startAttack();if(e.code==='KeyK')startUltimate();if(e.code==='ShiftLeft'||e.code==='ShiftRight')dodge();if(e.code==='Space'&&grounded&&running){vy=8.4;grounded=false;sound(220,.1);}if(e.code==='Escape'&&started&&!ended){if(!paused)pause();}});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();if(running)pause();});
renderer.domElement.addEventListener('mousedown',e=>{if(e.button===0&&running){if(document.pointerLockElement!==renderer.domElement)renderer.domElement.requestPointerLock();startAttack();}});window.addEventListener('mousemove',e=>{if(document.pointerLockElement===renderer.domElement&&running){yaw-=e.movementX*.0025;pitch=T.MathUtils.clamp(pitch+e.movementY*.002,.05,.85);}});document.addEventListener('pointerlockchange',()=>{if(!coarse&&!document.pointerLockElement&&running)pause();});
el('sound').onclick=()=>{muted=!muted;el('sound').textContent=`声音 · ${muted?'关':'开'}`;};
function pause(){paused=true;running=false;keys.clear();el('overlay').classList.remove('hidden');el('title').textContent='暂歇片刻';el('subtitle').textContent='山 风 未 止';el('description').innerHTML='旅途仍在继续。<br>调整呼吸，再赴试炼。';el('start').textContent='继 续 试 炼　→';if(document.pointerLockElement)document.exitPointerLock();}
function reset(){hp=100;stamina=100;kills=0;vy=0;attackT=0;queued=false;combo=0;lastAttack=-10;dodgeT=0;invulnerable=0;ultT=0;ultCd=0;ultHit=false;grounded=true;hurt=0;keys.clear();player.position.set(0,0,12);player.rotation.set(0,0,0);yaw=0;pitch=.35;for(const e of enemies){e.hp=e.max;e.dead=false;e.mesh.visible=true;e.mesh.position.copy(e.home);e.mesh.rotation.set(0,0,0);e.cool=1.5;e.wind=0;e.fireT=0;e.pattern=0;}for(const d of drops)scene.remove(d);drops.length=0;ended=false;}
el('start')?.addEventListener('click',()=>{if(!artReady)return;if(ended)reset();started=true;paused=false;running=true;el('overlay').classList.add('hidden');if(!coarse)renderer.domElement.requestPointerLock();sound(330,.25);notice('苍岚古寺 · 挑战镇山巨兽');});
function finish(win:boolean){ended=true;running=false;el('title').textContent=win?'试炼已成':'再起一程';el('subtitle').textContent=win?'一 棍 破 迷 障':'胜 负 仍 未 定';el('description').innerHTML=win?'石狮封印已破，古寺重归寂静。<br>你的长棍，已留下新的传说。':`已击破 ${kills} / 1 名守卫。<br>敌人蓄力时会亮起红环，闪避可避开伤害。<br>击败守卫后拾取金色灵息，恢复生命。`;el('start').textContent='再 入 山 门　↻';el('overlay').classList.remove('hidden');document.exitPointerLock();}
type Fx={mesh:T.Mesh,life:number,max:number,grow?:number,vy?:number,vx?:number,vz?:number};
const effects:Fx[]=[];const drops:T.Mesh[]=[];
function ring(pos:T.Vector3,color:string,size:number,life:number){const mesh=new T.Mesh(new T.RingGeometry(size*.85,size,40),new T.MeshBasicMaterial({color,side:T.DoubleSide,transparent:true,opacity:.85,depthWrite:false}));mesh.rotation.x=-Math.PI/2;mesh.position.copy(pos);mesh.position.y+=.12;scene.add(mesh);effects.push({mesh,life,max:life,grow:size*0.35});}
function sparks(pos:T.Vector3,n=7,color='#ffe7a0'){for(let i=0;i<n;i++){const m=new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:2.2,roughness:0.4,metalness:0.2});const mesh=sphere(.05+rand()*.04,m,pos.x+(rand()-.5)*0.6,pos.y+.4+rand()*1.4,pos.z+(rand()-.5)*0.6,scene);effects.push({mesh,life:.28+rand()*.25,max:.5,vy:1.5+rand()*2,vx:(rand()-.5)*2,vz:(rand()-.5)*2});}}
function beam(origin:T.Vector3,dir:T.Vector3,length:number,color:string,life=.35,radius=.08){
 const geom=new T.CylinderGeometry(radius*1.35,radius*0.5,length,8,1,true);
 const mat=new T.MeshBasicMaterial({color,transparent:true,opacity:.85,depthWrite:false,blending:T.AdditiveBlending});
 const mesh=new T.Mesh(geom,mat);
 const mid=origin.clone().add(dir.clone().multiplyScalar(length*0.5));
 mesh.position.copy(mid);
 mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),dir.clone().normalize());
 scene.add(mesh);effects.push({mesh,life,max:life});
}
function fireCone(origin:T.Vector3,yaw:number,life=.55){
 const geom=new T.ConeGeometry(2.15,7.2,18,1,true);
 const mat=new T.MeshBasicMaterial({color:'#ff6a2a',transparent:true,opacity:.72,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide});
 const mesh=new T.Mesh(geom,mat);
 const forward=new T.Vector3(Math.sin(yaw),0,Math.cos(yaw));
 mesh.position.copy(origin).add(forward.clone().multiplyScalar(3.1)).add(new T.Vector3(0,1.6,0));
 mesh.quaternion.setFromUnitVectors(new T.Vector3(0,-1,0),forward.clone().add(new T.Vector3(0,-0.15,0)).normalize());
 scene.add(mesh);effects.push({mesh,life,max:life,grow:1.2});
 for(let i=0;i<10;i++)sparks(mesh.position.clone().add(forward.clone().multiplyScalar(rand()*2)),1,'#ffb14a');
}
function staffSlashTrail(pos:T.Vector3,yaw:number,combo:number){
 const facing=new T.Vector3(Math.sin(yaw),0,Math.cos(yaw));
 const colors=['#ffe9a8','#ffd36a','#ffefc0'];
 beam(pos.clone().add(new T.Vector3(0,1.15,0)),facing,2.4+combo*0.7,colors[combo]||'#ffe9a8',.28,.06+combo*.02);
 if(combo>=1)beam(pos.clone().add(new T.Vector3(0,1.4,0)),facing.clone().applyAxisAngle(new T.Vector3(0,1,0),0.35),2.1,colors[combo],.22,.05);
 if(combo===2){ring(pos,'#ffd27a',2.2,.3);sparks(pos,12,'#ffe7a0');}
}
function floorAt(x:number,z:number,y:number){let floor=0;for(const s of solids)if(Math.abs(x-s.x)<s.w/2+.15&&Math.abs(z-s.z)<s.d/2+.15&&y>=s.h-.1)floor=Math.max(floor,s.h);return floor;}
function moveBody(obj:T.Object3D,dx:number,dz:number){for(const [ax,amount] of [['x',dx],['z',dz]] as const){obj.position[ax]=T.MathUtils.clamp(obj.position[ax]+amount,-21.8,21.8);for(const s of solids){if(obj.position.y>=s.h-.12)continue;if(Math.abs(obj.position.x-s.x)<s.w/2+.36&&Math.abs(obj.position.z-s.z)<s.d/2+.36){obj.position[ax]=s[ax]+Math.sign(obj.position[ax]-s[ax]||-amount)*(s[ax==='x'?'w':'d']/2+.36);}}}}
const swing=new T.Mesh(new T.TorusGeometry(1.9,.045,5,45,Math.PI*1.3),new T.MeshBasicMaterial({color:'#ffe0a0',transparent:true,opacity:.7,depthWrite:false}));swing.rotation.x=Math.PI/2;scene.add(swing);
const clock=new T.Clock();const look=new T.Vector3(),desired=new T.Vector3(),project=new T.Vector3();
function update(dt:number){if(hitstop>0){hitstop-=dt;dt=0;} time+=dt; if(playerMixer) playerMixer.update(dt);invulnerable=Math.max(0,invulnerable-dt);dodgeT=Math.max(0,dodgeT-dt);ultCd=Math.max(0,ultCd-dt);stamina=Math.min(100,stamina+dt*19);const forward=new T.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));const right=new T.Vector3(Math.cos(yaw),0,-Math.sin(yaw));velocity.set(0,0,0);if(keys.has('KeyW'))velocity.add(forward);if(keys.has('KeyS'))velocity.sub(forward);if(keys.has('KeyD'))velocity.add(right);if(keys.has('KeyA'))velocity.sub(right);velocity.normalize();if(velocity.lengthSq()>0&&attackT<=0)player.rotation.y=Math.atan2(velocity.x,velocity.z);if(dodgeT>0){velocity.set(Math.sin(player.rotation.y),0,Math.cos(player.rotation.y));}const speed=dodgeT>0?13:ultT>0?1.2:attackT>0?2.3:6;moveBody(player,velocity.x*speed*dt,velocity.z*speed*dt);vy-=22*dt;player.position.y+=vy*dt;const floor=floorAt(player.position.x,player.position.z,player.position.y-vy*dt);if(player.position.y<=floor&&vy<=0){player.position.y=floor;vy=0;grounded=true;}else grounded=false;
const moving=velocity.lengthSq()>0&&attackT<=0&&dodgeT<=0;
player.userData.movePose=T.MathUtils.damp(player.userData.movePose,moving?1:0,10,dt);
if(mixerActive){ const w=moving?1:0; locoActions.walk?.setEffectiveWeight(w); locoActions.idle?.setEffectiveWeight(1-w); }
const bob=mixerActive?0:Math.sin(time*11)*player.userData.movePose;
(player.userData.visual as T.Group).position.y=bob*.06+(dodgeT>0?0.18:0);
(player.userData.visual as T.Group).rotation.z=dodgeT>0?-0.35:(mixerActive?0:Math.sin(time*11)*.04*player.userData.movePose);
(player.userData.visual as T.Group).rotation.x=mixerActive?0:(moving?-0.08:0);
if(!mixerActive) player.userData.legs.forEach((leg:T.Object3D,i:number)=>{leg.rotation.x=Math.sin(time*12+i*Math.PI)*.55*player.userData.movePose;});
player.userData.torso.rotation.z=dodgeT>0?-0.2:0;
if(ultT>0){
 ultT-=dt;
 const p=1-Math.max(ultT,0)/.95;
 const vis=player.userData.visual as T.Group;
 vis.rotation.y=p*Math.PI*2; vis.rotation.x=-0.15+Math.sin(p*Math.PI)*0.45;
 const facing=new T.Vector3(Math.sin(player.rotation.y),0,Math.cos(player.rotation.y));
 const origin=player.position.clone().add(new T.Vector3(0,1.25,0));
 if(p<.85){
  beam(origin,facing,7.5,'#ffe7a0',.12,.12);
  beam(origin,facing.clone().add(new T.Vector3(0,0.08,0)).normalize(),6.8,'#fff3c4',.1,.05);
  if(Math.random()<.4)sparks(origin.clone().add(facing.clone().multiplyScalar(2+rand()*4)),2,'#ffe29a');
 }
 swing.visible=true;swing.scale.setScalar(1.6);swing.position.copy(player.position).add(new T.Vector3(0,1.3,0));
 swing.rotation.z=player.rotation.y-p*Math.PI*2;(swing.material as T.MeshBasicMaterial).color.set('#fff1c2');
 (swing.material as T.MeshBasicMaterial).opacity=Math.sin(p*Math.PI)*.9;
 if(p>.18&&p<.9){
  for(const e of enemies){
   if(e.dead)continue;
   const diff=e.mesh.position.clone().sub(player.position);const dist=Math.hypot(diff.x,diff.z);
   const facing2=new T.Vector3(Math.sin(player.rotation.y),0,Math.cos(player.rotation.y));
   const aligned=diff.clone().normalize().dot(facing2);
   if(dist<8.5&&aligned>0.35&&Math.abs(diff.y)<3){
    if(!ultHit||!hitSet.has(e)){hitSet.add(e);e.hp-=22;sparks(e.mesh.position,10,'#ffe29a');ring(e.mesh.position,'#ffe29a',1.6,.25);sound(120,.12,'sawtooth',.04);moveBody(e.mesh,diff.x*.2,diff.z*.2);}
    if(e.hp<=0){e.dead=true;kills++;e.mesh.visible=false;e.label.style.display='none';const drop=sphere(.19,new T.MeshStandardMaterial({color:'#ffe7a0',emissive:'#ffb83c',emissiveIntensity:2}),e.mesh.position.x,.6,e.mesh.position.z,scene);drops.push(drop);notice(e.boss?'镇山巨兽 · 已击破':'石魇消散');if(e.boss)finish(true);}
   }
  }
  ultHit=true;
 }
 if(ultT<=0){swing.visible=false;vis.rotation.set(0,0,0);hitSet.clear();}
}else if(attackT>0){
 attackT-=dt;
 const dur=combo===2?.62:.48;
 const p=1-Math.max(attackT,0)/dur;
 let target:Enemy|undefined;let near=4.6;
 for(const e of enemies){const dist=e.mesh.position.distanceTo(player.position);if(!e.dead&&dist<near){near=dist;target=e;}}
 if(target){const diff=target.mesh.position.clone().sub(player.position);player.rotation.y=Math.atan2(diff.x,diff.z);}
 // Three staff arts: sweep / lift / spinning slam
 const vis=player.userData.visual as T.Group;
 if(combo===0){vis.rotation.y=Math.sin(p*Math.PI)*1.35;vis.rotation.x=-0.12+Math.sin(p*Math.PI)*0.18;player.userData.pivot.rotation.set(0.2,0,-1.2+p*3.4);}
 else if(combo===1){vis.rotation.y=Math.sin(p*Math.PI)*0.55;vis.rotation.x=-0.35+p*0.9;player.userData.pivot.rotation.set(-1.1+p*2.4,0.2,0.4);}
 else{vis.rotation.y=p*Math.PI*2;vis.rotation.x=-0.2+Math.sin(p*Math.PI)*0.55;player.userData.pivot.rotation.set(Math.PI/2,p*2,-0.4);}
 if(Math.floor(p*12)%3===0)staffSlashTrail(player.position,player.rotation.y,combo);
 swing.visible=true;
 swing.scale.setScalar(combo===2?1.35:1);
 swing.position.copy(player.position).add(new T.Vector3(0,1.15+combo*0.08,0));
 swing.rotation.z=player.rotation.y-(combo===2?p*Math.PI*2:p*(combo===0?4.2:2.6));
 (swing.material as T.MeshBasicMaterial).color.set(combo===2?'#ffd28a':'#ffe0a0');
 (swing.material as T.MeshBasicMaterial).opacity=Math.sin(p*Math.PI)*(combo===2?.85:.65);
 const hitStart=combo===2?.2:.25, hitEnd=combo===2?.88:.8;
 const reach=combo===2?4.4:combo===1?3.6:3.9;
 const dmg=combo===2?48:combo===1?32:27;
 if(p>hitStart&&p<hitEnd)for(const e of enemies){
  if(e.dead||hitSet.has(e))continue;
  const diff=e.mesh.position.clone().sub(player.position);
  const dist=Math.hypot(diff.x,diff.z);
  const facing=new T.Vector3(Math.sin(player.rotation.y),0,Math.cos(player.rotation.y));
  if(dist<(e.boss?reach+.4:reach)&&Math.abs(diff.y)<2.6&&diff.normalize().dot(facing)>-.2){
   hitSet.add(e);e.hp-=dmg;hitstop=.05;shake=Math.max(shake,.16);sparks(e.mesh.position);ring(e.mesh.position,combo===2?'#ffb454':'#dfb16a',combo===2?1.45:1,.28);
   sound(95-combo*8,.15,'sawtooth',.04);
   moveBody(e.mesh,diff.x*(.28+combo*.12),diff.z*(.28+combo*.12));
   if(!e.boss){e.wind=0;e.cool=.55;}
   if(e.hp<=0){e.dead=true;kills++;e.mesh.visible=false;e.label.style.display='none';const drop=sphere(.19,new T.MeshStandardMaterial({color:'#ffe7a0',emissive:'#ffb83c',emissiveIntensity:2}),e.mesh.position.x,.6,e.mesh.position.z,scene);drops.push(drop);notice(e.boss?'镇山巨兽 · 已击破':'石魇消散');if(e.boss)finish(true);}
  }
 }
 if(attackT<=0&&queued){queued=false;startAttack();}
}else{
 swing.visible=false;
 player.userData.pivot.rotation.set(0,0,0);
 if(dodgeT<=0){(player.userData.visual as T.Group).rotation.y=0;(player.userData.visual as T.Group).rotation.x=moving?-0.08:0;}
}
for(const e of enemies){
 if(e.dead)continue;
 const diff=player.position.clone().sub(e.mesh.position),dist=Math.hypot(diff.x,diff.z);
 e.cool-=dt;e.mesh.rotation.y=Math.atan2(diff.x,diff.z);
 // Boss fire breath channel
 if(e.fireT>0){
  e.fireT-=dt;
  const bvis=e.mesh.userData.visual as T.Group|undefined;
  if(bvis){bvis.rotation.x=-0.35;bvis.position.y=0.25;}
  if(Math.floor(e.fireT*20)%4===0)fireCone(e.mesh.position,e.mesh.rotation.y,.28);
  const face=new T.Vector3(Math.sin(e.mesh.rotation.y),0,Math.cos(e.mesh.rotation.y));
  const toPlayer=diff.clone(); toPlayer.y=0; const align=toPlayer.length()>0?toPlayer.normalize().dot(face):0;
  if(dist<9&&align>0.55&&Math.abs(diff.y)<3&&invulnerable<=0&&e.fireT<0.95){
   hp=Math.max(0,hp-18*dt);hurt=.55; if(Math.random()<.08)sound(70,.08,'sawtooth',.03);
   if(hp<=0)finish(false);
  }
  if(e.fireT<=0){if(bvis){bvis.rotation.x=0;bvis.position.y=0;} e.cool=1.6;}
 }else if(e.wind>0){
  e.wind-=dt;e.mesh.userData.pivot.rotation.x=-.25+e.wind*.6;
  const bvis=e.mesh.userData.visual as T.Group|undefined;
  if(e.boss&&bvis){const wp=1-Math.max(e.wind,0)/(e.boss?1.15:.65);bvis.rotation.x=-0.25+wp*0.85;bvis.position.y=wp*0.35;}
  if(e.wind<=0&&dist<(e.boss?4.2:2.3)&&Math.abs(diff.y)<2.8&&invulnerable<=0){
   hp=Math.max(0,hp-(e.boss?28:11));hurt=.75;invulnerable=.55;sound(e.boss?38:60,.28,'sawtooth',.06);
   ring(player.position,'#c94b30',e.boss?1.8:1,.35);
   if(e.boss){ring(e.mesh.position,'#ff6a3a',4.5,.4);sparks(player.position,10,'#ff8a4a');shake=.32;}
   if(hp<=0)finish(false);
  }
 }else if(dist<(e.boss?3.8:1.8)&&Math.abs(diff.y)<2.8&&e.cool<=0){
  // choose stomp vs fire for boss
  if(e.boss && e.pattern%2===1){
   e.fireT=1.25; e.cool=2.8; e.pattern++; notice('镇山巨兽 · 熔岩吐息'); sound(55,.35,'sawtooth',.06); ring(e.mesh.position,'#ff7a30',3.2,.4);
  }else{
   e.wind=e.boss?1.15:.65; e.cool=e.boss?2.35:1.9; e.pattern++;
   ring(e.mesh.position,'#e85a35',e.boss?5.2:2.1,e.wind);
   if(e.boss){notice('镇山巨兽 · 踏地蓄力');sound(45,.28,'sawtooth',.05);}
  }
 }else if(dist<(e.boss?16:10)&&dist>1.8){
  diff.y=0;diff.normalize();moveBody(e.mesh,diff.x*dt*(e.boss?2.6:2.7),diff.z*dt*(e.boss?2.6:2.7));
  const vis=e.mesh.userData.visual as T.Group|undefined;
  if(vis){vis.position.y=Math.sin(time*6)*.08;vis.rotation.z=Math.sin(time*4)*.05;}
  e.mesh.userData.legs.forEach((leg:T.Object3D,i:number)=>leg.rotation.x=Math.sin(time*9+i*Math.PI)*.4);
  e.mesh.userData.pivot.rotation.x=0;
 }else{
  e.mesh.userData.legs.forEach((leg:T.Object3D)=>leg.rotation.x=0);
  const vis=e.mesh.userData.visual as T.Group|undefined;
  if(vis&&e.wind<=0&&e.fireT<=0){vis.position.y=0;vis.rotation.z=0;vis.rotation.x=0;}
 }
 for(const other of enemies){if(other===e||other.dead)continue;const separation=e.mesh.position.clone().sub(other.mesh.position);separation.y=0;const d=separation.length();if(d>0&&d<.9){separation.normalize();moveBody(e.mesh,separation.x*dt,separation.z*dt);}}
}
for(let i=drops.length-1;i>=0;i--){const d=drops[i];d.position.y=.65+Math.sin(time*3)*.16;if(d.position.distanceTo(player.position)<1.7){hp=Math.min(100,hp+18);scene.remove(d);drops.splice(i,1);sound(620,.25);notice('灵息入体 · 生命 +18');}}
}
function frame(){requestAnimationFrame(frame);const dt=Math.min(clock.getDelta(),.033);if(running)update(dt);for(let i=effects.length-1;i>=0;i--){const e=effects[i];if(running){e.life-=dt;if(e.vx||e.vy||e.vz){e.mesh.position.x+=(e.vx||0)*dt;e.mesh.position.y+=(e.vy||0)*dt;e.mesh.position.z+=(e.vz||0)*dt;if(e.vy!==undefined)e.vy-=6*dt;}if(e.grow){const s=1+(1-Math.max(e.life,0)/e.max)*e.grow;e.mesh.scale.setScalar(s);}}const mat=e.mesh.material as T.MeshBasicMaterial|T.MeshStandardMaterial;if('opacity' in mat)mat.opacity=Math.max(0,e.life/e.max)*('emissiveIntensity' in mat?1:.95);if(e.life<=0){scene.remove(e.mesh);e.mesh.geometry.dispose();(e.mesh.material as T.Material).dispose();effects.splice(i,1);}}
const t=performance.now()/1000;banners.forEach((b,i)=>{b.rotation.x=Math.sin(t*1.5+i)*.045;b.rotation.z=Math.sin(t+i)*.025;});flames.forEach((f,i)=>(f.material as T.MeshStandardMaterial).emissiveIntensity=1.8+Math.sin(t*5+i)*.25);
shake=Math.max(0,shake-dt*1.8); look.copy(player.position).add(new T.Vector3(0,1.3,0));desired.copy(look).add(new T.Vector3(Math.sin(yaw)*8.2,1.7+pitch*4,Math.cos(yaw)*8.2));desired.x=T.MathUtils.clamp(desired.x,-22,22);desired.z=T.MathUtils.clamp(desired.z,-22,24);camera.position.lerp(desired,1-Math.exp(-dt*8)); if(shake>0) camera.position.add(new T.Vector3((Math.random()-.5)*shake,(Math.random()-.5)*shake*.6,(Math.random()-.5)*shake)); camera.lookAt(look);
for(const e of enemies){project.copy(e.mesh.position);project.y+=e.boss?5.2:2.8;project.project(camera);e.label.style.display=started&&!e.dead&&project.z<1&&project.z>0?'block':'none';e.label.style.left=`${(project.x*.5+.5)*innerWidth}px`;e.label.style.top=`${(-project.y*.5+.5)*innerHeight}px`;e.label.querySelector('i')!.setAttribute('style',`width:${Math.max(0,e.hp/e.max*100)}%`);}
el('hp').style.width=`${hp}%`;if(el('hpText')) el('hpText')!.textContent=`${hp} / 100`;el('stamina').style.width=`${stamina}%`;if(el('count')) el('count')!.textContent=String(kills);if(el('ult')) el('ult')!.textContent=ultCd>0?`K 定海神针 · ${ultCd.toFixed(1)}s`:'K 定海神针 · 就绪';hurt=Math.max(0,hurt-dt);el('hurt').style.opacity=String(hurt*.7);if(running)noticeT=Math.max(0,noticeT-dt);el('notice').style.opacity=noticeT>0?'1':'0';renderer.render(scene,camera);}
camera.position.set(0,5.7,20);frame();window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
// Read-only snapshot for browser smoke tests and diagnostics.
Object.defineProperty(window,'__trial',{get:()=>({running,artReady,hp,kills,grounded,yaw,player:player.position.toArray(),enemies:enemies.map(e=>({hp:e.hp,dead:e.dead,position:e.mesh.position.toArray()}))})});
