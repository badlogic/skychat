import {
    AppBskyEmbedExternal,
    AppBskyEmbedImages,
    AppBskyEmbedRecord,
    AppBskyEmbedRecordWithMedia,
    AppBskyFeedDefs,
    AppBskyFeedPost,
    RichText,
} from "@atproto/api";
import { ProfileViewBasic, ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { FeedViewPost, PostView, ThreadViewPost } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { LitElement, PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { map } from "lit/directives/map.js";
import { i18n } from "../i18n";
import { blockIcon, deleteIcon, heartIcon, moreIcon, muteIcon, quoteIcon, reblogIcon, replyIcon, shieldIcon } from "../icons";
import { EventAction, NumQuote, State } from "../state";
import { Store } from "../store";
import { PostLikesStream, PostRepostsStream, QuotesStream } from "../streams";
import {
    collectLitElements,
    combineAtUri,
    contentLoader,
    dom,
    error,
    getDateString,
    getTimeDifference,
    hasLinkOrButtonParent,
    spinner,
    splitAtUri,
    waitForLitElementsToRender,
} from "../utils";
import { IconToggle } from "./icontoggle";
import { HashNavOverlay, Overlay, renderTopbar } from "./overlay";
import { PopupMenu } from "./popup";
import { deletePost, quote, reply } from "./posteditor";
import { getProfileUrl, renderProfile } from "./profiles";

export function renderRichText(record: AppBskyFeedPost.Record | RichText) {
    if (!record.facets) {
        return html`<span>${record.text}</span>`;
    }

    const rt = new RichText({
        text: record.text,
        facets: record.facets as any,
    });

    const segments: TemplateResult[] = [];

    for (const segment of rt.segments()) {
        if (segment.isMention()) {
            segments.push(
                html`<a
                    class="text-primary"
                    href="https://bsky.app/profile/${segment.mention?.did}"
                    target="_blank"
                    @click=${(ev: Event) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        document.body.append(dom(html`<profile-overlay .did=${segment.mention?.did}></profile-overlay>`)[0]);
                    }}
                    >${segment.text}</a
                >`
            );
        } else if (segment.isLink()) {
            segments.push(html`<a class="text-primary" href="${segment.link?.uri}" target="_blank">${segment.text}</a>`);
        } else if (segment.isTag()) {
            segments.push(html`<span class="text-blue-500">${segment.text}</span>`);
        } else {
            segments.push(html`<span>${segment.text}</span>`);
        }
    }
    const result = html`${map(segments, (segment) => segment)}`;
    return result;
}

export function renderCardEmbed(cardEmbed: AppBskyEmbedExternal.ViewExternal | AppBskyEmbedExternal.External) {
    const thumb = typeof cardEmbed.thumb == "string" ? cardEmbed.thumb : cardEmbed.image;
    return html`<a class="overflow-x-clip mt-2 border rounded border-gray/50 flex" target="_blank" href="${cardEmbed.uri}">
        ${thumb ? html`<img src="${thumb}" class="w-[100px] object-cover" />` : nothing}
        <div class="flex flex-col p-2">
            <span class="text-gray text-xs">${new URL(cardEmbed.uri).host}</span>
            <span class="font-bold text-sm line-clamp-2">${cardEmbed.title}</span>
            <div class="text-sm line-clamp-2 break-words">${cardEmbed.description}</div>
        </div>
    </a>`;
}

export function renderImagesEmbedSmall(images: AppBskyEmbedImages.ViewImage[]) {
    return html`<div class="mt-2 flex mx-2 justify-center">
        ${map(
            images,
            (image) => html`<div class="w-1/4 relative">
                <img src="${image.thumb}" class="px-1 w-full h-[100px] object-cover" />
            </div>`
        )}
    </div>`;
}

export function renderImagesEmbed(images: AppBskyEmbedImages.ViewImage[], sensitive: boolean, minimal = false) {
    if (minimal) return renderImagesEmbedSmall(images);

    const unblur = (target: HTMLElement) => {
        if (sensitive) target.classList.toggle("blur-lg");
    };

    return html`<div class="mt-2 flex flex-col gap-2 items-center">
        ${map(images, (image) => {
            return html`<div class="relative">
                <img
                    src="${image.thumb}"
                    @click="${(ev: Event) => {
                        if (sensitive) {
                            ev.stopImmediatePropagation();
                            unblur(ev.target as HTMLElement);
                        }
                    }}"
                    alt="${image.alt}"
                    class="max-h-[40svh] rounded ${sensitive ? "blur-lg" : ""}"
                />
                ${image.alt && image.alt.length > 0
                    ? html`<button
                          @click=${() => {
                              document.body.append(dom(html`<alt-text alt=${image.alt}></alt-text>`)[0]);
                          }}
                          class="absolute bottom-2 left-2 rounded bg-black text-white p-1 text-xs"
                      >
                          ALT
                      </button>`
                    : nothing}
            </div>`;
        })}
    </div>`;
}

