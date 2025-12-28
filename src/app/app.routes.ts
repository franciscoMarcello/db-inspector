import { Routes } from '@angular/router';
import { SchemaListComponent } from './components/schema-list/schema-list';
import { QueryRunnerComponent } from './components/query-runner/query-runner';
import { EmailSchedulesComponent } from './components/email-schedules/email-schedules.component';
import { ReportsComponent } from './components/reports/reports.component';

export const routes: Routes = [
  { path: '', redirectTo: 'schemas', pathMatch: 'full' },
  { path: 'schemas', component: SchemaListComponent },
  { path: 'query', component: QueryRunnerComponent },
  { path: 'schedules', component: EmailSchedulesComponent },
  { path: 'reports', component: ReportsComponent },
  { path: '**', redirectTo: 'schemas' },
];
