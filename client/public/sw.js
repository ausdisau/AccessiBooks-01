self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: "AccessiBooks",
      body: event.data.text(),
      url: "/",
    };
  }

  const options = {
    body: payload.body || "You have a new notification",
    icon: payload.icon || "/assets/icons/icon-192.png",
    badge: payload.badge || "/assets/icons/badge-72.png",
    tag: payload.tag || "accessibooks-notification",
    renotify: true,
    data: {
      url: payload.url || "/",
      type: payload.type || "system",
      notificationId: payload.notificationId,
    },
    actions: [{ action: "open", title: "Open" }],
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || "AccessiBooks", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
