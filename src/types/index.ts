export type ScriptType =
  | 'google-analytics-ua'
  | 'google-analytics-ga4'
  | 'google-tag-manager'
  | 'facebook-pixel'
  | 'anytrack'
  | 'bing-ads'
  | 'tiktok-pixel'
  | 'linkedin-insight'
  | 'hotjar'
  | 'clarity'
  | 'other-tracking'
  | 'functional';

export interface DetectedScript {
  id: string;
  type: ScriptType;
  source: string;
  codePreview: string;
  fullCode: string;        // 完整脚本源码（不截断），用于展开查看
  action: 'remove' | 'replace' | 'keep';
  replacementId?: string;
}

export interface AddedScript {
  id: string;                  // 唯一标识，如 'added-1700000000000'
  type: ScriptType;            // 模板类型，如 'google-analytics-ga4'
  trackingId: string;          // 用户输入的 ID，如 'G-XXXXXXXXXX'
  code: string;                // 生成的完整脚本代码
  placement: 'head' | 'body';  // 注入位置
}

export interface ReplaceRule {
  id: string;
  type: 'exact' | 'domain' | 'regex';
  pattern: string;
  replacement: string;
  enabled: boolean;
}

export interface LinkInfo {
  id: string;
  originalHref: string;
  text: string;
  domain: string;
  element: 'a' | 'img' | 'script' | 'iframe' | 'form';
  newHref?: string;
}

export interface CleanOptions {
  /**
   * 剥离 <meta http-equiv="Content-Security-Policy">（含 Report-Only 变体）。
   * 竞品页面常带严格的 CSP，会拦截我们注入到自有域名上的内联追踪脚本，
   * 导致页面投放到自己的域名后功能失效，因此默认开启。
   */
  removeCspMeta: boolean;
  removeJSONLD: boolean;
  removeTrackingPixels: boolean;
  removeComments: boolean;
  removeEmptyNodes: boolean;
}

export interface ExportOptions {
  inlineStyles: boolean;
  cleanEditorAttrs: boolean;
  minify: boolean;
  fileName: string;
}

export type WorkflowStep = 1 | 2 | 3 | 4 | 5;

/**
 * GitHub 接入配置。由 GitHubSettingsModal 采集，存于 localStorage 键 `gh-config`。
 * token 只保存在使用者本机，工具链任何环节都不会把它发送到除 api.github.com 之外的地方。
 */
export interface GitHubConfig {
  /** Fine-grained PAT，权限只需 Contents: Read and write */
  token: string;
  /** 仓库拥有者，如 yzyxray */
  owner: string;
  /** 仓库名，如 landing-archive */
  repo: string;
  /** 分支，存放 archives/ 与 templates/，通常是 main */
  branch: string;
  /**
   * 落地页部署分支。同一个仓库里另开一个分支，index.html 放在该分支根目录，
   * 把 Cloudflare Pages 项目绑定到这个分支即可实现「推送即上线」——
   * 这样存档数据和可部署产物同仓库共存，互不干扰，也不用再建第二个仓库。
   */
  deployBranch: string;
  /** 仓库内的路径前缀，留空表示直接写仓库根目录 */
  basePath: string;
}

/** 扩展抓取统计 */
export interface CaptureStats {
  htmlBytes: number;
  finalBytes: number;
  resourceTotal: number;
  inlined: number;
  skipped: { url: string; reason: 'too-large' | 'fetch-failed' | 'not-found' }[];
  /** 内联后仍为非 data 的 <img>，用于诊断「还有几张没抓下来」 */
  unresolved?: { count: number; samples: string[] };
  /** 仍未被内联的外链样式表（移动端适配依赖它们） */
  unresolvedStylesheets?: { count: number; samples: string[] };
}

/** 扩展抓取结果：已完全自包含的单文件 HTML */
export interface ExtensionCapture {
  pageUrl: string;
  pageTitle: string;
  capturedAt: string; // ISO 8601
  html: string;
  stats: CaptureStats;
}

/** 扩展侧抓取进度（popup 与网页应用共享同一形状） */
export interface CrawlProgress {
  stage: 'collecting' | 'resources' | 'inlining' | 'done' | 'error';
  cursor: number;
  total: number;
  inlined: number;
  skipped: number;
  running: boolean;
  done: boolean;
  error?: string;
  pageUrl?: string;
  pageTitle?: string;
}

/** 扩展状态摘要（网页应用只读） */
export interface ExtensionStatus {
  progress: CrawlProgress | null;
  hasJob: boolean;
  capture:
    | (Omit<ExtensionCapture, 'html'> & { htmlBytes: number })
    | null;
}

/** 扩展 ↔ 网页应用的分块消息协议（两侧对称） */
export type CaptureChunkMsg =
  | { type: 'chunk'; seq: number; text: string }
  | { type: 'meta'; pageUrl: string; pageTitle: string; urls: string[] }
  | { type: 'done'; meta?: Partial<ExtensionCapture> }
  | { type: 'error'; message: string };

export interface WorkflowState {
  currentStep: WorkflowStep;
  rawHtml: string;
  cleanedHtml: string;
  finalHtml: string;
  /** 编辑器实时 HTML（每次内容变更自动同步），导出/预览优先用这份，避免改动丢失 */
  editorHtml: string | null;
  detectedScripts: DetectedScript[];
  addedScripts: AddedScript[];
  links: LinkInfo[];
  replaceRules: ReplaceRule[];
  cleanOptions: CleanOptions;
  exportOptions: ExportOptions;
  stats: {
    htmlSize: number;
    scriptCount: number;
    linkCount: number;
    imageCount: number;
  };
  setCurrentStep: (step: WorkflowStep) => void;
  setRawHtml: (html: string) => void;
  setCleanedHtml: (html: string) => void;
  setFinalHtml: (html: string) => void;
  setEditorHtml: (html: string | null) => void;
  setDetectedScripts: (scripts: DetectedScript[]) => void;
  updateScriptAction: (id: string, action: DetectedScript['action'], replacementId?: string) => void;
  addScript: (script: AddedScript) => void;
  removeScript: (id: string) => void;
  setLinks: (links: LinkInfo[]) => void;
  setReplaceRules: (rules: ReplaceRule[]) => void;
  addReplaceRule: (rule: ReplaceRule) => void;
  removeReplaceRule: (id: string) => void;
  toggleReplaceRule: (id: string) => void;
  updateLinkHref: (id: string, newHref: string) => void;
  setCleanOptions: (options: Partial<CleanOptions>) => void;
  setExportOptions: (options: Partial<ExportOptions>) => void;
  setStats: (stats: WorkflowState['stats']) => void;
  reset: () => void;
}
