/* ================================
   BBNL IPTV - CHANNELS PAGE CONTROLLER
   ================================ */

var focusables = [];
var currentFocus = 0;
var allChannels = []; // Store fetched channels
var currentCategory = "All"; // Store selected category

window.onload = function () {
    console.log("=== BBNL Channels Page Initialized ===");

    // Initialize UI
    initPage();

    // Register Keys
    try {
        var keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Return"];
        tizen.tvinputdevice.registerKeyBatch(keys);
    } catch (e) { }
};

async function initPage() {
    // 1. Fetch Categories
    const categoryContainer = document.getElementById("category-container");
    categoryContainer.innerHTML = '<div class="loading-label">Loading Categories...</div>';

    try {
        // Fetch Categories
        let catResponse = await BBNL_API.getCategoryList();

        // --- REAL API PARSING LOGIC START ---
        if (catResponse && catResponse.body && Array.isArray(catResponse.body)) {
            if (catResponse.body.length > 0 && catResponse.body[0].categories) {
                catResponse = catResponse.body[0].categories;
            } else {
                catResponse = catResponse.body;
            }
        }
        // --- REAL API PARSING LOGIC END ---

        if (Array.isArray(catResponse)) {
            renderCategories(catResponse);
        } else {
            const debugMsg = catResponse ? (catResponse.message || JSON.stringify(catResponse)) : "Null Response";
            categoryContainer.innerHTML = '<div class="error-label" style="color:red; font-size:14px;">Error: ' + debugMsg + '</div>';
            console.error("Category Load Failed", catResponse);
        }

        // Fetch Languages
        const langResponse = await BBNL_API.getLanguageList();
        console.log("Languages Fetched:", langResponse);

    } catch (e) {
        console.error("Init Exception:", e);
        categoryContainer.innerHTML = '<div class="error-label">Error Loading Page</div>';
    }

    // 2. Fetch Channels (Initial load)
    await loadChannels();

    // 3. Refresh Focusables
    refreshFocusables();
}

function renderCategories(categories) {
    const container = document.getElementById("category-container");
    container.innerHTML = ""; // Clear loader

    // Add 'All' Filter manually if not present
    const allBtn = document.createElement("button");
    allBtn.className = "filter-chip focusable active";
    allBtn.tabIndex = 0;
    allBtn.innerText = "All";
    allBtn.dataset.category = "All";
    currentCategory = "All";

    allBtn.addEventListener("click", () => handleCategorySelect(allBtn, "All"));
    container.appendChild(allBtn);

    categories.forEach((cat) => {
        // The API key for name can be 'grtitle' or 'category_name'
        const catName = cat.grtitle || cat.category_name || "Unknown";

        // Avoid duplicates like "All Channels" since we added "All" manually
        if (catName.toLowerCase().includes("all channel")) return;

        // Important: Store 'grid' ID for filtering if available
        const catId = cat.grid || cat.id || "";

        const btn = document.createElement("button");
        btn.className = "filter-chip focusable";
        btn.tabIndex = 0;
        btn.innerText = catName;
        btn.dataset.category = catName;
        btn.dataset.id = catId; // Store hidden ID

        // Add click listener
        btn.addEventListener("click", () => {
            handleCategorySelect(btn, catName, catId);
        });

        container.appendChild(btn);
    });
}

function handleCategorySelect(btn, categoryName, catId) {
    // UI Update
    document.querySelectorAll(".filter-chip").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    currentCategory = categoryName;

    // Filter Channels
    filterAndRenderChannels(catId);
}

async function loadChannels() {
    const container = document.getElementById("channel-grid-container");
    container.innerHTML = '<div class="loading-label">Loading Channels...</div>';

    try {
        let response = await BBNL_API.getChannelList();

        // --- REAL API PARSING LOGIC START ---
        if (response && response.body && Array.isArray(response.body)) {
            response = response.body;
        }
        // --- REAL API PARSING LOGIC END ---

        if (Array.isArray(response)) {
            allChannels = response;
            filterAndRenderChannels();
        } else {
            const debugMsg = response ? (response.message || JSON.stringify(response)) : "Null Response";
            container.innerHTML = '<div class="error-label" style="color:red; font-size:14px;">Error: ' + debugMsg + '</div>';
            console.error("Channel Load Failed", response);
        }
    } catch (e) {
        container.innerHTML = '<div class="error-label" style="color:red;">Exception: ' + e.message + '</div>';
    }
}