export function renderRecordEmbed(recordEmbed: AppBskyEmbedRecord.View) {
    // FIXME implement support for app.bsky.graph.list and app.bsky.feed.generator
    if (!AppBskyEmbedRecord.isViewRecord(recordEmbed.record)) return nothing;
    if (!AppBskyFeedPost.isRecord(recordEmbed.record.value)) return nothing;
    const record = recordEmbed.record.value;
    const rkey = splitAtUri(recordEmbed.record.uri).rkey;
    const author = recordEmbed.record.author;
    const embeds = recordEmbed.record.embeds && recordEmbed.record.embeds.length > 0 ? recordEmbed.record.embeds[0] : undefined;
    const sensitive = recordEmbed.record.labels?.some((label) => ["porn", "nudity", "sexual"].includes(label.val)) ?? false;
    return html`<div class="mt-2 border border-gray/50 rounded p-2">${renderRecord(author, rkey, record, embeds, true, sensitive)}</div>`;
}

export function renderRecordWithMediaEmbed(recordWithMediaEmbed: AppBskyEmbedRecordWithMedia.View, sensitive: boolean, minimal = false) {
    const imagesEmbed = AppBskyEmbedImages.isView(recordWithMediaEmbed.media) ? recordWithMediaEmbed.media.images : undefined;
    const cardEmbed =
        AppBskyEmbedExternal.isView(recordWithMediaEmbed.media) || AppBskyEmbedExternal.isMain(recordWithMediaEmbed.media)
            ? recordWithMediaEmbed.media.external
            : undefined;
    return html`<div class="mt-2">
        ${cardEmbed ? renderCardEmbed(cardEmbed) : nothing} ${imagesEmbed ? renderImagesEmbed(imagesEmbed, sensitive, minimal) : nothing}
        ${!minimal ? renderRecordEmbed(recordWithMediaEmbed.record) : nothing}
    </div>`;
}

export function renderEmbed(embed: PostView["embed"] | AppBskyFeedPost.Record["embed"], sensitive: boolean, minimal = false) {
    const cardEmbed = AppBskyEmbedExternal.isView(embed) || AppBskyEmbedExternal.isMain(embed) ? embed.external : undefined;
    const imagesEmbed = AppBskyEmbedImages.isView(embed) ? embed.images : undefined;
    const recordEmbed = AppBskyEmbedRecord.isView(embed) ? embed : undefined;
    const recordWithMediaEmbed = AppBskyEmbedRecordWithMedia.isView(embed) ? embed : undefined;
    return html`<div>
        ${cardEmbed ? renderCardEmbed(cardEmbed) : nothing} ${imagesEmbed ? renderImagesEmbed(imagesEmbed, sensitive, minimal) : nothing}
        ${recordEmbed && !minimal ? renderRecordEmbed(recordEmbed) : nothing}
        ${recordWithMediaEmbed ? renderRecordWithMediaEmbed(recordWithMediaEmbed, sensitive, minimal) : nothing}
    </div>`;
}

