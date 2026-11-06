import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiError } from '@mini-erp/shared';

interface HttpResponseLike {
  status(code: number): { json(body: unknown): void };
}

/**
 * Turns every error into the standard `ApiError` shape.
 * Stack traces are logged on the server only and never sent to the UI.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<HttpResponseLike>();
    const request = http.getRequest<{ url?: string }>();

    const body: ApiError = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Internal server error',
      path: request.url ?? '',
      timestamp: new Date().toISOString(),
    };

    if (exception instanceof HttpException) {
      body.statusCode = exception.getStatus();
      body.error = HttpStatus[body.statusCode] ?? 'Error';
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        body.message = payload;
      } else if (typeof payload === 'object' && payload !== null) {
        const { message, error } = payload as { message?: unknown; error?: unknown };
        if (typeof message === 'string') body.message = message;
        else if (Array.isArray(message)) body.message = message.map(String);
        if (typeof error === 'string') body.error = error;
      }
    } else {
      this.logger.error(
        exception instanceof Error ? (exception.stack ?? exception.message) : exception,
      );
    }

    response.status(body.statusCode).json(body);
  }
}
