import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AppButtonComponent } from '../shared/app-button/app-button.component';
import { Dashboard, DashboardService, DashboardSystem } from '../../services/dashboard.service';

@Component({
  selector: 'app-dashboard-list',
  standalone: true,
  imports: [CommonModule, AppButtonComponent],
  templateUrl: './dashboard-list.component.html',
  styleUrls: ['./dashboard-list.component.css'],
})
export class DashboardListComponent implements OnInit {
  dashboards: Dashboard[] = [];
  loading = false;
  deletingId: string | null = null;
  statusMessage = '';
  selectedSystem: DashboardSystem | 'ALL' = 'ALL';

  constructor(private dashboardService: DashboardService, private router: Router) {}

  ngOnInit(): void {
    this.load();
  }

  load() {
    this.loading = true;
    this.statusMessage = '';
    const system = this.selectedSystem === 'ALL' ? undefined : this.selectedSystem;
    this.dashboardService.list(system).subscribe({
      next: (items) => {
        this.loading = false;
        this.dashboards = items.filter((item) => !item.archived);
      },
      error: () => {
        this.loading = false;
        this.statusMessage = 'Falha ao carregar dashboards.';
      },
    });
  }

  setSystem(system: DashboardSystem | 'ALL') {
    this.selectedSystem = system;
    this.load();
  }

  openViewer(id: string) {
    this.router.navigate(['/dashboards', id]);
  }

  openBuilder(id: string) {
    this.router.navigate(['/dashboards', id, 'edit']);
  }

  deleteDashboard(dashboard: Dashboard) {
    if (this.deletingId) return;
    if (!confirm(`Excluir dashboard "${dashboard.name}"?`)) return;

    this.deletingId = dashboard.id;
    this.statusMessage = '';
    this.dashboardService.remove(dashboard.id).subscribe({
      next: () => {
        this.deletingId = null;
        this.dashboards = this.dashboards.filter((item) => item.id !== dashboard.id);
        this.statusMessage = 'Dashboard excluído.';
      },
      error: () => {
        this.deletingId = null;
        this.statusMessage = 'Falha ao excluir dashboard.';
      },
    });
  }

  create(system: DashboardSystem) {
    this.router.navigate(['/dashboards/new'], { queryParams: { system } });
  }
}
