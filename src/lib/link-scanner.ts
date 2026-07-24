import type { LinkInfo } from '../types';

export function scanLinks(html: string): LinkInfo[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const links: LinkInfo[] = [];
  let id = 0;

  const extractDomain = (url: string): string => {
    try {
      return new URL(url).hostname;
    } catch {
      return url.split('/')[0] || url.substring(0, 40);
    }
  };

  // Scan <a href>
  doc.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      links.push({
        id: `link-${id++}`,
        originalHref: href,
        text: a.textContent?.trim().substring(0, 80) || '',
        domain: extractDomain(href),
        element: 'a',
      });
    }
  });

  // Scan <img src>
  doc.querySelectorAll('img[src]').forEach((img) => {
    const src = img.getAttribute('src') || '';
    if (src) {
      links.push({
        id: `link-${id++}`,
        originalHref: src,
        text: img.getAttribute('alt')?.substring(0, 80) || '',
        domain: extractDomain(src),
        element: 'img',
      });
    }
  });

  // Scan <form action>
  doc.querySelectorAll('form[action]').forEach((form) => {
    const action = form.getAttribute('action') || '';
    if (action) {
      links.push({
        id: `link-${id++}`,
        originalHref: action,
        text: '(表单)',
        domain: extractDomain(action),
        element: 'form',
      });
    }
  });

  // Scan <iframe src>
  doc.querySelectorAll('iframe[src]').forEach((iframe) => {
    const src = iframe.getAttribute('src') || '';
    if (src) {
      links.push({
        id: `link-${id++}`,
        originalHref: src,
        text: '(iframe)',
        domain: extractDomain(src),
        element: 'iframe',
      });
    }
  });

  return links;
}

export interface DomainGroup {
  domain: string;
  count: number;
  links: LinkInfo[];
}

export function groupByDomain(links: LinkInfo[]): DomainGroup[] {
  const map = new Map<string, LinkInfo[]>();
  links.forEach((link) => {
    const existing = map.get(link.domain) || [];
    existing.push(link);
    map.set(link.domain, existing);
  });

  return Array.from(map.entries())
    .map(([domain, links]) => ({ domain, count: links.length, links }))
    .sort((a, b) => b.count - a.count);
}

export function applyLinkReplacements(
  html: string,
  replacements: { original: string; replacement: string }[]
): string {
  let result = html;
  replacements.forEach(({ original, replacement }) => {
    const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'g');
    // 使用函数形式避免 replacement 中的 $ 字符被解释为特殊模式
    result = result.replace(regex, () => replacement);
  });
  return result;
}
