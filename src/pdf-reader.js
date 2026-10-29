import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { getPdfUrl } from './book-url.js';

GlobalWorkerOptions.workerSrc=workerUrl;

export function mountPdfReader(root,book){
  const stage=root.querySelector('[data-pdf-stage]'),canvas=root.querySelector('[data-pdf-canvas]');
  const status=root.querySelector('[data-pdf-status]'),pageInput=root.querySelector('[data-pdf-page]');
  const total=root.querySelector('[data-pdf-total]'),previous=root.querySelector('[data-pdf-prev]'),next=root.querySelector('[data-pdf-next]');
  let pdf=null,pageNumber=1,zoom=1,renderTask=null,generation=0,disposed=false,resizeTimer;
  const task=getDocument({url:getPdfUrl(book),cMapUrl:'/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdfjs/standard_fonts/',wasmUrl:'/pdfjs/wasm/',isEvalSupported:false});
  function setStatus(text){status.textContent=text;status.hidden=!text;}
  function controls(){pageInput.value=pageNumber;pageInput.max=pdf?.numPages??1;total.textContent=pdf?.numPages??'…';previous.disabled=!pdf||pageNumber<=1;next.disabled=!pdf||pageNumber>=pdf.numPages;pageInput.disabled=!pdf;}
  async function render(){
    if(!pdf||disposed)return;
    const job=++generation;setStatus('正在显示…');
    const old=renderTask;if(old){old.cancel();try{await old.promise;}catch{}if(job!==generation||disposed)return;}
    try{
      const page=await pdf.getPage(pageNumber);if(job!==generation||disposed)return;
      const base=page.getViewport({scale:1}),padding=innerWidth<600?24:48;
      const scale=Math.max(150,stage.clientWidth-padding)/base.width*zoom;
      const viewport=page.getViewport({scale}),ratio=Math.min(devicePixelRatio||1,2);
      canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);
      canvas.style.width=`${viewport.width}px`;canvas.style.height=`${viewport.height}px`;
      canvas.setAttribute('aria-label',`${book.title}，第 ${pageNumber} 页，共 ${pdf.numPages} 页`);
      renderTask=page.render({canvas,viewport,transform:ratio!==1?[ratio,0,0,ratio,0,0]:null,background:'#ffffff'});
      await renderTask.promise;if(job!==generation||disposed)return;
      setStatus('');stage.scrollTop=0;root.querySelector('[data-pdf-zoom]').textContent=`${Math.round(zoom*100)}%`;
      stage.dataset.renderedPage=String(pageNumber);controls();
    }catch(error){if(disposed||job!==generation||error.name==='RenderingCancelledException')return;console.error('PDF 渲染失败',error);setStatus('页面暂时无法显示，请使用「在新窗口打开」或下载原文件。');}
  }
  function go(value){if(!pdf)return;const number=Number(value);if(!Number.isFinite(number)){controls();return;}pageNumber=Math.max(1,Math.min(pdf.numPages,Math.round(number)));controls();render();}
  previous.addEventListener('click',()=>go(pageNumber-1));next.addEventListener('click',()=>go(pageNumber+1));
  pageInput.addEventListener('change',()=>go(pageInput.value));pageInput.addEventListener('keydown',event=>{if(event.key==='Enter')go(pageInput.value);});
  root.querySelector('[data-pdf-minus]').addEventListener('click',()=>{zoom=Math.max(.4,zoom/1.25);render();});
  root.querySelector('[data-pdf-plus]').addEventListener('click',()=>{zoom=Math.min(3,zoom*1.25);render();});
  root.querySelector('[data-pdf-fit]').addEventListener('click',()=>{zoom=1;render();});
  stage.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'){event.preventDefault();go(pageNumber-1);}if(event.key==='ArrowRight'){event.preventDefault();go(pageNumber+1);}});
  controls();setStatus('正在打开 PDF…');
  task.promise.then(document=>{if(disposed){document.destroy();return;}pdf=document;controls();render();}).catch(error=>{if(disposed)return;console.error('PDF 打开失败',error);setStatus('PDF 暂时无法打开，请下载原文件后阅读。');});
  let lastWidth=stage.clientWidth;
  const observer=new ResizeObserver(()=>{if(stage.clientWidth===lastWidth)return;lastWidth=stage.clientWidth;clearTimeout(resizeTimer);resizeTimer=setTimeout(render,120);});observer.observe(stage);
  return ()=>{disposed=true;generation++;clearTimeout(resizeTimer);observer.disconnect();renderTask?.cancel();task.destroy().catch(()=>{});};
}
