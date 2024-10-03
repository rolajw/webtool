import AWS from 'aws-sdk'

const env: DeployEnv = {
  Version: '0.0.0',

  AwsID: '',
  AwsKey: '',
  AwsRegion: '',
  AwsS3: '',
  CloudFrontFunction: '',
  Stage: '',
  LambdaFunction: '',
  DistributionId: '',
  LambdaLayer: '',
  WebRoot: '',
  PackageContent: { version: '0.0.0', dependencies: {} },
  AwsConfiguration: {
    region: '',
    credentials: null as any,
  },
}

export const updateDeployEnv = (packageContent: PackageContent, data?: UpdateDeployEnv) => {
  env.Version = packageContent.version ?? '0.0.0'
  env.DistributionId = data?.distributionid ?? env.DistributionId
  env.AwsID = data?.awsid ?? env.AwsID
  env.AwsKey = data?.awskey ?? env.AwsKey
  env.AwsRegion = data?.awsregion ?? env.AwsRegion
  env.AwsS3 = data?.s3bucket ?? env.AwsS3
  env.CloudFrontFunction = data?.cloudfrontfunction ?? env.CloudFrontFunction
  env.Stage = data?.stage ?? env.Stage
  env.LambdaFunction = data?.lambdafunction ?? env.LambdaFunction
  env.LambdaLayer = data?.lambdalayer ?? env.LambdaLayer
  env.WebRoot = data?.webroot ?? env.WebRoot
  env.PackageContent = packageContent

  if (env.AwsID || env.AwsKey) {
    env.AwsConfiguration = {
      region: env.AwsRegion,
      credentials: {
        accessKeyId: env.AwsID,
        secretAccessKey: env.AwsKey,
      },
    }
  } else {
    const myconfig = new AWS.Config()
    myconfig.update({ region: env.AwsRegion })
    env.AwsConfiguration.region = env.AwsRegion
    env.AwsConfiguration.credentials = myconfig.credentials || undefined
  }
}

export const deployenv = () => {
  if (!env.AwsRegion) {
    throw new Error(`REGION is required`)
  }

  if (!env.AwsS3) {
    throw new Error(`S3 is required`)
  }

  if (!env.CloudFrontFunction) {
    throw new Error(`FUNC is required`)
  }

  if (!env.Stage) {
    throw new Error(`STAGE is required`)
  }
  return env
}

export interface UpdateDeployEnv {
  awsid?: string
  awskey?: string
  awsregion?: string
  s3bucket?: string
  cloudfrontfunction?: string
  distributionid?: string
  stage?: string
  lambdafunction?: string
  lambdalayer?: string
  webroot?: string
}

export interface PackageContent {
  version: string
  dependencies: { [key: string]: string }
}

export interface DeployEnv {
  Version: string
  AwsID: string
  AwsKey: string
  AwsRegion: string
  AwsS3: string
  CloudFrontFunction: string
  Stage: string
  LambdaFunction: string
  DistributionId: string
  LambdaLayer: string
  WebRoot: string
  PackageContent: PackageContent
  AwsConfiguration: {
    region: string
    credentials?: {
      accessKeyId: string
      secretAccessKey: string
    }
  }
}
