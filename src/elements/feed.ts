import { AppBskyFeedDefs, AppBskyFeedPost, BskyAgent } from "@atproto/api";
import { FeedViewPost, PostView, isFeedViewPost } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { bskyClient, loadPosts } from "../bsky";
import { cacheProfiles, cacheQuotes } from "../cache";
import { reblogIcon } from "../icons";
import { Store } from "../store";
import { apiBaseUrl, dom, splitAtUri } from "../utils";
import { ItemListLoaderResult, ItemsList, ItemsListLoader } from "./list";
import { Overlay, renderTopbar } from "./overlay";
import { Messages, i18n } from "../i18n";
import { getProfileUrl } from "./profiles";

@customElement("skychat-feed")
export class Feed extends ItemsList<string, FeedViewPost | PostView> {
    @property()
    feedLoader: ItemsListLoader<string, FeedViewPost | PostView> = homeTimelineLoader;

    static isFeedViewPost(post: unknown): post is FeedViewPost {
        return (post as any).post != undefined;
    }

    async loadItems(cursor?: string | undefined, limit?: number): Promise<ItemListLoaderResult<string, FeedViewPost | PostView>> {
        if (!bskyClient) return new Error(i18n("Not connected"));
        const loadTime = new Date().getTime();
        const result = await this.feedLoader(cursor, limit);
        if (result instanceof Error) return result;

        const dids: string[] = [];
        const postUris: string[] = [];
        for (const post of result.items) {
            post.__loadTime = loadTime;
            if (Feed.isFeedViewPost(post)) {
                if (post.reply && AppBskyFeedDefs.isPostView(post.reply.parent)) {
                    if (AppBskyFeedPost.isRecord(post.reply.parent.record) && post.reply.parent.record.reply?.parent) {
                        dids.push(splitAtUri(post.reply.parent.record.reply?.parent.uri).repo);
                    }
                    postUris.push(post.reply.parent.uri);
                }
                postUris.push(post.post.uri);
            } else {
                postUris.push(post.uri);
            }
        }
        await Promise.all([cacheProfiles(bskyClient, dids), cacheQuotes(postUris)]);
        return result;
    }

    getItemKey(post: FeedViewPost | PostView): string {
        if (Feed.isFeedViewPost(post)) {
            return post.post.uri + (AppBskyFeedDefs.isReasonRepost(post.reason) ? post.reason.by.did : "");
        } else {
            return post.uri;
        }
    }

