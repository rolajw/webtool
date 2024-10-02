import AWS from 'aws-sdk'

import { APIGatewayService } from './APIGatewayService'
import { deployenv } from './deploy-env'
import { tools } from './tools'

export const deployAPIGateway = async function () {
  const env = deployenv()
  const apigateway = new AWS.APIGateway(env.AwsConfiguration)

  /** @type {Tools.DeploymentRecord} */
  const deployment = tools.loadDeployment(env.Stage) ?? {
    ApiGateway: { id: '' },
  }

  /** @type {AWS.APIGateway.RestApi | null} */
  let api = deployment.ApiGateway.id
    ? await apigateway
        .getRestApi({ restApiId: deployment.ApiGateway.id })
        .promise()
        .catch((err) => (err.name === 'NotFoundException' ? null : Promise.reject(err)))
    : null

  if (!api) {
    api = await apigateway.createRestApi({ name: env.LambdaFunction }).promise()
  }

  if (!api.id) {
    throw new Error('unknown api.id')
  }

  const apiservice = new APIGatewayService(env, api)
  deployment.ApiGateway.id = api.id
  tools.saveDeployment(env.Stage, deployment)

  await apiservice.addRoute('ANY', '/')
  await apiservice.addRoute('ANY', '/{proxy+}')
  await apiservice.deployStage()
}
