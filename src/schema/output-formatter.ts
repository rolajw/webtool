export class OutputFormatter {
  public dent = 0
  public content: string[] = []

  public indent(value = 1) {
    this.dent += value
    return this
  }
  public outdent(value = -1) {
    this.dent = Math.max(0, this.dent + value)
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

  public pushIndentCodes(fn: () => void) {
    this.indent()
    fn()
    this.outdent()
    return this
  }

  public toString() {
    return this.content.join('\n')
  }
}
