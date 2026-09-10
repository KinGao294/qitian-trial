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
//
// Two things carry the weight, and both live below:
//   * timing — every pose is a keyed track with a *per-segment* ease, so anticipation can decelerate
//     into a held beat while the strike itself accelerates out of it. Uniform smoothstep on both
//     sides of every key is what makes procedural motion read as rubbery.
//   * dynamics — bones are driven by a damped angular spring rather than a uniform exponential
//     blend, so heavy masses lag the pose and light tips overshoot and settle. That difference in
//     response between a pelvis and a wrist is most of what "weight" actually looks like.

const DEG = Math.PI / 180;
const RIG_X = new T.Vector3(1, 0, 0); // nose / sagittal axis
const RIG_Y = new T.Vector3(0, 1, 0); // up / twist axis
const RIG_Z = new T.Vector3(0, 0, 1); // right / swing axis
const _q = new T.Quaternion(), _d = new T.Quaternion(), _p = new T.Vector3();
const _err = new T.Quaternion(), _axis = new T.Vector3(), _step = new T.Quaternion();

/** Spring response of one bone: natural frequency in rad/s, and damping ratio. */
type Springs = { freq: number, zeta: number };

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
  /** Angular velocity of `live`, in rig space (rad/s). This is what carries follow-through. */
  vel: T.Vector3,
  spring: Springs,
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
  /** Seconds left of the recoil from the player's *own* blow connecting. */
  impact?: number,
};

/**
 * How a keyed track reaches a key from the one before it.
 *   `smooth` ease in and out — the neutral default, right for drifting and settling
 *   `out`    decelerate into the key — anticipation winding to a stop, the beat before a strike
 *   `in`     accelerate out of the previous key — a blow gathering speed on its way to contact
 *   `hold`   stay put, then step — a held beat, which is what makes a telegraph readable
 *   `linear` constant rate, for sustained travel
 */
export type Ease = 'smooth' | 'in' | 'out' | 'hold' | 'linear';
export type Key = [number, number] | [number, number, Ease];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const shape = (u: number, ease: Ease) => {
  switch (ease) {
    case 'in': return u * u * u;                        // gathers speed: a strike accelerating
    case 'out': return 1 - Math.pow(1 - u, 3);          // arrives heavy and stops: anticipation
    case 'hold': return u < 1 ? 0 : 1;                  // a held beat
    case 'linear': return u;
    default: return u * u * (3 - 2 * u);
  }
};

/** Keyframe track: `[phase, value]` or `[phase, value, ease]` pairs, sampled at `t`. */
export function curve(t: number, keys: Key[]): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, ease] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      const u = (t - t0) / Math.max(t1 - t0, 1e-6);
      return v0 + (v1 - v0) * shape(u, (ease as Ease) ?? 'smooth');
    }
  }
  return keys[keys.length - 1][1];
}
/** Same track, wrapped so phase 1 rejoins phase 0. Cycles are authored over 0..1. */
const cyc = (u: number, keys: Key[]) => curve(u - Math.floor(u), keys);
/** A short bump centred on `at`: used for impact recoils and other one-frame accents. */
const spike = (p: number, at: number, width: number) => {
  const u = Math.abs(p - at) / width;
  return u >= 1 ? 0 : Math.pow(Math.cos(u * Math.PI / 2), 2);
};
/**
 * Breath that is not a sine wave. Lungs fill faster than they empty, and a sine is the single most
 * recognisable "this is procedural" tell in an idle, so the phase is warped to sharpen the inhale.
 */
