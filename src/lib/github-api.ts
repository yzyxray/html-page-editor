import type { GitHubConfig } from '../types';

const API_BASE = 'https://api.github.com';

/** Contents API 在此大小以内最简单、错误信息最清晰；超过则改走 Git Data API */
export const CONTENTS_API_LIMIT = 5 * 1024 * 1024; // 5MB
/** 超过此大小直接拒绝——再大浏览器内存与 base64 传输都不现实，GitHub 单文件硬上限是 100MB */
export const HARD_FILE_LIMIT = 40 * 1024 * 1024; // 40MB

export type GhErrorKind =
  | 'auth'        // token 无效或已过期
  | 'forbidden'   // 权限不足 / 速率限制
  | 'not-found'   // 仓库或路径不存在（私有仓库未授权也返回 404）
  | 'conflict'    // sha 不匹配
  | 'too-large'   // 超过本工具设置的上限
  | 'network'     // 网络不可达
  | 'unknown';

export class GitHubError extends Error {
  readonly kind: GhErrorKind;
  readonly status: number;

  constructor(kind: GhErrorKind, status: number, message: string) {
    super(message);
    this.name = 'GitHubError';
    this.kind = kind;
    this.status = status;
  }
}

/** 把 HTTP 状态码翻译成对用户有指导意义的中文提示，而不是干巴巴的 "HTTP 403" */
function describe(status: number, kind: GhErrorKind): string {
  switch (kind) {
    case 'auth':
      return 'GitHub Token 无效或已过期。请重新生成 Fine-grained token，并确认勾选了目标仓库的 Contents: Read and write 权限。';
    case 'forbidden':
      return status === 403
        ? 'GitHub 拒绝访问：可能是 token 权限不足、仓库属于组织而未获授权，或触发了 API 速率限制（认证后每小时 5000 次）。请检查 token 的仓库授权范围。'
        : `GitHub 拒绝访问（HTTP ${status}）。`;
    case 'not-found':
      return '找不到该仓库或路径。请检查设置里的 owner 与 repo 是否正确，并确认仓库存在且 token 有权访问——私有仓库未授权时同样返回 404。';
    case 'conflict':
      return '文件在仓库中已被改动（sha 不匹配）。请重新读取后再试，或换一个文件名。';
    case 'too-large':
      return '文件超过本工具 40MB 的处理上限。请先在清洗步骤精简页面，或改用「下载 HTML」导出后手动上传。';
    case 'network':
      return '无法连接 api.github.com。请检查网络连接与代理设置。';
    default:
      return `GitHub 请求失败（HTTP ${status}）。`;
  }
}

function kindForStatus(status: number): GhErrorKind {
  if (status === 401) return 'auth';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status === 409 || status === 422) return 'conflict';
  return 'unknown';
}

