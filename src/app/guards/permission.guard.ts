import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

export const sqlMetadataReadGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated() && (auth.hasPermission('SQL_METADATA_READ') || auth.isAdmin())) {
    return true;
  }

  return auth.ensureAuthenticated().pipe(
    map((ok) => {
      if (!ok) return router.parseUrl('/login');
      return auth.hasPermission('SQL_METADATA_READ') || auth.isAdmin()
        ? true
        : router.parseUrl(auth.getDefaultAuthenticatedRoute());
    })
  );
};

export const sqlQueryExecuteGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated() && (auth.hasPermission('SQL_QUERY_EXECUTE') || auth.isAdmin())) {
    return true;
  }

  return auth.ensureAuthenticated().pipe(
    map((ok) => {
      if (!ok) return router.parseUrl('/login');
      return auth.hasPermission('SQL_QUERY_EXECUTE') || auth.isAdmin()
        ? true
        : router.parseUrl(auth.getDefaultAuthenticatedRoute());
    })
  );
};

export const emailSchedulesGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const allowed =
    auth.hasPermission('EMAIL_SEND') ||
    auth.hasPermission('EMAIL_TEST') ||
    auth.hasPermission('EMAIL_SCHEDULE_READ') ||
    auth.hasPermission('EMAIL_SCHEDULE_WRITE') ||
    auth.isAdmin();

  if (auth.isAuthenticated() && allowed) {
    return true;
  }

  return auth.ensureAuthenticated().pipe(
    map((ok) => {
      if (!ok) return router.parseUrl('/login');
      const allowedAfter =
        auth.hasPermission('EMAIL_SEND') ||
        auth.hasPermission('EMAIL_TEST') ||
        auth.hasPermission('EMAIL_SCHEDULE_READ') ||
        auth.hasPermission('EMAIL_SCHEDULE_WRITE') ||
        auth.isAdmin();
      return allowedAfter ? true : router.parseUrl(auth.getDefaultAuthenticatedRoute());
    })
  );
};

export const reportWriteGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated() && (auth.hasPermission('REPORT_WRITE') || auth.isAdmin())) {
    return true;
  }

  return auth.ensureAuthenticated().pipe(
    map((ok) => {
      if (!ok) return router.parseUrl('/login');
      return auth.hasPermission('REPORT_WRITE') || auth.isAdmin()
        ? true
        : router.parseUrl('/reports');
    })
  );
};
