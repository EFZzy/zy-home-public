import './style.css';
import { House } from './scene.js';
import { rooms,books,courses,projects,journal } from './content.js';
import { getPdfUrl } from './book-url.js';

const $=s=>document.querySelector(s);
const panel=$('#panel'),body=$('#panel-body');
let house=null,activeRoom=null,noteTimer=null,toastTimer=null,audio=null,pdfCleanup=null;
const storage={get(key,fallback=''){try{return localStorage.getItem(`zy-house:${key}`)??fallback;}catch{return fallback;}},set(key,value){try{localStorage.setItem(`zy-house:${key}`,value);return true;}catch{return false;}}};
let introDismissed=storage.get('intro-seen')==='yes';
$('#intro').hidden=introDismissed;
function dismissIntro(){introDismissed=true;$('#intro').hidden=true;storage.set('intro-seen','yes');}
$('#year').textContent=new Date().getFullYear();
$('#room-nav').innerHTML=rooms.map(r=>`<button class="room-link" data-room="${r.id}" aria-label="进入${r.name}"><span class="room-number">${r.number}</span><span class="room-text"><strong>${r.name}</strong><small>${r.en.replace('THE ','')}</small></span></button>`).join('');
$('#room-nav').addEventListener('click',e=>{const b=e.target.closest('[data-room]');if(b)goRoom(b.dataset.room);});
function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,3000);}
function openPanel(kicker,html,view=''){pdfCleanup?.();pdfCleanup=null;panel.className=view;$('#panel-kicker').textContent=kicker;body.innerHTML=html;if(!panel.open)panel.showModal();panel.scrollTop=0;house?.keys.clear();}
function closePanel(){panel.close();house?.keys.clear();}
$('#panel-close').addEventListener('click',closePanel);
panel.addEventListener('close',()=>{if(!panel.open){pdfCleanup?.();pdfCleanup=null;}});
panel.addEventListener('click',e=>{if(e.target===panel){const r=panel.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closePanel();}});
function goRoom(id){closePanel();if(house&&!house.hasEntered)return;if(!house){dismissIntro();showRoomContent(id);return;}if(house.current===id&&!house.transition)return;document.body.classList.add('transitioning');house.enter(id);}
function leaveRoom(){closePanel();if(!house){activeRoom=null;return;}if(house.transition||!house.current)return;document.body.classList.add('transitioning');house.exit();}
function roomChanged(room){activeRoom=room;document.body.classList.toggle('in-room',!!room);document.body.classList.remove('exploring');$('#intro').hidden=introDismissed||!!room;$('#room-caption').hidden=!room;$('#back').hidden=!room;$('#movement').hidden=!!room;$('#room-actions').hidden=!room;
  document.querySelectorAll('.room-link').forEach(b=>{const selected=b.dataset.room===room?.id;b.classList.toggle('selected',selected);b.setAttribute('aria-current',selected?'location':'false');});
  $('#scene-no').textContent=room?`${room.number} / ${room.en}`:'00 / THE CORRIDOR';$('#scene-name').textContent=room?room.subtitle:'思想的回廊';
  if(room){$('#room-eyebrow').textContent=`ROOM ${room.number} / ${room.en}`;$('#room-title').textContent=room.name;$('#room-description').textContent=room.description;
    const actions=room.id==='study'?[['shelf','浏览书架'],['desk','打开书桌'],['lamp','开 / 关台灯']]:[[room.id,{'gallery':'查看作品','lab':'试试单摆','journal':'翻阅手记','music':'播放背景音乐','about':'关于 ZY'}[room.id]]];
    $('#room-actions').innerHTML=actions.map(([id,text])=>`<button data-action="${id}">${text} </button>`).join('');
  }
}
$('#room-actions').addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b)interact(b.dataset.action);});
$('#room-content').addEventListener('click',()=>showRoomContent(activeRoom?.id));
$('#explore').addEventListener('click',()=>goRoom('study'));
$('#back').addEventListener('click',leaveRoom);
$('.brand').addEventListener('click',e=>{e.preventDefault();leaveRoom();if(!activeRoom)document.body.classList.remove('exploring');});
$('#home-nav').addEventListener('click',()=>{if(activeRoom)leaveRoom();else document.body.classList.remove('exploring');});
$('#step-forward').addEventListener('click',()=>house?.step(-5));$('#step-back').addEventListener('click',()=>house?.step(5));
$('#enter-house').addEventListener('click',()=>house?.openEntrance());
$('#map-open').addEventListener('click',showMap);$('#about-nav').addEventListener('click',()=>showAbout());
function showMap(){openPanel('FIND YOUR ROOM',`<h2 id="panel-title">房间索引</h2><p class="panel-lead">选一扇门，开始这次小小的拜访。</p><div class="room-index">${rooms.map(r=>`<button class="index-row" data-enter="${r.id}"><span class="index-number">${r.number}</span><span><strong>${r.name}</strong><small>${r.en}</small></span></button>`).join('')}</div><p class="demo-note">也可以在走廊中滚动前进，拖动环顾，直接点击房门进入。</p>`);body.querySelectorAll('[data-enter]').forEach(b=>b.addEventListener('click',()=>goRoom(b.dataset.enter)));}
function formatBytes(bytes){return bytes>=1024*1024?`${(bytes/1024/1024).toFixed(1)} MB`:`${Math.ceil(bytes/1024)} KB`;}
const shelfSelections=new Map();
let shelfCourse=courses[0]?.id;
function collectionLabel(collection){const course=courses.find(item=>collection.startsWith(item.name));return course?collection.slice(course.name.length):collection;}
function bookButton(book,compact=false){
  if(compact)return `<button class="book-card" data-book="${book.id}" style="--book-color:${book.color}"><span class="book-cover">${book.title}</span><span class="book-card-text"><small>${book.collection} · PDF</small><strong>${book.title}</strong><p>${book.edition} · ${formatBytes(book.bytes)}</p></span></button>`;
  return `<button class="shelf-book" data-book="${book.id}" aria-label="打开 PDF：${book.title}" style="--book-color:${book.color}"><span class="shelf-cover"><span class="cover-course">${book.category} / ${courses.find(course=>course.id===book.course)?.en??''}</span><span class="cover-line"></span><strong class="${book.title.length>18?'long-title':''}">${book.title}</strong><span class="cover-footer">${collectionLabel(book.collection)} <span>${book.number}</span></span></span><span class="shelf-book-title">${book.title}</span><span class="shelf-book-meta">PDF · ${formatBytes(book.bytes)}</span></button>`;
}
function bindBooks(container){container.querySelectorAll('[data-book]').forEach(button=>button.addEventListener('click',()=>readBook(button.dataset.book)));}
function showShelf(){
  if(!books.length){
    openPanel('THE STUDY / LIBRARY', '<h2 id="panel-title">书架</h2><p class="panel-lead">书架暂时是空的。<br />为下一次阅读，留一个位置。</p>', 'library-panel');
    return;
  }
  const sections=courses.map(course=>{
    const items=books.filter(book=>book.course===course.id),collections=[...new Set(items.map(book=>book.collection))];
    const selected=shelfSelections.get(course.id)??collections[0];
    const groups=collections.map((collection,index)=>{
      const groupBooks=items.filter(book=>book.collection===collection),rows=[];
      for(let i=0;i<groupBooks.length;i+=4)rows.push(`<div class="shelf-row" role="group" aria-label="${collection}第 ${rows.length+1} 排">${groupBooks.slice(i,i+4).map(book=>bookButton(book)).join('')}</div>`);
      return `<div class="shelf-rows" id="shelf-${course.id}-${index}" data-collection="${collection}" ${collection===selected?'':'hidden'}>${rows.join('')}</div>`;
    }).join('');
    return `<section class="course-shelf" id="course-shelf-${course.id}" data-course="${course.id}" aria-labelledby="course-${course.id}" ${course.id===shelfCourse?'':'hidden'}><div class="course-heading"><div><span class="eyebrow">${course.en}</span><h3 id="course-${course.id}">${course.name}<small>${course.description}</small></h3></div><span class="course-count">${items.length} 份 PDF</span></div><div class="collection-switch" role="group" aria-label="${course.name}资料分类">${collections.map((collection,index)=>`<button data-select-collection="${collection}" aria-controls="shelf-${course.id}-${index}" aria-pressed="${collection===selected}">${collectionLabel(collection)}<span>${items.filter(book=>book.collection===collection).length}</span></button>`).join('')}</div>${groups}</section>`;
  }).join('');
  const courseSwitch=courses.length>1?`<div class="collection-switch course-switch" role="group" aria-label="选择课程">${courses.map(course=>`<button data-select-course="${course.id}" aria-controls="course-shelf-${course.id}" aria-pressed="${course.id===shelfCourse}">${course.name}<span>${books.filter(book=>book.course===course.id).length}</span></button>`).join('')}</div>`:'';
  openPanel('THE STUDY / COURSE LIBRARY',`<div class="library-heading"><div><h2 id="panel-title">课程书架</h2><p class="panel-lead">分门别类，慢慢翻阅。</p></div><span class="library-count">${courses.length} 门课程 · ${books.length} 份资料</span></div>${courseSwitch}${sections}`,'library-panel');
  bindBooks(body);
  body.querySelectorAll('[data-select-course]').forEach(button=>button.addEventListener('click',()=>{
    shelfCourse=button.dataset.selectCourse;
    body.querySelectorAll('[data-select-course]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
    body.querySelectorAll('[data-course]').forEach(section=>section.hidden=section.dataset.course!==shelfCourse);
  }));
  body.querySelectorAll('[data-select-collection]').forEach(button=>button.addEventListener('click',()=>{
    const section=button.closest('[data-course]'),selected=button.dataset.selectCollection;
    shelfSelections.set(section.dataset.course,selected);
    section.querySelectorAll('[data-select-collection]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
    section.querySelectorAll('[data-collection]').forEach(group=>group.hidden=group.dataset.collection!==selected);
  }));
}
function readBook(id){
  const book=books.find(item=>item.id===id);if(!book)return;
  shelfCourse=book.course;
  shelfSelections.set(book.course,book.collection);
  const saved=storage.get(`bookmark:${id}`)==='yes',url=getPdfUrl(book);
  openPanel(`${book.category.toUpperCase()} / PDF READER`,
    `<div class="pdf-heading"><div><h2 id="panel-title">${book.title}</h2><p>${book.category} · ${book.collection} · ${formatBytes(book.bytes)}</p></div><button id="shelf-back" class="text-button">← 返回书架</button></div><div class="pdf-toolbar"><button id="bookmark">${saved?'已加入书签 ✓':'加入书签 ＋'}</button><div><a href="${url}" target="_blank" rel="noopener">在新窗口打开</a><a href="${url}" download="${book.filename}">下载 PDF</a></div></div><div class="pdf-page-controls" aria-label="PDF 阅读控制"><div><button data-pdf-prev disabled>上一页</button><label><input data-pdf-page type="number" min="1" value="1" inputmode="numeric" aria-label="PDF 页码" disabled> / <span data-pdf-total>…</span></label><button data-pdf-next disabled>下一页</button></div><div><button data-pdf-minus aria-label="缩小 PDF">−</button><span data-pdf-zoom>100%</span><button data-pdf-plus aria-label="放大 PDF">＋</button><button data-pdf-fit>适应宽度</button></div></div><div class="pdf-frame-wrap"><div class="pdf-stage" data-pdf-stage tabindex="0" role="region" aria-label="PDF 阅读区"><canvas class="pdf-canvas" data-pdf-canvas></canvas></div><p class="pdf-load-status" data-pdf-status role="status">正在打开 PDF…</p></div><p class="pdf-reader-note">可翻页、输入页码或缩放阅读，也可以下载原文件。</p>`, 'pdf-panel');
  const session={active:true,destroy:null};pdfCleanup=()=>{session.active=false;session.destroy?.();};
  import('./pdf-reader.js').then(({mountPdfReader})=>{if(session.active&&panel.open)session.destroy=mountPdfReader(body,book);}).catch(error=>{if(!session.active)return;console.error(error);body.querySelector('[data-pdf-status]').textContent='阅读器加载失败，请在新窗口打开或下载原文件。';});
  $('#shelf-back').addEventListener('click',showShelf);
  $('#bookmark').addEventListener('click',()=>{const next=storage.get(`bookmark:${id}`)!=='yes';if(storage.set(`bookmark:${id}`,next?'yes':'no')){$('#bookmark').textContent=next?'已加入书签 ✓':'加入书签 ＋';toast(next?'书签已保存在此浏览器':'已移除书签');}else toast('浏览器未允许存储，暂时无法保存书签');});
}
function showDesk(tab='notes'){openPanel('THE STUDY / WRITING DESK',`<h2 id="panel-title">留下一点思考</h2><p class="panel-lead">有时，一句话就足够成为一个新的开始。</p><div class="desk-tabs"><button data-tab="notes" class="${tab==='notes'?'selected':''}">随手记</button><button data-tab="bookmarks" class="${tab==='bookmarks'?'selected':''}">我的书签</button></div><div id="desk-body"></div>`);body.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>showDesk(b.dataset.tab)));
  const d=$('#desk-body');if(tab==='bookmarks'){const marked=books.filter(book=>storage.get(`bookmark:${book.id}`)==='yes');d.innerHTML=marked.length?`<div class="book-grid">${marked.map(book=>bookButton(book,true)).join('')}</div>`:'<p class="panel-lead">这里还没有书签。<br />打开一本 PDF，点击「加入书签」，下次就能在这里找到它。</p>';bindBooks(d);return;}
  d.innerHTML='<label class="note-label" for="note">此刻，想记下什么？</label><textarea class="notebook" id="note" maxlength="10000" placeholder="一个灵感、一段读后感，或者今天的小发现……"></textarea><div class="note-footer"><span id="note-status">仅保存在当前浏览器，不会上传</span><button id="save-note" class="primary-button">保存笔记 </button></div><p class="demo-note">笔记会自动保存。清除浏览器数据后会丢失；这里的笔记也不会同步给其他访客。</p>';
  $('#note').value=storage.get('note');const note=$('#note'),status=$('#note-status');const save=()=>{const ok=storage.set('note',note.value);status.textContent=ok?'已保存到此浏览器 ✓':'保存失败，请复制保留文字';return ok;};note.addEventListener('input',()=>{clearTimeout(noteTimer);status.textContent='正在保存…';noteTimer=setTimeout(save,350);});$('#save-note').addEventListener('click',()=>{clearTimeout(noteTimer);toast(save()?'笔记已保存，下次回来还在':'保存失败，请复制保留文字');});
}
function showGallery(){openPanel('THE GALLERY / SELECTED WORKS',`<h2 id="panel-title">从想法到作品</h2><p class="panel-lead">用一点好奇心，一点耐心，把脑海中的画面带到现实。</p><div class="project-list">${projects.map((p,i)=>`<article class="project-card"><div class="project-art" style="--project-color:${p.color}">${['⌂','◐','✳'][i]}</div><div><small>${p.type}</small><h3>${p.title}</h3><p>${p.text}</p></div></article>`).join('')}</div><p class="demo-note">除本站以外，以上作品为占位示例，等待换成你的真实作品。</p>`);}
function showJournal(){openPanel('THE JOURNAL / SMALL OBSERVATIONS',`<h2 id="panel-title">日常里的微光</h2><p class="panel-lead">一些不成体系的观察，一些还在路上的思考。</p>${journal.map(e=>`<article class="journal-entry"><small>${e.date}</small><h3>${e.title}</h3><p>${e.text}</p></article>`).join('')}<p class="demo-note">以上为本站演示随笔，可替换为你的真实记录。</p>`);}
function showLab(){openPanel('THE LABORATORY / A SIMPLE PENDULUM',`<h2 id="panel-title">让好奇心摆动</h2><p class="panel-lead">同样是一个单摆，摆长改变，节奏会怎样变化？</p><div class="lab-demo"><div class="pendulum"><div class="pendulum-arm" id="pendulum-arm"></div></div><label class="lab-controls" for="pendulum-length">摆长 L <input type="range" id="pendulum-length" min=".2" max="2" step=".1" value="1" /><output id="length-output">1.0 m</output></label><p class="formula">T = 2π √(L / g) ≈ <span id="period-output">2.01</span> s</p><p class="panel-lead">摆线越长，来回一次的时间越长。小角度下，周期主要取决于摆长和重力加速度，与摆球质量无关。</p><p class="demo-note">取 g = 9.81 m/s²；示意图使用小角度近似，忽略空气阻力。动画展示理想单摆的节奏，并非数值求解。</p></div>`);
  const update=()=>{const l=Number($('#pendulum-length').value),t=2*Math.PI*Math.sqrt(l/9.81);$('#length-output').textContent=`${l.toFixed(1)} m`;$('#period-output').textContent=t.toFixed(2);$('#pendulum-arm').style.setProperty('--period',`${t/2}s`);$('#pendulum-arm').style.height=`${75+l*25}px`;};$('#pendulum-length').addEventListener('input',update);update();}