export function renderRecord(
    author: ProfileViewBasic | ProfileViewDetailed,
    rkey: string,
    record: AppBskyFeedPost.Record,
    embed: PostView["embed"] | undefined,
    smallAvatar: boolean,
    sensitive: boolean,
    prefix?: string,
    showHeader = true,
    subHeader?: TemplateResult | HTMLElement,
    showReplyto = true,
    openOnClick = true,
    shortTime = false
): TemplateResult {
    const replyToAuthorDid = record.reply ? splitAtUri(record.reply?.parent.uri).repo : undefined;
    const replyToProfile = replyToAuthorDid ? State.getObject("profile", replyToAuthorDid) : undefined;
    return html`<div
        class="${openOnClick ? "cursor-pointer" : ""}"
        @click=${(ev: Event) => {
            if (window.getSelection() && window.getSelection()?.toString().length != 0) return;
            if (!openOnClick) return;
            if (hasLinkOrButtonParent(ev.target as HTMLElement)) return;
            ev.stopPropagation();
            document.body.append(dom(html`<thread-overlay .postUri=${combineAtUri(author.did, rkey)}></thread-overlay>`)[0]);
        }}
    >
        ${showHeader
            ? html`<div class="flex items-center">
                      ${prefix ? html`<span class="mr-1 font-bold">${prefix}</span>` : nothing} ${renderProfile(author, smallAvatar)}
                      ${prefix == undefined
                          ? html`<a
                                class="self-start ml-auto text-right text-xs text-lightgray whitespace-nowrap hover:underline"
                                href="#thread/${author.did}/${rkey}"
                                target="_blank"
                                @click=${(ev: Event) => {
                                    ev.preventDefault();
                                    ev.stopPropagation();
                                    document.body.append(dom(html`<thread-overlay .postUri=${combineAtUri(author.did, rkey)}></thread-overlay>`)[0]);
                                }}
                                >${!shortTime
                                    ? getDateString(new Date(record.createdAt))
                                    : getTimeDifference(new Date(record.createdAt).getTime())}</a
                            >`
                          : nothing}
                  </div>
                  ${subHeader ? subHeader : nothing}`
            : nothing}
        ${replyToProfile && showReplyto
            ? html`<div class="mt-1 flex gap-1 text-xs items-center text-lightgray dark:text-white/60">
                  <i class="icon fill-lightgray dark:fill-white/60">${replyIcon}</i>
                  <span class="whitespace-nowrap">${i18n("Replying to")}</span>
                  <a
                      class="line-clamp-1 hover:underline"
                      href="${getProfileUrl(replyToAuthorDid ?? "")}"
                      target="_blank"
                      @click=${(ev: Event) => {
                          ev.preventDefault();
                          ev.stopPropagation();
                          document.body.append(dom(html`<profile-overlay .did=${replyToAuthorDid}></profile-overlay>`)[0]);
                      }}
                      >${replyToProfile.displayName ?? replyToProfile.handle}</a
                  >
              </div>`
            : nothing}
        <div class="mt-1 break-words whitespace-pre-wrap">${renderRichText(record)}</div>
        ${embed ? renderEmbed(embed, sensitive) : nothing}
    </div>`;
}

@customElement("post-view")
export class PostViewElement extends LitElement {
    @property()
    post?: PostView;

    @property()
    quoteCallback: (post: PostView) => void = () => {};

    @property()
    replyCallback: (post: PostView) => void = () => {};

    @property()
    deleteCallback: (post: PostView) => void = () => {};

    @property()
    animation: string = "";

    @property()
    showHeader = true;

    @property()
    subHeader?: TemplateResult | HTMLElement;

    @property()
    showReplyTo = true;

    @property()
    openOnClick = true;

    @property()
    shortTime = false;

    @property()
    unmuted = false;

    @property()
    deleted = false;

    @property()
    centerButtons = false;

    unsubscribePost: () => void = () => {};
    unsubscribeQuote: () => void = () => {};

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    connectedCallback(): void {
        super.connectedCallback();
        if (!this.post) {
            error("Can not subscribe for post updates, post not set");
            return;
        }
        this.unsubscribePost = State.subscribe("post", (action, post) => this.handlePostUpdate(action, post), this.post.uri);
        this.unsubscribeQuote = State.subscribe("numQuote", (action, quote) => this.handleQuoteUpdate(action, quote), this.post.uri);
    }

