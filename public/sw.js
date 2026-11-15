self.addEventListener("push", (event) => {
  let data = { title: "Baza Boutique", body: "You have a new notification." };
  try {
    data = event.data.json();
  } catch {
    // ignore malformed payloads
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      data: { link: data.link || "/" },
      icon: "/icons/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/";
  event.waitUntil(self.clients.openWindow(link));
});
