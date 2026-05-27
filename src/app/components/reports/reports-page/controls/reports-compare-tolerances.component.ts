import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

export type CompareToleranceRow = {
  field: string;
  tolerance: string | number;
};

@Component({
  selector: 'app-reports-compare-tolerances',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports-compare-tolerances.component.html',
  styleUrl: './reports-compare-tolerances.component.css',
})
export class ReportsCompareTolerancesComponent {
  @Input({ required: true }) rows: CompareToleranceRow[] = [];
  @Input() availableColumns: string[] = [];
  @Input() error = '';
  @Output() rowsChange = new EventEmitter<CompareToleranceRow[]>();

  get fieldOptions(): string[] {
    const options = new Set<string>();
    for (const col of this.availableColumns) {
      const normalized = String(col ?? '').trim();
      if (normalized) options.add(normalized);
    }
    for (const row of this.rows) {
      const normalized = String(row.field ?? '').trim();
      if (normalized) options.add(normalized);
    }
    return [...options].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }

  get hasFieldOptions(): boolean {
    return this.fieldOptions.length > 0;
  }

  trackByOption(_: number, value: string): string {
    return value;
  }

  addRow() {
    this.rowsChange.emit([...this.rows, { field: '', tolerance: '' }]);
  }

  removeRow(index: number) {
    this.rowsChange.emit(this.rows.filter((_, idx) => idx !== index));
  }

  onFieldChange(index: number, value: string) {
    this.updateRow(index, { field: value });
  }

  onToleranceChange(index: number, value: string | number) {
    this.updateRow(index, { tolerance: value });
  }

  private updateRow(index: number, patch: Partial<CompareToleranceRow>) {
    this.rowsChange.emit(this.rows.map((row, idx) => (idx === index ? { ...row, ...patch } : row)));
  }
}
