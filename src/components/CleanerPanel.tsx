import { useState, useMemo } from 'react';
import { Shield, Image, MessageSquare, Layers, Check, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { cleanHtml, type CleanResult } from '../lib/html-cleaner';
import type { CleanOptions } from '../types';

const CLEAN_OPTIONS = [
  {
    key: 'removeJSONLD' as const,
    label: 'JSON-LD 结构化数据',
    description: '移除 schema.org 结构化标记数据',
    icon: Shield,
    color: 'text-amber-500',
  },
  {
    key: 'removeTrackingPixels' as const,
    label: '追踪像素',
    description: '移除 1x1 像素和隐藏追踪图片',
    icon: Image,
    color: 'text-pink-500',
  },
  {
    key: 'removeComments' as const,
    label: 'HTML 注释',
    description: '移除开发者注释和条件注释',
    icon: MessageSquare,
    color: 'text-gray-500',
  },
  {
    key: 'removeEmptyNodes' as const,
    label: '空白节点',
    description: '移除无内容且无属性的空容器',
    icon: Layers,
    color: 'text-slate-500',
  },
];

export function CleanerPanel() {
  const { rawHtml, cleanOptions, setCleanOptions, cleanedHtml, setCleanedHtml } = useWorkflowStore();
  const [cleanResult, setCleanResult] = useState<CleanResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const effectiveHtml = cleanedHtml || rawHtml;

  const handleClean = () => {
    if (!effectiveHtml) return;
    const result = cleanHtml(effectiveHtml, cleanOptions);
    setCleanResult(result);
    setCleanedHtml(result.html);
    setShowPreview(true);
  };

  const removedTotal = cleanResult?.removedItems.reduce((sum, item) => sum + item.count, 0) || 0;

  const previewHtml = useMemo(() => {
    if (!cleanResult) return '';
    return highlightRemovedItems(cleanResult.html, cleanOptions);
  }, [cleanResult, cleanOptions]);

  if (!rawHtml) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-slate-800">页面清洗</h2>
          <p className="text-slate-500 mt-1 text-sm">清理 JSON-LD、追踪像素、注释等不必要元素</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
          <p className="text-slate-400">请先完成脚本管理和导入步骤</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800">页面清洗</h2>
          <p className="text-slate-500 mt-1 text-sm">
            选择要清理的元素类型，预览后确认执行
          </p>
        </div>
        <button
          onClick={handleClean}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#6366f1] hover:bg-[#4f46e5] text-white text-sm font-medium rounded-lg shadow-md shadow-indigo-200 transition-all"
        >
          <Check size={16} />
          执行清洗
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Options */}
        <div className="space-y-3">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="font-medium text-slate-700 mb-4">清洗选项</h3>
            {CLEAN_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isEnabled = cleanOptions[opt.key];
              return (
                <label
                  key={opt.key}
                  className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors mb-2 ${
                    isEnabled ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={(e) => setCleanOptions({ [opt.key]: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#6366f1] focus:ring-[#6366f1]"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Icon size={16} className={opt.color} />
                      <span className="text-sm font-medium text-slate-700">{opt.label}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 ml-7">{opt.description}</p>
                  </div>
                </label>
              );
            })}
          </div>

          {/* Results Summary */}
          {cleanResult && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="font-medium text-slate-700 mb-3 flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-500" />
                清洗结果
              </h3>
              <p className="text-sm text-slate-600 mb-3">
                共移除 <span className="font-bold text-red-500">{removedTotal}</span> 个元素
              </p>
              {cleanResult.removedItems.map((item) => (
                <div key={item.type} className="mb-3 last:mb-0">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{item.type}</span>
                    <span className="font-bold text-red-500">{item.count}</span>
                  </div>
                  {item.samples.length > 0 && (
                    <div className="mt-1 space-y-1">
                      {item.samples.map((s, i) => (
                        <div key={i} className="text-xs text-slate-400 bg-slate-50 rounded px-2 py-1 font-mono truncate">
                          {s || '(空)'}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Preview Panel */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
            <span className="text-sm font-medium text-slate-600">
              {showPreview ? '清洗后 HTML 预览' : 'HTML 预览'}
            </span>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-[#6366f1] transition-colors"
            >
              {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
              {showPreview ? '原始' : '预览'}
            </button>
          </div>
          <div className="p-4 max-h-[500px] overflow-auto">
            {showPreview && cleanResult ? (
              <pre
                className="text-xs font-mono text-slate-600 whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <pre className="text-xs font-mono text-slate-400 whitespace-pre-wrap max-h-[500px] overflow-auto">
                {highlightCode(effectiveHtml.substring(0, 5000))}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function highlightCode(html: string): string {
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function highlightRemovedItems(html: string, options: CleanOptions): string {
  const escaped = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Simple line-based highlighting for removed items
  return escaped
    .split('\n')
    .map((line) => {
      if (options.removeComments && line.includes('&lt;!--')) {
        return `<span class="text-red-400 line-through">${line}</span>`;
      }
      return `<span class="text-slate-500">${line}</span>`;
    })
    .join('\n');
}
