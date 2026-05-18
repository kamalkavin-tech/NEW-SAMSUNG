// Small helper to decode HTML entities in strings (e.g. &amp; -> &)
function decodeHtmlEntities(str) {
    if (typeof str !== 'string') return str;
    try {
        var d = document.createElement('div');
        d.innerHTML = str;
        return d.textContent || d.innerText || '';
    } catch (e) {
        return str;
    }
}

// expose globally for older files
window.decodeHtmlEntities = decodeHtmlEntities;
