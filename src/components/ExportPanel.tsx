import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Download, Copy, Check, FileText, Globe, AlertTriangle, Settings, Code, RefreshCw,
  Archive, UploadCloud, FileDown, LoaderCircle, Eye, Monitor, Smartphone,
} from 'lucide-react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { exportHtml, downloadHtml, downloadZip } from '../lib/exporter';
import type { ExportResult } from '../lib/exporter';
import { writeFileOnBranch, GitHubError } from '../lib/github-api';
import { readGhConfig, isGhConfigReady, saveArchive } from '../lib/github-store';
import { classifySize, formatBytes, SIZE_TIER_MESSAGES } from '../lib/size-guard';

export function ExportPanel() {
  const { finalHtml, cleanedHtml, exportOptions, setExportOptions, detectedScripts, addedScripts } = useWorkflowStore();
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [copied, setCopied] = useState(false);
  const hasAutoExported = useRef(false);
  const prevHtmlRef = useRef('');

  // ── 发布与存档出口 ──
  const [busyOutlet, setBusyOutlet] = useState<'' | 'archive' | 'deploy' | 'zip'>('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [archiveName, setArchiveName] = useState('');

  // ── 预览模式：可视化渲染（默认）/ HTML 源码 ──
  const [previewMode, setPreviewMode] = useState<'visual' | 'source'>('visual');
  const [previewWidth, setPreviewWidth] = useState<'desktop' | 'mobile'>('desktop');

  const ghConfig = readGhConfig();
  const ghReady = isGhConfigReady(ghConfig);
  const tier = exportResult ? classifySize(exportResult.size) : 'normal';

  const notify = useCallback((type: 'success' | 'error', message: string) => {
    setNotice({ type, message });
  }, []);

  /** GitHub 未配置时给出明确引导，而不是抛一个天书般的 API 错误 */
  const requireGh = useCallback((): boolean => {
    if (isGhConfigReady(readGhConfig())) return true;
    notify(
      'error',
      '尚未配置 GitHub。请点顶栏的「配置 GitHub」填入 token 与仓库信息后再使用该出口。'
    );
    return false;
  }, [notify]);

  const handleArchive = useCallback(async () => {
    if (!exportResult || busyOutlet) return;
    if (!requireGh()) return;
    const name = archiveName.trim() || exportOptions.fileName || '未命名落地页';
    setBusyOutlet('archive');
    try {
      const dir = await saveArchive(readGhConfig()!, { name, html: exportResult.html });
      notify('success', `已存档到 GitHub：${dir}`);
      setArchiveName('');
    } catch (err) {
      console.error('[ExportPanel] 存档失败:', err);
      notify('error', err instanceof GitHubError ? err.message : '存档失败');
    } finally {
      setBusyOutlet('');
    }
  }, [exportResult, busyOutlet, archiveName, exportOptions.fileName, requireGh, notify]);

  const handleDeploy = useCallback(async () => {
    if (!exportResult || busyOutlet) return;
    if (!requireGh()) return;
    const cfg = readGhConfig()!;
    setBusyOutlet('deploy');
    try {
      await writeFileOnBranch(
        cfg,
        cfg.deployBranch || 'site',
        'index.html',
        exportResult.html,
        `deploy: ${exportOptions.fileName || 'landing-page'} @ ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
      );
      notify(
        'success',
        `已推送到部署分支 ${cfg.deployBranch}。若该分支已绑定 Cloudflare Pages 项目，约 1 分钟内自动上线。`
      );
    } catch (err) {
      console.error('[ExportPanel] 推送失败:', err);
      notify('error', err instanceof GitHubError ? err.message : '推送失败');
    } finally {
      setBusyOutlet('');
    }
  }, [exportResult, busyOutlet, exportOptions.fileName, requireGh, notify]);

  const handleZip = useCallback(() => {
    if (!exportResult || busyOutlet) return;
    setBusyOutlet('zip');
    try {
      downloadZip(exportResult.html, exportOptions.fileName);
      notify('success', 'zip 已下载。包内只有一个 index.html，可直接拖进任意静态托管平台。');
    } finally {
      setBusyOutlet('');
    }
  }, [exportResult, busyOutlet, exportOptions.fileName, notify]);

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
      <div className="max-w-6xl mx-auto pt-10 pb-6 px-6">
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
    <div className="max-w-6xl mx-auto pt-10 pb-6 px-6">
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

          {/* 发布与存档 */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
              <UploadCloud size={16} className="text-[#6366f1]" />
              发布与存档
            </h3>
            <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
              {ghReady ? (
                <>
                  目标仓库{' '}
                  <code className="font-mono text-slate-500">
                    {ghConfig!.owner}/{ghConfig!.repo}
                  </code>
                </>
              ) : (
                '需要先配置 GitHub——点顶栏「配置 GitHub」填入 token 与仓库信息'
              )}
            </p>

            {/* 存档 */}
            <input
              type="text"
              value={archiveName}
              onChange={(e) => setArchiveName(e.target.value)}
              placeholder={`存档名称（默认 ${exportOptions.fileName || 'landing-page'}）`}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent mb-2"
              spellCheck={false}
            />
            <button
              onClick={handleArchive}
              disabled={!!busyOutlet || !exportResult}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed mb-2"
            >
              {busyOutlet === 'archive' ? (
                <LoaderCircle size={14} className="animate-spin" />
              ) : (
                <Archive size={14} />
              )}
              {busyOutlet === 'archive' ? '正在写入 GitHub...' : '存档到 GitHub'}
            </button>

            {/* 推送落地页 */}
            <button
              onClick={handleDeploy}
              disabled={!!busyOutlet || !exportResult}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed mb-2"
            >
              {busyOutlet === 'deploy' ? (
                <LoaderCircle size={14} className="animate-spin" />
              ) : (
                <UploadCloud size={14} />
              )}
              {busyOutlet === 'deploy' ? '正在推送...' : '推送落地页（触发 Pages 部署）'}
            </button>

            {/* 下载 zip */}
            <button
              onClick={handleZip}
              disabled={!!busyOutlet || !exportResult}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileDown size={14} />
              下载 zip（可直接拖进任意静态托管）
            </button>

            {/* 体积分级提示 */}
            {tier !== 'normal' && (
              <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-700 leading-relaxed flex items-start gap-1.5">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                <span>{SIZE_TIER_MESSAGES[tier].body}</span>
              </div>
            )}

            {/* 降级提示 */}
            {exportResult?.degraded && exportResult.skippedSteps.length > 0 && (
              <div className="mt-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 leading-relaxed">
                页面较大，本次导出已跳过：
                <span className="font-medium text-slate-700 mx-1">
                  {exportResult.skippedSteps.join('、')}
                </span>
                ，以保证不卡死。输出为原样格式，不影响页面可用性。
              </div>
            )}

            {/* 通知 */}
            {notice && (
              <div
                className={`mt-3 p-2.5 rounded-lg text-[11px] leading-relaxed flex items-start gap-1.5 ${
                  notice.type === 'success'
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {notice.type === 'success' ? (
                  <Check size={12} className="shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                )}
                <span className="break-words">{notice.message}</span>
              </div>
            )}
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
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full flex flex-col">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3 flex-wrap">
              <span className="text-sm font-medium text-slate-600">
                {previewMode === 'visual' ? '成品预览' : 'HTML 源码'}
              </span>

              <div className="flex items-center gap-2">
                {/* 视口切换 */}
                {previewMode === 'visual' && (
                  <div className="flex items-center gap-1 bg-slate-200/60 rounded-lg p-0.5">
                    <button
                      onClick={() => setPreviewWidth('desktop')}
                      className={`p-1.5 rounded-md transition-colors ${
                        previewWidth === 'desktop'
                          ? 'bg-white text-[#6366f1] shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                      title="桌面视口"
                    >
                      <Monitor size={14} />
                    </button>
                    <button
                      onClick={() => setPreviewWidth('mobile')}
                      className={`p-1.5 rounded-md transition-colors ${
                        previewWidth === 'mobile'
                          ? 'bg-white text-[#6366f1] shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                      title="手机视口（投放流量以移动端为主时用这个）"
                    >
                      <Smartphone size={14} />
                    </button>
                  </div>
                )}

                {/* 可视化 / 源码 切换 */}
                <button
                  onClick={() => setPreviewMode((m) => (m === 'visual' ? 'source' : 'visual'))}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  title={previewMode === 'visual' ? '查看 HTML 源码' : '回到可视化预览'}
                >
                  {previewMode === 'visual' ? <Code size={14} /> : <Eye size={14} />}
                  {previewMode === 'visual' ? '源码' : '可视化'}
                </button>

                {exportResult && (
                  <span className="text-xs text-slate-400 font-mono">
                    {exportResult.html.length.toLocaleString()} 字符
                  </span>
                )}
              </div>
            </div>

            <div className="p-4 flex-1 min-h-0">
              {!exportResult ? (
                processing ? (
                  <div className="flex items-center justify-center h-[600px]">
                    <div className="animate-spin w-6 h-6 border-2 border-[#6366f1] border-t-transparent rounded-full" />
                    <span className="ml-3 text-sm text-slate-500">处理中...</span>
                  </div>
                ) : (
                  <p className="text-slate-400 text-sm text-center py-12">等待导出...</p>
                )
              ) : previewMode === 'visual' ? (
                <>
                  <div className="flex justify-center">
                    <iframe
                      title="成品页面预览"
                      srcDoc={exportResult.html}
                      /*不给 allow-same-origin：预览内容被隔离在独立来源里，
                        无法读写本应用的 localStorage / cookie，避免竞品页里的脚本
                        读到我们的 GitHub token。allow-popups-to-escape-sandbox 让 CTA
                        按钮能正常在新标签打开，便于验证落地页链接。*/
                      sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
                      className="w-full border border-slate-200 rounded-lg bg-white"
                      style={{
                        height: '600px',
                        maxWidth: previewWidth === 'mobile' ? '390px' : '100%',
                      }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2.5 leading-relaxed">
                    这是导出后文件的真实渲染效果。若图片裂开或样式缺失，说明该页面的资源用的是相对路径、
                    浏览器内无法解析——由扩展抓取时会自动转成 base64 内联，不会有这个问题。
                  </p>
                </>
              ) : (
                <pre className="text-xs font-mono text-slate-600 whitespace-pre-wrap leading-relaxed max-h-[600px] overflow-auto">
                  <code>
                    {exportResult.html.substring(0, 15000)}
                    {exportResult.html.length > 15000 ? '\n\n... (内容已截断，请下载查看完整文件)' : ''}
                  </code>
                </pre>
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
