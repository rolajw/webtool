import { Plugin } from 'vite'

let envInjectionFailed = false

export interface InjectOptions {
  data: { [key: string]: any }
}

export const injectHtml = (options: InjectOptions): Plugin => {
  return {
    name: 'vite-plugin-inject-html',
    configResolved(config) {
      if (envInjectionFailed) {
        config.logger.warn(
          `[vite-plugin-package-version] import.meta.env.PACKAGE_VERSION was not injected due ` +
            `to incompatible vite version (requires vite@^2.0.0-beta.69).`
        )
      }
    },
    transformIndexHtml: {
      enforce: 'pre',
      transform(html: string, ctx) {
        return {
          html: Object.keys(options.data).reduce((str, key) => {
            return str.replace(`<!--${key}-->`, options.data[key])
          }, html),
          tags: [],
        }
      },
    },
  }
}
