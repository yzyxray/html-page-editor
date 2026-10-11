/**
 * 网页应用 ↔ Chrome 扩展的通信层。
 *
 * 分工：抓取（含跨域下载资源）全部由扩展的 service worker 完成；
 * 网页应用只做两件事——读扩展状态、把扩展里的「最近一次抓取」分块收下来。
 *
 * 为什么用长连接 + 512KB 分块：一次抓取产出的自包含 HTML 可能 10-20MB，
 * 单次 sendMessage 返回会超限或极慢。
 */
import type { ExtensionCapture, ExtensionStatus, CaptureChunkMsg } from '../types';

const CONFIG_KEY = 'hleditor-extension-config';
const STATUS_TIMEOUT_MS = 10000;
const CAPTURE_TIMEOUT_MS = 30000;

// ── 最小化的 chrome.runtime 类型（项目未引入 @types/chrome，避免新增依赖）──
interface ChromePortLike {
  postMessage: (msg: unknown) => void;
  onMessage: { addListener: (cb: (msg: unknown) => void) => void };
  onDisconnect: { addListener: (cb: () => void) => void };
  disconnect: () => void;
}
interface ChromeRuntimeLike {
  connect: (id: string, opts?: { name?: string }) => ChromePortLike;
  sendMessage: (id: string, msg: unknown, cb: (resp: unknown) => void) => void;
  lastError?: { message?: string };
}
function getRuntime(): ChromeRuntimeLike | null {
  const w = window as unknown as { chrome?: { runtime?: ChromeRuntimeLike } };
  return w.chrome?.runtime?.connect ? (w.chrome.runtime as ChromeRuntimeLike) : null;
}

export type BridgeErrorCode =
  | 'no-extension' // 浏览器里没有扩展（未安装或本页不在 externally_connectable 名单）
  | 'no-id' // 还没填扩展 ID
  | 'no-capture' // 扩展里还没有抓取记录
  | 'timeout'; // 扩展无响应

export class BridgeError extends Error {
  code: BridgeErrorCode;
  constructor(code: BridgeErrorCode, message?: string) {
    super(message || code);
    this.code = code;
    this.name = 'BridgeError';
  }
}

const FRIENDLY: Record<BridgeErrorCode, string> = {
  'no-extension':
    '未检测到扩展。请确认已在 Chrome 安装本扩展，并在下面填入扩展 ID。',
  'no-id': '还没有配置扩展 ID。安装扩展后，把它的 ID 填到下面即可启用一键抓取。',
  'no-capture':
    '扩展里还没有抓取记录。请打开竞品页面点扩展图标抓取一次，再回来导入。',
  timeout: '扩展无响应。确认扩展已安装并在扩展弹窗中完成过一次抓取。',
};

export function friendlyBridgeError(err: unknown): string {
  if (err instanceof BridgeError) return err.message && err.message !== err.code ? err.message : FRIENDLY[err.code];
  return '与扩展通信失败，请重试。';
}

// ── 扩展 ID 配置（仅 ID，无敏感信息，独立 localStorage 键）──
export function readExtensionId(): string {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { extensionId?: string };
    return parsed.extensionId || '';
  } catch {
    return '';
  }
}

export function writeExtensionId(extensionId: string): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ extensionId: extensionId.trim() }));
  } catch {
    /* 隐私模式等场景写入失败，忽略 */
  }
}

/** Chrome 扩展 ID 固定为 32 位 a-p 的小写字母 */
export function isValidExtensionId(id: string): boolean {
  return /^[a-p]{32}$/.test(id.trim());
}

/** 当前页面是否能直接与扩展通信（扩展已安装且本页在 externally_connectable 名单内） */
export function isExtensionApiAvailable(): boolean {
  return getRuntime() !== null;
}

/** 读取扩展状态摘要（进度 / 是否有未完成任务 / 最近抓取记录） */
export function getExtensionStatus(): Promise<ExtensionStatus> {
  const id = readExtensionId();
  if (!id) return Promise.reject(new BridgeError('no-id'));
  const rt = getRuntime();
  if (!rt) return Promise.reject(new BridgeError('no-extension'));

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new BridgeError('timeout'));
    }, STATUS_TIMEOUT_MS);

    try {
      rt.sendMessage(id, { type: 'GET_STATUS' }, (resp) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (rt.lastError || !resp) {
          reject(new BridgeError('timeout'));
          return;
        }
        resolve(resp as ExtensionStatus);
      });
    } catch {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new BridgeError('no-extension'));
      }
    }
  });
}

/** 走 'capture-result' 端口分块收取「最近一次抓取」的自包含 HTML */
export function fetchLastCapture(
  onProgress?: (chunks: number) => void
): Promise<ExtensionCapture> {
  const id = readExtensionId();
  if (!id) return Promise.reject(new BridgeError('no-id'));
  const rt = getRuntime();
  if (!rt) return Promise.reject(new BridgeError('no-extension'));

  return new Promise((resolve, reject) => {
    let port: ChromePortLike;
    try {
      port = rt.connect(id, { name: 'capture-result' });
    } catch {
      reject(new BridgeError('no-extension'));
      return;
    }

    const chunks: string[] = [];
    let meta: Partial<ExtensionCapture> = {};
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        port.disconnect();
      } catch {
        /* 已断开 */
      }
      fn();
    };

    const timer = setTimeout(() => finish(() => reject(new BridgeError('timeout'))), CAPTURE_TIMEOUT_MS);

    port.onMessage.addListener((raw) => {
      const msg = raw as CaptureChunkMsg;
      if (!msg || !msg.type) return;
      if (msg.type === 'chunk') {
        chunks.push(msg.text);
        onProgress?.(chunks.length);
      } else if (msg.type === 'done') {
        if (msg.meta) meta = msg.meta;
        const html = chunks.join('');
        finish(() =>
          resolve({
            pageUrl: meta.pageUrl || '',
            pageTitle: meta.pageTitle || '',
            capturedAt: meta.capturedAt || new Date().toISOString(),
            html,
            stats:
              meta.stats || {
                htmlBytes: html.length,
                finalBytes: html.length,
                resourceTotal: 0,
                inlined: 0,
                skipped: [],
              },
          })
        );
      } else if (msg.type === 'error') {
        const message = (msg as { message?: string }).message;
        finish(() => reject(new BridgeError('no-capture', message)));
      }
    });

    port.onDisconnect.addListener(() => {
      finish(() => reject(new BridgeError('timeout')));
    });
  });
}
