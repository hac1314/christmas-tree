const GOLD = 0xffd591;
const POINTER_SLOP = 7;
export const SHAPES = ['tree', 'nebula', 'heart', 'ring', 'spiral'];
const SHAPE_SET = new Set(SHAPES);
const SHAPE_SHOCK_COLORS = {
  tree: 0xffd98a,
  nebula: 0xffc978,
  heart: 0xff8ea6,
  ring: 0x9be0ff,
  spiral: 0xd2adff,
};
const TRAIL_TINTS = {
  open: 0xffdf94,
  fist: 0xffd788,
  one: 0xffb8c8,
  two: 0xb6e3ff,
  three: 0xe4ccff,
  aim: 0xffe8ab,
  press: 0xfff2c2,
  held: 0xfff7d8,
  neutral: 0xffe29e,
};
const MAX_TRAIL = 160;
let threePromise = null;

export function preloadSceneEngine() {
  return threePromise ||= import('./vendor/three.module.js');
}

const BRANCH_TIERS = [
  { y: -2.91, radius: 2.99, rise: 1.49, branches: 13 },
  { y: -1.96, radius: 2.63, rise: 1.48, branches: 12 },
  { y: -1.00, radius: 2.20, rise: 1.42, branches: 11 },
  { y: -.04, radius: 1.75, rise: 1.38, branches: 10 },
  { y: .92, radius: 1.26, rise: 1.32, branches: 9 },
  { y: 1.87, radius: .83, rise: 1.45, branches: 8 },
];

const RING_COS_X = Math.cos(.4537856);
const RING_SIN_X = Math.sin(.4537856);
const RING_COS_Z = Math.cos(.2443461);
const RING_SIN_Z = Math.sin(.2443461);

function tiltRing(x, y, z) {
  const y1 = y * RING_COS_X - z * RING_SIN_X;
  const z1 = y * RING_SIN_X + z * RING_COS_X;
  return [x * RING_COS_Z - y1 * RING_SIN_Z, x * RING_SIN_Z + y1 * RING_COS_Z, z1];
}

function heartPoint(u, shell, zOffset) {
  const sinU = Math.sin(u);
  const scale = .215 * shell;
  const x = 16 * sinU * sinU * sinU * scale;
  const y = (13 * Math.cos(u) - 5 * Math.cos(2 * u) - 2 * Math.cos(3 * u) - Math.cos(4 * u)) * scale + .25;
  return [x, y, zOffset];
}

