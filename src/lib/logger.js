const pino = require('pino');
const config = require('../config');

const logger = pino({
  level: config.log.level,
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:yyyy-mm-dd HH:MM:ss' },
  },
});

module.exports = logger;
