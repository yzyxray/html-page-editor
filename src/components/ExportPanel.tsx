import { useState, useEffect, useCallback, useRef } from 'react';
import { Download, Copy, Check, FileText, Globe, AlertTriangle, Settings, Code, RefreshCw } from 'lucide-react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { exportHtml, downloadHtml } from '../lib/exporter';
import type { ExportResult } from '../lib/exporter';

export function ExportPanel() {
  const { finalHtml, cleanedHtml, exportOptions, setExportOptions, detectedScripts, addedScripts } = useWorkflowStore();
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [copied, setCopied] = useState(false);
  const hasAutoExported = useRef(false);
  const prevHtmlRef = useRef('');

  const effectiveHtml = finalHtml || cleanedHtml;

  const handleExport = useCallback(async () => {
    if (!effectiveHtml) return;
    setProcessing(true);
    try {
      const result = await exportHtml(effectiveHtml, exportOptions, detectedScripts, addedScripts);
      setExportResult(result);
    } finally {
      setProcessing(false);
    }
  }, [effectiveHtml, exportOptions, detectedScripts, addedScripts]);

  // Auto-export on first visit or when HTML changes
  useEffect(() => {
    if (effectiveHtml && effectiveHtml !== prevHtmlRef.current) {
      prevHtmlRef.current = effectiveHtml;
      hasAutoExported.current = false;
    }
    if (effectiveHtml && !hasAutoExported.current) {
      hasAutoExported.current = true;
      handleExport();
    }
  }, [effectiveHtml, handleExport]);

  const handleDownload = () => {
    if (exportResult) {
      downloadHtml(exportResult.html, exportOptions.fileName);
    }
  };

  const handleCopy = async () => {
    if (exportResult) {
      await navigator.clipboard.writeText(exportResult.html);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const replacedCount = detectedScripts.filter((s) => s.action === 'replace' && s.replacementId).length;

  if (!effectiveHtml) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-slate-800">导出 HTML</h2>
          <p className="text-slate-500 mt-1 text-sm">导出独立 HTML 文件，可直接部署到 Cloudflare Pages 或 Vercel</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
          <FileText size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-400">请先完成可视化编辑步骤</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800">导出 HTML</h2>
          <p className="text-slate-500 mt-1 text-sm">
            导出独立静态 HTML 文件，可直接部署到 Cloudflare Pages 或 Vercel
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors"
          >
            {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
            {copied ? '已复制' : '复制源码'}
          </button>
          <button
            onClick={handleDownload}
            disabled={!exportResult || processing}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#6366f1] hover:bg-[#4f46e5] text-white text-sm font-medium rounded-lg shadow-md shadow-indigo-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={16} />
            下载 HTML
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Export Options */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="font-medium text-slate-700 mb-4 flex items-center gap-2">
              <Settings size={16} className="text-[#6366f1]" />
              导出选项
            </h3>

            {/* File name */}
            <label className="block text-sm font-medium text-slate-600 mb-2">文件名</label>
            <input
              type="text"
              value={exportOptions.fileName}
              onChange={(e) => setExportOptions({ fileName: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent mb-4"
            />

            <div className="space-y-3">
              <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-indigo-50/50 transition-colors">
                <input
                  type="checkbox"
                  checked={exportOptions.inlineStyles}
                  onChange={(e) => setExportOptions({ inlineStyles: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-[#6366f1] focus:ring-[#6366f1]"
                />
                <div>
                  <span className="text-sm font-medium text-slate-700 block">内联 CSS</span>
                  <span className="text-xs text-slate-500">将外部样式表转为内联 style 标签</span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-indigo-50/50 transition-colors">
                <input
                  type="checkbox"
                  checked={exportOptions.cleanEditorAttrs}
                  onChange={(e) => setExportOptions({ cleanEditorAttrs: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-[#6366f1] focus:ring-[#6366f1]"
                />
                <div>
                  <span className="text-sm font-medium text-slate-700 block">清理编辑器残留</span>
                  <span className="text-xs text-slate-500">移除 GrapesJS 生成的数据属性</span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-indigo-50/50 transition-colors">
                <input
                  type="checkbox"
                  checked={exportOptions.minify}
                  onChange={(e) => setExportOptions({ minify: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-[#6366f1] focus:ring-[#6366f1]"
                />
                <div>
                  <span className="text-sm font-medium text-slate-700 block">压缩输出</span>
                  <span className="text-xs text-slate-500">移除空格减少文件大小（默认美化格式）</span>
                </div>
              </label>
            </div>
          </div>

          {/* Tracking Summary */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="font-medium text-slate-700 mb-3 flex items-center gap-2">
              <Code size={16} className="text-indigo-500" />
              已注入追踪脚本
            </h3>
            {replacedCount > 0 ? (
              <div className="space-y-2">
                {detectedScripts
                  .filter((s) => s.action === 'replace' && s.replacementId)
                  .map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-2 text-sm p-2 bg-indigo-50 rounded-lg"
                    >
                      <Check size={14} className="text-green-500 shrink-0" />
                      <span className="text-slate-600 capitalize">{s.type.replace(/-/g, ' ')}</span>
                      <code className="text-xs text-indigo-600 ml-auto">{s.replacementId}</code>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">未检测到需要注入的追踪脚本</p>
            )}
          </div>

          {/* File Info */}
          {exportResult && (
            <div className="bg-white rounded-xl border border-green-200 shadow-sm p-5">
              <h3 className="font-medium text-green-700 mb-3 flex items-center gap-2">
                <FileText size={16} />
                文件信息
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">文件大小</span>
                  <span className="font-mono font-medium text-slate-700">
                    {formatSize(exportResult.size)}
                  </span>
                </div>
                {exportResult.warnings.length > 0 && (
                  <div className="mt-2 p-2 bg-amber-50 rounded-lg">
                    <p className="text-xs font-medium text-amber-600 flex items-center gap-1 mb-1">
                      <AlertTriangle size={12} /> 警告
                    </p>
                    {exportResult.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-amber-500">{w}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Deployment hint */}
          <div className="bg-gradient-to-br from-[#1a1a2e] to-[#2d2d4e] rounded-xl p-5 text-white">
            <div className="flex items-center gap-2 mb-3">
              <Globe size={16} className="text-[#818cf8]" />
              <span className="font-medium text-sm">立即部署</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              下载的 HTML 文件是完全独立的静态页面，可直接：
            </p>
            <ul className="text-xs text-slate-300 mt-2 space-y-1.5 ml-3">
              <li className="list-disc">拖拽上传到 Cloudflare Pages</li>
              <li className="list-disc">部署到 Vercel 静态托管</li>
              <li className="list-disc">上传到任意 Web 服务器</li>
              <li className="list-disc">通过 Netlify / GitHub Pages 部署</li>
            </ul>
          </div>
        </div>

        {/* Preview */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">HTML 预览</span>
              {exportResult && (
                <span className="text-xs text-slate-400 font-mono">
                  {exportResult.html.length.toLocaleString()} 字符
                </span>
              )}
            </div>
            <div className="p-4 max-h-[600px] overflow-auto">
              {exportResult ? (
                <pre className="text-xs font-mono text-slate-600 whitespace-pre-wrap leading-relaxed">
                  <code>{exportResult.html.substring(0, 15000)}{exportResult.html.length > 15000 ? '\n\n... (内容已截断，请下载查看完整文件)' : ''}</code>
                </pre>
              ) : processing ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin w-6 h-6 border-2 border-[#6366f1] border-t-transparent rounded-full" />
                  <span className="ml-3 text-sm text-slate-500">处理中...</span>
                </div>
              ) : (
                <p className="text-slate-400 text-sm text-center py-12">等待导出...</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
