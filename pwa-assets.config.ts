import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Generates the PWA icons from public/pwa-icon.svg: `npx pwa-assets-generator`
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#2f6b4f' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#2f6b4f' } },
  },
  images: ['public/pwa-icon.svg'],
})
