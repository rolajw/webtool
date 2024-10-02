import path from 'path'
import { defineConfig } from 'vite'

function resolve(p: string) {
  return path.resolve(__dirname, '../../', p)
}

export default defineConfig({
  build: {
    ssr: true,
    outDir: resolve('dist/vite-plugins'),
    sourcemap: false,
    minify: false,
    lib: {
      entry: resolve('src/vite-plugins/index.ts'),
      name: 'VitePlugins',
      fileName: 'vite-plugins',
    },
  },
})
