// query-params-dialog.component.ts
import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { AppButtonComponent } from '../shared/app-button/app-button.component';

export interface QueryParam {
  name: string;
  value: string;
}

@Component({
  selector: 'app-query-params-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, AppButtonComponent],
  templateUrl: './query-params-dialog.html',
  styleUrls: ['./query-params-dialog.css'],
})
export class QueryParamsDialog {
  params: QueryParam[] = [];

  constructor(
    @Inject(MAT_DIALOG_DATA) data: { params: QueryParam[] },
    private dialogRef: MatDialogRef<QueryParamsDialog>
  ) {
    this.params = data?.params?.map((p) => ({ ...p })) ?? [];
  }

  get canApply(): boolean {
    return (
      this.params.length > 0 &&
      this.params.every((p) => p.value != null && String(p.value).trim() !== '')
    );
  }

  onCancel() {
    this.dialogRef.close();
  }

  onApply() {
    if (!this.canApply) {
      return;
    }
    this.dialogRef.close(this.params);
  }
}
