import * as pulumi from '@pulumi/pulumi';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogContext {
  component: string;
  operation?: string;
  meta?: Record<string, unknown>;
}

export class CloudInfraLogger {
  static log(level: LogLevel, message: string, context: LogContext): void {
    const prefix = `[${context.component}]${context.operation ? `[${context.operation}]` : ''}`;

    switch (level) {
      case LogLevel.WARN:
        pulumi.log.warn(`${prefix} ${message}`, undefined, undefined, true);
        break;
      case LogLevel.INFO:
        pulumi.log.info(`${prefix} ${message}`, undefined, undefined, true);
        break;
      case LogLevel.ERROR:
        pulumi.log.error(`${prefix} ${message}`, undefined, undefined, true);
        break;
      case LogLevel.DEBUG:
        // Only log debug messages if explicitly enabled
        if (process.env.PULUMI_LOG_LEVEL === 'debug') {
          pulumi.log.info(
            `[DEBUG]${prefix} ${message}`,
            undefined,
            undefined,
            true
          );
        }
        break;
    }
  }

  static debug(message: string, context: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  static info(message: string, context: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  static warn(message: string, context: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  static error(message: string, context: LogContext): void {
    this.log(LogLevel.ERROR, message, context);
  }
}
