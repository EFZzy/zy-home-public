import { Matrix4, Sphere, Vector3 } from 'three';

function visible(object) {
  for (let node = object; node; node = node.parent) if (!node.visible) return false;
  return true;
}

function bounds(mesh, target) {
  const owner = mesh.isInstancedMesh ? mesh : mesh.geometry;
  if (!owner.boundingSphere) owner.computeBoundingSphere();
  return target.copy(owner.boundingSphere).applyMatrix4(mesh.matrixWorld);
}

// 相机移动和灯光亮度变化不改变阴影深度图；只在遮挡物或光源移动时重绘。
export class ShadowCache {
  constructor(scene, sun, lights) {
    this.scene = scene;
    this.sun = sun;
    this.lights = lights.map(light => ({ light, position: new Vector3().copy(light.position) }));
    this.casters = [];
    this.nextBounds = new Sphere();
    scene.updateMatrixWorld(true);
    scene.traverse(mesh => {
      if (!mesh.isMesh || !mesh.castShadow) return;
      this.casters.push({ mesh, matrix: new Matrix4().copy(mesh.matrixWorld), visible: visible(mesh), sphere: bounds(mesh, new Sphere()) });
    });
    for (const light of [sun, ...lights]) {
      light.shadow.autoUpdate = false;
      light.shadow.needsUpdate = true;
    }
  }

  update() {
    this.scene.updateMatrixWorld(true);
    for (const item of this.casters) {
      const { mesh } = item, shown = visible(mesh);
      if (shown === item.visible && mesh.matrixWorld.equals(item.matrix)) continue;
      if (shown || item.visible) {
        bounds(mesh, this.nextBounds);
        // 大门的遮光代理只用于点光源，不影响太阳阴影。
        if (mesh.customDepthMaterial?.colorWrite !== false) this.sun.shadow.needsUpdate = true;
        for (const { light } of this.lights) {
          if (light.shadow.needsUpdate) continue;
          const reaches = sphere => !light.distance || light.position.distanceToSquared(sphere.center) <= (light.distance + sphere.radius) ** 2;
          if ((item.visible && reaches(item.sphere)) || (shown && reaches(this.nextBounds))) light.shadow.needsUpdate = true;
        }
        item.sphere.copy(this.nextBounds);
      }
      item.matrix.copy(mesh.matrixWorld);
      item.visible = shown;
    }
    for (const item of this.lights) {
      if (!item.position.equals(item.light.position)) {
        item.light.shadow.needsUpdate = true;
        item.position.copy(item.light.position);
      }
    }
  }
}