function randomSequence(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function spherePoint(random, radius) {
  const y = random() * 2 - 1;
  const angle = random() * Math.PI * 2;
  const horizontal = Math.sqrt(1 - y * y) * radius;
  return [Math.cos(angle) * horizontal, y * radius, Math.sin(angle) * horizontal];
}

function branchRim(tier, angle) {
  const needleFan = (.5 + .5 * Math.cos(angle * tier.branches + tier.y * 1.8)) ** 1.6;
  return .84 + .16 * needleFan + .035 * Math.sin(angle * 3 + tier.y);
}

function pointCloud(THREE, fromAttr, targetAttr, colors, sizes, phases, scale) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', fromAttr);
  geometry.setAttribute('aTarget', targetAttr);
  geometry.setAttribute('aTint', colors instanceof THREE.BufferAttribute ? colors : new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', sizes instanceof THREE.BufferAttribute ? sizes : new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', phases instanceof THREE.BufferAttribute ? phases : new THREE.Float32BufferAttribute(phases, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMorph: { value: 0 },
      uFromSpread: { value: 1 },
      uToSpread: { value: 1 },
      uNebulaMix: { value: 0 },
      uHeartMix: { value: 0 },
      uRingMix: { value: 0 },
      uSpiralMix: { value: 0 },
      uTime: { value: 0 },
      uScale: { value: scale },
    },
    vertexShader: [
      'attribute vec3 aTarget; attribute vec3 aTint; attribute float aSize; attribute float aPhase;',
      'uniform float uMorph; uniform float uFromSpread; uniform float uToSpread; uniform float uNebulaMix; uniform float uHeartMix; uniform float uRingMix; uniform float uSpiralMix; uniform float uTime; uniform float uScale;',
      'varying vec3 vTint; varying float vPulse; varying float vSurge;',
      'void main() {',
      '  float stagger = fract(aPhase * 0.15915494 + position.y * 0.085);',
      '  float local = clamp((uMorph - stagger * 0.24) / 0.76, 0.0, 1.0);',
      '  float t = local * local * (3.0 - 2.0 * local);',
      '  vec3 p0 = position * vec3(uFromSpread, 1.0, uFromSpread);',
      '  vec3 p1 = aTarget * vec3(uToSpread, 1.0, uToSpread);',
      '  vec3 point = mix(p0, p1, t);',
      '  float surge = sin(t * 3.14159265);',
      '  float swirl = surge * (0.95 + stagger * 0.55);',
      '  float cs = cos(swirl);',
      '  float sn = sin(swirl);',
      '  point.xz = mat2(cs, -sn, sn, cs) * point.xz;',
      '  point.y += surge * 0.16 * (stagger - 0.5);',
      '  float shimmer = sin(uTime * 1.2 + aPhase);',
      '  point.x += sin(uTime * .62 + aPhase) * .035 * uNebulaMix;',
      '  vec4 eyePoint = modelViewMatrix * vec4(point, 1.);',
      '  gl_Position = projectionMatrix * eyePoint;',
      '  gl_PointSize = clamp(aSize * uScale * 15.6 / -eyePoint.z, 1.2, 60.);',
      '  vec3 tint = mix(aTint, vec3(1.0, 0.58, 0.66), uHeartMix * 0.42);',
      '  tint = mix(tint, vec3(0.76, 0.89, 1.0), uRingMix * 0.28);',
      '  tint = mix(tint, vec3(0.84, 0.72, 1.0), uSpiralMix * 0.24);',
      '  vTint = tint;',
      '  vSurge = surge;',
      '  vPulse = (.78 + .22 * shimmer) * (1.0 + 0.34 * surge);',
      '}',
    ].join('\n'),
    fragmentShader: [
      'varying vec3 vTint; varying float vPulse; varying float vSurge;',
      'void main() {',
      '  vec2 d = gl_PointCoord * 2.0 - 1.0;',
      '  float d2 = dot(d, d);',
      '  if (d2 > 1.0) discard;',
      '  float inv = 1.0 - d2;',
      '  float inv2 = inv * inv;',
      '  float aura = inv2 * 0.16;',
      '  float body = inv2 * inv2 * 0.44;',
      '  float core = smoothstep(0.065, 0.002, d2);',
      '  vec3 hotColor = mix(vTint, vec3(1.0, 0.96, 0.86), core * (0.42 + 0.25 * vSurge));',
      '  gl_FragColor = vec4(hotColor, min((core * 0.88 + body + aura) * vPulse, 1.0));',
      '}',
    ].join('\n'),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

function makeTree(THREE, density, pixelRatio) {
  const random = randomSequence(1832);
  const tierCounts = BRANCH_TIERS.map(tier => ({
    needles: Math.round((650 + tier.radius * 790) * density),
    lamps: Math.round((137 + tier.radius * 108) * density),
  }));
  const baseCount = Math.round(340 * density);
  const topCount = Math.round(60 * density);
  const total = tierCounts.reduce((sum, item) => sum + item.needles + item.lamps, baseCount + topCount);

  const tree = new Float32Array(total * 3);
  const nebula = new Float32Array(total * 3);
  const heart = new Float32Array(total * 3);
  const ring = new Float32Array(total * 3);
  const spiral = new Float32Array(total * 3);
  const scratch = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  const sizes = new Float32Array(total);
  const phases = new Float32Array(total);

  const green = [0x24563f, 0x367b4e, 0x459663, 0x79aa66];
  const warm = [0xd69544, 0xf4b96b, 0xffd49b, 0xffe9bc];
  const red = [0xbe332e, 0xd34c41, 0xef6756];
  const ink = new THREE.Color();
  let cursor = 0;

  const add = (x, y, z, tint, size) => {
    const idx = cursor++;
    const i3 = idx * 3;
    tree[i3] = x; tree[i3 + 1] = y; tree[i3 + 2] = z;

    const cloud = spherePoint(random, 1.35 + Math.pow(random(), .64) * 4.15);
    nebula[i3] = cloud[0] * 1.09;
    nebula[i3 + 1] = cloud[1] * .74 + cloud[0] * .16;
    nebula[i3 + 2] = cloud[2] * .77;

    const hu = random() * Math.PI * 2;
    const hShell = Math.pow(random(), .35);
    const hz = (random() - .5) * 2.2 * Math.sqrt(Math.max(.05, 1 - hShell * hShell * .72));
    const hp = heartPoint(hu, hShell, hz);
    heart[i3] = hp[0]; heart[i3 + 1] = hp[1]; heart[i3 + 2] = hp[2];

    if (idx % 10 < 3) {
      const rp = spherePoint(random, Math.pow(random(), 1 / 3) * 1.45);
      ring[i3] = rp[0]; ring[i3 + 1] = rp[1]; ring[i3 + 2] = rp[2];
    } else {
      const rAngle = random() * Math.PI * 2;
      const rRad = 2.25 + random() * 2.20;
      const rp = tiltRing(Math.cos(rAngle) * rRad, (random() - .5) * .20, Math.sin(rAngle) * rRad);
      ring[i3] = rp[0]; ring[i3 + 1] = rp[1]; ring[i3 + 2] = rp[2];
    }

    const arm = idx % 3;
    const st = random();
    const sy = (st - .5) * 6.4 + (random() - .5) * .24;
    const sTheta = st * Math.PI * 4.5 + arm * (Math.PI * 2 / 3) + (random() - .5) * .22;
    const sr = 1.1 + 2.3 * Math.sin(st * Math.PI * .85 + .2) + (random() - .5) * .52;
    spiral[i3] = Math.cos(sTheta) * sr;
    spiral[i3 + 1] = sy;
    spiral[i3 + 2] = Math.sin(sTheta) * sr;

    ink.setHex(tint);
    colors[i3] = ink.r; colors[i3 + 1] = ink.g; colors[i3 + 2] = ink.b;
    sizes[idx] = size * 1.08;
    phases[idx] = random() * Math.PI * 2;
  };

  for (const [index, tier] of BRANCH_TIERS.entries()) {
    const { needles, lamps } = tierCounts[index];
    for (let i = 0; i < needles; i++) {
      const angle = random() * Math.PI * 2;
      const outward = Math.pow(random(), .49);
      const rim = branchRim(tier, angle);
      const radius = tier.radius * outward * rim;
      const droop = outward ** 3 * (.18 - .08 * Math.sin(angle * tier.branches));
      const y = tier.y + tier.rise * (1 - outward ** .78) - droop
        + (random() - .5) * (.12 + .48 * (1 - outward));
      const tone = random();
      const palette = tone < .026 ? red : tone < .23 ? warm : green;
      const size = tone < .026 ? 4 + random() * 4.7 : 2.8 + random() * 4.5;
      add(Math.cos(angle) * radius, y, Math.sin(angle) * radius,
        palette[Math.floor(random() * palette.length)], size);
    }

    for (let i = 0; i < lamps; i++) {
      const progress = i / lamps;
      const angle = progress * Math.PI * 1.84 + index * 1.1 + .21;
      const rim = branchRim(tier, angle);
      const radius = tier.radius * rim * (.89 + .075 * (1 - progress)) + random() * .09;
      const y = tier.y + .012 + progress * .32 + Math.sin(angle * 2) * .13 + (random() - .5) * .13;
      const bright = random() < .16;
      add(Math.cos(angle) * radius, y, Math.sin(angle) * radius,
        bright ? 0xfff2cc : warm[i % warm.length], bright ? 7 + random() * 4.3 : 3.2 + random() * 4);
    }
  }

  for (let i = 0; i < baseCount; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 2.64 + random() * .54;
    add(Math.cos(angle) * radius, -3.44 + (random() - .5) * .13, Math.sin(angle) * radius,
      warm[i % warm.length], 2.8 + random() * 4.2);
  }
  for (let i = 0; i < topCount; i++) {
    const angle = random() * Math.PI * 2;
    const radius = random() * .39;
    add(Math.cos(angle) * radius, 3.51 + Math.sin(angle) * radius, (random() - .5) * .25,
      warm[i % warm.length], 2.1 + random() * 5);
  }

  const shapeAttrs = {
    tree: new THREE.Float32BufferAttribute(tree, 3),
    nebula: new THREE.Float32BufferAttribute(nebula, 3),
    heart: new THREE.Float32BufferAttribute(heart, 3),
    ring: new THREE.Float32BufferAttribute(ring, 3),
    spiral: new THREE.Float32BufferAttribute(spiral, 3),
  };
  const scratchAttr = new THREE.Float32BufferAttribute(scratch, 3);
  const points = pointCloud(THREE, shapeAttrs.tree, shapeAttrs.tree, colors, sizes, phases, pixelRatio);
  return { points, shapeAttrs, scratchAttr, total };
}

function makeStars(THREE, pixelRatio) {
  const random = randomSequence(38769);
  const positions = new Float32Array(450 * 3);
  const colors = new Float32Array(450 * 3);
  const sizes = new Float32Array(450);
  const phases = new Float32Array(450);
  for (let i = 0; i < 450; i++) {
    const i3 = i * 3;
    positions[i3] = (random() - .5) * 19;
    positions[i3 + 1] = (random() - .5) * 13;
    positions[i3 + 2] = -2.4 - random() * 4.7;
    colors[i3] = .55; colors[i3 + 1] = .66; colors[i3 + 2] = .78;
    sizes[i] = .9 + Math.pow(random(), 5) * 4.8;
    phases[i] = random() * 6.28;
  }
  const starAttr = new THREE.Float32BufferAttribute(positions, 3);
  return pointCloud(THREE, starAttr, starAttr, colors, sizes, phases, pixelRatio);
}

function makeFinial(THREE) {
  const group = new THREE.Group();
  const haloMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 1 },
    },
    vertexShader: [
      'varying vec2 vUv;',
      'void main() {',
      '  vUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}',
    ].join('\n'),
    fragmentShader: [
      'uniform float uTime; uniform float uOpacity;',
      'varying vec2 vUv;',
      'void main() {',
      '  vec2 p = vUv * 2.0 - 1.0;',
      '  float r = length(p);',
      '  float edgeMask = smoothstep(0.98, 0.25, r);',
      '  if (edgeMask <= 0.0) discard;',
      '  float breath = 0.88 + 0.12 * sin(uTime * 2.1);',
      '  float radial = exp(-r * 4.6) * 0.72 + exp(-r * 13.0) * 0.65;',
      '  float hRay = exp(-abs(p.y) * 34.0) * exp(-abs(p.x) * 2.1) * 0.78;',
      '  float vRay = exp(-abs(p.x) * 38.0) * exp(-abs(p.y) * 2.5) * 0.68;',
      '  vec2 rot = vec2(p.x + p.y, p.x - p.y) * 0.70710678;',
      '  float dRay = (exp(-abs(rot.x) * 44.0) + exp(-abs(rot.y) * 44.0)) * exp(-r * 4.8) * 0.28;',
      '  float glow = (radial + (hRay + vRay + dRay) * breath) * edgeMask * uOpacity;',
      '  if (glow < 0.002) discard;',
      '  vec3 col = mix(vec3(1.0, 0.81, 0.44), vec3(1.0, 0.98, 0.90), clamp(exp(-r * 7.5) + (hRay + vRay) * 0.4, 0.0, 1.0));',
      '  gl_FragColor = vec4(col, min(glow, 1.0));',
      '}',
    ].join('\n'),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 2.7), haloMaterial);
  halo.position.z = -.02;

  const path = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const angle = Math.PI / 2 + Math.PI * i / 4;
    const radius = i % 2 ? .115 : .41;
    const x = Math.cos(angle) * radius * .83;
    const y = Math.sin(angle) * radius;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
  const face = new THREE.Mesh(
    new THREE.ShapeGeometry(path),
    new THREE.MeshBasicMaterial({ color: 0xfff6d8, side: THREE.DoubleSide, transparent: true, depthWrite: false })
  );
  group.add(halo, face);
  group.position.set(0, 3.53, .15);
  return { group, halo, face };
}

