import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Group } from 'three';
import { rooms } from '../src/content.js';
import { EYE_HEIGHT,WALK_SPEED,angleDelta,turnToward,roomDestination,roomRoute,returnRoute,roundedRoute,createWalk,advanceWalk,constrainPosition, seatPlacement, nearEntrance } from '../src/navigation.js';

const p=(x,z)=>new Vector3(x,EYE_HEIGHT,z);
function checkDoorCrossings(path,allowedRooms){
  for(let i=0;i<=1200;i++){
    const v=path.getPointAt(i/1200);assert.ok(Math.abs(v.y-EYE_HEIGHT)<1e-8,'相机保持人的眼高');
    if(v.z<10 && Math.abs(v.x)>3.25&&Math.abs(v.x)<3.8){
      assert.ok(allowedRooms.some(r=>Math.sign(v.x)===r.side&&Math.abs(v.z-r.z)<1.05),`穿墙: ${v.toArray()}`);
    }
    if(v.z>11.7&&v.z<12.3)assert.ok(Math.abs(v.x)<1.5,'从大门的真实开口进出');
  }
}
test('入口到最远的房间，以及全部跨房间路线都经过真实门洞',()=>{
  for(const destination of rooms){
    for(const start of [p(0,8.5),p(2,4),p(7,24)])checkDoorCrossings(roundedRoute(roomRoute(start,destination)),[destination]);
    for(const previous of rooms.filter(r=>r.id!==destination.id))checkDoorCrossings(roundedRoute(roomRoute(roomDestination(previous),destination,previous)),[previous,destination]);
    checkDoorCrossings(roundedRoute(returnRoute(roomDestination(destination),destination)),[destination]);
  }
});
test('远房间按距离步行，保持眼高、限制速度，不用短时长把人飞过去',()=>{
  const room=rooms.at(-1),walk=createWalk(roomRoute(p(0,8.5),room),0,-Math.PI/2,room);let previous=p(0,8.5),elapsed=0,maxSpeed=0;
  while(!walk.arrived&&elapsed<60){const next=advanceWalk(walk,1/60);const speed=next.distanceTo(previous)*60;assert.ok(speed<WALK_SPEED+.06,`单帧速度过大: ${speed}`);assert.equal(next.y,EYE_HEIGHT);maxSpeed=Math.max(speed,maxSpeed);previous=next;elapsed+=1/60;}
  assert.ok(walk.arrived,'能完成转向和入门');assert.ok(elapsed>walk.length/WALK_SPEED,'长路线没有按固定短时长压缩');assert.ok(maxSpeed>2,'直线段正常前进');assert.ok(previous.distanceTo(roomDestination(room))<1e-6);
});
test('背向目标时先转身，360 度和跨越正负 pi 都不会锁死或跳转',()=>{
  const room=rooms[0],walk=createWalk(roomRoute(p(0,8.5),room),Math.PI,Math.PI/2,room);
  for(let i=0;i<30;i++)advanceWalk(walk,1/60);assert.ok(walk.distance<.1,'背向目标时不能侧滑起飞');
  assert.ok(Math.abs(angleDelta(Math.PI-.01,-Math.PI+.01)-.02)<1e-8);
  assert.ok(turnToward(0,Math.PI,.1)>.09);assert.ok(turnToward(1.8,3.1,.2)>1.8);
  let angle=0;for(let i=0;i<240;i++)angle=turnToward(angle,4*Math.PI+.8,.1);assert.ok(Math.abs(angleDelta(angle,.8))<1e-6,'转多圈后仍可到达任意角度');
});
test('后退能穿过入口到门外，同时保留门洞与走廊边界',()=>{
  assert.equal(constrainPosition(p(0,24)).z,24);assert.ok(constrainPosition(p(0,18)).z>12);
  assert.equal(constrainPosition(p(5,12)).x,1.5);assert.equal(constrainPosition(p(5,0)).x,2.15);assert.equal(constrainPosition(p(5,20)).x,5);
});
test('庭院可以走到后方长椅，同时不能穿过喷泉底座',()=>{
  const back=constrainPosition(p(0,34.3));assert.equal(back.z,34.3);
  for(const position of [p(0,31.2),p(.3,31),p(-.2,32)]){
    const safe=constrainPosition(position);assert.ok(Math.hypot(safe.x,safe.z-31.2)>=1.5-1e-8);
  }
});

test('座位在真实座面中央，旋转长椅和沙发仍保持正确眼高',()=>{
  for(const [name,height]of [['garden-bench',1.4],['upholstered-chair',1.545],['tailored-sofa',1.65]]){
    const object=new Group();object.name=name;object.position.set(6,0,26);object.rotation.y=Math.PI/2;
    const placement=seatPlacement(object,-1),local=object.worldToLocal(placement.position.clone());
    assert.ok(Math.abs(placement.position.y-height)<1e-9);assert.ok(Math.abs(local.z)<.1,'落在座面上，不能停在椅子前面');
    assert.equal(placement.approach.y,EYE_HEIGHT);assert.ok(placement.approach.distanceTo(placement.position)>.5);
  }
});
test('大门在六米外提前打开，并用不同离开距离避免来回抖动',()=>{
  assert.ok(nearEntrance(p(0,18)));assert.ok(nearEntrance(p(0,6)));
  assert.ok(!nearEntrance(p(0,19)));assert.ok(nearEntrance(p(0,19),true));
  assert.ok(!nearEntrance(p(0,20),true));assert.ok(!nearEntrance(p(6,15)));
});