function showAbout(){openPanel('THE LIVING ROOM / ABOUT THIS PLACE',`<h2 id="panel-title">你好，我是 ZY。</h2><p class="panel-lead">欢迎来到栖间。<br />这是一间建在浏览器里的小房子，也是一份仍在生长的个人主页。</p><div class="info-list"><article><h3>给阅读一个位置</h3><p>在书房里收藏好书，记录那些让自己停下来思考的句子。</p></article><article><h3>把想法慢慢做出来</h3><p>在作品室和实验室里，保留尝试的过程，也展示完成的结果。</p></article><article><h3>也留一点生活</h3><p>文字、音乐、日常的观察，不必宏大，但值得拥有自己的角落。</p></article><article><h3>关于这个空间</h3><p>场景与插画由程序独立构建。灵感来自 ITom 的空间式个人主页，走廊连接六个可进入的房间。</p></article></div><p class="demo-note">当前是可编辑的初版，个人介绍、作品与书单均待替换。此页面没有配置真实邮箱或社交链接。</p>`);}
async function toggleAudio(){
  try{
    if(!audio){
      audio=new Audio('/audio/lullaby.mp3');
      audio.loop=true;audio.volume=.35;audio.preload='none';
      for(const event of ['play','pause','error'])audio.addEventListener(event,syncMusicPanel);
    }
    if(!audio.paused){audio.pause();toast('背景音乐已暂停');}
    else{await audio.play();if(!audio.paused)toast('背景音乐已开启 · Lullaby');}
    syncMusicPanel();
  }catch(error){
    if(error.name==='AbortError')return;
    audio?.pause();syncMusicPanel();toast('背景音乐暂时无法播放，请稍后重试');
  }
}
function syncMusicPanel(){
  const on=!!audio&&!audio.paused,b=$('#music-toggle'),disc=$('.music-disc');
  document.body.classList.toggle('sound-on',on);
  $('#sound').setAttribute('aria-label',on?'暂停背景音乐':'播放背景音乐');
  $('#sound').setAttribute('title',on?'暂停背景音乐':'播放背景音乐');
  $('#sound').setAttribute('aria-pressed',String(on));
  if(b){b.innerHTML=`${on?'暂停背景音乐':'播放背景音乐'} <span>${on?'Ⅱ':'▷'}</span>`;b.setAttribute('aria-pressed',String(on));}
  disc?.classList.toggle('playing',on);
}
function showMusic(){openPanel('THE LISTENING ROOM / SLOW DOWN',`<div class="music-panel"><h2 id="panel-title">把时间交给声音</h2><div class="music-disc" aria-hidden="true"></div><p>Lullaby<br />适合阅读、发呆，或什么都不做。</p><button id="music-toggle" class="primary-button">播放背景音乐 <span>▷</span></button><p class="demo-note">点击播放，音乐会循环陪伴你。<br />右上角的音乐按钮也可以随时播放或暂停。</p></div>`);$('#music-toggle').addEventListener('click',toggleAudio);syncMusicPanel();}
$('#sound').addEventListener('click',toggleAudio);
function showRoomContent(id){const fn={study:showShelf,gallery:showGallery,lab:showLab,journal:showJournal,music:showMusic,about:showAbout}[id];fn?.();}
function interact(action,id){if(action==='audio'){toggleAudio();return;}if(action==='lamp'){const on=house?.toggleLamp();toast(on?'台灯亮了，继续读吧。':'台灯已熄灭。');return;}if(action==='context-lost'){toast('三维画面已暂停，请刷新恢复；房间索引仍可使用。');return;}if(action==='book'){readBook(id);return;}({shelf:showShelf,desk:showDesk,gallery:showGallery,lab:showLab,journal:showJournal,music:showMusic,about:showAbout}[action])?.();}
try{
  house=new House($('#world'),{lightingMode:storage.get('lighting','auto'),onFeedback:toast,onEnter:()=>{document.body.classList.remove('before-entry','entering','exploring','transitioning');$('#entrance-ui').hidden=true;$('main').inert=false;$('.footer').inert=false;$('.footer').hidden=false;roomChanged(null);if(!introDismissed)storage.set('intro-seen','yes');},onTravel:room=>{if(room!==undefined)dismissIntro();const status=$('#walk-status');status.hidden=room===undefined;status.textContent=room===undefined?'':room?`正在走向${room.name}… · Esc 可停止`:'正在走回走廊… · Esc 可停止';},onRoom:roomChanged,onInteract:interact,onExplore:()=>{dismissIntro();document.body.classList.add('exploring');},onReady:()=>{document.body.classList.remove('booting');$('#loading').classList.add('ready');setTimeout(()=>$('#loading').hidden=true,700);}});
}catch(error){
  console.error('3D 场景初始化失败',error);$('#loading').innerHTML='<div style="max-width:380px;padding:30px"><h1 class="fallback-title">欢迎来到栖间</h1><p class="fallback-description">当前浏览器无法启动三维画面。你仍然可以通过下方的房间索引，阅读书架、记录笔记和浏览其他内容。</p><button id="fallback-start" class="primary-button">打开房间索引 </button></div>';$('#fallback-start').addEventListener('click',()=>{$('#loading').hidden=true;showMap();});$('#world').hidden=true;document.body.classList.remove('before-entry','booting');$('#entrance-ui').hidden=true;$('main').inert=false;$('.footer').inert=false;
}