function filterAndRenderChannels(filterId) {
    const container = document.getElementById("channel-grid-container");
    container.innerHTML = ""; // Clear existing

    // Filter Logic
    let displayChannels = allChannels;

    // If a specific ID is provided (from category 'grid' property), use it.
    if (filterId && currentCategory !== "All") {
        displayChannels = allChannels.filter(ch => ch.grid == filterId);
    } else if (currentCategory !== "All") {
        // Fallback to name matching if no ID (e.g. mock data)
        displayChannels = allChannels.filter(ch => {
            const chCat = ch.category_name || ch.category || "";
            return chCat.toLowerCase() === currentCategory.toLowerCase();
        });
    }

    if (displayChannels.length === 0) {
        container.innerHTML = '<div class="empty-label">No channels found</div>';
        refreshFocusables();
        return;
    }

    // --- SECTIONS LOGIC (Matching Image Layout) ---
    // Section 1: Top List (Implicit "Live" or just first batch) -> First 5
    // Section 2: "Mostly Viewed Channels" -> Next 5
    // Section 3: "Others Channels" -> Rest

    // In a real scenario, these would come from different API endpoints or flags.
    // We are simulating the "Layout" requested by the user using the single list we have.

    const topChannels = displayChannels.slice(0, 5);
    const mostlyViewed = displayChannels.slice(5, 10);
    const others = displayChannels.slice(10);

    // Render Top Section (No Header, just grid)
    if (topChannels.length > 0) {
        renderSection(container, null, topChannels);
    }

    // Render "Mostly Viewed"
    if (mostlyViewed.length > 0) {
        renderSection(container, "Mostly Viewed Channels", mostlyViewed);
    }

    // Render "Others"
    if (others.length > 0) {
        renderSection(container, "Others Channels", others);
    }

    refreshFocusables();
}

function renderSection(container, titleText, channels) {
    // Section Title
    if (titleText) {
        const header = document.createElement("div");
        header.className = "section-header";
        header.innerText = titleText;
        container.appendChild(header);
    }

    // Grid Container
    const grid = document.createElement("div");
    grid.className = "grid-5";

    channels.forEach(ch => {
        // Channel Data Mapping
        const chName = ch.chtitle || ch.channel_name || "Channel";
        const chLogo = ch.chlogo || ch.logo_url || "";
        const streamLink = ch.streamlink || ch.channel_url || "";

        let isLive = true;

        // Group
        const group = document.createElement("div");
        group.className = "channel-group";

        // Card
        const card = document.createElement("div");
        card.className = "channel-card focusable";
        card.tabIndex = 0;
        card.dataset.url = streamLink;
        card.dataset.name = chName;

        // --- LOGO / ICON AREA ---
        const iconDiv = document.createElement("div");
        iconDiv.className = "channel-icon";

        // Add Live Badge
        if (isLive) {
            const badge = document.createElement("div");
            badge.className = "live-badge";
            badge.innerHTML = '<div class="live-dot"></div> LIVE';
            iconDiv.appendChild(badge);
        }

        if (chLogo && !chLogo.includes("chnlnoimage")) {
            const img = document.createElement("img");
            img.src = chLogo;
            img.alt = chName;
            // Styling
            img.style.maxWidth = "70%";
            img.style.maxHeight = "70%";
            img.style.objectFit = "contain";
            iconDiv.appendChild(img);
        } else {
            // Text Fallback
            const fallback = document.createElement("div");
            fallback.innerText = chName.substring(0, 4);
            fallback.style.fontWeight = "bold";
            fallback.style.fontSize = "24px";
            fallback.style.color = "#333";
            iconDiv.appendChild(fallback);
        }
        card.appendChild(iconDiv);
        // ------------------------

        // Title Bottom
        const title = document.createElement("div");
        title.className = "card-title-bottom";
        title.innerText = chName;

        // Subtitle ("live Channels")
        const sub = document.createElement("div");
        sub.className = "card-subtitle-bottom";
        sub.innerText = "live Channels";

        group.appendChild(card);
        group.appendChild(title);
        group.appendChild(sub);

        grid.appendChild(group);

        // Click Listener
        card.addEventListener("click", () => handleEnter(card));

        // Focus Listener (Mouse Hover)
        card.addEventListener("mouseenter", () => {
            const idx = Array.from(focusables).indexOf(card);
            if (idx >= 0) {
                currentFocus = idx;
                card.focus();
            }
        });
    });

    container.appendChild(grid);
}

