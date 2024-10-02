import { nextTick } from 'process'

export type TaskQueue = () => Promise<any>

export class Task {
  protected tasks: TaskQueue[] = []
  public onComplete = (v: any) => {}
  public onError = (e: any) => {}

  add(cb: TaskQueue) {
    this.tasks.push(cb)
  }

  start(runCount = 5) {
    const tasks = this.tasks.slice()
    const onComplete = this.onComplete || ((v) => null)
    const onError = this.onError || ((err) => Promise.reject(err))
    const promises: Promise<any>[] = []
    return new Promise<void>((resolve) => {
      const runNext = () => {
        const next = tasks.shift()
        if (!next) {
          return resolve()
        }
        const promise = Promise.resolve(next()).then(onComplete).catch(onError)
        promises.push(promise)
        promise.then(() => nextTick(runNext))
      }

      for (let i = 0; i < runCount; i++) {
        runNext()
      }
    }).then(() => Promise.all(promises))
  }
}
