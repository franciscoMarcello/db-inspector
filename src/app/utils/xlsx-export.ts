const textEncoder = new TextEncoder();

type ZipFileEntry = {
  name: string;
  data: Uint8Array;
  crc32: number;
  offset: number;
};

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colName(index: number): string {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return null;

    // Keep strings with leading zero as text (ex.: códigos 0007).
    if (/^[-+]?0\d+$/.test(raw)) return null;

    // pt-BR style: 1.234,56 or 1234,56
    if (/^[-+]?\d{1,3}(?:\.\d{3})*(?:,\d+)?$/.test(raw) || /^[-+]?\d+,\d+$/.test(raw)) {
      const normalized = raw.replace(/\./g, '').replace(',', '.');
      const n = Number(normalized);
      if (Number.isFinite(n)) return n;
      return null;
    }

    // US/invariant style: 1,234.56 or 1234.56 or 1234
    if (/^[-+]?\d{1,3}(?:,\d{3})*(?:\.\d+)?$/.test(raw) || /^[-+]?\d+(?:\.\d+)?$/.test(raw)) {
      const normalized = raw.replace(/,/g, '');
      const n = Number(normalized);
      if (Number.isFinite(n)) return n;
      return null;
    }

    // Fallback for numeric-looking values without thousand separators
    const fallback = Number(raw);
    if (Number.isFinite(fallback)) return fallback;
  }
  return null;
}

function buildSheetXml(columns: string[], rows: Record<string, unknown>[]): string {
  const allRows: Array<Array<unknown>> = [columns, ...rows.map((row) => columns.map((c) => row[c]))];
  const body = allRows
    .map((cells, rowIdx) => {
      const r = rowIdx + 1;
      const cellsXml = cells
        .map((cellValue, colIdx) => {
          const ref = `${colName(colIdx)}${r}`;
          if (typeof cellValue === 'boolean') {
            return `<c r="${ref}" t="b"><v>${cellValue ? 1 : 0}</v></c>`;
          }
          const num = parseNumber(cellValue);
          if (num !== null && rowIdx > 0) {
            return `<c r="${ref}" t="n"><v>${num}</v></c>`;
          }
          const text = cellValue === null || cellValue === undefined ? '' : String(cellValue);
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
        })
        .join('');
      return `<row r="${r}">${cellsXml}</row>`;
    })
    .join('');

  const endCol = colName(Math.max(columns.length - 1, 0));
  const endRow = allRows.length;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${endCol}${endRow}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <sheetData>${body}</sheetData>
</worksheet>`;
}

function buildWorkbookXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Dados" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;
}

function buildContentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function buildRootRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function buildWorkbookRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;
}

function buildCoreXml(): string {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:dcmitype="http://purl.org/dc/dcmitype/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>AgroReport</dc:creator>
  <cp:lastModifiedBy>AgroReport</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}

function buildAppXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
  xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>AgroReport</Application>
</Properties>`;
}

function makeCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

const CRC32_TABLE = makeCrc32Table();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value & 0xffff, true);
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

function createZip(files: Array<{ name: string; content: string }>): Uint8Array {
  const entries: ZipFileEntry[] = files.map((f) => {
    const data = textEncoder.encode(f.content);
    return { name: f.name, data, crc32: crc32(data), offset: 0 };
  });

  let offset = 0;
  const localParts: Uint8Array[] = [];
  for (const entry of entries) {
    const nameBytes = textEncoder.encode(entry.name);
    entry.offset = offset;
    const header = new ArrayBuffer(30);
    const view = new DataView(header);
    writeUint32(view, 0, 0x04034b50);
    writeUint16(view, 4, 20);
    writeUint16(view, 6, 0);
    writeUint16(view, 8, 0);
    writeUint16(view, 10, 0);
    writeUint16(view, 12, 0);
    writeUint32(view, 14, entry.crc32);
    writeUint32(view, 18, entry.data.length);
    writeUint32(view, 22, entry.data.length);
    writeUint16(view, 26, nameBytes.length);
    writeUint16(view, 28, 0);

    localParts.push(new Uint8Array(header), nameBytes, entry.data);
    offset += 30 + nameBytes.length + entry.data.length;
  }

  const centralStart = offset;
  const centralParts: Uint8Array[] = [];
  for (const entry of entries) {
    const nameBytes = textEncoder.encode(entry.name);
    const header = new ArrayBuffer(46);
    const view = new DataView(header);
    writeUint32(view, 0, 0x02014b50);
    writeUint16(view, 4, 20);
    writeUint16(view, 6, 20);
    writeUint16(view, 8, 0);
    writeUint16(view, 10, 0);
    writeUint16(view, 12, 0);
    writeUint16(view, 14, 0);
    writeUint32(view, 16, entry.crc32);
    writeUint32(view, 20, entry.data.length);
    writeUint32(view, 24, entry.data.length);
    writeUint16(view, 28, nameBytes.length);
    writeUint16(view, 30, 0);
    writeUint16(view, 32, 0);
    writeUint16(view, 34, 0);
    writeUint16(view, 36, 0);
    writeUint32(view, 38, 0);
    writeUint32(view, 42, entry.offset);
    centralParts.push(new Uint8Array(header), nameBytes);
    offset += 46 + nameBytes.length;
  }

  const centralSize = offset - centralStart;
  const eocd = new ArrayBuffer(22);
  const eocdView = new DataView(eocd);
  writeUint32(eocdView, 0, 0x06054b50);
  writeUint16(eocdView, 4, 0);
  writeUint16(eocdView, 6, 0);
  writeUint16(eocdView, 8, entries.length);
  writeUint16(eocdView, 10, entries.length);
  writeUint32(eocdView, 12, centralSize);
  writeUint32(eocdView, 16, centralStart);
  writeUint16(eocdView, 20, 0);

  const parts = [...localParts, ...centralParts, new Uint8Array(eocd)];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

export function createXlsxBlob(columns: string[], rows: Record<string, unknown>[]): Blob {
  const files = [
    { name: '[Content_Types].xml', content: buildContentTypesXml() },
    { name: '_rels/.rels', content: buildRootRelsXml() },
    { name: 'docProps/core.xml', content: buildCoreXml() },
    { name: 'docProps/app.xml', content: buildAppXml() },
    { name: 'xl/workbook.xml', content: buildWorkbookXml() },
    { name: 'xl/_rels/workbook.xml.rels', content: buildWorkbookRelsXml() },
    { name: 'xl/worksheets/sheet1.xml', content: buildSheetXml(columns, rows) },
  ];
  const bytes = createZip(files);
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  return new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
