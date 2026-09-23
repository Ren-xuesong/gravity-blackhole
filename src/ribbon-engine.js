import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as shaders from './ribbon-shaders.js';
import { ribbonPoint } from './ribbon-path.js';

function ribbonGeometry(lane) {
  const lengthSteps=320,widthSteps=20,positions=[],uvs=[],metrics=[],indices=[];
  let arc=0,previous=ribbonPoint(lane,0,.5).point;
  for(let i=0;i<=lengthSteps;i++) {
    const t=i/lengthSteps*1.25;
    const center=ribbonPoint(lane,t,.5);
    arc+=center.point.distanceTo(previous);previous=center.point;
    for(let j=0;j<=widthSteps;j++) {
      const v=j/widthSteps,p=ribbonPoint(lane,t,v).point;
      positions.push(p.x,p.y,p.z);uvs.push(i/lengthSteps,v);metrics.push(arc,(v-.5)*center.width);
      if(i<lengthSteps&&j<widthSteps) {
        const a=i*(widthSteps+1)+j,b=a+widthSteps+1;
        indices.push(a,b,a+1,b,b+1,a+1);
      }
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  g.setAttribute('aMetric',new THREE.Float32BufferAttribute(metrics,2));
  g.setIndex(indices);g.computeVertexNormals();
  return g;
}

export function createRibbonEngine({renderer,camera,atlas,phase,waveCenter,waveAge}) {
  const scene=new THREE.Scene();
  const uniforms={uAtlas:{value:atlas},uTime:phase,uWaveCenter:waveCenter,uWaveAge:waveAge,
    uEye:{value:camera.position},uRight:{value:new THREE.Vector3()},uUp:{value:new THREE.Vector3()},
    uForward:{value:new THREE.Vector3()},uTanFov:{value:1},uAspect:{value:1},uPixelHeight:{value:810},uDpr:{value:1}};
  const additive={transparent:true,depthWrite:false,blending:THREE.AdditiveBlending};
  const shadow=new THREE.Mesh(new THREE.SphereGeometry(1.94,80,48),new THREE.MeshBasicMaterial({colorWrite:false}));
  scene.add(shadow);
  let seed=18413;
  function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
  const starPositions=[],sizes=[],seeds=[],colors=[];
  for(let i=0;i<48000;i++) {
    const az=random()*Math.PI*2,z=random()*2-1,r=110+random()*70,s=Math.sqrt(1-z*z);
    starPositions.push(Math.cos(az)*s*r,z*r,Math.sin(az)*s*r);
    const hero=random()>.997;
    sizes.push(hero?5+random()*3:.65+random()*1.1);seeds.push(random());
    const brightness=hero?3.4+random()*1.8:.20+Math.pow(random(),3)*1.1;
    const cool=random()>.55;
    colors.push(brightness*(cool?.68:1),brightness*(cool?.84:.88),brightness*(cool?1:.64));
  }
  const starsGeometry=new THREE.BufferGeometry();
  starsGeometry.setAttribute('position',new THREE.Float32BufferAttribute(starPositions,3));
  starsGeometry.setAttribute('aSize',new THREE.Float32BufferAttribute(sizes,1));
  starsGeometry.setAttribute('aSeed',new THREE.Float32BufferAttribute(seeds,1));
  starsGeometry.setAttribute('aColor',new THREE.Float32BufferAttribute(colors,3));
  const stars=new THREE.Points(starsGeometry,new THREE.ShaderMaterial({...additive,depthTest:false,uniforms,
    vertexShader:shaders.starVertex,fragmentShader:shaders.starFragment}));
  stars.renderOrder=-5;scene.add(stars);
  const core=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({uniforms,
    vertexShader:shaders.coreVertex,fragmentShader:shaders.coreFragment,transparent:true,
    depthTest:false,depthWrite:false,blending:THREE.CustomBlending,
    blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor}));
  core.renderOrder=-2;core.frustumCulled=false;scene.add(core);
  for(let lane=0;lane<7;lane++) {
    const material=new THREE.ShaderMaterial({...additive,side:THREE.DoubleSide,forceSinglePass:true,
      uniforms:{...uniforms,uLane:{value:lane},uOpacity:{value:[.64,.27,.58,.92,.58,.25,.70][lane]},uOffset:{value:lane*.173}},
      vertexShader:shaders.ribbonVertex,fragmentShader:shaders.ribbonFragment});
    scene.add(new THREE.Mesh(ribbonGeometry(lane),material));
  }
  const plane=new THREE.PlaneGeometry(1,1);
  const glyphGeometry=new THREE.InstancedBufferGeometry();
  glyphGeometry.index=plane.index;
  glyphGeometry.setAttribute('position',plane.attributes.position);
  glyphGeometry.setAttribute('uv',plane.attributes.uv);
  glyphGeometry.setAttribute('aSeed',new THREE.InstancedBufferAttribute(Float32Array.from({length:168},(_,i)=>i),1));
  glyphGeometry.instanceCount=168;
  const glyphs=new THREE.Mesh(glyphGeometry,new THREE.ShaderMaterial({...additive,side:THREE.DoubleSide,forceSinglePass:true,
    uniforms,vertexShader:shaders.particleVertex,fragmentShader:shaders.particleFragment}));
  glyphs.frustumCulled=false;scene.add(glyphs);
  const composer=new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene,camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1440,810),.42,.30,1.10));
  composer.addPass(new OutputPass());
  return {
    resize(width,height,dpr){
      uniforms.uAspect.value=width/height;uniforms.uPixelHeight.value=height*dpr;uniforms.uDpr.value=dpr;
      composer.setPixelRatio(dpr);composer.setSize(width,height);
    },
    render(){
      uniforms.uRight.value.setFromMatrixColumn(camera.matrixWorld,0);
      uniforms.uUp.value.setFromMatrixColumn(camera.matrixWorld,1);
      uniforms.uForward.value.setFromMatrixColumn(camera.matrixWorld,2).negate();
      uniforms.uTanFov.value=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
      composer.render();
    }
  };
}