    async pollNewItems() {
        const fortyEightHours = 48 * 60 * 60 * 1000;

        const getRecord = (post: FeedViewPost | PostView) => {
            if (Feed.isFeedViewPost(post)) {
                if (AppBskyFeedPost.isRecord(post.post.record)) return post.post.record;
                throw new Error("Couldn't load record from post");
            } else {
                if (AppBskyFeedPost.isRecord(post.record)) return post.record;
                throw new Error("Couldn't load record from post");
            }
        };

        const getDate = (post: FeedViewPost | PostView) => {
            let rec = getRecord(post);
            if (AppBskyFeedDefs.isReasonRepost(post.reason)) return new Date(post.reason.indexedAt);
            return new Date(rec.createdAt);
        };

        const getCid = (post: FeedViewPost | PostView) => {
            if (Feed.isFeedViewPost(post)) {
                return post.post.cid;
            } else {
                return post.cid;
            }
        };

        const loadNewerPosts = async (
            startCid: string,
            startTimestamp: number,
            seenPostKeys: Map<string, FeedViewPost | PostView>,
            minNumPosts = 10,
            maxTimeDifference = fortyEightHours
        ): Promise<{ posts: (FeedViewPost | PostView)[]; numRequests: number; exceededMaxTimeDifference: boolean } | Error> => {
            let timeIncrement = 15 * 60 * 1000;
            let time = startTimestamp + timeIncrement;
            let cid = startCid;
            let newerPosts: (FeedViewPost | PostView)[] = [];
            let lastCursor: string | undefined;
            let foundSeenPost = false;
            let numRequests = 0;
            let seenNewPosts = new Map<string, FeedViewPost | PostView>();
            let exceededMaxTimeDifference = false;

            // Fetch the latest posts and see if its our latest post.
            const response = await this.loadItems(undefined);
            numRequests++;
            if (response instanceof Error) return response;
            if (getCid(response.items[0]) == startCid) return { posts: [], numRequests, exceededMaxTimeDifference: false };

            // Adjust maxTimeDifference down if possible, results in fewer fetches.
            maxTimeDifference = Math.min(maxTimeDifference, getDate(response.items[0])!.getTime() - startTimestamp);
            if (maxTimeDifference < 0) maxTimeDifference = fortyEightHours;

            // FIrst pass, try to collect minNumPosts new posts. This may overshoot, so there's
            // a gap between the startPost and the last post in newPosts. We'll resolve the missing
            // posts in the next loop below.
            while (true) {
                const response = await this.loadItems(time + "::" + cid);
                if (response instanceof Error) return response;
                lastCursor = response.cursor;
                const fetchedPosts = response.items;
                let uniquePosts = fetchedPosts.filter(
                    (post) => !seenPostKeys.has(this.getItemKey(post)) && (getDate(post)?.getTime() ?? 0) > startTimestamp
                );
                uniquePosts = uniquePosts.filter((post) => !seenNewPosts.has(this.getItemKey(post)));
                uniquePosts.forEach((post) => seenNewPosts.set(this.getItemKey(post), post));
                foundSeenPost = fetchedPosts.some((post) => seenPostKeys.has(this.getItemKey(post)));
                numRequests++;
                // If we haven't found any new posts, we need to look further into the future
                // but not too far.
                if (uniquePosts.length == 0) {
                    foundSeenPost = false;
                    timeIncrement *= 1.75; // Make us jump a little further than last time
                    time += timeIncrement;
                    // If we searched to far into the future, give up
                    if (time - startTimestamp > maxTimeDifference) {
                        exceededMaxTimeDifference = seenNewPosts.size > 0;
                        break;
                    }
                    continue;
                }

                // If we found minNumPosts, we don't need to load any more posts
                // We might end up having to load older posts though, until we
                // find a seen post.
                newerPosts = [...uniquePosts, ...newerPosts];
                if (newerPosts.length >= minNumPosts) break;
            }

            // There's a gap between the new posts and the start post. Resolve
            // the posts in-between.
            if (!foundSeenPost && newerPosts.length > 0) {
                while (!foundSeenPost) {
                    const response = await this.loadItems(lastCursor);
                    if (response instanceof Error) return response;
                    lastCursor = response.cursor;
                    const fetchedPosts = response.items;
                    const uniquePosts = fetchedPosts.filter(
                        (post) => !seenPostKeys.has(this.getItemKey(post)) && (getDate(post)?.getTime() ?? 0) > startTimestamp
                    );
                    newerPosts = [...newerPosts, ...uniquePosts];
                    foundSeenPost = fetchedPosts.some((post) => seenPostKeys.has(this.getItemKey(post)));
                    numRequests++;
                }
            }

            return { posts: newerPosts, numRequests, exceededMaxTimeDifference };
        };

        if (this.polling) return;
        this.polling = true;
        try {
            if (!bskyClient) return;
            if (!this.initialItemsLoaded) return;
            if (this.items.length == 0) {
                this.polling = false;
                super.pollNewItems();
                return;
            }
            const lastPost = this.items[0];
            const result = await loadNewerPosts(getCid(lastPost), getDate(lastPost).getTime(), this.seenItems);
            if (result instanceof Error) throw result;
            this.insertNewItems(result.posts.reverse());
        } catch (e) {
            this.error = i18n("Could not load newer items");
            console.error(e);
        } finally {
            this.polling = false;
        }
    }

    sentPost(post: PostView) {
        document.body.append(dom(html`<thread-overlay .postUri=${post.uri}></post-editor-overly>`)[0]);
    }

    quote(post: PostView) {
        document.body.append(
            dom(html`<post-editor-overlay .quote=${post} .sent=${(post: PostView) => this.sentPost(post)}></post-editor-overly>`)[0]
        );
    }

    reply(post: PostView) {
        document.body.append(
            dom(html`<post-editor-overlay .replyTo=${post} .sent=${(post: PostView) => this.sentPost(post)}></post-editor-overly>`)[0]
        );
    }

    async deletePost(post: PostView, postDom: HTMLElement) {
        if (!bskyClient) return;
        try {
            await bskyClient.deletePost(post.uri);
        } catch (e) {
            console.error("Couldn't delete post", e);
            alert("Couldn't delete post");
        }
        postDom.parentElement!.remove();
    }