function makeSnow(THREE, compact, pixelRatio) {
  const random = randomSequence(91423);
  const count = compact ? 220 : 360;
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const gold = new THREE.Color(0xffd996);
  const ice = new THREE.Color(0xd9ebff);
  const moon = new THREE.Color(0xf2f6ff);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    positions[i3] = (random() - .5) * 19;
    positions[i3 + 1] = (random() - .5) * 13;
    positions[i3 + 2] = -5.8 + random() * 11;
    speeds[i] = .28 + random() * .58;
    phases[i] = random() * Math.PI * 2;
    sizes[i] = 2.2 + Math.pow(random(), 2.2) * 5.6;
    const tone = random();
    const tint = tone < .25 ? gold : tone < .6 ? ice : moon;
    colors[i3] = tint.r;
    colors[i3 + 1] = tint.g;
    colors[i3 + 2] = tint.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSpeed', new THREE.Float32BufferAttribute(speeds, 1));
  geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('aTint', new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: pixelRatio },
    },
    vertexShader: [
      'attribute float aSpeed; attribute float aPhase; attribute float aSize; attribute vec3 aTint;',
      'uniform float uTime; uniform float uScale;',
      'varying vec3 vTint; varying float vAlpha; varying float vSoftness;',
      'void main() {',
      '  vec3 pos = position;',
      '  pos.y = mod(pos.y - uTime * aSpeed + 6.5, 13.0) - 6.5;',
      '  float sway = uTime * (0.45 + aSpeed * 0.35) + aPhase;',
      '  pos.x += sin(sway) * 0.28 + cos(sway * 0.53) * 0.14;',
      '  pos.z += cos(sway * 0.7) * 0.16;',
      '  float edgeFade = smoothstep(-6.5, -5.2, pos.y) * smoothstep(6.5, 5.2, pos.y);',
      '  float depthNorm = clamp((pos.z + 5.8) / 11.0, 0.0, 1.0);',
      '  vec4 eyePoint = modelViewMatrix * vec4(pos, 1.0);',
      '  gl_Position = projectionMatrix * eyePoint;',
      '  gl_PointSize = clamp(aSize * uScale * 13.5 / max(-eyePoint.z, 2.5), 1.5, 38.0);',
      '  vTint = aTint;',
      '  vSoftness = mix(0.25, 0.85, depthNorm);',
      '  vAlpha = edgeFade * (0.28 + 0.36 * depthNorm);',
      '}',
    ].join('\n'),
    fragmentShader: [
      'varying vec3 vTint; varying float vAlpha; varying float vSoftness;',
      'void main() {',
      '  vec2 d = gl_PointCoord * 2.0 - 1.0;',
      '  float d2 = dot(d, d);',
      '  if (d2 > 1.0) discard;',
      '  float inv = 1.0 - d2;',
      '  float softBokeh = inv * inv * (0.48 + 0.34 * inv);',
      '  float crispDot = smoothstep(0.32, 0.02, d2) * 0.55 + inv * inv * 0.45;',
      '  float shape = mix(crispDot, softBokeh, vSoftness);',
      '  gl_FragColor = vec4(vTint, shape * vAlpha);',
      '}',
    ].join('\n'),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

function makeShockwave(THREE) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uProgress: { value: 1 },
      uColor: { value: new THREE.Color(GOLD) },
      uTime: { value: 0 },
    },
    vertexShader: [
      'varying vec2 vUv;',
      'void main() {',
      '  vUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}',
    ].join('\n'),
    fragmentShader: [
      'uniform float uProgress; uniform vec3 uColor; uniform float uTime;',
      'varying vec2 vUv;',
      'void main() {',
      '  vec2 p = vUv * 2.0 - 1.0;',
      '  float r = length(p);',
      '  float edgeMask = smoothstep(0.98, 0.78, r);',
      '  if (edgeMask <= 0.0) discard;',
      '  float m = 1.0 - uProgress;',
      '  float ease = 1.0 - m * m * m;',
      '  float ringR = mix(0.08, 0.86, ease);',
      '  float dr = r - ringR;',
      '  float mainRing = exp(-dr * dr * 920.0);',
      '  float wakeDist = max(0.0, ringR - r);',
      '  float wake = step(r, ringR) * exp(-wakeDist * 26.0) * 0.26;',
      '  float ang = atan(p.y, p.x);',
      '  float shimmer = 0.56 + 0.44 * (0.5 + 0.5 * sin(ang * 14.0 + uTime * 5.0) * cos(ang * 6.0 - uTime * 3.0));',
      '  float flash = exp(-r * 7.5) * smoothstep(0.24, 0.0, uProgress) * 0.52;',
      '  float lifeFade = smoothstep(0.0, 0.07, uProgress) * smoothstep(0.92, 0.22, uProgress);',
      '  float alpha = ((mainRing * 0.95 + wake) * shimmer * lifeFade + flash * smoothstep(0.0, 0.03, uProgress)) * edgeMask;',
      '  if (alpha < 0.002) discard;',
      '  vec3 col = mix(uColor * 1.15, vec3(1.0, 0.97, 0.90), clamp(mainRing * 0.55 + flash, 0.0, 1.0));',
      '  gl_FragColor = vec4(col, min(alpha * 0.86, 1.0));',
      '}',
    ].join('\n'),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(12.2, 12.2), material);
  mesh.position.set(0, 0, .25);
  mesh.visible = false;
  mesh.frustumCulled = false;
  return mesh;
}

function makeHandTrail(THREE, pixelRatio) {
  const positions = new Float32Array(MAX_TRAIL * 3);
  const velocities = new Float32Array(MAX_TRAIL * 2);
  const meta = new Float32Array(MAX_TRAIL * 3);
  const tints = new Float32Array(MAX_TRAIL * 3);
  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.Float32BufferAttribute(positions, 3);
  const velAttr = new THREE.Float32BufferAttribute(velocities, 2);
  const metaAttr = new THREE.Float32BufferAttribute(meta, 3);
  const tintAttr = new THREE.Float32BufferAttribute(tints, 3);
  geometry.setAttribute('position', posAttr);
  geometry.setAttribute('aVelocity', velAttr);
  geometry.setAttribute('aMeta', metaAttr);
  geometry.setAttribute('aTint', tintAttr);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: pixelRatio },
      uAspect: { value: 1 },
    },
    vertexShader: [
      'attribute vec2 aVelocity; attribute vec3 aMeta; attribute vec3 aTint;',
      'uniform float uTime; uniform float uScale; uniform float uAspect;',
      'varying vec3 vTint; varying float vAlpha;',
      'void main() {',
      '  float life = aMeta.y;',
      '  float age = uTime - aMeta.x;',
      '  if (life <= 0.0 || age < 0.0 || age >= life) {',
      '    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);',
      '    gl_PointSize = 0.0;',
      '    vAlpha = 0.0;',
      '    vTint = aTint;',
      '    return;',
      '  }',
      '  float t = age / life;',
      '  vec2 drift = vec2(aVelocity.x / max(uAspect, 0.5), aVelocity.y);',
      '  vec2 ndc = position.xy + drift * age;',
      '  ndc.y += 0.055 * age * age;',
      '  gl_Position = vec4(ndc, 0.0, 1.0);',
      '  gl_PointSize = clamp(aMeta.z * uScale * (1.0 - t * 0.45), 1.5, 36.0);',
      '  float fadeIn = smoothstep(0.0, 0.08, t);',
      '  float fadeOut = 1.0 - t;',
      '  vAlpha = fadeIn * pow(fadeOut, 1.45);',
      '  vTint = aTint;',
      '}',
    ].join('\n'),
    fragmentShader: [
      'varying vec3 vTint; varying float vAlpha;',
      'void main() {',
      '  if (vAlpha <= 0.002) discard;',
      '  vec2 d = gl_PointCoord * 2.0 - 1.0;',
      '  float d2 = dot(d, d);',
      '  if (d2 > 1.0) discard;',
      '  float inv = 1.0 - d2;',
      '  float inv2 = inv * inv;',
      '  float core = smoothstep(0.18, 0.008, d2);',
      '  float halo = inv2 * inv2 * 0.78;',
      '  vec3 col = mix(vTint * 1.15, vec3(1.0, 0.99, 0.92), core * 0.78);',
      '  gl_FragColor = vec4(col, min((core + halo) * vAlpha, 1.0));',
      '}',
    ].join('\n'),
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 20;
  return { points, posAttr, velAttr, metaAttr, tintAttr };
}

const FRONT_POSITIONS = [
  [-.49, 1.92, .72], [.77, 1.20, .86], [-.96, .71, 1.16], [.54, .14, 1.55],
  [-1.57, -.55, 1.43], [1.57, -.84, 1.51], [-1.46, -1.76, 2.10],
  [.64, -2.48, 2.67],
];

const NEBULA_FRONT = [
  [-4.28, 1.52, .95], [3.54, 2.01, 1.18], [-1.54, 2.95, .70], [1.64, -2.89, 1.03],
  [-3.30, -1.75, 1.43], [4.24, -1.29, 1.04], [-.79, -.60, 2.11], [1.27, 1.02, 2.08],
];

const HEART_FRONT_U = [.68, 1.25, 1.92, 2.62, 3.66, 4.36, 5.03, 5.60];

