import { AppBskyFeedDefs, AppBskyFeedPost, BskyAgent, RichText } from "@atproto/api";
import { Link } from "@atproto/api/dist/client/types/app/bsky/richtext/facet";

function replaceHandles(text: string): string {
    const handleRegex = /@([\p{L}_.-]+)/gu;
    const replacedText = text.replace(handleRegex, (match, handle) => {
        return `<a class="text-primary" href="https://bsky.app/profile/${handle}" target="_blank">@${handle}</a>`;
    });

    return replacedText;
}

function applyFacets(record: AppBskyFeedPost.Record) {
    if (!record.facets) {
        return record.text;
    }

    const rt = new RichText({
        text: record.text,
        facets: record.facets as any,
    });

    const text: string[] = [];

    for (const segment of rt.segments()) {
        if (segment.isMention()) {
            text.push(`<a class="text-primary" href="https:///profile/${segment.mention?.did}" target="_blank">${segment.text}</a>`);
        } else if (segment.isLink()) {
            text.push(`<a class="text-primary" href="${segment.link?.uri}" target="_blank">${segment.text}</a>`);
        } else if (segment.isTag()) {
            text.push(`<span class="text-blue-500">${segment.text}</span>`);
        } else {
            text.push(segment.text);
        }
    }
    const result = text.join("");
    return result;
}

export function processText(record: AppBskyFeedPost.Record) {
    return replaceHandles(applyFacets(record)).trim().replaceAll("\n", "<br/>");
}

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

export async function loadPosts(bskyClient: BskyAgent, uris: string[], posts: Map<string, AppBskyFeedDefs.PostView>): Promise<undefined | Error> {
    while (uris.length > 0) {
        const block = uris.splice(0, 25).filter((uri) => !posts.has(uri));
        if (block.length == 0) continue;
        const postsResponse = await bskyClient.app.bsky.feed.getPosts({
            uris: block,
        });
        if (!postsResponse.success) {
            return Error(`Couldn't load posts`);
        }
        for (const post of postsResponse.data.posts) {
            posts.set(post.uri, post);
        }
    }
    return undefined;
}
