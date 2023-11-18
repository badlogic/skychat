import { AppBskyFeedDefs, AppBskyNotificationListNotifications } from "@atproto/api";
import { FeedViewPost, PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { ActorFeedType, State } from "./state";
import { error, fetchApi } from "./utils";
import { ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { date, record } from "./bsky";

export interface Stream<T> {
    items: T[];
    itemsMap: Map<string, T>;
    getItemKey(item: T): string;
    getItemDate(item: T): Date;
    readonly pollNew: boolean;
    addNewItemsListener(listener: (newerItems: Error | T[]) => void): void;
    next(): Promise<Error | T[]>;
    poll(): void;
    close(): void;
}

export class PostSearchStream implements Stream<PostView> {
    cursor?: string;
    items: PostView[] = [];
    itemsMap = new Map<string, PostView>();
    readonly pollNew = false;
    constructor(readonly query: string) {}

    getItemKey(item: PostView): string {
        return item.uri;
    }

    getItemDate(item: AppBskyFeedDefs.PostView): Date {
        return date(item) ?? new Date();
    }

    addNewItemsListener(listener: (newItems: Error | PostView[]) => void): void {
        throw new Error("Method not supported");
    }

    poll(): void {
        throw new Error("Method not supported");
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
            for (const post of postsResponse) {
                this.itemsMap.set(this.getItemKey(post), post);
            }
            return postsResponse.reverse();
        } catch (e) {
            return error(`Couldn't load posts for query ${this.query}, offset ${this.cursor}`, e);
        }
    }

    close() {}
}

export abstract class CursorStream<T> implements Stream<T> {
    cursor?: string;
    items: T[] = [];
    itemsMap = new Map<string, T>();
    closed = false;
    timeoutId: any = undefined;

    constructor(
        readonly provider: (cursor?: string, limit?: number) => Promise<Error | { cursor?: string; items: T[] }>,
        public readonly pollNew = false,
        readonly pollInterval = 5000
    ) {}

    isPolling = false;
    async poll() {
        if (this.isPolling) return;
        this.isPolling = true;

        try {
            console.log("Polling");

            const newItems: T[] = [];
            let cursor: string | undefined;
            let startTimestamp = this.items.length > 0 ? this.getItemDate(this.items[0]).getTime() : new Date().getTime();
            while (true) {
                let fetchedItems = await this.provider(cursor, 20);
                if (fetchedItems instanceof Error) {
                    for (const listener of this.newItemslisteners) {
                        listener(fetchedItems);
                    }
                    throw fetchedItems;
                }

                const finalItems = fetchedItems.items.filter((item) => {
                    const key = this.getItemKey(item);
                    const dateMatch = this.getItemDate(item).getTime() > startTimestamp;
                    return !this.itemsMap.has(key) && dateMatch;
                });
                if (finalItems.length == 0) break;
                newItems.push(...finalItems);
                for (const item of finalItems) {
                    this.itemsMap.set(this.getItemKey(item), item);
                }
                cursor = fetchedItems.cursor;
            }

            if (newItems.length > 0) {
                this.items = [...newItems, ...this.items];
                for (const listener of this.newItemslisteners) {
                    listener(newItems);
                }
            }
        } catch (e) {
            error("Couldn't poll newer items", e);
        } finally {
            this.isPolling = false;
            if (!this.closed) {
                this.timeoutId = setTimeout(() => this.poll(), this.pollInterval);
            }
        }
    }

    abstract getItemKey(item: T): string;
    abstract getItemDate(item: T): Date;

    newItemslisteners: ((newItems: Error | T[]) => void)[] = [];
    addNewItemsListener(listener: (newItems: Error | T[]) => void): void {
        this.newItemslisteners.push(listener);
        if (this.pollNew) {
            this.timeoutId = setTimeout(() => this.poll(), this.pollInterval);
        }
    }

    async next(): Promise<Error | T[]> {
        if (!State.isConnected()) return Error("Not connected");

        try {
            const response = await this.provider(this.cursor);
            if (response instanceof Error) throw response;
            this.cursor = response.cursor;
            this.items.push(...response.items);
            for (const item of response.items) {
                this.itemsMap.set(this.getItemKey(item), item);
            }
            return response.items;
        } catch (e) {
            return error("Could not load items", e);
        }
    }

    close(): void {
        this.closed = true;
        clearTimeout(this.timeoutId);
    }
}

export class NotificationsStream extends CursorStream<AppBskyNotificationListNotifications.Notification> {
    constructor(pollNew = false, pollInterval?: number) {
        super(
            (cursor?: string, limit?: number) => {
                return State.getNotifications(cursor, limit);
            },
            pollNew,
            pollInterval
        );
    }

    getItemKey(item: AppBskyNotificationListNotifications.Notification): string {
        return item.uri; // FIXME?
    }

    getItemDate(item: AppBskyNotificationListNotifications.Notification): Date {
        return new Date(item.indexedAt); // FIXME?
    }
}

export class ActorFeedStream extends CursorStream<FeedViewPost> {
    constructor(readonly type: ActorFeedType, readonly actor?: string, pollNew = false, pollInterval?: number) {
        super(
            (cursor?: string, limit?: number) => {
                return State.getActorFeed(this.type, this.actor, cursor, limit);
            },
            pollNew,
            pollInterval
        );
    }

    getItemKey(item: FeedViewPost): string {
        return item.post.uri + (AppBskyFeedDefs.isReasonRepost(item.reason) ? item.reason.by.did : "");
    }

    getItemDate(item: AppBskyFeedDefs.FeedViewPost): Date {
        return date(item) ?? new Date();
    }
}

export class LoggedInActorLikesStream extends CursorStream<FeedViewPost> {
    constructor() {
        super((cursor?: string, limit?: number) => {
            return State.getLoggedInActorLikes(cursor, limit);
        });
    }

    getItemKey(item: FeedViewPost): string {
        return item.post.uri + (AppBskyFeedDefs.isReasonRepost(item.reason) ? item.reason.by.did : "");
    }

    getItemDate(item: AppBskyFeedDefs.FeedViewPost): Date {
        return date(item) ?? new Date();
    }
}

export class ActorLikesStream extends CursorStream<PostView> {
    constructor(readonly actor: string) {
        super((cursor?: string, limit?: number) => {
            return State.getActorLikes(actor, cursor, limit);
        });
    }

    getItemKey(item: PostView): string {
        return item.uri;
    }

    getItemDate(item: PostView): Date {
        return date(item) ?? new Date();
    }
}

export class PostLikesStream extends CursorStream<ProfileViewDetailed> {
    constructor(readonly postUri: string) {
        super((cursor?: string, limit?: number) => {
            return State.getPostLikes(postUri, cursor, limit);
        });
    }

    getItemKey(item: ProfileViewDetailed): string {
        return item.did;
    }

    getItemDate(item: ProfileViewDetailed): Date {
        return item.indexedAt ? new Date(item.indexedAt) : new Date(); // FIXME
    }
}

export class PostRepostsStream extends CursorStream<ProfileViewDetailed> {
    constructor(readonly postUri: string) {
        super((cursor?: string, limit?: number) => {
            return State.getPostReposts(postUri, cursor, limit);
        });
    }

    getItemKey(item: ProfileViewDetailed): string {
        return item.did;
    }

    getItemDate(item: ProfileViewDetailed): Date {
        return item.indexedAt ? new Date(item.indexedAt) : new Date(); // FIXME
    }
}

export class FollowersStream extends CursorStream<ProfileViewDetailed> {
    constructor(readonly did: string) {
        super((cursor?: string, limit?: number) => {
            return State.getFollowers(did, cursor, limit);
        });
    }

    getItemKey(item: ProfileViewDetailed): string {
        return item.did;
    }

    getItemDate(item: ProfileViewDetailed): Date {
        return item.indexedAt ? new Date(item.indexedAt) : new Date(); // FIXME
    }
}

export class FollowingStream extends CursorStream<ProfileViewDetailed> {
    constructor(readonly did: string) {
        super((cursor?: string, limit?: number) => {
            return State.getFollowing(did, cursor, limit);
        });
    }

    getItemKey(item: ProfileViewDetailed): string {
        return item.did;
    }

    getItemDate(item: ProfileViewDetailed): Date {
        return item.indexedAt ? new Date(item.indexedAt) : new Date(); // FIXME
    }
}

export class QuotesStream implements Stream<PostView> {
    quotes?: string[];
    items: PostView[] = [];
    itemsMap = new Map<string, PostView>();
    pollNew = false;

    constructor(readonly postUri: string) {}

    getItemKey(item: PostView): string {
        return item.uri;
    }

    getItemDate(item: AppBskyFeedDefs.PostView): Date {
        return date(item) ?? new Date();
    }

    addNewItemsListener(listener: (newerItems: PostView[] | Error) => void): void {
        throw new Error("Method not supported");
    }

    poll() {
        throw new Error("Method not supported");
    }

    async next(): Promise<Error | PostView[]> {
        if (!State.isConnected()) return new Error("Couldn't load quotes");
        try {
            if (!this.quotes) {
                const quotes = await State.getQuotes(this.postUri);
                if (quotes instanceof Error) throw quotes;
                this.quotes = quotes;
            }

            const postUris = this.quotes.splice(0, 25);
            const posts = await State.getPosts(postUris);
            if (posts instanceof Error) throw posts;
            for (const post of posts) {
                this.itemsMap.set(this.getItemKey(post), post);
            }
            return posts;
        } catch (e) {
            return error("Couldn't load quotes", e);
        }
    }

    close(): void {
        throw new Error("Method not supported");
    }
}

/*
const loadNewerPosts = async (
            startCid: string,
            startTimestamp: number,
            seenPostKeys: Map<string, FeedViewPost | PostView>,
            minNumPosts = 10,
            maxTimeDifference = fortyEightHours
        ): Promise<{ posts: (FeedViewPost | PostView)[]; numRequests: number; exceededMaxTimeDifference: boolean } | Error> => {
            let timeIncrement = 15 * 60 * 1000;
            let time = startTimestamp + timeIncrement;
            let cid = startCid;
            let newerPosts: (FeedViewPost | PostView)[] = [];
            let lastCursor: string | undefined;
            let foundSeenPost = false;
            let numRequests = 0;
            let seenNewPosts = new Map<string, FeedViewPost | PostView>();
            let exceededMaxTimeDifference = false;

            // Fetch the latest posts and see if its our latest post.
            const response = await this.loadItems(undefined);
            numRequests++;
            if (response instanceof Error) return response;
            if (getCid(response.items[0]) == startCid) return { posts: [], numRequests, exceededMaxTimeDifference: false };

            // Adjust maxTimeDifference down if possible, results in fewer fetches.
            maxTimeDifference = Math.min(maxTimeDifference, getDate(response.items[0])!.getTime() - startTimestamp);
            if (maxTimeDifference < 0) maxTimeDifference = fortyEightHours;

            // FIrst pass, try to collect minNumPosts new posts. This may overshoot, so there's
            // a gap between the startPost and the last post in newPosts. We'll resolve the missing
            // posts in the next loop below.
            while (true) {
                const response = await this.loadItems(time + "::" + cid);
                if (response instanceof Error) return response;
                lastCursor = response.cursor;
                const fetchedPosts = response.items;
                let uniquePosts = fetchedPosts.filter(
                    (post) => !seenPostKeys.has(this.getItemKey(post)) && (getDate(post)?.getTime() ?? 0) > startTimestamp
                );
                uniquePosts = uniquePosts.filter((post) => !seenNewPosts.has(this.getItemKey(post)));
                uniquePosts.forEach((post) => seenNewPosts.set(this.getItemKey(post), post));
                foundSeenPost = fetchedPosts.some((post) => seenPostKeys.has(this.getItemKey(post)));
                numRequests++;
                // If we haven't found any new posts, we need to look further into the future
                // but not too far.
                if (uniquePosts.length == 0) {
                    foundSeenPost = false;
                    timeIncrement *= 1.75; // Make us jump a little further than last time
                    time += timeIncrement;
                    // If we searched to far into the future, give up
                    if (time - startTimestamp > maxTimeDifference) {
                        exceededMaxTimeDifference = seenNewPosts.size > 0;
                        break;
                    }
                    continue;
                }

                // If we found minNumPosts, we don't need to load any more posts
                // We might end up having to load older posts though, until we
                // find a seen post.
                newerPosts = [...uniquePosts, ...newerPosts];
                if (newerPosts.length >= minNumPosts) break;
            }

            // There's a gap between the new posts and the start post. Resolve
            // the posts in-between.
            if (!foundSeenPost && newerPosts.length > 0) {
                while (!foundSeenPost) {
                    const response = await this.loadItems(lastCursor);
                    if (response instanceof Error) return response;
                    lastCursor = response.cursor;
                    const fetchedPosts = response.items;
                    const uniquePosts = fetchedPosts.filter(
                        (post) => !seenPostKeys.has(this.getItemKey(post)) && (getDate(post)?.getTime() ?? 0) > startTimestamp
                    );
                    newerPosts = [...newerPosts, ...uniquePosts];
                    foundSeenPost = fetchedPosts.some((post) => seenPostKeys.has(this.getItemKey(post)));
                    numRequests++;
                }
            }

            return { posts: newerPosts, numRequests, exceededMaxTimeDifference };
        };
        */

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
