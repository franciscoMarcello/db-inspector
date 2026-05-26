import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';

type SortDirection = 'asc' | 'desc';

export type ResultTableHeaderGroup = {
  label: string;
  span: number;
  className?: string;
  rowSpan?: number;
};

export type ResultTableCellContext = {
  row: Record<string, unknown>;
  column: string;
  value: unknown;
  rowIndex: number;
};

@Component({
  selector: 'app-result-table',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './result-table.component.html',
  styleUrls: ['./result-table.component.css'],
})
export class ResultTableComponent {
  @Input() columns: string[] = [];
  @Input() rows: Record<string, unknown>[] = [];
  @Input() emptyMessage = 'Sem resultado.';
  @Input() searchPlaceholder = 'Pesquisar';
  @Input() enableSearch = false;
  @Input() enableColumnFilters = true;
  @Input() enableSort = true;
  @Input() headerGroups: ResultTableHeaderGroup[] = [];
  @Input() columnLabels: Record<string, string> = {};
  @Input() cellClassResolver?: (context: ResultTableCellContext) => string;
  @Input() cellValueFormatter?: (value: unknown, column: string, row: Record<string, unknown>) => string;

  sortColumn = '';
  sortDirection: SortDirection = 'asc';
  openFilterColumn = '';
  filterMenuTop = 0;
  filterMenuLeft = 0;
  columnFilterSearchTerm: Record<string, string> = {};
  private activeColumnFilters: Record<string, Set<string>> = {};
  private draftColumnFilters: Record<string, Set<string>> = {};
  private processedRowsCache: {
    rowsRef: Record<string, unknown>[];
    columnsRef: string[];
    filterSignature: string;
    enableColumnFilters: boolean;
    sortColumn: string;
    sortDirection: SortDirection;
    enableSort: boolean;
    value: Record<string, unknown>[];
  } | null = null;

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

  get processedRows(): Record<string, unknown>[] {
    const filterSignature = this.filtersSignature();
    if (
      this.processedRowsCache &&
      this.processedRowsCache.rowsRef === this.rows &&
      this.processedRowsCache.columnsRef === this.columns &&
      this.processedRowsCache.filterSignature === filterSignature &&
      this.processedRowsCache.enableColumnFilters === this.enableColumnFilters &&
      this.processedRowsCache.sortColumn === this.sortColumn &&
      this.processedRowsCache.sortDirection === this.sortDirection &&
      this.processedRowsCache.enableSort === this.enableSort
    ) {
      return this.processedRowsCache.value;
    }

    const filteredRows = this.enableColumnFilters
      ? this.rows.filter((row) => this.columns.every((column) => this.matchesColumnFilter(row, column)))
      : this.rows;

    if (!this.enableSort || !this.sortColumn) {
      this.processedRowsCache = {
        rowsRef: this.rows,
        columnsRef: this.columns,
        filterSignature,
        enableColumnFilters: this.enableColumnFilters,
        sortColumn: this.sortColumn,
        sortDirection: this.sortDirection,
        enableSort: this.enableSort,
        value: filteredRows,
      };
      return filteredRows;
    }

    const indexedRows = filteredRows.map((row, index) => ({ row, index }));
    indexedRows.sort((left, right) => {
      const result = this.compareValues(left.row[this.sortColumn], right.row[this.sortColumn]);
      if (result !== 0) return this.sortDirection === 'asc' ? result : -result;
      return left.index - right.index;
    });

    const sortedRows = indexedRows.map((item) => item.row);
    this.processedRowsCache = {
      rowsRef: this.rows,
      columnsRef: this.columns,
      filterSignature,
      enableColumnFilters: this.enableColumnFilters,
      sortColumn: this.sortColumn,
      sortDirection: this.sortDirection,
      enableSort: this.enableSort,
      value: sortedRows,
    };
    return sortedRows;
  }

  toggleSort(column: string): void {
    if (!this.enableSort) return;
    if (this.sortColumn !== column) {
      this.sortColumn = column;
      this.sortDirection = 'asc';
      return;
    }
    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
  }

  isSorted(column: string): boolean {
    return this.sortColumn === column;
  }

  get hasGroupedHeader(): boolean {
    if (!this.headerGroups.length) return false;
    const totalSpan = this.headerGroups.reduce((sum, group) => sum + Math.max(0, group.span), 0);
    return totalSpan === this.columns.length;
  }

  get groupedDetailColumns(): string[] {
    return this.columns;
  }

  get stickyTop(): number {
    return 0;
  }

  get groupedColumnTop(): number {
    return this.stickyTop + 34;
  }

  columnLabel(column: string): string {
    return this.columnLabels[column] ?? column;
  }

  sortIndicator(column: string): string {
    if (this.sortColumn !== column) return '';
    return this.sortDirection === 'asc' ? '▲' : '▼';
  }

