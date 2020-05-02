if (process.env.NODE_ENV === 'production') {
  module.exports = require('./build.prod.js')
} else {
  module.exports = require('./build.dev.js')
}