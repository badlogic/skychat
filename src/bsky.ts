import { AppBskyFeedGetPosts, AtpSessionData, AtpSessionEvent, BskyAgent } from "@atproto/api";
import { PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { State } from "./state";

type Notification = { type: "like" | "reply" | "quote" | "repost" | "follow"; fromDid: string; toDid: string; token: string };

type SearchPost = {
    uri: string;
};

export class PostSearch {
    cursor?: string;
    constructor(public readonly query: string, readonly limit = 25) {}

    async next() {
        if (!State.isConnected()) return Error("Not connected");
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
            const postsResponse = await State.getPosts(result.posts.map((post) => post.uri));
            if (postsResponse instanceof Error) {
                return Error(`Couldn't load posts for query ${this.query}, offset ${this.cursor}`);
            }
            this.cursor = result.cursor;
            return postsResponse.reverse();
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
        if (!resp.ok) throw new Error();
        return (await resp.json()) as LinkCard;
    } catch (e) {
        if (e instanceof Error) return e;
        return new Error("Couldn't get link card info from url " + url);
    }
}
