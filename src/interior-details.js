import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { shapedBox } from './modeling.js';
const materials = new Map();
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
export function finish(color,roughness=.72,metalness=0){
  if(typeof color!=='string')return color;
  const key=[color,roughness,metalness].join(':');
  if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,roughness,metalness}));
  return materials.get(key);
}
const brass=finish('#b19a62',.32,.6),paper=finish('#dcd3b9',.95),trim=finish('#c5b797');
function block(g,size,pos,color,r){return shapedBox(g,size,pos,finish(color),r);}
function mesh(g,geometry,pos,color){const m=new THREE.Mesh(geometry,finish(color));m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;}
function turned(g,points,pos,color){return mesh(g,new THREE.LatheGeometry(points.map(p=>new THREE.Vector2(...p)),40),pos,color);}
function rod(g,a,b,r,color,r2=r){const av=V(...a),bv=V(...b),delta=bv.clone().sub(av);const m=mesh(g,new THREE.CylinderGeometry(r2,r,delta.length(),12),av.add(bv).multiplyScalar(.5).toArray(),color);m.quaternion.setFromUnitVectors(V(0,1,0),delta.normalize());return m;}
function ring(g,r,t,pos,color,rotationX=0){const m=mesh(g,new THREE.TorusGeometry(r,t,8,48),pos,color);m.rotation.x=rotationX;return m;}
export function frame(g,w,h,pos,color,bar=.055,depth=.065){
  const group=new THREE.Group();group.position.set(...pos);g.add(group);
  for(const side of [-1,1]){block(group,[bar,h+bar,depth],[side*w/2,0,0],color,.012);block(group,[w+bar,bar,depth],[0,side*h/2,0],color,.012);}
  return group;
}
// 将同一交互对象的静态小零件按材质合并，保留整体点击事件。
export function batchDetails(group){
  group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert(),batches=new Map();
  group.traverse(o=>{if(o.isMesh&&!Array.isArray(o.material)){const geo=o.geometry.clone().applyMatrix4(inverse.clone().multiply(o.matrixWorld));const list=batches.get(o.material)||[];list.push(geo);batches.set(o.material,list);}});
  group.clear();for(const [material,list]of batches){const flat=list.map(g=>g.index?g.toNonIndexed():g);const m=new THREE.Mesh(mergeGeometries(flat),material);m.castShadow=true;m.receiveShadow=true;group.add(m);new Set([...list,...flat]).forEach(g=>g.dispose());}
}
export function hardback(g,pos,width,height,depth,color){
  const book=new THREE.Group();book.name='hardback-book';book.position.set(...pos);g.add(book);
  block(book,[width-.024,height-.035,depth-.035],[0,height/2,-.012],paper,.004);
  for(const side of [-1,1])block(book,[.014,height,depth],[side*(width-.014)/2,height/2,0],color,.004);
  block(book,[width,height,.025],[0,height/2,depth/2-.008],color,.008);
  for(const ratio of [.12,.86])block(book,[width*.78,.013,.008],[0,height*ratio,depth/2+.009],brass,.003);
  block(book,[width*.54,height*.18,.006],[0,height*.58,depth/2+.008],'#b5aa84',.002);
  return book;
}
export function openBook(g,pos,action){
  const group=new THREE.Group();group.name='curved-open-book';group.position.set(...pos);group.userData.action=action;g.add(group);
  const cover=finish('#4b6047'),ink=finish('#98937b');
  for(const side of [-1,1]){
    const shape=new THREE.Shape();shape.moveTo(0,.025);
    for(let i=1;i<=16;i++){const t=i/16;shape.lineTo(side*.49*t,.025+.055*Math.sin(Math.PI*t*.95));}
    shape.lineTo(side*.49,-.01);shape.lineTo(0,-.015);shape.closePath();
    const pages=mesh(group,new THREE.ExtrudeGeometry(shape,{depth:.66,bevelEnabled:true,bevelSize:.002,bevelThickness:.002,bevelSegments:1}),[0,0,-.33],paper);
    const c=block(group,[.52,.018,.7],[side*.25,-.025,0],cover,.006);c.rotation.z=side*.025;
    // 每条文字线贴合弯曲页顶；纸页边缘由独立细线表现。
    for(let row=0;row<11;row++){
      const points=[];for(let j=0;j<=10;j++){const t=.15+j*.065;points.push(V(side*.49*t,.029+.055*Math.sin(Math.PI*t*.95),-.25+row*.046));}
      mesh(group,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),10,.0015,3,false),[0,0,0],ink).castShadow=false;
    }
    for(let row=0;row<3;row++)rod(group,[0,-.008+row*.009,.333],[side*.48,-.008+row*.009,.333],.0012,'#b7ad91');
  }
  block(group,[.032,.007,.32],[.055,.035,.25],'#a77a52',.002);batchDetails(group);
  const turning=new THREE.Group();turning.position.y=.035;turning.visible=false;group.add(turning);
  const pageGeometry=new THREE.PlaneGeometry(.48,.64,16,1);pageGeometry.rotateX(-Math.PI/2);pageGeometry.translate(.24,0,0);
  const posAttr=pageGeometry.attributes.position;for(let i=0;i<posAttr.count;i++)posAttr.setY(i,.055*Math.sin(posAttr.getX(i)/.49*Math.PI));pageGeometry.computeVertexNormals();
  const pageMaterial=paper.clone();pageMaterial.side=THREE.DoubleSide;
  const page=mesh(turning,pageGeometry,[0,0,0],pageMaterial);page.castShadow=false;group.userData.turningPage=turning;return group;
}
export function bankerLamp(parent,pos,scale=1){
  const g=new THREE.Group();g.name='banker-lamp';g.position.set(...pos);g.scale.setScalar(scale);parent.add(g);
  turned(g,[[0,0],[.19,0],[.235,.016],[.245,.04],[.23,.065],[.17,.082],[.08,.09],[0,.09]],[0,0,0],brass);
  turned(g,[[0,.08],[.045,.08],[.046,.13],[.025,.16],[.025,.52],[.045,.55],[.045,.575],[0,.575]],[0,0,0],brass);
  for(const side of [-1,1]){
    const curve=new THREE.CatmullRomCurve3([V(0,.52,0),V(side*.23,.56,0),V(side*.37,.69,0),V(side*.37,.73,0)]);
    mesh(g,new THREE.TubeGeometry(curve,16,.018,8,false),[0,0,0],brass);
    rod(g,[side*.39,.73,0],[side*.43,.73,0],.047,brass);
  }
  const shape=new THREE.Shape();shape.moveTo(-.285,0);shape.quadraticCurveTo(-.285,.26,0,.27);shape.quadraticCurveTo(.285,.26,.285,0);
  shape.lineTo(.265,0);shape.quadraticCurveTo(.26,.24,0,.248);shape.quadraticCurveTo(-.26,.24,-.265,0);shape.closePath();
  const shade=mesh(g,new THREE.ExtrudeGeometry(shape,{depth:.78,bevelEnabled:true,bevelSize:.006,bevelThickness:.006,bevelSegments:2}),[-.39,.68,0],finish('#346047',.26));shade.rotation.y=Math.PI/2;
  for(const side of [-1,1])rod(g,[-.4,.682,side*.28],[.4,.682,side*.28],.009,brass);
  const bulb=rod(g,[-.23,.72,0],[.23,.72,0],.035,new THREE.MeshBasicMaterial({color:'#fff0c8'}));
  rod(g,[.25,.7,.04],[.25,.46,.04],.0035,brass);mesh(g,new THREE.SphereGeometry(.013,10,8),[.25,.45,.04],brass);
  const light=new THREE.PointLight('#ffdf9e',2.5,3,2);light.position.set(0,.66,.02);g.add(light);
  g.userData.lamp={light,bulb};return {group:g,light,bulb};
}
export function chair(parent,pos,wood,angle=0){
  const g=new THREE.Group();g.name='upholstered-chair';g.position.set(...pos);g.rotation.y=angle;parent.add(g);
  block(g,[.87,.1,.81],[0,.61,0],wood,.035);block(g,[.78,.13,.73],[0,.70,-.02],'#778169',.06);
  for(const x of [-.34,.34])for(const z of [-.29,.29])rod(g,[x*1.12,.035,z*1.18],[x,.59,z],.028,wood,.04);
  for(const x of [-.36,.36]){rod(g,[x,.59,.29],[x,1.42,.39],.025,wood,.032);rod(g,[x,.33,-.28],[x,.33,.32],.016,wood);}
  const back=block(g,[.8,.6,.095],[0,1.15,.37],wood,.045);back.rotation.x=.09;
  const pad=block(g,[.69,.46,.075],[0,1.16,.305],'#778169',.05);pad.rotation.x=.09;
  return g;
}
export function sofa(parent,wood){
  const g=new THREE.Group();g.name='tailored-sofa';g.position.z=1.5;parent.add(g);
  block(g,[3.65,.4,1.27],[0,.44,0],'#6c7b61',.11);
  for(const x of [-1.55,1.55])for(const z of [-.45,.45])rod(g,[x*1.02,.03,z],[x,.3,z],.045,wood,.06);
  for(const x of [-1.79,1.79])block(g,[.3,.62,1.35],[x,.79,0],'#7b886c',.12);
  for(const x of [-1.13,0,1.13]){
    block(g,[1.08,.22,1.03],[x,.76,-.075],'#98a286',.075);
    const back=block(g,[1.08,.65,.24],[x,1.14,.46],'#89967a',.09);back.rotation.x=.12;
    // 坐垫边缘的细滚边，随实体圆角走线。
    const pts=[[-.48,-.43],[.48,-.43],[.51,-.39],[.51,.39],[.48,.43],[-.48,.43],[-.51,.39],[-.51,-.39]].map(([a,b])=>V(x+a,.79,b-.075));
    mesh(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts,true),64,.004,4,true),[0,0,0],'#bcc2a7');
  }
  for(const side of [-1,1]){const pillow=block(g,[.48,.48,.18],[side*1.33,1.09,.13],side<0?'#b7ad88':'#76836c',.08);pillow.rotation.set(.08,side*.15,side*.17);}
  return g;
}
export function mug(parent,pos){
  const g=new THREE.Group();g.name='ceramic-mug';g.position.set(...pos);parent.add(g);
  turned(g,[[0,0],[.078,0],[.09,.025],[.105,.18],[.102,.20],[.09,.204],[.085,.19],[.073,.04],[0,.035]],[0,0,0],finish('#d5c8a8',.35));
  mesh(g,new THREE.CircleGeometry(.085,32),[0,.173,0],finish('#463a27',.2)).rotation.x=-Math.PI/2;
  const handle=ring(g,.062,.013,[.12,.12,0],finish('#d5c8a8',.35));handle.rotation.y=Math.PI/2;
  return g;
}
export function coffeeTable(parent,wood,action){
  const g=new THREE.Group();g.name='turned-coffee-table';g.position.z=-.3;g.userData.action=action;parent.add(g);
  turned(g,[[0,.59],[.83,.59],[.89,.604],[.92,.63],[.92,.67],[.90,.695],[.85,.71],[0,.71]],[0,0,0],wood);
  for(let i=0;i<3;i++){const a=i*Math.PI*2/3;rod(g,[Math.cos(a)*.67,.035,Math.sin(a)*.67],[Math.cos(a)*.48,.6,Math.sin(a)*.48],.037,wood,.065);}
  return g;
}
export function vase(parent,pos,scale=1){
  const g=new THREE.Group();g.name='flower-vase';g.position.set(...pos);g.scale.setScalar(scale);parent.add(g);
  turned(g,[[0,0],[.12,0],[.17,.05],[.19,.19],[.15,.32],[.085,.41],[.08,.5],[.09,.515],[.065,.515],[.06,.48],[.07,.41],[.12,.3],[.14,.18],[.1,.04],[0,.04]],[0,0,0],finish('#b9b59a',.38));
  for(let i=0;i<3;i++){const a=i*2.4;rod(g,[0,.12,0],[Math.cos(a)*.15,.82+i*.11,Math.sin(a)*.15],.004,'#738160');for(let j=0;j<3;j++){const leaf=mesh(g,new THREE.SphereGeometry(.045,10,6),[Math.cos(a)*(.08+j*.02),.57+j*.12,Math.sin(a)*.1],'#7f8b65');leaf.scale.set(.45,1.6,.7);leaf.rotation.z=.5;}}
  return g;
}
export function architectureDetails(g,room){
  const color='#b3aa8c';
  for(let x=-3.7;x<4;x+=1.48)frame(g,1.23,.68,[x,.62,-4.275],color,.024,.03);
  for(const side of [-1,1])for(let z=-3.6;z<4;z+=1.48){const panel=frame(g,1.23,.66,[side*4.365,.61,z],color,.024,.03);panel.rotation.y=-side*Math.PI/2;}
  for(const x of [-2.9,2.9]){const panel=frame(g,2.6,.68,[x,.61,4.12],color,.024,.03);panel.rotation.y=Math.PI;}
  const ceiling=frame(g,6.9,6.9,[0,4.555,0],'#c6bfa6',.045,.045);ceiling.rotation.x=Math.PI/2;ceiling.traverse(o=>{o.castShadow=false;});
  for(const side of [-1,1]){block(g,[8.7,.055,.08],[0,4.43,side*4.25],trim);block(g,[.08,.055,8.5],[side*4.25,4.43,0],trim);}
}
export function windowDetails(windowGroup){
  frame(windowGroup,3.02,2.8,[0,0,.14],'#c5ba98',.085,.1);
  frame(windowGroup,3.18,2.97,[0,0,.08],'#aaa181',.04,.06);
  block(windowGroup,[3.36,.11,.47],[0,-1.43,.25],'#c9bea0',.035);
  rod(windowGroup,[-2,1.66,.68],[2,1.66,.68],.027,brass);
  const curtains=new THREE.Group();curtains.name='window-curtains';curtains.position.z=.35;windowGroup.add(curtains);
  for(const side of [-1,1]){
    mesh(windowGroup,new THREE.SphereGeometry(.065,16,10),[side*2.04,1.66,.68],brass);
    const rows=24,cols=24,positions=[],uvs=[],indices=[];
    for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){
      const u=x/cols,t=y/rows,spread=.4+.14*t;
      positions.push((u-.5)*spread,1.51-t*3.4,.3+Math.cos(u*Math.PI*10)*.045+.025*Math.sin(t*Math.PI));uvs.push(u,t);
      if(y<rows&&x<cols){const a=y*(cols+1)+x,b=a+cols+1;indices.push(a,b,a+1,a+1,b,b+1);}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();
    const fabric=finish('#ded3b5',1);fabric.side=THREE.DoubleSide;
    const cloth=mesh(curtains,geo,[side*1.7,0,0],fabric);cloth.userData.side=side;cloth.userData.openX=side*1.7;
    for(let i=0;i<5;i++)ring(windowGroup,.035,.007,[side*1.7-.16+i*.08,1.57,.68],brass,Math.PI/2);
  }
}
export function wallSconce(parent){
  parent.name='wall-sconce';
  block(parent,[.16,.42,.055],[0,0,0],brass,.035);
  const curve=new THREE.CatmullRomCurve3([V(0,-.12,.015),V(0,-.16,.18),V(0,.015,.23)]);
  mesh(parent,new THREE.TubeGeometry(curve,12,.018,8,false),[0,0,0],brass);
  parent.userData.shade=turned(parent,[[.15,-.12],[.11,.18],[.10,.19],[.093,.175],[.135,-.115],[.15,-.12]],[0,.07,.23],finish('#e9ddbd',.9));
  ring(parent,.146,.007,[0,-.045,.23],brass,Math.PI/2);
  parent.userData.bulb=mesh(parent,new THREE.SphereGeometry(.045,12,8),[0,.035,.23],new THREE.MeshBasicMaterial({color:'#fff0c8'}));
}
export function roomProps(g,room,wood,house){
  if(room.id==='gallery'){
    for(const x of [-2.7,-.05,2.6]){block(g,[.65,.045,.08],[x,3.83,-4.04],brass);rod(g,[x,3.85,-4.25],[x,3.85,-4.04],.018,brass);}
    const seat=block(g,[3.2,.14,.84],[0,.83,.8],'#8d967c',.06);house.register(seat,'看看作品集',()=>house.reveal(null,'gallery'));vase(g,[-3.4,.05,1.5],1.3);
  }else if(room.id==='lab'){
    frame(g,4.12,1.72,[0,2.9,-4.20],wood,.075,.1);block(g,[4.2,.055,.24],[0,2.03,-4.11],wood);
    for(let i=0;i<3;i++)rod(g,[-.4+i*.2,2.07,-4.06],[-.3+i*.2,2.07,-4.06],.012,'#ded9bd');
    block(g,[.3,.055,.12],[.7,2.08,-4.06],'#5c6250');
    for(const x of [-1.65,1.65]){block(g,[.28,.06,1.48],[x,.055,-1.8],brass);block(g,[.22,.08,.25],[x,1.02,-1.8],brass);}
    const glass=finish('#a3bdb1',.16,.18);
    const flask=turned(g,[[0,0],[.13,0],[.17,.055],[.15,.23],[.065,.35],[.065,.52],[.08,.53],[.08,.55],[.05,.55],[.05,.39],[0,.04]],[1.4,1.19,-1.55],glass);house.register(flask,'拿起实验烧瓶',()=>house.motions.lift(flask,.2));
    for(let i=0;i<3;i++){const book=hardback(g,[-1.35,1.19+i*.06,-1.45],.055,.45,.32,['#7e8d79','#ae9670','#6e8180'][i]);book.rotation.z=-Math.PI/2;}
    chair(g,[1.3,0,.3],wood,.1);
  }else if(room.id==='journal'){
    frame(g,4.88,2.58,[0,2.8,-4.22],wood,.075,.09);
    for(let i=0;i<7;i++){const x=-1.7+(i%4)*1.1,y=2.2+Math.floor(i/4)*1.1;mesh(g,new THREE.SphereGeometry(.028,12,8),[x,y+.38,-4.19],brass);}
    chair(g,[.5,0,.55],wood,-.1);openBook(g,[.1,1.19,-.6]);mug(g,[1,1.19,-1.02]);
    for(let i=0;i<4;i++)rod(g,[.7+i*.026,1.19,-.4],[.8+i*.026,1.2,-.13],.006,i%2?'#a77b45':'#526a53');
  }else if(room.id==='music'){
    for(const x of [-2.8,2.8]){
      for(const y of [.5,1.2]){ring(g,.235,.025,[x,y,-2.619],'#252e29');const cone=turned(g,[[.04,-.035],[.09,-.01],[.19,.035],[.22,.04],[.23,.025]],[x,y,-2.59],finish('#41483d',.65));cone.rotation.x=Math.PI/2;house.register(cone,'播放 / 暂停音箱',()=>house.callbacks.onInteract('audio'));const cap=mesh(g,new THREE.SphereGeometry(.073,20,12),[x,y,-2.565],'#252e29');cap.scale.z=.45;house.register(cap,'播放 / 暂停音箱',()=>house.callbacks.onInteract('audio'));}
      for(const dx of [-.3,.3])for(const dz of [-.23,.23])rod(g,[x+dx,.02,-3+dz],[x+dx,.13,-3+dz],.035,brass);
    }
    for(const x of [-.8,.8]){frame(g,1.35,.5,[x,.63,-2.72],wood,.04,.055);block(g,[.22,.028,.045],[x,.77,-2.67],brass);}
    for(const r of [.12,.18,.24,.28])ring(g,r,.0018,[0,1.199,-3.1],'#596055',Math.PI/2);
    rod(g,[.54,1.19,-3.3],[.54,1.31,-3.3],.027,brass);const arm=new THREE.Group();arm.position.set(.54,1.31,-3.3);arm.rotation.y=-.8;g.add(arm);rod(arm,[0,0,0],[-.28,-.06,.32],.013,brass);block(arm,[.06,.045,.085],[-.29,-.08,.34],'#c0b18c');house.tonearm=arm;house.register(arm,'播放 / 暂停唱片',()=>house.callbacks.onInteract('audio'));
  }else if(room.id==='about'){
    mug(g,[-.4,.72,-.42]);mug(g,[.43,.72,-.2]);vase(g,[.18,.72,-.63],.55);
    const book=hardback(g,[-.12,.74,.05],.055,.43,.29,'#73826b');book.rotation.z=-Math.PI/2;
  }
}
