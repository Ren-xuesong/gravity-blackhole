(() => {
  'use strict';

  const canvas = document.querySelector('#universe');
  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  const experience = document.querySelector('#experience');
  const status = document.querySelector('#status');
  const orbitButton = document.querySelector('#orbit-view');
  const topButton = document.querySelector('#top-view');
  const pauseButton = document.querySelector('#pause-button');
  const resetButton = document.querySelector('#reset-button');
  const cinemaButton = document.querySelector('#cinema-button');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let seed = 9157807;
  const random = () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296);
  const TAU = Math.PI * 2;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const camera = {
    yaw: -0.12, pitch: 0.29, distance: 9.3, roll: -0.09, panX: 0, panY: 0,
    targetYaw: -0.12, targetPitch: 0.29, targetDistance: 9.3,
    targetPanX: 0, targetPanY: 0
  };
  window.gravityCamera = camera;
  let w = 0, h = 0, dpr = 1, focal = 1, centerX = 0, centerY = 0, detailStep = 1;
  let cameraBasis = null;
  let time = 0, previousTime = 0, paused = reduceMotion;
  let gravityPulse = 0;
  window.gravityPaused = paused;
  let ripples = [];
  let dragging = false;
  let dragMode = 'orbit';
  let pointerStart = null;
  const touches = new Map();
  let touchGesture = null;

  // Geometrized units G = c = ℏ = k_B = 1. The hand-built visual is an
  // artistic lensing model, not a numerical solution of the Kerr metric.
  // References: arxiv.org/abs/1410.2130, arxiv.org/abs/0812.1806,
  //             arxiv.org/abs/2006.06872 (see PHYSICS_SOURCES.md).
  const formulas = [
    'Gμν + Λgμν = 8πTμν', 'Rμν − ½Rgμν = 8πTμν',
    'ds² = gμν dxμ dxν', 'rₛ = 2M', 'rₚₕ = 3M',
    'b_c = 3√3 M', 'Δ = r² − 2Mr + a²', 'Σ = r² + a²cos²θ',
    'r₊ = M + √(M² − a²)', 'r₋ = M − √(M² − a²)',
    'Ωₕ = a/(r₊² + a²)', 'Aₕ = 4π(r₊² + a²)',
    'κ = (r₊ − r₋)/[2(r₊² + a²)]', 'S_BH = Aₕ/4',
    'Tₕ = κ/(2π)', 'δM = κδA/(8π) + ΩₕδJ',
    'J = aM', 'χ = J/M²', '0 < ω < mΩₕ',
    'gμν pμ pν = 0', 'Rμνρσ R^μνρσ = 48M²/r⁶',
    'd²R/dr*² + [ω² − V(r)]R = 0',
    'ω_QNM ≈ ℓΩ_c − i(n + ½)|λ_c|',
    'ψₛ = e^(−iωt+imφ) Sₛ(θ) Rₛ(r)',
    'K = (r² + a²)ω − am',
    'S_gen = A/4 + S_out', 'ΔS_gen ≥ 0',
    'S_rad = min_I ext_I [A(∂I)/4 + S_bulk(R ∪ I)]',
    'S_R = −Tr(ρ_R ln ρ_R)',
    'S_R = −∂ₙ ln Tr(ρ_Rⁿ) |ₙ₌₁',
    'S_A = Area(γ_A)/4',
    'S = −Et + L_zφ + S_r(r) + S_θ(θ)',
    'G = c = ℏ = k_B = 1'
  ];
  const heroFormulaIndices = [0, 1, 6, 7, 8, 10, 11, 13, 14, 15, 18, 22, 23, 25, 27, 30];

  const stars = Array.from({ length: 1850 }, () => ({
    x: random(), y: random(), size: random() < .965 ? .22 + random() * .68 : 1.1 + random() * 1.55,
    alpha: .06 + random() * .53, phase: random() * TAU, depth: random()
  }));
  const particles = Array.from({ length: 14800 }, () => ({
    radius: 1.7 + Math.pow(random(), 1.2) * 20.3,
    angle: random() * TAU,
    width: .25 + random() * 1.05,
    length: random() < .075 ? .055 + random() * .14 : .006 + random() * .035,
    brightness: .32 + random() * .68,
    pull: .045 + random() * .105,
    layer: random()
  }));
  // Rows of type live on the same annular surface as the accretion flow.
  // A fixed radial/azimuthal grid keeps the letters in readable lanes while
  // orbital motion still lets the whole sheet spiral toward the hole.
  const equations = [];
  for (let row = 0; row < 66; row++) {
    const radius = 2.05 + row * .305;
    const count = Math.round(TAU * radius / 2.15);
    const offset = row * 2.399963229728653;
    for (let column = 0; column < count; column++) {
      const hero = row % 11 === 4 && column % 13 === 0;
      equations.push({
        radius: radius + (random() - .5) * .055,
        angle: offset + (column + .5 + (random() - .5) * .13) * TAU / count,
        orientation: (random() - .5) * .045,
        size: hero ? .44 + random() * .18 : .13 + random() * .115,
        alpha: hero ? .49 + random() * .18 : .26 + random() * .25,
        pull: .075 + random() * .075,
        formulaIndex: hero
          ? heroFormulaIndices[Math.floor(random() * heroFormulaIndices.length)]
          : Math.floor(random() * formulas.length),
        bright: hero || random() < .045
      });
    }
  }

  // Rasterize each formula once. Thousands of transformed glyphs can then be
  // drawn every frame without re-shaping text or blurring individual glyphs.
  const formulaAtlas = formulas.map(formula => {
    if (!document.createElement) return null;
    const entries = [];
    for (const bright of [false, true]) {
      const sprite = document.createElement('canvas');
      const painter = sprite.getContext('2d');
      if (!painter) return null;
      painter.font = 'italic 17px Georgia, "Times New Roman", serif';
      sprite.width = Math.ceil(painter.measureText(formula).width + 18);
      sprite.height = 42;
      painter.font = 'italic 17px Georgia, "Times New Roman", serif';
      painter.textBaseline = 'alphabetic';
      if (bright) {
        painter.shadowBlur = 9;
        painter.shadowColor = '#f6d59e';
      }
      painter.fillStyle = bright ? '#fff1d1' : '#d2a875';
      painter.fillText(formula, 5, 27);
      entries.push(sprite);
    }
    return entries;
  });

  // Two broad curved sheets. Formula rows are spaced by glyph width.
  const surfaceEquations = [];
  for (let band = 0; band < 2; band++) {
    for (let row = 0; row < 39; row++) {
      let x = -180 + random() * 70;
      while (x < 4200) {
        const formulaIndex = Math.floor(random() * formulas.length);
        const sprite = formulaAtlas[formulaIndex]?.[0];
        const spriteWidth = sprite?.width || formulas[formulaIndex].length * 9 + 18;
        const size = .38 + random() * .23;
        const width = spriteWidth * size;
        surfaceEquations.push({
          band, row,
          x: x + width * .5,
          size,
          width,
          alpha: .25 + random() * .29,
          phase: random() * TAU,
          formulaIndex,
          bright: random() < .055
        });
        x += width + 8 + random() * 18;
      }
    }
  }
  const surfaceHeroes = [
    { band: 0, u: .10, v: .42, size: .86, formulaIndex: 0 },
    { band: 0, u: .73, v: .68, size: .81, formulaIndex: 23 },
    { band: 0, u: .47, v: .88, size: .73, formulaIndex: 15 },
    { band: 1, u: .12, v: .17, size: .96, formulaIndex: 13 },
    { band: 1, u: .58, v: .36, size: 1.02, formulaIndex: 25 },
    { band: 1, u: .16, v: .69, size: 1.12, formulaIndex: 27 },
    { band: 1, u: .78, v: .77, size: .91, formulaIndex: 30 }
  ];

  function resize() {
    const rect = experience.getBoundingClientRect();
    w = Math.max(1, rect.width);
    h = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.65 : 1.35);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    focal = h * .5;
    centerX = w * .5;
    centerY = h * .5;
    detailStep = w < 760 ? 4 : w < 1100 ? 2 : 1;
  }

  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { const l = Math.hypot(...a) || 1; return a.map(v => v / l); }

  function updateBasis() {
    const { yaw, pitch, distance } = camera;
    const eye = [
      Math.sin(yaw) * Math.cos(pitch) * distance,
      Math.sin(pitch) * distance,
      Math.cos(yaw) * Math.cos(pitch) * distance
    ];
    const forward = norm(eye.map(v => -v));
    const right = norm(cross(forward, [0, 1, 0]));
    const up = norm(cross(right, forward));
    cameraBasis = { eye, forward, right, up };
  }

  function project(x, y, z, distort = true) {
    const b = cameraBasis;
    const v = [x - b.eye[0], y - b.eye[1], z - b.eye[2]];
    const depth = dot(v, b.forward);
    if (depth < .35) return null;
    const scale = focal / depth;
    const px = dot(v, b.right) * scale;
    const py = -dot(v, b.up) * scale;
    const cr = Math.cos(camera.roll), sr = Math.sin(camera.roll);
    let screenX = centerX + camera.panX + px * cr - py * sr;
    let screenY = centerY + camera.panY + px * sr + py * cr;
    if (distort && ripples.length) {
      for (const wave of ripples) {
        if (wave.age <= 0 || wave.age >= 1.5) continue;
        const dx = screenX - wave.x, dy = screenY - wave.y;
        const distance = Math.hypot(dx, dy) || 1;
        const front = wave.age * Math.min(w, h) * .31;
        const separation = distance - front;
        const envelope = Math.exp(-Math.pow(separation / Math.max(16, Math.min(w, h) * .047), 2));
        const displacement = Math.sin(separation * .105) * envelope * (1 - wave.age / 1.5) * 12;
        screenX += dx / distance * displacement;
        screenY += dy / distance * displacement;
      }
    }
    return {
      x: screenX,
      y: screenY,
      depth, scale
    };
  }

  function onScreen(p, margin = 70) {
    return p && p.x > -margin && p.x < w + margin && p.y > -margin && p.y < h + margin;
  }

  function sheetY(x, z, r) {
    const facing = (x * cameraBasis.eye[0] + z * cameraBasis.eye[2]) / Math.max(1, r * camera.distance);
    const farSide = Math.max(0, -facing);
    const lens = 1.42 * Math.pow(farSide, 1.6) * Math.exp(-Math.pow((r - 3.1) / 5.2, 2));
    const well = -.68 * Math.exp(-Math.max(0, r - 1.65) * .62);
    return lens + well - .08;
  }

  function background() {
    const base = ctx.createLinearGradient(0, 0, w, h);
    base.addColorStop(0, '#101722');
    base.addColorStop(.42, '#07090d');
    base.addColorStop(1, '#0b0b0e');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const ambient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(w, h) * .65);
    ambient.addColorStop(0, 'rgba(168,103,39,.07)');
    ambient.addColorStop(.45, 'rgba(40,32,25,.02)');
    ambient.addColorStop(1, 'rgba(0,0,0,.36)');
    ctx.fillStyle = ambient;
    ctx.fillRect(0, 0, w, h);
  }

  function drawStars() {
    for (let i = 0; i < stars.length; i += detailStep) {
      const s = stars[i];
      const x = (s.x * w + camera.yaw * (12 + s.depth * 36) + camera.panX * .035 + w * 3) % w;
      const y = (s.y * h + camera.pitch * (9 + s.depth * 25) + camera.panY * .025 + h * 3) % h;
      const twinkle = .8 + .2 * Math.sin(time * (1.2 + s.depth * 2) + s.phase);
      const a = s.alpha * twinkle;
      ctx.fillStyle = `rgba(236,215,175,${a})`;
      ctx.beginPath(); ctx.arc(x, y, s.size, 0, TAU); ctx.fill();
      if (s.size > 1.65) {
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 10);
        glow.addColorStop(0, `rgba(232,203,153,${a * .2})`);
        glow.addColorStop(1, 'rgba(232,203,153,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x - 10, y - 10, 20, 20);
      }
    }
  }

  function drawCurve(points, color, width = 1) {
    ctx.beginPath();
    let open = false;
    for (const p of points) {
      if (!onScreen(p, 300)) { open = false; continue; }
      if (!open) { ctx.moveTo(p.x, p.y); open = true; }
      else ctx.lineTo(p.x, p.y);
    }
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  function drawSpaceTimeMesh() {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let r = 1.8; r <= 22; r += r < 6 ? .62 : 1.1) {
      const pts = [];
      for (let i = 0; i <= 180; i++) {
        const a = i / 180 * TAU;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        pts.push(project(x, sheetY(x, z, r), z));
      }
      drawCurve(pts, `rgba(175,129,65,${r < 5 ? .115 : .055})`, r < 5 ? .8 : .6);
    }
    for (let i = 0; i < 144; i += detailStep) {
      const a = i / 144 * TAU;
      const pts = [];
      for (let r = 1.8; r < 22; r += .25) {
        const twist = 1.2 / Math.sqrt(r);
        const x = Math.cos(a + twist) * r, z = Math.sin(a + twist) * r;
        pts.push(project(x, sheetY(x, z, r), z));
      }
      drawCurve(pts, `rgba(192,147,78,${i % 6 === 0 ? .13 : .057})`, .65);
    }
    ctx.restore();
  }

  function drawCausticLanes(near) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let lane = 0; lane < 62; lane += detailStep) {
      const base = lane * 2.399963229728653;
      const drift = .022 + lane % 7 * .003;
      ctx.beginPath();
      let open = false;
      for (let step = 0; step <= 82; step++) {
        const r = 1.79 + step * .25;
        const a = base + drift * r + 2.5 / Math.sqrt(r) + Math.sin(r * .65 + lane) * .018;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if ((dot([x, 0, z], cameraBasis.eye) > 0) !== near) { open = false; continue; }
        const p = project(x, sheetY(x, z, r) + .035, z);
        if (!onScreen(p, 120)) { open = false; continue; }
        if (!open) { ctx.moveTo(p.x, p.y); open = true; }
        else ctx.lineTo(p.x, p.y);
      }
      const bright = lane % 9 === 0;
      if (bright) {
        ctx.strokeStyle = `rgba(255,219,158,${near ? .046 : .029})`;
        ctx.lineWidth = 5;
        ctx.stroke();
      }
      ctx.strokeStyle = `rgba(246,201,128,${bright ? near ? .28 : .17 : near ? .105 : .065})`;
      ctx.lineWidth = bright ? 1.15 : .52;
      ctx.stroke();
    }
    ctx.restore();
  }

  function surfacePoint(band, x, v) {
    const hole = project(0, 0, 0, false);
    const hx = hole?.x ?? centerX;
    const hy = hole?.y ?? centerY;
    const relative = (x - centerX) / Math.max(1, w);
    const inner = Math.min(w, h) * .105 + h * .045;
    const bend = Math.exp(-Math.pow(relative / .33, 2)) * h * .047 * (1 - v);
    const perspective = (camera.pitch - .27) * h * .13 * (v - .32);
    const roll = (camera.roll + .11) * (x - centerX) * .28;
    const yawDrift = (camera.yaw + .12) * h * .12;
    const xx = x + camera.panX * .62 + yawDrift + Math.sin(time * .19 + x * .002) * 1.4;
    const yy = band === 0
      ? hy - inner - v * h * .315 + relative * h * (.14 + v * .04) - bend + perspective + roll
      : hy + inner + v * h * .345 - relative * h * (.16 + v * .045) + bend - perspective + roll;
    return { x: xx, y: yy + camera.panY * .12 };
  }

  function drawOuterEquations() {
    const hole = project(0, 0, 0, false);
    const hx = hole?.x ?? centerX, hy = hole?.y ?? centerY;
    const shadowRadius = hole ? hole.scale * 2.65 : Math.min(w, h) * .14;
    const heroLayout = surfaceHeroes.map(hero => {
      const scale = hero.size * Math.min(1, w / 1050);
      const p = surfacePoint(hero.band, hero.u * w, hero.v);
      return { ...hero, ...p, scale, width: (formulaAtlas[hero.formulaIndex]?.[0]?.width || 190) * scale };
    });
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // Latitude/longitude strokes make each field read as one curved surface.
    for (let band = 0; band < 2; band++) {
      for (let row = 0; row <= 39; row += 3) {
        const v = row / 39;
        ctx.beginPath();
        for (let step = 0; step <= 56; step++) {
          const p = surfacePoint(band, -30 + step * (w + 60) / 56, v);
          if (step === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = `rgba(184,137,72,${row % 9 === 0 ? .075 : .028})`;
        ctx.lineWidth = .6;
        ctx.stroke();
      }
      for (let lane = 0; lane <= 28; lane++) {
        ctx.beginPath();
        for (let step = 0; step <= 22; step++) {
          const p = surfacePoint(band, lane * w / 28, step / 22);
          if (step === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = 'rgba(160,117,61,.021)';
        ctx.lineWidth = .5;
        ctx.stroke();
      }
    }

    ctx.font = 'italic 17px Georgia, "Times New Roman", serif';
    const stride = w < 760 ? 2 : 1;
    for (let i = 0; i < surfaceEquations.length; i += stride) {
      const eq = surfaceEquations[i];
      if (eq.x < -180 || eq.x > w + 180) continue;
      const v = (eq.row + .5) / 39;
      const p = surfacePoint(eq.band, eq.x, v);
      let { x, y } = p;
      if (x < -180 || x > w + 180 || y < -60 || y > h + 60) continue;
      if (Math.hypot(x - hx, y - hy) < shadowRadius * 1.09) continue;
      if (heroLayout.some(hero => hero.band === eq.band &&
        Math.abs(x - hero.x) < (hero.width + eq.width) * .52 + 9 &&
        Math.abs(y - hero.y) < 15 * hero.scale + 8)) continue;
      let waveLight = 0;
      for (const wave of ripples) {
        const wx = x - wave.x, wy = y - wave.y;
        const distance = Math.hypot(wx, wy) || 1;
        const separation = distance - wave.age * Math.min(w, h) * .31;
        const impact = Math.exp(-separation * separation / 1100) * Math.max(0, 1 - wave.age / 1.55);
        const push = Math.sin(separation * .1) * impact * 9;
        x += wx / distance * push;
        y += wy / distance * push;
        waveLight += impact;
      }
      const next = surfacePoint(eq.band, eq.x + 18, v);
      const rotation = Math.atan2(next.y - p.y, next.x - p.x);
      const cr = Math.cos(rotation), sr = Math.sin(rotation);
      const nearHorizon = Math.exp(-Math.pow((Math.hypot(x - hx, y - hy) - shadowRadius * 1.6) / (h * .36), 2));
      const alpha = clamp(eq.alpha * (eq.band ? 1.12 : .98) * (1 - v * .19) *
        (1 + nearHorizon * .64 + waveLight), .06, .82);
      ctx.save();
      ctx.transform(cr * eq.size, sr * eq.size, -sr * eq.size * .76, cr * eq.size * .76,
        x - cr * eq.width * .5, y - sr * eq.width * .5);
      ctx.globalAlpha = alpha;
      const sprite = formulaAtlas[eq.formulaIndex]?.[eq.bright ? 1 : 0];
      if (sprite) ctx.drawImage(sprite, -5, -27);
      else {
        ctx.fillStyle = eq.bright ? '#fff1d1' : '#d2a875';
        ctx.fillText(formulas[eq.formulaIndex], 0, 0);
      }
      ctx.restore();
    }
    for (const hero of heroLayout) {
      if (hero.x < -hero.width || hero.x > w + hero.width || hero.y < -30 || hero.y > h + 30) continue;
      if (Math.hypot(hero.x - hx, hero.y - hy) < shadowRadius * 1.18) continue;
      const next = surfacePoint(hero.band, hero.u * w + 18, hero.v);
      const rotation = Math.atan2(next.y - hero.y, next.x - hero.x);
      const cr = Math.cos(rotation), sr = Math.sin(rotation);
      ctx.save();
      ctx.transform(cr * hero.scale, sr * hero.scale, -sr * hero.scale * .76, cr * hero.scale * .76,
        hero.x - cr * hero.width * .5, hero.y - sr * hero.width * .5);
      ctx.globalAlpha = hero.band === 0 ? .54 : .66;
      const sprite = formulaAtlas[hero.formulaIndex]?.[1];
      if (sprite) ctx.drawImage(sprite, -5, -27);
      else {
        ctx.fillStyle = '#fff1d1';
        ctx.fillText(formulas[hero.formulaIndex], 0, 0);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawEquations(near) {
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.font = 'italic 16px Georgia, "Times New Roman", serif';
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < equations.length; i += detailStep) {
      const eq = equations[i];
      const r = 1.76 + ((eq.radius - 1.76 - time * eq.pull - gravityPulse * .18 + 18.8 * 1000) % 18.8);
      const a = eq.angle + time * .34 / Math.pow(r, .62) + (eq.radius - r) * .17 + gravityPulse * .16 / Math.sqrt(r);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const isNear = dot([x, 0, z], cameraBasis.eye) > 0;
      if (isNear !== near) continue;
      const y = sheetY(x, z, r) + .028;
      const p = project(x, y, z);
      if (!onScreen(p, 160)) continue;
      const t = a + Math.PI / 2 + eq.orientation;
      const dx = Math.cos(t) * eq.size, dz = Math.sin(t) * eq.size;
      const tx = x + dx, tz = z + dz;
      const tangent = project(tx, sheetY(tx, tz, Math.hypot(tx, tz)) + .028, tz);
      if (!tangent) continue;
      let ax = (tangent.x - p.x) / 16, ay = (tangent.y - p.y) / 16;
      const textScale = Math.hypot(ax, ay);
      if (textScale < .095 || textScale > (w < 760 ? 1.35 : 2.35)) continue;
      if (ax < 0) { ax = -ax; ay = -ay; }
      const bx = -ay * .78, by = ax * .78;
      const fade = clamp((r - 1.76) / .8, 0, 1) * clamp((20.55 - r) / 1.3, 0, 1);
      let waveLight = 0;
      for (const wave of ripples) {
        const front = wave.age * Math.min(w, h) * .31;
        const offset = Math.abs(Math.hypot(p.x - wave.x, p.y - wave.y) - front);
        waveLight += Math.exp(-offset * offset / 900) * Math.max(0, 1 - wave.age / 1.55);
      }
      const alpha = clamp(eq.alpha * fade * (near ? .94 : .79) * (eq.bright ? 1.42 : 1) * (1 + waveLight * 1.4), .025, .88);
      ctx.save();
      ctx.transform(ax, ay, bx, by, p.x, p.y);
      ctx.globalAlpha = alpha;
      const sprite = formulaAtlas[eq.formulaIndex]?.[eq.bright ? 1 : 0];
      if (sprite) ctx.drawImage(sprite, -5, -27);
      else {
        ctx.fillStyle = eq.bright ? '#fff1d1' : '#d2a875';
        ctx.fillText(formulas[eq.formulaIndex], 0, 0);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawDisk(near) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < particles.length; i += detailStep) {
      const particle = particles[i];
      const r = 1.7 + ((particle.radius - 1.7 - time * particle.pull + 20.3 * 1000) % 20.3);
      const a = particle.angle + time * .34 / Math.pow(r, .72) + (particle.radius - r) * .13;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const isNear = dot([x, 0, z], cameraBasis.eye) > 0;
      if (isNear !== near) continue;
      const y = sheetY(x, z, r) + (particle.layer - .5) * (.065 + r * .012);
      const p = project(x, y, z);
      if (!onScreen(p, 20)) continue;
      const da = particle.length * (1 + r * .11);
      const qx = Math.cos(a + da) * r, qz = Math.sin(a + da) * r;
      const q = project(qx, sheetY(qx, qz, r) + (particle.layer - .5) * (.065 + r * .012), qz);
      if (!q) continue;
      const heat = Math.exp(-(r - 1.7) * .37);
      const fade = clamp((r - 1.7) / .35, 0, 1) * clamp((22 - r) / 1.3, 0, 1);
      const alpha = clamp((.025 + heat * .21) * particle.brightness * fade * (near ? 1.25 : .9), 0, .4);
      ctx.strokeStyle = r < 3.1 ? `rgba(255,237,185,${alpha})` : `rgba(213,160,83,${alpha})`;
      ctx.lineWidth = Math.max(.45, particle.width * Math.min(1.6, p.scale / 75));
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    }
    ctx.restore();
  }

  function drawInnerOrbits(near) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let ring = 0; ring < 12; ring++) {
      const r = 1.73 + ring * .105;
      ctx.beginPath();
      let open = false;
      for (let i = 0; i <= 250; i++) {
        const a = i / 250 * TAU;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const visible = (dot([x, 0, z], cameraBasis.eye) > 0) === near;
        const p = visible ? project(x, sheetY(x, z, r) + (ring - 6) * .018, z) : null;
        if (!p) { open = false; continue; }
        if (!open) { ctx.moveTo(p.x, p.y); open = true; }
        else ctx.lineTo(p.x, p.y);
      }
      const alpha = (1 - ring / 15) * (near ? .31 : .19);
      ctx.strokeStyle = `rgba(255,233,177,${alpha})`;
      ctx.lineWidth = ring < 2 ? 1.5 : .65;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBlackHole() {
    const p = project(0, 0, 0, false);
    if (!p) return;
    const r = p.scale * 2.32;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const aura = ctx.createRadialGradient(p.x, p.y, r * .88, p.x, p.y, r * 1.75);
    aura.addColorStop(0, 'rgba(255,221,151,.25)');
    aura.addColorStop(.12, 'rgba(237,173,89,.17)');
    aura.addColorStop(.42, 'rgba(173,103,43,.047)');
    aura.addColorStop(1, 'rgba(173,103,43,0)');
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.75, 0, TAU); ctx.fill();
    ctx.restore();

    const shadow = ctx.createRadialGradient(p.x - r * .12, p.y - r * .13, r * .05, p.x, p.y, r);
    shadow.addColorStop(0, '#010101');
    shadow.addColorStop(.88, '#010101');
    shadow.addColorStop(.985, '#080705');
    shadow.addColorStop(1, '#21170b');
    ctx.fillStyle = shadow;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const rim = ctx.createLinearGradient(p.x - r, p.y - r, p.x + r, p.y + r);
    rim.addColorStop(0, 'rgba(255,238,190,.96)');
    rim.addColorStop(.34, 'rgba(255,244,216,.91)');
    rim.addColorStop(.65, 'rgba(183,127,60,.49)');
    rim.addColorStop(1, 'rgba(248,206,127,.84)');
    ctx.shadowColor = '#e8bc78';
    ctx.shadowBlur = r * .12;
    ctx.strokeStyle = rim;
    ctx.lineWidth = Math.max(2, r * .032);
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.012, 0, TAU); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(229,178,102,.29)';
    ctx.lineWidth = Math.max(1, r * .064);
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.075, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  function drawPhotonFlare() {
    const p = project(0, 0, 0, false);
    if (!p) return;
    const r = p.scale * 2.32;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round';
    for (const layer of [
      { radius: 1.055, width: .23, alpha: .11, blur: .27, color: '255,201,120' },
      { radius: 1.055, width: .105, alpha: .28, blur: .16, color: '255,219,156' },
      { radius: 1.045, width: .032, alpha: .73, blur: .07, color: '255,245,210' }
    ]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y + r * .035, r * layer.radius, Math.PI * 1.02, Math.PI * 1.98);
      ctx.strokeStyle = `rgba(${layer.color},${layer.alpha})`;
      ctx.lineWidth = r * layer.width;
      ctx.shadowColor = '#e6b372';
      ctx.shadowBlur = r * layer.blur;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    for (let i = 0; i < 14; i++) {
      const radius = r * (1.02 + i * .025);
      ctx.beginPath();
      ctx.arc(p.x, p.y + r * .04, radius, Math.PI * (1.02 + i * .004), Math.PI * (1.98 - i * .003));
      ctx.strokeStyle = `rgba(255,214,143,${.115 * (1 - i / 16)})`;
      ctx.lineWidth = i < 3 ? 1.35 : .75;
      ctx.stroke();
    }
    for (let i = 0; i < 310; i++) {
      const theta = Math.PI * (1.02 + i / 310 * .96);
      const radius = r * (1.02 + (i * .6180339887 % 1) * .41);
      const opacity = .045 + .12 * Math.pow(1 - (radius / r - 1) / .44, 1.5);
      ctx.strokeStyle = `rgba(255,207,125,${opacity})`;
      ctx.lineWidth = .5 + (i % 13 === 0 ? .6 : 0);
      ctx.beginPath();
      ctx.arc(p.x, p.y + r * .04, radius, theta, theta + .008 + (i % 9) * .003);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAccretionGlow(near) {
    const p = project(0, 0, 0, false);
    if (!p) return;
    const r = p.scale * 2.32;
    const start = near ? .02 : Math.PI + .02;
    const end = near ? Math.PI - .02 : TAU - .02;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round';
    for (const layer of [
      { width: .39, alpha: near ? .075 : .065, color: '202,130,64' },
      { width: .17, alpha: near ? .18 : .13, color: '235,175,92' },
      { width: .022, alpha: near ? .33 : .23, color: '255,219,148' }
    ]) {
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + r * .23, r * 2.43, r * .54,
        camera.roll * .48, start, end);
      ctx.strokeStyle = `rgba(${layer.color},${layer.alpha})`;
      ctx.lineWidth = Math.max(1, r * layer.width);
      ctx.stroke();
    }
    ctx.restore();
  }

  function clearFarFieldBehindHorizon() {
    const p = project(0, 0, 0, false);
    if (!p) return;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.scale * 2.78, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawRipples(delta) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ripples = ripples.filter(r => r.age < 1.55);
    for (const wave of ripples) {
      wave.age += delta;
      const opacity = Math.pow(Math.max(0, 1 - wave.age / 1.55), 1.55);
      for (let j = 0; j < 3; j++) {
        const age = wave.age - j * .13;
        if (age <= 0) continue;
        const radius = age * Math.min(w, h) * .31;
        ctx.beginPath();
        ctx.ellipse(wave.x, wave.y, radius, radius * (.7 + j * .08), camera.roll, 0, TAU);
        ctx.strokeStyle = `rgba(248,222,163,${opacity * (.56 - j * .13)})`;
        ctx.lineWidth = j === 0 ? 2.2 : 1.1;
        ctx.shadowBlur = 24;
        ctx.shadowColor = '#e4b870';
        ctx.stroke();
      }
      const front = wave.age * Math.min(w, h) * .31;
      for (let strand = 0; strand < 26; strand++) {
        const theta = strand * TAU / 26 + wave.seed;
        const bend = Math.sin(strand * 3.7 + wave.age * 13) * (3 + front * .026);
        const radius = front + bend;
        const start = theta + wave.age * .12;
        ctx.beginPath();
        ctx.ellipse(wave.x, wave.y, radius, radius * .79, camera.roll, start, start + .16 + strand % 4 * .035);
        ctx.strokeStyle = `rgba(255,232,182,${opacity * (.16 + strand % 5 * .055)})`;
        ctx.lineWidth = strand % 6 === 0 ? 2.1 : .7;
        ctx.shadowBlur = strand % 6 === 0 ? 16 : 0;
        ctx.stroke();
      }
      const flash = Math.max(0, 1 - wave.age * 5);
      if (flash) {
        const flareRadius = 72 + flash * 28;
        const g = ctx.createRadialGradient(wave.x, wave.y, 0, wave.x, wave.y, flareRadius);
        g.addColorStop(0, `rgba(255,244,212,${flash * .72})`);
        g.addColorStop(.22, `rgba(241,199,126,${flash * .25})`);
        g.addColorStop(1, 'rgba(241,199,126,0)');
        ctx.fillStyle = g;
        ctx.fillRect(wave.x - flareRadius, wave.y - flareRadius, flareRadius * 2, flareRadius * 2);
      }
      for (let i = 0; i < 44; i++) {
        const angle = i * 2.399963229728653 + wave.seed + wave.age * (i % 3 ? .6 : -.3);
        const spread = Math.min(1, wave.age * 2.8) * (18 + i % 9 * 7) + front * (.4 + i % 7 * .07);
        const x = wave.x + Math.cos(angle) * spread;
        const y = wave.y + Math.sin(angle) * spread * .79;
        ctx.fillStyle = `rgba(255,227,174,${opacity * (.35 + i % 4 * .12)})`;
        const size = i % 8 === 0 ? 2.4 : 1.15;
        ctx.fillRect(x, y, size, size);
      }
    }
    ctx.restore();
  }

  function draw() {
    const now = performance.now();
    requestAnimationFrame(draw);
    if (previousTime && now - previousTime < (w < 760 ? 31 : 22)) return;
    const delta = Math.min(.05, Math.max(0, (now - previousTime) / 1000));
    previousTime = now;
    const smoothing = reduceMotion ? 1 : 1 - Math.exp(-delta * 8);
    camera.yaw = lerp(camera.yaw, camera.targetYaw, smoothing);
    camera.pitch = lerp(camera.pitch, camera.targetPitch, smoothing);
    camera.distance = lerp(camera.distance, camera.targetDistance, smoothing);
    camera.panX = lerp(camera.panX, camera.targetPanX, smoothing);
    camera.panY = lerp(camera.panY, camera.targetPanY, smoothing);
    if (!paused) time += delta;
    gravityPulse = Math.min(2, ripples.reduce((sum, wave) => sum + Math.pow(Math.max(0, 1 - wave.age / 1.55), 2), 0));
    updateBasis();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    background();
    drawStars();
    drawOuterEquations();
    drawSpaceTimeMesh();
    drawCausticLanes(false);
    drawEquations(false);
    drawDisk(false);
    drawInnerOrbits(false);
    drawAccretionGlow(false);
    drawPhotonFlare();
    drawBlackHole();
    drawAccretionGlow(true);
    drawCausticLanes(true);
    drawDisk(true);
    drawInnerOrbits(true);
    drawEquations(true);
    drawRipples(delta);
  }

  function setActiveView(view) {
    orbitButton.classList.toggle('active', view === 'orbit');
    topButton.classList.toggle('active', view === 'top');
    orbitButton.setAttribute('aria-pressed', String(view === 'orbit'));
    topButton.setAttribute('aria-pressed', String(view === 'top'));
  }

  function setPreset(view) {
    if (view === 'top') {
      camera.targetYaw = -.1;
      camera.targetPitch = 1.34;
      camera.targetDistance = 12.4;
      camera.targetPanX = 0;
      camera.targetPanY = 0;
      status.textContent = '已切换到俯瞰视角';
    } else {
      camera.targetYaw = -.12;
      camera.targetPitch = .27;
      camera.targetDistance = 9.3;
      camera.targetPanX = 0;
      camera.targetPanY = 0;
      status.textContent = '已切换到轨道视角';
    }
    setActiveView(view);
  }

  function rippleAt(x, y) {
    ripples.push({ x, y, age: 0, seed: random() * TAU });
    if (ripples.length > 8) ripples.shift();
    status.textContent = '时空波纹已激发';
  }

  function localPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', e => {
    const p = localPoint(e);
    touches.set(e.pointerId, p);
    canvas.setPointerCapture(e.pointerId);
    if (touches.size === 1) {
      dragging = true;
      canvas.classList.add('dragging');
      pointerStart = { x: p.x, y: p.y, lastX: p.x, lastY: p.y, moved: false };
      dragMode = e.shiftKey || e.button === 2 ? 'pan' : 'orbit';
    } else if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      touchGesture = { distance: Math.hypot(a.x - b.x, a.y - b.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
      if (pointerStart) pointerStart.moved = true;
    }
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', e => {
    if (!touches.has(e.pointerId)) return;
    const p = localPoint(e);
    touches.set(e.pointerId, p);
    if (touches.size >= 2) {
      const [a, b] = [...touches.values()];
      const next = { distance: Math.hypot(a.x - b.x, a.y - b.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
      if (touchGesture) {
        camera.targetDistance = clamp(camera.targetDistance * touchGesture.distance / Math.max(1, next.distance), 5.5, 24);
        camera.targetPanX += next.midX - touchGesture.midX;
        camera.targetPanY += next.midY - touchGesture.midY;
      }
      touchGesture = next;
      return;
    }
    if (!pointerStart) return;
    const dx = p.x - pointerStart.lastX, dy = p.y - pointerStart.lastY;
    pointerStart.lastX = p.x; pointerStart.lastY = p.y;
    if (Math.hypot(p.x - pointerStart.x, p.y - pointerStart.y) > 5) pointerStart.moved = true;
    if (dragMode === 'pan' || e.shiftKey) {
      camera.targetPanX += dx;
      camera.targetPanY += dy;
    } else {
      camera.targetYaw -= dx * .005;
      camera.targetPitch = clamp(camera.targetPitch + dy * .004, -.85, 1.5);
      setActiveView('custom');
    }
  });

  function endPointer(e) {
    const p = localPoint(e);
    if (touches.size === 1 && pointerStart && !pointerStart.moved && e.button === 0) rippleAt(p.x, p.y);
    touches.delete(e.pointerId);
    if (touches.size < 2) touchGesture = null;
    if (!touches.size) {
      dragging = false;
      pointerStart = null;
      canvas.classList.remove('dragging');
    } else {
      const remaining = [...touches.values()][0];
      pointerStart = { x: remaining.x, y: remaining.y, lastX: remaining.x, lastY: remaining.y, moved: true };
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', e => {
    if (pointerStart) pointerStart.moved = true;
    endPointer(e);
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    camera.targetDistance = clamp(camera.targetDistance * Math.exp(e.deltaY * .0011), 5.5, 24);
    setActiveView('custom');
  }, { passive: false });

  orbitButton.addEventListener('click', () => setPreset('orbit'));
  topButton.addEventListener('click', () => setPreset('top'));
  resetButton.addEventListener('click', () => setPreset('orbit'));
  function toggleCinema() {
    const active = experience.classList.toggle('cinema-mode');
    cinemaButton.setAttribute('aria-pressed', String(active));
    cinemaButton.setAttribute('aria-label', active ? '显示操作界面' : '进入纯画面模式');
    cinemaButton.title = active ? '显示操作界面（I）' : '进入纯画面模式（I）';
    cinemaButton.innerHTML = active ? '操作 <span>↙</span>' : '纯画面 <span>↗</span>';
    status.textContent = active ? '已进入纯画面模式' : '已退出纯画面模式';
  }
  cinemaButton.addEventListener('click', toggleCinema);
  pauseButton.addEventListener('click', () => {
    paused = !paused;
    window.gravityPaused = paused;
    window.dispatchEvent(new CustomEvent('gravity-pause', { detail: { paused } }));
    pauseButton.textContent = paused ? '▶' : 'Ⅱ';
    pauseButton.setAttribute('aria-label', paused ? '播放动画' : '暂停动画');
    pauseButton.title = paused ? '播放动画' : '暂停动画';
    status.textContent = paused ? '动画已暂停' : '动画已播放';
  });
  if (paused) {
    pauseButton.textContent = '▶';
    pauseButton.setAttribute('aria-label', '播放动画');
    pauseButton.title = '播放动画';
  }

  window.addEventListener('keydown', e => {
    if (e.target instanceof HTMLElement && e.target.closest('button, input, textarea, select')) return;
    const key = e.key.toLowerCase();
    if (key === 'arrowleft') camera.targetYaw += .1;
    else if (key === 'arrowright') camera.targetYaw -= .1;
    else if (key === 'arrowup') camera.targetPitch = clamp(camera.targetPitch - .1, -.85, 1.5);
    else if (key === 'arrowdown') camera.targetPitch = clamp(camera.targetPitch + .1, -.85, 1.5);
    else if (key === '+' || key === '=') camera.targetDistance = clamp(camera.targetDistance * .89, 5.5, 24);
    else if (key === '-' || key === '_') camera.targetDistance = clamp(camera.targetDistance * 1.12, 5.5, 24);
    else if (key === 'r') setPreset('orbit');
    else if (key === 'i') toggleCinema();
    else if (key === ' ') pauseButton.click();
    else return;
    e.preventDefault();
  });

  function registerWebMCP() {
    if (!document.modelContext?.registerTool) return;
    const tools = [
      {
        name: 'set_black_hole_view', title: '切换黑洞视角',
        description: '将交互场景切换到轨道视角或俯瞰视角。',
        inputSchema: { type: 'object', properties: { view: { type: 'string', enum: ['orbit', 'top'] } }, required: ['view'], additionalProperties: false },
        annotations: { readOnlyHint: false },
        execute(input) {
          if (!input || !['orbit', 'top'].includes(input.view)) throw new Error('view 必须是 orbit 或 top');
          setPreset(input.view);
          return { view: input.view, status: 'updated' };
        }
      },
      {
        name: 'trigger_gravitational_wave', title: '激发引力波纹',
        description: '在场景中指定的相对位置激发一次可见的引力波纹。',
        inputSchema: { type: 'object', properties: { x: { type: 'number', minimum: 0, maximum: 1 }, y: { type: 'number', minimum: 0, maximum: 1 } }, required: ['x', 'y'], additionalProperties: false },
        annotations: { readOnlyHint: false },
        execute(input) {
          if (!input || !Number.isFinite(input.x) || !Number.isFinite(input.y) || input.x < 0 || input.x > 1 || input.y < 0 || input.y > 1) throw new Error('x 和 y 必须在 0 到 1 之间');
          rippleAt(input.x * w, input.y * h);
          return { status: 'triggered', x: input.x, y: input.y };
        }
      }
    ];
    for (const tool of tools) {
      try { Promise.resolve(document.modelContext.registerTool(tool)).catch(() => {}); }
      catch (_) { /* Browser does not support this optional interface. */ }
    }
  }

  window.addEventListener('resize', resize, { passive: true });
  resize();
  registerWebMCP();
  requestAnimationFrame(draw);
})();
