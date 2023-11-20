import {
    AppBskyFeedDefs,
    AppBskyFeedLike,
    AppBskyFeedPost,
    AppBskyFeedRepost,
    AppBskyGraphFollow,
    AppBskyNotificationListNotifications,
    RichText,
} from "@atproto/api";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { FeedViewPost, GeneratorView, PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { LitElement, PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { Messages, i18n } from "../i18n";
import { atIcon, followIcon, heartIcon, quoteIcon, reblogIcon, replyIcon } from "../icons";
import { State } from "../state";
import { Store } from "../store";
import { ActorFeedStream, NotificationsStream, Stream } from "../streams";
import { collectLitElements, defaultFeed, dom, error, getScrollParent, getTimeDifference, hasLinkOrButtonParent, onVisibleOnce } from "../utils";
import { HashNavOverlay, Overlay, renderTopbar } from "./overlay";
import { deletePost, quote, reply } from "./posteditor";
import { renderEmbed, renderRichText } from "./posts";
import { renderProfile } from "./profiles";

export abstract class StreamView<T> extends LitElement {
    @property()
    stream?: Stream<T>;

    @property()
    newItems?: (newItems: T[] | Error, allItems: T[]) => void = () => {};

    @property()
    wrapItem = true;

    @state()
    error?: string;

    @query("#spinner")
    spinner?: HTMLElement;

    @query("#items")
    itemsDom?: HTMLElement;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        if (!this.stream) {
            error("No stream set, this should not happen");
            return;
        }
        if (this.stream && this.stream.pollNew) {
            this.stream.addNewItemsListener(async (newerItems) => {
                if (newerItems instanceof Error) {
                    error("Couldn't load newer items", newerItems);
                    if (this.newItems) this.newItems(newerItems, this.stream!.items);
                    return;
                } else {
                    if (this.newItems) this.newItems(newerItems, this.stream!.items);
                }

                const itemsDom = this.itemsDom;
                if (itemsDom) {
                    const lastItemDom = itemsDom.firstElementChild as HTMLElement | null;
                    const litElements: LitElement[] = [];
                    for (const item of newerItems) {
                        const itemDom = dom(html`${this.renderItem(item)}`)[0];
                        itemDom.classList.add("animate-fade", "animate-duration-[2000ms]");
                        litElements.push(...collectLitElements(itemDom));
                        itemsDom.insertBefore(itemDom, itemsDom.firstChild);
                    }

                    const promises: Promise<boolean>[] = [];
                    for (const element of litElements) {
                        promises.push(element.updateComplete);
                    }
                    await Promise.all(promises);

                    // FIXME Could do scroll to currently visible item or some other logic
                    const scrollParent = getScrollParent(itemsDom);
                    if (scrollParent && scrollParent.scrollTop == 0) {
                        scrollParent.scrollTop = (lastItemDom?.offsetTop ?? 0) - 40;
                    }
                }
            });
        }
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
                this.error = i18n("Invalid stream"); // FIXME handle error
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
                spinner.append(dom(html`<div class="w-full h-8 flex items-center justify-center">${i18n("End of list")}</div>`)[0]);
                return;
            }

            spinner.remove();
            const itemDoms: HTMLElement[] = [];
            for (const item of items) {
                const itemDom = this.wrapItem
                    ? dom(html`<div class="px-4 py-2 border-b border-divider">${this.renderItem(item)}</div>`)[0]
                    : dom(this.renderItem(item))[0];
                itemsDom.append(itemDom);
                itemDoms.push(itemDom);
            }
            itemsDom.append(spinner);
            onVisibleOnce(itemDoms[Math.max(0, itemDoms.length - 1 - 5)], () => this.load());
        } catch (e) {
            this.error = i18n("Sorry, an unknown error occured");
        }
    }

    render() {
        if (this.error)
            return html`<div class="mt-4 py-4 flex-grow flex items-center justify-center border border-red text-red rounded-md">${this.error}</div>`;

        return html` <div id="items" class="flex flex-col">
            <loading-spinner id="spinner"></loading-spinner>
        </div>`;
    }

    abstract renderItem(item: T): TemplateResult;
}

@customElement("posts-stream-view")
export class PosStreamView extends StreamView<PostView> {
    getItemKey(item: PostView): string {
        return item.uri;
    }
    renderItem(post: PostView): TemplateResult {
        const postDom = dom(html`
            <post-view
                .post=${post}
                .quoteCallback=${(post: PostView) => quote(post)}
                .replyCallback=${(post: PostView) => reply(post)}
                .deleteCallback=${(post: PostView) => deletePost(post, postDom)}
            ></post-view>
        `)[0];
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

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        if (this.stream?.pollNew)
            this.stream?.addNewItemsListener((newItems: FeedViewPost[] | Error) => {
                if (!this.stream) return;
                if (newItems instanceof Error) {
                    // alert("Couldn't poll new items"); // FIXME show a toast instead
                    return;
                }
                if (this.newItems) {
                    this.newItems(newItems, this.stream.items);
                }
            });
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
        State.notify("unreadNotifications", "updated", 0);
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
                            ? html`<div class="border border-divider rounded p-2 mb-2">
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
            class="px-4 py-2 border-b border-divider flex flex-col ${notification.isRead ? "" : "bg-[#d8e4ff] dark:bg-[#001040]"}"
        >
            <div class="flex items-center gap-2">
                <i class="icon !w-5 !h-5">${icons[notification.reason] ?? ""}</i>
                ${renderProfile(notification.author, false)}
                <span class="ml-auto text-xs text-muted-fg">${getTimeDifference(date.getTime())}</span>
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

@customElement("generators-stream-view")
export class GeneratorsStreamView extends StreamView<GeneratorView> {
    renderItem(item: AppBskyFeedDefs.GeneratorView): TemplateResult {
        return html`<generator-view .generator=${item}></generator-view>`;
    }
}
