import { deployment } from './dist/deployment/index.js'
import fs from 'fs'

deployment({
  packageContent: JSON.parse(fs.readFileSync('./package.json').toString()),
  env: (stage) => {
    if (stage === 'testing') {
      return {
        distributionid: 'EV10U1IYBR7A2',
        awsregion: 'us-east-1',
        s3bucket: 'visa2us-testing',
        lambda: 'visa2us-testing',
        cloudfrontfunction: 'visa2us-testing',
        webroot: 'website',
        lambdalayer: 'visa2us-testing',
      }
      return {
        distributionid: 'EV10U1IYBR7A2',
        awsregion: 'us-east-1',
        s3bucket: 'apply-writernow-testing',
        cloudfrontfunction: 'apply-writernow-testing',
        webroot: 'website',
      }
    }
    throw new Error('stop deploy production')
    process.exit()
    return {}
  },
  cloudfront: {
    dir: 'dist/test',
    rewriters: {
      '/signin-with': 'signin-with/index.html',
      '/social-callback': 'social-callback/index.html',
    },
  },
})