    handlePostUpdate(action: EventAction, post: PostView): void {
        if (action == "updated") {
            this.post = { ...post };
        }
        if (action == "deleted") {
            this.deleted = true;
        }
    }

    handleQuoteUpdate(action: EventAction, quote: NumQuote): void {
        if (action == "updated" && this.post) {
            this.post = { ...this.post };
        }
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this.unsubscribePost();
        this.unsubscribeQuote();
    }

    render() {
        if (!this.post || !AppBskyFeedPost.isRecord(this.post.record)) {
            return html`<div class="px-4 py-2">
                ${contentLoader}
                </div>
            </div>`;
        }

        if (this.deleted) {
            return html`<div class="bg-lightgray dark:bg-gray text-white px-4 py-2 rounded">${i18n("Deleted post")}</div>`;
        }

        if ((this.post.author.viewer?.muted || this.post.author.viewer?.mutedByList) && !this.unmuted) {
            return html`<div
                class="bg-lightgray dark:bg-gray text-white px-4 py-2 rounded flex items-center cursor-pointer"
                @click=${() => (this.unmuted = true)}
            >
                <i class="icon w-6 h-6 fill-white">${shieldIcon}</i><span class="ml-2 text-white">${i18n("Post by muted user")}</span>
                <span class="ml-2 text-xs">(${i18n("Click to view")})</span>
            </div>`;
        }

        const rkey = splitAtUri(this.post.uri)?.rkey;
        const author = this.post.author;
        return html`<div class="${this.animation} outline-none">
            ${renderRecord(
                author,
                rkey,
                this.post.record,
                this.post.embed,
                false,
                this.post.labels?.some((label) => ["porn", "sexual", "nudity"].includes(label.val)) ?? false,
                undefined,
                this.showHeader,
                this.subHeader,
                this.showReplyTo,
                this.openOnClick,
                this.shortTime
            )}
            <div class="flex items-center ${this.centerButtons ? "justify-center" : ""} gap-4 mt-2">
                <button @click=${() => this.replyCallback(this.post!)} class="flex gap-1 items-center text-gray">
                    <i class="icon w-4 h-4 fill-gray dark:fill-white/60">${replyIcon}</i
                    ><span class="text-gray dark:text-white/60">${this.post.replyCount}</span>
                </button>
                <button @click=${() => this.quoteCallback(this.post!)} class="flex gap-1 items-center text-gray">
                    <i class="icon w-4 h-4 fill-gray dark:fill-white/60">${quoteIcon}</i
                    ><span class="text-gray dark:text-white/60">${State.getObject("numQuote", this.post.uri)?.numQuotes ?? 0}</span>
                </button>
                <div class="flex gap-1 items-center text-gray">
                    <icon-toggle
                        @change=${(ev: CustomEvent) => this.toggleRepost(ev)}
                        icon="reblog"
                        class="h-4"
                        .value=${this.post.viewer?.repost ?? false}
                        .text=${"" + this.post.repostCount ?? 0}
                    ></icon-toggle>
                </div>
                <div class="flex gap-1 items-center text-gray">
                    <icon-toggle
                        @change=${(ev: CustomEvent) => this.toggleLike(ev)}
                        icon="heart"
                        class="h-4"
                        .value=${this.post.viewer?.like ?? false}
                        .text=${"" + this.post.likeCount ?? 0}
                    ></icon-toggle>
                </div>
                <post-options .post=${this.post} .handleOption=${(option: PostOptions) => this.handleOption(option)}></post-options>
            </div>
        </div>`;
    }

    handleOption(option: PostOptions) {
        if (option == "delete") {
            this.deleteCallback(this.post!);
        }
    }

