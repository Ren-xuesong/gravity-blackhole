// Adapted from the MIT-licensed consumption.glsl in
// XboxNahida/ghostty-blackhole-main v3.0.0. Camera rays, curved sheet
// intersections, conserved inflow coordinates and optical depth are retained.
export const vertexShader = `
varying vec2 vUv;
void main() { vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }
`;

export const fragmentShader = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uEye;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform float uTanFov;
uniform vec2 uWaveCenter;
uniform float uWaveAge;
varying vec2 vUv;
const float TAU=6.28318530718;
const float SQRT_GM=22.627417;
const float INFLOW=2.4;
const float FEED=38.0;

float hash(vec2 p) {
  vec3 p3=fract(vec3(p.xyx)*0.1031);
  p3+=dot(p3,p3.yzx+33.33);
  return fract((p3.x+p3.y)*p3.z);
}
float noise(vec2 p) {
  vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
    mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);
}
float turbulence(vec2 p) {
  return noise(p)*0.57+noise(p*2.07+19.3)*0.29+noise(p*4.13+7.1)*0.14;
}
float heightAt(vec2 q,float layer) {
  float r=length(q),phi=atan(q.y,q.x);
  float phase=uTime*0.30;
  float envelope=smoothstep(3.0,15.0,r);
  float h=0.0;
  if(layer<0.5) h=envelope*(0.52*sin(phi-r*0.09+phase*0.018));
  else if(layer<1.5) h=envelope*(-3.4+2.0*sin(phi-r*0.095+1.0+phase*0.025)+0.7*sin(phi*2.0));
  else h=envelope*(4.0+2.8*sin(phi-r*0.12+2.0+phase*0.022));
  float d=length(q-uWaveCenter)-uWaveAge*6.0;
  h+=exp(-d*d/0.72)*max(0.0,1.0-uWaveAge/3.0)*0.9;
  return h;
}
vec3 sky(vec3 direction) {
  vec3 d=normalize(direction);
  vec2 sphere=vec2(atan(d.x,d.z),asin(clamp(d.y,-1.0,1.0)));
  vec3 col=vec3(0.00008);
  for(int i=0;i<3;i++) {
    float grid=90.0*pow(2.0,float(i));
    vec2 cell=sphere*grid,id=floor(cell);
    float seed=hash(id+float(i)*51.7);
    vec2 offset=vec2(hash(id+17.3),hash(id+31.7))*0.7+0.15;
    float dist=length(fract(cell)-offset);
    float w=max(0.032,grid/uResolution.y*0.28);
    float spark=exp(-dist*dist/(w*w));
    float selected=smoothstep(0.95,0.995,seed);
    vec3 tint=mix(vec3(1.0,0.82,0.58),vec3(0.53,0.74,1.0),hash(id+2.9));
    float halo=exp(-dist*dist/(w*w*8.0))*0.07;
    col+=tint*(spark+halo)*selected*(1.0/float(i+1));
  }
  return col;
}
vec2 backtrace(vec2 q,float age) {
  float r=max(length(q),3.0);
  float r0=pow(pow(r,1.5)+1.5*INFLOW*age,2.0/3.0);
  float theta=atan(q.y,q.x)-SQRT_GM/INFLOW*log(r0/r);
  return r0*vec2(cos(theta),sin(theta));
}
float advectedInk(vec2 q,float age,float layer,float footprint,float scale) {
  float span=18.0/scale;
  vec2 pos=backtrace(q,age);
  float a=layer*0.37;
  mat2 rot=mat2(cos(a),-sin(a),sin(a),cos(a));
  vec2 uv=rot*vec2(pos.x,-pos.y)/span+vec2(layer*0.13,layer*0.19);
  // Analytic footprint instead of implicit derivatives inside divergent rays.
  vec2 axis=normalize(uForward.xz+vec2(0.0001));
  vec2 delta=backtrace(q+axis*0.04,age)-pos;
  vec2 major=rot*vec2(delta.x,-delta.y)/(0.04*span);
  float lod=max(log2(max(footprint*2048.0/span/6.0,1.0)),0.0);
  float ink=0.0;
  for(int tap=0;tap<6;tap++) {
    vec2 offset=major*footprint*((float(tap)+0.5)/6.0-0.5);
    ink+=texture2DLodEXT(uAtlas,uv+offset,lod).a/6.0;
  }
  float emphasis=step(0.94,hash(floor(uv*vec2(2.0,20.0))+layer*17.0));
  return ink*mix(0.85,2.6,emphasis);
}
float sampleInk(vec2 q,float layer,float footprint,float scale) {
  // Two staggered copies avoid accumulating unbounded shear. Each copy
  // follows the upstream analytic gravitational backtrace between reseeds.
  float cycle=fract(uTime*0.055);
  float a=cycle*6.0,b=fract(cycle+0.5)*6.0;
  float blend=abs(cycle*2.0-1.0);
  return mix(advectedInk(q,a,layer,footprint,scale),
    advectedInk(q,b,layer,footprint,scale),blend);
}
vec4 sheetMaterial(vec2 q,float layer,float footprint,vec3 ray) {
  float r=length(q);
  float phi=atan(q.y,q.x);
  float inner=layer<0.5?3.0:(layer<1.5?11.0+2.0*sin(phi*2.0):12.0+3.0*sin(phi+2.0));
  float outer=layer<1.5?35.0+3.0*sin(phi+layer):38.0;
  float extent=smoothstep(inner,inner+0.35,r)*(1.0-smoothstep(outer-1.0,outer,r));
  if(layer>0.5&&layer<1.5)extent*=smoothstep(-9.0,3.0,q.y);
  if(layer>1.5)extent*=1.0-smoothstep(-8.0,4.0,q.y);
  if(extent<0.001)return vec4(0.0);
  float scale=layer<0.5?2.5:(layer<1.5?0.65:1.2);
  float ink=sampleInk(q,layer,footprint,scale);
  float smallInk=sampleInk(q+vec2(0.037),layer,footprint,scale*3.0);
  float h=heightAt(q,layer);
  vec2 grad=(vec2(heightAt(q+vec2(0.1,0),layer),heightAt(q+vec2(0,0.1),layer))-h)/0.1;
  vec3 n=normalize(vec3(-grad.x,1.0,-grad.y));
  float grazing=pow(1.0-abs(dot(n,normalize(ray))),7.0);
  float heat=exp(-max(r-4.0,0.0)*0.11);
  vec3 gold=mix(vec3(0.36,0.235,0.095),vec3(1.0,0.86,0.59),heat*0.6+0.2);
  float wave=exp(-pow((length(q-uWaveCenter)-uWaveAge*6.0)/0.7,2.0))*max(0.0,1.0-uWaveAge/3.0);
  float rim=exp(-pow((r-inner-0.18)/0.085,2.0))*step(0.5,layer);
  vec3 color=gold*(ink*(0.28+heat*0.25)+smallInk*0.13+grazing*0.018+rim*0.15+wave*0.75);
  float alpha=extent*clamp(0.045+ink*0.55+smallInk*0.25+grazing*0.025+rim*0.1,0.0,0.90);
  // Straight-alpha radiance preserves thin ink while the sheet gently masks
  // distant layers. Background remains transparent between the wide folds.
  return vec4(color/max(alpha,0.01),alpha);
}
vec4 diskMaterial(vec2 q) {
  float r=length(q),angle=atan(q.y,q.x);
  float band=smoothstep(1.55,1.90,r)*(1.0-smoothstep(15.0,24.0,r));
  float phase=angle-uTime*0.16/pow(max(r/3.0,1.0),1.5);
  float detail=turbulence(vec2(r*45.0,phase*6.0));
  float fine=noise(vec2(r*140.0,phase*14.0));
  float density=band*(0.10+1.15*pow(detail,3.0)+0.13*fine);
  float heat=exp(-max(r/1.8-1.0,0.0)*1.45);
  float beta=sqrt(0.5/max(r,3.0));
  float shift=sqrt(1.0-beta*beta)/(1.0-0.42*beta*q.x/max(r,0.01));
  vec3 gold=mix(vec3(0.38,0.22,0.075),vec3(1.0,0.93,0.76),sqrt(heat));
  vec3 emission=gold*density*(0.06+heat*3.2)*pow(shift,2.5);
  return vec4(emission,density*0.55);
}
void main() {
  vec2 p=(vUv*2.0-1.0)*vec2(uResolution.x/uResolution.y,1.0);
  vec3 origin=uEye;
  vec3 v=normalize(uForward+uTanFov*(p.x*uRight+p.y*uUp));
  vec3 x=origin;
  float h2=dot(cross(x,v),cross(x,v));
  float impact=sqrt(h2);
  vec3 color=vec3(0.0);
  float transmission=1.0;
  bool captured=false;
  for(int step=0;step<136;step++) {
    float r2=dot(x,x);
    if(r2<1.0){captured=true;break;}
    if((dot(x,origin)<-55.0*length(origin) && dot(x,v)>0.0)||r2>11500.0||transmission<0.01)break;
    float r=sqrt(r2);
    float dt=clamp(0.115*r,0.023,2.15);
    vec3 previous=x;
    v+=(-1.5*h2*x/max(r2*r2*r,0.01))*(0.5*dt);
    x+=v*dt;
    r2=max(dot(x,x),0.01);
    v+=(-1.5*h2*x/(r2*r2*sqrt(r2)))*(0.5*dt);
    vec2 q0=previous.xz,q1=x.xz;
    float crossings[5];
    crossings[0]=previous.y*x.y<0.0?previous.y/(previous.y-x.y):2.0;
    vec3 segment=x-previous;
    float qa=dot(segment,segment),qb=dot(previous,segment),qc=dot(previous,previous)-1.0;
    float discriminant=qb*qb-qa*qc;
    float capture=discriminant>=0.0?(-qb-sqrt(discriminant))/max(qa,0.000001):2.0;
    crossings[4]=capture>=0.0&&capture<=1.0?capture:2.0;
    for(int layer=0;layer<3;layer++) {
      float fl=float(layer);
      float a=previous.y-heightAt(q0,fl),b=x.y-heightAt(q1,fl);
      crossings[layer+1]=2.0;
      if(a*b<0.0 && min(length(q0),length(q1))<39.0) {
        float lo=0.0,hi=1.0;
        for(int refine=0;refine<4;refine++) {
          float mid=(lo+hi)*0.5;
          float h=mix(previous.y,x.y,mid)-heightAt(mix(q0,q1,mid),fl);
          if(a*h>0.0)lo=mid;else hi=mid;
        }
        float aa=mix(previous.y,x.y,lo)-heightAt(mix(q0,q1,lo),fl);
        float bb=mix(previous.y,x.y,hi)-heightAt(mix(q0,q1,hi),fl);
        crossings[layer+1]=mix(lo,hi,clamp(aa/(aa-bb),0.0,1.0));
      }
    }
    for(int hit=0;hit<5;hit++) {
      int surface=0;
      for(int c=1;c<5;c++){if(crossings[c]<crossings[surface])surface=c;}
      float f=crossings[surface];
      if(f>1.0)break;
      crossings[surface]=2.0;
      if(surface==4){captured=true;transmission=0.0;break;}
      vec3 point=mix(previous,x,f);
      vec2 q=point.xz;
      if(surface==0) {
        vec4 disk=diskMaterial(q);
        color+=transmission*disk.rgb;
        transmission*=1.0-clamp(disk.a,0.0,0.85);
      } else {
        float layer=float(surface-1),rc=length(q);
        if(rc<3.0||rc>38.0)continue;
        if(impact<2.60)continue;
        float h=heightAt(q,layer);
        vec2 gradient=(vec2(heightAt(q+vec2(0.12,0),layer),heightAt(q+vec2(0,0.12),layer))-h)/0.12;
        vec3 n=normalize(vec3(-gradient.x,1.0,-gradient.y));
        float footprint=2.0*uTanFov/uResolution.y*length(point-origin)/max(abs(dot(n,normalize(v))),0.18);
        vec4 material=sheetMaterial(q,layer,footprint,v);
        color+=transmission*material.rgb*material.a;
        transmission*=1.0-material.a;
      }
    }
    if(captured)break;
  }
  if(!captured)color+=transmission*sky(v);
  float ring=exp(-pow((impact-2.625)/0.023,2.0));
  color+=vec3(1.0,0.90,0.67)*ring*0.32;
  gl_FragColor=vec4(color,1.0);
}
`;
