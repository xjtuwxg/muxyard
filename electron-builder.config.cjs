const { arch } = require('node:process')

// Each architecture needs a distinct feed when release artifacts are merged.
const targetArch = process.argv.includes('--arm64')
  ? 'arm64'
  : process.argv.includes('--x64')
    ? 'x64'
    : arch
module.exports = {
  ...require('./package.json').build,
  publish: {
    provider: 'github',
    owner: 'xjtuwxg',
    repo: 'muxyard',
    channel: `latest-${targetArch}`
  }
}
