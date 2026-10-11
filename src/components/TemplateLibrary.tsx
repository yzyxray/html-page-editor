import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  BookOpen, X, Search, RefreshCw, Layers, Trash2, Pencil, Check,
  LoaderCircle, AlertTriangle,
} from 'lucide-react';
import type { GitHubConfig } from '../types';
import {
  listTemplates, loadTemplate, updateTemplateMeta, deleteTemplate,
  type TemplateMeta,
} from '../lib/github-store';
import { formatBytes } from '../lib/size-guard';

interface Props {
  config: GitHubConfig;
  onClose: () => void;
  /** 载入模板后回调：把 HTML 写回工作流 */
  onLoad: (html: string, meta: TemplateMeta) => void;
}

function hostOf(url: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 40);
  }
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TemplateLibrary({ config, onClose, onLoad }: Props) {
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; note: string; tags: string }>({
    name: '',
    note: '',
    tags: '',
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setTemplates(await listTemplates(config));
    } catch (err) {
      console.error('[TemplateLibrary] 加载失败:', err);
      setError(err instanceof Error ? err.message : '加载模板列表失败');
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) =>
      [t.name, t.competitor, t.note, ...(t.tags ?? [])].some((v) =>
        (v || '').toLowerCase().includes(q)
      )
    );
  }, [templates, query]);

  const handleLoad = useCallback(
    async (meta: TemplateMeta) => {
      if (busy) return;
      setBusy(meta.slug);
      setError('');
      try {
        const html = await loadTemplate(config, meta.slug);
        if (!html) {
          setError(`模板「${meta.name}」的 index.html 不存在，可能已被手动删除。`);
          return;
        }
        onLoad(html, meta);
        onClose();
      } catch (err) {
        console.error('[TemplateLibrary] 载入失败:', err);
        setError(err instanceof Error ? err.message : '载入模板失败');
      } finally {
        setBusy('');
      }
    },
    [busy, config, onLoad, onClose]
  );

  const startEdit = useCallback((t: TemplateMeta) => {
    setEditingSlug(t.slug);
    setDraft({ name: t.name, note: t.note ?? '', tags: (t.tags ?? []).join(', ') });
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingSlug || busy) return;
    setBusy(editingSlug);
    setError('');
    try {
      await updateTemplateMeta(config, editingSlug, {
        name: draft.name.trim() || '未命名模板',
        note: draft.note.trim(),
        tags: draft.tags
          .split(/[,，]/)
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setEditingSlug(null);
      await refresh();
    } catch (err) {
      console.error('[TemplateLibrary] 保存元数据失败:', err);
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setBusy('');
    }
  }, [editingSlug, busy, config, draft, refresh]);

  const handleDelete = useCallback(
    async (t: TemplateMeta) => {
      if (busy) return;
      const ok = window.confirm(
        `确定删除模板「${t.name}」？\n\n仓库中的 index.html 与 meta.json 都会被移除。` +
          `此操作仍可通过 GitHub 的提交历史找回。`
      );
      if (!ok) return;
      setBusy(t.slug);
      setError('');
      try {
        await deleteTemplate(config, t.slug);
        await refresh();
      } catch (err) {
        console.error('[TemplateLibrary] 删除失败:', err);
        setError(err instanceof Error ? err.message : '删除失败');
      } finally {
        setBusy('');
      }
    },
    [busy, config, refresh]
  );

  return (
    <div className="fixed inset-0 z-[90] bg-slate-900/40 flex items-start justify-center overflow-y-auto py-10">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl mx-4 overflow-hidden">
        {/* 顶栏 */}
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <BookOpen size={18} className="text-[#6366f1]" /> 模板库
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={loading}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40"
              title="刷新"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
              title="关闭"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 搜索 */}
        <div className="px-5 py-3 border-b border-slate-100">
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索模板名称、竞品名、描述或标签"
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              spellCheck={false}
            />
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            共 {templates.length} 个模板
            {query && `，匹配 ${filtered.length} 个`}
            {templates.length > 0 && (
              <>
                {' · 存放在 '}
                <code className="font-mono text-slate-500">
                  {config.owner}/{config.repo} → templates/
                </code>
              </>
            )}
          </p>
        </div>

        {/* 错误 */}
        {error && (
          <div className="mx-5 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span className="break-words">{error}</span>
          </div>
        )}

        {/* 主体 */}
        <div className="p-5 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <LoaderCircle size={32} className="animate-spin text-[#6366f1] mb-3" />
              <p className="text-sm">正在从 GitHub 读取模板列表…</p>
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center mb-3">
                <Layers size={26} className="text-indigo-400" />
              </div>
              <p className="text-sm font-medium text-slate-600">还没有模板</p>
              <p className="text-xs text-slate-400 mt-1.5 max-w-xs leading-relaxed">
                在「编辑」步骤调好页面后，点工具栏的「存为模板」即可加入模板库。
                模板会连同竞品来源、描述与标签一起存入 GitHub，随时可调出来复用。
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search size={28} className="text-slate-300 mb-3" />
              <p className="text-sm text-slate-500">没有匹配「{query}」的模板</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((t) => (
                <div
                  key={t.slug}
                  className="border border-slate-200 rounded-xl p-4 bg-white hover:border-indigo-200 hover:shadow-md transition-all"
                >
                  {editingSlug === t.slug ? (
                    /* ── 元数据编辑态 ── */
                    <div className="space-y-2.5">
                      <input
                        value={draft.name}
                        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                        placeholder="模板名称"
                        className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                      />
                      <textarea
                        value={draft.note}
                        onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                        placeholder="用途描述：这一版适合投什么广告位、踩过什么坑…"
                        rows={3}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1] resize-none"
                      />
                      <input
                        value={draft.tags}
                        onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))}
                        placeholder="标签，逗号分隔"
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                      />
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={saveEdit}
                          disabled={!!busy}
                          className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg transition-colors disabled:opacity-50"
                        >
                          <Check size={13} /> 保存
                        </button>
                        <button
                          onClick={() => setEditingSlug(null)}
                          className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h4 className="text-sm font-medium text-slate-800 break-words leading-snug">
                        {t.name}
                      </h4>
                      {t.sourceUrl && (
                        <p className="text-xs text-slate-400 font-mono mt-1 truncate">
                          {hostOf(t.sourceUrl)}
                        </p>
                      )}
                      {t.note && (
                        <p className="text-xs text-slate-500 mt-2 leading-relaxed line-clamp-2">
                          {t.note}
                        </p>
                      )}
                      {t.tags && t.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2.5">
                          {t.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-3">
                        <span>{formatDate(t.updatedAt)}</span>
                        <span>·</span>
                        <span>{formatBytes(t.htmlSize)}</span>
                        <span>·</span>
                        <span>{t.imageCount} 图</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-slate-100">
                        <button
                          onClick={() => handleLoad(t)}
                          disabled={!!busy}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg transition-colors disabled:opacity-50"
                        >
                          {busy === t.slug ? (
                            <LoaderCircle size={13} className="animate-spin" />
                          ) : (
                            <BookOpen size={13} />
                          )}
                          载入复用
                        </button>
                        <button
                          onClick={() => startEdit(t)}
                          className="p-1.5 text-slate-400 hover:text-[#6366f1] hover:bg-indigo-50 rounded-lg transition-colors"
                          title="重命名 / 编辑描述与标签"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(t)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="删除模板"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}