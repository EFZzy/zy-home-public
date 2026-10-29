// 房间和展示文案集中在这里。当前条目为可替换的演示内容。
export const rooms = [
  { id: 'study', number: '01', name: '书房', en: 'THE STUDY', subtitle: '书页之间，自有天地。', description: '收藏那些值得反复翻开的书，也留下一点自己的思考。', side: -1, z: -5, color: '#385b49', icon: '▤' },
  { id: 'gallery', number: '02', name: '作品室', en: 'THE GALLERY', subtitle: '把想法，变成看得见的东西。', description: '一些探索、一些尝试。所有作品，都从一个小小的念头开始。', side: 1, z: -5, color: '#ae7d4d', icon: '◈' },
  { id: 'lab', number: '03', name: '实验室', en: 'THE LABORATORY', subtitle: '好奇心，是最好的出发点。', description: '从一个问题出发，看看它会把我们带到哪里。', side: -1, z: -17, color: '#4e6a75', icon: '⌘' },
  { id: 'journal', number: '04', name: '手记', en: 'THE JOURNAL', subtitle: '记下那些，不想忘记的瞬间。', description: '日常观察、未完成的思考，以及生活偶尔投来的光。', side: 1, z: -17, color: '#96674d', icon: '≋' },
  { id: 'music', number: '05', name: '听音室', en: 'THE LISTENING ROOM', subtitle: '让世界，暂时慢下来。', description: '落下唱针，在一段旋律里，给思绪放个假。', side: -1, z: -29, color: '#735c68', icon: '◎' },
  { id: 'about', number: '06', name: '会客厅', en: 'THE LIVING ROOM', subtitle: '很高兴，在这里遇见你。', description: '不用准备话题。进来坐坐，认识一下这个空间的主人。', side: 1, z: -29, color: '#77724d', icon: '✳' },
];
export { books, courses } from './library.js';
export const projects = [
  {title:'栖间 · 数字空间', type:'交互网站 / 本站', text:'把个人主页变成一条可以漫游的走廊，用空间组织阅读、创作与生活。', color:'#47644b'},
  {title:'光的轨迹', type:'作品占位 / 等待替换', text:'为摄影、插画和视觉实验留一个位置，等待新的故事。', color:'#ba8250'},
  {title:'从问题出发', type:'作品占位 / 等待替换', text:'这里可以放入你的课程项目、程序或研究笔记，再为作品添加详细介绍。', color:'#57757f'},
];
export const journal = [
  {date:'随笔 001',title:'为好奇心留一扇门',text:'有时候，一个随手记下的问题，会在很久以后长成一个新的方向。给它留个位置，不急着寻找标准答案。'},
  {date:'随笔 002',title:'在书页和屏幕之间',text:'纸书适合慢慢读，屏幕适合把想法做出来。这间数字书房，想在两者之间找到一点平衡。'},
  {date:'随笔 003',title:'空间也可以是一种目录',text:'当内容不再是一列链接，而是一扇门、一本书和一张桌子，浏览会不会变得更像一次拜访？'}
];
