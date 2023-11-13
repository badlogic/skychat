import {
    AppBskyFeedDefs,
    AppBskyFeedLike,
    AppBskyFeedPost,
    AppBskyFeedRepost,
    AppBskyGraphFollow,
    AppBskyNotificationListNotifications,
} from "@atproto/api";
import { PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { FirebaseOptions, initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { map } from "lit/directives/map.js";
import { bskyClient, loadPosts } from "../bsky";
import { atIcon, followIcon, heartIcon, quoteIcon, reblogIcon, replyIcon } from "../icons";
import { Store } from "../store";
import { dom, getTimeDifference, hasLinkOrButtonParent, onVisibleOnce, apiBaseUrl, contentLoader } from "../utils";
import { HashNavOverlay, renderTopbar } from "./overlay";
import { renderEmbed, renderPostText } from "./posts";
import { cacheQuotes } from "../cache";
import { i18n } from "../i18n";
import { renderProfile } from "./profiles";

type NotificationType = "like" | "repost" | "follow" | "mention" | "reply" | "quote" | (string & {});

type GroupedNotification = Notification & { autors: [] };

@customElement("notifications-overlay")
export class NotificationsOverlay extends HashNavOverlay {
    @state()
    isLoading = true;

    @query("#notifications")
    notificationsDom?: HTMLElement;

    lastNotifications?: AppBskyNotificationListNotifications.OutputSchema;

    posts = new Map<string, PostView>();

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
            // FIXME should probably display an error if new notifications couldn't be loaded for some reason.
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
            await Promise.all([loadPosts(postsToLoad, this.posts), cacheQuotes(postsToLoad)]);
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

    renderHeader(): TemplateResult {
        return html` ${renderTopbar("Notifications", this.closeButton())}`;
    }

    renderContent(): TemplateResult {
        return html`${this.isLoading
            ? html`<div class="animate-fade flex-grow flex flex-col">
                  <div class="align-top"><div id="loader" class="w-full text-center p-4 animate-pulse">${contentLoader}</div></div>
              </div>`
            : this.renderNotifications()}`;
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
        let post: PostView | undefined;
        let notificationDom: HTMLElement | undefined;
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
                    postContent = html`<div
                        class="cursor-pointer"
                        @click=${(ev: Event) => {
                            if (!bskyClient) return;
                            if (hasLinkOrButtonParent(ev.target as HTMLElement)) return;
                            ev.stopPropagation();
                            document.body.append(dom(html`<thread-overlay .postUri=${post?.uri}></thread-overlay>`)[0]);
                        }}
                    >
                        <div class="break-words dark:text-white/50 text-black/50 leading-tight">
                            <div class="whitespace-pre-wrap">${renderPostText(post.record)}</div>
                        </div>
                        ${post.embed ? renderEmbed(post.embed, false, true) : nothing}
                    </div>`;
                    break;
                case "reply":
                    const parent = this.posts.get((notification.record as any).reply.parent.uri);
                    postContent = html`${parent && profile && AppBskyFeedPost.isRecord(parent.record)
                            ? html`<div class="border border-gray/50 rounded p-2 mb-2">
                                  <div class="dark:text-white/50 text-black/50">${renderProfile(parent.author, true)}</div>
                                  <div class="mt-1 mb-1 break-words dark:text-white/50 text-black/50 leading-tight">
                                      <div class="whitespace-pre-wrap">${renderPostText(parent.record)}</div>
                                  </div>
                                  ${parent.embed ? renderEmbed(parent.embed, false, true) : nothing}
                              </div>`
                            : nothing}<post-view
                            .showHeader=${false}
                            .post=${post}
                            .quoteCallback=${this.quote}
                            .replyCallback=${this.reply}
                            .deleteCallback=${(post: PostView) => this.deletePost(post, notificationDom!)}
                        ></post-view>`;
                    break;
                case "mention":
                case "quote":
                    postContent = html`<post-view
                        .showHeader=${false}
                        .post=${post}
                        .quoteCallback=${this.quote}
                        .replyCallback=${this.reply}
                        .deleteCallback=${(post: PostView) => this.deletePost(post, notificationDom!)}
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

        notificationDom = dom(html`<div
            class="flex flex-col border-t border-gray/20 ${notification.isRead ? "" : "bg-[#d8e4ff] dark:bg-[#001040]"} px-4 py-2"
        >
            <div class="flex items-center gap-2">
                <i class="icon w-5 h-5">${icons[notification.reason] ?? ""}</i>
                ${renderProfile(notification.author, false)}
                <span class="ml-auto text-xs text-gray">${getTimeDifference(date.getTime())}</span>
            </div>
            ${postContent ? html`<div class="mt-1">${postContent}</div>` : nothing}
        </div>`)[0];
        return html`${notificationDom}`;
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
            alert(i18n("Couldn't delete post"));
        }
        postDom.remove();
    }

    groupLikes(notifications: AppBskyNotificationListNotifications.Notification[]) {}

    renderNotifications() {
        if (!this.lastNotifications) return html``;

        const notificationsDom = dom(html`<div id="notifications" class="flex flex-col">
            ${map(this.lastNotifications.notifications, (notification) => this.renderNotification(notification))}
            <div id="loader" class="w-full text-center p-4 animate-pulse">${contentLoader}</div>
        </div>`)[0];

        const loader = notificationsDom.querySelector("#loader") as HTMLElement;
        const loadMore = async () => {
            await this.loadNotifications();
            loader?.remove();
            if (!this.lastNotifications || this.lastNotifications.notifications.length == 0) {
                loader.innerText = i18n("No more notifications");
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

export async function setupWorkerNotifications() {
    try {
        if (Notification.permission != "granted" || !Store.getUser()) {
            console.log("Can not setup push notifications, permission not granted or not logged in.");
            return;
        }
        const firebaseConfig: FirebaseOptions = {
            apiKey: "AIzaSyAZ2nH3qKCFqFhQSdeNH91SNAfTHl-nP7s",
            authDomain: "skychat-733ab.firebaseapp.com",
            projectId: "skychat-733ab",
            storageBucket: "skychat-733ab.appspot.com",
            messagingSenderId: "693556593993",
            appId: "1:693556593993:web:8137dd0568c75b50d1c698",
        };

        const app = initializeApp(firebaseConfig);
        const messaging = getMessaging(app);
        const token = await getToken(messaging, {
            vapidKey: "BIqRsppm0-uNKJoRjVCzu5ZYtT-Jo6jyjDXVuqLbudGvpRTuGwptZ9x5ueu5imL7xdjVA989bJOJYcx_Pvf-AYM",
        });

        const response = await fetch(
            apiBaseUrl() + `api/register?token=${encodeURIComponent(token)}&did=${encodeURIComponent(Store.getUser()?.profile.did ?? "")}`
        );
        if (!response.ok) {
            console.error("Couldn't register push token.");
            return;
        }
        console.log("Initialized notifications: ");
        console.log(token);
        onMessage(messaging, (ev) => {
            console.log("Received message in app");
            console.log(ev.data);
        });
        navigator.serviceWorker.addEventListener("message", (ev) => {
            if (ev.data && ev.data == "notifications") {
                if (location.hash.replace("#", "") != "notifications") {
                    document.body.append(dom(html`<notifications-overlay></notifications-overlay>`)[0]);
                }
            }
        });
    } catch (e) {
        console.error("Couldn't request notification permission and start service worker.", e);
    }
}
