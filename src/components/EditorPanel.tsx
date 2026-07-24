import { useEffect, useRef, useState, useCallback, Component, type ReactNode } from 'react';
import grapesjs, { type Editor, type Component as GjsComponent } from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';
import grapesjsPresetWebpage from 'grapesjs-preset-webpage';
import {
  Monitor, Tablet, Smartphone, Code, Eye, RotateCcw, AlertTriangle,
  Type, Check, X, Link2, Image as ImageIcon, FormInput, Layers, ChevronDown,
  MousePointer2,
} from 'lucide-react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { scanLinks, applyLinkReplacements } from '../lib/link-scanner';
import type { ReplaceRule } from '../types';

type DeviceType = 'desktop' | 'tablet' | 'mobile';

// ── Error Boundary ──
class EditorErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex items-center justify-center bg-slate-50">
          <div className="text-center p-8">
            <AlertTriangle size={48} className="text-amber-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">编辑器加载失败</h3>
            <p className="text-sm text-slate-500 max-w-md">{this.state.error}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: '' })}
              className="mt-4 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm rounded-lg transition-colors"
            >
              重试
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── 内嵌链接（段落文字内的 <a>）──
interface InlineLink {
  component: GjsComponent;
  text: string;
  href: string;
}

// ── 父级链接（包裹图片的 <a>）──
interface ParentLink {
  component: GjsComponent;
  href: string;
}

// ── 选中元素信息（扩展支持链接编辑）──
interface SelectedInfo {
  tag: string;
  text: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  color: string;
  componentId: string;
  href?: string;       // <a> 的 href
  src?: string;        // <img> 的 src
  action?: string;     // <form> 的 action
  elementType: 'text' | 'link' | 'image' | 'form' | 'svg' | 'other';
  availableClasses: string[];  // 当前页面所有可用 class（用于下拉）
  currentClasses: string[];    // 当前元素已有的 class
  inlineLinks?: InlineLink[];  // 段落/容器内嵌的 <a> 列表（可选）
  parentLink?: ParentLink;      // 包裹当前元素的 <a>（主要用于 img 包裹在 <a> 中）
  svgContent?: string;          // 内联 <svg> 的原生 outerHTML（用于预览/替换）
}

// ── DOM 元素 → GrapesJS Component 反查 helper ──
// GrapesJS 没有直接 getComponentByElement 的 API，需要遍历查找
function findComponentByEl(editor: Editor, el: HTMLElement): GjsComponent | null {
  try {
    const wrapper = editor.DomComponents.getWrapper();
    if (!wrapper) return null;
    // BFS 遍历所有组件，比 find('*') 性能更好（后者会返回大数组并匹配 selector）
    const queue: GjsComponent[] = [wrapper];
    while (queue.length > 0) {
      const c = queue.shift()!;
      if (c.getEl() === el) return c;
      const children = c.components();
      if (children && children.length > 0) {
        for (let i = 0; i < children.length; i++) {
          const m = children.models[i];
          if (m) queue.push(m);
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
}

// ── 本地文件 → dataURL（base64 内嵌，HTML 自包含）──
function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('读取文件失败'));
    };
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

// ── 本地文件 → 文本（用于内联 SVG 原样替换）──
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('读取文件失败'));
    };
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
    reader.readAsText(file);
  });
}

