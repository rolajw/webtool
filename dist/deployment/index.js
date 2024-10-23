var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import fs from "fs";
import path from "path";
import cp from "child_process";
import crypto from "crypto";
import * as AWSCloudfront from "@aws-sdk/client-cloudfront";
import * as AWSS3 from "@aws-sdk/client-s3";
import { nextTick } from "process";
import * as AWSLambda from "@aws-sdk/client-lambda";
const cwd = process.cwd();
const tools = {
  exe7z: '"C:\\Program Files\\7-Zip\\7z.exe"',
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
  async spawn(cmd, options) {
    const isWindows2 = process.platform === "win32";
    if (isWindows2) {
      const cmds = cmd.split("&&").map((c) => c.trim());
      for (const c of cmds) {
        console.info(`exec: ${c}`);
        await new Promise((resolve, reject) => {
          cp.spawn(c, { stdio: "inherit", shell: true, ...options }).on("error", (err) => reject(err)).on("close", () => resolve());
        }).catch((err) => {
          console.error("Error > ", err);
        });
      }
      return Promise.resolve();
    }
    console.info(`exec: ${cmd}`);
    return new Promise((resolve, reject) => {
      cp.spawn(cmd, { shell: true, stdio: "inherit", ...options }).on("message", (msg) => console.info(`    > msg`)).on("error", (err) => reject(err)).on("close", (code) => resolve());
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
  }
  // loadDeployment(stage: string): Tools.DeploymentRecord | null {
  //   const pathDeployment = this.root(`.deployment/${stage}.json`)
  //   if (this.stat(pathDeployment)) {
  //     return this.loadJSON(pathDeployment)
  //   }
  //   return null
  // },
  // saveDeployment(stage: string, content: Tools.DeploymentRecord) {
  //   const dirDeployment = this.root('.deployment')
  //   const pathDeployment = this.root(`.deployment/${stage}.json`)
  //   if (!this.stat(dirDeployment)) {
  //     fs.mkdirSync(dirDeployment)
  //   }
  //   fs.writeFileSync(pathDeployment, JSON.stringify(content, null, 4))
  // },
};
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
      region: env.AwsRegion
      // credentials: {
      //   accessKeyId: env.AwsID,
      //   secretAccessKey: env.AwsKey,
      // },
    };
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
        promise.then(() => nextTick(runNext));
      };
      for (let i = 0; i < runCount; i++) {
        runNext();
      }
    }).then(() => Promise.all(promises));
  }
}
const cloudfrontFunction = "function handler(event) {\r\n  // replace stage variables\r\n  var webpath = 'REPLACE_PATH_VALUE'\r\n\r\n  // replace index file\r\n  var indexFile = 'REPLACE_INDEX_FILE'\r\n\r\n  /** @type {{[path: string]: string}} */\r\n  var rewriters = 'REPLACE_REWRITERS'\r\n\r\n  var redirectHosts = REPLACE_REDIRECT_HOSTS\r\n\r\n  var request = event.request\r\n\r\n  var host = request.headers.host.value\r\n\r\n  if (redirectHosts && redirectHosts[host]) {\r\n    var redirectTarget = redirectHosts[host]\r\n    return {\r\n      statusCode: redirectTarget.statusCode,\r\n      statusDescription: redirectTarget.statusDescription,\r\n      headers: {\r\n        location: { value: redirectTarget.url },\r\n        'cache-control': { value: 'no-store' },\r\n      },\r\n    }\r\n  }\r\n\r\n  /** @type {string} */\r\n  var uri = request.uri\r\n  if (rewriters && rewriters[uri]) {\r\n    uri = rewriters[uri]\r\n  } else if (uri.endsWith('/') || uri.endsWith('index.html') || !uri.includes('.')) {\r\n    uri = '/' + indexFile\r\n  }\r\n\r\n  if (!uri.startsWith('/')) {\r\n    uri = '/' + uri\r\n  }\r\n\r\n  request.uri = '/' + webpath + uri\r\n\r\n  return request\r\n}\r\n";
const filterTruthy = (value) => !!value;
const deployCloudFront = async function(settings) {
  var _a, _b, _c;
  const env2 = deployenv();
  const now = (/* @__PURE__ */ new Date()).getTime();
  const webpath = env2.WebRoot;
  const indexFile = `index.${now}.html`;
  const rewrites = settings.rewriters ? JSON.stringify(settings.rewriters) : "{}";
  const s3 = new AWSS3.S3({ region: env2.AwsRegion });
  const cloudfront = new AWSCloudfront.CloudFront(env2.AwsConfiguration);
  if (!env2.WebRoot.startsWith("website")) {
    throw new Error(`WebRoot must start with website.  Found: ${env2.WebRoot}`);
  }
  const task = new Task();
  task.onComplete = (file) => {
    const fileUploadKey = file.uploadpath.replaceAll("\\", "/");
    console.info(`uploaded ${file.filepath}`);
    console.info(`  -> ${fileUploadKey}`);
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
    const fileUploadKey = file.uploadpath.replaceAll("\\", "/");
    task.add(
      () => fs.promises.readFile(file.filepath).then(
        (buffer) => s3.putObject({
          Bucket: env2.AwsS3,
          Key: fileUploadKey,
          Body: buffer,
          ACL: settings.fileACL ?? "private",
          ContentType: file.contentType
        }).then(() => {
          uploads.push({
            key: fileUploadKey,
            sha1: tools.sha1(buffer)
          });
        })
      ).then(() => file)
    );
  });
  await task.start(10).then(() => console.info("upload files completed!"));
  const code = cloudfrontFunction.toString().replace("REPLACE_PATH_VALUE", webpath).replace("REPLACE_INDEX_FILE", indexFile).replace(`'REPLACE_REWRITERS'`, rewrites).replace(`REPLACE_REDIRECT_HOSTS`, JSON.stringify(((_c = settings.redirectRules) == null ? void 0 : _c.host) ?? {}));
  await cloudfront.describeFunction({ Name: env2.CloudFrontFunction }).then((func) => {
    return cloudfront.updateFunction({
      Name: env2.CloudFrontFunction,
      FunctionCode: Buffer.from(code, "utf-8"),
      IfMatch: func.ETag || "",
      FunctionConfig: {
        Comment: "",
        Runtime: "cloudfront-js-2.0"
      }
    });
  });
  await cloudfront.describeFunction({ Name: env2.CloudFrontFunction }).then((func) => {
    return cloudfront.publishFunction({
      Name: env2.CloudFrontFunction,
      IfMatch: func.ETag || ""
    });
  });
  console.info("update change log");
  await clearFiles(settings, uploads);
  console.info("publish function completed!");
};
async function createCloudfrontInvalidations(paths, waiting = true) {
  const env2 = deployenv();
  const cloudfront = new AWSCloudfront.CloudFront(env2.AwsConfiguration);
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
  }).then((res) => {
    var _a;
    if (!waiting) {
      console.info("Ignore Waiting ... ");
      return null;
    }
    console.info("Wait for invalidation completing ...");
    return AWSCloudfront.waitUntilInvalidationCompleted(
      {
        client: cloudfront,
        maxWaitTime: 6e4
      },
      {
        DistributionId: env2.DistributionId,
        Id: ((_a = res.Invalidation) == null ? void 0 : _a.Id) ?? ""
      }
    );
  }).catch((err) => {
    console.error(err);
    return Promise.reject(err);
  });
}
async function clearFiles(settings, uploads) {
  var _a;
  const env2 = deployenv();
  const s3 = new AWSS3.S3(env2.AwsConfiguration);
  const now = (/* @__PURE__ */ new Date()).getTime();
  const prefixUploads = `${env2.WebRoot}/.uploads`;
  const uploadRecord = `${prefixUploads}/v${env2.Version}-${now}.json`.replaceAll("\\", "/");
  const res = await s3.listObjectsV2({
    Bucket: env2.AwsS3,
    Prefix: `${prefixUploads}/`
  });
  await s3.putObject({
    Bucket: env2.AwsS3,
    Key: uploadRecord,
    Body: JSON.stringify(uploads),
    ACL: settings.fileACL ?? "private",
    ContentType: "application/json"
  });
  const files = /* @__PURE__ */ new Map();
  const records = (res.Contents || []).sort(
    (b, a) => (a.LastModified ? new Date(a.LastModified).getTime() : 0) - (b.LastModified ? new Date(b.LastModified).getTime() : 0)
  );
  const deleteRecords = records.splice(settings.reverses ?? 1).map((r) => ({ Key: r.Key }));
  if (deleteRecords.length > 0) {
    await s3.deleteObjects({
      Bucket: env2.AwsS3,
      Delete: {
        Objects: deleteRecords
      }
    });
  }
  for (const ritem of records) {
    if (!ritem.Key) {
      continue;
    }
    const res2 = await s3.getObject({
      Bucket: env2.AwsS3,
      Key: ritem.Key
    });
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
    });
    const contents = res2.Contents || [];
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
    });
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
  const lambda = new AWSLambda.Lambda({ region: env2.AwsRegion });
  const isWindows2 = process.platform === "win32";
  tools.remove(pathBundleFile);
  tools.remove(pathENV);
  await fs.promises.readFile(`.env.${env2.Stage}`).then((buffer) => fs.promises.writeFile(pathENV, buffer));
  const files = settings.files.map((fpath) => `"${fpath}"`).join(" ");
  const ignores = (settings.ignoreFiles || []).map((s) => `"${s}"`);
  let ignoreOption = "";
  if (isWindows2 && ignores.length > 0) {
    ignoreOption = ignores.map((s) => `-xr!${s}`).join(" ");
  } else if (!isWindows2 && ignores.length > 0) {
    ignoreOption = ignores.map((s) => `-x ${s}`).join(" ");
  }
  if (isWindows2) {
    await tools.spawn([`cd ${ROOT}`, `${tools.exe7z} a -tzip ${pathBundleFile} ${files} ${ignoreOption}`].join(" && "));
  } else {
    await tools.spawn([`cd ${ROOT}`, `zip ${pathBundleFile} ${files} ${ignoreOption}`].join(" && "));
  }
  if (isWindows2) {
    await tools.spawn([`cd ${pathCache}`, `${tools.exe7z} a -tzip -mx=9 ${pathBundleFile} .env`].join(" && "));
  } else {
    await tools.spawn([`cd ${pathCache}`, `zip -gr9 ${pathBundleFile} .env`].join(" && "));
  }
  const func = await lambda.getFunction({ FunctionName: env2.LambdaFunction }).catch((err) => err.name === "ResourceNotFoundException" ? null : Promise.reject(err));
  if (!func) {
    await lambda.createFunction({
      Code: {
        ZipFile: fs.readFileSync(pathBundleFile)
      },
      FunctionName: env2.LambdaFunction,
      Runtime: settings.runtime ?? "nodejs20.x",
      MemorySize: 2048,
      Timeout: 60,
      Role: "arn:aws:iam::081743246838:role/Lambda_S3+SQS+RDS",
      Handler: "lambda.handler"
    });
  } else {
    await lambda.updateFunctionCode({
      ZipFile: fs.readFileSync(pathBundleFile),
      FunctionName: env2.LambdaFunction
    });
  }
  console.info("waiting funciton update...");
  AWSLambda.waitUntilFunctionUpdatedV2(
    {
      client: lambda,
      maxWaitTime: 6e4,
      minDelay: 5e3
    },
    {
      FunctionName: env2.LambdaFunction
    }
  );
  console.info("## Deploy Lambda Done ! ##");
  if (settings.cloudfrontFunction) {
    const funcName = settings.cloudfrontFunction.functionName;
    const cloudfront = new AWSCloudfront.CloudFront({ region: env2.AwsRegion });
    const func2 = await cloudfront.describeFunction({ Name: settings.cloudfrontFunction.functionName }).catch((err) => err.name === "ResourceNotFoundException" ? null : Promise.reject(err));
    if (!func2) {
      await cloudfront.createFunction({
        Name: settings.cloudfrontFunction.functionName,
        // convert to uint8array from string
        FunctionCode: Buffer.from(settings.cloudfrontFunction.functionCode, "utf-8"),
        FunctionConfig: {
          Comment: "",
          Runtime: "cloudfront-js-2.0"
        }
      });
    } else {
      await cloudfront.updateFunction({
        Name: settings.cloudfrontFunction.functionName,
        FunctionCode: Buffer.from(settings.cloudfrontFunction.functionCode, "utf-8"),
        IfMatch: func2.ETag || "",
        FunctionConfig: {
          Comment: "",
          Runtime: "cloudfront-js-2.0"
        }
      });
    }
    console.info("waiting cloudfront function update...");
    await cloudfront.describeFunction({ Name: funcName }).then((func3) => {
      return cloudfront.publishFunction({
        Name: funcName,
        IfMatch: func3.ETag || ""
      });
    });
    console.info("## Deploy Cloudfront Function Done ! ##");
  }
};
const isWindows = process.platform === "win32";
const deployLayer = async function(setting) {
  const env2 = deployenv();
  const lambda = new AWSLambda.Lambda(env2.AwsConfiguration);
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
    });
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
        dependencies: items.map((module) => {
          const ver = maps.get(module);
          maps.delete(module);
          return ver ? { [module]: ver } : null;
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
      dependencies: Array.from(maps.keys()).map((module) => {
        const ver = maps.get(module);
        maps.delete(module);
        return ver ? { [module]: ver } : null;
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
    const pathPatchFolder = tools.root(`.cache/${pkg.name}`);
    const pathPatchNodeJS = tools.root(`.cache/${pkg.name}/nodejs`);
    const pathPatchPackage = tools.root(`.cache/${pkg.name}/nodejs/package.json`);
    const pathBundle = tools.root(`.cache/${pkg.name}/nodejs.zip`);
    tools.remove(pathPatchNodeJS);
    tools.remove(pathBundle);
    if (!tools.stat(pathPatchFolder)) {
      fs.mkdirSync(pathPatchFolder);
    }
    if (!tools.stat(pathPatchNodeJS)) {
      fs.mkdirSync(pathPatchNodeJS);
    }
    fs.promises.writeFile(pathPatchPackage, JSON.stringify(pkg, null, 4));
    await tools.spawn(`npm i --only=prod`, { cwd: pathPatchNodeJS });
    if (isWindows) {
      await tools.spawn(`${tools.exe7z} a -tzip ${pathBundle} nodejs`, { cwd: pathPatchFolder });
    } else {
      await tools.spawn(`cd ${pathPatchFolder} && zip ${pathBundle} -r9 nodejs`);
    }
    pkg.bundlePath = pathBundle;
  }
  return results;
}
async function runDeploy(setting, pitem) {
  const env2 = deployenv();
  const lambda = new AWSLambda.Lambda(env2.AwsConfiguration);
  console.info(`Publish Layer - ${pitem.name} ...`);
  const res = await lambda.publishLayerVersion({
    LayerName: pitem.name,
    CompatibleRuntimes: setting.runtimes ?? ["nodejs20.x"],
    Content: {
      ZipFile: fs.readFileSync(pitem.bundlePath)
    }
  });
  const vers = await lambda.listLayerVersions({
    LayerName: pitem.name,
    MaxItems: 10
  });
  const layerVersions = Array.from(vers.LayerVersions ?? []).sort((a, b) => (b.Version ?? 0) - (a.Version ?? 0)).slice(3);
  for (let ver of layerVersions) {
    console.info(`Delete Layer Version ${pitem.name}:${ver.Version}`);
    if (ver.Version) {
      await lambda.deleteLayerVersion({
        LayerName: pitem.name,
        VersionNumber: ver.Version
      });
    }
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
}
export {
  commandArgv,
  commandOptionExists,
  deployment
};
