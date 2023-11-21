import { AppBskyFeedDefs, AppBskyNotificationListNotifications } from "@atproto/api";
import { FeedViewPost, GeneratorView, PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
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
    constructor(readonly query: string, readonly reversStream = true) {}

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
            let postsResponse = await State.getPosts(result.posts.map((post) => post.uri));
            if (postsResponse instanceof Error) throw new Error();
            postsResponse = postsResponse.filter((post) => post != undefined);
            this.cursor = result.cursor;
            for (const post of postsResponse) {
                this.itemsMap.set(this.getItemKey(post), post);
            }
            if (this.reversStream) postsResponse.reverse();
            return postsResponse;
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
        readonly provider: (cursor?: string, limit?: number, notify?: boolean) => Promise<Error | { cursor?: string; items: T[] }>,
        public readonly pollNew = false,
        readonly pollInterval = 5000
    ) {}

    isPolling = false;
    async poll() {
        if (this.isPolling) return;
        this.isPolling = true;

        try {
            // FIXME this will fail miserable if the client hasn't polled in say 24h, gets woken up
            // and starts polling from the top of the new posts. Could be hundreds of posts. Need to
            // employ the smart strategy of binary searching so we only pull in
            const newItems: T[] = [];
            let cursor: string | undefined;
            let startTimestamp = this.items.length > 0 ? this.getItemDate(this.items[0]).getTime() : new Date().getTime();
            while (true) {
                let fetchedItems = await this.provider(cursor, 20, false);
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
            if (this.closed) return [];
            const response = await this.provider(this.cursor);
            if (response instanceof Error) throw response;
            this.cursor = response.cursor;
            this.items.push(...response.items);
            for (const item of response.items) {
                this.itemsMap.set(this.getItemKey(item), item);
            }
            if (!this.cursor && response.items.length > 0) this.close();
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
            (cursor?: string, limit?: number, notify?: boolean) => {
                return State.getNotifications(cursor, limit);
            },
            pollNew,
            pollInterval
        );
    }

    getItemKey(item: AppBskyNotificationListNotifications.Notification): string {
        return item.uri; // BUG?
    }

    getItemDate(item: AppBskyNotificationListNotifications.Notification): Date {
        return new Date(item.indexedAt); // BUG?
    }
}

export class ActorFeedStream extends CursorStream<FeedViewPost> {
    constructor(readonly type: ActorFeedType, readonly actor?: string, pollNew = false, pollInterval?: number) {
        super(
            (cursor?: string, limit?: number, notify?: boolean) => {
                return State.getActorFeed(this.type, this.actor, cursor, limit, notify);
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
        super((cursor?: string, limit?: number, notify?: boolean) => {
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
        super((cursor?: string, limit?: number, notify?: boolean) => {
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
        super((cursor?: string, limit?: number, notify?: boolean) => {
            return State.getPostLikes(postUri, cursor, limit);
        });
    }

    getItemKey(item: ProfileViewDetailed): string {
        return item.did;
    }

    getItemDate(item: ProfileViewDetailed): Date {
        return item.indexedAt ? new Date(item.indexedAt) : new Date(); // BUG?
    }
}

export class PostRepostsStream extends CursorStream<ProfileViewDetailed> {
    constructor(readonly postUri: string) {
        super((cursor?: string, limit?: number, notify?: boolean) => {
            return State.getPostReposts(postUri, cursor, limit);
        });
    }

    getItemKey(item: ProfileViewDetailed): string {
        return item.did;
    }

    getItemDate(item: ProfileViewDetailed): Date {
        return item.indexedAt ? new Date(item.indexedAt) : new Date(); // BUG?
    }
}

export class FollowersStream extends CursorStream<ProfileViewDetailed> {
    constructor(readonly did: string) {
        super((cursor?: string, limit?: number, notify?: boolean) => {
            return State.getFollowers(did, cursor, limit);
        });
    }

    getItemKey(item: ProfileViewDetailed): string {
        return item.did;
    }

    getItemDate(item: ProfileViewDetailed): Date {
        return item.indexedAt ? new Date(item.indexedAt) : new Date(); // BUG?
    }
}

export class FollowingStream extends CursorStream<ProfileViewDetailed> {
    constructor(readonly did: string) {
        super((cursor?: string, limit?: number, notify?: boolean) => {
            return State.getFollowing(did, cursor, limit);
        });
    }

    getItemKey(item: ProfileViewDetailed): string {
        return item.did;
    }

    getItemDate(item: ProfileViewDetailed): Date {
        return item.indexedAt ? new Date(item.indexedAt) : new Date(); // BUG?
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

export class UserSearchStream extends CursorStream<ProfileViewDetailed> {
    constructor(readonly query: string) {
        super((cursor?: string, limit?: number, notify?: boolean) => {
            return State.searchUsers(query, cursor, limit);
        });
    }

    getItemKey(item: ProfileViewDetailed): string {
        return item.did;
    }

    getItemDate(item: ProfileViewDetailed): Date {
        return item.indexedAt ? new Date(item.indexedAt) : new Date(); // BUG?
    }
}

export class UserSuggestionStream extends CursorStream<ProfileViewDetailed> {
    constructor() {
        super((cursor?: string, limit?: number, notify?: boolean) => {
            return State.suggestUsers(cursor, limit);
        });
    }

    getItemKey(item: ProfileViewDetailed): string {
        return item.did;
    }

    getItemDate(item: ProfileViewDetailed): Date {
        return item.indexedAt ? new Date(item.indexedAt) : new Date(); // BUG?
    }
}

export class FeedSearchStream extends CursorStream<GeneratorView> {
    constructor(readonly query: string) {
        super((cursor?: string, limit?: number, notify?: boolean) => {
            return State.searchFeeds(query, cursor, limit);
        });
    }

    getItemKey(item: GeneratorView): string {
        return item.uri;
    }

    getItemDate(item: GeneratorView): Date {
        return item.indexedAt ? new Date(item.indexedAt) : new Date(); // BUG?
    }
}

export class FeedSuggestionStream extends CursorStream<GeneratorView> {
    constructor() {
        super((cursor?: string, limit?: number, notify?: boolean) => {
            return State.suggestFeeds(cursor, limit);
        });
    }

    getItemKey(item: GeneratorView): string {
        return item.uri;
    }

    getItemDate(item: GeneratorView): Date {
        return item.indexedAt ? new Date(item.indexedAt) : new Date(); // BUG?
    }
}

export class ArrayFeed<T> extends CursorStream<T> {
    index = 0;
    constructor(items: T[], readonly itemKey: (item: T) => string, readonly itemDate: (item: T) => Date) {
        items = [...items];
        super(async (cursor?: string, limit?: number, notify?: boolean) => {
            const batch = items.splice(0, limit);
            if (batch.length == 0) return { items: [] };
            this.index += batch.length;
            return { cursor: this.index.toString(), items: batch };
        });
    }

    getItemKey(item: T): string {
        return this.itemKey(item);
    }

    getItemDate(item: T): Date {
        return this.itemDate(item);
    }
}

export class FeedPostsStream extends CursorStream<FeedViewPost> {
    constructor(readonly feedUri: string, pollNew = false, pollInterval?: number) {
        super(
            (cursor?: string, limit?: number, notify?: boolean) => {
                return State.getFeed(this.feedUri, cursor, limit, notify);
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
