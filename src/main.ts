import * as T from 'three';
import './style.css';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WarriorRig, animateWarrior, type RootMotion } from './rig';

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
 const visual=new T.Group(); visual.name='Visual'; g.add(visual); const orient=new T.Group(); orient.name='TripoOrient'; orient.rotation.set(0,-Math.PI/2,0); visual.add(orient);
 const pivot=new T.Group(); pivot.name='WeaponPivot'; visual.add(pivot);
 const torso=new T.Group(); torso.name='TorsoPivot'; visual.add(torso);
 g.userData={legs:[] as T.Object3D[],pivot,torso,visual,orient,baseYaw:0,movePose:0};
 scene.add(g);return g;
}
// Tripo exports flip between `tripo0_Left_Limb_1` and `tripo::0_Left_Limb_1`; compare the tail only.
const boneKey=(o:T.Object3D)=>(o.name||'').replace(/^tripo(::|_)?/i,'').toLowerCase();
const quatAngle=(q:T.Quaternion)=>2*Math.acos(Math.min(1,Math.abs(q.w)));
type Leg={hip:T.Object3D,knee:T.Object3D,ankle:T.Object3D,toe:T.Object3D};

// Apply a rotation expressed in world axes to one bone, leaving its parent chain untouched.
function spinBone(bone:T.Object3D,axis:T.Vector3,angle:number){
 const parentWorld=new T.Quaternion();(bone.parent??bone).getWorldQuaternion(parentWorld);
 bone.quaternion.premultiply(parentWorld).premultiply(new T.Quaternion().setFromAxisAngle(axis,angle)).premultiply(parentWorld.clone().invert());
 bone.updateWorldMatrix(false,true);
}
// Swing `bone` so the bone→tip direction lines up with `target`. No-op when already close enough.
function aimBone(bone:T.Object3D,tip:T.Object3D,target:T.Vector3,minDeg=1,maxDeg=120){
 bone.updateWorldMatrix(true,true);
 const from=new T.Vector3(),to=new T.Vector3();
 bone.getWorldPosition(from);tip.getWorldPosition(to);
 const dir=to.sub(from);if(dir.lengthSq()<1e-10)return 0;
 dir.normalize();
 const want=target.clone().normalize();
 const angle=dir.angleTo(want);
 if(angle<T.MathUtils.degToRad(minDeg))return 0;
 const axis=new T.Vector3().crossVectors(dir,want);
 if(axis.lengthSq()<1e-10)axis.set(1,0,0);
 const applied=Math.min(angle,T.MathUtils.degToRad(maxDeg));
 spinBone(bone,axis.normalize(),applied);
 return T.MathUtils.radToDeg(applied);
}

// `Box3.setFromObject(_, true)` reads a SkinnedMesh's bindMatrixInverse, and only
// `updateMatrixWorld` refreshes it — `updateWorldMatrix` leaves it stale, which double-applies the
// parent transform and reports a body roughly twice as tall reaching far below the feet.
function refreshMatrices(orient:T.Group){
 orient.updateWorldMatrix(true,false);
 orient.updateMatrixWorld(true);
}

// Legs are the only `<n>_<side>_Limb_*` group present on both sides; the other group
// (`1_Left_Limb_*` here) is really spine + arms, so it must not be straightened.
function findLegs(model:T.Object3D){
 const groups=new Map<string,Map<string,T.Object3D[]>>();
 model.traverse(o=>{
  const m=/^(\d+)_(left|right)_limb_(\d+)$/.exec(boneKey(o));
  if(!m)return;
  let sides=groups.get(m[1]);if(!sides){sides=new Map();groups.set(m[1],sides);}
  let chain=sides.get(m[2]);if(!chain){chain=[];sides.set(m[2],chain);}
  chain[Number(m[3])]=o;
 });
 let best:Map<string,T.Object3D[]>|undefined,bestY=Infinity;
 const p=new T.Vector3();
 for(const sides of groups.values()){
  if(sides.size<2)continue;
  let tipY=Infinity;
  for(const chain of sides.values()){const tip=chain.filter(Boolean).pop();if(!tip)continue;tip.getWorldPosition(p);tipY=Math.min(tipY,p.y);}
  if(tipY<bestY){bestY=tipY;best=sides;}
 }
 const legs:Leg[]=[];
 for(const chain of best?.values()??[]){
  const bones=chain.filter(Boolean);
  if(bones.length<3)continue;
  legs.push({hip:bones[0],knee:bones[1],ankle:bones[bones.length-2],toe:bones[bones.length-1]});
 }
 return legs;
}

// Standing bind: knee straight, whole leg hanging at the floor. Ankles keep their bind bend so
// the soles stay flat instead of pointing the toes.
function straightenLegs(legs:Leg[]){
 const touched:string[]=[];
 const down=new T.Vector3(0,-1,0);
 for(const leg of legs){
  if(quatAngle(leg.knee.quaternion)>T.MathUtils.degToRad(20)){leg.knee.quaternion.identity();leg.knee.rotation.set(0,0,0);leg.knee.updateWorldMatrix(false,true);touched.push(leg.knee.name);}
  if(aimBone(leg.hip,leg.ankle,down,4))touched.push(leg.hip.name);
 }
 return touched;
}

// Arms hang off the same bone as the head, whatever that bone happens to be named.
const chainTip=(bone:T.Object3D)=>{let tip=bone;while(tip.children.length)tip=tip.children[0];return tip;};
function findArms(model:T.Object3D){
 let head:T.Object3D|undefined;
 model.traverse(o=>{if(!head&&/^head(_|$)/.test(boneKey(o)))head=o;});
 return head?.parent?.children.filter(c=>c!==head&&c.children.length)??[];
}

// Break the dead T-pose by swinging each arm down around the axis perpendicular to (up, arm).
function relaxArms(arms:T.Object3D[],deg=40){
 const touched:string[]=[];
 const up=new T.Vector3(0,1,0),from=new T.Vector3(),to=new T.Vector3();
 for(const shoulder of arms){
  shoulder.updateWorldMatrix(true,true);
  shoulder.getWorldPosition(from);shoulder.children[0].getWorldPosition(to);
  const dir=to.sub(from);
  if(dir.lengthSq()<1e-10)continue;
  dir.normalize();
  if(Math.abs(dir.y)>.5)continue;
  const axis=new T.Vector3().crossVectors(up,dir);
  if(axis.lengthSq()<1e-10)continue;
  spinBone(shoulder,axis.normalize(),T.MathUtils.degToRad(deg));
  touched.push(shoulder.name);
 }
 return touched;
}

let boneTreeLogged=false;
function logBoneTree(orient:T.Group){
 if(boneTreeLogged)return;
 boneTreeLogged=true;
 const rows:string[]=[];const p=new T.Vector3();
 orient.traverse(o=>{if((o as T.Mesh).isMesh)return;o.getWorldPosition(p);rows.push(`${o.name||'(unnamed)'} < ${o.parent?.name||'-'} @y=${p.y.toFixed(3)}`);});
 console.info('[trial] bone tree',rows.slice(0,48));
}

function groundOrient(orient:T.Group,kind:'player'|'boss'='player',feet:T.Object3D[]=[]){
 refreshMatrices(orient);
 const box=new T.Box3();
 try{box.setFromObject(orient,true);}catch{box.setFromObject(orient);}
 const height=Math.max(box.max.y-box.min.y,.001);
 let footMin=Infinity;
 const p=new T.Vector3();
 for(const f of feet){f.getWorldPosition(p);footMin=Math.min(footMin,p.y);}
 // Feet win over stray extremities: a hand or hair below the soles must not hang the body in air.
 let minY=box.min.y;
 const slack=height*.06;
 if(Number.isFinite(footMin))minY=Math.max(minY,footMin-slack);
 orient.position.y-=minY;
 const clear=kind==='player'?.02:.15;orient.position.y+=clear;
 console.info('[trial] groundOrient',{kind,boxMin:box.min.y,boxMax:box.max.y,footMin,slack,minY,clear,positionY:orient.position.y});
}

