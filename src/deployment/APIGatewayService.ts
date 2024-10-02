//@ts-check
import AWS from 'aws-sdk'
import { DeployEnv, deployenv } from './deploy-env'

export class APIGatewayService {
  /**
   *
   * @param {typeof DeployEnv} env
   */
  /**
   *
   * @param {typeof DeployEnv} env
   * @param {AWS.APIGateway.RestApi} api
   */
  protected api: AWS.APIGateway.RestApi
  protected env: DeployEnv
  protected lambda: AWS.Lambda
  protected apigateway: AWS.APIGateway
  protected resources: AWS.APIGateway.Resource[] = []
  protected accountId: string | null = null
  protected deployments: AWS.APIGateway.Deployment[] = []
  constructor(env: DeployEnv, api: AWS.APIGateway.RestApi) {
    this.api = api
    this.env = env
    this.lambda = new AWS.Lambda(env.AwsConfiguration)
    this.apigateway = new AWS.APIGateway(env.AwsConfiguration)
  }

  get restApiId(): string {
    if (!this.api.id) {
      throw new Error('restApiId is empty')
    }
    return this.api.id
  }

  async getAccountId() {
    if (!this.accountId) {
      const sts = new AWS.STS(this.env.AwsConfiguration)
      const res = await sts.getCallerIdentity().promise()
      this.accountId = res.Account || null
    }
    return this.accountId
  }

  async getRestAPIOrCreate(id?: string) {
    const find = id ? this.apigateway.getRestApi({ restApiId: id }).promise().catch(this.handleNotFoundError) : null

    if (!find) {
      this.api = await this.apigateway
        .createRestApi({
          name: this.env.LambdaFunction,
        })
        .promise()
    }

    return this.api
  }

  handleNotFoundError(err: Error) {
    return ['ResourceNotFoundException', 'NotFoundException'].includes(err.name) ? null : Promise.reject(err)
  }

  async getResourceOrCreate(path: string): Promise<AWS.APIGateway.Resource> {
    if (this.resources.length === 0) {
      const res = await this.apigateway
        .getResources({
          restApiId: this.restApiId,
          limit: 500,
        })
        .promise()
      this.resources = Array.from(res.items || [])
    }

    const find = this.resources.find((r) => r.path === path)
    if (find) {
      return find
    }
    const paths = path.split('/')
    const currentPath = paths.pop()
    const parentPath = paths.join('/') || '/'
    const parent = await this.getResourceOrCreate(parentPath)

    if (!parent.id || !currentPath) {
      throw new Error('unknown partent.id or currentPath')
    }

    const resource = await this.apigateway
      .createResource(
        {
          restApiId: this.restApiId,
          parentId: parent.id,
          pathPart: currentPath,
        },
        undefined
      )
      .promise()

    this.resources.push(resource)
    return resource
  }

  async getMethodOrCreate(resource: AWS.APIGateway.Resource, httpMethod: HttpMethod) {
    const find = await this.apigateway
      .getMethod(
        {
          restApiId: this.restApiId,
          resourceId: resource.id || '',
          httpMethod,
        },
        undefined
      )
      .promise()
      .catch(this.handleNotFoundError)

    if (find) {
      return find
    }

    if (!resource.id) {
      throw new Error('unknown resource.id')
    }
    return await this.apigateway
      .putMethod(
        {
          restApiId: this.restApiId,
          resourceId: resource.id,
          httpMethod,
          authorizationType: 'NONE',
        },
        undefined
      )
      .promise()
  }

  async getIntegrationOrCreate(resource: AWS.APIGateway.Resource, method: AWS.APIGateway.Method) {
    if (!resource.id || !method.httpMethod) {
      throw new Error('unknown resource.id or method.httpMethod')
    }

    await this.apigateway
      .deleteIntegration(
        {
          restApiId: this.restApiId,
          resourceId: resource.id,
          httpMethod: method.httpMethod,
        },
        undefined
      )
      .promise()
      .catch(this.handleNotFoundError)

    const func = await this.lambda.getFunction({ FunctionName: this.env.LambdaFunction }).promise()

    if (!func.Configuration) {
      throw new Error('unknown func.Configuration')
    }

    const uri = `arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/${func.Configuration.FunctionArn}/invocations`

    await this.apigateway
      .putIntegration({
        restApiId: this.restApiId,
        resourceId: resource.id,
        httpMethod: method.httpMethod,
        type: 'AWS_PROXY',
        integrationHttpMethod: 'POST',
        uri,
      })
      .promise()
  }

  async updateLambdaPermission(resource: AWS.APIGateway.Resource, method: AWS.APIGateway.Method) {
    const FunctionName = this.env.LambdaFunction
    const StatementId = [this.restApiId, resource.id, method.httpMethod].join('-')

    await this.lambda
      .removePermission({
        FunctionName,
        StatementId,
      })
      .promise()
      .catch(this.handleNotFoundError)

    const accountId = await this.getAccountId()
    const SourceArn = [
      `arn:aws:execute-api:${this.env.AwsRegion}:${accountId}:${this.restApiId}`,
      `/*/${method.httpMethod}${resource.path}`,
    ].join('')
    await this.lambda
      .addPermission({
        FunctionName,
        StatementId,
        Action: 'lambda:InvokeFunction',
        Principal: 'apigateway.amazonaws.com',
        SourceArn,
      })
      .promise()
  }

  async addRoute(httpMethod: HttpMethod, path: string) {
    const resource = await this.getResourceOrCreate(path)
    const method = await this.getMethodOrCreate(resource, httpMethod)
    await this.getIntegrationOrCreate(resource, method)
    await this.updateLambdaPermission(resource, method)
  }

  async deployStage() {
    if (this.deployments.length === 0) {
      const res = await this.apigateway
        .getDeployments({
          restApiId: this.restApiId,
          limit: 500,
        })
        .promise()
      this.deployments = Array.from(res.items || [])
    }

    if (this.deployments.length === 0) {
      const deployment = await this.apigateway
        .createDeployment({
          restApiId: this.restApiId,
          stageName: this.env.Stage,
        })
        .promise()

      this.deployments.push(deployment)
      return
    }

    this.apigateway.flushStageCache({
      restApiId: this.restApiId,
      stageName: this.env.Stage,
    })
  }
}

export type HttpMethod = 'ANY' | 'GET' | 'POST' | 'PUT' | 'DELETE'
