import * as T from 'three';

// Procedural skeleton animation for the Tripo/Mixamo-spec skinned monkey warrior.
//
// Poses are authored in *rig space*: the `TripoOrient` frame the player model lives in, where +X is
// the nose, +Y is up and +Z is the character's right. A rotation authored around one of those axes
// is converted into the bone's own local frame, so the same pose code works no matter how the
// exporter named or oriented an individual joint.
//
// The rest pose is captured *after* the standing bind fixes run, so a zero pose is exactly the
// verified stance from the stand-pose fix and the idle animation never touches the leg chain.

const DEG = Math.PI / 180;
const RIG_X = new T.Vector3(1, 0, 0); // nose / sagittal axis
const RIG_Y = new T.Vector3(0, 1, 0); // up / twist axis
const RIG_Z = new T.Vector3(0, 0, 1); // right / swing axis
const _q = new T.Quaternion(), _d = new T.Quaternion(), _p = new T.Vector3();

export type Joint = {
  bone: T.Object3D,
  /** Local quaternion of the verified standing bind. */
  rest: T.Quaternion,
  /** Rest orientation in rig space, and its inverse, for converting authored rotations. */
  restWorld: T.Quaternion,
  invRestWorld: T.Quaternion,
  /** Authored pose for this frame, and the damped pose actually applied. */
  target: T.Quaternion,
  live: T.Quaternion,
};
export type LegChain = { hip: T.Object3D, knee: T.Object3D, ankle: T.Object3D, toe: T.Object3D };
type Leg = { hip: Joint, knee: Joint, ankle: Joint, toe: Joint, side: number };
type Arm = { clavicle: Joint, upper: Joint, fore: Joint, hand: Joint, side: number };

/** Offsets applied to the whole visual group, on top of the skeleton pose. */
export type RootMotion = { bob: number, pitch: number, roll: number, spin: number };

export type AnimInput = {
  dt: number,
  time: number,
  /** 0 = standing still, 1 = full run. */
  speed: number,
  grounded: boolean,
  vy: number,
  /** Seconds since leaving the ground, and seconds left of the landing crouch. */
  air: number,
  land: number,
  /** Active combo index, or -1. `attackP` runs 0..1 across the swing. */
  attack: number,
  attackP: number,
  /** 0..1 across the ultimate, or -1. */
  ultP: number,
  /** 0..1 across the dodge, or -1. */
  dodgeP: number,
  /** Seconds left of the hit flinch. */
  flinch: number,
};

