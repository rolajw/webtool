(function(global, factory) {
  typeof exports === "object" && typeof module !== "undefined" ? factory(exports, require("aws-sdk"), require("fs"), require("path"), require("child_process"), require("crypto"), require("process")) : typeof define === "function" && define.amd ? define(["exports", "aws-sdk", "fs", "path", "child_process", "crypto", "process"], factory) : (global = typeof globalThis !== "undefined" ? globalThis : global || self, factory(global.Deployment = {}, global.AWS, global.fs, global.path, global.cp, global.crypto, global.process$1));
})(this, function(exports2, AWS, fs, path, cp, crypto, process$1) {
  "use strict";var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  class APIGatewayService {
    constructor(env2, api) {
      /**
       *
       * @param {typeof DeployEnv} env
       */
      /**
       *
       * @param {typeof DeployEnv} env
       * @param {AWS.APIGateway.RestApi} api
       */
      __publicField(this, "api");
      __publicField(this, "env");
      __publicField(this, "lambda");
      __publicField(this, "apigateway");
      __publicField(this, "resources", []);
      __publicField(this, "accountId", null);
      __publicField(this, "deployments", []);
      this.api = api;
      this.env = env2;
      this.lambda = new AWS.Lambda(env2.AwsConfiguration);
      this.apigateway = new AWS.APIGateway(env2.AwsConfiguration);
    }
    get restApiId() {
      if (!this.api.id) {
        throw new Error("restApiId is empty");
      }
      return this.api.id;
    }
    async getAccountId() {
      if (!this.accountId) {
        const sts = new AWS.STS(this.env.AwsConfiguration);
        const res = await sts.getCallerIdentity().promise();
        this.accountId = res.Account || null;
      }
      return this.accountId;
    }
    async getRestAPIOrCreate(id) {
      const find = id ? this.apigateway.getRestApi({ restApiId: id }).promise().catch(this.handleNotFoundError) : null;
      if (!find) {
        this.api = await this.apigateway.createRestApi({
          name: this.env.LambdaFunction
        }).promise();
      }
      return this.api;
    }
    handleNotFoundError(err) {
      return ["ResourceNotFoundException", "NotFoundException"].includes(err.name) ? null : Promise.reject(err);
    }
    async getResourceOrCreate(path2) {
      if (this.resources.length === 0) {
        const res = await this.apigateway.getResources({
          restApiId: this.restApiId,
          limit: 500
        }).promise();
        this.resources = Array.from(res.items || []);
      }
      const find = this.resources.find((r) => r.path === path2);
      if (find) {
        return find;
      }
      const paths = path2.split("/");
      const currentPath = paths.pop();
      const parentPath = paths.join("/") || "/";
      const parent = await this.getResourceOrCreate(parentPath);
      if (!parent.id || !currentPath) {
        throw new Error("unknown partent.id or currentPath");
      }
      const resource = await this.apigateway.createResource(
        {
          restApiId: this.restApiId,
          parentId: parent.id,
          pathPart: currentPath
        },
        void 0
      ).promise();
      this.resources.push(resource);
      return resource;
    }
    async getMethodOrCreate(resource, httpMethod) {
      const find = await this.apigateway.getMethod(
        {
          restApiId: this.restApiId,
          resourceId: resource.id || "",
          httpMethod
        },
        void 0
      ).promise().catch(this.handleNotFoundError);
      if (find) {
        return find;
      }
      if (!resource.id) {
        throw new Error("unknown resource.id");
      }
      return await this.apigateway.putMethod(
        {
          restApiId: this.restApiId,
          resourceId: resource.id,
          httpMethod,
          authorizationType: "NONE"
        },
        void 0
      ).promise();
    }
    async getIntegrationOrCreate(resource, method) {
      if (!resource.id || !method.httpMethod) {
        throw new Error("unknown resource.id or method.httpMethod");
      }
      await this.apigateway.deleteIntegration(
        {
          restApiId: this.restApiId,
          resourceId: resource.id,
          httpMethod: method.httpMethod
        },
        void 0
      ).promise().catch(this.handleNotFoundError);
      const func = await this.lambda.getFunction({ FunctionName: this.env.LambdaFunction }).promise();
      if (!func.Configuration) {
        throw new Error("unknown func.Configuration");
      }
      const uri = `arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/${func.Configuration.FunctionArn}/invocations`;
      await this.apigateway.putIntegration({
        restApiId: this.restApiId,
        resourceId: resource.id,
        httpMethod: method.httpMethod,
        type: "AWS_PROXY",
        integrationHttpMethod: "POST",
        uri
      }).promise();
    }
    async updateLambdaPermission(resource, method) {
      const FunctionName = this.env.LambdaFunction;
      const StatementId = [this.restApiId, resource.id, method.httpMethod].join("-");
      await this.lambda.removePermission({
        FunctionName,
        StatementId
      }).promise().catch(this.handleNotFoundError);
      const accountId = await this.getAccountId();
      const SourceArn = [
        `arn:aws:execute-api:${this.env.AwsRegion}:${accountId}:${this.restApiId}`,
        `/*/${method.httpMethod}${resource.path}`
      ].join("");
      await this.lambda.addPermission({
        FunctionName,
        StatementId,
        Action: "lambda:InvokeFunction",
        Principal: "apigateway.amazonaws.com",
        SourceArn
      }).promise();
    }
    async addRoute(httpMethod, path2) {
      const resource = await this.getResourceOrCreate(path2);
      const method = await this.getMethodOrCreate(resource, httpMethod);
      await this.getIntegrationOrCreate(resource, method);
      await this.updateLambdaPermission(resource, method);
    }
    async deployStage() {
      if (this.deployments.length === 0) {
        const res = await this.apigateway.getDeployments({
          restApiId: this.restApiId,
          limit: 500
        }).promise();
        this.deployments = Array.from(res.items || []);
      }
      if (this.deployments.length === 0) {
        const deployment2 = await this.apigateway.createDeployment({
          restApiId: this.restApiId,
          stageName: this.env.Stage
        }).promise();
        this.deployments.push(deployment2);
        return;
      }
      this.apigateway.flushStageCache({
        restApiId: this.restApiId,
        stageName: this.env.Stage
      });
    }
  }
  const env = {
    Version: "0.0.0",
    AwsID: "",
    AwsKey: "",
    AwsRegion: "",
    AwsS3: "",
    CloudFrontFunction: "",
    Stage: "",
    LambdaFunction: "",
    DistributionId: "",
    LambdaLayer: "",
    WebRoot: "",
    PackageContent: { version: "0.0.0", dependencies: {} },
    AwsConfiguration: {
      region: "",
      credentials: null
    }
  };
  const updateDeployEnv = (packageContent, data) => {
    env.Version = packageContent.version ?? "0.0.0";
    env.DistributionId = (data == null ? void 0 : data.distributionid) ?? env.DistributionId;
    env.AwsID = (data == null ? void 0 : data.awsid) ?? env.AwsID;
    env.AwsKey = (data == null ? void 0 : data.awskey) ?? env.AwsKey;
    env.AwsRegion = (data == null ? void 0 : data.awsregion) ?? env.AwsRegion;
    env.AwsS3 = (data == null ? void 0 : data.s3bucket) ?? env.AwsS3;
    env.CloudFrontFunction = (data == null ? void 0 : data.cloudfrontfunction) ?? env.CloudFrontFunction;
    env.Stage = (data == null ? void 0 : data.stage) ?? env.Stage;
    env.LambdaFunction = (data == null ? void 0 : data.lambdafunction) ?? env.LambdaFunction;
    env.LambdaLayer = (data == null ? void 0 : data.lambdalayer) ?? env.LambdaLayer;
    env.WebRoot = (data == null ? void 0 : data.webroot) ?? env.WebRoot;
    env.PackageContent = packageContent;
    if (env.AwsID || env.AwsKey) {
      env.AwsConfiguration = {
        region: env.AwsRegion,
        credentials: {
          accessKeyId: env.AwsID,
          secretAccessKey: env.AwsKey
        }
      };
    } else {
      const myconfig = new AWS.Config();
      myconfig.update({ region: env.AwsRegion });
      env.AwsConfiguration.region = env.AwsRegion;
      env.AwsConfiguration.credentials = myconfig.credentials || void 0;
    }
  };
  const deployenv = () => {
    if (!env.AwsRegion) {
      throw new Error(`REGION is required`);
    }
    if (!env.AwsS3) {
      throw new Error(`S3 is required`);
    }
    if (!env.CloudFrontFunction) {
      throw new Error(`FUNC is required`);
    }
    if (!env.Stage) {
      throw new Error(`STAGE is required`);
    }
    return env;
  };
  const cwd = process.cwd();
  const tools = {
    root(...p) {
      return path.resolve(cwd, ...p);
    },
    stat(filepath) {
      try {
        return fs.statSync(filepath);
      } catch (err) {
        return null;
      }
    },
    isDir(filepath) {
      const stat = this.stat(filepath);
      return stat ? stat.isDirectory() : false;
    },
    remove(filepath) {
      const stat = this.stat(filepath);
      if (stat) {
        fs.rmSync(filepath, { force: true, recursive: true });
      }
    },
    sha1(data) {
      const sha1Hash = crypto.createHash("sha1");
      sha1Hash.update(data);
      return sha1Hash.digest("hex");
    },
    spawn(cmd) {
      console.info(`exec: ${cmd}`);
      return new Promise((resolve, reject) => {
        cp.spawn(cmd, { shell: true, stdio: "ignore" }).on("message", (msg) => console.info(`    > msg`)).on("error", (err) => reject(err)).on("close", (code) => resolve());
      }).then(() => {
        console.info(`  -> Completed.`);
      }).catch((err) => {
        console.error(`  -> ERROR: ${err.message}`);
        console.error(err);
        return Promise.reject(err);
      });
    },
    argv(key) {
      const str = process.argv.find((arg) => arg.includes(key + "="));
      if (str) {
        const [, value] = str.split("=");
        return value;
      }
      return null;
    },
    opt(key) {
      return process.argv.includes(key);
    },
    /**
     *
     * @param {string} folderPath
     * @param {string | Tools.ScanFilesOptions | undefined} options
     */
    scanFiles(folderPath, options) {
      let results = [];
      const opt = typeof options === "string" ? { root: options } : options ?? {};
      const optRoot = opt.root || "";
      const optHandlers = opt.handler ?? ((v) => v);
      return fs.promises.readdir(path.resolve(folderPath)).then((files) => {
        const promises = files.map((filename) => {
          const filepath = path.resolve(folderPath, filename);
          const fileStat = this.stat(filepath);
          if (fileStat && fileStat.isDirectory()) {
            return this.scanFiles(filepath, { ...opt, root: path.join(optRoot, filename) }).then((res) => {
              results = results.concat(res);
            });
          }
          const ritem = optHandlers(this.scanFile(filepath, { ...opt, root: optRoot }));
          if (ritem) {
            results.push(ritem);
          }
          return Promise.resolve();
        });
        return Promise.all(promises).then(null, Promise.reject);
      }).then(() => results);
    },
    scanFile(filepath, options) {
      const opt = typeof options === "string" ? { root: options } : options ?? {};
      const optRoot = opt.root || "";
      const fileStat = this.stat(filepath);
      if (!fileStat || !fileStat.isFile()) {
        throw new Error(`${filepath} is not file`);
      }
      const filename = opt.filename || path.basename(filepath);
      return {
        filepath,
        uploadpath: path.join(optRoot, filename),
        size: fileStat.size,
        contentType: this.fileContentType(filename)
      };
    },
    fileContentType(filename) {
      const ext = filename.split(".").pop() || "";
      return {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        svg: "image/svg+xml",
        png: "image/x-png",
        html: "text/html; charset=UTF-8",
        js: "text/javascript",
        mjs: "text/javascript",
        cjs: "text/javascript",
        css: "text/css",
        pdf: "application/pdf",
        json: "application/json",
        icon: "image/vnd.microsoft.icon",
        ttf: "font/ttf"
      }[ext] || "application/octet-stream";
    },
    loadJSON(filepath) {
      const buffer = fs.readFileSync(filepath, "utf8");
      return JSON.parse(buffer);
    },
    loadDeployment(stage) {
      const pathDeployment = this.root(`.deployment/${stage}.json`);
      if (this.stat(pathDeployment)) {
        return this.loadJSON(pathDeployment);
      }
      return null;
    },
    saveDeployment(stage, content) {
      const dirDeployment = this.root(".deployment");
      const pathDeployment = this.root(`.deployment/${stage}.json`);
      if (!this.stat(dirDeployment)) {
        fs.mkdirSync(dirDeployment);
      }
      fs.writeFileSync(pathDeployment, JSON.stringify(content, null, 4));
    }
  };
  const deployAPIGateway = async function() {
    const env2 = deployenv();
    const apigateway = new AWS.APIGateway(env2.AwsConfiguration);
    const deployment2 = tools.loadDeployment(env2.Stage) ?? {
      ApiGateway: { id: "" }
    };
    let api = deployment2.ApiGateway.id ? await apigateway.getRestApi({ restApiId: deployment2.ApiGateway.id }).promise().catch((err) => err.name === "NotFoundException" ? null : Promise.reject(err)) : null;
    if (!api) {
      api = await apigateway.createRestApi({ name: env2.LambdaFunction }).promise();
    }
    if (!api.id) {
      throw new Error("unknown api.id");
    }
    const apiservice = new APIGatewayService(env2, api);
    deployment2.ApiGateway.id = api.id;
    tools.saveDeployment(env2.Stage, deployment2);
    await apiservice.addRoute("ANY", "/");
    await apiservice.addRoute("ANY", "/{proxy+}");
    await apiservice.deployStage();
  };
  class Task {
    constructor() {
      __publicField(this, "tasks", []);
      __publicField(this, "onComplete", (v) => {
      });
      __publicField(this, "onError", (e) => {
      });
    }
    add(cb) {
      this.tasks.push(cb);
    }
    start(runCount = 5) {
      const tasks = this.tasks.slice();
      const onComplete = this.onComplete || ((v) => null);
      const onError = this.onError || ((err) => Promise.reject(err));
      const promises = [];
      return new Promise((resolve) => {
        const runNext = () => {
          const next = tasks.shift();
          if (!next) {
            return resolve();
          }
          const promise = Promise.resolve(next()).then(onComplete).catch(onError);
          promises.push(promise);
          promise.then(() => process$1.nextTick(runNext));
        };
        for (let i = 0; i < runCount; i++) {
          runNext();
        }
      }).then(() => Promise.all(promises));
    }
  }
  const cloudfrontFunction = "function handler(event) {\r\n  // replace stage variables\r\n  var webpath = 'REPLACE_PATH_VALUE'\r\n\r\n  // replace index file\r\n  var indexFile = 'REPLACE_INDEX_FILE'\r\n\r\n  /** @type {{[path: string]: string}} */\r\n  var rewriters = 'REPLACE_REWRITERS'\r\n\r\n  var request = event.request\r\n\r\n  var headers = request.headers\r\n\r\n  var encoding = headers['accept-encoding'] ? headers['accept-encoding'].value + ',' : ''\r\n  headers['accept-encoding'] = {\r\n    value: encoding + 'br,gzip',\r\n  }\r\n\r\n  /** @type {string} */\r\n  var uri = request.uri\r\n  if (rewriters && rewriters[uri]) {\r\n    uri = rewriters[uri]\r\n  } else if (uri.endsWith('/') || uri.endsWith('index.html') || !uri.includes('.')) {\r\n    uri = '/' + indexFile\r\n  }\r\n\r\n  if (!uri.startsWith('/')) {\r\n    uri = '/' + uri\r\n  }\r\n\r\n  request.uri = '/' + webpath + uri\r\n\r\n  return request\r\n}\r\n";
  const filterTruthy = (value) => !!value;
  const deployCloudFront = async function(settings) {
    var _a, _b;
    const env2 = deployenv();
    const now = (/* @__PURE__ */ new Date()).getTime();
    const webpath = env2.WebRoot;
    const indexFile = `index.${now}.html`;
    const rewrites = settings.rewriters ? JSON.stringify(settings.rewriters) : "{}";
    const s3 = new AWS.S3(env2.AwsConfiguration);
    const cloudfront = new AWS.CloudFront(env2.AwsConfiguration);
    if (!env2.WebRoot.startsWith("website")) {
      throw new Error(`WebRoot must start with website.  Found: ${env2.WebRoot}`);
    }
    const task = new Task();
    task.onComplete = (file) => {
      console.info(`uploaded ${file.filepath}`);
      console.info(`  -> ${file.uploadpath}`);
    };
    const ignoreStrings = (_a = settings.ignoreFiles) == null ? void 0 : _a.map((f) => typeof f === "string" ? f : void 0).filter(filterTruthy);
    const ignoreRegExps = (_b = settings.ignoreFiles) == null ? void 0 : _b.map((f) => f instanceof RegExp ? f : void 0).filter(filterTruthy);
    const rootpath = tools.root(settings.dir);
    const files = await tools.scanFiles(tools.root(settings.dir), {
      root: webpath,
      handler: (item) => {
        if (item.filepath.endsWith(".DS_Store")) {
          return null;
        }
        const fpath = item.filepath.replace(rootpath, "");
        const isIgnore = (ignoreStrings == null ? void 0 : ignoreStrings.includes(fpath)) || (ignoreRegExps == null ? void 0 : ignoreRegExps.some((reg) => reg.test(fpath)));
        if (isIgnore) {
          return null;
        }
        if (item.filepath === path.resolve(settings.dir, "index.html")) {
          item.uploadpath = `${webpath}/${indexFile}`;
        }
        return item;
      }
    });
    const uploads = [];
    files.sort((a, b) => b.size - a.size).forEach((file) => {
      task.add(
        () => fs.promises.readFile(file.filepath).then(
          (buffer) => s3.upload({
            Bucket: env2.AwsS3,
            Key: file.uploadpath,
            Body: buffer,
            ACL: "private",
            ContentType: file.contentType
          }).promise().then(() => {
            uploads.push({
              key: file.uploadpath,
              sha1: tools.sha1(buffer)
            });
          })
        ).then(() => file)
      );
    });
    await task.start(10).then(() => console.info("upload files completed!"));
    const code = cloudfrontFunction.toString().replace("REPLACE_PATH_VALUE", webpath).replace("REPLACE_INDEX_FILE", indexFile).replace(`'REPLACE_REWRITERS'`, rewrites);
    await cloudfront.describeFunction({ Name: env2.CloudFrontFunction }).promise().then((func) => {
      return cloudfront.updateFunction({
        Name: env2.CloudFrontFunction,
        FunctionCode: code,
        IfMatch: func.ETag || "",
        FunctionConfig: {
          Comment: "",
          Runtime: "cloudfront-js-1.0"
        }
      }).promise();
    });
    await cloudfront.describeFunction({ Name: env2.CloudFrontFunction }).promise().then((func) => {
      return cloudfront.publishFunction({
        Name: env2.CloudFrontFunction,
        IfMatch: func.ETag || ""
      }).promise();
    });
    console.info("update change log");
    await clearFiles(settings, uploads);
    console.info("publish function completed!");
  };
  async function createCloudfrontInvalidations(paths, waiting = true) {
    const env2 = deployenv();
    const cloudfront = new AWS.CloudFront(env2.AwsConfiguration);
    if (!env2.DistributionId) {
      throw new Error("env.distributionid is required!!");
    }
    console.info("Create Invalidations > ", paths);
    await cloudfront.createInvalidation({
      DistributionId: env2.DistributionId,
      InvalidationBatch: {
        CallerReference: (/* @__PURE__ */ new Date()).getTime().toString(),
        Paths: {
          Quantity: paths.length,
          Items: paths
        }
      }
    }).promise().then((res) => {
      if (res.$response.error) {
        return Promise.reject(res.$response.error);
      }
      if (!res.$response.data) {
        return Promise.reject(new Error("create invalidations response empty"));
      }
      return res.$response.data;
    }).then((res) => {
      var _a;
      if (!waiting) {
        console.info("Ignore Waiting ... ");
        return null;
      }
      console.info("Wait for invalidation completing ...");
      return cloudfront.waitFor("invalidationCompleted", {
        DistributionId: env2.DistributionId,
        Id: ((_a = res.Invalidation) == null ? void 0 : _a.Id) ?? ""
      }).promise();
    }).then((res) => {
      if (res == null ? void 0 : res.$response.error) {
        return Promise.reject(res.$response.error);
      }
    });
  }
  async function clearFiles(settings, uploads) {
    var _a;
    const env2 = deployenv();
    const s3 = new AWS.S3(env2.AwsConfiguration);
    const now = (/* @__PURE__ */ new Date()).getTime();
    const prefixUploads = `${env2.WebRoot}/.uploads`;
    const uploadRecord = `${prefixUploads}/v${env2.Version}-${now}.json`;
    const res = await s3.listObjectsV2({
      Bucket: env2.AwsS3,
      Prefix: `${prefixUploads}/`
    }).promise();
    await s3.upload({
      Bucket: env2.AwsS3,
      Key: uploadRecord,
      Body: JSON.stringify(uploads),
      ACL: "public-read",
      ContentType: "application/json"
    }).promise();
    const files = /* @__PURE__ */ new Map();
    const records = (res.$response.data && res.$response.data.Contents || []).sort(
      (b, a) => (a.LastModified ? new Date(a.LastModified).getTime() : 0) - (b.LastModified ? new Date(b.LastModified).getTime() : 0)
    );
    const deleteRecords = records.splice(settings.reverses ?? 1).map((r) => ({ Key: r.Key }));
    if (deleteRecords.length > 0) {
      await s3.deleteObjects({
        Bucket: env2.AwsS3,
        Delete: {
          Objects: deleteRecords
        }
      }).promise();
    }
    for (const ritem of records) {
      if (!ritem.Key) {
        continue;
      }
      const res2 = await s3.getObject({
        Bucket: env2.AwsS3,
        Key: ritem.Key
      }).promise();
      JSON.parse(((_a = res2.Body) == null ? void 0 : _a.toString()) ?? "[]").forEach((item) => {
        if (!files.has(item.key)) {
          files.set(item.key, {
            key: item.key,
            sha1: item.sha1,
            hasUpdated: false
          });
        }
      });
    }
    uploads.forEach((item) => {
      const fitem = files.get(item.key) ?? {
        key: item.key,
        sha1: item.sha1,
        hasUpdated: false
      };
      if (fitem.sha1 !== item.sha1) {
        fitem.hasUpdated = true;
      }
      files.set(fitem.key, fitem);
    });
    console.info("Clear Files");
    let startAfterKey = void 0;
    const deleteFiles = [];
    while (true) {
      const res2 = await s3.listObjectsV2({
        Bucket: env2.AwsS3,
        Prefix: env2.WebRoot + (env2.WebRoot.endsWith("/") ? "" : "/"),
        StartAfter: startAfterKey
      }).promise();
      const contents = res2.$response.data && res2.$response.data.Contents || [];
      contents.forEach((o) => {
        if (!o.Key || o.Key.startsWith(`${prefixUploads}`) || files.has(o.Key)) {
          return;
        }
        deleteFiles.push({ Key: o.Key });
      });
      if (contents.length < 1e3) {
        break;
      }
      startAfterKey = contents[contents.length - 1].Key;
    }
    let deletes = deleteFiles.slice();
    console.info("delete files > ", deletes);
    while (deletes.length > 0) {
      await s3.deleteObjects({
        Bucket: env2.AwsS3,
        Delete: {
          Objects: deletes.splice(0, 1e3)
        }
      }).promise();
    }
    const needUpdateds = Array.from(files.values()).filter((f) => f.hasUpdated).map((o) => `/${o.key}`);
    if (needUpdateds.length) {
      await createCloudfrontInvalidations(needUpdateds, settings.waitForInvalidations);
    }
  }
  const deployLambda = async function(settings) {
    const env2 = deployenv();
    const pathCache = tools.root(settings.cachePath);
    const ROOT = tools.root();
    const pathBundleFile = path.resolve(pathCache, "bundle.zip");
    const pathENV = path.resolve(pathCache, ".env");
    const lambda = new AWS.Lambda(env2.AwsConfiguration);
    tools.remove(pathBundleFile);
    tools.remove(pathENV);
    await fs.promises.readFile(`.env.${env2.Stage}`).then((buffer) => fs.promises.writeFile(pathENV, buffer));
    const files = settings.files.map((fpath) => {
      return tools.isDir(fpath) ? `-r9 ${fpath}` : fpath;
    }).join(" ");
    const ignores = (settings.ignoreFiles || []).map((s) => `"${s}"`);
    const ignoreOption = ignores.length > 0 ? "-x " + ignores.join(" ") : "";
    await tools.spawn([`cd ${ROOT}`, `zip ${pathBundleFile} ${files} ${ignoreOption}`].join(" && "));
    await tools.spawn([`cd ${pathCache}`, `zip -gr9 ${pathBundleFile} .env`].join(" && "));
    await tools.spawn(
      [
        `cd ${pathCache}`,
        "ln -s /opt/nodejs/node_modules node_modules",
        `zip --symlinks ${pathBundleFile} node_modules`
      ].join(" && ")
    );
    const func = await lambda.getFunction({ FunctionName: env2.LambdaFunction }).promise().catch((err) => err.name === "ResourceNotFoundException" ? null : Promise.reject(err));
    if (!func) {
      await lambda.createFunction({
        Code: {
          ZipFile: fs.readFileSync(pathBundleFile)
        },
        FunctionName: env2.LambdaFunction,
        Runtime: settings.runtime ?? "nodejs16.x",
        MemorySize: 2048,
        Timeout: 60,
        Role: "arn:aws:iam::081743246838:role/Lambda_S3+SQS+RDS",
        Handler: "lambda.handler"
      }).promise();
    } else {
      await lambda.updateFunctionCode({
        ZipFile: fs.readFileSync(pathBundleFile),
        FunctionName: env2.LambdaFunction
      }).promise();
    }
    console.info("waiting funciton update...");
    await lambda.waitFor("functionUpdatedV2", {
      FunctionName: env2.LambdaFunction
    }).promise();
    console.info("## Deploy Lambda Done ! ##");
  };
  const deployLayer = async function(setting) {
    const env2 = deployenv();
    const lambda = new AWS.Lambda(env2.AwsConfiguration);
    const task = new Task();
    const items = await runBundle(setting);
    items.forEach((o) => {
      task.add(() => {
        const stat = fs.statSync(o.bundlePath);
        if (!stat) {
          throw new Error(`${o.bundlePath} not found`);
        }
        console.info(`Bundle ${o.name} Layer size: `, (stat.size / 1024 / 1024).toFixed(2) + "MB");
        return runDeploy(setting, o);
      });
    });
    task.onError = (err) => console.error(err);
    return task.start(1).then(() => {
      console.info(`Update Function Configuration (${env2.LambdaFunction}) ...`);
      return lambda.updateFunctionConfiguration({
        FunctionName: env2.LambdaFunction,
        Layers: items.map((o) => o.layerARN)
      }).promise();
    });
  };
  async function patchPackages(patchs) {
    const env2 = deployenv();
    const pkg = env2.PackageContent;
    const results = [];
    const dependencies = (pkg == null ? void 0 : pkg.dependencies) ?? {};
    const maps = Object.keys(dependencies).reduce((m, key) => {
      m.set(key, dependencies[key]);
      return m;
    }, /* @__PURE__ */ new Map());
    if (patchs) {
      Object.keys(patchs).forEach((key) => {
        const items = patchs[key];
        results.push({
          name: `${env2.LambdaLayer}__${key}`,
          private: true,
          version: pkg.version ?? "0.0.0",
          bundlePath: "",
          layerARN: "",
          dependencies: items.map((module2) => {
            const ver = maps.get(module2);
            maps.delete(module2);
            return ver ? { [module2]: ver } : null;
          }).filter(Boolean).reduce((m, o) => Object.assign(m, o), {})
        });
      });
    }
    if (maps.size > 0) {
      results.push({
        name: env2.LambdaLayer,
        private: true,
        version: pkg.version ?? "0.0.0",
        bundlePath: "",
        layerARN: "",
        dependencies: Array.from(maps.keys()).map((module2) => {
          const ver = maps.get(module2);
          maps.delete(module2);
          return ver ? { [module2]: ver } : null;
        }).filter(Boolean).reduce((m, o) => Object.assign(m, o), {})
      });
    }
    return results;
  }
  async function runBundle(setting) {
    const env2 = deployenv();
    if (!env2.LambdaLayer) {
      throw new Error(`DEPLOY_LAYER is required`);
    }
    const results = await patchPackages(setting == null ? void 0 : setting.patchs);
    for (const pkg of results) {
      const pathPatchFolder = tools.root(`cache/${pkg.name}`);
      const pathPatchNodeJS = tools.root(`cache/${pkg.name}/nodejs`);
      const pathPatchPackage = tools.root(`cache/${pkg.name}/nodejs/package.json`);
      const pathBundle = tools.root(`cache/${pkg.name}/nodejs.zip`);
      tools.remove(pathPatchNodeJS);
      tools.remove(pathBundle);
      if (!tools.stat(pathPatchFolder)) {
        fs.mkdirSync(pathPatchFolder);
      }
      if (!tools.stat(pathPatchNodeJS)) {
        fs.mkdirSync(pathPatchNodeJS);
      }
      fs.promises.writeFile(pathPatchPackage, JSON.stringify(pkg, null, 4));
      await tools.spawn(`cd ${pathPatchNodeJS} && npm i --only=prod`);
      await tools.spawn(`cd ${pathPatchFolder} && zip ${pathBundle} -r9 nodejs`);
      pkg.bundlePath = pathBundle;
    }
    return results;
  }
  async function runDeploy(setting, pitem) {
    const env2 = deployenv();
    const lambda = new AWS.Lambda(env2.AwsConfiguration);
    console.info(`Publish Layer - ${pitem.name} ...`);
    const res = await lambda.publishLayerVersion({
      LayerName: pitem.name,
      CompatibleRuntimes: setting.runtimes ?? ["nodejs16.x"],
      Content: {
        ZipFile: fs.readFileSync(pitem.bundlePath)
      }
    }).promise();
    const vers = await lambda.listLayerVersions({
      LayerName: pitem.name,
      MaxItems: 10
    }).promise();
    const layerVersions = Array.from(vers.LayerVersions ?? []).sort((a, b) => (b.Version ?? 0) - (a.Version ?? 0)).slice(3);
    for (let ver of layerVersions) {
      console.info(`Delete Layer Version ${pitem.name}:${ver.Version}`);
      if (ver.Version) {
        await lambda.deleteLayerVersion({
          LayerName: pitem.name,
          VersionNumber: ver.Version
        }).promise();
      }
    }
    if (!res.LayerVersionArn) {
      console.error(res.$response.error);
      throw new Error("version not found");
    }
    if (res.LayerVersionArn) {
      pitem.layerARN = res.LayerVersionArn;
    } else {
      throw new Error("LayerArn is empty");
    }
  }
  function commandArgv(key) {
    return tools.argv(key);
  }
  function commandOptionExists(key) {
    return tools.opt(key);
  }
  async function deployment(options) {
    updateDeployEnv(options.packageContent, { ...options.env() });
    if (tools.opt("--cloudfront")) {
      if (!options.cloudfront) {
        throw new Error(`cludfront settings is required`);
      }
      await deployCloudFront(options.cloudfront);
    }
    if (tools.opt("--lambda")) {
      if (!options.lambda) {
        throw new Error(`lambda settings is required`);
      }
      await deployLambda(options.lambda);
    }
    if (tools.opt("--invalidations")) {
      if (!options.invalidations) {
        throw new Error(`lambda settings is required`);
      }
      await createCloudfrontInvalidations(options.invalidations);
    }
    if (tools.opt("--layer")) {
      if (!options.layer) {
        throw new Error(`lambda settings is required`);
      }
      await deployLayer(options.layer);
    }
    if (tools.opt("--api")) {
      await deployAPIGateway();
    }
  }
  exports2.commandArgv = commandArgv;
  exports2.commandOptionExists = commandOptionExists;
  exports2.deployment = deployment;
  Object.defineProperty(exports2, Symbol.toStringTag, { value: "Module" });
});
