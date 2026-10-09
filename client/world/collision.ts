import * as THREE from 'three';
import { boxes } from './world';
import { BOX_HALF_EXTENT, FLOOR_SIZE } from '../../shared/constants';

// Push a circle (the player) out of any box it walked into.
export function resolveBoxCollisions(position: THREE.Vector3, radius: number) {
  for (const box of boxes) {
    const dx = position.x - box.position.x;
    const dz = position.z - box.position.z;

    // Center already inside the footprint (big single-frame step): push out
    // along whichever axis is shorter, there's no closest-point direction.
    if (Math.abs(dx) < BOX_HALF_EXTENT && Math.abs(dz) < BOX_HALF_EXTENT) {
      const pushX = BOX_HALF_EXTENT + radius - Math.abs(dx);
      const pushZ = BOX_HALF_EXTENT + radius - Math.abs(dz);
      if (pushX < pushZ) position.x = box.position.x + Math.sign(dx || 1) * (BOX_HALF_EXTENT + radius);
      else position.z = box.position.z + Math.sign(dz || 1) * (BOX_HALF_EXTENT + radius);
      continue;
    }

    const diffX = dx - THREE.MathUtils.clamp(dx, -BOX_HALF_EXTENT, BOX_HALF_EXTENT);
    const diffZ = dz - THREE.MathUtils.clamp(dz, -BOX_HALF_EXTENT, BOX_HALF_EXTENT);
    const distSq = diffX * diffX + diffZ * diffZ;
    if (distSq < radius * radius && distSq > 1e-9) {
      const dist = Math.sqrt(distSq);
      const push = (radius - dist) / dist;
      position.x += diffX * push;
      position.z += diffZ * push;
    }
  }
}

// Keep the player on the floor.
export function clampToFloor(position: THREE.Vector3, radius: number) {
  const limit = FLOOR_SIZE / 2 - radius;
  position.x = THREE.MathUtils.clamp(position.x, -limit, limit);
  position.z = THREE.MathUtils.clamp(position.z, -limit, limit);
}
