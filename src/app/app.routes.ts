import { Routes } from '@angular/router';
import { SchemaListComponent } from './components/schema-list/schema-list';
import { QueryRunnerComponent } from './components/query-runner/query-runner';

export const routes: Routes = [
  { path: '', redirectTo: 'schemas', pathMatch: 'full' },
  { path: 'schemas', component: SchemaListComponent },
  { path: 'query', component: QueryRunnerComponent },
  { path: '**', redirectTo: 'schemas' }
];
