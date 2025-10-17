import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

import { routes } from './app/app.routes';
import { App } from './app/app';
import { provideMonacoEditor } from 'ngx-monaco-editor-v2';
bootstrapApplication(App, {
  providers: [
    provideRouter(routes),
    provideHttpClient(withFetch()),
   provideMonacoEditor({
  baseUrl: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.47.0/min/vs'
})
  ],
}).catch(err => console.error(err));
