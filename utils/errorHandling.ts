/**
 * Standardized error handling utilities
 */

export interface ErrorContext {
  operation: string;
  component?: string;
  additionalInfo?: Record<string, any>;
}

export class BitruviusError extends Error {
  public readonly context: ErrorContext;
  public readonly timestamp: Date;
  public readonly originalError?: Error;

  constructor(message: string, context: ErrorContext, originalError?: Error) {
    super(message);
    this.name = 'BitruviusError';
    this.context = context;
    this.timestamp = new Date();
    this.originalError = originalError;
  }
}

/**
 * Standardized error logger
 */
export const logError = (error: Error | BitruviusError, context?: Partial<ErrorContext>): void => {
  const errorContext = error instanceof BitruviusError 
    ? { ...error.context, ...context }
    : { operation: 'unknown', ...context };

  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [ERROR] ${errorContext.operation}${errorContext.component ? ` (${errorContext.component})` : ''}: ${error.message}`;
  
  console.error(logMessage);
  
  if (error instanceof BitruviusError && error.originalError) {
    console.error('Original error:', error.originalError);
  }
  
  if (errorContext.additionalInfo) {
    console.error('Additional info:', errorContext.additionalInfo);
  }
};

/**
 * Standardized warning logger
 */
export const logWarning = (message: string, context?: Partial<ErrorContext>): void => {
  const errorContext = { operation: 'warning', ...context };
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [WARNING] ${errorContext.operation}${errorContext.component ? ` (${errorContext.component})` : ''}: ${message}`;
  
  console.warn(logMessage);
  
  if (errorContext?.additionalInfo) {
    console.warn('Additional info:', errorContext.additionalInfo);
  }
};

/**
 * Safe function wrapper with standardized error handling
 */
export const safeExecute = <T>(
  operation: () => T,
  context: ErrorContext,
  fallback?: T
): T | undefined => {
  try {
    return operation();
  } catch (error) {
    const bitruviusError = error instanceof Error 
      ? new BitruviusError(error.message, context, error)
      : new BitruviusError(String(error), context);
    
    logError(bitruviusError);
    return fallback;
  }
};

/**
 * Async safe function wrapper with standardized error handling
 */
export const safeExecuteAsync = async <T>(
  operation: () => Promise<T>,
  context: ErrorContext,
  fallback?: T
): Promise<T | undefined> => {
  try {
    return await operation();
  } catch (error) {
    const bitruviusError = error instanceof Error 
      ? new BitruviusError(error.message, context, error)
      : new BitruviusError(String(error), context);
    
    logError(bitruviusError);
    return fallback;
  }
};