const player=warrior();player.position.set(0,0,12);
// One boss move set, three reads. Every number here drives both the telegraph and the hitbox, so
// what the player sees on the floor is exactly what can hurt them.
type BossMove='slam'|'swipe'|'fire';
const BOSS_MOVES={
 // `active` is how long the palm stays down accepting hits. It exists so the warning and the damage
 // can be driven off one number each: the ring is on the ground for wind+strike+active, and the
 // hitbox is live for exactly the `active` tail of that. Anything shorter than a few frames would
 // make the hit a coin flip on frame timing rather than a readable window.
 slam:{wind:.95,strike:.17,active:.12,recover:.72,reach:2.5,radius:4.3,damage:28,name:'巨掌砸地'},
 swipe:{wind:.6,strike:.26,recover:.6,reach:.8,radius:5.4,arc:2.5,damage:22,name:'巨爪横扫'},
 fire:{wind:.9,strike:1.35,recover:.85,range:8.6,half:.21,dps:20,turn:1.1,name:'熔岩吐息'},
} as const;
// Where the muzzle sits inside the boss bounding box: at the front of the head mass, which on this
// sculpt is the top-front of the body (the low tail runs out the back).
const BOSS_MOUTH={forward:.86,up:.78};
// `hit` means the blow has visibly landed; `dealt` means its damage has already been applied, which
// is a separate question once the hitbox is live across a window rather than a single frame.
type BossAtk={move:BossMove,t:number,hit:boolean,dealt?:boolean,dir:T.Vector3,center:T.Vector3,tele?:T.Group,jet?:ReturnType<typeof fireJet>};
type Enemy={mesh:T.Group,hp:number,max:number,boss:boolean,home:T.Vector3,cool:number,wind:number,fireT:number,hit:boolean,dead:boolean,label:HTMLDivElement,pattern:number,atk:BossAtk|null,step:number};
const enemies:Enemy[]=[];for(const [x,z,boss] of [[0,-7,1]]){const mesh=warrior(true,!!boss);mesh.position.set(x,0,z);const label=document.createElement('div');label.className='enemy-label'+(boss?' boss-label':'');label.innerHTML=`${boss?'镇山巨兽':'石魇'}<i></i>`;document.body.append(label);enemies.push({mesh,hp:boss?380:80,max:boss?380:80,boss:!!boss,home:mesh.position.clone(),cool:1+rand(),wind:0,fireT:0,hit:false,dead:false,label,pattern:0,atk:null,step:0});}
const gltfLoader=new GLTFLoader(manager);
let playerMixer:T.AnimationMixer|undefined; let locoActions:{idle?:T.AnimationAction,walk?:T.AnimationAction}={}; let mixerActive=false; let hitstop=0;
let playerRig:WarriorRig|undefined; let rootMotion:RootMotion={bob:0,pitch:0,roll:0,spin:0};
// Attack timing lives in one place so the animation phase can never drift from the gameplay window.
const ATTACK_DUR=[.48,.48,.62], ULT_DUR=.95, DODGE_DUR=.42, LAND_DUR=.24, FLINCH_DUR=.18;
const MOVE_NAMES=['横扫破风','挑棍穿云','旋砸定山'];
async function loadCharacter(root:T.Group,file:string,targetHeight:number){
 const {scene:model}=await gltfLoader.loadAsync(assetUrl(`models/${file}.glb`));
 model.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m&&'envMapIntensity' in m){(m as T.MeshStandardMaterial).envMapIntensity=1.15;(m as T.MeshStandardMaterial).needsUpdate=true;}}});
 let rootBone:T.Object3D|undefined;
 model.traverse(o=>{if(!rootBone&&/^root$/.test(boneKey(o)))rootBone=o;});
 console.info('[trial] root bone',{file,name:rootBone?.name??'(none)',y:rootBone?.position.y});
 if(rootBone&&rootBone.position.y<0){console.info('[trial] zero Root local translation',{file,oldY:rootBone.position.y});rootBone.position.y=0;}
 const orient=root.userData.orient as T.Group;
 orient.clear();orient.rotation.set(0,-Math.PI/2,0);
 model.scale.setScalar(1);model.position.set(0,0,0);model.rotation.set(0,0,0);
 orient.add(model);
 refreshMatrices(orient);
 const feet:T.Object3D[]=[];
 let legBones:Leg[]=[],armBones:T.Object3D[]=[];
 if(file==='player'){
  logBoneTree(orient);
  const legs=legBones=findLegs(model);
  for(const leg of legs)feet.push(leg.ankle,leg.toe);
  armBones=findArms(model);
  const legFixes=straightenLegs(legs);
  const armFixes=relaxArms(armBones);
  console.info('[trial] player straighten',{legs:legs.map(l=>[l.hip.name,l.knee.name,l.ankle.name,l.toe.name].join(' > ')).join(' | '),arms:armBones.map(a=>a.name).join(),legFixes:legFixes.join(),armFixes:armFixes.join()});
  if(legs.length!==2)console.warn('[trial] leg chains unresolved — bone naming changed, stance will fall back to the mesh bounding box',{legs:legs.length});
 }
 refreshMatrices(orient);
 const bb=new T.Box3().setFromObject(orient);
 const h=Math.max(bb.max.y-bb.min.y,.001);
 model.scale.setScalar(targetHeight/h);
 groundOrient(orient,file==='boss'?'boss':'player',feet);
 root.userData.legs=[];root.userData.model=model;root.userData.legBones=legBones;root.userData.armBones=armBones;
 if(file==='player'&&legBones.length===2&&armBones.length){
  // Rest pose is captured here, *after* the standing bind fixes, so a zero animation pose is
  // exactly the verified stance and idle never disturbs the legs.
  playerRig=new WarriorRig(orient,legBones,armBones);
  console.info('[trial] rig',{joints:playerRig.joints.length,legs:playerRig.legs.map(l=>`${l.side>0?'R':'L'}:${l.hip.bone.name}`).join(),arms:playerRig.arms.map(a=>`${a.side>0?'R':'L'}:${a.upper.bone.name}`).join(),spine:[playerRig.pelvis?.bone.name,playerRig.spine?.bone.name,playerRig.chest?.bone.name,playerRig.head?.bone.name].join(' > ')});
 }
 if(file==='boss'){
  // The boss GLB is one static sculpt, so the muzzle is derived from its bounds: front of the body,
  // in the upper mass where the head sits. Fire is spawned from this anchor, never from the feet.
  refreshMatrices(orient);
  // Box3.setFromObject reports world bounds; the anchor is a child of `orient`, so bring the corners
  // back into that frame first (the orient yaw only permutes axes, so the box stays axis aligned).
  const worldBox=new T.Box3().setFromObject(model);
  const bodyBox=new T.Box3().setFromPoints([orient.worldToLocal(worldBox.min.clone()),orient.worldToLocal(worldBox.max.clone())]);
  const mouth=new T.Object3D();mouth.name='BossMouth';
  mouth.position.set(bodyBox.max.x*BOSS_MOUTH.forward,bodyBox.min.y+(bodyBox.max.y-bodyBox.min.y)*BOSS_MOUTH.up,0);
  orient.add(mouth);
  root.userData.mouth=mouth;
  console.info('[trial] boss mouth',{local:mouth.position.toArray(),box:[bodyBox.min.toArray(),bodyBox.max.toArray()]});
 }
 console.info('[trial] load',file,'euler',orient.rotation.toArray(),'worldH',targetHeight,'scale',model.scale.x);
}

