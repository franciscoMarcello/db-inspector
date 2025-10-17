import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SchemaListComponent } from './schema-list';

describe('SchemaList', () => {
  let component: SchemaListComponent;
  let fixture: ComponentFixture<SchemaListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SchemaListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SchemaListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
