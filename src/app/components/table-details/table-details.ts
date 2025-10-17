import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DbInspectorService } from '../../services/db-inspector.service';

type Col = {
  column_name: string;
  data_type: string;
  is_nullable: boolean;
  column_default: string | null;
  is_pk: boolean;
  is_fk: boolean;
};

type Rel = {
  source_column: string;
  target_table: string;
  target_column: string;
};

@Component({
  selector: 'app-table-details',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatIconModule, MatChipsModule, MatDividerModule, MatTooltipModule],
  templateUrl: './table-details.html',
  styleUrls: ['./table-details.css'],
})
export class TableDetailsComponent implements OnChanges {
  @Input() schema = '';
  @Input() table = '';

  loading = false;
  error: string | null = null;

  columns: Col[] = [];
  relations: Rel[] = [];

  displayedColumns = ['column_name', 'data_type', 'nullable', 'default', 'pk', 'fk'];

  constructor(private db: DbInspectorService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['table'] || changes['schema']) && this.schema && this.table) {
      this.fetchTableDetails();
    }
  }

  private parseResponse(res: any) {
    // aceita variações do backend
    const root = res?.data?.[0]?.json_build_object || res?.data?.[0] || res?.json_build_object || res || {};
    const cols = Array.isArray(root.columns) ? root.columns : [];
    const rels = Array.isArray(root.relations) ? root.relations : [];
    this.columns = cols as Col[];
    this.relations = rels as Rel[];
  }

  fetchTableDetails() {
    this.loading = true;
    this.error = null;
    this.columns = [];
    this.relations = [];

    this.db.getTableDetails(this.schema, this.table).subscribe({
      next: (res) => {
        this.parseResponse(res);
        this.loading = false;
      },
      error: (err) => {
        console.error(err);
        this.error = 'Falha ao carregar detalhes.';
        this.loading = false;
      },
    });
  }

  get pkCount() { return this.columns.filter(c => c.is_pk).length; }
  get fkCount() { return this.columns.filter(c => c.is_fk).length; }
  get colCount() { return this.columns.length; }
}
