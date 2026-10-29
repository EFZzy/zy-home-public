import * as THREE from 'three';

export const ease = t => t * t * (3 - 2 * t);
export function nightAt(hour) {
  if (hour >= 19 || hour < 5) return 1;
  if (hour < 7) return 1 - ease((hour - 5) / 2);
  if (hour < 17) return 0;
  return ease((hour - 17) / 2);
}
export function nightTarget(mode, date = new Date()) {
  return mode === 'night' ? 1 : mode === 'day' ? 0 : nightAt(date.getHours() + date.getMinutes() / 60);
}

// 每盏灯绑定自己的光源，不随相机距离回收或重新分配。
export class Lighting {
  constructor(house, mode = 'auto') {
    this.house = house; this.mode = ['auto','day','night'].includes(mode)?mode:'auto'; this.amount = nightTarget(this.mode);
    this.fixtures = []; this.windows = []; this.ceilings = []; this.surfaces = [];
    this.enabled = false;
    this.daySky = new THREE.Color('#dedbca'); this.nightSky = new THREE.Color('#111d31');
    this.dayFog = new THREE.Color('#e1dece'); this.nightFog = new THREE.Color('#18283c');
    this.daySun = new THREE.Color('#fff0cb'); this.nightSun = new THREE.Color('#9ab9ef');
    this.dayHemi = new THREE.Color('#fff4dc'); this.nightHemi = new THREE.Color('#a4b9d7');
    this.dayGround=new THREE.Color('#74785c');this.nightGround=new THREE.Color('#263549');
  }
  add(group, bulb, position, { power = 15, range = 7, decay = 2, exterior = false, entranceShadow = false, label = '灯' } = {}) {
    const emitter = new THREE.Object3D(); emitter.position.set(...position); group.add(emitter);
    const bulbs = Array.isArray(bulb) ? bulb : [bulb];
    for (const mesh of bulbs) mesh.material = new THREE.MeshStandardMaterial({
      color: '#ded0ad', roughness: .65, emissive: '#ffd291', emissiveIntensity: 0,
    });
    const light = new THREE.PointLight('#ffda9e', 0, range, decay);
    this.house.scene.add(light);
    if (entranceShadow) {
      light.castShadow = true;
      light.shadow.mapSize.set(512, 512);
      light.shadow.camera.near = .05;
      light.shadow.bias = -.00015;
      light.shadow.normalBias = .025;
      light.shadow.autoUpdate = false;
      light.shadow.needsUpdate = true;
    }
    const fixture = { group, emitter, bulbs, light, power, range, exterior, override: null, level: 0, output: 0, position: new THREE.Vector3(), label };
    this.fixtures.push(fixture);
    return fixture;
  }
  turnOnAll() {
    this.enabled = true;
    // 开门只启用室内自动照明，不把自动状态写成手动常亮。
  }
  toggle(fixture) {
    fixture.override = !(fixture.override ?? ((fixture.exterior || this.enabled) && this.amount > .25));
    return fixture.override;
  }
  setMode(mode) {
    this.mode = ['auto', 'day', 'night'].includes(mode) ? mode : 'auto';
    // 昼夜只改变环境照明，保留用户手动选择的灯光状态。
  }
  window(mesh, night = '#263e56') {
    mesh.material = mesh.material.clone();
    this.windows.push({ material: mesh.material, day: mesh.material.color.clone(), night: new THREE.Color(night) });
  }
  ceiling(material) { this.ceilings.push({ material, day: material.emissiveIntensity }); }
  update(dt, snap = false) {
    const target = nightTarget(this.mode);
    this.amount = snap ? target : THREE.MathUtils.damp(this.amount, target, 2, dt);
    if (Math.abs(this.amount - target) < .00001) this.amount = target;
    const n = this.amount, { house } = this;
    house.scene.background.copy(this.daySky).lerp(this.nightSky, n);
    house.scene.fog.color.copy(this.dayFog).lerp(this.nightFog, n);
    house.sun.color.copy(this.daySun).lerp(this.nightSun, n); house.sun.intensity = THREE.MathUtils.lerp(3.3, .42, n);
    house.hemisphere.color.copy(this.dayHemi).lerp(this.nightHemi, n); house.hemisphere.intensity = THREE.MathUtils.lerp(2.5, .65, n);
    house.hemisphere.groundColor.copy(this.dayGround).lerp(this.nightGround,n);
    house.renderer.toneMappingExposure = THREE.MathUtils.lerp(1.25, 1.15, n);
    for (const item of this.windows) item.material.color.copy(item.day).lerp(item.night, n);
    for (const item of this.ceilings) item.material.emissiveIntensity = THREE.MathUtils.lerp(item.day, .025, n);
    for (const fn of this.surfaces) fn(n);
    this.updateFixtures(dt, snap);
    document.body.classList.toggle('night', n > .5);
    document.documentElement.style.setProperty('--night',n.toFixed(3));
  }
  updateFixtures(dt, snap = false) {
    const { house } = this;
    for (const { pivot, side, blocker } of house.gateLeaves ?? []) {
      if (!blocker) continue;
      const coverage = Math.max(0, Math.cos(pivot.rotation.y));
      blocker.visible = coverage > .0001;
      blocker.scale.x = Math.max(.0001, coverage);
      blocker.position.x = side * 1.73 * (1 - coverage / 2);
    }
    for (const f of this.fixtures) {
      const automatic = (f.exterior || this.enabled) ? this.amount : 0;
      const wanted = f.override === null ? automatic : Number(f.override);
      f.level = snap ? wanted : THREE.MathUtils.damp(f.level, wanted, 2.5, dt);
      if (Math.abs(f.level - wanted) < .00001) f.level = wanted;
      f.emitter.getWorldPosition(f.position);
      f.light.position.copy(f.position);
      // 只跳过尚未呈现的房间；走远、转身和进出大门都不会熄灯。
      f.output = house.isVisible(f.group) ? f.level : 0;
      f.light.intensity = f.power * f.output;
      for (const bulb of f.bulbs) bulb.material.emissiveIntensity = f.output * 2.4;
    }
  }

}

