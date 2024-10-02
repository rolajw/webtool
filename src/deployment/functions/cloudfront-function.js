function handler(event) {
  // replace stage variables
  var webpath = 'REPLACE_PATH_VALUE'

  // replace index file
  var indexFile = 'REPLACE_INDEX_FILE'

  /** @type {{[path: string]: string}} */
  var rewriters = 'REPLACE_REWRITERS'

  var request = event.request

  var headers = request.headers

  var encoding = headers['accept-encoding'] ? headers['accept-encoding'].value + ',' : ''
  headers['accept-encoding'] = {
    value: encoding + 'br,gzip',
  }

  /** @type {string} */
  var uri = request.uri
  if (rewriters && rewriters[uri]) {
    uri = rewriters[uri]
  } else if (uri.endsWith('/') || uri.endsWith('index.html') || !uri.includes('.')) {
    uri = '/' + indexFile
  }

  if (!uri.startsWith('/')) {
    uri = '/' + uri
  }

  request.uri = '/' + webpath + uri

  return request
}
