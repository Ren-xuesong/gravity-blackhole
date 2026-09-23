import { ribbonPathGLSL,ribbonMotionGLSL } from './ribbon-path.js';

export const ribbonVertex = /* glsl */ `
uniform float uTime;
uniform float uLane;
uniform vec2 uWaveCenter;
uniform float uWaveAge;
attribute vec2 aMetric;
varying vec2 vUv,vMetric;
varying vec3 vWorld;
${ribbonMotionGLSL}
void main(){
  vec3 p=ribbonMotion(position,uv.x*1.25,uLane,uTime);
  float d=length(p.xz-uWaveCenter)-uWaveAge*5.0;
  float wave=exp(-d*d/1.2)*max(0.0,1.0-uWaveAge/3.0);
  p+=normal*wave*0.6*smoothstep(2.0,4.0,length(p));
  vWorld=(modelMatrix*vec4(p,1.0)).xyz;
  vUv=uv;vMetric=aMetric;
  gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.0);
}
`;
export const ribbonFragment = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uTime,uOpacity,uOffset;
uniform vec2 uWaveCenter;
uniform float uWaveAge;
varying vec2 vUv,vMetric;
varying vec3 vWorld;
void main(){
  vec2 tex=vMetric/vec2(12.0,9.0)+vec2(uTime*0.043,uOffset);
  float ink=texture2D(uAtlas,tex).a;
  float fine=texture2D(uAtlas,tex*vec2(3.2,3.8)+vec2(0.17,0.31)).a;
  float micro=texture2D(uAtlas,tex*vec2(8.5,10.0)+vec2(0.53,0.72)).a;
  vec3 n=normalize(cross(dFdx(vWorld),dFdy(vWorld)));
  float grazing=pow(1.0-abs(dot(n,normalize(cameraPosition-vWorld))),3.0);
  float radius=length(vWorld);
  float heat=exp(-radius*0.050);
  float accent=0.20+0.80*pow(0.5+0.5*sin(vMetric.y*1.1+uOffset*39.0),6.0);
  float glint=pow(0.5+0.5*sin(vMetric.x*1.6-vMetric.y*2.5-uTime*0.5),20.0);
  float edgeDistance=min(vUv.y,1.0-vUv.y);
  float edge=(exp(-edgeDistance*320.0)*0.19+exp(-edgeDistance*75.0)*0.025)
    *(0.5+grazing*1.5)*smoothstep(2.3,4.3,radius);
  float d=length(vWorld.xz-uWaveCenter)-uWaveAge*5.0;
  float wave=exp(-d*d/0.8)*max(0.0,1.0-uWaveAge/3.0);
  // Reserve whole atlas cells for large equations, including tall integral limits.
  // Dense microtext occupies other cells rather than overprinting the same ink.
  vec2 cell=floor(tex*vec2(4.0,12.0));
  float heroCell=step(0.28,fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453));
  float fineMargin=smoothstep(0.43,0.49,abs(fract((tex.y*3.8+0.31)*12.0)-0.5));
  float light=heroCell*ink*(accent+wave*2.6)+(1.0-heroCell)
    *(fine*(0.32+heat*0.42)+micro*fineMargin*(0.06+glint*heat*0.30))+edge;
  light+=0.002*grazing*heat*sin(vUv.y*3.14159265);
  vec3 gold=mix(vec3(0.55,0.35,0.13),vec3(1.0,0.88,0.65),0.34+grazing*0.38);
  gl_FragColor=vec4(gold*light*uOpacity*(1.0-smoothstep(0.85,1.0,vUv.x)),1.0);
}
`;

export const coreVertex=`
varying vec2 vScreen;
void main(){vScreen=position.xy;gl_Position=vec4(position.xy,1.0,1.0);}
`;

// Schwarzschild-style ray integration follows the MIT upstream integrator.
// The emissive material is entirely glyph ink at three spatial frequencies.
export const coreFragment=/* glsl */ `
uniform sampler2D uAtlas;
uniform vec3 uEye,uRight,uUp,uForward;
uniform float uTanFov,uAspect,uPixelHeight,uTime,uWaveAge;
varying vec2 vScreen;
float inkAt(vec2 uv,float angularRate,float radialRate,vec3 p){
  float footprint=2.0*length(p-uEye)*uTanFov/uPixelHeight;
  float density=max(4096.0*angularRate/(6.2831853*max(length(p.xz),1.0)),3072.0*radialRate);
  float lod=clamp(log2(max(footprint*density,1.0))-0.30,0.0,10.0);
  return texture2DLodEXT(uAtlas,uv,lod).a;
}
vec3 emission(vec3 p){
  float r=length(p.xz),angle=atan(p.z,p.x);
  float band=smoothstep(1.25,1.57,r)*(1.0-smoothstep(9.0,15.0,r));
  float orbit=angle-uTime*0.30-1.05*log(max(r,1.0));
  float radial=r+uTime*0.31;
  float heat=exp(-max(r-1.7,0.0)*1.20);
  float mantle=exp(-max(r-2.0,0.0)*0.34);
  float bend=0.055*sin(orbit*2.0+r*0.35);
  float a=inkAt(vec2(orbit/6.2831853*1.5,(radial*0.17+bend)/3.0),1.5,0.17/3.0,p);
  float b=inkAt(vec2(orbit/6.2831853*7.5+0.24,(radial*0.82+bend)/3.0+0.32),7.5,0.82/3.0,p);
  float c=inkAt(vec2(orbit/6.2831853*24.0+0.61,(radial*2.2+bend)/3.0+0.69),24.0,2.2/3.0,p);
  float unresolved=texture2DLodEXT(uAtlas,vec2(0.5),12.0).a;
  float light=a*(0.07+heat*2.0)+b*(0.03+heat*2.5+mantle*0.22)
    +c*(1.0-smoothstep(5.0,13.0,r))*(0.025+heat*1.7)
    +unresolved*(heat*12.0+mantle*0.28);
  float inclination=abs(uEye.y)/length(uEye);
  light*=1.0+(mix(3.5,1.0,smoothstep(0.05,0.22,inclination))-1.0)*(1.0-smoothstep(4.0,8.0,r));
  float arcs=0.78+0.22*cos(orbit*3.0+radial*0.5);
  vec3 gold=mix(vec3(1.0,0.55,0.20),vec3(1.0,0.91,0.72),pow(heat,2.2));
  return gold*light*band*arcs*1.35*(1.0+0.18*exp(-uWaveAge*1.3));
}
void main(){
  vec3 ray=normalize(uForward+uRight*vScreen.x*uAspect*uTanFov+uUp*vScreen.y*uTanFov);
  float along=dot(uEye,ray);
  float impact2=max(0.0,dot(uEye,uEye)-along*along);
  if(along>0.0||impact2>1225.0){gl_FragColor=vec4(0.0);return;}
  float discriminant=1.94*1.94-impact2;
  float sphereDistance=-along-sqrt(max(discriminant,0.0));
  float sphereHit=step(0.0,discriminant)*step(0.0,sphereDistance);
  vec3 p=uEye+ray*max(0.0,-along-sqrt(max(1225.0-impact2,0.0)));
  vec3 velocity=ray;
  float h2=dot(cross(p,velocity),cross(p,velocity));
  vec3 color=vec3(0.0);float opacity=0.0,captured=0.0;
  vec3 view=normalize(-uEye);
  vec3 diskUp=normalize(vec3(0,1,0)-view*view.y);
  float upper=smoothstep(-0.10,0.20,dot(ray,diskUp)*length(uEye));
  for(int i=0;i<144;i++){
    float r=length(p);
    if(r<0.76){captured=1.0;break;}
    if(r>35.2&&dot(p,velocity)>0.0)break;
    float dt=clamp(r*0.082,0.032,1.9);
    float r2=r*r;
    vec3 a=-1.14*h2*p/(r2*r2*r);
    vec3 next=p+velocity*dt+a*dt*dt*0.5;
    float nr=length(next),nr2=nr*nr;
    vec3 na=-1.14*h2*next/max(0.02,nr2*nr2*nr);
    velocity+=(a+na)*dt*0.5;
    if(p.y*next.y<0.0){
      vec3 crossing=mix(p,next,p.y/(p.y-next.y));
      float depth=dot(crossing-uEye,ray);
      float front=1.0-sphereHit*step(sphereDistance,depth);
      float nearSide=1.0-step(-along,depth);
      vec3 light=emission(crossing)*front*mix(0.30,1.0,max(upper,nearSide));
      color+=light*(1.0-opacity);
      opacity+=(1.0-opacity)*clamp(max(light.r,max(light.g,light.b))*0.60,0.0,0.96);
    }
    p=next;
  }
  color/=1.0+max(color.r,max(color.g,color.b))/3.0;
  gl_FragColor=vec4(color,max(opacity,max(captured,sphereHit)));
}
`;

export const particleVertex=/* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform vec3 uRight,uUp;
varying vec2 vAtlas;
varying float vFade,vHeat;
${ribbonPathGLSL}
${ribbonMotionGLSL}
void main(){
  float age=fract(aSeed*0.61803398875+uTime/36.0);
  float t=pow(1.0-age,0.95),lane=mod(aSeed,7.0);
  float across=(fract(aSeed*0.3234)-0.5)*0.64;
  vec3 center=ribbonMotion(ribbonPath(lane,t,across+0.5),t,lane,uTime);
  center.y+=0.13;
  float r=length(center.xz);
  float size=(0.65+fract(aSeed*0.517)*0.8+step(0.78,fract(aSeed*0.713))*0.9)
    *(0.12+0.88*smoothstep(1.35,5.0,r));
  vec3 p=center+uRight*position.x*size+uUp*position.y*size*0.25;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
  float index=mod(aSeed*17.0+floor(aSeed*0.61803398875+uTime/36.0)*13.0,48.0);
  vAtlas=(vec2(mod(index,4.0),11.0-floor(index/4.0))+uv)/vec2(4.0,12.0);
  vFade=smoothstep(0.0,0.07,age);vHeat=1.0-smoothstep(3.0,22.0,r);
}
`;
export const particleFragment=`
uniform sampler2D uAtlas;
varying vec2 vAtlas;
varying float vFade,vHeat;
void main(){float ink=texture2D(uAtlas,vAtlas).a;
gl_FragColor=vec4(mix(vec3(0.75,0.62,0.40),vec3(1.0,0.90,0.69),vHeat)*ink*vFade*1.05,1.0);}
`;
export const starVertex=`
attribute float aSize,aSeed;attribute vec3 aColor;
uniform float uTime,uDpr;
varying vec3 vColor;varying float vHero;
void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
gl_PointSize=max(1.0,aSize*uDpr);vHero=step(4.0,aSize);
vColor=aColor*(0.93+0.07*sin(uTime*0.18+aSeed*70.0));}
`;
export const starFragment=`
varying vec3 vColor;varying float vHero;
void main(){vec2 p=gl_PointCoord-0.5;float d=dot(p,p);
float core=exp(-d*42.0),halo=exp(-d*11.0)*0.18;
float rays=(exp(-abs(p.x)*65.0)+exp(-abs(p.y)*65.0))*exp(-d*10.0)*0.08*vHero;
gl_FragColor=vec4(vColor*(core+halo+rays),1.0);}
`;
