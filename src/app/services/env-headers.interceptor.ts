// src/app/services/env-headers.interceptor.ts
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { EnvStorageService } from './env-storage.service';
import { throwError } from 'rxjs';

function isDbApi(url: string): boolean {
  try {
    const u = new URL(url, window.location.origin);
    return u.pathname.startsWith('/api/db');
  } catch {
    return url.includes('/api/db');
  }
}

export const envHeadersInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isDbApi(req.url)) return next(req);

  const env = inject(EnvStorageService).getActive();
  const endpointUrl = env?.url?.trim();
  const upstreamToken = env?.apiKey?.trim();

  if (!endpointUrl || !upstreamToken) {
    return throwError(
      () =>
        new HttpErrorResponse({
          status: 428,
          statusText: 'Precondition Required',
          error: {
            message:
              'Ambiente incompleto: X-SQL-EXEC-URL e token upstream (X-API-Token ou X-Upstream-Authorization) são obrigatórios.',
          },
        })
    );
  }

  const headers: Record<string, string> = {
    'X-SQL-EXEC-URL': endpointUrl,
  };
  if (/^bearer\s+/i.test(upstreamToken) || /^basic\s+/i.test(upstreamToken)) {
    headers['X-Upstream-Authorization'] = upstreamToken;
  } else {
    headers['X-API-Token'] = upstreamToken;
  }

  return next(
    req.clone({
      setHeaders: headers,
    })
  );
};
