# Gap Analysis: ScrollingMessagePoolWidget (`gap-scrolling-pool`)

## 1. Widget Identity & Role

- **Widget Type**: `ScrollingMessagePoolWidget`
- **Instance in `layoutSWR.json`**:
  - `msgWidget` (`geometry`: `{ x: 32, y: 17, w: 224, h: 14 }`, `visible`: true, `font`: `RailTextLarge12`)
- **Source Data**: `nationalRailBoard.json` -> `messages[]` (array of passenger alert strings with HTML markup) and/or `header.firstServiceCalling`.

## 2. What the Widget Does

`ScrollingMessagePoolWidget` operates as an intelligent multi-message carousel and ticker:
1. **Message Pool Cycling**:
   - Holds an array of messages (e.g. disruption notices, calling points, engineering works).
   - Sequentially cycles from one message to the next after each message completes its display/scroll cycle.
2. **Horizontal Scrolling & Pacing**:
   - If a message fits within 224px, it displays statically for a dwell period.
   - If a message exceeds 224px, it smoothly scrolls horizontally, dwells at the end, and advances to the next message.
3. **Monochrome Sanitization**:
   - Strips HTML tags (`<a href="...">...</a>`) present in National Rail API feeds before rasterizing text on monochrome OLEDs.

## 3. What Schema 0.4 Can and Cannot Express

- **Can Express**:
  - A single `<u8g2gl_label>` with `long_mode="scroll_circular"` to scroll one static or bound string horizontally.
- **Cannot Express**:
  - **Message Cycling / Carousel (`[Q-15]`)**: Schema 0.4 has no mechanism to switch between multiple strings or child elements over time. A bound subject points to a single string, not an array.
  - **Array Binding**: Cannot bind a string subject to an index of a JSON array (`messages[0]`, `messages[1]`).
  - **Text Sanitization / Transform Pipeline**: Schema 0.4 cannot filter out HTML tags or transform strings declaratively.

## 4. Open Question Mapping

- **Direct Mapping: `[Q-15]` (A "cards" element)**
  - *Quote (`docs/design_spec.md §21`)*: "A 'cards' element — one container showing exactly one of its children, chosen by an integer subject, equivalent to UiUiUi's `UICards`... It would switch between modes or pages within one region of a screen — the mechanism a carousel would drive... Carousel *policy* stays in `modules/U8G2GLDisplay`, as ui_spec §7.3 already rules."
  - In Schema 0.4, alternating between messages requires external controller code repeatedly modifying the bound string subject or clumsily using `bind_flag_if` across multiple overlapping labels.

## 5. Workaround XML Pattern

In Schema 0.4, the best static workaround is a single circular scrolling label bound to a pre-sanitized string subject containing the primary message. Cycling must be driven externally or messages must be pre-concatenated:

```xml
<!-- Workaround for msgWidget: Single circular scrolling label -->
<!-- Requires host-side data provider to strip HTML tags and update msg_text -->
<u8g2gl_label name="msg_scroller" x="32" y="17" width="224" height="14"
              style="msg_font" long_mode="scroll_circular"
              text="Service Disruption Notice" bind_text="msg_text" />
```
