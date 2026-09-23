import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { vertexShader, fragmentShader } from './relativistic-shader.js';

export function createRelativisticEngine({ renderer, camera, atlas, phase, waveCenter, waveAge }) {
  const uniforms = {
    uAtlas: { value: atlas }, uTime: phase,
    uWaveCenter: waveCenter, uWaveAge: waveAge,
    uResolution: { value: new THREE.Vector2(1280,720) },
    uEye: { value: camera.position },
    uRight: { value: new THREE.Vector3() },
    uUp: { value: new THREE.Vector3() },
    uForward: { value: new THREE.Vector3() },
    uTanFov: { value: Math.tan(THREE.MathUtils.degToRad(camera.fov/2)) }
  };
  const scene = new THREE.Scene();
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(2,2), new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader, depthTest:false, depthWrite:false
  }));
  screen.frustumCulled=false;
  scene.add(screen);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene,camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1280,720),0.35,0.34,0.80));
  composer.addPass(new OutputPass());
  return {
    resize(width,height,dpr) {
      uniforms.uResolution.value.set(width*dpr,height*dpr);
      composer.setPixelRatio(dpr);
      composer.setSize(width,height);
    },
    render() {
      uniforms.uRight.value.setFromMatrixColumn(camera.matrixWorld,0);
      uniforms.uUp.value.setFromMatrixColumn(camera.matrixWorld,1);
      uniforms.uForward.value.setFromMatrixColumn(camera.matrixWorld,2).negate();
      composer.render();
    }
  };
}
