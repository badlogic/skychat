import { BskyAgent } from "@atproto/api";
import { install } from "husky";

declare var self: ServiceWorkerGlobalScope;
export {};

let installId = "";
let bskyClient: BskyAgent | undefined;
let lastNumUnread = 0;
let lastAccount = "";
let lastPassword = "";
let intervalId: any;

function poll() {
    lastNumUnread = 0;
    clearInterval(intervalId);
    intervalId = setInterval(async () => {
        if (!bskyClient) {
            console.log(`- Not connected ${installId}`);
        } else {
            console.log(`- Polling ${installId}`);
            const numUnread = await bskyClient.countUnreadNotifications();
            if (!numUnread.success) {
                console.error(`- Couldn't get number of unread notifications ${installId}`);
                return;
            }
            if (numUnread.data.count > lastNumUnread) {
                self.registration.showNotification(`You have new ${numUnread.data.count} notifications`, { icon: "./logo.png" });
                console.log(`- Notified user of ${numUnread.data.count} unread notifications ${installId}`);
            }
            lastNumUnread = numUnread.data.count;
        }
    }, 5000);
}

async function login(account: string, password: string) {
    try {
        bskyClient = new BskyAgent({ service: "https://bsky.social" });
        const response = await bskyClient.login({ identifier: account, password });
        if (!response.success) throw Error();
        lastAccount = account;
        lastPassword = password;
        console.log(`- Logged in ${account} ${installId}`);
    } catch (e) {
        console.error(`- Couldn't login ${account}`);
        bskyClient = undefined;
    }
}

self.addEventListener("install", (event) => {
    installId = (Math.random() * 1000).toFixed(0);
    console.log(`- Installing service worker ${installId}`);
    event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
    console.log(`- Activating service worker ${installId}`);
    const activate = () => {
        poll();
        return self.clients.claim();
    };
    event.waitUntil(activate());
});

self.addEventListener("message", async (event) => {
    console.log(`- Received message ${installId}`);
    console.log(event.data);

    if (event.data == "logout") {
        bskyClient = undefined;
        lastAccount = "";
        lastPassword = "";
    }

    if (event.data.account && event.data.password) {
        if (!bskyClient || event.data.account != lastAccount || event.data.password != lastPassword) {
            login(event.data.account, event.data.password);
        } else {
            console.log(`- Already logged in ${lastAccount} ${installId}`);
        }
    }

    poll();
});

self.addEventListener("notificationclick", (event: any) => {
    event.notification.close();
    const click = async () => {
        const clientList = await self.clients.matchAll({ type: "window" });
        for (const client of clientList) {
            console.log(`- Sending message to window ${installId}`);
            if ("focus" in client) client.focus();
            client.postMessage("notifications");
        }
        if (clientList.length == 0) {
            self.clients.openWindow("/client.html#notifications");
        }
    };
    event.waitUntil(click());
});
