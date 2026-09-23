import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createReferenceAtlas } from './reference-atlas.js';
import { createRibbonEngine } from './ribbon-engine.js';

const experience=document.querySelector('#experience');
const canvas=document.querySelector('#universe');
const status=document.querySelector('#status');
const cinemaButton=document.querySelector('#cinema-button');
const orbitButton=document.querySelector('#orbit-view');
const topButton=document.querySelector('#top-view');
const pauseButton=document.querySelector('#pause-button');
const resetButton=document.querySelector('#reset-button');
let renderer;
try {
  renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});
} catch(error) {
  console.warn('WebGL is unavailable; using the canvas renderer.',error);
  import('./formula-field.js');
}
if(renderer) {
  renderer.setClearColor(0x000000,1);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.0;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  const camera=new THREE.PerspectiveCamera(46,1,0.1,300);
  const controls=new OrbitControls(camera,canvas);
  controls.enableDamping=true;
  controls.dampingFactor=0.075;
  controls.minDistance=7;
  controls.maxDistance=65;
  controls.rotateSpeed=0.60;
  controls.zoomSpeed=0.7;
  controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.ROTATE,RIGHT:THREE.MOUSE.PAN};
  controls.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_PAN};
  const phase={value:12};
  const waveCenter={value:new THREE.Vector2(10000,10000)};
  const waveAge={value:100};
  const engine=createRibbonEngine({renderer,camera,atlas:createReferenceAtlas(renderer),phase,waveCenter,waveAge});
  const raycaster=new THREE.Raycaster();
  const equator=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  const point=new THREE.Vector3();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let paused=reduced,roll=-0.50,previous=0,width=1,height=1;
  let pointer=null;
  let fpsStart=0,frames=0;
  function view(name) {
    controls.target.set(0,0,0);
    if(name==='top'){camera.position.set(0,22,9);roll=-0.15;}
    else if(name==='front'){camera.position.set(0,1.1,22);roll=0;}
    else {camera.position.set(-9.67,3.36,15.77);roll=-0.50;}
    controls.update();
    orbitButton.classList.toggle('active',name==='orbit');
    topButton.classList.toggle('active',name==='top');
    orbitButton.setAttribute('aria-pressed',String(name==='orbit'));
    topButton.setAttribute('aria-pressed',String(name==='top'));
    const frontButton=document.querySelector('#front-view');
    frontButton.classList.toggle('active',name==='front');
    frontButton.setAttribute('aria-pressed',String(name==='front'));
    status.textContent=name==='top'?'已切换俯瞰视角':name==='front'?'已切换正面视角':'已重置轨道视角';
  }
  function resize() {
    const rect=experience.getBoundingClientRect();
    width=Math.round(rect.width);height=Math.round(rect.height);
    const dpr=Math.min(devicePixelRatio||1,1.5);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width,height,false);
    camera.aspect=width/height;
    camera.fov=width/height<.8?60:46;
    camera.updateProjectionMatrix();
    engine.resize(width,height,dpr);
  }
  function pulse(x,y) {
    raycaster.setFromCamera(new THREE.Vector2(x*2-1,1-y*2),camera);
    if(raycaster.ray.intersectPlane(equator,point)) {
      waveCenter.value.set(point.x,point.z);
      waveAge.value=0;
      status.textContent='已激发曲面引力波纹';
    }
  }
  function togglePause() {
    paused=!paused;
    pauseButton.textContent=paused?'▶':'Ⅱ';
    pauseButton.setAttribute('aria-label',paused?'播放动画':'暂停动画');
    status.textContent=paused?'动画已暂停':'动画已播放';
  }
  function toggleCinema() {
    const active=experience.classList.toggle('cinema-mode');
    cinemaButton.setAttribute('aria-pressed',String(active));
    cinemaButton.setAttribute('aria-label',active?'显示操作界面':'进入纯画面模式');
    cinemaButton.innerHTML=active?'操作 <span>↙</span>':'纯画面 <span>↗</span>';
  }
  canvas.addEventListener('pointerdown',e=>{pointer={x:e.clientX,y:e.clientY,button:e.button};canvas.classList.add('dragging');});
  canvas.addEventListener('pointerup',e=>{
    if(pointer&&pointer.button===0&&Math.hypot(pointer.x-e.clientX,pointer.y-e.clientY)<4) {
      const rect=canvas.getBoundingClientRect();pulse((e.clientX-rect.left)/width,(e.clientY-rect.top)/height);
    }
    pointer=null;canvas.classList.remove('dragging');
  });
  canvas.addEventListener('pointercancel',()=>{pointer=null;canvas.classList.remove('dragging');});
  cinemaButton.addEventListener('click',toggleCinema);
  orbitButton.addEventListener('click',()=>view('orbit'));
  topButton.addEventListener('click',()=>view('top'));
  resetButton.addEventListener('click',()=>view('orbit'));
  pauseButton.addEventListener('click',togglePause);
  document.querySelector('#front-view')?.addEventListener('click',()=>view('front'));
  window.addEventListener('keydown',e=>{
    if(e.target instanceof HTMLElement && e.target.closest('button,input,textarea,select'))return;
    if(e.key.toLowerCase()==='r')view('orbit');
    else if(e.key.toLowerCase()==='i')toggleCinema();
    else if(e.key===' '){togglePause();e.preventDefault();}
    else if(e.code==='Numpad1')view('front');
    else if(e.code==='Numpad7')view('top');
  });
  if(paused){pauseButton.textContent='▶';pauseButton.setAttribute('aria-label','播放动画');}
  const webTools=[
    {name:'set_black_hole_view',title:'切换黑洞视角',description:'切换轨道、正面或俯瞰视角。',
      inputSchema:{type:'object',properties:{view:{type:'string',enum:['orbit','front','top']}},required:['view']},
      execute(input){view(input.view);return {status:'updated',view:input.view};}},
    {name:'trigger_gravitational_wave',title:'激发引力波纹',description:'在相对画面位置触发曲面波纹。',
      inputSchema:{type:'object',properties:{x:{type:'number'},y:{type:'number'}},required:['x','y']},
      execute(input){pulse(input.x,input.y);return {status:'triggered'};}}
  ];
  if(document.modelContext?.registerTool)for(const tool of webTools) {
    try {Promise.resolve(document.modelContext.registerTool(tool)).catch(()=>{});}catch(_){}
  }
  function render(now) {
    requestAnimationFrame(render);
    const delta=previous?Math.min((now-previous)/1000,0.1):0;
    previous=now;
    if(document.hidden)return;
    if(!paused)phase.value+=delta;
    waveAge.value+=delta;
    controls.update();
    camera.rotateZ(roll);
    camera.updateMatrixWorld();
    engine.render();
    frames++;
    if(now-fpsStart>1500){canvas.dataset.fps=(frames*1000/(now-fpsStart)).toFixed(1);fpsStart=now;frames=0;}
  }
  window.addEventListener('resize',resize,{passive:true});
  view('orbit');resize();requestAnimationFrame(render);
}
