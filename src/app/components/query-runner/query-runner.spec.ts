import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { NGX_MONACO_EDITOR_CONFIG } from 'ngx-monaco-editor-v2';

import { QueryRunnerComponent } from './query-runner';

describe('QueryRunnerComponent', () => {
  let component: QueryRunnerComponent;
  let fixture: ComponentFixture<QueryRunnerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QueryRunnerComponent],
      providers: [provideHttpClient(), { provide: NGX_MONACO_EDITOR_CONFIG, useValue: {} }],
    })
    .compileComponents();

    fixture = TestBed.createComponent(QueryRunnerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
