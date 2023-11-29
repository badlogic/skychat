import {
    AppBskyActorDefs,
    AppBskyActorSearchActors,
    AppBskyActorSearchActorsTypeahead,
    AppBskyFeedDefs,
    AppBskyFeedGetFeedGenerator,
    AppBskyFeedPost,
    AppBskyGraphGetListBlocks,
    AppBskyGraphGetListMutes,
    AppBskyNotificationListNotifications,
    AtpSessionData,
    AtpSessionEvent,
    BskyAgent,
    BskyPreferences,
    RichText,
} from "@atproto/api";
import { Preferences, ProfileView, ProfileViewDetailed, SavedFeedsPref } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { Store, User } from "./store";
import { AsyncQueue, assertNever, error, fetchApi, getDateString, splitAtUri } from "./utils";
import { FeedViewPost, GeneratorView, PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { record } from "./bsky";
import { StreamPage } from "./streams";
import { ListView } from "@atproto/api/dist/client/types/app/bsky/graph/defs";

export interface NumQuote {
    postUri: string;
    numQuotes: number;
}

export interface Events {
    post: PostView;
    profile: ProfileViewDetailed;
    feed: GeneratorView;
    list: ListView;
    numQuote: NumQuote;
    unreadNotifications: number;
    theme: string;
    preferences: BskyPreferences;
}

export type EventAction = "updated" | "updated_profile_moderation" | "deleted";

export type ActorFeedType = "home" | "posts_with_replies" | "posts_no_replies" | "posts_with_media";

export const NOTIFICATION_CHECK_INTERVAL = 5000;
export const PREFERENCES_CHECK_INTERVAL = 15000;
export const MUTE_AND_BLOCK_LIST_CHECK_INTERVAL = 15000;
export const FEED_CHECK_INTERVAL = 5000;

export class State {
    static DEBUG = false;
    static bskyClient?: BskyAgent;
    private static objects: { [K in keyof Events]?: Map<string, Events[K]> } = {};
    private static generalListeners: { [K in keyof Events]?: ((action: EventAction, payload: Events[K]) => void)[] } = {};
    private static idSpecificListeners: { [K in keyof Events]?: Map<string, ((action: EventAction, payload: Events[K]) => void)[]> } = {};

    static subscribe<K extends keyof Events>(event: K, listener: (action: EventAction, payload: Events[K]) => void, id?: string): () => void {
        if (id) {
            this.idSpecificListeners[event] = this.idSpecificListeners[event] || new Map();
            const listeners = this.idSpecificListeners[event]!.get(id) || [];
            listeners.push(listener);
            this.idSpecificListeners[event]!.set(id, listeners);
        } else {
            this.generalListeners[event] = this.generalListeners[event] || [];
            this.generalListeners[event]!.push(listener);
        }

        return () => {
            if (id) {
                const listeners = this.idSpecificListeners[event]?.get(id);
                if (listeners) {
                    this.idSpecificListeners[event]!.set(
                        id,
                        listeners.filter((l) => l !== listener)
                    );
                }
            } else {
                this.generalListeners[event] = this.generalListeners[event]?.filter((l) => l !== listener) || ([] as any);
            }
        };
    }

    static notify<K extends keyof Events>(event: K, action: EventAction, payload: Events[K]) {
        this.storeObject(event, payload); // We always store, even in case of a delete
        this.generalListeners[event]?.forEach((listener) => listener(action, payload));
        let id: string | undefined;

        switch (event) {
            case "post":
                id = (payload as PostView).uri;
                break;
            case "profile":
                id = (payload as ProfileViewDetailed).did;
                break;
            case "numQuote":
                id = (payload as NumQuote).postUri;
                break;
            case "feed":
                id = (payload as GeneratorView).uri;
                break;
            case "list":
                id = (payload as ListView).uri;
                break;
            case "unreadNotifications":
            case "theme":
            case "preferences":
                if (State.DEBUG) console.log(`${getDateString(new Date())} - notify - ${event} ${action}`, payload);
                return;
            default:
                assertNever(event);
        }

        if (State.DEBUG) console.log(`${getDateString(new Date())} - notify - ${event} ${action} ${id}`, payload);

        if (id) {
            this.idSpecificListeners[event]?.get(id)?.forEach((listener) => listener(action, payload));
        }
    }

    static notifyBatch<K extends keyof Events>(event: K, action: EventAction, payloads: Events[K][]) {
        for (const payload of payloads) {
            this.notify(event, action, payload);
        }
    }

    static storeObject<K extends keyof Events>(event: K, payload: Events[K]) {
        let id: string | undefined;

        switch (event) {
            case "post":
                id = (payload as PostView).uri;
                break;
            case "profile":
                id = (payload as ProfileViewDetailed).did;
                break;
            case "numQuote":
                id = (payload as NumQuote).postUri;
                break;
            case "feed":
                id = (payload as GeneratorView).uri;
                break;
            case "list":
                id = (payload as ListView).uri;
                break;
            case "unreadNotifications":
            case "theme":
            case "preferences":
                return;
            default:
                assertNever(event);
        }

        if (id) {
            if (!this.objects[event]) {
                this.objects[event] = new Map();
            }
            this.objects[event]!.set(id, payload);
        }
    }

    static getObject<K extends keyof Events>(event: K, id: string): Events[K] | undefined {
        return this.objects[event]?.get(id);
    }

    static deleteObject<K extends keyof Events>(event: K, id: string) {
        this.objects[event]?.delete(id);
    }

    static async getPosts(uris: string[], cacheProfilesAndQuotes = true, notify = true): Promise<Error | PostView[]> {
        if (!State.bskyClient) return new Error("Not connected");
        const urisToFetch = Array.from(new Set<string>(uris));
        const posts: PostView[] = [];
        const postsMap = new Map<string, PostView>();
        try {
            const promises: Promise<any>[] = [];
            while (urisToFetch.length > 0) {
                const batch = urisToFetch.splice(0, 25);
                const response = await State.bskyClient.app.bsky.feed.getPosts({ uris: batch });
                if (!response.success) throw new Error();
                posts.push(...response.data.posts);

                const profilesToFetch: string[] = [];
                for (const post of response.data.posts) {
                    profilesToFetch.push(post.author.did);
                    postsMap.set(post.uri, post);
                }
                if (cacheProfilesAndQuotes) promises.push(this.getNumQuotes(batch), this.getProfiles(profilesToFetch));
            }

            for (const promise of promises) {
                if (promise instanceof Error) throw promise;
            }
            if (notify) this.notifyBatch("post", "updated", posts);
            return uris.map((uri) => postsMap.get(uri)!);
        } catch (e) {
            return error("Couldn't load posts", e);
        }
    }

    static async deletePost(uri: string): Promise<Error | undefined> {
        if (!State.bskyClient) throw new Error("Not connected");
        try {
            await State.bskyClient.deletePost(uri);
            const post = this.getObject("post", uri);
            const quote = this.getObject("numQuote", uri);
            this.deleteObject("post", uri);
            this.deleteObject("numQuote", uri);
            if (post) this.notify("post", "deleted", post);
            if (quote) this.notify("numQuote", "deleted", quote);
        } catch (e) {
            return error("Couldn't delete post.", e);
        }
    }

    static async createPost(record: AppBskyFeedPost.Record): Promise<Error | PostView> {
        if (!State.bskyClient) return new Error("Not connected");
        try {
            const response = await State.bskyClient.post(record);
            let post: PostView | undefined;
            const start = performance.now();
            while (true) {
                const postResponse = await State.getPosts([response.uri]);
                if (postResponse instanceof Error) throw postResponse;
                if (postResponse.length == 0) {
                    console.error("Sent post, but received null response, retrying");
                    continue;
                }
                post = postResponse[0];
                if (post || (performance.now() - start) / 1000 > 5) break;
            }
            if (!post) return new Error("Couldn't retrieve post after creating record");
            return post;
        } catch (e) {
            return error("Couldn't send post", e);
        }
    }

    static async getNumQuotes(postUris: string[]): Promise<Error | NumQuote[]> {
        try {
            const postUrisToFetch = Array.from(new Set<string>(postUris));
            const quotesMap = new Map<string, number>();

            while (postUrisToFetch.length > 0) {
                const batch = postUrisToFetch.splice(0, 15);
                const response = await fetchApi("numquotes?" + batch.map((uri) => `uri=${encodeURIComponent(uri)}&`).join(""));
                if (!response.ok) throw new Error();
                const quotes = (await response.json()) as Record<string, number>;
                for (const uri of batch) {
                    quotesMap.set(uri, quotes[uri]);
                }
            }

            const quotesList: NumQuote[] = [];
            for (const postUri of Array.from(new Set<string>(postUris))) {
                quotesList.push({ postUri, numQuotes: quotesMap.get(postUri)! });
            }

            this.notifyBatch("numQuote", "updated", quotesList);
            return postUris.map((postUri) => {
                return { postUri: postUri, numQuotes: quotesMap.get(postUri)! };
            });
        } catch (e) {
            return error("Couldn't load num quotes", e);
        }
    }

    static async getQuotes(postUri: string): Promise<Error | string[]> {
        try {
            const response = await fetchApi(`quotes?uri=${encodeURIComponent(postUri)}`);
            if (!response.ok) throw new Error();
            return (await response.json()) as string[];
        } catch (e) {
            return error("Couldn't load quotes", e);
        }
    }

    static async getProfiles(dids: string[]): Promise<Error | ProfileViewDetailed[]> {
        if (!State.bskyClient) return new Error("Not connected");
        try {
            const didsToFetch = Array.from(new Set<string>(dids));
            const promises = [];
            while (didsToFetch.length > 0) {
                const batch = didsToFetch.splice(0, 10);
                promises.push(State.bskyClient.app.bsky.actor.getProfiles({ actors: batch }));
            }
            const results = await Promise.all(promises);

            const profiles: ProfileViewDetailed[] = [];
            const profilesMap = new Map<string, ProfileViewDetailed>();
            for (const result of results) {
                if (!result.success) throw new Error();
                for (const profile of result.data.profiles) {
                    profiles.push(profile);
                    profilesMap.set(profile.did, profile);
                    profilesMap.set(profile.handle, profile);
                }
            }
            this.notifyBatch("profile", "updated", profiles);
            return dids.map((did) => profilesMap.get(did)!);
        } catch (e) {
            return error("Couldn't load profiles", e);
        }
    }

    static async countUnreadNotifications(): Promise<Error | number> {
        if (!State.bskyClient) return new Error("Not connected");
        try {
            const response = await State.bskyClient.countUnreadNotifications();
            if (!response.success) throw new Error();
            return response.data.count;
        } catch (e) {
            return error("Couldn't count unread notifications", e);
        }
    }

    static async getNotifications(cursor?: string, limit = 25): Promise<Error | StreamPage<AppBskyNotificationListNotifications.Notification>> {
        if (!State.bskyClient) return new Error("Not connected");

        try {
            const listResponse = await State.bskyClient.listNotifications({ cursor, limit });
            if (!listResponse.success) throw new Error();

            const postsToLoad: string[] = [];
            const quotesToLoad: string[] = [];
            for (const notification of listResponse.data.notifications) {
                if (notification.reasonSubject && notification.reasonSubject.includes("app.bsky.feed.post")) {
                    postsToLoad.push(notification.reasonSubject);
                    quotesToLoad.push(notification.reasonSubject);
                }
                if (AppBskyFeedPost.isRecord(notification.record) && notification.record.reply) {
                    postsToLoad.push(notification.record.reply.parent.uri);
                    quotesToLoad.push(notification.uri);
                }
                if (notification.uri.includes("app.bsky.feed.post")) {
                    postsToLoad.push(notification.uri);
                }
            }
            const promises = await Promise.all([State.getPosts(postsToLoad, false), State.getNumQuotes(quotesToLoad)]);
            if (promises[0] instanceof Error) throw promises[0];

            State.bskyClient.updateSeenNotifications(); // Not important to wait for this one.
            return { cursor: listResponse.data.cursor, items: listResponse.data.notifications };
        } catch (e) {
            return error("Couldn't load notifications", e);
        }
    }

    static async getActorFeed(
        type: ActorFeedType,
        actor?: string,
        cursor?: string,
        limit = 20,
        notify = true
    ): Promise<Error | StreamPage<FeedViewPost>> {
        if (!State.bskyClient) return new Error("Not connected");
        try {
            let data: StreamPage<FeedViewPost> | undefined;

            switch (type) {
                case "home": {
                    const response = await State.bskyClient.getTimeline({ cursor, limit });
                    if (!response.success) throw new Error();
                    data = { cursor: response.data.cursor, items: response.data.feed };
                    break;
                }
                default: {
                    if (!actor) throw new Error("No actor given");
                    const response = await State.bskyClient.getAuthorFeed({ actor, cursor, filter: type, limit });
                    if (!response.success) throw new Error();
                    data = { cursor: response.data.cursor, items: response.data.feed };
                    break;
                }
            }

            if (notify) await State.loadFeedViewPostsDependencies(data.items);
            return data;
        } catch (e) {
            return error("Couldn't load actor feed", e);
        }
    }

    static async getFeed(feedUri: string, cursor?: string, limit = 20, notify = true): Promise<Error | StreamPage<FeedViewPost>> {
        if (!State.bskyClient) return new Error("Not connected");
        try {
            let data: StreamPage<FeedViewPost> | undefined;

            const response = await State.bskyClient.app.bsky.feed.getFeed({ feed: feedUri, cursor, limit });
            if (!response.success) throw new Error();
            data = { cursor: response.data.cursor, items: response.data.feed };
            if (notify) await State.loadFeedViewPostsDependencies(data.items);
            return data;
        } catch (e) {
            return error("Couldn't load feed " + feedUri, e);
        }
    }

    static async loadFeedViewPostsDependencies(feedViewPosts: FeedViewPost[]): Promise<Error | void> {
        try {
            const posts: PostView[] = [];
            const profilesToFetch: string[] = [];
            const postUrisToFetch: string[] = [];
            for (const feedViewPost of feedViewPosts) {
                posts.push(feedViewPost.post);
                postUrisToFetch.push(feedViewPost.post.uri);
                profilesToFetch.push(feedViewPost.post.author.did);

                if (feedViewPost.reply) {
                    if (AppBskyFeedDefs.isPostView(feedViewPost.reply.parent)) {
                        posts.push(feedViewPost.reply.parent);
                        postUrisToFetch.push(feedViewPost.reply.parent.uri);
                        const parentRecord = record(feedViewPost.reply.parent);
                        if (parentRecord && parentRecord.reply) {
                            profilesToFetch.push(splitAtUri(parentRecord.reply.parent.uri).repo);
                        }
                    }
                }
                if (AppBskyFeedDefs.isReasonRepost(feedViewPost.reason)) {
                    profilesToFetch.push(feedViewPost.reason.by.did);
                }
            }
            const promises = await Promise.all([State.getProfiles(profilesToFetch), State.getNumQuotes(postUrisToFetch)]);
            if (promises[0] instanceof Error) throw promises[0];
            this.notifyBatch("post", "updated", posts);
        } catch (e) {
            return error("Couldn't fetch feed view post dependencies");
        }
    }

    static async getLoggedInActorLikes(cursor?: string, limit = 20): Promise<Error | StreamPage<FeedViewPost>> {
        if (!State.bskyClient) return new Error("Not connected");
        try {
            const did = Store.getUser()?.profile.did;
            if (!did) throw new Error("Not connected");
            const result = await State.bskyClient.app.bsky.feed.getActorLikes({ cursor, limit, actor: did });
            if (!result.success) return new Error();
            const posts: PostView[] = [];
            for (const feedViewPost of result.data.feed) {
                posts.push(feedViewPost.post);
                if (feedViewPost.reply) {
                    if (AppBskyFeedDefs.isPostView(feedViewPost.reply.parent)) {
                        posts.push(feedViewPost.reply.parent);
                    }
                }
            }
            this.notifyBatch("post", "updated", posts);
            return { cursor: result.data.cursor, items: result.data.feed };
        } catch (e) {
            return error("Couldn't load logged in actor likes", e);
        }
    }

    static async getActorLikes(did: string, cursor?: string, limit = 20): Promise<Error | StreamPage<PostView>> {
        if (!State.bskyClient) return new Error("Not connected");
        try {
            // Resolve the didDoc
            let repoResult: Response;
            repoResult = did.includes("did:plc")
                ? await fetch("https://plc.directory/" + did)
                : await fetchApi(`api/resolve-did-web?did=${encodeURIComponent(did)}`);
            if (!repoResult.ok) throw new Error("Couldn't get didDoc");

            // Resolve the service
            const didDoc: any = await repoResult.json();
            if (!didDoc.service) throw new Error("Service not defined for did");
            let pdsUrl: string | undefined;
            for (const service of didDoc.service) {
                if (service.type == "AtprotoPersonalDataServer") {
                    pdsUrl = service.serviceEndpoint;
                }
            }
            if (!pdsUrl) throw new Error("PDS not found");

            // List the records from the likes collection
            const client = new BskyAgent({ service: pdsUrl });
            const result = await client.com.atproto.repo.listRecords({ cursor, limit, repo: did, collection: "app.bsky.feed.like" });
            if (!result.success) throw new Error("Couldn't list records");

            // Collect the uris and load the posts
            const postUris: string[] = [];
            for (const record of result.data.records) {
                postUris.push((record.value as any).subject.uri);
            }
            if (postUris.length == 0) return { items: [] as PostView[] };

            const postsResult = await State.getPosts(postUris);
            if (postsResult instanceof Error) throw postsResult;
            return { cursor: result.data.cursor, items: postsResult.filter((post) => post != undefined) };
        } catch (e) {
            return error("Couldn't load actor likes", e);
        }
    }

    static async getActorGenerators(did: string, cursor?: string, limit = 20, notify = true): Promise<Error | StreamPage<GeneratorView>> {
        if (!State.bskyClient) return new Error("Not connected");
        try {
            const result = await State.bskyClient.app.bsky.feed.getActorFeeds({ actor: did, cursor, limit });
            if (!result.success) throw new Error();
            if (notify) this.notifyBatch("feed", "updated", result.data.feeds);
            return { cursor: result.data.cursor, items: result.data.feeds };
        } catch (e) {
            return error("Couldn't load actor generators", e);
        }
    }

    static async getActorLists(did: string, cursor?: string, limit = 20, notify = true): Promise<Error | StreamPage<ListView>> {
        if (!State.bskyClient) return new Error("Not connected");
        try {
            const result = await State.bskyClient.app.bsky.graph.getLists({ actor: did, cursor, limit });
            if (!result.success) throw new Error();
            if (notify) this.notifyBatch("list", "updated", result.data.lists);
            return { cursor: result.data.cursor, items: result.data.lists };
        } catch (e) {
            return error("Couldn't load actor lists", e);
        }
    }

    static async getPostLikes(postUri: string, cursor?: string, limit = 20): Promise<Error | StreamPage<ProfileView>> {
        if (!State.bskyClient) return new Error("Not connected");
        try {
            const result = await State.bskyClient.getLikes({ uri: postUri, cursor, limit });
            if (!result.success) throw new Error();
            const profiles = result.data.likes.map((like) => like.actor);
            this.notifyBatch("profile", "updated", profiles);
            return { cursor: result.data.cursor, items: profiles };
        } catch (e) {
            return error("Couldn't load post likes", e);
        }
    }

    static async getPostReposts(postUri: string, cursor?: string, limit = 20): Promise<Error | StreamPage<ProfileView>> {
        if (!State.bskyClient) return new Error("Not connected");
        try {
            const result = await State.bskyClient.getRepostedBy({ uri: postUri, cursor, limit });
            if (!result.success) throw new Error();
            const profiles = result.data.repostedBy;
            this.notifyBatch("profile", "updated", profiles);
            return { cursor: result.data.cursor, items: profiles };
        } catch (e) {
            return error("Couldn't load post resposts", e);
        }
    }

    static async getFollowers(did: string, cursor?: string, limit = 20): Promise<Error | StreamPage<ProfileView>> {
        if (!State.bskyClient) return new Error("Not connected");
        try {
            const result = await State.bskyClient.getFollowers({ actor: did, cursor, limit });
            if (!result.success) throw new Error();
            const profiles = result.data.followers;
            this.notifyBatch("profile", "updated", profiles);
            return { cursor: result.data.cursor, items: profiles };
        } catch (e) {
            return error("Couldn't load followers", e);
        }
    }

    static async getFollowing(did: string, cursor?: string, limit = 20): Promise<Error | StreamPage<ProfileView>> {
        if (!State.bskyClient) return new Error("Not connected");
        try {
            const result = await State.bskyClient.getFollows({ actor: did, cursor, limit });
            if (!result.success) throw new Error();
            const profiles = result.data.follows;
            this.notifyBatch("profile", "updated", profiles);
            return { cursor: result.data.cursor, items: profiles };
        } catch (e) {
            return error("Couldn't load following", e);
        }
    }

    static async getMutedUsers(cursor?: string, limit = 20): Promise<Error | StreamPage<ProfileView>> {
        if (!State.bskyClient) return new Error("Not connected");
        try {
            const result = await State.bskyClient.app.bsky.graph.getMutes({ cursor, limit });
            if (!result.success) throw new Error();
            const profiles = result.data.mutes;
            this.notifyBatch("profile", "updated", profiles);
            return { cursor: result.data.cursor, items: profiles };
        } catch (e) {
            return error("Couldn't load muted users", e);
        }
    }

    static async getBlockedUsers(cursor?: string, limit = 20): Promise<Error | StreamPage<ProfileView>> {
        if (!State.bskyClient) return new Error("Not connected");
        try {
            const result = await State.bskyClient.app.bsky.graph.getBlocks({ cursor, limit });
            if (!result.success) throw new Error();
            const profiles = result.data.blocks;
            this.notifyBatch("profile", "updated", profiles);
            return { cursor: result.data.cursor, items: profiles };
        } catch (e) {
            return error("Couldn't load blocked users", e);
        }
    }

    static async searchUsers(query: string, cursor?: string, limit = 20): Promise<Error | StreamPage<ProfileView>> {
        if (!State.bskyClient) return new Error("Not connected");
        try {
            const promises: Promise<any | Error>[] = [];
            if (!cursor) {
                promises.push(State.bskyClient.searchActorsTypeahead({ q: query, limit: 25 }));
            }
            promises.push(State.bskyClient.searchActors({ q: query, cursor, limit }));
            const results = await Promise.all(promises);
            const result = (results.length == 1 ? results[0] : results[1]) as AppBskyActorSearchActors.Response;
            if (!result.success) throw new Error();
            let profiles = result.data.actors;
            const typeAheadResult = results.length == 2 ? (results[0] as AppBskyActorSearchActorsTypeahead.Response) : undefined;
            if (typeAheadResult?.success) {
                const lookup = new Set<string>(typeAheadResult.data.actors.map((user) => user.did));
                profiles = [...typeAheadResult.data.actors, ...profiles.filter((user) => !lookup.has(user.did))];
            }
            this.notifyBatch("profile", "updated", profiles);
            return { cursor: result.data.cursor, items: profiles };
        } catch (e) {
            return error("Couldn't search users", e);
        }
    }

    static async suggestUsers(cursor?: string, limit = 20): Promise<Error | StreamPage<ProfileView>> {
        if (!State.bskyClient) return new Error("Not connected");
        try {
            const result = await State.bskyClient.getSuggestions({ cursor, limit });
            if (!result.success) throw new Error();
            const profiles = result.data.actors;
            this.notifyBatch("profile", "updated", profiles);
            return { cursor: result.data.cursor, items: profiles };
        } catch (e) {
            return error("Couldn't suggest users", e);
        }
    }

    static async searchFeeds(query: string, cursor?: string, limit = 50): Promise<Error | StreamPage<GeneratorView>> {
        if (!State.bskyClient) return new Error("Not connected");
        try {
            const result = await State.bskyClient.app.bsky.unspecced.getPopularFeedGenerators({ query, cursor, limit });
            if (!result.success) throw new Error();
            const feedUris = result.data.feeds.map((feed) => feed.uri);
            const feeds: GeneratorView[] = [];
            while (feedUris.length > 0) {
                const batch = feedUris.splice(0, 25);
                const response = await State.bskyClient.app.bsky.feed.getFeedGenerators({ feeds: batch });
                if (!response.success) throw new Error("Couldn't fetch feeds");
                feeds.push(...response.data.feeds);
            }
            this.notifyBatch("feed", "updated", feeds);
            return { cursor: result.data.cursor, items: feeds };
        } catch (e) {
            return error("Couldn't search feeds", e);
        }
    }

    static async suggestFeeds(cursor?: string, limit = 50): Promise<Error | StreamPage<GeneratorView>> {
        if (!State.bskyClient) return new Error("Not connected");
        try {
            const result = await State.bskyClient.app.bsky.unspecced.getPopularFeedGenerators({ cursor, limit });
            if (!result.success) throw new Error();
            const feeds = result.data.feeds;
            this.notifyBatch("feed", "updated", feeds);
            return { cursor: result.data.cursor, items: feeds };
        } catch (e) {
            return error("Couldn't suggest feeds", e);
        }
    }

    static async getFeeds(feeds: string[]): Promise<Error | GeneratorView[]> {
        if (!State.bskyClient) return new Error("Not connected");
        try {
            const promises: Promise<any>[] = [];
            const feedsToFetch: string[] = [...feeds];
            const feedsMap = new Map<string, GeneratorView>();
            while (feedsToFetch.length > 0) {
                const batch = feedsToFetch.splice(0, 25);
                const result = await State.bskyClient.app.bsky.feed.getFeedGenerators({ feeds: batch });
                if (!result.success) throw new Error();
                for (const feed of result.data.feeds) {
                    feedsMap.set(feed.uri, feed);
                }
            }
            const fetchedFeeds = feeds.map((uri) => feedsMap.get(uri)).filter((feed) => feed != undefined) as GeneratorView[];
            this.notifyBatch("feed", "updated", fetchedFeeds);
            return fetchedFeeds;
        } catch (e) {
            return error("Couldn't suggest feeds", e);
        }
    }

    static async getList(list: string): Promise<Error | ListView> {
        if (!State.bskyClient) return new Error("Not connected");
        try {
            const response = await State.bskyClient.app.bsky.graph.getList({ list, limit: 1 });
            if (!response.success) throw new Error();
            this.notify("list", "updated", response.data.list);
            return response.data.list;
        } catch (e) {
            return error("Couldn't suggest feeds", e);
        }
    }

    static async getListItems(list: string, cursor?: string): Promise<Error | StreamPage<ProfileView>> {
        if (!State.bskyClient) return new Error("Not connected");
        try {
            const response = await State.bskyClient.app.bsky.graph.getList({ list, cursor });
            if (!response.success) throw new Error();
            const profiles = response.data.items.map((item) => item.subject);
            this.notifyBatch("profile", "updated", profiles);
            return { cursor: response.data.cursor, items: profiles };
        } catch (e) {
            return error("Couldn't suggest feeds", e);
        }
    }

    static async getListFeed(listUri: string, cursor?: string, limit = 20, notify = true): Promise<Error | StreamPage<FeedViewPost>> {
        if (!State.bskyClient) return new Error("Not connected");
        try {
            let data: StreamPage<FeedViewPost> | undefined;

            const response = await State.bskyClient.app.bsky.feed.getListFeed({ list: listUri, cursor, limit });
            if (!response.success) throw new Error();
            data = { cursor: response.data.cursor, items: response.data.feed };
            if (notify) await State.loadFeedViewPostsDependencies(data.items);
            return data;
        } catch (e) {
            return error("Couldn't load list feed " + listUri, e);
        }
    }

    static async muteActor(did: string): Promise<Error | undefined> {
        if (!State.bskyClient) return;

        try {
            const response = await State.bskyClient?.app.bsky.graph.muteActor({ actor: did });
            if (!response?.success) throw Error();

            let profile: ProfileView | undefined;
            for (let i = 0; i < 3; i++) {
                const response = await State.bskyClient.getProfile({ actor: did });
                if (response.success) {
                    profile = response.data;
                }
            }
            if (profile) State.notify("profile", "updated_profile_moderation", profile);
        } catch (e) {
            return error("Couldn't mute actor");
        }
    }

    static async unmuteActor(did: string): Promise<Error | undefined> {
        if (!State.bskyClient) return;

        try {
            const response = await State.bskyClient?.app.bsky.graph.unmuteActor({ actor: did });
            if (!response?.success) throw Error();

            let profile: ProfileView | undefined;
            for (let i = 0; i < 3; i++) {
                const response = await State.bskyClient.getProfile({ actor: did });
                if (response.success) {
                    profile = response.data;
                }
            }
            if (profile) State.notify("profile", "updated_profile_moderation", profile);
        } catch (e) {
            return error("Couldn't unmute actor");
        }
    }

    static async unblockActor(did: string): Promise<Error | undefined> {
        if (!State.bskyClient) return;
        const user = Store.getUser();
        if (!user) return new Error("Not connected");

        try {
            let profileResponse = await State.bskyClient.getProfile({ actor: did });
            if (profileResponse instanceof Error) throw profileResponse;
            let profile = profileResponse.data;
            const rkey = profile!.viewer!.blocking!.split("/").pop()!;
            await State.bskyClient.app.bsky.graph.block.delete({ repo: user.profile.did, rkey });
            for (let i = 0; i < 3; i++) {
                const response = await State.bskyClient.getProfile({ actor: did });
                if (response.success) {
                    profile = response.data;
                }
            }
            if (profile) State.notify("profile", "updated_profile_moderation", profile);
        } catch (e) {
            return error("Couldn't unblock actor");
        }
    }

    static async blockActor(did: string): Promise<Error | undefined> {
        if (!State.bskyClient) return;
        const user = Store.getUser();
        if (!user) return new Error("Not connected");

        try {
            await State.bskyClient.app.bsky.graph.block.create({ repo: user.profile.did }, { subject: did, createdAt: new Date().toISOString() });

            let profile: ProfileView | undefined;
            for (let i = 0; i < 3; i++) {
                const response = await State.bskyClient.getProfile({ actor: did });
                if (response.success) {
                    profile = response.data;
                }
            }
            if (profile) State.notify("profile", "updated_profile_moderation", profile);
        } catch (e) {
            return error("Couldn't mute actor");
        }
    }

    static async detectFacets(richText: RichText): Promise<Error | undefined> {
        if (!State.bskyClient) return new Error("Not connected");
        try {
            await richText.detectFacets(State.bskyClient);
        } catch (e) {
            return error("Couldn't detect facets", e);
        }
    }

    static isConnected() {
        return State.bskyClient != undefined;
    }

    logoutUnsub: () => void = () => {};
    static async login(account?: string, password?: string): Promise<void | Error> {
        if (!account || !password) {
            State.bskyClient = new BskyAgent({ service: "https://api.bsky.app" });
            return;
        }

        let session: AtpSessionData | undefined;
        const persistSession = (evt: AtpSessionEvent, s?: AtpSessionData) => {
            if (evt == "create" || evt == "update") {
                session = s;
            }
        };

        State.bskyClient = new BskyAgent({ service: "https://bsky.social", persistSession });
        try {
            let user = Store.getUser();
            let resumeSuccess = false;
            if (user && user.account == account && user.password == password && user.session) {
                try {
                    const resume = await State.bskyClient.resumeSession(user.session);
                    resumeSuccess = resume.success;
                } catch (e) {
                    // no-op in case resume didn't work.
                }
            }

            if (!resumeSuccess) {
                const response = await State.bskyClient.login({
                    identifier: account,
                    password,
                });
                if (!response.success) {
                    Store.setUser(undefined);
                    State.bskyClient = undefined;
                    throw new Error();
                }
            }
            const preferencesPromise = this.getPreferences();
            const muteAndBlockListsPromise = this.getMuteAndBlockLists();
            const profileResponse = await State.bskyClient.app.bsky.actor.getProfile({ actor: account });
            if (!profileResponse.success) {
                Store.setUser(undefined);
                State.bskyClient = undefined;
                throw new Error();
            }
            const newUser: User = {
                account,
                password,
                session,
                profile: profileResponse.data,
                hashTagThreads: user && user.account == account ? user.hashTagThreads ?? {} : {},
            };
            Store.setUser(newUser);
            State.notify("profile", "updated", newUser.profile);
            const pushPrefs = Store.getPushPreferences();
            if (!pushPrefs) {
                Store.setPushPreferences({
                    enabled: true,
                    likes: true,
                    mentions: true,
                    newFollowers: true,
                    quotes: true,
                    replies: true,
                    reposts: true,
                });
            }
            await Promise.all([await preferencesPromise, await muteAndBlockListsPromise]);
            this.checkUnreadNotifications();
            this.checkPreferences();
            this.checkMuteAndBlockLists();
        } catch (e) {
            Store.setUser(undefined);
            State.bskyClient = undefined;
            State.preferences = undefined;
            return error("Couldn't log-in with your BlueSky credentials.", e);
        }
    }

    static logout() {
        const user = Store.getUser();
        (async () => {
            if (user && user.pushToken) {
                try {
                    const response = await fetchApi(
                        `unregister?token=${encodeURIComponent(user.pushToken)}&did=${encodeURIComponent(user.profile.did)}`
                    );
                    if (!response.ok) {
                        error("Couldn't unregister push token");
                    }
                } catch (e) {
                    error("Couldn't unregister push token", e);
                }
            }
        })();

        Store.setUser(undefined);
        State.bskyClient = undefined;
    }

    static async checkUnreadNotifications() {
        if (!State.bskyClient) return;

        try {
            const response = await State.bskyClient.countUnreadNotifications();
            if (!response.success) throw new Error();
            this.notify("unreadNotifications", "updated", response.data.count);
        } catch (e) {
            error("Couldn't count unread notifications", e);
        }
        setTimeout(() => this.checkUnreadNotifications(), NOTIFICATION_CHECK_INTERVAL);
    }

    static muteAndBlockLists: { muteLists: ListView[]; muteListUris: Set<string>; blockLists: ListView[]; blockListUris: Set<string> } = {
        muteLists: [],
        muteListUris: new Set<string>(),
        blockLists: [],
        blockListUris: new Set<string>(),
    };
    static async getMuteAndBlockLists() {
        if (!State.bskyClient) return new Error("Not connected");
        const user = Store.getUser();
        if (!user) return new Error("Not logged in");
        try {
            let cursor: string | undefined;
            const fetchLists = async (
                fetcher: (cursor?: string) => Promise<AppBskyGraphGetListMutes.Response | AppBskyGraphGetListBlocks.Response>
            ) => {
                if (!State.bskyClient) return new Error("Not connected");
                const lists: ListView[] = [];
                try {
                    while (true) {
                        const response = await fetcher(cursor);
                        if (!response.success) throw new Error();
                        lists.push(...response.data.lists);
                        if (!cursor) break;
                        if (response.data.lists.length == 0) break;
                        cursor = response.data.cursor;
                    }
                    return lists;
                } catch (e) {
                    return error("Couldn't fetch mute or block lists", e);
                }
            };
            const promises = [
                fetchLists((cursor?: string) => {
                    return State.bskyClient!.app.bsky.graph.getListMutes({ cursor });
                }),
                fetchLists((cursor?: string) => {
                    return State.bskyClient!.app.bsky.graph.getListBlocks({ cursor });
                }),
            ];
            const results = await Promise.all(promises);
            if (results[0] instanceof Error) throw results[0];
            if (results[1] instanceof Error) throw results[1];
            State.muteAndBlockLists = {
                muteLists: results[0],
                muteListUris: new Set<string>(results[0].map((list) => list.uri)),
                blockLists: results[1],
                blockListUris: new Set<string>(results[1].map((list) => list.uri)),
            };
            this.notifyBatch("list", "updated", State.muteAndBlockLists.muteLists);
            this.notifyBatch("list", "updated", State.muteAndBlockLists.blockLists);
            return State.muteAndBlockLists;
        } catch (e) {
            return error("Couldn't fetch mute and block lists", e);
        }
    }

    static checkMuteAndBlockLists() {
        if (!State.bskyClient) return;

        try {
            const response = this.getMuteAndBlockLists();
            if (response instanceof Error) throw response;
        } catch (e) {
            error("Couldn't poll preferences", e);
        }
        setTimeout(() => this.checkMuteAndBlockLists(), MUTE_AND_BLOCK_LIST_CHECK_INTERVAL);
    }

    static async subscribeBlockList(list: ListView) {
        if (!State.bskyClient) return;
        if (!Store.getUser()) return;

        try {
            await State.bskyClient.blockModList(list.uri);
            if (!this.muteAndBlockLists.blockListUris.has(list.uri)) {
                this.muteAndBlockLists.blockListUris.add(list.uri);
                this.muteAndBlockLists.blockLists.push(list);
            }
        } catch (e) {
            error("Couldn't subscribe to block list " + list.uri, e);
        }
    }

    static async unsubscribeBlockList(list: ListView) {
        if (!State.bskyClient) return;
        if (!Store.getUser()) return;

        try {
            await State.bskyClient.unblockModList(list.uri);
            State.muteAndBlockLists.blockListUris.delete(list.uri);
            State.muteAndBlockLists.blockLists = State.muteAndBlockLists.blockLists.filter((other) => other.uri != list.uri);
        } catch (e) {
            error("Couldn't subscribe to block list " + list.uri, e);
        }
    }

    static async subscribeMuteList(list: ListView) {
        if (!State.bskyClient) return;
        if (!Store.getUser()) return;

        try {
            await State.bskyClient.muteModList(list.uri);
            if (!this.muteAndBlockLists.muteListUris.has(list.uri)) {
                this.muteAndBlockLists.muteListUris.add(list.uri);
                this.muteAndBlockLists.muteLists.push(list);
            }
        } catch (e) {
            error("Couldn't subscribe to mute list " + list.uri, e);
        }
    }

    static async unsubscribeMuteList(list: ListView) {
        if (!State.bskyClient) return;
        if (!Store.getUser()) return;

        try {
            await State.bskyClient.unmuteModList(list.uri);
            State.muteAndBlockLists.muteListUris.delete(list.uri);
            State.muteAndBlockLists.muteLists = State.muteAndBlockLists.muteLists.filter((other) => other.uri != list.uri);
            // FIXME notify?
        } catch (e) {
            error("Couldn't subscribe to block list " + list.uri, e);
        }
    }

    static preferences?: BskyPreferences;
    static preferencesMutationQueue = new AsyncQueue(() =>
        (async () => {
            await this.getPreferences();
            return;
        })()
    );

    static async getPreferences() {
        if (!State.bskyClient) return new Error("Not connected");
        try {
            State.preferences = await State.bskyClient.getPreferences();
            const responses = await Promise.all([
                this.getFeeds([...(State.preferences.feeds.saved?.filter((feed) => feed.includes("app.bsky.feed.generator")) ?? [])]),
            ]);
            for (const response of responses) {
                if (response instanceof Error) throw response;
            }
            this.notify("preferences", "updated", State.preferences);
            return State.preferences;
        } catch (e) {
            return error("Couldn't fetch preferences", e);
        }
    }

    static async checkPreferences() {
        if (!State.bskyClient) return;

        try {
            const response = this.getPreferences();
            if (response instanceof Error) throw response;
        } catch (e) {
            error("Couldn't poll preferences", e);
        }
        setTimeout(() => this.checkPreferences(), PREFERENCES_CHECK_INTERVAL);
    }

    private static async updatePreferences(agent: BskyAgent, cb: (prefs: AppBskyActorDefs.Preferences) => AppBskyActorDefs.Preferences | false) {
        const res = await agent.app.bsky.actor.getPreferences({});
        const newPrefs = cb(res.data.preferences);
        if (newPrefs === false) {
            return;
        }
        await agent.app.bsky.actor.putPreferences({
            preferences: newPrefs,
        });
    }

    private static async updateFeedPreferences(
        agent: BskyAgent,
        cb: (saved: string[], pinned: string[]) => { saved: string[]; pinned: string[] }
    ): Promise<void> {
        await State.updatePreferences(agent, (prefs: AppBskyActorDefs.Preferences) => {
            let feedsPref = prefs.findLast(
                (pref) => AppBskyActorDefs.isSavedFeedsPref(pref) && AppBskyActorDefs.validateSavedFeedsPref(pref).success
            ) as AppBskyActorDefs.SavedFeedsPref | undefined;
            if (feedsPref) {
                const res = cb(feedsPref.saved, feedsPref.pinned);
                feedsPref.saved = res.saved;
                feedsPref.pinned = res.pinned;
            } else {
                const res = cb([], []);
                feedsPref = {
                    $type: "app.bsky.actor.defs#savedFeedsPref",
                    saved: res.saved,
                    pinned: res.pinned,
                };
            }
            return prefs.filter((pref) => !AppBskyActorDefs.isSavedFeedsPref(pref)).concat([feedsPref]);
        });
    }

    static async setPinnedAndSavedFeeds(pinned: string[], saved: string[]) {
        if (!State.bskyClient) return;
        try {
            await State.updateFeedPreferences(State.bskyClient, () => {
                return { saved, pinned };
            });
            await State.getPreferences();
        } catch (e) {
            return error("Couldn't save pinned and saved feeds");
        }
    }

    static async addSavedFeed(v: string) {
        if (!State.bskyClient) return;
        if (!State.preferences) return;
        try {
            const feeds = State.preferences.feeds;
            if (!feeds.saved) feeds.saved = [];
            feeds.saved = [...feeds.saved?.filter((o) => o != v), v];
            State.notify("preferences", "updated", State.preferences); // FIXME notifying before this is stored is kinda not good, but necessary for feedpicker to work
            State.preferencesMutationQueue.enqueue(async () => {
                await State.bskyClient!.addSavedFeed(v);
            });
        } catch (e) {
            return error("Couldn't add saved feed", e);
        }
    }

    static async removeSavedFeed(v: string) {
        if (!State.bskyClient) return;
        if (!State.preferences) return;
        try {
            const feeds = State.preferences.feeds;
            if (!feeds.saved) feeds.saved = [];
            if (!feeds.pinned) feeds.pinned = [];
            feeds.saved = feeds.saved?.filter((o) => o != v);
            feeds.pinned = feeds.pinned?.filter((o) => o != v);
            State.notify("preferences", "updated", State.preferences); // FIXME notifying before this is stored is kinda not good, but necessary for feedpicker to work
            State.preferencesMutationQueue.enqueue(async () => {
                await State.bskyClient!.removeSavedFeed(v);
            });
        } catch (e) {
            return error("Couldn't remove saved feed", e);
        }
    }

    static async addPinnedFeed(v: string) {
        if (!State.bskyClient) return;
        if (!State.preferences) return;
        try {
            const feeds = State.preferences.feeds;
            if (!feeds.pinned) feeds.pinned = [];
            feeds.pinned = [...feeds.pinned.filter((o) => o != v), v];
            State.preferencesMutationQueue.enqueue(async () => {
                await State.updateFeedPreferences(State.bskyClient!, (saved: string[], pinned: string[]) => ({
                    saved,
                    pinned: [...pinned.filter((uri) => uri != v), v],
                }));
            });
        } catch (e) {
            return error("Couldn't add pinned feed", e);
        }
    }

    static async removePinnedFeed(v: string) {
        if (!State.bskyClient) return;
        if (!State.preferences) return;
        try {
            const feeds = State.preferences.feeds;
            if (!feeds.pinned) feeds.pinned = [];
            if (!feeds.saved) feeds.saved = [];
            feeds.pinned = feeds.pinned.filter((o) => o != v);
            feeds.saved = [v, ...feeds.saved.filter((uri) => uri != v)];
            State.preferencesMutationQueue.enqueue(async () => {
                await State.updateFeedPreferences(State.bskyClient!, (saved: string[], pinned: string[]) => ({
                    saved: [v, ...saved.filter((uri) => uri != v)],
                    pinned: pinned.filter((uri) => uri != v),
                }));
            });
        } catch (e) {
            return error("Couldn't add pinned feed", e);
        }
    }

    static async addSavedList(v: string) {
        return State.addSavedFeed(v);
    }

    static async removeSavedList(v: string) {
        return State.removeSavedFeed(v);
    }

    static async addPinnedList(v: string) {
        return State.addPinnedFeed(v);
    }

    static async removePinnedList(v: string) {
        return State.removePinnedFeed(v);
    }
}
