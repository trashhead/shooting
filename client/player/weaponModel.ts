import * as THREE from 'three';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// The sci-fi weapon (Collada, no rig, own PBR textures), loaded once and shared
// by the first-person view and the remote soldiers. The returned group is
// ~0.85 long, centred on its origin, barrel pointing down -Z. Clone it to use it.
const textureLoader = new THREE.TextureLoader();
let loading: Promise<THREE.Group> | null = null;

// The sniper rifle (glTF with its own materials). Its axes are unknown, so it
// is oriented by measurement: longest axis -> Z, and the end farther from the
// model's origin (the barrel; the origin sits near the stock/receiver) -> -Z.
const SNIPER_LENGTH = 1.25;
let loadingSniper: Promise<THREE.Group> | null = null;

export function loadSniperModel(): Promise<THREE.Group> {
  return (loadingSniper ??= new GLTFLoader().loadAsync('/assets/sniper/chg_sniper-rifle.glb').then((gltf) => {
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());

    const aligner = new THREE.Group();
    aligner.add(model);
    if (size.x >= size.y && size.x >= size.z) aligner.rotation.y = Math.PI / 2;
    else if (size.y >= size.x && size.y >= size.z) aligner.rotation.x = Math.PI / 2;
    aligner.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(aligner);
    if (box.max.z > -box.min.z) aligner.rotation.y += Math.PI; // barrel was on +Z
    aligner.updateMatrixWorld(true);

    const fitted = new THREE.Box3().setFromObject(aligner);
    const scale = SNIPER_LENGTH / (fitted.max.z - fitted.min.z);
    aligner.scale.setScalar(scale);
    aligner.updateMatrixWorld(true);
    const center = new THREE.Box3().setFromObject(aligner).getCenter(new THREE.Vector3());
    aligner.position.sub(center);

    const group = new THREE.Group();
    group.add(aligner);
    return group;
  }));
}

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
