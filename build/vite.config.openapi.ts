import path from 'path'
import { defineConfig } from 'vite'

function resolve(p: string) {
  return path.resolve(__dirname, '../', p)
}

export default defineConfig({
  build: {
    ssr: true,
    outDir: resolve('dist/openapi'),
    sourcemap: false,
    minify: false,
    lib: {
      entry: resolve('src/openapi/index.ts'),
      name: 'OpenAPI',
      fileName: 'openapi',
    },
  },
})
