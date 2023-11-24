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

import { BskyAgent } from "@atproto/api";
import { initializeApp } from "firebase/app";
import { getMessaging, onBackgroundMessage } from "firebase/messaging/sw";
import { IndexedDBStorage } from "./indexeddb";
import { User, PushPreferences } from "./store";
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

// FIXME i18n, notifications from muted accounts
onBackgroundMessage(messaging, async (payload) => {
    console.log("Background message received. ", payload);
    if (payload.data && payload.data.type && payload.data.fromDid) {
        const db = new IndexedDBStorage("skychat", 1);
        const user = (await db.get("user")) as User | undefined;
        if (!user || user.profile.did != payload.data.toDid) {
            console.error("Received notification for other user, or not logged in.");
            return;
        }
        const pushPrefs = (await db.get("pushPrefs")) as PushPreferences | undefined;
        if (!pushPrefs) {
            console.error("No push preferences found.");
            return;
        }

        const notification = payload.data as Notification;
        const bskyClient = new BskyAgent({ service: "https://api.bsky.app" });
        let from = "Someone";
        let postText = "";
        try {
            const response = await bskyClient.getProfile({ actor: notification.fromDid });
            if (response.success) {
                from = response.data.displayName ?? response.data.handle;
            }
        } catch (e) {
            console.error("Couldn't fetch profile for " + payload.data.from, e);
        }
        if (payload.data.postUri) {
            try {
                const response = await bskyClient.app.bsky.feed.getPosts({ uris: [payload.data.postUri] });
                if (response.success) {
                    const post = response.data.posts[0];
                    postText = (post.record as any)?.text;
                }
            } catch (e) {
                console.error("Couldn't fetch post for " + payload.data.from, e);
            }
        }
        let message = "";
        if (!pushPrefs?.enabled) return;
        switch (notification.type) {
            case "follow":
                if (!pushPrefs?.newFollowers) return;
                message = `${from} is following you`;
                break;
            case "like":
                if (!pushPrefs?.likes) return;
                message = `${from} liked your post`;
                break;
            case "quote":
                if (!pushPrefs?.quotes) return;
                message = `${from} quoted your post`;
                break;
            case "reply":
                if (!pushPrefs?.replies) return;
                message = `${from} replied to your post`;
                break;
            case "repost":
                if (!pushPrefs?.reposts) return;
                message = `${from} reposted your post`;
                break;
            default:
                message = "You have a new notification";
        }

        if (postText.length > 0) message += `\n${postText}`;

        if (navigator.userAgent.toLowerCase().includes("android")) {
            self.registration.showNotification(message, {
                body: postText,
                icon: "./logo.png",
            } as any);
        } else {
            self.registration.showNotification("New notification", {
                body: postText.length > 0 ? message + `\n${postText}` : message,
                icon: "./logo.png",
            } as any);
        }
    }
});
