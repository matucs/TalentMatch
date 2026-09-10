import pino, { type Logger, type LoggerOptions } from 'pino';

export interface LoggerConfig {
  readonly level: string;
  readonly service: string;
  readonly environment: string;
}

export function createLogger(config: LoggerConfig, options: LoggerOptions = {}): Logger {
  return pino({
    ...options,
    level: config.level,
    base: {
      service: config.service,
      environment: config.environment,
    },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'headers.authorization',
        'headers.cookie',
      ],
      censor: '[REDACTED]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export type { Logger } from 'pino';
