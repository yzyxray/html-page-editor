import type { ScriptType } from '../types';

export interface TrackingTemplate {
  type: ScriptType;
  label: string;
  placeholder: string;
  generateCode: (id: string) => string;
  placement: 'head' | 'body';
  description: string;
}

/**
 * 清洗 Tracking ID，防止 XSS 注入。
 * 只允许字母、数字、连字符、下划线、点号 —— 这些覆盖了所有主流追踪平台的 ID 格式：
 * GA4 (G-XXXXXXXXXX)、GTM (GTM-XXXXXXX)、Meta Pixel (数字)、TikTok (字母数字)、
 * Bing UET (数字)、LinkedIn (数字)、AnyTrack (字母数字)
 */
function sanitizeTrackingId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_\-.]/g, '');
}

/** 对 ID 做转义，防止在 HTML 属性上下文中注入 */
function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 安全生成代码：先清洗 ID，再用转义后的值插入模板 */
function safeId(rawId: string): string {
  return escapeHtmlAttr(sanitizeTrackingId(rawId));
}

export const TRACKING_TEMPLATES: TrackingTemplate[] = [
  {
    type: 'google-analytics-ga4',
    label: 'Google Analytics GA4',
    placeholder: 'G-XXXXXXXXXX',
    placement: 'head',
    description: 'Google Analytics 4 Measurement ID',
    generateCode: (measurementId: string) => `
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${safeId(measurementId)}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${safeId(measurementId)}');
</script>`,
  },
  {
    type: 'google-analytics-ua',
    label: 'Google Analytics UA',
    placeholder: 'UA-XXXXXXXXX-X',
    placement: 'head',
    description: 'Universal Analytics Tracking ID (已弃用，建议用GA4)',
    generateCode: (trackingId: string) => `
<!-- Google Analytics UA -->
<script>
  (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
  (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
  m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
  })(window,document,'script','https://www.google-analytics.com/analytics.js','ga');
  ga('create', '${safeId(trackingId)}', 'auto');
  ga('send', 'pageview');
</script>`,
  },
  {
    type: 'google-tag-manager',
    label: 'Google Tag Manager',
    placeholder: 'GTM-XXXXXXX',
    placement: 'head',
    description: 'Google Tag Manager Container ID',
    generateCode: (gtmId: string) => `
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${safeId(gtmId)}');</script>
<!-- End Google Tag Manager -->`,
  },
  {
    type: 'google-tag-manager',
    label: 'GTM NoScript (body)',
    placeholder: 'GTM-XXXXXXX',
    placement: 'body',
    description: 'Google Tag Manager noscript fallback',
    generateCode: (gtmId: string) => `
<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${safeId(gtmId)}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->`,
  },
  {
    type: 'facebook-pixel',
    label: 'Facebook / Meta Pixel',
    placeholder: '123456789012345',
    placement: 'head',
    description: 'Meta Pixel ID (16位数字)',
    generateCode: (pixelId: string) => `
<!-- Meta Pixel Code -->
<script>
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', '${safeId(pixelId)}');
  fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
  src="https://www.facebook.com/tr?id=${safeId(pixelId)}&ev=PageView&noscript=1"
/></noscript>
<!-- End Meta Pixel Code -->`,
  },
  {
    type: 'anytrack',
    label: 'AnyTrack',
    placeholder: 'XXXXXXXXXX',
    placement: 'head',
    description: 'AnyTrack Property ID（在 AnyTrack 后台 Property Settings 获取）',
    generateCode: (propertyId: string) => `
<!-- AnyTrack Tracking Code -->
<script>!function(e,t,n,s,a){(a=t.createElement(n)).async=!0,a.src="https://assets.anytrack.io/${safeId(propertyId)}.js",(t=t.getElementsByTagName(n)[0]).parentNode.insertBefore(a,t),e[s]=e[s]||function(){(e[s].q=e[s].q||[]).push(arguments)}}(window,document,"script","AnyTrack");</script>
<!-- End AnyTrack Tracking Code -->`,
  },
  {
    type: 'bing-ads',
    label: 'Microsoft Bing Ads UET',
    placeholder: '12345678',
    placement: 'head',
    description: 'Bing Ads UET Tag ID',
    generateCode: (uetId: string) => `
<!-- Microsoft Advertising UET -->
<script>
  (function(w,d,t,r,u){var f,n,i;w[u]=w[u]||[];f=function(){
  var o={ti:"${safeId(uetId)}", enableAutoSpaTracking: true};
  o.q=w[u];w[u]=new UET(o);w[u].push("pageLoad")};
  n=d.createElement(t);n.src=r;n.async=1;n.onload=n.onreadystatechange=function(){
  var s=this.readyState;s&&s!=="loaded"&&s!=="complete"||(f(),n.onload=n.onreadystatechange=null)};
  i=d.getElementsByTagName(t)[0];i.parentNode.insertBefore(n,i)})
  (window,document,"script","//bat.bing.com/bat.js","uetq");
</script>`,
  },
  {
    type: 'tiktok-pixel',
    label: 'TikTok Pixel',
    placeholder: 'XXXXXXXXXXXXXXXX',
    placement: 'head',
    description: 'TikTok Pixel ID（在 TikTok Ads Manager → Assets → Events 创建 Pixel 获取）',
    generateCode: (pixelId: string) => `
<!-- TikTok Pixel Code -->
<script>
!function (w, d, t) {
  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
  ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
  ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
  for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
  ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
  ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
  ttq.load('${safeId(pixelId)}');
  ttq.page();
}(window, document, 'ttq');
</script>
<!-- End TikTok Pixel Code -->`,
  },
  {
    type: 'linkedin-insight',
    label: 'LinkedIn Insight Tag',
    placeholder: '1234567',
    placement: 'body',
    description: 'LinkedIn Insight Tag Partner ID',
    generateCode: (partnerId: string) => `
<!-- LinkedIn Insight Tag -->
<script type="text/javascript">
  _linkedin_partner_id = "${safeId(partnerId)}";
  window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
  window._linkedin_data_partner_ids.push(_linkedin_partner_id);
</script>
<script type="text/javascript">
  (function(l) { if (!l){window.lintrk = function(a,b){window.lintrk.q.push([a,b])};
  window.lintrk.q=[]} var s = document.getElementsByTagName("script")[0];
  var b = document.createElement("script");
  b.type = "text/javascript";b.async = true;
  b.src = "https://snap.licdn.com/li.lms-analytics/insight.min.js";
  s.parentNode.insertBefore(b, s);})(window.lintrk);
</script>
<noscript>
  <img height="1" width="1" style="display:none;" alt=""
  src="https://px.ads.linkedin.com/collect/?pid=${safeId(partnerId)}&fmt=gif" />
</noscript>`,
  },
];

export function getTemplateByType(type: ScriptType): TrackingTemplate | undefined {
  return TRACKING_TEMPLATES.find((t) => t.type === type);
}

export function getTemplatesByType(type: ScriptType): TrackingTemplate[] {
  return TRACKING_TEMPLATES.filter((t) => t.type === type);
}

export function generateReplacementScript(scriptId: string, templateType: ScriptType, trackingId: string): string {
  const template = getTemplateByType(templateType);
  console.log('Generating replacement for:', templateType, trackingId);
  if (!template) return '';
  return template.generateCode(trackingId);
}
