import { tools } from './tools'
import {
  DeployCloudFront,
  deployCloudFront,
  createCloudfrontInvalidations as _invalidations,
  createCloudfrontInvalidations,
} from './cloudfront'
import { PackageContent, updateDeployEnv, UpdateDeployEnv } from './deploy-env'
import { deployLambda, DeploymentLambda } from './lambda'
import { DeployLayer, deployLayer } from './layer'

interface DeploymentOptions {
  packageContent: PackageContent
  env: () => UpdateDeployEnv
  lambda?: DeploymentLambda.Setting
  cloudfront?: DeployCloudFront.Setting
  layer?: DeployLayer.Setting
  invalidations?: string[]
}

export function commandArgv(key: string) {
  return tools.argv(key)
}

export function commandOptionExists(key: string) {
  return tools.opt(key)
}

export async function deployment(options: DeploymentOptions) {
  // update env
  updateDeployEnv(options.packageContent, { ...options.env() })

  if (tools.opt('--cloudfront')) {
    if (!options.cloudfront) {
      throw new Error(`cludfront settings is required`)
    }

    await deployCloudFront(options.cloudfront)
  }

  if (tools.opt('--lambda')) {
    if (!options.lambda) {
      throw new Error(`lambda settings is required`)
    }
    await deployLambda(options.lambda)
  }

  if (tools.opt('--invalidations')) {
    if (!options.invalidations) {
      throw new Error(`lambda settings is required`)
    }
    await createCloudfrontInvalidations(options.invalidations)
  }

  if (tools.opt('--layer')) {
    if (!options.layer) {
      throw new Error(`lambda settings is required`)
    }
    await deployLayer(options.layer)
    // patchs: {
    //   prismic: ['@prismicio/client', '@prismicio/helpers', '@prismicio/vue'],
    //   vueLibs: [
    //     'vue-cropper',
    //     'vue-echarts',
    //     'vue-i18n',
    //     'vue-input-autowidth',
    //     'vue3-google-map',
    //   ],
    // },
  }
}
