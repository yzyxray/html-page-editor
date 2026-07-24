import type { CleanOptions } from '../types';

const TRACKING_PIXEL_PATTERNS = [
  'facebook.com/tr',
  'google-analytics.com/collect',
  'bat.bing.com/action',
  'analytics.tiktok.com',
  'px.ads.linkedin.com',
  'clarity.ms/collect',
  'doubleclick.net',
  'match.prod.bidr.io',
  'ih.adscale.de',
  'ad.doubleclick.net',
  'googleadservices.com',
  'googlesyndication.com',
  'ads.linkedin.com',
];

export interface CleanResult {
  html: string;
  removedItems: { type: string; count: number; samples: string[] }[];
}

function hasSourceMatch(element: Element, patterns: string[]): boolean {
  const src = element.getAttribute('src') || '';
  const dataSrc = element.getAttribute('data-src') || '';
  const combined = src + dataSrc;
  return patterns.some((p) => combined.includes(p));
}

export function cleanHtml(html: string, options: CleanOptions): CleanResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const removedItems: CleanResult['removedItems'] = [];

  // 1. Remove JSON-LD
  if (options.removeJSONLD) {
    const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
    const samples: string[] = [];
    jsonLdScripts.forEach((s) => {
      const preview = (s.textContent || '').trim().substring(0, 80);
      if (samples.length < 3) samples.push(preview);
      s.remove();
    });
    if (jsonLdScripts.length > 0) {
      removedItems.push({ type: 'JSON-LD 结构化数据', count: jsonLdScripts.length, samples });
    }
  }

  // 2. Remove tracking pixels
  if (options.removeTrackingPixels) {
    const images = doc.querySelectorAll('img');
    let pixelCount = 0;
    const samples: string[] = [];

    images.forEach((img) => {
      const width = parseInt(img.getAttribute('width') || '0', 10);
      const height = parseInt(img.getAttribute('height') || '0', 10);
      const isTrackingPixel =
        (width <= 1 && height <= 1) ||
        img.getAttribute('style')?.includes('display:none') ||
        hasSourceMatch(img, TRACKING_PIXEL_PATTERNS);

      if (isTrackingPixel) {
        const src = img.getAttribute('src') || '';
        if (samples.length < 3) samples.push(src.substring(0, 80));
        img.remove();
        pixelCount++;
      }
    });

    if (pixelCount > 0) {
      removedItems.push({ type: '追踪像素 (1x1 / 隐藏图片)', count: pixelCount, samples });
    }
  }

  // 3. Remove HTML comments
  if (options.removeComments) {
    const comments: string[] = [];
    const treeWalker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_COMMENT);
    const nodesToRemove: Node[] = [];
    let node: Node | null;

    while ((node = treeWalker.nextNode())) {
      const text = (node.textContent || '').trim();
      if (text && comments.length < 3) comments.push(text.substring(0, 80));
      nodesToRemove.push(node);
    }

    nodesToRemove.forEach((n) => {
      if (n.parentNode) {
        n.parentNode.removeChild(n);
      }
    });
    if (nodesToRemove.length > 0) {
      removedItems.push({ type: 'HTML 注释', count: nodesToRemove.length, samples: comments });
    }
  }

  // 4. Remove empty nodes
  if (options.removeEmptyNodes) {
    const emptyTags = ['div', 'span', 'p', 'section', 'article', 'aside', 'header', 'footer'];
    let emptyCount = 0;
    const maxIterations = 5;

    for (let iter = 0; iter < maxIterations; iter++) {
      let foundEmpty = false;
      emptyTags.forEach((tag) => {
        const elements = doc.querySelectorAll(tag);
        elements.forEach((el) => {
          const text = el.textContent?.trim() || '';
          const hasChildren = el.children.length > 0;
          const hasAttrs = el.attributes.length > 0;
          const hasStyle = el.getAttribute('style') || el.getAttribute('class');

          if (!text && !hasChildren && !hasAttrs) {
            el.remove();
            emptyCount++;
            foundEmpty = true;
          } else if (!text && !hasChildren && el.attributes.length === 1 && hasStyle) {
            // Only has style/class — might be a spacer, still remove
            const style = el.getAttribute('style') || '';
            const className = el.getAttribute('class') || '';
            if (!style.includes('background') && !className.includes('bg-')) {
              el.remove();
              emptyCount++;
              foundEmpty = true;
            }
          }
        });
      });
      if (!foundEmpty) break;
    }

    if (emptyCount > 0) {
      removedItems.push({ type: '空白节点', count: emptyCount, samples: [`移除了 ${emptyCount} 个空元素`] });
    }
  }

  return {
    html: `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`,
    removedItems,
  };
}