// ── base64 编解码（GitHub Contents API 要求 base64 传输）──
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const CHUNK = 0x8000; // 分块，避免 String.fromCharCode 展开过大导致栈溢出
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function fromBase64(b64: string): string {
  const binary = atob(b64.replace(/\n/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function encodePath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

// ── 底层请求 ──
async function request<T>(
  cfg: GitHubConfig,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${API_BASE}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}${path}`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    console.error('[github-api] network failure:', method, url);
    throw new GitHubError('network', 0, describe(0, 'network'));
  }

  if (resp.status === 204) return undefined as T;

  let payload: any = {};
  try {
    payload = await resp.json();
  } catch {
    console.error('[github-api] non-JSON response:', method, url, resp.status);
  }

  if (!resp.ok) {
    const kind = kindForStatus(resp.status);
    const detail = payload?.message ? `（${payload.message}）` : '';
    console.error('[github-api] request failed:', method, url, resp.status);
    throw new GitHubError(kind, resp.status, describe(resp.status, kind) + detail);
  }

  return payload as T;
}

// ── 连接与仓库校验 ──
export interface GhUser {
  login: string;
}

/** 校验 token 是否有效（只读） */
export function getUser(cfg: GitHubConfig): Promise<GhUser> {
  return request<any>(cfg, 'GET', '').then((r) => ({ login: r.login }));
}

export interface GhRepo {
  full_name: string;
  private: boolean;
  default_branch: string;
}

/** 校验仓库是否存在且可访问（只读）。私有仓库未授权时同样返回 404 */
export function getRepo(cfg: GitHubConfig): Promise<GhRepo> {
  return request<GhRepo>(cfg, 'GET', '');
}

/** 列出目录内容。目录不存在时返回空数组而不是抛错，便于首次使用 */
export interface GhDirEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  sha: string;
}

export async function listDir(cfg: GitHubConfig, path: string): Promise<GhDirEntry[]> {
  try {
    const entries = await request<any[]>(cfg, 'GET', `/contents/${encodePath(path)}`);
    return entries
      .filter((e) => e.type === 'file' || e.type === 'dir')
      .map((e) => ({ name: e.name, path: e.path, type: e.type, sha: e.sha }));
  } catch (err) {
    if (err instanceof GitHubError && err.kind === 'not-found') return [];
    console.error('[github-api] listDir failed:', path, err);
    return [];
  }
}

export interface GhFile {
  content: string; // 已解码的 UTF-8 文本
  sha: string;
}

export async function getFile(cfg: GitHubConfig, path: string): Promise<GhFile | null> {
  try {
    const r = await request<any>(
      cfg,
      'GET',
      `/contents/${encodePath(path)}?ref=${encodeURIComponent(cfg.branch)}`
    );
    return { content: fromBase64(r.content), sha: r.sha };
  } catch (err) {
    if (err instanceof GitHubError && err.kind === 'not-found') return null;
    console.error('[github-api] getFile failed:', path, err);
    throw err;
  }
}

export async function getFileSha(cfg: GitHubConfig, path: string): Promise<string | null> {
  const f = await getFile(cfg, path);
  return f ? f.sha : null;
}

// ── 写入：按体积在 Contents API 与 Git Data API 之间分流 ──

/** Contents API：单次 PUT 即可，适合小文件，错误信息最清晰 */
async function putViaContents(
  cfg: GitHubConfig,
  path: string,
  text: string,
  message: string,
  sha: string | null
): Promise<void> {
  await request(cfg, 'PUT', `/contents/${encodePath(path)}`, {
    message,
    content: toBase64(text),
    branch: cfg.branch,
    ...(sha ? { sha } : {}),
  });
}

/**
 * Git Data API：blobs → trees → commits → refs 四步，适合大文件。
 * Contents API 在大 base64 请求体上极易超时，且没有分块传输的余地。
 */
async function putViaGitData(
  cfg: GitHubConfig,
  path: string,
  text: string,
  message: string
): Promise<void> {
  const branch = encodeURIComponent(cfg.branch);
  const head = await request<any>(cfg, 'GET', `/git/ref/heads/${branch}`);
  const headCommitSha: string = head.object.sha;

  const baseCommit = await request<any>(cfg, 'GET', `/git/commits/${headCommitSha}`);
  const baseTree: string = baseCommit.tree.sha;

  const blob = await request<any>(cfg, 'POST', '/git/blobs', {
    content: toBase64(text),
    encoding: 'base64',
  });

  const tree = await request<any>(cfg, 'POST', '/git/trees', {
    base_tree: baseTree,
    tree: [{ path, mode: '100644', type: 'blob', sha: blob.sha }],
  });

  const commit = await request<any>(cfg, 'POST', '/git/commits', {
    message,
    tree: tree.sha,
    parents: [headCommitSha],
  });

  await request(cfg, 'PATCH', `/git/refs/heads/${branch}`, {
    sha: commit.sha,
    force: false,
  });
}

/**
 * 写文本文件到仓库，自动按体积选择合适的 API。
 * @param opts.force 强制走 Git Data API 整树提交（无视单文件 sha 流程）
 */
export async function writeFile(
  cfg: GitHubConfig,
  path: string,
  text: string,
  message: string,
  opts: { force?: boolean } = {}
): Promise<void> {
  const bytes = new TextEncoder().encode(text).length;

  if (bytes > HARD_FILE_LIMIT) {
    throw new GitHubError('too-large', 0, describe(0, 'too-large'));
  }

  if (opts.force || bytes > CONTENTS_API_LIMIT) {
    await putViaGitData(cfg, path, text, message);
    return;
  }

  const sha = await getFileSha(cfg, path);
  await putViaContents(cfg, path, text, message, sha);
}

export async function deleteFile(cfg: GitHubConfig, path: string, message: string): Promise<void> {
  const sha = await getFileSha(cfg, path);
  if (!sha) return;
  await request(cfg, 'DELETE', `/contents/${encodePath(path)}`, {
    message,
    sha,
    branch: cfg.branch,
  });
}

/**
 * 确保目标分支存在；不存在则从仓库默认分支创建。
 * 用于落地页部署分支——首次推送时该分支往往还没有。
 */
export async function ensureBranch(cfg: GitHubConfig, branch: string): Promise<void> {
  try {
    await request(cfg, 'GET', `/git/ref/heads/${encodeURIComponent(branch)}`);
    return;
  } catch (err) {
    // 只有「分支不存在」才继续创建；权限、网络等其他错误必须原样抛出
    if (!(err instanceof GitHubError) || err.kind !== 'not-found') throw err;
  }

  const repo = await request<any>(cfg, 'GET', '');
  const baseBranch: string = repo.default_branch || 'main';
  const baseRef = await request<any>(cfg, 'GET', `/git/ref/heads/${encodeURIComponent(baseBranch)}`);

  await request(cfg, 'POST', '/git/refs', {
    ref: `refs/heads/${branch}`,
    sha: baseRef.object.sha,
  });
}

/**
 * 写到指定分支（落地页部署分支），分支不存在时自动创建。
 *
 * 与 writeFile 的区别：writeFile 始终操作 cfg.branch（存档/模板库），
 * 而这里显式指定分支，把index.html 放在部署分支的根目录——
 * Cloudflare Pages 绑定该分支后即可直接上线。
 */
export async function writeFileOnBranch(
  cfg: GitHubConfig,
  branch: string,
  path: string,
  text: string,
  message: string
): Promise<void> {
  await ensureBranch(cfg, branch);

  let sha: string | null = null;
  try {
    const r = await request<any>(
      cfg,
      'GET',
      `/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`
    );
    sha = r.sha;
  } catch (err) {
    if (!(err instanceof GitHubError) || err.kind !== 'not-found') throw err;
  }

  await request(cfg, 'PUT', `/contents/${encodePath(path)}`, {
    message,
    content: toBase64(text),
    branch,
    ...(sha ? { sha } : {}),
  });
}

export { toBase64, fromBase64 };