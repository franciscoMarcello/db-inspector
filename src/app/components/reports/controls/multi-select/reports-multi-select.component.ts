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
  private static nextPanelId = 0;
  private readonly el = inject(ElementRef<HTMLElement>);
  @Input() options: MultiSelectOption[] = [];
  @Input() mode: 'multiple' | 'single' = 'multiple';
  @Input() selectedValues: string[] = [];
  @Input() selectedValue = '';
  @Input() placeholder = 'Selecione opções';
  @Input() size: 'md' | 'sm' = 'md';
  @Input() disabled = false;
  @Input() loading = false;
  @Output() selectedValuesChange = new EventEmitter<string[]>();
  @Output() selectedValueChange = new EventEmitter<string>();

  readonly panelId = `reports-multi-select-panel-${ReportsMultiSelectComponent.nextPanelId++}`;

  open = false;
  searchTerm = '';
  highlightedIndex = -1;

  get filteredOptions(): MultiSelectOption[] {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) return this.options;
    return this.options.filter((opt) => opt.label.toLowerCase().includes(term));
  }

  get selectedCount(): number {
    if (this.mode === 'single') return this.selectedValue ? 1 : 0;
    return this.selectedValues.length;
  }

  get summaryLabel(): string {
    if (!this.selectedCount) return this.placeholder;
    if (this.mode === 'single') {
      const item = this.options.find((opt) => opt.value === this.selectedValue);
      return item?.label || this.selectedValue;
    }
    if (this.selectedCount === 1) {
      const item = this.options.find((opt) => this.selectedValues.includes(opt.value));
      return item?.label || '1 selecionado';
    }
    return `${this.selectedCount} selecionados`;
  }

  get activeDescendantId(): string | null {
    if (this.highlightedIndex < 0 || this.highlightedIndex >= this.filteredOptions.length) return null;
    const option = this.filteredOptions[this.highlightedIndex];
    return this.optionId(option.value);
  }

  toggleOpen() {
    if (this.disabled) return;
    this.open = !this.open;
    if (this.open) {
      this.highlightedIndex = this.filteredOptions.length ? 0 : -1;
      return;
    }
    this.highlightedIndex = -1;
  }

  openPanel() {
    if (this.disabled) return;
    this.open = true;
    this.highlightedIndex = this.filteredOptions.length ? 0 : -1;
  }

  toggleOption(value: string, checked: boolean) {
    if (this.mode === 'single') {
      this.emitSingleSelection(checked ? value : '');
      this.open = false;
      return;
    }
    const current = new Set(this.selectedValues);
    if (checked) current.add(value);
    else current.delete(value);
    this.emitSelection([...current]);
  }

  toggleOptionByClick(value: string, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (this.disabled) return;
    if (this.mode === 'single') {
      const next = this.selectedValue === value ? '' : value;
      this.emitSingleSelection(next);
      this.open = false;
      return;
    }
    const nextChecked = !this.isChecked(value);
    this.toggleOption(value, nextChecked);
  }

  onTriggerKeydown(event: KeyboardEvent) {
    if (this.disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.open) {
        this.openPanel();
        return;
      }
      this.moveHighlight(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.toggleOpen();
      return;
    }
    if (event.key === 'Escape' && this.open) {
      event.preventDefault();
      this.open = false;
      this.highlightedIndex = -1;
    }
  }

  onSearchKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveHighlight(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.open = false;
      this.highlightedIndex = -1;
    }
  }

  onOptionKeydown(event: KeyboardEvent, index: number, value: string) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveHighlight(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (this.mode === 'single') {
        const next = this.selectedValue === value ? '' : value;
        this.emitSingleSelection(next);
        this.open = false;
        this.highlightedIndex = -1;
        return;
      }
      this.toggleOption(value, !this.isChecked(value));
      this.highlightedIndex = index;
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.open = false;
      this.highlightedIndex = -1;
    }
  }

  selectAllFiltered() {
    if (this.mode === 'single') return;
    const current = new Set(this.selectedValues);
    for (const opt of this.filteredOptions) current.add(opt.value);
    this.emitSelection([...current]);
  }

  clearSelection() {
    if (this.mode === 'single') {
      this.emitSingleSelection('');
      return;
    }
    this.emitSelection([]);
  }

  onSearchTermChange() {
    if (!this.filteredOptions.length) {
      this.highlightedIndex = -1;
      return;
    }
    if (this.highlightedIndex < 0 || this.highlightedIndex >= this.filteredOptions.length) {
      this.highlightedIndex = 0;
    }
  }

  optionId(value: string): string {
    return `${this.panelId}-opt-${encodeURIComponent(value)}`;
  }

  isChecked(value: string): boolean {
    if (this.mode === 'single') return this.selectedValue === value;
    return this.selectedValues.includes(value);
  }

  private emitSelection(next: string[]) {
    this.selectedValuesChange.emit(next);
  }

  private emitSingleSelection(next: string) {
    this.selectedValueChange.emit(next);
  }

  private moveHighlight(step: number) {
    const total = this.filteredOptions.length;
    if (!total) {
      this.highlightedIndex = -1;
      return;
    }
    const start = this.highlightedIndex < 0 ? 0 : this.highlightedIndex;
    this.highlightedIndex = (start + step + total) % total;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (!this.el.nativeElement.contains(target)) {
      this.open = false;
      this.highlightedIndex = -1;
    }
  }
}
