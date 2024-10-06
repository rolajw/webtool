export declare namespace OpenAPITypes {
  type DataType = 'object' | 'array' | 'string' | 'integer' | 'number' | 'boolean' | 'null'

  type SchemaModel = {
    properties?: Record<string, SchemaModel>
    $ref?: string
    items?: SchemaModel
    description?: string
    type?: DataType
    enum?: string[] | number[]
    anyOf: SchemaModel[]
    required?: string[]
    title?: string
    oneOf?: SchemaModel[]
    default?: any
  }

  interface ContentData {
    'application/json'?: {
      schema: SchemaModel
    }
  }
  interface ParameterModel {
    in: 'path' | 'query'
    name: string
    required?: boolean
    schema?: SchemaModel
    content?: ContentData
  }

  interface MethodContent {
    parameters: ParameterModel[]
    requestBody?: {
      content?: ContentData
    }
    responses: {
      200?: {
        content?: ContentData
      }
    }
  }

  interface SchemaPath {
    get?: MethodContent
    post?: MethodContent
    put?: MethodContent
    delete?: MethodContent
  }

  interface OpenAPIData {
    components: {
      schemas: Record<string, SchemaModel>
    }
    paths: Record<string, SchemaPath>
  }
}
