import * as THREE from 'three';
import { Lighting, Motions } from './experience.js';
import { ShadowCache } from './shadow-cache.js';
import { optimizePointLighting } from './point-light-shader.js';
import { renderPixelRatio } from './render-quality.js';
import { overlaps } from './overlay-layout.js';
import { rooms, books } from './content.js';
import { buildEntrance } from './entrance.js';
import { buildRoomDoor } from './room-doors.js';
import { addPottedPlant } from './vegetation.js';
import { shapedBox, doorwayWallGeometry, batchStaticMeshes } from './modeling.js';
import { bankerLamp, hardback, openBook, mug, coffeeTable, chair as detailedChair, sofa as detailedSofa, architectureDetails, windowDetails, wallSconce, roomProps, frame, batchDetails } from './interior-details.js';
import { EYE_HEIGHT, WALK_SPEED, angleDelta, turnToward, heading, roomAt, roomRoute, returnRoute, exitRoomPoints, createWalk, advanceWalk, constrainPosition, seatPlacement, nearEntrance } from './navigation.js';

const V = (x,y,z) => new THREE.Vector3(x,y,z);
const clamp = THREE.MathUtils.clamp;
const smooth = t => t*t*(3-2*t);
const easeMotion=smooth;
const boxGeometry = new THREE.BoxGeometry(1,1,1);
const materialCache = new Map();
const ceilingPlaster=new THREE.MeshStandardMaterial({color:'#dedac7',roughness:.95,emissive:'#c6bfa5',emissiveIntensity:.65});
const ceilingInset=new THREE.MeshStandardMaterial({color:'#e8e0cc',roughness:.95,emissive:'#cec4a7',emissiveIntensity:.7});
function material(color, roughness=.8, metalness=0) {
  const key = `${color}-${roughness}-${metalness}`;
  if (!materialCache.has(key)) materialCache.set(key,new THREE.MeshStandardMaterial({color,roughness,metalness}));
  return materialCache.get(key);
}
function box(parent, size, pos, color, shadow=true) {
  const mesh=shapedBox(parent,size,pos,typeof color==='string'?material(color):color);
  mesh.castShadow=shadow;return mesh;
}
function cylinder(parent,r1,r2,height,pos,color,segments=24) {
  const m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,height,segments),typeof color==='string'?material(color):color);
  m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}
function sphere(parent,r,pos,color) {
  const m=new THREE.Mesh(new THREE.SphereGeometry(r,20,12),typeof color==='string'?material(color):color);m.position.set(...pos);parent.add(m);return m;
}
function canvasTexture(draw,w=512,h=512) {
  const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
function woodTexture() {
  return canvasTexture((c,w,h)=>{c.fillStyle='#8a7455';c.fillRect(0,0,w,h);let seed=17;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};for(let i=0;i<800;i++){c.strokeStyle=`rgba(${rnd()>.5?'48,31,19':'220,200,155'},${rnd()*.13})`;c.lineWidth=rnd()*2+.3;c.beginPath();const y=rnd()*h;c.moveTo(0,y);c.bezierCurveTo(w*.3,y+rnd()*8,w*.7,y-rnd()*8,w,y+rnd()*3);c.stroke();}});
}
function artTexture(index=0) {
  const palettes=[['#d9cfb4','#4d6250','#b1854d','#818f76'],['#dbd3bf','#ad7957','#3b5552','#c3af88'],['#c8d0cb','#566d75','#b29f73','#ece5d3']];
  const p=palettes[index%3];return canvasTexture((c,w,h)=>{c.fillStyle=p[0];c.fillRect(0,0,w,h);c.fillStyle=p[2];c.beginPath();c.arc(w*.68,h*.32,w*.18,0,Math.PI*2);c.fill();c.fillStyle=p[3];c.beginPath();c.moveTo(0,h*.72);c.bezierCurveTo(w*.3,h*.35,w*.55,h*.7,w,h*.5);c.lineTo(w,h);c.lineTo(0,h);c.fill();c.fillStyle=p[1];c.beginPath();c.moveTo(0,h*.86);c.bezierCurveTo(w*.35,h*.46,w*.6,h*.95,w,h*.68);c.lineTo(w,h);c.lineTo(0,h);c.fill();c.strokeStyle=p[0];c.lineWidth=2;for(let i=0;i<5;i++){c.beginPath();c.arc(w*.3,h*.68,40+i*14,Math.PI,Math.PI*2);c.stroke();}for(let i=0;i<12000;i++){c.fillStyle=`rgba(45,40,30,${(i%4)*.009})`;c.fillRect((i*37)%w,(i*73)%h,1,1);}});
}
function label(parent,text,pos,{width=2,height=.45,color='#ded4b4',background=null,font=36}={}) {
  const texture=canvasTexture((c,w,h)=>{if(background){c.fillStyle=background;c.fillRect(0,0,w,h);}c.fillStyle=color;c.textAlign='center';c.textBaseline='middle';c.font=`${font}px "Songti SC", "STSong", serif`;const fit=Math.min(h*.72,font*(w-25)/Math.max(1,c.measureText(text).width));c.font=`${fit}px "Songti SC", "STSong", serif`;c.fillText(text,w/2,h/2,w-25);},512,Math.round(512*height/width));
  const m=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));m.position.set(...pos);parent.add(m);return m;
}
function art(parent,x,y,z,w,h,index=0) {
  const group=new THREE.Group();group.name='framed-artwork';group.position.set(x,y,z);parent.add(group);
  box(group,[w+.14,h+.14,.09],[0,0,0],'#766347');box(group,[w+.04,h+.04,.10],[0,0,.018],'#c6b78e');
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:artTexture(index),roughness:1}));mesh.position.z=.075;group.add(mesh);return group;
}
function shadow(parent,x,z,sx,sz,opacity=.25) {
  const t=canvasTexture((c,w,h)=>{const g=c.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,`rgba(22,30,16,${opacity})`);g.addColorStop(.45,`rgba(22,30,16,${opacity*.6})`);g.addColorStop(1,'rgba(22,30,16,0)');c.fillStyle=g;c.fillRect(0,0,w,h);},128,128);
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(sx,sz),new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false}));mesh.rotation.x=-Math.PI/2;mesh.position.set(x,.014,z);parent.add(mesh);
}
function rug(parent,x,z,w,d,color='#61735b') {
  box(parent,[w,.025,d],[x,.025,z],color,false);
  for(const pad of [.08,.15]){
    for(const side of [-1,1]){box(parent,[w-pad*2,.003,.018],[x,.04,z+side*(d/2-pad)],'#b3ac86',false);box(parent,[.018,.003,d-pad*2],[x+side*(w/2-pad),.04,z],'#b3ac86',false);}
  }
}
function plant(parent,pos,scale=1) {
  const g=addPottedPlant(parent,pos,scale);
  shadow(g,0,0,1.8,1.8,.3);return g;
}
function floor(parent,w,d) {
  box(parent,[w,.2,d],[0,-.12,0],'#71614a',false);
  const count=Math.ceil(w/.44)*Math.ceil(d/2.15);const mesh=new THREE.InstancedMesh(boxGeometry,material('#978260'),count);let i=0;const matrix=new THREE.Matrix4(),q=new THREE.Quaternion();
  for(let x=-w/2+.22;x<w/2;x+=.44){let row=Math.round((x+w/2)/.44);for(let z=-d/2+1.075;z<d/2;z+=2.15){matrix.compose(V(x,-.005,z),q,V(.425,.025,2.13));mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,new THREE.Color().setHSL(.105,.17,.42+((i*17)%11)*.012));i++;}}
  mesh.count=i;mesh.receiveShadow=true;parent.add(mesh);
}
function lamp(parent,pos,scale=1) {return bankerLamp(parent,pos,scale);}

