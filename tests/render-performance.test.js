import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Group, Mesh, BoxGeometry, MeshStandardMaterial, DirectionalLight, PointLight, MeshDepthMaterial, Raycaster, Vector3 } from 'three';
import { ShadowCache } from '../src/shadow-cache.js';
import { batchStaticMeshes } from '../src/modeling.js';

function setup(){
 const scene=new Scene(),sun=new DirectionalLight(),near=new PointLight(0xffffff,1,5),far=new PointLight(0xffffff,1,5);
 near.position.set(2,2,0);far.position.set(30,2,0);scene.add(sun,near,far);
 const group=new Group(),mesh=new Mesh(new BoxGeometry(),new MeshStandardMaterial());mesh.castShadow=true;group.add(mesh);scene.add(group);
 const cache=new ShadowCache(scene,sun,[near,far]);
 const reset=()=>[sun,near,far].forEach(l=>l.shadow.needsUpdate=false);
 reset();return {scene,sun,near,far,group,mesh,cache,reset};
}
test('静态阴影复用，亮度改变无需重绘；移动遮挡物只更新受影响的灯',()=>{
 const {sun,near,far,mesh,cache,reset}=setup();
 near.intensity=.5;cache.update();assert.ok([sun,near,far].every(l=>!l.shadow.needsUpdate));
 mesh.position.x=.2;cache.update();assert.equal(sun.shadow.needsUpdate,true);assert.equal(near.shadow.needsUpdate,true);assert.equal(far.shadow.needsUpdate,false);
 reset();cache.update();assert.ok([sun,near,far].every(l=>!l.shadow.needsUpdate));
 // 离开原光源范围也要清除旧影，而不只检查移动后的范围。
 mesh.position.x=30;cache.update();assert.equal(near.shadow.needsUpdate,true);assert.equal(far.shadow.needsUpdate,true);
});
test('父节点运动、房间显隐、光源移动与动画归位都使缓存失效',()=>{
 const {sun,near,group,mesh,cache,reset}=setup();
 group.rotation.z=.1;cache.update();assert.equal(sun.shadow.needsUpdate,true);
 reset();group.rotation.z=0;cache.update();assert.equal(sun.shadow.needsUpdate,true);
 reset();group.visible=false;cache.update();assert.equal(near.shadow.needsUpdate,true);
 reset();mesh.position.x=.1;cache.update();assert.equal(sun.shadow.needsUpdate,false);
 group.visible=true;cache.update();assert.equal(sun.shadow.needsUpdate,true);
 reset();near.position.z=1;cache.update();assert.equal(near.shadow.needsUpdate,true);assert.equal(sun.shadow.needsUpdate,false);
});
test('门洞遮光代理的变化不触发太阳阴影重绘',()=>{
 const {sun,near,mesh,cache}=setup();mesh.customDepthMaterial=new MeshDepthMaterial({colorWrite:false});
 mesh.scale.x=.5;cache.update();assert.equal(sun.shadow.needsUpdate,false);assert.equal(near.shadow.needsUpdate,true);
});
test('静态合批保留几何命中、材质与阴影属性，并保留交互子节点',()=>{
 const parent=new Group(),material=new MeshStandardMaterial(),parts=[];
 for(const x of [-2,2]){const m=new Mesh(new BoxGeometry(),material);m.position.x=x;m.castShadow=true;parent.add(m);parts.push(m);}
 const interactive=new Mesh(new BoxGeometry(),material);interactive.userData.action=()=>{};parent.add(interactive);
 const moving=new Group();parent.add(moving);
 batchStaticMeshes(parent);parent.updateMatrixWorld(true);
 assert.ok(parent.children.includes(interactive)&&parent.children.includes(moving));
 assert.equal(parent.children.filter(o=>o.isMesh).length,2);
 const hit=new Raycaster(new Vector3(2,0,3),new Vector3(0,0,-1)).intersectObjects(parent.children,true)[0];
 assert.equal(hit.point.z,.5);assert.equal(hit.object.material,material);assert.equal(hit.object.castShadow,true);
});

import { renderPixelRatio } from '../src/render-quality.js';
import { overlaps } from '../src/overlay-layout.js';
test('手机提高到 2.5 倍且横竖屏一致，大窗口像素受限',()=>{
 assert.equal(renderPixelRatio(1280,800,1),1);
 assert.equal(renderPixelRatio(1280,800,2),1.75);
 assert.equal(renderPixelRatio(390,844,3),2.5);
 assert.equal(renderPixelRatio(844,390,3),2.5);
 assert.equal(renderPixelRatio(402,874,3),2.5);
 assert.equal(renderPixelRatio(390,844,2),2);
 const ratio=renderPixelRatio(1920,1080,2);assert.ok(1920*1080*ratio**2<=4_000_001);
});
test('标签锚点在介绍以外时，仍按完整标签边界检查重叠',()=>{
 const caption={left:60,right:310,top:150,bottom:400};
 assert.ok(overlaps({left:250,right:480,top:130,bottom:180},caption));
 assert.ok(!overlaps({left:330,right:550,top:150,bottom:200},caption));
});
