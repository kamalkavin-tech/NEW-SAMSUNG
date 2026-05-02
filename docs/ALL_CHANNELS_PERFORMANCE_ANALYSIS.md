# All Channels — Slow Selection + Slow Open: Analysis & Solution Plan

Date: 2026-05-01
Project: NEW-SAMSUNG (Tizen TV Web App)
Status: **Awaiting approval** — no code change yet.
Constraint: No flow / format / theme changes. Performance fixes only.

---

## What you reported

> "When I'm in the All Channels category in the menu and I pick a channel, it takes time to reflect on the player screen. And when I open the menu it also takes time to reflect."

Two distinct slownesses, both scoped to **All Channels** tab (and likely **Subscribed** too, since they share the flat-list render path):
- **Slow A — opening the menu** in All Channels.
- **Slow B — picking a channel** from All Channels (lag before the new selection becomes visibly active).

Both are real and measurable. Specific-language tabs (Tamil, Hindi, Movies category etc.) are faster because they only render the channels of the *currently expanded* category — typically 20–80 rows. All Channels renders **every channel the user has access to**.

---

## Root cause map

### Slow A — Opening the menu

In `buildCategoriesForLanguage` ([js/player.js:~2920](js/player.js)) for the `'all' / 'subscribed'` branch:
```js
sidebarState.channels = filteredChannels.slice();   // O(N) copy
applySidebarChannelSort();                          // O(N log N) sort
renderChannelsList();                               // ← builds N DOM rows synchronously
```

