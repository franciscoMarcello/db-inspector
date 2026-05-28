import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { TableDetailsComponent } from './table-details';

describe('TableDetails', () => {
  let component: TableDetailsComponent;
  let fixture: ComponentFixture<TableDetailsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TableDetailsComponent],
      providers: [provideHttpClient()],
    })
    .compileComponents();

    fixture = TestBed.createComponent(TableDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
