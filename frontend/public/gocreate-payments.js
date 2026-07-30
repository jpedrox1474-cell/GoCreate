/**
 * GoCreate Payments runtime — loaded in Sandpack preview + published pages.
 * Generated checkouts call window.GoCreatePayments.createPix / createCheckout.
 *
 * Expects (optional):
 *   window.__GOCREATE_PROJECT_ID__  — project id
 *   window.__GOCREATE_API_BASE__    — origin for /api (default: same origin)
 */
(function (global) {
  if (global.GoCreatePayments) return;

  function apiBase() {
    if (global.__GOCREATE_API_BASE__) return String(global.__GOCREATE_API_BASE__).replace(/\/$/, '');
    try {
      return global.location.origin;
    } catch {
      return 'https://gocreate.web.app';
    }
  }

  function projectId() {
    return global.__GOCREATE_PROJECT_ID__ || null;
  }

  async function createPayment({ amount, description, payerEmail, method }) {
    const pid = projectId();
    if (!pid) {
      const err = new Error(
        'Project ID em falta. Publica o projeto ou define window.__GOCREATE_PROJECT_ID__.'
      );
      err.code = 'NO_PROJECT_ID';
      throw err;
    }

    const res = await fetch(apiBase() + '/api/integrations/mercadopago/public-create-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: pid,
        amount,
        description: description || 'Pagamento',
        payerEmail,
        method: method === 'preference' ? 'preference' : 'pix',
      }),
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      // ignore
    }

    if (!res.ok) {
      const err = new Error(
        (data && (data.message || data.error)) ||
          'Falha ao criar pagamento. Liga o Mercado Pago em Integrações.'
      );
      err.status = res.status;
      err.code = data && data.code;
      throw err;
    }
    return data;
  }

  global.GoCreatePayments = {
    createPix: function (opts) {
      return createPayment(Object.assign({}, opts, { method: 'pix' }));
    },
    createCheckout: function (opts) {
      return createPayment(Object.assign({}, opts, { method: 'preference' })).then(function (data) {
        if (data && data.initPoint) {
          global.location.href = data.initPoint;
        }
        return data;
      });
    },
    version: '1.0.0',
  };
})(typeof window !== 'undefined' ? window : globalThis);
