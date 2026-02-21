import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { catchError, switchMap, throwError } from 'rxjs';

function isAuthLoginOrRefresh(url: string): boolean {
  return /\/api\/auth\/(login|refresh)\b/i.test(url);
}

function isApiPath(url: string): boolean {
  return /\/api\//i.test(url);
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const retried = req.headers.get('X-Auth-Retry') === '1';

  let withAuth = req;
  const access = auth.getAccessToken();
  if (access && !isAuthLoginOrRefresh(req.url) && isApiPath(req.url)) {
    withAuth = req.clone({
      setHeaders: {
        Authorization: `${auth.getTokenType()} ${access}`,
      },
    });
  }

  return next(withAuth).pipe(
    catchError((error: unknown) => {
      const httpErr = error as HttpErrorResponse;
      if (httpErr?.status === 403) {
        const message =
          httpErr?.error?.message ||
          httpErr?.error?.error ||
          (typeof httpErr?.error === 'string' ? httpErr.error : '') ||
          'Sem permissão.';
        return throwError(
          () =>
            new HttpErrorResponse({
              headers: httpErr.headers,
              status: httpErr.status,
              statusText: httpErr.statusText,
              url: httpErr.url ?? undefined,
              error: { ...(typeof httpErr.error === 'object' && httpErr.error ? httpErr.error : {}), message },
            })
        );
      }
      if (
        httpErr?.status !== 401 ||
        retried ||
        isAuthLoginOrRefresh(req.url) ||
        !auth.getRefreshToken()
      ) {
        return throwError(() => error);
      }

      return auth.refreshAccessToken().pipe(
        switchMap(() => {
          const newAccess = auth.getAccessToken();
          if (!newAccess) {
            return throwError(() => error);
          }
          const retryReq = req.clone({
            setHeaders: {
              Authorization: `${auth.getTokenType()} ${newAccess}`,
              'X-Auth-Retry': '1',
            },
          });
          return next(retryReq);
        }),
        catchError((refreshErr) => {
          const status = (refreshErr as HttpErrorResponse)?.status ?? 0;
          if (status === 401 || status === 403) {
            auth.clearSession();
            router.navigate(['/login']);
          }
          return throwError(() => refreshErr);
        })
      );
    })
  );
};
