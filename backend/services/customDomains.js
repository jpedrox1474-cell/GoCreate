// Custom domain mapping + DNS TXT verification for published apps.

import dns from 'dns/promises';
import crypto from 'crypto';
import admin from '../config/firebaseAdmin.js';
import { db } from '../config/firebaseAdmin.js';

export const PLATFORM_HOSTS = new Set([
  'gocreate.web.app',
  'gocreate.firebaseapp.com',
  'localhost',
  '127.0.0.1',
]);

export function normalizeHost(raw) {
  let h = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
  if (h.startsWith('www.')) h = h.slice(4);
  if (!h || h.length > 253) {
    return { ok: false, error: 'Domínio inválido.' };
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(h)) {
    return { ok: false, error: 'Usa um hostname válido (ex: app.meudominio.com).' };
  }
  if (PLATFORM_HOSTS.has(h) || h.endsWith('.web.app') || h.endsWith('.firebaseapp.com')) {
    return { ok: false, error: 'Este domínio é reservado pela plataforma.' };
  }
  return { ok: true, host: h };
}

function newVerifyToken() {
  return crypto.randomBytes(12).toString('hex');
}

/**
 * Claim or update custom domain for a project. Releases previous host if changed.
 */
export async function claimCustomDomain({ projectId, ownerId, host: rawHost }) {
  const normalized = normalizeHost(rawHost);
  if (!normalized.ok) {
    const err = new Error(normalized.error);
    err.status = 400;
    err.code = 'INVALID_DOMAIN';
    throw err;
  }
  const host = normalized.host;
  const domainRef = db.collection('customDomains').doc(host);
  const existing = await domainRef.get();
  if (existing.exists) {
    const data = existing.data() || {};
    if (data.projectId !== projectId) {
      const err = new Error('Este domínio já está ligado a outro projeto.');
      err.status = 409;
      err.code = 'DOMAIN_TAKEN';
      throw err;
    }
  }

  const projectRef = db.collection('projects').doc(projectId);
  const projectSnap = await projectRef.get();
  const project = projectSnap.data() || {};
  const prev = String(project.customDomain || '')
    .trim()
    .toLowerCase();

  let verificationToken = existing.exists
    ? existing.data()?.verificationToken || newVerifyToken()
    : newVerifyToken();
  const verified = Boolean(existing.exists && existing.data()?.verified);

  const batch = db.batch();
  batch.set(
    domainRef,
    {
      projectId,
      ownerId,
      host,
      verificationToken,
      verified,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(existing.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
    },
    { merge: true }
  );
  batch.set(
    projectRef,
    {
      customDomain: host,
      customDomainVerified: verified,
      customDomainToken: verificationToken,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  if (prev && prev !== host) {
    const prevRef = db.collection('customDomains').doc(prev);
    const prevSnap = await prevRef.get();
    if (prevSnap.exists && prevSnap.data()?.projectId === projectId) {
      batch.delete(prevRef);
    }
  }

  await batch.commit();
  return {
    host,
    verified,
    verificationToken,
    txtRecord: `gocreate-verify=${verificationToken}`,
    cnameTarget: 'gocreate.web.app',
  };
}

export async function clearCustomDomain({ projectId }) {
  const projectRef = db.collection('projects').doc(projectId);
  const snap = await projectRef.get();
  const project = snap.data() || {};
  const prev = String(project.customDomain || '')
    .trim()
    .toLowerCase();
  const batch = db.batch();
  if (prev) {
    const prevRef = db.collection('customDomains').doc(prev);
    const prevSnap = await prevRef.get();
    if (prevSnap.exists && prevSnap.data()?.projectId === projectId) {
      batch.delete(prevRef);
    }
  }
  batch.set(
    projectRef,
    {
      customDomain: '',
      customDomainVerified: false,
      customDomainToken: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  await batch.commit();
  return { ok: true };
}

export async function resolveCustomDomain(rawHost) {
  const normalized = normalizeHost(rawHost);
  // normalizeHost rejects platform hosts — for resolve, allow reading any non-empty host doc
  let host = String(rawHost || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
  if (host.startsWith('www.')) host = host.slice(4);
  if (!host || PLATFORM_HOSTS.has(host)) {
    return null;
  }
  const snap = await db.collection('customDomains').doc(host).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  return {
    host,
    projectId: data.projectId || null,
    verified: Boolean(data.verified),
    ownerId: data.ownerId || null,
  };
}

export async function verifyCustomDomainDns({ projectId }) {
  const projectRef = db.collection('projects').doc(projectId);
  const snap = await projectRef.get();
  const project = snap.data() || {};
  const host = String(project.customDomain || '')
    .trim()
    .toLowerCase();
  const token = String(project.customDomainToken || '').trim();
  if (!host || !token) {
    const err = new Error('Nenhum domínio personalizado configurado.');
    err.status = 400;
    throw err;
  }

  const expected = `gocreate-verify=${token}`;
  let txtOk = false;
  let cnameOk = false;
  let details = [];

  try {
    const txts = await dns.resolveTxt(host);
    const flat = txts.flat().map((s) => String(s).trim());
    txtOk = flat.some((r) => r === expected || r.includes(expected));
    details.push(txtOk ? 'TXT OK' : `TXT em falta (esperado: ${expected})`);
  } catch (err) {
    details.push(`TXT: ${err.code || err.message || 'falhou'}`);
  }

  try {
    const cnames = await dns.resolveCname(host);
    cnameOk = (cnames || []).some(
      (c) =>
        String(c)
          .toLowerCase()
          .replace(/\.$/, '') === 'gocreate.web.app'
    );
    details.push(
      cnameOk
        ? 'CNAME → gocreate.web.app OK'
        : 'CNAME ainda não aponta para gocreate.web.app (opcional até o domínio estar no Hosting)'
    );
  } catch {
    details.push('CNAME: ainda não resolvido (normal em apex ou antes da propagação)');
  }

  // Require TXT for verified status (ownership proof)
  if (!txtOk) {
    const err = new Error(
      `DNS ainda não verificado. Adiciona o TXT e espera a propagação. ${details.join(' · ')}`
    );
    err.status = 400;
    err.code = 'DNS_PENDING';
    err.details = details;
    throw err;
  }

  const domainRef = db.collection('customDomains').doc(host);
  await domainRef.set(
    {
      verified: true,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  await projectRef.set(
    {
      customDomainVerified: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    ok: true,
    host,
    verified: true,
    cnameOk,
    details,
    hostingNote:
      'Depois do TXT OK, adiciona o mesmo domínio em Firebase Hosting (site gocreate) para o HTTPS servir a app.',
  };
}

export function domainDnsInstructions({ host, verificationToken }) {
  return {
    host,
    records: [
      {
        type: 'TXT',
        name: host,
        value: `gocreate-verify=${verificationToken}`,
        purpose: 'Provar propriedade no GoCreate',
      },
      {
        type: 'CNAME',
        name: host,
        value: 'gocreate.web.app',
        purpose: 'Apontar o hostname para o Hosting GoCreate',
      },
    ],
    hostingSteps: [
      'Firebase Console → Hosting → site gocreate → Add custom domain',
      `Introduz ${host} e completa a verificação Firebase (pode pedir TXT extra)`,
      'Aguarda o certificado SSL (minutos a horas)',
    ],
  };
}
