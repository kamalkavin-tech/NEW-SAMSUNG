/**
 * Image Optimizer - Lazy load and optimize image loading for Samsung TV
 * Reduces initial load time by deferring off-screen image loads
 */

var ImageOptimizer = {
    /**
     * Initialize native lazy loading for images
     * Automatically loads images when they're close to viewport
     */
    initializeLazyLoading: function() {
        if (!window.IntersectionObserver) {
            // Fallback for older browsers - load all immediately
            this._loadAllImages();
            return;
        }

        var images = document.querySelectorAll('img[data-lazy="true"]');
        if (images.length === 0) return;

        var lazyImageObserver = new IntersectionObserver(function(entries, observer) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    var img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                        img.removeAttribute('data-lazy');
                    }
                    observer.unobserve(img);
                }
            });
        }, {
            rootMargin: '50px' // Load images 50px before they're visible
        });

        images.forEach(function(img) {
            lazyImageObserver.observe(img);
        });
    },

    /**
     * Fallback for browsers without IntersectionObserver
     */
    _loadAllImages: function() {
        var images = document.querySelectorAll('img[data-lazy="true"]');
        images.forEach(function(img) {
            if (img.dataset.src) {
                img.src = img.dataset.src;
            }
        });
    },

    /**
     * Mark an image for lazy loading
     * Usage: <img data-lazy="true" data-src="actual-image.jpg" src="placeholder.gif" />
     */
    markForLazyLoading: function(imgElement, actualSrc) {
        if (!imgElement) return;
        imgElement.setAttribute('data-lazy', 'true');
        imgElement.setAttribute('data-src', actualSrc);
        // Use tiny placeholder by default
        if (!imgElement.src || imgElement.src.indexOf('placeholder') === -1) {
            imgElement.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        }
    },

    /**
     * Optimize images on a container
     * Converts all img tags to lazy load where supported
     */
    optimizeContainer: function(container) {
        if (!container) return;
        
        var images = container.querySelectorAll('img');
        images.forEach(function(img) {
            // Skip if already lazy loaded or has loading attribute
            if (img.getAttribute('loading') === 'lazy' || img.getAttribute('data-lazy')) {
                return;
            }
            
            // Use native lazy loading if available
            if ('loading' in img) {
                img.loading = 'lazy';
            } else {
                // Fallback to our lazy loader
                var src = img.src;
                if (src && src.indexOf('data:') !== 0) { // Don't lazy-load data URIs
                    ImageOptimizer.markForLazyLoading(img, src);
                }
            }
        });
    },

    /**
     * Preload critical images above the fold
     */
    preloadCriticalImages: function(urls) {
        if (!Array.isArray(urls)) return;
        
        urls.forEach(function(url) {
            if (!url) return;
            var link = document.createElement('link');
            link.rel = 'preload';
            link.as = 'image';
            link.href = url;
            document.head.appendChild(link);
        });
    },

    /**
     * Cleanup lazy load observers (call on page unload)
     */
    cleanup: function() {
        var images = document.querySelectorAll('img[data-lazy="true"]');
        images.forEach(function(img) {
            img.removeAttribute('data-lazy');
            img.removeAttribute('data-src');
        });
    }
};

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        ImageOptimizer.initializeLazyLoading();
    });
} else {
    // DOM already loaded
    ImageOptimizer.initializeLazyLoading();
}
