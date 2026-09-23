import * as THREE from 'three';
import { createFormulaAtlas } from './physics-source.js';
import {
  surfaceVertex, surfaceFragment, diskVertex, diskFragment,
  haloVertex, haloFragment, starsVertex, starsFragment
} from './scene-shaders.js';

const experience = document.querySelector('#experience');
const canvas = document.querySelector('#universe');
const status = document.querySelector('#status');
const cinemaButton = document.querySelector('#cinema-button');
const orbitButton = document.querySelector('#orbit-view');
const topButton = document.querySelector('#top-view');
const pauseButton = document.querySelector('#pause-button');
const resetButton = document.querySelector('#reset-button');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = THREE.MathUtils.clamp;
const TAU = Math.PI * 2;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  console.warn('WebGL unavailable; switching to canvas fallback', error);
  import('./formula-field.js');
}

if (renderer) {
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 280);
  const lookTarget = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3();
  const angles = { yaw: -.12, pitch: .28, distance: 13.2, targetYaw: -.12, targetPitch: .28, targetDistance: 13.2 };
  const cameraOffset = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const equator = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const waveCenter = { value: new THREE.Vector2(10000, 10000) };
  const waveAge = { value: 100 }; 
  const phase = { value: 0 };
  const formulaAtlas = createFormulaAtlas(renderer);
  let previousFrame = 0;
  let paused = reduceMotion;
  let drag = null;
  let width = 1, height = 1, dpr = 1;
  const ripples = [];
  const fxCanvas = document.createElement('canvas');
  fxCanvas.className = 'wave-overlay';
  fxCanvas.setAttribute('aria-hidden', 'true');
  experience.insertBefore(fxCanvas, experience.querySelector('.grain'));
  const fx = fxCanvas.getContext('2d');

  function makeAnnulus(inner, outer, radialSteps, angularSteps) {
    const positions = [];
    const indices = [];
    for (let radial = 0; radial <= radialSteps; radial++) {
      const r = inner + (outer-inner)*radial/radialSteps;
      for (let angular = 0; angular <= angularSteps; angular++) {
        const theta = angular/angularSteps*TAU;
        positions.push(Math.cos(theta)*r, 0, Math.sin(theta)*r);
      }
    }
    for (let radial = 0; radial < radialSteps; radial++) {
      for (let angular = 0; angular < angularSteps; angular++) {
        const a = radial*(angularSteps+1)+angular;
        const b = a+angularSteps+1;
        indices.push(a,b,a+1,b,b+1,a+1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    return geometry;
  }

  function makeStars() {
    let seed = 9170831;
    const rand = () => ((seed = (Math.imul(seed, 1664525)+1013904223)>>>0)/4294967296);
    const positions = [], sizes = [], warmth = [];
    for (let i = 0; i < 2800; i++) {
      const z = rand()*2-1;
      const theta = rand()*TAU;
      const radius = 85+rand()*80;
      const h = Math.sqrt(1-z*z);
      positions.push(Math.cos(theta)*h*radius,z*radius,Math.sin(theta)*h*radius);
      sizes.push(rand()<.975 ? .6+rand()*1.25 : 2.1+rand()*1.6);
      warmth.push(rand());
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('aSize',new THREE.Float32BufferAttribute(sizes,1));
    geometry.setAttribute('aWarm',new THREE.Float32BufferAttribute(warmth,1));
    const material = new THREE.ShaderMaterial({
      vertexShader: starsVertex, fragmentShader: starsFragment,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    scene.add(new THREE.Points(geometry,material));
  }

  function makeFormulaSurfaces() {
    const geometry = makeAnnulus(3.05, 38, 136, 248);
    for (let layer = 0; layer < 3; layer++) {
      const material = new THREE.ShaderMaterial({
        vertexShader: surfaceVertex,
        fragmentShader: surfaceFragment,
        uniforms: {
          uAtlas: { value: formulaAtlas },
          uTime: phase,
          uLayer: { value: layer },
          uWaveCenter: waveCenter,
          uWaveAge: waveAge
        },
        transparent: true, side: THREE.DoubleSide,
        depthWrite: false, depthTest: true
      });
      const sheet = new THREE.Mesh(geometry,material);
      sheet.frustumCulled = false;
      sheet.renderOrder = 2+layer;
      scene.add(sheet);
    }
  }

  function makeDiskAndHorizon() {
    const disk = new THREE.Mesh(makeAnnulus(2.6, 18, 74, 240), new THREE.ShaderMaterial({
      vertexShader: diskVertex, fragmentShader: diskFragment,
      uniforms: { uTime: phase }, transparent: true,
      side: THREE.DoubleSide, depthWrite: false, depthTest: true
    }));
    disk.position.y = .015;
    disk.renderOrder = 1;
    scene.add(disk);

    const shadow = new THREE.Mesh(new THREE.SphereGeometry(2.24,64,48),
      new THREE.MeshBasicMaterial({ color: 0x010101, depthWrite: true }));
    shadow.renderOrder = 0;
    scene.add(shadow);

    const halo = new THREE.Mesh(new THREE.PlaneGeometry(6.3,6.3),new THREE.ShaderMaterial({
      vertexShader: haloVertex, fragmentShader: haloFragment,
      transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending
    }));
    halo.renderOrder = 20;
    scene.add(halo);
    return halo;
  }

  makeStars();
  makeFormulaSurfaces();
  const halo = makeDiskAndHorizon();

  function resize() {
    const rect = experience.getBoundingClientRect();
    width = Math.max(1,Math.round(rect.width));
    height = Math.max(1,Math.round(rect.height));
    dpr = Math.min(devicePixelRatio || 1,width<760 ? 1.25 : 1.5);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width,height,false);
    camera.aspect = width/height;
    camera.updateProjectionMatrix();
    fxCanvas.width = Math.round(width*dpr);
    fxCanvas.height = Math.round(height*dpr);
    fxCanvas.style.width = `${width}px`;
    fxCanvas.style.height = `${height}px`;
    fx.setTransform(dpr,0,0,dpr,0,0);
  }

  function updateCamera(delta) {
    const ease = 1-Math.exp(-delta*7);
    angles.yaw = THREE.MathUtils.lerp(angles.yaw,angles.targetYaw,ease);
    angles.pitch = THREE.MathUtils.lerp(angles.pitch,angles.targetPitch,ease);
    angles.distance = THREE.MathUtils.lerp(angles.distance,angles.targetDistance,ease);
    lookTarget.lerp(desiredTarget,ease);
    cameraOffset.set(
      Math.sin(angles.yaw)*Math.cos(angles.pitch)*angles.distance,
      Math.sin(angles.pitch)*angles.distance,
      Math.cos(angles.yaw)*Math.cos(angles.pitch)*angles.distance
    );
    camera.position.copy(lookTarget).add(cameraOffset);
    camera.lookAt(lookTarget);
    camera.updateMatrixWorld();
    halo.position.set(0, 0, 0);
    halo.quaternion.copy(camera.quaternion);
  }

  function paintRipples(delta) {
    fx.clearRect(0,0,width,height);
    for (let i = ripples.length-1; i >= 0; i--) {
      const wave = ripples[i];
      wave.age += delta;
      if (wave.age > 1.7) { ripples.splice(i,1); continue; }
      const opacity = Math.pow(1-wave.age/1.7,1.5);
      for (let ring = 0; ring < 3; ring++) {
        const age = wave.age-ring*.12;
        if (age <= 0) continue;
        fx.beginPath();
        fx.ellipse(wave.x,wave.y,age*Math.min(width,height)*.36,
          age*Math.min(width,height)*.29,0,0,TAU);
        fx.lineWidth = ring===0 ? 1.8 : .8;
        fx.strokeStyle = `rgba(255,219,154,${opacity*(.48-ring*.12)})`;
        fx.shadowColor = '#e4b372';
        fx.shadowBlur = ring===0 ? 12 : 4;
        fx.stroke();
      }
    }
    fx.shadowBlur = 0;
  }

  function render(now) {
    requestAnimationFrame(render);
    if (!previousFrame) previousFrame = now;
    const delta = Math.min(.05,(now-previousFrame)/1000);
    previousFrame = now;
    if (document.hidden) return;
    if (!paused) phase.value += delta;
    waveAge.value += delta;
    updateCamera(delta);
    paintRipples(delta);
    renderer.render(scene,camera);
  }

  function setView(view) {
    const top = view==='top';
    angles.targetYaw = top ? -.18 : -.12;
    angles.targetPitch = top ? 1.35 : .28;
    angles.targetDistance = top ? 22 : 13.2;
    desiredTarget.set(0,0,0);
    orbitButton.classList.toggle('active',!top);
    topButton.classList.toggle('active',top);
    orbitButton.setAttribute('aria-pressed',String(!top));
    topButton.setAttribute('aria-pressed',String(top));
    status.textContent = top ? '已切换到俯瞰视角' : '已切换到轨道视角';
  }

  function rippleAt(x,y) {
    const ndc = new THREE.Vector2(x/width*2-1,1-y/height*2);
    raycaster.setFromCamera(ndc,camera);
    if (raycaster.ray.intersectPlane(equator,hit)) {
      waveCenter.value.set(hit.x,hit.z);
      waveAge.value = 0;
    }
    ripples.push({x,y,age:0});
    if (ripples.length>6) ripples.shift();
    status.textContent = '时空波纹已激发';
  }

  canvas.addEventListener('pointerdown',event => {
    canvas.setPointerCapture(event.pointerId);
    drag = {
      x:event.clientX,y:event.clientY,
      startX:event.clientX,startY:event.clientY,
      moved:false,
      mode:event.button===1 || event.button===2 || event.shiftKey ? 'pan' : 'orbit'
    };
    canvas.classList.add('dragging');
    event.preventDefault();
  });
  canvas.addEventListener('pointermove',event => {
    if (!drag) return;
    const dx = event.clientX-drag.x;
    const dy = event.clientY-drag.y;
    drag.x=event.clientX; drag.y=event.clientY;
    if (Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>4) drag.moved=true;
    if (drag.mode==='pan' || event.shiftKey) {
      const scale = 2*angles.distance*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/height;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix,0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix,1);
      desiredTarget.addScaledVector(right,-dx*scale);
      desiredTarget.addScaledVector(up,dy*scale);
    } else {
      angles.targetYaw -= dx*.005;
      angles.targetPitch = clamp(angles.targetPitch+dy*.004,-1.15,1.48);
      orbitButton.classList.remove('active');
      topButton.classList.remove('active');
    }
  });
  function endPointer(event) {
    if (drag && !drag.moved && event.button===0) {
      const rect = canvas.getBoundingClientRect();
      rippleAt(event.clientX-rect.left,event.clientY-rect.top);
    }
    drag=null;
    canvas.classList.remove('dragging');
  }
  canvas.addEventListener('pointerup',endPointer);
  canvas.addEventListener('pointercancel',() => {drag=null;canvas.classList.remove('dragging');});
  canvas.addEventListener('contextmenu',event => event.preventDefault());
  canvas.addEventListener('wheel',event => {
    event.preventDefault();
    angles.targetDistance = clamp(angles.targetDistance*Math.exp(event.deltaY*.001),8.5,52);
  },{passive:false});

  function toggleCinema() {
    const active = experience.classList.toggle('cinema-mode');
    cinemaButton.setAttribute('aria-pressed',String(active));
    cinemaButton.setAttribute('aria-label',active ? '显示操作界面' : '进入纯画面模式');
    cinemaButton.innerHTML = active ? '操作 <span>↙</span>' : '纯画面 <span>↗</span>';
  }
  cinemaButton.addEventListener('click',toggleCinema);
  orbitButton.addEventListener('click',() => setView('orbit'));
  topButton.addEventListener('click',() => setView('top'));
  resetButton.addEventListener('click',() => setView('orbit'));
  pauseButton.addEventListener('click',() => {
    paused=!paused;
    pauseButton.textContent=paused ? '▶' : 'Ⅱ';
    pauseButton.setAttribute('aria-label',paused ? '播放动画' : '暂停动画');
    status.textContent=paused ? '动画已暂停' : '动画已播放';
  });
  if (paused) { pauseButton.textContent='▶'; pauseButton.setAttribute('aria-label','播放动画'); }

  window.addEventListener('keydown',event => {
    if (event.target instanceof HTMLElement && event.target.closest('button,input,textarea,select')) return;
    const key=event.key.toLowerCase();
    if (key==='arrowleft') angles.targetYaw+=.12;
    else if (key==='arrowright') angles.targetYaw-=.12;
    else if (key==='arrowup') angles.targetPitch=clamp(angles.targetPitch-.1,-1.15,1.48);
    else if (key==='arrowdown') angles.targetPitch=clamp(angles.targetPitch+.1,-1.15,1.48);
    else if (key==='+' || key==='=') angles.targetDistance=clamp(angles.targetDistance*.88,8.5,52);
    else if (key==='-' || key==='_') angles.targetDistance=clamp(angles.targetDistance*1.12,8.5,52);
    else if (key==='r') setView('orbit');
    else if (key==='i') toggleCinema();
    else if (key===' ') pauseButton.click();
    else return;
    event.preventDefault();
  });

  if (document.modelContext?.registerTool) {
    for (const tool of [
      {
        name:'set_black_hole_view',title:'切换黑洞视角',
        description:'切换轨道视角或俯瞰视角。',
        inputSchema:{type:'object',properties:{view:{type:'string',enum:['orbit','top']}},required:['view'],additionalProperties:false},
        execute(input){setView(input.view);return {view:input.view,status:'updated'};}
      },
      {
        name:'trigger_gravitational_wave',title:'激发引力波纹',
        description:'在指定的相对位置激发可见波纹。',
        inputSchema:{type:'object',properties:{x:{type:'number',minimum:0,maximum:1},y:{type:'number',minimum:0,maximum:1}},required:['x','y'],additionalProperties:false},
        execute(input){rippleAt(input.x*width,input.y*height);return {status:'triggered'};}
      }
    ]) {
      try { Promise.resolve(document.modelContext.registerTool(tool)).catch(()=>{}); } catch (_) { /* Optional browser interface. */ }
    }
  }

  window.addEventListener('resize',resize,{passive:true});
  resize();
  updateCamera(.016);
  requestAnimationFrame(render);
}
