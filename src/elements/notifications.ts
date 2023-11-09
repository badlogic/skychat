import {
    AppBskyFeedDefs,
    AppBskyFeedLike,
    AppBskyFeedPost,
    AppBskyFeedRepost,
    AppBskyGraphFollow,
    AppBskyNotificationListNotifications,
} from "@atproto/api";
import { PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { map } from "lit/directives/map.js";
import { bskyClient, loadPosts } from "../bsky";
import { atIcon, followIcon, heartIcon, quoteIcon, reblogIcon, replyIcon } from "../icons";
import { Store } from "../store";
import { dom, getTimeDifference, hasLinkOrButtonParent, onVisibleOnce, renderAuthor, renderTopbar } from "../utils";
import { HashNavCloseableElement } from "./closable";
import { PostEditor } from "./posteditor";
import { renderEmbed, renderPostText } from "./postview";

type NotificationType = "like" | "repost" | "follow" | "mention" | "reply" | "quote" | (string & {});

type GroupedNotification = Notification & { autors: [] };

@customElement("notifications-overlay")
export class NotificationsOverlay extends HashNavCloseableElement {
    @state()
    isLoading = true;

    @query("#notifications")
    notificationsDom?: HTMLElement;

    lastNotifications?: AppBskyNotificationListNotifications.OutputSchema;

    posts = new Map<string, AppBskyFeedDefs.PostView>();

    intervalId: any = -1;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        clearInterval(this.intervalId);
    }

    async load() {
        if (!bskyClient) return;
        await this.loadNotifications();
        this.isLoading = false;

        let loading = false;
        const checkNewNotifications = async () => {
            if (loading) return;
            if (!bskyClient) return;
            const firstNode = this.notificationsDom?.children[0];
            if (!firstNode) return;
            loading = true;
            try {
                const listResponse = await bskyClient.listNotifications();
                if (!listResponse.success) {
                    console.error("Couldn't list new notifications");
                    return;
                }
                const postsToLoad: string[] = [];
                let numUnread = 0;
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
                    numUnread += notification.isRead ? 0 : 1;
                }
                if (numUnread == 0) return;
                await loadPosts(postsToLoad, this.posts);
                const updateReponse = await bskyClient.updateSeenNotifications();
                if (!updateReponse.success) console.error("Couldn't update seen notifications");

                for (const notification of listResponse.data.notifications) {
                    if (notification.isRead) continue;
                    const notificationDom = dom(this.renderNotification(notification))[0];
                    this.notificationsDom?.insertBefore(notificationDom, firstNode);
                }
            } catch (e) {
                console.error("Couldn't load newer notifications", e);
            } finally {
                loading = false;
            }
        };
        this.intervalId = setInterval(checkNewNotifications, 2000);
    }

    loading = false;
    async loadNotifications() {
        if (!bskyClient) return;
        if (this.loading) return;
        try {
            this.loading = true;
            const listResponse = await bskyClient.listNotifications(this.lastNotifications ? { cursor: this.lastNotifications.cursor } : undefined);
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
            await loadPosts(postsToLoad, this.posts);
            this.lastNotifications = listResponse.data;
            const updateReponse = await bskyClient.updateSeenNotifications();
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
        const user = Store.getUser();
        const profile = user?.profile;
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
            const authorDid = post.author.did;
            const rkey = post.uri.replace("at://", "").split("/")[2];
            switch (notification.reason) {
                case "like":
                case "repost":
                    postContent = html`<div
                        class="cursor-pointer"
                        @click=${(ev: Event) => {
                            if (!bskyClient) return;
                            if (hasLinkOrButtonParent(ev.target as HTMLElement)) return;
                            ev.stopPropagation();
                            document.body.append(dom(html`<thread-overlay .author=${authorDid} .rkey=${rkey}></thread-overlay>`)[0]);
                        }}
                    >
                        <div class="break-words dark:text-white/50 text-black/50 leading-tight">${renderPostText(post.record)}</div>
                        ${post.embed ? renderEmbed(post.embed, false, true) : nothing}
                    </div>`;
                    break;
                case "reply":
                    const parent = this.posts.get((notification.record as any).reply.parent.uri);
                    postContent = html`${parent && profile && AppBskyFeedPost.isRecord(parent.record)
                            ? html`<div class="border border-gray/50 rounded p-2">
                                  <div class="dark:text-white/50 text-black/50">${renderAuthor(parent.author, true)}</div>
                                  <div class="mt-1 mb-1 break-words dark:text-white/50 text-black/50 leading-tight">
                                      ${renderPostText(parent.record)}
                                  </div>
                                  ${parent.embed ? renderEmbed(parent.embed, false, true) : nothing}
                              </div>`
                            : nothing}<post-view
                            .showHeader=${false}
                            .post=${post}
                            .quoteCallback=${(post: AppBskyFeedDefs.PostView) => this.quote(post)}
                            .replyCallback=${(post: AppBskyFeedDefs.PostView) => this.reply(post)}
                        ></post-view>`;
                    break;
                case "mention":
                case "quote":
                    postContent = html`<post-view
                        .showHeader=${false}
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
                ${renderAuthor(notification.author, false)}
                <span class="text-xs text-gray">${getTimeDifference(date.getTime())}</span>
            </div>
            ${postContent ? html`<div class="mt-2">${postContent}</div>` : nothing}
        </div>`;
    }

    quote(post: AppBskyFeedDefs.PostView) {
        document.body.append(dom(html`<post-editor-overlay .quote=${post}></post-editor-overly>`)[0]);
    }

    reply(post: AppBskyFeedDefs.PostView) {
        document.body.append(dom(html`<post-editor-overlay .replyTo=${post}></post-editor-overly>`)[0]);
    }

    groupLikes(notifications: AppBskyNotificationListNotifications.Notification[]) {}

    renderNotifications() {
        if (!this.lastNotifications) return html``;

        const notificationsDom = dom(html`<div id="notifications" class="flex flex-col">
            ${map(this.lastNotifications.notifications, (notification) => this.renderNotification(notification))}
            <div id="loader" class="w-full text-center p-4 animate-pulse">Loading notifications</div>
        </div>`)[0];

        const loader = notificationsDom.querySelector("#loader") as HTMLElement;
        const loadMore = async () => {
            await this.loadNotifications();
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
