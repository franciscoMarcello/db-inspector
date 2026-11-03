import { inject, provideAppInitializer } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';

import { envHeadersInterceptor } from './app/services/env-headers.interceptor';
import { authInterceptor } from './app/services/auth.interceptor';
import { AuthService } from './app/services/auth.service';
import { routes } from './app/app.routes';
import { App } from './app/app';
import { provideMonacoEditor } from 'ngx-monaco-editor-v2';
import './polyfills/randomuuid.polyfill';

bootstrapApplication(App, {
  providers: [
    provideRouter(routes),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor, envHeadersInterceptor])),
    // Antes da primeira navegacao: o retorno do login no Keycloak precisa ser lido antes dos guards.
    provideAppInitializer(() => inject(AuthService).initialize()),
    provideMonacoEditor({
      baseUrl: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.47.0/min/vs',
    }),
  ],
}).catch((err) => console.error(err));
