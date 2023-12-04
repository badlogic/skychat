import {
    AppBskyFeedDefs,
    AppBskyFeedLike,
    AppBskyFeedPost,
    AppBskyFeedRepost,
    AppBskyGraphFollow,
    AppBskyNotificationListNotifications,
} from "@atproto/api";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { FeedViewPost, GeneratorView, PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { LitElement, PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { GeneratorViewElementAction, UpButton } from ".";
import { Messages, i18n } from "../i18n";
import { atIcon, followIcon, heartFilledIcon, heartIcon, quoteIcon, reblogIcon, replyIcon } from "../icons";
import { State } from "../state";
import { Store } from "../store";
import { ActorFeedStream, NotificationsStream, Stream, StreamPage } from "../streams";
import {
    collectLitElements,
    dom,
    error,
    getScrollParent,
    getTimeDifference,
    hasLinkOrButtonParent,
    isSafariBrowser,
    onVisibleOnce,
    renderError,
} from "../utils";
import { HashNavOverlay, Overlay, renderTopbar } from "./overlay";
import { deletePost, quote, reply } from "./posteditor";
import { PostViewElement, renderEmbed, renderRichText } from "./posts";
import { ProfileViewElement, renderProfile } from "./profiles";
import { ListViewElementAction } from "./lists";
import { ListItemView, ListView } from "@atproto/api/dist/client/types/app/bsky/graph/defs";
import { LitVirtualizer } from "@lit-labs/virtualizer";

(window as any).emitLitDebugLogEvents = true;

export abstract class StreamView<T> extends LitElement {
    @property()
    stream?: Stream<T>;

    @property()
    newItems?: (newItems: T[] | Error) => Promise<void> = async () => {};

    @property()
    wrapItem = true;

    @property()
    showEndOfList = true;

    @state()
    error?: string;

    @query("#spinner")
    spinner?: HTMLElement;

    loadingPaused = false;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        if (!this.stream) {
            error("No stream set, this should not happen");
            return;
        }

        // Setup polling
        if (this.stream && this.stream.pollNew) {
            this.stream.addNewItemsListener(async (newerItems) => {
                if (this.newItems) this.newItems(newerItems);
                if (newerItems instanceof Error) {
                    error("Couldn't load newer items", newerItems);
                    return;
                }

                const scrollParent = getScrollParent(this.children[0] as HTMLElement)!;
                const upButton = scrollParent.querySelector("up-button") as UpButton;
                if (upButton) {
                    // FIXME replace with what we got from the Mastodon user maybe.
                    //       or make lit-virtualizer work for prepending.
                    upButton.classList.remove("hidden");
                    upButton.highlight = true;
                    upButton.renderOnClick.push(async () => {
                        if (!this.stream) {
                            error("Couldn't load newer items");
                            return;
                        }
                        const listVirtualizer = this.querySelector("#listVirtualizer") as LitVirtualizer;
                        if (listVirtualizer) {
                            const allItems: T[] = [];
                            for (const page of this.stream.pages) {
                                allItems.push(...page.items);
                            }
                            listVirtualizer.items = allItems;
                            await listVirtualizer.layoutComplete;
                            requestAnimationFrame(() => {
                                const scrollParent = getScrollParent(upButton);
                                scrollParent?.scrollTo({ top: 0, behavior: "instant" });
                            });
                        }
                    });
                }
            });
        }
        this.load();
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this.stream?.close();
    }

    isLoading = false;
    protected async load() {
        if (!State.isConnected()) return;
        if (!this.stream) {
            this.error = i18n("Invalid stream");
            return;
        }
        if (this.loadingPaused) return;
        if (this.isLoading) return;
        this.isLoading = true;

        try {
            const page = await this.stream.next();
            if (page instanceof Error) {
                this.error = i18n("Invalid stream"); // FIXME handle error
                return;
            }

            const { items } = page;
            const listVirtualizer = this.querySelector("#listVirtualizer") as LitVirtualizer;
            const spinner = this.spinner;
            if (!listVirtualizer || !spinner) {
                this.error = i18n("Sorry, an unknown error occured");
                return;
            }

            if (items.length == 0) {
                spinner.innerHTML = "";
                if (this.showEndOfList)
                    spinner.append(dom(html`<div class="w-full h-16 flex items-center justify-center">${i18n("End of list")}</div>`)[0]);
                return;
            }

            const allItems: T[] = [];
            for (const page of this.stream.pages) {
                allItems.push(...page.items);
            }
            listVirtualizer.items = allItems;
            onVisibleOnce(spinner, () => this.load());
        } catch (e) {
            this.error = i18n("Sorry, an unknown error occured");
        } finally {
            this.isLoading = false;
        }
    }

    renderItemInternal(item: T, index: number) {
        const itemDom = this.wrapItem ? StreamView.renderWrapped(this.renderItem(item)) : this.renderItem(item);
        return itemDom;
    }

    render() {
        if (this.error) return renderError(this.error);

        return html`
            <div id="items" class="flex flex-col">
                <lit-virtualizer
                    id="listVirtualizer"
                    class="w-full h-full"
                    .renderItem=${(item: T, index: number) => this.renderItemInternal(item, index)}
                ></lit-virtualizer>
                <loading-spinner class="w-full" id="spinner"></loading-spinner>
            </div>
        `;
    }

    abstract renderItem(item: T): TemplateResult;

    static renderWrapped(item: TemplateResult | HTMLElement): TemplateResult {
        return html`<div class="w-full px-4 py-2 border-b border-divider">${item}</div>`;
    }
}

@customElement("posts-stream-view")
export class PostsStreamView extends StreamView<PostView> {
    getItemKey(item: PostView): string {
        return item.uri;
    }
    renderItem(post: PostView): TemplateResult {
        return html`
            <post-view
                class="w-full"
                .post=${post}
                .quoteCallback=${(post: PostView) => quote(post)}
                .replyCallback=${(post: PostView) => reply(post)}
                .deleteCallback=${(post: PostView) => deletePost(post)}
            ></post-view>
        `;
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
        return html`<feed-view-post-view class="w-full" .feedViewPost=${feedViewPost}></feed-view-post-view>`;
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
type NotificationFilter = {
    showFollows: boolean;
    showReplies: boolean;
    showQuotes: boolean;
    showReposts: boolean;
    showMentions: boolean;
    showLikes: boolean;
};

@customElement("notifications-stream-view")
export class NotificationsStreamView extends StreamView<AppBskyNotificationListNotifications.Notification> {
    filter: NotificationFilter = {
        showFollows: true,
        showLikes: true,
        showMentions: true,
        showQuotes: true,
        showReplies: true,
        showReposts: true,
    };

    constructor() {
        super();
        this.stream = new NotificationsStream(true);
        this.wrapItem = false;
        State.notify("unreadNotifications", "updated", 0);
    }

    private shouldShowNotification(type: NotificationType) {
        let show = false;
        switch (type) {
            case "like":
                show = this.filter.showLikes;
                break;
            case "repost":
                show = this.filter.showReposts;
                break;
            case "follow":
                show = this.filter.showFollows;
                break;
            case "mention":
                show = this.filter.showMentions;
                break;
            case "reply":
                show = this.filter.showReplies;
                break;
            case "quote":
                show = this.filter.showQuotes;
                break;
        }
        return show;
    }

    applyFilter() {
        const notifications = Array.from(this.querySelectorAll(".notification")) as HTMLElement[];
        for (const notification of notifications) {
            const show = this.shouldShowNotification(notification.dataset.type as NotificationType);
            if (show) notification.classList.remove("hidden");
            else notification.classList.add("hidden");
        }

        if (
            !this.filter.showFollows &&
            !this.filter.showLikes &&
            !this.filter.showMentions &&
            !this.filter.showQuotes &&
            !this.filter.showReplies &&
            !this.filter.showReposts
        ) {
            this.loadingPaused = true;
            this.spinner?.classList.add("hidden");
        } else {
            if (this.loadingPaused) {
                this.loadingPaused = false;
                this.spinner?.classList.remove("hidden");
                this.load();
            } else {
                this.loadingPaused = false;
            }
        }
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
                        <div class="break-words dark:text-white/50 text-black/50">${renderRichText(post.record)}</div>
                        ${post.embed ? renderEmbed(post.embed, false, true) : nothing}
                    </div>`;
                    break;
                case "reply":
                    const parent = State.getObject("post", (notification.record as any).reply.parent.uri);
                    postContent = html`${parent && profile && AppBskyFeedPost.isRecord(parent.record)
                            ? html`<div
                                  class="border border-divider rounded p-2 mb-2 cursor-pointer"
                                  @click=${(ev: Event) => {
                                      if (hasLinkOrButtonParent(ev.target as HTMLElement)) return;
                                      ev.stopPropagation();
                                      document.body.append(dom(html`<thread-overlay .postUri=${post?.uri}></thread-overlay>`)[0]);
                                  }}
                              >
                                  <div class="dark:text-white/50 text-black/50">${renderProfile(parent.author, true)}</div>
                                  <div class="mt-1 mb-1 break-words text-muted-fg">${renderRichText(parent.record)}</div>
                                  ${parent.embed ? renderEmbed(parent.embed, false, true) : nothing}
                              </div>`
                            : nothing}<post-view
                            .showHeader=${false}
                            .post=${post}
                            .quoteCallback=${(post: PostView) => quote(post)}
                            .replyCallback=${(post: PostView) => reply(post)}
                            .showReplyTo=${false}
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
            data-type="${notification.reason}"
            class="notification cursor-pointer w-full ${this.shouldShowNotification(notification.reason)
                ? ""
                : "hidden"} px-4 py-4 border-b border-divider flex flex-col ${notification.isRead ? "" : "bg-[#d8e4ff4a] dark:bg-[#001040]"}"
        >
            <div class="flex items-center gap-2">
                <i class="icon !w-5 !h-5 fill-primary">${icons[notification.reason] ?? ""}</i>
                ${renderProfile(notification.author, false)}
                <span class="ml-auto text-xs text-muted-fg">${getTimeDifference(date.getTime())}</span>
            </div>
            ${postContent ? html`<div class="mt-1">${postContent}</div>` : nothing}
        </div>`)[0];
        return html`${notificationDom}`;
    }
}

// FIXME topbar buttons are foobar on <= 350px screens like Nexus 4
@customElement("notifications-stream-overlay")
export class NotificationsStreamOverlay extends HashNavOverlay {
    @query("#notifications")
    notifications?: NotificationsStreamView;

    getHash(): string {
        return "notifications";
    }

    renderHeader(): TemplateResult {
        const buttons = html`<div class="ml-auto flex">
            <div class="flex items-center">
                <icon-toggle
                    .value=${true}
                    @change=${(ev: CustomEvent) => {
                        this.notifications!.filter.showFollows = ev.detail.value;
                        this.handleFilter();
                    }}
                    .icon=${html`<i class="icon !w-5 !h-5">${followIcon}</i>`}
                    class="w-8 h-8"
                ></icon-toggle>
                <icon-toggle
                    .value=${true}
                    @change=${(ev: CustomEvent) => {
                        this.notifications!.filter.showReplies = ev.detail.value;
                        this.handleFilter();
                    }}
                    .icon=${html`<i class="icon !w-5 !h-5">${replyIcon}</i>`}
                    class="w-8 h-8"
                ></icon-toggle>
                <icon-toggle
                    .value=${true}
                    @change=${(ev: CustomEvent) => {
                        this.notifications!.filter.showQuotes = ev.detail.value;
                        this.handleFilter();
                    }}
                    .icon=${html`<i class="icon !w-5 !h-5">${quoteIcon}</i>`}
                    class="w-8 h-8"
                ></icon-toggle>
                <icon-toggle
                    .value=${true}
                    @change=${(ev: CustomEvent) => {
                        this.notifications!.filter.showReposts = ev.detail.value;
                        this.handleFilter();
                    }}
                    .icon=${html`<i class="icon !w-5 !h-5">${reblogIcon}</i>`}
                    class="w-8 h-8"
                ></icon-toggle>
                <icon-toggle
                    .value=${true}
                    @change=${(ev: CustomEvent) => {
                        this.notifications!.filter.showMentions = ev.detail.value;
                        this.handleFilter();
                    }}
                    .icon=${html`<i class="icon !w-5 !h-5">${atIcon}</i>`}
                    class="w-8 h-8"
                ></icon-toggle>
                <icon-toggle
                    .value=${true}
                    @change=${(ev: CustomEvent) => {
                        this.notifications!.filter.showLikes = ev.detail.value;
                        this.handleFilter();
                    }}
                    .icon=${html`<i class="icon !w-5 !h-5">${heartIcon}</i>`}
                    class="w-8 h-8"
                ></icon-toggle>
            </div>
            <div class="-ml-2">${this.closeButton()}</div>
        </div>`;

        return html`${renderTopbar("Notifications", buttons)}`;
    }

    handleFilter() {
        this.notifications?.applyFilter();
    }

    renderContent(): TemplateResult {
        return html`<notifications-stream-view id="notifications"></notifications-stream-view>`;
    }
}

@customElement("profiles-stream-view")
export class ProfilesStreamView extends StreamView<ProfileView> {
    @property()
    actionButtons?: (profileElement: ProfileViewElement, profile: ProfileView) => TemplateResult;

    getItemKey(item: ProfileView): string {
        return item.did;
    }
    renderItem(item: ProfileView): TemplateResult {
        return html`<profile-view .actionButtons=${this.actionButtons} .profile=${item}></profile-view>`;
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
        return html`<profiles-stream-view class="w-full" .stream=${this.stream}></profiles-stream-view>`;
    }
}

@customElement("generators-stream-view")
export class GeneratorsStreamView extends StreamView<GeneratorView> {
    @property()
    minimal = false;

    @property()
    action = (action: GeneratorViewElementAction, generator: GeneratorView) => {};

    renderItem(item: GeneratorView): TemplateResult {
        return html`<generator-view class="w-full" .minimal=${this.minimal} .generator=${item} .action=${this.action}></generator-view>`;
    }
}

@customElement("lists-stream-view")
export class ListsStreamView extends StreamView<ListView> {
    @property()
    minimal = false;

    @property()
    action = (action: ListViewElementAction, list: ListView) => {};

    renderItem(item: ListView): TemplateResult {
        return html`<list-view class="w-full" .minimal=${this.minimal} .list=${item} .action=${this.action}></list-view>`;
    }
}

@customElement("list-items-stream-view")
export class ListItemsStreamView extends StreamView<ListItemView> {
    @property()
    actionButtons?: (profileElement: ProfileViewElement, profile: ProfileView) => TemplateResult;

    renderItem(item: ListItemView): TemplateResult {
        return html`<list-item-view class="w-full" .listItem=${item} .actionButtons=${this.actionButtons}></list-view>`;
    }
}
