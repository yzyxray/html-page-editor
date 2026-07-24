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

export interface WorkflowState {
  currentStep: WorkflowStep;
  rawHtml: string;
  cleanedHtml: string;
  finalHtml: string;
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
