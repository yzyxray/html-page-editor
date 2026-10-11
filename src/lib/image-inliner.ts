/**
 * 把 HTML 里的图片尽量内联成 data URL，产出更接近「自包含」的页面。
 *
 * 这是 Chrome 扩展抓取功能上线前的「最轻量兜底」：
 *   - 相对路径图片 → 需要用户提供「页面来源 URL」作为基准才能解析成绝对地址；
 *   - 绝对地址图片 → 尝试 fetch + canvas 转 dataURL，但浏览器跨域限制下，
 *     只有图片服务器返回了 Access-Control-Allow-Origin 才会成功，否则按失败跳过。
 *
 * 失败的图片不会改坏原 HTML（保留原 src），所以这一步是安全的、可重试的。
 */
export interface ImageInlineResult {
  html: string;
  total: number;
  /** 成功内联成 data URL 的数量 */
  inlined: number;
  /** 本来就是 data: 的，无需处理 */
  skipped: number;
  /** 解析失败 / 跨域 / 网络失败，保留原 src 不动 */
  failed: { url: string; reason: string }[];
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(blob);
  });
}

export async function inlineImagesInHtml(
  html: string,
  baseUrl?: string
): Promise<ImageInlineResult> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const imgs = Array.from(doc.querySelectorAll('img'));
  const failed: { url: string; reason: string }[] = [];
  let inlined = 0;
  let skipped = 0;

  const tasks = imgs.map(async (img) => {
    const raw = img.getAttribute('src');
    if (!raw) return;
    if (raw.startsWith('data:')) {
      skipped++;
      return;
    }
    // 相对路径需要基准地址才能解析成绝对地址
    let abs: string;
    try {
      abs = baseUrl ? new URL(raw, baseUrl).href : new URL(raw).href;
    } catch {
      failed.push({
        url: raw,
        reason: '无法解析为绝对地址（相对路径但未提供页面来源 URL）',
      });
      return;
    }
    try {
      const resp = await fetch(abs, { mode: 'cors' });
      if (!resp.ok) {
        failed.push({ url: abs, reason: `HTTP ${resp.status}` });
        return;
      }
      const blob = await resp.blob();
      const dataUrl = await blobToDataUrl(blob);
      img.setAttribute('src', dataUrl);
      inlined++;
    } catch {
      failed.push({ url: abs, reason: '跨域或网络失败（图片服务器未允许 CORS）' });
    }
  });

  await Promise.all(tasks);

  return {
    html: doc.documentElement.outerHTML,
    total: imgs.length,
    inlined,
    skipped,
    failed,
  };
}
