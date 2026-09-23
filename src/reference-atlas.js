import * as THREE from 'three';
import atlasUrl from '../public/formula-atlas.png?url';

// MathJax SVG paths are rasterized at build time; no runtime font dependency.
export function createReferenceAtlas(renderer) {
  const texture=new THREE.TextureLoader().load(atlasUrl);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  return texture;
}
