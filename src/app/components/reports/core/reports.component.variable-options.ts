import { ReportDefinition, ReportService, ReportVariable, ReportVariableOption } from '../../../services/report.service';
import { MultiSelectOption } from '../controls/multi-select/reports-multi-select.component';
import { buildParamsForOptions, filterVariableOptionItems, syncOptionSearchText } from './reports.component.utils';

export interface ReportsVariableOptionsHost {
  selectedReport: ReportDefinition | null;
  selectedReportVariables: ReportVariable[];
  variableInputs: Record<string, string>;
  variableOptionSearchText: Record<string, string>;
  variableMultiOptionSelections: Record<string, string[]>;
  variableMultiSelectOptionsByKey: Record<string, MultiSelectOption[]>;
  variableOptions: Record<string, ReportVariableOption[]>;
  loadingVariableOptions: Record<string, boolean>;
  optionsParamsSignatureByKey: Record<string, string>;
  onVariableInputChanged(): void;
}

export class ReportsVariableOptionsLogic {
  constructor(
    private readonly host: ReportsVariableOptionsHost,
    private readonly reportService: ReportService
  ) {}

  hasVariableOptions(variable: ReportVariable): boolean {
    return Boolean(variable.optionsSql && variable.optionsSql.trim());
  }

  variableOptionItems(variable: ReportVariable): ReportVariableOption[] {
    return this.host.variableOptions[variable.key] || [];
  }

  filteredVariableOptionItems(variable: ReportVariable): ReportVariableOption[] {
    return filterVariableOptionItems(
      this.variableOptionItems(variable),
      this.host.variableOptionSearchText[variable.key] || ''
    );
  }

  variableOptionsLoading(variable: ReportVariable): boolean {
    return Boolean(this.host.loadingVariableOptions[variable.key]);
  }

  onVariableOptionSearchChange(variable: ReportVariable, text: string): void {
    const key = variable.key;
    this.host.variableOptionSearchText = {
      ...this.host.variableOptionSearchText,
      [key]: text,
    };

    const normalized = text.trim().toLowerCase();
    const exact = this.variableOptionItems(variable).find(
      (opt) => String(opt.descricao ?? '').trim().toLowerCase() === normalized
    );

    this.host.variableInputs[key] = exact ? String(exact.valor ?? '') : '';
    this.host.onVariableInputChanged();
  }

  onVariableOptionSelected(variable: ReportVariable, option: ReportVariableOption | null): void {
    const key = variable.key;
    this.setVariableOptionValue(key, String(option?.valor ?? ''), String(option?.descricao ?? ''));
  }

  onVariableOptionValueSelected(variable: ReportVariable, rawValue: string): void {
    const value = this.optionValueToString(rawValue);
    const selected = this.variableOptionItems(variable).find(
      (opt) => this.optionValueToString(opt.valor) === value
    );
    this.setVariableOptionValue(variable.key, value, selected?.descricao ?? '');
  }

  onVariableMultipleOptionValuesSelected(variable: ReportVariable, rawValues: string[] | string): void {
    const selectedValues = Array.isArray(rawValues) ? rawValues : [String(rawValues ?? '')];
    const normalized = selectedValues
      .map((value) => this.optionValueToString(value).trim())
      .filter(Boolean);
    this.host.variableMultiOptionSelections = {
      ...this.host.variableMultiOptionSelections,
      [variable.key]: normalized,
    };
    this.setVariableOptionValue(variable.key, normalized.join(','), '');
  }

  variableMultiSelectOptions(variable: ReportVariable): MultiSelectOption[] {
    return this.host.variableMultiSelectOptionsByKey[variable.key] || [];
  }

  clearVariableOption(variable: ReportVariable): void {
    this.setVariableOptionValue(variable.key, '', '');
  }

  reloadVariableOptions(): void {
    const reportId = this.host.selectedReport?.id;
    if (!reportId) {
      this.resetVariableOptionsState();
      return;
    }

    const optionVars = this.host.selectedReportVariables.filter((v) => this.hasVariableOptions(v));
    if (!optionVars.length) {
      this.resetVariableOptionsState();
      return;
    }

    for (const variable of optionVars) {
      const params = buildParamsForOptions(
        this.host.selectedReportVariables,
        this.host.variableInputs,
        variable.key
      );
      const signature = JSON.stringify(params);
      if (this.host.optionsParamsSignatureByKey[variable.key] === signature) continue;
      this.host.loadingVariableOptions = {
        ...this.host.loadingVariableOptions,
        [variable.key]: true,
      };
      this.reportService.listVariableOptions(reportId, variable.key, params, 100).subscribe({
        next: (options) => {
          this.applyVariableOptionFetchResult(variable.key, signature, options);
        },
        error: () => {
          this.applyVariableOptionFetchResult(variable.key, signature, []);
        },
      });
    }
  }

  resetVariableOptionsState(): void {
    this.host.variableOptions = {};
    this.host.variableMultiSelectOptionsByKey = {};
    this.host.loadingVariableOptions = {};
    this.host.optionsParamsSignatureByKey = {};
    this.host.variableMultiOptionSelections = {};
  }

  optionValueToString(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value);
  }

  private setVariableOptionValue(key: string, inputValue: string, searchValue: string): void {
    this.host.variableInputs[key] = inputValue;
    this.host.variableOptionSearchText = {
      ...this.host.variableOptionSearchText,
      [key]: searchValue,
    };
    this.host.variableMultiOptionSelections = {
      ...this.host.variableMultiOptionSelections,
      [key]: String(inputValue ?? '')
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    };
    this.host.onVariableInputChanged();
  }

  private applyVariableOptionFetchResult(
    key: string,
    signature: string,
    options: ReportVariableOption[]
  ): void {
    this.host.optionsParamsSignatureByKey = {
      ...this.host.optionsParamsSignatureByKey,
      [key]: signature,
    };
    this.host.variableOptions = {
      ...this.host.variableOptions,
      [key]: options,
    };
    this.host.variableMultiSelectOptionsByKey = {
      ...this.host.variableMultiSelectOptionsByKey,
      [key]: options.map((opt) => ({
        value: this.optionValueToString(opt.valor),
        label: String(opt.descricao ?? ''),
      })),
    };
    this.host.variableOptionSearchText = {
      ...this.host.variableOptionSearchText,
      [key]: syncOptionSearchText(this.host.variableInputs[key] ?? '', options),
    };
    this.host.loadingVariableOptions = {
      ...this.host.loadingVariableOptions,
      [key]: false,
    };
  }
}

