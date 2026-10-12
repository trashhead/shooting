import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { EYE_HEIGHT, MOVE_SPEED } from '../../shared/constants';
import { loadWeaponModel } from '../player/weaponModel';

// The soldier avatar for remote players: a Mixamo-rigged model (public/assets/
// soldier/soldier.glb) driven by clips baked from Mixamo FBX files
// (anims.json, see tools/convert-anims.mjs). Locomotion is a blend of clips
// by how the player moves relative to where they face; the spine is bent by
// the look pitch so the arms (and the rifle in the hands) follow it.

type ClipName =
  | 'idle' | 'walk' | 'walkBack' | 'run' | 'runBack'
  | 'strafeLeft' | 'strafeRight' | 'runStrafeLeft' | 'runStrafeRight' | 'jump';

type ClipJson = {
  duration: number;
  speed: [number, number]; // root motion the clip had, m/s: [to the left, forward]
  tracks: { bone: string; prop: 'quaternion' | 'position'; times: number[]; values: number[] }[];
};

export type SoldierAssets = {
  scene: THREE.Group;
  clips: Record<ClipName, THREE.AnimationClip>;
  // metres per cycle of a locomotion clip, for matching playback rate to speed
  stride: Record<ClipName, number>;
  scale: number; // model units -> world
  offset: THREE.Vector3; // puts the feet under the eye (in the avatar's own frame)
  weapon: THREE.Group;
};

const AVATAR_HEIGHT = EYE_HEIGHT + 0.1; // the eye sits just below the top of the head

let loading: Promise<SoldierAssets> | null = null;

export function loadSoldier(): Promise<SoldierAssets> {
  return (loading ??= load());
}

async function load(): Promise<SoldierAssets> {
  const [gltf, anims, weapon] = await Promise.all([
    new GLTFLoader().loadAsync('/assets/soldier/soldier.glb'),
    fetch('/assets/soldier/anims.json').then((r) => r.json() as Promise<{ hipsRestY: number; clips: Record<ClipName, ClipJson> }>),
    loadWeaponModel(),
  ]);

  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const scale = AVATAR_HEIGHT / (box.max.y - box.min.y);

  // The clips are in the Mixamo rig's own units (cm); the soldier's skeleton
  // is some other size. Scale hips travel by how high its hips stand compared
  // to the clips' (feet at box.min.y).
  const bones = new Map<string, THREE.Bone>();
  scene.traverse((o) => {
    // GLTFLoader strips ':' and '.', so 'mixamorig:Hips.183' became 'mixamorigHips183'.
    if (o instanceof THREE.Bone) bones.set(o.name.slice(0, -3), o);
  });
  const hips = bones.get('mixamorigHips')!;
  const unit = (hips.position.y - box.min.y) / anims.hipsRestY;

  const clips = {} as Record<ClipName, THREE.AnimationClip>;
  const stride = {} as Record<ClipName, number>;
  for (const [name, json] of Object.entries(anims.clips) as [ClipName, ClipJson][]) {
    const tracks: THREE.KeyframeTrack[] = [];
    for (const t of json.tracks) {
      const bone = bones.get(t.bone);
      if (!bone) continue;
      if (t.prop === 'quaternion') {
        tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, t.times, t.values));
      } else {
        const v = t.values.slice();
        const [x0, z0] = [v[0], v[2]];
        for (let i = 0; i < v.length; i += 3) {
          v[i] = hips.position.x + (v[i] - x0) * unit;
          v[i + 1] = box.min.y + v[i + 1] * unit;
          v[i + 2] = hips.position.z + (v[i + 2] - z0) * unit;
        }
        tracks.push(new THREE.VectorKeyframeTrack(`${bone.name}.position`, t.times, v));
      }
    }
    clips[name] = new THREE.AnimationClip(name, json.duration, tracks);
    stride[name] = Math.hypot(...json.speed) * json.duration;
  }

  scene.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh) {
      o.castShadow = true;
      // The bounding sphere is the bind pose's, not the animated one.
      o.frustumCulled = false;
    }
  });

  // Hips x/z at the origin, feet at the bottom.
  const offset = new THREE.Vector3(hips.position.x * scale, -EYE_HEIGHT - box.min.y * scale, hips.position.z * scale);
  return { scene, clips, stride, scale, offset, weapon };
}