const breathe = (t: number) => Math.sin(t + 0.55 * Math.sin(t));

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
  /** Damped root motion, so a layer switching off cannot pop the whole body. */
  private readonly root: RootMotion = { bob: 0, pitch: 0, roll: 0, spin: 0 };

  constructor(orient: T.Group, legChains: LegChain[], armRoots: T.Object3D[]) {
    this.orient = orient;
    orient.updateMatrixWorld(true);
    const orientWorld = new T.Quaternion();
    orient.getWorldQuaternion(orientWorld);
    const invOrient = orientWorld.clone().invert();

    const joint = (bone: T.Object3D, spring: Springs): Joint => {
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
        vel: new T.Vector3(),
        spring,
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
        // Legs carry the body, so they are stiff and barely overshoot; feet are light and snap.
        hip: joint(chain.hip, { freq: 17, zeta: 1 }),
        knee: joint(chain.knee, { freq: 21, zeta: 0.88 }),
        ankle: joint(chain.ankle, { freq: 24, zeta: 0.82 }),
        toe: joint(chain.toe, { freq: 26, zeta: 0.9 }),
        side: sideOf(chain.hip),
      });
    }
    // Arms hang off the same bone as the head; that bone is the chest, and walking up from it
    // gives spine and pelvis whatever the exporter called them.
    const chest = armRoots[0]?.parent;
    if (chest) {
      this.chest = joint(chest, { freq: 15, zeta: 0.92 });
      const spine = chest.parent;
      // The leg chains share the skeleton root, so never mistake the root for the pelvis.
      const rootBone = legChains[0]?.hip.parent;
      if (spine && spine !== rootBone && spine.parent) {
        this.spine = joint(spine, { freq: 13.5, zeta: 0.97 });
        const pelvis = spine.parent;
        // The pelvis is the heaviest link in the chain: it lags everything and never overshoots.
        if (pelvis && pelvis !== rootBone) this.pelvis = joint(pelvis, { freq: 12, zeta: 1.05 });
      }
      const headBone = chest.children.find(c => /^head(_|$)/.test((c.name || '').replace(/^tripo(::|_)?/i, '').toLowerCase()));
      // A head that trails the chest and settles late is most of what sells a heavy torso turn.
      if (headBone) this.head = joint(headBone, { freq: 18, zeta: 0.6 });
    }
    for (const root of armRoots) {
      const chainBones: T.Object3D[] = [root];
      while (chainBones[chainBones.length - 1].children.length) {
        chainBones.push(chainBones[chainBones.length - 1].children[0]);
      }
      const pick = (i: number) => chainBones[Math.min(i, chainBones.length - 1)];
      this.arms.push({
        // Out along the arm the links get lighter, faster and looser, so a swing whips and the
        // wrist keeps travelling for a beat after the shoulder has already stopped.
        clavicle: joint(pick(0), { freq: 15, zeta: 0.95 }),
        upper: joint(pick(1), { freq: 19, zeta: 0.86 }),
        fore: joint(pick(2), { freq: 24, zeta: 0.72 }),
        hand: joint(pick(3), { freq: 30, zeta: 0.58 }),
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
   * Push the authored pose onto the skeleton through a damped angular spring per bone.
   *
   * `response` scales every bone's natural frequency together, so the same pose code can read as a
   * loose idle or a committed strike: below 1 the body is heavy and late, above 1 it snaps.
   *
   * The spring is integrated semi-implicitly and sub-stepped, because a 30 rad/s wrist would ring
   * itself apart on a long frame otherwise.
   */
  commit(dt: number, response: number) {
    const h = Math.max(dt, 0);
    if (h <= 0) { this.push(); return; }
    const steps = Math.min(5, Math.max(1, Math.ceil(h / (1 / 120))));
    const sub = h / steps;
    for (const j of this.joints) {
      const w = j.spring.freq * response;
      const k = w * w, c = 2 * j.spring.zeta * w;
      for (let s = 0; s < steps; s++) {
        // Shortest-arc rotation still to be travelled, as an axis-angle vector in rig space.
        _err.copy(j.target).multiply(_d.copy(j.live).invert());
        let qw = _err.w;
        if (qw < 0) { _err.set(-_err.x, -_err.y, -_err.z, -qw); qw = -qw; }
        const sin = Math.sqrt(Math.max(0, 1 - qw * qw));
        if (sin < 1e-7) _axis.set(0, 0, 0);
        else _axis.set(_err.x, _err.y, _err.z).multiplyScalar(2 * Math.acos(Math.min(1, qw)) / sin);
        j.vel.addScaledVector(_axis, k * sub).addScaledVector(j.vel, -Math.min(1, c * sub));
        const speed = j.vel.length();
        if (speed > 90) j.vel.multiplyScalar(90 / speed);
        const travel = speed * sub;
        if (travel > 1e-7) {
          _axis.copy(j.vel).multiplyScalar(1 / speed);
          j.live.premultiply(_step.setFromAxisAngle(_axis, travel));
        }
      }
      j.live.normalize();
    }
    this.push();
  }

  private push() {
    for (const j of this.joints) {
      // delta_local = restWorld⁻¹ · pose · restWorld keeps the authored axes rig-space while the
      // bone itself stays in its parent's frame, so children inherit the rotation for free.
      _d.copy(j.invRestWorld).multiply(j.live).multiply(j.restWorld);
      j.bone.quaternion.copy(j.rest).multiply(_d);
    }
    this.orient.updateMatrixWorld(true);
    this.posed = true;
  }

  /**
   * Damp the authored root offsets. Layers switch on and off in one frame — running straight into a
   * swing drops the whole run bob instantly — and the visual group is not spring driven, so without
   * this the body jumps. Spin is left alone: it is authored to whole turns, so its reset is a no-op.
   */
  settleRoot(dt: number, authored: RootMotion, rate: number): RootMotion {
    const k = 1 - Math.exp(-rate * Math.max(dt, 0));
    this.root.bob += (authored.bob - this.root.bob) * k;
    this.root.pitch += (authored.pitch - this.root.pitch) * k;
    this.root.roll += (authored.roll - this.root.roll) * k;
    this.root.spin = authored.spin;
    return this.root;
  }

  /** Diagnostics for the combat smoke test: how far each limb is from the bind pose, in degrees. */
  report() {
    const deg = (q: T.Quaternion) => 2 * Math.acos(Math.min(1, Math.abs(q.w))) / DEG;
    const named = (label: string, j?: Joint) => ({ part: label, bone: j?.bone.name ?? '', deg: j ? deg(j.live) : 0, rate: j ? +j.vel.length().toFixed(3) : 0 });
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

/**
 * Combat idle: weight forward, shoulders loose, lead hand up. Legs stay on the verified bind.
 *
 * Nothing here is a single sine. Breath, weight shift and the slow settle all run at unrelated
 * rates so the body never returns to exactly the same pose twice, which is what stops a standing
 * character reading as a metronome.
 */
function poseIdle(rig: WarriorRig, a: AnimInput, w: number) {
  if (w <= 0.001) return 0;
  const breath = breathe(a.time * 1.35);
  // Weight rocks from foot to foot on a long, lopsided cycle: a slow drift one way, a quicker
  // recovery back. The legs are untouched (that is #21's contract), so the pelvis carries it.
  const shiftP = (a.time * 0.116) % 1;
  const shift = cyc(shiftP, [[0, -1], [0.44, 1, 'out'], [0.56, 1], [0.94, -1, 'out'], [1, -1]]);
  const drift = Math.sin(a.time * 0.61) * 0.6 + Math.sin(a.time * 0.29 + 1.9) * 0.4;
  // Slow settle of the ribcage against the hips — a breath does not move the whole torso as one.
  rig.lean(rig.pelvis, (3.4 + breath * 0.5) * w);
  rig.splay(rig.pelvis, shift * 2.2 * w);
  rig.twist(rig.pelvis, shift * 2.6 * w);
  rig.lean(rig.spine, (4.2 + breath * 1.5) * w);
  rig.splay(rig.spine, -shift * 1.1 * w);
  rig.lean(rig.chest, (0.6 - breath * 2.1) * w);
  rig.twist(rig.chest, (-shift * 1.6 + drift * 1.4) * w);
  rig.splay(rig.chest, -shift * 0.8 * w);
  rig.lean(rig.head, (-7.5 - breath * 0.8) * w); // chin up: the boss towers over the player
  rig.twist(rig.head, (drift * 3.4 - shift * 0.8) * w);
  rig.splay(rig.head, shift * 1.4 * w);
  for (const arm of rig.arms) {
    // The lead (left) hand rides higher in a guard; the rear hand hangs looser and breathes more.
    const lead = arm.side < 0;
    const loose = lead ? 0.7 : 1.3;
    rig.splay(arm.clavicle, arm.side * (7 + breath * 0.6 * loose) * w);
    rig.swing(arm.clavicle, breath * 0.8 * loose * w);
    rig.splay(arm.upper, arm.side * (lead ? 24 : 21) * w + shift * arm.side * 1.6 * w);
    rig.swing(arm.upper, (lead ? 16 : 6) * w + breath * 1.7 * loose * w);
    rig.twist(arm.upper, arm.side * (10 + breath * 1.2) * w);
    rig.swing(arm.fore, (lead ? 62 : 40) * w + breath * 3.4 * loose * w);
    rig.twist(arm.fore, arm.side * (lead ? -8 : 4) * w);
    // The wrists are the lightest links, so they keep drifting after the arms have settled.
    rig.swing(arm.hand, ((lead ? -8 : -4) + drift * (lead ? 2.6 : 1.6)) * w);
    rig.splay(arm.hand, arm.side * drift * 2 * w);
  }
  // Barely a centimetre, but a chest that rises while the hips stay put reads as a body breathing
  // rather than a statue with a wobble on it.
  return (breath * 0.009 - Math.abs(shift) * 0.004) * w;
}

// One full run cycle for a single leg, authored from foot contact (u=0) rather than from a sine.
// Contact → loading → drive → toe-off is roughly the first 40%; the rest is swing. That asymmetry
// is the difference between a run and a pendulum, and no phase-shifted sine can produce it.
const RUN_HIP: Key[] = [[0, 24], [0.12, 10, 'out'], [0.3, -14, 'linear'], [0.4, -22, 'out'], [0.52, -8, 'in'], [0.74, 22], [0.87, 31, 'out'], [1, 24]];
const RUN_KNEE: Key[] = [[0, -14], [0.11, -36, 'out'], [0.28, -12, 'out'], [0.4, -62, 'in'], [0.52, -104, 'out'], [0.72, -74, 'linear'], [0.88, -22, 'out'], [1, -14]];
const RUN_ANKLE: Key[] = [[0, 6], [0.1, -6, 'out'], [0.3, 4, 'linear'], [0.4, 26, 'in'], [0.56, 14, 'out'], [0.84, -2], [1, 6]];
// Vertical travel over a *half* stride: the body drops hard onto the planted leg and floats back up.
const RUN_BOB: Key[] = [[0, -0.02], [0.14, -0.085, 'in'], [0.34, -0.02, 'out'], [0.5, 0.012], [0.78, -0.005, 'linear'], [1, -0.02]];
// Arms counter the legs, phased so the shoulder is furthest forward at the *opposite* foot's
// contact: hard drive back, looser recovery forward, elbow opening out on the back swing.
const RUN_ARM: Key[] = [[0, 38], [0.16, 20, 'linear'], [0.42, -16, 'in'], [0.56, -27, 'out'], [0.76, 2, 'linear'], [1, 38]];
const RUN_ELBOW: Key[] = [[0, 76], [0.2, 86, 'out'], [0.5, 56, 'out'], [0.74, 64, 'linear'], [1, 76]];

/** Run cycle: alternating stride, counter-rotating shoulders, forward lean, vertical bob. */
function poseRun(rig: WarriorRig, a: AnimInput, w: number, out: RootMotion): number {
  if (w <= 0.001) return 0;
  rig.stride += a.dt * (5.2 + 3.4 * a.speed);
  const p = rig.stride;
  const u = p / (Math.PI * 2);      // one full stride, both feet
  const half = (p / Math.PI) % 1;   // one footfall, for the bob and the body roll
  const lean = Math.sin(p) , sway = Math.cos(p);
  rig.lean(rig.pelvis, (10 + 2.5 * a.speed) * w);
  rig.twist(rig.pelvis, lean * 7.5 * w);
  // Pelvic list: the hip on the swinging side drops, the way it does when only one leg is loaded.
  rig.splay(rig.pelvis, sway * 3.4 * w);
  rig.lean(rig.spine, 6.5 * w);
  rig.twist(rig.spine, -lean * 5 * w);
  rig.splay(rig.spine, -sway * 1.8 * w);
  rig.twist(rig.chest, -lean * 8 * w);
  rig.lean(rig.chest, 3 * w);
  // The head is spring-damped and loose, so authoring it flat lets it settle against the bob by
  // itself — a counter-bob on top of that would read as a nod.
  rig.lean(rig.head, -9.5 * w);
  rig.twist(rig.head, lean * 2 * w);
  for (const leg of rig.legs) {
    const ph = u + (leg.side > 0 ? 0.5 : 0);
    rig.swing(leg.hip, cyc(ph, RUN_HIP) * w);
    rig.swing(leg.knee, cyc(ph, RUN_KNEE) * w);
    rig.swing(leg.ankle, cyc(ph, RUN_ANKLE) * w);
    rig.splay(leg.hip, -leg.side * 3 * w);
    rig.twist(leg.hip, -leg.side * 4 * w);
  }
  for (const arm of rig.arms) {
    // The right arm drives forward with the left leg, the way people actually run.
    const ph = u + (arm.side > 0 ? 0 : 0.5);
    rig.splay(arm.clavicle, arm.side * 6 * w);
    rig.swing(arm.clavicle, cyc(ph, RUN_ARM) * 0.12 * w);
    rig.splay(arm.upper, arm.side * 30 * w);
    rig.swing(arm.upper, cyc(ph, RUN_ARM) * w);
    rig.twist(arm.upper, arm.side * 12 * w);
    rig.swing(arm.fore, cyc(ph, RUN_ELBOW) * w);
  }
  out.roll += sway * 0.035 * w;
  out.pitch += (0.03 + cyc(half, RUN_BOB) * 0.25) * w;
  return cyc(half, RUN_BOB) * w;
}

/**
 * Jump: explode off the ground, tuck, hang at the apex, then reach for the floor.
 *
 * The apex is the readable part — `hang` peaks where the vertical speed crosses zero, and that is
 * where the pose opens out. Driving everything off `vy` alone gives a body that only ever tucks or
 * only ever reaches, with no moment of suspension between the two.
 */
function poseAir(rig: WarriorRig, a: AnimInput, w: number, out: RootMotion): number {
  if (w <= 0.001) return 0;
  const rise = clamp01(a.vy / 6), fall = clamp01(-a.vy / 8);
  const hang = clamp01(1 - Math.max(rise, fall) * 1.25);
  // Right off the floor the body is still extended from the push; the tuck arrives a beat later.
  const push = clamp01(1 - a.air / 0.16);
  rig.lean(rig.pelvis, (4 + 12 * fall - 6 * push) * w);
  rig.lean(rig.spine, (-9 * rise + 7 * fall + 4 * hang) * w);
  rig.twist(rig.spine, 6 * hang * w);
  rig.lean(rig.chest, (-11 * rise + 5 * fall + 3 * hang) * w);
  rig.lean(rig.head, (-13 * rise - 4 - 6 * fall) * w);
  rig.twist(rig.head, -5 * hang * w);
  for (const leg of rig.legs) {
    const lead = leg.side < 0 ? 1 : -1; // left leg tucks first, right trails
    rig.swing(leg.hip, (rise * (28 + lead * 18) + hang * (14 + lead * 26) - fall * (10 - lead * 12) - push * 22) * w);
    rig.swing(leg.knee, -(rise * (66 + lead * 14) + hang * (42 + lead * 10) + 16 + fall * 8 - push * 26) * w);
    rig.swing(leg.ankle, (20 * rise + 8 * hang - 14 * fall + 16 * push) * w);
    rig.splay(leg.hip, -leg.side * (5 + 8 * rise + 5 * hang) * w);
  }
  for (const arm of rig.arms) {
    const lead = arm.side < 0 ? 1 : -1;
    rig.splay(arm.clavicle, arm.side * (10 + 17 * rise + 9 * hang) * w);
    rig.splay(arm.upper, arm.side * (26 + 19 * rise + 22 * hang) * w);
    rig.swing(arm.upper, (26 + 78 * rise + lead * 26 * hang - 24 * fall) * w);
    rig.twist(arm.upper, arm.side * (12 + 10 * hang) * w);
    rig.swing(arm.fore, (50 - 28 * rise - 14 * hang + 22 * fall) * w);
    rig.swing(arm.hand, -12 * rise * w);
  }
  out.pitch += (-0.05 * rise + 0.06 * fall) * w;
  return (0.02 * rise + 0.012 * hang) * w;
}

/**
 * Landing: compress hard, then push back out through a small rebound.
 *
 * `land01` is 0 at touchdown. The dip is deepest on the first frame and recovers on an accelerating
 * curve that overshoots slightly past standing, so the body springs off the floor instead of
 * inflating back up to the idle.
 */
function poseLand(rig: WarriorRig, land01: number, w: number, out: RootMotion): number {
  if (w <= 0.001) return 0;
  const u = clamp01(1 - land01);
  const dip = curve(u, [[0, -0.14], [0.2, 0.1, 'in'], [0.55, 0.82, 'out'], [1, 1]]);
  const push = curve(u, [[0, 0], [0.35, 1, 'out'], [0.7, 0.25, 'in'], [1, 0]]);
  rig.lean(rig.pelvis, (17 * dip - 3 * push) * w);
  rig.splay(rig.pelvis, 4 * push * w);
  rig.lean(rig.spine, (9 * dip - 4 * push) * w);
  rig.lean(rig.chest, 5 * dip * w);
  rig.lean(rig.head, (-11 * dip - 5 * push) * w);
  for (const leg of rig.legs) {
    const lead = leg.side < 0 ? 1 : -1;
    rig.swing(leg.hip, (17 * dip + lead * 5 * dip) * w);
    rig.swing(leg.knee, -(46 * dip + lead * 6 * dip) * w);
    rig.swing(leg.ankle, (22 * dip - 8 * push) * w);
    rig.splay(leg.hip, -leg.side * 7 * dip * w);
  }
  for (const arm of rig.arms) {
    rig.splay(arm.upper, arm.side * (29 * dip + 8 * push) * w);
    rig.swing(arm.upper, (-20 * dip + 8 * push) * w);
    rig.swing(arm.fore, (76 * dip - 14 * push) * w);
    rig.swing(arm.hand, -10 * dip * w);
  }
  out.pitch += 0.06 * dip * w;
  return (-0.19 * dip + 0.022 * push) * w;
}

/**
 * Three staff arts, all built on the same beats: plant, wind, *hold*, strike, absorb.
 * `combo` picks which one.
 *   0 横扫破风 — right-hand horizontal sweep
 *   1 挑棍穿云 — left-hand rising strike
 *   2 旋砸定山 — spinning two-handed slam
 *
 * The hold at the top of the wind-up is the whole point. It gives the eye a still frame to read the
 * telegraph off, and it is what the accelerating strike is measured against — a swing that eases
 * both in and out has no moment where it is fastest, so it never looks like it hits anything.
 *
 * Body segments fire in order, hips first and hand last, offset in the key times. The spring
 * response then stretches that ordering out further on its own, which is where the whip comes from.
 */
function poseAttack(rig: WarriorRig, combo: number, p: number, w: number, impact: number, out: RootMotion) {
  if (w <= 0.001) return;
  const lead = combo === 1 ? -1 : 1; // which hand drives the blow
  const off = -lead;
  // The beats, in phase: lead-in to 0.08, wind to 0.24, *hold* to 0.30, strike to 0.46, absorb the
  // follow-through to 0.60, recover to the guard. Contact sits a little before halfway on purpose —
  // a blow that lands late leaves no room to show the body paying for it.
  const hip = curve(p, [[0, 0], [0.08, -0.4, 'out'], [0.24, -1, 'out'], [0.3, -1, 'hold'], [0.44, 0.85, 'in'], [0.54, 1, 'out'], [0.76, 0.5], [1, 0.1]]);
  const chest = curve(p, [[0, 0], [0.09, -0.45, 'out'], [0.27, -1, 'out'], [0.33, -1, 'hold'], [0.47, 0.9, 'in'], [0.58, 1, 'out'], [0.8, 0.45], [1, 0.08]]);
  const drive = curve(p, [[0, -0.2], [0.1, -0.72, 'out'], [0.29, -1, 'out'], [0.35, -1, 'hold'], [0.49, 1, 'in'], [0.62, 0.86, 'out'], [1, 0.14]]);
  const push = clamp01(drive);
  // Weight sinking into the plant before anything swings, then transferring through the blow.
  const plant = curve(p, [[0, 0], [0.07, 0.3], [0.21, 1, 'out'], [0.34, 0.85], [0.49, 0, 'in'], [1, 0]]);
  // Contact: the body brakes against its own blow for a few frames. `impact` adds a real recoil on
  // top when the swing actually connected with something.
  const brake = spike(p, 0.52, 0.15) + impact * 0.9;

  if (combo === 0) {
    rig.twist(rig.pelvis, -lead * 17 * hip * w);
    rig.twist(rig.spine, -lead * 21 * chest * w);
    rig.twist(rig.chest, -lead * 27 * drive * w);
    rig.lean(rig.chest, curve(p, [[0, 0], [0.09, -3], [0.27, -9, 'out'], [0.33, -9, 'hold'], [0.49, 13, 'in'], [0.68, 9], [1, 2]]) * w);
    rig.splay(rig.chest, lead * 6 * push * w);
    out.pitch += curve(p, [[0, 0], [0.09, -0.02], [0.27, -0.07, 'out'], [0.49, 0.17, 'in'], [0.66, 0.12], [1, 0.02]]) * w;
    out.roll += -lead * 0.09 * push * w;
  } else if (combo === 1) {
    rig.twist(rig.pelvis, -lead * 13 * hip * w);
    rig.twist(rig.chest, -lead * 19 * drive * w);
    rig.lean(rig.spine, curve(p, [[0, 0], [0.09, 5], [0.27, 16, 'out'], [0.35, 16, 'hold'], [0.49, -19, 'in'], [0.68, -13], [1, 0]]) * w);
    rig.lean(rig.chest, curve(p, [[0, 0], [0.09, 4], [0.27, 12, 'out'], [0.35, 12, 'hold'], [0.51, -24, 'in'], [0.72, -16], [1, 1]]) * w);
    out.bob += curve(p, [[0, 0], [0.09, -0.045], [0.27, -0.14, 'out'], [0.35, -0.14, 'hold'], [0.51, 0.15, 'in'], [0.76, 0.02], [1, 0]]) * w;
    out.pitch += curve(p, [[0, 0], [0.09, 0.035], [0.29, 0.12, 'out'], [0.51, -0.15, 'in'], [0.74, -0.04], [1, 0]]) * w;
  } else {
    // The spin is the anticipation: it winds back a fifth of a turn before committing to the full
    // rotation, and the last stretch decelerates hard so the staff lands rather than coasts.
    out.spin += curve(p, [[0, 0], [0.18, -0.62, 'out'], [0.25, -0.62, 'hold'], [0.62, Math.PI * 2 - 0.5, 'in'], [0.78, Math.PI * 2, 'out'], [1, Math.PI * 2]]) * w;
    rig.lean(rig.spine, curve(p, [[0, 0], [0.09, -4], [0.27, -13, 'out'], [0.34, -13, 'hold'], [0.56, 28, 'in'], [0.74, 20], [1, 5]]) * w);
    rig.lean(rig.chest, curve(p, [[0, 0], [0.09, -3.5], [0.27, -11, 'out'], [0.34, -11, 'hold'], [0.58, 24, 'in'], [0.76, 16], [1, 3]]) * w);
    out.bob += curve(p, [[0, 0], [0.09, 0.03], [0.27, 0.09, 'out'], [0.35, 0.09, 'hold'], [0.58, -0.16, 'in'], [0.78, -0.03], [1, 0]]) * w;
    out.pitch += curve(p, [[0, 0], [0.09, -0.032], [0.29, -0.11, 'out'], [0.58, 0.28, 'in'], [0.78, 0.1], [1, 0.03]]) * w;
  }
  // Chin leads the wind-up away from the target and snaps back onto it through contact.
  rig.lean(rig.head, ((combo === 2 ? 7 * push : -7 - 5 * push) - 5 * brake) * w);
  rig.twist(rig.head, lead * 9 * drive * w);
  out.bob += (-0.05 * plant - 0.02 * brake) * w;
  out.pitch += -0.06 * brake * w;

  for (const arm of rig.arms) {
    const isLead = arm.side === lead;
    rig.splay(arm.clavicle, arm.side * (8 + 11 * push) * w);
    // The shoulder girdle drives the blow out ahead of the arm and is dragged back by the recoil.
    rig.swing(arm.clavicle, ((isLead ? 13 * drive : -4 * drive) - 6 * brake) * w);
    if (combo === 0) {
      // Sweep: the driving arm whips across the body, elbow snapping open at contact. The shoulder
      // rolls the arm in under the body first, which is what lets the sweep actually reach out
      // front — swung straight from the bind's outstretched rest it only travels sideways.
      rig.splay(arm.upper, arm.side * (isLead ? 28 + 33 * push : 30) * w);
      rig.swing(arm.upper, (isLead ? curve(p, [[0, -30], [0.14, -46, 'out'], [0.31, -54, 'out'], [0.37, -54, 'hold'], [0.49, 118, 'in'], [0.64, 101, 'out'], [1, 20]])
        : curve(p, [[0, 20], [0.1, 34], [0.29, 56, 'out'], [0.37, 56, 'hold'], [0.53, -16, 'in'], [1, 12]])) * w);
      rig.twist(arm.upper, arm.side * (isLead ? -19 * drive : 14) * w);
      rig.swing(arm.fore, (isLead ? curve(p, [[0, 96], [0.31, 114, 'out'], [0.38, 114, 'hold'], [0.49, 4, 'in'], [0.66, 32, 'out'], [1, 58]])
        : curve(p, [[0, 60], [0.1, 50], [0.31, 28, 'out'], [0.55, 86, 'in'], [1, 62]])) * w);
    } else if (combo === 1) {
      // Rising strike: driving arm comes from the hip up past the head.
      rig.splay(arm.upper, arm.side * (isLead ? 26 + 29 * push : 28) * w);
      rig.swing(arm.upper, (isLead ? curve(p, [[0, -20], [0.17, -48, 'out'], [0.33, -58, 'out'], [0.39, -58, 'hold'], [0.51, 144, 'in'], [0.66, 128, 'out'], [1, 26]])
        : curve(p, [[0, 16], [0.1, 25], [0.31, 42, 'out'], [0.39, 42, 'hold'], [0.55, -22, 'in'], [1, 10]])) * w);
      rig.swing(arm.fore, (isLead ? curve(p, [[0, 92], [0.12, 102], [0.33, 120, 'out'], [0.4, 120, 'hold'], [0.51, 12, 'in'], [0.68, 40, 'out'], [1, 60]])
        : curve(p, [[0, 58], [0.12, 47], [0.33, 24, 'out'], [0.55, 92, 'in'], [1, 62]])) * w);
    } else {
      // Slam: both hands overhead, then down together.
      rig.splay(arm.upper, arm.side * (34 + 16 * push) * w);
      rig.swing(arm.upper, curve(p, [[0, 30], [0.1, 74], [0.3, 158, 'out'], [0.37, 158, 'hold'], [0.56, -34, 'in'], [0.72, -20, 'out'], [1, 16]]) * w);
      rig.twist(arm.upper, arm.side * 10 * w);
      rig.swing(arm.fore, curve(p, [[0, 60], [0.1, 47], [0.3, 22, 'out'], [0.37, 22, 'hold'], [0.58, 6, 'in'], [0.76, 34, 'out'], [1, 56]]) * w);
    }
    // The wrist is the last link to arrive and the last to stop.
    rig.swing(arm.hand, ((isLead ? -16 * push : -6) - 8 * brake) * w);
    rig.twist(arm.hand, arm.side * -10 * push * w);
  }
  // Legs: sink into the plant, step into the blow with the front foot, brace with the back one.
  for (const leg of rig.legs) {
    const front = leg.side === off ? 1 : -1;
    rig.swing(leg.hip, (front * (9 + 18 * push) + 6 * plant + (combo === 2 ? -7 * push : 0)) * w);
    rig.swing(leg.knee, -(9 + 27 * push + 20 * plant + (front > 0 ? 9 : 0) + 8 * brake) * w);
    rig.swing(leg.ankle, (7 + 11 * push + 6 * plant) * w);
    rig.splay(leg.hip, -leg.side * (5 + 7 * push + 3 * plant) * w);
    rig.twist(leg.hip, -lead * 9 * hip * w);
  }
}

/**
 * 定海神针: gather low, spin up, hold the staff overhead for one still beat, then drive it down.
 *
 * The hold is the cinematic part and it is deliberately dead still — every other layer has stopped
 * moving by then, so the plunge that follows has something to break. Nothing here is lifted from
 * anywhere: it is the same anticipation → hold → accelerate → absorb structure as the combo, spread
 * over a longer beat and with the whole body committing instead of one arm.
 */
function poseUltimate(rig: WarriorRig, p: number, w: number, out: RootMotion) {
  if (w <= 0.001) return;
  const gather = curve(p, [[0, 0], [0.07, 0.34], [0.2, 1, 'out'], [0.3, 1, 'hold'], [0.44, 0.15, 'in'], [1, 0]]);
  const rise = curve(p, [[0, 0], [0.26, 0, 'hold'], [0.46, 1, 'out'], [0.58, 1, 'hold'], [0.68, 0.2, 'in'], [1, 0]]);
  const thrust = curve(p, [[0, 0], [0.58, 0, 'hold'], [0.74, 1, 'in'], [0.84, 0.92, 'out'], [1, 0.18]]);
  const land = curve(p, [[0, 0], [0.74, 0, 'hold'], [0.82, 1, 'out'], [1, 0.25, 'in']]);
  // Wind back, then one committed turn that decelerates into the overhead hold.
  out.spin += curve(p, [[0, 0], [0.18, -0.4, 'out'], [0.26, -0.4, 'hold'], [0.46, Math.PI * 2 - 0.35, 'in'], [0.56, Math.PI * 2, 'out'], [1, Math.PI * 2]]) * w;
  out.bob += (-0.2 * gather + 0.1 * rise - 0.05 * thrust - 0.09 * land) * w;
  out.pitch += (-0.14 * gather - 0.04 * rise + 0.32 * thrust) * w;
  out.roll += -0.06 * rise * w;
  rig.lean(rig.pelvis, (16 * gather - 4 * rise + 11 * thrust + 8 * land) * w);
  rig.twist(rig.pelvis, -12 * gather * w);
  rig.lean(rig.spine, (-15 * gather - 8 * rise + 17 * thrust + 6 * land) * w);
  rig.twist(rig.spine, 10 * gather * w);
  rig.lean(rig.chest, (-19 * gather - 12 * rise + 15 * thrust + 4 * land) * w);
  rig.lean(rig.head, (-19 * gather - 14 * rise - 7 * thrust - 6 * land) * w);
  rig.twist(rig.head, 8 * gather * w);
  for (const arm of rig.arms) {
    rig.splay(arm.clavicle, arm.side * (10 + 9 * rise + 13 * thrust) * w);
    rig.splay(arm.upper, arm.side * (32 + 13 * gather + 10 * rise + 12 * thrust) * w);
    rig.swing(arm.upper, (20 + 96 * gather + 152 * rise + 74 * thrust - 26 * land) * w);
    rig.twist(arm.upper, arm.side * (14 - 11 * thrust) * w);
    rig.swing(arm.fore, (58 - 30 * gather - 42 * rise - 46 * thrust + 24 * land) * w);
    rig.swing(arm.hand, (-12 * thrust - 9 * land) * w);
  }
  for (const leg of rig.legs) {
    const front = leg.side < 0 ? 1 : -1;
    rig.swing(leg.hip, (front * (12 + 32 * thrust) - 5 * gather + front * 10 * rise + 9 * land) * w);
    rig.swing(leg.knee, -(14 + 38 * gather + 30 * land + (front > 0 ? 24 : 7) * thrust) * w);
    rig.swing(leg.ankle, (10 + 18 * gather + 12 * land) * w);
    rig.splay(leg.hip, -leg.side * (6 + 9 * thrust + 5 * rise) * w);
  }
}

/** Dodge: a low, tucked side-dash — sharp launch, held tuck, then the feet catch the body. */
function poseDodge(rig: WarriorRig, p: number, w: number, out: RootMotion) {
  if (w <= 0.001) return;
  const burst = curve(clamp01(p), [[0, 0], [0.14, 1, 'out'], [0.5, 0.85], [0.72, 0.2, 'in'], [1, 0]]);
  const recover = curve(clamp01(p), [[0, 0], [0.62, 0, 'hold'], [0.8, 1, 'out'], [1, 0.15, 'in']]);
  out.bob += (-0.22 * burst - 0.06 * recover) * w;
  out.pitch += (0.36 * burst + 0.08 * recover) * w;
  out.roll += -0.28 * burst * w;
  rig.lean(rig.pelvis, (27 * burst + 9 * recover) * w);
  rig.lean(rig.spine, 19 * burst * w);
  rig.lean(rig.chest, 14 * burst * w);
  rig.lean(rig.head, (-9 * burst - 6 * recover) * w);
  rig.twist(rig.head, 10 * burst * w);
  for (const leg of rig.legs) {
    const front = leg.side < 0 ? 1 : -1;
    rig.swing(leg.hip, (front * 36 * burst + 16 * recover) * w);
    rig.swing(leg.knee, -((48 + front * 19) * burst + 34 * recover) * w);
    rig.swing(leg.ankle, (23 * burst + 14 * recover) * w);
    rig.splay(leg.hip, -leg.side * 6 * burst * w);
  }
  for (const arm of rig.arms) {
    rig.splay(arm.upper, arm.side * (35 * burst + 12 * recover) * w);
    rig.swing(arm.upper, (27 * burst - 14 * recover) * w);
    rig.swing(arm.fore, (98 * burst + 40 * recover) * w);
  }
}

/**
 * Hit flinch: a recoil that layers on top of whatever else is playing.
 *
 * `t01` runs 1 → 0 across the flinch, so the jolt is hardest on the frame the hit lands and then
 * rings out. A flat offset held for the whole duration and dropped is what makes damage feel free.
 */
function poseFlinch(rig: WarriorRig, t01: number, w: number, out: RootMotion) {
  if (w <= 0.001) return;
  const jolt = Math.pow(clamp01(t01), 1.6) * Math.cos((1 - clamp01(t01)) * 7.5);
  const shed = clamp01(t01);
  out.pitch += -0.13 * jolt * w;
  out.roll += 0.05 * jolt * w;
  out.bob += -0.03 * shed * w;
  rig.lean(rig.spine, -17 * jolt * w);
  rig.lean(rig.chest, -15 * jolt * w);
  rig.lean(rig.head, -15 * jolt * w);
  rig.twist(rig.chest, 6 * jolt * w);
  for (const arm of rig.arms) {
    rig.splay(arm.upper, arm.side * 31 * shed * w);
    rig.swing(arm.upper, -13 * jolt * w);
    rig.swing(arm.fore, 72 * shed * w);
  }
  for (const leg of rig.legs) {
    rig.swing(leg.knee, -11 * shed * w);
  }
}

/**
 * Author one frame of animation and push it onto the skeleton.
 * Returns the root motion the caller applies to the visual group.
 */
export function animateWarrior(rig: WarriorRig, a: AnimInput): RootMotion {
  const authored: RootMotion = { bob: 0, pitch: 0, roll: 0, spin: 0 };
  rig.begin();

  const wDodge = a.dodgeP >= 0 ? 1 : 0;
  const wUlt = a.ultP >= 0 ? 1 : 0;
  const wAtk = a.attack >= 0 ? 1 : 0;
  const wAction = Math.max(wDodge, wUlt, wAtk);
  const wLand = a.land > 0 && a.grounded ? (1 - wAction) : 0;
  const wAir = !a.grounded ? (1 - wAction) : 0;
  const wLoco = Math.max(0, 1 - wAction - wAir - wLand);
  const impact = clamp01((a.impact ?? 0) / 0.12);

  authored.bob += poseIdle(rig, a, wLoco * (1 - a.speed));
  authored.bob += poseRun(rig, a, wLoco * a.speed, authored);
  authored.bob += poseAir(rig, a, wAir, authored);
  authored.bob += poseLand(rig, 1 - a.land / 0.24, wLand, authored);
  if (wAtk) poseAttack(rig, a.attack, a.attackP, wAtk, impact, authored);
  if (wUlt) poseUltimate(rig, a.ultP, wUlt, authored);
  if (wDodge) poseDodge(rig, a.dodgeP, wDodge, authored);
  poseFlinch(rig, a.flinch / 0.18, Math.min(1, a.flinch / 0.05) * (1 - wAction) * 0.85, authored);

  // How hard the body commits to the pose. A strike is stiff and immediate; the idle is loose and
  // late, which is what lets the same pose code read as either.
  const response = wDodge ? 1.85
    : wAtk ? 1.7 + (impact ? 0.35 : 0)
      : wUlt ? 1.5
        : !a.grounded ? 1.1
          : a.land > 0 ? 1.45
            : 0.85 + 0.35 * a.speed;
  rig.commit(a.dt, response);
  // Root offsets are not spring driven, so they get their own damping — fast enough to keep the
  // impact frames sharp, slow enough that a layer switching off cannot pop the body.
  return rig.settleRoot(a.dt, authored, wAction ? 46 : 26);
}
