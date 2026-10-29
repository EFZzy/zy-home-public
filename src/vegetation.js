import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const matrix = new THREE.Matrix4();
const rotation = new THREE.Quaternion();
const color = new THREE.Color();
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let n = Math.imul(state ^ state >>> 15, 1 | state);
    n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}
function seedAt(pos) { return Math.abs(Math.round(pos[0] * 7381 + pos[2] * 1931)) + 31; }

// 有厚薄折面和下垂叶尖的叶片；近景使用较密网格，树冠复用轻量网格。
function leafGeometry(rows, columns) {
  const positions = [], uvs = [], indices = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows, width = .27 * Math.pow(Math.sin(Math.PI * t), .75);
    for (let j = 0; j <= columns; j++) {
      const across = j / columns * 2 - 1;
      positions.push(across * width, t, .13 * Math.sin(Math.PI * t) - .2 * t * t - .065 * Math.abs(across) * Math.sin(Math.PI * t));
      uvs.push(j / columns, t);
      if (i < rows && j < columns) {
        const a = i * (columns + 1) + j, b = a + columns + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}
const broadLeaf = leafGeometry(14, 8), smallLeaf = leafGeometry(6, 4);
const pebbleGeometry = new THREE.IcosahedronGeometry(1, 1);
let materials;
function palette() {
  if (materials) return materials;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 256, 0);
  gradient.addColorStop(0, '#9caa7c'); gradient.addColorStop(.45, '#dce1b9');
  gradient.addColorStop(.5, '#eaf0cd'); gradient.addColorStop(.55, '#dce1b9'); gradient.addColorStop(1, '#9caa7c');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#b8c794'; ctx.lineWidth = 1.4;
  for (let y = 32; y < 235; y += 26) for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(128, y + 12); ctx.quadraticCurveTo(128 + side * 50, y - 4, 128 + side * 119, y - 27); ctx.stroke();
  }
  ctx.strokeStyle = '#e3e8bd'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(128, 0); ctx.lineTo(128, 256); ctx.stroke();
  const leafMap = new THREE.CanvasTexture(canvas); leafMap.colorSpace = THREE.SRGBColorSpace;
  const barkCanvas = document.createElement('canvas'); barkCanvas.width = 128; barkCanvas.height = 256;
  const bark = barkCanvas.getContext('2d'), rng = random(71);
  bark.fillStyle = '#a39377'; bark.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 95; i++) {
    const x = rng() * 128, y = rng() * 256;
    bark.strokeStyle = i % 3 ? '#8f8168' : '#b3a387'; bark.lineWidth = .4 + rng();
    bark.beginPath(); bark.moveTo(x, y); bark.bezierCurveTo(x + 3, y + 10, x - 2, y + 20, x + rng() * 3, y + 40); bark.stroke();
  }
  const barkMap = new THREE.CanvasTexture(barkCanvas); barkMap.colorSpace = THREE.SRGBColorSpace;
  materials = {
    leaf: new THREE.MeshStandardMaterial({ color: '#ffffff', map: leafMap, roughness: .73, side: THREE.DoubleSide }),
    bark: new THREE.MeshStandardMaterial({ color: '#a59a80', map: barkMap, roughness: .96 }),
    stem: new THREE.MeshStandardMaterial({ color: '#66764d', roughness: .85 }),
    pot: new THREE.MeshStandardMaterial({ color: '#b7a486', roughness: .85 }),
    rim: new THREE.MeshStandardMaterial({ color: '#cbbb9a', roughness: .78 }),
    soil: new THREE.MeshStandardMaterial({ color: '#514a36', roughness: 1 }),
    pebble: new THREE.MeshStandardMaterial({ color: '#b8ae92', roughness: 1 }),
    stone: new THREE.MeshStandardMaterial({ color: '#bdb79d', roughness: .88 }),
    petal: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .8, side: THREE.DoubleSide }),
    pollen: new THREE.MeshStandardMaterial({ color: '#b79548', roughness: 1 }),
  };
  return materials;
}
function groupAt(parent, name, pos, scale) {
  const group = new THREE.Group(); group.name = name; group.position.set(...pos);
  if (Array.isArray(scale)) group.scale.set(...scale); else group.scale.setScalar(scale);
  parent.add(group); return group;
}
function lathe(group, profile, material, name) {
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(...p)), 48), material);
  mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
}
function curvedBranch(points, bottom, top, segments = 10, radial = 7) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, segments, 1, radial, false);
  const positions = geometry.attributes.position, uvs = geometry.attributes.uv, point = new THREE.Vector3();
  for (let row = 0; row <= segments; row++) {
    const t = row / segments, center = curve.getPointAt(t), radius = THREE.MathUtils.lerp(bottom, top, t);
    for (let col = 0; col <= radial; col++) {
      const i = row * (radial + 1) + col;
      point.fromBufferAttribute(positions, i).sub(center).multiplyScalar(radius).add(center);
      positions.setXYZ(i, point.x, point.y, point.z);
      uvs.setXY(i, col / radial, t);
    }
  }
  geometry.computeVertexNormals(); return geometry;
}
function branches(group, geometries, material, name = 'plant-branches') {
  const geometry = mergeGeometries(geometries);
  geometries.forEach(g => g.dispose());
  const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true;
  group.add(mesh);
}
function instances(group, geometry, material, count, name) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
}
function place(mesh, index, pos, quaternion, scale, tint) {
  matrix.compose(pos, quaternion, scale); mesh.setMatrixAt(index, matrix);
  if (tint) mesh.setColorAt(index, color.set(tint));
}
function leafFacing(direction) {
  const y = direction.clone().normalize();
  const z = UP.clone().addScaledVector(y, -y.y).normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(matrix.makeBasis(x, y, z));
}