Then in `renderChannelsList` ([js/player.js:3934](js/player.js#L3934)):
```js
sidebarState.channels.forEach(function (ch, index) {
    frag.appendChild(createChannelItemButton(ch, index));   // every channel, every time
});
container.appendChild(frag);
```

And `createChannelItemButton` ([js/player.js:3650](js/player.js#L3650)) for each row creates:
- 1 `<button>` + dataset attributes
- 1 `<div class="channel-item-logo">` + `<img>` (with eager-load in All Channels: [line 3665-3666](js/player.js#L3665))
- `<div class="channel-item-info">` + `<div class="channel-item-name">` + `<div class="channel-item-price">`
- `<div class="channel-item-lcn">`
- 2 event listeners (`click`, `error`, `load`)
- A cache-aware `setImageSource` call

That's roughly **8 DOM nodes + 1 image fetch + 3 listeners per channel**, all built synchronously on the JS main thread.

For a 500-channel All Channels list:
- ~4000 DOM elements created in one pass.
- ~500 image requests fired (eager loading) — even if served from HTTP cache or in-memory cache, the browser still does layout work for each.

On Samsung Tizen TV (slower CPU than a phone), this synchronous block can take **500–1500 ms**. That's the perceived lag.

### Slow B — Picking a channel

In `playChannelFromSidebar` ([js/player.js:5055](js/player.js#L5055)):
```js
setupPlayer(channel);                                  // start AVPlayer (async)
requestAnimationFrame(function () {
    syncSidebarWithCurrentPlayback(true);
    if (wasAllChannelsContext) {
        sidebarState.channels = getFilteredChannelsByLanguage().slice();   // ← rebuilds list
        if (isAllSidebarContext()) applySidebarChannelSort();              // ← re-sorts
        renderChannelsList();                                              // ← re-renders ALL 500+ rows
        var idxAll = findCurrentChannelInSidebar();
        sidebarState.channelIndex = idxAll …;
        focusChannelItem(sidebarState.channelIndex);
        return;
    }
    …
});
```

The comment at line 5092 says "In All Channels mode, avoid rebuilding category DOM" but the code still calls **`renderChannelsList()`** which tears down and rebuilds **every channel button**. The only thing that actually changed between before and after the click is **which row has the `.active` class**.

So clicking a channel triggers a full re-render of the entire flat list — same cost as opening the menu the first time. That's why the new selection feels delayed.

The video stream itself starts in parallel (async AVPlayer), but the user perceives lag because the DOM update happens after the entire re-render completes.

---

## Why this only affects All Channels (and Subscribed)

Specific-language tabs (Tamil / Movies / Sports / etc.) render only the channels of the **expanded category**. After picking a channel within that category, the channels array is the same — but even if we re-render, it's only 20–80 rows, fast enough to be invisible.

All Channels renders **every channel** at once. The penalty scales linearly with subscription size.

---

## Proposed Solutions

### Solution A — Skip the redundant re-render after channel select (fixes Slow B)

**Single targeted change.** When the user picks a channel in All Channels (or Subscribed) mode, the channels list is **not changing** — only the `.active` class on one row needs to move. We can:
1. Skip the `getFilteredChannelsByLanguage().slice()` rebuild.
2. Skip the `applySidebarChannelSort()`.
3. Skip the `renderChannelsList()` full DOM rebuild.
4. Just toggle the `.active` class: remove from the old row, add to the new row.
5. Call `focusChannelItem(newIndex)` to move focus + scroll.

**Expected result:** channel selection feels instant. The video starts as soon as AVPlayer can buffer; the menu's `.active` highlight moves in the same animation frame.

**Risk:** very low. The condition for skipping the rebuild is precise: same `languageIndex` + non-empty `sidebarState.channels` + flat-list mode.

**Files:** only [js/player.js](js/player.js) `playChannelFromSidebar` (~line 5055).

---

### Solution B — Progressive (chunked) rendering for the initial open (fixes Slow A)

The full list of 500+ rows doesn't need to exist on the first frame. We can:
1. Render the **first chunk** (e.g. 60 rows — enough to fill the visible viewport plus some scroll buffer) synchronously.
2. Append the rest in chunks of ~40 rows per frame using `requestAnimationFrame` (or `setTimeout(0)` on Tizen if rAF behaviour is laggy).
3. Cancel the in-progress chunk job if the user navigates away (closes the menu, switches tab) so we don't waste cycles.

**Expected result:** menu opens with the top of the list visible in <100 ms; the rest fills in smoothly while the user is reading the first rows. The user almost never sees the "empty list → full list" pop because the visible part is already there.

**Risk:** low. Focus targeting still works (we synchronously render enough rows that the currently-playing channel is reachable; if it's beyond the first chunk, the chunk loop carries on until that index is reached, then yields). Falls back gracefully on any error.

**Files:** [js/player.js](js/player.js) `renderChannelsList` (~line 3934). Adds a small chunk-job state variable, a cancel flag, and a tick function.

---

### Solution C — Cache the rendered DOM, reuse on identical channel list (defensive)

If the user opens menu → picks channel → menu auto-closes → opens menu again, the channels list is *identical* to last time. We can:
1. Stamp `sidebarState.channels` with a quick signature (length + first/last channel id).
2. After a render, save the signature and the rendered DOM fragment.
3. On next render, if signature matches, attach the cached fragment instead of rebuilding.

**Expected result:** subsequent opens of the same tab are instant. First open per session still pays the full cost (until Solution B kicks in).

**Risk:** medium. Requires careful invalidation when `applySidebarChannelSort` changes order, when subscriptions change, when the user switches language. We have to make sure we don't show stale content.

**Files:** [js/player.js](js/player.js) `renderChannelsList`. Adds a small cache map plus signature helpers.

---

## Recommended order

1. **Solution A first.** Highest ROI — small, isolated, purely additive guard. Ships the perceived "channel select now feels instant" win immediately.
2. **Solution B second.** More substantial, but the chunked render meaningfully improves the first-open feel. Worth doing.
3. **Solution C only if needed.** Skip unless A + B aren't enough.

I'd ship A on its own first, validate it on the device, then add B.

---

## TODO LIST

```
[ ] A1. In playChannelFromSidebar, when wasAllChannelsContext === true:
        - Detect "channels list unchanged" case (same languageIndex,
          sidebarState.channels populated, target channel found within it).
        - Skip getFilteredChannelsByLanguage / applySidebarChannelSort / renderChannelsList.
        - Just remove .active from the previously-active button, add to the new
          one (DOM lookup via cached _getSidebarChannels), update channelIndex,
          call focusChannelItem.
        - File: js/player.js (~line 5092)

[ ] B1. Add a chunked renderer in renderChannelsList for the All Channels path.
        - Render first 60 rows synchronously.
        - Schedule remaining rows in batches of ~40 per rAF.
        - Track an opaque "render token" so a new render call cancels the
          in-flight chunk job and starts fresh.
        - Make sure the currently-playing channel index is reached early
          enough that focus targeting still works (or render up to-and-including
          that index synchronously if it's outside the first chunk).
        - File: js/player.js renderChannelsList (~line 3934)

[ ] (optional) C1. DOM cache for identical channels lists.
        - Only if A + B aren't sufficient on real device.
```

---

## Questions before I implement

A couple of facts that change which fix matters most. Please answer any you can — even rough numbers help:

1. **Roughly how many channels are in your All Channels list?** (50? 200? 500? 1000?) — this tells me whether Solution B is critical or a nice-to-have.
2. **Is the menu-open lag consistent every time, or only on the first open after launch?** — if it's only the first open, the bottleneck is more likely image fetching than DOM rendering.
3. **The slow channel select — does the *video* take time to start, or is it just the *menu highlight* that lags?** — if the video itself is slow, that's an AVPlayer concern (separate from DOM); if only the highlight, Solution A handles it cleanly.
4. **Do you want this fixed only for All Channels, or also for Subscribed Channels?** (They share the same flat-list code path; the same fix can cover both with no extra cost.)

Reply with answers (even partial), or just say "go with the recommended order" and I'll start with Solution A immediately.
