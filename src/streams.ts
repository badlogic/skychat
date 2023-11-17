import { AppBskyNotificationListNotifications } from "@atproto/api";
import { FeedViewPost, PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { ActorFeedType, State } from "./state";
import { error, fetchApi } from "./utils";
import { ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";

export interface Stream<T> {
    onNewer(callback: (newerItems: Error | T[]) => void): void;
    next(): Promise<Error | T[]>;
    close(): void;
}

export class PostSearchStream implements Stream<PostView> {
    cursor?: string;
    constructor(readonly query: string) {}

    onNewer(callback: (newerItems: Error | PostView[]) => void): void {
        throw new Error("PostSearchStream does not support polling");
    }

    async next() {
        if (!State.isConnected()) return Error("Not connected");
        try {
            const response = await fetch(
                `https://palomar.bsky.social/xrpc/app.bsky.unspecced.searchPostsSkeleton?q=${encodeURIComponent(this.query)}&limit=20${
                    this.cursor ? `&cursor=${this.cursor}` : ""
                }`
            );
            if (response.status != 200) throw new Error();
            const result = (await response.json()) as { cursor: string; totalHits: number; posts: { uri: string }[] };
            const postsResponse = await State.getPosts(result.posts.map((post) => post.uri));
            if (postsResponse instanceof Error) throw new Error();
            this.cursor = result.cursor;
            return postsResponse.reverse();
        } catch (e) {
            return error(`Couldn't load posts for query ${this.query}, offset ${this.cursor}`, e);
        }
    }

    close() {}
}

export class CursorStream<C, T> implements Stream<T> {
    cursor?: C;

    constructor(readonly provider: (cursor?: C) => Promise<Error | { cursor?: C; items: T[] }>) {}

    onNewer(callback: (newerItems: Error | T[]) => void): void {}

    async next(): Promise<Error | T[]> {
        if (!State.isConnected()) return Error("Not connected");

        try {
            const response = await this.provider(this.cursor);
            if (response instanceof Error) throw response;
            this.cursor = response.cursor;
            return response.items;
        } catch (e) {
            return error("Could not load items", e);
        }
    }

    close(): void {}
}

export class NotificationsStream extends CursorStream<string, AppBskyNotificationListNotifications.Notification> {
    constructor() {
        super((cursor?: string) => {
            return State.getNotifications(cursor);
        });
    }
}

export class ActorFeedStream extends CursorStream<string, FeedViewPost> {
    constructor(readonly type: ActorFeedType, readonly actor?: string) {
        super((cursor?: string) => {
            return State.getActorFeed(this.type, this.actor, cursor, 25);
        });
    }
}

export class LoggedInActorLikesStream extends CursorStream<string, FeedViewPost> {
    constructor() {
        super((cursor?: string) => {
            return State.getLoggedInActorLikes(cursor, 25);
        });
    }
}

export class ActorLikesStream extends CursorStream<string, PostView> {
    constructor(readonly actor: string) {
        super((cursor?: string) => {
            return State.getActorLikes(actor, cursor, 20);
        });
    }
}

export class PostLikesStream extends CursorStream<string, ProfileViewDetailed> {
    constructor(readonly postUri: string) {
        super((cursor?: string) => {
            return State.getPostLikes(postUri, cursor, 20);
        });
    }
}

export class PostRepostsStream extends CursorStream<string, ProfileViewDetailed> {
    constructor(readonly postUri: string) {
        super((cursor?: string) => {
            return State.getPostReposts(postUri, cursor, 20);
        });
    }
}

export class FollowersStream extends CursorStream<string, ProfileViewDetailed> {
    constructor(readonly did: string) {
        super((cursor?: string) => {
            return State.getFollowers(did, cursor, 20);
        });
    }
}

export class FollowingStream extends CursorStream<string, ProfileViewDetailed> {
    constructor(readonly did: string) {
        super((cursor?: string) => {
            return State.getFollowing(did, cursor, 20);
        });
    }
}

export class QuotesStream implements Stream<PostView> {
    loaded = false;

    constructor(readonly postUri: string) {}

    onNewer(callback: (newerItems: Error | PostView[]) => void): void {
        throw new Error("Method not implemented.");
    }
    async next(): Promise<Error | PostView[]> {
        if (this.loaded) return [];
        if (!State.isConnected()) return new Error("Couldn't load quotes");
        try {
            const quotesResult = await State.getQuotes([this.postUri]);
            if (quotesResult instanceof Error) throw quotesResult;
            const postsResult = await State.getPosts(quotesResult.map((quote) => quote.postUri));
            if (postsResult instanceof Error) throw postsResult;
            return postsResult;
        } catch (e) {
            return error("Couldn't load quotes", e);
        }
    }
    close(): void {
        throw new Error("Method not implemented.");
    }
}

/*
let loading = false;
        const checkNewNotifications = async () => {
            // FIXME should probably display an error if new notifications couldn't be loaded for some reason.
            if (loading) return;
            if (!bskyClient) return;
            const firstNode = this.notificationsDom?.children[0];
            if (!firstNode) return;
            loading = true;
            try {
                const listResponse = await bskyClient.listNotifications();
                if (!listResponse.success) {
                    console.error("Couldn't list new notifications");
                    return;
                }
                const postsToLoad: string[] = [];
                let numUnread = 0;
                for (const notification of listResponse.data.notifications) {
                    if (notification.reasonSubject && notification.reasonSubject.includes("app.bsky.feed.post")) {
                        postsToLoad.push(notification.reasonSubject);
                    }
                    if (AppBskyFeedPost.isRecord(notification.record) && notification.record.reply) {
                        postsToLoad.push(notification.record.reply.parent.uri);
                    }
                    if (notification.uri.includes("app.bsky.feed.post")) {
                        postsToLoad.push(notification.uri);
                    }
                    numUnread += notification.isRead ? 0 : 1;
                }
                if (numUnread == 0) return;
                await loadPosts(postsToLoad, this.posts);
                const updateReponse = await bskyClient.updateSeenNotifications();
                if (!updateReponse.success) console.error("Couldn't update seen notifications");

                for (const notification of listResponse.data.notifications) {
                    if (notification.isRead) continue;
                    const notificationDom = dom(this.renderNotification(notification))[0];
                    this.notificationsDom?.insertBefore(notificationDom, firstNode);
                }
            } catch (e) {
                console.error("Couldn't load newer notifications", e);
            } finally {
                loading = false;
            }
        };
        this.intervalId = setInterval(checkNewNotifications, 2000);
        */
