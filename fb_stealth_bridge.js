(function() {
    if (window.__FB_STEALTH_BRIDGE__) return;
    window.__FB_STEALTH_BRIDGE__ = true;

    // Cache to skip elements that haven't changed (LRU, capped at 500)
    const processedMap = new Map();

    // Declared once at module scope — NOT inside the recursive function.
    // Only block RECOMMENDED and SUGGESTED; never ORGANIC/VIRAL (normal friend posts).
    const SUGGESTED_STORY_TYPES = ['RECOMMENDED', 'SUGGESTED'];

    window.addEventListener('FB_ADBLOCK_REQUEST_FIBER', (e) => {
        const requestId = e.detail?.requestId;
        if (!requestId) return;

        const posts = document.querySelectorAll('div[data-pagelet^="FeedUnit"], div[role="article"], div[aria-posinset]');
        const results = [];

        posts.forEach(post => {
            const postId = post.id || post.getAttribute('aria-posinset');
            if (!postId) return;

            if (processedMap.has(postId)) {
                const cached = processedMap.get(postId);
                if (cached) results.push({ id: postId, reason: cached });
                return;
            }

            try {
                const key = Object.keys(post).find(k => k.startsWith('__reactProps$') || k.startsWith('__reactFiber$'));
                if (!key) { processedMap.set(postId, null); return; }

                const props = post[key];
                if (!props) { processedMap.set(postId, null); return; }

                const isAd = checkPropsRecursive(props, 0);

                if (isAd) {
                    const reason = "React Fiber: " + isAd;
                    if (processedMap.size >= 500) processedMap.delete(processedMap.keys().next().value);
                    processedMap.set(postId, reason);
                    results.push({ id: postId, reason });
                } else {
                    if (processedMap.size >= 500) processedMap.delete(processedMap.keys().next().value);
                    processedMap.set(postId, null);
                }
            } catch (err) {}
        });

        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('FB_ADBLOCK_RESPONSE_FIBER', {
                detail: { requestId, results }
            }));
        }, 0);
    });

    function checkPropsRecursive(obj, depth, visited = new WeakSet()) {
        if (!obj || typeof obj !== 'object' || depth > 6 || visited.has(obj)) return null;
        visited.add(obj);

        if (obj.ad_id || obj.adId || obj.ad_fbid) return "Explicit Ad ID found";
        if (obj.is_sponsored === true || obj.isSponsored === true || obj.is_ad === true) return "Sponsored flag found";

        // SUGGESTED_STORY_TYPES is at module scope — not recreated on each recursive call
        if (obj.story_type && SUGGESTED_STORY_TYPES.includes(obj.story_type))
            return "story_type=" + obj.story_type;
        if (obj.node && obj.node.story_type && SUGGESTED_STORY_TYPES.includes(obj.node.story_type))
            return "node.story_type=" + obj.node.story_type;

        if (obj.tracking && (obj.tracking.ad_id || obj.tracking.is_sponsored)) return "Tracking Ad Metadata found";

        if (obj.memoizedProps) return checkPropsRecursive(obj.memoizedProps, depth + 1, visited);

        if (obj.children) {
            if (Array.isArray(obj.children)) {
                for (let i = 0; i < Math.min(obj.children.length, 10); i++) {
                    const found = checkPropsRecursive(obj.children[i], depth + 1, visited);
                    if (found) return found;
                }
            } else {
                return checkPropsRecursive(obj.children, depth + 1, visited);
            }
        }

        if (obj.stateNode && obj.stateNode.props) return checkPropsRecursive(obj.stateNode.props, depth + 1, visited);

        return null;
    }
})();
