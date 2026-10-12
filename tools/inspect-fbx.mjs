// Prints each FBX clip's duration, track count and hips travel.
// usage: node tools/inspect-fbx.mjs <dir>
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadFbx } from './fbx.mjs';

for (const file of readdirSync(process.argv[2]).filter((f) => f.endsWith('.fbx'))) {
  const group = loadFbx(join(process.argv[2], file));
  const clip = group.animations[0];
  if (!clip) { console.log(file.padEnd(30), 'no animation'); continue; }
  const hips = clip.tracks.find((t) => /Hips\.position$/.test(t.name));
  let motion = '';
  if (hips) {
    const v = hips.values, n = v.length / 3;
    const range = (o) => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < n; i++) { lo = Math.min(lo, v[i*3+o]); hi = Math.max(hi, v[i*3+o]); } return `${lo.toFixed(0)}..${hi.toFixed(0)}`; };
    motion = `hips x ${range(0)}  y ${range(1)}  z ${range(2)}`;
  }
  console.log(file.padEnd(30), clip.duration.toFixed(2).padStart(5) + 's', String(clip.tracks.length).padStart(4), 'tracks ', motion);
}
