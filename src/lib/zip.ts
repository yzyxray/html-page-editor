/**
 * 极简 zip 打包（STORE 模式，单文件）
 *
 * 为什么手写而不引依赖：
 *   Cloudflare Pages Direct Upload API 要求 multipart 提交一个 zip（字段名 file），
 *   而本项目只往 zip 里放一个 `index.html`，用不到 deflate 压缩，也用不到多条目目录。
 *   为此引入 jszip 之类的库不划算，且会改动 package.json / package-lock.json，
 *   存在破坏 Cloudflare Pages `npm ci` 的风险。
 *
 * 产物形态说明：
 *   当前的落地页产物是「单文件自包含」—— 图片已由编辑阶段内联成 base64 dataURL，
 *   因此 zip 内只有 index.html 一个条目。若将来改为多文件项目目录产物，
 *   需要把本实现扩展为支持多 entry（中央目录需逐条累加偏移量）。
 */

// ── CRC-32 (标准多项式 0xEDB88320) ──
const CRC32_TABLE: number[] = (() => {
  const t = new Array<number>(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC32_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/**
 * 生成一个只含单个条目的 STORE-only zip。
 *
 * @param filename zip 内的条目名（不带路径），例如 `index.html`
 * @param data     该条目的字节内容
 * @returns zip 字节流，可直接包成 Blob 上传或交给浏览器下载
 */
export function makeZip(filename: string, data: Uint8Array): Uint8Array {
  const enc = new TextEncoder();
  const nameBytes = enc.encode(filename);
  const crc = crc32(data);
  const size = data.length;
  const now = new Date();
  const dosTime = ((now.getHours() & 0x1f) << 11) | ((now.getMinutes() & 0x3f) << 5) | ((now.getSeconds() / 2) & 0x1f);
  const dosDate = (((now.getFullYear() - 1980) & 0x7f) << 9) | (((now.getMonth() + 1) & 0xf) << 5) | (now.getDate() & 0x1f);
  const localHeaderSize = 30 + nameBytes.length;
  const cdSize = 46 + nameBytes.length;
  const total = localHeaderSize + size + cdSize + 22;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  let p = 0;
  // Local file header
  dv.setUint32(p, 0x04034b50, true); p += 4;
  dv.setUint16(p, 20, true); p += 2; dv.setUint16(p, 0, true); p += 2; dv.setUint16(p, 0, true); p += 2;
  dv.setUint16(p, dosTime, true); p += 2; dv.setUint16(p, dosDate, true); p += 2;
  dv.setUint32(p, crc, true); p += 4; dv.setUint32(p, size, true); p += 4; dv.setUint32(p, size, true); p += 4;
  dv.setUint16(p, nameBytes.length, true); p += 2; dv.setUint16(p, 0, true); p += 2;
  out.set(nameBytes, p); p += nameBytes.length;
  // File data
  out.set(data, p); p += size;
  // Central directory
  dv.setUint32(p, 0x02014b50, true); p += 4;
  dv.setUint16(p, 20, true); p += 2; dv.setUint16(p, 20, true); p += 2;
  dv.setUint16(p, 0, true); p += 2; dv.setUint16(p, 0, true); p += 2;
  dv.setUint16(p, dosTime, true); p += 2; dv.setUint16(p, dosDate, true); p += 2;
  dv.setUint32(p, crc, true); p += 4; dv.setUint32(p, size, true); p += 4; dv.setUint32(p, size, true); p += 4;
  dv.setUint16(p, nameBytes.length, true); p += 2; dv.setUint16(p, 0, true); p += 2; dv.setUint16(p, 0, true); p += 2;
  dv.setUint16(p, 0, true); p += 2; dv.setUint16(p, 0, true); p += 2; dv.setUint32(p, 0, true); p += 4; dv.setUint32(p, 0, true); p += 4;
  out.set(nameBytes, p); p += nameBytes.length;
  // End of central directory
  dv.setUint32(p, 0x06054b50, true); p += 4;
  dv.setUint16(p, 0, true); p += 2; dv.setUint16(p, 0, true); p += 2;
  dv.setUint16(p, 1, true); p += 2; dv.setUint16(p, 1, true); p += 2;
  dv.setUint32(p, cdSize, true); p += 4; dv.setUint32(p, localHeaderSize + size, true); p += 4;
  dv.setUint16(p, 0, true); p += 2;
  return out;
}

/**
 * 把 HTML 文本打包成一个名为 index.html 的 zip，并返回可直接下载的 Blob。
 */
export function buildZipBlob(html: string): Blob {
  const bytes = new TextEncoder().encode(html);
  const zipBytes = makeZip('index.html', bytes);
  return new Blob([zipBytes], { type: 'application/zip' });
}