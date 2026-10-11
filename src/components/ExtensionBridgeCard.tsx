import { useCallback, useEffect, useRef, useState } from 'react';
import { Plug, RefreshCw, Download, Copy, Check, AlertTriangle, Loader2 } from 'lucide-react';
import type { ExtensionStatus, ExtensionCapture } from '../types';
import {
  readExtensionId,
  writeExtensionId,
  isValidExtensionId,
  isExtensionApiAvailable,
  getExtensionStatus,
  fetchLastCapture,
  friendlyBridgeError,
} from '../lib/capture-bridge';

interface Props {
  /** 导入抓取结果（父组件负责写入工作流、跑体积分级与资源检测） */
  onImport: (capture: ExtensionCapture) => void;
}

function formatBytes(n: number): string {
  if (!n || n < 1024) return `${n || 0} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return iso;
  }
}

function domainOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url || '未知来源';
  }
}

export function ExtensionBridgeCard({ onImport }: Props) {
  const [extensionId, setExtensionId] = useState(() => readExtensionId());
  const [input, setInput] = useState(() => readExtensionId());
  const [status, setStatus] = useState<ExtensionStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [received, setReceived] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  const configured = isValidExtensionId(extensionId);
  const apiAvailable = isExtensionApiAvailable();

  const refresh = useCallback(async () => {
    if (!configured || !apiAvailable) {
      setStatus(null);
      return;
    }
    setChecking(true);
    try {
      const s = await getExtensionStatus();
      setStatus(s);
      setError(null);
    } catch (e) {
      setStatus(null);
      setError(friendlyBridgeError(e));
    } finally {
      setChecking(false);
    }
  }, [configured, apiAvailable]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 抓取进行中时轮询，实时反映进度
  useEffect(() => {
    const running = !!(status?.progress?.running && !status.progress.done);
    if (!running) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    timerRef.current = window.setInterval(refresh, 2000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [status?.progress?.running, status?.progress?.done, refresh]);

  const handleSaveId = () => {
    const id = input.trim();
    writeExtensionId(id);
    setExtensionId(id);
    setError(null);
  };

  const handleCopyInstructions = async () => {
    const text =
      'HLEditor 页面抓取扩展\n1. Chrome 打开 chrome://extensions/ 并开启「开发者模式」\n2. 点「加载已解压的扩展程序」，选择 html-page-crawler-extension 目录\n3. 复制列表里出现的扩展 ID，填进 HLEditor 第 1 步的扩展桥接卡片';
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('复制失败', e);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setReceived(0);
    setError(null);
    try {
      const capture = await fetchLastCapture((chunks) => setReceived(chunks));
      onImport(capture);
    } catch (e) {
      setError(friendlyBridgeError(e));
    } finally {
      setImporting(false);
    }
  };

  const capture = status?.capture || null;
  const progress = status?.progress || null;
  const running = !!(progress?.running && !progress.done);

  // 状态徽标
  let badge: { text: string; cls: string };
  if (!apiAvailable) badge = { text: '未检测到扩展', cls: 'bg-slate-100 text-slate-500' };
  else if (!configured) badge = { text: '未配置扩展 ID', cls: 'bg-slate-100 text-slate-500' };
  else if (error) badge = { text: '扩展无响应', cls: 'bg-red-50 text-red-600' };
  else if (!capture) badge = { text: '已连接 · 暂无抓取记录', cls: 'bg-amber-50 text-amber-700' };
  else badge = { text: '已连接', cls: 'bg-green-50 text-green-700' };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Plug size={18} className="text-[#6366f1]" />
          <h3 className="font-medium text-slate-700">从竞品页面一键抓取</h3>
        </div>
        <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${badge.cls}`}>{badge.text}</span>
      </div>

      {/* 抓取进行中：细进度条 */}
      {running && (
        <div className="mb-4">
          <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#818cf8] to-[#6366f1] transition-all"
              style={{
                width:
                  progress && progress.stage === 'resources' && progress.total > 0
                    ? `${Math.min(100, Math.round((progress.cursor / progress.total) * 100))}%`
                    : '35%',
              }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            {progress?.stage === 'collecting'
              ? '正在采集页面 DOM…'
              : progress?.stage === 'resources'
              ? `正在下载并内联资源 ${progress?.cursor || 0}/${progress?.total || 0}`
              : '正在生成自包含 HTML…'}
          </p>
        </div>
      )}

      {/* 抓取记录摘要 */}
      {capture && !running && (
        <div className="mb-4 p-3 bg-slate-50 rounded-lg">
          <p className="text-xs font-mono text-slate-500 truncate">{domainOf(capture.pageUrl)}</p>
          <p className="text-xs text-slate-500 mt-1">
            {formatTime(capture.capturedAt)} · {formatBytes(capture.htmlBytes)} · 资源{' '}
            {capture.stats.resourceTotal} 个 · 内联 {capture.stats.inlined} 个
            {capture.stats.skipped.length > 0 ? ` · 跳过 ${capture.stats.skipped.length}` : ''}
          </p>
          {capture.stats.unresolved && capture.stats.unresolved.count > 0 && (
            <p className="text-xs text-amber-600 mt-1">
              仍有 {capture.stats.unresolved.count} 张图片未能内联（多为防盗链或登录后资源），导入后可用「图片内联」再补一次
            </p>
          )}
        </div>
      )}

      {/* 主操作区 */}
      {apiAvailable && configured ? (
        <button
          onClick={handleImport}
          disabled={importing || !capture || running}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#6366f1] hover:bg-[#4f46e5] text-white font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {importing ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          {importing ? `接收抓取结果…（${received} 块）` : '导入抓取结果'}
        </button>
      ) : (
        <div className="text-xs text-slate-500 leading-relaxed">
          {!apiAvailable
            ? '本页未检测到扩展通信接口。请先安装扩展（Chrome → chrome://extensions → 开发者模式 → 加载已解压的扩展程序），装好后刷新本页。'
            : '把扩展 ID 填入下方即可启用一键抓取。'}
        </div>
      )}

      {/* 抓取记录为空时的引导 */}
      {apiAvailable && configured && !capture && !running && !error && (
        <p className="text-xs text-slate-400 mt-3 leading-relaxed">
          还没有抓取记录：打开竞品页面 → 点浏览器工具栏的扩展图标 → 抓取本页，完成后回到这里导入。
        </p>
      )}

      {/* 扩展 ID 配置 */}
      <div className="mt-4 pt-4 border-t border-slate-100">
        <label className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">扩展 ID</label>
        <div className="flex gap-2 mt-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="32 位扩展 ID（chrome://extensions 里复制）"
            spellCheck={false}
            className="flex-1 px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
          />
          <button
            onClick={handleSaveId}
            className="px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
          >
            保存
          </button>
          <button
            onClick={handleCopyInstructions}
            title="复制安装步骤"
            className="px-2.5 py-2 text-xs border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg transition-colors"
          >
            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          </button>
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-[10px] text-slate-400">仅保存 ID，不含任何敏感信息</p>
          <button
            onClick={refresh}
            disabled={checking || !configured || !apiAvailable}
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-[#6366f1] disabled:opacity-40 transition-colors"
          >
            <RefreshCw size={11} className={checking ? 'animate-spin' : ''} />
            重新检测
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 leading-relaxed">{error}</p>
        </div>
      )}
    </div>
  );
}
