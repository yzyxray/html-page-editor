import type { GitHubConfig } from '../types';
import { getFile, writeFile, deleteFile, listDir } from './github-api';

const CONFIG_KEY = 'gh-config';

// ── 元数据模型 ──

/** 存档与模板共用同一套元数据结构，区别只在于落在仓库的哪个目录下 */
export interface EntryMeta {
  id: string;
  /** 文件夹名，由名称 + 时间戳生成，规避中文与非法字符 */
  slug: string;
  /** 展示名，可含中文 */
  name: string;
  /** 竞品页地址 */
  sourceUrl: string;
  /** 竞品 / 项目名备注 */
  competitor: string;
  /** 用途描述 */
  note: string;
  tags: string[];
  /** 抓取时间 ISO 8601 */
  capturedAt: string;
  /** 最后更新时间 ISO 8601 */
  updatedAt: string;
  /** 成品 HTML 字节数 */
  htmlSize: number;
  /** 内联图片数量 */
  imageCount: number;
}

export type ArchiveMeta = EntryMeta;
export type TemplateMeta = EntryMeta;

export const DEFAULT_GH_CONFIG: GitHubConfig = {
  token: '',
  owner: '',
  repo: '',
  branch: 'main',
  basePath: '',
};

// ── 配置持久化 ──
// token 只落在使用者本机的 localStorage，既不会随产物导出，也不会写入仓库。

export function readGhConfig(): GitHubConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      token: typeof parsed.token === 'string' ? parsed.token : '',
      owner: typeof parsed.owner === 'string' ? parsed.owner : '',
      repo: typeof parsed.repo === 'string' ? parsed.repo : '',
      branch: typeof parsed.branch === 'string' && parsed.branch ? parsed.branch : 'main',
      basePath: typeof parsed.basePath === 'string' ? parsed.basePath.replace(/^\/+|\/+$/g, '') : '',
    };
  } catch (err) {
    console.error('[github-store] 读取配置失败:', err);
    return null;
  }
}

