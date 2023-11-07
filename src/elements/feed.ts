import { AppBskyFeedDefs, AppBskyFeedGetTimeline, AppBskyFeedPost, BskyAgent } from "@atproto/api";
import { FeedViewPost } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { LitElement, PropertyValueMap, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { map } from "lit/directives/map.js";
import { reblogIcon } from "../icons";
import { cacheProfiles, profileCache } from "../profilecache";
import { contentLoader, deepEqual, dom, getProfileUrl, onVisibleOnce } from "../utils";
import { CloseableElement } from "./closable";
import { PostViewElement } from "./postview";

@customElement("skychat-feed")
export class Feed extends LitElement {
    @property()
    bskyClient?: BskyAgent;

    @state()
    isLoading = true;

    @query("#posts")
    postsDom?: HTMLElement;

    @state()
    newPosts: (numPosts: number) => void = () => {};

    topPost?: AppBskyFeedDefs.FeedViewPost;
    lastPosts?: AppBskyFeedGetTimeline.OutputSchema;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    async load() {
        if (!this.bskyClient) return;
        await this.loadOlderPosts();
        this.topPost = this.lastPosts ? this.lastPosts.feed[0] : undefined;
        this.isLoading = false;

        let checking = false;
        const checkNewPosts = async () => {
            try {
                if (checking) return;
                checking = true;
                if (!this.bskyClient) return;
                if (!this.topPost) return;

                const posts: FeedViewPost[] = [];
                const topPost = this.topPost;
                let lastResponse: AppBskyFeedGetTimeline.Response | undefined;
                let done = false;
                while (!done) {
                    const feedResponse = await this.bskyClient.app.bsky.feed.getTimeline(
                        lastResponse ? { cursor: lastResponse.data.cursor } : undefined
                    );
                    if (!feedResponse.success) break;
                    if (feedResponse.data.feed.length == 0) break;
                    for (const post of feedResponse.data.feed) {
                        if (post.post.uri != topPost.post.uri) {
                            posts.push(post);
                            continue;
                        }
                        if ((post.reply && !topPost.reply) || (!post.reply && topPost.reply)) {
                            posts.push(post);
                            continue;
                        }
                        if (
                            post.reply &&
                            topPost.reply &&
                            (post.reply.parent.uri != topPost.reply.parent.uri || post.reply.root.uri != topPost.reply.root.uri)
                        ) {
                            posts.push(post);
                            continue;
                        }
                        if ((post.reason && !topPost.reason) || (!post.reason && topPost.reason)) {
                            posts.push(post);
                            continue;
                        }
                        if (
                            AppBskyFeedDefs.isReasonRepost(post.reason) &&
                            AppBskyFeedDefs.isReasonRepost(topPost.reason) &&
                            post.reason.by.did != topPost.reason.by.did
                        ) {
                            posts.push(post);
                            continue;
                        }
                        done = true;
                        break;
                    }
                    lastResponse = feedResponse;
                }
                console.log(posts.length + " new posts");
                if (posts.length == 0) return;
                if (!this.postsDom) return;
                const insertNode = this.postsDom.children[0];
                if (!insertNode) return;
                const scrollElement = document.querySelector("main");
                if (!scrollElement) return;
                posts.reverse();
                for (const post of posts) {
                    const postDom = dom(html`<div class="animate-fade">${this.renderPost(post)}</div>`)[0];
                    this.postsDom.insertBefore(postDom, insertNode);
                }
                const initialScrollHeight = scrollElement.scrollHeight;
                const adjustScroll = () => {
                    if (!scrollElement) return;
                    if (scrollElement.scrollHeight != initialScrollHeight) {
                        scrollElement.scrollTop = scrollElement.scrollHeight - initialScrollHeight;
                    } else {
                        requestAnimationFrame(adjustScroll);
                    }
                };
                // adjustScroll();
                this.topPost = posts[0];
                this.newPosts(posts.length);
            } catch (e) {
                console.error(e);
            } finally {
                checking = false;
                setTimeout(checkNewPosts, 2000);
            }
        };
        checkNewPosts();
    }

    loading = false;
    async loadOlderPosts() {
        if (!this.bskyClient) return;
        if (this.loading) return;
        try {
            this.loading = true;
            const feedResponse = await this.bskyClient.app.bsky.feed.getTimeline(this.lastPosts ? { cursor: this.lastPosts.cursor } : undefined);
            if (!feedResponse.success) {
                console.error("Couldn't load feed");
                this.lastPosts = undefined;
                return;
            }
            this.lastPosts = feedResponse.data;
            if (!this.lastPosts || this.lastPosts.feed.length == 0 || !this.bskyClient) return;

            const dids: string[] = [];
            for (const post of this.lastPosts.feed) {
                if (post.reply && AppBskyFeedPost.isRecord(post.reply.parent.record) && post.reply.parent.record.reply) {
                    const did = post.reply.parent.record.reply.parent.uri.replace("at://", "").split("/")[0];
                    dids.push(did);
                }
            }
            await cacheProfiles(this.bskyClient, dids);
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
        document.body.append(
            dom(
                html`<post-editor-overlay .account=${localStorage.getItem("a")} .bskyClient=${this.bskyClient} .quote=${post}></post-editor-overly>`
            )[0]
        );
    }

    reply(post: AppBskyFeedDefs.PostView) {
        document.body.append(
            dom(
                html`<post-editor-overlay .account=${localStorage.getItem("a")} .bskyClient=${this.bskyClient} .replyTo=${post}></post-editor-overly>`
            )[0]
        );
    }

    renderPost(post: FeedViewPost) {
        if (!post.reply) {
            const repostedBy = AppBskyFeedDefs.isReasonRepost(post.reason)
                ? html`<div class="px-4 pt-2 mb-[-0.25em] flex items-center gap-2 text-lightgray text-xs"><i class="icon w-4 h-4 fill-lightgray">${reblogIcon}</i><a class="hover:underline truncate" href="${getProfileUrl(
                      post.reason.by
                  )}">${post.reason.by.displayName ?? post.reason.by.handle}</div>`
                : nothing;
            return html`<div class="border-t border-gray/50 px-2">
                ${repostedBy ? repostedBy : nothing}
                <post-view .bskyClient=${this.bskyClient} .post=${post.post} .quoteCallback=${this.quote} .replyCallback=${this.reply}></post-view>
            </div>`;
        } else {
            return html`<div class="border-t border-gray/50 px-2 mb-2 flex">
                <div class="flex-col">
                    <post-view
                        .bskyClient=${this.bskyClient}
                        .post=${post.reply.parent}
                        .quoteCallback=${this.quote}
                        .replyCallback=${this.reply}
                    ></post-view>
                    <div class="ml-4 border-l border-l-primary">
                        <post-view
                            .bskyClient=${this.bskyClient}
                            .post=${post.post}
                            .quoteCallback=${this.quote}
                            .replyCallback=${this.reply}
                        ></post-view>
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
    @property()
    bskyClient?: BskyAgent;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        return html`<div class="fixed top-0 left-0 w-full h-full z-[1000] bg-white dark:bg-black overflow-auto">
            <div class="mx-auto max-w-[600px] h-full flex flex-col">
                <div class="fixed top-0 w-[600px] max-w-[100%] flex py-2 px-4 items-center bg-white dark:bg-black z-[100]">
                    <span class="flex items-center text-primary font-bold">Home</span>
                    <button
                        @click=${() => this.close()}
                        class="ml-auto bg-primary text-white px-2 rounded disabled:bg-gray/70 disabled:text-white/70"
                    >
                        Close
                    </button>
                </div>
                <div class="pt-[40px]">
                    <skychat-feed .bskyClient=${this.bskyClient}></skychat-feed>
                </div>
            </div>
        </div>`;
    }
}
