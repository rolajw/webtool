import { OpenAPITypes } from './openapi-types'
import { OutputFormatter } from './output-formatter'

export class OpenAPI {
  protected data: OpenAPITypes.OpenAPIData
  protected outModels = new OutputFormatter()
  protected outEnums = new OutputFormatter()
  protected outPaths = new OutputFormatter()
  protected enums = new Set<string>()

  constructor(data: OpenAPITypes.OpenAPIData) {
    this.data = data
  }

  protected getContent(data?: OpenAPITypes.ContentData) {
    return data ? data['application/json']?.schema : undefined
  }

  public genSchema() {
    this.outModels
      .push('export declare namespace SchemaComponents {')
      .indent(() => {
        Object.entries(this.data.components.schemas)
          .map(([name, model]) => {
            return { name, model, enum: model.enum ? 1 : 0 }
          })
          .sort((a, b) => b.enum - a.enum)
          .forEach((o) => this.genModel(o.model, o.name))
      })
      .push('}')

    this.outPaths
      .push('export interface SchemaPaths {')
      .indent(() => {
        Object.entries(this.data.paths).forEach(([path, methods]) => {
          this.outPaths
            .push(`'${path}': {`)
            .indent(() => {
              Object.entries(methods).forEach(([method, mcontent]) => {
                this.outPaths
                  .push(`${method}: {`)
                  .indent(() => this.genPathMethod(method, mcontent))
                  .push('}')
              })
            })
            .push('}')
        })
      })
      .push('}')
    return [this.outPaths.toString(), this.outModels.toString(), this.outEnums.toString()].join('\n')
  }

  public genPathMethod(method: string, content: OpenAPITypes.MethodContent) {
    const out = this.outPaths

    const query: Record<string, string> = {}
    const path: Record<string, string> = {}
    const header: Record<string, string> = {}
    if (content.parameters) {
      content.parameters.forEach((param) => {
        if (!param.name) {
          console.info(content)
          throw new Error(`Error param.name is empty`)
        }

        const pdata = param.schema ?? this.getContent(param.content)
        const dataType = pdata ? this.genModel(pdata) : 'any'

        if (param.in === 'path') {
          path[param.name] = dataType === 'string' ? 'string | number' : dataType
        } else if (param.in === 'query') {
          query[param.name] = dataType
        } else if (param.in === 'header') {
          header[param.name] = dataType
        } else {
          console.error('Error : ', param)
          throw new Error('unknown param.in = ', param.in)
        }
      })
    }

    if (Object.keys(path).length) {
      out
        .push('path: {')
        .indent(() => Object.entries(path).forEach(([k, v]) => out.push(`${k}: ${v}`)))
        .push('}')
    } else {
      out.push('path: undefined')
    }

    if (Object.keys(header).length) {
      out
        .push('headers: {')
        .indent(() => {
          Object.entries(header).forEach(([k, v]) => out.push(`${k}: ${v}`))
        })
        .push('}')
    }

    if (method.toUpperCase() === 'GET') {
      const queryBody = query?.body
      if (Object.keys(query).length) {
        out.push(`body: ${queryBody}`)
      } else {
        out.push('body: undefined')
      }
    } else {
      const reqData = this.getContent(content.requestBody?.content)
      console.info(' >> ', content, reqData)
      if (reqData) {
        const dataTypes = this.genModel(reqData)
        out.push(`body: ${dataTypes}`)
      } else {
        out.push(`body: undefined`)
      }
    }

    const response = content.responses ?? { 200: {} }
    const resData = this.getContent(response[200]?.content)
    if (resData) {
      const dataTypes = this.genModel(resData)
      out.push(`response: ${dataTypes}`)
    } else {
      out.push(`response: undefined`)
    }
  }

  genModel(model: OpenAPITypes.SchemaModel, name?: string): string {
    if (model.enum) {
      return this.genEnums(model, name)
    }

    if (model.anyOf) {
      return model.anyOf.map((item) => this.genModel(item)).join(' | ')
    }

    if (model.$ref) {
      const mname = model.$ref.replace('#/components/schemas/', '')
      return this.enums.has(mname) ? mname : `SchemaComponents.${mname}`
    }

    if (model.type === 'object') {
      return this.genModelObject(model, name)
    }

    if (model.type === 'array') {
      return this.genModelArray(model, name)
    }

    if (!model.type) {
      return 'any'
    }
    switch (model.type) {
      case 'number':
      case 'integer':
        return 'number'
      case 'string':
        return 'string'
      case 'boolean':
        return 'boolean'
      case 'null':
        return 'null'
      default:
        return 'unknown'
    }
  }

  public genModelObject(data: OpenAPITypes.SchemaModel, name?: string) {
    const out = this.outModels
    const { properties, required = [] } = data

    let objectTypes = ['Record<string, any>']
    if (properties) {
      objectTypes = Object.entries(properties).map(([key, value]) => {
        const dtype = this.genModel(value)
        // const hasDefault = value.default !== null && value.default !== undefined
        return required.includes(key) ? `${key}: ${dtype}` : `${key}?: ${dtype}`
      })
    }

    if (!name) {
      return properties ? ['{', objectTypes, '}'].join('\n') : objectTypes.join('')
    }

    if (!properties) {
      out.push(`type ${name} = Record<string, any>`)
    } else {
      out
        .push(`interface ${name} {`)
        .indent(() => objectTypes.forEach((line) => out.push(line)))
        .push('}')
    }
    return `SchemaComponents.${name}`
  }

  public genModelArray(data: OpenAPITypes.SchemaModel, name?: string) {
    const out = this.outModels
    const { items } = data

    let objectType = 'any[]'
    if (items) {
      objectType = this.genModel(items) + '[]'
    }

    if (!name) {
      return objectType
    }

    out.push(`type ${name} = ${objectType}`)
    return `SchemaComponents.${name}`
  }

  public genEnums(model: OpenAPITypes.SchemaModel, name?: string) {
    const { description } = model

    let enumName = name || model.title

    if (!enumName) {
      console.error('errer enum: ', model)
      throw new Error(`Enum.title is required`)
    }

    let enumData: Record<string, any> | null = null
    if (description) {
      try {
        enumData = JSON.parse(description)
      } catch (err) {
        console.error('parse json error: ', model)
      }
    }

    if (!enumName && Array.isArray(model.enum)) {
      return model.enum.map((value) => (typeof value === 'string' ? `"${value}"` : value)).join(' | ')
    }

    if (enumData) {
      const out = this.outEnums
      out
        .push(`export enum ${name} {`)
        .indent(() => {
          Object.entries(enumData).forEach(([key, value]) => {
            const dtype = typeof value === 'number' ? value : `'${value}'`
            out.push(`${key} = ${dtype},`)
          })
        })
        .push('}')
    } else if (model.enum) {
      const out = this.outEnums
      const enumValues = model.enum
        .map((value) => {
          if (typeof value === 'number') {
            return `${value}`
          }
          const vstr = value.toString()
          if (!vstr.includes("'")) {
            return `'${vstr}'`
          } else if (!vstr.includes('"')) {
            return `"${vstr}"`
          } else if (!vstr.includes('`')) {
            return `\`${vstr}\``
          } else {
            throw new Error(`Invalid enum value: ${value}`)
          }
        })
        .join(' | ')
      out.push(`export type ${enumName} = ${enumValues}`)
    } else {
      throw new Error(`Enum(${enumName}) value is invalid`)
    }

    this.enums.add(enumName)
    return enumName
  }
}
