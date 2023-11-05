import { customElement, property, query, state } from "lit/decorators.js";
import { CloseableElement } from "./closable";
import { PropertyValueMap, TemplateResult, html, nothing } from "lit";
import {
    AppBskyActorDefs,
    AppBskyFeedDefs,
    AppBskyFeedLike,
    AppBskyFeedPost,
    AppBskyFeedRepost,
    AppBskyGraphFollow,
    AppBskyNotificationListNotifications,
    BskyAgent,
    RichText,
} from "@atproto/api";
import { contentLoader, defaultAvatar, dom, getTimeDifference, onVisibleOnce, renderAuthor } from "../utils";
import { map } from "lit/directives/map.js";
import { loadPosts, processText } from "../bsky";
import { UnsafeHTMLDirective, unsafeHTML } from "lit/directives/unsafe-html.js";
import { renderEmbed } from "./postview";
import { atIcon, followIcon, heartIcon, quoteIcon, reblogIcon, replyIcon } from "../icons";
import { PostEditor } from "./posteditor";

type NotificationType = "like" | "repost" | "follow" | "mention" | "reply" | "quote" | (string & {});

@customElement("skychat-notifications")
export class Notifications extends CloseableElement {
    @property()
    bskyClient?: BskyAgent;

    @state()
    isLoading = true;

    @query("#notifications")
    notificationsDom?: HTMLElement;

    lastNotifications?: AppBskyNotificationListNotifications.OutputSchema;

    posts = new Map<string, AppBskyFeedDefs.PostView>();

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    async load() {
        if (!this.bskyClient) return;
        await this.loadMoreNotifications();
        this.isLoading = false;
    }

    loading = false;
    async loadMoreNotifications() {
        if (!this.bskyClient) return;
        if (this.loading) return;
        try {
            this.loading = true;
            const listResponse = await this.bskyClient.listNotifications(
                this.lastNotifications ? { cursor: this.lastNotifications.cursor } : undefined
            );
            if (!listResponse.success) {
                console.error("Couldn't update seen notifications");
                this.lastNotifications = undefined;
                return;
            }
            const postsToLoad: string[] = [];
            for (const notification of listResponse.data.notifications) {
                if (notification.reasonSubject && notification.reasonSubject.includes("app.bsky.feed.post")) {
                    postsToLoad.push(notification.reasonSubject);
                }
                if (notification.uri.includes("app.bsky.feed.post")) {
                    postsToLoad.push(notification.uri);
                }
            }
            await loadPosts(this.bskyClient, postsToLoad, this.posts);
            this.lastNotifications = listResponse.data;
            const updateReponse = await this.bskyClient.updateSeenNotifications();
            if (!updateReponse.success) console.error("Couldn't update seen notifications");
        } finally {
            this.loading = false;
        }
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        this.load();
    }

    render() {
        return html`<div class="fixed top-0 left-0 w-full h-full z-[1000] bg-white dark:bg-black">
            <div class="mx-auto max-w-[600px] h-full flex flex-col px-4 overflow-auto">
                <div class="flex py-2 items-center bg-white dark:bg-black sticky top-0 z-[100]">
                    <span class="flex items-center text-primary font-bold">Notifications</span>
                    <button
                        @click=${() => this.close()}
                        class="ml-auto bg-primary text-white px-2 rounded disabled:bg-gray/70 disabled:text-white/70"
                    >
                        Close
                    </button>
                </div>
                ${this.isLoading
                    ? html`<div class="animate-fade flex-grow flex flex-col">
                          <div class="align-top">${contentLoader}</div>
                      </div>`
                    : this.renderNotifications()}
            </div>
        </div>`;
    }

