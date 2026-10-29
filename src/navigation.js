import { Vector3, CurvePath, LineCurve3, QuadraticBezierCurve3, MathUtils } from 'three';

export const EYE_HEIGHT = 1.8;
export const WALK_SPEED = 4.5;
const point = (x,z) => new Vector3(x,EYE_HEIGHT,z);
export const angleDelta = (from,to) => Math.atan2(Math.sin(to-from),Math.cos(to-from));
export const turnToward = (from,to,maxTurn) => from + MathUtils.clamp(angleDelta(from,to),-maxTurn,maxTurn);
export const heading = direction => Math.atan2(-direction.x,-direction.z);

export function roomAt(position,rooms) {
  if(Math.abs(position.x)<3.45 || position.z>0)return null;
  return rooms.find(r=>Math.sign(position.x)===r.side && Math.abs(position.z-r.z)<4.4)??null;
}
export function roomDestination(room) { return point(room.side*5.15,room.z+room.side*.2); }
export function exitRoomPoints(room) {
  return [point(room.side*4.45,room.z),point(room.side*3.48,room.z),point(room.side*1.8,room.z),point(0,room.z)];
}
export function roomRoute(from,destination,previous=null) {
  const points=[point(from.x,from.z)];
  if(previous)points.push(...exitRoomPoints(previous));
  // 在门外先走到大门正前方，再穿门，不能斜穿外墙。
  if(from.z>12.7)points.push(point(0,16),point(0,10));
  const last=points.at(-1),approach=Math.sign(last.z-destination.z)||1;
  points.push(point(0,destination.z+approach*1.6),point(destination.side*1.85,destination.z),point(destination.side*3.48,destination.z),roomDestination(destination));
  return points;
}
export function returnRoute(from,room) {
  return [point(from.x,from.z),...exitRoomPoints(room).slice(0,-1),point(0,room.z-1.6)];
}
// 每个拐角只在走廊/门洞的安全余量内圆滑转弯，按真实弧长行走。
export function roundedRoute(points) {
  const filtered=points.filter((p,i)=>!i||p.distanceTo(points[i-1])>.015);
  const path=new CurvePath();let cursor=filtered[0].clone();
  for(let i=1;i<filtered.length-1;i++){
    const a=filtered[i-1],corner=filtered[i],b=filtered[i+1];
    const cut=Math.min(.5,a.distanceTo(corner)*.24,corner.distanceTo(b)*.24);
    const before=corner.clone().add(a.clone().sub(corner).normalize().multiplyScalar(cut));
    const after=corner.clone().add(b.clone().sub(corner).normalize().multiplyScalar(cut));
    if(cursor.distanceTo(before)>.0001)path.add(new LineCurve3(cursor,before));
    path.add(new QuadraticBezierCurve3(before,corner.clone(),after));cursor=after;
  }
  const end=filtered.at(-1).clone();if(cursor.distanceTo(end)>.0001)path.add(new LineCurve3(cursor,end));
  return path;
}
export function createWalk(points,yaw,finalYaw,room=null) {
  const path=roundedRoute(points);
  return {path,length:path.getLength(),distance:0,speed:0,yaw,finalYaw,room,arrived:false};
}
export function advanceWalk(walk,dt) {
  const remaining=walk.length-walk.distance;
  const ahead=walk.path.getPointAt(Math.min(1,(walk.distance+.8)/walk.length));
  const position=walk.path.getPointAt(walk.distance/walk.length);
  const direction=ahead.clone().sub(position);
  const desired=remaining<.7?walk.finalYaw:heading(direction);
  const error=Math.abs(angleDelta(walk.yaw,desired));
  walk.yaw=turnToward(walk.yaw,desired,dt*1.8);
  // 先转向行走方向；转弯时减速，避免身体侧滑或面朝书柜倒飞。
  const turning=MathUtils.clamp(1-error/1.0,0,1);
  const wanted=Math.min(WALK_SPEED*turning,Math.sqrt(Math.max(0,2*4.5*remaining)));
  walk.speed=MathUtils.clamp(wanted,walk.speed-dt*7.5,walk.speed+dt*4.5);
  walk.distance=Math.min(walk.length,walk.distance+walk.speed*dt);
  const next=walk.path.getPointAt(walk.distance/walk.length);next.y=EYE_HEIGHT;
  if(walk.length-walk.distance<.025){
    walk.distance=walk.length;next.copy(walk.path.getPointAt(1));walk.speed=0;
    walk.yaw=turnToward(walk.yaw,walk.finalYaw,dt*1.8);
    walk.arrived=Math.abs(angleDelta(walk.yaw,walk.finalYaw))<.025;
  }
  return next;
}
export function constrainPosition(position) {
  const p=position.clone();p.y=EYE_HEIGHT;p.z=MathUtils.clamp(p.z,-34,34.5);
  const limit=p.z>12.8?8:(p.z>10.9?1.5:2.15);p.x=MathUtils.clamp(p.x,-limit,limit);
  // 喷泉底座不可穿行，留出半个身位，从两侧绕过去。
  const dx=p.x,dz=p.z-31.2,distance=Math.hypot(dx,dz);
  if(distance<1.5){const angle=Math.atan2(dz,dx||.001);p.x=Math.cos(angle)*1.5;p.z=31.2+Math.sin(angle)*1.5;}
  return p;
}

export function seatPlacement(object, side = 0) {
  // 以座面中心为准：长椅座面约 0.62 米，沙发约 0.87 米；坐姿眼高再加 0.78 米。
  const sofa=object.name==='tailored-sofa',chair=object.name==='upholstered-chair';
  const seat=object.localToWorld(new Vector3(sofa?side*.85:0,(sofa?.87:chair?.765:.62)+.78,sofa?-.075:chair?-.02:0));
  const approach=object.localToWorld(new Vector3(sofa?side*.85:chair?side*.8:0,0,sofa?-.85:chair?.1:-.75));
  approach.y=EYE_HEIGHT;
  return {object,position:seat,approach};
}
export function nearEntrance(position, alreadyOpen = false) {
  return Math.abs(position.x)<3.2 && Math.abs(position.z-12)<(alreadyOpen?7.5:6.5);
}