    renderItem(post: FeedViewPost | PostView) {
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
        if (Feed.isFeedViewPost(post)) {
            if (!post.reply) {
                const postDom = dom(html`<div>
                    ${repostedBy}
                    <post-view
                        .post=${post.post}
                        .quoteCallback=${(post: PostView) => this.quote(post)}
                        .replyCallback=${(post: PostView) => this.reply(post)}
                        .deleteCallback=${(post: PostView) => this.deletePost(post, postDom)}
                    ></post-view>
                </div>`)[0];
                return html`${postDom}`;
            } else {
                const parentDom = dom(html`<post-view
                    .post=${post.reply.parent}
                    .quoteCallback=${(post: PostView) => this.quote(post)}
                    .replyCallback=${(post: PostView) => this.reply(post)}
                    .deleteCallback=${(post: PostView) => this.deletePost(post, parentDom)}
                ></post-view>`)[0];
                const postDom = dom(html`<div class="ml-2 pl-2 mt-2 border-l border-l-primary">
                    <post-view
                        .post=${post.post}
                        .quoteCallback=${(post: PostView) => this.quote(post)}
                        .replyCallback=${(post: PostView) => this.reply(post)}
                        .deleteCallback=${(post: PostView) => this.deletePost(post, postDom)}
                        .showReplyTo=${false}
                    ></post-view>
                </div>`)[0];
                return html`<div class="flex flex-col">${repostedBy}${parentDom}${postDom}</div>`;
            }
        } else {
            const postDom = dom(html`<div>
                <post-view
                    .post=${post}
                    .quoteCallback=${(post: PostView) => this.quote(post)}
                    .replyCallback=${(post: PostView) => this.reply(post)}
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
    title: keyof Messages = "Home";

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

export const homeTimelineLoader = async (cursor?: string, limit?: number) => {
    if (!bskyClient) return new Error("Couldn't load home timeline");
    const result = await bskyClient.app.bsky.feed.getTimeline({ cursor, limit });
    if (!result.success) return new Error("Couldn't load home timeline");
    return { cursor: result.data.cursor, items: result.data.feed };
};

export const quotesLoader = (postUri: string): ItemsListLoader<string, FeedViewPost | PostView> => {
    // FIXME introduce cursor
    return async (cursor?: string, limit?: number) => {
        if (cursor == "end") return { cursor: "end", items: [] };
        if (!bskyClient) return new Error("Couldn't load quotes");
        try {
            const result = await fetch(apiBaseUrl() + `api/quotes?uri=${encodeURIComponent(postUri)}`);
            if (!result.ok) throw new Error("Couldn't load quotes");
            const quotes = (await result.json()) as string[];
            const posts = new Map<string, PostView>();
            await loadPosts(quotes, posts);
            const loadedPosts = quotes.map((quote) => posts.get(quote)!).filter((post) => post != undefined);
            return { cursor: "end", items: loadedPosts };
        } catch (e) {
            console.error("Couldn't fetch quotes", e);
            return new Error("Couldn't load quotes");
        }
    };
};

export type ActorTimelineFilter = "posts_with_replies" | "posts_no_replies" | "posts_with_media" | "likes";
export const actorTimelineLoader = (did: string, filter: ActorTimelineFilter): ItemsListLoader<string, FeedViewPost | PostView> => {
    return async (cursor?: string, limit?: number) => {
        if (!bskyClient) return new Error("Couldn't load feed");
        if (filter == "likes") {
            if (did == Store.getUser()?.profile.did) {
                const result = await bskyClient.app.bsky.feed.getActorLikes({ cursor, limit, actor: did });
                if (!result.success) return new Error("Couldn't load likes");
                return { cursor: result.data.cursor, items: result.data.feed };
            } else {
                let repoResult: Response;
                if (did.includes("did:plc")) {
                    repoResult = await fetch("https://plc.directory/" + did);
                } else {
                    try {
                        repoResult = await fetch(apiBaseUrl() + `api/resolve-did-web?did=${encodeURIComponent(did)}`);
                    } catch (e) {
                        console.log("Couldn't resolve did:web", e);
                        return new Error("Couldn't resolve did:web");
                    }
                }
                if (!repoResult.ok) {
                    return new Error("Couldn't load likes");
                }
                const didDoc: any = await repoResult.json();
                let pdsUrl: string | undefined;
                if (!didDoc.service) return new Error("Couldn't load likes");
                for (const service of didDoc.service) {
                    if (service.type == "AtprotoPersonalDataServer") {
                        pdsUrl = service.serviceEndpoint;
                    }
                }
                if (!pdsUrl) return new Error("Couldn't load likes");
                const client = new BskyAgent({ service: pdsUrl });
                const result = await client.com.atproto.repo.listRecords({ cursor, limit, repo: did, collection: "app.bsky.feed.like" });
                if (!result.success) return new Error("Couldn't load likes");
                const postUris: string[] = [];
                for (const record of result.data.records) {
                    postUris.push((record.value as any).subject.uri);
                }
                if (postUris.length == 0) return { items: [] };
                const postsMap = new Map<string, PostView>();
                const postsResult = await loadPosts(postUris, postsMap);
                const loadedPosts = postUris.map((uri) => postsMap.get(uri)).filter((post) => post != undefined) as PostView[];
                if (postsResult instanceof Error) return new Error("Couldn't load likes");
                return { cursor: result.data.cursor, items: loadedPosts };
            }
        } else {
            const result = await bskyClient.app.bsky.feed.getAuthorFeed({ cursor, limit, actor: did, filter });
            if (!result.success) return new Error("Couldn't load feed");
            return { cursor: result.data.cursor, items: result.data.feed };
        }
    };
};
