import { build } from 'vite';
import { cp, readdir, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, basename, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
// 本地开发仍用 public/books；生产构建不把 PDF 复制到 Pages。
await build({ root, publicDir: false });
const publicRoot = resolve(root, 'public');
await cp(publicRoot, output, {
  recursive: true,
  filter: source => {
    const path = relative(publicRoot, source).split(/[\\/]/);
    return path[0] !== 'books' && !basename(source).startsWith('.');
  },
});
// 控制台直接上传不编译 functions，预编译成它支持的 advanced-mode Worker。
const workerOutput = await mkdtemp(resolve(tmpdir(), 'zy-pages-functions-'));
try {
  const result = spawnSync(process.execPath, [
    resolve(root, 'node_modules/wrangler/bin/wrangler.js'),
    'pages', 'functions', 'build', 'functions', '--outdir', workerOutput,
    '--output-routes-path', 'dist/_routes.json', '--minify',
  ], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Pages Functions 编译失败');
  // --outfile 输出的是上传用 multipart 数据；控制台需要 outdir 中的实际 JS。
  const modules = await readdir(workerOutput);
  if (modules.length !== 1 || modules[0] !== 'index.js') throw new Error('请检查 Functions 的模块输出');
  await cp(resolve(workerOutput, 'index.js'), resolve(output, '_worker.js'));
} finally {
  await rm(workerOutput, { recursive: true, force: true });
}
const files = await readdir(output, { recursive: true });
if (files.some(file => file.toLowerCase().endsWith('.pdf'))) {
  throw new Error('Pages 构建中不应包含 PDF；请将资料放到 R2。');
}
