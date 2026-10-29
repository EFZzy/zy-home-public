import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Vector3, Scene, Mesh, BoxGeometry, MeshStandardMaterial } from 'three';
import { Lighting, Motions, nightAt, nightTarget } from '../src/experience.js';

test('自动照明昼夜边界连续，手动选择不受本地时间影响',()=>{
  assert.equal(nightAt(0),1);assert.equal(nightAt(12),0);assert.equal(nightAt(23.99),1);
  for(const hour of [5,7,17,19])assert.ok(Math.abs(nightAt(hour-.001)-nightAt(hour+.001))<.001);
  assert.equal(nightAt(6),.5);assert.equal(nightAt(18),.5);
  assert.equal(nightTarget('night',new Date(2026,9,23,12)),1);
  assert.equal(nightTarget('day',new Date(2026,9,23,23)),0);
});
test('抽屉快速反向没有跳变或位移累积，停止后完整归位',()=>{
  const motions=new Motions(),drawer=new Group();drawer.position.set(1,.2,3);
  const base=drawer.position.clone(),distance=new Vector3(0,0,.5);
  for(let i=0;i<20;i++){
    motions.toggle(drawer,distance,.1);motions.update(.2);
    const midway=drawer.position.clone();motions.toggle(drawer,distance,.1);
    assert.equal(midway.distanceTo(drawer.position),0);
    motions.update(1);assert.equal(drawer.position.distanceTo(base),0);assert.equal(drawer.rotation.y,0);
  }
  assert.equal(motions.items.size,0);
});
test('拿起动作重复触发仍返回原位，减少动态效果会立即完成',()=>{
  const cup=new Group(),motions=new Motions();cup.position.y=1.25;
  motions.lift(cup,.25);motions.update(.2);motions.lift(cup,.25);motions.update(1);
  assert.ok(Math.abs(cup.position.y-1.25)<1e-9);
  const reduced=new Motions(true);let completed=false;
  reduced.lift(cup,.25,()=>completed=true);assert.ok(completed);assert.equal(reduced.items.size,0);
});

function lightingScene(count=1){
  const scene=new Scene(),camera={position:new Vector3(0,1.8,0)};
  const lighting=new Lighting({scene,camera,isVisible:()=>true},'night');
  for(let i=0;i<count;i++){
    const group=new Group();group.position.z=i*4;
    const bulb=new Mesh(new BoxGeometry(.1,.1,.1),new MeshStandardMaterial());group.add(bulb);scene.add(group);
    lighting.add(group,bulb,[0,2,0],{power:15,range:7});
  }
  return {lighting,camera};
}

test('开门同时渐亮全部灯，远离和转身不熄灭、不换位',()=>{
  const {lighting,camera}=lightingScene(28);
  lighting.updateFixtures(0,true);
  assert.ok(lighting.fixtures.every(f=>f.output===0));
  lighting.turnOnAll();lighting.updateFixtures(.2);
  assert.ok(lighting.fixtures.every(f=>f.output>0&&f.output<.6),'所有灯均应在开门时开始渐亮');
  for(let i=0;i<240;i++)lighting.updateFixtures(1/60);
  const lights=lighting.fixtures.map(f=>f.light),positions=lights.map(l=>l.position.clone());
  for(const z of [-80,0,35,200]){
    camera.position.z=z;lighting.updateFixtures(1/60);
    lighting.fixtures.forEach((f,i)=>{
      assert.equal(f.light,lights[i]);assert.equal(f.light.position.distanceTo(positions[i]),0);
      assert.ok(f.output>.999,'远处灯也持续亮着');
      assert.ok(Math.abs(f.bulbs[0].material.emissiveIntensity-f.light.intensity/f.power*2.4)<1e-9);
    });
  }
});