    renderNotification(notification: AppBskyNotificationListNotifications.Notification) {
        const labels: Record<NotificationType, string> = {
            follow: "followed you",
            like: "liked your post",
            mention: "mentioned you",
            quote: "quoted you",
            reply: "replied to your post",
            repost: "reposted your post",
        };
        const icons: Record<NotificationType, TemplateResult> = {
            follow: html`${followIcon}`,
            mention: html`${atIcon}`,
            like: html`${heartIcon}`,
            quote: html`${quoteIcon}`,
            reply: html`${replyIcon}`,
            repost: html`${reblogIcon}`,
        };
        const accountProfile: AppBskyActorDefs.ProfileViewDetailed = localStorage.getItem("profile")
            ? JSON.parse(localStorage.getItem("profile")!)
            : null;
        let post: AppBskyFeedDefs.PostView | undefined;
        switch (notification.reason) {
            case "like":
            case "repost":
                if (this.posts.has(notification.reasonSubject ?? "")) post = this.posts.get(notification.reasonSubject!);
                break;
            case "reply":
            case "quote":
            case "mention":
                post = this.posts.get(notification.uri);
                break;
        }

        let postContent: TemplateResult | undefined;
        if (post && AppBskyFeedPost.isRecord(post.record)) {
            switch (notification.reason) {
                case "like":
                case "repost":
                    postContent = html`<div class="break-words dark:text-white/50 text-black/50 leading-tight">
                            ${unsafeHTML(processText(post.record))}
                        </div>
                        ${post.embed ? renderEmbed(post.embed, false, true) : nothing}`;
                    break;
                case "reply":
                    const parent = this.posts.get(notification.reasonSubject!);
                    postContent = html`${parent && accountProfile && AppBskyFeedPost.isRecord(parent.record)
                            ? html`<div class="border border-gray/50 rounded p-2">
                                  <div class="dark:text-white/50 text-black/50">${renderAuthor(accountProfile, true)}</div>
                                  <div class="mt-1 mb-1 break-words dark:text-white/50 text-black/50 leading-tight">
                                      ${unsafeHTML(processText(parent.record))}
                                  </div>
                                  ${parent.embed ? renderEmbed(parent.embed, false, true) : nothing}
                              </div>`
                            : nothing}<post-view
                            .minimal=${true}
                            .showHeader=${false}
                            .bskyClient=${this.bskyClient}
                            .post=${post}
                            .quoteCallback=${(post: AppBskyFeedDefs.PostView) => this.quote(post)}
                            .replyCallback=${(post: AppBskyFeedDefs.PostView) => this.reply(post)}
                        ></post-view>`;
                    break;
                case "mention":
                case "quote":
                    postContent = html`<post-view
                        .minimal=${true}
                        .showHeader=${false}
                        .bskyClient=${this.bskyClient}
                        .post=${post}
                        .quoteCallback=${(post: AppBskyFeedDefs.PostView) => this.quote(post)}
                        .replyCallback=${(post: AppBskyFeedDefs.PostView) => this.reply(post)}
                    ></post-view>`;
                    break;
            }
        }

        let date = new Date();
        if (
            AppBskyFeedLike.isRecord(notification.record) ||
            AppBskyFeedRepost.isRecord(notification.record) ||
            AppBskyGraphFollow.isRecord(notification.record)
        ) {
            date = new Date(notification.record.createdAt);
        } else {
            if (post) date = new Date(AppBskyFeedPost.isRecord(post.record) ? post.record.createdAt : new Date());
        }

        return html`<div class="flex flex-col border-b border-gray/50 ${notification.isRead ? "" : "bg-[#cbdaff] dark:bg-[#001040]"} px-4 py-2">
            <div class="flex items-center mb-2 gap-2">
                <i class="icon w-5 h-5">${icons[notification.reason] ?? ""}</i>
                ${renderAuthor(notification.author, false)}
                <span>${labels[notification.reason] ?? "did a thing"}</span>
                <span class="text-xs text-gray">${getTimeDifference(date.getTime())}</span>
            </div>
            ${postContent ? postContent : nothing}
        </div>`;
    }

    quote(post: AppBskyFeedDefs.PostView) {
        const account = localStorage.getItem("a");
        const editorDom = dom(html`<div class="absolute flex bottom-0 w-full z-[2000]">
            <post-editor
                class="mx-auto w-[600px] border border-gray rounded"
                .account=${account}
                .bskyClient=${this.bskyClient}
                .cancelable=${true}
                .quote=${post}
            ></post-editor>
        </div>`)[0];
        document.body.append(editorDom);
    }

    reply(post: AppBskyFeedDefs.PostView) {
        const account = localStorage.getItem("a");
        const editorDom = dom(html`<div class="absolute flex bottom-0 w-full z-[2000]">
            <post-editor
                class="mx-auto w-[600px] border border-gray rounded"
                .account=${account}
                .bskyClient=${this.bskyClient}
                .cancelable=${true}
            ></post-editor>
        </div>`)[0];
        const editor: PostEditor = editorDom.querySelector("post-editor")!;
        editor.setReply(post);
        document.body.append(editorDom);
    }

    renderNotifications() {
        if (!this.lastNotifications) return html``;

        let notificationsDom = dom(html`<div class="notifications flex flex-col">
            ${map(this.lastNotifications.notifications, (notification) => this.renderNotification(notification))}
            <div id="loader" class="w-full text-center p-4 animate-pulse">Loading more notifications</div>
        </div>`)[0];

        const loader = notificationsDom.querySelector("#loader") as HTMLElement;
        const loadMore = async () => {
            await this.loadMoreNotifications();
            loader?.remove();
            if (!this.lastNotifications) return;
            for (const notification of this.lastNotifications.notifications) {
                notificationsDom.append(dom(this.renderNotification(notification))[0]);
            }
            notificationsDom.append(loader);
            onVisibleOnce(loader, loadMore);
        };
        onVisibleOnce(loader, loadMore);

        return notificationsDom;
    }
}
