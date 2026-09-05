import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import logger from '../utils/logger';

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'Something went wrong on the server';

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
  }

  // Log error
  if (statusCode >= 500) {
    logger.error(`${statusCode} - ${message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
    logger.error(err.stack);
  } else {
    logger.warn(`${statusCode} - ${message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
    },
  });
};