// ── 文字/链接编辑侧栏 ──
function EditSidebar({
  selectedInfo,
  onApplyText,
  onEditAttribute,
  onToggleClass,
  onAddClass,
  onSelectInlineLink,
  onEditInlineLink,
  onEditParentLink,
  onReplaceImageFile,
  onReplaceInlineSvg,
  onClose,
}: {
  selectedInfo: SelectedInfo | null;
  onApplyText: (newText: string) => void;
  onEditAttribute: (attr: 'href' | 'src' | 'action', value: string) => void;
  onToggleClass: (className: string) => void;
  onAddClass: (className: string) => void;
  onSelectInlineLink: (component: GjsComponent) => void;
  onEditInlineLink: (component: GjsComponent, href: string) => void;
  onEditParentLink: (component: GjsComponent, href: string) => void;
  onReplaceImageFile: (file: File) => void;
  onReplaceInlineSvg: (file: File) => void;
  onClose: () => void;
}) {
  const [editingText, setEditingText] = useState('');
  const [saved, setSaved] = useState(false);
  const [attrValue, setAttrValue] = useState('');
  const [classInput, setClassInput] = useState('');
  const [showClassDropdown, setShowClassDropdown] = useState(false);
  // 段落内嵌链接：每个链接独立的本地 href 输入（用户编辑是 source of truth）
  // 渲染时优先用本地状态；未初始化时 fallback 到 selectedInfo 的 href，避免 useEffect 覆盖正在输入的值
  const [inlineLinkInputs, setInlineLinkInputs] = useState<Record<string, string>>({});
  // 图片包裹链接：本地 href 输入
  const [parentLinkInput, setParentLinkInput] = useState('');
  // 隐藏的文件选择框（用于「替换图片/SVG」）
  const replaceFileRef = useRef<HTMLInputElement>(null);
  // 隐藏的文件选择框（用于「替换内联 SVG」）
  const svgFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selectedInfo) return;
    setEditingText(selectedInfo.text);
    setSaved(false);
    if (selectedInfo.href !== undefined) setAttrValue(selectedInfo.href);
    else if (selectedInfo.src !== undefined) setAttrValue(selectedInfo.src);
    else if (selectedInfo.action !== undefined) setAttrValue(selectedInfo.action);
    else setAttrValue('');
    // 选中元素变化时，丢弃旧的本地输入缓存（key 已不同，避免内存泄漏）
    setInlineLinkInputs({});
    // 父链接：依赖 parentLink.component.cid，img 变化或父 <a> 变化时刷新
    setParentLinkInput(selectedInfo.parentLink?.href ?? '');
  }, [selectedInfo?.componentId, selectedInfo?.href, selectedInfo?.src, selectedInfo?.action, selectedInfo?.parentLink?.component?.cid]);

  if (!selectedInfo) {
    return (
      <div className="w-80 shrink-0 bg-white border-l border-slate-200 overflow-y-auto flex flex-col">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2 sticky top-0 z-10">
          <Type size={15} className="text-[#6366f1]" />
          <span className="text-sm font-semibold text-slate-700">元素编辑</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-12">
          <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center mb-3">
            <MousePointer2 size={22} className="text-indigo-400" />
          </div>
          <p className="text-sm text-slate-500 font-medium">在画布中选择元素</p>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">点击任意文字、图片、链接或 SVG，即可在此编辑其属性</p>
        </div>
      </div>
    );
  }


  const fontLabel = selectedInfo.fontFamily
    ? selectedInfo.fontFamily.split(',')[0].replace(/['"]/g, '').trim()
    : '继承';

  const attrConfig = selectedInfo.href !== undefined
    ? { label: '链接地址 (href)', icon: Link2, placeholder: 'https://...' }
    : selectedInfo.src !== undefined
    ? { label: '图片地址 (src)', icon: ImageIcon, placeholder: 'https://...' }
    : selectedInfo.action !== undefined
    ? { label: '表单提交地址 (action)', icon: FormInput, placeholder: 'https://...' }
    : null;

  return (
    <div className="w-80 shrink-0 bg-white border-l border-slate-200 overflow-y-auto flex flex-col">
      {/* 标题栏 */}
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Type size={15} className="text-[#6366f1]" />
          <span className="text-sm font-semibold text-slate-700">元素编辑</span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* 元素信息 */}
      <div className="px-4 py-3 space-y-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">标签</span>
          <p className="text-xs text-slate-600 font-mono">&lt;{selectedInfo.tag}&gt;</p>
          <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">
            {selectedInfo.elementType === 'link' ? '链接' :
             selectedInfo.elementType === 'image' ? '图片' :
             selectedInfo.elementType === 'svg' ? 'SVG' :
             selectedInfo.elementType === 'form' ? '表单' :
             selectedInfo.elementType === 'text' ? '文字' : '其他'}
          </span>
        </div>
        {selectedInfo.elementType !== 'image' && selectedInfo.elementType !== 'svg' && (
          <>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">字体</span>
              <p className="text-sm text-slate-700 mt-0.5 font-medium" style={{ fontFamily: selectedInfo.fontFamily || 'inherit' }}>
                {fontLabel}
              </p>
            </div>
            <div className="flex gap-4">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">字号</span>
                <p className="text-xs text-slate-600 mt-0.5 font-mono">{selectedInfo.fontSize || '继承'}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">粗细</span>
                <p className="text-xs text-slate-600 mt-0.5 font-mono">{selectedInfo.fontWeight || '400'}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">颜色</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="w-3 h-3 rounded border border-slate-300" style={{ backgroundColor: selectedInfo.color || '#000' }} />
                  <span className="text-xs text-slate-600 font-mono">{selectedInfo.color || '继承'}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 链接/图片/表单地址编辑 */}
      {attrConfig && (
        <div className="px-4 py-3 border-b border-slate-100">
          <label className="text-[10px] uppercase tracking-wider text-slate-400 font-medium mb-2 flex items-center gap-1">
            <attrConfig.icon size={11} /> {attrConfig.label}
          </label>
          <input
            type="text"
            value={attrValue}
            onChange={(e) => {
              setAttrValue(e.target.value);
              const attr = selectedInfo.href !== undefined ? 'href' :
                           selectedInfo.src !== undefined ? 'src' : 'action';
              onEditAttribute(attr, e.target.value);
            }}
            placeholder={attrConfig.placeholder}
            className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
            spellCheck={false}
          />
          <p className="text-[10px] text-slate-400 mt-1.5">修改后即时生效，画布会立即反映</p>

          {/* 图片 / SVG：从本地文件替换 */}
          {selectedInfo.elementType === 'image' && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => replaceFileRef.current?.click()}
                className="group relative w-full h-28 rounded-lg border border-dashed border-slate-300 bg-slate-50 overflow-hidden flex items-center justify-center hover:border-indigo-400 hover:bg-indigo-50/40 transition-colors"
              >
                {attrValue ? (
                  <>
                    <img src={attrValue} alt="预览" className="max-h-full max-w-full object-contain" />
                    <span className="absolute inset-0 bg-slate-900/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-medium">
                      点击替换图片 / SVG
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-slate-400">点击选择图片 / SVG</span>
                )}
              </button>
              <input
                ref={replaceFileRef}
                type="file"
                accept="image/*,.svg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onReplaceImageFile(file);
                  e.target.value = ''; // 允许重复选同一文件
                }}
              />
              <p className="text-[10px] text-slate-400 mt-1.5">支持 PNG / JPG / WebP / SVG，将以 base64 内嵌方式保存</p>
            </div>
          )}
        </div>
      )}

      {/* 内联 SVG：整体替换内容 */}
      {selectedInfo.elementType === 'svg' && (
        <div className="px-4 py-3 border-b border-slate-100">
          <label className="text-[10px] uppercase tracking-wider text-slate-400 font-medium mb-2 flex items-center gap-1">
            <ImageIcon size={11} /> 内联 SVG
          </label>
          <div className="rounded-lg border border-slate-200 bg-slate-50 overflow-hidden p-3 flex items-center justify-center max-h-32">
            {selectedInfo.svgContent && (
              <div
                className="max-h-28 w-full flex items-center justify-center [&>svg]:max-h-28 [&>svg]:max-w-full"
                dangerouslySetInnerHTML={{ __html: selectedInfo.svgContent }}
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => svgFileRef.current?.click()}
            className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-[#6366f1] bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
          >
            <ImageIcon size={14} /> 从本地替换 SVG 内容
          </button>
          <input
            ref={svgFileRef}
            type="file"
            accept=".svg,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onReplaceInlineSvg(file);
              e.target.value = '';
            }}
          />
          <p className="text-[10px] text-slate-400 mt-1.5">仅接受 .svg 文件，将整体替换当前矢量图</p>
        </div>
      )}


      {/* 段落中的内嵌链接（选中文字/容器元素时显示） */}
      {selectedInfo.inlineLinks && selectedInfo.inlineLinks.length > 0 && (
        <div className="px-4 py-3 border-b border-slate-100">
          <label className="text-[10px] uppercase tracking-wider text-slate-400 font-medium mb-2 flex items-center gap-1">
            <Link2 size={11} /> 段落中的链接 ({selectedInfo.inlineLinks.length})
          </label>
          <div className="space-y-2">
            {selectedInfo.inlineLinks.map((l) => (
              <div key={l.component.cid} className="bg-slate-50 rounded-lg p-2 border border-slate-200">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-slate-600 truncate flex-1" title={l.text}>
                    “{l.text || '(空文本)'}”
                  </span>
                  <button
                    onClick={() => onSelectInlineLink(l.component)}
                    className="ml-2 text-[10px] text-[#6366f1] hover:text-[#4f46e5] hover:underline shrink-0"
                    title="在画布上定位并选中此链接"
                  >
                    在画布定位
                  </button>
                </div>
                <input
                  type="text"
                  value={inlineLinkInputs[l.component.cid] ?? l.href}
                  onChange={(e) => {
                    const val = e.target.value;
                    setInlineLinkInputs((prev) => ({ ...prev, [l.component.cid]: val }));
                    onEditInlineLink(l.component, val);
                  }}
                  placeholder="https://..."
                  className="w-full px-2 py-1.5 text-[11px] font-mono border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent bg-white"
                  spellCheck={false}
                />
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-2">点击「在画布定位」可在画布上聚焦到该链接直接编辑</p>
        </div>
      )}

      {/* 图片包裹链接（选中 <img> 且外层有 <a> 时显示） */}
      {selectedInfo.parentLink && (
        <div className="px-4 py-3 border-b border-slate-100">
          <label className="text-[10px] uppercase tracking-wider text-slate-400 font-medium mb-2 flex items-center gap-1">
            <Link2 size={11} /> 图片链接地址 (跳转目标)
          </label>
          <input
            type="text"
            value={parentLinkInput}
            onChange={(e) => {
              setParentLinkInput(e.target.value);
              onEditParentLink(selectedInfo.parentLink!.component, e.target.value);
            }}
            placeholder="https://..."
            className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
            spellCheck={false}
          />
          <p className="text-[10px] text-slate-400 mt-1.5">图片被外层 &lt;a&gt; 包裹，此处编辑其点击跳转地址</p>
        </div>
      )}

      {/* Class 下拉管理 */}
      <div className="px-4 py-3 border-b border-slate-100">
        <label className="text-[10px] uppercase tracking-wider text-slate-400 font-medium mb-2 flex items-center gap-1">
          <Layers size={11} /> 样式类 (Classes)
        </label>

        {/* 已有 class 标签 */}
        {selectedInfo.currentClasses.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {selectedInfo.currentClasses.map((cls) => (
              <button
                key={cls}
                onClick={() => onToggleClass(cls)}
                className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full hover:bg-red-100 hover:text-red-600 transition-colors flex items-center gap-1"
                title="点击移除"
              >
                {cls} <X size={10} />
              </button>
            ))}
          </div>
        )}

        {/* 下拉选择器 */}
        <div className="relative">
          <button
            onClick={() => setShowClassDropdown(!showClassDropdown)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white hover:bg-slate-50 transition-colors"
          >
            <span className="text-slate-500">从已有样式选择...</span>
            <ChevronDown size={14} className={`text-slate-400 transition-transform ${showClassDropdown ? 'rotate-180' : ''}`} />
          </button>
          {showClassDropdown && (
            <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg">
              {selectedInfo.availableClasses.length === 0 ? (
                <p className="px-3 py-2 text-xs text-slate-400">暂无可用样式</p>
              ) : (
                selectedInfo.availableClasses.map((cls) => {
                  const active = selectedInfo.currentClasses.includes(cls);
                  return (
                    <button
                      key={cls}
                      onClick={() => {
                        onToggleClass(cls);
                        setShowClassDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-indigo-50 transition-colors flex items-center justify-between ${
                        active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600'
                      }`}
                    >
                      <span>.{cls}</span>
                      {active && <Check size={11} className="text-indigo-500" />}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* 手动输入新 class */}
        <div className="flex gap-1 mt-2">
          <input
            type="text"
            value={classInput}
            onChange={(e) => setClassInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && classInput.trim()) {
                onAddClass(classInput.trim());
                setClassInput('');
              }
            }}
            placeholder="或输入新类名..."
            className="flex-1 px-2 py-1.5 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
          />
          <button
            onClick={() => {
              if (classInput.trim()) {
                onAddClass(classInput.trim());
                setClassInput('');
              }
            }}
            className="px-2 py-1.5 text-xs bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg transition-colors"
          >
            <Check size={12} />
          </button>
        </div>
      </div>

      {/* 文字内容编辑 */}
      {(selectedInfo.elementType === 'text' || selectedInfo.elementType === 'link') && (
        <div className="flex-1 flex flex-col p-4">
          <label className="text-[10px] uppercase tracking-wider text-slate-400 font-medium mb-2">
            文字内容
          </label>
          <textarea
            value={editingText}
            onChange={(e) => { setEditingText(e.target.value); setSaved(false); }}
            className="flex-1 w-full p-3 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent min-h-[120px]"
            style={{ fontFamily: selectedInfo.fontFamily || 'inherit' }}
            placeholder="在此编辑文字内容…"
            spellCheck={false}
          />
          <button
            onClick={() => {
              onApplyText(editingText);
              setSaved(true);
              setTimeout(() => setSaved(false), 2000);
            }}
            disabled={editingText === selectedInfo.text}
            className={`mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all ${
              saved
                ? 'bg-green-500 text-white'
                : 'bg-[#6366f1] hover:bg-[#4f46e5] text-white shadow-sm shadow-indigo-200 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
          >
            <Check size={16} />
            {saved ? '已应用' : '应用修改'}
          </button>
        </div>
      )}

      {/* 提示 */}
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">
        <p className="text-[10px] text-slate-400 leading-relaxed">
          💡 字体、字号、颜色等样式修改只影响当前选中元素，不会连带周边模块。
        </p>
      </div>
    </div>
  );
}

// ── 批量链接操作抽屉 ──
function BatchLinkDrawer({
  html,
  onClose,
  onApply,
}: {
  html: string;
  onClose: () => void;
  onApply: (newHtml: string) => void;
}) {
  const { replaceRules, addReplaceRule, removeReplaceRule, toggleReplaceRule } = useWorkflowStore();
  const [scannedLinks, setScannedLinks] = useState<{ domain: string; count: number }[]>([]);
  const [newRuleType, setNewRuleType] = useState<ReplaceRule['type']>('domain');
  const [newRulePattern, setNewRulePattern] = useState('');
  const [newRuleReplacement, setNewRuleReplacement] = useState('');
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (html) {
      const links = scanLinks(html);
      const domainMap = new Map<string, number>();
      links.forEach((l) => domainMap.set(l.domain, (domainMap.get(l.domain) || 0) + 1));
      setScannedLinks(Array.from(domainMap.entries()).map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count));
    }
  }, [html]);

  const handleAddRule = () => {
    if (!newRulePattern.trim() || !newRuleReplacement.trim()) return;
    addReplaceRule({
      id: `rule-${Date.now()}`,
      type: newRuleType,
      pattern: newRulePattern.trim(),
      replacement: newRuleReplacement.trim(),
      enabled: true,
    });
    setNewRulePattern('');
    setNewRuleReplacement('');
  };

  const handleApply = () => {
    const enabled = replaceRules.filter((r) => r.enabled);
    if (enabled.length === 0) return;
    let result = html;
    enabled.forEach((rule) => {
      try {
        let regex: RegExp;
        if (rule.type === 'exact') {
          regex = new RegExp(rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        } else if (rule.type === 'domain') {
          regex = new RegExp(`https?://[^"'\s]*` + rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^\'\\s]*', 'g');
        } else {
          regex = new RegExp(rule.pattern, 'g');
        }
        result = result.replace(regex, (match) => {
          if (rule.type === 'domain') {
            return match.replace(new RegExp(rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), rule.replacement);
          }
          return rule.replacement;
        });
      } catch (err) {
        console.error('正则错误:', err);
      }
    });
    onApply(result);
    setApplied(true);
    setTimeout(() => setApplied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="w-96 bg-white h-full shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between sticky top-0 z-10">
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Link2 size={18} className="text-[#6366f1]" /> 批量链接操作
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* 扫描结果 */}
          <div>
            <p className="text-xs font-medium text-slate-600 mb-2">检测到的域名 ({scannedLinks.length})</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {scannedLinks.map((d) => (
                <div key={d.domain} className="flex items-center justify-between px-2 py-1.5 bg-slate-50 rounded text-xs">
                  <span className="font-mono text-slate-600 truncate">{d.domain}</span>
                  <span className="text-slate-400 ml-2">{d.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 添加规则 */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-medium text-slate-600 mb-2">添加替换规则</p>
            <div className="flex gap-1 mb-2 bg-slate-100 rounded-lg p-1">
              {[
                { type: 'exact' as const, label: '精确' },
                { type: 'domain' as const, label: '域名' },
                { type: 'regex' as const, label: '正则' },
              ].map(({ type, label }) => (
                <button
                  key={type}
                  onClick={() => setNewRuleType(type)}
                  className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    newRuleType === type ? 'bg-white text-[#6366f1] shadow-sm' : 'text-slate-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={newRulePattern}
              onChange={(e) => setNewRulePattern(e.target.value)}
              placeholder={newRuleType === 'exact' ? '精确匹配 URL' : newRuleType === 'domain' ? '域名如 example.com' : '正则表达式'}
              className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
            />
            <input
              type="text"
              value={newRuleReplacement}
              onChange={(e) => setNewRuleReplacement(e.target.value)}
              placeholder="替换为..."
              className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
            />
            <button
              onClick={handleAddRule}
              disabled={!newRulePattern.trim() || !newRuleReplacement.trim()}
              className="w-full px-3 py-1.5 text-xs bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg transition-colors disabled:opacity-50"
            >
              添加规则
            </button>
          </div>

          {/* 已有规则列表 */}
          {replaceRules.length > 0 && (
            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs font-medium text-slate-600 mb-2">已添加规则 ({replaceRules.length})</p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {replaceRules.map((rule) => (
                  <div key={rule.id} className={`p-2 rounded-lg border ${rule.enabled ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-200 opacity-50'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 rounded">
                        {rule.type === 'exact' ? '精确' : rule.type === 'domain' ? '域名' : '正则'}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleReplaceRule(rule.id)}
                          className={`w-3 h-3 rounded border ${rule.enabled ? 'bg-[#6366f1] border-[#6366f1]' : 'border-slate-300'}`}
                        />
                        <button onClick={() => removeReplaceRule(rule.id)} className="text-slate-400 hover:text-red-500">
                          <X size={11} />
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] font-mono text-slate-600 truncate">{rule.pattern}</p>
                    <p className="text-[10px] font-mono text-indigo-600 truncate">→ {rule.replacement}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 应用按钮 */}
          <button
            onClick={handleApply}
            disabled={replaceRules.filter((r) => r.enabled).length === 0}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all ${
              applied
                ? 'bg-green-500 text-white'
                : 'bg-[#6366f1] hover:bg-[#4f46e5] text-white disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            <Check size={16} />
            {applied ? '已应用，请查看画布' : '应用批量替换'}
          </button>

          <p className="text-[10px] text-slate-400 leading-relaxed">
            💡 批量替换会修改画布中的所有匹配链接。如需精细调整单个链接，请在画布上点击该链接直接编辑。
          </p>
        </div>
      </div>
    </div>
  );
}

// ── 主 EditorPanel ──
export function EditorPanel() {
  const { cleanedHtml, finalHtml, setFinalHtml } = useWorkflowStore();
  const editorRef = useRef<Editor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const htmlRef = useRef<string>('');
  const [editorReady, setEditorReady] = useState(false);
  const [currentDevice, setCurrentDevice] = useState<DeviceType>('desktop');
  const [codeView, setCodeView] = useState(false);
  const [selectedInfo, setSelectedInfo] = useState<SelectedInfo | null>(null);
  const [showBatchDrawer, setShowBatchDrawer] = useState(false);
  const cachedClassesRef = useRef<string[]>([]);
  const insertFileRef = useRef<HTMLInputElement>(null);

  const effectiveHtml = finalHtml || cleanedHtml;

  // 保持 ref 同步，供 initEditor 闭包读取最新值
  useEffect(() => {
    htmlRef.current = effectiveHtml;
  }, [effectiveHtml]);

  const extractSelectionInfo = useCallback((editor: Editor): SelectedInfo | null => {
    const selected = editor.getSelected();
    if (!selected) return null;
    const el = selected.getEl();
    if (!el) return null;

    const styles = window.getComputedStyle(el);
    const text = (selected.get('content')?.trim() || el.textContent?.trim() || '').replace(/\s+/g, ' ');
    const tag = (selected.get('tagName') as string)?.toLowerCase() || el.tagName.toLowerCase();

    // 判断元素类型
    const href = el.getAttribute('href') || undefined;
    const src = el.getAttribute('src') || undefined;
    const action = el.getAttribute('action') || undefined;

    let elementType: SelectedInfo['elementType'] = 'other';
    if (tag === 'a' || href !== undefined) elementType = 'link';
    else if (tag === 'img' || src !== undefined) elementType = 'image';
    else if (tag === 'svg') elementType = 'svg';
    else if (tag === 'form' || action !== undefined) elementType = 'form';
    else if (text) elementType = 'text';

    // 内联 <svg>：抓取原生 markup 用于预览与替换
    let svgContent: string | undefined;
    if (tag === 'svg') {
      svgContent = el.outerHTML;
    }

    // 当前元素的 class 列表
    const currentClasses = Array.from(el.classList).filter((c) => !c.startsWith('gjs-'));

    // 检测内嵌链接（仅当当前选中的是「文字/容器」类元素时）
    // 这样避免在用户已经选中 <a> 自身时，重复展示同一链接
    let inlineLinks: InlineLink[] | undefined;
    if (elementType === 'text' || elementType === 'other') {
      try {
        const linkModels = selected.find('a').filter((c) => {
          const e = c.getEl();
          return e?.tagName?.toLowerCase() === 'a';
        });
        if (linkModels.length > 0) {
          inlineLinks = linkModels.map((c) => {
            const aEl = c.getEl() as HTMLAnchorElement;
            return {
              component: c,
              text: (aEl.textContent || '').trim().slice(0, 60),
              href: aEl.getAttribute('href') || '',
            };
          });
        }
      } catch {
        // selected.find 在某些情况下会抛错，忽略
      }
    }

    // 检测父级链接（当 <img> 被 <a> 包裹时）
    let parentLink: ParentLink | undefined;
    if (tag === 'img') {
      const parentAnchor = el.closest('a');
      if (parentAnchor) {
        const parentComponent = findComponentByEl(editor, parentAnchor);
        if (parentComponent) {
          parentLink = {
            component: parentComponent,
            href: parentAnchor.getAttribute('href') || '',
          };
        }
      }
    }

    return {
      tag,
      text,
      fontFamily: styles.fontFamily || '',
      fontSize: styles.fontSize || '',
      fontWeight: styles.fontWeight || '',
      color: styles.color || '',
      componentId: selected.getId(),
      href,
      src,
      action,
      elementType,
      availableClasses: cachedClassesRef.current,
      currentClasses,
      inlineLinks,
      parentLink,
      svgContent,
    };
  }, []);

  const refreshCachedClasses = useCallback((editor: Editor) => {
    // 从画布扫描所有已用的 class
    const frame = editor.Canvas.getFrameEl();
    if (!frame?.contentDocument) return;
    const allElements = frame.contentDocument.querySelectorAll('[class]');
    const classSet = new Set<string>();
    allElements.forEach((el) => {
      Array.from(el.classList).forEach((c) => {
        if (!c.startsWith('gjs-') && c.length > 0) classSet.add(c);
      });
    });
    cachedClassesRef.current = Array.from(classSet).sort();
  }, []);

  const initEditor = useCallback(() => {
    if (!containerRef.current || editorRef.current) return;

    const editor = grapesjs.init({
      container: containerRef.current,
      height: '100%',
      width: '100%',
      storageManager: false,
      plugins: [grapesjsPresetWebpage],
      pluginsOpts: {
        grapesjsPresetWebpage: {
          blocks: ['link-block', 'quote', 'text-basic'],
        },
      },
      // 关键：样式优先应用到选中组件 ID 而非 class，改单个模块不再连带周边
      selectorManager: {
        componentFirst: true,
      },
      canvas: {
        styles: ['https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css'],
        scripts: [],
      },
      deviceManager: {
        devices: [
          { name: 'Desktop', width: '' },
          { name: 'Tablet', width: '768px', widthMedia: '768px' },
          { name: 'Mobile', width: '375px', widthMedia: '375px' },
        ],
      },
    });

    editor.on('load', () => {
      // 通过 ref 读取最新值，避免闭包陈旧
      const html = htmlRef.current;
      if (html) {
        editor.setComponents(html);
      }
      setEditorReady(true);
      refreshCachedClasses(editor);
    });

    editor.on('component:select', () => {
      const info = extractSelectionInfo(editor);
      setSelectedInfo(info);
    });

    editor.on('component:update', () => {
      const info = extractSelectionInfo(editor);
      setSelectedInfo((prev) =>
        prev && info && prev.componentId === info.componentId ? info : prev
      );
    });

    // 监听样式变更，刷新 class 缓存
    editor.on('styleable:change', () => {
      refreshCachedClasses(editor);
    });

    editorRef.current = editor;
  }, [extractSelectionInfo, refreshCachedClasses]);

  useEffect(() => {
    initEditor();
    return () => {
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
        setEditorReady(false);
      }
    };
  }, [initEditor]);

  useEffect(() => {
    if (editorRef.current && editorReady && effectiveHtml) {
      const wrapper = editorRef.current.DomComponents.getWrapper();
      if (wrapper) {
        wrapper.set('content', '');
        editorRef.current.setComponents(effectiveHtml);
        refreshCachedClasses(editorRef.current);
      }
    }
  }, [effectiveHtml, editorReady, refreshCachedClasses]);

  // ── Handlers ──
  const handleDeviceChange = (device: DeviceType) => {
    if (!editorRef.current) return;
    editorRef.current.Devices.select(
      device === 'desktop' ? 'Desktop' : device === 'tablet' ? 'Tablet' : 'Mobile'
    );
    setCurrentDevice(device);
  };

  const handleToggleCodeView = () => {
    if (!editorRef.current) return;
    const cmd = editorRef.current.Commands;
    if (codeView) cmd.stop('core:code-editor');
    else cmd.run('core:code-editor');
    setCodeView(!codeView);
  };

  const handleSaveToState = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.getHtml();
    const css = editorRef.current.getCss() || '';
    setFinalHtml(wrapWithStyle(html, css));
  };

  // 修复：文字应用后立即刷新画布
  const handleApplyText = (newText: string) => {
    if (!editorRef.current || !selectedInfo) return;
    const selected = editorRef.current.getSelected();
    if (!selected) return;

    const currentContent = selected.get('content') || '';
    if (currentContent || selected.components().length === 0) {
      // 组件有显式 content 或无子组件 —— 直接 set
      selected.set('content', newText);
    } else {
      // 组件有子组件 —— 找到文本节点更新
      const el = selected.getEl();
      if (el) {
        // 保留子元素，只更新直接文本节点
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
          acceptNode: (node) => node.textContent && node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
        });
        const firstTextNode = walker.nextNode();
        if (firstTextNode) {
          firstTextNode.textContent = newText;
        } else {
          // 没有文本节点，前置一个
          el.insertBefore(document.createTextNode(newText), el.firstChild);
        }
      }
    }

    // 强制触发视图更新
    selected.trigger('change:content');
    editorRef.current.Canvas.getFrameEl();

    // 重新读取选中信息，确保面板与画布一致
    setSelectedInfo(extractSelectionInfo(editorRef.current));
  };

  // 链接/图片/表单属性编辑
  const handleEditAttribute = (attr: 'href' | 'src' | 'action', value: string) => {
    if (!editorRef.current) return;
    const selected = editorRef.current.getSelected();
    if (!selected) return;
    selected.setAttributes({ [attr]: value });
    // 触发视图刷新
    selected.trigger('change:attributes');
    setSelectedInfo(extractSelectionInfo(editorRef.current));
  };

  // 选中段落中的某个内嵌 <a>，让用户在画布上聚焦它
  const handleSelectInlineLink = (component: GjsComponent) => {
    if (!editorRef.current) return;
    editorRef.current.select(component);
  };

  // 编辑段落中某个内嵌 <a> 的 href
  const handleEditInlineLink = (component: GjsComponent, href: string) => {
    if (!editorRef.current) return;
    component.setAttributes({ href });
    component.trigger('change:attributes');
    // 不重置 selectedInfo（当前选中仍是父元素，保持侧栏 UI 稳定）
  };

  // 编辑包裹图片的父级 <a> 的 href
  const handleEditParentLink = (component: GjsComponent, href: string) => {
    if (!editorRef.current) return;
    component.setAttributes({ href });
    component.trigger('change:attributes');
  };

  // 用本地文件替换当前选中的 <img>（含 SVG）的 src —— base64 内嵌
  const handleReplaceImageFile = useCallback(async (file: File) => {
    if (!editorRef.current || !selectedInfo) return;
    try {
      const dataUrl = await readFileAsDataURL(file);
      handleEditAttribute('src', dataUrl);
      editorRef.current.AssetManager.add({ src: dataUrl, type: 'image' });
    } catch {
      // 读取失败忽略
    }
  }, [selectedInfo, handleEditAttribute]);

  // 在画布中插入一张新图片（base64 内嵌），追加到页面末尾
  const handleInsertImageFile = useCallback(async (file: File) => {
    if (!editorRef.current) return;
    try {
      const dataUrl = await readFileAsDataURL(file);
      const wrapper = editorRef.current.getWrapper();
      if (wrapper) {
        wrapper.append(`<img src="${dataUrl}" />`);
      }
      editorRef.current.AssetManager.add({ src: dataUrl, type: 'image' });
    } catch {
      // 读取失败忽略
    }
  }, []);

  // 用本地 .svg 文件整体替换当前选中的内联 <svg> 内容
  const handleReplaceInlineSvg = useCallback(async (file: File) => {
    if (!editorRef.current || !selectedInfo) return;
    if (!file.name.toLowerCase().endsWith('.svg')) return; // 仅接受 SVG
    try {
      const svgText = await readFileAsText(file);
      const selected = editorRef.current.getSelected();
      if (selected) {
        selected.replaceWith(svgText);
        // replaceWith 后组件被替换，刷新侧栏信息
        setSelectedInfo(extractSelectionInfo(editorRef.current));
      }
    } catch {
      // 读取失败忽略
    }
  }, [selectedInfo, extractSelectionInfo]);




  // Class 切换
  const handleToggleClass = (className: string) => {
    if (!editorRef.current) return;
    const selected = editorRef.current.getSelected();
    if (!selected) return;
    const el = selected.getEl();
    if (!el) return;
    if (el.classList.contains(className)) {
      el.classList.remove(className);
      selected.removeClass(className);
    } else {
      el.classList.add(className);
      selected.addClass(className);
    }
    setSelectedInfo(extractSelectionInfo(editorRef.current));
  };

  // 新增 class
  const handleAddClass = (className: string) => {
    if (!editorRef.current) return;
    const selected = editorRef.current.getSelected();
    if (!selected) return;
    selected.addClass(className);
    // 添加到缓存
    if (!cachedClassesRef.current.includes(className)) {
      cachedClassesRef.current = [...cachedClassesRef.current, className].sort();
    }
    setSelectedInfo(extractSelectionInfo(editorRef.current));
  };

  const handleDeselect = () => {
    if (editorRef.current) {
      const sel = editorRef.current.getSelected();
      if (sel) editorRef.current.selectRemove(sel);
      setSelectedInfo(null);
    }
  };

  // 批量链接应用
  const handleBatchApply = (newHtml: string) => {
    if (!editorRef.current) return;
    // 用新 HTML 重新加载画布
    const wrapper = editorRef.current.DomComponents.getWrapper();
    if (wrapper) {
      wrapper.set('content', '');
      editorRef.current.setComponents(newHtml);
    }
    // 同步到 store
    setFinalHtml(newHtml);
    refreshCachedClasses(editorRef.current);
  };

  // ── Empty state ──
  if (!effectiveHtml) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-slate-800">可视化编辑</h2>
          <p className="text-slate-500 mt-1 text-sm">拖拽编辑页面元素，调整样式和布局；点击链接可直接修改地址</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
          <Code size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-400">请先完成清洗步骤</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            <button onClick={() => handleDeviceChange('desktop')}
              className={`p-1.5 rounded-md transition-colors ${currentDevice === 'desktop' ? 'bg-white text-[#6366f1] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              title="桌面"><Monitor size={16} /></button>
            <button onClick={() => handleDeviceChange('tablet')}
              className={`p-1.5 rounded-md transition-colors ${currentDevice === 'tablet' ? 'bg-white text-[#6366f1] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              title="平板"><Tablet size={16} /></button>
            <button onClick={() => handleDeviceChange('mobile')}
              className={`p-1.5 rounded-md transition-colors ${currentDevice === 'mobile' ? 'bg-white text-[#6366f1] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              title="手机"><Smartphone size={16} /></button>
          </div>
          {selectedInfo && (
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded font-mono">
              已选: &lt;{selectedInfo.tag}&gt;
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{editorReady ? '编辑器就绪' : '加载中...'}</span>
          <button
            onClick={() => insertFileRef.current?.click()}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="插入本地图片 / SVG"
          >
            <ImageIcon size={14} />插入图片
          </button>
          <input
            ref={insertFileRef}
            type="file"
            accept="image/*,.svg"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleInsertImageFile(file);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => setShowBatchDrawer(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="批量链接替换"
          >
            <Link2 size={14} />批量链接
          </button>
          <button onClick={handleToggleCodeView}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${codeView ? 'bg-[#6366f1] text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            {codeView ? <Eye size={14} /> : <Code size={14} />}
            {codeView ? '可视化' : '代码'}
          </button>
          <button onClick={handleSaveToState}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg transition-colors">
            <RotateCcw size={14} />保存到工作流
          </button>
        </div>
      </div>

      {/* 编辑器 + 侧栏 */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative">
          <EditorErrorBoundary>
            <div ref={containerRef} className="absolute inset-0" />
          </EditorErrorBoundary>
        </div>

        <EditSidebar
          selectedInfo={selectedInfo}
          onApplyText={handleApplyText}
          onEditAttribute={handleEditAttribute}
          onToggleClass={handleToggleClass}
          onAddClass={handleAddClass}
          onSelectInlineLink={handleSelectInlineLink}
          onEditInlineLink={handleEditInlineLink}
          onEditParentLink={handleEditParentLink}
          onReplaceImageFile={handleReplaceImageFile}
          onReplaceInlineSvg={handleReplaceInlineSvg}
          onClose={handleDeselect}
        />
      </div>

      {/* 批量链接抽屉 */}
      {showBatchDrawer && (
        <BatchLinkDrawer
          html={editorRef.current?.getHtml() || effectiveHtml}
          onClose={() => setShowBatchDrawer(false)}
          onApply={handleBatchApply}
        />
      )}
    </div>
  );
}

function wrapWithStyle(html: string, css: string): string {
  let result = html;
  if (css) {
    const styleTag = `<style>\n${css}\n</style>`;
    if (result.includes('</head>')) {
      result = result.replace('</head>', `${styleTag}\n</head>`);
    } else {
      result = `<head>\n${styleTag}\n</head>\n${result}`;
    }
  }
  if (!result.includes('<!DOCTYPE html>')) {
    result = `<!DOCTYPE html>\n<html>\n${result}\n</html>`;
  }
  return result;
}
