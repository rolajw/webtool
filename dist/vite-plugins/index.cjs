(function(global, factory) {
  typeof exports === "object" && typeof module !== "undefined" ? factory(exports, require("path"), require("fs")) : typeof define === "function" && define.amd ? define(["exports", "path", "fs"], factory) : (global = typeof globalThis !== "undefined" ? globalThis : global || self, factory(global.VitePlugins = {}, global.path, global.fs));
})(this, function(exports2, path, fs) {
  "use strict";
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
        const define2 = {};
        Object.keys(options).forEach((key) => {
          define2[`${envkey}.${key}`] = JSON.stringify(options[key]);
        });
        return { define: define2 };
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
  exports2.injectEnvVariables = injectEnvVariables;
  exports2.injectHtml = injectHtml;
  exports2.staticRewriters = staticRewriters;
  Object.defineProperty(exports2, Symbol.toStringTag, { value: "Module" });
});