/** Smooth-stepped keyframe track: `[phase, value]` pairs, sampled at `t`. */
export function curve(t: number, keys: [number, number][]): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      const u = (t - t0) / Math.max(t1 - t0, 1e-6);
      return v0 + (v1 - v0) * u * u * (3 - 2 * u);
    }
  }
  return keys[keys.length - 1][1];
}
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export class WarriorRig {
  readonly orient: T.Group;
  readonly joints: Joint[] = [];
  pelvis?: Joint; spine?: Joint; chest?: Joint; head?: Joint;
  readonly legs: Leg[] = [];
  readonly arms: Arm[] = [];
  /** Run cycle phase, advanced by the animation itself so cadence follows speed. */
  stride = 0;
  /** Set while a pose has been applied at least once — smoke tests read it. */
  posed = false;

  constructor(orient: T.Group, legChains: LegChain[], armRoots: T.Object3D[]) {
    this.orient = orient;
    orient.updateMatrixWorld(true);
    const orientWorld = new T.Quaternion();
    orient.getWorldQuaternion(orientWorld);
    const invOrient = orientWorld.clone().invert();

    const joint = (bone: T.Object3D): Joint => {
      const world = new T.Quaternion();
      bone.getWorldQuaternion(world);
      const restWorld = invOrient.clone().multiply(world);
      const j: Joint = {
        bone,
        rest: bone.quaternion.clone(),
        restWorld,
        invRestWorld: restWorld.clone().invert(),
        target: new T.Quaternion(),
        live: new T.Quaternion(),
      };
      this.joints.push(j);
      return j;
    };
    // +Z is the character's right, so a bone's rig-space Z tells us which side it belongs to.
    const sideOf = (bone: T.Object3D) => {
      bone.getWorldPosition(_p);
      orient.worldToLocal(_p);
      return _p.z >= 0 ? 1 : -1;
    };

    for (const chain of legChains) {
      this.legs.push({
        hip: joint(chain.hip), knee: joint(chain.knee),
        ankle: joint(chain.ankle), toe: joint(chain.toe),
        side: sideOf(chain.hip),
      });
    }
    // Arms hang off the same bone as the head; that bone is the chest, and walking up from it
    // gives spine and pelvis whatever the exporter called them.
    const chest = armRoots[0]?.parent;
    if (chest) {
      this.chest = joint(chest);
      const spine = chest.parent;
      // The leg chains share the skeleton root, so never mistake the root for the pelvis.
      const rootBone = legChains[0]?.hip.parent;
      if (spine && spine !== rootBone && spine.parent) {
        this.spine = joint(spine);
        const pelvis = spine.parent;
        if (pelvis && pelvis !== rootBone) this.pelvis = joint(pelvis);
      }
      const headBone = chest.children.find(c => /^head(_|$)/.test((c.name || '').replace(/^tripo(::|_)?/i, '').toLowerCase()));
      if (headBone) this.head = joint(headBone);
    }
    for (const root of armRoots) {
      const chainBones: T.Object3D[] = [root];
      while (chainBones[chainBones.length - 1].children.length) {
        chainBones.push(chainBones[chainBones.length - 1].children[0]);
      }
      const pick = (i: number) => chainBones[Math.min(i, chainBones.length - 1)];
      this.arms.push({
        clavicle: joint(pick(0)), upper: joint(pick(1)),
        fore: joint(pick(2)), hand: joint(pick(3)),
        side: sideOf(root),
      });
    }
    this.arms.sort((a, b) => a.side - b.side);
    this.legs.sort((a, b) => a.side - b.side);
  }

  arm(side: number) { return this.arms.find(a => a.side === side) ?? this.arms[0]; }
  leg(side: number) { return this.legs.find(l => l.side === side) ?? this.legs[0]; }

  /** Clear this frame's authored pose. */
  begin() { for (const j of this.joints) j.target.identity(); }

  /** Rotate `j` by `deg` around a rig-space axis, on top of anything authored earlier this frame. */
  rot(j: Joint | undefined, axis: T.Vector3, deg: number) {
    if (!j || !deg) return;
    j.target.premultiply(_q.setFromAxisAngle(axis, deg * DEG));
  }
  /** Sagittal swing for a limb that hangs down: positive drives the tip forward. */
  swing(j: Joint | undefined, deg: number) { this.rot(j, RIG_Z, deg); }
  /** Sagittal swing for a bone that points up (spine, head): positive tips it forward / down. */
  lean(j: Joint | undefined, deg: number) { this.rot(j, RIG_Z, -deg); }
  /** Twist around the body axis: positive turns to the character's left. */
  twist(j: Joint | undefined, deg: number) { this.rot(j, RIG_Y, deg); }
  /** Sideways: positive lowers a right-side limb / raises a left-side one. */
  splay(j: Joint | undefined, deg: number) { this.rot(j, RIG_X, deg); }

  /**
   * Push the authored pose onto the skeleton. `stiffness` damps toward it so state changes blend
   * instead of popping: low for idle drift, high for the snap of a strike.
   */
  commit(dt: number, stiffness: number) {
    const k = 1 - Math.exp(-stiffness * Math.max(dt, 0));
    for (const j of this.joints) {
      j.live.slerp(j.target, k);
      // delta_local = restWorld⁻¹ · pose · restWorld keeps the authored axes rig-space while the
      // bone itself stays in its parent's frame, so children inherit the rotation for free.
      _d.copy(j.invRestWorld).multiply(j.live).multiply(j.restWorld);
      j.bone.quaternion.copy(j.rest).multiply(_d);
    }
    this.orient.updateMatrixWorld(true);
    this.posed = true;
  }

  /** Diagnostics for the combat smoke test: how far each limb is from the bind pose, in degrees. */
  report() {
    const deg = (q: T.Quaternion) => 2 * Math.acos(Math.min(1, Math.abs(q.w))) / DEG;
    const named = (label: string, j?: Joint) => ({ part: label, bone: j?.bone.name ?? '', deg: j ? deg(j.live) : 0 });
    return {
      stride: this.stride,
      joints: [
        named('pelvis', this.pelvis), named('spine', this.spine), named('chest', this.chest), named('head', this.head),
        ...this.legs.flatMap(l => [named(`hip${l.side > 0 ? 'R' : 'L'}`, l.hip), named(`knee${l.side > 0 ? 'R' : 'L'}`, l.knee)]),
        ...this.arms.flatMap(a => [named(`arm${a.side > 0 ? 'R' : 'L'}`, a.upper), named(`elbow${a.side > 0 ? 'R' : 'L'}`, a.fore)]),
      ],
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Pose layers. Each one authors rotations for a weight `w`, so they mix rather than fight.
// ---------------------------------------------------------------------------------------------

/** Combat idle: weight forward, shoulders loose, lead hand up. Legs stay on the verified bind. */
function poseIdle(rig: WarriorRig, a: AnimInput, w: number) {
  if (w <= 0.001) return 0;
  const breath = Math.sin(a.time * 1.7), sway = Math.sin(a.time * 0.83);
  rig.lean(rig.pelvis, 3 * w);
  rig.splay(rig.pelvis, sway * 1.6 * w);
  rig.lean(rig.spine, (4 + breath * 1.4) * w);
  rig.lean(rig.chest, (1 - breath * 1.8) * w);
  rig.twist(rig.chest, sway * 2.4 * w);
  rig.lean(rig.head, (-7 - breath) * w); // chin up: the boss towers over the player
  rig.twist(rig.head, sway * 3 * w);
  for (const arm of rig.arms) {
    // The lead (left) hand rides higher in a guard; the rear hand hangs looser.
    const lead = arm.side < 0;
    rig.splay(arm.clavicle, arm.side * 7 * w);
    rig.splay(arm.upper, arm.side * (lead ? 24 : 21) * w);
    rig.swing(arm.upper, (lead ? 16 : 6) * w + breath * 1.5 * w);
    rig.twist(arm.upper, arm.side * 10 * w);
    rig.swing(arm.fore, (lead ? 62 : 40) * w + breath * 3 * w);
    rig.swing(arm.hand, (lead ? -8 : -4) * w);
  }
  return 0;
}

/** Run cycle: alternating stride, counter-rotating shoulders, forward lean, vertical bob. */
function poseRun(rig: WarriorRig, a: AnimInput, w: number): number {
  if (w <= 0.001) return 0;
  rig.stride += a.dt * (5.2 + 3.4 * a.speed);
  const p = rig.stride;
  rig.lean(rig.pelvis, 11 * w);
  rig.twist(rig.pelvis, Math.sin(p) * 7 * w);
  rig.lean(rig.spine, 6 * w);
  rig.twist(rig.spine, -Math.sin(p) * 5 * w);
  rig.twist(rig.chest, -Math.sin(p) * 7 * w);
  rig.lean(rig.chest, 3 * w);
  rig.lean(rig.head, -9 * w);
  for (const leg of rig.legs) {
    const ph = p + (leg.side > 0 ? Math.PI : 0);
    const swing = Math.sin(ph);
    // Knee folds hardest just after the foot leaves the ground.
    const fold = Math.max(0, -Math.sin(ph - 0.7));
    rig.swing(leg.hip, (25 * swing - 4) * w);
    rig.swing(leg.knee, -(12 + 58 * fold) * w);
    rig.swing(leg.ankle, (10 - 16 * swing) * w);
    rig.splay(leg.hip, -leg.side * 3 * w);
  }
  for (const arm of rig.arms) {
    const ph = p + (arm.side > 0 ? 0 : Math.PI); // arms oppose the same-side leg
    rig.splay(arm.clavicle, arm.side * 6 * w);
    rig.splay(arm.upper, arm.side * 26 * w);
    rig.swing(arm.upper, (12 + 34 * Math.sin(ph)) * w);
    rig.twist(arm.upper, arm.side * 12 * w);
    rig.swing(arm.fore, (58 + 26 * Math.max(0, Math.sin(ph))) * w);
  }
  // Two bobs per stride, plus a small crouch so the run reads heavier than a walk.
  return (-0.055 - 0.035 * Math.cos(p * 2)) * w;
}

/** Jump: tuck on the way up, split at the apex, reach for the ground on the way down. */
function poseAir(rig: WarriorRig, a: AnimInput, w: number): number {
  if (w <= 0.001) return 0;
  const rise = clamp01(a.vy / 6), fall = clamp01(-a.vy / 8);
  rig.lean(rig.pelvis, (6 + 10 * fall) * w);
  rig.lean(rig.spine, (-8 * rise + 6 * fall) * w);
  rig.lean(rig.chest, (-10 * rise + 4 * fall) * w);
  rig.lean(rig.head, (-14 * rise - 4) * w);
  for (const leg of rig.legs) {
    const lead = leg.side < 0 ? 1 : -1; // left leg tucks first, right trails
    rig.swing(leg.hip, (rise * (26 + lead * 16) - fall * (8 - lead * 10)) * w);
    rig.swing(leg.knee, -(rise * (62 + lead * 12) + 18 + fall * 10) * w);
    rig.swing(leg.ankle, (18 * rise - 10 * fall) * w);
    rig.splay(leg.hip, -leg.side * (5 + 7 * rise) * w);
  }
  for (const arm of rig.arms) {
    rig.splay(arm.clavicle, arm.side * (10 + 16 * rise) * w);
    rig.splay(arm.upper, arm.side * (18 + 22 * rise) * w);
    rig.swing(arm.upper, (28 + 74 * rise - 20 * fall) * w);
    rig.swing(arm.fore, (50 - 26 * rise + 18 * fall) * w);
  }
  return 0.02 * rise * w;
}

/** Landing crouch: absorbs the drop, then springs back to idle. `land01` is 0 at touchdown. */
function poseLand(rig: WarriorRig, land01: number, w: number): number {
  if (w <= 0.001) return 0;
  const u = clamp01(1 - land01);
  const dip = u * u * (3 - 2 * u);
  rig.lean(rig.pelvis, 16 * dip * w);
  rig.lean(rig.spine, 8 * dip * w);
  rig.lean(rig.head, -10 * dip * w);
  for (const leg of rig.legs) {
    rig.swing(leg.hip, 16 * dip * w);
    rig.swing(leg.knee, -42 * dip * w);
    rig.swing(leg.ankle, 20 * dip * w);
    rig.splay(leg.hip, -leg.side * 6 * dip * w);
  }
  for (const arm of rig.arms) {
    rig.splay(arm.upper, arm.side * 28 * dip * w);
    rig.swing(arm.upper, -18 * dip * w);
    rig.swing(arm.fore, 74 * dip * w);
  }
  return -0.18 * dip * w;
}

/**
 * Three staff arts, all built the same way: anticipation (wind the body against the swing),
 * an accelerating strike, then follow-through. `combo` picks which one.
 *   0 横扫破风 — right-hand horizontal sweep
 *   1 挑棍穿云 — left-hand rising strike
 *   2 旋砸定山 — spinning two-handed slam
 */
function poseAttack(rig: WarriorRig, combo: number, p: number, w: number, out: RootMotion) {
  if (w <= 0.001) return;
  const lead = combo === 1 ? -1 : 1; // which hand drives the blow
  const off = -lead;
  const drive = curve(p, [[0, -1], [0.26, -1], [0.46, 1], [0.7, 0.85], [1, 0.15]]); // -1 wound, +1 extended
  const push = clamp01(drive);

  if (combo === 0) {
    rig.twist(rig.pelvis, -lead * 16 * drive * w);
    rig.twist(rig.spine, -lead * 20 * drive * w);
    rig.twist(rig.chest, -lead * 26 * drive * w);
    rig.lean(rig.chest, curve(p, [[0, 0], [0.26, -8], [0.5, 12], [1, 3]]) * w);
    out.pitch += curve(p, [[0, 0], [0.26, -0.06], [0.5, 0.16], [1, 0.02]]) * w;
  } else if (combo === 1) {
    rig.twist(rig.pelvis, -lead * 12 * drive * w);
    rig.twist(rig.chest, -lead * 18 * drive * w);
    rig.lean(rig.spine, curve(p, [[0, 0], [0.26, 14], [0.52, -18], [1, 0]]) * w);
    rig.lean(rig.chest, curve(p, [[0, 0], [0.26, 10], [0.52, -22], [1, 2]]) * w);
    out.bob += curve(p, [[0, 0], [0.26, -0.12], [0.55, 0.14], [0.8, 0], [1, 0]]) * w;
    out.pitch += curve(p, [[0, 0], [0.3, 0.1], [0.55, -0.14], [1, 0]]) * w;
  } else {
    out.spin += curve(p, [[0, 0], [0.22, -0.5], [0.72, Math.PI * 2 - 0.2], [1, Math.PI * 2]]) * w;
    rig.lean(rig.spine, curve(p, [[0, 0], [0.3, -12], [0.6, 26], [1, 6]]) * w);
    rig.lean(rig.chest, curve(p, [[0, 0], [0.3, -10], [0.6, 22], [1, 4]]) * w);
    out.bob += curve(p, [[0, 0], [0.3, 0.08], [0.62, -0.14], [1, 0]]) * w;
    out.pitch += curve(p, [[0, 0], [0.3, -0.1], [0.62, 0.26], [1, 0.03]]) * w;
  }
  rig.lean(rig.head, (combo === 2 ? 6 * push : -6 - 4 * push) * w);

  for (const arm of rig.arms) {
    const isLead = arm.side === lead;
    rig.splay(arm.clavicle, arm.side * (8 + 10 * push) * w);
    if (combo === 0) {
      // Sweep: the driving arm whips across the body, elbow snapping open at contact.
      rig.splay(arm.upper, arm.side * (isLead ? 42 - 30 * push : 26) * w);
      rig.swing(arm.upper, (isLead ? curve(p, [[0, -30], [0.26, -46], [0.5, 92], [0.75, 74], [1, 20]])
        : curve(p, [[0, 20], [0.3, 54], [0.55, -14], [1, 12]])) * w);
      rig.twist(arm.upper, arm.side * (isLead ? -18 * drive : 14) * w);
      rig.swing(arm.fore, (isLead ? curve(p, [[0, 96], [0.26, 108], [0.5, 16], [0.8, 40], [1, 58]])
        : curve(p, [[0, 60], [0.3, 30], [0.6, 84], [1, 62]])) * w);
    } else if (combo === 1) {
      // Rising strike: driving arm comes from the hip up past the head.
      rig.splay(arm.upper, arm.side * (isLead ? 20 - 16 * push : 24) * w);
      rig.swing(arm.upper, (isLead ? curve(p, [[0, -20], [0.28, -52], [0.55, 136], [0.78, 118], [1, 26]])
        : curve(p, [[0, 16], [0.3, 40], [0.6, -20], [1, 10]])) * w);
      rig.swing(arm.fore, (isLead ? curve(p, [[0, 92], [0.28, 116], [0.55, 22], [0.8, 46], [1, 60]])
        : curve(p, [[0, 58], [0.3, 26], [0.6, 90], [1, 62]])) * w);
    } else {
      // Slam: both hands overhead, then down together.
      rig.splay(arm.upper, arm.side * (14 + 8 * (1 - push)) * w);
      rig.swing(arm.upper, curve(p, [[0, 30], [0.3, 152], [0.64, -26], [0.85, 6], [1, 16]]) * w);
      rig.twist(arm.upper, arm.side * 10 * w);
      rig.swing(arm.fore, curve(p, [[0, 60], [0.3, 26], [0.64, 12], [1, 56]]) * w);
    }
    rig.swing(arm.hand, (isLead ? -14 * push : -6) * w);
  }
  // Legs: step into the blow with the front foot, brace with the back one.
  for (const leg of rig.legs) {
    const front = leg.side === off ? 1 : -1;
    rig.swing(leg.hip, (front * (10 + 16 * push) + (combo === 2 ? -6 * push : 0)) * w);
    rig.swing(leg.knee, -(10 + 26 * push + (front > 0 ? 8 : 0)) * w);
    rig.swing(leg.ankle, (8 + 10 * push) * w);
    rig.splay(leg.hip, -leg.side * (5 + 6 * push) * w);
    rig.twist(leg.hip, -lead * 8 * drive * w);
  }
}

/** 定海神针: gather, spin the staff up, then drive it forward with the whole body behind it. */
function poseUltimate(rig: WarriorRig, p: number, w: number, out: RootMotion) {
  if (w <= 0.001) return;
  const gather = curve(p, [[0, 0], [0.22, 1], [0.42, 0.2], [1, 0]]);
  const thrust = curve(p, [[0, 0], [0.34, 0], [0.52, 1], [0.78, 0.9], [1, 0.2]]);
  out.spin += curve(p, [[0, 0], [0.2, 0], [0.5, Math.PI * 2], [1, Math.PI * 2]]) * w;
  out.bob += (-0.16 * gather + 0.05 * thrust) * w;
  out.pitch += (-0.12 * gather + 0.3 * thrust) * w;
  rig.lean(rig.pelvis, (14 * gather + 10 * thrust) * w);
  rig.lean(rig.spine, (-14 * gather + 16 * thrust) * w);
  rig.lean(rig.chest, (-18 * gather + 14 * thrust) * w);
  rig.lean(rig.head, (-18 * gather - 6 * thrust) * w);
  for (const arm of rig.arms) {
    rig.splay(arm.clavicle, arm.side * (10 + 12 * thrust) * w);
    rig.splay(arm.upper, arm.side * (16 + 10 * gather - 8 * thrust) * w);
    rig.swing(arm.upper, (20 + 140 * gather + 72 * thrust) * w);
    rig.twist(arm.upper, arm.side * (14 - 10 * thrust) * w);
    rig.swing(arm.fore, (58 - 34 * gather - 44 * thrust) * w);
    rig.swing(arm.hand, -10 * thrust * w);
  }
  for (const leg of rig.legs) {
    const front = leg.side < 0 ? 1 : -1;
    rig.swing(leg.hip, (front * (12 + 30 * thrust) - 4 * gather) * w);
    rig.swing(leg.knee, -(14 + 34 * gather + (front > 0 ? 22 : 6) * thrust) * w);
    rig.swing(leg.ankle, (10 + 16 * gather) * w);
    rig.splay(leg.hip, -leg.side * (6 + 8 * thrust) * w);
  }
}

/** Dodge: low, tucked side-dash with the shoulder leading. */
function poseDodge(rig: WarriorRig, p: number, w: number, out: RootMotion) {
  if (w <= 0.001) return;
  const tuck = Math.sin(clamp01(p) * Math.PI);
  out.bob += -0.2 * tuck * w;
  out.pitch += 0.34 * tuck * w;
  out.roll += -0.26 * tuck * w;
  rig.lean(rig.pelvis, 26 * tuck * w);
  rig.lean(rig.spine, 18 * tuck * w);
  rig.lean(rig.chest, 14 * tuck * w);
  rig.lean(rig.head, -8 * tuck * w);
  for (const leg of rig.legs) {
    const front = leg.side < 0 ? 1 : -1;
    rig.swing(leg.hip, front * 34 * tuck * w);
    rig.swing(leg.knee, -(46 + front * 18) * tuck * w);
    rig.swing(leg.ankle, 22 * tuck * w);
  }
  for (const arm of rig.arms) {
    rig.splay(arm.upper, arm.side * 34 * tuck * w);
    rig.swing(arm.upper, 26 * tuck * w);
    rig.swing(arm.fore, 96 * tuck * w);
  }
}

/** Hit flinch: a short recoil that layers on top of whatever else is playing. */
function poseFlinch(rig: WarriorRig, w: number, out: RootMotion) {
  if (w <= 0.001) return;
  out.pitch += -0.12 * w;
  rig.lean(rig.spine, -16 * w);
  rig.lean(rig.chest, -14 * w);
  rig.lean(rig.head, -14 * w);
  for (const arm of rig.arms) {
    rig.splay(arm.upper, arm.side * 30 * w);
    rig.swing(arm.upper, -12 * w);
    rig.swing(arm.fore, 70 * w);
  }
}

/**
 * Author one frame of animation and push it onto the skeleton.
 * Returns the root motion the caller applies to the visual group.
 */
export function animateWarrior(rig: WarriorRig, a: AnimInput): RootMotion {
  const out: RootMotion = { bob: 0, pitch: 0, roll: 0, spin: 0 };
  rig.begin();

  const wDodge = a.dodgeP >= 0 ? 1 : 0;
  const wUlt = a.ultP >= 0 ? 1 : 0;
  const wAtk = a.attack >= 0 ? 1 : 0;
  const wAction = Math.max(wDodge, wUlt, wAtk);
  const wLand = a.land > 0 && a.grounded ? (1 - wAction) : 0;
  const wAir = !a.grounded ? (1 - wAction) : 0;
  const wLoco = Math.max(0, 1 - wAction - wAir - wLand);

  out.bob += poseIdle(rig, a, wLoco * (1 - a.speed));
  out.bob += poseRun(rig, a, wLoco * a.speed);
  out.bob += poseAir(rig, a, wAir);
  out.bob += poseLand(rig, 1 - a.land / 0.24, wLand);
  if (wAtk) poseAttack(rig, a.attack, a.attackP, wAtk, out);
  if (wUlt) poseUltimate(rig, a.ultP, wUlt, out);
  if (wDodge) poseDodge(rig, a.dodgeP, wDodge, out);
  poseFlinch(rig, Math.min(1, a.flinch / 0.16) * (1 - wAction) * 0.85, out);

  // Strikes need to snap; idle drift should stay soft.
  const stiffness = wAtk || wUlt || wDodge ? 26 : a.grounded ? 14 : 18;
  rig.commit(a.dt, stiffness);
  return out;
}
