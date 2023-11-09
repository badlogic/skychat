import { AppBskyFeedDefs, AppBskyFeedGetTimeline, AppBskyFeedPost, BskyAgent } from "@atproto/api";
import { FeedViewPost } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { LitElement, PropertyValueMap, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { map } from "lit/directives/map.js";
import { reblogIcon } from "../icons";
import { cacheProfiles } from "../profilecache";
import { contentLoader, dom, getProfileUrl, onVisibleOnce, renderTopbar } from "../utils";
import { CloseableElement, pushHash } from "./closable";
import { bskyClient } from "../bsky";

@customElement("skychat-feed")
export class Feed extends LitElement {
    @state()
    isLoading = true;

    @query("#posts")
    postsDom?: HTMLElement;

    @state()
    newPosts: (numPosts: number) => void = () => {};

    topPost?: AppBskyFeedDefs.FeedViewPost;
    lastPosts?: AppBskyFeedGetTimeline.OutputSchema;
    seenPosts = new Map<String, FeedViewPost>();
    intervalId: any = -1;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        clearImmediate(this.intervalId);
    }

    getPostKey(post: FeedViewPost) {
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
    }

    async load() {
        await this.loadOlderPosts();
        this.topPost = this.lastPosts ? this.lastPosts.feed[0] : undefined;
        this.isLoading = false;

        let checking = false;
        const checkNewPosts = async () => {
            try {
                if (checking) return;
                checking = true;
                if (!bskyClient) return;
                if (!this.topPost) return;

                const posts: FeedViewPost[] = [];
                const topPost = this.topPost;
                let lastResponse: AppBskyFeedGetTimeline.Response | undefined;
                let done = false;
                let iterations = 0;
                while (!done) {
                    iterations++;
                    if (iterations == 2) {
                        console.log("wtf");
                    }
                    const feedResponse = await bskyClient.app.bsky.feed.getTimeline(lastResponse ? { cursor: lastResponse.data.cursor } : undefined);
                    if (!feedResponse.success) break;
                    if (feedResponse.data.feed.length == 0) break;
                    for (const post of feedResponse.data.feed) {
                        const postKey = this.getPostKey(post);
                        if (this.seenPosts.has(postKey)) {
                            done = true;
                            break;
                        } else {
                            posts.push(post);
                        }
                    }
                    lastResponse = feedResponse;
                }
                posts.reverse();

                console.log(posts.length + " new posts");
                if (posts.length == 0 || !this.postsDom) return;
                const insertNode = this.postsDom.children[0];
                if (!insertNode) {
                    posts.reverse();
                    for (const post of posts) {
                        const postDom = dom(html`<div class="animate-fade">${this.renderPost(post)}</div>`)[0];
                        this.postsDom.append(postDom);
                    }
                } else {
                    for (const post of posts) {
                        const postDom = dom(html`<div class="animate-fade">${this.renderPost(post)}</div>`)[0];
                        this.postsDom.insertBefore(postDom, insertNode);
                    }
                }
                this.topPost = posts[0];
                this.newPosts(posts.length);
            } catch (e) {
                console.error(e);
            } finally {
                checking = false;
            }
        };
        checkNewPosts();
        this.intervalId = setInterval(checkNewPosts, 5000);
    }

    loading = false;
    async loadOlderPosts() {
        if (!bskyClient) return;
        if (this.loading) return;
        try {
            this.loading = true;
            const feedResponse = await bskyClient.app.bsky.feed.getTimeline(this.lastPosts ? { cursor: this.lastPosts.cursor } : undefined);
            if (!feedResponse.success) {
                console.error("Couldn't load feed");
                this.lastPosts = undefined;
                return;
            }
            this.lastPosts = feedResponse.data;
            if (!this.lastPosts || this.lastPosts.feed.length == 0 || !bskyClient) return;

            const dids: string[] = [];
            for (const post of this.lastPosts.feed) {
                if (post.reply && AppBskyFeedPost.isRecord(post.reply.parent.record) && post.reply.parent.record.reply) {
                    const did = post.reply.parent.record.reply.parent.uri.replace("at://", "").split("/")[0];
                    dids.push(did);
                }
            }
            await cacheProfiles(bskyClient, dids);
        } finally {
            this.loading = false;
        }
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        this.load();
    }

    render() {
        return html`
            ${this.isLoading
                ? html`<div class="animate-fade flex-grow flex flex-col">
                      <div class="align-top">${contentLoader}</div>
                  </div>`
                : this.renderFeed()}
        `;
    }

    quote(post: AppBskyFeedDefs.PostView) {
        document.body.append(dom(html`<post-editor-overlay .quote=${post}></post-editor-overly>`)[0]);
    }

    reply(post: AppBskyFeedDefs.PostView) {
        document.body.append(dom(html`<post-editor-overlay .replyTo=${post}></post-editor-overly>`)[0]);
    }

    renderPost(post: FeedViewPost) {
        const postKey = this.getPostKey(post);
        if (this.seenPosts.has(postKey)) {
            console.log("Already seen post " + postKey);
        }
        this.seenPosts.set(postKey, post);
        if (!post.reply) {
            const repostedBy = AppBskyFeedDefs.isReasonRepost(post.reason)
                ? html`<div class="px-4 pt-2 mb-[-0.25em] flex items-center gap-2 text-gray dark:text-lightgray text-xs"><i class="icon w-4 h-4 fill-gray dark:fill-lightgray">${reblogIcon}</i><a class="hover:underline truncate" href="${getProfileUrl(
                      post.reason.by
                  )}" @click=${(ev: Event) => {
                      if (!AppBskyFeedDefs.isReasonRepost(post.reason)) return;
                      ev.preventDefault();
                      ev.stopPropagation();
                      document.body.append(dom(html`<profile-overlay .did=${post.reason.by.did}></profile-overlay>`)[0]);
                  }}>${post.reason.by.displayName ?? post.reason.by.handle}</div>`
                : nothing;
            return html`<div class="border-t border-gray/50 px-2">
                ${repostedBy ? repostedBy : nothing}
                <post-view .post=${post.post} .quoteCallback=${this.quote} .replyCallback=${this.reply}></post-view>
            </div>`;
        } else {
            return html`<div class="border-t border-gray/50 px-2 mb-2 flex">
                <div class="flex flex-col w-full">
                    <post-view .post=${post.reply.parent} .quoteCallback=${this.quote} .replyCallback=${this.reply}></post-view>
                    <div class="ml-4 border-l border-l-primary">
                        <post-view .post=${post.post} .quoteCallback=${this.quote} .replyCallback=${this.reply}></post-view>
                    </div>
                </div>
            </div>`;
        }
    }

    renderFeed() {
        if (!this.lastPosts) return html``;

        let postsDom = dom(html`<div id="posts" class="flex flex-col">
            ${map(this.lastPosts.feed, (post) => this.renderPost(post))}
            <div id="loader" class="w-full text-center p-4 animate-pulse">Loading more posts</div>
        </div>`)[0];

        const loader = postsDom.querySelector("#loader") as HTMLElement;
        const loadMore = async () => {
            await this.loadOlderPosts();
            if (!this.lastPosts || this.lastPosts.feed.length == 0) {
                loader.innerText = "No more posts";
                return;
            }
            loader?.remove();
            for (const post of this.lastPosts.feed) {
                postsDom.append(dom(this.renderPost(post))[0]);
            }
            postsDom.append(loader);
            onVisibleOnce(loader, loadMore);
        };
        onVisibleOnce(loader, loadMore);

        return postsDom;
    }
}

@customElement("skychat-feed-overlay")
export class FeedOverlay extends CloseableElement {
    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        return html`<div class="fixed top-0 left-0 w-full h-full z-[1000] bg-white dark:bg-black overflow-auto">
            <div class="mx-auto max-w-[600px] h-full flex flex-col">
                ${renderTopbar(
                    "Home",
                    html`<button
                        @click=${() => this.close()}
                        class="ml-auto bg-primary text-white px-2 rounded disabled:bg-gray/70 disabled:text-white/70"
                    >
                        Close
                    </button>`
                )}
                <div class="pt-[40px]">
                    <skychat-feed></skychat-feed>
                </div>
            </div>
        </div>`;
    }
}
