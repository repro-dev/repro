// Installs a minimal __REACT_DEVTOOLS_GLOBAL_HOOK__ stub before React initialises.
// This runs at document_start in the MAIN world, ensuring the hook is present
// when production React builds call window.__REACT_DEVTOOLS_GLOBAL_HOOK__.inject().
//
// If React DevTools extension is already installed, its hook takes precedence and
// this stub does nothing (first writer wins — the extension's hook is installed
// at the same document_start timing).

;(function () {
  if (
    Object.prototype.hasOwnProperty.call(
      window,
      '__REACT_DEVTOOLS_GLOBAL_HOOK__'
    )
  ) {
    return
  }

  var rendererId = 0
  var renderers = new Map()

  // Minimal event emitter for renderer-attached notifications
  /** @type {Record<string, Function[]>} */
  var listeners = {}
  /** @param {string} event @param {Function} fn */
  function on(event, fn) {
    ;(listeners[event] = listeners[event] || []).push(fn)
  }
  /** @param {string} event @param {Function} fn */
  function off(event, fn) {
    var arr = listeners[event] || []
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] === fn) {
        arr.splice(i, 1)
        return
      }
    }
  }
  /** @param {string} event @param {...any} args */
  function emit(event, args) {
    var arr = listeners[event] || []
    for (var i = 0; i < arr.length; i++) {
      arr[i](args)
    }
  }

  Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
    value: {
      __repro_installed: true,
      isDisabled: false,
      supportsFiber: true,
      renderers: renderers,
      inject: function () {
        var id = ++rendererId
        renderers.set(id, {})
        emit('renderer-attached', { id: id })
        return id
      },
      onCommitFiberRoot: function () {},
      onCommitFiberUnmount: function () {},
      onPostCommitFiberRoot: function () {},
      // Minimal event emitter interface for forward-compatibility
      on: on,
      off: off,
    },
    configurable: false,
    writable: false,
  })
})()
