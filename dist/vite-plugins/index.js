import path from "path";
import fs from "fs";
const staticRewriters = (rewriters) => {
  return {
    name: "vite-plugin-static-rewriter",
    apply: "serve",
    configureServer(server) {
      return () => {
        server.middlewares.use(async (req, res, next) => {
          var _a;
          const pathname = (_a = req.originalUrl) == null ? void 0 : _a.split("?")[0];
          const newpath = pathname && rewriters[pathname] || null;
          if (newpath) {
            res.setHeader("Content-Type", "text/html");
            res.writeHead(200);
            res.write(fs.readFileSync(path.resolve(process.cwd(), `public/${newpath}`)));
            res.end();
          }
          next();
        });
      };
    }
  };
};
const envkey = ["import", "meta", "env"].join(".");
const injectEnvVariables = (options) => {
  return {
    name: "vite-plugin-env-variables",
    config: (config, env) => {
      const define = {};
      Object.keys(options).forEach((key) => {
        define[`${envkey}.${key}`] = JSON.stringify(options[key]);
      });
      return { define };
    }
  };
};
const injectHtml = (options) => {
  return {
    name: "vite-plugin-inject-html",
    configResolved(config) {
    },
    transformIndexHtml: {
      enforce: "pre",
      transform(html, ctx) {
        return {
          html: Object.keys(options.data).reduce((str, key) => {
            return str.replace(`<!--${key}-->`, options.data[key]);
          }, html),
          tags: []
        };
      }
    }
  };
};
export {
  injectEnvVariables,
  injectHtml,
  staticRewriters
};
