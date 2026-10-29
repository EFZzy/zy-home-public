// 保持同源 /books/*，由 Pages Function 读取私有 R2；逐段编码中文和空格。
export function getPdfUrl(book) {
  return book.url.split('/').map(encodeURIComponent).join('/');
}
