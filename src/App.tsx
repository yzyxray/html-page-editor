import { Layout } from './components/Layout';
import { ImportPanel } from './components/ImportPanel';
import { ScriptManagerPanel } from './components/ScriptManagerPanel';
import { CleanerPanel } from './components/CleanerPanel';
import { EditorPanel } from './components/EditorPanel';
import { ExportPanel } from './components/ExportPanel';
import { useWorkflowStore } from './store/useWorkflowStore';

function App() {
  const currentStep = useWorkflowStore((s) => s.currentStep);

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <ImportPanel />;
      case 2:
        return <ScriptManagerPanel />;
      case 3:
        return <CleanerPanel />;
      case 4:
        return <EditorPanel />;
      case 5:
        return <ExportPanel />;
      default:
        return <ImportPanel />;
    }
  };

  return <Layout>{renderStep()}</Layout>;
}

export default App;
