import AWS from 'aws-sdk'
import { deployenv } from './deploy-env'
import { Tools, tools } from './tools'
import fs from 'fs'
import path from 'path'
import { Task } from './task'
import cloudfrontFunction from './functions/cloudfront-function.js?raw'
import { ObjectCannedACL } from 'aws-sdk/clients/s3'

type Truthy<T> = T extends false | '' | 0 | null | undefined ? never : T
const filterTruthy = <T>(value: T): value is Truthy<T> => !!value

export const deployCloudFront = async function (settings: DeployCloudFront.Setting) {
  const env = deployenv()
  const now = new Date().getTime()
  const webpath = env.WebRoot
  const indexFile = `index.${now}.html`
  const rewrites = settings.rewriters ? JSON.stringify(settings.rewriters) : '{}'

  const s3 = new AWS.S3(env.AwsConfiguration)
  const cloudfront = new AWS.CloudFront(env.AwsConfiguration)

  if (!env.WebRoot.startsWith('website')) {
    throw new Error(`WebRoot must start with website.  Found: ${env.WebRoot}`)
  }
  
  const task = new Task()
  task.onComplete = (file: Tools.ScanFileItem) => {
    console.info(`uploaded ${file.filepath}`)
    console.info(`  -> ${file.uploadpath}`)
  }

  const ignoreStrings = settings.ignoreFiles
    ?.map<string | undefined>((f) => (typeof f === 'string' ? f : undefined))
    .filter(filterTruthy)

  const ignoreRegExps = settings.ignoreFiles?.map((f) => (f instanceof RegExp ? f : undefined)).filter(filterTruthy)
  const rootpath = tools.root(settings.dir)
  const files = await tools.scanFiles(tools.root(settings.dir), {
    root: webpath,
    handler: (item) => {
      if (item.filepath.endsWith('.DS_Store')) {
        return null
      }

      const fpath = item.filepath.replace(rootpath, '')
      const isIgnore = ignoreStrings?.includes(fpath) || ignoreRegExps?.some((reg) => reg.test(fpath))
      if (isIgnore) {
        return null
      }

      if (item.filepath === path.resolve(settings.dir, 'index.html')) {
        item.uploadpath = `${webpath}/${indexFile}`
      }

      return item
    },
  })

  const uploads: DeployCloudFront.UploadItem[] = []
  files
    .sort((a, b) => b.size - a.size)
    .forEach((file) => {
      task.add(() =>
        fs.promises
          .readFile(file.filepath)
          .then((buffer) =>
            s3
              .upload({
                Bucket: env.AwsS3,
                Key: file.uploadpath,
                Body: buffer,
                ACL: 'private',
                ContentType: file.contentType,
              })
              .promise()
              .then(() => {
                uploads.push({
                  key: file.uploadpath,
                  sha1: tools.sha1(buffer),
                })
              })
          )
          .then(() => file)
      )
    })
  await task.start(10).then(() => console.info('upload files completed!'))

  const code = cloudfrontFunction
    .toString()
    .replace('REPLACE_PATH_VALUE', webpath)
    .replace('REPLACE_INDEX_FILE', indexFile)
    .replace(`'REPLACE_REWRITERS'`, rewrites)

  await cloudfront
    .describeFunction({ Name: env.CloudFrontFunction })
    .promise()
    .then((func) => {
      return cloudfront
        .updateFunction({
          Name: env.CloudFrontFunction,
          FunctionCode: code,
          IfMatch: func.ETag || '',
          FunctionConfig: {
            Comment: '',
            Runtime: 'cloudfront-js-1.0',
          },
        })
        .promise()
    })

  await cloudfront
    .describeFunction({ Name: env.CloudFrontFunction })
    .promise()
    .then((func) => {
      return cloudfront
        .publishFunction({
          Name: env.CloudFrontFunction,
          IfMatch: func.ETag || '',
        })
        .promise()
    })

  console.info('update change log')
  await clearFiles(settings, uploads)
  console.info('publish function completed!')
}

export async function createCloudfrontInvalidations(paths: string[], waiting = true) {
  const env = deployenv()
  const cloudfront = new AWS.CloudFront(env.AwsConfiguration)

  if (!env.DistributionId) {
    throw new Error('env.distributionid is required!!')
  }

  console.info('Create Invalidations > ', paths)
  await cloudfront
    .createInvalidation({
      DistributionId: env.DistributionId,
      InvalidationBatch: {
        CallerReference: new Date().getTime().toString(),
        Paths: {
          Quantity: paths.length,
          Items: paths,
        },
      },
    })
    .promise()
    .then((res) => {
      if (res.$response.error) {
        return Promise.reject(res.$response.error)
      }
      if (!res.$response.data) {
        return Promise.reject(new Error('create invalidations response empty'))
      }
      return res.$response.data
    })
    .then((res) => {
      if (!waiting) {
        console.info('Ignore Waiting ... ')
        return null
      }
      console.info('Wait for invalidation completing ...')
      return cloudfront
        .waitFor('invalidationCompleted', {
          DistributionId: env.DistributionId,
          Id: res.Invalidation?.Id ?? '',
        })
        .promise()
    })
    .then((res) => {
      if (res?.$response.error) {
        return Promise.reject(res.$response.error)
      }
    })
}