export function addPottedPlant(parent, pos, scale = 1) {
  const p = palette(), g = groupAt(parent, 'detailed-potted-plant', pos, scale), rng = random(seedAt(pos));
  lathe(g, [[0,.01],[.19,.01],[.235,.025],[.24,.045],[.23,.064],[.19,.07],[0,.07]], p.rim, 'pot-saucer');
  lathe(g, [[0,.06],[.18,.06],[.195,.08],[.205,.14],[.25,.43],[.272,.47],[.285,.48],[.29,.5],[.284,.52],[.267,.526],[.252,.513],[.248,.49],[.224,.43],[.178,.11],[0,.11]], p.pot, 'hollow-ceramic-pot');
  const soil = new THREE.Mesh(new THREE.CircleGeometry(.244, 40), p.soil);
  soil.rotation.x = -Math.PI / 2; soil.position.y = .476; g.add(soil);
  const pebbles = instances(g, pebbleGeometry, p.pebble, 18, 'soil-pebbles');
  for (let i = 0; i < 18; i++) {
    const a = rng() * TAU, r = .06 + rng() * .16, size = .009 + rng() * .012;
    place(pebbles, i, v(Math.cos(a) * r,.484,Math.sin(a) * r), rotation.setFromEuler(new THREE.Euler(rng(),rng(),rng())), v(size,size*.5,size*.7));
  }
  const leaves = instances(g, broadLeaf, p.leaf, 13, 'curved-veined-leaves'), stems = [];
  const tones = ['#55774e','#6d8858','#829767','#4f704b'];
  for (let i = 0; i < 13; i++) {
    const a = i * 2.39996 + rng() * .15, outer = i < 8;
    const height = outer ? .72 + rng() * .26 : 1.0 + rng() * .24;
    const reach = outer ? .23 : .1;
    const end = v(Math.cos(a) * reach,height,Math.sin(a) * reach);
    stems.push(curvedBranch([v(Math.cos(a)*.05,.47,Math.sin(a)*.05),v(Math.cos(a)*reach*.35,height*.75,Math.sin(a)*reach*.35),end],.012,.005,8,5));
    const length = outer ? .58 + rng() * .17 : .43 + rng() * .17;
    const direction = v(Math.cos(a),outer ? .35 : 1.8,Math.sin(a));
    place(leaves,i,end,leafFacing(direction),v(length*(.9+rng()*.25),length,length),tones[i%tones.length]);
  }
  branches(g, stems, p.stem); return g;
}

