import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { DomainError } from '../exceptions';

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  errors?: unknown;
}

const PROBLEM_TYPE_BASE = 'https://api.elevator-erp.com/problems';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Mid-stream export cancellation: writeCsv/writeXlsx (tabular.ts) call
    // res.destroy() and rethrow once headers are already flushed — e.g. the
    // client cancelled an in-progress download. status()/setHeader()/json()
    // this late throw ERR_HTTP_HEADERS_SENT, and would otherwise turn a
    // routine cancelled download into a fake 500 incident. Skip writing to
    // the response (it can't be reused once headers are sent) — but this
    // filter is the app-wide APP_FILTER, so still log: a real bug surfacing
    // after a partial write (not just a benign client-cancelled download)
    // must not vanish from the logs along with the response.
    if (response.headersSent) {
      this.logger.error(
        `Exception after headers already sent on ${request.method} ${request.url} (client disconnect or mid-stream error)`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      response.destroy();
      return;
    }

    const problem = this.toProblemDetails(exception, request.url);

    if (problem.status >= 500) {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response
      .status(problem.status)
      .type('application/problem+json')
      .json(problem);
  }

  private toProblemDetails(exception: unknown, instance: string): ProblemDetails {
    if (exception instanceof DomainError) {
      return {
        type: `${PROBLEM_TYPE_BASE}/${exception.problemType}`,
        title: exception.title,
        status: exception.status,
        detail: exception.message,
        instance,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const detail =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ??
            exception.message);
      return {
        type: `${PROBLEM_TYPE_BASE}/http-${status}`,
        title: exception.name,
        status,
        detail: Array.isArray(detail) ? 'Request validation failed' : detail,
        instance,
        ...(Array.isArray(detail) ? { errors: detail } : {}),
      };
    }

    return {
      type: `${PROBLEM_TYPE_BASE}/internal`,
      title: 'Internal Server Error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: 'An unexpected error occurred',
      instance,
    };
  }
}
