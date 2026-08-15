import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

// Log de acesso HTTP (método, rota, status, duração) pra toda a API — inclusive
// health e MCP, que têm seus próprios logs de negócio mas não de camada HTTP.
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const { method, originalUrl, ip } = req;
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const res = context.switchToHttp().getResponse();
        const ms = Date.now() - start;
        this.logger.log(`${method} ${originalUrl} ${res.statusCode} +${ms}ms ${ip}`);
      }),
      catchError((err) => {
        const status = err?.status ?? 500;
        const ms = Date.now() - start;
        this.logger.warn(`${method} ${originalUrl} ${status} +${ms}ms ${ip} — ${err?.message}`);
        throw err;
      }),
    );
  }
}
