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
import { PostView, ThreadViewPost } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { LitElement, PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { map } from "lit/directives/map.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { bskyClient } from "../bsky";
import { moreIcon, quoteIcon, replyIcon } from "../icons";
import { cacheQuotes, profileCache, quotesCache } from "../cache";
import { Store } from "../store";
import {
    combineAtUri,
    contentLoader,
    dom,
    getDateString,
    getProfileUrl,
    getTimeDifference,
    hasLinkOrButtonParent,
    renderAuthor,
    splitAtUri,
} from "../utils";
import { IconToggle } from "./icontoggle";
import { PopupMenu } from "./popup";
import { likesLoader, repostLoader } from "./profile";
import { HashNavOverlay, Overlay, renderTopbar } from "./overlay";
import { quotesLoader } from "./feed";
import { i18n } from "../i18n";

export function renderPostText(record: AppBskyFeedPost.Record) {
    if (!record.facets) {
        return record.text;
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
                        if (!bskyClient) return;
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
            segments.push(html`${unsafeHTML(segment.text)}`);
        }
    }
    const result = html`${map(segments, (segment) => segment)}`;
    return result;
}

export function renderCardEmbed(cardEmbed: AppBskyEmbedExternal.ViewExternal | AppBskyEmbedExternal.External) {
    const thumb = typeof cardEmbed.thumb == "string" ? cardEmbed.thumb : cardEmbed.image;
    return html`<a class="w-full border rounded border-gray/50 flex mb-2" target="_blank" href="${cardEmbed.uri}">
        ${thumb ? html`<img src="${thumb}" class="rounded-l w-[100px] object-cover" />` : nothing}
        <div class="flex flex-col p-2 w-full">
            <span class="text-gray text-xs">${new URL(cardEmbed.uri).host}</span>
            <span class="font-bold text-sm">${cardEmbed.title}</span>
            <div class="text-sm line-clamp-2 break-any">${cardEmbed.description}</div>
        </div>
    </a>`;
}

export function renderImagesEmbedSmall(images: AppBskyEmbedImages.ViewImage[]) {
    return html`<div class="flex mx-2 justify-center">
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

    return html`<div class="flex flex-col gap-2 items-center">
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
    if (!AppBskyEmbedRecord.isViewRecord(recordEmbed.record)) return nothing;
    if (!AppBskyFeedPost.isRecord(recordEmbed.record.value)) return nothing;
    const record = recordEmbed.record.value;
    const rkey = splitAtUri(recordEmbed.record.uri).rkey;
    const author = recordEmbed.record.author;
    const embeds = recordEmbed.record.embeds && recordEmbed.record.embeds.length > 0 ? recordEmbed.record.embeds[0] : undefined;
    const sensitive = recordEmbed.record.labels?.some((label) => ["porn", "nudity", "sexual"].includes(label.val)) ?? false;
    return html`<div class="border border-gray/50 rounded p-2">${renderRecord(author, rkey, record, embeds, true, sensitive)}</div>`;
}

export function renderRecordWithMediaEmbed(recordWithMediaEmbed: AppBskyEmbedRecordWithMedia.View, sensitive: boolean, minimal = false) {
    const imagesEmbed = AppBskyEmbedImages.isView(recordWithMediaEmbed.media) ? recordWithMediaEmbed.media.images : undefined;
    const cardEmbed =
        AppBskyEmbedExternal.isView(recordWithMediaEmbed.media) || AppBskyEmbedExternal.isMain(recordWithMediaEmbed.media)
            ? recordWithMediaEmbed.media.external
            : undefined;
    return html`<div class="mt-1">
        ${cardEmbed ? renderCardEmbed(cardEmbed) : nothing} ${imagesEmbed ? renderImagesEmbed(imagesEmbed, sensitive, minimal) : nothing}
        ${!minimal ? renderRecordEmbed(recordWithMediaEmbed.record) : nothing}
    </div>`;
}

