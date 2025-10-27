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
  const token = env?.apiKey?.trim();

  if (!endpointUrl || !token) {
    return throwError(
      () =>
        new HttpErrorResponse({
          status: 428,
          statusText: 'Precondition Required',
          error: { message: 'Ambiente incompleto: X-SQL-EXEC-URL e X-API-Token são obrigatórios.' },
        })
    );
  }

  return next(
    req.clone({
      setHeaders: {
        'X-SQL-EXEC-URL': endpointUrl,
        'X-API-Token': token,
      },
    })
  );
};
