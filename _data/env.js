const process = require('process')
module.exports = function () {
    const {NODE_ENV = 'dev'} = process.env;
    return {
        NODE_ENV
    }
}
