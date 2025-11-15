import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DbInspectorService } from '../../services/db-inspector.service';
import { TableDetailsComponent } from '../table-details/table-details';

const TABLE_STATE_KEY = 'dbi.table.state.v1';

@Component({
  selector: 'app-table-list',
  standalone: true,
  imports: [CommonModule, FormsModule, TableDetailsComponent],
  templateUrl: './table-list.html',
  styleUrls: ['./table-list.css'],
})
export class TableListComponent implements OnChanges {
  @Input() schema = '';
  tables: string[] = [];
  selectedTable: string | null = null;
  loading = false;

  searchTerm = '';

  constructor(private db: DbInspectorService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['schema'] && this.schema) {
      this.loadTables();
    }
  }

  get filteredTables(): string[] {
    const term = this.searchTerm.toLowerCase();
    return this.tables.filter((t) => t.toLowerCase().includes(term));
  }

  private loadTableState(): string | null {
    try {
      const raw = localStorage.getItem(TABLE_STATE_KEY);
      if (!raw) return null;
      const map = JSON.parse(raw) as Record<string, string | null>;
      const table = map[this.schema];
      return typeof table === 'string' ? table : null;
    } catch {
      return null;
    }
  }

  private saveTableState(table: string | null) {
    try {
      const raw = localStorage.getItem(TABLE_STATE_KEY);
      const map = raw ? (JSON.parse(raw) as Record<string, string | null>) : {};
      map[this.schema] = table;
      localStorage.setItem(TABLE_STATE_KEY, JSON.stringify(map));
    } catch {}
  }

  loadTables() {
    this.loading = true;
    this.tables = [];
    this.selectedTable = null;

    this.db.getTables(this.schema).subscribe({
      next: (res: any) => {
        const raw = res?.data ?? res ?? [];
        this.tables = Array.isArray(raw)
          ? raw.map((t: any) => (typeof t === 'string' ? t : t.table_name))
          : [];

        const savedTable = this.loadTableState();
        if (savedTable && this.tables.includes(savedTable)) {
          this.selectedTable = savedTable;
        } else {
          this.selectedTable = this.tables[0] ?? null;
        }

        this.saveTableState(this.selectedTable);
        this.loading = false;
      },
      error: (err) => {
        console.error('❌ Erro ao carregar tabelas:', err);
        this.loading = false;
      },
    });
  }

  selectTable(table: string) {
    this.selectedTable = table;
    this.saveTableState(table);
    console.log('✅ Tabela selecionada:', table);
  }
}
