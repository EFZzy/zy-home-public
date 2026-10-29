// /books/课程/文件.pdf -> R2 中的 books/课程/文件.pdf。
// 可选的同源 PDF 代理；公开空白版未绑定任何存储桶。
const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
};

function message(request, text, status, extra = {}) {
  return new Response(request.method === 'HEAD' ? null : text, {
    status,
    headers: { ...privateHeaders, 'Content-Type': 'text/plain; charset=utf-8', ...extra },
  });
}

function pdfHeaders(object, key) {
  const headers = new Headers(privateHeaders);
  const filename = key.split('/').at(-1);
  headers.set('Content-Type', 'application/pdf');
  headers.set('Content-Disposition', `inline; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase())}`);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('ETag', object.httpEtag);
  headers.set('Last-Modified', object.uploaded.toUTCString());
  return headers;
}

// 不支持多段 Range 时按 HTTP 规则忽略它；合法但超出文件范围时返回 416。
function byteRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value ?? '');
  if (!match || (!match[1] && !match[2])) return null;
  let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  let end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return false;
  return { offset: start, length: end - start + 1 };
}

export async function onRequest({ request, env }) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return message(request, 'Method not allowed', 405, { Allow: 'GET, HEAD' });
  }

  let key;
  try {
    // 从原始 URL 解码一次，保留中文、空格及文件名中的字面百分号。
    key = decodeURIComponent(new URL(request.url).pathname.slice(1));
  } catch {
    return message(request, 'Invalid path', 400);
  }
  if (!key.startsWith('books/') || !key.toLowerCase().endsWith('.pdf') ||
      /[\u0000-\u001f\u007f\\]/.test(key) || key.split('/').some(part => !part || part === '.' || part === '..')) {
    return message(request, 'PDF not found', 404);
  }
  if (!env.books) return message(request, 'PDF storage unavailable', 503);

  try {
    let range = null;
    let metadata;
    if (request.method === 'HEAD' || request.headers.has('Range')) {
      metadata = await env.books.head(key);
      if (!metadata) return message(request, 'PDF not found', 404);
      const headers = pdfHeaders(metadata, key);
      headers.set('Content-Length', String(metadata.size));
      // HEAD 应返回完整资源的元数据，不对它应用 Range。
      if (request.method === 'HEAD') return new Response(null, { headers });

      const ifRange = request.headers.get('If-Range');
      const unchanged = !ifRange || ifRange === metadata.httpEtag ||
        (!ifRange.startsWith('"') && !ifRange.startsWith('W/') &&
          Date.parse(ifRange) >= Math.floor(metadata.uploaded.getTime() / 1000) * 1000);
      if (unchanged) range = byteRange(request.headers.get('Range'), metadata.size);
      if (range === false) {
        return message(request, 'Range not satisfiable', 416, { 'Content-Range': `bytes */${metadata.size}` });
      }
    }

    let object = await env.books.get(key, range ? {
      range, onlyIf: { etagMatches: metadata.etag },
    } : undefined);
    if (!object) return message(request, 'PDF not found', 404);
    if (!('body' in object)) {
      // head 和 get 之间文件被替换时，重新读取完整文件，避免返回错误的分段。
      range = null;
      object = await env.books.get(key);
      if (!object) return message(request, 'PDF not found', 404);
    }
    const headers = pdfHeaders(object, key);
    headers.set('Content-Length', String(range ? range.length : object.size));
    if (range) headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`);
    return new Response(object.body, { status: range ? 206 : 200, headers });
  } catch (error) {
    console.error('R2 PDF read failed', error);
    return message(request, 'PDF storage temporarily unavailable', 502);
  }
}