    canInteract(toggle: IconToggle) {
        if (!Store.getUser()) {
            if (confirm("Do you want to log-in to repost, like, and create posts?")) {
                location.reload();
            }
            toggle.value = false;
            return false;
        } else {
            return true;
        }
    }

    async toggleRepost(ev: CustomEvent) {
        const toggle = ev.target as IconToggle;
        if (!this.canInteract(toggle)) return;
        if (!this.post) return;
        if (!this.post.viewer) this.post.viewer = {};
        if (ev.detail.value) {
            toggle.value = true;
            toggle.innerText = (Number.parseInt(toggle.innerText) + 1).toString();
            const response = await State.bskyClient!.repost(this.post.uri, this.post.cid);
            this.post.viewer.repost = response.uri;
            this.post.repostCount = this.post.repostCount ? this.post.repostCount + 1 : 1;
        } else {
            toggle.value = false;
            toggle.innerText = (Number.parseInt(toggle.innerText) - 1).toString();
            if (this.post.viewer.repost) State.bskyClient?.deleteRepost(this.post.viewer.repost);
            delete this.post.viewer.repost;
            this.post.repostCount = this.post.repostCount ? this.post.repostCount - 1 : 0;
        }
        State.notify("post", "updated", this.post);
    }

    likeUri: string | undefined;
    async toggleLike(ev: CustomEvent) {
        const toggle = ev.target as IconToggle;
        if (!this.canInteract(toggle)) return;
        if (!this.post) return;
        if (!this.post.viewer) this.post.viewer = {};
        if (ev.detail.value) {
            toggle.value = true;
            toggle.innerText = (Number.parseInt(toggle.innerText) + 1).toString();
            const response = await State.bskyClient!.like(this.post.uri, this.post.cid);
            this.post.viewer.like = response.uri;
            this.post.likeCount = this.post.likeCount ? this.post.likeCount + 1 : 1;
        } else {
            toggle.value = false;
            toggle.innerText = (Number.parseInt(toggle.innerText) - 1).toString();
            if (this.post.viewer.like) await State.bskyClient?.deleteLike(this.post.viewer.like);
            delete this.post.viewer.like;
            this.post.likeCount = this.post.likeCount ? this.post.likeCount - 1 : 0;
        }
        State.notify("post", "updated", this.post);
    }
}

@customElement("alt-text")
export class AltText extends Overlay {
    @property()
    alt: string = "";

    renderHeader(): TemplateResult {
        return html`${renderTopbar("Alt Text", this.closeButton())}`;
    }

    renderContent(): TemplateResult {
        return html`<div class="overflow-auto flex-1 whitespace-pre-wrap px-4">${this.alt}</div>`;
    }
}

type PostOptions = "likes" | "quotes" | "reposts" | "mute_user" | "mute_thread" | "block_user" | "delete";
type PostOptionsButton = { option: PostOptions; text: string; icon: TemplateResult; click: () => void; enabled: boolean };

@customElement("post-options")
export class PostOptionsElement extends PopupMenu {
    @property()
    post?: PostView;

    @property()
    handleOption: (option: "mute_user" | "mute_thread" | "block_user" | "delete") => void = () => {};

    protected renderButton(): TemplateResult {
        return html`<i slot="buttonText" class="icon w-6 h-6 fill-lightgray dark:fill-white/60">${moreIcon}</i>`;
    }

