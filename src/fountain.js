import * as THREE from 'three';

const TAU = Math.PI * 2;
const GRAVITY = 9.81;

export function createFountain(parent) {
  const model = new THREE.Group();
  model.name = 'courtyard-fountain';
  model.position.z = 19.2;
  parent.add(model);
  const stone = new THREE.MeshStandardMaterial({ color: '#c7bea5', roughness: .86 });
  const rim = new THREE.MeshStandardMaterial({ color: '#d6ccb1', roughness: .72 });
  const base = new THREE.MeshStandardMaterial({ color: '#b8ae95', roughness: .9 });
  const bronze = new THREE.MeshStandardMaterial({ color: '#817c57', roughness: .4, metalness: .65 });

  function turned(name, profile, material, flutes = 0) {
    const geometry = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 96);
    if (flutes) {
      const positions = geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
        const envelope = Math.sin(Math.PI * THREE.MathUtils.clamp((y - .46) / .58, 0, 1));
        const inset = 1 - .035 * envelope * Math.pow(.5 + .5 * Math.cos(Math.atan2(z, x) * flutes), 4);
        positions.setXYZ(i, x * inset, y, z * inset);
      }
      geometry.computeVertexNormals();
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    model.add(mesh);
  }
  // 连续回转剖面包含底、外壁、圆唇和内壁，水盆具有真实厚度与内腔。
  turned('bevelled-plinth', [
    [0,.025],[1.10,.025],[1.15,.035],[1.185,.065],[1.19,.09],
    [1.19,.12],[1.175,.145],[1.15,.16],[1.065,.17],[1.035,.19],[0,.19],
  ], base);
  turned('lower-basin', [
    [0,.18],[.73,.18],[.79,.20],[.86,.235],[.93,.28],[.99,.35],
    [1.035,.42],[1.065,.485],[1.078,.53],[1.076,.552],[1.065,.574],
    [1.045,.59],[1.02,.594],[.995,.585],[.974,.564],[.955,.53],
    [.935,.48],[.90,.40],[.84,.345],[.77,.32],[.68,.305],[0,.305],
  ], rim);
  turned('fluted-pedestal', [
    [0,.305],[.25,.305],[.277,.32],[.285,.342],[.282,.365],[.27,.385],
    [.245,.405],[.215,.438],[.19,.48],[.17,.54],[.153,.65],
    [.144,.78],[.146,.88],[.16,.98],[.183,1.035],[.215,1.07],
    [.232,1.09],[.235,1.115],[.222,1.135],[.19,1.148],[0,1.148],
  ], stone, 16);
  turned('upper-basin', [
    [0,1.13],[.17,1.13],[.23,1.148],[.30,1.177],[.37,1.213],
    [.43,1.253],[.475,1.294],[.497,1.325],[.505,1.345],
    [.502,1.357],[.495,1.363],[.485,1.355],[.46,1.32],
    [.40,1.274],[.32,1.241],[.23,1.224],[0,1.224],
  ], rim);
  turned('nozzle-collar', [
    [0,1.224],[.07,1.224],[.07,1.36],[.09,1.375],[.09,1.39],
    [.075,1.403],[.062,1.41],[.062,1.44],[.043,1.44],[.043,1.40],[0,1.40],
  ], bronze);
  const water = createFountainWater(model);
  return { ...water, model };
}

const noise = /* glsl */`
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                   mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                   mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }`;

