import { config } from '@repo/config';
import { createConsola } from 'consola';

/*
Consola only shows logs with configured log level or below. (Default is 3)
0: Fatal and Error
1: Warnings
2: Normal logs
3: Informational logs, success, fail, ready, start, ...
4: Debug logs
5: Trace logs
-999: Silent
+999: Verbose logs
*/

const getConsolaLogLevel = (level: string) => {
  switch (level) {
    case 'trace':
      return 5;
    case 'debug':
      return 4;
    case 'info':
      return 3;
    case 'normal':
      return 2;
    case 'warn':
      return 1;
    case 'error':
      return 0;
    default:
      return 3;
  }
};

export const logger = createConsola({
  level: getConsolaLogLevel(config.logLevel),
  formatOptions: {
    columns: 1,
    colors: true,
    compact: false,
    date: true,
  },
});

interface DateFormattingReporter {
  formatDate: (date: Date) => string;
}

const isDateFormattingReporter = (reporter: object): reporter is DateFormattingReporter =>
  'formatDate' in reporter && typeof reporter.formatDate === 'function';

// consola's built-in reporters hardcode formatDate() to date.toLocaleTimeString(),
// so `formatOptions.date: true` only ever prints the time, never the date.
// Patch the reporter instances in place to include both.
for (const reporter of logger.options.reporters) {
  if (isDateFormattingReporter(reporter)) {
    reporter.formatDate = (date) => date.toLocaleString();
  }
}

export const logError = (name: string, error: unknown) => {
  if (error instanceof Error) {
    logger.error(`${name}: ${error.message}`);
  } else {
    logger.error(`${name}: Unknown error`, error);
  }
};
