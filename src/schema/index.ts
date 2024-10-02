import { OpenAPI } from './open-api'
import fs from 'fs'
import axios from 'axios'

const url = getArgument('-u') ?? getArgument('--url')
const inpath = getArgument('-f') ?? getArgument('--file')
const outpath = getArgument('-o') ?? getArgument('--output') ?? 'schema.json'

let promise = Promise.resolve<any>(null)
if (inpath) {
  promise = fs.promises.readFile(inpath, { encoding: 'utf-8' }).then((value) => JSON.parse(value.toString()))
}

if (url) {
  promise = axios.get(url).then((r) => r.data)
}

promise.then((data) => {
  const code = new OpenAPI(data).genCode()
  fs.writeFileSync(outpath, code)
})

function getArgument(key: string) {
  const valueIndex = process.argv.indexOf(key) + 1
  return valueIndex > 0 && process.argv[valueIndex] ? process.argv[valueIndex] : undefined
}
