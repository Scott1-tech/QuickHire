/* Shared uploaded-file store — real files, persisted to localStorage as data
   URLs so uploads survive refresh. Every "Upload" button in the app routes
   here; viewing converts the data URL to a Blob URL so PDFs/images open in
   the browser's native viewer. Oversized files degrade gracefully to
   session-only storage instead of failing. */
import React from 'react';

export type StoredFile = { id: string; name: string; type: string; size: number; dataUrl: string; at: string; persisted: boolean };

const LS = 'qh_files_v1';
const MAX_PERSIST_BYTES = 2.5 * 1024 * 1024; // per-file cap for localStorage persistence

const uid = () => 'file_' + Math.random().toString(36).slice(2, 9);

function load(): StoredFile[] { try { const r = localStorage.getItem(LS); return r ? JSON.parse(r) : []; } catch { return []; } }
function persist() {
  try { localStorage.setItem(LS, JSON.stringify(files.filter((f) => f.persisted))); }
  catch { /* quota — newest file falls back to session-only */ const last = files.find((f) => f.persisted); if (last) { last.persisted = false; try { localStorage.setItem(LS, JSON.stringify(files.filter((f) => f.persisted))); } catch { /* give up quietly */ } } }
}

const files: StoredFile[] = load();
const listeners = new Set<() => void>();
const emit = () => { persist(); listeners.forEach((l) => l()); };

export function useFiles() {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => { listeners.add(force); return () => { listeners.delete(force); }; }, []);
  return files;
}
export const listFiles = () => files;
export const getFile = (id?: string | null) => (id ? files.find((f) => f.id === id) : undefined);

/** Read a File into the store. Resolves with the stored record. */
export function saveFile(file: File): Promise<StoredFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const rec: StoredFile = { id: uid(), name: file.name, type: file.type || 'application/octet-stream', size: file.size, dataUrl: String(reader.result), at: new Date().toISOString(), persisted: file.size <= MAX_PERSIST_BYTES };
      files.unshift(rec);
      emit();
      resolve(rec);
    };
    reader.readAsDataURL(file);
  });
}

export function removeFile(id: string) { const i = files.findIndex((f) => f.id === id); if (i >= 0) { files.splice(i, 1); emit(); } }

/** Open a stored file in a new tab via a Blob URL (data URLs are blocked for
    top-level navigation in Chromium; blob URLs render PDFs/images natively). */
export function openFile(id?: string | null): boolean {
  const f = getFile(id); if (!f) return false;
  try {
    const [head, b64] = f.dataUrl.split(',');
    const mime = /data:(.*?);/.exec(head)?.[1] || f.type;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch { return false; }
}

/** One-shot hidden file picker; calls back with the stored record. */
export function pickAndSave(accept: string, cb: (f: StoredFile) => void, onError?: (msg: string) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  if (accept) input.accept = accept;
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try { const rec = await saveFile(file); cb(rec); }
    catch { onError?.('Could not read that file'); }
  };
  input.click();
}

export function fmtSize(bytes: number) { if (bytes < 1024) return bytes + ' B'; if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB'; return (bytes / 1048576).toFixed(1) + ' MB'; }