  formatCell(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value);
    }
    if (value instanceof Date) return value.toISOString();
    return JSON.stringify(value);
  }

  formatRowCell(row: Record<string, unknown>, column: string): string {
    const value = row[column];
    if (this.cellValueFormatter) return this.cellValueFormatter(value, column, row);
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value);
    }
    if (value instanceof Date) return value.toISOString();
    return JSON.stringify(value);
  }

  cellClass(row: Record<string, unknown>, column: string, rowIndex: number): string {
    if (!this.cellClassResolver) return '';
    return this.cellClassResolver({
      row,
      column,
      value: row[column],
      rowIndex,
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target;
    if (target instanceof Node && this.elementRef.nativeElement.contains(target)) return;
    this.closeFilterMenu();
  }

  toggleFilterMenu(column: string, event: MouseEvent): void {
    if (!this.enableColumnFilters) return;
    event.stopPropagation();

    if (this.openFilterColumn === column) {
      this.closeFilterMenu();
      return;
    }

    this.openFilterColumn = column;
    const menuPosition = this.resolveMenuPosition(event);
    this.filterMenuTop = menuPosition.top;
    this.filterMenuLeft = menuPosition.left;
    this.columnFilterSearchTerm[column] = '';
    this.draftColumnFilters[column] = this.currentFilterSet(column);
  }

  stopMenuEvent(event: MouseEvent): void {
    event.stopPropagation();
  }

  filteredColumnValues(column: string): string[] {
    const searchTerm = (this.columnFilterSearchTerm[column] ?? '').trim().toLowerCase();
    const values = this.distinctColumnValues(column);
    if (!searchTerm) return values;
    return values.filter((value) => value.toLowerCase().includes(searchTerm));
  }

  isDraftValueSelected(column: string, value: string): boolean {
    return this.currentDraftSet(column).has(value);
  }

  setDraftValue(column: string, value: string, checked: boolean): void {
    const draft = this.currentDraftSet(column);
    if (checked) {
      draft.add(value);
    } else {
      draft.delete(value);
    }
  }

  selectAllDraftValues(column: string): void {
    this.draftColumnFilters[column] = new Set(this.distinctColumnValues(column));
  }

  clearDraftFilter(column: string): void {
    this.draftColumnFilters[column] = new Set(this.distinctColumnValues(column));
    this.columnFilterSearchTerm[column] = '';
  }

  clearAllDraftValues(column: string): void {
    this.draftColumnFilters[column] = new Set<string>();
  }

  applyDraftFilter(column: string): void {
    const allValues = this.distinctColumnValues(column);
    const draft = this.currentDraftSet(column);

    if (draft.size === allValues.length) {
      delete this.activeColumnFilters[column];
    } else {
      this.activeColumnFilters[column] = new Set(draft);
    }

    this.closeFilterMenu();
  }

  isColumnFiltered(column: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.activeColumnFilters, column);
  }

  get hasActiveFilters(): boolean {
    return Object.keys(this.activeColumnFilters).length > 0;
  }

  clearAllFilters(): void {
    this.activeColumnFilters = {};
    this.draftColumnFilters = {};
    this.columnFilterSearchTerm = {};
    this.closeFilterMenu();
  }

  closeFilterMenu(): void {
    this.openFilterColumn = '';
  }

  private distinctColumnValues(column: string): string[] {
    const uniqueValues = new Set<string>();
    for (const row of this.rowsForColumnOptions(column)) {
      uniqueValues.add(this.formatCell(row[column]));
    }
    return Array.from(uniqueValues).sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }),
    );
  }

  private currentFilterSet(column: string): Set<string> {
    if (this.activeColumnFilters[column]) return new Set(this.activeColumnFilters[column]);
    return new Set(this.distinctColumnValues(column));
  }

  private currentDraftSet(column: string): Set<string> {
    if (!this.draftColumnFilters[column]) {
      this.draftColumnFilters[column] = this.currentFilterSet(column);
    }
    return this.draftColumnFilters[column];
  }

  private matchesColumnFilter(row: Record<string, unknown>, column: string): boolean {
    const filter = this.activeColumnFilters[column];
    if (!filter) return true;
    return filter.has(this.formatCell(row[column]));
  }

  private rowsForColumnOptions(column: string): Record<string, unknown>[] {
    return this.rows.filter((row) => this.columns.every((col) => (col === column ? true : this.matchesColumnFilter(row, col))));
  }

  private filtersSignature(): string {
    const columns = Object.keys(this.activeColumnFilters).sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }),
    );
    if (!columns.length) return '';

    return columns
      .map((column) => {
        const values = Array.from(this.activeColumnFilters[column]).sort((a, b) =>
          a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }),
        );
        return `${column}=${values.join('|')}`;
      })
      .join('||');
  }

  private resolveMenuPosition(event: MouseEvent): { top: number; left: number } {
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) {
      return { top: 8, left: 8 };
    }

    const rect = target.getBoundingClientRect();
    const estimatedMenuHeight = 320;
    const estimatedMenuWidth = 280;
    const margin = 8;

    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < estimatedMenuHeight;

    let top = openUp ? rect.top - estimatedMenuHeight - 4 : rect.bottom + 4;
    let left = rect.left;

    const maxTop = window.innerHeight - estimatedMenuHeight - margin;
    const maxLeft = window.innerWidth - estimatedMenuWidth - margin;
    top = Math.max(margin, Math.min(top, maxTop));
    left = Math.max(margin, Math.min(left, maxLeft));

    return { top, left };
  }

  private compareValues(a: unknown, b: unknown): number {
    const normalizedA = this.normalizeForSort(a);
    const normalizedB = this.normalizeForSort(b);

    if (typeof normalizedA === 'number' && typeof normalizedB === 'number') {
      return normalizedA - normalizedB;
    }

    return String(normalizedA).localeCompare(String(normalizedB), 'pt-BR', {
      numeric: true,
      sensitivity: 'base',
    });
  }

  private normalizeForSort(value: unknown): number | string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Date) return value.getTime();

    const text = this.formatCell(value).trim();
    if (!text) return '';

    const numeric = Number(text.replace(',', '.'));
    if (!Number.isNaN(numeric) && text !== '') return numeric;

    return text.toLowerCase();
  }
}
