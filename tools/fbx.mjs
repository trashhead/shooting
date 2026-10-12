// Loads Mixamo FBX files in Node. three's FBXLoader decides where the node
// list ends by guessing the footer size, which goes wrong for some Mixamo
// files (it then parses footer bytes as a node and throws). The node list is
// terminated by a null record, so we stop there instead - a patched copy of
// the loader is written next to the original so its imports still resolve.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';


const loaderDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'three', 'examples', 'jsm', 'loaders');
const source = readFileSync(join(loaderDir, 'FBXLoader.js'), 'utf8');
const marker = 'if ( node !== null ) allNodes.add( node.name, node );';
if (!source.includes(marker)) throw new Error('FBXLoader changed: update the patch in tools/fbx.mjs');
const patched = join(loaderDir, 'FBXLoader.patched.js');
writeFileSync(patched, source.replace(marker, 'if ( node === null ) break; allNodes.add( node.name, node );'));
const { FBXLoader } = await import(pathToFileURL(patched).href);

export function loadFbx(file) {
  const buf = readFileSync(file);
  return new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
}
