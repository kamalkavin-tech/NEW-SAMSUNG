/**
 * BBNL Logger Utility - Controls debug logging across the app
 * In production, set BBNL_DEBUG = false to disable all non-critical logs
 * This improves performance by reducing JS thread blocking from console.log calls
 */

// Set to false in production, true in development
window.BBNL_DEBUG = window.BBNL_DEBUG || false;

// Optional: Enable debug mode for specific components
window.BBNL_DEBUG_COMPONENTS = window.BBNL_DEBUG_COMPONENTS || {};

var BBNLLogger = {
    /**
     * Debug-level logging (only in debug mode)
     */
    debug: function(tag, message, details) {
        if (!window.BBNL_DEBUG) return;
        if (typeof console !== 'undefined' && console.log) {
            if (details !== undefined) {
                console.log('[' + tag + '] ' + message, details);
            } else {
                console.log('[' + tag + '] ' + message);
            }
        }
    },

    /**
     * Info-level logging (only in debug mode)
     */
    info: function(tag, message, details) {
        if (!window.BBNL_DEBUG) return;
        if (typeof console !== 'undefined' && console.log) {
            if (details !== undefined) {
                console.log('[' + tag + '] ' + message, details);
            } else {
                console.log('[' + tag + '] ' + message);
            }
        }
    },

    /**
     * Warning-level logging (limited)
     */
    warn: function(tag, message, details) {
        if (typeof console !== 'undefined' && console.warn) {
            if (details !== undefined) {
                console.warn('[' + tag + '] ' + message, details);
            } else {
                console.warn('[' + tag + '] ' + message);
            }
        }
    },

    /**
     * Error-level logging (always)
     */
    error: function(tag, message, details) {
        if (typeof console !== 'undefined' && console.error) {
            if (details !== undefined) {
                console.error('[' + tag + '] ' + message, details);
            } else {
                console.error('[' + tag + '] ' + message);
            }
        }
    },

    /**
     * Conditional logging for specific components
     */
    debugComponent: function(component, message, details) {
        if (!window.BBNL_DEBUG && !window.BBNL_DEBUG_COMPONENTS[component]) return;
        if (typeof console !== 'undefined' && console.log) {
            if (details !== undefined) {
                console.log('[' + component + '] ' + message, details);
            } else {
                console.log('[' + component + '] ' + message);
            }
        }
    }
};

// ==========================================
// SAMSUNG TIZEN PRODUCTION LOGGING OVERRIDE
// ==========================================
// In accordance with Samsung Tizen performance guidelines, all console logging methods 
// (log, warn, info, error) block the main JavaScript thread and degrade TV performance.
// When BBNL_DEBUG is false, we replace them with no-op functions to ensure zero thread blocking.
if (!window.BBNL_DEBUG) {
    if (typeof console !== 'undefined') {
        console.log = function() {};
        console.warn = function() {};
        console.info = function() {};
        console.error = function() {};
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BBNLLogger;
}