    protected renderContent(): TemplateResult {
        if (!this.post) return html`${nothing}`;
        const did = Store.getUser()?.profile.did;
        const quote = State.getObject("numQuote", this.post.uri);
        const buttons: PostOptionsButton[] = [
            {
                option: "quotes",
                text: i18n("Quotes"),
                icon: html`${quoteIcon}`,
                enabled: quote != undefined && quote.numQuotes > 0,
                click: () => {
                    document.body.append(
                        dom(html`<posts-stream-overlay title="Quotes" .stream=${new QuotesStream(this.post?.uri!)}></posts-stream-overlay>`)[0]
                    );
                    this.close();
                },
            },
            {
                option: "reposts",
                text: i18n("Reposts"),
                icon: html`${reblogIcon}`,
                enabled: (this.post.repostCount ?? 0) > 0,
                click: () => {
                    document.body.append(
                        dom(
                            html`<profiles-stream-overlay
                                title="Reposts"
                                .hash=${`reposts/${this.post?.author.did}/${this.post ? splitAtUri(this.post.uri).rkey : undefined}`}
                                .stream=${new PostRepostsStream(this.post?.uri!)}
                            ></profile-stream-overlay>`
                        )[0]
                    );
                    this.close();
                },
            },
            {
                option: "likes",
                text: i18n("Likes"),
                icon: html`${heartIcon}`,
                enabled: (this.post.likeCount ?? 0) > 0,
                click: () => {
                    document.body.append(
                        dom(
                            html`<profiles-stream-overlay
                                title="Likes"
                                .hash=${`likes/${this.post?.author.did}/${this.post ? splitAtUri(this.post.uri).rkey : undefined}`}
                                .stream=${new PostLikesStream(this.post?.uri!)}
                            ></profiles-stream-overlay>`
                        )[0]
                    );
                    this.close();
                },
            },
            {
                option: "mute_thread",
                text: i18n("Mute Thread"),
                icon: html`${muteIcon}`,
                enabled: true,
                click: () => {
                    this.handleOption("mute_thread");
                    this.close();
                },
            },
            {
                option: "mute_user",
                text: i18n("Mute User"),
                icon: html`${muteIcon}`,
                enabled: did != this.post.author.did,
                click: () => {
                    this.handleOption("mute_user");
                    this.close();
                },
            },
            {
                option: "block_user",
                text: i18n("Block User"),
                icon: html`${blockIcon}`,
                enabled: did != this.post.author.did,
                click: () => {
                    this.handleOption("block_user");
                    this.close();
                },
            },
            {
                option: "delete",
                text: i18n("Delete Post"),
                icon: html`${deleteIcon}`,
                enabled: did != undefined && this.post.uri.includes(did),
                click: () => {
                    this.handleOption("delete");
                    this.close();
                },
            },
        ];

        const renderButton = (button: PostOptionsButton) => {
            if (!button.enabled) return html``;
            return html`<button
                class="px-4 h-10 hover:bg-primary hover:text-white hover:fill-white flex items-center gap-4"
                @click=${() => button.click()}
            >
                <i class="icon w-6 h-6 fill-black dark:fill-white">${button.icon}</i>
                <span class="flex-grow text-left">${button.text}</span>
            </button>`;
        };

        return html` ${map(buttons, (button, index) => renderButton(button))}`;
    }
}

@customElement("thread-view-post")
export class ThreadViewPostElement extends LitElement {
    @property()
    highlightUri = "";

    @property()
    isRoot = false;

    @property()
    thread?: ThreadViewPost;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        const thread = this.thread;
        if (!AppBskyFeedDefs.isThreadViewPost(thread)) {
            return dom(html``)[0];
        }
        const uri = this.highlightUri;
        const isRoot = this.isRoot;

