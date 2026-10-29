import * as THREE from 'three';
import { shapedBox } from './modeling.js';
import { batchDetails } from './interior-details.js';

const palette = new Map();
function material(color, metal = false) {
  const key = `${color}:${metal}`;
  if (!palette.has(key)) palette.set(key, new THREE.MeshStandardMaterial({ color, roughness: metal ? .38 : .76, metalness: metal ? .55 : 0 }));
  return palette.get(key);
}
function mesh(parent, geometry, color, x, y, z, metal = false) {
  const object = new THREE.Mesh(geometry, typeof color === 'string' ? material(color, metal) : color);
  object.position.set(x, y, z);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}
function block(parent, width, height, depth, x, y, z, color, metal = false) {
  return shapedBox(parent,[width,height,depth],[x,y,z],typeof color==='string'?material(color,metal):color);
}
function disc(parent, radius, depth, x, y, z, color, metal = false) {
  const object = mesh(parent, new THREE.CylinderGeometry(radius, radius, depth, 40), color, x, y, z, metal);
  object.rotation.x = Math.PI / 2;
  return object;
}
function ring(parent, radius, thickness, x, y, z, color, arc = Math.PI * 2) {
  return mesh(parent, new THREE.TorusGeometry(radius, thickness, 8, 48, arc), color, x, y, z, true);
}
function panel(parent, x, y, width, height, fill, trim, z = .1) {
  block(parent, width, height, .04, x, y, z, fill);
  block(parent, width-.14, height-.14, .025, x, y, z+.027, fill);
  for (const side of [-1, 1]) {
    // 竖边止于横边内缘，转角不叠放两张同深度的表面。
    block(parent, .065, height - .065, .085, x + side * width / 2, y, z + .045, trim);
    block(parent, width + .065, .065, .085, x, y + side * height / 2, z + .045, trim);
    block(parent, .018, height-.124, .025, x+side*(width/2-.053), y, z+.052,trim);
    block(parent, width-.07,.018,.025,x,y+side*(height/2-.053),z+.052,trim);
  }
}
function lever(parent, color, x = 1.95) {
  block(parent, .11, .29, .04, x, 1.38, .12, color, true);
  disc(parent, .05, .12, x, 1.4, .18, color, true);
  block(parent, .29, .045, .055, x - .1, 1.4, .245, color, true);
  disc(parent,.036,.016,x,1.22,.15,color,true);
  disc(parent,.011,.018,x,1.225,.161,'#394437');
}
function face(parent, back = false) {
  const group = new THREE.Group();
  if (back) { group.position.x = 2.24; group.rotation.y = Math.PI; }
  parent.add(group);
  return group;
}
function studyDoor(g) {
  panel(g, 1.12, 2.35, 1.73, 1.58, '#294537', '#a39565');
  panel(g, 1.12, .68, 1.73, .94, '#293d30', '#a39565');
  // 大幅打开的书：弧形书页、书封、书沟与文字行，从走廊远处也能认出。
  const book = new THREE.Group();
  book.position.set(1.12, 2.31, .18);
  g.add(book);
  for (const side of [-1, 1]) {
    const leaf = new THREE.Group();
    leaf.rotation.y = side * .12;
    book.add(leaf);
    const shape = new THREE.Shape();
    shape.moveTo(0, -.47);
    shape.lineTo(side * .64, -.35);
    shape.lineTo(side * .64, .49);
    shape.quadraticCurveTo(side * .32, .59, 0, .37);
    shape.closePath();
    const cover = mesh(leaf, new THREE.ExtrudeGeometry(shape, { depth: .035, bevelEnabled: false }), '#ae8c50', 0, 0, 0);
    cover.scale.set(1.07, 1.07, 1);
    mesh(leaf, new THREE.ExtrudeGeometry(shape, { depth: .032, bevelEnabled: true, bevelSize: .006, bevelThickness: .006, bevelSegments: 1 }), side < 0 ? '#e8ddbd' : '#d9cda8', 0, 0, .055);
    for (let i = 0; i < 7; i++) block(leaf, i === 6 ? .28 : .43, .016, .012, side * .33, .27 - i * .085, .105, '#9c9b7c');
  }
  block(book, .025, .87, .08, 0, -.03, .08, '#a48f5f');
  block(book, .065, .25, .025, .09, -.46, .13, '#987653');
  // 下半部是真正有厚度的书脊与书托，形成一眼可辨的“小书架”。
  const colors = ['#92704c', '#baa675', '#64765b', '#ac8956', '#617780', '#9b7254', '#83916c'];
  const heights = [.49, .63, .55, .67, .5, .59, .54];
  for (let i = 0; i < colors.length; i++) {
    const x = .47 + i * .216, height = heights[i];
    block(g, .175, height, .09, x, .36 + height / 2, .16, colors[i]);
    for (const ratio of [.16, .83]) block(g, .13, .018, .012, x, .36 + height * ratio, .216, '#c9b584');
  }
  block(g, 1.63, .07, .15, 1.12, .3, .155, '#a38959');
  lever(g, '#b7a16b');
}
function galleryDoor(g) {
  panel(g, 1.12, 1.67, 1.76, 2.8, '#ddd1b1', '#b48953');
  panel(g, 1.12, 2.08, 1.31, 1.62, '#ece0c3', '#87663f', .17);
  // 门上的立体构成画，与房间内的作品呼应。
  disc(g, .27, .025, 1.36, 2.46, .24, '#af7653');
  const shape = block(g, .68, .59, .035, .99, 1.92, .25, '#5f7665');
  shape.rotation.z = -.22;
  block(g, .69, .13, .04, 1.2, 1.59, .28, '#c49b56');
  for (let i = 0; i < 3; i++) block(g, .7 - i * .12, .018, .03, 1.12, .73 - i * .085, .17, '#a4926c');
  disc(g, .09, .12, 1.96, 1.35, .23, '#c3ac79', true);
}
function labDoor(g) {
  panel(g, 1.12, 2.22, 1.75, 1.62, '#405c66', '#8d9d95');
  disc(g, .53, .065, 1.12, 2.28, .16, '#a6b8ae', true);
  disc(g, .455, .025, 1.12, 2.28, .205, '#bdcfc2');
  ring(g, .48, .025, 1.12, 2.28, .23, '#b9ad85');
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI / 6;
    disc(g, .018, .02, 1.12 + Math.cos(angle) * .505, 2.28 + Math.sin(angle) * .505, .21, '#677569', true);
  }
  for (const x of [.91, 1.33]) block(g, .016, .7, .025, x, 2.28, .234, '#819b8d');
  block(g, .8, .018, .025, 1.12, 2.28, .234, '#819b8d');
  panel(g, 1.12, .71, 1.52, .83, '#384f57', '#899b91');
  for (let i = 0; i < 6; i++) block(g, 1.19, .043, .035, 1.12, .44 + i * .108, .17, '#9fae9c');
  block(g, .08, .57, .1, 1.96, 1.38, .2, '#b0b6a1', true);
}
function journalDoor(g) {
  for (let i = 0; i < 8; i++) block(g, .24, 3.04, .035, .245 + i * .25, 1.64, .095, i % 2 ? '#976d4f' : '#a17a58');
  panel(g, 1.12, 2.37, 1.37, 1.13, '#665c45', '#b19a70', .14);
  const note = new THREE.Group(); note.position.set(1.08, 2.39, .2); note.rotation.z = -.065; g.add(note);
  block(note, .74, .82, .02, 0, 0, 0, '#e1d3b1');
  disc(note, .034, .035, 0, .32, .025, '#b6a16f', true);
  for (let i = 0; i < 5; i++) block(note, i % 2 ? .46 : .53, .014, .015, -.015, .17 - i * .105, .022, '#8b8b70');
  block(g, 1.16, .17, .05, 1.12, .67, .15, '#b59b68', true);
  block(g, .94, .06, .015, 1.12, .68, .185, '#5b513e');
  block(g, .085, .42, .08, 1.96, 1.35, .19, '#665039');
  for (const y of [1.13, 1.57]) disc(g, .037, .1, 1.96, y, .18, '#c3aa73', true);
}
function musicDoor(g) {
  panel(g, 1.12, 2.34, 1.64, 1.49, '#534852', '#b39a72');
  disc(g, .59, .045, 1.12, 2.36, .16, '#303730');
  for (const radius of [.32, .4, .48, .55]) ring(g, radius, .007, 1.12, 2.36, .19, '#62665b');
  disc(g, .17, .018, 1.12, 2.36, .2, '#b69762');
  disc(g, .032, .025, 1.12, 2.36, .22, '#414639');
  panel(g, 1.12, .79, 1.62, .93, '#454a41', '#9e8968');
  for (let i = 0; i < 13; i++) {
    const height = .26 + .39 * (.5 + .5 * Math.sin(i * .77));
    block(g, .047, height, .04, .48 + i * .107, .79, .17, '#baa37a');
  }
  disc(g, .075, .08, 1.97, 1.45, .15, '#b89f68', true);
  ring(g, .11, .021, 1.97, 1.34, .23, '#c8b17c');
}
function livingDoor(g) {
  // 不透明的拱形磨砂格窗，开门前不泄露尚未显现的房间。
  const radius = .69, spring = 2.22, bottom = 1.51;
  const shape = new THREE.Shape();
  shape.moveTo(-radius, bottom); shape.lineTo(radius, bottom); shape.lineTo(radius, spring);
  shape.absarc(0, spring, radius, 0, Math.PI, false); shape.lineTo(-radius, bottom);
  mesh(g, new THREE.ShapeGeometry(shape), '#d4d8bb', 1.12, 0, .125);
  ring(g, .735, .037, 1.12, spring, .16, '#c5b68b', Math.PI);
  for (const side of [-1, 1]) block(g, .06, spring - bottom, .055, 1.12 + side * .735, (spring + bottom) / 2, .16, '#c5b68b');
  block(g, 1.53, .06, .055, 1.12, bottom, .16, '#c5b68b');
  block(g, .04, 1.34, .045, 1.12, 2.2, .18, '#b5aa81');
  block(g, 1.37, .04, .045, 1.12, 2.15, .18, '#b5aa81');
  for (const x of [.65, 1.59]) panel(g, x, .76, .69, .89, '#747348', '#b6a679');
  lever(g, '#c2ad7e');
}
const designs = { study: studyDoor, gallery: galleryDoor, lab: labDoor, journal: journalDoor, music: musicDoor, about: livingDoor };

