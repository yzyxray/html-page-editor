# HLEditor · 竞品落地页克隆-编辑-部署工作台

单人内部工具，把竞品落地页抓取、清洗、可视化编辑后，发布到自己的域名投放广告。

线上地址：`https://html-page-editor.pages.dev`

## 五步工作流

```
① 导入  →  ② 脚本管理  →  ③ 清洗  →  ④ 可视化编辑  →  ⑤ 导出 / 发布
```

1. **导入**：用 Chrome 扩展一键抓取竞品整页（图片/CSS 全部内联），或粘贴源码 / 上传 `.html` 文件 / 拖拽文件。三个兜底入口始终保留。
2. **脚本管理**：自动识别竞品页面里的追踪脚本，按需移除或替换为自己的脚本。
3. **清洗**：剥离 CSP、JSON-LD、追踪像素、注释、空节点等。
4. **可视化编辑**：GrapesJS 画布，选中元素即改文字、链接、图片、样式。
5. **导出**：下载 HTML、下载 zip、存档到 GitHub、推送到落地页仓库（触发自动部署）。

## 本地开发与构建

```bash
npm install
npm run dev      # 本地开发，http://localhost:5173
npm run build    # 产物输出到 dist/
npm run preview  # 预览构建产物
```

> 本项目的 `package.json` / `package-lock.json` **不引入任何额外依赖**，以保证 Cloudflare Pages 的 `npm ci` 稳定。

## Chrome 扩展（抓取能力）

竞品页面的图片、样式表资源在普通网页里 `fetch` 会被 CORS 拦死。
**扩展的 service worker 拥有跨域特权**，所以「把整页连图片一起抓成自包含 HTML」必须在扩展里完成。

- 扩展源码：与本仓库同级的 `html-page-crawler-extension/` 目录（零构建，纯 JS + MV3）
- 安装：Chrome → `chrome://extensions/` → 开发者模式 → 加载已解压的扩展程序 → 选该目录
- 配置：复制扩展 ID，填进网页应用第 1 步「扩展桥接」卡片 → 保存
- 使用：打开竞品页 → 点扩展图标 → 抓取本页 → 回网页应用点「导入抓取结果」

详见 `html-page-crawler-extension/README.md`（含权限说明、断点续抓机制、排错清单）。

## GitHub 接入（存档 / 模板库 / 部署）

顶栏「配置 GitHub」填写：

| 字段 | 说明 |
| --- | --- |
| token | Fine-grained PAT，权限**只需 `Contents: Read and write`** |
| owner / repo | 存档仓库（如 `你的账号/landing-archive`） |
| branch | 存放 `archives/` 与 `templates/` 的分支，通常是 `main` |
| deployBranch | 落地页部署分支，Cloudflare Pages 项目绑定到它即可「推送即上线」 |
| basePath | 仓库内路径前缀，留空表示根目录 |

**仓库目录约定**

```
landing-archive/
  archives/<slug>-<timestamp>/{index.html, meta.json}
  templates/<slug>/{index.html, meta.json}
  templates/index.json        # 模板清单，列表页秒开，避免遍历目录
```

> token 明文保存在**使用者本机**的 localStorage，工具链任何环节都不会把它发往 `api.github.com` 之外的地方。设置弹窗提供「清除 token」。

## 部署

- 推送到 **main** → Cloudflare Pages 自动部署生产站
- 推送任意**功能分支** → 自动生成预览站（如 `https://<branch>.html-page-editor.pages.dev`）

## 重要澄清：「内联 CSS」导出选项

导出步骤的「内联 CSS」选项，对**第三方样式表**在浏览器里 `fetch` 会被 CORS 拦截，因此**会跳过并保留外链**。
这不是功能坏了——页面 CSS 的内联应由**扩展在抓取阶段**完成；扩展抓取后 `link[rel=stylesheet]` 已不存在，导出选项自然空转不报错。

## 体积分级与降级

base64 内联会使体积膨胀约 33%，大页面有压垮浏览器的风险，因此按体积分级：

| 体积 | 行为 |
| --- | --- |
| ≤ 5MB | 全流程正常 |
| 5–15MB | 自动跳过美化与编辑器属性清理（原样输出），黄色告警建议先清洗减重 |
| 15–40MB | 红色告警 + 「仍然继续」逃生通道 |
| > 40MB | 阻断，提示先在清洗步骤移除不需要的模块 |

## 回滚

1. **最快**：Cloudflare Pages 控制台 → Deployments → Rollback（无需 git）
2. `git revert` / `git reset` 后重推触发重新部署
3. 手动上传历史 `dist/` 产物快照

## 技术栈

Vite 5 · React 18 · TypeScript 5 · Tailwind 3 · Zustand 5 · GrapesJS 0.23 · lucide-react
