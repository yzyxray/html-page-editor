import { useState, useCallback } from 'react';
import { Settings, X, Check, Eye, EyeOff, LoaderCircle, Trash2, ExternalLink } from 'lucide-react';
import type { GitHubConfig } from '../types';
import { getUser, getRepo, GitHubError } from '../lib/github-api';
import { DEFAULT_GH_CONFIG } from '../lib/github-store';

interface Props {
  initial: GitHubConfig | null;
  onSave: (cfg: GitHubConfig) => void;
  onClear: () => void;
  onClose: () => void;
}

type TestResult = { type: 'success' | 'error'; message: string } | null;

export function GitHubSettingsModal({ initial, onSave, onClear, onClose }: Props) {
  const [token, setToken] = useState(initial?.token ?? '');
  const [owner, setOwner] = useState(initial?.owner ?? '');
  const [repo, setRepo] = useState(initial?.repo ?? '');
  const [branch, setBranch] = useState(initial?.branch ?? DEFAULT_GH_CONFIG.branch);
  const [basePath, setBasePath] = useState(initial?.basePath ?? '');
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult>(null);

  const ready = token.trim() && owner.trim() && repo.trim();

  const currentConfig = (): GitHubConfig => ({
    token: token.trim(),
    owner: owner.trim(),
    repo: repo.trim(),
    branch: branch.trim() || 'main',
    basePath: basePath.trim().replace(/^\/+|\/+$/g, ''),
  });

  const handleTest = useCallback(async () => {
    if (!ready || testing) return;
    setTesting(true);
    setTestResult(null);
    try {
      const cfg = currentConfig();
      const [user, repoInfo] = await Promise.all([getUser(cfg), getRepo(cfg)]);
      const branchNote =
        repoInfo.default_branch && repoInfo.default_branch !== cfg.branch
          ? `，但仓库默认分支是 ${repoInfo.default_branch}`
          : '';
      setTestResult({
        type: 'success',
        message: `连接成功：${user.login} · ${repoInfo.full_name}（${repoInfo.private ? '私有' : '公开'}仓库）${branchNote}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '连接测试失败';
      setTestResult({ type: 'error', message: msg });
    } finally {
      setTesting(false);
    }
  }, [ready, testing, token, owner, repo, branch]);

  const handleSave = () => {
    if (!ready) return;
    onSave(currentConfig());
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-[480px] max-w-[92vw] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Settings size={18} className="text-[#6366f1]" /> GitHub 设置
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Token */}
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1.5 block">
              Personal Access Token
            </label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="github_pat_..."
                className="w-full px-3 py-2 pr-9 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                spellCheck={false}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded"
                title={showToken ? '隐藏' : '显示'}
              >
                {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
              Fine-grained token，权限只需
              <code className="font-mono text-slate-500"> Contents: Read and write</code>，且
              Repository access 只勾选目标仓库。
              <button
                type="button"
                onClick={() =>
                  window.open('https://github.com/settings/personal-access-tokens/new', '_blank', 'noreferrer')
                }
                className="ml-1 inline-flex items-center gap-0.5 text-[#6366f1] hover:underline"
              >
                去生成
                <ExternalLink size={9} />
              </button>
            </p>
          </div>

          {/* Owner / Repo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1.5 block">Owner</label>
              <input
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="yzyxray"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                spellCheck={false}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1.5 block">仓库名</label>
              <input
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="landing-archive"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                spellCheck={false}
              />
            </div>
          </div>
          <p className="-mt-2 text-[10px] text-slate-400">
            存档与模板库建议用一个专门的私有仓库，与本工具源码仓库分开。
          </p>

          {/* Branch / BasePath */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1.5 block">分支</label>
              <input
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="main"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                spellCheck={false}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1.5 block">路径前缀</label>
              <input
                value={basePath}
                onChange={(e) => setBasePath(e.target.value)}
                placeholder="留空 = 仓库根目录"
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                spellCheck={false}
              />
            </div>
          </div>

          {/* 测试结果 */}
          {testResult && (
            <div
              className={`p-3 rounded-lg text-xs leading-relaxed flex items-start gap-2 ${
                testResult.type === 'success'
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {testResult.type === 'success' ? (
                <Check size={14} className="shrink-0 mt-0.5" />
              ) : (
                <X size={14} className="shrink-0 mt-0.5" />
              )}
              <span className="break-words">{testResult.message}</span>
            </div>
          )}

          {/* 风险说明 */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-[11px] text-amber-800 leading-relaxed">
              Token 将以明文保存在本浏览器的本地存储中，仅用于直连
              <code className="font-mono"> api.github.com</code>
              。共用这台电脑的其他人理论上可读取，请勿在公用机器上保存。
            </p>
            {initial?.token && (
              <button
                type="button"
                onClick={() => {
                  setToken('');
                  setTestResult(null);
                  onClear();
                }}
                className="mt-2 inline-flex items-center gap-1 text-[11px] text-red-600 hover:underline"
              >
                <Trash2 size={11} /> 清除已保存的 Token
              </button>
            )}
          </div>

          {/* 底部按钮 */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleTest}
              disabled={!ready || testing}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {testing ? <LoaderCircle size={16} className="animate-spin" /> : <ExternalLink size={14} />}
              {testing ? '测试中...' : '测试连接'}
            </button>
            <button
              onClick={handleSave}
              disabled={!ready}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Check size={16} /> 保存设置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}