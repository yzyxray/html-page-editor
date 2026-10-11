import type { DetectedScript, AddedScript, ExportOptions } from '../types';
import { TRACKING_TEMPLATES } from './tracking-templates';
import { decideExportStrategy } from './size-guard';
import { buildZipBlob } from './zip';

export interface ExportResult {
  html: string;
  size: number;
  warnings: string[];
  /** true 表示因体积超阈值而降级执行（跳过了部分昂贵步骤） */
  degraded: boolean;
  /** 被跳过的步骤名称，供 UI 如实告知用户 */
  skippedSteps: string[];
}

/**
 * Inline external CSS <link> tags by fetching their content.
 * Falls back gracefully if fetch fails.
 */
async function inlineStyles(html: string): Promise<{ html: string; warnings: string[] }> {
  const warnings: string[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const links = doc.querySelectorAll('link[rel="stylesheet"]');

  const fetchPromises = Array.from(links).map(async (link) => {
    const href = link.getAttribute('href');
    if (!href) {
      link.remove();
      return;
    }
    try {
      const response = await fetch(href);
      if (response.ok) {
        const css = await response.text();
        const style = doc.createElement('style');
        style.textContent = css;
        link.replaceWith(style);
      } else {
        warnings.push(`无法获取 CSS: ${href}`);
      }
    } catch {
      warnings.push(
        `无法内联 CSS: ${href}（已保留外部引用）。浏览器受同源策略限制，无法跨域读取第三方样式表——这是浏览器限制而非缺陷。若该页由扩展抓取，CSS 已在抓取阶段完成内联，不会走到这里。`
      );
    }
  });

  await Promise.all(fetchPromises);
  return {
    html: `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`,
    warnings,
  };
}

function injectTrackingScripts(
  html: string,
  detectedScripts: DetectedScript[],
  addedScripts: AddedScript[] = []
): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  let headScripts = '';
  let bodyScripts = '';

  detectedScripts.forEach((script) => {
    if (script.action === 'replace' && script.replacementId) {
      const headTemplate = TRACKING_TEMPLATES.find(
        (t) => t.type === script.type && t.placement === 'head'
      );
      const bodyTemplate = TRACKING_TEMPLATES.find(
        (t) => t.type === script.type && t.placement === 'body'
      );

      if (headTemplate) {
        headScripts += `<!-- Replaced: ${script.type} -->\n${headTemplate.generateCode(script.replacementId)}\n`;
      }
      if (bodyTemplate) {
        bodyScripts += `<!-- Replaced: ${script.type} -->\n${bodyTemplate.generateCode(script.replacementId)}\n`;
      }
    }
  });

  // 注入用户新增的脚本
  addedScripts.forEach((added) => {
    const marker = `<!-- Added: ${added.type} (${added.trackingId}) -->\n`;
    if (added.placement === 'head') {
      headScripts += marker + added.code + '\n';
    } else {
      bodyScripts += marker + added.code + '\n';
    }
  });

  if (headScripts) {
    const head = doc.querySelector('head');
    if (head) {
      head.insertAdjacentHTML('beforeend', headScripts);
    }
  }
  if (bodyScripts) {
    const body = doc.querySelector('body');
    if (body) {
      body.insertAdjacentHTML('beforeend', bodyScripts);
    }
  }

  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}

