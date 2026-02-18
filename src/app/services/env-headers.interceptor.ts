// src/app/services/env-headers.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';

export const envHeadersInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req);
};
