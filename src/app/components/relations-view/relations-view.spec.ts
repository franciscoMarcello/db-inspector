import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DbInspectorService } from '../../services/db-inspector.service';

import { RelationsViewComponent } from './relations-view';

describe('RelationsViewComponent', () => {
  let component: RelationsViewComponent;
  let fixture: ComponentFixture<RelationsViewComponent>;

  const dbInspectorServiceMock = {
    getTableRelations: () => of(null),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RelationsViewComponent],
      providers: [{ provide: DbInspectorService, useValue: dbInspectorServiceMock }],
    })
    .compileComponents();

    fixture = TestBed.createComponent(RelationsViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
