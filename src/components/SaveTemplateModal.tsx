import { useState, useCallback } from 'react';
import { BookOpen, X, Check, LoaderCircle, AlertTriangle } from 'lucide-react';
import { readGhConfig, saveTemplate, isGhConfigReady, type TemplateMeta } from '../lib/github-store';
import { formatBytes, classifySize, SIZE_TIER_MESSAGES } from '../lib/size-guard';

interface Props {
  html: string;
  onClose: () => void;
  onSaved: (meta: TemplateMeta) => void;
}

export function SaveTemplateModal({ html, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [competitor, setCompetitor] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [note, setNote] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const config = readGhConfig();
  const configured = isGhConfigReady(config);
  const ready = configured && !!name.trim() && !saving;

  const handleSave = useCallback(async () => {
    if (!config || !ready) return;
    setSaving(true);
    setError('');
    try {
      const meta = await saveTemplate(config, {
        name: name.trim(),
        html,
        competitor: competitor.trim(),
        sourceUrl: sourceUrl.trim(),
        note: note.trim(),
        tags: tags
          .split(/[,，]/)
          .map((s) => s.trim())
          .filter(Boolean),
      });
      onSaved(meta);
      onClose();
    } catch (err) {
      console.error('[SaveTemplateModal] 保存失败:', err);
      setError(err instanceof Error ? err.message : '保存模板失败');
    } finally {
      setSaving(false);
    }
  }, [config, ready, name, html, competitor, sourceUrl, note, tags, onSaved, onClose]);

  if (!configured) {
    return (
      <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/40" onClick={onClose}>
        <div
          className="bg-white rounded-xl shadow-2xl w-[480px] max-w-[92vw] p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle size={22} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-base font-semibold text-slate-800">需要先配置 GitHub</h3>
              <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
                模板库存放在你的 GitHub 私有仓库里。请先关闭此窗口，点顶栏的「配置 GitHub」
                填入 token 与仓库信息，然后再存模板。
              </p>
              <button
                onClick={onClose}
                className="mt-4 px-4 py-2 text-sm font-medium bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg transition-colors"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const bytes = new Blob([html]).size;
  const tier = classifySize(bytes);

  return (
    <div
      className="fixed inset-0 z-[96] flex items-center justify-center bg-black/40 overflow-y-auto py-8"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[520px] max-w-[92vw] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <BookOpen size={18} className="text-[#6366f1]" /> 存为模板
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
          <div className="p-2.5 bg-slate-50 rounded-lg text-[11px] text-slate-500 flex items-center gap-2">
            <span className="font-mono">
              {config.owner}/{config.repo}
            </span>
            <span>→</span>
            <span className="font-mono">templates/</span>
            <span>·</span>
            <span>{formatBytes(bytes)}</span>
          </div>

          {tier !== 'normal' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 leading-relaxed">
              {SIZE_TIER_MESSAGES[tier].title}：{SIZE_TIER_MESSAGES[tier].body}
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-slate-600 mb-1.5 block">
              模板名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：X 产品 - 高转化长表单版"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              spellCheck={false}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1.5 block">竞品 / 来源名</label>
              <input
                type="text"
                value={competitor}
                onChange={(e) => setCompetitor(e.target.value)}
                placeholder="例如 CompetitorX"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                spellCheck={false}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1.5 block">来源页地址</label>
              <input
                type="text"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://competitor.com/landing"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                spellCheck={false}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 mb-1.5 block">用途描述</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="这一版适合什么场景？改过哪些地方？踩过什么坑？下次复用要注意什么？"
              rows={3}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1] resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 mb-1.5 block">标签</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="逗号分隔，例如：长表单, 医疗, 深色"
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
              spellCheck={false}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2 leading-relaxed">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span className="break-words">{error}</span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={!ready}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}
              {saving ? '正在写入 GitHub...' : '存入模板库'}
            </button>
          </div>

          <p className="text-[10px] text-slate-400 leading-relaxed">
            模板会以三次 commit 写入仓库：index.html、meta.json、以及更新 templates/index.json 清单。
          </p>
        </div>
      </div>
    </div>
  );
}