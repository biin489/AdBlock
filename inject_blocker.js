(function() {
    const fakeOpen = function() {
        return null;
    };
    try {
        Object.defineProperty(window, 'open', {
            get: () => fakeOpen,
            set: () => {},
            configurable: false
        });
    } catch (e) {
        // May be blocked by another extension or a page that has sealed window.open
    }
})();
