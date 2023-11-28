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
            self.clients.openWindow("/#notifications");
        }
    };
    event.waitUntil(click());
});

self.addEventListener("message", (event: any) => {
    console.log("Got worker message: " + JSON.stringify(event.data));
});

import { initializeApp } from "firebase/app";
import { getMessaging, onBackgroundMessage } from "firebase/messaging/sw";
import { processPushNotification } from "./push-notifications";
const firebaseConfig = {
    apiKey: "AIzaSyAZ2nH3qKCFqFhQSdeNH91SNAfTHl-nP7s",
    authDomain: "skychat-733ab.firebaseapp.com",
    projectId: "skychat-733ab",
    storageBucket: "skychat-733ab.appspot.com",
    messagingSenderId: "693556593993",
    appId: "1:693556593993:web:8137dd0568c75b50d1c698",
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

onBackgroundMessage(messaging, async (payload) => {
    console.log("Background message received. ", payload);
    processPushNotification(payload, (title, options) => self.registration.showNotification(title, options));
});
