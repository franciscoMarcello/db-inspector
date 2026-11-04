import { TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { DARK_THEME_CLASS, THEME_STORAGE_KEY, ThemeService } from './theme.service';

describe('ThemeService', () => {
  let overlayElement: HTMLElement;

  function create(stored: string | null): ThemeService {
    if (stored === null) {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, stored);
    }
    TestBed.configureTestingModule({});
    overlayElement = TestBed.inject(OverlayContainer).getContainerElement();
    return TestBed.inject(ThemeService);
  }

  afterEach(() => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    document.body.classList.remove(DARK_THEME_CLASS);
  });

  it('comeca no tema claro quando nada foi salvo', () => {
    const service = create(null);
    expect(service.theme()).toBe('light');
    expect(document.body.classList.contains(DARK_THEME_CLASS)).toBeFalse();
  });

  it('ignora um valor salvo invalido', () => {
    expect(create('purple').theme()).toBe('light');
  });

  it('restaura o tema escuro salvo no body e no overlay', () => {
    const service = create('dark');
    expect(service.theme()).toBe('dark');
    expect(document.body.classList.contains(DARK_THEME_CLASS)).toBeTrue();
    expect(overlayElement.classList.contains(DARK_THEME_CLASS)).toBeTrue();
  });

  it('alternar salva a escolha e atualiza body e overlay', () => {
    const service = create('light');

    service.toggle();
    expect(service.theme()).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.body.classList.contains(DARK_THEME_CLASS)).toBeTrue();
    expect(overlayElement.classList.contains(DARK_THEME_CLASS)).toBeTrue();

    service.toggle();
    expect(service.theme()).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.body.classList.contains(DARK_THEME_CLASS)).toBeFalse();
    expect(overlayElement.classList.contains(DARK_THEME_CLASS)).toBeFalse();
  });

  it('tema escuro liga o color-scheme dark que o Material usa', () => {
    create('dark');
    expect(getComputedStyle(document.body).colorScheme).toBe('dark');
  });
});
