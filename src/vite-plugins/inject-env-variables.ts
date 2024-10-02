import { Plugin } from 'vite'

const envkey = ['import', 'meta', 'env'].join('.')

export const injectEnvVariables = (options: { [key: string]: string }): Plugin => {
  return {
    name: 'vite-plugin-env-variables',
    config: (config, env) => {
      const define: any = {}
      Object.keys(options).forEach((key) => {
        define[`${envkey}.${key}`] = JSON.stringify(options[key])
      })
      return { define }
    },
  }
}