async function clearFiles(settings: DeployCloudFront.Setting, uploads: DeployCloudFront.UploadItem[]) {
  const env = deployenv()
  const s3 = new AWS.S3(env.AwsConfiguration)
  const now = new Date().getTime()
  const prefixUploads = `${env.WebRoot}/.uploads`
  const uploadRecord = `${prefixUploads}/v${env.Version}-${now}.json`

  // 載入所有更新記錄 (前 {reverses} 次記錄)
  const res = await s3
    .listObjectsV2({
      Bucket: env.AwsS3,
      Prefix: `${prefixUploads}/`,
    })
    .promise()

  // 寫入本次更新的檔案記錄
  await s3
    .upload({
      Bucket: env.AwsS3,
      Key: uploadRecord,
      Body: JSON.stringify(uploads),
      ACL: 'public-read',
      ContentType: 'application/json',
    })
    .promise()

  interface UploadItem extends DeployCloudFront.UploadItem {
    hasUpdated: boolean
  }

  const files = new Map<string, UploadItem>()

  // 記錄依照時間降冪排序
  const records = ((res.$response.data && res.$response.data.Contents) || []).sort(
    (b, a) =>
      (a.LastModified ? new Date(a.LastModified).getTime() : 0) -
      (b.LastModified ? new Date(b.LastModified).getTime() : 0)
  )

  // 刪除檔案記錄 (保留 {reverses} 筆記錄)
  const deleteRecords = records.splice(settings.reverses ?? 1).map((r) => ({ Key: r.Key! }))
  if (deleteRecords.length > 0) {
    await s3
      .deleteObjects({
        Bucket: env.AwsS3,
        Delete: {
          Objects: deleteRecords,
        },
      })
      .promise()
  }

  // 建立檔案記錄快取
  for (const ritem of records) {
    if (!ritem.Key) {
      continue
    }
    const res = await s3
      .getObject({
        Bucket: env.AwsS3,
        Key: ritem.Key,
      })
      .promise()

    JSON.parse(res.Body?.toString() ?? '[]').forEach((item: DeployCloudFront.UploadItem) => {
      if (!files.has(item.key)) {
        files.set(item.key, {
          key: item.key,
          sha1: item.sha1,
          hasUpdated: false,
        })
      }
    })
  }

  // 建立本次檔案快取, 若 sha1 不相同, 需要建立 invalidations 清除 cloudfront 快取
  uploads.forEach((item) => {
    const fitem: UploadItem = files.get(item.key) ?? {
      key: item.key,
      sha1: item.sha1,
      hasUpdated: false,
    }

    if (fitem.sha1 !== item.sha1) {
      fitem.hasUpdated = true
    }
    files.set(fitem.key, fitem)
  })

  // 刪除用不到的檔案
  console.info('Clear Files')
  let startAfterKey: string | undefined = undefined
  const deleteFiles: { Key: string }[] = []
  while (true) {
    const res = await s3
      .listObjectsV2({
        Bucket: env.AwsS3,
        Prefix: env.WebRoot + (env.WebRoot.endsWith('/') ? '' : '/'),
        StartAfter: startAfterKey,
      })
      .promise()

    const contents = (res.$response.data && res.$response.data.Contents) || []

    contents.forEach((o) => {
      if (!o.Key || o.Key.startsWith(`${prefixUploads}`) || files.has(o.Key)) {
        return
      }
      deleteFiles.push({ Key: o.Key })
    })

    if (contents.length < 1000) {
      break
    }
    startAfterKey = contents[contents.length - 1].Key as string
  }

  let deletes = deleteFiles.slice()
  console.info('delete files > ', deletes)
  while (deletes.length > 0) {
    await s3
      .deleteObjects({
        Bucket: env.AwsS3,
        Delete: {
          Objects: deletes.splice(0, 1000),
        },
      })
      .promise()
  }

  // 將有更新的檔案建立 invalidations
  const needUpdateds = Array.from(files.values())
    .filter((f) => f.hasUpdated)
    .map((o) => `/${o.key}`)

  if (needUpdateds.length) {
    await createCloudfrontInvalidations(needUpdateds, settings.waitForInvalidations)
  }
}

export namespace DeployCloudFront {
  export interface Setting {
    dir: string
    fileACL?: ObjectCannedACL
    // 已佈署的版本保留數
    reverses?: number // default: 1
    rewriters?: { [path: string]: string }
    waitForInvalidations?: boolean
    ignoreFiles?: (string | RegExp)[]
  }

  export interface UploadItem {
    key: string
    sha1: string
  }
}
