import { AppBskyFeedDefs, AppBskyFeedGetTimeline, AppBskyFeedPost, BskyAgent } from "@atproto/api";
import { FeedViewPost } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { LitElement, PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { map } from "lit/directives/map.js";
import { reblogIcon } from "../icons";
import { cacheProfiles } from "../profilecache";
import { contentLoader, dom, getProfileUrl, onVisibleOnce, renderTopbar, splitAtUri } from "../utils";
import { CloseableElement, pushHash } from "./closable";
import { bskyClient } from "../bsky";
import { ItemListLoaderResult, ItemsList } from "./list";

@customElement("skychat-feed")
export class Feed extends ItemsList<string, FeedViewPost> {
    async loadItems(cursor?: string | undefined): Promise<ItemListLoaderResult<string, AppBskyFeedDefs.FeedViewPost>> {
        if (!bskyClient) return new Error("Not connected");
        const feedResponse = await bskyClient.app.bsky.feed.getTimeline({ cursor });
        if (!feedResponse.success) return new Error("Could not load feed");
        const dids: string[] = [];
        for (const post of feedResponse.data.feed) {
            if (post.reply && AppBskyFeedPost.isRecord(post.reply.parent.record) && post.reply.parent.record.reply) {
                const did = splitAtUri(post.reply.parent.record.reply.parent.uri).repo;
                dids.push(did);
            }
        }
        await cacheProfiles(bskyClient, dids);
        return { cursor: feedResponse.data.cursor, items: feedResponse.data.feed };
    }

    getItemKey(post: AppBskyFeedDefs.FeedViewPost): string {
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

    quote(post: AppBskyFeedDefs.PostView) {
        document.body.append(dom(html`<post-editor-overlay .quote=${post}></post-editor-overly>`)[0]);
    }

    reply(post: AppBskyFeedDefs.PostView) {
        document.body.append(dom(html`<post-editor-overlay .replyTo=${post}></post-editor-overly>`)[0]);
    }

    renderItem(post: FeedViewPost) {
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
            return html`<div>
                ${repostedBy}
                <post-view .post=${post.post} .quoteCallback=${this.quote} .replyCallback=${this.reply}></post-view>
            </div>`;
        } else {
            return html`<div class="flex">
                <div class="flex flex-col w-full">
                    <post-view .post=${post.reply.parent} .quoteCallback=${this.quote} .replyCallback=${this.reply}></post-view>
                    <div class="ml-2 pl-2 mt-2 border-l border-l-primary">
                        <post-view .post=${post.post} .quoteCallback=${this.quote} .replyCallback=${this.reply}></post-view>
                    </div>
                </div>
            </div>`;
        }
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
                    <skychat-feed poll="true"></skychat-feed>
                </div>
            </div>
        </div>`;
    }
}
