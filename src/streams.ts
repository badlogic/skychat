import { AppBskyFeedDefs, AppBskyNotificationListNotifications } from "@atproto/api";
import { FeedViewPost, GeneratorView, PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { ActorFeedType, State } from "./state";
import { error, fetchApi } from "./utils";
import { ProfileView, ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { date, record } from "./bsky";
import { ListItemView, ListView } from "@atproto/api/dist/client/types/app/bsky/graph/defs";

export type StreamPage<T> = { cursor?: string; items: T[] };

export type StreamProvider<T> = (cursor?: string, limit?: number, notify?: boolean) => Promise<Error | StreamPage<T>>;

export abstract class Stream<T> {
    pages: StreamPage<T>[] = [];
    itemsMap = new Map<string, T>();
    closed = false;
    timeoutId: any = undefined;

    constructor(readonly provider: StreamProvider<T>, public readonly pollNew = false, readonly pollInterval = 5000) {}

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
            let startTimestamp = this.pages.length > 0 ? this.getItemDate(this.pages[0].items[0]).getTime() : new Date().getTime();
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
                const dependencies = await this.loadDependencies(newItems);
                if (dependencies instanceof Error) {
                    for (const listener of this.newItemslisteners) {
                        listener(dependencies);
                    }
                    return;
                }
                const newPage = { cursor, items: newItems };
                for (const listener of this.newItemslisteners) {
                    listener(newPage);
                }
                this.pages.unshift(newPage);
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
    abstract loadDependencies(newItems: T[]): Promise<Error | void>;

    newItemslisteners: ((newPage: Error | StreamPage<T>) => void)[] = [];
    addNewItemsListener(listener: (newPage: Error | StreamPage<T>) => void): void {
        this.newItemslisteners.push(listener);
        if (this.pollNew) {
            this.timeoutId = setTimeout(() => this.poll(), this.pollInterval);
        }
    }

    async next(): Promise<Error | StreamPage<T>> {
        if (!State.isConnected()) return Error("Not connected");

        try {
            if (this.closed) return { items: [] };
            const lastCursor = this.pages.length == 0 ? undefined : this.pages[this.pages.length - 1].cursor;
            const response = await this.provider(lastCursor);
            if (response instanceof Error) throw response;
            for (const item of response.items) {
                this.itemsMap.set(this.getItemKey(item), item);
            }
            if (!response.cursor && response.items.length > 0) this.close();
            const page = { cursor: response.cursor, items: response.items };
            if (page.items.length > 0) this.pages.push(page);
            return page;
        } catch (e) {
            return error("Could not load items", e);
        }
    }

    close(): void {
        this.closed = true;
        clearTimeout(this.timeoutId);
    }
}

export class NotificationsStream extends Stream<AppBskyNotificationListNotifications.Notification> {
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

    async loadDependencies(newItems: AppBskyNotificationListNotifications.Notification[]) {
        // no-op
    }
}

export abstract class FeedViewPostStream extends Stream<FeedViewPost> {
    async loadDependencies(newItems: FeedViewPost[]) {
        return State.loadFeedViewPostsDependencies(newItems);
    }

    getItemKey(item: FeedViewPost): string {
        return item.post.uri + (AppBskyFeedDefs.isReasonRepost(item.reason) ? item.reason.by.did : "");
    }

    getItemDate(item: FeedViewPost): Date {
        return date(item) ?? new Date();
    }
}

export class ActorFeedStream extends FeedViewPostStream {
    constructor(readonly type: ActorFeedType, readonly actor?: string, pollNew = false, pollInterval?: number) {
        super(
            (cursor?: string, limit?: number, notify?: boolean) => {
                return State.getActorFeed(this.type, this.actor, cursor, limit, notify);
            },
            pollNew,
            pollInterval
        );
    }
}

export class LoggedInActorLikesStream extends FeedViewPostStream {
    constructor() {
        super((cursor?: string, limit?: number, notify?: boolean) => {
            return State.getLoggedInActorLikes(cursor, limit);
        });
    }
}

export class FeedPostsStream extends FeedViewPostStream {
    constructor(readonly feedUri: string, pollNew = false, pollInterval?: number) {
        super(
            (cursor?: string, limit?: number, notify?: boolean) => {
                return State.getFeed(this.feedUri, cursor, limit, notify);
            },
            pollNew,
            pollInterval
        );
    }
}

export class ListFeedPostsStream extends FeedViewPostStream {
    constructor(readonly feedUri: string, pollNew = false, pollInterval?: number) {
        super(
            (cursor?: string, limit?: number, notify?: boolean) => {
                return State.getListFeed(this.feedUri, cursor, limit, notify);
            },
            pollNew,
            pollInterval
        );
    }
}

export abstract class PostViewStream extends Stream<PostView> {
    async loadDependencies(newItems: PostView[]) {}

    getItemKey(item: PostView): string {
        return item.uri;
    }

    getItemDate(item: PostView): Date {
        return date(item) ?? new Date();
    }
}

export class PostSearchStream extends PostViewStream {
    constructor(readonly query: string, readonly reversStream = true, readonly pollNew = false, readonly pollInterval = 0) {
        const provider: StreamProvider<PostView> = async (cursor?: string, limit?: number, notify?: boolean) => {
            try {
                const response = await State.bskyClient!.app.bsky.feed.searchPosts({ q: this.query, cursor, limit });
                if (!response.success) throw new Error();
                let postsResponse = await State.getPosts(
                    response.data.posts.map((post) => post.uri),
                    true,
                    notify
                );
                if (postsResponse instanceof Error) throw new Error();
                postsResponse = postsResponse.filter((post) => post != undefined);
                if (this.reversStream) postsResponse.reverse();
                return { cursor: response.data.cursor, items: postsResponse };
            } catch (e) {
                return error(`Couldn't load posts for query ${this.query}, offset ${cursor}`, e);
            }
        };
        super(provider, pollNew, pollInterval);
    }
}

export class ActorLikesStream extends PostViewStream {
    constructor(readonly actor: string) {
        super((cursor?: string, limit?: number, notify?: boolean) => {
            return State.getActorLikes(actor, cursor, limit);
        });
    }
}

export class QuotesStream extends PostViewStream {
    quotes?: string[];
    items: PostView[] = [];
    itemsMap = new Map<string, PostView>();
    pollNew = false;

    constructor(readonly postUri: string) {
        const provider: StreamProvider<PostView> = async () => {
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
                return { cursor: "end", items: posts };
            } catch (e) {
                return error("Couldn't load quotes", e);
            }
        };
        super(provider);
    }
}

export class ProfileViewStream extends Stream<ProfileView> {
    async loadDependencies(newItems: ProfileView[]) {
        // no-op
    }

    getItemKey(item: ProfileViewDetailed): string {
        return item.did;
    }

    getItemDate(item: ProfileViewDetailed): Date {
        return item.indexedAt ? new Date(item.indexedAt) : new Date(); // BUG?
    }
}

export class PostLikesStream extends ProfileViewStream {
    constructor(readonly postUri: string) {
        super((cursor?: string, limit?: number, notify?: boolean) => {
            return State.getPostLikes(postUri, cursor, limit);
        });
    }
}

export class PostRepostsStream extends ProfileViewStream {
    constructor(readonly postUri: string) {
        super((cursor?: string, limit?: number, notify?: boolean) => {
            return State.getPostReposts(postUri, cursor, limit);
        });
    }
}

export class FollowersStream extends ProfileViewStream {
    constructor(readonly did: string) {
        super((cursor?: string, limit?: number, notify?: boolean) => {
            return State.getFollowers(did, cursor, limit);
        });
    }
}

export class FollowingStream extends ProfileViewStream {
    constructor(readonly did: string) {
        super((cursor?: string, limit?: number, notify?: boolean) => {
            return State.getFollowing(did, cursor, limit);
        });
    }
}

export class MutedUsersStream extends ProfileViewStream {
    constructor() {
        super((cursor?: string, limit?: number, notify?: boolean) => {
            return State.getMutedUsers(cursor, limit);
        });
    }
}

export class BlockedUsersStream extends ProfileViewStream {
    constructor() {
        super((cursor?: string, limit?: number, notify?: boolean) => {
            return State.getBlockedUsers(cursor, limit);
        });
    }
}

export class UserSearchStream extends ProfileViewStream {
    constructor(readonly query: string) {
        super((cursor?: string, limit?: number, notify?: boolean) => {
            return State.searchUsers(query, cursor, limit);
        });
    }
}

export class UserSuggestionStream extends ProfileViewStream {
    constructor() {
        super((cursor?: string, limit?: number, notify?: boolean) => {
            return State.suggestUsers(cursor, limit);
        });
    }
}

export abstract class GeneratorViewStream extends Stream<GeneratorView> {
    getItemKey(item: GeneratorView): string {
        return item.uri;
    }

    getItemDate(item: GeneratorView): Date {
        return item.indexedAt ? new Date(item.indexedAt) : new Date(); // BUG?
    }

    async loadDependencies(newItems: GeneratorView[]) {
        // no-op
    }
}

export class FeedSearchStream extends GeneratorViewStream {
    constructor(readonly query: string) {
        super((cursor?: string, limit?: number, notify?: boolean) => {
            return State.searchFeeds(query, cursor, limit);
        });
    }
}

export class FeedSuggestionStream extends GeneratorViewStream {
    constructor() {
        super((cursor?: string, limit?: number, notify?: boolean) => {
            return State.suggestFeeds(cursor, limit);
        });
    }
}

export class ActorGeneratorsStream extends GeneratorViewStream {
    constructor(did: string) {
        super((cursor?: string, limit?: number, notify?: boolean) => {
            return State.getActorGenerators(did, cursor, limit, notify);
        });
    }
}

export abstract class ListViewStream extends Stream<ListView> {
    getItemKey(item: ListView): string {
        return item.uri;
    }

    getItemDate(item: ListView): Date {
        return item.indexedAt ? new Date(item.indexedAt) : new Date(); // BUG?
    }

    async loadDependencies(newItems: ListView[]) {
        // no-op
    }
}

export class ListItemsStream extends Stream<ListItemView> {
    getItemKey(item: ListItemView): string {
        return item.uri;
    }
    getItemDate(item: ListItemView): Date {
        return new Date();
    }
    async loadDependencies(newItems: ListItemView[]): Promise<void | Error> {
        // no-op
    }
}

export class ActorListsStream extends ListViewStream {
    constructor(did: string) {
        super((cursor?: string, limit?: number, notify?: boolean) => {
            return State.getActorLists(did, cursor, limit, notify);
        });
    }
}

export type TrendingHashtag = { tag: string; name: string; count: number };

export class TrendingHashtagsStream extends Stream<TrendingHashtag> {
    constructor(minutes = 600) {
        super(async (cursor?: string, limit?: number, notify?: boolean) => {
            if (cursor == "end") return { items: [] };
            try {
                const response = await fetch(`https://skyfeed-trending-tags.b-cdn.net/xrpc/app.skyfeed.feed.getTrendingTags?minutes=${minutes}`);
                if (!response.ok) throw new Error();
                return { items: (await response.json()).tags as TrendingHashtag[], cursor: "end" };
            } catch (e) {
                return error("Couldn't load trending hashtags");
            }
        });
    }

    getItemKey(item: TrendingHashtag): string {
        return item.tag;
    }

    getItemDate(item: TrendingHashtag): Date {
        return new Date();
    }

    async loadDependencies(newItems: TrendingHashtag[]): Promise<void | Error> {
        // no-op
    }
}

export function memoryStreamProvider<T>(items: T[]): StreamProvider<T> {
    return async (cursor?: string, limit: number = 20, notify?: boolean) => {
        let index = !cursor ? 0 : Number.parseInt(cursor);
        if (index >= items.length) return { items: [] };
        const page = { cursor: (index + limit).toString(), items: items.slice(index, index + limit) } as StreamPage<T>;
        return page;
    };
}