export function writeGhConfig(cfg: GitHubConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

export function clearGhConfig(): void {
  localStorage.removeItem(CONFIG_KEY);
}

export function isGhConfigReady(cfg: GitHubConfig | null): cfg is GitHubConfig {
  return !!cfg && !!cfg.token.trim() && !!cfg.owner.trim() && !!cfg.repo.trim();
}

// ── 路径工具 ──

function at(cfg: GitHubConfig, ...segments: string[]): string {
  return [cfg.basePath, ...segments]
    .filter(Boolean)
    .map((s) => s.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
}

/** 生成文件夹名：可读前缀 + 时间戳，保证唯一且不暴露中文路径问题 */
export function makeSlug(name: string, date = new Date()): string {
  const ascii = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  const prefix = ascii || 'entry';
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${prefix}-${ts}`;
}

function countImages(html: string): number {
  const m = html.match(/data:image\//g);
  return m ? m.length : 0;
}

function byteSize(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function buildEntryMeta(input: {
  name: string;
  sourceUrl?: string;
  competitor?: string;
  note?: string;
  tags?: string[];
  capturedAt?: string;
  html: string;
}): EntryMeta {
  const now = new Date();
  return {
    id: `entry-${now.getTime()}`,
    slug: makeSlug(input.name, now),
    name: input.name.trim() || '未命名页面',
    sourceUrl: input.sourceUrl ?? '',
    competitor: input.competitor ?? '',
    note: input.note ?? '',
    tags: input.tags ?? [],
    capturedAt: input.capturedAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
    htmlSize: byteSize(input.html),
    imageCount: countImages(input.html),
  };
}

// ── 通用写入：index.html + meta.json ──

async function writeEntry(
  cfg: GitHubConfig,
  dir: string,
  html: string,
  meta: EntryMeta,
  commitMessage: string
): Promise<string> {
  await writeFile(cfg, `${dir}/index.html`, html, `${commitMessage}: index.html`);
  await writeFile(cfg, `${dir}/meta.json`, JSON.stringify(meta, null, 2), `${commitMessage}: meta.json`);
  return dir;
}

// ── 存档 ──

export interface SaveArchiveInput {
  name: string;
  html: string;
  sourceUrl?: string;
  competitor?: string;
  note?: string;
  tags?: string[];
}

/**
 * 存档一份成品到 `archives/<slug>/`，目录名带时间戳天然版本化。
 * @returns 写入的目录路径
 */
export async function saveArchive(cfg: GitHubConfig, input: SaveArchiveInput): Promise<string> {
  const meta = buildEntryMeta(input);
  const dir = at(cfg, 'archives', meta.slug);
  await writeEntry(cfg, dir, input.html, meta, `archive: ${meta.name}`);
  return dir;
}

/** 列出存档（按更新时间倒序）。逐个读取 meta.json。 */
export async function listArchives(cfg: GitHubConfig): Promise<ArchiveMeta[]> {
  const root = at(cfg, 'archives');
  const dirs = await listDir(cfg, root);
  const out: ArchiveMeta[] = [];
  for (const d of dirs) {
    if (d.type !== 'dir') continue;
    const f = await getFile(cfg, `${d.path}/meta.json`);
    if (!f) continue;
    try {
      out.push(JSON.parse(f.content));
    } catch (err) {
      console.error('[github-store] meta.json 解析失败:', d.path, err);
    }
  }
  return out.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

// ── 模板库 ──

const TEMPLATE_INDEX = 'index.json';

export interface SaveTemplateInput {
  name: string;
  html: string;
  sourceUrl?: string;
  competitor?: string;
  note?: string;
  tags?: string[];
}

/** 模板清单路径：列表页读它即可秒开，避免遍历目录产生 N+1 请求 */
function templateIndexPath(cfg: GitHubConfig): string {
  return at(cfg, 'templates', TEMPLATE_INDEX);
}

async function readTemplateIndex(cfg: GitHubConfig): Promise<TemplateMeta[]> {
  const f = await getFile(cfg, templateIndexPath(cfg));
  if (!f) return [];
  try {
    const parsed = JSON.parse(f.content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('[github-store] 模板清单解析失败:', err);
    return [];
  }
}

async function writeTemplateIndex(
  cfg: GitHubConfig,
  list: TemplateMeta[],
  message: string
): Promise<void> {
  await writeFile(cfg, templateIndexPath(cfg), JSON.stringify(list, null, 2), message);
}

/** 存入模板：写 index.html + meta.json，并更新清单。返回写入的元数据（含 slug） */
export async function saveTemplate(cfg: GitHubConfig, input: SaveTemplateInput): Promise<TemplateMeta> {
  const meta = buildEntryMeta(input);
  const dir = at(cfg, 'templates', meta.slug);
  await writeEntry(cfg, dir, input.html, meta, `template: ${meta.name}`);

  const list = await readTemplateIndex(cfg);
  list.unshift(meta);
  await writeTemplateIndex(cfg, list, `template: 登记 ${meta.name}`);
  return meta;
}

/** 列出模板，优先读清单文件；清单缺失时退回遍历目录兜底 */
export async function listTemplates(cfg: GitHubConfig): Promise<TemplateMeta[]> {
  const list = await readTemplateIndex(cfg);
  if (list.length > 0) return list;

  const root = at(cfg, 'templates');
  const dirs = await listDir(cfg, root);
  const out: TemplateMeta[] = [];
  for (const d of dirs) {
    if (d.type !== 'dir') continue;
    const f = await getFile(cfg, `${d.path}/meta.json`);
    if (!f) continue;
    try {
      out.push(JSON.parse(f.content));
    } catch (err) {
      console.error('[github-store] meta.json 解析失败:', d.path, err);
    }
  }
  return out.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

/** 载入模板的 HTML 源码 */
export async function loadTemplate(cfg: GitHubConfig, slug: string): Promise<string | null> {
  const f = await getFile(cfg, at(cfg, 'templates', slug, 'index.html'));
  return f ? f.content : null;
}

/** 更新模板元数据（重命名 / 改描述 / 改标签），HTML 本身不动 */
export async function updateTemplateMeta(
  cfg: GitHubConfig,
  slug: string,
  patch: Partial<Pick<EntryMeta, 'name' | 'note' | 'tags' | 'competitor'>>
): Promise<void> {
  const dir = at(cfg, 'templates', slug);
  const f = await getFile(cfg, `${dir}/meta.json`);
  if (!f) throw new Error(`未找到模板 ${slug}`);

  const meta: EntryMeta = JSON.parse(f.content);
  const next: EntryMeta = {
    ...meta,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  await writeFile(cfg, `${dir}/meta.json`, JSON.stringify(next, null, 2), `template: 更新 ${next.name}`);

  const list = await readTemplateIndex(cfg);
  const idx = list.findIndex((t) => t.slug === slug);
  if (idx >= 0) {
    list[idx] = next;
    await writeTemplateIndex(cfg, list, `template: 同步清单 ${next.name}`);
  }
}

/** 删除模板：移除目录下的两个文件、清理清单条目 */
export async function deleteTemplate(cfg: GitHubConfig, slug: string): Promise<void> {
  const dir = at(cfg, 'templates', slug);
  await deleteFile(cfg, `${dir}/index.html`, `template: 删除 ${slug}`);
  await deleteFile(cfg, `${dir}/meta.json`, `template: 删除 ${slug}`);

  const list = await readTemplateIndex(cfg);
  const next = list.filter((t) => t.slug !== slug);
  if (next.length !== list.length) {
    await writeTemplateIndex(cfg, next, `template: 从清单移除 ${slug}`);
  }
}