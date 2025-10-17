import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RelationsView } from './relations-view';

describe('RelationsView', () => {
  let component: RelationsView;
  let fixture: ComponentFixture<RelationsView>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RelationsView]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RelationsView);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
