import AWS from 'aws-sdk'
import { deployenv } from './deploy-env'
import { tools } from './tools'
import path from 'path'
import fs from 'fs'
const exe7z = '"C:\\Program Files\\7-Zip\\7z.exe"'

export const deployLambda = async function (settings: DeploymentLambda.Setting) {
  const env = deployenv()
  const pathCache = tools.root(settings.cachePath)
  const ROOT = tools.root()
  const pathBundleFile = path.resolve(pathCache, 'bundle.zip')
  const pathENV = path.resolve(pathCache, '.env')
  const lambda = new AWS.Lambda(env.AwsConfiguration)
  const isWindows = process.platform === 'win32'

  // clear cache files
  tools.remove(pathBundleFile)
  tools.remove(pathENV)

  /** writer .env */
  await fs.promises.readFile(`.env.${env.Stage}`).then((buffer) => fs.promises.writeFile(pathENV, buffer))

  const files = settings.files.map((fpath) => `"${fpath}"`).join(' ')

  const ignores = (settings.ignoreFiles || []).map((s) => `"${s}"`)
  let ignoreOption = ''
  if (isWindows && ignores.length > 0) {
    ignoreOption = ignores.map((s) => `-xr!${s}`).join(' ')
  } else if (!isWindows && ignores.length > 0) {
    ignoreOption = ignores.map((s) => `-x ${s}`).join(' ')
  }

  /** zip files */
  // windows command, use 7z replace zip
  if (isWindows) {
    await tools.spawn([`cd ${ROOT}`, `${exe7z} a -tzip ${pathBundleFile} ${files} ${ignoreOption}`].join(' && '))
  } else {
    await tools.spawn([`cd ${ROOT}`, `zip ${pathBundleFile} ${files} ${ignoreOption}`].join(' && '))
  }
  // await tools.spawn([`cd ${ROOT}`, `zip ${pathBundleFile} ${files} ${ignoreOption}`].join(' && '))

  /** zip add .env */
  if (isWindows) {
    await tools.spawn([`cd ${pathCache}`, `${exe7z} a -tzip -mx=9 ${pathBundleFile} .env`].join(' && '))
  } else {
    await tools.spawn([`cd ${pathCache}`, `zip -gr9 ${pathBundleFile} .env`].join(' && '))
  }

  // // fix aws esm layer bug. https://github.com/vibe/aws-esm-modules-layer-support
  // // issue: https://github.com/aws/aws-sdk-js-v3/issues/3230
  // await tools.spawn(
  //   [
  //     `cd ${pathCache}`,
  //     'ln -s /opt/nodejs/node_modules node_modules',
  //     `zip --symlinks ${pathBundleFile} node_modules`,
  //   ].join(' && ')
  // )

  // get lambda
  const func = await lambda
    .getFunction({ FunctionName: env.LambdaFunction })
    .promise()
    .catch((err) => (err.name === 'ResourceNotFoundException' ? null : Promise.reject(err)))

  if (!func) {
    // create lambda
    await lambda
      .createFunction({
        Code: {
          ZipFile: fs.readFileSync(pathBundleFile),
        },
        FunctionName: env.LambdaFunction,
        Runtime: settings.runtime ?? 'nodejs16.x',
        MemorySize: 2048,
        Timeout: 60,
        Role: 'arn:aws:iam::081743246838:role/Lambda_S3+SQS+RDS',
        Handler: 'lambda.handler',
      })
      .promise()
  } else {
    await lambda
      .updateFunctionCode({
        ZipFile: fs.readFileSync(pathBundleFile),
        FunctionName: env.LambdaFunction,
      })
      .promise()
  }
  console.info('waiting funciton update...')
  await lambda
    .waitFor('functionUpdatedV2', {
      FunctionName: env.LambdaFunction,
    })
    .promise()
  console.info('## Deploy Lambda Done ! ##')
}

export namespace DeploymentLambda {
  export interface Setting {
    cachePath: string
    files: string[]
    ignoreFiles?: string[]
    runtime?: string
  }
}
