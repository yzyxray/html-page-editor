import { useEffect, useState, useRef } from 'react';
import {
  Search, Trash2, RefreshCw, ShieldCheck, Check, Info, Plus, ChevronDown,
  ChevronRight, Code2, X,
} from 'lucide-react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { scanScripts } from '../lib/script-scanner';
import { TRACKING_TEMPLATES, getTemplateByType } from '../lib/tracking-templates';
import type { DetectedScript, ScriptType, AddedScript } from '../types';

const SCRIPT_TYPE_LABELS: Record<ScriptType, string> = {
  'google-analytics-ua': 'GA UA',
  'google-analytics-ga4': 'GA4',
  'google-tag-manager': 'GTM',
  'facebook-pixel': 'Meta Pixel',
  'anytrack': 'AnyTrack',
  'bing-ads': 'Bing Ads',
  'tiktok-pixel': 'TikTok Pixel',
  'linkedin-insight': 'LinkedIn',
  'hotjar': 'Hotjar',
  'clarity': 'Clarity',
  'other-tracking': '其他追踪',
  'functional': '功能型脚本',
};

const SCRIPT_TYPE_COLORS: Record<ScriptType, string> = {
  'google-analytics-ua': 'bg-orange-100 text-orange-700',
  'google-analytics-ga4': 'bg-orange-100 text-orange-700',
  'google-tag-manager': 'bg-yellow-100 text-yellow-700',
  'facebook-pixel': 'bg-blue-100 text-blue-700',
  'anytrack': 'bg-purple-100 text-purple-700',
  'bing-ads': 'bg-cyan-100 text-cyan-700',
  'tiktok-pixel': 'bg-gray-800 text-white',
  'linkedin-insight': 'bg-sky-100 text-sky-700',
  'hotjar': 'bg-red-100 text-red-700',
  'clarity': 'bg-indigo-100 text-indigo-700',
  'other-tracking': 'bg-slate-100 text-slate-600',
  'functional': 'bg-green-100 text-green-700',
};

