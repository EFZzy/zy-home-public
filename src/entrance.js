import * as THREE from 'three';
import { EYE_HEIGHT } from './navigation.js';
import { createFountain } from './fountain.js';
import { addPottedPlant, addGardenTree, addShrub, addFlowerBedDetails } from './vegetation.js';
import { shapedBox, doorwayWallGeometry, batchStaticMeshes } from './modeling.js';
import { batchDetails } from './interior-details.js';

// 与室内共用木材、墙面色和立体几何；入口是场景中的真实双扇门。
const materialCache=new Map();
function mat(color,roughness=.8,metalness=0){const key=`${color}:${roughness}:${metalness}`;if(!materialCache.has(key))materialCache.set(key,new THREE.MeshStandardMaterial({color,roughness,metalness}));return materialCache.get(key);}
function block(g,size,pos,material){const m=shapedBox(g,size,pos,typeof material==='string'?mat(material):material);m.castShadow=size.every(v=>v>.085);return m;}
// 门板细边也必须挡住另一面的点光；只取消投影接收会让黄铜边从背面受光。
function solidGateLighting(pivot) {
  const planeCenter={value:new THREE.Vector3()},planeNormal={value:new THREE.Vector3()},materials=new Map();
  const lightChunk=THREE.ShaderChunk.lights_fragment_begin.replace(
    'getPointLightInfo( pointLight, geometryPosition, directLight );',
    `getPointLightInfo( pointLight, geometryPosition, directLight );
    {
    vec3 gateCenterView=(viewMatrix*vec4(gatePlaneCenter,1.0)).xyz;
    vec3 gateNormalView=mat3(viewMatrix)*gatePlaneNormal;
    float surfaceSide=dot(geometryPosition-gateCenterView,gateNormalView);
    float emitterSide=dot(pointLight.position-gateCenterView,gateNormalView);
    directLight.color*=smoothstep(0.0,0.15,sign(surfaceSide)*emitterSide);
    }`
  );
  pivot.traverse(mesh=>{
    if(!mesh.isMesh)return;
    mesh.castShadow=false;mesh.receiveShadow=false;
    if(!mesh.material.isMeshStandardMaterial)return;
    if(!materials.has(mesh.material)){
      const material=mesh.material.clone();
      material.onBeforeCompile=shader=>{
        shader.uniforms.gatePlaneCenter=planeCenter;shader.uniforms.gatePlaneNormal=planeNormal;
        shader.fragmentShader='uniform vec3 gatePlaneCenter;\nuniform vec3 gatePlaneNormal;\n'+shader.fragmentShader.replace('#include <lights_fragment_begin>',lightChunk);
      };
      material.customProgramCacheKey=()=> 'solid-gate-lighting-v1';
      materials.set(mesh.material,material);
    }
    mesh.material=materials.get(mesh.material);
    mesh.onBeforeRender=()=>{
      planeCenter.value.setFromMatrixPosition(pivot.matrixWorld);
      planeNormal.value.set(0,0,1).transformDirection(pivot.matrixWorld);
    };
  });
}
function cylinder(g,r1,r2,h,pos,material){const m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,24),typeof material==='string'?mat(material):material);m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;}
function sphere(g,r,pos,material){const m=new THREE.Mesh(new THREE.SphereGeometry(r,24,16),typeof material==='string'?mat(material):material);m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;}
function sign(g,text,pos,width,height,color,font=52){const c=document.createElement('canvas');c.width=1024;c.height=Math.round(1024*height/width);const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`600 ${font}px "Songti SC", "STSong", Georgia, serif`;const fitted=Math.floor(Math.min(c.height*.82,font*c.width*.9/ctx.measureText(text).width));ctx.font=`600 ${fitted}px "Songti SC", "STSong", Georgia, serif`;ctx.fillText(text,c.width/2,c.height/2,c.width*.92);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const m=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false}));m.position.set(...pos);g.add(m);return m;}
function planter(g,x,z,scale=1){
  const plant=addPottedPlant(g,[x,0,z],scale*1.35);
  plant.updateWorldMatrix(true,true);
  const bounds=new THREE.Box3().setFromObject(plant),front=g.localToWorld(new THREE.Vector3(0,0,.4)).z;
  // 叶片也留在外墙外侧，避免叶尖穿墙后在室内留下三角形和投影。
  plant.position.z+=Math.max(0,front-bounds.min.z);
  return plant;
}
function gardenTree(g,x=-5.6,z=2,scale=1){return addGardenTree(g,[x,0,z],scale);}
function gardenBench(parent,x,z,rotation,wood){
  const g=new THREE.Group();g.name='garden-bench';g.position.set(x,0,z);g.rotation.y=rotation;parent.add(g);
  for(const x of [-.85,.85]){for(const z of [-.25,.25])block(g,[.08,.55,.08],[x,.28,z],'#405646');block(g,[.08,.95,.08],[x,.72,.3],'#405646');block(g,[.11,.07,.7],[x,.82,0],'#405646');}
  for(let i=0;i<4;i++)block(g,[2.1,.08,.14],[0,.58,-.25+i*.16],wood);
  for(let i=0;i<3;i++)block(g,[2.1,.14,.07],[0,.85+i*.18,.32],wood);
}
function buildCourtyard(parent,wood,house){
  const g=new THREE.Group();g.name='courtyard';parent.add(g);
  const limestone=mat('#bdb393'),edging=mat('#d2c5a3'),grass=mat('#7d8d62'),soil=mat('#70654c');
  const backdrop=block(g,[58,.16,20],[0,-.17,32],'#a5ae87');backdrop.castShadow=false;
  // 实体草坪、花池与石板各自保持高度差，避免平面叠在一起产生闪烁。
  for(const side of [-1,1]){
    block(g,[8.6,.08,18.5],[side*6.4,-.055,11.5],grass);
    block(g,[.16,.12,19],[side*2.03,.01,10.8],edging);
    block(g,[.22,1.6,24],[side*12.2,.8,12],limestone);block(g,[.33,.1,24.2],[side*12.2,1.65,12],edging);
    for(const z of [5,11,17]){
      const fixture=new THREE.Group();fixture.position.set(side*2.3,0,z);g.add(fixture);
      block(fixture,[.16,.57,.16],[0,.29,0],'#425743');block(fixture,[.25,.06,.25],[0,.6,0],'#b5a16d');const bulb=block(fixture,[.13,.1,.13],[0,.52,0],mat('#e8d5a4',.55));
      house.registerLamp(fixture,bulb,[0,.66,0],{exterior:true,entranceShadow:true,label:'庭院路灯',power:8,range:5.5});
    }
    const bed=new THREE.Group();bed.position.set(side*5.7,0,7.5);g.add(bed);
    block(bed,[4.4,.24,7.8],[0,.1,0],limestone);block(bed,[4.08,.1,7.48],[0,.25,0],soil);
    for(let row=0;row<3;row++)for(let col=0;col<3;col++){
      addShrub(bed,[-1.25+col*1.25,.3,-2.55+row*2.55],[1,.9,1.05]);
    }
    addFlowerBedDetails(bed,Array.from({length:16},(_,i)=>[-1.66+(i%4)*1.1,.3,-3.2+Math.floor(i/4)*2.1]));
    // 椅背位于局部 +Z，两侧座面统一朝向中央小路。
    gardenBench(g,side*6.2,14.5,side<0?-Math.PI/2:Math.PI/2,wood);
    const lantern=new THREE.Group();lantern.position.set(side*8.0,0,14.5);g.add(lantern);
    block(lantern,[.27,.12,.27],[0,.06,0],'#78816a');cylinder(lantern,.035,.055,1.65,[0,.92,0],'#435746');
    block(lantern,[.34,.07,.34],[0,1.82,0],'#9d8c61');block(lantern,[.39,.09,.39],[0,2.21,0],'#736548');
    const shade=block(lantern,[.25,.32,.25],[0,2.02,0],'#e5d5ad');
    house.registerLamp(lantern,shade,[0,2.03,0],{exterior:true,label:'庭院座椅灯',power:22,range:9});
    for(let i=0;i<4;i++)block(g,[.8,.06,.68],[side*(2.65+i*.86),.015,14.5+(i%2)*.08],i%2?'#c8bca0':'#b9ae91');
    for(const z of [4,9,14,19])addShrub(g,[side*10.7,0,z],[1.65,1.85,2.3]);
    gardenTree(g,side*7.7,18.8,1.15);gardenTree(g,side*10.2,8.1,.82);
  }
  block(g,[24.6,1.6,.25],[0,.8,24],limestone);block(g,[24.8,.1,.4],[0,1.65,24],edging);
  // 路尽头的小水景和木廊构成从门内望出去的焦点。
  for(let row=0;row<5;row++)for(let col=0;col<8;col++)block(g,[.87,.07,.9],[-3.15+col*.9,.005,16.65+row*.93],(row+col)%2?'#c8bea2':'#c0b596');
  for(const x of [-3,3])for(const z of [21.8,23.4])block(g,[.17,3.05,.17],[x,1.53,z],wood);
  for(const z of [21.8,23.4])block(g,[6.6,.19,.2],[0,3.08,z],wood);
  for(let i=0;i<11;i++)block(g,[.1,.13,2.3],[-3.05+i*.61,3.24,22.6],wood);
  gardenBench(g,0,23,0,wood);
  const stringLights=new THREE.Group();g.add(stringLights);const bulbs=[];
  const cord=new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({length:25},(_,i)=>new THREE.Vector3(-2.8+i*5.6/24,3.02-.24*Math.sin(i/24*Math.PI),22.5))),new THREE.LineBasicMaterial({color:'#7a7158'}));stringLights.add(cord);
  for(let i=0;i<7;i++){const x=-2.4+i*.8,y=2.98-.24*Math.sin((x+2.8)/5.6*Math.PI);cylinder(stringLights,.018,.018,.08,[x,y-.04,22.5],'#9c8d60');bulbs.push(sphere(stringLights,.065,[x,y-.12,22.5],mat('#eddbaf')));}
  house.registerLamp(stringLights,bulbs,[0,2.65,22.5],{exterior:true,label:'木廊灯串',power:30,range:9});
  for(const x of [-9,-6,6,9])addShrub(g,[x,0,22.2],[2.3,2,1.8]);
  gardenTree(g,.9,26.5,1.6);gardenTree(g,-4.9,25.5,1.18);gardenTree(g,4.9,25.5,1.25);
  const fountain=createFountain(g);const underwater=sphere(fountain.model,.06,[0,.53,.8],mat('#ffdf9d'));house.registerLamp(underwater,underwater,[0,.16,0],{exterior:true,label:'水景灯',power:5,range:4});return fountain;
}
export function buildEntrance(house){
  const g=new THREE.Group();g.position.z=12;house.scene.add(g);house.entrance=g;
  const facade=new THREE.Group();facade.name='entrance-architecture';g.add(facade);
  const cream=mat('#d6d3bd'),stone=mat('#b6af93'),trim=mat('#c6b995'),green=mat('#53644e'),doorWood=house.wood,brass=mat('#b7a16b',.32,.65),panel=mat('#3e5846',.64);
  // 门洞上方与两侧由同一片墙体构成，避免独立倒角块露出竖边和顶面高差。
  const wall=new THREE.Mesh(doorwayWallGeometry(35.8,10,.38,3.8,5.1),cream);
  wall.name='entrance-continuous-wall';wall.receiveShadow=true;facade.add(wall);
  // 阴影渲染按主相机图层筛选，代理保留默认层，但不写入主画面的颜色/深度。
  // 只给局部点光遮挡，太阳仍沿用既有的插画照明，不制造整块门影。
  const occluderMaterial=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:false,side:THREE.DoubleSide});
  const noSunShadow=new THREE.MeshDepthMaterial({colorWrite:false,depthWrite:false});
  const addOccluder=(parent,source,name)=>{
    const blocker=new THREE.Mesh(source.geometry,occluderMaterial);blocker.name=name;
    blocker.position.copy(source.position);blocker.quaternion.copy(source.quaternion);blocker.scale.copy(source.scale);
    blocker.castShadow=true;blocker.userData.lightBlocker=true;blocker.customDepthMaterial=noSunShadow;
    blocker.raycast=()=>{};parent.add(blocker);return blocker;
  };
  const wallBlocker=addOccluder(facade,wall,'entrance-light-blocker');
  wallBlocker.geometry=doorwayWallGeometry(35.8,10,.38,3.46,5.07);
  for(const side of [-1,1]){
    // 护墙及线脚在内外两面都高于墙面；旧后表面同处 z=-.19，回头时会深度冲突。
    block(facade,[16,1.1,.48],[side*9.9,.55,0],green);block(facade,[16,.09,.55],[side*9.9,1.13,0],trim);block(facade,[16,.16,.56],[side*9.9,.08,0],'#767b60');
    // 室内一面沿用走廊护墙的颜色、高度、压顶线和踢脚线，外立面保留原来的装饰。
    block(facade,[16,1.18,.07],[side*9.9,.59,-.275],'#5a6852');
    block(facade,[16,.065,.1],[side*9.9,1.2,-.31],'#9b9273');
    block(facade,[16,.14,.12],[side*9.9,.07,-.31],'#3f4e3d');
    for(let x=2.35;x<17.8;x+=1.35)block(facade,[.035,.84,.025],[side*x,.62,-.3225],'#829079');
    for(const x of [side*2.3,side*7.2]){block(facade,[.3,7.25,.34],[x,3.6,.22],'#c0bfa5');block(facade,[.45,.18,.5],[x,.2,.25],stone);block(facade,[.46,.22,.5],[x,6.7,.25],trim);}
  }
  // 横向分缝跨过门上方连续延伸，门洞范围内保持留空。
  for(let y=1.8;y<9.5;y+=1.1){
    if(y<5.1-1e-6)for(const side of [-1,1])block(facade,[16,.014,.018],[side*9.9,y,.202],'#bab9a1');
    else block(facade,[35.8,.014,.018],[0,y,.202],'#bab9a1');
  }
  const floor=block(facade,[42,.2,28],[0,-.14,10],'#bbb79f');floor.castShadow=false;
  // 门前石板小径。
  for(let row=0;row<14;row++)for(let col=0;col<3;col++)block(facade,[1.17,.045,1.1],[-1.2+col*1.2,.001,.72+row*1.14],row%2?'#c5c1a9':'#c0baa0');
  for(const side of [-1,1])block(facade,[.13,.05,17],[side*1.88,.018,8.5],'#aba68c');
  const threshold=block(facade,[4.15,.11,.75],[0,.045,.25],stone);
  addOccluder(facade,threshold,'threshold-light-blocker');
  for(const side of [-1,1]){block(facade,[.23,5.22,.44],[side*1.89,2.62,.15],trim);block(facade,[.07,5.04,.51],[side*1.77,2.55,.18],'#a99d79');block(facade,[.35,.17,.55],[side*1.9,.14,.18],stone);}
  block(facade,[4.04,.24,.45],[0,5.26,.15],trim);block(facade,[4.35,.16,.66],[0,5.46,.18],'#b0a582');
  // 门楣与字牌。
  block(facade,[4.6,.7,.18],[0,6.16,.25],'#3d5844');block(facade,[4.68,.045,.22],[0,6.54,.26],brass);block(facade,[4.68,.045,.22],[0,5.78,.26],brass);
  sign(facade,'ZY’S LITTLE WORLD',[0,6.3,.352],4.1,.29,'#e1d7b5',54);sign(facade,'栖 间 · 欢 迎 来 坐 坐',[0,5.99,.352],3.6,.25,'#c9c39e',40);
  block(facade,[5.4,.18,1.2],[0,6.98,.25],'#aaa58a');block(facade,[5.55,.10,1.35],[0,7.12,.22],'#c7c3a8');
  house.gateLeaves=[];
  for(const side of [-1,1]){
    const pivot=new THREE.Group();pivot.position.set(side*1.73,0,.1);pivot.userData.action=()=>house.openEntrance();g.add(pivot);const x=-side*.865;
    const leaf=block(pivot,[1.73,5.04,.18],[x,2.55,0],doorWood);house.addInteraction(leaf,()=>house.openEntrance());
    // 遮光只覆盖门洞中尚未打开的宽度，不让旋转门扇在同侧灯下投出交叉硬影。
    // 代理固定在墙面内，关闭时仍完整封住门洞，避免室外灯穿进室内。
    const blocker=addOccluder(g,leaf,'gate-light-blocker');
    blocker.position.z=.1;
    // 上下凹面和实体装饰线随门扇一起转动。
    for(const [y,h]of [[1.0,1.25],[3.2,2.5]]){
      block(pivot,[1.38,h,.035],[x,y,.105],panel);
      for(const xx of [x-.72,x+.72]){block(pivot,[.08,h+.18,.09],[xx,y,.15],doorWood);block(pivot,[.026,h+.05,.015],[xx-Math.sign(xx-x)*.052,y,.2],brass);}
      for(const yy of [y-h/2-.04,y+h/2+.04])block(pivot,[1.5,.08,.09],[x,yy,.15],doorWood);
      block(pivot,[1.2,h-.16,.018],[x,y,.14],green);
    }
    for(const yy of [.65,2.55,4.5]){block(pivot,[.14,.22,.2],[0,yy,.025],brass);}
    block(pivot,[1.12,.78,.045],[x,3.63,.185],panel);
    block(pivot,[1.04,.7,.04],[x,3.63,.225],brass);
    if(side===-1){
      sign(pivot,'栖间',[x,3.72,.25],.85,.37,'#253e2c',130);
      sign(pivot,'ZY’S HOME',[x,3.4,.25],.83,.13,'#3e4f35',80);
    }else{
      block(pivot,[.96,.62,.018],[x,3.63,.253],mat('#294735'));
      sign(pivot,'WELCOME',[x,3.77,.269],.89,.22,'#f0e3bc',115);
      sign(pivot,'欢迎来坐坐',[x,3.48,.269],.85,.18,'#e8d9ad',100);
    }
    // 内侧同样采用有厚度的凹面门板、榫框与黄铜五金，随原门轴一起开合。
    const inner=new THREE.Group();inner.name='gate-inner-face';inner.rotation.y=Math.PI;pivot.add(inner);
    const ix=-x,insideWood=house.interiorWood;
    block(inner,[1.7,5.0,.035],[ix,2.55,.11],insideWood);
    for(const [y,h]of [[1.0,1.25],[3.2,2.5]]){
      block(inner,[1.37,h,.035],[ix,y,.145],panel);
      block(inner,[1.19,h-.18,.025],[ix,y,.175],green);
      for(const dx of [-.73,.73]){
        block(inner,[.10,h+.22,.11],[ix+dx,y,.19],insideWood);
        block(inner,[.025,h+.08,.022],[ix+dx-Math.sign(dx)*.065,y,.247],brass);
      }
      for(const dy of [-h/2-.045,h/2+.045])block(inner,[1.54,.10,.11],[ix,y+dy,.19],insideWood);
      for(const dy of [-h/2+.035,h/2-.035])block(inner,[1.36,.022,.025],[ix,y+dy,.235],brass);
    }
    block(inner,[1.43,.16,.035],[ix,.21,.165],brass);
    block(inner,[.82,.37,.045],[ix,3.55,.21],brass);
    sign(inner,side===-1?'庭 院':'慢 慢 来',[ix,3.55,.237],.7,.22,'#334a37',80);
    // 门板保留随朝向变化的明暗，但不接收门洞遮光代理的硬阴影。
    // 否则开门中段代理会把不属于门板的明暗条纹投到凹面上。
    batchDetails(pivot);solidGateLighting(pivot);
    house.register(pivot,'推开大门',()=>house.openEntrance());house.gateLeaves.push({pivot,side,blocker});
  }
  for(const side of [-1,1]){
    // 窗玻璃为不透明的柔和颜色，开门前不会透出室内。
    const wx=side*4.85;block(facade,[2.4,2.95,.24],[wx,3.38,.27],green);house.lighting.window(block(facade,[2.15,2.7,.14],[wx,3.38,.43],mat('#a9b9a0',.3,.12)),'#dcae66');for(const dx of [-1.1,0,1.1])block(facade,[.065,2.75,.18],[wx+dx,3.38,.54],trim);for(const yy of [2.02,3.36,4.75])block(facade,[2.3,.07,.18],[wx,yy,.54],trim);block(facade,[2.72,.13,.65],[wx,1.92,.38],stone);
    const lantern=new THREE.Group();lantern.position.set(side*2.8,3.6,.38);facade.add(lantern);
    block(lantern,[.2,.58,.12],[0,0,0],brass);block(lantern,[.38,.1,.42],[0,.31,.14],brass);block(lantern,[.38,.1,.42],[0,-.31,.14],brass);const bulb=block(lantern,[.27,.51,.27],[0,0,.17],mat('#ece0b6',.55));
    house.registerLamp(lantern,bulb,[0,0,.52],{exterior:true,entranceShadow:true,label:'门廊壁灯',power:35,range:8});planter(g,side*2.85,1.3,1.3);
  }
  // 内侧门套和门厅壁灯，补足回头看大门时的照明与结构层次。
  for(const side of [-1,1]){
    block(facade,[.22,5.18,.15],[side*1.88,2.59,-.29],trim);
    block(facade,[.075,5.06,.18],[side*1.75,2.55,-.30],stone);
    block(facade,[.32,.20,.23],[side*1.88,.13,-.31],stone);
    const lantern=new THREE.Group();lantern.name='inner-entrance-lantern';lantern.position.set(side*2.7,3.15,-.39);lantern.rotation.y=Math.PI;facade.add(lantern);
    block(lantern,[.2,.58,.10],[0,0,0],brass);
    for(const y of [-.3,.3])block(lantern,[.38,.08,.40],[0,y,.15],brass);
    const bulb=block(lantern,[.26,.49,.24],[0,0,.16],mat('#e5d4ae'));
    house.registerLamp(lantern,bulb,[0,0,.43],{entranceShadow:true,label:'门厅壁灯',power:18,range:7});
  }
  block(facade,[4.04,.18,.18],[0,5.14,-.29],trim);
  // 与不遮断主光的室内顶面一致，入口建筑不把整片硬阴影压到走廊。
  // 植物和庭院小物独立投影，大门在门洞内遮光；昼夜平滑改变光色与强度。
  facade.traverse(object=>{if(object.isMesh&&!object.userData.lightBlocker)object.castShadow=false;});
  batchStaticMeshes(facade);
  gardenTree(g);planter(g,5.4,1.0,1.7);house.fountain=buildCourtyard(g,doorWood,house);
  house.camera.position.set(0,EYE_HEIGHT,24);house.target.copy(house.camera.position);
}
