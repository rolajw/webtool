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

  public genCode() {
    this.outModels
      .push('export declare namespace SchemaComponents {')
      .pushIndentCodes(() => {
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
      .pushIndentCodes(() => {
        Object.entries(this.data.paths).forEach(([path, methods]) => {
          this.outPaths
            .push(`'${path}': {`)
            .pushIndentCodes(() => {
              Object.entries(methods).forEach(([method, mcontent]) => {
                this.outPaths
                  .push(`${method}: {`)
                  .pushIndentCodes(() => this.genPathMethod(mcontent))
                  .push('}')
              })
            })
            .push('}')
        })
      })
      .push('}')
    return [this.outPaths.toString(), this.outModels.toString(), this.outEnums.toString()].join('\n')
  }

  public genPathMethod(method: OpenAPITypes.MethodContent) {
    const out = this.outPaths

    const query: Record<string, string> = {}
    const path: Record<string, string> = {}
    if (method.parameters) {
      method.parameters.forEach((param) => {
        if (!param.name) {
          console.info(method)
          throw new Error(`Error param.name is empty`)
        }

        const pdata = param.schema ?? this.getContent(param.content)
        const dataType = pdata ? this.genModel(pdata) : 'any'

        if (param.in === 'path') {
          path[param.name] = dataType === 'string' ? 'string | number' : dataType
        } else if (param.in === 'query') {
          query[param.name] = dataType
        } else {
          console.error('Error : ', param)
          throw new Error('unknown param.in = ', param.in)
        }
      })
    }

    out
      .push('parameters: {')
      .pushIndentCodes(() => {
        if (Object.keys(query).length) {
          out
            .push('query: {')
            .pushIndentCodes(() => {
              Object.entries(query).forEach(([k, v]) => out.push(`${k}: ${v}`))
            })
            .push('}')
        } else {
          out.push('query: undefined')
        }

        if (Object.keys(path).length) {
          out
            .push('path: {')
            .pushIndentCodes(() => {
              Object.entries(path).forEach(([k, v]) => out.push(`${k}: ${v}`))
            })
            .push('}')
        } else {
          out.push('path: undefined')
        }
      })
      .push('}')

    const reqData = this.getContent(method.requestBody?.content)
    if (reqData) {
      const dataTypes = this.genModel(reqData)
      out.push(`body: ${dataTypes}`)
    } else {
      out.push(`body: undefined`)
    }

    const response = method.responses ?? { 200: {} }
    const resData = this.getContent(response[200]?.content)
    if (resData) {
      const dataTypes = this.genModel(resData)
      out.push(`response: ${dataTypes}`)
    } else {
      out.push(`response: undefined`)
    }
  }

  genModel(model: OpenAPITypes.SchemaModel, name?: string) {
    const { properties = undefined, required = undefined } = model

    if (model.enum) {
      return this.genEnums(model, name)
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
        const hasDefault = value.default !== null && value.default !== undefined
        return required.includes(key) || hasDefault ? `${key}: ${dtype}` : `${key}?: ${dtype} | null`
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
        .pushIndentCodes(() => objectTypes.forEach((line) => out.push(line)))
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
    let data: Record<string, any> = {}

    const enumName = name || model.title
    if (!enumName) {
      console.error('errer enum: ', model)
      throw new Error(`Enum.title is required`)
    }

    if (description) {
      try {
        data = JSON.parse(description)
      } catch (err) {
        console.error('parse json error: ', model)
        throw err
      }
      const out = this.outEnums
      this.enums.add(enumName)
      out
        .push(`export enum ${enumName} {`)
        .pushIndentCodes(() => {
          Object.entries(data).forEach(([key, value]) => {
            const dtype = typeof value === 'number' ? value : `'${value}'`
            out.push(`${key} = ${dtype},`)
          })
        })
        .push('}')
    } else if (model.enum) {
      this.enums.add(enumName)
      const out = this.outEnums
      const values = model.enum
        .map((v) => {
          if (typeof v === 'number') {
            return v
          }
          const vstr = v.toString()
          if (!vstr.includes("'")) {
            return `'${v}'`
          } else if (!vstr.includes('"')) {
            return `"${v}"`
          } else if (!vstr.includes('`')) {
            return `\`${v}\``
          } else {
            throw new Error(`Enum(${enumName}) value(${v}) is invalid`)
          }
        })
        .join(' | ')
      out.push(`export type ${enumName} = ${values}`)
    } else {
      console.error(`Enum(${enumName}) is empty: `, model)
      throw new Error(`Enum(${enumName}).enum or description is required`)
    }
    return enumName
  }
}
