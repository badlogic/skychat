import {
    AppBskyFeedDefs,
    AppBskyFeedLike,
    AppBskyFeedPost,
    AppBskyFeedRepost,
    AppBskyGraphFollow,
    AppBskyNotificationListNotifications,
} from "@atproto/api";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { FeedViewPost, PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { LitElement, PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { date } from "../bsky";
import { Messages, i18n } from "../i18n";
import { atIcon, followIcon, heartIcon, quoteIcon, reblogIcon, replyIcon } from "../icons";
import { State } from "../state";
import { Store } from "../store";
import { ActorFeedStream, NotificationsStream, Stream } from "../streams";
import { dom, getTimeDifference, hasLinkOrButtonParent, onVisibleOnce, spinner } from "../utils";
import { HashNavOverlay, Overlay, renderTopbar } from "./overlay";
import { renderEmbed, renderPostText } from "./posts";
import { getProfileUrl, renderProfile } from "./profiles";
import { deletePost, quote, reply } from "./posteditor";

export abstract class StreamView<T> extends LitElement {
    @property()
    stream?: Stream<T>;

    @property()
    newItems?: (newItems: T[], allItems: T[]) => void = () => {};

    @property()
    wrapItem = true;

    @state()
    error?: string;

    @query("#spinner")
    spinner?: HTMLElement;

    @query("#items")
    itemsDom?: HTMLElement;

    items: T[] = [];
    itemsLookup = new Map<string, T>();

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.load();
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this.stream?.close();
    }

    protected async load() {
        if (!State.isConnected()) return;
        if (!this.stream) {
            this.error = i18n("Invalid stream");
            return;
        }

        try {
            const items = await this.stream.next();
            if (items instanceof Error) {
                this.error = i18n("Invalid stream"); // FIXME
                return;
            }

            const itemsDom = this.itemsDom;
            const spinner = this.spinner;
            if (!itemsDom || !spinner) {
                this.error = i18n("Sorry, an unknown error occured");
                return;
            }

            if (items.length == 0) {
                spinner.innerHTML = "";
                spinner.append(dom(html`<div class="w-full h-8 flex items-center justify-center">${i18n("No more items")}</div>`)[0]);
                return;
            }

            this.items = [...this.items, ...items];

            spinner.remove();
            for (const item of items) {
                this.itemsLookup.set(this.getItemKey(item), item);
                if (this.wrapItem) {
                    itemsDom.append(dom(html`<div class="px-4 py-2 border-t border-gray/20">${this.renderItem(item)}</div>`)[0]);
                } else {
                    itemsDom.append(dom(this.renderItem(item))[0]);
                }
            }
            itemsDom.append(spinner);
            onVisibleOnce(spinner, () => this.load());
        } catch (e) {
            this.error = i18n("Sorry, an unknown error occured");
        }
    }

    internalRenderItem(item: T) {
        return html`<div class="px-4 py-2 border-t border-gray/20">${this.renderItem(item)}</div>`;
    }

    render() {
        if (this.error)
            return html`<div class="mt-4 py-4 flex-grow flex items-center justify-center border border-red text-red rounded-md">${this.error}</div>`;

        return html` <div id="items" class="flex flex-col">
            <div id="spinner" class="w-full">${spinner}</div>
        </div>`;
    }

    abstract getItemKey(item: T): string;
    abstract renderItem(item: T): TemplateResult;
}

@customElement("posts-stream-view")
export class PosStreamView extends StreamView<PostView> {
    getItemKey(item: PostView): string {
        return item.uri;
    }
    renderItem(post: PostView): TemplateResult {
        const postDom = dom(html`<div>
            <post-view
                .post=${post}
                .quoteCallback=${(post: PostView) => quote(post)}
                .replyCallback=${(post: PostView) => reply(post)}
                .deleteCallback=${(post: PostView) => deletePost(post, postDom)}
            ></post-view>
        </div>`)[0];
        return html`${postDom}`;
    }
}

@customElement("posts-stream-overlay")
export class PostsStreamOverlay extends Overlay {
    @property()
    title: keyof Messages = "Home";

    @property()
    stream?: Stream<PostView>;

    renderHeader() {
        return html`${renderTopbar(this.title, this.closeButton())}`;
    }

    renderContent(): TemplateResult {
        return html`<posts-stream-view .stream=${this.stream}></posts-stream-view>`;
    }
}

@customElement("feed-stream-view")
export class FeedStreamView extends StreamView<FeedViewPost> {
    constructor() {
        super();
        this.wrapItem = false;
    }

    getItemKey(post: FeedViewPost): string {
        return post.post.uri + (AppBskyFeedDefs.isReasonRepost(post.reason) ? post.reason.by.did : "");
    }

    renderItem(feedViewPost: FeedViewPost): TemplateResult {
        return html`<feed-view-post-view .feedViewPost=${feedViewPost}></feed-view-post-view>`;
    }
}

@customElement("feed-stream-overlay")
export class FeedStreamOverlay extends Overlay {
    @property()
    title: keyof Messages = "Home";

    @property()
    stream?: Stream<FeedViewPost> = new ActorFeedStream("home");

    renderHeader() {
        return html`${renderTopbar(this.title, this.closeButton())}`;
    }

    renderContent(): TemplateResult {
        return html`<feed-stream-view .stream=${this.stream}></feed-stream-view>`;
    }
}

type NotificationType = "like" | "repost" | "follow" | "mention" | "reply" | "quote" | (string & {});

@customElement("notifications-stream-view")
export class NotificationsStreamView extends StreamView<AppBskyNotificationListNotifications.Notification> {
    constructor() {
        super();
        this.stream = new NotificationsStream();
        this.wrapItem = false;
    }

    getItemKey(notification: AppBskyNotificationListNotifications.Notification): string {
        return notification.uri;
    }

    renderItem(notification: AppBskyNotificationListNotifications.Notification): TemplateResult {
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
                if (State.getObject("post", notification.reasonSubject ?? "")) post = State.getObject("post", notification.reasonSubject!);
                break;
            case "reply":
            case "quote":
            case "mention":
                post = State.getObject("post", notification.uri);
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
                    const parent = State.getObject("post", (notification.record as any).reply.parent.uri);
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
                            .quoteCallback=${(post: PostView) => quote(post)}
                            .replyCallback=${(post: PostView) => reply(post)}
                        ></post-view>`;
                    break;
                case "mention":
                case "quote":
                    postContent = html`<post-view .showHeader=${false} .post=${post} .quoteCallback=${quote} .replyCallback=${reply}></post-view>`;
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
            class="px-4 py-2 border-t border-gray/20 flex flex-col ${notification.isRead ? "" : "bg-[#d8e4ff] dark:bg-[#001040]"}"
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
}

@customElement("notifications-stream-overlay")
export class NotificationsStreamOverlay extends HashNavOverlay {
    getHash(): string {
        return "notifications";
    }

    renderHeader(): TemplateResult {
        return html` ${renderTopbar("Notifications", this.closeButton())}`;
    }

    renderContent(): TemplateResult {
        return html`<notifications-stream-view></notifications-stream-view>`;
    }
}

@customElement("profiles-stream-view")
export class ProfilesStreamView extends StreamView<ProfileView> {
    getItemKey(item: ProfileView): string {
        return item.did;
    }
    renderItem(item: ProfileView): TemplateResult {
        return html`<profile-view .profile=${item}></profile-view>`;
    }
}

@customElement("profiles-stream-overlay")
export class ProfilesStreamOverlay extends HashNavOverlay {
    @property()
    title: string = "";

    @property()
    hash: string = "";

    @property()
    stream?: Stream<ProfileView>;

    getHash(): string {
        return this.hash;
    }

    renderHeader(): TemplateResult {
        return html` ${renderTopbar(this.title as keyof Messages, this.closeButton())}`;
    }

    renderContent(): TemplateResult {
        return html`<profiles-stream-view .stream=${this.stream}></profiles-stream-view>`;
    }
}
