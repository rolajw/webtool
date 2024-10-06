var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import fs from "fs";
import axios from "axios";
class OutputFormatter {
  constructor() {
    __publicField(this, "dent", 0);
    __publicField(this, "content", []);
  }
  indent(callback) {
    this.dent += 1;
    callback();
    this.dent -= 1;
    return this;
  }
  tabs() {
    return "  ".repeat(this.dent);
  }
  push(codes) {
    const values = Array.isArray(codes) ? codes : [codes];
    const tabs = this.tabs();
    values.forEach((line) => {
      this.content.push(tabs + line);
    });
    return this;
  }
  toString() {
    return this.content.join("\n");
  }
}
class OpenAPI {
  constructor(data) {
    __publicField(this, "data");
    __publicField(this, "outModels", new OutputFormatter());
    __publicField(this, "outEnums", new OutputFormatter());
    __publicField(this, "outPaths", new OutputFormatter());
    __publicField(this, "enums", /* @__PURE__ */ new Set());
    this.data = data;
  }
  getContent(data) {
    var _a;
    return data ? (_a = data["application/json"]) == null ? void 0 : _a.schema : void 0;
  }
  genSchema() {
    this.outModels.push("export declare namespace SchemaComponents {").indent(() => {
      Object.entries(this.data.components.schemas).map(([name, model]) => {
        return { name, model, enum: model.enum ? 1 : 0 };
      }).sort((a, b) => b.enum - a.enum).forEach((o) => this.genModel(o.model, o.name));
    }).push("}");
    this.outPaths.push("export interface SchemaPaths {").indent(() => {
      Object.entries(this.data.paths).forEach(([path, methods]) => {
        this.outPaths.push(`'${path}': {`).indent(() => {
          Object.entries(methods).forEach(([method, mcontent]) => {
            this.outPaths.push(`${method}: {`).indent(() => this.genPathMethod(method, mcontent)).push("}");
          });
        }).push("}");
      });
    }).push("}");
    return [this.outPaths.toString(), this.outModels.toString(), this.outEnums.toString()].join("\n");
  }
  genPathMethod(method, content) {
    var _a, _b;
    const out = this.outPaths;
    const query = {};
    const path = {};
    const header = {};
    if (content.parameters) {
      content.parameters.forEach((param) => {
        if (!param.name) {
          console.info(content);
          throw new Error(`Error param.name is empty`);
        }
        const pdata = param.schema ?? this.getContent(param.content);
        const dataType = pdata ? this.genModel(pdata) : "any";
        if (param.in === "path") {
          path[param.name] = dataType === "string" ? "string | number" : dataType;
        } else if (param.in === "query") {
          query[param.name] = dataType;
        } else if (param.in === "header") {
          header[param.name] = dataType;
        } else {
          console.error("Error : ", param);
          throw new Error("unknown param.in = ", param.in);
        }
      });
    }
    if (Object.keys(path).length) {
      out.push("path: {").indent(() => Object.entries(path).forEach(([k, v]) => out.push(`${k}: ${v}`))).push("}");
    } else {
      out.push("path: undefined");
    }
    if (Object.keys(header).length) {
      out.push("headers: {").indent(() => {
        Object.entries(header).forEach(([k, v]) => out.push(`${k}: ${v}`));
      }).push("}");
    }
    if (method.toUpperCase() === "GET") {
      const queryBody = query == null ? void 0 : query.body;
      if (Object.keys(query).length) {
        out.push(`body: ${queryBody}`);
      } else {
        out.push("body: undefined");
      }
    } else {
      const reqData = this.getContent((_a = content.requestBody) == null ? void 0 : _a.content);
      console.info(" >> ", content, reqData);
      if (reqData) {
        const dataTypes = this.genModel(reqData);
        out.push(`body: ${dataTypes}`);
      } else {
        out.push(`body: undefined`);
      }
    }
    const response = content.responses ?? { 200: {} };
    const resData = this.getContent((_b = response[200]) == null ? void 0 : _b.content);
    if (resData) {
      const dataTypes = this.genModel(resData);
      out.push(`response: ${dataTypes}`);
    } else {
      out.push(`response: undefined`);
    }
  }
  genModel(model, name) {
    if (model.enum) {
      return this.genEnums(model, name);
    }
    if (model.anyOf) {
      return model.anyOf.map((item) => this.genModel(item)).join(" | ");
    }
    if (model.$ref) {
      const mname = model.$ref.replace("#/components/schemas/", "");
      return this.enums.has(mname) ? mname : `SchemaComponents.${mname}`;
    }
    if (model.type === "object") {
      return this.genModelObject(model, name);
    }
    if (model.type === "array") {
      return this.genModelArray(model, name);
    }
    if (!model.type) {
      return "any";
    }
    switch (model.type) {
      case "number":
      case "integer":
        return "number";
      case "string":
        return "string";
      case "boolean":
        return "boolean";
      case "null":
        return "null";
      default:
        return "unknown";
    }
  }
  genModelObject(data, name) {
    const out = this.outModels;
    const { properties, required = [] } = data;
    let objectTypes = ["Record<string, any>"];
    if (properties) {
      objectTypes = Object.entries(properties).map(([key, value]) => {
        const dtype = this.genModel(value);
        return required.includes(key) ? `${key}: ${dtype}` : `${key}?: ${dtype}`;
      });
    }
    if (!name) {
      return properties ? ["{", objectTypes, "}"].join("\n") : objectTypes.join("");
    }
    if (!properties) {
      out.push(`type ${name} = Record<string, any>`);
    } else {
      out.push(`interface ${name} {`).indent(() => objectTypes.forEach((line) => out.push(line))).push("}");
    }
    return `SchemaComponents.${name}`;
  }
  genModelArray(data, name) {
    const out = this.outModels;
    const { items } = data;
    let objectType = "any[]";
    if (items) {
      objectType = this.genModel(items) + "[]";
    }
    if (!name) {
      return objectType;
    }
    out.push(`type ${name} = ${objectType}`);
    return `SchemaComponents.${name}`;
  }
  genEnums(model, name) {
    const { description } = model;
    let enumName = name || model.title;
    if (!enumName) {
      console.error("errer enum: ", model);
      throw new Error(`Enum.title is required`);
    }
    let enumData = null;
    if (description) {
      try {
        enumData = JSON.parse(description);
      } catch (err) {
        console.error("parse json error: ", model);
      }
    }
    if (enumData) {
      const out = this.outEnums;
      out.push(`export enum ${name} {`).indent(() => {
        Object.entries(enumData).forEach(([key, value]) => {
          const dtype = typeof value === "number" ? value : `'${value}'`;
          out.push(`${key} = ${dtype},`);
        });
      }).push("}");
    } else if (model.enum) {
      const out = this.outEnums;
      const enumValues = model.enum.map((value) => {
        if (typeof value === "number") {
          return `${value}`;
        }
        const vstr = value.toString();
        if (!vstr.includes("'")) {
          return `'${vstr}'`;
        } else if (!vstr.includes('"')) {
          return `"${vstr}"`;
        } else if (!vstr.includes("`")) {
          return `\`${vstr}\``;
        } else {
          throw new Error(`Invalid enum value: ${value}`);
        }
      }).join(" | ");
      out.push(`export type ${enumName} = ${enumValues}`);
    } else {
      throw new Error(`Enum(${enumName}) value is invalid`);
    }
    this.enums.add(enumName);
    return enumName;
  }
}
const url = getArgument("-u") ?? getArgument("--url");
const inpath = getArgument("-f") ?? getArgument("--file");
const outpath = getArgument("-o") ?? getArgument("--output") ?? "schema.json";
let promise = Promise.resolve(null);
if (inpath) {
  promise = fs.promises.readFile(inpath, { encoding: "utf-8" }).then((value) => JSON.parse(value.toString()));
}
if (url) {
  promise = axios.get(url).then((r) => r.data);
}
promise.then((data) => {
  const code = new OpenAPI(data).genSchema();
  fs.writeFileSync(outpath, code);
});
function getArgument(key) {
  const valueIndex = process.argv.indexOf(key) + 1;
  return valueIndex > 0 && process.argv[valueIndex] ? process.argv[valueIndex] : void 0;
}
