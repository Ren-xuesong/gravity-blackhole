import * as THREE from 'three';

// Ported from XboxNahida/ghostty-blackhole-main v3.0.0,
// src/formula_texture.cpp (MIT). The 20 × 2 atlas layout is kept intact.
export const equations = [
  'Gμν + Λ gμν = 8πG Tμν / c⁴',
  'E = mc²     rₛ = 2GM / c²',
  'iℏ ∂Ψ/∂t = ĤΨ',
  'S = kʙ c³ A / 4Gℏ',
  '∇·E = ρ/ε₀     ∇·B = 0',
  'Δx Δp ≥ ℏ/2',
  'Rμν − ½ R gμν = κ Tμν',
  'eⁱπ + 1 = 0    ∫ f(x) dx',
  'ds² = −c²dt² + dx²',
  'Tₕ = ℏc³ / 8πGMkʙ',
  'Ω² = GM / r³',
  '∂ρ/∂t + ∇·(ρv) = 0'
];

export function createFormulaAtlas(renderer) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 1024, 1024);
  ctx.font = 'italic 21px "Cambria Math", "Times New Roman", serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  for (let row = 0; row < 20; row++) {
    for (let column = 0; column < 2; column++) {
      const equation = equations[(row * 5 + column * 7) % equations.length];
      ctx.fillText(equation, column * 512 + 12 + (row % 3) * 9, row * 51 + 37);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
