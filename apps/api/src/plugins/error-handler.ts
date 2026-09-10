import { AppError, type ErrorResponse } from '@talentmatch/shared';
import { ZodError } from 'zod';
import type { ApiInstance } from '../types.js';

export function registerErrorHandler(app: ApiInstance): void {
  app.setNotFoundHandler((request, reply) => {
    const response: ErrorResponse = {
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
        requestId: request.id,
      },
    };
    void reply.code(404).send(response);
  });

  app.setErrorHandler((error, request, reply) => {
    if (isFastifyValidationError(error)) {
      const response: ErrorResponse = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          requestId: request.id,
          details: error.validation.map((issue) => ({
            field: issue.instancePath,
            message: issue.message ?? 'Invalid value',
          })),
        },
      };
      void reply.code(400).send(response);
      return;
    }

    if (error instanceof ZodError) {
      const response: ErrorResponse = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          requestId: request.id,
          details: error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
      };
      void reply.code(400).send(response);
      return;
    }

    if (error instanceof AppError) {
      const response: ErrorResponse = {
        error: {
          code: error.code,
          message: error.message,
          requestId: request.id,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      };
      void reply.code(error.statusCode).send(response);
      return;
    }

    if (isClientError(error)) {
      const response: ErrorResponse = {
        error: {
          code: 'BAD_REQUEST',
          message: 'Request could not be processed',
          requestId: request.id,
        },
      };
      void reply.code(error.statusCode).send(response);
      return;
    }

    request.log.error({ err: error }, 'Unhandled request error');
    const response: ErrorResponse = {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        requestId: request.id,
      },
    };
    void reply.code(500).send(response);
  });
}

function isClientError(error: unknown): error is { readonly statusCode: number } {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return false;
  return typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500;
}

function isFastifyValidationError(error: unknown): error is {
  readonly validation: readonly { readonly instancePath: string; readonly message?: string }[];
} {
  if (typeof error !== 'object' || error === null || !('validation' in error)) return false;
  return Array.isArray(error.validation);
}