// Game speed -> speed the clips were authored for. Chosen so the full run speed
// matches the run clip and the sneak speed matches the walk clip.
const RUN_CLIP_SPEED = 3.16;
const SPEED_TO_CLIP = RUN_CLIP_SPEED / MOVE_SPEED;
// How closely the legs follow the ground speed: 1 plants the feet exactly, lower
// lets them skate a bit for calmer legs. This game moves much faster than the
// clips were recorded at, so exact sync means quick legs; MAX_CYCLES caps them.
const LEG_SYNC = 1;
const MAX_CYCLES = 5; // leg cycles per second
const WALK_BLEND_FROM = 1.3; // clip m/s where walk starts turning into run
const WALK_BLEND_TO = 2.6;

// How much of the look pitch each bone takes. Everything above the hips sums to 1,
// so the head ends up pointing where the camera does.
const PITCH_SHARE: [string, number][] = [
  ['mixamorigSpine', 0.15],
  ['mixamorigSpine1', 0.25],
  ['mixamorigSpine2', 0.3],
  ['mixamorigNeck', 0.15],
  ['mixamorigHead', 0.15],
];

// Where the rifle sits relative to the right hand, in the avatar's frame
// (+X left, +Y up, +Z forward), in metres.
const WEAPON_OFFSET = new THREE.Vector3(0.0, 0.05, 0.25);
const WEAPON_ROTATION = new THREE.Euler(0, Math.PI, 0); // barrel (-Z) -> forward
const WEAPON_SIZE = 1;

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);
const smooth = (current: number, target: number, rate: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-rate * dt));
const X_AXIS = new THREE.Vector3(1, 0, 0);
const tmpQuat = new THREE.Quaternion();

// Locomotion directions: [walk clip, run clip]
const DIRECTIONS: Record<'forward' | 'back' | 'left' | 'right', [ClipName, ClipName]> = {
  forward: ['walk', 'run'],
  back: ['walkBack', 'runBack'],
  left: ['strafeLeft', 'runStrafeLeft'],
  right: ['strafeRight', 'runStrafeRight'],
};

export class SoldierAvatar {
  // Add this to the player's group (whose origin is the eye, facing -Z).
  readonly object = new THREE.Group();

  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = {} as Record<ClipName, THREE.AnimationAction>;
  private readonly weights = {} as Record<ClipName, number>;
  private readonly pitchBones: [THREE.Object3D, number][] = [];
  private phase = 0;
  private idleTime = 0;
  private jumpTime = 0;
  private airTimer = 0;
  private wasAirborne = false;
  private forward = 0;
  private left = 0;

