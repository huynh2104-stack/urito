/* Minimal .xlsx reader: an xlsx file is a zip of XML parts, so a small zip
 * reader + DOMParser is enough - no 300 KB spreadsheet library for the shop PC.
 * Reads the first worksheet as rows of strings. */

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

interface ZipEntry {
  method: number;
  compressedSize: number;
  localOffset: number;
}

function readZipDirectory(buf: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip / xlsx file');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const entries = new Map<string, ZipEntry>();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen)).replace(/\\/g, '/');
    entries.set(name, { method, compressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readEntry(buf: Uint8Array, e: ZipEntry): Promise<string> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const nameLen = view.getUint16(e.localOffset + 26, true);
  const extraLen = view.getUint16(e.localOffset + 28, true);
  const start = e.localOffset + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + e.compressedSize);
  const bytes = e.method === 0 ? raw : await inflateRaw(raw);
  return new TextDecoder().decode(bytes);
}

const colIndex = (ref: string): number => {
  let n = 0;
  for (const ch of ref.replace(/[^A-Z]/gi, '').toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
};

/** First worksheet -> rows of cell text (numbers keep their plain digits). */
export async function readXlsx(file: File): Promise<string[][]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const zip = readZipDirectory(buf);
  const xml = async (name: string) => {
    const e = zip.get(name);
    return e ? new DOMParser().parseFromString(await readEntry(buf, e), 'application/xml') : null;
  };

  const shared: string[] = [];
  const sst = await xml('xl/sharedStrings.xml');
  sst?.querySelectorAll('si').forEach((si) => {
    shared.push([...si.querySelectorAll('t')].map((t) => t.textContent ?? '').join(''));
  });

  const sheetName =
    zip.has('xl/worksheets/sheet1.xml')
      ? 'xl/worksheets/sheet1.xml'
      : [...zip.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  const sheet = sheetName ? await xml(sheetName) : null;
  if (!sheet) throw new Error('No worksheet found');

  const rows: string[][] = [];
  sheet.querySelectorAll('sheetData > row').forEach((row) => {
    const cells: string[] = [];
    row.querySelectorAll(':scope > c').forEach((c, i) => {
      const idx = c.getAttribute('r') ? colIndex(c.getAttribute('r')!) : i;
      const type = c.getAttribute('t');
      let value = '';
      if (type === 's') value = shared[Number(c.querySelector('v')?.textContent ?? -1)] ?? '';
      else if (type === 'inlineStr') value = c.querySelector('is')?.textContent ?? '';
      else value = c.querySelector('v')?.textContent ?? '';
      cells[idx] = value;
    });
    for (let i = 0; i < cells.length; i++) cells[i] ??= '';
    rows.push(cells);
  });
  return rows;
}
