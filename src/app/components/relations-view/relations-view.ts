import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule, JsonPipe } from '@angular/common';
import { DbInspectorService } from '../../services/db-inspector.service';

@Component({
  selector: 'app-relations-view',
  standalone: true,
  imports: [CommonModule, JsonPipe],
  templateUrl: './relations-view.html',
  styleUrls: ['./relations-view.css']
})
export class RelationsViewComponent implements OnChanges {
  @Input() schema!: string;
  @Input() table!: string;
  relations: any;
  loading = false;

  constructor(private api: DbInspectorService) {}

  ngOnChanges() {
    if (!this.schema || !this.table) return;
    this.loading = true;
    this.api.getTableRelations(this.schema, this.table).subscribe({
      next: r => { this.relations = r; this.loading = false; },
      error: _ => { this.relations = null; this.loading = false; }
    });
  }
}