// 每一层都是闭合的整圈曲面；纵向 UV 使用水的飞行时间，让纹理随重力加速。
function flowSurface(rows, columns, profile) {
  const positions = [], uvs = [], movement = [], indices = [];
  for (let row = 0; row <= rows; row++) {
    const t = row / rows, { radius, height, age } = profile(t);
    for (let col = 0; col <= columns; col++) {
      const angle = col / columns * TAU;
      positions.push(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
      uvs.push(col / columns, age);
      movement.push(Math.sin(t * Math.PI));
      if (row < rows && col < columns) {
        const a = row * (columns + 1) + col, b = a + columns + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('movement', new THREE.Float32BufferAttribute(movement, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createFountainWater(parent) {
  const group = new THREE.Group();
  group.name = 'fountain-water';
  parent.add(group);
  const clock = { value: 0 }, night = { value: 0 }, strength = { value: 1 };
  const water = new THREE.ShaderMaterial({
    uniforms: { time: clock, night, strength }, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, forceSinglePass: true,
    vertexShader: /* glsl */`
      uniform float time;
      uniform float night, strength;
      attribute float movement;
      varying vec2 flowUv;
      varying vec3 viewPosition;
      ${noise}
      void main() {
        flowUv = uv;
        float angle = uv.x * 6.2831853;
        vec2 around = vec2(cos(angle), sin(angle));
        float travel = uv.y - time;
        float ripple = noise3(vec3(around * 5.0, travel * 6.0)) - 0.5;
        float detail = noise3(vec3(around * 12.0, travel * 11.0)) - 0.5;
        vec3 p = position;
        p.y = mix(min(position.y, 1.366), position.y, strength);
        p.xz += around * (ripple * 0.032 + detail * 0.008) * movement;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        viewPosition = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float time;
      uniform float night, strength;
      varying vec2 flowUv;
      varying vec3 viewPosition;
      ${noise}
      void main() {
        float angle = flowUv.x * 6.2831853;
        vec2 around = vec2(cos(angle), sin(angle));
        float travel = flowUv.y - time;
        float broad = noise3(vec3(around * 4.0, travel * 5.0));
        float fine = noise3(vec3(around * 17.0, travel * 11.0));
        vec3 n = normalize(cross(dFdx(viewPosition), dFdy(viewPosition)));
        vec3 eye = normalize(-viewPosition);
        float rim = pow(1.0 - abs(dot(n, eye)), 3.0);
        float glint = pow(max(0.0, dot(reflect(-normalize(vec3(-0.4, 0.8, 0.6)), n), eye)), 34.0);
        float fleck = smoothstep(0.38, 0.76, broad * 0.65 + fine * 0.35);
        vec3 color = mix(vec3(0.10, 0.26, 0.24), vec3(0.54, 0.72, 0.66), rim * 0.52 + fleck * 0.38);
        color += glint * 0.22;
        color *= mix(vec3(1.0), vec3(0.43,0.62,0.86), night);
        gl_FragColor = vec4(color, (0.20 + rim * 0.3 + broad * 0.09 + fleck * 0.22) * strength);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  function addWater(name, geometry) {
    const mesh = new THREE.Mesh(geometry, water);
    mesh.name = name;
    group.add(mesh);
    return mesh;
  }
  const rise = .94, ascent = Math.sqrt(2 * rise / GRAVITY);
  addWater('central-jet', flowSurface(40, 64, t => {
    const age = t * ascent;
    return { radius: .09 - .01 * t, height: 1.44 + GRAVITY * ascent * age - .5 * GRAVITY * age * age, age };
  }));
  const crownFall = Math.sqrt(2 * (2.38 - 1.366) / GRAVITY);
  addWater('falling-crown', flowSurface(56, 128, t => {
    const flight = t * crownFall;
    return { radius: .08 + .58 * flight, height: 2.38 - .5 * GRAVITY * flight * flight, age: ascent + flight };
  }));
  const spillFall = Math.sqrt(2 * (1.366 - .505) / GRAVITY);
  const landingRadius = .495 + .55 * spillFall;
  addWater('continuous-spillway', flowSurface(56, 160, t => {
    const flight = t * spillFall;
    return { radius: .495 + .55 * flight, height: 1.366 - .5 * GRAVITY * flight * flight, age: flight };
  }));

  // 落水白沫分布在整圈接水处，不使用一颗颗白球或分离的落点。
  function pool(name, radius, height, impact) {
    const material = new THREE.ShaderMaterial({
      uniforms: { time: clock, night, impact: { value: impact }, radius: { value: radius } },
      vertexShader: 'varying vec2 poolUv; void main(){poolUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: /* glsl */`
        uniform float time, impact, radius, night;
        varying vec2 poolUv;
        ${noise}
        void main() {
          vec2 p = (poolUv - 0.5) * radius * 2.0;
          float r = length(p), distanceToFall = abs(r - impact);
          float broad = noise3(vec3(p * 12.0, time * 0.9));
          float fine = noise3(vec3(p * 38.0, time * 1.8));
          float ripple = sin(distanceToFall * 95.0 - time * 8.0) * exp(-distanceToFall * 16.0);
          float foam = exp(-pow((r - impact) / 0.032, 2.0)) * smoothstep(0.25, 0.8, broad * 0.7 + fine * 0.3);
          vec3 color = vec3(0.16, 0.32, 0.27) + broad * 0.035 + ripple * 0.012;
          color = mix(color, vec3(0.62, 0.75, 0.67), foam * 0.7);
          color *= mix(vec3(1.0), vec3(0.43,0.62,0.86), night);
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 128), material);
    mesh.name = name;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = height;
    group.add(mesh);
  }
  pool('upper-pool', .495, 1.366, .08 + .58 * crownFall);
  pool('lower-pool', .945, .505, landingRadius);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function update(seconds, flow = 1) { clock.value = reduced ? 0 : seconds; strength.value = flow; }
  update(0);
  return { group, update, setNight(value) { night.value = value; } };
}