test('手动关灯、开灯同步渐变，重新开门不能覆盖关闭状态',()=>{
  const {lighting}=lightingScene();const fixture=lighting.fixtures[0];
  lighting.turnOnAll();lighting.updateFixtures(0,true);
  lighting.toggle(fixture);lighting.updateFixtures(.2);
  assert.ok(fixture.output>0&&fixture.output<1,'关闭应渐暗');
  for(let i=0;i<240;i++)lighting.updateFixtures(1/60);
  assert.ok(fixture.output<.001);
  lighting.toggle(fixture);lighting.updateFixtures(.2);
  assert.ok(fixture.output>.1&&fixture.output<.6,'开启应渐亮');
  assert.ok(Math.abs(fixture.bulbs[0].material.emissiveIntensity-fixture.light.intensity/fixture.power*2.4)<1e-9);
  lighting.toggle(fixture);lighting.updateFixtures(0,true);
  lighting.turnOnAll();lighting.updateFixtures(.2);assert.equal(fixture.output,0);
  for(const mode of ['day','night','auto']){lighting.setMode(mode);lighting.updateFixtures(0,true);assert.equal(fixture.output,0);}
  lighting.toggle(fixture);lighting.updateFixtures(.2);assert.ok(fixture.output>0&&fixture.output<1);
});

test('自动灯白天熄灭、夜晚点亮，开门和距离不覆盖昼夜或手动状态',()=>{
  const {lighting,camera}=lightingScene(2);
  const outdoor=lighting.fixtures[0],indoor=lighting.fixtures[1];outdoor.exterior=true;
  lighting.amount=1;lighting.updateFixtures(0,true);
  assert.equal(outdoor.output,1);assert.equal(indoor.output,0,'夜晚室内仍在首次开门时渐亮');
  lighting.amount=0;lighting.turnOnAll();lighting.updateFixtures(0,true);
  assert.ok(lighting.fixtures.every(f=>f.output===0&&f.override===null),'白天开门不能把自动灯锁成常亮');
  lighting.amount=.5;lighting.updateFixtures(.2);
  assert.ok(lighting.fixtures.every(f=>f.output>0&&f.output<.5),'灯光随入夜平滑点亮');
  lighting.amount=1;lighting.updateFixtures(0,true);
  assert.ok(lighting.fixtures.every(f=>f.output===1));
  lighting.toggle(indoor);
  for(const amount of [0,1,0,1]){
    lighting.amount=amount;
    for(const z of [24,-35,100]){
      camera.position.z=z;lighting.turnOnAll();lighting.updateFixtures(0,true);
      assert.equal(outdoor.output,amount);assert.equal(indoor.output,0,'手动关闭仍有最高优先级');
      assert.equal(outdoor.light.intensity,outdoor.power*amount);
      assert.equal(outdoor.bulbs[0].material.emissiveIntensity,amount*2.4);
    }
  }
  lighting.toggle(indoor);lighting.updateFixtures(.2);assert.ok(indoor.output>0,'再次手动打开才重新点亮');
});

test('门洞遮光随开门连续收窄，关闭封严，打开不在室内伸出旋转投影',()=>{
  const {lighting}=lightingScene();
  const leaves=[-1,1].map(side=>{
    const pivot=new Group(),blocker=new Mesh(new BoxGeometry(1.73,5.04,.18));
    blocker.position.set(0,2.55,12.1);lighting.house.scene.add(blocker);
    return {pivot,side,blocker};
  });
  lighting.house.gateLeaves=leaves;
  for(const angle of [0,.3,.8,1.2,Math.PI/2,1.68,0]){
    leaves.forEach(l=>l.pivot.rotation.y=-l.side*angle);
    lighting.updateFixtures(0,true);
    for(const {side,blocker} of leaves){
      assert.equal(blocker.position.z,12.1,'代理留在门洞平面，不伸入室内');
      assert.equal(blocker.rotation.y,0);
      assert.equal(blocker.visible,angle<Math.PI/2);
      if(angle===0){assert.equal(blocker.scale.x,1);assert.equal(blocker.position.x,side*.865);}
      if(blocker.visible)assert.ok(Math.abs(Math.abs(blocker.position.x)+.865*blocker.scale.x-1.73)<1e-9,'遮光外沿始终贴住门框');
    }
  }
});
