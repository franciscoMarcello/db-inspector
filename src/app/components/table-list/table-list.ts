import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; // ✅ necessário para ngModel
import { DbInspectorService } from '../../services/db-inspector.service';
import { TableDetailsComponent } from '../table-details/table-details';

@Component({
  selector: 'app-table-list',
  standalone: true,
  imports: [CommonModule, FormsModule, TableDetailsComponent],
  templateUrl: './table-list.html',
  styleUrls: ['./table-list.css']
})
export class TableListComponent implements OnChanges {
  @Input() schema = '';
  tables: string[] = [];
  selectedTable: string | null = null;
  loading = false;

  searchTerm = ''; // ✅ termo digitado pelo usuário

  constructor(private db: DbInspectorService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['schema'] && this.schema) {
      this.loadTables();
    }
  }

  get filteredTables(): string[] {
    const term = this.searchTerm.toLowerCase();
    return this.tables.filter(t => t.toLowerCase().includes(term));
  }

  loadTables() {
    this.loading = true;
    this.tables = [];
    this.selectedTable = null;

    this.db.getTables(this.schema).subscribe({
      next: (res: any) => {
        const raw = res?.data ?? res ?? [];
        this.tables = Array.isArray(raw)
          ? raw.map((t: any) => typeof t === 'string' ? t : t.table_name)
          : [];

        if (this.tables.length) {
          this.selectedTable = this.tables[0];
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('❌ Erro ao carregar tabelas:', err);
        this.loading = false;
      }
    });
  }

  selectTable(table: string) {
    this.selectedTable = table;
    console.log('✅ Tabela selecionada:', table);
  }
}
