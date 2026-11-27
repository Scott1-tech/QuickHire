/* Download/export helpers shared by Manage, the details drawer and signing. */
import { Envelope, Values } from './model';
import { svc } from './store';
import { downloadBytes, safeFilename } from './pdf';
import { openFile, getFile } from '../shell/files';
import { dataUrlToBytes } from './blobs';
import { flattenEnvelope, buildCertificate, getDocBytes } from './pdfgen';

export async function downloadSignedPdf(env: Envelope, opts: { values?: Values; withCertificate?: boolean } = {}) {
  // a completed envelope that was already filed downloads the exact filed bytes
  if (env.status === 'completed' && env.signedFileId && opts.withCertificate && !opts.values) {
    const rec = getFile(env.signedFileId);
    if (rec) { const { bytes } = dataUrlToBytes(rec.dataUrl); downloadBytes(bytes, rec.name); svc.markDownloaded(env.id, 'Signed PDF with certificate'); return; }
  }
  const bytes = await flattenEnvelope(env, { values: opts.values, includeCertificate: !!opts.withCertificate });
  const suffix = env.status === 'completed' ? 'signed' : 'in progress';
  downloadBytes(bytes, `${safeFilename(env.title)} (${suffix}).pdf`);
  svc.markDownloaded(env.id, opts.withCertificate ? 'Signed PDF with certificate' : env.status === 'completed' ? 'Signed PDF' : 'Document copy');
}

export async function downloadCertificate(env: Envelope) {
  const bytes = await buildCertificate(env);
  downloadBytes(bytes, `${safeFilename(env.title)} — Certificate of Completion.pdf`);
  svc.markDownloaded(env.id, 'Certificate of completion');
}

export async function downloadOriginals(env: Envelope) {
  for (const d of env.documents) downloadBytes(await getDocBytes(d), `${safeFilename(d.name)}.pdf`);
  svc.markDownloaded(env.id, 'Original documents');
}

export function downloadFormData(env: Envelope) {
  downloadBytes('﻿' + svc.exportCsv(env.id), `${safeFilename(env.title)} — form data.csv`, 'text/csv;charset=utf-8');
  svc.markDownloaded(env.id, 'Form data (CSV)');
}

export function openSignedFile(env: Envelope) { return env.signedFileId ? openFile(env.signedFileId) : false; }
