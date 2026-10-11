import { useState, useRef, useCallback } from 'react';
import { Upload, Code, FileText, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { classifySize, formatBytes, SIZE_TIER_MESSAGES, type SizeTier } from '../lib/size-guard';
import { inlineImagesInHtml, type ImageInlineResult } from '../lib/image-inliner';

export function ImportPanel() {
  const { rawHtml, setRawHtml, setStats } = useWorkflowStore();
  const [htmlInput, setHtmlInput] = useState('');
  const [error, setError] = useState('');
  const [imported, setImported] = useState(false);
  const [sizeTier, setSizeTier] = useState<SizeTier>('normal');
  /** 体积超阈值时暂存 HTML，等用户点「仍然继续」再真正导入 */
  const [pendingLarge, setPendingLarge] = useState<{ html: string; tier: SizeTier } | null>(null);
  /** 相对路径 / 外链资源检测结果，导入后展示给用户 */
  const [resourceWarn, setResourceWarn] = useState<null | {
    relImgs: number;
    extImgs: number;
    relCss: number;
    extCss: number;
  }>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** 图片内联兜底：相对路径需基准地址，外链需服务器允许跨域 */
  const [baseUrl, setBaseUrl] = useState('');
  const [inlining, setInlining] = useState(false);
  const [inlineResult, setInlineResult] = useState<ImageInlineResult | null>(null);

  /**
   * 检测页面里的资源引用方式。这直接决定「图片为什么不见了」：
   *   - 相对路径（src="images/logo.png"）→ 画布 iframe 会按本站域名解析 → 必 404，
   *     画布、预览、导出产物全部缺图/缺样式。浏览器「另存为（仅 HTML）」的页面几乎全是这种。
   *   - 外链（src="https://cdn.xxx/img.png"）→ 画布里能显示，但成品仍依赖竞品服务器：
   *     对方一删图就挂，且竞品能从 CDN 日志看到你在复用它的资源。
   * 只有 data: 内联的才是真正自包含、可安全编辑的。
   */
  const detectResourceIssues = (doc: Document) => {
    const isData = (u: string) => u.toLowerCase().startsWith('data:');
    const hasProtocol = (u: string) => /^[a-z][a-z0-9+.-]*:/i.test(u);

    let relImgs = 0;
    let extImgs = 0;
    doc.querySelectorAll('img').forEach((el) => {
      const src = (el.getAttribute('src') || '').trim();
      if (!src || isData(src)) return;
      if (hasProtocol(src)) extImgs++;
      else relImgs++;
    });

    let relCss = 0;
    let extCss = 0;
    doc.querySelectorAll('link[rel~="stylesheet" i]').forEach((el) => {
      const href = (el.getAttribute('href') || '').trim();
      if (!href || isData(href)) return;
      if (hasProtocol(href)) extCss++;
      else relCss++;
    });

    return { relImgs, extImgs, relCss, extCss };
  };

  /** 真正执行导入：统计 + 写入 store */
  const doImport = useCallback((html: string) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const scripts = doc.querySelectorAll('script');
    const links = doc.querySelectorAll('a[href], img[src], form[action], iframe[src]');
    const images = doc.querySelectorAll('img');

    setStats({
      htmlSize: new Blob([html]).size,
      scriptCount: scripts.length,
      linkCount: links.length,
      imageCount: images.length,
    });

    setResourceWarn(detectResourceIssues(doc));
    setRawHtml(html);
    setInlineResult(null);
    setImported(true);
  }, [setRawHtml, setStats, setInlineResult]);

  const analyzeHtml = useCallback((html: string) => {
    const bytes = new Blob([html]).size;
    const tier = classifySize(bytes);
    setSizeTier(tier);

    // 超大页面不直接导入：先给出分级提示与显式继续入口，避免一步按下去就把标签页卡死
    if (tier === 'oversize' || tier === 'blocked') {
      setPendingLarge({ html, tier });
      setError('');
      return;
    }

    setPendingLarge(null);
    setError('');
    doImport(html);
  }, [doImport]);

  const handleForceProceed = useCallback(() => {
    if (!pendingLarge) return;
    const { html } = pendingLarge;
    setPendingLarge(null);
    doImport(html);
  }, [pendingLarge, doImport]);

  const handleDiscardLarge = useCallback(() => {
    setPendingLarge(null);
    setHtmlInput('');
  }, []);

  /** 把外链/相对路径图片尽量内联成 data URL（最佳努力，失败的保留原链接） */
  const handleInlineImages = useCallback(async () => {
    if (!rawHtml) return;
    setInlining(true);
    try {
      const result = await inlineImagesInHtml(rawHtml, baseUrl.trim() || undefined);
      // 重新写回 store，并刷新统计与资源告警，让红/黄提示随内联结果更新
      const parser = new DOMParser();
      const doc = parser.parseFromString(result.html, 'text/html');
      const scripts = doc.querySelectorAll('script').length;
      const links = doc.querySelectorAll('a[href], img[src], form[action], iframe[src]').length;
      const images = doc.querySelectorAll('img').length;
      setStats({
        htmlSize: new Blob([result.html]).size,
        scriptCount: scripts,
        linkCount: links,
        imageCount: images,
      });
      setResourceWarn(detectResourceIssues(doc));
      setRawHtml(result.html);
      setInlineResult(result);
    } catch {
      // 极端情况下也不破坏已导入内容
      setInlineResult({ html: rawHtml, total: 0, inlined: 0, skipped: 0, failed: [] });
    } finally {
      setInlining(false);
    }
  }, [rawHtml, baseUrl, setRawHtml, setStats, setResourceWarn]);

  const handlePaste = () => {
    if (!htmlInput.trim()) {
      setError('请粘贴 HTML 源码');
      return;
    }
    setError('');
    analyzeHtml(htmlInput);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.html') && !file.name.endsWith('.htm')) {
      setError('仅支持 .html 或 .htm 文件');
      return;
    }
    setError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      setHtmlInput(content);
      analyzeHtml(content);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!file.name.endsWith('.html') && !file.name.endsWith('.htm')) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      setHtmlInput(content);
      analyzeHtml(content);
    };
    reader.readAsText(file);
  };

  const stats = useWorkflowStore((s) => s.stats);

  return (
    <div className="max-w-6xl mx-auto pt-10 pb-6 px-6">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-slate-800">导入 HTML</h2>
        <p className="text-slate-500 mt-1 text-sm">粘贴竞品 HTML 源码或上传 .html 文件开始编辑</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Paste Area */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Code size={18} className="text-[#6366f1]" />
            <h3 className="font-medium text-slate-700">粘贴 HTML 源码</h3>
          </div>
          <textarea
            value={htmlInput}
            onChange={(e) => setHtmlInput(e.target.value)}
            placeholder='<html>
<head>...</head>
<body>
  <div class="landing-page">
    ...
  </div>
</body>
</html>'
            className="w-full h-64 p-4 font-mono text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
            spellCheck={false}
          />
          <button
            onClick={handlePaste}
            className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#6366f1] hover:bg-[#4f46e5] text-white font-medium rounded-lg transition-colors"
          >
            <Code size={16} />
            解析 HTML
          </button>
        </div>

        {/* Upload Area */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <FileText size={18} className="text-[#6366f1]" />
            <h3 className="font-medium text-slate-700">上传 HTML 文件</h3>
          </div>
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="h-64 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center gap-3 hover:border-[#6366f1] hover:bg-indigo-50/30 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={40} className="text-slate-400" />
            <div className="text-center">
              <p className="text-sm text-slate-600 font-medium">拖拽 .html 文件到此处</p>
              <p className="text-xs text-slate-400 mt-1">或点击选择文件</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,.htm"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* 大页面二次确认 —— 超过 15MB 时不直接导入，先让用户知情 */}
      {pendingLarge && (
        <div
          className={`mt-4 p-4 rounded-xl border shadow-sm ${
            pendingLarge.tier === 'blocked'
              ? 'bg-red-50 border-red-200'
              : 'bg-amber-50 border-amber-200'
          }`}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              size={20}
              className={`shrink-0 mt-0.5 ${
                pendingLarge.tier === 'blocked' ? 'text-red-500' : 'text-amber-500'
              }`}
            />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${pendingLarge.tier === 'blocked' ? 'text-red-700' : 'text-amber-700'}`}>
                {SIZE_TIER_MESSAGES[pendingLarge.tier].title}
                （{formatBytes(new Blob([pendingLarge.html]).size)}）
              </p>
              <p className={`text-xs mt-1.5 leading-relaxed ${pendingLarge.tier === 'blocked' ? 'text-red-600' : 'text-amber-700'}`}>
                {SIZE_TIER_MESSAGES[pendingLarge.tier].body}
              </p>
              <div className="flex gap-2 mt-3">
                {pendingLarge.tier !== 'blocked' && (
                  <button
                    onClick={handleForceProceed}
                    className="px-4 py-2 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors"
                  >
                    仍然继续编辑
                  </button>
                )}
                <button
                  onClick={handleDiscardLarge}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-white border border-slate-200 bg-white/70 rounded-lg transition-colors"
                >
                  放弃本次导入
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
          <span className="text-red-500">⚠</span> {error}
        </div>
      )}

      {/* Stats after import */}
      {imported && rawHtml && (
        <div className="mt-6 bg-white rounded-xl border border-green-200 shadow-sm p-5">
          <h3 className="font-medium text-green-700 flex items-center gap-2 mb-4">
            <FileText size={18} />
            HTML 导入成功
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-slate-700">{formatBytes(stats.htmlSize)}</p>
              <p className="text-xs text-slate-500 mt-1">文件大小</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-amber-600">{stats.scriptCount}</p>
              <p className="text-xs text-amber-500 mt-1">Script 标签</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.linkCount}</p>
              <p className="text-xs text-blue-500 mt-1">链接元素</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-purple-600">{stats.imageCount}</p>
              <p className="text-xs text-purple-500 mt-1">图片</p>
            </div>
          </div>

          {/* 图片内联兜底：把外链 / 相对路径图片尽量转成内联 data URL */}
          <div className="mt-4 p-4 rounded-xl border border-slate-200 bg-slate-50">
            <div className="flex items-center gap-2 mb-2">
              <ImageIcon size={16} className="text-[#6366f1]" />
              <h4 className="text-sm font-medium text-slate-700">图片内联（让图片真正显示）</h4>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed mb-3">
              把外链 / 相对路径图片尽量转成内联 data URL。相对路径需填写下方「页面来源 URL」作基准；
              外链图片仅当对方服务器允许跨域时才能内联，否则会跳过并保留原链接（可在 Chrome 扩展上线后完整抓取）。
            </p>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="页面来源 URL（解析相对路径用，如 https://x.com/p/123）"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1] mb-3"
              spellCheck={false}
            />
            <button
              onClick={handleInlineImages}
              disabled={inlining}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
            >
              {inlining ? '内联中…' : '开始内联图片'}
            </button>
            {inlineResult && (
              <p className={`text-xs mt-3 leading-relaxed ${inlineResult.inlined > 0 ? 'text-green-700' : 'text-slate-500'}`}>
                成功内联 {inlineResult.inlined} / {inlineResult.total} 张
                （原本就是内联的 {inlineResult.skipped} 张无需处理
                {inlineResult.failed.length > 0
                  ? `；失败 ${inlineResult.failed.length} 张，多为跨域限制，扩展抓取上线后可完整内联`
                  : ''}）。
              </p>
            )}
          </div>

          {sizeTier !== 'normal' && SIZE_TIER_MESSAGES[sizeTier].body && (
            <div
              className={`mt-4 p-3 rounded-lg flex items-start gap-2 ${
                sizeTier === 'large' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
              }`}
            >
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed">{SIZE_TIER_MESSAGES[sizeTier].body}</p>
            </div>
          )}
          {resourceWarn && (resourceWarn.relImgs > 0 || resourceWarn.relCss > 0) && (
            <div className="mt-4 p-3 rounded-lg flex items-start gap-2 bg-red-50 border border-red-200 text-red-700">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed">
                检测到 {resourceWarn.relImgs} 张相对路径图片、{resourceWarn.relCss} 个相对路径样式表
                ——这些资源在编辑画布与导出产物中都会加载失败（页面缺图、样式丢失）。
                「另存为（仅 HTML）」保存的竞品页几乎全是这种情况。请改用图片内联的自包含 HTML 文件，
                或等扩展抓取功能上线后一键抓取。
              </p>
            </div>
          )}
          {resourceWarn && (resourceWarn.extImgs > 0 || resourceWarn.extCss > 0) && (
            <div className="mt-3 p-3 rounded-lg flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-700">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed">
                检测到 {resourceWarn.extImgs} 张外链图片、{resourceWarn.extCss} 个外链样式表
                ——画布里可以正常显示，但导出后的页面仍依赖竞品服务器加载这些资源：
                对方删除资源即失效，且会从访问日志看出你在复用其页面。建议内联或替换为自有资源。
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
