import { Plugin, ViteDevServer } from 'vite'
import path from 'path'
import fs from 'fs'
export const staticRewriters = (rewriters: { [key: string]: string }): Plugin => {
  return {
    name: 'vite-plugin-static-rewriter',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      return () => {
        server.middlewares.use(async (req, res, next) => {
          const pathname = req.originalUrl?.split('?')[0]
          const newpath = (pathname && rewriters[pathname]) || null
          if (newpath) {
            res.setHeader('Content-Type', 'text/html')
            res.writeHead(200)
            res.write(fs.readFileSync(path.resolve(process.cwd(), `public/${newpath}`)))
            res.end()
          }
          next()
        })
      }
    },
  }
}
