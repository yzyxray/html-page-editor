import { useState, useRef, useCallback } from 'react';
import { Upload, Code, FileText } from 'lucide-react';
import { useWorkflowStore } from '../store/useWorkflowStore';

export function ImportPanel() {
  const { rawHtml, setRawHtml, setStats } = useWorkflowStore();
  const [htmlInput, setHtmlInput] = useState('');
  const [error, setError] = useState('');
  const [imported, setImported] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const analyzeHtml = useCallback((html: string) => {
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

    setRawHtml(html);
    setImported(true);
  }, [setRawHtml, setStats]);

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
    <div className="max-w-6xl mx-auto p-6">
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
              <p className="text-2xl font-bold text-slate-700">{formatSize(stats.htmlSize)}</p>
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
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
