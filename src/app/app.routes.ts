import { Routes } from '@angular/router';
import { SchemaListComponent } from './components/schema-list/schema-list';
import { QueryRunnerComponent } from './components/query-runner/query-runner';
import { EmailSchedulesComponent } from './components/email-schedules/email-schedules.component';
import { ReportsComponent } from './components/reports/reports-page/reports.component';

export const routes: Routes = [
  { path: '', redirectTo: 'schemas', pathMatch: 'full' },
  { path: 'schemas', component: SchemaListComponent },
  { path: 'query', component: QueryRunnerComponent },
  { path: 'schedules', component: EmailSchedulesComponent },
  { path: 'reports/manage', component: ReportsComponent, data: { manage: true } },
  { path: 'reports', component: ReportsComponent, data: { manage: false } },
  { path: '**', redirectTo: 'schemas' },
];
