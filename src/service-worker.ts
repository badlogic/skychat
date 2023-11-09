declare var self: ServiceWorkerGlobalScope;
export {};

self.addEventListener("install", (event) => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    console.log(`Activating service worker`);
    const activate = () => {
        return self.clients.claim();
    };
    event.waitUntil(activate());
});

self.addEventListener("notificationclick", (event: any) => {
    event.notification.close();
    const click = async () => {
        const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const client of clientList) {
            console.log(`- Sending message to window`);
            if ("focus" in client) client.focus();
            client.postMessage("notifications");
        }
        if (clientList.length == 0) {
            self.clients.openWindow("/client.html#notifications");
        }
    };
    event.waitUntil(click());
});

import { BskyAgent } from "@atproto/api";
import { initializeApp } from "firebase/app";
import { getMessaging, onBackgroundMessage } from "firebase/messaging/sw";
const firebaseConfig = {
    apiKey: "AIzaSyAZ2nH3qKCFqFhQSdeNH91SNAfTHl-nP7s",
    authDomain: "skychat-733ab.firebaseapp.com",
    projectId: "skychat-733ab",
    storageBucket: "skychat-733ab.appspot.com",
    messagingSenderId: "693556593993",
    appId: "1:693556593993:web:8137dd0568c75b50d1c698",
};
type Notification = { type: "like" | "reply" | "quote" | "repost" | "follow"; fromDid: string; toDid: string; token: string };
const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);
onBackgroundMessage(messaging, async (payload) => {
    console.log("Background message received. ", payload);
    if (payload.data && payload.data.type && payload.data.fromDid) {
        const notification = payload.data as Notification;
        const bskyClient = new BskyAgent({ service: "https://api.bsky.app" });
        let from = "Someone";
        try {
            const response = await bskyClient.getProfile({ actor: notification.fromDid });
            if (response.success) {
                from = response.data.displayName ?? response.data.handle;
            }
        } catch (e) {
            console.error("Couldn't fetch profile for " + payload.data.from);
        }
        let message = "";
        switch (notification.type) {
            case "follow":
                message = `${from} is following you`;
                break;
            case "like":
                message = `${from} liked your post`;
                break;
            case "quote":
                message = `${from} quoted your post`;
                break;
            case "reply":
                message = `${from} replied to your post`;
                break;
            case "repost":
                message = `${from} reposted your post`;
                break;
            default:
                message = "You have a new notification";
        }

        self.registration.showNotification("New notification", { body: message, icon: "./logo.png" });
    }
});
console.log("Initialized worker messaging.");
