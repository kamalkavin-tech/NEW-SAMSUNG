/**
 * Temporary Debug Script for Ads API
 * Add this script to home.html to diagnose ads loading issues
 */

console.log("🔍 DEBUG: Ads diagnostic script loaded");

// Wait for APIs to load
setTimeout(function() {
    console.log("=".repeat(70));
    console.log("🔍 ADS API DIAGNOSTIC REPORT");
    console.log("=".repeat(70));

    // Check if APIs exist
    console.log("\n1️⃣ API AVAILABILITY:");
    console.log("   - BBNL_API:", typeof BBNL_API !== 'undefined' ? "✅ Available" : "❌ Missing");
    console.log("   - AdsAPI:", typeof AdsAPI !== 'undefined' ? "✅ Available" : "❌ Missing");
    console.log("   - AuthAPI:", typeof AuthAPI !== 'undefined' ? "✅ Available" : "❌ Missing");

    // Check environment
    console.log("\n2️⃣ ENVIRONMENT:");
    console.log("   - webapis:", typeof webapis !== 'undefined' ? "✅ Available" : "❌ Not available");
    console.log("   - tizen:", typeof tizen !== 'undefined' ? "✅ Available" : "❌ Not available");
    console.log("   - location.href:", window.location.href);

    // Check endpoints
    if (typeof API_ENDPOINTS !== 'undefined') {
        console.log("\n3️⃣ ENDPOINTS:");
        console.log("   - IPTV_ADS:", API_ENDPOINTS.IPTV_ADS);
    } else {
        console.log("\n3️⃣ ENDPOINTS:");
        console.log("   - ❌ API_ENDPOINTS not defined!");
    }

    // Test ads API manually
    if (typeof AdsAPI !== 'undefined' && typeof AdsAPI.getHomeAds === 'function') {
        console.log("\n4️⃣ TESTING ADS API:");
        console.log("   🧪 Calling AdsAPI.getHomeAds()...");

        AdsAPI.getHomeAds()
            .then(function(ads) {
                console.log("   ✅ SUCCESS! Received response:");
                console.log("   - Type:", Array.isArray(ads) ? "Array" : typeof ads);
                console.log("   - Length:", ads ? ads.length : 0);
                console.log("   - Data:", ads);

                if (ads && ads.length > 0) {
                    console.log("\n   📸 AD URLS:");
                    ads.forEach(function(ad, i) {
                        console.log("      " + (i+1) + ". " + (ad.adpath || "No adpath"));
                    });
                } else {
                    console.log("   ⚠️ WARNING: No ads returned");
                }
            })
            .catch(function(error) {
                console.error("   ❌ ERROR:", error);
                console.error("   Error message:", error.message);
                console.error("   Error stack:", error.stack);
            });
    } else {
        console.log("\n4️⃣ TESTING ADS API:");
        console.log("   ❌ AdsAPI.getHomeAds() not available!");
    }

    // Check hero banner container
    console.log("\n5️⃣ DOM ELEMENTS:");
    var container = document.getElementById('hero-banner-container');
    if (container) {
        console.log("   ✅ #hero-banner-container exists");
        console.log("   - innerHTML length:", container.innerHTML.length);
        console.log("   - Children count:", container.children.length);
    } else {
        console.log("   ❌ #hero-banner-container NOT FOUND!");
    }

    console.log("\n" + "=".repeat(70));
    console.log("🔍 DIAGNOSTIC COMPLETE - Check results above");
    console.log("=".repeat(70));

}, 1000); // Wait 1 second for everything to load
