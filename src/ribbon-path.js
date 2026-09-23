import * as THREE from 'three';

// Asymmetric, continuous broad ribbons, with different folds for each stream.
// Keep the CPU mesh and GPU travelling accents on the same parameterized path.
export function ribbonPoint(lane,t,v) {
  const s=THREE.MathUtils.smoothstep(t,.14,.8),phase=lane*1.731;
  const r=(1.4+(24+lane*.6)*Math.pow(t,.9))*(1+.035*s*Math.sin(8.2*t+phase));
  const theta=lane*Math.PI*2/7+.65-(2.9+.22*Math.sin(lane*1.8))*t
    +s*(.12*Math.sin(7.1*t+phase)+.055*Math.sin(16*t-phase));
  const bank=(lane===3?1.2:lane===4?1.02:lane===6?.65:.20)*Math.sin(Math.min(1,t*1.9)*Math.PI/2)
    +s*(.55*Math.sin(7.8*t+phase)+.15*Math.sin(15*t-.7*phase));
  const width=(1.1+r*.30)*(lane%2===0||lane===3?1:.52)*THREE.MathUtils.smoothstep(t,0,.20)
    *(1+s*(.18*Math.sin(9*t+phase)+.09*Math.sin(19*t-phase)));
  const across=v-.5,radius=r+across*width*Math.cos(bank);
  const lift=(lane===3?1.55:lane===4?.4:0)*THREE.MathUtils.smoothstep(t,.1,.5);
  const crest=lane===3?.70*Math.exp(-Math.pow((t-.45)/.075,2))-.45*Math.exp(-Math.pow((t-.58)/.06,2)):0;
  const fold=s*(.85*Math.sin(9*t+phase)+.35*Math.sin(17*t-.5*phase))+crest
    +across*across*width*.50*s*Math.sin(10*t+phase);
  const y=(-.50-2.1*t+.65*Math.sin(t*4.4+lane)*t+across*width*Math.sin(bank)+lift+fold)*THREE.MathUtils.smoothstep(r,1.8,4.8);
  return {point:new THREE.Vector3(Math.cos(theta)*radius,y,Math.sin(theta)*radius),width};
}

export const ribbonPathGLSL=/* glsl */ `
vec3 ribbonPath(float lane,float t,float v){
  float s=smoothstep(0.14,0.8,t),phase=lane*1.731;
  float r=(1.4+(24.0+lane*0.6)*pow(t,0.9))*(1.0+0.035*s*sin(8.2*t+phase));
  float theta=lane*0.897597901+0.65-(2.9+0.22*sin(lane*1.8))*t
    +s*(0.12*sin(7.1*t+phase)+0.055*sin(16.0*t-phase));
  float bank=(lane==3.0?1.2:(lane==4.0?1.02:(lane==6.0?0.65:0.20)))*sin(min(1.0,t*1.9)*1.570796327)
    +s*(0.55*sin(7.8*t+phase)+0.15*sin(15.0*t-0.7*phase));
  float width=(1.1+r*0.30)*(mod(lane,2.0)<0.5||lane==3.0?1.0:0.52)*smoothstep(0.0,0.20,t)
    *(1.0+s*(0.18*sin(9.0*t+phase)+0.09*sin(19.0*t-phase)));
  float across=v-0.5,radius=r+across*width*cos(bank);
  float lift=(lane==3.0?1.55:(lane==4.0?0.4:0.0))*smoothstep(0.1,0.5,t);
  float crestA=(t-0.45)/0.075,crestB=(t-0.58)/0.06;
  float crest=lane==3.0?0.70*exp(-crestA*crestA)-0.45*exp(-crestB*crestB):0.0;
  float fold=s*(0.85*sin(9.0*t+phase)+0.35*sin(17.0*t-0.5*phase))+crest
    +across*across*width*0.50*s*sin(10.0*t+phase);
  float y=(-0.50-2.1*t+0.65*sin(t*4.4+lane)*t+across*width*sin(bank)+lift+fold)*smoothstep(1.8,4.8,r);
  return vec3(cos(theta)*radius,y,sin(theta)*radius);
}
`;
export const ribbonMotionGLSL=/* glsl */ `
vec3 ribbonMotion(vec3 p,float t,float lane,float time){
  float envelope=smoothstep(0.12,0.70,t),phase=lane*1.731;
  p.y+=envelope*(0.14*sin(t*11.0+phase-time*0.35)+0.08*sin(t*23.0-phase+time*0.20));
  p.xz+=normalize(p.xz)*envelope*0.065*sin(t*13.0+phase+time*0.26);
  return p;
}
`;
