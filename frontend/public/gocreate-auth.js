/**
 * GoCreate Auth runtime — Sandpack preview + published /p/* pages.
 * Generated apps call window.GoCreateAuth.signInWithGoogle() for real Firebase Google Auth.
 *
 * Expects (optional):
 *   window.__GOCREATE_FIREBASE_CONFIG__ — public Firebase web config
 *   window.__GOCREATE_PROJECT_ID__      — project id (for future scoped auth)
 */
(function (global) {
  if (global.GoCreateAuth) return;

  var FIREBASE_VERSION = '10.14.1';
  var readyPromise = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        if (existing.dataset.loaded === '1') return resolve();
        existing.addEventListener('load', function () {
          resolve();
        });
        existing.addEventListener('error', function () {
          reject(new Error('Falha ao carregar ' + src));
        });
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () {
        s.dataset.loaded = '1';
        resolve();
      };
      s.onerror = function () {
        reject(new Error('Falha ao carregar ' + src));
      };
      document.head.appendChild(s);
    });
  }

  function serializeUser(user) {
    if (!user) return null;
    return {
      uid: user.uid,
      email: user.email || null,
      displayName: user.displayName || null,
      photoURL: user.photoURL || null,
      emailVerified: Boolean(user.emailVerified),
      providerId: (user.providerData && user.providerData[0] && user.providerData[0].providerId) || 'google.com',
    };
  }

  function ensureFirebase() {
    if (readyPromise) return readyPromise;
    readyPromise = (async function () {
      var config = global.__GOCREATE_FIREBASE_CONFIG__;
      if (!config || !config.apiKey || !config.authDomain || !config.projectId) {
        var err = new Error(
          'Firebase config em falta. Publica o app no GoCreate ou define window.__GOCREATE_FIREBASE_CONFIG__.'
        );
        err.code = 'NO_FIREBASE_CONFIG';
        throw err;
      }

      var base = 'https://www.gstatic.com/firebasejs/' + FIREBASE_VERSION + '/';
      if (!global.firebase || !global.firebase.app) {
        await loadScript(base + 'firebase-app-compat.js');
      }
      if (!global.firebase || !global.firebase.auth) {
        await loadScript(base + 'firebase-auth-compat.js');
      }

      if (!global.firebase.apps || !global.firebase.apps.length) {
        global.firebase.initializeApp(config);
      }
      return global.firebase.auth();
    })();
    return readyPromise;
  }

  global.GoCreateAuth = {
    signInWithGoogle: function () {
      return ensureFirebase().then(function (auth) {
        var provider = new global.firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        return auth.signInWithPopup(provider).then(function (result) {
          return serializeUser(result.user);
        });
      });
    },
    signOut: function () {
      return ensureFirebase().then(function (auth) {
        return auth.signOut();
      });
    },
    getCurrentUser: function () {
      return ensureFirebase().then(function (auth) {
        return serializeUser(auth.currentUser);
      });
    },
    onAuthStateChanged: function (callback) {
      if (typeof callback !== 'function') {
        return function () {};
      }
      var unsub = null;
      var cancelled = false;
      ensureFirebase().then(function (auth) {
        if (cancelled) return;
        unsub = auth.onAuthStateChanged(function (user) {
          callback(serializeUser(user));
        });
      });
      return function () {
        cancelled = true;
        if (typeof unsub === 'function') unsub();
      };
    },
    version: '1.0.0',
  };
})(typeof window !== 'undefined' ? window : globalThis);
