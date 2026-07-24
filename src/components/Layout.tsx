import { RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { StepIndicator } from './StepIndicator';
import type { WorkflowStep } from '../types';

const STEP_LABELS = ['导入', '脚本', '清洗', '编辑', '导出'];

export function Layout({ children }: { children: React.ReactNode }) {
  const { currentStep, setCurrentStep, reset } = useWorkflowStore();

  const handlePrev = () => {
    if (currentStep > 1) setCurrentStep((currentStep - 1) as WorkflowStep);
  };

  const handleNext = () => {
    if (currentStep < 5) setCurrentStep((currentStep + 1) as WorkflowStep);
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
    </div>
  );
}
