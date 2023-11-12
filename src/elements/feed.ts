import { AppBskyFeedDefs, AppBskyFeedPost, BskyAgent } from "@atproto/api";
import { FeedViewPost, PostView, isFeedViewPost } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { bskyClient, loadPosts } from "../bsky";
import { reblogIcon } from "../icons";
import { cacheProfiles, cacheQuotes } from "../cache";
import { Store } from "../store";
import { apiBaseUrl, dom, getProfileUrl, splitAtUri } from "../utils";
import { ItemListLoaderResult, ItemsList, ItemsListLoader } from "./list";
import { Overlay, renderTopbar } from "./overlay";

@customElement("skychat-feed")
export class Feed extends ItemsList<string, FeedViewPost | PostView> {
    @property()
    feedLoader: ItemsListLoader<string, FeedViewPost | PostView> = homeTimelineLoader;

    static isFeedViewPost(post: unknown): post is FeedViewPost {
        return (post as any).post != undefined;
    }

    async loadItems(cursor?: string | undefined): Promise<ItemListLoaderResult<string, FeedViewPost | PostView>> {
        if (!bskyClient) return new Error("Not connected");
        const result = await this.feedLoader(cursor);
        if (result instanceof Error) return result;

        const dids: string[] = [];
        const postUris: string[] = [];
        for (const post of result.items) {
            if (Feed.isFeedViewPost(post)) {
                if (post.reply && AppBskyFeedPost.isRecord(post.reply.parent.record) && post.reply.parent.record.reply) {
                    const did = splitAtUri(post.reply.parent.record.reply.parent.uri).repo;
                    dids.push(did);
                }
                postUris.push(post.post.uri);
            } else {
                postUris.push(post.uri);
            }
        }
        await Promise.all([cacheProfiles(bskyClient, dids), await cacheQuotes(bskyClient, postUris)]);
        return result;
    }

    getItemKey(post: FeedViewPost | PostView): string {
        if (Feed.isFeedViewPost(post)) {
            let replyKey = "";
            if (post.reply) {
                if (
                    AppBskyFeedDefs.isPostView(post.reply.parent) ||
                    AppBskyFeedDefs.isNotFoundPost(post.reply.parent) ||
                    AppBskyFeedDefs.isBlockedPost(post.reply.parent)
                )
                    replyKey += post.reply.parent.uri;
                if (
                    AppBskyFeedDefs.isPostView(post.reply.root) ||
                    AppBskyFeedDefs.isNotFoundPost(post.reply.root) ||
                    AppBskyFeedDefs.isBlockedPost(post.reply.root)
                )
                    replyKey += post.reply.root.uri;
            }
            return post.post.uri + (AppBskyFeedDefs.isReasonRepost(post.reason) ? post.reason.by.did : "") + replyKey;
        } else {
            return post.uri;
        }
    }

    quote(post: PostView) {
        document.body.append(dom(html`<post-editor-overlay .quote=${post}></post-editor-overly>`)[0]);
    }

    reply(post: PostView) {
        document.body.append(dom(html`<post-editor-overlay .replyTo=${post}></post-editor-overly>`)[0]);
    }

    async deletePost(post: PostView, postDom: HTMLElement) {
        if (!bskyClient) return;
        try {
            await bskyClient.deletePost(post.uri);
        } catch (e) {
            console.error("Couldn't delete post.", e);
            alert("Couldn't delete post.");
        }
        postDom.parentElement!.remove();
    }

    renderItem(post: FeedViewPost | PostView) {
        if (Feed.isFeedViewPost(post)) {
            if (!post.reply) {
                const repostedBy = AppBskyFeedDefs.isReasonRepost(post.reason)
                    ? html`<div class="mb-1 flex items-center gap-2 text-gray dark:text-lightgray text-xs"><i class="icon w-4 h-4 fill-gray dark:fill-lightgray">${reblogIcon}</i><a class="hover:underline truncate" href="${getProfileUrl(
                          post.reason.by
                      )}" @click=${(ev: Event) => {
                          if (!AppBskyFeedDefs.isReasonRepost(post.reason)) return;
                          ev.preventDefault();
                          ev.stopPropagation();
                          document.body.append(dom(html`<profile-overlay .did=${post.reason.by.did}></profile-overlay>`)[0]);
                      }}>${post.reason.by.displayName ?? post.reason.by.handle}</div>`
                    : nothing;
                const postDom = dom(html`<div>
                    ${repostedBy}
                    <post-view
                        .post=${post.post}
                        .quoteCallback=${this.quote}
                        .replyCallback=${this.reply}
                        .deleteCallback=${(post: PostView) => this.deletePost(post, postDom)}
                    ></post-view>
                </div>`)[0];
                return html`${postDom}`;
            } else {
                const parentDom = dom(html`<post-view
                    .post=${post.reply.parent}
                    .quoteCallback=${this.quote}
                    .replyCallback=${this.reply}
                    .deleteCallback=${(post: PostView) => this.deletePost(post, parentDom)}
                ></post-view>`)[0];
                const postDom = dom(html`<div class="ml-2 pl-2 mt-2 border-l border-l-primary">
                    <post-view
                        .post=${post.post}
                        .quoteCallback=${this.quote}
                        .replyCallback=${this.reply}
                        .deleteCallback=${(post: PostView) => this.deletePost(post, postDom)}
                    ></post-view>
                </div>`)[0];
                return html`<div class="flex flex-col w-full">${parentDom}${postDom}</div>`;
            }
        } else {
            const postDom = dom(html`<div>
                <post-view
                    .post=${post}
                    .quoteCallback=${this.quote}
                    .replyCallback=${this.reply}
                    .deleteCallback=${(post: PostView) => this.deletePost(post, postDom)}
                ></post-view>
            </div>`)[0];
            return html`${postDom}`;
        }
    }
}