export function renderEmbed(embed: PostView["embed"] | AppBskyFeedPost.Record["embed"], sensitive: boolean, minimal = false) {
    const cardEmbed = AppBskyEmbedExternal.isView(embed) || AppBskyEmbedExternal.isMain(embed) ? embed.external : undefined;
    const imagesEmbed = AppBskyEmbedImages.isView(embed) ? embed.images : undefined;
    const recordEmbed = AppBskyEmbedRecord.isView(embed) ? embed : undefined;
    const recordWithMediaEmbed = AppBskyEmbedRecordWithMedia.isView(embed) ? embed : undefined;
    return html`<div class="mt-1">
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
    const replyToProfile = replyToAuthorDid ? profileCache[replyToAuthorDid] : undefined;
    return html`<div
        class="w-full h-full ${openOnClick ? "cursor-pointer" : ""}"
        @click=${(ev: Event) => {
            if (!openOnClick) return;
            if (!bskyClient) return;
            if (hasLinkOrButtonParent(ev.target as HTMLElement)) return;
            ev.stopPropagation();
            document.body.append(dom(html`<thread-overlay .postUri=${combineAtUri(author.did, rkey)}></thread-overlay>`)[0]);
        }}
    >
        ${showHeader
            ? html`<div class="w-full flex items-center gap-2">
                      ${prefix ? html`<span class="mr-1 font-bold">${prefix}</span>` : nothing} ${renderAuthor(author, smallAvatar)}
                      ${prefix == undefined
                          ? html`<a
                                class="${shortTime ? "" : "ml-auto"} text-right text-xs text-gray whitespace-nowrap hover:underline"
                                href="https://bsky.app/profile/${author.did}/post/${rkey}"
                                target="_blank"
                                @click=${(ev: Event) => {
                                    if (!bskyClient) return;
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
            ? html`<div class="flex gap-1 text-xs items-center text-gray dark:text-lightgray">
                  <i class="icon fill-gray dark:fill-lightgray">${replyIcon}</i>
                  <span>${i18n("Replying to")}</span>
                  <a class="line-clamp-1 hover:underline" href="${getProfileUrl(replyToAuthorDid ?? "")}" target="_blank"
                      >${replyToProfile.displayName ?? replyToProfile.handle}</a
                  >
              </div>`
            : nothing}
        <div class="mt-1 break-words leading-tight whitespace-pre-wrap">${renderPostText(record)}</div>
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

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        if (!this.post || !AppBskyFeedPost.isRecord(this.post.record)) {
            return html`<div class="px-4 py-2">
                ${contentLoader}
                </div>
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
            <div class="flex items-center gap-4 mt-1">
                <button @click=${() => this.replyCallback(this.post!)} class="flex gap-1 items-center text-gray">
                    <i class="icon w-[1.2em] h-[1.2em] fill-gray">${replyIcon}</i><span class="text-gray">${this.post.replyCount}</span>
                </button>
                <button @click=${() => this.quoteCallback(this.post!)} class="flex gap-1 items-center text-gray">
                    <i class="icon w-[1.2em] h-[1.2em] fill-gray">${quoteIcon}</i><span class="text-gray">${quotesCache[this.post.uri] ?? 0}</span>
                </button>
                <div class="flex gap-1 items-center text-gray">
                    <icon-toggle @change=${this.toggleRepost} icon="reblog" class="h-4" .value=${this.post.viewer?.repost ?? false}
                        >${this.post.repostCount ?? 0}</icon-toggle
                    >
                </div>
                <div class="flex gap-1 items-center text-gray">
                    <icon-toggle @change=${this.toggleLike} icon="heart" class="h-4" .value=${this.post.viewer?.like ?? false}
                        >${this.post.likeCount ?? 0}</icon-toggle
                    >
                </div>
                <post-options
                    class="${this.shortTime ? "" : "ml-auto"}"
                    .post=${this.post}
                    .handleOption=${(option: PostOptions) => this.handleOption(option)}
                ></post-options>
            </div>
        </div>`;
    }

    handleOption(option: PostOptions) {
        if (option == "delete") {
            this.deleteCallback(this.post!);
        }
    }

    canInteract(toggle: IconToggle) {
        if (bskyClient?.service.toString().includes("api")) {
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
            const response = await bskyClient!.repost(this.post.uri, this.post.cid);
            this.post.viewer.repost = response.uri;
        } else {
            toggle.value = false;
            toggle.innerText = (Number.parseInt(toggle.innerText) - 1).toString();
            if (this.post.viewer.repost) bskyClient?.deleteRepost(this.post.viewer.repost);
            this.post.viewer.repost = undefined;
        }
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
            const response = await bskyClient!.like(this.post.uri, this.post.cid);
            this.post.viewer.like = response.uri;
        } else {
            toggle.value = false;
            toggle.innerText = (Number.parseInt(toggle.innerText) - 1).toString();
            if (this.post.viewer.like) await bskyClient?.deleteLike(this.post.viewer.like);
            this.post.viewer.like = undefined;
        }
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
        return html`<div class="overflow-auto flex-1 whitespace-pre-wrap">${this.alt}</div>`;
    }
}

type PostOptions = "delete" | "likes" | "quotes" | "reposts" | "mute";

@customElement("post-options")
export class PostOptionsElement extends PopupMenu {
    @property()
    post?: PostView;

    @property()
    handleOption: (option: PostOptions) => void = () => {};

    protected renderButton(): TemplateResult {
        return html`<i slot="buttonText" class="icon w-[1.2em] h-[1.2em] fill-gray">${moreIcon}</i>`;
    }

    protected renderContent(): TemplateResult {
        const did = Store.getUser()?.profile.did;
        let options: PostOptions[] = ["quotes", "reposts", "likes", "mute"];
        const labels = ["Show Quotes", "Show Reposts", "Show Likes", "Mute Thread"];
        return html` ${map(
            options,
            (option, index) => html`<button class="border-b border-gray/50 py-2 px-2 hover:bg-primary" @click=${() => this._handleOption(option)}>
                ${labels[index]}
            </button>`
        )}
        ${did && this.post?.uri.includes(did)
            ? html`<button
                  class="border-b border-gray/50 py-2 px-2 hover:bg-primary"
                  @click=${() => {
                      this.handleOption("delete");
                      this.close();
                  }}
              >
                  Delete Post
              </button>`
            : nothing}`;
    }

    async _handleOption(option: PostOptions) {
        switch (option) {
            case "delete":
                break;
            case "likes":
                document.body.append(
                    dom(
                        html`<profile-list-overlay
                            title="Likes"
                            .hash=${`likes/${this.post?.author.did}/${this.post ? splitAtUri(this.post.uri).rkey : undefined}`}
                            .loader=${likesLoader(this.post?.uri)}
                        ></profile-list-overlay>`
                    )[0]
                );
                break;
            case "quotes":
                document.body.append(
                    dom(html`<skychat-feed-overlay title="Quotes" .feedLoader=${quotesLoader(this.post?.uri!)}></skychat-feed-overlay>`)[0]
                );
                break;
            case "reposts":
                document.body.append(
                    dom(
                        html`<profile-list-overlay
                            title="Reposts"
                            .hash=${`reposts/${this.post?.author.did}/${this.post ? splitAtUri(this.post.uri).rkey : undefined}`}
                            .loader=${repostLoader(this.post?.uri)}
                        ></profile-list-overlay>`
                    )[0]
                );
                break;
            case "mute":
                break;
        }
        this.handleOption(option);
        this.close();
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
            if (!bskyClient) {
                this.error = i18n("Not connected");
                return;
            }
            if (!this.postUri) {
                this.error = notFoundMessage;
                return;
            }
            let uri = this.postUri;
            const postResponse = await bskyClient.getPostThread({ uri });
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

            const response = await bskyClient.getPostThread({
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
            await cacheQuotes(bskyClient, postUris);
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
        return html`<div class="px-4">
            ${this.isLoading ? html`<div>${contentLoader}</div>` : nothing} ${this.error ? html`<div>${this.error}</div>` : nothing}
            ${this.thread ? this.renderThreadPost(this.thread) : nothing}
        </div>`;
    }

    renderThreadPost(thread: ThreadViewPost, isRoot = true): HTMLElement {
        if (!AppBskyFeedDefs.isThreadViewPost(thread)) {
            return dom(html``)[0];
        }
        let uri = this.postUri;

        const animation = "animate-shake animate-delay-500";
        const insertNewPost = (post: PostView, repliesDom: HTMLElement) => {
            const newPost = dom(html`<div class="min-w-[250px] mb-2 pl-2 border-l border-primary ${animation}">
                <post-view
                    .post=${post}
                    .quoteCallback=${(post: PostView) => quote(post, newPost.querySelector("#replies")!)}
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

        const quote = (post: PostView, repliesDom: HTMLElement) => {
            document.body.append(dom(html`<post-editor-overlay .quote=${post}></post-editor-overly>`)[0]);
        };

        const reply = (post: PostView, repliesDom: HTMLElement) => {
            document.body.append(
                dom(html`<post-editor-overlay .replyTo=${post} .sent=${(post: PostView) => insertNewPost(post, repliesDom)}></post-editor-overly>`)[0]
            );
        };

        const deletePost = async (post: PostView, postDom: HTMLElement) => {
            if (!bskyClient) return;
            try {
                await bskyClient.deletePost(post.uri);
            } catch (e) {
                console.error("Couldn't delete post.", e);
                alert(i18n("Couldn't delete post"));
            }
            postDom.remove();
        };

        const postDom = dom(html`<div>
            ${AppBskyFeedDefs.isNotFoundPost(thread.parent)
                ? html`<div class="bg-lightgray text-white px-4 py-2 mb-2 rounded">${i18n("Deleted post")}</div>`
                : nothing}
            <div
                class="${thread.post.uri == uri ? animation : ""} min-w-[250px] mb-2 ${!isRoot || (thread.post.uri == uri && isRoot)
                    ? "pl-2"
                    : ""} ${thread.post.uri == uri ? "border-l border-primary" : ""}"
            >
                <post-view
                    .post=${thread.post}
                    .quoteCallback=${(post: PostView) => quote(post, repliesDom)}
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
                    return html`<div class="border-l border-dashed border-gray/20">${this.renderThreadPost(reply, false)}</div>`;
                })}
            </div>
        </div>`)[0];
        const repliesDom = postDom.querySelector("#replies") as HTMLElement;
        if (thread.post.uri == uri) {
            setTimeout(() => {
                const postViewDom = postDom.querySelector("post-view");
                postViewDom?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 500);
        }
        return postDom;
    }
}
