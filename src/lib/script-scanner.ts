import type { DetectedScript, ScriptType } from '../types';

const SCRIPT_PATTERNS: { type: ScriptType; patterns: RegExp[] }[] = [
  {
    type: 'google-tag-manager',
    patterns: [/googletagmanager\.com\/gtm\.js/, /googletagmanager\.com\/ns\.html/, /GTM-[A-Z0-9]+/],
  },
  {
    type: 'google-analytics-ga4',
    patterns: [/googletagmanager\.com\/gtag\/js\?id=G-/, /gtag\('config',\s*'G-/],
  },
  {
    type: 'google-analytics-ua',
    patterns: [/google-analytics\.com\/analytics\.js/, /ga\('create',\s*'UA-/],
  },
  {
    type: 'facebook-pixel',
    patterns: [/connect\.facebook\.net\/\w+\/fbevents\.js/, /fbq\(/, /facebook\.com\/tr/],
  },
  {
    type: 'anytrack',
    patterns: [/anytrack\.(io|com|net)/, /anTrack\./, /anytrack\.init/],
  },
  {
    type: 'bing-ads',
    patterns: [/bat\.bing\.com\/bat\.js/, /uetq\.push/, /bing\.com\/uet/],
  },
  {
    type: 'tiktok-pixel',
    patterns: [/analytics\.tiktok\.com/, /ttq\./, /tiktok\.com\/share\/business/],
  },
  {
    type: 'linkedin-insight',
    patterns: [/snap\.licdn\.com\/li\.lms-analytics\/insight\.min\.js/, /_linkedin_partner_id/],
  },
  {
    type: 'hotjar',
    patterns: [/hotjar\.com/, /hjid=\d+/, /hj\(/],
  },
  {
    type: 'clarity',
    patterns: [/clarity\.ms\/tag/, /clarity/, /microsoft\.com\/ms\.js/],
  },
];

const FUNCTIONAL_PATTERNS: RegExp[] = [
  /tailwindcss\.com/,
  /cdnjs\.cloudflare\.com\/.*jquery/,
  /unpkg\.com/,
  /cdn\.jsdelivr\.net/,
  /bootstrap/,
  /fontawesome/,
  /googleapis\.com\/css/,
];

function identifyScriptType(source: string, codeText: string): ScriptType {
  const combined = source + ' ' + codeText;

  // Check functional scripts first
  for (const pattern of FUNCTIONAL_PATTERNS) {
    if (pattern.test(combined)) {
      return 'functional';
    }
  }

  // Check tracking scripts
  for (const { type, patterns } of SCRIPT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(combined)) {
        return type;
      }
    }
  }

  return 'other-tracking';
}

function getCodePreview(element: HTMLScriptElement): string {
  if (element.textContent) {
    const trimmed = element.textContent.trim();
    return trimmed.length > 120 ? trimmed.substring(0, 120) + '...' : trimmed;
  }
  return element.src ? `外部脚本: ${element.src.substring(0, 100)}` : '(空脚本)';
}

function getFullCode(element: HTMLScriptElement): string {
  // 优先返回内部脚本内容；外部脚本返回 src 和属性信息
  if (element.textContent && element.textContent.trim()) {
    return element.textContent.trim();
  }
  // 外部脚本：返回完整标签
  return element.outerHTML;
}

export function scanScripts(html: string): DetectedScript[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const scriptElements = doc.querySelectorAll('script');
  const detected: DetectedScript[] = [];

  scriptElements.forEach((script, index) => {
    const source = script.src || script.getAttribute('data-src') || '';
    const codeText = script.textContent || '';
    const type = identifyScriptType(source, codeText);

    let action: DetectedScript['action'] = 'keep';
    if (type === 'functional') {
      action = 'keep';
    } else if (type === 'google-analytics-ua' || type === 'hotjar' || type === 'clarity') {
      action = 'remove';
    } else {
      action = 'replace';
    }

    detected.push({
      id: `script-${index}`,
      type,
      source,
      codePreview: getCodePreview(script),
      fullCode: getFullCode(script),
      action,
    });
  });

  return detected;
}

/**
 * 按脚本处置结果重写 HTML：移除标记为 remove 的脚本，把标记为 replace 的脚本替换为调用方提供的代码。
 *
 * ⚠️ 注意：目前没有任何调用方使用本函数（死代码）。
 * `ScriptManagerPanel.handleApplyToHtml` 独立实现了同一件事，两者行为并不等价：
 *   - 本函数是纯函数，替换代码由 `getReplacementCode` 回调提供，且**不处理**用户新增脚本；
 *   - handleApplyToHtml 直接读取组件状态，并且额外承担了「注入用户新增脚本到 head/body」的职责，
 *     其 head/body 判定依据是脚本类型模板，而本函数依据 `script.dataset.tracker || script.closest('head')`。
 * 因此两者合并会改变替换脚本的注入位置，风险大于收益。刻意保持现状，改动前请先确认注入位置不被影响。
 */
export function applyScriptActions(
  html: string,
  scripts: DetectedScript[],
  getReplacementCode: (id: string) => string
): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const scriptElements = doc.querySelectorAll('script');

  let headReplacements = '';
  let bodyReplacements = '';

  scriptElements.forEach((script, index) => {
    const scriptInfo = scripts[index];
    if (!scriptInfo) return;

    if (scriptInfo.action === 'remove') {
      script.remove();
    } else if (scriptInfo.action === 'replace') {
      const newCode = getReplacementCode(scriptInfo.id);
      if (script.dataset.tracker || script.closest('head')) {
        headReplacements += newCode;
      } else {
        bodyReplacements += newCode;
      }
      script.remove();
    }
    // 'keep' — do nothing
  });

  // Inject replacement scripts
  if (headReplacements) {
    const head = doc.querySelector('head');
    if (head) {
      head.insertAdjacentHTML('beforeend', headReplacements);
    }
  }
  if (bodyReplacements) {
    const body = doc.querySelector('body');
    if (body) {
      body.insertAdjacentHTML('beforeend', bodyReplacements);
    }
  }

  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}