// ── 新增追踪脚本对话框 ──
function AddScriptDialog({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (script: AddedScript) => void;
}) {
  const [selectedType, setSelectedType] = useState<ScriptType>('google-analytics-ga4');
  const [trackingId, setTrackingId] = useState('');

  const availableTemplates = TRACKING_TEMPLATES.filter((t) => t.placement === 'head');
  const template = getTemplateByType(selectedType);

  const handleConfirm = () => {
    if (!trackingId.trim() || !template) return;
    onConfirm({
      id: `added-${Date.now()}`,
      type: selectedType,
      trackingId: trackingId.trim(),
      code: template.generateCode(trackingId.trim()),
      placement: template.placement,
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Plus size={18} className="text-[#6366f1]" />
            新增追踪脚本
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded transition-colors">
            <X size={18} />
          </button>
        </div>

        <label className="block text-sm font-medium text-slate-600 mb-2">选择追踪平台</label>
        <select
          value={selectedType}
          onChange={(e) => {
            setSelectedType(e.target.value as ScriptType);
            setTrackingId('');
          }}
          className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent mb-4"
        >
          {availableTemplates.map((t) => (
            <option key={t.type} value={t.type}>{t.label}</option>
          ))}
        </select>

        <label className="block text-sm font-medium text-slate-600 mb-2">
          {template?.description || 'Tracking ID'}
        </label>
        <input
          type="text"
          value={trackingId}
          onChange={(e) => setTrackingId(e.target.value)}
          placeholder={template?.placeholder || '请输入 Tracking ID'}
          className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent mb-4"
          autoFocus
        />

        {trackingId.trim() && template && (
          <div className="mb-4 p-3 bg-slate-900 rounded-lg">
            <p className="text-xs text-slate-400 mb-2 font-medium flex items-center gap-1">
              <Code2 size={12} /> 代码预览（将注入到 &lt;{template.placement}&gt;）
            </p>
            <pre className="text-xs text-green-400 overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap font-mono">
              {template.generateCode(trackingId.trim())}
            </pre>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!trackingId.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={14} /> 确认新增
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 替换追踪脚本对话框 ──
function ReplaceDialog({
  script,
  onClose,
  onConfirm,
}: {
  script: DetectedScript;
  onClose: () => void;
  onConfirm: (templateType: ScriptType, trackingId: string) => void;
}) {
  const currentTemplate = script.type !== 'other-tracking' && script.type !== 'functional'
    ? script.type
    : 'google-analytics-ga4';

  const [selectedType, setSelectedType] = useState<ScriptType>(currentTemplate);
  const [trackingId, setTrackingId] = useState('');

  const template = getTemplateByType(selectedType);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-800">替换追踪脚本</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded transition-colors">
            <X size={18} />
          </button>
        </div>

        <label className="block text-sm font-medium text-slate-600 mb-2">脚本类型</label>
        <select
          value={selectedType}
          onChange={(e) => {
            setSelectedType(e.target.value as ScriptType);
            setTrackingId('');
          }}
          className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent mb-4"
        >
          {TRACKING_TEMPLATES.filter((t) => t.placement === 'head').map((t) => (
            <option key={t.type + t.label} value={t.type}>{t.label}</option>
          ))}
        </select>

        <label className="block text-sm font-medium text-slate-600 mb-2">
          {template?.description || 'Tracking ID'}
        </label>
        <input
          type="text"
          value={trackingId}
          onChange={(e) => setTrackingId(e.target.value)}
          placeholder={template?.placeholder || '请输入 Tracking ID'}
          className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent mb-4"
          autoFocus
        />

        {trackingId && template && (
          <div className="mb-4 p-3 bg-slate-900 rounded-lg">
            <p className="text-xs text-slate-400 mb-2 font-medium">代码预览:</p>
            <pre className="text-xs text-green-400 overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap font-mono">
              {template.generateCode(trackingId)}
            </pre>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            取消
          </button>
          <button
            onClick={() => { if (trackingId.trim()) onConfirm(selectedType, trackingId.trim()); }}
            disabled={!trackingId.trim()}
            className="px-4 py-2 text-sm bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            确认替换
          </button>
        </div>
      </div>
    </div>
  );
}

export function ScriptManagerPanel() {
  const {
    rawHtml, detectedScripts, addedScripts, setDetectedScripts,
    updateScriptAction, addScript, removeScript, setCleanedHtml,
  } = useWorkflowStore();
  const [showReplaceDialog, setShowReplaceDialog] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [applied, setApplied] = useState(false);
  const [expandedScripts, setExpandedScripts] = useState<Set<string>>(new Set());
  const hasScanned = useRef(false);

  useEffect(() => {
    if (rawHtml && !hasScanned.current) {
      const scripts = scanScripts(rawHtml);
      setDetectedScripts(scripts);
      hasScanned.current = true;
    }
    if (!rawHtml) {
      hasScanned.current = false;
    }
  }, [rawHtml, setDetectedScripts]);

  const handleReplaceConfirm = (scriptId: string, _templateType: ScriptType, trackingId: string) => {
    updateScriptAction(scriptId, 'replace', trackingId);
    setShowReplaceDialog(null);
    setApplied(false);
  };

  const handleAddScript = (script: AddedScript) => {
    addScript(script);
    setShowAddDialog(false);
    setApplied(false);
  };

  const toggleExpand = (scriptId: string) => {
    setExpandedScripts((prev) => {
      const next = new Set(prev);
      if (next.has(scriptId)) next.delete(scriptId);
      else next.add(scriptId);
      return next;
    });
  };

  const handleApplyToHtml = () => {
    if (!rawHtml) return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');
    const scriptElements = doc.querySelectorAll('script');

    let headScripts = '';
    let bodyScripts = '';

    scriptElements.forEach((script, index) => {
      const info = detectedScripts[index];
      if (!info) return;

      if (info.action === 'remove') {
        script.remove();
      } else if (info.action === 'replace' && info.replacementId) {
        const headTemplate = TRACKING_TEMPLATES.find(
          (t) => t.type === info.type && t.placement === 'head'
        );
        const bodyTemplate = TRACKING_TEMPLATES.find(
          (t) => t.type === info.type && t.placement === 'body'
        );
        if (headTemplate) headScripts += headTemplate.generateCode(info.replacementId);
        if (bodyTemplate) bodyScripts += bodyTemplate.generateCode(info.replacementId);
        script.remove();
      }
    });

    // 注入用户新增的脚本
    addedScripts.forEach((added) => {
      if (added.placement === 'head') headScripts += added.code;
      else bodyScripts += added.code;
    });

    if (headScripts) {
      const head = doc.querySelector('head');
      if (head) head.insertAdjacentHTML('beforeend', headScripts);
    }
    if (bodyScripts) {
      const body = doc.querySelector('body');
      if (body) body.insertAdjacentHTML('beforeend', bodyScripts);
    }

    setCleanedHtml(`<!DOCTYPE html>\n${doc.documentElement.outerHTML}`);
    setApplied(true);
  };

  if (!rawHtml) {
    return (
      <div className="max-w-6xl mx-auto pt-10 pb-6 px-6">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-slate-800">脚本管理</h2>
          <p className="text-slate-500 mt-1 text-sm">检测到的追踪脚本 — 选择移除、替换为你自己的，或保留</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
          <Search size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-400">请先在导入步骤加载 HTML</p>
        </div>
      </div>
    );
  }

  const stats = {
    total: detectedScripts.length,
    toRemove: detectedScripts.filter((s) => s.action === 'remove').length,
    toReplace: detectedScripts.filter((s) => s.action === 'replace').length,
    kept: detectedScripts.filter((s) => s.action === 'keep').length,
    added: addedScripts.length,
  };

  return (
    <div className="max-w-6xl mx-auto pt-10 pb-6 px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800">脚本管理</h2>
          <p className="text-slate-500 mt-1 text-sm">
            检测到 {stats.total} 个脚本 — {stats.toReplace} 个替换，{stats.toRemove} 个移除，{stats.kept} 个保留
            {stats.added > 0 && `，${stats.added} 个新增`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddDialog(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-[#6366f1] bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
            title="新增追踪脚本（即使页面没有也能添加）"
          >
            <Plus size={16} /> 新增追踪脚本
          </button>
          <button
            onClick={handleApplyToHtml}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              applied
                ? 'bg-green-500 text-white'
                : 'bg-[#6366f1] hover:bg-[#4f46e5] text-white shadow-md shadow-indigo-200'
            }`}
          >
            {applied ? <Check size={16} /> : <RefreshCw size={16} />}
            {applied ? '已应用' : '应用到 HTML'}
          </button>
        </div>
      </div>

      {/* 状态汇总卡片 */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-red-50 rounded-lg p-3 flex items-center justify-between">
          <span className="text-sm font-medium text-red-600">移除</span>
          <span className="text-xl font-bold text-red-500">{stats.toRemove}</span>
        </div>
        <div className="bg-indigo-50 rounded-lg p-3 flex items-center justify-between">
          <span className="text-sm font-medium text-indigo-600">替换</span>
          <span className="text-xl font-bold text-indigo-500">{stats.toReplace}</span>
        </div>
        <div className="bg-green-50 rounded-lg p-3 flex items-center justify-between">
          <span className="text-sm font-medium text-green-600">保留</span>
          <span className="text-xl font-bold text-green-500">{stats.kept}</span>
        </div>
        <div className="bg-purple-50 rounded-lg p-3 flex items-center justify-between">
          <span className="text-sm font-medium text-purple-600">新增</span>
          <span className="text-xl font-bold text-purple-500">{stats.added}</span>
        </div>
      </div>

      {/* 检测到的脚本列表 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
          <span className="text-sm font-medium text-slate-600">检测到的脚本（点击展开查看完整代码）</span>
        </div>
        {detectedScripts.length === 0 ? (
          <div className="p-8 text-center">
            <ShieldCheck size={40} className="text-green-400 mx-auto mb-3" />
            <p className="text-slate-500">未检测到脚本标签</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {detectedScripts.map((script) => {
              const isExpanded = expandedScripts.has(script.id);
              return (
                <div
                  key={script.id}
                  className={`${script.action === 'remove' ? 'bg-red-50/30' : ''}`}
                >
                  <div className="p-4 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                    {/* 展开/收起按钮 */}
                    <button
                      onClick={() => toggleExpand(script.id)}
                      className="text-slate-400 hover:text-slate-600 p-1 rounded transition-colors shrink-0"
                      title={isExpanded ? '收起完整代码' : '展开查看完整代码'}
                    >
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>

                    {/* 类型标签 */}
                    <span
                      className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${
                        SCRIPT_TYPE_COLORS[script.type] || 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {SCRIPT_TYPE_LABELS[script.type]}
                    </span>

                    {/* 信息 */}
                    <div className="flex-1 min-w-0">
                      {script.source && (
                        <p className="text-xs text-slate-400 font-mono truncate mb-0.5">{script.source}</p>
                      )}
                      <p className="text-sm text-slate-600 truncate">{script.codePreview}</p>
                      {script.action === 'replace' && script.replacementId && (
                        <p className="text-xs text-indigo-500 mt-0.5 flex items-center gap-1">
                          <Check size={10} /> 将替换为: {script.replacementId}
                        </p>
                      )}
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => { updateScriptAction(script.id, 'remove'); setApplied(false); }}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                          script.action === 'remove'
                            ? 'bg-red-500 text-white'
                            : 'text-slate-500 hover:bg-red-50 hover:text-red-600'
                        }`}
                        title="移除"
                      >
                        <Trash2 size={14} className="inline mr-1" />移除
                      </button>
                      <button
                        onClick={() => {
                          if (script.type === 'functional') return;
                          setShowReplaceDialog(script.id);
                        }}
                        disabled={script.type === 'functional'}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                          script.action === 'replace'
                            ? 'bg-indigo-500 text-white'
                            : 'text-slate-500 hover:bg-indigo-50 hover:text-indigo-600'
                        } disabled:opacity-30 disabled:cursor-not-allowed`}
                        title="替换"
                      >
                        <RefreshCw size={14} className="inline mr-1" />替换
                      </button>
                      <button
                        onClick={() => { updateScriptAction(script.id, 'keep'); setApplied(false); }}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                          script.action === 'keep'
                            ? 'bg-green-500 text-white'
                            : 'text-slate-500 hover:bg-green-50 hover:text-green-600'
                        }`}
                        title="保留"
                      >
                        <ShieldCheck size={14} className="inline mr-1" />保留
                      </button>
                    </div>

                    {script.type === 'functional' && (
                      <span className="shrink-0 flex items-center gap-1 text-xs text-green-600" title="功能性脚本建议保留">
                        <Info size={12} />功能性
                      </span>
                    )}
                  </div>

                  {/* 展开的完整代码 */}
                  {isExpanded && (
                    <div className="px-5 pb-4">
                      <div className="bg-slate-900 rounded-lg p-3 max-h-[300px] overflow-auto">
                        <p className="text-[10px] text-slate-500 mb-2 font-medium uppercase tracking-wider">
                          完整脚本代码
                        </p>
                        <pre className="text-xs text-green-400 whitespace-pre-wrap font-mono break-all">
                          {script.fullCode || '(空脚本)'}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 用户新增的脚本列表 */}
      {addedScripts.length > 0 && (
        <div className="bg-white rounded-xl border border-purple-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-purple-100 bg-purple-50 flex items-center justify-between">
            <span className="text-sm font-medium text-purple-700 flex items-center gap-2">
              <Plus size={14} /> 你新增的追踪脚本 ({addedScripts.length})
            </span>
          </div>
          <div className="divide-y divide-purple-50">
            {addedScripts.map((added) => {
              const template = getTemplateByType(added.type);
              const isExpanded = expandedScripts.has(added.id);
              return (
                <div key={added.id} className="bg-purple-50/30">
                  <div className="p-4 flex items-center gap-3">
                    <button
                      onClick={() => toggleExpand(added.id)}
                      className="text-purple-400 hover:text-purple-600 p-1 rounded transition-colors shrink-0"
                    >
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <span
                      className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${
                        SCRIPT_TYPE_COLORS[added.type] || 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {SCRIPT_TYPE_LABELS[added.type]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-purple-700">{template?.label || added.type}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        ID: <span className="font-mono">{added.trackingId}</span>
                        <span className="ml-2 text-slate-400">→ 注入到 &lt;{added.placement}&gt;</span>
                      </p>
                    </div>
                    <button
                      onClick={() => { removeScript(added.id); setApplied(false); }}
                      className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg transition-colors"
                      title="删除此新增脚本"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="px-5 pb-4">
                      <div className="bg-slate-900 rounded-lg p-3 max-h-[300px] overflow-auto">
                        <pre className="text-xs text-green-400 whitespace-pre-wrap font-mono break-all">
                          {added.code}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 对话框 */}
      {showReplaceDialog && (
        <ReplaceDialog
          script={detectedScripts.find((s) => s.id === showReplaceDialog)!}
          onClose={() => setShowReplaceDialog(null)}
          onConfirm={(type, id) => handleReplaceConfirm(showReplaceDialog, type, id)}
        />
      )}
      {showAddDialog && (
        <AddScriptDialog
          onClose={() => setShowAddDialog(false)}
          onConfirm={handleAddScript}
        />
      )}
    </div>
  );
}
