import fs from 'fs'
import path from 'path'
import cp from 'child_process'
import crypto from 'crypto'
const cwd = process.cwd()

export const tools = {
  exe7z: '"C:\\Program Files\\7-Zip\\7z.exe"',
  root(...p: string[]): string {
    return path.resolve(cwd, ...p)
  },

  stat(filepath: string): fs.Stats | null {
    try {
      return fs.statSync(filepath)
    } catch (err) {
      return null
    }
  },

  isDir(filepath: string): boolean {
    const stat = this.stat(filepath)
    return stat ? stat.isDirectory() : false
  },

  remove(filepath: string) {
    const stat = this.stat(filepath)
    if (stat) {
      fs.rmSync(filepath, { force: true, recursive: true })
    }
  },

  sha1(data: crypto.BinaryLike) {
    const sha1Hash = crypto.createHash('sha1')
    sha1Hash.update(data)
    return sha1Hash.digest('hex')
  },

  async spawn(cmd: string): Promise<void> {
    // const isWindows = process.platform === 'win32'
    // if (isWindows) {
    //   const cmds = cmd.split('&&').map((c) => c.trim())
    //   for (const c of cmds) {
    //     console.info(`exec: ${c}`)
    //     await new Promise<void>((resolve, reject) => {
    //       cp.spawn(c, { stdio: 'inherit', shell: true })
    //         .on('error', (err) => reject(err))
    //         .on('close', () => resolve())
    //     }).catch((err) => {
    //       console.error('Error > ', err)
    //     })
    //   }
    //   return Promise.resolve()
    // }
    // console.info(`exec: ${cmd}`)
    return new Promise<void>((resolve, reject) => {
      cp.spawn(cmd, { shell: true, stdio: 'inherit' })
        .on('message', (msg) => console.info(`    > msg`))
        .on('error', (err) => reject(err))
        .on('close', (code) => resolve())
    })
      .then(() => {
        console.info(`  -> Completed.`)
      })
      .catch((err) => {
        console.error(`  -> ERROR: ${err.message}`)
        console.error(err)
        return Promise.reject(err)
      })
  },
  argv(key: string): string | null {
    const str = process.argv.find((arg) => arg.includes(key + '='))
    if (str) {
      const [, value] = str.split('=')
      return value
    }
    return null
  },

  opt(key: string): boolean {
    return process.argv.includes(key)
  },

  /**
   *
   * @param {string} folderPath
   * @param {string | Tools.ScanFilesOptions | undefined} options
   */
  scanFiles(folderPath: string, options?: string | Tools.ScanFilesOptions): Promise<Tools.ScanFileItem[]> {
    /** @type {Tools.ScanFileItem[]} */
    let results: Tools.ScanFileItem[] = []

    /** @type {Tools.ScanFilesOptions} */
    const opt = typeof options === 'string' ? { root: options } : options ?? {}
    const optRoot = opt.root || ''
    const optHandlers = opt.handler ?? ((v) => v)

    return fs.promises
      .readdir(path.resolve(folderPath))
      .then((files) => {
        /** @type {Promise<void>[]} */
        const promises = files.map<Promise<void>>((filename) => {
          const filepath = path.resolve(folderPath, filename)
          const fileStat = this.stat(filepath)

          // deep scan directory
          if (fileStat && fileStat.isDirectory()) {
            return this.scanFiles(filepath, { ...opt, root: path.join(optRoot, filename) }).then((res) => {
              results = results.concat(res)
            })
          }
          // scan file
          const ritem = optHandlers(this.scanFile(filepath, { ...opt, root: optRoot }))
          if (ritem) {
            results.push(ritem)
          }
          return Promise.resolve()
        })

        return Promise.all(promises).then(null, Promise.reject)
      })
      .then(() => results)
  },

  scanFile(filepath: string, options?: string | Tools.ScanFileOptions): Tools.ScanFileItem {
    const opt = typeof options === 'string' ? { root: options } : options ?? {}
    const optRoot = opt.root || ''

    const fileStat = this.stat(filepath)
    if (!fileStat || !fileStat.isFile()) {
      throw new Error(`${filepath} is not file`)
    }
    const filename = opt.filename || path.basename(filepath)
    return {
      filepath,
      uploadpath: path.join(optRoot, filename),
      size: fileStat.size,
      contentType: this.fileContentType(filename),
    }
  },

  fileContentType(filename: string) {
    const ext = filename.split('.').pop() || ''
    return (
      {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        svg: 'image/svg+xml',
        png: 'image/x-png',
        html: 'text/html; charset=UTF-8',
        js: 'text/javascript',
        mjs: 'text/javascript',
        cjs: 'text/javascript',
        css: 'text/css',
        pdf: 'application/pdf',
        json: 'application/json',
        icon: 'image/vnd.microsoft.icon',
        ttf: 'font/ttf',
      }[ext] || 'application/octet-stream'
    )
  },

  loadJSON(filepath: string): any {
    const buffer = fs.readFileSync(filepath, 'utf8')
    return JSON.parse(buffer)
  },

  loadDeployment(stage: string): Tools.DeploymentRecord | null {
    const pathDeployment = this.root(`.deployment/${stage}.json`)

    if (this.stat(pathDeployment)) {
      return this.loadJSON(pathDeployment)
    }
    return null
  },

  saveDeployment(stage: string, content: Tools.DeploymentRecord) {
    const dirDeployment = this.root('.deployment')
    const pathDeployment = this.root(`.deployment/${stage}.json`)
    if (!this.stat(dirDeployment)) {
      fs.mkdirSync(dirDeployment)
    }
    fs.writeFileSync(pathDeployment, JSON.stringify(content, null, 4))
  },
}

export namespace Tools {
  export interface ScanFileOptions {
    root?: string
    filename?: string
  }

  export interface ScanFilesOptions {
    root?: string
    handler?: (item: ScanFileItem) => ScanFileItem | null
  }

  export interface ScanFileItem {
    filepath: string
    uploadpath: string
    size: number
    contentType: string
  }

  export interface DeploymentRecord {
    ApiGateway: {
      id: string
    }
  }
}
