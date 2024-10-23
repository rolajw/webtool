import fs from 'fs'
import { deployenv } from './deploy-env'
import { tools } from './tools'
import * as AWSLambda from '@aws-sdk/client-lambda'
import { Task } from './task'

const isWindows = process.platform === 'win32'

export const deployLayer = async function (setting: DeployLayer.Setting) {
  const env = deployenv()
  const lambda = new AWSLambda.Lambda({ region: env.AwsRegion })

  const task = new Task()
  const items = await runBundle(setting)
  items.forEach((o) => {
    task.add(() => {
      const stat = fs.statSync(o.bundlePath)
      if (!stat) {
        throw new Error(`${o.bundlePath} not found`)
      }
      console.info(`Bundle ${o.name} Layer size: `, (stat.size / 1024 / 1024).toFixed(2) + 'MB')
      return runDeploy(setting, o)
    })
  })

  task.onError = (err) => console.error(err)

  return task.start(1).then(() => {
    console.info(`Update Function Configuration (${env.LambdaFunction}) ...`)
    return lambda.updateFunctionConfiguration({
      FunctionName: env.LambdaFunction,
      Layers: items.map((o) => o.layerARN),
    })
  })
}

async function patchPackages(patchs: DeployLayer.Setting['patchs'] | undefined) {
  const env = deployenv()
  const pkg = env.PackageContent

  const results: DeployLayer.LayerPatch[] = []

  /** @type {{[key: string]: string}} */
  const dependencies = pkg?.dependencies ?? {}

  const maps = Object.keys(dependencies).reduce((m, key) => {
    m.set(key, dependencies[key])
    return m
  }, new Map())

  if (patchs) {
    Object.keys(patchs).forEach((key) => {
      /** @type {string[]} */
      const items = patchs[key]

      results.push({
        name: `${env.LambdaLayer}__${key}`,
        private: true,
        version: pkg.version ?? '0.0.0',
        bundlePath: '',
        layerARN: '',
        dependencies: items
          .map((module) => {
            const ver = maps.get(module)
            maps.delete(module)
            return ver ? { [module]: ver } : null
          })
          .filter(Boolean)
          .reduce((m: any, o) => Object.assign(m, o), {}),
      })
    })
  }

  if (maps.size > 0) {
    results.push({
      name: env.LambdaLayer,
      private: true,
      version: pkg.version ?? '0.0.0',
      bundlePath: '',
      layerARN: '',
      dependencies: Array.from(maps.keys())
        .map((module) => {
          const ver = maps.get(module)
          maps.delete(module)
          return ver ? { [module]: ver } : null
        })
        .filter(Boolean)
        .reduce((m: any, o) => Object.assign(m, o), {}),
    })
  }

  return results
}

async function runBundle(setting: DeployLayer.Setting): Promise<DeployLayer.LayerPatch[]> {
  const env = deployenv()
  if (!env.LambdaLayer) {
    throw new Error(`DEPLOY_LAYER is required`)
  }
  const results = await patchPackages(setting?.patchs)

  for (const pkg of results) {
    const pathPatchFolder = tools.root(`.cache/${pkg.name}`)
    const pathPatchNodeJS = tools.root(`.cache/${pkg.name}/nodejs`)
    const pathPatchPackage = tools.root(`.cache/${pkg.name}/nodejs/package.json`)
    const pathBundle = tools.root(`.cache/${pkg.name}/nodejs.zip`)

    tools.remove(pathPatchNodeJS)
    tools.remove(pathBundle)

    if (!tools.stat(pathPatchFolder)) {
      fs.mkdirSync(pathPatchFolder)
    }
    if (!tools.stat(pathPatchNodeJS)) {
      fs.mkdirSync(pathPatchNodeJS)
    }
    fs.promises.writeFile(pathPatchPackage, JSON.stringify(pkg, null, 4))
    await tools.spawn(`npm i --only=prod`, { cwd: pathPatchNodeJS })

    if (isWindows) {
      await tools.spawn(`${tools.exe7z} a -tzip ${pathBundle} nodejs`, { cwd: pathPatchFolder })
    } else {
      await tools.spawn(`cd ${pathPatchFolder} && zip ${pathBundle} -r9 nodejs`)
    }

    pkg.bundlePath = pathBundle
  }

  return results
}

async function runDeploy(setting: DeployLayer.Setting, pitem: DeployLayer.LayerPatch): Promise<void> {
  const env = deployenv()
  const lambda = new AWSLambda.Lambda({ region: env.AwsRegion })

  console.info(`Publish Layer - ${pitem.name} ...`)

  const res = await lambda.publishLayerVersion({
    LayerName: pitem.name,
    CompatibleRuntimes: setting.runtimes ?? ['nodejs20.x'],
    Content: {
      ZipFile: fs.readFileSync(pitem.bundlePath),
    },
  })

  const vers = await lambda.listLayerVersions({
    LayerName: pitem.name,
    MaxItems: 10,
  })

  const layerVersions = Array.from(vers.LayerVersions ?? [])
    .sort((a, b) => (b.Version ?? 0) - (a.Version ?? 0))
    .slice(3)

  for (let ver of layerVersions) {
    console.info(`Delete Layer Version ${pitem.name}:${ver.Version}`)
    if (ver.Version) {
      await lambda.deleteLayerVersion({
        LayerName: pitem.name,
        VersionNumber: ver.Version,
      })
    }
  }

  if (res.LayerVersionArn) {
    pitem.layerARN = res.LayerVersionArn
  } else {
    throw new Error('LayerArn is empty')
  }
}

export namespace DeployLayer {
  export interface Setting {
    patchs?: { [name: string]: string[] }
    runtimes?: AWSLambda.Runtime[]
  }

  export interface LayerPatch {
    name: string
    private: boolean
    version: string
    dependencies: { [key: string]: string }
    bundlePath: string
    layerARN: string
  }
}