manager.onError=(url)=>{el('description').textContent=`美术资源加载失败，请刷新重试：${url}`;};
async function loadLoco(){ mixerActive=false; console.info('[trial] loadLoco no-op: skipping bad player-loco.glb bind pose; using upright player.glb'); return; }
Promise.all([loadCharacter(player,'player',1.9),loadCharacter(enemies[0].mesh,'boss',4.2)]).then(async()=>{ await loadLoco();
 artReady=true;startButton.disabled=false;startButton.textContent='踏 入 山 门　→';
}).catch((err)=>{ console.error(err); artReady=true; startButton.disabled=false; startButton.textContent='踏 入 山 门　→'; showError(err); });
const keys=new Set<string>();let touchMoveX=0,touchMoveY=0;let running=false,started=false,ended=false,paused=false,hp=100,stamina=100,yaw=0,pitch=.35,vy=0,grounded=true,attackT=0,combo=0,queued=false,lastAttack=-10,dodgeT=0,invulnerable=0,kills=0,time=0,hurt=0,noticeT=0,ultT=0,ultCd=0,ultHit=false;
// Animation-only state: air time, landing recovery and hit flinch feed the pose layers.
let airT=0,landT=0,flinchT=0,wasGrounded=true,ultBurst=false,footPhase=0;const hitSet=new Set<Enemy>();const velocity=new T.Vector3();// Gameplay roots use atan2 velocity; visual models apply the shared Tripo nose offset.
player.rotation.y=0;let shake=0;let muted=false,audioCtx:AudioContext|undefined;
function sound(freq:number,duration=.12,type:OscillatorType='sine',volume=.055){if(muted)return;try{audioCtx??=new AudioContext();const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,audioCtx.currentTime);osc.frequency.exponentialRampToValueAtTime(Math.max(25,freq*.35),audioCtx.currentTime+duration);gain.gain.setValueAtTime(volume,audioCtx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);osc.connect(gain).connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+duration);}catch{}}
function notice(text:string){if(el('notice')) el('notice')!.textContent=text;noticeT=2;}
function startAttack(){if(!running||dodgeT>0||ultT>0)return;if(attackT>0){queued=true;return;}combo=time-lastAttack<.85?(combo+1)%3:0;attackT=ATTACK_DUR[combo];lastAttack=time;hitSet.clear();sound(210+combo*90,.16+(combo*.04),'triangle',.06+combo*.01);notice(`行者 · ${MOVE_NAMES[combo]}`);staffSlashTrail(player.position,player.rotation.y,combo);}
function startUltimate(){
 if(!running||dodgeT>0||ultT>0||ultCd>0||attackT>0)return;
 if(stamina<45){notice('灵力不足 · 无法定海');return;}
 stamina-=45;ultT=ULT_DUR;ultCd=7.5;ultHit=false;shake=.28;attackT=0;queued=false;invulnerable=.35;
 notice('行者 · 定海神针');sound(90,.35,'sawtooth',.07);sound(420,.4,'triangle',.05);
 // Gather: light drawn in around the warrior before the staff comes down.
 ring(player.position,'#e2ac59',2.4,.5);
 pillar(player.position,'#ffd88c',.8,4.4,.8);
 sparks(player.position,16,'#fff0c0');
}
function dodge(){if(!running||stamina<30||dodgeT>0||ultT>0)return;if(attackT>0 && (1-attackT/ATTACK_DUR[combo])<.4)return;stamina-=30;dodgeT=DODGE_DUR;invulnerable=.5;attackT=0;sound(140,.15,'sine');notice('行者 · 纵身闪避');ring(player.position,'#9ad7ff',1.4,.28);dust(player.position,5,'#8f9aa0',1,.7,.9);}
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
function reset(){hp=100;stamina=100;kills=0;vy=0;attackT=0;queued=false;combo=0;lastAttack=-10;dodgeT=0;invulnerable=0;ultT=0;ultCd=0;ultHit=false;ultBurst=false;grounded=true;hurt=0;airT=0;landT=0;flinchT=0;wasGrounded=true;keys.clear();player.position.set(0,0,12);player.rotation.set(0,0,0);yaw=0;pitch=.35;for(const e of enemies){e.hp=e.max;e.dead=false;e.mesh.visible=true;e.mesh.position.copy(e.home);e.mesh.rotation.set(0,0,0);e.cool=1.5;e.wind=0;e.fireT=0;e.pattern=0;e.atk=null;e.step=0;const bv=e.mesh.userData.visual as T.Group|undefined;if(bv){bv.position.y=0;bv.rotation.set(0,0,0);bv.scale.set(1,1,1);}}for(const d of drops)scene.remove(d);drops.length=0;ended=false;}
el('start')?.addEventListener('click',()=>{if(!artReady)return;if(ended)reset();started=true;paused=false;running=true;el('overlay').classList.add('hidden');if(!coarse)renderer.domElement.requestPointerLock();sound(330,.25);notice('苍岚古寺 · 挑战镇山巨兽');});
function finish(win:boolean){ended=true;running=false;el('title').textContent=win?'试炼已成':'再起一程';el('subtitle').textContent=win?'一 棍 破 迷 障':'胜 负 仍 未 定';el('description').innerHTML=win?'石狮封印已破，古寺重归寂静。<br>你的长棍，已留下新的传说。':`已击破 ${kills} / 1 名守卫。<br>敌人蓄力时会亮起红环，闪避可避开伤害。<br>击败守卫后拾取金色灵息，恢复生命。`;el('start').textContent='再 入 山 门　↻';el('overlay').classList.remove('hidden');document.exitPointerLock();}
// `tick` lets an effect drive itself (flicker, sweep, expand) instead of needing a bespoke system.
type Fx={mesh:T.Object3D,life:number,max:number,grow?:number,vy?:number,vx?:number,vz?:number,tick?:(e:Fx,age:number,dt:number)=>void,ownAlpha?:boolean};
const effects:Fx[]=[];const drops:T.Mesh[]=[];
// Fade whole hierarchies, so an effect can be a group of meshes plus a light.
function fxAlpha(root:T.Object3D,alpha:number){root.traverse(o=>{
 const light=o as T.PointLight;if(light.isPointLight){light.userData.base??=light.intensity;light.intensity=light.userData.base*alpha;}
 const mats=(o as T.Mesh).material;if(!mats)return;
 for(const m of Array.isArray(mats)?mats:[mats]){if(!('opacity' in m))continue;m.userData.base??=m.opacity;m.opacity=m.userData.base*alpha;}
});}
function fxDispose(root:T.Object3D){root.traverse(o=>{const m=o as T.Mesh;m.geometry?.dispose();const mats=m.material;if(mats)for(const mm of Array.isArray(mats)?mats:[mats])mm.dispose();});}
function fx(mesh:T.Object3D,life:number,extra:Partial<Fx>={}){const e:Fx={mesh,life,max:life,...extra};effects.push(e);return e;}
/**
 * Cut an effect short on the caller's schedule instead of letting it run out its own lifetime.
 *
 * Effect ages run on wall-clock dt while attack timers run on game dt, and `hitstop` zeroes the
 * latter — so anything whose *timing* has to agree with a hitbox cannot be left to expire on its
 * own. Telegraphs are retired from the attack clock instead.
 */
