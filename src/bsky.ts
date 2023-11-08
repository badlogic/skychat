import { AppBskyFeedDefs, AppBskyFeedGetPosts, BskyAgent } from "@atproto/api";

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
    constructor(public readonly bskyClient: BskyAgent, public readonly query: string) {}

    async next() {
        try {
            const response = await fetch(`https://search.bsky.social/search/posts?q=${encodeURIComponent(this.query)}&offset=${this.offset}`);
            if (response.status != 200) {
                return Error(`Couldn't load posts for query ${this.query}, offset ${this.offset}`);
            }
            const rawPosts = (await response.json()) as SearchPost[];
            const posts: AppBskyFeedDefs.PostView[] = [];
            while (rawPosts.length > 0) {
                const uris = rawPosts.splice(0, 25).map((rawPost) => `at://${rawPost.user.did}/${rawPost.tid}`);
                const postsResponse = await this.bskyClient.app.bsky.feed.getPosts({
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

export async function loadPosts(bskyClient: BskyAgent, uris: string[], posts: Map<string, AppBskyFeedDefs.PostView>) {
    const promises: Promise<AppBskyFeedGetPosts.Response>[] = [];
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