const toolsPanel=$('#scene-tools');
function refreshSceneTools(){
  if(!house)return;
  document.querySelectorAll('[data-time]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.time===house.lighting.mode)));
  const nearby=house.availableObjects(),groups=new Map();
  nearby.forEach(object=>{const label=object.userData.label??'查看物件';if(!groups.has(label))groups.set(label,object);});
  const list=$('#nearby-objects');list.replaceChildren();
  if(!groups.size)list.textContent='走近房门或物件，发现更多互动。';
  for(const [label,object]of groups){const button=document.createElement('button');button.textContent=label;button.addEventListener('click',()=>{toolsPanel.hidden=true;$('#scene-settings').setAttribute('aria-expanded','false');$('#world').focus();house.activate(object);});list.append(button);}
}
$('#scene-settings').addEventListener('click',()=>{toolsPanel.hidden=!toolsPanel.hidden;$('#scene-settings').setAttribute('aria-expanded',String(!toolsPanel.hidden));refreshSceneTools();if(!toolsPanel.hidden)toolsPanel.querySelector('[aria-pressed=true]').focus();});
$('#scene-tools-close').addEventListener('click',()=>{toolsPanel.hidden=true;$('#scene-settings').setAttribute('aria-expanded','false');$('#scene-settings').focus();});
document.querySelectorAll('[data-time]').forEach(button=>button.addEventListener('click',()=>{
  if(!house)return;house.lighting.setMode(button.dataset.time);storage.set('lighting',button.dataset.time);refreshSceneTools();
}));
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!toolsPanel.hidden){toolsPanel.hidden=true;$('#scene-settings').setAttribute('aria-expanded','false');$('#scene-settings').focus();}});
if(import.meta.env.DEV)window.__house=house;