        const animation = "animate-shake animate-delay-500";
        const insertNewPost = (post: PostView, repliesDom: HTMLElement) => {
            const newPost = dom(html`<div class="min-w-[350px] mb-2 pl-2 border-l border-primary ${animation}">
                <post-view
                    .post=${post}
                    .quoteCallback=${(post: PostView) => quote(post)}
                    .replyCallback=${(post: PostView) => reply(post, newPost.querySelector("#replies")!)}
                    .deleteCallback=${(post: PostView) => deletePost(post, newPost)}
                    .showReplyTo=${false}
                    .openOnClick=${false}
                    .shortTime=${true}
                ></post-view>
                <div id="replies" class="${isRoot ? "ml-2" : "ml-4"}"></div>
            </div>`)[0];
            if (repliesDom.children.length > 0) {
                repliesDom.children[0].before(newPost);
            } else {
                repliesDom.append(newPost);
            }
            setTimeout(() => {
                newPost.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 500);
        };

        const reply = (post: PostView, repliesDom: HTMLElement) => {
            document.body.append(
                dom(html`<post-editor-overlay .replyTo=${post} .sent=${(post: PostView) => insertNewPost(post, repliesDom)}></post-editor-overly>`)[0]
            );
        };

        const postDom = dom(html`<div>
            ${AppBskyFeedDefs.isNotFoundPost(thread.parent)
                ? html`<div class="bg-lightgray dark:bg-gray text-white px-4 py-2 mb-2 rounded">${i18n("Deleted post")}</div>`
                : nothing}
            <div
                class="${thread.post.uri == uri ? animation : ""} min-w-[350px] mb-2 ${!isRoot || (thread.post.uri == uri && isRoot)
                    ? "pl-2"
                    : ""} ${thread.post.uri == uri ? "border-l border-primary" : ""}"
            >
                <post-view
                    .post=${thread.post}
                    .quoteCallback=${(post: PostView) => quote(post)}
                    .replyCallback=${(post: PostView) => reply(post, repliesDom)}
                    .deleteCallback=${(post: PostView) => deletePost(post, postDom)}
                    .showReplyTo=${false}
                    .openOnClick=${false}
                    .shortTime=${true}
                ></post-view>
            </div>
            <div id="replies" class="${isRoot ? "ml-2" : "ml-4"}">
                ${map(thread.replies, (reply) => {
                    if (!AppBskyFeedDefs.isThreadViewPost(reply)) return html``;
                    return html`<div class="border-l border-gray/20">
                        <thread-view-post .highlightUri=${this.highlightUri} .isRoot=${false} .thread=${reply}></thread-view-post>
                    </div>`;
                })}
            </div>
        </div>`)[0];
        const repliesDom = postDom.querySelector("#replies") as HTMLElement;
        if (thread.post.uri == uri) {
            waitForLitElementsToRender(postDom).then(() => {
                const postViewDom = postDom.querySelector("post-view");
                postViewDom?.scrollIntoView({ behavior: "smooth", block: "center" });
            });
        }
        return postDom;
    }
}

@customElement("thread-overlay")
export class ThreadOverlay extends HashNavOverlay {
    @property()
    postUri?: string;

    @state()
    isLoading = true;

    @state()
    error?: string;

    @state()
    thread?: ThreadViewPost;

    constructor() {
        super();
    }

    getHash(): string {
        const atUri = this.postUri ? splitAtUri(this.postUri) : undefined;
        return atUri ? "thread/" + atUri.repo + "/" + atUri.rkey : "thread/unknown/unknown";
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.load();
    }

    async load() {
        const notFoundMessage = i18n("Thread not found. The post may have been deleted, or you were blocked by the user.");
        try {
            if (!State.bskyClient) {
                this.error = i18n("Not connected");
                return;
            }
            if (!this.postUri) {
                this.error = notFoundMessage;
                return;
            }
            let uri = this.postUri;
            const postResponse = await State.bskyClient.getPostThread({ uri });
            if (!postResponse.success) {
                this.error = notFoundMessage;
                return;
            }
            if (postResponse.data.thread.blocked) {
                this.error = i18n("You have blocked the author or the author has blocked you.");
                return;
            }
            if (postResponse.data.thread.notFound) {
                this.error = notFoundMessage;
                return;
            }
            if (!AppBskyFeedDefs.isThreadViewPost(postResponse.data.thread)) {
                this.error = notFoundMessage;
                return;
            }

            if (AppBskyFeedDefs.isNotFoundPost(postResponse.data.thread.parent)) {
                this.thread = postResponse.data.thread;
                return;
            }

            const post = postResponse.data.thread.post;
            if (AppBskyFeedPost.isRecord(post.record) && post.record.reply) {
                uri = post.record.reply.root.uri;
            }

            // FIXME go through State instead
            const response = await State.bskyClient.getPostThread({
                depth: 1000,
                parentHeight: 1000,
                uri,
            });
            if (!response.success) {
                this.error = notFoundMessage;
                return;
            }
            if (!AppBskyFeedDefs.isThreadViewPost(response.data.thread)) {
                this.error = notFoundMessage;
                return;
            }
            const postUris: string[] = [];
            const collectPostUris = (post: ThreadViewPost) => {
                postUris.push(post.post.uri);
                if (post.replies) {
                    for (const reply of post.replies) {
                        if (AppBskyFeedDefs.isThreadViewPost(reply)) collectPostUris(reply);
                    }
                }
            };
            collectPostUris(response.data.thread);
            await State.getNumQuotes(postUris);
            this.thread = response.data.thread;
        } catch (e) {
            this.error = notFoundMessage;
            return;
        } finally {
            this.isLoading = false;
        }
    }

