import { AppBskyFeedGetPosts, AtpSessionData, AtpSessionEvent, BskyAgent } from "@atproto/api";
import { PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { Store } from "./store";

type Notification = { type: "like" | "reply" | "quote" | "repost" | "follow"; fromDid: string; toDid: string; token: string };

type SearchPost = {
    tid: string;
    cid: string;
    user: {
        did: string;
        handle: string;
    };
    post: {
        createdAt: number;
        text: string;
        user: string;
    };
};

export class PostSearch {
    offset = 0;
    constructor(public readonly query: string) {}

    async next() {
        if (!bskyClient) return Error("Not connected");
        try {
            const response = await fetch(`https://search.bsky.social/search/posts?q=${encodeURIComponent(this.query)}&offset=${this.offset}`);
            if (response.status != 200) {
                return Error(`Couldn't load posts for query ${this.query}, offset ${this.offset}`);
            }
            const rawPosts = (await response.json()) as SearchPost[];
            const posts: PostView[] = [];
            while (rawPosts.length > 0) {
                const uris = rawPosts.splice(0, 25).map((rawPost) => `at://${rawPost.user.did}/${rawPost.tid}`);
                const postsResponse = await bskyClient.app.bsky.feed.getPosts({
                    uris,
                });
                if (!postsResponse.success) {
                    return Error(`Couldn't load posts for query ${this.query}, offset ${this.offset}`);
                }
                posts.push(...postsResponse.data.posts);
            }
            this.offset += posts.length;
            return posts.reverse();
        } catch (e) {
            return Error(`Couldn't load posts for query ${this.query}, offset ${this.offset}`);
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
        Store.setUser({
            account,
            password,
            session,
            profile: profileResponse.data,
            hashTagThreads: user && user.account == account ? user.hashTagThreads ?? {} : {},
        });
    } catch (e) {
        Store.setUser(undefined);
        bskyClient = undefined;
        return new Error("Couldn't log-in with your BlueSky credentials.");
    }
}

export function logout() {
    Store.setUser(undefined);
}
