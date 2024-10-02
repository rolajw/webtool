import path from 'path'
import { defineConfig } from 'vite'

function resolve(p: string) {
  return path.resolve(__dirname, '../', p)
}

export default defineConfig({
  build: {
    ssr: true,
    outDir: resolve('dist/schema'),
    sourcemap: false,
    minify: false,
    lib: {
      entry: resolve('src/schema/index.ts'),
      name: 'Schema',
      fileName: 'schema',
    },
  },
})
