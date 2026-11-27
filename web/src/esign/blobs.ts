/* Binary storage for e-sign documents. Original PDF bytes (and legacy page
   images) are far too large for localStorage, so they live in IndexedDB and
   envelopes only keep a blob id. Falls back to an in-memory map when IndexedDB
   is unavailable (private mode, tests) so the module never throws. */
import { uid } from './model';

const DB = 'qh_esign_blobs';
const STORE = 'blobs';
const mem = new Map<string, { bytes: Uint8Array; type: string }>();
let dbp: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return open().then((db) => new Promise<T | undefined>((resolve) => {
    if (!db) { resolve(undefined); return; }
    try {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  }));
}

export async function putBlob(bytes: Uint8Array, type = 'application/pdf', id = uid('blob')): Promise<string> {
  const copy = bytes.slice();
  mem.set(id, { bytes: copy, type });
  await tx('readwrite', (s) => s.put({ bytes: copy.buffer, type }, id));
  return id;
}

export async function getBlob(id?: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  if (!id) return null;
  const hit = mem.get(id);
  if (hit) return hit;
  const rec: any = await tx('readonly', (s) => s.get(id));
  if (!rec) return null;
  const out = { bytes: new Uint8Array(rec.bytes), type: rec.type || 'application/octet-stream' };
  mem.set(id, out);
  return out;
}

export async function deleteBlob(id: string) { mem.delete(id); await tx('readwrite', (s) => s.delete(id)); }

export async function listBlobIds(): Promise<string[]> {
  const keys: any = await tx('readonly', (s) => s.getAllKeys());
  return (keys || []).map(String);
}

export function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; type: string } {
  const [head, b64] = String(dataUrl).split(',');
  const type = /data:(.*?)(;|$)/.exec(head)?.[1] || 'application/octet-stream';
  const bin = atob(b64 || '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, type };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  try {
    const d = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch { return ''; }
}
