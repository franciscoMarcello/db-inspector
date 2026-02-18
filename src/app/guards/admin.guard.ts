import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated() && auth.hasRole('ADMIN')) return true;

  return auth.ensureAuthenticated().pipe(
    map((ok) => {
      if (!ok) return router.parseUrl('/login');
      return auth.hasRole('ADMIN') ? true : router.parseUrl(auth.getDefaultAuthenticatedRoute());
    })
  );
};