function retireFx(mesh?:T.Object3D){if(!mesh)return;const e=effects.find(x=>x.mesh===mesh);if(e)e.life=0;}
const additive=(color:string,opacity=.8,vertexColors=false)=>new T.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide,vertexColors});
// Fade an additive cone along its axis so a flame is hottest at the muzzle and thins out downrange
// instead of reading as one flat solid wedge. ConeGeometry keeps its apex at +height/2.
function taperCone(geom:T.BufferGeometry,height:number){
 const pos=geom.attributes.position;const col=new Float32Array(pos.count*3);
 for(let i=0;i<pos.count;i++){
  const t=T.MathUtils.clamp((pos.getY(i)+height/2)/height,0,1);
  const v=Math.min(1,.08+1.05*Math.pow(t,1.7));
  col[i*3]=col[i*3+1]=col[i*3+2]=v;
 }
 geom.setAttribute('color',new T.BufferAttribute(col,3));
}
function ring(pos:T.Vector3,color:string,size:number,life:number){const mesh=new T.Mesh(new T.RingGeometry(size*.85,size,40),new T.MeshBasicMaterial({color,side:T.DoubleSide,transparent:true,opacity:.85,depthWrite:false}));mesh.rotation.x=-Math.PI/2;mesh.position.copy(pos);mesh.position.y+=.12;scene.add(mesh);effects.push({mesh,life,max:life,grow:size*0.35});}
function sparks(pos:T.Vector3,n=7,color='#ffe7a0'){for(let i=0;i<n;i++){const m=new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:2.2,roughness:0.4,metalness:0.2,transparent:true});const mesh=sphere(.05+rand()*.04,m,pos.x+(rand()-.5)*0.6,pos.y+.4+rand()*1.4,pos.z+(rand()-.5)*0.6,scene);effects.push({mesh,life:.28+rand()*.25,max:.5,vy:1.5+rand()*2,vx:(rand()-.5)*2,vz:(rand()-.5)*2});}}
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
// --- weight and impact: dust, shockwaves, ground telegraphs, cracks ---
// Soft billowing puffs that sell mass — kicked up by every heavy footfall and impact.
function dust(pos:T.Vector3,n=8,color='#a89880',spread=1.4,power=1,size=1){
 for(let i=0;i<n;i++){
  const m=new T.MeshStandardMaterial({color,roughness:1,transparent:true,opacity:.34});
  const mesh=sphere((.1+rand()*.14)*size,m,pos.x+(rand()-.5)*spread,pos.y+.1+rand()*.3*size,pos.z+(rand()-.5)*spread,scene);
  const dir=new T.Vector3(rand()-.5,0,rand()-.5).normalize().multiplyScalar((.7+rand()*1.3)*power);
  fx(mesh,.4+rand()*.4,{vx:dir.x,vy:.5+rand()*.7*power,vz:dir.z,grow:.8+rand()*.7});
 }
}
// A ground ring that races outward from an impact. `radius` is the gameplay radius it ends on.
// Wide rings need a lower `alpha`: additive blending clips to flat white once the band is thick.
function shockwave(pos:T.Vector3,radius:number,color='#ffb277',life=.45,alpha=.9){
 const mesh=new T.Mesh(new T.RingGeometry(.92,1,52),additive(color,alpha));
 mesh.rotation.x=-Math.PI/2;mesh.position.copy(pos);mesh.position.y+=.09;scene.add(mesh);
 fx(mesh,life,{tick:(e,age)=>{const s=radius*(.25+.75*Math.sqrt(age));e.mesh.scale.set(s,s,1);}});
}
/**
 * Flat fan on the floor marking exactly the ground a boss attack will cover, so every telegraph
 * shows its real hitbox. RingGeometry sweeps counter-clockwise from +X in its own plane; laid flat
 * that maps a local angle φ to world yaw φ + π/2.
 */
function groundFan(pos:T.Vector3,yaw:number,radius:number,arc:number,color:string,life:number,fadeIn=true){
 const g=new T.Group();g.position.set(pos.x,pos.y+.05,pos.z);g.rotation.y=yaw;scene.add(g);
 const geom=new T.RingGeometry(Math.min(1.1,radius*.22),radius,Math.max(14,Math.round(arc*16)),1,-arc/2-Math.PI/2,arc);
 const mesh=new T.Mesh(geom,new T.MeshBasicMaterial({color,side:T.DoubleSide,transparent:true,opacity:.3,depthWrite:false}));
 mesh.rotation.x=-Math.PI/2;g.add(mesh);
 const mat=mesh.material as T.MeshBasicMaterial;
 fx(g,life,{ownAlpha:true,tick:(_e,age)=>{
  const swell=fadeIn?age:1-age;
  mat.opacity=(.1+.32*swell)*(.72+.28*Math.sin(age*34));
 }});
 return g;
}
/**
 * Closing circle under a slam: the shrinking inner ring is the “get out now” read.
 *
 * `life` is how long the circle stays on the ground and `closeAt` (seconds) is when the blow
 * actually lands. They differ on purpose: the countdown has to finish at the impact, then the ring
 * holds closed and lit for the remaining frames the hitbox is live, so the warning is still on
 * screen for every frame that can hurt you.
 */
