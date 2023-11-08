import {
    AppBskyActorDefs,
    AppBskyFeedDefs,
    AppBskyFeedLike,
    AppBskyFeedPost,
    AppBskyFeedRepost,
    AppBskyGraphFollow,
    AppBskyNotificationListNotifications,
    BskyAgent,
} from "@atproto/api";
import { PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { map } from "lit/directives/map.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { loadPosts } from "../bsky";
import { atIcon, followIcon, heartIcon, quoteIcon, reblogIcon, replyIcon } from "../icons";
import { contentLoader, dom, getTimeDifference, onVisibleOnce, renderAuthor, renderTopbar } from "../utils";
import { CloseableElement, HashNavCloseableElement } from "./closable";
import { PostEditor } from "./posteditor";
import { renderEmbed, renderPostText } from "./postview";

type NotificationType = "like" | "repost" | "follow" | "mention" | "reply" | "quote" | (string & {});

type GroupedNotification = Notification & { autors: [] };

@customElement("notifications-overlay")
export class NotificationsOverlay extends HashNavCloseableElement {
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
                if (AppBskyFeedPost.isRecord(notification.record) && notification.record.reply) {
                    postsToLoad.push(notification.record.reply.parent.uri);
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

    getHash(): string {
        return "notifications";
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.load();
    }

    render() {
        return html`<div class="fixed top-0 left-0 w-full h-full z-[1000] bg-white dark:bg-black overflow-auto">
            <div class="mx-auto max-w-[600px] h-full flex flex-col">
                ${renderTopbar(
                    "Notifications",
                    html`<button
                        @click=${() => this.close()}
                        class="ml-auto bg-primary text-white px-2 rounded disabled:bg-gray/70 disabled:text-white/70"
                    >
                        Close
                    </button>`
                )}
                <div class="pt-[40px]">
                    ${this.isLoading
                        ? html`<div class="animate-fade flex-grow flex flex-col">
                              <div class="align-top"><div id="loader" class="w-full text-center p-4 animate-pulse">Loading notifications</div></div>
                          </div>`
                        : this.renderNotifications()}
                </div>
            </div>
        </div>`;
    }

    renderNotification(notification: AppBskyNotificationListNotifications.Notification) {
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
                            ${renderPostText(this.bskyClient, post.record)}
                        </div>
                        ${post.embed ? renderEmbed(this.bskyClient, post.embed, false, true) : nothing}`;
                    break;
                case "reply":
                    const parent = this.posts.get((notification.record as any).reply.parent.uri);
                    postContent = html`${parent && accountProfile && AppBskyFeedPost.isRecord(parent.record)
                            ? html`<div class="border border-gray/50 rounded p-2">
                                  <div class="dark:text-white/50 text-black/50">${renderAuthor(this.bskyClient, parent.author, true)}</div>
                                  <div class="mt-1 mb-1 break-words dark:text-white/50 text-black/50 leading-tight">
                                      ${renderPostText(this.bskyClient, parent.record)}
                                  </div>
                                  ${parent.embed ? renderEmbed(this.bskyClient, parent.embed, false, true) : nothing}
                              </div>`
                            : nothing}<post-view
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
            <div class="flex items-center gap-2">
                <i class="icon w-5 h-5">${icons[notification.reason] ?? ""}</i>
                ${renderAuthor(this.bskyClient, notification.author, false)}
                <span class="text-xs text-gray">${getTimeDifference(date.getTime())}</span>
            </div>
            ${postContent ? html`<div class="mt-2">${postContent}</div>` : nothing}
        </div>`;
    }

    quote(post: AppBskyFeedDefs.PostView) {
        const account = localStorage.getItem("a");
        const editorDom = dom(html`<div class="absolute flex bottom-0 w-full z-[2000]">
            <post-editor
                class="animate-jump-in mx-auto w-[600px] border border-gray rounded"
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
                class="animate-jump-in mx-auto w-[600px] border border-gray rounded"
                .account=${account}
                .bskyClient=${this.bskyClient}
                .cancelable=${true}
            ></post-editor>
        </div>`)[0];
        const editor: PostEditor = editorDom.querySelector("post-editor")!;
        editor.setReply(post);
        document.body.append(editorDom);
    }

    groupLikes(notifications: AppBskyNotificationListNotifications.Notification[]) {}

    renderNotifications() {
        if (!this.lastNotifications) return html``;

        let notificationsDom = dom(html`<div class="notifications flex flex-col">
            ${map(this.lastNotifications.notifications, (notification) => this.renderNotification(notification))}
            <div id="loader" class="w-full text-center p-4 animate-pulse">Loading notifications</div>
        </div>`)[0];

        const loader = notificationsDom.querySelector("#loader") as HTMLElement;
        const loadMore = async () => {
            await this.loadMoreNotifications();
            loader?.remove();
            if (!this.lastNotifications || this.lastNotifications.notifications.length == 0) {
                loader.innerText = "No more notifications";
                return;
            }

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
