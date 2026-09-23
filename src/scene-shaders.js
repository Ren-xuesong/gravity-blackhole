// Browser adaptation of the formula atlas transport and three curved optical
// surfaces in XboxNahida/ghostty-blackhole-main v3.0.0/shaders/consumption.glsl.
// The upstream Windows shader uses desktop capture and ray integration; here
// the same flow labels are sampled on real, orbitable WebGL surfaces.

export const surfaceVertex = /* glsl */ `
  uniform float uTime;
  uniform float uLayer;
  uniform vec2 uWaveCenter;
  uniform float uWaveAge;
  varying vec2 vQ;
  varying float vRadius;
  varying float vHeight;

  float surfaceHeight(vec2 q, float phase, float layer) {
    float r = length(q);
    float phi = atan(q.y, q.x);
    float envelope = smoothstep(3.0, 15.0, r);
    float spiral = phi - 0.15*r + phase*0.055 + layer*2.1;
    return envelope * ((layer - 1.0)*4.2
      + (2.1 + layer*0.5)*sin(spiral)
      + 1.1*sin(phi*2.0 + r*0.19 - phase*0.04 + layer*1.7));
  }

  void main() {
    vec3 p = position;
    vec2 q = p.xz;
    p.y = surfaceHeight(q, uTime, uLayer);
    float front = uWaveAge * 5.2;
    float distanceToWave = length(q - uWaveCenter);
    float wave = exp(-pow((distanceToWave - front)/0.65, 2.0));
    p.y += wave * max(0.0, 1.0 - uWaveAge/2.0) * 0.32;
    vQ = q;
    vRadius = length(q);
    vHeight = p.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

export const surfaceFragment = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uTime;
  uniform float uLayer;
  uniform vec2 uWaveCenter;
  uniform float uWaveAge;
  varying vec2 vQ;
  varying float vRadius;
  varying float vHeight;

  const float PI2 = 6.28318530718;
  const float SQRT_GM = 22.627417;
  const float INFLOW = 2.4;
  const float FEED_RADIUS = 38.0;

  float angularSpeed(float radius) {
    return SQRT_GM / pow(max(radius, 3.0), 1.5);
  }
  vec2 flowLabels(vec2 q, float phase) {
    float r = max(length(q), 3.0);
    float travel = (pow(FEED_RADIUS, 1.5) - pow(r, 1.5)) / (1.5*INFLOW);
    float theta = atan(q.y, q.x)
      - SQRT_GM/INFLOW * log(FEED_RADIUS/r);
    return vec2(theta, phase - travel);
  }
  float laneOrbit(float id, float phase, float layer, float angle) {
    float injection = (layer*0.31 - id - 0.5) * (2.5 + layer*1.25);
    float radius = pow(max(pow(FEED_RADIUS, 1.5)
      - 1.5*INFLOW*(phase - injection), pow(3.0, 1.5)), 2.0/3.0);
    return angle - SQRT_GM/INFLOW * log(FEED_RADIUS/radius)
      - angularSpeed(FEED_RADIUS)*injection;
  }
  float formulaInk(vec2 q, float phase, float layer) {
    float radius = max(length(q), 3.0);
    float incoming = 3.0 + mod(radius - 3.0 + phase*0.36 + layer*3.7, 35.0);
    float spiral = 0.38*log(FEED_RADIUS/radius) + layer*0.17;
    float c = cos(spiral), s = sin(spiral);
    vec2 transported = vec2(c*q.x-s*q.y, s*q.x+c*q.y) * incoming/radius;
    vec2 uv = transported/12.0 + vec2(layer*0.19,layer*0.11);
    return texture2D(uAtlas, uv).a;
  }
  void main() {
    float r = vRadius;
    float extent = smoothstep(3.15, 5.2, r)
      * (1.0 - smoothstep(30.0, 38.0, r));
    if (extent < 0.001) discard;
    float ink = formulaInk(vQ, uTime, uLayer);
    float phi = atan(vQ.y, vQ.x);
    float streamline = pow(max(0.0, cos((phi - 0.15*r + uLayer*2.1)*79.0)), 38.0);
    float innerLight = exp(-max(r - 4.0, 0.0)*0.09);
    float waveFront = uWaveAge * 5.2;
    float wave = exp(-pow((length(vQ-uWaveCenter)-waveFront)/0.5, 2.0))
      * max(0.0, 1.0-uWaveAge/2.0);
    float layerOpacity = uLayer < 0.5 ? 0.66 : (uLayer > 1.5 ? 0.76 : 1.0);
    float base = 0.002 + streamline*0.026 + innerLight*0.010;
    float alpha = extent * layerOpacity * clamp(base + ink*(0.89+innerLight*0.18) + wave*0.23, 0.0, 0.92);
    vec3 inkColor = mix(vec3(0.66,0.42,0.20), vec3(1.0,0.88,0.64), ink);
    vec3 color = inkColor*(0.70 + innerLight*0.55 + wave*0.7);
    gl_FragColor = vec4(color, alpha);
  }
`;

