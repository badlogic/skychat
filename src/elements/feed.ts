import { AppBskyFeedDefs, AppBskyFeedPost } from "@atproto/api";
import { FeedViewPost } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { TemplateResult, html, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { bskyClient } from "../bsky";
import { reblogIcon } from "../icons";
import { cacheProfiles } from "../profilecache";
import { dom, getProfileUrl, splitAtUri } from "../utils";
import { ItemListLoaderResult, ItemsList } from "./list";
import { Overlay, renderTopbar } from "./overlay";

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
export class FeedOverlay extends Overlay {
    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    renderHeader() {
        return html`${renderTopbar("Home", this.closeButton())}`;
    }

    renderContent(): TemplateResult {
        return html`<skychat-feed poll="true"></skychat-feed>`;
    }
}
