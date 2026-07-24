import { Check } from 'lucide-react';

const STEP_ICONS = ['📥', '🔍', '🧹', '✏️', '📤'];

interface StepIndicatorProps {
  steps: string[];
  currentStep: number;
}

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center py-3 px-4 gap-0">
      {steps.map((label, index) => {
        const stepNum = index + 1;
        const isCompleted = stepNum < currentStep;
        const isCurrent = stepNum === currentStep;

        return (
          <div key={label} className="flex items-center">
            {/* Step Circle */}
            <button
              onClick={() => {
                if (stepNum <= currentStep) {
                  // Allow clicking completed steps
                }
              }}
              className="flex flex-col items-center gap-1.5 group cursor-default"
            >
              <div
                className={`
                  w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold
                  transition-all duration-200
                  ${isCompleted ? 'bg-green-500 text-white shadow-md shadow-green-200' : ''}
                  ${isCurrent ? 'bg-[#6366f1] text-white shadow-md shadow-indigo-200 ring-4 ring-indigo-100' : ''}
                  ${!isCompleted && !isCurrent ? 'bg-slate-100 text-slate-400' : ''}
                `}
              >
                {isCompleted ? <Check size={16} strokeWidth={3} /> : <span>{STEP_ICONS[index]}</span>}
              </div>
              <span
                className={`
                  text-xs font-medium whitespace-nowrap
                  ${isCompleted ? 'text-green-600' : ''}
                  ${isCurrent ? 'text-[#6366f1]' : ''}
                  ${!isCompleted && !isCurrent ? 'text-slate-400' : ''}
                `}
              >
                {label}
              </span>
            </button>

            {/* Connector Line */}
            {index < steps.length - 1 && (
              <div
                className={`
                  w-12 h-0.5 mx-1 mb-5 rounded-full transition-colors duration-300
                  ${stepNum < currentStep ? 'bg-green-400' : 'bg-slate-200'}
                `}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
