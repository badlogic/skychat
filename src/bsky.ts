import { AppBskyFeedGetPosts, AtpSessionData, AtpSessionEvent, BskyAgent } from "@atproto/api";
import { PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { Store, User } from "./store";
import { apiBaseUrl } from "./utils";

type Notification = { type: "like" | "reply" | "quote" | "repost" | "follow"; fromDid: string; toDid: string; token: string };

type SearchPost = {
    uri: string;
};

export class PostSearch {
    cursor?: string;
    constructor(public readonly query: string, readonly limit = 25) {}

    async next() {
        if (!bskyClient) return Error("Not connected");
        try {
            const response = await fetch(
                `https://palomar.bsky.social/xrpc/app.bsky.unspecced.searchPostsSkeleton?q=${encodeURIComponent(this.query)}&limit=${this.limit}${
                    this.cursor ? `&cursor=${this.cursor}` : ""
                }`
            );
            if (response.status != 200) {
                return Error(`Couldn't load posts for query ${this.query}, cursor ${this.cursor}`);
            }
            const result = (await response.json()) as { cursor: string; totalHitt: number; posts: SearchPost[] };
            const posts: PostView[] = [];
            while (result.posts.length > 0) {
                const uris = result.posts.splice(0, 25).map((post) => post.uri);
                const postsResponse = await bskyClient.app.bsky.feed.getPosts({
                    uris,
                });
                if (!postsResponse.success) {
                    return Error(`Couldn't load posts for query ${this.query}, offset ${this.cursor}`);
                }
                posts.push(...postsResponse.data.posts);
            }
            this.cursor = result.cursor;
            return posts.reverse();
        } catch (e) {
            return Error(`Couldn't load posts for query ${this.query}, offset ${this.cursor}`);
        }
    }
}

export type LinkCard = {
    error: string;
    likely_type: string;
    url: string;
    title: string;
    description: string;
    image: string;
};

export async function extractLinkCard(url: string): Promise<LinkCard | Error> {
    try {
        const resp = await fetch("https://cardyb.bsky.app/v1/extract?url=" + encodeURIComponent(url));
        if (resp.ok) {
            return (await resp.json()) as LinkCard;
        }
        throw Error();
    } catch (e) {
        if (e instanceof Error) return e;
        return new Error("Couldn't get link card info from url " + url);
    }
}

export async function loadPosts(uris: string[], posts: Map<string, PostView>) {
    if (!bskyClient) throw new Error("Not connected");
    const promises: Promise<AppBskyFeedGetPosts.Response>[] = [];
    uris = [...uris];
    while (uris.length > 0) {
        const block = uris.splice(0, 25).filter((uri) => !posts.has(uri));
        if (block.length == 0) continue;
        promises.push(
            bskyClient.app.bsky.feed.getPosts({
                uris: block,
            })
        );
    }
    const responses = await Promise.all(promises);
    for (const response of responses) {
        if (!response.success) {
            return Error(`Couldn't load posts`);
        }
        for (const post of response.data.posts) {
            posts.set(post.uri, post);
        }
    }
    return posts;
}

export let bskyClient: BskyAgent | undefined = undefined;

export async function login(account?: string, password?: string): Promise<void | Error> {
    if (!account || !password) {
        bskyClient = new BskyAgent({ service: "https://api.bsky.app" });
        return;
    }

    let session: AtpSessionData | undefined;
    const persistSession = (evt: AtpSessionEvent, s?: AtpSessionData) => {
        if (evt == "create" || evt == "update") {
            session = s;
        }
    };

    bskyClient = new BskyAgent({ service: "https://bsky.social", persistSession });
    try {
        let user = Store.getUser();
        let resumeSuccess = false;
        if (user && user.account == account && user.password == password && user.session) {
            try {
                const resume = await bskyClient.resumeSession(user.session);
                resumeSuccess = resume.success;
            } catch (e) {
                // no-op in case resume didn't work.
            }
        }

        if (!resumeSuccess) {
            const response = await bskyClient.login({
                identifier: account,
                password,
            });
            if (!response.success) {
                Store.setUser(undefined);
                bskyClient = undefined;
                throw new Error();
            }
        }
        const profileResponse = await bskyClient.app.bsky.actor.getProfile({ actor: account });
        if (!profileResponse.success) {
            Store.setUser(undefined);
            bskyClient = undefined;
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
    } catch (e) {
        Store.setUser(undefined);
        bskyClient = undefined;
        return new Error("Couldn't log-in with your BlueSky credentials.");
    }
}

export function logout() {
    (async () => {
        const user = Store.getUser();
        if (user && user.pushToken) {
            const response = await fetch(
                apiBaseUrl() + `api/unregister?token=${encodeURIComponent(user.pushToken)}&did=${encodeURIComponent(user.profile.did)}`
            );
            if (!response.ok) {
                console.error("Couldn't unregister push token.");
                return;
            }
        }
    })();

    Store.setUser(undefined);
    bskyClient = undefined;
}
