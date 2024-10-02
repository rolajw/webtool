import path from 'path'
import { defineConfig } from 'vite'

function resolve(p: string) {
  return path.resolve(__dirname, '../', p)
}

export default defineConfig({
  build: {
    ssr: true,
    outDir: resolve('dist/deployment'),
    sourcemap: false,
    minify: false,
    lib: {
      entry: resolve('src/deployment/index.ts'),
      name: 'Deployment',
      fileName: 'deployment',
    },
  },
})