export class House {
  constructor(canvas,{onRoom,onInteract,onExplore,onReady,onEnter,onTravel,onFeedback,lightingMode}) {
    optimizePointLighting();
    this.callbacks={onRoom,onInteract,onExplore,onReady,onEnter,onTravel,onFeedback};
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;this.motions=new Motions(this.reduced);this.interactions=[];this.activation=0;this.hovered=null;this.seat=null;this.seatMotion=null;this.afterStand=null;
    this.hasEntered=false;this.entering=null;this.gateOpen=false;this.gateClearTime=0;this.canvas=canvas;this.current=null;this.transition=null;
    this.target=V(0,EYE_HEIGHT,8.5);this.yaw=0;this.viewYaw=0;this.pitch=.06;this.viewPitch=.06;
    this.drag=null;this.keys=new Set();this.hotspots=[];this.doors=[];this.roomGroups=new Map();
    this.hoverPointer=matchMedia('(any-hover: hover)');this.pointerActive=false;
    this.pendulums=[];this.pointer=new THREE.Vector2(2,2);this.raycaster=new THREE.Raycaster();this.isExploring=false;this.frame=0;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#dedbca');this.scene.fog=new THREE.Fog('#e1dece',70,140);
    this.camera=new THREE.PerspectiveCamera(52,1,.05,100);this.camera.position.copy(this.target);
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;
    this.hemisphere=new THREE.HemisphereLight('#fff4dc','#74785c',2.5);this.scene.add(this.hemisphere);
    // 门廊与所有室内共用同一盏固定太阳，照明和阴影不随相机位置变化。
    const sun=new THREE.DirectionalLight('#fff0cb',3.3);this.sun=sun;
    sun.position.set(-20,48,76);sun.target.position.set(0,0,-4);sun.castShadow=true;
    const shadowSize=innerWidth<650?2048:4096;sun.shadow.mapSize.set(shadowSize,shadowSize);
    Object.assign(sun.shadow.camera,{left:-34,right:34,top:36,bottom:-36,near:1,far:160});
    sun.shadow.camera.updateProjectionMatrix();sun.shadow.bias=-.0001;sun.shadow.normalBias=.04;
    this.scene.add(sun,sun.target);
    this.wood=new THREE.MeshStandardMaterial({color:'#8e7351',map:woodTexture(),roughness:.65});
    this.interiorWood=new THREE.MeshStandardMaterial({color:'#d4bf9c',map:this.wood.map,roughness:.48});
    this.lighting=new Lighting(this,lightingMode);this.lighting.ceiling(ceilingPlaster);this.lighting.ceiling(ceilingInset);
    this.buildCorridor();rooms.forEach(room=>this.buildRoom(room));buildEntrance(this);this.registerObjects();this.resize();this.bind();this.lighting.update(0,true);
    this.overlayRegions=[...document.querySelectorAll('.header,.footer,#intro,#room-caption,#back,#room-actions,#movement,.scene-label,#hint,#toast')];
    this.overlayRects=new Map();this.hotspotSizes=new Map();
    // 缓存布局尺寸，避免在每一帧交错读取布局和更新定位。
    this.overlayObserver=new ResizeObserver(entries=>{
      for(const entry of entries){
        const rect=entry.target.getBoundingClientRect();
        if(this.overlayRegions.includes(entry.target))this.overlayRects.set(entry.target,rect);
        else if(rect.width&&rect.height)this.hotspotSizes.set(entry.target,{width:rect.width,height:rect.height});
      }
    });
    [...this.overlayRegions,...this.hotspots.map(h=>h.el)].forEach(el=>this.overlayObserver.observe(el));
    this.shadowCache=new ShadowCache(this.scene,this.sun,this.lighting.fixtures.filter(f=>f.light.castShadow).map(f=>f.light));
    // ShadowCache 已在渲染前更新场景矩阵，避免 renderer 再遍历一次全部模型。
    this.scene.matrixWorldAutoUpdate=false;
    // 先提交完整的第一帧，再允许页面撤掉加载遮罩。
    this.updateCameraView();this.renderer.render(this.scene,this.camera);
    this.last=performance.now();this.renderer.setAnimationLoop(this.tick.bind(this));requestAnimationFrame(()=>onReady());
  }
  addInteraction(mesh,action,label='查看物件') {mesh.userData.action=action;mesh.userData.label=label;return mesh;}
  register(object,label,action) {
    object.userData.action=action;object.userData.label=label;
    if(!this.interactions.includes(object))this.interactions.push(object);
    return object;
  }
  feedback(message){this.callbacks.onFeedback?.(message);}
  activate(object){
    if(!object||this.transition||this.entering||this.seatMotion)return;
    if(this.current)this.explore();
    this.activation++;this.motions.items.delete('open-content');object.userData.action?.();
  }
  reveal(object,action,id){
    const token=++this.activation;
    if(object){
      if(object.userData.turningPage){const page=object.userData.turningPage;page.visible=true;this.motions.animate(page,.65,t=>{page.rotation.z=Math.PI*smooth(t);if(t===1)page.visible=false;});}
      else if(object.name==='hardback-book')this.motions.pull(object,V(0,.025,.24));
      else if(object.name==='framed-artwork')this.motions.sway(object);
      else this.motions.lift(object,.12);
    }
    this.motions.animate('open-content',.38,()=>{},()=>{if(token===this.activation&&!this.transition)this.callbacks.onInteract(action,id);});
  }
  availableObjects(){
    this.scene.updateMatrixWorld(true);
    return this.interactions.filter(o=>this.isVisible(o)&&(o.userData.anchor??o).getWorldPosition(new THREE.Vector3()).distanceTo(this.camera.position)<14);
  }
  pick(){
    this.raycaster.setFromCamera(this.pointer,this.camera);
    const hit=this.raycaster.intersectObjects(this.scene.children.filter(o=>o.visible),true).find(h=>this.isVisible(h.object)&&h.object.type!=='Points');
    let object=hit?.object;while(object&&!object.userData.action)object=object.parent;
    return object??null;
  }
  registerLamp(group,bulbs,position,options){
    const fixture=this.lighting.add(group,bulbs,position,options);group.userData.anchor=fixture.emitter;
    this.register(group,options.label,()=>{const on=this.lighting.toggle(fixture);this.feedback(`${options.label}已${on?'点亮':'关闭'}`);});
    return fixture;
  }
  registerObjects(){
    // 灯、家具、绿植都有模型级命中目标，墙地面仍负责遮挡，不能隔墙点击。
    const objects=[];this.scene.traverse(o=>objects.push(o));
    for(const o of objects){
      const n=o.name;
      if(n==='banker-lamp'){
        const {light,bulb}=o.userData.lamp;light.removeFromParent();
        const f=this.registerLamp(o,bulb,[0,.64,.04],{label:'台灯',power:5,range:3.6});
        if(o===this.studyLamp?.group)this.studyLamp.fixture=f;
      }else if(n==='wall-sconce'){
        // 相邻壁灯柔和衔接；入口一对收在门内，避免扩大照明后穿过外墙。
        this.registerLamp(o,[o.userData.bulb,o.userData.shade],[0,.12,.4],{label:'走廊壁灯',power:14,range:o.position.z>0?10:14,decay:1.3});
      }else if(n==='branched-garden-tree'){
        const limbs=o.children.filter(c=>c.name==='tree-branch-sway');
        this.register(o,'轻拂树叶',()=>{limbs.forEach(limb=>this.motions.sway(limb));this.feedback('树枝和叶片轻轻摇动');});
      }else if(['detailed-potted-plant','leafy-shrub','flower-bed-details'].includes(n)){
        // 茎、枝和叶共用根部支点，盆、土和花池保持原位。
        const foliage=new THREE.Group();foliage.name='plant-sway-pivot';
        foliage.position.y=n==='detailed-potted-plant'?.47:0;
        const parts=o.children.filter(c=>/leaves|petals|flower-centers|plant-branches/.test(c.name));
        o.add(foliage);
        for(const part of parts){o.remove(part);part.position.y-=foliage.position.y;foliage.add(part);}
        this.register(o,n==='flower-bed-details'?'轻触花丛':'轻拂绿植',()=>{this.motions.sway(foliage);this.feedback('枝叶轻轻摇动');});
      }else if(n==='upholstered-chair'){
        this.register(o,'坐在椅子上',()=>this.sit(o));
      }else if(n==='tailored-sofa'||n==='garden-bench'){
        this.register(o,n==='garden-bench'?'在长椅坐一会儿':'坐在沙发上',()=>this.sit(o));
      }else if(n==='ceramic-mug'){
        this.register(o,'拿起茶杯',()=>{this.motions.lift(o,.24);this.feedback('拿起茶杯，慢慢放回');});
      }else if(n==='flower-vase'){
        this.register(o,'轻触瓶中枝叶',()=>{this.motions.sway(o);this.feedback('枝叶微微晃动');});
      }else if(n==='window-curtains'){
        const curtainAction=()=>{
          o.userData.closed=!o.userData.closed;const closed=o.userData.closed;
          for(const cloth of o.children){const from=cloth.scale.x,to=closed?3.6:1;const x=cloth.position.x,tx=closed?cloth.userData.side*.72:cloth.userData.openX;
            this.motions.animate(cloth,.9,t=>{cloth.scale.x=THREE.MathUtils.lerp(from,to,easeMotion(t));cloth.position.x=THREE.MathUtils.lerp(x,tx,easeMotion(t));});}
          this.feedback(closed?'窗帘已合上':'窗帘已收起');
        };this.register(o,'收放窗帘',curtainAction);this.addInteraction(o.parent,curtainAction,'收放窗帘');
      }else if(n==='framed-artwork'&&!o.userData.action){this.register(o,'欣赏装饰画',()=>this.reveal(o,'gallery'));
      }else if(n==='hardback-book'&&!o.userData.action){this.register(o,'抽出一本书',()=>this.reveal(o,'shelf'));}
      else if(n==='curved-open-book'&&!o.userData.action)this.register(o,'翻阅手记',()=>this.reveal(o,'journal'));
      if(o.userData.action&&!this.interactions.includes(o)){
        let parent=o.parent;while(parent&&!parent.userData.action)parent=parent.parent;
        if(!parent)this.interactions.push(o);else o.userData.label??=parent.userData.label;
      }
    }
    this.fountain.running=true;this.fountain.flow=1;this.fountain.clock=0;
    this.register(this.fountain.model,'开启 / 关闭喷泉',()=>{this.fountain.running=!this.fountain.running;this.feedback(this.fountain.running?'喷泉缓缓涌起':'喷泉正在停水');});
    this.lighting.surfaces.push(n=>this.fountain.setNight(n));
  }
  sit(object){
    if(this.seat){this.stand();return;}
    if(this.seatMotion)return;
    if(!this.hasEntered){this.feedback('先推开大门开始漫游，再到庭院休息');return;}
    const room=this.current?rooms.find(r=>r.id===this.current):null;
    const g=room?this.roomGroups.get(room.id):null;
    const from=g?.worldToLocal(this.camera.position.clone());
    const side=(from?.x??0)-(object.name==='upholstered-chair'?object.position.x:0)<0?-1:1;
    const placement=seatPlacement(object,side);
    let points;
    if(room&&object.name==='upholstered-chair'){
      points=[this.camera.position.clone(),placement.approach];
    }else if(room){
      points=[this.camera.position.clone(),this.worldPoint(room,side*2.5,EYE_HEIGHT,from.z),this.worldPoint(room,side*2.5,EYE_HEIGHT,.3),placement.approach];
    }else{
      const approach=placement.approach;points=[this.camera.position.clone()];
      if(approach.z>32)points.push(V(0,EYE_HEIGHT,27.8),V(1.8,EYE_HEIGHT,29),V(1.8,EYE_HEIGHT,33.4),approach);
      else points.push(V(0,EYE_HEIGHT,this.camera.position.z),V(0,EYE_HEIGHT,approach.z),approach);
    }
    const direction=object.getWorldDirection(new THREE.Vector3()).negate();
    this.beginWalk(points,room,heading(direction));this.pendingSeat=placement;
  }
  stand(){
    this.pendingSeat=null;
    if(!this.seat)return;
    this.seatMotion={from:this.camera.position.clone(),to:this.seat.approach.clone(),elapsed:0,duration:.95};
    this.seat=null;
  }
  addHotspot(labelText,en,position,action,room=null) {
    const el=document.createElement('button');el.className=`hotspot ${room?'object-marker':'door-marker'}`;el.setAttribute('aria-label',labelText);el.innerHTML=`<span class="hotspot-dot">+</span><span class="hotspot-label"><strong>${labelText}</strong><small>${en}</small></span>`;el.addEventListener('click',()=>{if(!this.transition)action();});document.querySelector('#hotspots').append(el);this.hotspots.push({el,position,room});
  }
  buildCorridor() {
    const hall=new THREE.Group();this.hall=hall;hall.name='corridor';this.scene.add(hall);const f=new THREE.Group();f.position.z=-13.8;hall.add(f);floor(f,7.5,51.6);
    rug(hall,0,-14,2.15,46,'#7a7961');for(const x of [-.93,.93])box(hall,[.012,.004,45.5],[x,.045,-14],'#c5b58a',false);
    const cream='#d6d3bd',green='#5a6852',trim='#9b9273';
    // 连续的实体顶面，底面高 5.2 米，给 5.07 米高的大门留出开合空间。
    // 顶面不遮断插画场景的主光，进出时仍保持原来的固定照明。
    // 端头藏在入口墙厚中（z=11.81–12.19），不穿出外立面露出白条。
    this.corridorCeiling=box(hall,[7.5,.18,50.7],[0,5.29,-13.35],ceilingPlaster,false);
    this.corridorCeiling.name='corridor-ceiling';
    for(const side of [-1,1]){
      box(hall,[.23,.4,50.5],[side*3.6,5,-13.25],cream,false);
      box(hall,[.3,.12,50.5],[side*3.46,5.1,-13.25],'#c4bea2',false);
      box(hall,[.42,.06,50.5],[side*3.4,5.18,-13.25],'#e2d9bd',false);
    }
    box(hall,[7.4,.4,.2],[0,5,-38.6],'#c7cab5',false);
    // 浅色顶板和直线边框沿走廊连续延伸。
    for(const [z,length]of [[7,8.5],[-4,10],[-16,10],[-28,10],[-36.3,3.6]]){
      box(hall,[5.2,.035,length],[0,5.16,z],ceilingInset,false);
      for(const side of [-1,1]){
        box(hall,[.045,.055,length+.08],[side*2.63,5.135,z],'#bcb79c',false);
        box(hall,[5.3,.055,.045],[0,5.135,z+side*(length/2+.02)],'#bcb79c',false);
      }
    }
    // 双侧墙体按门洞分段，房间与走廊在同一三维坐标中相连。
    for(const side of [-1,1]) {
      const spans=[[12,-3.7],[-6.3,-15.7],[-18.3,-27.7],[-30.3,-38.5]];
      for(const [a,b] of spans){const mid=(a+b)/2,len=Math.abs(a-b);box(hall,[.22,4.8,len],[side*3.6,2.4,mid],cream);box(hall,[.24,1.18,len],[side*3.56,.59,mid],green);box(hall,[.28,.065,len],[side*3.53,1.2,mid],trim);box(hall,[.28,.14,len],[side*3.52,.07,mid],'#3f4e3d');
        for(let z=Math.min(a,b)+.6;z<Math.max(a,b);z+=1.35){box(hall,[.015,.84,.035],[side*3.425,.62,z],'#829079',false);}
      }
      for(const z of [-5,-17,-29])box(hall,[.23,1.5,2.6],[side*3.6,4.05,z],cream);
      for(const z of [1,-11,-23,-35]) {
        box(hall,[.36,4.5,.34],[side*3.42,2.25,z],'#c6c5ad');box(hall,[.46,.18,.48],[side*3.42,.15,z],'#aaa98e');box(hall,[.52,.18,.5],[side*3.42,3.8,z],'#c8c5aa');
        const s=new THREE.Group();s.position.set(side*3.28,2.65,z+.2);s.rotation.y=side===-1?Math.PI/2:-Math.PI/2;hall.add(s);wallSconce(s);
      }
    }
    for(const x of [-2.9,2.9])box(hall,[.08,.1,50.5],[x,5.15,-13.25],'#c6c1a3',false);
    // 远端的花窗与天光。
    box(hall,[7.4,4.8,.2],[0,2.4,-38.6],'#c7cab5');box(hall,[3.2,3.6,.24],[0,2.5,-38.4],'#52664e');
    this.lighting.window(box(hall,[2.9,3.35,.1],[0,2.5,-38.24],new THREE.MeshBasicMaterial({color:'#e7eccc'})));
    for(const x of [-1.42,0,1.42])box(hall,[.075,3.35,.1],[x,2.5,-38.13],'#a1a486');for(const y of [1,2.5,4])box(hall,[2.9,.08,.1],[0,y,-38.13],'#a1a486');
    plant(hall,[-2.75,0,-36.8],1.6);plant(hall,[2.75,0,1.5],1.3);
    for(const room of rooms) {
      const frame=new THREE.Group();frame.position.set(room.side*3.48,0,room.z);frame.rotation.y=room.side<0?Math.PI/2:-Math.PI/2;hall.add(frame);
      // 门套贯穿两层墙的门洞端面；正面位置不变，背面包住墙体接缝。
      // 立柱与横梁相接，装饰条只贴正面，避免共面闪烁。
      for(const x of [-1.24,1.24]){box(frame,[.18,3.3,.5],[x,1.65,-.135],'#b6ab87');box(frame,[.045,3.3,.04],[x-Math.sign(x)*.05,1.65,.135],'#d1c49a');}
      box(frame,[2.66,.2,.5],[0,3.4,-.135],'#b9ac85');box(frame,[2.8,.1,.32],[0,3.54,0],'#c8bc97');box(frame,[2.3,.035,.45],[0,.025,0],'#ac9c77');
      for(const x of [-1.24,1.24]){box(frame,[.25,.25,.58],[x,.135,-.11],'#c8bc9b');box(frame,[.24,.14,.57],[x,3.32,-.11],'#c8bc9b');}
      const pivot=buildRoomDoor(frame,room,()=>this.enter(room.id));
      box(frame,[1.38,.42,.06],[0,3.95,.01],'#344e3c');label(frame,`${room.number}  ${room.name}`,[0,3.95,.05],{width:1.24,height:.31,font:42,color:'#e4d9b8'});
      this.register(pivot,`进入${room.name}`,()=>this.enter(room.id));this.doors.push({id:room.id,pivot,open:0});
      this.addHotspot(room.name,room.en,V(room.side*3.18,1.7,room.z+.12),()=>this.enter(room.id));
      batchStaticMeshes(frame);
    }
    batchStaticMeshes(hall);
  }
  buildRoom(room) {
    const g=new THREE.Group();g.position.set(room.side*8,0,room.z);g.rotation.y=room.side<0?Math.PI/2:-Math.PI/2;this.scene.add(g);this.roomGroups.set(room.id,g);g.userData.roomId=room.id;
    floor(g,9,9);const wall=room.id==='study'?'#c5c5a8':'#d7d1b9';
    const ceiling=box(g,[8.96,.16,8.96],[0,4.68,0],ceilingPlaster,false);ceiling.name=`${room.id}-ceiling`;
    box(g,[9,4.6,.16],[0,2.3,-4.5],wall);for(const x of [-4.5,4.5]){box(g,[.16,4.6,9],[x,2.3,0],wall);box(g,[.2,1.08,9],[x, .54,0],room.color);box(g,[.23,.065,9],[x,1.1,0],'#a69871');}
    // 门口墙体留在走廊墙的室内一侧，护墙板覆盖朝向房间的墙面。
    // 否则房间显现时，白墙会伸到走廊绿色护墙前方，把绿色区域盖白。
    const entryWall=new THREE.Mesh(doorwayWallGeometry(9,4.6,.16,2.6,3.3),material(wall));
    entryWall.name=`${room.id}-entry-wall`;entryWall.position.z=4.35;entryWall.castShadow=true;entryWall.receiveShadow=true;g.add(entryWall);
    for(const x of [-2.9,2.9])box(g,[3.2,1.1,.18],[x,.55,4.24],room.color);
    box(g,[9,1.1,.2],[0,.55,-4.4],room.color);box(g,[9,.07,.22],[0,1.12,-4.38],'#a69871');
    for(const y of [.1,4.35]) {box(g,[9,.14,.18],[0,y,-4.32],'#b3ad8a');for(const x of [-4.35,4.35])box(g,[.18,.14,9],[x,y,0],'#b3ad8a');}
    rug(g,0,.05,5.5,5.4,room.id==='study'?'#6c7557':room.color);
    // 自制窗框与柔和窗景，无外部贴图请求。
    const windowGroup=new THREE.Group();windowGroup.position.set(4.39,2.75,-.8);windowGroup.rotation.y=-Math.PI/2;g.add(windowGroup);
    box(windowGroup,[3,2.8,.1],[0,0,0],'#7b8065');this.lighting.window(box(windowGroup,[2.8,2.6,.11],[0,0,.06],new THREE.MeshBasicMaterial({color:'#dde3be'})));
    for(let i=0;i<5;i++){const tree=sphere(windowGroup,.55,[Math.sin(i*3)*.9,Math.cos(i*2)*.7,-.08],'#99aa80');tree.scale.set(.5,2,.2);}
    for(const x of [-1.4,0,1.4])box(windowGroup,[.065,2.65,.15],[x,0,.2],'#969b79');for(const y of [-1.3,0,1.3])box(windowGroup,[2.85,.065,.15],[0,y,.2],'#969b79');box(windowGroup,[3.2,.1,.4],[0,-1.4,.18],'#b1ac86');
    windowDetails(windowGroup);architectureDetails(g,room);
    const pendant=new THREE.Group();pendant.position.set(0,4.05,0);g.add(pendant);
    cylinder(pendant,.025,.025,.45,[0,.25,0],'#927e50',12);
    cylinder(pendant,.27,.5,.27,[0,-.04,0],'#b9a576');
    const diffuser=sphere(pendant,.22,[0,-.17,0],'#e8d9b4');
    this.registerLamp(pendant,diffuser,[0,-.4,0],{label:`${room.name}顶灯`,power:42,range:8.5});
    shadow(g,1,-1,6,5,.18);g.updateMatrixWorld(true);
    if(room.id==='study')this.buildStudy(g,room);
    else this.buildOther(g,room);
    g.visible=false;
  }
  roomHotspot(g,room,text,en,p,action) {g.updateMatrixWorld(true);this.addHotspot(text,en,g.localToWorld(V(...p)),action,room.id);}
  buildStudy(g,room) {
    // 书柜、书脊与嵌入的金色细节。
    const colors=['#495b46','#ac8a55','#7b523c','#77775b','#566976','#b3a382','#685c61'];
    for(const x of [-2.55,-.1,2.35]) {
      const bookcase=new THREE.Group();bookcase.name='course-bookcase';g.add(bookcase);this.register(bookcase,'浏览课程书架',()=>this.reveal(bookcase.getObjectByName('hardback-book'),'shelf'));
      box(bookcase,[2.28,3.5,.075],[x,1.75,-4.22],this.interiorWood);box(bookcase,[2.08,3.29,.035],[x,1.78,-4.165],'#8b805f');
      for(const xx of [x-1.08,x+1.08])box(bookcase,[.12,3.52,.65],[xx,1.76,-3.9],this.interiorWood);
      const contents=new THREE.Group();bookcase.add(contents);this.register(contents,'浏览课程书架',()=>this.reveal(null,'shelf'));
      for(let row=0;row<4;row++){const y=.78+row*.65;box(bookcase,[2.25,.075,.66],[x,y,-3.9],this.interiorWood);
        box(bookcase,[2.2,.045,.04],[x,y-.035,-3.555],'#b39a6c');
        for(let j=0;j<(row===2?8:10);j++){const h=.34+((j*7+row*3)%6)*.037,bx=x-.91+j*.19;
          const b=hardback(contents,[bx,y+.04,-3.84],.13+(j%3)*.018,h,.36,colors[(j+row*2)%colors.length]);b.rotation.z=j===7?.09:0;batchDetails(b);this.register(b,'抽出书本 · 浏览课程书架',()=>this.reveal(b,'shelf'));
        }
        if(row===2)for(let k=0;k<2;k++){const b=hardback(contents,[x+.55,y+.1+k*.12,-3.82],.10,.43,.34,colors[k+2]);b.rotation.z=-Math.PI/2;batchDetails(b);this.register(b,'抽出书本 · 浏览课程书架',()=>this.reveal(b,'shelf'));}
      }

      box(bookcase,[2.45,.16,.76],[x,3.53,-3.9],this.interiorWood);box(bookcase,[2.1,.61,.08],[x,.42,-3.56],this.interiorWood);
      for(const side of [-1,1]){frame(bookcase,.92,.46,[x+side*.52,.43,-3.505],'#b09b73',.035,.03);box(bookcase,[.035,.1,.035],[x+side*.1,.45,-3.47],'#baa36c');}
      box(bookcase,[2.37,.15,.72],[x,.1,-3.9],this.interiorWood);
    }
    label(g,'书 页 之 间  ·  自 有 天 地',[0,3.98,-4.37],{width:4,height:.3,color:'#57694a',font:30});
    const desk=new THREE.Group();desk.position.set(1.0,0,-.1);desk.rotation.y=-.12;this.register(desk,'打开书桌笔记',()=>this.reveal(null,'desk'));g.add(desk);
    const tabletop=box(desk,[3.15,.14,1.5],[0,1.17,0],this.interiorWood);this.addInteraction(tabletop,()=>this.reveal(null,'desk'),'打开书桌笔记');
    for(const x of [-1.3,1.3])for(const z of [-.52,.52])box(desk,[.13,1.12,.13],[x,.56,z],'#625c41');
    box(desk,[2.6,.34,.7],[0,.93,.25],this.interiorWood);for(const x of [-.66,.66]){
      const drawer=new THREE.Group();drawer.position.set(x,0,0);desk.add(drawer);
      box(drawer,[1.22,.23,.05],[0,.94,.65],'#87704d');box(drawer,[.22,.028,.04],[0,.95,.69],'#b6a26a');
      box(drawer,[1.14,.035,.65],[0,.84,.30],this.interiorWood);
      for(const dx of [-.56,.56])box(drawer,[.035,.2,.65],[dx,.94,.30],this.interiorWood);
      this.register(drawer,'拉开 / 合上抽屉',()=>this.feedback(this.motions.toggle(drawer,V(0,0,.5))?'抽屉已拉开':'抽屉已合上'));
    }
    // 桌面皮垫与弯曲的纸页都具有实体厚度。
    box(desk,[1.55,.012,1.03],[-.15,1.246,.12],'#5e6d50');
    const reading=openBook(desk,[-.22,1.285,.2]);this.register(reading,'拿起桌上的书',()=>books.length?this.reveal(reading,'book',books[0].id):this.reveal(reading,'shelf'));
    for(const x of [-1.3,1.3])for(const z of [-.52,.52])box(desk,[.14,.09,.14],[x,.055,z],'#a48f5d');
    const notebook=hardback(desk,[.72,1.29,.23],.055,.5,.65,'#7c5b40');notebook.rotation.set(0,-.2,-Math.PI/2);this.register(notebook,'打开笔记本',()=>this.reveal(notebook,'desk'));
    mug(desk,[.76,1.25,-.38]);
    this.studyLamp=lamp(desk,[-1.06,1.25,-.32],1.0);this.addInteraction(this.studyLamp.group,()=>this.callbacks.onInteract('lamp'));
    detailedChair(g,[.8,0,1.35],this.interiorWood,.1);
    plant(g,[-3.65,0,2.7],1.65);art(g,-2.7,2.55,4.36,1.3,1.6,0).rotation.y=Math.PI;
    this.roomHotspot(g,room,'挑一本书','THE BOOKSHELF',[-1.7,2.45,-3.4],()=>this.reveal(g.getObjectByName('hardback-book'),'shelf'));
    this.roomHotspot(g,room,'坐下来，写点什么','THE WRITING DESK',[1.2,1.42,.5],()=>this.reveal(notebook,'desk'));
    this.roomHotspot(g,room,'开 / 关台灯','A LITTLE WARMTH',[-.12,1.96,-.58],()=>this.callbacks.onInteract('lamp'));
  }
  buildOther(g,room) {
    if(room.id==='gallery'){
      for(let i=0;i<3;i++){const m=art(g,-2.7+i*2.65,2.65,-4.28,1.8,2.05,i);this.register(m,'欣赏画作',()=>this.reveal(m,'gallery'));label(g,`0${i+1}   ${['数 字 空 间','光 的 轨 迹','从 问 题 出 发'][i]}`,[-2.7+i*2.65,1.32,-4.14],{width:1.8,height:.18,color:'#566448',font:27});}
      box(g,[3.3,.16,1],[0,.68,.8],this.interiorWood);for(const x of [-1.3,1.3])box(g,[.15,.65,.65],[x,.32,.8],'#79765b');plant(g,[3.4,0,-3.3],1.7);
      this.roomHotspot(g,room,'翻阅作品集','SELECTED WORKS',[0,2,-2.8],()=>this.callbacks.onInteract('gallery'));
    }else if(room.id==='lab'){
      this.register(box(g,[4,.16,1.6],[0,1.1,-1.8],this.interiorWood),'查看实验台',()=>this.reveal(null,'lab'));for(const x of [-1.65,1.65])box(g,[.12,1.1,1.4],[x,.55,-1.8],'#576553');
      this.register(box(g,[4,1.6,.12],[0,2.9,-4.3],'#3d5c49'),'查看单摆实验',()=>this.reveal(null,'lab'));label(g,'T = 2π √( L / g )',[0,2.95,-4.21],{width:3.3,height:.65,color:'#dedfc4',font:42});label(g,'好 奇 心 是 最 好 的 出 发 点',[0,2.4,-4.2],{width:3.4,height:.25,color:'#b9c5a4',font:26});
      for(const x of [-1,1])box(g,[.06,1.8,.07],[x,2.1,-1.9],'#b1a072');box(g,[2.1,.08,.1],[0,3,-1.9],'#b1a072');const arm=new THREE.Group();arm.position.set(0,2.96,-1.9);g.add(arm);cylinder(arm,.012,.012,1.1,[0,-.55,0],'#c6b987',8);sphere(arm,.18,[0,-1.15,0],material('#9c8d53',.25,.7));arm.userData.amplitude=0;this.pendulums.push(arm);this.register(arm,'轻推单摆',()=>{arm.userData.amplitude=.42;this.feedback('单摆开始摆动，再次点击可轻推');});plant(g,[-3.6,0,-3.5],1.5);
      this.roomHotspot(g,room,'试试这个单摆','A SMALL EXPERIMENT',[0,1.9,-1],()=>this.callbacks.onInteract('lab'));
    }else if(room.id==='journal'){
      box(g,[4.8,2.5,.08],[0,2.8,-4.3],'#aa9770');for(let i=0;i<7;i++){const x=-1.7+(i%4)*1.1,y=2.2+Math.floor(i/4)*1.1;const page=box(g,[.85,.95,.025],[x,y,-4.23],i%2?'#e6dabc':'#dbcead');page.rotation.z=(i%3-1)*.06;this.register(page,'拿起一页手记',()=>this.reveal(page,'journal'));for(let n=0;n<5;n++)box(g,[.55,.012,.005],[x,y+.23-n*.12,-4.205],'#a3a58a',false);}
      this.register(box(g,[3.2,.14,1.4],[0,1.1,-.8],this.interiorWood),'打开写作台',()=>this.reveal(null,'desk'));for(const x of [-1.4,1.4])for(const z of [-1.3,-.3])box(g,[.12,1.1,.12],[x,.55,z],'#73684d');lamp(g,[-1.1,1.2,-1.05]);plant(g,[3.3,0,-3.2],1.7);
      this.roomHotspot(g,room,'读一段手记','NOTES & OBSERVATIONS',[0,2.7,-3.8],()=>this.callbacks.onInteract('journal'));
    }else if(room.id==='music'){
      for(const x of [-2.8,2.8]){this.register(box(g,[.85,1.65,.65],[x,.83,-3],this.interiorWood),'播放 / 暂停音箱',()=>this.callbacks.onInteract('audio'));for(const y of [.5,1.2]){const speaker=cylinder(g,.23,.23,.035,[x,y,-2.65],'#30392f');speaker.rotation.x=Math.PI/2;this.register(speaker,'播放 / 暂停音箱',()=>this.callbacks.onInteract('audio'));}}
      this.register(box(g,[3.2,.8,.9],[0,.6,-3.2],this.interiorWood),'听音室播放器',()=>this.reveal(null,'music'));this.register(box(g,[1.5,.12,.7],[0,1.1,-3.1],'#555a49'),'播放 / 暂停唱片',()=>this.callbacks.onInteract('audio'));const record=cylinder(g,.31,.31,.035,[0,1.18,-3.1],'#252b27',48);const recordLabel=cylinder(g,.09,.09,.04,[0,1.19,-3.1],'#b29866');record.attach(recordLabel);
      for(let i=0;i<3;i++)box(record,[.065-i*.012,.002,.007],[.015,.032,-.03+i*.018],'#3b4738',false);cylinder(record,.014,.014,.009,[0,.04,0],'#d3c29a',12);this.record=record;this.recordSpeed=0;this.register(record,'播放 / 暂停唱片',()=>this.callbacks.onInteract('audio'));
      this.sofa(g);art(g,0,2.8,-4.3,1.4,1.4,2);plant(g,[3.5,0,.5],1.5);
      this.roomHotspot(g,room,'落下唱针','THE LISTENING CORNER',[0,1.7,-2.9],()=>this.callbacks.onInteract('music'));
    }else{
      this.sofa(g);art(g,0,2.8,-4.3,2.4,1.65,0);plant(g,[-3.4,0,-3.2],1.75);plant(g,[3.6,0,1.5],1.4);
      coffeeTable(g,this.interiorWood,()=>this.callbacks.onInteract('about'));
      this.roomHotspot(g,room,'认识一下 ZY','HELLO, I’M ZY',[0,1.35,-.4],()=>this.callbacks.onInteract('about'));
    }
    roomProps(g,room,this.interiorWood,this);
  }
  sofa(g) {return detailedSofa(g,this.interiorWood);}
  worldPoint(room,x,y,z) {const g=this.roomGroups.get(room.id);return g.localToWorld(V(x,y,z));}
  beginWalk(points,room,finalYaw) {
    if(this.seat||this.seatMotion){
      this.stand();this.afterStand=()=>this.beginWalk([this.camera.position.clone(),...points.slice(1)],room,finalYaw);return;
    }
    this.activation++;this.motions.items.delete('open-content');this.keys.clear();this.drag=null;this.target.copy(this.camera.position);
    this.transition=createWalk(points,this.viewYaw,finalYaw,room);
    const previous=roomAt(this.camera.position,rooms);
    for(const [id,g]of this.roomGroups)g.visible=id===previous?.id||id===room?.id;
    document.body.classList.add('transitioning');this.callbacks.onTravel?.(room);

  }
  enter(id) {
    if(!this.hasEntered)return;const room=rooms.find(r=>r.id===id);if(!room)return;
    const previous=roomAt(this.camera.position,rooms);
    if(previous?.id===id&&!this.transition)return;
    this.beginWalk(roomRoute(this.camera.position,room,previous),room,Math.atan2(-room.side,0));
  }
  finishWalk() {
    const room=this.transition.room;this.current=room?.id??null;this.transition=null;
    this.target.copy(this.camera.position);this.yaw=this.viewYaw;this.pitch=this.viewPitch=-.045;this.isExploring=false;
    document.body.classList.remove('transitioning');
    for(const [id,g]of this.roomGroups)g.visible=id===this.current;
    this.callbacks.onRoom(room);this.callbacks.onTravel?.(undefined);
    if(this.pendingSeat){this.seat=this.pendingSeat;this.pendingSeat=null;this.seatMotion={from:this.camera.position.clone(),to:this.seat.position.clone(),elapsed:0,duration:1.1};this.feedback('坐下来歇一会儿 · 按 Esc 或再次点击座椅起身');}
  }
  cancelWalk() {
    if(!this.transition)return;
    this.pendingSeat=null;this.transition.room=roomAt(this.camera.position,rooms);this.finishWalk();
  }
  exit() {
    if(this.seat||this.seatMotion){this.stand();this.afterStand=()=>this.exit();return;}
    if(this.transition){this.cancelWalk();return;}
    if(!this.current)return;const room=rooms.find(r=>r.id===this.current);
    this.beginWalk(returnRoute(this.camera.position,room),null,0);
  }
  explore() {if(!this.isExploring){this.isExploring=true;this.callbacks.onExplore();}}
  step(amount) {
    if(this.seat||this.seatMotion){this.stand();this.afterStand=()=>this.step(amount);return;}
    if(!this.hasEntered)return;if(this.transition)this.cancelWalk();if(this.current)return;
    this.target.copy(constrainPosition(this.target.clone().add(V(0,0,amount))));this.explore();
  }
  toggleLamp() {return this.studyLamp?.fixture?this.lighting.toggle(this.studyLamp.fixture):false;}
  bind() {
    this.onResize=()=>this.resize();window.addEventListener('resize',this.onResize);
    this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.callbacks.onInteract('context-lost');});
    this.canvas.addEventListener('wheel',e=>{if(document.querySelector('dialog[open]'))return;e.preventDefault();this.step(e.deltaY*-.008);},{passive:false});
    this.canvas.addEventListener('pointerdown',e=>{this.drag={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:0};this.canvas.setPointerCapture(e.pointerId);});
    this.canvas.addEventListener('pointermove',e=>{
      this.pointerActive=e.pointerType!=='touch';
      if(this.drag&&this.hasEntered){const dx=e.clientX-this.drag.lastX,dy=e.clientY-this.drag.lastY;this.drag.moved+=Math.abs(dx)+Math.abs(dy);if(this.drag.moved>6){if(this.transition)this.cancelWalk();this.yaw-=dx*.008;this.pitch=clamp(this.pitch-dy*.005,-.85,.85);this.explore();}this.drag.lastX=e.clientX;this.drag.lastY=e.clientY;}
      this.pointer.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);
    });
    this.canvas.addEventListener('pointerup',e=>{if(this.drag&&this.drag.moved<8&&!this.transition){this.pointer.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);this.activate(this.pick());}this.drag=null;if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);});
    this.canvas.addEventListener('pointerleave',()=>{this.pointerActive=false;this.hovered=null;document.querySelector('#hint').hidden=true;this.canvas.style.cursor='grab';});
    this.canvas.addEventListener('pointercancel',()=>{this.drag=null;});
    window.addEventListener('keydown',e=>{if(document.querySelector('dialog[open], #scene-tools:not([hidden])')||/INPUT|TEXTAREA/.test(e.target.tagName))return;if(e.key==='Escape'){if(this.seat)this.stand();else this.exit();}if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D'].includes(e.key)){e.preventDefault();this.stand();this.keys.add(e.key.toLowerCase());}});
    window.addEventListener('keyup',e=>this.keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>this.keys.clear());document.addEventListener('visibilitychange',()=>{this.keys.clear();this.last=performance.now();});
  }
  isVisible(object) {let o=object;while(o){if(!o.visible)return false;o=o.parent;}return true;}
  resize() {this.camera.aspect=innerWidth/innerHeight;this.camera.fov=innerWidth<600?67:52;this.camera.updateProjectionMatrix();this.renderer.setPixelRatio(renderPixelRatio(innerWidth,innerHeight,devicePixelRatio));this.renderer.setSize(innerWidth,innerHeight);requestAnimationFrame(()=>this.overlayRegions?.forEach(el=>this.overlayRects.set(el,el.getBoundingClientRect())));}
  updateHotspots() {
    const isMobile=innerWidth<600;const projected=new THREE.Vector3();
    const reserved=[];
    for(const [el,rect] of this.overlayRects??[]){
      if(el.hidden||!rect.width||!rect.height)continue;
      if((el.id==='intro'||el.id==='room-caption')&&this.isExploring)continue;
      if(el.id==='hint'&&!document.querySelector('#toast').hidden)continue;
      if(el.classList.contains('scene-label')&&this.current)continue;
      reserved.push(rect);
    }
    for(const h of this.hotspots){const distance=this.camera.position.distanceTo(h.position);let show=this.hasEntered&&!this.transition&&(h.room?this.current===h.room:!this.current&&distance<19);
      if(show){projected.copy(h.position).project(this.camera);show=projected.z<1&&projected.z>0&&Math.abs(projected.x)<.91&&Math.abs(projected.y)<.74;const x=(projected.x+1)/2*innerWidth,y=(-projected.y+1)/2*innerHeight;if(y>innerHeight*.74||y<100)show=false;if(isMobile&&y<innerHeight*.38&&x<innerWidth*.6)show=false;if(!this.current&&!this.isExploring&&x<innerWidth*.44&&y<innerHeight*.74)show=false;
        const size=this.hotspotSizes?.get(h.el)??{width:isMobile?150:210,height:54};
        const rect={left:x-size.width/2,right:x+size.width/2,top:y-size.height/2,bottom:y+size.height/2};
        if(reserved.some(region=>overlaps(rect,region)))show=false;
        if(show){h.el.style.left=`${x}px`;h.el.style.top=`${y}px`;reserved.push(rect);}}
      h.el.hidden=!show;
    }
  }
  openEntrance() {
    if(this.entering)return;
    this.lighting.turnOnAll();
    if(this.hasEntered){
      this.gateOpen=true;this.gateClearTime=0;
      if(this.camera.position.z>12.5){
        this.beginWalk([this.camera.position.clone(),V(0,EYE_HEIGHT,Math.max(14,this.camera.position.z)),V(0,EYE_HEIGHT,10),V(0,EYE_HEIGHT,8.5)],null,0);
      }else{
        const room=roomAt(this.camera.position,rooms);
        this.beginWalk([this.camera.position.clone(),...(room?exitRoomPoints(room):[]),V(0,EYE_HEIGHT,10),V(0,EYE_HEIGHT,16),V(0,EYE_HEIGHT,21)],null,Math.PI);
      }
      return;
    }
    this.entering={elapsed:0,walk:createWalk([V(0,EYE_HEIGHT,24),V(0,EYE_HEIGHT,8.5)],0,0)};
    document.body.classList.add('entering');document.querySelector('#enter-house').disabled=true;
    this.keys.clear();this.drag=null;
  }
  updateGate(dt) {
    const destinationZ=this.transition?this.transition.path.getPointAt(1).z:this.target.z;
    const crossing=this.transition&&(this.camera.position.z-12)*(destinationZ-12)<0;
    // 提前约 6.5 米感应；离开 7.5 米后再关闭，避免门口徘徊时反复开合。
    if(crossing||nearEntrance(this.camera.position,this.gateOpen)){
      if(!this.gateOpen)this.lighting.turnOnAll();
      this.gateOpen=true;this.gateClearTime=0;
    }else{
      this.gateClearTime+=dt;if(this.gateClearTime>.6)this.gateOpen=false;
    }
    for(const leaf of this.gateLeaves){
      const desired=this.gateOpen?-leaf.side*1.68:0;
      leaf.pivot.rotation.y=THREE.MathUtils.damp(leaf.pivot.rotation.y,desired,4,dt);
      if(Math.abs(leaf.pivot.rotation.y-desired)<.002)leaf.pivot.rotation.y=desired;
    }
  }
  updateCameraView() {
    const cp=Math.cos(this.viewPitch);
    this.camera.lookAt(this.camera.position.clone().add(V(-Math.sin(this.viewYaw)*cp,Math.sin(this.viewPitch),-Math.cos(this.viewYaw)*cp)));
  }
  tick(now) {
    const dt=Math.min((now-this.last)/1000,.05);this.last=now;if(document.hidden)return;
    this.motions.update(dt);
    if(this.fountain){const f=this.fountain;f.flow=this.reduced?Number(f.running):THREE.MathUtils.damp(f.flow,Number(f.running),3,dt);f.clock+=dt*f.flow;f.update(f.clock,f.flow);}
    if(this.hoverPointer.matches&&this.pointerActive&&this.frame%6===0&&!this.drag&&!this.transition&&!document.querySelector('dialog[open]')){
      this.hovered=this.pick();const hint=document.querySelector('#hint');hint.hidden=!this.hovered;
      if(this.hovered)hint.textContent=this.hovered.userData.label??'点击互动';this.canvas.style.cursor=this.hovered?'pointer':'grab';
    }
    if(!this.hasEntered){
      if(this.entering){
        const entry=this.entering;entry.elapsed+=dt;
        const open=smooth(clamp(entry.elapsed/1.1,0,1));
        for(const leaf of this.gateLeaves)leaf.pivot.rotation.y=-leaf.side*1.68*open;
        if(entry.elapsed>.65){
          this.camera.position.copy(advanceWalk(entry.walk,dt));
          if(entry.walk.arrived){this.hasEntered=true;this.gateOpen=true;this.entering=null;this.target.copy(this.camera.position);this.callbacks.onEnter();}
        }
      }
      this.viewPitch=THREE.MathUtils.damp(this.viewPitch,this.entering?-.02:.06,4,dt);
      this.updateCameraView();this.lighting.update(dt);this.shadowCache.update();this.renderer.render(this.scene,this.camera);this.updateHotspots();this.frame++;return;
    }
    if(this.seatMotion){
      const motion=this.seatMotion;motion.elapsed=Math.min(motion.duration,motion.elapsed+dt);
      this.camera.position.lerpVectors(motion.from,motion.to,smooth(motion.elapsed/motion.duration));
      if(motion.elapsed>=motion.duration){
        this.target.copy(this.camera.position);this.seatMotion=null;
        const next=this.afterStand;this.afterStand=null;next?.();
      }
    }else if(this.transition){
      const walk=this.transition;this.camera.position.copy(advanceWalk(walk,dt));this.viewYaw=walk.yaw;this.yaw=walk.yaw;
      this.viewPitch=THREE.MathUtils.damp(this.viewPitch,-.025,4,dt);
      if(walk.arrived)this.finishWalk();
    }else{
      if(!document.querySelector('dialog[open]')){
        if(!this.current){
          const forward=(this.keys.has('w')||this.keys.has('arrowup')?1:0)-(this.keys.has('s')||this.keys.has('arrowdown')?1:0);
          const side=(this.keys.has('d')?1:0)-(this.keys.has('a')?1:0);
          if(forward||side){const move=V(-Math.sin(this.viewYaw)*forward+Math.cos(this.viewYaw)*side,0,-Math.cos(this.viewYaw)*forward-Math.sin(this.viewYaw)*side).normalize().multiplyScalar(dt*WALK_SPEED);this.target.copy(constrainPosition(this.target.clone().add(move)));this.explore();}
        }
        if(this.keys.has('arrowleft')){this.yaw+=dt*1.8;this.explore();}
        if(this.keys.has('arrowright')){this.yaw-=dt*1.8;this.explore();}
      }
      const movement=this.target.clone().sub(this.camera.position);movement.y=0;
      const amount=Math.min(movement.length()*(1-Math.exp(-dt*7)),dt*6);
      if(movement.length()>.0001)this.camera.position.add(movement.normalize().multiplyScalar(amount));
      this.camera.position.y=this.seat?.position.y??EYE_HEIGHT;
      this.viewYaw+=angleDelta(this.viewYaw,this.yaw)*(1-Math.exp(-dt*12));this.viewPitch=THREE.MathUtils.damp(this.viewPitch,this.pitch,12,dt);
    }
    this.updateGate(dt);this.updateCameraView();
    for(const door of this.doors){
      const inUse=door.id===this.current||door.id===this.transition?.room?.id;
      const near=this.camera.position.distanceTo(V(rooms.find(r=>r.id===door.id).side*3.5,EYE_HEIGHT,rooms.find(r=>r.id===door.id).z))<5;
      const desired=inUse&&near?1.4:0;
      door.pivot.rotation.y=THREE.MathUtils.damp(door.pivot.rotation.y,desired,4,dt);
      if(Math.abs(door.pivot.rotation.y-desired)<.002)door.pivot.rotation.y=desired;
    }
    for(const p of this.pendulums){p.userData.amplitude*=Math.exp(-dt*.035);p.rotation.z=this.reduced?0:Math.sin(now*.003)*p.userData.amplitude;}
    if(this.tonearm)this.tonearm.rotation.y=THREE.MathUtils.damp(this.tonearm.rotation.y,document.body.classList.contains('sound-on')?0:-.8,4,dt);
    if(this.record){this.recordSpeed=THREE.MathUtils.damp(this.recordSpeed,document.body.classList.contains('sound-on')?1.3:0,3,dt);if(!this.reduced)this.record.rotation.y+=dt*this.recordSpeed;}
    if(import.meta.env.DEV&&this.frame%10===0){this.canvas.dataset.position=this.camera.position.toArray().map(n=>n.toFixed(3)).join(',');this.canvas.dataset.yaw=this.viewYaw.toFixed(3);this.canvas.dataset.moving=String(!!this.transition);this.canvas.dataset.gateAngle=Math.abs(this.gateLeaves[0].pivot.rotation.y).toFixed(3);}
    this.lighting.update(dt);this.shadowCache.update();
    this.renderer.render(this.scene,this.camera);if(this.frame++%2===0)this.updateHotspots();
  }
}