@customElement("skychat-feed-overlay")
export class FeedOverlay extends Overlay {
    @property()
    title: string = "Home";

    @property()
    feedLoader: ItemsListLoader<string, FeedViewPost | PostView> = homeTimelineLoader;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected updated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.updated(_changedProperties);
    }

    renderHeader() {
        return html`${renderTopbar(this.title, this.closeButton())}`;
    }

    renderContent(): TemplateResult {
        return html`<skychat-feed .feedLoader=${this.feedLoader} poll="true"></skychat-feed>`;
    }
}

export const homeTimelineLoader = async (cursor?: string) => {
    if (!bskyClient) return new Error("Couldn't load feed");
    const result = await bskyClient.app.bsky.feed.getTimeline({ cursor });
    if (!result.success) return new Error("Couldn't load feed");
    return { cursor: result.data.cursor, items: result.data.feed };
};

export const quotesLoader = (postUri: string): ItemsListLoader<string, FeedViewPost | PostView> => {
    // FIXME introduce cursor
    return async (cursor?: string) => {
        if (cursor == "end") return { cursor: "end", items: [] };
        if (!bskyClient) return new Error("Couldn't load quotes");
        const result = await fetch(apiBaseUrl() + `api/quotes?uri=${encodeURIComponent(postUri)}`);
        if (!result.ok) throw new Error("Couldn't load quotes");
        const quotes = (await result.json()) as string[];
        const posts = new Map<string, PostView>();
        await loadPosts(quotes, posts);
        const loadedPosts = quotes.map((quote) => posts.get(quote)!);
        return { cursor: "end", items: loadedPosts };
    };
};

export type ActorTimelineFilter = "posts_with_replies" | "posts_no_replies" | "posts_with_media" | "likes";
export const actorTimelineLoader = (did: string, filter: ActorTimelineFilter): ItemsListLoader<string, FeedViewPost | PostView> => {
    return async (cursor?: string) => {
        if (!bskyClient) return new Error("Couldn't load feed");
        if (filter == "likes") {
            if (did == Store.getUser()?.profile.did) {
                const result = await bskyClient.app.bsky.feed.getActorLikes({ cursor, actor: did });
                if (!result.success) return new Error("Couldn't load likes");
                return { cursor: result.data.cursor, items: result.data.feed };
            } else {
                const repoResult = await bskyClient.com.atproto.repo.describeRepo({ repo: did });
                if (!repoResult.success) return new Error("Couldn't load likes");
                const didDoc: any = repoResult.data.didDoc;
                let pdsUrl: string | undefined;
                if (!didDoc.service) return new Error("Couldn't load likes");
                for (const service of didDoc.service) {
                    if (service.type == "AtprotoPersonalDataServer") {
                        pdsUrl = service.serviceEndpoint;
                    }
                }
                if (!pdsUrl) return new Error("Couldn't load likes");
                const client = new BskyAgent({ service: pdsUrl });
                const result = await client.com.atproto.repo.listRecords({ cursor, repo: did, collection: "app.bsky.feed.like", limit: 25 });
                if (!result.success) return new Error("Couldn't load likes");
                const postUris: string[] = [];
                for (const record of result.data.records) {
                    postUris.push((record.value as any).subject.uri);
                }
                const postsResult = await bskyClient.getPosts({ uris: postUris });
                if (!postsResult.success) return new Error("Couldn't load likes");
                return { cursor: result.data.cursor, items: postsResult.data.posts };
            }
        } else {
            const result = await bskyClient.app.bsky.feed.getAuthorFeed({ cursor, actor: did, filter });
            if (!result.success) return new Error("Couldn't load feed");
            return { cursor: result.data.cursor, items: result.data.feed };
        }
    };
};
