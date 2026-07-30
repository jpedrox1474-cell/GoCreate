/**
 * Meta Graph API helpers — Instagram Business + Facebook Page.
 * Tokens long-lived + page tokens ficam só no backend (secrets).
 */

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION || 'v19.0';
const GRAPH_API = `https://graph.facebook.com/${GRAPH_VERSION}`;
const PAGE_FIELDS = 'id,name,access_token,instagram_business_account{id,username}';

export function getMetaConfig() {
  const appId = String(process.env.META_APP_ID || '').trim();
  const appSecret = String(process.env.META_APP_SECRET || '').trim();
  return {
    appId,
    appSecret,
    graphVersion: GRAPH_VERSION,
    configured: Boolean(appId && appSecret),
  };
}

export function isMetaConfigured() {
  return getMetaConfig().configured;
}

async function parseJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function exchangeMetaToken(shortToken) {
  const { appId, appSecret } = getMetaConfig();
  if (!appId || !appSecret) return null;
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortToken,
  });
  const res = await fetch(`${GRAPH_API}/oauth/access_token?${params}`);
  const data = await parseJson(res);
  if (!res.ok) {
    const err = new Error(data?.error?.message || 'Falha ao trocar token Meta.');
    err.status = 400;
    err.details = data;
    throw err;
  }
  return data?.access_token || null;
}

function appAccessToken() {
  const { appId, appSecret } = getMetaConfig();
  return `${appId}|${appSecret}`;
}

async function debugMetaToken(inputToken) {
  const params = new URLSearchParams({
    input_token: inputToken,
    access_token: appAccessToken(),
  });
  const res = await fetch(`${GRAPH_API}/debug_token?${params}`);
  const data = await parseJson(res);
  return data?.data || {};
}

function collectTargetIds(granularScopes = []) {
  const ids = new Set();
  for (const entry of granularScopes) {
    const targets = entry?.target_ids || entry?.target_id || [];
    const list = Array.isArray(targets) ? targets : [targets];
    for (const id of list) {
      if (id != null && String(id).length > 0) ids.add(String(id));
    }
  }
  return [...ids];
}

async function fetchPageById(pageId, userToken) {
  try {
    const params = new URLSearchParams({
      fields: PAGE_FIELDS,
      access_token: userToken,
    });
    const res = await fetch(`${GRAPH_API}/${pageId}?${params}`);
    const data = await parseJson(res);
    if (!res.ok) return null;
    return data || null;
  } catch {
    return null;
  }
}

async function fetchAccountsEdge(userToken) {
  try {
    const params = new URLSearchParams({
      fields: PAGE_FIELDS,
      limit: '100',
      access_token: userToken,
    });
    const res = await fetch(`${GRAPH_API}/me/accounts?${params}`);
    const data = await parseJson(res);
    if (!res.ok) return [];
    return data?.data || [];
  } catch {
    return [];
  }
}

async function fetchBusinessPages(userToken) {
  const pages = [];
  try {
    const params = new URLSearchParams({
      fields: 'id,name',
      access_token: userToken,
    });
    const res = await fetch(`${GRAPH_API}/me/businesses?${params}`);
    const data = await parseJson(res);
    if (!res.ok) return pages;
    for (const biz of data?.data || []) {
      for (const edge of ['owned_pages', 'client_pages']) {
        try {
          const pParams = new URLSearchParams({
            fields: PAGE_FIELDS,
            limit: '100',
            access_token: userToken,
          });
          const pagesRes = await fetch(`${GRAPH_API}/${biz.id}/${edge}?${pParams}`);
          const pagesData = await parseJson(pagesRes);
          for (const p of pagesData?.data || []) {
            if (p?.id) pages.push(p);
          }
        } catch {
          /* edge may require extra perms */
        }
      }
    }
  } catch {
    /* ignore */
  }
  return pages;
}

function mergePages(existing, incoming) {
  const byId = new Map();
  for (const p of existing) {
    if (p?.id) byId.set(String(p.id), p);
  }
  for (const p of incoming) {
    if (!p?.id) continue;
    const id = String(p.id);
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, p);
      continue;
    }
    byId.set(id, {
      ...prev,
      ...p,
      access_token: p.access_token || prev.access_token,
      instagram_business_account:
        p.instagram_business_account || prev.instagram_business_account,
    });
  }
  return [...byId.values()];
}

/**
 * Resolve Facebook Pages + Instagram Business (GoCreate).
 */
export async function fetchPagesWithInstagram(longLivedToken) {
  let pages = await fetchAccountsEdge(longLivedToken);

  const debug = await debugMetaToken(longLivedToken).catch(() => ({}));
  const targetIds = collectTargetIds(debug.granular_scopes || []);
  const knownMissing = targetIds.filter((id) => !pages.some((p) => String(p.id) === id));

  if (knownMissing.length) {
    const fetched = await Promise.all(knownMissing.map((id) => fetchPageById(id, longLivedToken)));
    pages = mergePages(pages, fetched.filter(Boolean));
  }

  const hasIg = pages.some((p) => p.instagram_business_account?.id);
  if (!pages.length || !hasIg) {
    const bizPages = await fetchBusinessPages(longLivedToken);
    pages = mergePages(pages, bizPages);
  }

  const needRefresh = pages.filter(
    (p) => p?.id && (!p.access_token || !p.instagram_business_account?.id)
  );
  if (needRefresh.length) {
    const refreshed = await Promise.all(
      needRefresh.map((p) => fetchPageById(p.id, longLivedToken))
    );
    pages = mergePages(pages, refreshed.filter(Boolean));
  }

  return {
    pages,
    debug: {
      scopes: debug.scopes || [],
      granular_scopes: debug.granular_scopes || [],
      targetIds,
    },
  };
}

export default {
  getMetaConfig,
  isMetaConfigured,
  exchangeMetaToken,
  fetchPagesWithInstagram,
};
