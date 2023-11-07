import {
    AppBskyEmbedExternal,
    AppBskyEmbedImages,
    AppBskyEmbedRecord,
    AppBskyEmbedRecordWithMedia,
    AppBskyFeedDefs,
    AppBskyFeedPost,
    BskyAgent,
} from "@atproto/api";
import { ProfileViewBasic, ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { LitElement, TemplateResult, html, nothing, svg } from "lit";
import { customElement, property } from "lit/decorators.js";
import { map } from "lit/directives/map.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { processText } from "../bsky";
import { quoteIcon, replyIcon } from "../icons";
import { profileCache } from "../profilecache";
import { contentLoader, dom, getDateString, getProfileUrl, getTimeDifference, renderAuthor } from "../utils";
import { CloseableElement } from "./closable";
import { IconToggle } from "./icontoggle";

export function renderCardEmbed(cardEmbed: AppBskyEmbedExternal.ViewExternal | AppBskyEmbedExternal.External) {
    const thumb = typeof cardEmbed.thumb == "string" ? cardEmbed.thumb : cardEmbed.image;
    return html`<a class="w-full border rounded border-gray/50 flex mb-2" target="_blank" href="${cardEmbed.uri}">
        ${thumb ? html`<img src="${thumb}" class="rounded-l w-[100px] object-cover" />` : nothing}
        <div class="flex flex-col p-2 w-full">
            <span class="text-gray text-xs">${new URL(cardEmbed.uri).host}</span>
            <span class="font-bold text-sm">${cardEmbed.title}</span>
            <div class="text-sm line-clamp-2">${cardEmbed.description}</div>
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

    return html`<div class="flex flex-col gap-2 items-center mb-2">
        ${map(images, (image) => {
            return html`<div class="relative">
                <img
                    src="${image.thumb}"
                    @click="${(ev: Event) => unblur(ev.target as HTMLElement)}"
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
    const rkey = recordEmbed.record.uri.replace("at://", "").split("/")[2];
    const author = recordEmbed.record.author;
    const postUrl = `${getProfileUrl(author)}/post/${rkey}`;
    const embeds = recordEmbed.record.embeds && recordEmbed.record.embeds.length > 0 ? recordEmbed.record.embeds[0] : undefined;
    const sensitive = recordEmbed.record.labels?.some((label) => ["porn", "nudity", "sexual"].includes(label.val)) ?? false;
    return html`<div class="border border-gray/50 rounded p-2 mb-2">${renderRecord(postUrl, author, record, embeds, true, sensitive)}</div>`;
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

export function renderEmbed(embed: AppBskyFeedDefs.PostView["embed"] | AppBskyFeedPost.Record["embed"], sensitive: boolean, minimal = false) {
    const cardEmbed = AppBskyEmbedExternal.isView(embed) || AppBskyEmbedExternal.isMain(embed) ? embed.external : undefined;
    const imagesEmbed = AppBskyEmbedImages.isView(embed) ? embed.images : undefined;
    const recordEmbed = AppBskyEmbedRecord.isView(embed) ? embed : undefined;
    const recordWithMediaEmbed = AppBskyEmbedRecordWithMedia.isView(embed) ? embed : undefined;
    return html`<div class="mt-2">
        ${cardEmbed ? renderCardEmbed(cardEmbed) : nothing} ${imagesEmbed ? renderImagesEmbed(imagesEmbed, sensitive, minimal) : nothing}
        ${recordEmbed && !minimal ? renderRecordEmbed(recordEmbed) : nothing}
        ${recordWithMediaEmbed ? renderRecordWithMediaEmbed(recordWithMediaEmbed, sensitive, minimal) : nothing}
    </div>`;
}

export function renderRecord(
    postUrl: string,
    author: ProfileViewBasic | ProfileViewDetailed,
    record: AppBskyFeedPost.Record,
    embed: AppBskyFeedDefs.PostView["embed"] | undefined,
    smallAvatar: boolean,
    sensitive: boolean,
    prefix?: string,
    showHeader = true,
    subHeader?: TemplateResult | HTMLElement
): TemplateResult {
    const replyToAuthorDid = record.reply?.parent.uri.replace("at://", "").split("/")[0];
    const replyToProfile = replyToAuthorDid ? profileCache[replyToAuthorDid] : undefined;
    return html` ${showHeader
            ? html`<div class="w-full flex items-center gap-2">
                      ${prefix ? html`<span class="mr-1 font-bold">${prefix}</span>` : nothing} ${renderAuthor(author, smallAvatar)}
                      ${prefix == undefined
                          ? html`<a class="flex-1 text-right text-xs text-gray whitespace-nowrap hover:underline" href="${postUrl}" target="_blank"
                                >${getDateString(new Date(record.createdAt))}</a
                            >`
                          : nothing}
                  </div>
                  ${subHeader ? subHeader : nothing}`
            : nothing}
        ${replyToProfile
            ? html`<div class="flex gap-1 text-xs items-center text-lightgray">
                  <i class="icon fill-lightgray">${replyIcon}</i>
                  <span>Replying to</span>
                  <a class="line-clamp-1 hover:underline" href="${getProfileUrl(replyToAuthorDid ?? "")}" target="_blank"
                      >${replyToProfile.displayName ?? replyToProfile.handle}</a
                  >
              </div>`
            : nothing}
        <div class="mt-1 break-words leading-tight">${unsafeHTML(processText(record))}</div>
        ${embed ? renderEmbed(embed, sensitive) : nothing}`;
}

@customElement("post-view")
export class PostViewElement extends LitElement {
    @property()
    bskyClient?: BskyAgent;

    @property()
    post?: AppBskyFeedDefs.PostView;

    @property()
    quoteCallback: (post: AppBskyFeedDefs.PostView) => void = () => {};

    @property()
    replyCallback: (post: AppBskyFeedDefs.PostView) => void = () => {};

    @property()
    animation: string = "";

    @property()
    showHeader = true;

    @property()
    subHeader?: TemplateResult | HTMLElement;

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

        const rkey = this.post.uri.replace("at://", "").split("/")[2];
        const author = this.post.author;
        const postUrl = `https://bsky.app/profile/${author.did}/post/${rkey}`;
        return html`<div class="${this.animation} px-4 py-2">
            ${renderRecord(
                postUrl,
                author,
                this.post.record,
                this.post.embed,
                false,
                this.post.labels?.some((label) => ["porn", "sexual", "nudity"].includes(label.val)) ?? false,
                undefined,
                this.showHeader,
                this.subHeader
            )}
            <div class="flex items-center gap-4 mt-1">
                <button @click=${this.reply} class="flex gap-1 items-center text-gray">
                    <i class="icon w-[1.2em] h-[1.2em] fill-gray">${replyIcon}</i><span class="text-gray">${this.post.replyCount}</span>
                </button>
                <button @click=${this.quote} class="flex gap-1 items-center text-gray">
                    <i class="icon w-[1.2em] h-[1.2em] fill-gray">${quoteIcon}</i>
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
            </div>
        </div>`;
    }

    canInteract(toggle: IconToggle) {
        if (this.bskyClient?.service.toString().includes("api")) {
            if (confirm("Do you want to log-in to repost, like, and create posts?")) {
                location.reload();
            }
            toggle.value = false;
            return false;
        } else {
            return true;
        }
    }

    async quote(ev: CustomEvent) {
        this.quoteCallback(this.post!);
    }

    async reply(ev: CustomEvent) {
        this.replyCallback(this.post!);
    }

    async toggleRepost(ev: CustomEvent) {
        const toggle = ev.target as IconToggle;
        if (!this.canInteract(toggle)) return;
        if (!this.post) return;
        if (!this.post.viewer) this.post.viewer = {};
        if (ev.detail.value) {
            toggle.value = true;
            toggle.innerText = (Number.parseInt(toggle.innerText) + 1).toString();
            const response = await this.bskyClient!.repost(this.post.uri, this.post.cid);
            this.post.viewer.repost = response.uri;
        } else {
            toggle.value = false;
            toggle.innerText = (Number.parseInt(toggle.innerText) - 1).toString();
            if (this.post.viewer.repost) this.bskyClient?.deleteRepost(this.post.viewer.repost);
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
            const response = await this.bskyClient!.like(this.post.uri, this.post.cid);
            this.post.viewer.like = response.uri;
        } else {
            toggle.value = false;
            toggle.innerText = (Number.parseInt(toggle.innerText) - 1).toString();
            if (this.post.viewer.like) await this.bskyClient?.deleteLike(this.post.viewer.like);
            this.post.viewer.like = undefined;
        }
    }
}

@customElement("alt-text")
export class AltText extends CloseableElement {
    @property()
    alt?: string;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        const alt = this.alt ? this.alt : "";
        return html`<div @click=${() => this.close()} class="fixed top-0 left-0 w-full h-full z-[1000] bg-white dark:bg-black">
            <div class="mx-auto max-w-[600px] h-full flex flex-col p-4 gap-2">
                <div class="flex items-center">
                    <h1 class="text-lg text-primary font-bold">Alt text</h1>
                    <button class="ml-auto bg-primary text-white px-2 py-1 rounded disabled:bg-gray/70 disabled:text-white/70">Close</button>
                </div>
                <div class="overflow-auto flex-1 whitespace-pre-wrap">${alt}</div>
            </div>
        </div>`;
    }
}