function cleanEditorAttrs(html: string): string {
  return html
    // 移除 data-gjs-* 属性
    .replace(/\s*data-gjs-[a-z-]+="[^"]*"/g, '')
    // 移除 GrapesJS 自动生成的 id="cmp-xxxxx" 属性（componentFirst 模式产生）
    .replace(/\s+id="cmp-[a-z0-9]+"/g, '')
    // 移除 <style> 中针对 #cmp-xxx 的 CSS 规则（componentFirst 产生的单元素样式）
    .replace(/#cmp-[a-z0-9]+\s*\{[^}]*\}/g, '')
    .replace(/#cmp-[a-z0-9]+,([^}]*\})/g, '$1')
    .replace(/,\s*#cmp-[a-z0-9]+/g, '')
    // 清理空 div 和多余空行
    .replace(/<div\s+>\s*<\/div>/g, '')
    .replace(/\n{3,}/g, '\n\n');
}

function minifyHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

/**
 * 需要原样保护、不参与缩进的元素内容。
 *
 * 这些标签内部是纯文本或另一种语法（CSS / JS），对它们做「按标签缩进」会：
 *   - 塞进大量无意义空格（实测一个 1.6MB 的字体 CSS 会被撑到 4.4MB，+15% 体积）；
 *   - 破坏 pre / textarea 里的原始排版。
 * 因此先把整块摘出来换成占位符，排版完再原样放回。
 */
const PRESERVE_BLOCK_RE = /<(style|script|pre|textarea)\b[^>]*>[\s\S]*?<\/\1>/gi;
const PRESERVE_PLACEHOLDER = '%%HLPRESERVE';

function beautifyHtml(html: string): string {
  // 1. 摘出 style / script / pre / textarea 整块，换成占位符
  const blocks: string[] = [];
  let masked = html.replace(PRESERVE_BLOCK_RE, (match) => {
    blocks.push(match);
    // 用 0-based 下标做占位符编号，与下方 blocks[idx] 的取值保持一致
    return PRESERVE_PLACEHOLDER + (blocks.length - 1);
  });

  // 2. 只对标记部分做缩进
  let indent = 0;
  const lines = masked
    .replace(/>\s*</g, '>\n<')
    .split('\n');

  const formatted = lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';

      // Decrease indent for closing tags
      if (trimmed.startsWith('</')) {
        indent = Math.max(0, indent - 1);
      }

      const result = '  '.repeat(indent) + trimmed;

      // Increase indent for opening tags (but not self-closing)
      if (
        trimmed.startsWith('<') &&
        !trimmed.startsWith('</') &&
        !trimmed.endsWith('/>') &&
        !trimmed.match(/<(meta|link|br|hr|img|input|source|embed|col|area|base|param|track|wbr)\b/)
      ) {
        indent++;
      }

      return result;
    })
    .filter((line) => line !== '')
    .join('\n');

  // 3. 把整块放回原位
  return formatted.replace(
    new RegExp(PRESERVE_PLACEHOLDER + '(\\d+)', 'g'),
    (_, idx) => blocks[Number(idx)] ?? ''
  );
}

export async function exportHtml(
  html: string,
  options: ExportOptions,
  detectedScripts: DetectedScript[],
  addedScripts: AddedScript[] = []
): Promise<ExportResult> {
  let result = html;
  const warnings: string[] = [];

  // 0. 按体积决定执行哪些步骤（超阈值自动跳过对大字符串不友好的步骤）
  const inputBytes = new Blob([result]).size;
  const strategy = decideExportStrategy(inputBytes, options);
  warnings.push(...strategy.warnings);

  const skippedSteps: string[] = [];
  if (!strategy.beautify) skippedSteps.push('程序美化');
  if (!strategy.cleanEditorAttrs) skippedSteps.push('编辑器属性清理');
  if (!strategy.minify && options.minify) skippedSteps.push('压缩输出');
  if (strategy.skipInlineStyles) skippedSteps.push('内联 CSS');

  // 1. Inline CSS（浏览器无法跨域读取第三方 CSS，大页面下直接跳过）
  if (options.inlineStyles && !strategy.skipInlineStyles) {
    const inlineResult = await inlineStyles(result);
    result = inlineResult.html;
    warnings.push(...inlineResult.warnings);
  }

  // 2. Inject tracking scripts (含替换的和新增的)
  result = injectTrackingScripts(result, detectedScripts, addedScripts);

  // 3. Clean editor attributes（5 次全文正则，大页面下跳过）
  if (options.cleanEditorAttrs && strategy.cleanEditorAttrs) {
    result = cleanEditorAttrs(result);
  }

  // 4. Minify or Beautify（beautifyHtml 会对全文 split/map/join，大页面下跳过）
  if (strategy.minify) {
    result = minifyHtml(result);
  } else if (strategy.beautify) {
    result = beautifyHtml(result);
  }

  // Ensure DOCTYPE
  if (!result.trim().toLowerCase().startsWith('<!doctype')) {
    result = '<!DOCTYPE html>\n' + result;
  }

  return {
    html: result,
    size: new Blob([result]).size,
    warnings,
    degraded: skippedSteps.length > 0,
    skippedSteps,
  };
}

export function downloadHtml(html: string, fileName: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.html') ? fileName : `${fileName}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Delay revocation to ensure the browser has initiated the download
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 把导出的 HTML 打包成 zip 并触发下载。
 *
 * zip 内只有 `index.html` 一个条目：产物形态是「单文件自包含」，
 * 图片已内联为 base64 dataURL，因此没有任何外链资源需要一并打包。
 * 这个 zip 可以直接拖进 Cloudflare Pages / Netlify / Vercel 等任意静态托管。
 */
export function downloadZip(html: string, fileName: string): void {
  const blob = buildZipBlob(html);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.zip') ? fileName : `${fileName}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
