const winston = require('winston');
require('winston-daily-rotate-file');

const fileRotateTransport = new winston.transports.DailyRotateFile({
  filename: 'logs/admin-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '5m',
  maxFiles: '14d'
});

module.exports = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    fileRotateTransport
  ]
});