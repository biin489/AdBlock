(function() {
    const fakeOpen = function(url) {
        window.postMessage({ type: 'ADBLOCK_POPUP', url: url }, '*');
        return null;
    };
    try {
        Object.defineProperty(window, 'open', { 
            get: () => fakeOpen, 
            set: () => {}, 
            configurable: false 
        });
    } catch (e) {
        // Có thể bị chặn bởi các extension khác hoặc trang web đã seal window
        console.warn('[AdBlock] Không thể đóng băng window.open:', e);
    }
})();