export function buildRoomDoor(frame, room, onEnter) {
  const pivot = new THREE.Group();
  pivot.name = `${room.id}-door`;
  pivot.userData.action = onEnter;
  pivot.position.set(-1.12, 0, -.06);
  frame.add(pivot);
  block(pivot, 2.24, 3.28, .14, 1.12, 1.64, 0, room.id === 'gallery' ? '#bb915f' : room.color);
  for(const y of [.43,1.64,2.85]){
    mesh(pivot,new THREE.CylinderGeometry(.035,.035,.2,20),'#b39c69',0,y,.015,true);
    for(const yy of [-.065,.065])ring(pivot,.036,.004,0,y+yy,.015,'#89764e').rotation.x=Math.PI/2;
    for(const back of [-1,1]){
      block(pivot,.14,.18,.018,.07,y,back*.083,'#b39c69',true);
      for(const yy of [-.052,.052])disc(pivot,.009,.008,.09,y+yy,back*.096,'#625c42',true);
    }
  }
  block(pivot,.017,.22,.095,2.243,1.4,0,'#aa996e',true);
  for (const back of [false, true]) designs[room.id](face(pivot, back));
  const trim = { study: '#8f815c', gallery: '#b49564', lab: '#728b8c', journal: '#9d7955', music: '#a98e69', about: '#b4a77d' }[room.id];
  for (const x of [-1.3, 1.3]) block(frame, .055, 3.38, .04, x, 1.72, .15, trim);
  if (room.id === 'gallery') {
    block(frame, 2.95, .11, .34, 0, 3.64, .02, '#b49b70');
    block(frame, 2.76, .045, .36, 0, 3.73, .02, '#cfbd94');
  } else if (room.id === 'study') {
    for (const x of [-1.24, 1.24]) for (const dx of [-.045, .045]) block(frame, .015, 2.9, .025, x + dx, 1.74, .155, '#8d8059');
  } else if (room.id === 'music') {
    for (const x of [-.94, -.47, 0, .47, .94]) block(frame, .21, .03, .04, x, 3.62, .17, '#bda578', true);
  } else if (room.id === 'about') {
    for (const x of [-1.24, 1.24]) disc(frame, .085, .035, x, 3.4, .17, '#c5b78b');
  } else if (room.id === 'journal') {
    block(frame, 2.74, .085, .27, 0, 3.62, .03, '#92724f');
  } else if (room.id === 'lab') {
    for (const x of [-1.24, 1.24]) for (const y of [.2, 3.37]) disc(frame, .027, .025, x, y, .16, '#829b95', true);
  }
  batchDetails(pivot);
  return pivot;
}
