/**
 * GoCreate Data runtime — persistence for published / preview apps.
 * Requires project.backendEnabled on the server (POST /api/projects/:id/data).
 *
 * Expects:
 *   window.__GOCREATE_PROJECT_ID__
 *   window.__GOCREATE_API_BASE__ (optional)
 *   window.__GOCREATE_BACKEND_ENABLED__ (optional hint)
 */
(function (global) {
  if (global.GoCreateData) return;

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

  async function request(body) {
    const pid = projectId();
    if (!pid) {
      const err = new Error(
        'Project ID em falta. Publica o projeto ou define window.__GOCREATE_PROJECT_ID__.'
      );
      err.code = 'NO_PROJECT_ID';
      throw err;
    }

    const res = await fetch(apiBase() + '/api/projects/' + encodeURIComponent(pid) + '/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
          'Falha na API de dados. Ative Funções de Backend no GoCreate.'
      );
      err.status = res.status;
      err.code = data && data.code;
      throw err;
    }
    return data;
  }

  global.GoCreateData = {
    isBackendHintEnabled: function () {
      return global.__GOCREATE_BACKEND_ENABLED__ === true;
    },
    list: function (entity) {
      return request({ action: 'list', entity: entity }).then(function (r) {
        return (r && r.rows) || [];
      });
    },
    get: function (entity, id) {
      return request({ action: 'get', entity: entity, id: id });
    },
    create: function (entity, data) {
      return request({ action: 'create', entity: entity, data: data });
    },
    update: function (entity, id, data) {
      return request({ action: 'update', entity: entity, id: id, data: data });
    },
    remove: function (entity, id) {
      return request({ action: 'delete', entity: entity, id: id });
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
