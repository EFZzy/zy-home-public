import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 仅合并指定建筑组直属的静态零件，交互对象、灯泡和可动子组保留原层级。
export function batchStaticMeshes(parent) {
  const batches = new Map();
  for (const mesh of parent.children) {
    if (!mesh.isMesh || mesh.isInstancedMesh || mesh.name || mesh.userData.action || mesh.customDepthMaterial || Array.isArray(mesh.material) || mesh.material.transparent) continue;
    const key = `${mesh.material.uuid}:${mesh.castShadow}:${mesh.receiveShadow}`;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(mesh);
  }
  for (const parts of batches.values()) {
    if (parts.length < 2) continue;
    const geometries = parts.map(mesh => {
      mesh.updateMatrix();
      return (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(mesh.matrix);
    });
    const geometry = mergeGeometries(geometries);
    geometries.forEach(g => g.dispose());
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, parts[0].material);
    mesh.castShadow = parts[0].castShadow;
    mesh.receiveShadow = parts[0].receiveShadow;
    parts.forEach(part => parent.remove(part));
    parent.add(mesh);
  }
}

const geometries = new Map();
export function doorwayWallGeometry(width,height,depth,openingWidth,openingHeight) {
  const key=['wall',width,height,depth,openingWidth,openingHeight].join(':');
  if(!geometries.has(key)){
    const outline=new THREE.Shape(),edge=width/2,door=openingWidth/2;
    outline.moveTo(-edge,0);outline.lineTo(-door,0);outline.lineTo(-door,openingHeight);outline.lineTo(door,openingHeight);outline.lineTo(door,0);outline.lineTo(edge,0);outline.lineTo(edge,height);outline.lineTo(-edge,height);outline.closePath();
    const geometry=new THREE.ExtrudeGeometry(outline,{depth,bevelEnabled:false,steps:1});
    geometry.translate(0,0,-depth/2);geometries.set(key,geometry);
  }
  return geometries.get(key);
}
export function roundedGeometry(size, radius = Math.min(.025, Math.min(...size) * .2), segments = 2) {
  const r = Math.min(radius, Math.min(...size) * .48);
  const key = [...size,r,segments].join(':');
  if (!geometries.has(key)) geometries.set(key, new RoundedBoxGeometry(...size,segments,r));
  return geometries.get(key);
}
const plain = new THREE.BoxGeometry(1,1,1);
export function shapedBox(parent, size, pos, material, radius) {
  const detailed = radius !== undefined || (Math.max(...size) < 5.1 && Math.min(...size) >= .025);
  const mesh = new THREE.Mesh(detailed ? roundedGeometry(size,radius) : plain,material);
  if (!detailed) mesh.scale.set(...size);
  mesh.position.set(...pos);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
