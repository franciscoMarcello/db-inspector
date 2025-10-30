import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';

import { envHeadersInterceptor } from './app/services/env-headers.interceptor';
import { routes } from './app/app.routes';
import { App } from './app/app';
import { provideMonacoEditor } from 'ngx-monaco-editor-v2';
import './polyfills/randomuuid.polyfill';

bootstrapApplication(App, {
  providers: [
    provideRouter(routes),
    provideHttpClient(withFetch()),
    provideHttpClient(withInterceptors([envHeadersInterceptor])),
    provideMonacoEditor({
      baseUrl: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.47.0/min/vs',
    }),
  ],
}).catch((err) => console.error(err));
