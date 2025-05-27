import winston from 'winston';
import 'winston-daily-rotate-file';

const fileRotateTransport = new winston.transports.DailyRotateFile({
  filename: 'logs/admin-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '5m',
  maxFiles: '14d',
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    fileRotateTransport,
    // Add error tracking integration
    new winston.transports.Http({
      host: 'logs.example.com',
      path: '/api/logs',
      ssl: true,
    }),
  ],
});

export default logger;