function locatePhoto(THREE, index) {
  const random = randomSequence(7327 + index * 719);
  const sideIndex = Math.max(0, index - FRONT_POSITIONS.length);
  const tier = BRANCH_TIERS[sideIndex % BRANCH_TIERS.length];
  const rearFraction = (sideIndex * .61803398875 + .21) % 1;
  const angle = 1.35 + rearFraction * 3.58;
  const radius = tier.radius * branchRim(tier, angle) + .20;
  const tree = FRONT_POSITIONS[index] || [Math.sin(angle) * radius, tier.y + .23 + random() * .33, Math.cos(angle) * radius];
  const cloud = spherePoint(random, 2.8 + random() * 2.13);
  const nebula = NEBULA_FRONT[index] || [cloud[0] * 1.06, cloud[1] * .72 + cloud[0] * .13, cloud[2] * .80];

  const heart = index < HEART_FRONT_U.length
    ? heartPoint(HEART_FRONT_U[index], .86, .72 + (index % 2) * .42)
    : heartPoint(.4 + ((sideIndex * .61803398875) % 1) * (Math.PI * 2 - .8), .82, -.65 - (sideIndex % 3) * .28);

  const ringAngle = index < 8
    ? (index / 8) * Math.PI * 2 + .35
    : ((sideIndex * .61803398875 + .12) % 1) * Math.PI * 2;
  const ringRad = index < 8 ? 3.20 + (index % 2) * .72 : 2.55 + random() * 1.65;
  const ring = tiltRing(Math.cos(ringAngle) * ringRad, index < 8 ? (index % 3 - 1) * .16 : (random() - .5) * .30, Math.sin(ringAngle) * ringRad);

  const spiralT = index < 8 ? (index + .5) / 8 : ((sideIndex * .61803398875 + .18) % 1);
  const spiralY = (spiralT - .5) * (index < 8 ? 4.8 : 5.2);
  const spiralTheta = index < 8
    ? spiralT * Math.PI * 3.4 - .6
    : spiralT * Math.PI * 4.5 + (sideIndex % 3) * (Math.PI * 2 / 3) + Math.PI;
  const spiralR = (index < 8 ? 1.55 : 1.45) + (index < 8 ? 1.85 : 2.0) * Math.sin(spiralT * Math.PI * .85 + .2);
  const spiral = [Math.cos(spiralTheta) * spiralR, spiralY, Math.sin(spiralTheta) * spiralR];

  return {
    tree: new THREE.Vector3(...tree),
    nebula: new THREE.Vector3(...nebula),
    heart: new THREE.Vector3(...heart),
    ring: new THREE.Vector3(...ring),
    spiral: new THREE.Vector3(...spiral),
    outward: new THREE.Vector3(tree[0], 0, tree[2]).normalize(),
    tilt: (random() - .5) * .22,
  };
}

export async function loadScene(options) {
  const THREE = await preloadSceneEngine();
  if (!options.isCurrent()) return null;
  return createScene(THREE, options);
}

