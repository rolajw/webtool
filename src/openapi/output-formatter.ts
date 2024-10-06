export class OutputFormatter {
  public dent = 0
  public content: string[] = []

  public indent(callback: () => void) {
    this.dent += 1
    callback()
    this.dent -= 1
    return this
  }

  public tabs() {
    return '  '.repeat(this.dent)
  }

  public push(codes: string | string[]) {
    const values = Array.isArray(codes) ? codes : [codes]
    const tabs = this.tabs()
    values.forEach((line) => {
      this.content.push(tabs + line)
    })
    return this
  }

  public toString() {
    return this.content.join('\n')
  }
}
