import { useState } from 'react';
import { RotateCcw, ChevronLeft, ChevronRight, BookOpen, Settings } from 'lucide-react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { StepIndicator } from './StepIndicator';
import { TemplateLibrary } from './TemplateLibrary';
import { GitHubSettingsModal } from './GitHubSettingsModal';
import { readGhConfig, writeGhConfig, clearGhConfig } from '../lib/github-store';
import type { WorkflowStep, GitHubConfig } from '../types';

const STEP_LABELS = ['导入', '脚本', '清洗', '编辑', '导出'];

export function Layout({ children }: { children: React.ReactNode }) {
  const { currentStep, setCurrentStep, reset, setRawHtml } = useWorkflowStore();
  const [ghConfig, setGhConfig] = useState<GitHubConfig | null>(() => readGhConfig());
  const [showLibrary, setShowLibrary] = useState(false);
  const [showGhSettings, setShowGhSettings] = useState(false);

  const handlePrev = () => {
    if (currentStep > 1) setCurrentStep((currentStep - 1) as WorkflowStep);
  };

  const handleNext = () => {
    if (currentStep < 5) setCurrentStep((currentStep + 1) as WorkflowStep);
  };

  const handleSaveGhConfig = (cfg: GitHubConfig) => {
    writeGhConfig(cfg);
    setGhConfig(cfg);
    setShowGhSettings(false);
  };

  const handleClearGhConfig = () => {
    clearGhConfig();
    setGhConfig(null);
  };

  /** 载入模板：与手动导入走同一条路径，写回 rawHtml 后进入脚本管理步骤 */
  const handleLoadTemplate = (html: string) => {
    reset();
    setRawHtml(html);
    setCurrentStep(2);
  };

  return (
    <div className="h-full flex flex-col bg-[#f8fafc]">
      {/* Top Toolbar */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-[#1a1a2e] flex items-center justify-between px-6 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6366f1] to-[#818cf8] flex items-center justify-center">
            <span className="text-white font-bold text-sm">HL</span>
          </div>
          <span className="text-white font-semibold text-lg tracking-tight">HLEditor</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => (ghConfig ? setShowLibrary(true) : setShowGhSettings(true))}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title={ghConfig ? '打开模板库' : '模板库需要先配置 GitHub'}
          >
            <BookOpen size={14} />
            <span className="hidden sm:inline">模板库</span>
          </button>
          <button
            onClick={() => setShowGhSettings(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="GitHub 设置：存档、模板库与落地页发布都依赖它"
          >
            <Settings size={14} />
            <span className="hidden sm:inline">{ghConfig ? 'GitHub' : '配置 GitHub'}</span>
          </button>
          <button
            onClick={reset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="重置所有"
          >
            <RotateCcw size={14} />
            <span className="hidden sm:inline">重置</span>
          </button>
          <button
            onClick={handlePrev}
            disabled={currentStep === 1}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} />
            <span className="hidden sm:inline">上一步</span>
          </button>
          <button
            onClick={handleNext}
            disabled={currentStep === 5}
            className="flex items-center gap-1 px-4 py-1.5 text-sm bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <span className="hidden sm:inline">下一步</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </header>

      {/* Step Indicator */}
      <div className="fixed top-14 left-0 right-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <StepIndicator steps={STEP_LABELS} currentStep={currentStep} />
      </div>

      {/* Main Content */}
      <main className="mt-[140px] h-[calc(100vh-140px)] overflow-auto">
        {children}
      </main>

      {/* 模板库浮层：横向能力，不占用线性向导的任何一步 */}
      {showLibrary && ghConfig && (
        <TemplateLibrary config={ghConfig} onClose={() => setShowLibrary(false)} onLoad={handleLoadTemplate} />
      )}

      {/* GitHub 设置 */}
      {showGhSettings && (
        <GitHubSettingsModal
          initial={ghConfig}
          onSave={handleSaveGhConfig}
          onClear={handleClearGhConfig}
          onClose={() => setShowGhSettings(false)}
        />
      )}
    </div>
  );
}