export const diskVertex = /* glsl */ `
  varying vec2 vQ;
  void main() {
    vQ = position.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const diskFragment = /* glsl */ `
  uniform float uTime;
  varying vec2 vQ;
  void main() {
    float r = length(vQ);
    float phi = atan(vQ.y, vQ.x);
    float edge = smoothstep(2.55, 3.05, r) * (1.0-smoothstep(13.0, 18.0, r));
    float flow = phi*37.0 - r*1.4 + uTime*(3.0/pow(max(r,3.0),1.5));
    float filaments = pow(max(0.0, sin(flow)), 10.0);
    filaments += 0.42*pow(max(0.0,sin(flow*2.37+r*7.1)), 18.0);
    float heat = exp(-max(r-3.0,0.0)*0.32);
    float alpha = edge * (0.005 + filaments*0.075 + heat*0.12);
    vec3 color = mix(vec3(0.75,0.37,0.12),vec3(1.0,0.91,0.68),heat);
    gl_FragColor = vec4(color,alpha);
  }
`;

export const haloVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const haloFragment = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5)*2.0;
    float r = length(p);
    float ring = exp(-pow((r-0.724)/0.022,2.0));
    float upper = smoothstep(-0.1,0.60,p.y);
    float halo = exp(-pow((r-0.79)/0.11,2.0))*(0.09+upper*0.17);
    float caustic = exp(-pow((r-0.755)/0.044,2.0))*upper*0.26;
    float inside = 1.0-smoothstep(0.67,0.72,r);
    float divider = p.y - (0.035+0.22*p.x);
    float lower = inside * (1.0-smoothstep(-0.015,0.018,divider));
    float grain = 0.5+0.5*sin(95.0*(p.y+0.18*p.x)+8.0*sin(p.x*13.0));
    float innerDisk = lower*(0.14+0.12*grain);
    float slash = inside*exp(-pow(divider/0.028,2.0))*0.42;
    float alpha = clamp(ring*0.78 + halo + caustic + innerDisk + slash, 0.0, 0.94);
    vec3 color = mix(vec3(0.69,0.35,0.11),vec3(1.0,0.96,0.81),ring+caustic+slash);
    gl_FragColor = vec4(color,alpha);
  }
`;

export const starsVertex = /* glsl */ `
  attribute float aSize;
  attribute float aWarm;
  varying float vWarm;
  varying float vSpark;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position,1.0);
    vWarm = aWarm;
    vSpark = aSize;
    gl_PointSize = clamp(aSize*125.0/max(-mv.z,1.0), 0.8, 5.5);
    gl_Position = projectionMatrix*mv;
  }
`;

export const starsFragment = /* glsl */ `
  varying float vWarm;
  varying float vSpark;
  void main() {
    float d = length(gl_PointCoord-0.5)*2.0;
    float alpha = exp(-d*d*7.0)*min(0.72,vSpark*0.22);
    vec3 color = mix(vec3(0.65,0.78,1.0),vec3(1.0,0.84,0.62),vWarm);
    gl_FragColor = vec4(color,alpha);
  }
`;
