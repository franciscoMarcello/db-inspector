import { Routes } from '@angular/router';
import { SchemaListComponent } from './components/schema-list/schema-list';
import { QueryRunnerComponent } from './components/query-runner/query-runner';
import { EmailSchedulesComponent } from './components/email-schedules/email-schedules.component';
import { ReportsComponent } from './components/reports/reports-page/reports.component';
import { LoginComponent } from './components/login/login.component';
import { authGuard } from './guards/auth.guard';
import { noAuthGuard } from './guards/no-auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'schemas', pathMatch: 'full' },
  { path: 'login', component: LoginComponent, canActivate: [noAuthGuard] },
  { path: 'schemas', component: SchemaListComponent, canActivate: [authGuard] },
  { path: 'query', component: QueryRunnerComponent, canActivate: [authGuard] },
  { path: 'schedules', component: EmailSchedulesComponent, canActivate: [authGuard] },
  { path: 'reports/manage', component: ReportsComponent, canActivate: [authGuard], data: { manage: true } },
  { path: 'reports', component: ReportsComponent, canActivate: [authGuard], data: { manage: false } },
  { path: '**', redirectTo: 'schemas' },
];
