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