function createScene(THREE, { mount, photos, reducedMotion, onPhoto, onFailure }) {
  const DEFAULT_TILT_X = -.02;
  const MAX_TILT_X = 1.05;
  const MIN_ZOOM = .68;
  const MAX_ZOOM = 1.42;
  const clampX = value => THREE.MathUtils.clamp(value, -MAX_TILT_X, MAX_TILT_X);
  const compact = matchMedia('(max-width: 690px)').matches || matchMedia('(pointer: coarse)').matches;
  let pixelRatio = Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.5);
  const renderer = new THREE.WebGLRenderer({
    alpha: false,
    antialias: false,
    stencil: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x080d16, 1);
  renderer.outputEncoding = THREE.sRGBEncoding;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, .1, 90);
  const root = new THREE.Group();
  scene.add(root);
  const { points: treePoints, shapeAttrs, scratchAttr, total: particleCount } = makeTree(THREE, compact ? .50 : .72, pixelRatio);
  const stars = makeStars(THREE, pixelRatio);
  const { group: finial, halo: finialHalo, face: finialFace } = makeFinial(THREE);
  const snow = makeSnow(THREE, compact, pixelRatio);
  const shockwave = makeShockwave(THREE);
  const handTrail = makeHandTrail(THREE, pixelRatio);
  root.add(treePoints, finial);
  scene.add(stars, snow, shockwave, handTrail.points);
  const photoPlane = new THREE.PlaneGeometry(1, 1);
  const raycaster = new THREE.Raycaster();
  const coordinates = new THREE.Vector2();
  const projected = new THREE.Vector3();
  const world = new THREE.Vector3();
  const toPos = new THREE.Vector3();
  const placedPos = new THREE.Vector3();
  const grabPoint = new THREE.Vector3();
  const fromPosScratch = new THREE.Vector3();
  const outward = new THREE.Vector3();
  const axisZ = new THREE.Vector3(0, 0, 1);
  const tiltRotation = new THREE.Quaternion();
  const cameraFacing = new THREE.Quaternion();
  const data = new Map();
  const textureLoader = new THREE.TextureLoader();
  const textureJobs = [];
  const events = new AbortController();
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  let activeJobs = 0;
  let raf = 0;
  let previousTime = 0;
  let elapsed = 0;
  let running = false;
  let dirty = true;
  let disposed = false;
  let fromShape = 'tree';
  let toShape = 'tree';
  let morphProgress = 1;
  let shockProgress = 1;
  let customCamDistance = 14.25;
  let customCamY = -.14;
  let aiming = false;
  let highlight = null;
  let hoverId = null;
  let pendingHover = null;
  let targetX = DEFAULT_TILT_X;
  let targetY = .04;
  let targetZoom = 1;
  let zoom = 1;
  let inertiaX = 0;
  let inertiaY = 0;
  let dprSteps = 0;
  let frameSampleSum = 0;
  let frameSampleCount = 0;
  let pointer = null;
  let pinchDistance = 0;
  const activePointers = new Map();
  let viewing = false;
  let floatingPhoto = null;
  let grabbed = null;   // 正被"捏住"拖动的照片：{ id, distance }
  let nebulaSpread = 1;
  const trailInk = new THREE.Color(GOLD);
  const trailRandom = randomSequence(55213);
  let trailCursor = 0;
  let handTarget = null;
  let handCursor = null;
  let lastTrailSpawn = -1;

  function resize() {
    const width = mount.clientWidth;
    const height = mount.clientHeight;
    if (!width || !height || disposed) return;
    camera.aspect = width / height;
    nebulaSpread = THREE.MathUtils.clamp(camera.aspect / .97, .68, 1);
    handTrail.points.material.uniforms.uAspect.value = camera.aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    dirty = true;
    if (!running) draw(0);
  }

  function applyEntryScale(entry) {
    if (!entry.image) return;
    const widthPx = entry.image.image?.width || 1;
    const heightPx = entry.image.image?.height || 1;
    const aspect = widthPx / heightPx;
    const size = entry.order < 8 ? .61 : .44;
    const width = size * Math.min(1, aspect);
    const height = size * Math.min(1, 1 / aspect);
    entry.mesh.scale.set(width, height, 1);
    entry.border.scale.set(width + .042, height + .042, 1);
  }

  function removeEntry(id) {
    const entry = data.get(id);
    if (!entry) return;
    entry.disposed = true;
    root.remove(entry.holder);
    entry.image?.dispose();
    entry.mesh.material.dispose();
    entry.border.material.dispose();
    data.delete(id);
  }

  function queuePhoto(photo, order = data.size) {
    if (data.has(photo.id)) return;
    const position = locatePhoto(THREE, order);
    const holder = new THREE.Group();
    const bevel = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const border = new THREE.Mesh(photoPlane, bevel);
    border.position.z = -.014;
    const mesh = new THREE.Mesh(photoPlane, material);
    mesh.userData.photoId = photo.id;
    holder.add(border, mesh);
    holder.position.copy(position.tree);
    holder.visible = false;
    root.add(holder);
    data.set(photo.id, {
      ...position,
      fromPos: position.tree.clone(),
      order,
      thumbnail: photo.thumbnail,
      holder,
      mesh,
      border,
      image: null,
      id: photo.id,
      scale: 1,
      hotTint: false,
      lastOpacity: 1,
      disposed: false,
      grabHolding: false,
      snapFrom: null,
      snapT: 0,
    });
    textureJobs.push(photo);
  }

  function loadNextTextures() {
    while (activeJobs < 8 && textureJobs.length && !disposed) {
      const photo = textureJobs.shift();
      const entry = data.get(photo.id);
      if (!entry || entry.disposed || entry.thumbnail !== photo.thumbnail) continue;
      activeJobs++;
      const done = () => {
        activeJobs--;
        loadNextTextures();
      };
      textureLoader.load(photo.thumbnail, texture => {
        if (disposed || entry.disposed || data.get(photo.id) !== entry) {
          texture.dispose();
          done();
          return;
        }
        texture.encoding = THREE.sRGBEncoding;
        texture.minFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        entry.mesh.material.map = texture;
        entry.mesh.material.needsUpdate = true;
        entry.image = texture;
        applyEntryScale(entry);
        updatePhotos(0);
        dirty = true;
        if (!running) draw(0);
        done();
      }, undefined, done);
    }
  }

  function shapeDistance(name) {
    if (name === 'nebula') return Math.max(15.7, 12.8 / camera.aspect);
    if (name === 'ring') return Math.max(16.0, 13.0 / camera.aspect);
    if (name === 'spiral') return Math.max(15.2, 11.6 / camera.aspect);
    if (name === 'heart') return Math.max(14.6, 11.0 / camera.aspect);
    return Math.max(14.25, 10.65 / camera.aspect);
  }

  function applyShapeSpread(target, shapeName) {
    if (shapeName === 'nebula') {
      target.x *= nebulaSpread;
      target.z *= nebulaSpread;
    }
  }

  function updatePhotos(dt) {
    root.updateWorldMatrix(false, false);
    cameraFacing.copy(root.quaternion).invert();
    const scaleAlpha = (reducedMotion || dt === 0) ? 1 : 1 - Math.exp(-dt / .075);
    const eased = morphProgress * morphProgress * (3 - 2 * morphProgress);
    const treeWeight = (fromShape === 'tree' ? 1 - eased : 0) + (toShape === 'tree' ? eased : 0);

    for (const entry of data.values()) {
      if (!entry.image) continue;
      if (fromShape === 'custom') {
        fromPosScratch.copy(entry.fromPos);
      } else {
        fromPosScratch.copy(entry[fromShape]);
        applyShapeSpread(fromPosScratch, fromShape);
      }
      toPos.copy(entry[toShape]);
      applyShapeSpread(toPos, toShape);

      const photoStagger = (entry.order % 8) / 8 * .22;
      const local = morphProgress >= 1 ? 1 : THREE.MathUtils.clamp((morphProgress - photoStagger) / .78, 0, 1);
      const photoEased = local * local * (3 - 2 * local);
      placedPos.copy(fromPosScratch).lerp(toPos, photoEased);
      if (fromShape !== toShape && photoEased > 0 && photoEased < 1) {
        const arc = Math.sin(photoEased * Math.PI) * .55;
        const cs = Math.cos(arc);
        const sn = Math.sin(arc);
        const px = placedPos.x;
        const pz = placedPos.z;
        placedPos.x = px * cs - pz * sn;
        placedPos.z = px * sn + pz * cs;
      }
      if (entry.grabHolding && grabbed?.id === entry.id) {
        // 被捏住：位置由 moveGrab 每帧写入，这里不再覆盖
      } else if (entry.snapFrom) {
        entry.snapT = Math.min(1, entry.snapT + (dt > 0 ? dt : .016) / .24);
        const snapEase = entry.snapT * entry.snapT * (3 - 2 * entry.snapT);
        entry.holder.position.lerpVectors(entry.snapFrom, placedPos, snapEase);
        if (entry.snapT >= 1) {
          entry.snapFrom = null;
          entry.snapT = 0;
          entry.holder.position.copy(placedPos);
        }
      } else {
        entry.holder.position.copy(placedPos);
      }
      tiltRotation.setFromAxisAngle(axisZ, entry.tilt);
      entry.holder.quaternion.copy(cameraFacing).multiply(tiltRotation);
      world.copy(entry.holder.position).applyMatrix4(root.matrixWorld);
      const front = THREE.MathUtils.smoothstep(world.z, -.62, 1.05);
      const isPinchHot = highlight === entry.id;
      const isHoverHot = hoverId === entry.id;
      const isHot = isPinchHot || isHoverHot;
      const facing = outward.copy(entry.outward).applyQuaternion(root.quaternion).z;
      const treeVisibility = THREE.MathUtils.smoothstep(facing, .28, .71);
      const isGrabHot = entry.grabHolding === true;
      let opacity = THREE.MathUtils.lerp(.58 + front * .38, treeVisibility * .99, treeWeight);
      if (isGrabHot) opacity = 1;
      entry.lastOpacity = opacity;
      entry.holder.visible = floatingPhoto !== entry.id && (isHot || isGrabHot || opacity >= .06);
      entry.mesh.material.opacity = isHot || isGrabHot ? 1 : opacity;
      entry.border.material.opacity = isHot || isGrabHot ? 1 : opacity * .79;
      if (isHot !== entry.hotTint) {
        entry.hotTint = isHot;
        entry.border.material.color.setHex(isHot ? 0xfff8dc : GOLD);
      }
      const targetScale = isGrabHot ? 1.3 : isPinchHot ? 1.24 : isHoverHot ? 1.13 : 1;
      entry.scale = THREE.MathUtils.lerp(entry.scale, targetScale, scaleAlpha);
      if (Math.abs(entry.scale - targetScale) < .002) entry.scale = targetScale;
      entry.holder.scale.setScalar(entry.scale);
    }
  }

  function emitTrailSpark(x, y, vx, vy, size, life) {
    const idx = trailCursor;
    trailCursor = (trailCursor + 1) % MAX_TRAIL;
    const i2 = idx * 2;
    const i3 = idx * 3;
    const posArr = handTrail.posAttr.array;
    const velArr = handTrail.velAttr.array;
    const metaArr = handTrail.metaAttr.array;
    const tintArr = handTrail.tintAttr.array;
    posArr[i3] = x;
    posArr[i3 + 1] = y;
    posArr[i3 + 2] = 0;
    velArr[i2] = vx;
    velArr[i2 + 1] = vy;
    metaArr[i3] = elapsed;
    metaArr[i3 + 1] = life;
    metaArr[i3 + 2] = size;
    tintArr[i3] = trailInk.r;
    tintArr[i3 + 1] = trailInk.g;
    tintArr[i3 + 2] = trailInk.b;
  }

  function updateHandTrail(dt) {
    handTrail.points.visible = !reducedMotion && !viewing;
    handTrail.points.material.uniforms.uTime.value = elapsed;
    if (reducedMotion || viewing || !handTarget) return;
    let spawned = false;
    if (!handCursor) {
      handCursor = { x: handTarget.x, y: handTarget.y };
      for (let i = 0; i < 5; i++) {
        const ang = trailRandom() * Math.PI * 2;
        const spd = .04 + trailRandom() * .11;
        emitTrailSpark(
          handCursor.x + (trailRandom() - .5) * .020,
          handCursor.y + (trailRandom() - .5) * .026,
          Math.cos(ang) * spd,
          Math.sin(ang) * spd + .04,
          8 + trailRandom() * 8.5,
          .72 + trailRandom() * .42
        );
      }
      spawned = true;
      lastTrailSpawn = elapsed;
    } else {
      const prevX = handCursor.x;
      const prevY = handCursor.y;
      const follow = dt > 0 ? 1 - Math.exp(-dt / .045) : 1;
      handCursor.x += (handTarget.x - handCursor.x) * follow;
      handCursor.y += (handTarget.y - handCursor.y) * follow;
      const dx = handCursor.x - prevX;
      const dy = handCursor.y - prevY;
      const dist = Math.hypot(dx * camera.aspect, dy);
      if (dist > .006) {
        const count = Math.min(8, Math.max(3, Math.round(dist * 45)));
        const invLen = 1 / Math.max(dist, .0001);
        const nx = -dy * invLen;
        const ny = dx * invLen;
        for (let i = 1; i <= count; i++) {
          const f = i / count;
          const jitter = (trailRandom() - .5) * .018;
          const ang = trailRandom() * Math.PI * 2;
          const spd = .035 + trailRandom() * .11;
          emitTrailSpark(
            prevX + dx * f + nx * jitter,
            prevY + dy * f + ny * jitter,
            Math.cos(ang) * spd - dx * .18,
            Math.sin(ang) * spd - dy * .18 + .045,
            9 + trailRandom() * 10,
            .78 + trailRandom() * .44
          );
        }
        // Bright leading fingertip flare at current cursor position
        emitTrailSpark(handCursor.x, handCursor.y, 0, .01, 22, .16);
        spawned = true;
        lastTrailSpawn = elapsed;
      } else if (elapsed - lastTrailSpawn >= .028 || elapsed < lastTrailSpawn) {
        const ang = trailRandom() * Math.PI * 2;
        const spd = .025 + trailRandom() * .07;
        emitTrailSpark(
          handCursor.x + (trailRandom() - .5) * .016,
          handCursor.y + (trailRandom() - .5) * .020,
          Math.cos(ang) * spd,
          Math.sin(ang) * spd + .04,
          8.5 + trailRandom() * 8.5,
          .72 + trailRandom() * .38
        );
        emitTrailSpark(handCursor.x, handCursor.y, 0, .01, 20, .14);
        spawned = true;
        lastTrailSpawn = elapsed;
      }
    }
    if (spawned) {
      handTrail.posAttr.needsUpdate = true;
      handTrail.velAttr.needsUpdate = true;
      handTrail.metaAttr.needsUpdate = true;
      handTrail.tintAttr.needsUpdate = true;
    }
  }

  function currentCameraParams(eased) {
    const d0 = fromShape === 'custom' ? customCamDistance : shapeDistance(fromShape);
    const d1 = shapeDistance(toShape);
    const y0 = fromShape === 'custom' ? customCamY : (fromShape === 'tree' ? -.14 : 0);
    const y1 = toShape === 'tree' ? -.14 : 0;
    return {
      distance: THREE.MathUtils.lerp(d0, d1, eased),
      y: THREE.MathUtils.lerp(y0, y1, eased),
    };
  }

  function draw(dt) {
    if (!aiming && !viewing) {
      if (reducedMotion) {
        morphProgress = 1;
      } else if (morphProgress < 1) {
        morphProgress = Math.min(1, morphProgress + dt / 1.05);
      }

      if (!reducedMotion && !pointer) {
        if (inertiaX || inertiaY) {
          targetY += inertiaY * dt;
          targetX = clampX(targetX + inertiaX * dt);
          const decay = Math.exp(-dt * 3.8);
          inertiaX *= decay;
          inertiaY *= decay;
          if (Math.abs(inertiaX) < .002) inertiaX = 0;
          if (Math.abs(inertiaY) < .002) inertiaY = 0;
        }
        if (Math.abs(inertiaX) < .08 && targetX !== DEFAULT_TILT_X) {
          targetX = THREE.MathUtils.lerp(targetX, DEFAULT_TILT_X, 1 - Math.exp(-dt * 1.35));
          if (Math.abs(targetX - DEFAULT_TILT_X) < .0008) targetX = DEFAULT_TILT_X;
        }
        if (hoverId === null) targetY += dt * .075;
      }
      const rotSmoothing = reducedMotion ? 1 : 1 - Math.exp(-dt / (pointer ? .032 : .105));
      root.rotation.x = THREE.MathUtils.lerp(root.rotation.x, targetX, rotSmoothing);
      root.rotation.y = THREE.MathUtils.lerp(root.rotation.y, targetY, rotSmoothing);
    }
    const eased = morphProgress * morphProgress * (3 - 2 * morphProgress);
    const zoomAlpha = (reducedMotion || dt === 0) ? 1 : 1 - Math.exp(-dt / .095);
    zoom = THREE.MathUtils.lerp(zoom, targetZoom, zoomAlpha);
    if (Math.abs(zoom - targetZoom) < .0008) zoom = targetZoom;

    const cam = currentCameraParams(eased);
    const activeMorph = fromShape === toShape ? 0 : Math.sin(eased * Math.PI) * .85;
    camera.position.set(0, cam.y, cam.distance * zoom + activeMorph);

    const uniforms = treePoints.material.uniforms;
    uniforms.uMorph.value = fromShape === toShape ? 1 : morphProgress;
    uniforms.uFromSpread.value = fromShape === 'nebula' ? nebulaSpread : 1;
    uniforms.uToSpread.value = toShape === 'nebula' ? nebulaSpread : 1;
    uniforms.uNebulaMix.value = (fromShape === 'nebula' ? 1 - eased : 0) + (toShape === 'nebula' ? eased : 0);
    uniforms.uHeartMix.value = (fromShape === 'heart' ? 1 - eased : 0) + (toShape === 'heart' ? eased : 0);
    uniforms.uRingMix.value = (fromShape === 'ring' ? 1 - eased : 0) + (toShape === 'ring' ? eased : 0);
    uniforms.uSpiralMix.value = (fromShape === 'spiral' ? 1 - eased : 0) + (toShape === 'spiral' ? eased : 0);
    uniforms.uTime.value = elapsed;
    stars.material.uniforms.uTime.value = elapsed * .58;
    snow.material.uniforms.uTime.value = elapsed;

    if (!reducedMotion && !viewing && shockProgress < 1) {
      shockProgress = Math.min(1, shockProgress + dt / .85);
    }
    const showShock = !reducedMotion && shockProgress < 1;
    shockwave.visible = showShock;
    if (showShock) {
      shockwave.material.uniforms.uProgress.value = shockProgress;
      shockwave.material.uniforms.uTime.value = elapsed;
    }

    const treeWeight = (fromShape === 'tree' ? 1 - eased : 0) + (toShape === 'tree' ? eased : 0);
    finial.visible = treeWeight > .04;
    finialHalo.material.uniforms.uTime.value = elapsed;
    finialHalo.material.uniforms.uOpacity.value = treeWeight;
    finialFace.material.opacity = treeWeight;
    finial.quaternion.copy(root.quaternion).invert();
    if (!reducedMotion) finial.scale.setScalar(1 + Math.sin(elapsed * 1.8) * .052);
    updatePhotos(dt);
    updateHandTrail(dt);
    renderer.render(scene, camera);
  }

  function step(now) {
    raf = 0;
    if (!running || disposed) return;
    if (previousTime && !reducedMotion && !viewing) {
      const frameMs = now - previousTime;
      if (frameMs < 150) {
        frameSampleSum += frameMs;
        frameSampleCount++;
        if (frameSampleCount >= 24) {
          const avgFrameMs = frameSampleSum / frameSampleCount;
          frameSampleSum = 0;
          frameSampleCount = 0;
          if (avgFrameMs > 23 && pixelRatio > 1 && dprSteps < 2) {
            pixelRatio = Math.max(1, +(pixelRatio * .8).toFixed(2));
            dprSteps++;
            renderer.setPixelRatio(pixelRatio);
            treePoints.material.uniforms.uScale.value = pixelRatio;
            stars.material.uniforms.uScale.value = pixelRatio;
            snow.material.uniforms.uScale.value = pixelRatio;
            handTrail.points.material.uniforms.uScale.value = pixelRatio;
            resize();
          }
        }
      }
    }
    if (pendingHover && !pointer && !aiming && !viewing) {
      const { x, y } = pendingHover;
      pendingHover = null;
      const nextHover = pick(x, y, 10);
      if (nextHover !== hoverId) {
        hoverId = nextHover;
        canvas.toggleAttribute('data-hover', hoverId !== null);
        dirty = true;
      }
    }
    const dt = previousTime ? Math.min(.05, (now - previousTime) / 1000) : 1 / 60;
    previousTime = now;
    if (!reducedMotion && !viewing) elapsed += dt;
    if ((!reducedMotion && !viewing) || dirty) {
      dirty = false;
      draw(dt);
    }
    raf = requestAnimationFrame(step);
  }

  function setRunning(enabled) {
    if (disposed || running === enabled) return;
    running = enabled;
    previousTime = 0;
    frameSampleSum = 0;
    frameSampleCount = 0;
    if (enabled) {
      dirty = true;
      raf = requestAnimationFrame(step);
    }
    else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function rotate(dx, dy) {
    if (aiming || viewing) return;
    targetY += dx;
    targetX = clampX(targetX + dy);
    dirty = true;
  }

  /* ---------------------------------------------------------------
     抓取：捏住一张照片后跟随指尖，松手吸附回原位
     --------------------------------------------------------------- */
  function grabPhoto(id) {
    const entry = data.get(id);
    if (!entry || !entry.image) return false;
    entry.holder.getWorldPosition(world);
    const distance = Math.max(2.8, camera.position.distanceTo(world));
    grabbed = { id, distance };
    entry.grabHolding = true;
    entry.snapFrom = null;
    entry.snapT = 0;
    hoverId = null;
    canvas.removeAttribute('data-hover');
    dirty = true;
    return true;
  }

  function moveGrab(nx, ny, pull = 1) {
    if (!grabbed) return;
    const entry = data.get(grabbed.id);
    if (!entry) return;
    const lift = Math.max(0, Math.min(.42, (pull - 1) * .55));
    const distance = Math.max(2.2, grabbed.distance * (1 - lift));
    coordinates.set(nx * 2 - 1, 1 - ny * 2);
    raycaster.setFromCamera(coordinates, camera);
    raycaster.ray.at(distance, grabPoint);
    root.worldToLocal(grabPoint);
    entry.holder.position.copy(grabPoint);
    dirty = true;
  }

  function releaseGrab({ snap = true } = {}) {
    if (!grabbed) return;
    const entry = data.get(grabbed.id);
    grabbed = null;
    if (!entry) return;
    entry.grabHolding = false;
    if (snap && entry.image) {
      if (!entry.snapFrom) entry.snapFrom = new THREE.Vector3();
      entry.snapFrom.copy(entry.holder.position);
      entry.snapT = 0;
    }
    dirty = true;
  }

  function zoomBy(factor) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const next = THREE.MathUtils.clamp(targetZoom * factor, MIN_ZOOM, MAX_ZOOM);
    if (Math.abs(next - targetZoom) < .0004) return;
    targetZoom = next;
    dirty = true;
  }

  function fling(vx, vy) {
    if (viewing) return;
    inertiaY = THREE.MathUtils.clamp(vx, -1.6, 1.6);
    inertiaX = THREE.MathUtils.clamp(vy, -1.0, 1.0);
    dirty = true;
  }

  // 彩蛋：撒一把星
  function burst(nx, ny, count = 44) {
    if (reducedMotion) return;
    const ndcX = (nx ?? .5) * 2 - 1;
    const ndcY = 1 - (ny ?? .5) * 2;
    for (let i = 0; i < count; i++) {
      const ang = trailRandom() * Math.PI * 2;
      const spd = .12 + trailRandom() * .36;
      emitTrailSpark(
        ndcX + (trailRandom() - .5) * .05,
        ndcY + (trailRandom() - .5) * .05,
        Math.cos(ang) * spd,
        Math.sin(ang) * spd + .11,
        13 + trailRandom() * 17,
        .9 + trailRandom() * .8
      );
    }
    handTrail.posAttr.needsUpdate = true;
    handTrail.velAttr.needsUpdate = true;
    handTrail.metaAttr.needsUpdate = true;
    handTrail.tintAttr.needsUpdate = true;
    dirty = true;
  }

  function pick(clientX, clientY, range = compact ? 19 : 12, preferredId = null) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    coordinates.set((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2);
    raycaster.setFromCamera(coordinates, camera);
    const meshes = Array.from(data.values(), entry => entry.mesh).filter(mesh => mesh.parent.visible);
    return raycaster.intersectObjects(meshes)[0]?.object.userData.photoId
      ?? photoNear(clientX, clientY, range, rect, preferredId);
  }

  function photoNear(clientX, clientY, range, rect, preferredId = null) {
    let bestScore = Infinity;
    let bestId = null;
    for (const entry of data.values()) {
      if (!entry.holder.visible) continue;
      entry.mesh.updateWorldMatrix(true, false);
      world.copy(entry.holder.position).applyMatrix4(root.matrixWorld);
      const depthZ = world.z;
      projected.copy(world).project(camera);
      if (projected.z > 1 || projected.z < -1) continue;
      const cx = rect.left + (projected.x + 1) * rect.width / 2;
      const cy = rect.top + (1 - projected.y) * rect.height / 2;

      world.set(.5, 0, 0).applyMatrix4(entry.mesh.matrixWorld);
      projected.copy(world).project(camera);
      const halfW = Math.hypot(
        rect.left + (projected.x + 1) * rect.width / 2 - cx,
        rect.top + (1 - projected.y) * rect.height / 2 - cy
      );

      world.set(0, .5, 0).applyMatrix4(entry.mesh.matrixWorld);
      projected.copy(world).project(camera);
      const halfH = Math.hypot(
        rect.left + (projected.x + 1) * rect.width / 2 - cx,
        rect.top + (1 - projected.y) * rect.height / 2 - cy
      );

      const edgeDist = Math.hypot(
        Math.max(0, Math.abs(clientX - cx) - halfW),
        Math.max(0, Math.abs(clientY - cy) - halfH)
      );
      const limit = entry.id === preferredId ? range * 1.45 : range;
      if (edgeDist > limit) continue;
      const stickyBonus = entry.id === preferredId ? -14 : 0;
      const score = edgeDist + Math.max(0, 1.1 - depthZ) * 3.5 + stickyBonus;
      if (score < bestScore) {
        bestScore = score;
        bestId = entry.id;
      }
    }
    return bestId;
  }

  function photoBounds(id, { ignoreFloating = false } = {}) {
    const entry = data.get(id);
    if (!entry?.image) return null;
    const isVisible = entry.holder.visible || (ignoreFloating && floatingPhoto === id && entry.lastOpacity >= .06);
    if (!isVisible) return null;
    const rect = canvas.getBoundingClientRect();
    entry.mesh.updateWorldMatrix(true, false);
    const project = (x, y) => {
      world.set(x, y, 0).applyMatrix4(entry.mesh.matrixWorld);
      projected.copy(world).project(camera);
      return {
        x: rect.left + (projected.x + 1) * rect.width / 2,
        y: rect.top + (1 - projected.y) * rect.height / 2,
      };
    };
    const center = project(0, 0);
    const left = project(-.5, 0);
    const right = project(.5, 0);
    const top = project(0, .5);
    const bottom = project(0, -.5);
    return {
      ...center,
      width: Math.hypot(right.x - left.x, right.y - left.y),
      height: Math.hypot(bottom.x - top.x, bottom.y - top.y),
      angle: Math.atan2(right.y - left.y, right.x - left.x),
      aspect: entry.image.image.width / entry.image.image.height,
    };
  }

  function pairDistance(points) {
    const [a, b] = Array.from(points.values());
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  function clearHover() {
    pendingHover = null;
    if (hoverId !== null) {
      hoverId = null;
      canvas.removeAttribute('data-hover');
      dirty = true;
    }
  }

  canvas.addEventListener('pointerdown', event => {
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointers.size === 2) {
      pointer = null;
      inertiaX = 0;
      inertiaY = 0;
      clearHover();
      pinchDistance = pairDistance(activePointers);
      return;
    }
    if (pointer || !event.isPrimary || event.button !== 0) return;
    clearHover();
    inertiaX = 0;
    inertiaY = 0;
    pointer = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      lastTime: performance.now(),
      dragged: false,
    };
    try { canvas.setPointerCapture(event.pointerId); } catch {}
  }, { signal: events.signal });
  canvas.addEventListener('pointermove', event => {
    if (activePointers.has(event.pointerId)) {
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (activePointers.size >= 2) {
      const currDist = pairDistance(activePointers);
      if (pinchDistance > 0 && currDist > 0 && !aiming && !viewing) {
        targetZoom = THREE.MathUtils.clamp(targetZoom * (pinchDistance / currDist), MIN_ZOOM, MAX_ZOOM);
        dirty = true;
      }
      pinchDistance = currDist;
      return;
    }
    if (pointer?.id === event.pointerId) {
      const now = performance.now();
      if (!pointer.dragged) {
        if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) < POINTER_SLOP) return;
        pointer.dragged = true;
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        pointer.lastTime = now;
        return;
      }
      const dx = (event.clientX - pointer.x) * .0072;
      const dy = (event.clientY - pointer.y) * .0058;
      const segDt = Math.max(.008, (now - pointer.lastTime) / 1000);
      const vx = THREE.MathUtils.clamp(dx / segDt, -3.8, 3.8);
      const vy = THREE.MathUtils.clamp(dy / segDt, -2.2, 2.2);
      inertiaY += (vx - inertiaY) * .45;
      inertiaX += (vy - inertiaX) * .45;
      rotate(dx, dy);
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.lastTime = now;
      return;
    }
    if (event.pointerType === 'mouse' && !pointer && !aiming && !viewing) {
      pendingHover = { x: event.clientX, y: event.clientY };
      dirty = true;
    }
  }, { signal: events.signal });
  canvas.addEventListener('pointerup', event => {
    activePointers.delete(event.pointerId);
    if (activePointers.size < 2) pinchDistance = 0;
    if (pointer?.id !== event.pointerId) return;
    const wasDrag = pointer.dragged;
    const stale = performance.now() - pointer.lastTime > 80;
    pointer = null;
    if (!wasDrag || stale) {
      inertiaX = 0;
      inertiaY = 0;
    }
    if (!wasDrag) {
      const id = pick(event.clientX, event.clientY);
      if (id !== null) onPhoto(id, photoBounds(id));
    }
  }, { signal: events.signal });
  function dropPointer(event) {
    activePointers.delete(event.pointerId);
    if (activePointers.size < 2) pinchDistance = 0;
    if (pointer?.id === event.pointerId) {
      pointer = null;
      inertiaX = 0;
      inertiaY = 0;
    }
  }
  canvas.addEventListener('pointerleave', clearHover, { signal: events.signal });
  canvas.addEventListener('wheel', event => {
    if (viewing || aiming) return;
    event.preventDefault();
    const raw = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    const delta = THREE.MathUtils.clamp(raw, -120, 120);
    targetZoom = THREE.MathUtils.clamp(targetZoom * Math.exp(delta * .0014), MIN_ZOOM, MAX_ZOOM);
    dirty = true;
  }, { passive: false, signal: events.signal });
  canvas.addEventListener('dblclick', event => {
    if (viewing || aiming) return;
    if (pick(event.clientX, event.clientY) !== null) return;
    targetZoom = 1;
    targetX = DEFAULT_TILT_X;
    inertiaX = 0;
    inertiaY = 0;
    dirty = true;
  }, { signal: events.signal });
  canvas.addEventListener('lostpointercapture', dropPointer, { signal: events.signal });
  canvas.addEventListener('pointercancel', dropPointer, { signal: events.signal });
  canvas.addEventListener('webglcontextlost', onFailure, { signal: events.signal });

  photos.forEach((photo, order) => queuePhoto(photo, order));
  mount.append(canvas);
  const observer = new ResizeObserver(resize);
  observer.observe(mount);
  resize();
  loadNextTextures();

  return {
    addPhotos(newPhotos) {
      newPhotos.forEach(photo => queuePhoto(photo, photo.order ?? data.size));
      loadNextTextures();
      dirty = true;
    },
    setPhotos(nextPhotos) {
      if (disposed) return;
      const nextList = Array.from(nextPhotos || []);
      const nextById = new Map(nextList.map((photo, order) => [photo.id, { photo, order }]));

      for (let i = textureJobs.length - 1; i >= 0; i--) {
        const queued = textureJobs[i];
        const match = nextById.get(queued.id);
        if (!match || match.photo.thumbnail !== queued.thumbnail) {
          textureJobs.splice(i, 1);
        }
      }

      for (const [id, entry] of Array.from(data.entries())) {
        const match = nextById.get(id);
        if (!match || match.photo.thumbnail !== entry.thumbnail) {
          removeEntry(id);
        }
      }

      if (highlight !== null && !nextById.has(highlight)) highlight = null;
      if (hoverId !== null && !nextById.has(hoverId)) {
        hoverId = null;
        canvas.removeAttribute('data-hover');
      }
      if (floatingPhoto !== null && !nextById.has(floatingPhoto)) floatingPhoto = null;

      for (let order = 0; order < nextList.length; order++) {
        const photo = nextList[order];
        const existing = data.get(photo.id);
        if (existing) {
          const position = locatePhoto(THREE, order);
          existing.tree.copy(position.tree);
          existing.nebula.copy(position.nebula);
          existing.heart.copy(position.heart);
          existing.ring.copy(position.ring);
          existing.spiral.copy(position.spiral);
          existing.outward.copy(position.outward);
          existing.tilt = position.tilt;
          existing.order = order;
          applyEntryScale(existing);
        } else {
          queuePhoto(photo, order);
        }
      }

      loadNextTextures();
      dirty = true;
      if (!running) draw(0);
    },
    pick,
    photoBounds,
    rotate,
    zoomBy,
    fling,
    burst,
    grabPhoto,
    moveGrab,
    releaseGrab,
    getZoom() { return zoom; },
    resetView() {
      targetZoom = 1;
      targetX = DEFAULT_TILT_X;
      inertiaX = 0;
      inertiaY = 0;
      dirty = true;
    },
    setAiming(value) {
      if (value === aiming) return;
      if (value) {
        clearHover();
        inertiaX = 0;
        inertiaY = 0;
        targetX = clampX(root.rotation.x);
        targetY = root.rotation.y;
      }
      aiming = value;
      dirty = true;
    },
    setFloatingPhoto(id) {
      const previous = data.get(floatingPhoto);
      if (previous?.image) previous.holder.visible = true;
      floatingPhoto = id;
      const current = data.get(id);
      if (current) current.holder.visible = false;
      dirty = true;
    },
    setHighlight(id) {
      if (id === highlight) return;
      highlight = id;
      dirty = true;
    },
    setHandTrail(nx, ny, pose = 'neutral') {
      if (nx == null || ny == null || !Number.isFinite(nx) || !Number.isFinite(ny)) {
        handTarget = null;
        handCursor = null;
        return;
      }
      const ndcX = nx * 2 - 1;
      const ndcY = 1 - ny * 2;
      if (!handTarget) handTarget = { x: ndcX, y: ndcY };
      else {
        handTarget.x = ndcX;
        handTarget.y = ndcY;
      }
      trailInk.setHex(TRAIL_TINTS[pose] || TRAIL_TINTS.neutral);
      dirty = true;
    },
    setReducedMotion(value) { reducedMotion = value; dirty = true; },
    setRunning,
    setShape(nextShape) {
      if (!SHAPE_SET.has(nextShape) || nextShape === toShape) return;
      const geometry = treePoints.geometry;
      if (morphProgress >= 1 || fromShape === toShape) {
        fromShape = toShape;
        toShape = nextShape;
        geometry.setAttribute('position', shapeAttrs[fromShape]);
        geometry.setAttribute('aTarget', shapeAttrs[toShape]);
      } else {
        const fromArr = geometry.getAttribute('position').array;
        const toArr = geometry.getAttribute('aTarget').array;
        const phaseArr = geometry.getAttribute('aPhase').array;
        const out = scratchAttr.array;
        const fromSpread = fromShape === 'nebula' ? nebulaSpread : 1;
        const toSpread = toShape === 'nebula' ? nebulaSpread : 1;
        const eased = morphProgress * morphProgress * (3 - 2 * morphProgress);
        const cam = currentCameraParams(eased);
        customCamDistance = cam.distance;
        customCamY = cam.y;

        for (let i = 0; i < particleCount; i++) {
          const i3 = i * 3;
          const py = fromArr[i3 + 1];
          const phase = phaseArr[i];
          const rawStagger = phase * .15915494 + py * .085;
          const stagger = rawStagger - Math.floor(rawStagger);
          const local = Math.max(0, Math.min(1, (morphProgress - stagger * .24) / .76));
          const t = local * local * (3 - 2 * local);

          const x0 = fromArr[i3] * fromSpread;
          const z0 = fromArr[i3 + 2] * fromSpread;
          const x1 = toArr[i3] * toSpread;
          const y1 = toArr[i3 + 1];
          const z1 = toArr[i3 + 2] * toSpread;

          let px = x0 + (x1 - x0) * t;
          let pY = py + (y1 - py) * t;
          let pz = z0 + (z1 - z0) * t;

          const sinT = Math.sin(t * Math.PI);
          const swirl = sinT * (.95 + stagger * .55);
          const cs = Math.cos(swirl);
          const sn = Math.sin(swirl);
          const rx = px * cs - pz * sn;
          const rz = px * sn + pz * cs;
          px = rx;
          pz = rz;
          pY += sinT * .16 * (stagger - .5);

          out[i3] = px;
          out[i3 + 1] = pY;
          out[i3 + 2] = pz;
        }
        scratchAttr.needsUpdate = true;
        for (const entry of data.values()) {
          entry.fromPos.copy(entry.holder.position);
        }
        fromShape = 'custom';
        toShape = nextShape;
        geometry.setAttribute('position', scratchAttr);
        geometry.setAttribute('aTarget', shapeAttrs[toShape]);
      }

      morphProgress = reducedMotion ? 1 : 0;
      if (!reducedMotion) {
        shockProgress = 0;
        shockwave.material.uniforms.uColor.value.setHex(SHAPE_SHOCK_COLORS[nextShape] || GOLD);
      }
      dirty = true;
      if (!running) draw(0);
    },
    setViewing(value) {
      if (value) {
        clearHover();
        inertiaX = 0;
        inertiaY = 0;
      }
      viewing = value;
      dirty = true;
    },
    dispose() {
      if (disposed) return;
      setRunning(false);
      disposed = true;
      events.abort();
      observer.disconnect();
      for (const entry of data.values()) entry.image?.dispose();
      const geometries = new Set();
      const materials = new Set();
      scene.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) materials.add(object.material);
      });
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      renderer.dispose();
      canvas.remove();
    },
  };
}
