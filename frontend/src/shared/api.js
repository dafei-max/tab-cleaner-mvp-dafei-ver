const API = "http://localhost:8000/api/v1";

export async function startSession() {
  const resp = await fetch(API + "/sessions", { method: "POST" });
  const data = await resp.json();
  await chrome.storage.local.set({ session_id: data.id });
  return data.id;
}

export async function addCurrentTab() {
  const { session_id } = await chrome.storage.local.get("session_id");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await fetch(API + "/tabs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id, url: tab.url, title: tab.title })
  });
  return { url: tab.url, title: tab.title };
}

export async function shareSession() {
  const { session_id } = await chrome.storage.local.get("session_id");
  const resp = await fetch(API + "/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id })
  });
  const data = await resp.json();
  const shareUrl = "http://localhost:8000" + data.share_url;
  await navigator.clipboard.writeText(shareUrl);
  return shareUrl;
}

// 搜索相关 API
export async function generateEmbeddings(opengraphItems) {
  const resp = await fetch(API + "/search/embedding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ opengraph_items: opengraphItems })
  });
  if (!resp.ok) {
    throw new Error(`HTTP error! status: ${resp.status}`);
  }
  const data = await resp.json();
  return data;
}

export async function searchContent(queryText, queryImageUrl, opengraphItems) {
  const resp = await fetch(API + "/search/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query_text: queryText || null,
      query_image_url: queryImageUrl || null,
      opengraph_items: opengraphItems
    })
  });
  if (!resp.ok) {
    throw new Error(`HTTP error! status: ${resp.status}`);
  }
  const data = await resp.json();
  return data;
}

// 聚类相关 API
export async function createManualCluster(itemIds, clusterName, itemsData, centerX = 720, centerY = 512) {
  const resp = await fetch(API + "/clustering/manual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      item_ids: itemIds,
      cluster_name: clusterName,
      items_data: itemsData,
      center_x: centerX,
      center_y: centerY
    })
  });
  if (!resp.ok) {
    throw new Error(`HTTP error! status: ${resp.status}`);
  }
  const data = await resp.json();
  return data;
}

export async function classifyByLabels(labels, itemsData, excludeItemIds = null) {
  const resp = await fetch(API + "/clustering/ai-classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      labels: labels,
      items_data: itemsData,
      exclude_item_ids: excludeItemIds
    })
  });
  if (!resp.ok) {
    throw new Error(`HTTP error! status: ${resp.status}`);
  }
  const data = await resp.json();
  return data;
}

export async function discoverClusters(itemsData, excludeItemIds = null, nClusters = null) {
  const resp = await fetch(API + "/clustering/ai-discover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items_data: itemsData,
      exclude_item_ids: excludeItemIds,
      n_clusters: nClusters
    })
  });
  if (!resp.ok) {
    throw new Error(`HTTP error! status: ${resp.status}`);
  }
  const data = await resp.json();
  return data;
}
