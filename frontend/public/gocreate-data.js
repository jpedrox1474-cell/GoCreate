/**
 * GoCreate Data runtime — persistence for published / preview apps.
 * Requires project.backendEnabled on the server (POST /api/projects/:id/data).
 *
 * Expects:
 *   window.__GOCREATE_PROJECT_ID__
 *   window.__GOCREATE_API_BASE__ (optional; defaults to gocreate-app production)
 *   window.__GOCREATE_BACKEND_ENABLED__ (optional hint)
 */
(function (global) {
  if (global.GoCreateData) return;

  var FALLBACK_API = 'https://gocreate-app.web.app';

  function looksLikeSandpackOrigin(origin) {
    if (!origin || typeof origin !== 'string') return true;
    try {
      var host = new URL(origin).hostname.toLowerCase();
      return (
        host.indexOf('csb.app') !== -1 ||
        host.indexOf('codesandbox') !== -1 ||
        host.indexOf('sandpack') !== -1 ||
        host === 'localhost' ||
        host === '127.0.0.1'
      );
    } catch (_) {
      return true;
    }
  }

  function apiBase() {
    if (global.__GOCREATE_API_BASE__) {
      return String(global.__GOCREATE_API_BASE__).replace(/\/$/, '');
    }
    try {
      var origin = global.location && global.location.origin;
      if (origin && !looksLikeSandpackOrigin(origin)) return origin.replace(/\/$/, '');
    } catch (_) {
      /* ignore */
    }
    return FALLBACK_API;
  }

  function projectId() {
    var pid = global.__GOCREATE_PROJECT_ID__;
    if (!pid || pid === 'null' || pid === 'undefined') return null;
    return String(pid);
  }

  function showToast(message, type) {
    try {
      var el = document.createElement('div');
      el.setAttribute('role', 'status');
      el.textContent = message;
      el.style.cssText =
        'position:fixed;z-index:2147483647;left:50%;bottom:24px;transform:translateX(-50%);' +
        'max-width:min(420px,92vw);padding:10px 14px;border-radius:10px;font:13px/1.4 system-ui,sans-serif;' +
        'box-shadow:0 8px 24px rgba(0,0,0,.35);color:#fff;' +
        (type === 'error'
          ? 'background:#b91c1c;'
          : type === 'info'
            ? 'background:#1e3a5f;'
            : 'background:#15803d;');
      document.body.appendChild(el);
      setTimeout(function () {
        try {
          el.remove();
        } catch (_) {
          /* ignore */
        }
      }, 3200);
    } catch (_) {
      /* ignore */
    }
  }

  function friendlyError(res, data) {
    var code = data && data.code;
    if (code === 'BACKEND_REQUIRED' || (res && res.status === 403 && code === 'BACKEND_REQUIRED')) {
      return (
        (data && (data.message || data.error)) ||
        'Funções de Backend desativadas. Ative em Configurações do projeto no GoCreate (grátis).'
      );
    }
    if (code === 'ENTITY_ACCESS_DENIED') {
      return (data && (data.message || data.error)) || 'Sem permissão para esta entidade.';
    }
    if (res && res.status === 404) {
      return (data && (data.message || data.error)) || 'Projeto ou registo não encontrado.';
    }
    if (res && res.status >= 500) {
      return (data && (data.message || data.error)) || 'Erro no servidor ao guardar dados. Tente novamente.';
    }
    return (
      (data && (data.message || data.error)) ||
      'Falha ao comunicar com a API de dados do GoCreate.'
    );
  }

  async function request(body, opts) {
    opts = opts || {};
    var pid = projectId();
    if (!pid) {
      var noId = new Error(
        'Project ID em falta. Abra o preview no editor GoCreate ou publique o projeto.'
      );
      noId.code = 'NO_PROJECT_ID';
      if (opts.toast !== false) showToast(noId.message, 'error');
      throw noId;
    }

    var headers = { 'Content-Type': 'application/json' };
    try {
      if (global.__GOCREATE_API_KEY__) {
        headers['X-GoCreate-Key'] = String(global.__GOCREATE_API_KEY__);
      }
    } catch (_) {
      /* ignore */
    }

    var url = apiBase() + '/api/projects/' + encodeURIComponent(pid) + '/data';
    var res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
      });
    } catch (netErr) {
      var net = new Error(
        'Rede/CORS: não foi possível contactar a API (' +
          apiBase() +
          '). Confirma que o preview carregou o runtime GoCreate.'
      );
      net.code = 'NETWORK_ERROR';
      net.cause = netErr;
      if (opts.toast !== false) showToast(net.message, 'error');
      throw net;
    }

    var data = null;
    try {
      data = await res.json();
    } catch (_) {
      // ignore
    }

    if (!res.ok) {
      var err = new Error(friendlyError(res, data));
      err.status = res.status;
      err.code = data && data.code;
      if (opts.toast !== false) {
        showToast(err.message, err.code === 'BACKEND_REQUIRED' ? 'info' : 'error');
      }
      throw err;
    }

    if (opts.successToast) {
      showToast(opts.successToast, 'success');
    }
    return data;
  }

  global.GoCreateData = {
    isBackendHintEnabled: function () {
      return global.__GOCREATE_BACKEND_ENABLED__ === true;
    },
    list: function (entity) {
      return request({ action: 'list', entity: entity }, { toast: false }).then(function (r) {
        return (r && r.rows) || [];
      });
    },
    get: function (entity, id) {
      return request({ action: 'get', entity: entity, id: id }, { toast: false });
    },
    create: function (entity, data) {
      return request(
        { action: 'create', entity: entity, data: data },
        { successToast: 'Dados guardados.' }
      );
    },
    update: function (entity, id, data) {
      return request(
        { action: 'update', entity: entity, id: id, data: data },
        { successToast: 'Alterações guardadas.' }
      );
    },
    remove: function (entity, id) {
      return request(
        { action: 'delete', entity: entity, id: id },
        { successToast: 'Registo removido.' }
      );
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
