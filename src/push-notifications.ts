import { AtpSessionData, AtpSessionEvent, BskyAgent } from "@atproto/api";
import { IndexedDBStorage } from "./indexeddb";
import { PushPreferences, User } from "./store";
import { i18n } from "./i18n";

export type PushNotification = {
    type: "like" | "reply" | "quote" | "repost" | "follow" | "mention";
    fromDid: string;
    toDid: string;
    tokens?: string[];
    postUri?: string;
};

export async function getBskyClientAndUser(): Promise<{ bskyClient: BskyAgent; user?: User; pushPrefs?: PushPreferences }> {
    const db = new IndexedDBStorage("skychat", 1);
    const user = (await db.get("user")) as User | undefined;

    try {
        if (!user) throw Error();
        let session: AtpSessionData | undefined;
        const persistSession = (evt: AtpSessionEvent, s?: AtpSessionData) => {
            if (evt == "create" || evt == "update") {
                user.session = s;
                db.set("user", user);
            }
        };
        const bskyClient = new BskyAgent({ service: "https://bsky.social", persistSession });
        let resumeSuccess = false;
        if (user.session) {
            const resume = await bskyClient.resumeSession(user.session);
            resumeSuccess = resume.success;
        }
        if (!resumeSuccess) {
            const response = await bskyClient.login({
                identifier: user.account,
                password: user.password,
            });
            if (!response.success) {
                throw Error();
            }
        }
        return { bskyClient, user, pushPrefs: (await db.get("pushPrefs")) as PushPreferences | undefined };
    } catch (e) {
        // no-op in case resume didn't work.
        return { bskyClient: new BskyAgent({ service: "https://api.bsky.app" }) };
    }
}

// FIXME server should batch notifications, less logins/less wake-ups
export async function processPushNotification(payload: any, showNotification: (title: string, options: any) => void) {
    if (payload.data && payload.data.type && payload.data.fromDid) {
        const { bskyClient, user, pushPrefs } = await getBskyClientAndUser();
        if (!user || user.profile.did != payload.data.toDid) {
            console.error("Received notification for other user, or not logged in.");
            return;
        }
        if (!pushPrefs) {
            console.error("No push preferences found.");
            return;
        }

        const notification = payload.data as PushNotification;
        let from = "Someone";
        let postText = "";
        try {
            const response = await bskyClient.getProfile({ actor: notification.fromDid });
            if (response.success) {
                if (response.data.viewer) {
                    if (
                        response.data.viewer.blocking ||
                        response.data.viewer.blockingByList ||
                        response.data.viewer.muted ||
                        response.data.viewer.mutedByList
                    ) {
                        console.error(
                            "Originator of notification (" + (response.data.displayName ?? response.data.handle) + ") blocked or muted",
                            response.data.viewer
                        );
                        return;
                    }
                }
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
                message = i18n("is following you")(from);
                break;
            case "like":
                if (!pushPrefs?.likes) return;
                message = i18n("liked your post")(from);
                break;
            case "quote":
                if (!pushPrefs?.quotes) return;
                message = i18n("quoted your post")(from);
                break;
            case "reply":
                if (!pushPrefs?.replies) return;
                message = i18n("replied to your post")(from);
                break;
            case "repost":
                if (!pushPrefs?.reposts) return;
                message = i18n("reposted your post")(from);
                break;
            case "mention":
                if (!pushPrefs?.mentions) return;
                message = i18n("mentioned you")(from);
                break;
            default:
                message = i18n("You have a new notification");
        }

        if (postText.length > 0) message += `\n${postText}`;

        if (navigator.userAgent.toLowerCase().includes("android")) {
            showNotification(message, {
                body: postText,
                icon: "./logo.png",
            } as any);
        } else {
            showNotification(i18n("New notification"), {
                body: postText.length > 0 ? message + `\n${postText}` : message,
                icon: "./logo.png",
            } as any);
        }
    }
}
