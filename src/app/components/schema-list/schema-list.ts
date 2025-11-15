import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DbInspectorService } from '../../services/db-inspector.service';
import { TableListComponent } from '../table-list/table-list';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';

const SCHEMA_STATE_KEY = 'dbi.schema.state.v1';

@Component({
  selector: 'app-schema-list',
  standalone: true,
  imports: [
    CommonModule,
    TableListComponent,
    MatButtonModule,
    MatProgressBarModule
  ],
  templateUrl: './schema-list.html',
  styleUrls: ['./schema-list.css']
})
export class SchemaListComponent implements OnInit {
  schemas: string[] = [];
  selectedSchema: string | null = null;
  loading = false;

  constructor(private dbInspector: DbInspectorService) {}

  ngOnInit(): void {
    this.loadSchemas();
  }

  private loadSchemaState(): string | null {
    try {
      const raw = localStorage.getItem(SCHEMA_STATE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return typeof data?.schema === 'string' ? data.schema : null;
    } catch {
      return null;
    }
  }

  private saveSchemaState() {
    try {
      localStorage.setItem(
        SCHEMA_STATE_KEY,
        JSON.stringify({ schema: this.selectedSchema })
      );
    } catch {}
  }

  loadSchemas() {
    this.loading = true;
    this.dbInspector.getSchemas().subscribe({
      next: (res: any) => {
        if (res?.data && Array.isArray(res.data)) {
          this.schemas = res.data.map((x: any) => x.schema_name);
        } else if (Array.isArray(res)) {
          this.schemas = res;
        } else if (typeof res === 'object') {
          this.schemas = Object.values(res);
        }

        // restaura schema salvo, se existir e ainda estiver na lista
        const saved = this.loadSchemaState();
        if (saved && this.schemas.includes(saved)) {
          this.selectedSchema = saved;
        } else {
          this.selectedSchema = this.schemas[0] ?? null;
        }

        this.loading = false;
      },
      error: (err) => {
        console.error('Erro ao carregar esquemas:', err);
        this.loading = false;
      }
    });
  }

  selectSchema(s: string) {
    this.selectedSchema = s;
    this.saveSchemaState();
  }
}
