import { Routes } from '@angular/router';
import { SchemaListComponent } from './components/schema-list/schema-list';
import { QueryRunnerComponent } from './components/query-runner/query-runner';
import { EmailSchedulesComponent } from './components/email-schedules/email-schedules.component';

export const routes: Routes = [
  { path: '', redirectTo: 'schemas', pathMatch: 'full' },
  { path: 'schemas', component: SchemaListComponent },
  { path: 'query', component: QueryRunnerComponent },
  { path: 'schedules', component: EmailSchedulesComponent },
  { path: '**', redirectTo: 'schemas' },
];
