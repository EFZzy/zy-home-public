import { ShaderChunk } from 'three';

let installed = false;
export function optimizePointLighting() {
  if (installed) return;
  // Three 的标准材质仍会对零贡献点光执行完整 BRDF。
  // 使用同一灯光半径提前跳过该像素，不回收光源、不改变衰减或阴影。
  const start = 'getPointLightInfo( pointLight, geometryPosition, directLight );';
  const end = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
  ShaderChunk.lights_fragment_begin = ShaderChunk.lights_fragment_begin
    .replace(start, `if ( any( notEqual( pointLight.color, vec3( 0.0 ) ) ) &&
      ( pointLight.distance <= 0.0 || dot( pointLight.position - geometryPosition, pointLight.position - geometryPosition ) < pointLight.distance * pointLight.distance ) ) {
      ${start}`)
    .replace(end, `${end}\n }`);
  installed = true;
}
