import type { ExportOptions } from '../types';

/**
 * 体积分级与导出降级策略
 *
 * 为什么要分级：
 *   本项目的落地页产物是「单文件自包含」—— 图片全部内联成 base64 dataURL，
 *   体积天然比原始页面膨胀约 33%。竞品落地页常见 2-5MB，含图后轻易到 8-20MB。
 *
 *   而现有导出管线里有两处对全文做字符串/正则操作的地方，大页面下会显著劣化：
 *     · beautifyHtml      —— replace('>\s*<', '>\n<').split('\n') 会把整篇 HTML
 *                            拆成数十万元素的数组再 map 再 join，20MB 时必然爆内存；
 *     · cleanEditorAttrs  —— 连续 5 次全文正则 replace，每次都生成一份新的大字符串，
 *                            峰值内存翻倍。
 *   再叠加 CleanerPanel 的高亮预览（全文 split + map + join），
 *   大页面足以让标签页长时间无响应。
 *
 *   因此这里把「体积」提升为一个一等公民：超过阈值时自动跳过这些昂贵步骤，
 *   保证流程能跑完，同时把「跳过了什么、为什么」如实告诉用户。
 */

// ── 阈值 ──
/** ≤ 该值：正常全流程 */
export const SIZE_EDITABLE = 5 * 1024 * 1024; // 5MB
/** > SIZE_EDITABLE 且 ≤ SIZE_OVERSIZE：跳过全文美化与属性清理 */
export const SIZE_LARGE = SIZE_EDITABLE;
/** > 该值：红色告警，需用户显式确认才能继续 */
export const SIZE_OVERSIZE = 15 * 1024 * 1024; // 15MB
/** > 该值：硬阻断，浏览器已无法可靠处理 */
export const SIZE_HARD_LIMIT = 40 * 1024 * 1024; // 40MB

export type SizeTier = 'normal' | 'large' | 'oversize' | 'blocked';

export interface ExportStrategy {
  /** 是否执行 beautifyHtml（对全文 split/map/join） */
  beautify: boolean;
  /** 是否执行 cleanEditorAttrs（5 次全文正则） */
  cleanEditorAttrs: boolean;
  minify: boolean;
  /** 是否跳过 inlineStyles（大页面时那些第三方 CSS 的 fetch 本就必然因 CORS 失败） */
  skipInlineStyles: boolean;
  /** 被跳过的步骤及原因，直接展示给用户 */
  warnings: string[];
}

/** 按字节数判定体积分级 */
export function classifySize(bytes: number): SizeTier {
  if (bytes > SIZE_HARD_LIMIT) return 'blocked';
  if (bytes > SIZE_OVERSIZE) return 'oversize';
  if (bytes > SIZE_LARGE) return 'large';
  return 'normal';
}

/** 各分级的用户提示文案 */
export const SIZE_TIER_MESSAGES: Record<SizeTier, { title: string; body: string; tone: 'info' | 'warn' | 'danger' }> = {
  normal: {
    title: '',
    body: '',
    tone: 'info',
  },
  large: {
    title: '页面较大',
    body: '体积超过 5MB。建议先在「清洗」步骤移除不需要的模块和图片再编辑——导出时将自动跳过程序美化与编辑器属性清理，以保证不卡死。',
    tone: 'warn',
  },
  oversize: {
    title: '页面非常大',
    body: '体积超过 15MB。可视化编辑器载入这类页面会明显卡顿。建议先在「清洗」步骤精简，或直接用「复制源码」/「下载 HTML」绕过编辑器。你也可以选择继续。',
    tone: 'danger',
  },
  blocked: {
    title: '页面超出处理上限',
    body: '体积超过 40MB，已超出浏览器可可靠处理的范围。请先用外部工具裁剪页面，或改用「粘贴源码」配合「下载 HTML」直接取用。',
    tone: 'danger',
  },
};

/** 字节数格式化（B / KB / MB），面板间共用避免重复实现 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 根据体积与用户选项，决定导出时实际执行哪些步骤。
 * 超阈值时自动关闭对大字符串不友好的步骤，并把原因写进 warnings。
 */
export function decideExportStrategy(bytes: number, options: ExportOptions): ExportStrategy {
  const tier = classifySize(bytes);
  const warnings: string[] = [];

  if (tier === 'normal') {
    return {
      beautify: !options.minify,
      cleanEditorAttrs: options.cleanEditorAttrs,
      minify: options.minify,
      skipInlineStyles: false,
      warnings,
    };
  }

  // large / oversize / blocked 一律降级
  warnings.push(
    `页面体积 ${formatBytes(bytes)} 超过 ${formatBytes(SIZE_EDITABLE)}，已自动跳过程序美化（beautify）与编辑器属性清理（cleanEditorAttrs）——这两步会对整篇 HTML 做全文 split 与多轮正则替换，是大页面卡死的主因。输出格式为原样，如需可读性更好的排版请在小页面下使用。`
  );

  // inlineStyles 在浏览器里 fetch 第三方 CSS 必然被 CORS 拒绝，
  // 大页面上还会额外发起大量注定失败的请求，直接跳过。
  if (options.inlineStyles) {
    warnings.push(
      '已跳过「内联 CSS」：浏览器无法跨域读取第三方样式表，该步骤对外部 CSS 本就会失败。由扩展抓取时已在抓取阶段完成 CSS 内联。'
    );
  }

  // minify 是全文正则替换，同样昂贵，且与 beautify 互斥
  if (options.minify) {
    warnings.push('已跳过「压缩输出」：大页面下全文正则替换开销过高，且会与美化步骤冲突。');
  }

  return {
    beautify: false,
    cleanEditorAttrs: false,
    minify: false,
    skipInlineStyles: true,
    warnings,
  };
}