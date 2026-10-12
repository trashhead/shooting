import * as THREE from 'three';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';

// The sci-fi weapon (Collada, no rig, own PBR textures), loaded once and shared
// by the first-person view and the remote soldiers. The returned group is
// ~0.85 long, centred on its origin, barrel pointing down -Z. Clone it to use it.
const textureLoader = new THREE.TextureLoader();
let loading: Promise<THREE.Group> | null = null;

export function loadWeaponModel(): Promise<THREE.Group> {
  return (loading ??= new ColladaLoader().loadAsync('/assets/weapon/model.dae').then((collada) => {
    const model = collada.scene;
    // The source barrel faces backward. Rotate first, then measure and
    // recenter: an offset computed before the rotation would end up rotated too.
    model.rotation.y = Math.PI;
    model.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    model.scale.setScalar(0.85 / Math.max(size.x, size.y, size.z));
    model.updateMatrixWorld(true);
    const center = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
    model.position.sub(center);

    const material = new THREE.MeshStandardMaterial({
      map: textureLoader.load('/assets/weapon/albedo.jpg'),
      normalMap: textureLoader.load('/assets/weapon/normal.png'),
      metalnessMap: textureLoader.load('/assets/weapon/metallic.jpg'),
      roughnessMap: textureLoader.load('/assets/weapon/roughness.jpg'),
      aoMap: textureLoader.load('/assets/weapon/ao.jpg'),
      emissiveMap: textureLoader.load('/assets/weapon/emissive.jpg'),
      emissive: new THREE.Color(0x2299ff),
      emissiveIntensity: 1.5,
      metalness: 1,
      roughness: 1,
    });
    material.map!.colorSpace = THREE.SRGBColorSpace;
    material.emissiveMap!.colorSpace = THREE.SRGBColorSpace;

    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = material;
        // aoMap reads the uv1 set; the model only has one.
        if (child.geometry.attributes.uv && !child.geometry.attributes.uv1) {
          child.geometry.setAttribute('uv1', child.geometry.attributes.uv);
        }
      }
    });

    const group = new THREE.Group();
    group.add(model);
    return group;
  }));
}
