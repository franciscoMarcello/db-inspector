import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

export const noAuthGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return router.parseUrl('/schemas');

  return auth.ensureAuthenticated().pipe(
    map((ok) => (ok ? router.parseUrl('/schemas') : true))
  );
};