export function addGardenTree(parent, pos, scale = 1) {
  const p = palette(), tree = groupAt(parent, 'branched-garden-tree', pos, scale), rng = random(seedAt(pos));
  lathe(tree, [[.73,.015],[.87,.015],[.92,.04],[.93,.10],[.91,.15],[.87,.17],[.79,.17],[.76,.14],[.73,.015]],p.stone,'tree-bed-edging');
  const soil = new THREE.Mesh(new THREE.CircleGeometry(.78,48),p.soil); soil.rotation.x=-Math.PI/2;soil.position.y=.07;tree.add(soil);
  const wood = [curvedBranch([v(0,.06,0),v(.07,.9,.02),v(-.05,1.9,.06),v(.05,2.9,0),v(.02,3.75,-.06)],.22,.045,18,10)];
  for(let i=0;i<5;i++) {
    const a=i*TAU/5;
    wood.push(curvedBranch([v(Math.cos(a)*.55,.075,Math.sin(a)*.55),v(Math.cos(a)*.25,.13,Math.sin(a)*.25),v(0,.38,0)],.025,.11,6,7));
  }
  // 主干和根系固定；每根侧枝围绕它与主干的连接点摆动。
  branches(tree,wood,p.bark,'tree-trunk');
  const limbs=[];
  for(let i=0;i<6;i++) {
    const a=i*2.39996+.2, h=1.75+i*.25, reach=.85+rng()*.35;
    const end=v(Math.cos(a)*reach,3.12+(i%3)*.48,Math.sin(a)*reach);
    const start=v(0,h,.03),mid=start.clone().lerp(end,.55);mid.y-=.15;
    const limb=new THREE.Group();limb.name='tree-branch-sway';limb.position.copy(start);tree.add(limb);
    const limbWood=[curvedBranch([start,mid,end],.095-i*.007,.025,10,7)],centers=[];
    for(let j=0;j<2;j++) {
      const angle=a+(j?1:-1)*.45;
      const tip=end.clone().add(v(Math.cos(angle)*.42,.22+rng()*.3,Math.sin(angle)*.42));
      limbWood.push(curvedBranch([end.clone().lerp(start,.23),end,tip],.032,.009,7,6));
      centers.push(tip);
    }
    limbWood.forEach(geometry=>geometry.translate(-start.x,-start.y,-start.z));
    branches(limb,limbWood,p.bark);
    limbs.push({limb,centers});
  }
  const perCrown=95,tones=['#728858','#879969','#5e7c50','#9aa577','#6a8153'];
  for(const {limb,centers} of limbs){
    const leaves=instances(limb,smallLeaf,p.leaf,centers.length*perCrown,'layered-tree-leaves');
    let index=0;
    for(const center of centers) for(let j=0;j<perCrown;j++) {
      const a=rng()*TAU,y=rng()*2-1,r=Math.sqrt(1-y*y),radius=.35+.42*Math.cbrt(rng());
      const pos=center.clone().add(v(Math.cos(a)*r*radius,y*radius*.8,Math.sin(a)*r*radius)).sub(limb.position);
      const length=.22+rng()*.16;
      rotation.setFromEuler(new THREE.Euler(-Math.PI/2+(rng()-.5)*1.4,rng()*TAU,rng()*TAU));
      place(leaves,index++,pos,rotation,v(length*.95,length,length),tones[Math.floor(rng()*tones.length)]);
    }
  }
  return tree;
}

export function addShrub(parent, pos, scale = 1) {
  const p=palette(),g=groupAt(parent,'leafy-shrub',pos,scale),rng=random(seedAt(pos));
  const leaves=instances(g,smallLeaf,p.leaf,240,'shrub-leaves'), wood=[];
  const tones=['#688054','#81935e','#526f4b','#92a16d'];
  for(let i=0;i<7;i++) {
    const a=i*2.4;
    wood.push(curvedBranch([v(0,0,0),v(Math.cos(a)*.13,.26,Math.sin(a)*.13),v(Math.cos(a)*.32,.42,Math.sin(a)*.32)],.012,.003,5,5));
  }
  branches(g,wood,p.stem);
  for(let i=0;i<240;i++) {
    const a=rng()*TAU,y=rng()*2-1,r=Math.sqrt(1-y*y),shell=.35+.2*rng();
    const pos=v(Math.cos(a)*r*shell,.29+y*shell*.55,Math.sin(a)*r*shell);
    const length=.13+rng()*.12;
    rotation.setFromEuler(new THREE.Euler(-Math.PI/2+(rng()-.5)*1.7,rng()*TAU,rng()*TAU));
    place(leaves,i,pos,rotation,v(length,length,length),tones[i%tones.length]);
  }
  return g;
}

export function addFlowerBedDetails(parent, positions) {
  const p=palette(),g=groupAt(parent,'flower-bed-details',[0,0,0],1),rng=random(218);
  const count=positions.length*2,petals=instances(g,smallLeaf,p.petal,count*6,'flower-petals');
  const centers=instances(g,pebbleGeometry,p.pollen,count,'flower-centers');
  const leaves=instances(g,smallLeaf,p.leaf,count*2,'flower-leaves'),stems=[];
  let index=0;
  for(const [x,y,z]of positions)for(let j=0;j<2;j++) {
    const end=v(x+(j-.5)*.12,y+.28+rng()*.2,z+(rng()-.5)*.14),base=v(x,y,z);
    stems.push(curvedBranch([base,base.clone().lerp(end,.55).add(v(.02,0,0)),end],.007,.003,5,5));
    place(centers,index,end,rotation.identity(),v(.025,.013,.025));
    for(let petal=0;petal<6;petal++) {
      const a=petal*TAU/6,dir=v(Math.cos(a),.12,Math.sin(a));
      place(petals,index*6+petal,end,leafFacing(dir),v(.09,.085,.09),index%4?'#e7dfc4':'#d0aa76');
    }
    for(let k=0;k<2;k++) {
      const a=index*2.4+k*Math.PI;
      place(leaves,index*2+k,base.clone().lerp(end,.35+k*.23),leafFacing(v(Math.cos(a),.5,Math.sin(a))),v(.14,.16,.14),'#6e8852');
    }
    index++;
  }
  branches(g,stems,p.stem);return g;
}
