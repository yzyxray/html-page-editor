import { create } from 'zustand';
import type { WorkflowState, WorkflowStep, DetectedScript, AddedScript, LinkInfo, ReplaceRule, CleanOptions, ExportOptions } from '../types';

const defaultCleanOptions: CleanOptions = {
  removeJSONLD: true,
  removeTrackingPixels: true,
  removeComments: false,
  removeEmptyNodes: false,
};

const defaultExportOptions: ExportOptions = {
  inlineStyles: true,
  cleanEditorAttrs: true,
  minify: false,
  fileName: 'landing-page',
};

export const useWorkflowStore = create<WorkflowState>((set) => ({
  currentStep: 1 as WorkflowStep,
  rawHtml: '',
  cleanedHtml: '',
  finalHtml: '',
  detectedScripts: [],
  addedScripts: [],
  links: [],
  replaceRules: [],
  cleanOptions: { ...defaultCleanOptions },
  exportOptions: { ...defaultExportOptions },
  stats: {
    htmlSize: 0,
    scriptCount: 0,
    linkCount: 0,
    imageCount: 0,
  },

  setCurrentStep: (step) => set({ currentStep: step }),

  setRawHtml: (html) => set({ rawHtml: html }),

  setCleanedHtml: (html) => set({ cleanedHtml: html }),

  setFinalHtml: (html) => set({ finalHtml: html }),

  setDetectedScripts: (scripts) => set({ detectedScripts: scripts }),

  updateScriptAction: (id, action, replacementId) =>
    set((state) => ({
      detectedScripts: state.detectedScripts.map((s) =>
        s.id === id ? { ...s, action, replacementId: replacementId || s.replacementId } : s
      ),
    })),

  addScript: (script) =>
    set((state) => ({ addedScripts: [...state.addedScripts, script] })),

  removeScript: (id) =>
    set((state) => ({ addedScripts: state.addedScripts.filter((s) => s.id !== id) })),

  setLinks: (links) => set({ links }),

  setReplaceRules: (rules) => set({ replaceRules: rules }),

  addReplaceRule: (rule) =>
    set((state) => ({ replaceRules: [...state.replaceRules, rule] })),

  removeReplaceRule: (id) =>
    set((state) => ({ replaceRules: state.replaceRules.filter((r) => r.id !== id) })),

  toggleReplaceRule: (id) =>
    set((state) => ({
      replaceRules: state.replaceRules.map((r) =>
        r.id === id ? { ...r, enabled: !r.enabled } : r
      ),
    })),

  updateLinkHref: (id, newHref) =>
    set((state) => ({
      links: state.links.map((l) => (l.id === id ? { ...l, newHref } : l)),
    })),

  setCleanOptions: (options) =>
    set((state) => ({ cleanOptions: { ...state.cleanOptions, ...options } })),

  setExportOptions: (options) =>
    set((state) => ({ exportOptions: { ...state.exportOptions, ...options } })),

  setStats: (stats) => set({ stats }),

  reset: () =>
    set({
      currentStep: 1,
      rawHtml: '',
      cleanedHtml: '',
      finalHtml: '',
      detectedScripts: [],
      addedScripts: [],
      links: [],
      replaceRules: [],
      cleanOptions: { ...defaultCleanOptions },
      exportOptions: { ...defaultExportOptions },
      stats: { htmlSize: 0, scriptCount: 0, linkCount: 0, imageCount: 0 },
    }),
}));

export type { DetectedScript, AddedScript, LinkInfo, ReplaceRule, CleanOptions, ExportOptions, WorkflowStep };