function telegraphDisc(pos:T.Vector3,radius:number,color:string,life:number,closeAt=life){
 const g=new T.Group();g.position.set(pos.x,pos.y+.05,pos.z);scene.add(g);
 const flat=(inner:number,outer:number,mat:T.Material)=>{const m=new T.Mesh(new T.RingGeometry(inner,outer,46),mat);m.rotation.x=-Math.PI/2;g.add(m);return m;};
 flat(radius*.06,radius,new T.MeshBasicMaterial({color,side:T.DoubleSide,transparent:true,opacity:.14,depthWrite:false}));
 flat(radius*.93,radius,additive(color,.5));
 const closing=flat(radius*.86,radius,additive('#ffe3ae',.7));
 fx(g,life,{ownAlpha:true,tick:(e,age)=>{
  const p=Math.min(1,age*life/closeAt);
  fxAlpha(e.mesh,.3+.7*p);
  const s=Math.max(.08,1.15-1.07*p);
  closing.scale.set(s,s,1);
 }});
 return g;
}
/** Three glowing gouges raked through the air along a boss claw sweep. */
function clawArc(pos:T.Vector3,yaw:number,radius:number,arc:number,life=.32){
 const start=yaw-arc*.45;
 const g=new T.Group();g.position.copy(pos);g.rotation.y=start;scene.add(g);
 for(let i=0;i<3;i++){
  const claw=new T.Mesh(new T.TorusGeometry(radius-i*.3,.07,6,26,arc*.45),additive(i?'#ffb072':'#ffe0b0',.7-i*.12));
  // Euler XYZ applies Z first, so this spins the arc onto the group's forward before it lies flat.
  claw.rotation.x=Math.PI/2;claw.rotation.z=Math.PI/2-arc*.22;claw.position.y=2.15-i*.38;
  g.add(claw);
 }
 // The sweep finishes in the first half of the life so the gouges are across the player's front
 // while the hit window is open, then hang in the air for a beat.
 fx(g,life,{tick:(e,age)=>{e.mesh.rotation.y=start+arc*.9*Math.min(1,age*2);}});
}
// Radial fissures under a slam. Thin slabs, so they read as broken flagstones rather than decals.
function cracks(pos:T.Vector3,radius:number,n=7,color='#ff9d52'){
 for(let i=0;i<n;i++){
  const a=rand()*Math.PI*2,len=radius*(.35+rand()*.5);
  const mesh=new T.Mesh(new T.BoxGeometry(len,.04,.05+rand()*.07),additive(color,.42));
  mesh.position.set(pos.x+Math.cos(a)*len/2,pos.y+.04,pos.z+Math.sin(a)*len/2);
  mesh.rotation.y=-a;scene.add(mesh);
  fx(mesh,.45+rand()*.3,{tick:(e,age)=>{e.mesh.scale.x=Math.min(1,age*3.2);}});
 }
}
// Rising column of light for the ultimate: a stack of additive shells that flare and lift.
function pillar(pos:T.Vector3,color:string,radius:number,height:number,life=.7,glow=12){
 const g=new T.Group();g.position.copy(pos);scene.add(g);
 for(let i=0;i<3;i++){
  const geom=new T.CylinderGeometry(radius*(1-i*.28),radius*(1.5-i*.3),height,20,5,true);
  // Reuse the flame taper: bright where it leaves the ground, thinning as it climbs.
  taperCone(geom,height);
  const shell=new T.Mesh(geom,additive(color,.2-i*.05,true));
  shell.rotation.x=Math.PI;shell.position.y=height/2;g.add(shell);
 }
 const light=new T.PointLight(color,glow,16,2);light.position.y=1.4;g.add(light);
 fx(g,life,{tick:(e,age)=>{e.mesh.scale.set(1+age*.55,1+age*.35,1+age*.55);e.mesh.rotation.y=age*2.2;}});
}
// --- boss fire breath: mouth ember charge, then a tracked jet whose cone *is* the hitbox ---
function mouthEmber(mouth:T.Object3D,life:number){
 const g=new T.Group();mouth.add(g);
 const core=new T.Mesh(new T.SphereGeometry(.2,12,10),additive('#ffcf7a',.75));g.add(core);
 const halo=new T.Mesh(new T.SphereGeometry(.4,12,10),additive('#ff6a26',.32));g.add(halo);
 const light=new T.PointLight('#ff8a32',0,9,2);light.userData.base=16;g.add(light);
 // Brightens as the breath charges, which is the tell the player reads.
 return fx(g,life,{ownAlpha:true,tick:(e,age)=>{
  fxAlpha(e.mesh,.1+.95*age);
  e.mesh.scale.setScalar(.3+age*.95+Math.sin(age*40)*.06);
 }});
}
function fireJet(length:number,radius:number){
 const g=new T.Group();scene.add(g);
 // Nested cones: pale core, orange body, dark smoke skirt. Each cone is turned so its point sits at
 // the muzzle and its mouth flares outward along the group's +Z, which is the aiming axis.
 const layers:T.Mesh[]=[];
 const spec:[string,number,number,number][]=[['#ffeec0',.4,.42,.55],['#ff9a3c',.72,.34,.85],['#ff5a1e',1,.24,1],['#6b4432',1.22,.14,1.1]];
 for(const [color,scale,opacity,len] of spec){
  const geom=new T.ConeGeometry(radius*scale,length*len,16,5,true);
  taperCone(geom,length*len);
  const cone=new T.Mesh(geom,additive(color,opacity,true));
  cone.rotation.x=-Math.PI/2;cone.position.z=length*len/2;
  g.add(cone);layers.push(cone);
 }
 const light=new T.PointLight('#ff7a28',13,13,2);light.position.z=1.2;g.add(light);
 return {group:g,layers,light};
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

// ---------------------------------------------------------------------------------------------
// Boss: a static sculpt, so weight comes from anticipation, squash/stretch, dust and timing.
// Every move runs wind → strike → recover; the telegraph drawn during the wind is the same shape
// the strike tests against.
// ---------------------------------------------------------------------------------------------
const yawDir=(yaw:number)=>new T.Vector3(Math.sin(yaw),0,Math.cos(yaw));
const ease=(x:number)=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
const bossVisual=(e:Enemy)=>e.mesh.userData.visual as T.Group;
function turnToward(e:Enemy,diff:T.Vector3,step:number){
 const want=Math.atan2(diff.x,diff.z);
 const delta=((want-e.mesh.rotation.y+Math.PI*3)%(Math.PI*2))-Math.PI;
 e.mesh.rotation.y+=T.MathUtils.clamp(delta,-step,step);
}
function hurtPlayer(damage:number,color:string,iframes=.55){
 hp=Math.max(0,hp-damage);hurt=.8;invulnerable=Math.max(invulnerable,iframes);flinchT=FLINCH_DUR;
 ring(player.position,color,1.9,.35);sparks(player.position,10,'#ff8a4a');
 if(hp<=0)finish(false);
}
function startBossMove(e:Enemy,move:BossMove,diff:T.Vector3){
 e.atk={move,t:0,hit:false,dir:new T.Vector3(),center:new T.Vector3()};
 e.pattern++;notice(`镇山巨兽 · ${BOSS_MOVES[move].name}`);
 turnToward(e,diff,.4);
 if(move==='slam'){
  const S=BOSS_MOVES.slam;
  aimSlam(e,e.atk);
  // Keep the handle: without it the ring is spawned once and left behind the moment the boss turns.
  // The ring outlives the wind-up by the whole strike and active window, because the palm is still
  // falling — and then still down — long after the old ring used to vanish. The spare life is slack
  // against hitstop; `bossSlam` retires the ring off the attack clock the moment the danger ends.
  e.atk.tele=telegraphDisc(e.atk.center,S.radius,'#ff5730',S.wind+S.strike+S.active+.5,S.wind+S.strike);
  sound(44,.32,'sawtooth',.05);
 }else if(move==='swipe'){
  const S=BOSS_MOVES.swipe;
  e.atk.tele=groundFan(e.mesh.position,e.mesh.rotation.y,S.radius,S.arc,'#ff7a3a',S.wind);
  sound(62,.26,'sawtooth',.05);
 }else{
  const F=BOSS_MOVES.fire;
  const mouth=e.mesh.userData.mouth as T.Object3D|undefined;
  if(mouth)mouthEmber(mouth,F.wind);
  e.atk.tele=groundFan(e.mesh.position,e.mesh.rotation.y,F.range,F.half*2,'#ff8a30',F.wind);
  sound(52,.42,'sawtooth',.06);
 }
}
function endBossMove(e:Enemy,cool:number){if(e.atk)retireFx(e.atk.tele);e.atk=null;e.cool=cool;}
/**
 * Ground zero for 巨掌砸地. The palm lands `reach` ahead of wherever the boss faces *now*, and it
 * keeps turning through the wind-up, so this has to be recomputed every frame — and the ring has to
 * be dragged along with it. Both the telegraph and the hit test read `a.center`, which is the only
 * place the slam's impact point is defined, so they cannot disagree about where the blow lands.
 */
function aimSlam(e:Enemy,a:BossAtk){
 a.center.copy(e.mesh.position).add(yawDir(e.mesh.rotation.y).multiplyScalar(BOSS_MOVES.slam.reach));
 if(a.tele)a.tele.position.set(a.center.x,a.center.y+.05,a.center.z);
}
function bossSlam(e:Enemy,a:BossAtk,dt:number,diff:T.Vector3){
 const S=BOSS_MOVES.slam,vis=bossVisual(e);
 if(a.t<S.wind){
  // Rear back and rise: the wind-up is what makes the drop feel heavy.
  const u=ease(a.t/S.wind);
  turnToward(e,diff,1.5*dt);
  aimSlam(e,a);
  vis.rotation.x=-.34*u;vis.position.y=.44*u;vis.scale.set(1-.04*u,1+.08*u,1-.04*u);
 }else if(a.t<S.wind+S.strike){
  const k=((a.t-S.wind)/S.strike)**2;
  vis.rotation.x=-.34+.92*k;vis.position.y=.44-.52*k;vis.scale.set(1+.11*k,1-.1*k,1+.11*k);
 }else{
  if(!a.hit){
   a.hit=true;
   shockwave(a.center,S.radius,'#ff9d5c',.5,.6);cracks(a.center,S.radius*.85,10);
   dust(a.center,13,'#9c9384',S.radius*.8,1.6,2.4);sparks(a.center,8,'#ffb066');
   shake=Math.max(shake,.44);hitstop=.05;sound(36,.45,'sawtooth',.07);
  }
  // The palm rests on the ground for `active` seconds and hurts whoever is inside the warned circle
  // during those frames. Sampling one instant instead made the outcome depend on which frame the
  // impact happened to land on; a window is what the ring on the ground is actually promising.
  if(a.t<S.wind+S.strike+S.active){
   if(!a.dealt){
    const off=player.position.clone().sub(a.center);
    if(Math.hypot(off.x,off.z)<S.radius&&Math.abs(off.y)<2.8&&invulnerable<=0){a.dealt=true;hurtPlayer(S.damage,'#c94b30');}
   }
  }else retireFx(a.tele);
  const u=ease(Math.min(1,(a.t-S.wind-S.strike)/S.recover));
  vis.rotation.x=.58*(1-u);vis.position.y=-.08*(1-u);
  vis.scale.set(1+.11*(1-u),1-.1*(1-u),1+.11*(1-u));
  if(a.t>=S.wind+S.strike+S.recover)endBossMove(e,2.3);
 }
}
function bossSwipe(e:Enemy,a:BossAtk,dt:number,diff:T.Vector3){
 const S=BOSS_MOVES.swipe,vis=bossVisual(e);
 if(a.t<S.wind){
  const u=ease(a.t/S.wind);
  turnToward(e,diff,1.7*dt);
  if(a.tele){a.tele.position.set(e.mesh.position.x,.05,e.mesh.position.z);a.tele.rotation.y=e.mesh.rotation.y;}
  vis.rotation.y=-.6*u;vis.rotation.x=-.16*u;vis.position.y=.14*u;
 }else if(a.t<S.wind+S.strike){
  const u=(a.t-S.wind)/S.strike,k=Math.min(1,u*1.5)**.7;
  vis.rotation.y=-.6+1.55*k;vis.rotation.x=-.16+.24*k;vis.position.y=.14*(1-k);
  if(!a.hit&&u>.32){
   a.hit=true;
   const face=yawDir(e.mesh.rotation.y);
   clawArc(e.mesh.position.clone().add(face.clone().multiplyScalar(.9)),e.mesh.rotation.y,S.radius*.82,S.arc);
   dust(e.mesh.position.clone().add(face.clone().multiplyScalar(S.radius*.5)),8,'#98907f',S.radius,1.1,1.5);
   shake=Math.max(shake,.26);sound(72,.24,'sawtooth',.05);
   const off=player.position.clone().sub(e.mesh.position);off.y=0;
   const reach=Math.hypot(off.x,off.z);
   if(reach<S.radius&&off.normalize().dot(face)>Math.cos(S.arc/2)&&invulnerable<=0){hitstop=.04;hurtPlayer(S.damage,'#cf5a34');}
  }
 }else{
  const u=ease(Math.min(1,(a.t-S.wind-S.strike)/S.recover));
  vis.rotation.y=.95*(1-u);vis.rotation.x=.08*(1-u);
  if(a.t>=S.wind+S.strike+S.recover)endBossMove(e,2);
 }
}
function bossFire(e:Enemy,a:BossAtk,dt:number,diff:T.Vector3){
 const F=BOSS_MOVES.fire,vis=bossVisual(e);
 const mouth=e.mesh.userData.mouth as T.Object3D|undefined;
 const origin=mouth?mouth.getWorldPosition(new T.Vector3()):e.mesh.position.clone().add(new T.Vector3(0,2.6,0));
 if(a.t<F.wind){
  const u=ease(a.t/F.wind);
  turnToward(e,diff,F.turn*dt);
  if(a.tele){a.tele.position.set(e.mesh.position.x,.05,e.mesh.position.z);a.tele.rotation.y=e.mesh.rotation.y;}
  vis.rotation.x=-.32*u;vis.position.y=.18*u;vis.scale.set(1-.03*u,1+.05*u,1-.03*u);
 }else if(a.t<F.wind+F.strike){
  // Head snaps down and the jet erupts. Horizontal aim is the (slow) body turn, so sidestepping
  // works; the vertical aim tracks the chest so the flame visibly washes over the player.
  turnToward(e,diff,F.turn*.7*dt);
  const chest=player.position.clone().add(new T.Vector3(0,.9,0));
  const to=chest.clone().sub(origin);
  const drop=T.MathUtils.clamp(to.y/Math.max(to.length(),.001),-.72,.12);
  const flat=yawDir(e.mesh.rotation.y).multiplyScalar(Math.sqrt(Math.max(0,1-drop*drop)));
  a.dir.set(flat.x,drop,flat.z).normalize();
  if(!a.jet){
   const jet=a.jet=fireJet(F.range,F.range*Math.tan(F.half));
   // The jet outlives the breath by a moment so it can gutter out, so the flicker holds its own
   // reference instead of reading the attack state that is about to be cleared.
   fx(jet.group,F.strike+.22,{tick:(_x,age)=>{
    const wob=1+Math.sin(age*90)*.05;
    jet.layers.forEach((l,i)=>l.scale.set(wob+(i%2?.04:-.03),1,wob));
   }});
  }
  a.jet.group.position.copy(origin);
  a.jet.group.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),a.dir);
  vis.rotation.x=.1+Math.sin(a.t*44)*.025;vis.position.y=.04;vis.scale.set(1,1,1);
  if(Math.random()<.5)sparks(origin.clone().add(a.dir.clone().multiplyScalar(1.5+rand()*F.range*.8)),1,'#ffab52');
  shake=Math.max(shake,.05);
  // Hit test is the drawn cone: apex at the muzzle, widening to `range * tan(half)`.
  const off=player.position.clone().add(new T.Vector3(0,.9,0)).sub(origin);
  const along=off.dot(a.dir);
  if(along>0&&along<F.range&&invulnerable<=0){
   const perp=off.clone().sub(a.dir.clone().multiplyScalar(along)).length();
   if(perp<Math.tan(F.half)*along+.55){
    hp=Math.max(0,hp-F.dps*dt);hurt=.55;
    if(Math.random()<.09){sound(70,.08,'sawtooth',.03);flinchT=FLINCH_DUR*.6;}
    if(hp<=0)finish(false);
   }
  }
 }else{
  a.jet=undefined;
  const u=ease(Math.min(1,(a.t-F.wind-F.strike)/F.recover));
  vis.rotation.x=.1*(1-u);vis.position.y=.04*(1-u);
  if(a.t>=F.wind+F.strike+F.recover)endBossMove(e,3);
 }
}
/** Lumber toward the player, then pick a move that fits the current range. */
function updateBoss(e:Enemy,dt:number,diff:T.Vector3,dist:number){
 const vis=bossVisual(e);
 if(e.atk){
  e.atk.t+=dt;
  if(e.atk.move==='slam')bossSlam(e,e.atk,dt,diff);
  else if(e.atk.move==='swipe')bossSwipe(e,e.atk,dt,diff);
  else bossFire(e,e.atk,dt,diff);
  return;
 }
 turnToward(e,diff,2.4*dt);
 const settle=1-Math.exp(-9*dt);
 vis.rotation.y+=(0-vis.rotation.y)*settle;
 vis.scale.lerp(new T.Vector3(1,1,1),settle);
 if(dist>3.4&&dist<18){
  const step=diff.clone();step.y=0;step.normalize();
  moveBody(e.mesh,step.x*dt*2.6,step.z*dt*2.6);
  const before=e.step;e.step+=dt*2.6;
  vis.position.y=Math.abs(Math.sin(e.step))*.2;
  vis.rotation.x=-.05+Math.sin(e.step)*.05;
  vis.rotation.z=Math.sin(e.step*.5)*.06;
  // Dust on every footfall: a static sculpt still reads as heavy when the ground answers back.
  if(Math.floor(e.step/Math.PI)!==Math.floor(before/Math.PI)){
   dust(e.mesh.position.clone().add(step.clone().multiplyScalar(1.2)),5,'#8e8677',2.4,1.1,1.7);
   sound(46,.16,'sine',.035);shake=Math.max(shake,.05);
  }
 }else{
  vis.position.y+=(0-vis.position.y)*settle;
  vis.rotation.x+=(0-vis.rotation.x)*settle;
  vis.rotation.z+=(0-vis.rotation.z)*settle;
 }
 if(e.cool>0)return;
 const options:BossMove[]=[];
 if(dist<BOSS_MOVES.slam.radius*.95)options.push('slam','slam');
 if(dist<BOSS_MOVES.swipe.radius*.9)options.push('swipe','swipe');
 if(dist>2.6&&dist<BOSS_MOVES.fire.range*.82)options.push('fire');
 if(options.length)startBossMove(e,options[Math.floor(rand()*options.length)],diff);
}
const clock=new T.Clock();const look=new T.Vector3(),desired=new T.Vector3(),project=new T.Vector3();
function update(dt:number){if(hitstop>0){hitstop-=dt;dt=0;} time+=dt; if(playerMixer) playerMixer.update(dt);invulnerable=Math.max(0,invulnerable-dt);dodgeT=Math.max(0,dodgeT-dt);ultCd=Math.max(0,ultCd-dt);stamina=Math.min(100,stamina+dt*19);const forward=new T.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));const right=new T.Vector3(Math.cos(yaw),0,-Math.sin(yaw));velocity.set(0,0,0);if(keys.has('KeyW'))velocity.add(forward);if(keys.has('KeyS'))velocity.sub(forward);if(keys.has('KeyD'))velocity.add(right);if(keys.has('KeyA'))velocity.sub(right);velocity.normalize();if(velocity.lengthSq()>0&&attackT<=0)player.rotation.y=Math.atan2(velocity.x,velocity.z);if(dodgeT>0){velocity.set(Math.sin(player.rotation.y),0,Math.cos(player.rotation.y));}const speed=dodgeT>0?13:ultT>0?1.2:attackT>0?2.3:6;moveBody(player,velocity.x*speed*dt,velocity.z*speed*dt);vy-=22*dt;player.position.y+=vy*dt;const floor=floorAt(player.position.x,player.position.z,player.position.y-vy*dt);if(player.position.y<=floor&&vy<=0){player.position.y=floor;vy=0;grounded=true;}else grounded=false;
const moving=velocity.lengthSq()>0&&attackT<=0&&dodgeT<=0;
player.userData.movePose=T.MathUtils.damp(player.userData.movePose,moving?1:0,10,dt);
if(mixerActive){ const w=moving?1:0; locoActions.walk?.setEffectiveWeight(w); locoActions.idle?.setEffectiveWeight(1-w); }
// Touchdown: crouch recovery plus a puff of grit, so a jump ends on something physical.
if(grounded&&!wasGrounded&&airT>.12){landT=LAND_DUR;dust(player.position,6,'#9aa093',1.1,.75,1);sound(115,.12,'sine',.045);shake=Math.max(shake,.07);}
wasGrounded=grounded;airT=grounded?0:airT+dt;landT=Math.max(0,landT-dt);flinchT=Math.max(0,flinchT-dt);
player.userData.torso.rotation.z=dodgeT>0?-0.2:0;
if(ultT>0){
 ultT-=dt;
 const p=1-Math.max(ultT,0)/ULT_DUR;
 const facing=new T.Vector3(Math.sin(player.rotation.y),0,Math.cos(player.rotation.y));
 const origin=player.position.clone().add(new T.Vector3(0,1.25,0));
 if(p<.85){
  beam(origin,facing,7.5,'#ffe7a0',.12,.12);
  beam(origin,facing.clone().add(new T.Vector3(0,0.08,0)).normalize(),6.8,'#fff3c4',.1,.05);
  if(Math.random()<.4)sparks(origin.clone().add(facing.clone().multiplyScalar(2+rand()*4)),2,'#ffe29a');
 }
 // The moment the staff lands: golden shockwave down the strike line, flagstones splitting open.
 if(p>.42&&!ultBurst){
  ultBurst=true;
  const impact=player.position.clone().add(facing.clone().multiplyScalar(3.4));
  shockwave(player.position,8.6,'#ffce7c',.5,.42);
  groundFan(player.position,player.rotation.y,8.5,1.5,'#ffd98a',.45,false);
  cracks(impact,5.5,9,'#ffcf7a');
  dust(impact,10,'#b3a68c',2.4,1.3,2);
  // The strike lands where the boss stands, so this column stays dim — a bright one blows the
  // silhouette out to white and the player loses track of what they are hitting.
  pillar(impact,'#ffdf9e',1.1,5.4,.6,7);
  sound(58,.4,'sawtooth',.06);
  shake=Math.max(shake,.34);hitstop=.06;
 }
 swing.visible=true;swing.scale.setScalar(1.6);swing.position.copy(player.position).add(new T.Vector3(0,1.3,0));
 swing.rotation.z=player.rotation.y-p*Math.PI*2;(swing.material as T.MeshBasicMaterial).color.set('#ffdc96');
 (swing.material as T.MeshBasicMaterial).opacity=Math.sin(p*Math.PI)*.72;
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
 if(ultT<=0){swing.visible=false;hitSet.clear();ultBurst=false;}
}else if(attackT>0){
 attackT-=dt;
 const dur=ATTACK_DUR[combo];
 const p=1-Math.max(attackT,0)/dur;
 let target:Enemy|undefined;let near=4.6;
 for(const e of enemies){const dist=e.mesh.position.distanceTo(player.position);if(!e.dead&&dist<near){near=dist;target=e;}}
 if(target){const diff=target.mesh.position.clone().sub(player.position);player.rotation.y=Math.atan2(diff.x,diff.z);}
 // Three staff arts: sweep / lift / spinning slam. The body pose comes from the skeleton animation;
 // this block owns the arcs, the trails and the hit window.
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
}
for(const e of enemies){
 if(e.dead)continue;
 const diff=player.position.clone().sub(e.mesh.position),dist=Math.hypot(diff.x,diff.z);
 e.cool-=dt;
 if(e.boss){updateBoss(e,dt,diff,dist);
 }else{
 e.mesh.rotation.y=Math.atan2(diff.x,diff.z);
 if(e.wind>0){
  e.wind-=dt;e.mesh.userData.pivot.rotation.x=-.25+e.wind*.6;
  if(e.wind<=0&&dist<2.3&&Math.abs(diff.y)<2.8&&invulnerable<=0){
   sound(60,.28,'sawtooth',.06);hurtPlayer(11,'#c94b30');
  }
 }else if(dist<1.8&&Math.abs(diff.y)<2.8&&e.cool<=0){
  e.wind=.65; e.cool=1.9; e.pattern++;
  ring(e.mesh.position,'#e85a35',2.1,.3);
 }else if(dist<10&&dist>1.8){
  diff.y=0;diff.normalize();moveBody(e.mesh,diff.x*dt*2.7,diff.z*dt*2.7);
  const vis=e.mesh.userData.visual as T.Group|undefined;
  if(vis){vis.position.y=Math.sin(time*6)*.08;vis.rotation.z=Math.sin(time*4)*.05;}
  e.mesh.userData.legs.forEach((leg:T.Object3D,i:number)=>leg.rotation.x=Math.sin(time*9+i*Math.PI)*.4);
  e.mesh.userData.pivot.rotation.x=0;
 }else{
  e.mesh.userData.legs.forEach((leg:T.Object3D)=>leg.rotation.x=0);
  const vis=e.mesh.userData.visual as T.Group|undefined;
  if(vis&&e.wind<=0&&e.fireT<=0){vis.position.y=0;vis.rotation.z=0;vis.rotation.x=0;}
 }
 }
 for(const other of enemies){if(other===e||other.dead)continue;const separation=e.mesh.position.clone().sub(other.mesh.position);separation.y=0;const d=separation.length();if(d>0&&d<.9){separation.normalize();moveBody(e.mesh,separation.x*dt,separation.z*dt);}}
}
for(let i=drops.length-1;i>=0;i--){const d=drops[i];d.position.y=.65+Math.sin(time*3)*.16;if(d.position.distanceTo(player.position)<1.7){hp=Math.min(100,hp+18);scene.remove(d);drops.splice(i,1);sound(620,.25);notice('灵息入体 · 生命 +18');}}
animatePlayer(dt);
}
// One place decides what the warrior's body is doing, from the gameplay state the rest of update()
// already settled. Without a rig the model keeps the verified standing bind and only bobs.
function animatePlayer(dt:number){
 const vis=player.userData.visual as T.Group;
 if(!playerRig){vis.position.y=dodgeT>0?.18:0;vis.rotation.set(0,0,dodgeT>0?-.35:0);return;}
 rootMotion=animateWarrior(playerRig,{
  dt,time,
  speed:player.userData.movePose,
  grounded,vy,air:airT,land:landT,
  attack:attackT>0?combo:-1,
  attackP:attackT>0?1-attackT/ATTACK_DUR[combo]:-1,
  ultP:ultT>0?1-ultT/ULT_DUR:-1,
  dodgeP:dodgeT>0?1-dodgeT/DODGE_DUR:-1,
  flinch:flinchT,
 });
 vis.position.y=rootMotion.bob;
 vis.rotation.set(rootMotion.pitch,rootMotion.spin,rootMotion.roll);
 // Grit under the boots on every footfall of the run cycle.
 const phase=Math.floor(playerRig.stride/Math.PI);
 if(grounded&&player.userData.movePose>.55&&phase!==footPhase){footPhase=phase;dust(player.position,2,'#9d968a',.7,.45,.55);}
 else if(phase!==footPhase)footPhase=phase;
}
// Effects age with the simulation, not with the render loop, so a stepped test sees the same
// number of live effects a player would.
function updateEffects(dt:number){for(let i=effects.length-1;i>=0;i--){const e=effects[i];const age=1-Math.max(e.life,0)/e.max;
 if(running){e.life-=dt;if(e.vx||e.vy||e.vz){e.mesh.position.x+=(e.vx||0)*dt;e.mesh.position.y+=(e.vy||0)*dt;e.mesh.position.z+=(e.vz||0)*dt;if(e.vy!==undefined)e.vy-=6*dt;}if(e.grow)e.mesh.scale.setScalar(1+age*e.grow);e.tick?.(e,age,dt);}
 if(!e.ownAlpha)fxAlpha(e.mesh,Math.max(0,e.life/e.max));
 if(e.life<=0){e.mesh.removeFromParent();fxDispose(e.mesh);effects.splice(i,1);}}}