function refreshFocusables() {
    focusables = document.querySelectorAll(".focusable");
    // Ensure we don't lose focus
    if (focusables.length > 0) {
        let hasFocus = false;
        for (let i = 0; i < focusables.length; i++) {
            if (document.activeElement === focusables[i]) {
                currentFocus = i;
                hasFocus = true;
                break;
            }
        }

        if (!hasFocus) {
            currentFocus = 0;
            focusables[0].focus();
        }
    }
}

// Navigation Logic (Sidebar + Grid Awareness)
document.addEventListener("keydown", function (e) {
    var code = e.keyCode;
    if (code === 10009) { window.history.back(); return; }

    const active = document.activeElement;
    const isSidebar = active.classList.contains("filter-chip");
    const isGrid = active.classList.contains("channel-card") || active.classList.contains("back-btn") || active.tagName === "INPUT";

    if (code === 37) { // LEFT
        if (isGrid) {
            // If in grid, try to move focus left.
            // If we are at the left-most edge or it's a back button, maybe jump to sidebar?
            // Actually, let's keep it simple: Standard moveFocus first.
            // If focus didn't change (hit edge), jump to sidebar.
            const before = document.activeElement;
            moveFocus(-1);
            if (document.activeElement === before) {
                // Hit left wall? Jump to sidebar active item
                focusSidebar();
            }
        }
    }

    if (code === 38) { // UP
        if (isGrid) moveFocus(-5);
        else moveFocus(-1);
    }

    if (code === 39) { // RIGHT
        if (isSidebar) {
            // Jump from Sidebar to Grid
            focusGrid();
        } else {
            moveFocus(1);
        }
    }

    if (code === 40) { // DOWN
        if (isGrid) moveFocus(5);
        else moveFocus(1);
    }

    if (code === 13) handleEnter(document.activeElement);
});

function focusSidebar() {
    // Focus the 'active' chip or the first one
    const activeChip = document.querySelector(".filter-chip.active");
    if (activeChip) activeChip.focus();
    else {
        const first = document.querySelector(".filter-chip");
        if (first) first.focus();
    }
}

function focusGrid() {
    // Focus the first channel card
    const firstCard = document.querySelector(".channel-card");
    if (firstCard) firstCard.focus();
    else {
        // Fallback to back button or search if empty
        const back = document.querySelector(".back-btn");
        if (back) back.focus();
    }
}

function moveFocus(step) {
    const all = Array.from(document.querySelectorAll(".focusable"));
    const idx = all.indexOf(document.activeElement);

    if (idx === -1 && all.length > 0) {
        all[0].focus();
        return;
    }

    // Simple linear navigation for now, restricting wrapping if needed, but linear is often okay for simple implementation.
    // However, crossing between Sidebar (start of DOM) and Grid (end of DOM) linearly is confusing.
    // We need to filter 'all' based on current container? 
    // Let's rely on the DOM order: Sidebar items -> Grid items.

    let next = idx + step;
    if (next >= 0 && next < all.length) {
        all[next].focus();
        all[next].scrollIntoView({ block: "center", behavior: "smooth" });
    }
}

function handleEnter(el) {
    if (!el) el = document.activeElement;
    if (el.classList.contains('back-btn')) { window.location.href = "home.html"; return; }
    if (el.classList.contains('filter-chip')) { el.click(); return; }
    if (el.classList.contains('channel-card')) {
        console.log("Play Channel:", el.dataset.name, el.dataset.url);
        alert("Playing: " + el.dataset.name);
        return;
    }
}