  constructor(private readonly assets: SoldierAssets, tint: THREE.Color) {
    const model = cloneSkinned(assets.scene) as THREE.Group;
    model.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        // Cloned avatars share materials; a slight tint per player tells them apart.
        o.material = (o.material as THREE.MeshStandardMaterial).clone();
        (o.material as THREE.MeshStandardMaterial).color.lerp(tint, 0.3);
      }
    });

    // The model faces +Z, the player group faces -Z.
    this.object.rotation.y = Math.PI;
    this.object.scale.setScalar(assets.scale);
    this.object.position.copy(assets.offset);
    this.object.add(model);

    this.mixer = new THREE.AnimationMixer(model);
    for (const name of Object.keys(assets.clips) as ClipName[]) {
      const action = this.mixer.clipAction(assets.clips[name]);
      action.play();
      action.setEffectiveWeight(0);
      this.actions[name] = action;
      this.weights[name] = 0;
    }

    let hand: THREE.Object3D | null = null;
    model.traverse((o) => {
      if (!(o instanceof THREE.Bone)) return;
      const base = o.name.slice(0, -3);
      const share = PITCH_SHARE.find(([n]) => n === base);
      if (share) this.pitchBones.push([o, share[1]]);
      if (base === 'mixamorigRightHand') hand = o;
    });
    if (hand) this.mountWeapon(model, hand);
  }

  // The clips only pose the hands as if holding a rifle; put a rifle in them.
  // The hand bones' axes are arbitrary, so rather than guess a transform in
  // hand space, pose the idle clip, place the rifle where it should be in the
  // avatar's frame (forward, at the hand) and store that relative to the hand.
  private mountWeapon(model: THREE.Object3D, hand: THREE.Object3D) {
    const { idle } = this.actions;
    idle.setEffectiveWeight(1);
    idle.time = 0;
    this.mixer.update(0);
    this.object.updateMatrixWorld(true);

    const handInModel = new THREE.Matrix4().copy(model.matrixWorld).invert().multiply(hand.matrixWorld);
    const handPos = new THREE.Vector3();
    const handQuat = new THREE.Quaternion();
    handInModel.decompose(handPos, handQuat, new THREE.Vector3());
    const handInverse = handQuat.clone().invert();

    const unit = 1 / this.assets.scale; // metres -> model units
    const weapon = this.assets.weapon.clone();
    weapon.scale.setScalar(unit * WEAPON_SIZE);
    // The rifle's barrel is -Z, the model's forward is +Z.
    weapon.quaternion.copy(handInverse).multiply(new THREE.Quaternion().setFromEuler(WEAPON_ROTATION));
    weapon.position.copy(WEAPON_OFFSET).multiplyScalar(unit).applyQuaternion(handInverse);
    hand.add(weapon);

    idle.setEffectiveWeight(0);
  }

  // forward / left: velocity relative to where the player faces (game units/s).
  // vy: vertical velocity. pitch: look angle, positive is up.
  update(dt: number, forward: number, left: number, vy: number, pitch: number) {
    const { clips, stride } = this.assets;
    this.forward = smooth(this.forward, forward, 12, dt);
    this.left = smooth(this.left, left, 12, dt);

    const speed = Math.hypot(this.forward, this.left);
    const clipSpeed = speed * SPEED_TO_CLIP;
    const moving = clamp01((clipSpeed - 0.15) / 0.45);
    const run = clamp01((clipSpeed - WALK_BLEND_FROM) / (WALK_BLEND_TO - WALK_BLEND_FROM));

    // Which way we are moving, as weights over the four directions.
    const dirForward = speed > 1e-3 ? this.forward / speed : 1;
    const dirLeft = speed > 1e-3 ? this.left / speed : 0;
    const raw = {
      forward: Math.max(dirForward, 0),
      back: Math.max(-dirForward, 0),
      left: Math.max(dirLeft, 0),
      right: Math.max(-dirLeft, 0),
    };
    const total = raw.forward + raw.back + raw.left + raw.right || 1;

    // Airborne: the jump clip takes over while we are moving vertically.
    if (Math.abs(vy) > 2.5) this.airTimer = 0.15;
    else this.airTimer -= dt;
    const airborne = this.airTimer > 0;
    if (airborne && !this.wasAirborne) this.jumpTime = 0;
    this.wasAirborne = airborne;
    if (airborne) this.jumpTime = Math.min(this.jumpTime + dt, clips.jump.duration - 0.001); // hold the last pose, don't loop

    const target = {} as Record<ClipName, number>;
    let strideSum = 0;
    for (const dir of Object.keys(DIRECTIONS) as (keyof typeof DIRECTIONS)[]) {
      const [walk, runClip] = DIRECTIONS[dir];
      const w = (raw[dir] / total) * moving;
      target[walk] = w * (1 - run);
      target[runClip] = w * run;
      strideSum += target[walk] * stride[walk] + target[runClip] * stride[runClip];
    }
    target.idle = 1 - moving;
    target.jump = 0;

    // Walk cycle phase advances by distance covered, so feet don't skate.
    if (moving > 0.01) {
      const cycles = Math.min((speed * LEG_SYNC) / (strideSum / moving), MAX_CYCLES);
      this.phase = (this.phase + cycles * dt) % 1;
    }
    this.idleTime += dt;

    const jumpWeight = this.weights.jump;
    for (const name of Object.keys(clips) as ClipName[]) {
      const action = this.actions[name];
      let weight = name === 'jump' ? (airborne ? 1 : 0) : target[name] * (1 - jumpWeight);
      this.weights[name] = weight = smooth(this.weights[name], weight, name === 'jump' ? 14 : 12, dt);
      action.enabled = weight > 0.002;
      action.setEffectiveWeight(weight);

      const duration = clips[name].duration;
      action.time =
        name === 'idle' ? this.idleTime % duration : name === 'jump' ? this.jumpTime : this.phase * duration;
    }
    this.mixer.update(0);

    // Bend the spine after the clips have posed it: the arms are children of
    // the upper spine, so the rifle in the hands tilts with the look.
    for (const [bone, share] of this.pitchBones) {
      tmpQuat.setFromAxisAngle(X_AXIS, -pitch * share);
      bone.quaternion.premultiply(tmpQuat);
    }
  }
}
