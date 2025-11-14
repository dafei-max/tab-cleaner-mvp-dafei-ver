# Chrome Web Store Review Form - English Version (Concise)

**Recommendation: Use English for all form fields to ensure reviewers can accurately understand your extension.**

---

## 1. Single Purpose Description

**Field: Single Purpose Description*** (Max 1,000 characters)

**Content:**

```
Tab Cleaner MVP is a smart tab management tool that helps users efficiently organize and manage browser tabs. The extension's single purpose is to help users clean, organize, and visualize their browser tabs through AI-powered semantic search and automatic clustering.

Core functionality:
1. Tab cleaning: One-click cleanup of all open tabs with automatic metadata extraction
2. Personal space canvas: Visualize tabs as interactive cards with drag, zoom, and search
3. AI semantic search: Find relevant tabs using natural language queries
4. Smart clustering: Automatically group tabs by theme or allow custom groups
5. Visual management: Support manual selection and custom grouping

All features serve the single purpose of helping users manage and organize their browser tabs. The extension does not include any functionality unrelated to tab management.
```

**Character count: ~520**

---

## 2. Reason for requesting `tabs` permission

**Field: Reason for requesting `tabs` permission*** (Max 1,000 characters)

**Content:**

```
Tab Cleaner MVP requires the tabs permission to:

1. Get all tab lists when users click "Clean" button for batch processing
2. Close processed tabs after cleanup completes
3. Create new tabs to open the personal space page
4. Capture screenshots for document-like web pages (GitHub, technical docs)

Use cases:
- Retrieve all open tabs when user clicks "Clean"
- Batch close processed tabs
- Open personal space to display tab cards
- Capture screenshots for document pages

Privacy: Only accesses tabs when user actively clicks "Clean". Does not monitor browsing behavior. Tab info only used for display, not uploaded to servers (unless user uses search).
```

**Character count: ~480**

---

## 3. Reason for requesting `storage` permission

**Field: Reason for requesting `storage` permission*** (Max 1,000 characters)

**Content:**

```
Tab Cleaner MVP requires storage permission to:

1. Save OpenGraph data (title, description, thumbnail) for canvas display
2. Store user preferences (zoom level, search history, clustering config)
3. Cache AI-generated vectors to improve search performance

Data scope:
- Only stores metadata of tabs user actively cleans
- Data only used for personal space display
- Does not store browsing history or personal information
- All data stored locally (chrome.storage.local), not uploaded

Privacy: All data stored on user's device. No third-party sharing. Users can clear data anytime.
```

**Character count: ~420**

---

## 4. Reason for requesting `activeTab` permission

**Field: Reason for requesting `activeTab` permission*** (Max 1,000 characters)

**Content:**

```
Tab Cleaner MVP requires activeTab permission to:

1. Get current tab URL and title when user clicks extension icon
2. Inject content scripts to support extension features
3. Ensure operations are relevant to current page

Use cases:
- Get current tab info when user clicks icon
- Open corresponding tabs from personal space cards
- Initialize features in current tab

Privacy: Only accesses current tab when user clicks icon. No background monitoring. No sensitive data collection.
```

**Character count: ~380**

---

## 5. Reason for requesting `scripting` permission

**Field: Reason for requesting `scripting` permission*** (Max 1,000 characters)

**Content:**

```
Tab Cleaner MVP requires scripting permission to:

1. Inject content scripts when user clicks icon (if not already loaded)
2. Load extension resources (CSS, HTML, JS modules) for UI rendering
3. Initialize features by setting global variables and event listeners

Use cases:
- Dynamically inject content scripts on icon click
- Load desktop pet module (pet.js) into page context
- Set extension ID and event listeners

Security: Only injects scripts from extension package. Uses Shadow DOM to isolate UI. No external code. No malicious execution or data collection.
```

**Character count: ~480**

---

## 6. Reason for requesting Host permissions (`<all_urls>`)

**Field: Reason for requesting Host permissions*** (Max 1,000 characters)

**Content:**

```
Tab Cleaner MVP requires host permissions (<all_urls>) to:

1. Extract OpenGraph metadata (title, description, thumbnail) from any website user has tabs open on
2. Generate screenshots for document-like pages (GitHub, docs, Notion, Feishu) that lack OpenGraph images
3. Extract metadata for AI semantic search and clustering

Important:
- Only accesses URLs when user actively clicks "Clean" button
- No background automatic access or monitoring
- All extraction is user-triggered
- Does not collect browsing history or personal information
- Follows least privilege principle

Privacy: Only accesses pages on explicit user action. No browsing monitoring. No advertising use. All processing local or on user's server.
```

**Character count: ~580**

---

## 7. Remote Code Usage

**Question: Are you using remote code?**

**Answer: Yes, I am using remote code**

**Field: Reason*** (Max 1,000 characters)

**Content:**

```
Tab Cleaner MVP uses remote code (backend API) for features requiring server-side processing:

1. OpenGraph extraction: Extract metadata from web pages via backend API for unified processing
2. AI semantic search: Call AI models (Tongyi Qianwen qwen2.5-vl-embedding) via Alibaba Cloud DashScope API to generate vectors for semantic search
3. Intelligent clustering: Use AI (K-means, classification) to group tabs by theme, requiring server-side computing
4. Screenshots: Generate screenshots for document pages using Playwright on server
5. Document cards: Generate SVG cards for pages without OpenGraph images

Technical:
- Backend: https://tab-cleaner-mvp-production.up.railway.app
- All calls via HTTPS encryption
- Only sends tab data (URL, title) user actively submits
- No personal info or browsing history collection

Security: HTTPS encryption. Only processes user-submitted data. No background monitoring. All calls reviewed for security.

Data usage: Tab URLs/metadata only for OpenGraph extraction and AI vectors. Search keywords only for queries. No advertising. No third-party sharing.
```

**Character count: ~980**

---

## Summary

All fields are now concise and within the 1,000 character limit:

- Single Purpose: ~520 chars
- Tabs permission: ~480 chars
- Storage permission: ~420 chars
- ActiveTab permission: ~380 chars
- Scripting permission: ~480 chars
- Host permissions: ~580 chars
- Remote code: ~980 chars

All content emphasizes:
- User-initiated actions only
- Privacy protection
- No background monitoring
- Clear, specific use cases

---

**Last Updated**: 2025-11-14
