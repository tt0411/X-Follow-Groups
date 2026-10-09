import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'X Follow Groups',
  description: '为 X 关注用户分组、设置别名、拖拽排序和搜索',
  version: '0.1.0',
  permissions: ['storage', 'sidePanel', 'tabs', 'unlimitedStorage'],
  host_permissions: ['https://x.com/*', 'https://abs.twimg.com/*'],
  icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' },
  action: {
    default_title: 'X Follow Groups',
    default_icon: { 16: 'icons/16.png', 32: 'icons/32.png' },
  },
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  side_panel: { default_path: 'src/sidepanel/index.html' },
  content_scripts: [
    {
      matches: ['https://x.com/*'],
      js: ['src/content/sync.ts'],
      run_at: 'document_idle',
    },
  ],
});
