/* ================================
   BBNL IPTV – ADS API (UPDATED)
   ================================ */

// NOTE: This file extends AdsAPI from api.js
// Make sure api.js is loaded BEFORE this file

(function() {
    'use strict';

    // Check if AdsAPI already exists from api.js
    if (typeof window.AdsAPI === 'undefined') {
        console.error('[ads.js] AdsAPI not found! Make sure api.js is loaded first.');
        return;
    }

    console.log('[ads.js] AdsAPI extensions loaded');

    // Add any additional ad-related utilities here if needed
    // The main AdsAPI is already defined in api.js

    // Helper function: Create ad slider (if not already in api.js)
    if (!window.AdsAPI.createSlider) {
        window.AdsAPI.createSlider = function(containerId, ads, interval) {
            interval = interval || 5000;
            var container = document.getElementById(containerId);

            if (!container || !ads || ads.length === 0) {
                console.warn('[AdsAPI] Cannot create slider: invalid container or no ads');
                return;
            }

            container.innerHTML = "";
            var currentIndex = 0;

            ads.forEach(function(ad, index) {
                var img = document.createElement("img");
                img.src = ad.adpath || ad.path || ad.imageUrl;
                img.className = "ad-slide";
                img.style.display = index === 0 ? "block" : "none";
                img.style.width = "100%";
                img.style.height = "100%";
                img.style.objectFit = "cover";

                img.onerror = function() {
                    console.error('[AdsAPI] Failed to load ad image:', img.src);
                    img.style.display = 'none';
                };

                container.appendChild(img);
            });

            if (ads.length > 1) {
                setInterval(function() {
                    var slides = container.querySelectorAll(".ad-slide");
                    if (slides.length === 0) return;

                    slides[currentIndex].style.display = "none";
                    currentIndex = (currentIndex + 1) % slides.length;
                    slides[currentIndex].style.display = "block";
                }, interval);
            }

            console.log('[AdsAPI] Slider created with', ads.length, 'ads');
        };
    }

})();
