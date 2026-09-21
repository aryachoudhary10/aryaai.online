// Arya service worker — receives push and shows the notification.
const ICON = "https://d8j0ntlcm91z4.cloudfront.net/user_2w39JZ8pq7Uftm12HiS8wgQUgPt/hf_20260617_155511_400611e2-332d-47c4-87a9-48e2ad6b242e.png";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch { data = { title: "Arya", body: event.data ? event.data.text() : "" }; }

  const title = data.title || "Arya";
  const options = {
    body: data.body || "",
    icon: ICON,
    badge: ICON,
    tag: data.id || undefined,
    renotify: true,
    data: { url: data.url || "/" },
    actions: [
      { action: "open", title: "Open" },
      { action: "done", title: "Got it" },
    ],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "done") return;
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(self.location.origin)) { c.focus(); if (c.navigate) c.navigate(url); return; }
      }
      return self.clients.openWindow(url);
    })
  );
});
