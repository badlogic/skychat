import { BskyAgent } from "@atproto/api";
import { IndexedDBStorage } from "./indexeddb";
import { PushPreferences, User } from "./store";

export type PushNotification = {
    type: "like" | "reply" | "quote" | "repost" | "follow" | "mention";
    fromDid: string;
    toDid: string;
    tokens?: string[];
    postUri?: string;
};

export async function processPushNotification(payload: any, showNotification: (title: string, options: any) => void) {
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

        const notification = payload.data as PushNotification;
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
            case "mention":
                if (!pushPrefs?.mentions) return;
                message = `${from} mentioned your post`;
                break;
            default:
                message = "You have a new notification";
        }

        if (postText.length > 0) message += `\n${postText}`;

        if (navigator.userAgent.toLowerCase().includes("android")) {
            showNotification(message, {
                body: postText,
                icon: "./logo.png",
            } as any);
        } else {
            showNotification("New notification", {
                body: postText.length > 0 ? message + `\n${postText}` : message,
                icon: "./logo.png",
            } as any);
        }
    }
}
