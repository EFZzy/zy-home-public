import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/books/[[path]].js';
import { books, courses } from '../src/library.js';
import { getPdfUrl } from '../src/book-url.js';

const payload = new TextEncoder().encode('%PDF-1.7\n0123456789\n%%EOF');
const key = 'books/example/示例.pdf';
const metadata = { size: payload.length, etag: 'version1', httpEtag: '"version1"', uploaded: new Date('2026-10-24T00:00:00Z') };
function bucket() {
  return {
    async head(name) { return name === key ? metadata : null; },
    async get(name, options) {
      if (name !== key) return null;
      const range = options?.range;
      const bytes = range ? payload.slice(range.offset, range.offset + range.length) : payload;
      return { ...metadata, body: new Blob([bytes]).stream() };
    },
  };
}
function read({ method = 'GET', headers, path = getPdfUrl({ url: '/' + key }), env = { books: bucket() } } = {}) {
  return onRequest({ request: new Request('https://example.com' + path, { method, headers }), env });
}

test('R2 文件通过同源地址流式返回，中文文件名内联预览且不公开缓存', async () => {
  const response = await read();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'application/pdf');
  assert.match(response.headers.get('Content-Disposition'), /^inline;.*filename\*=UTF-8''/);
  assert.ok(response.headers.get('Content-Disposition').endsWith(encodeURIComponent('示例.pdf')));
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('Content-Length'), String(payload.length));
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), payload);
});

test('PDF 浏览器读取支持字节区间、开放尾部、后缀和范围裁剪', async () => {
  for (const [range, start, end] of [['bytes=0-4',0,4],['bytes=5-',5,payload.length-1],['bytes=-5',payload.length-5,payload.length-1],['bytes=2-999',2,payload.length-1]]) {
    const response = await read({ headers: { Range: range } });
    assert.equal(response.status, 206, range);
    assert.equal(response.headers.get('Content-Range'), `bytes ${start}-${end}/${payload.length}`);
    assert.equal(response.headers.get('Content-Length'), String(end-start+1));
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), payload.slice(start,end+1));
  }
});

test('越界区间返回 416，多段区间忽略，If-Range 失配返回完整文件', async () => {
  for (const range of ['bytes=999-','bytes=5-2','bytes=-0']) {
    const response = await read({ headers: { Range: range } });
    assert.equal(response.status,416);
    assert.equal(response.headers.get('Content-Range'),`bytes */${payload.length}`);
  }
  for (const headers of [{Range:'bytes=0-1,3-4'},{Range:'bytes=0-4','If-Range':'"old"'},{Range:'bytes=0-4','If-Range':'W/"version1"'}]) {
    const response = await read({headers});assert.equal(response.status,200);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()),payload);
  }
  assert.equal((await read({headers:{Range:'bytes=0-4','If-Range':'"version1"'}})).status,206);
});

test('HEAD 返回完整元数据，无响应体；错误路径不会退回 HTML', async () => {
  const response = await read({method:'HEAD',headers:{Range:'bytes=0-4'}});
  assert.equal(response.status,200);assert.equal(await response.text(),'');
  assert.equal(response.headers.get('Content-Length'),String(payload.length));
  assert.equal((await read({path:'/books/missing.pdf'})).status,404);
  assert.equal((await read({path:'/books/file.html'})).status,404);
  assert.equal((await read({path:'/books/%E0%A4%A.pdf'})).status,400);
  assert.equal((await read({path:'/books/%2e%2e%2fsecret.pdf'})).status,404);
  assert.equal((await read({method:'POST'})).status,405);
  assert.equal((await read({env:{}})).status,503);
});

test('R2 文件在区间读取中被替换时退回完整最新版本', async () => {
  const storage=bucket();const original=storage.get;
  storage.get=async (name,options)=>options?.onlyIf?metadata:original(name);
  const response=await read({headers:{Range:'bytes=0-4'},env:{books:storage}});
  assert.equal(response.status,200);assert.equal(response.headers.get('Content-Range'),null);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()),payload);
});

test('公开版书架没有预置课程、资料或文件地址', () => {
  assert.deepEqual(courses, []);
  assert.deepEqual(books, []);
});

test('特殊文件名不会变成查询参数', () => {
  const special={url:'/books/课程/50% #? &.pdf'};
  const url=new URL(getPdfUrl(special),'https://example.com');
  assert.equal(url.search,'');assert.equal(url.hash,'');assert.equal(decodeURIComponent(url.pathname),special.url);
});
