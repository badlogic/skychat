// @ts-ignore
import { Agent } from "@intrnl/bluesky-client/agent";
import { RichText } from "@atproto/api";
import { isWithinLastNumDays } from "./utils";

const agent = new Agent({ serviceUri: "https://api.bsky.app" });

export type Post = {
    rkey: string;
    authorDid: string;
    text: string;
    createdAt: string | number;
};

export type BskyAuthor = {
    did: string;
    avatar?: string;
    displayName: string;
    handle?: string;
    followersCount: number;
    followsCount: number;
};

export type BskyFacet = {
    features: { uri?: string; tag?: string }[];
    index: { byteStart: number; byteEnd: number };
};

export type BskyRecord = {
    createdAt: string | number;
    text: string;
    facets?: BskyFacet[];
    reply?: {
        parent?: {
            uri?: string;
        };
    };
};

export type BskyImage = {
    thumb: string;
    fullsize: string;
    alt: string;
    aspectRatio?: {
        width: number;
        height: number;
    };
};

export type BskyViewRecord = {
    $type: "app.bsky.embed.record#viewRecord";
    uri: string;
    cid: string;
    author: BskyAuthor;
    value?: BskyRecord;
    embeds: {
        media?: { images: BskyImage[] };
        images?: BskyImage[];
        external?: BskyExternalCard;
        record?: BskyViewRecord | BskyViewRecordWithMedia;
    }[];
};

export type BskyViewRecordWithMedia = {
    $type: "app.bsky.embed.record_with_media#viewRecord";
    record: BskyViewRecord;
};

export type BskyExternalCard = {
    uri: string;
    title: string;
    description: string;
    thumb?: string;
};

export type BskyPost = {
    uri: string;
    cid: string;
    author: BskyAuthor;
    record: BskyRecord;
    embed?: {
        media?: { images: BskyImage[] };
        images?: BskyImage[];
        external?: BskyExternalCard;
        record?: BskyViewRecord | BskyViewRecordWithMedia;
    };
    likeCount: number;
    replyCount: number;
    repostCount: number;
};

export type BskyThreadPost = {
    parent?: BskyThreadPost;
    post: BskyPost;
    replies: BskyThreadPost[];
};

export type ViewType = "tree" | "embed" | "unroll";

export async function getAccount(handle: string): Promise<BskyAuthor | Error> {
    try {
        const response = await agent.rpc.get("app.bsky.actor.getProfile", {
            params: {
                actor: handle,
            },
        });
        if (!response.success) {
            return new Error("Couldn't resolve account " + handle);
        }
        return response.data as BskyAuthor;
    } catch (e) {
        return new Error("Couldn't resolve account " + handle);
    }
}

export async function getPost(authorDid: string, rkey: string): Promise<{ uri: string; cid: string } | Error> {
    try {
        const response = await agent.rpc.get("com.atproto.repo.getRecord", {
            params: {
                repo: authorDid,
                collection: "app.bsky.feed.post",
                rkey,
            },
        });
        if (!response.success) {
            return new Error("Couldn't get post");
        }
        return response.data as any;
    } catch (e) {
        return new Error("Couldn't get post");
    }
}

export async function getPosts(author: BskyAuthor, numDays: number = 30): Promise<BskyPost[] | Error> {
    const posts: BskyPost[] = [];
    try {
        let cursor: string | undefined = undefined;

        while (true) {
            const response: any = await agent.rpc.get(
                "app.bsky.feed.getAuthorFeed",
                cursor
                    ? {
                          params: {
                              actor: author.did,
                              cursor,
                          },
                      }
                    : {
                          params: {
                              actor: author.did,
                          },
                      }
            );
            if (!response.success) {
                return new Error("Couldn't get posts of account " + author.handle);
            }
            cursor = response.data.cursor;
            if (!cursor) break;
            let done = false;
            for (const post of response.data.feed) {
                if (post.post.author.did != author.did) continue;
                if (post.reason) continue;
                if (isWithinLastNumDays(post.post.record.createdAt, numDays)) {
                    posts.push(post.post);
                } else {
                    done = true;
                }
            }
            if (done) break;
        }
        return posts;
    } catch (e) {
        return new Error("Couldn't get posts of account " + author.handle);
    }
}

export async function getFollowers(handle: string): Promise<BskyAuthor | Error> {
    try {
        const response = await agent.rpc.get("app.bsky.graph.getFollowers", {
            params: {
                actor: handle,
            },
        });
        if (!response.success) {
            return new Error("Couldn't get followers of account " + handle);
        }
        return response.data as BskyAuthor;
    } catch (e) {
        return new Error("Couldn't get followers of account " + handle);
    }
}

function replaceHandles(text: string): string {
    const handleRegex = /@([\p{L}_.-]+)/gu;
    const replacedText = text.replace(handleRegex, (match, handle) => {
        return `<a class="text-primary" href="https://bsky.app/profile/${handle}" target="_blank">@${handle}</a>`;
    });

    return replacedText;
}

function applyFacets(record: BskyRecord) {
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

export function processText(record: BskyRecord) {
    return replaceHandles(applyFacets(record)).trim().replaceAll("\n", "<br/>");
}

export class AuthorCache {
    private readonly cache = new Map<string, Promise<BskyAuthor | Error>>();

    async get(did: string) {
        if (this.cache.has(did)) return this.cache.get(did)!;
        this.cache.set(did, getAccount(did));
        return this.cache.get(did)!;
    }

    async getAll(posts: Post[]) {
        const promises: Promise<BskyAuthor | Error>[] = [];
        for (const post of posts) {
            promises.push(this.get(post.authorDid));
        }
        return await Promise.all(promises);
    }
}

export class PostSearch {
    offset = 0;
    constructor(public readonly query: string) {}

    async next() {
        try {
            const response = await fetch(`https://search.bsky.social/search/posts?q=${encodeURIComponent(this.query)}&offset=${this.offset}`);
            if (response.status != 200) {
                return Error(`Couldn't load posts for query ${this.query}, offset ${this.offset}`);
            }
            const rawPosts = await response.json();
            const posts: Post[] = [];
            for (const rawPost of rawPosts) {
                posts.push({
                    authorDid: rawPost.user.did,
                    rkey: rawPost.tid.split("/")[1],
                    createdAt: rawPost.post.createdAt / 1000000,
                    text: rawPost.post.text as string,
                    cid: rawPost.cid,
                } as Post);
            }
            this.offset += rawPosts.length;
            return posts.sort((a, b) => (b.createdAt as number) - (a.createdAt as number)).reverse();
        } catch (e) {
            return Error(`Couldn't load posts for query ${this.query}, offset ${this.offset}`);
        }
    }
}
