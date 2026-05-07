/* ================================
   BBNL IPTV - SEARCH MODAL
   ================================ */

// Search modal state
var searchModalVisible = false;

// Show search modal
function showSearchModal() {
    var modal = document.getElementById('searchModal');
    if (!modal) {
        // Create modal if it doesn't exist
        modal = document.createElement('div');
        modal.id = 'searchModal';
        modal.className = 'search-modal';
        modal.innerHTML = `
            <div class="search-modal-content">
                <div class="search-modal-header">
                    <h3>Search Channels</h3>
                    <button class="search-modal-close" id="searchModalClose">✕</button>
                </div>
                <div class="search-modal-body">
                    <input type="text" id="searchInput" placeholder="Enter channel name..." class="search-input" />
                    <div class="search-results" id="searchResults"></div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Add event listeners
        var closeBtn = document.getElementById('searchModalClose');
        var searchInput = document.getElementById('searchInput');
        
        closeBtn.addEventListener('click', hideSearchModal);
        searchInput.addEventListener('input', performSearch);
        searchInput.addEventListener('keydown', function(e) {
            if (e.keyCode === 13) { // Enter key
                performSearch();
            } else if (e.keyCode === 461) { // Back key
                hideSearchModal();
            }
        });
        
        // Focus input
        setTimeout(function() {
            if (searchInput) searchInput.focus();
        }, 100);
    } else {
        modal.style.display = 'flex';
        var searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
        }
    }
    searchModalVisible = true;
}

// Hide search modal
function hideSearchModal() {
    var modal = document.getElementById('searchModal');
    if (modal) {
        modal.style.display = 'none';
    }
    searchModalVisible = false;
}

// Perform search
function performSearch() {
    var searchInput = document.getElementById('searchInput');
    var searchResults = document.getElementById('searchResults');
    if (!searchInput || !searchResults) return;
    
    var query = searchInput.value.trim().toLowerCase();
    if (query.length < 2) {
        searchResults.innerHTML = '<p class="search-no-results">Please enter at least 2 characters</p>';
        return;
    }
    
    // Search in channels list (simplified implementation)
    if (typeof allChannels !== 'undefined' && allChannels.length > 0) {
        var results = allChannels.filter(function(channel) {
            var name = (channel.channel_name || channel.chtitle || channel.chname || '').toLowerCase();
            return name.includes(query);
        });
        
        if (results.length === 0) {
            searchResults.innerHTML = '<p class="search-no-results">No channels found</p>';
        } else {
            var resultsHtml = results.slice(0, 10).map(function(channel, index) {
                return `
                    <div class="search-result-item" data-channel-index="${allChannels.indexOf(channel)}">
                        <div class="search-result-logo">
                            <img src="${channel.logo_url || ''}" alt="${channel.channel_name || ''}" onerror="this.src='images/default-channel.png'" />
                        </div>
                        <div class="search-result-info">
                            <div class="search-result-name">${channel.channel_name || channel.chtitle || channel.chname || ''}</div>
                            <div class="search-result-number">${channel.channelno || channel.urno || ''}</div>
                        </div>
                    </div>
                `;
            }).join('');
            
            searchResults.innerHTML = `
                <div class="search-results-list">
                    ${resultsHtml}
                </div>
                ${results.length > 10 ? '<p class="search-more-results">Showing first 10 results. Use channel list for more options.</p>' : ''}
            `;
            
            // Add click handlers
            setTimeout(function() {
                var resultItems = searchResults.querySelectorAll('.search-result-item');
                resultItems.forEach(function(item, index) {
                    item.addEventListener('click', function() {
                        var channelIndex = parseInt(item.getAttribute('data-channel-index'));
                        if (channelIndex >= 0 && channelIndex < allChannels.length) {
                            // Navigate to channels page with selected channel
                            window.location.href = 'channels.html?channel=' + channelIndex;
                        }
                    });
                });
            }, 100);
        }
    }
}