    renderHeader() {
        return html`${renderTopbar("Thread", this.closeButton())}`;
    }

    renderContent() {
        // FIXME threads to test sorting and view modes with
        // http://localhost:8080/#thread/did:plc:k3a6s3ac4unrst44te7fd62m/3k7ths5azkx2z
        return html`<div class="px-4">
            ${this.isLoading ? html`<div>${spinner}</div>` : nothing} ${this.error ? html`<div>${this.error}</div>` : nothing}
            ${this.thread
                ? html`<thread-view-post .highlightUri=${this.postUri} .isRoot=${true} .thread=${this.thread}></thread-view-post>`
                : nothing}
        </div>`;
    }
}

@customElement("feed-view-post-view")
export class FeewViewPostElement extends LitElement {
    @property()
    feedViewPost?: FeedViewPost;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        if (!this.feedViewPost) return html`${nothing}`;
        const feedViewPost = this.feedViewPost;
        const repostedBy = AppBskyFeedDefs.isReasonRepost(feedViewPost.reason)
            ? html`<div class="mb-1 flex items-center gap-2 text-lightgray dark:text-white/60 text-xs"><i class="icon w-4 h-4 fill-gray dark:fill-white/60">${reblogIcon}</i><a class="hover:underline truncate" href="${getProfileUrl(
                  feedViewPost.reason.by
              )}" @click=${(ev: Event) => {
                  if (!AppBskyFeedDefs.isReasonRepost(feedViewPost.reason)) return;
                  ev.preventDefault();
                  ev.stopPropagation();
                  document.body.append(dom(html`<profile-overlay .did=${feedViewPost.reason.by.did}></profile-overlay>`)[0]);
              }}>${feedViewPost.reason.by.displayName ?? feedViewPost.reason.by.handle}</div>`
            : nothing;

        let postDom: HTMLElement;
        if (!feedViewPost.reply || AppBskyFeedDefs.isReasonRepost(feedViewPost.reason)) {
            postDom = dom(html`<div>
                ${repostedBy}
                <post-view
                    .post=${feedViewPost.post}
                    .quoteCallback=${(post: PostView) => quote(post)}
                    .replyCallback=${(post: PostView) => reply(post)}
                    .deleteCallback=${(post: PostView) => deletePost(post, postDom)}
                    .shortTime=${true}
                ></post-view>
            </div>`)[0];
        } else {
            const parentDom = dom(html`<post-view
                .post=${feedViewPost.reply.parent}
                .quoteCallback=${(post: PostView) => quote(post)}
                .replyCallback=${(post: PostView) => reply(post)}
                .deleteCallback=${(post: PostView) => deletePost(post, parentDom)}
                .shortTime=${true}
            ></post-view>`)[0];
            postDom = dom(html`<div class="ml-2 pl-2 mt-2 border-l border-l-primary">
                <post-view
                    .post=${feedViewPost.post}
                    .quoteCallback=${(post: PostView) => quote(post)}
                    .replyCallback=${(post: PostView) => reply(post)}
                    .deleteCallback=${(post: PostView) => deletePost(post, postDom)}
                    .showReplyTo=${false}
                    .shortTime=${true}
                ></post-view>
            </div>`)[0];
            postDom = dom(html`<div class="flex flex-col">${repostedBy}${parentDom}${postDom}</div>`)[0];
        }
        return html`<div class="px-4 py-2 border-t border-gray/20">${postDom}</div>`;
    }
}
