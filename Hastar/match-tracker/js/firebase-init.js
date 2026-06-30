// Remote sync support has been removed; this file intentionally stays as a no-op.
(function () {
  window.firebaseDb = undefined;
  window.firebaseApp = undefined;
  window.firebaseAuth = undefined;
  window.firebaseAuthReady = Promise.resolve();
})();
