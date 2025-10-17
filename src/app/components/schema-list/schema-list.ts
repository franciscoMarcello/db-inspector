import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DbInspectorService } from '../../services/db-inspector.service';
import { TableListComponent } from '../table-list/table-list';

// importa material
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';

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
        this.loading = false;
      },
      error: (err) => {
        console.error('Erro ao carregar esquemas:', err);
        this.loading = false;
      }
    });
  }

  selectSchema(s: string) {
    console.log('schema clicado:', s);
    this.selectedSchema = s;
  }
}
