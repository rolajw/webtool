import cp from 'child_process'

/**
 * command
 * node build.js --prod --all
 * node build.js --prod --deployment
 * node build.js --prod --schema
 * node build.js --prod --vite-plugin
 */

/**
 * @typedef {Object} BuildOptions
 * @property {boolean | undefined} prod
 * @property {boolean | undefined} watch
 * @property {boolean | undefined} emptyOutDir
 */

app()

function getArgValue(name) {
  const idx = process.argv.indexOf(`--${name}`)
  const value = idx > 0 ? process.argv[idx + 1] : ''
  return value
}

function hasArg(name) {
  return process.argv.includes(`--${name}`)
}

function app() {
  const isBuildAll = hasArg('all')
  const buildDeployment = isBuildAll || hasArg('deployment')
  const buildSchema = isBuildAll || hasArg('schema')
  const buildVitePlugin = isBuildAll || hasArg('vite-plugin')

  /**
   * @type {BuildOptions}
   */
  const options = {
    prod: hasArg('prod'),
    watch: hasArg('watch'),
  }

  if (buildDeployment) {
    runBuildCommand(`build/vite.config.deployment.ts`, options)
  }

  if (buildSchema) {
    runBuildCommand(`build/vite.config.schema.ts`, options)
  }

  if (buildVitePlugin) {
    runBuildCommand(`build/vite.config.vite-plugin.ts`, options)
  }
}

/**
 *
 * @param {string} configFile
 * @param {BuildOptions} options
 */
function runBuildCommand(configFile, options) {
  const commands = [
    'vite',
    '--config',
    configFile,
    'build',
    options.emptyOutDir ? '--emptyOutDir' : '',
    options.watch ? '--watch' : '',
    '--mode',
    options.prod ? 'prod' : 'dev',
  ].filter(Boolean)
  const r = cp.spawn(commands.join(' '), { stdio: 'inherit', shell: true })
}