function frame(){requestAnimationFrame(frame);const dt=Math.min(clock.getDelta(),.033);if(running)update(dt);updateEffects(dt);
const t=performance.now()/1000;banners.forEach((b,i)=>{b.rotation.x=Math.sin(t*1.5+i)*.045;b.rotation.z=Math.sin(t+i)*.025;});flames.forEach((f,i)=>(f.material as T.MeshStandardMaterial).emissiveIntensity=1.8+Math.sin(t*5+i)*.25);
shake=Math.max(0,shake-dt*1.8); look.copy(player.position).add(new T.Vector3(0,1.3,0));desired.copy(look).add(new T.Vector3(Math.sin(yaw)*7.2,1.55+pitch*3.7,Math.cos(yaw)*7.2));desired.x=T.MathUtils.clamp(desired.x,-22,22);desired.z=T.MathUtils.clamp(desired.z,-22,24);camera.position.lerp(desired,1-Math.exp(-dt*8)); if(shake>0) camera.position.add(new T.Vector3((Math.random()-.5)*shake,(Math.random()-.5)*shake*.6,(Math.random()-.5)*shake)); camera.lookAt(look);
for(const e of enemies){project.copy(e.mesh.position);project.y+=e.boss?5.2:2.8;project.project(camera);e.label.style.display=started&&!e.dead&&project.z<1&&project.z>0?'block':'none';e.label.style.left=`${(project.x*.5+.5)*innerWidth}px`;e.label.style.top=`${(-project.y*.5+.5)*innerHeight}px`;e.label.querySelector('i')!.setAttribute('style',`width:${Math.max(0,e.hp/e.max*100)}%`);}
el('hp').style.width=`${hp}%`;if(el('hpText')) el('hpText')!.textContent=`${Math.ceil(hp)} / 100`;el('stamina').style.width=`${stamina}%`;if(el('count')) el('count')!.textContent=String(kills);if(el('ult')) el('ult')!.textContent=ultCd>0?`K 定海神针 · ${ultCd.toFixed(1)}s`:'K 定海神针 · 就绪';hurt=Math.max(0,hurt-dt);el('hurt').style.opacity=String(hurt*.7);if(running)noticeT=Math.max(0,noticeT-dt);el('notice').style.opacity=noticeT>0?'1':'0';renderer.render(scene,camera);}
camera.position.set(0,5.7,20);frame();window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
// Measured standing pose, so stance regressions (floating or side-folded legs) are testable.
function stanceReport(){
 const legs=(player.userData.legBones??[]) as Leg[];
 const arms=(player.userData.armBones??[]) as T.Object3D[];
 const orient=player.userData.orient as T.Group;
 refreshMatrices(orient);
 const box=new T.Box3();
 try{box.setFromObject(orient,true);}catch{box.setFromObject(orient);}
 const at=(o:T.Object3D)=>o.getWorldPosition(new T.Vector3());
 const boneNames:string[]=[];
 orient.traverse(o=>{if(!(o as T.Mesh).isMesh&&o.name)boneNames.push(o.name);});
 return {
  floorY:player.position.y,
  bodyMinY:box.min.y,bodyMaxY:box.max.y,
  boneNames,
  legs:legs.map(leg=>{
   const hip=at(leg.hip),ankle=at(leg.ankle),toe=at(leg.toe);
   const down=ankle.clone().sub(hip).normalize();
   return {
    names:[leg.hip.name,leg.knee.name,leg.ankle.name,leg.toe.name],
    hipY:hip.y,kneeY:at(leg.knee).y,ankleY:ankle.y,toeY:toe.y,
    // 1 means the thigh+shin line points straight at the floor, 0 means the leg sticks sideways.
    uprightness:-down.y,
   };
  }),
  arms:arms.map(shoulder=>{
   const tip=chainTip(shoulder);
   const dir=at(tip).sub(at(shoulder)).normalize();
   // 0 means a dead horizontal T-pose, 1 means the arm hangs straight down.
   return {names:[shoulder.name,tip.name],drop:-dir.y};
  }),
 };
}
// Live animation snapshot: limb positions in the player's own frame (+Z is where he faces), so a
// test can prove the body actually moves instead of standing in a bind pose.
function poseReport(){
 if(!playerRig)return null;
 player.updateMatrixWorld(true);
 playerRig.orient.updateMatrixWorld(true);
 const local=(o:T.Object3D)=>player.worldToLocal(o.getWorldPosition(new T.Vector3()));
 const pick=(v:T.Vector3)=>({x:+v.x.toFixed(4),y:+v.y.toFixed(4),z:+v.z.toFixed(4)});
 return {
  ...playerRig.report(),
  time,speed:player.userData.movePose as number,
  root:{...rootMotion},
  hands:playerRig.arms.map(a=>({side:a.side,...pick(local(a.hand.bone))})),
  toes:playerRig.legs.map(l=>({side:l.side,...pick(local(l.toe.bone))})),
  head:playerRig.head?pick(local(playerRig.head.bone)):null,
 };
}
// Boss attack state plus the numbers the hitboxes use, so a test can check they match the visuals.
function bossReport(){
 const e=enemies.find(x=>x.boss);
 if(!e)return null;
 const mouth=e.mesh.userData.mouth as T.Object3D|undefined;
 e.mesh.updateMatrixWorld(true);
 return {
  move:e.atk?.move??null,t:e.atk?.t??0,struck:e.atk?.hit??false,cool:+e.cool.toFixed(3),
  yaw:e.mesh.rotation.y,position:e.mesh.position.toArray(),
  // 巨掌砸地: the impact point, the radius shared by the ring and the damage check, and where the
  // ring actually sits. A test can compare the last two to prove the telegraph tracks the turn.
  // `warned` (ring on the ground) and `dangerous` (hitbox accepting hits) are the two windows the
  // move has to keep aligned, so a test can assert dangerous ⊆ warned frame by frame.
  slam:e.atk?.move==='slam'?{
   center:e.atk.center.toArray(),radius:BOSS_MOVES.slam.radius,
   tele:e.atk.tele?{position:e.atk.tele.position.toArray(),live:!!e.atk.tele.parent}:null,
   warned:!!e.atk.tele?.parent,dealt:!!e.atk.dealt,
   dangerous:e.atk.t>=BOSS_MOVES.slam.wind+BOSS_MOVES.slam.strike
    &&e.atk.t<BOSS_MOVES.slam.wind+BOSS_MOVES.slam.strike+BOSS_MOVES.slam.active,
  }:null,
  mouth:mouth?mouth.getWorldPosition(new T.Vector3()).toArray():null,
  jet:e.atk?.jet?{origin:e.atk.jet.group.position.toArray(),dir:e.atk.dir.toArray()}:null,
  moves:BOSS_MOVES,
 };
}
// Read-only snapshot for browser smoke tests and diagnostics.
// `stance` stays a function: measuring it walks every skinned vertex, too slow to sample per frame.
Object.defineProperty(window,'__trial',{get:()=>({running,artReady,hp,kills,grounded,yaw,attack:attackT>0?combo:-1,player:player.position.toArray(),stance:stanceReport,pose:poseReport,boss:bossReport,
 // Test hook: skip the cooldown roll so a smoke test can watch one specific move.
 // Supersede any move already in flight through endBossMove, so its telegraph is retired rather
 // than left orphaned on the ground with nothing driving it.
 forceBossMove:(move:BossMove)=>{const e=enemies.find(x=>x.boss);if(!e||e.dead||!running)return false;if(e.atk)endBossMove(e,0);e.cool=0;startBossMove(e,move,player.position.clone().sub(e.mesh.position));return true;},
 // Test hook: advance the simulation without waiting on the renderer. Software-rendered CI draws
 // roughly one frame a second, far too coarse to sample an animation cycle from wall-clock time.
 step:(steps=1,dt=1/60)=>{const d=Math.min(dt,.033);for(let i=0;i<steps&&running;i++){update(d);updateEffects(d);}return time;},
 enemies:enemies.map(e=>({hp:e.hp,dead:e.dead,position:e.mesh.position.toArray()}))})});
