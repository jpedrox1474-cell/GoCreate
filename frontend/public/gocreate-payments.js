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
      return 'https://gocreate-app.web.app';
    }
  }

  function projectId() {
    return global.__GOCREATE_PROJECT_ID__ || null;
  }

  function friendlyErrorMessage(raw, code) {
    var msg = String(raw || '');
    if (
      code === 'MP_LIVE_CREDENTIALS_UNAUTHORIZED' ||
      /unauthorized use of live credentials/i.test(msg)
    ) {
      return (
        'Pagamento Pix indisponível: credenciais Mercado Pago de teste incompatíveis. ' +
        'No GoCreate, use um Access Token TEST- (Checkout API) em MERCADOPAGO_TEST_ACCESS_TOKEN.'
      );
    }
    if (code === 'MP_PAYER_EMAIL_FORBIDDEN' || /payer email forbidden/i.test(msg)) {
      return 'E-mail do pagador não permitido. Use um e-mail válido (ex.: comprador@email.com).';
    }
    if (code === 'MP_NOT_CONNECTED' || code === 'NO_PROJECT_ID') {
      return msg || 'Mercado Pago não configurado.';
    }
    return msg || 'Falha ao criar pagamento. Tente novamente.';
  }

  function ensureToastStyles() {
    if (global.document.getElementById('gc-payments-toast-style')) return;
    var style = global.document.createElement('style');
    style.id = 'gc-payments-toast-style';
    style.textContent =
      '#gc-payments-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);' +
      'z-index:2147483647;max-width:min(440px,92vw);padding:12px 16px;border-radius:10px;' +
      'background:#1c1917;color:#fafaf9;font:14px/1.45 system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.28);' +
      'opacity:0;transition:opacity .2s ease}' +
      '#gc-payments-toast.gc-show{opacity:1}' +
      '#gc-payments-toast.gc-error{background:#7f1d1d}' +
      '#gc-payments-toast.gc-ok{background:#14532d}';
    global.document.head.appendChild(style);
  }

  function showToast(message, type) {
    try {
      if (global.GoCreateUI && typeof global.GoCreateUI.toast === 'function') {
        global.GoCreateUI.toast(message, type === 'ok' || type === 'success' ? 'ok' : type || 'error');
        return;
      }
      if (!global.document || !global.document.body) return;
      ensureToastStyles();
      var el = global.document.getElementById('gc-payments-toast');
      if (!el) {
        el = global.document.createElement('div');
        el.id = 'gc-payments-toast';
        el.setAttribute('role', 'status');
        global.document.body.appendChild(el);
      }
      el.className = type === 'ok' ? 'gc-ok' : 'gc-error';
      el.textContent = String(message || '');
      // force reflow for transition
      void el.offsetWidth;
      el.classList.add('gc-show');
      clearTimeout(el._gcTimer);
      el._gcTimer = setTimeout(function () {
        el.classList.remove('gc-show');
      }, 5200);
    } catch {
      // ignore — never fall back to alert()
    }
  }

  async function createPayment({ amount, description, payerEmail, method }) {
    var pid = projectId();
    if (!pid) {
      var missing = new Error(
        'Project ID em falta. Publica o projeto ou define window.__GOCREATE_PROJECT_ID__.'
      );
      missing.code = 'NO_PROJECT_ID';
      showToast(friendlyErrorMessage(missing.message, missing.code), 'error');
      throw missing;
    }

    var res = await fetch(apiBase() + '/api/integrations/mercadopago/public-create-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: pid,
        amount: amount,
        description: description || 'Pagamento',
        payerEmail: payerEmail,
        method: method === 'preference' ? 'preference' : 'pix',
      }),
    });

    var data = null;
    try {
      data = await res.json();
    } catch {
      // ignore
    }

    if (!res.ok) {
      var rawMsg =
        (data && (data.message || data.error)) ||
        'Falha ao criar pagamento. Liga o Mercado Pago em Integrações.';
      var code = data && data.code;
      var friendly = friendlyErrorMessage(rawMsg, code);
      var err = new Error(friendly);
      err.status = res.status;
      err.code = code;
      showToast(friendly, 'error');
      throw err;
    }
    return data;
  }

  global.GoCreatePayments = {
    createPix: function (opts) {
      return createPayment(Object.assign({}, opts || {}, { method: 'pix' }));
    },
    createCheckout: function (opts) {
      return createPayment(Object.assign({}, opts || {}, { method: 'preference' })).then(function (
        data
      ) {
        if (data && data.initPoint) {
          global.location.href = data.initPoint;
        }
        return data;
      });
    },
    showToast: showToast,
    version: '1.1.0',
  };
})(typeof window !== 'undefined' ? window : globalThis);
