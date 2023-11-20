import {
    AppBskyFeedDefs,
    AppBskyFeedPost,
    AppBskyNotificationListNotifications,
    AtpSessionData,
    AtpSessionEvent,
    BskyAgent,
    RichText,
} from "@atproto/api";
import { ProfileView, ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { Store, User } from "./store";
import { assertNever, error, fetchApi, getDateString, splitAtUri } from "./utils";
import { FeedViewPost, PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { record } from "./bsky";

export interface NumQuote {
    postUri: string;
    numQuotes: number;
}

export interface Events {
    post: PostView;
    profile: ProfileViewDetailed;
    numQuote: NumQuote;
    unreadNotifications: number;
    theme: string;
}

export type EventAction = "updated" | "deleted";

export type ActorFeedType = "home" | "posts_with_replies" | "posts_no_replies" | "posts_with_media";

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
        this.storeObject(event, payload);
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
            case "unreadNotifications":
                if (State.DEBUG) console.log(`${getDateString(new Date())} - notify - ${event} ${action}`);
                return;
            case "theme":
                if (State.DEBUG) console.log(`${getDateString(new Date())} - notify - ${event} ${action}`);
                return;
            default:
                assertNever(event);
        }

        if (State.DEBUG) console.log(`${getDateString(new Date())} - notify - ${event} ${action} ${id}`);

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
            case "unreadNotifications":
                return;
            case "theme":
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

    static async getPosts(uris: string[], cacheProfilesAndQuotes = true): Promise<Error | PostView[]> {
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
            this.notifyBatch("post", "updated", posts);
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

    static async getNotifications(
        cursor?: string,
        limit = 25
    ): Promise<Error | { cursor?: string; items: AppBskyNotificationListNotifications.Notification[] }> {
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
            for (const promise of promises) {
                if (promise instanceof Error) throw promise;
            }
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
        limit = 20
    ): Promise<Error | { cursor?: string; items: FeedViewPost[] }> {
        if (!State.bskyClient) return new Error("Not connected");
        try {
            let data: { cursor?: string; items: FeedViewPost[] } | undefined;

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
            const posts: PostView[] = [];
            const profilesToFetch: string[] = [];
            const postUrisToFetch: string[] = [];
            for (const feedViewPost of data.items) {
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
            for (const promise of promises) {
                if (promise instanceof Error) throw promise;
            }
            this.notifyBatch("post", "updated", posts);
            return data;
        } catch (e) {
            return error("Couldn't load actor feed", e);
        }
    }

    static async getLoggedInActorLikes(cursor?: string, limit = 20): Promise<Error | { cursor?: string; items: FeedViewPost[] }> {
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

    static async getActorLikes(did: string, cursor?: string, limit = 20): Promise<Error | { cursor?: string; items: PostView[] }> {
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
            return { cursor: result.data.cursor, items: postsResult };
        } catch (e) {
            return error("Couldn't load actor likes", e);
        }
    }

    static async getPostLikes(postUri: string, cursor?: string, limit = 20): Promise<Error | { cursor?: string; items: ProfileView[] }> {
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

    static async getPostReposts(postUri: string, cursor?: string, limit = 20): Promise<Error | { cursor?: string; items: ProfileView[] }> {
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

    static async getFollowers(did: string, cursor?: string, limit = 20): Promise<Error | { cursor?: string; items: ProfileView[] }> {
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

    static async getFollowing(did: string, cursor?: string, limit = 20): Promise<Error | { cursor?: string; items: ProfileView[] }> {
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
            this.checkUnreadNotifications();
        } catch (e) {
            Store.setUser(undefined);
            State.bskyClient = undefined;
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
        setTimeout(() => this.checkUnreadNotifications(), 5000);
    }
}
