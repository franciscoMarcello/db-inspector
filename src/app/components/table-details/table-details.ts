import { Component, Input, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
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
  imports: [
    CommonModule,
    MatTableModule,
    MatIconModule,
    MatChipsModule,
    MatDividerModule,
    MatTooltipModule,
    MatButtonModule,
  ],
  templateUrl: './table-details.html',
  styleUrls: ['./table-details.css'],
})
export class TableDetailsComponent implements OnChanges {
  @Input() schema = '';
  @Input() table = '';

  @Output() navigateToTable = new EventEmitter<string>();

  loading = false;
  error: string | null = null;

  columns: Col[] = [];
  relations: Rel[] = [];

  displayedColumns = ['column_name', 'data_type', 'nullable', 'default', 'pk', 'fk'];

  relDisplayedColumns = ['source_column', 'target_table', 'target_column', 'actions'];

  fkByColumn = new Map<string, Rel[]>();

  constructor(private db: DbInspectorService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['table'] || changes['schema']) && this.schema && this.table) {
      this.fetchTableDetails();
    }
  }

  private parseResponse(res: any) {
    const root =
      res?.data?.[0]?.json_build_object || res?.data?.[0] || res?.json_build_object || res || {};

    const cols = Array.isArray(root.columns) ? root.columns : [];
    const rels = Array.isArray(root.relations) ? root.relations : [];

    this.columns = cols as Col[];
    this.relations = rels as Rel[];

    this.fkByColumn = new Map();
    for (const r of this.relations) {
      const list = this.fkByColumn.get(r.source_column) ?? [];
      list.push(r);
      this.fkByColumn.set(r.source_column, list);
    }
  }

  fetchTableDetails() {
    this.loading = true;
    this.error = null;
    this.columns = [];
    this.relations = [];
    this.fkByColumn.clear();

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

  getFkLabel(col: Col): string | null {
    const rels = this.fkByColumn.get(col.column_name);
    if (!rels?.length) return null;
    return rels.map((r) => `${r.target_table}.${r.target_column}`).join(', ');
  }

  onFkClick(col: Col, ev?: MouseEvent) {
    ev?.stopPropagation();
    const rels = this.fkByColumn.get(col.column_name);
    if (!rels?.length) return;
    this.gotoTable(rels[0].target_table);
  }

  gotoTable(table: string) {
    if (!table) return;
    this.navigateToTable.emit(table);
  }

  get pkCount() {
    return this.columns.filter((c) => c.is_pk).length;
  }
  get fkCount() {
    return this.columns.filter((c) => c.is_fk).length;
  }
  get colCount() {
    return this.columns.length;
  }
}
