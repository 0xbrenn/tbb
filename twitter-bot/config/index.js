// config/index.js
const dotenv = require('dotenv');
dotenv.config();

const config = {
  development: require('./development'),
  test: require('./test'),
  production: require('./production')
};

module.exports = config[process.env.NODE_ENV || 'development'];