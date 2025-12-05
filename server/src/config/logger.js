import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Colors for console output
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'cyan',
};

winston.addColors(colors);

// Determine log level based on environment
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'info';
};

// Custom format for logs
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format (colorized for development)
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(
    (info) => `${info.timestamp} [${info.level}]: ${info.message}`
  )
);

// Transports
const transports = [
  // Console transport
  new winston.transports.Console({
    format: consoleFormat,
  }),

  // File logging DISABLED by user request
  // All logs will only show in console, not saved to files

  // // Error log file (rotate daily, keep 30 days)
  // new DailyRotateFile({
  //   filename: path.join(__dirname, '../../logs/error-%DATE%.log'),
  //   datePattern: 'YYYY-MM-DD',
  //   level: 'error',
  //   maxFiles: '30d',
  //   maxSize: '20m',
  //   format,
  // }),

  // // Combined log file (all levels)
  // new DailyRotateFile({
  //   filename: path.join(__dirname, '../../logs/combined-%DATE%.log'),
  //   datePattern: 'YYYY-MM-DD',
  //   maxFiles: '14d',
  //   maxSize: '20m',
  //   format,
  // }),

  // // HTTP access log
  // new DailyRotateFile({
  //   filename: path.join(__dirname, '../../logs/access-%DATE%.log'),
  //   datePattern: 'YYYY-MM-DD',
  //   level: 'http',
  //   maxFiles: '7d',
  //   maxSize: '20m',
  //   format,
  // }),
];

// Create logger instance
const logger = winston.createLogger({
  level: level(),
  levels,
  format,
  transports,
  exitOnError: false,
});

// Stream for Morgan HTTP logger
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

export default logger;
