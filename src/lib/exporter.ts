import type { DetectedScript, AddedScript, ExportOptions } from '../types';
import { TRACKING_TEMPLATES } from './tracking-templates';

export interface ExportResult {
  html: string;
  size: number;
  warnings: string[];
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
      warnings.push(`获取 CSS 失败: ${href}（将保留外部引用）`);
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

function beautifyHtml(html: string): string {
  let indent = 0;
  const lines = html
    .replace(/>\s*</g, '>\n<')
    .split('\n');

  return lines
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
}

export async function exportHtml(
  html: string,
  options: ExportOptions,
  detectedScripts: DetectedScript[],
  addedScripts: AddedScript[] = []
): Promise<ExportResult> {
  let result = html;
  const warnings: string[] = [];

  // 1. Inline CSS
  if (options.inlineStyles) {
    const inlineResult = await inlineStyles(result);
    result = inlineResult.html;
    warnings.push(...inlineResult.warnings);
  }

  // 2. Inject tracking scripts (含替换的和新增的)
  result = injectTrackingScripts(result, detectedScripts, addedScripts);

  // 3. Clean editor attributes
  if (options.cleanEditorAttrs) {
    result = cleanEditorAttrs(result);
  }

  // 4. Minify or Beautify
  if (options.minify) {
    result = minifyHtml(result);
  } else {
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
