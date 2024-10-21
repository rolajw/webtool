function handler(event) {
  // replace stage variables
  var webpath = 'REPLACE_PATH_VALUE'

  // replace index file
  var indexFile = 'REPLACE_INDEX_FILE'

  /** @type {{[path: string]: string}} */
  var rewriters = 'REPLACE_REWRITERS'

  var redirectHosts = REPLACE_REDIRECT_HOSTS

  var request = event.request

  var host = request.headers.host.value

  if (redirectHosts && redirectHosts[host]) {
    var redirectTarget = redirectHosts[host]
    return {
      statusCode: redirectTarget.statusCode,
      statusDescription: redirectTarget.statusDescription,
      headers: {
        location: { value: redirectTarget.url },
        'cache-control': { value: 'no-store' },
      },
    }
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
