// Bakes the Mixamo FBX clips into one small JSON the client loads.
// usage: node tools/convert-anims.mjs <fbx dir> [out.json]
//
// - keeps bone rotations, plus position for the hips only (the one bone that moves)
// - removes the root motion Mixamo bakes into the hips, and reports it as `speed`
//   (metres/s, x = to the character's left, z = forward) so the client can match
//   playback rate to how fast the player really moves
// - collapses tracks that never change to a single key
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadFbx } from './fbx.mjs';

const CLIPS = {
  idle: 'rifle aiming idle.fbx',
  walk: 'walking.fbx',
  walkBack: 'walking backwards.fbx',
  run: 'rifle run.fbx',
  runBack: 'run backwards.fbx',
  strafeLeft: 'strafe left.fbx',
  strafeRight: 'strafe right.fbx',
  runStrafeLeft: 'strafe (2).fbx',
  runStrafeRight: 'strafe.fbx',
  jump: 'rifle jump.fbx',
};

const [dir, out = 'public/assets/soldier/anims.json'] = process.argv.slice(2);
if (!dir) throw new Error('usage: node tools/convert-anims.mjs <fbx dir> [out.json]');

const round = (n, p = 1e4) => Math.round(n * p) / p;
const constant = (values, stride) => {
  for (let i = stride; i < values.length; i++) if (Math.abs(values[i] - values[i % stride]) > 1e-4) return false;
  return true;
};

const result = { hipsRestY: 0, clips: {} };
for (const [name, file] of Object.entries(CLIPS)) {
  const clip = loadFbx(join(dir, file)).animations[0];
  const tracks = [];
  let speed = [0, 0];
  for (const t of clip.tracks) {
    const [bone, prop] = t.name.split('.');
    const isHipsPos = bone === 'mixamorigHips' && prop === 'position';
    if (prop !== 'quaternion' && !isHipsPos) continue;

    const stride = isHipsPos ? 3 : 4;
    const values = Array.from(t.values);
    const times = Array.from(t.times);
    if (isHipsPos) {
      const n = times.length, T = times[n - 1];
      // Linear drift between first and last frame is the root motion.
      for (const axis of [0, 2]) {
        const drift = values[(n - 1) * 3 + axis] - values[axis];
        speed[axis === 0 ? 0 : 1] = drift / T / 100;
        for (let i = 0; i < n; i++) values[i * 3 + axis] -= drift * (times[i] / T);
      }
      if (name === 'idle') result.hipsRestY = round(values[1], 10);
    }
    const flat = constant(values, stride);
    tracks.push({
      bone,
      prop,
      times: flat ? [0] : times.map((x) => round(x, 1e3)),
      values: (flat ? values.slice(0, stride) : values).map((x) => round(x)),
    });
  }
  result.clips[name] = { duration: round(clip.duration, 1e3), speed: speed.map((x) => round(x, 1e2)), tracks };
  console.log(name.padEnd(15), clip.duration.toFixed(2) + 's', 'speed m/s (left, fwd):', speed.map((x) => x.toFixed(2)).join(', '));
}

writeFileSync(out, JSON.stringify(result));
console.log('wrote', out, (JSON.stringify(result).length / 1024).toFixed(0) + ' KB');