// 重复点击从当前姿态反向，收尾精确归位，不累计位移，也不叠加定时器。
export class Motions {
  constructor(reduced = false) { this.reduced = reduced; this.items = new Map(); }
  animate(key, duration, update, done) {
    if (this.reduced) { update(1); done?.(); return; }
    this.items.set(key, { duration, elapsed: 0, update, done });
  }
  toggle(object, vector, angle = 0) {
    const state = object.userData.motion ??= { position: object.position.clone(), angle: object.rotation.y, open: false };
    state.open = !state.open;
    const from = object.position.clone(), fromAngle = object.rotation.y;
    const to = state.position.clone().addScaledVector(vector, Number(state.open));
    this.animate(object, .7, t => {
      object.position.lerpVectors(from, to, ease(t));
      object.rotation.y = THREE.MathUtils.lerp(fromAngle, state.angle + (state.open ? angle : 0), ease(t));
    });
    return state.open;
  }
  lift(object, height = .15, done) {
    const base = object.userData.restPosition ??= object.position.clone();
    const from=object.position.clone();
    this.animate(object, .65, t => { object.position.lerpVectors(from,base,ease(t)); object.position.y += height * Math.sin(Math.PI * t); }, done);
  }
  pull(object, offset) {
    const rest=object.userData.restPosition??=object.position.clone(),from=object.position.clone();
    this.animate(object,.7,t=>{object.position.lerpVectors(from,rest,ease(t)).addScaledVector(offset,Math.sin(Math.PI*t));});
  }
  sway(object) {
    const rest = object.userData.restRotation ??= object.rotation.z, from=object.rotation.z;
    this.animate(object, 1.6, t => { object.rotation.z = rest + (from-rest)*(1-ease(t)) + Math.sin(t * Math.PI * 4) * .045 * (1 - t); });
  }
  update(dt) {
    for (const [key, item] of this.items) {
      item.elapsed = Math.min(item.duration, item.elapsed + dt); item.update(item.elapsed / item.duration);
      if (item.elapsed >= item.duration) { this.items.delete(key); item.done?.(); }
    }
  }
}
