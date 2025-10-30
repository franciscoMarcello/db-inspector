// Polyfill seguro para crypto.randomUUID (não recria window.crypto)
(() => {
  try {
    const g: any = typeof globalThis !== 'undefined' ? globalThis : (window as any);
    const c: any = g.crypto; // não sobrescreva 'crypto'
    if (!c) return; // se não existir, não faz nada

    if (typeof c.randomUUID !== 'function') {
      const gen = () => {
        const bytes = new Uint8Array(16);
        if (typeof c.getRandomValues === 'function') {
          c.getRandomValues(bytes);
        } else {
          for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
        }
        bytes[6] = (bytes[6] & 0x0f) | 0x40; // v4
        bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante
        const h = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
        return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}-${h[12]}${h[13]}${h[14]}${h[15]}`;
      };
      Object.defineProperty(c, 'randomUUID', { value: gen, configurable: true });
    }
  } catch (e) {
    console.warn('randomUUID polyfill ignorado:', e);
  }
})();
