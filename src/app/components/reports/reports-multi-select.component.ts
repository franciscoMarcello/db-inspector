import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

export type MultiSelectOption = {
  value: string;
  label: string;
};

@Component({
  selector: 'app-reports-multi-select',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports-multi-select.component.html',
  styleUrls: ['./reports-multi-select.component.css'],
})
export class ReportsMultiSelectComponent {
  private readonly el = inject(ElementRef<HTMLElement>);
  @Input() options: MultiSelectOption[] = [];
  @Input() selectedValues: string[] = [];
  @Input() placeholder = 'Selecione opções';
  @Input() disabled = false;
  @Input() loading = false;
  @Output() selectedValuesChange = new EventEmitter<string[]>();

  open = false;
  searchTerm = '';

  get filteredOptions(): MultiSelectOption[] {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) return this.options;
    return this.options.filter((opt) => opt.label.toLowerCase().includes(term));
  }

  get selectedCount(): number {
    return this.selectedValues.length;
  }

  get summaryLabel(): string {
    if (!this.selectedCount) return this.placeholder;
    if (this.selectedCount === 1) {
      const item = this.options.find((opt) => this.selectedValues.includes(opt.value));
      return item?.label || '1 selecionado';
    }
    return `${this.selectedCount} selecionados`;
  }

  toggleOpen() {
    if (this.disabled) return;
    this.open = !this.open;
  }

  toggleOption(value: string, checked: boolean) {
    const current = new Set(this.selectedValues);
    if (checked) current.add(value);
    else current.delete(value);
    this.emitSelection([...current]);
  }

  selectAllFiltered() {
    const current = new Set(this.selectedValues);
    for (const opt of this.filteredOptions) current.add(opt.value);
    this.emitSelection([...current]);
  }

  clearSelection() {
    this.emitSelection([]);
  }

  isChecked(value: string): boolean {
    return this.selectedValues.includes(value);
  }

  private emitSelection(next: string[]) {
    this.selectedValuesChange.emit(next);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (!this.el.nativeElement.contains(target)) this.open = false;
  }
}
