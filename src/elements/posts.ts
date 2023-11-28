import {
    AppBskyEmbedExternal,
    AppBskyEmbedImages,
    AppBskyEmbedRecord,
    AppBskyEmbedRecordWithMedia,
    AppBskyFeedDefs,
    AppBskyFeedGetPostThread,
    AppBskyFeedPost,
    AppBskyGraphDefs,
    RichText,
} from "@atproto/api";
import { ProfileView, ProfileViewBasic, ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { BlockedPost, FeedViewPost, GeneratorView, NotFoundPost, PostView, ThreadViewPost } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { LitElement, PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { map } from "lit/directives/map.js";
import { date } from "../bsky";
import { i18n } from "../i18n";
import {
    arrowLeftIcon,
    arrowRightIcon,
    articleIcon,
    blockIcon,
    cloudIcon,
    deleteIcon,
    downloadIcon,
    heartFilledIcon,
    heartIcon,
    moreIcon,
    muteIcon,
    quoteIcon,
    reblogIcon,
    replyIcon,
    shieldIcon,
    treeIcon,
} from "../icons";
import { EventAction, NumQuote, State } from "../state";
import { Store } from "../store";
import { PostLikesStream, PostRepostsStream, QuotesStream } from "../streams";
import {
    ImageInfo,
    combineAtUri,
    copyTextToClipboard,
    dom,
    downloadImageAsFile,
    enableYoutubeJSApi,
    error,
    fetchApi,
    getTimeDifference,
    hasLinkOrButtonParent,
    itemPlaceholder,
    onVisibilityChange,
    splitAtUri,
    waitForLitElementsToRender,
    waitForScrollHeightUnchanged,
    youtubePlaYButton,
} from "../utils";
import { IconToggle } from "./icontoggle";
import { CloseableElement, HashNavOverlay, Overlay, renderTopbar, waitForOverlayClosed } from "./overlay";
import { PopupMenu } from "./popup";
import { deletePost, quote, reply } from "./posteditor";
import { getProfileUrl, renderProfile, renderProfileAvatar } from "./profiles";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { ViewImage } from "@atproto/api/dist/client/types/app/bsky/embed/images";
import { toast } from "./toast";
import { GeneratorViewElementAction } from "./feeds";
import { ListView } from "@atproto/api/dist/client/types/app/bsky/graph/defs";

export function renderRichText(record: AppBskyFeedPost.Record | RichText) {
    if (!record.facets) {
        return html`<div class="whitespace-pre-wrap break-words">${record.text}</div>`;
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
            segments.push(html`<a href="${segment.link?.uri}" target="_blank">${segment.text}</a>`);
        } else if (segment.isTag()) {
            segments.push(html`<span class="text-blue-500">${segment.text}</span>`);
        } else {
            segments.push(html`<span>${segment.text}</span>`);
        }
    }
    const result = html`<div class="whitespace-pre-wrap break-words">${map(segments, (segment) => segment)}</div>`;
    return result;
}

export function tryEmbedTwitter(
    cardEmbed: AppBskyEmbedExternal.ViewExternal | AppBskyEmbedExternal.External,
    minimal: boolean
): TemplateResult | undefined {
    const link = cardEmbed.uri.split("?")[0];
    const twitterPostRegex = /^https?:\/\/(twitter\.com|x\.com)\/(\w+)\/status\/(\d+)(\?\S*)?$/;
    const match = link.match(twitterPostRegex);

    if (match && match[3]) {
        const tweetId = match[3];
        return html`<iframe
            src="https://platform.twitter.com/embed/index.html?dnt=false&embedId=twitter-widget-0&frame=false&hideCard=false&hideThread=false&id=${tweetId}&lang=en&origin=${encodeURIComponent(
                window.location.href
            )}&theme=light&widgetsVersion=ed20a2b%3A1601588405575&width=550px"
            class="w-full h-[40vh] mt-2"
            title="Twitter Tweet"
            style="border: 0; overflow: hidden;"
        ></iframe>`;
    } else {
        return undefined;
    }
}

export function tryEmbedGiphyGif(
    cardEmbed: AppBskyEmbedExternal.ViewExternal | AppBskyEmbedExternal.External,
    minimal: boolean
): TemplateResult | undefined {
    const url = cardEmbed.uri;
    const giphyPattern = /https?:\/\/(?:www\.)?giphy\.com\/gifs\/(?:.*-)?([a-zA-Z0-9]+)/;
    const match = url.match(giphyPattern);

    if (match) {
        const gifId = match[1];
        const gifURL = `https://media.giphy.com/media/${gifId}/giphy.gif`;
        // If you want the video format, you can use the following line instead
        // const videoURL = `https://media.giphy.com/media/${gifId}/giphy.mp4`;
        return html`<div class="flex items-center justify-center mt-2"><img src="${gifURL}" class="max-h-[40svh] rounded" /></div>`;
    }

    return undefined;
}

export function tryEmbedTenorGif(
    cardEmbed: AppBskyEmbedExternal.ViewExternal | AppBskyEmbedExternal.External,
    minimal: boolean
): TemplateResult | undefined {
    const url = cardEmbed.uri;
    const tenorPattern = /https?:\/\/(?:www\.)?tenor\.com\/(?:[^\/]+\/)?view\/.*-(\d+)$/;
    if (!url.match(tenorPattern)) return undefined;

    const extractMediaLinks = (html: string): { gif?: string; mp4?: string } | undefined => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        const ogImageMeta = doc.querySelector('meta[property="og:image"]');
        const ogVideoMeta = doc.querySelector('meta[property="og:video:secure_url"]');

        let result: { gif?: string; mp4?: string } = {};

        if (ogImageMeta && ogImageMeta.getAttribute("content")) {
            result.gif = ogImageMeta.getAttribute("content") ?? undefined;
        }

        if (ogVideoMeta && ogVideoMeta.getAttribute("content")) {
            result.mp4 = ogVideoMeta.getAttribute("content") ?? undefined;
        }

        return Object.keys(result).length > 0 ? result : undefined;
    };

    const tenorDom = dom(html`<div class="mt-2 rounded overflow-x-clip"></div>`)[0];
    fetchApi("html?url=" + decodeURIComponent(url))
        .then(async (data) => {
            const tenorHtml = await data.text();
            const media = extractMediaLinks(tenorHtml);
            if (media) {
                if (media.mp4) {
                    const videoDom = dom(
                        html`<div class="flex justify-center items-center">
                            <video
                                src="${media.mp4}"
                                class="w-full h-auto cursor-pointer rounded"
                                muted
                                loop
                                playsinline
                                disableRemotePlayback
                            ></video>
                        </div>`
                    )[0];
                    tenorDom.append(videoDom);
                    onVisibilityChange(
                        videoDom,
                        () => {
                            const video = videoDom.querySelector("video") as HTMLVideoElement;
                            video.play();
                        },
                        () => {
                            const video = videoDom.querySelector("video") as HTMLVideoElement;
                            video.pause();
                        }
                    );
                } else if (media.gif) {
                    tenorDom.append(
                        dom(
                            html`<div class="flex justify-center items-center">
                                <img src="${media.gif}" class="w-full h-auto rounded" />
                            </div>`
                        )[0]
                    );
                } else {
                    tenorDom.append(dom(renderCardEmbed(cardEmbed, minimal))[0]);
                }
            } else {
                tenorDom.append(dom(renderCardEmbed(cardEmbed, minimal))[0]);
            }
        })
        .catch(() => {
            tenorDom.append(dom(renderCardEmbed(cardEmbed, minimal))[0]);
        });
    return html`${tenorDom}`;
}

export function tryEmbedYouTubeVideo(
    cardEmbed: AppBskyEmbedExternal.ViewExternal | AppBskyEmbedExternal.External,
    minimal: boolean
): TemplateResult | undefined {
    const url = cardEmbed.uri;
    const videoRegExp = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([\w-]+)/;
    let videoID: string | undefined = "";
    if (videoRegExp.test(url)) {
        const match = url.match(videoRegExp);
        videoID = match ? match[1] : undefined;
        if (!videoID) return undefined;
    } else {
        return undefined;
    }

    if (videoID && videoID.length === 11) {
        const youtubeDom = dom(html`<div class="mt-2 rounded overflow-x-clip flex justify-center"></div>`)[0];
        fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoID}&format=json`)
            .then(async (data) => {
                const youtubeInfo = await data.json();
                const showIFrame = (ev: MouseEvent) => {
                    if (minimal) return;
                    ev.preventDefault();
                    ev.stopPropagation();
                    ev.stopImmediatePropagation();
                    const img = imgDom.querySelector("img")!;
                    const width = img.clientWidth;
                    const height = img.clientHeight;
                    requestAnimationFrame(() => {
                        const outerFrame = dom(
                            html`<div class="flex w-full max-w-[480px]">${unsafeHTML(enableYoutubeJSApi(youtubeInfo.html))}</div>`
                        )[0];
                        const iframe = outerFrame.querySelector("iframe")!;
                        iframe.width = width.toString() + "px";
                        iframe.height = height.toString() + "px";
                        youtubeDom.classList.add("hidedn");
                        imgDom.remove();
                        youtubeDom.append(outerFrame);
                        setTimeout(() => {
                            iframe.contentWindow?.postMessage('{"event":"command","func":"' + "playVideo" + '","args":""}', "*");
                            imgDom.remove();
                        }, 1000);
                    });
                };
                const imgDom = dom(
                    html` <div @click=${(ev: MouseEvent) => showIFrame(ev)} class="relative flex items-center cursor-pointer">
                        <img src="${youtubeInfo.thumbnail_url}" class="${minimal ? "max-w-[200px]" : "w-full max-w-[480px]"} h-auto mx-auto" />
                        <div
                            class="absolute ${minimal ? "w-4 h-4" : "w-16 h-16"} disable-pointer-events"
                            style="top: calc(100% / 2 - ${minimal ? "8px" : "32px"}); left: calc(100% / 2 - ${minimal ? "8px" : "32px"});"
                        >
                            ${youtubePlaYButton}
                        </div>
                    </div>`
                )[0];
                youtubeDom.append(imgDom);
            })
            .catch(() => {
                youtubeDom.append(dom(renderCardEmbed(cardEmbed, minimal))[0]);
            });
        return html`${youtubeDom}`;
    }

    return undefined;
}

export function renderCardEmbed(cardEmbed: AppBskyEmbedExternal.ViewExternal | AppBskyEmbedExternal.External, minimal: boolean) {
    const youTubeEmbed = tryEmbedYouTubeVideo(cardEmbed, minimal);
    if (youTubeEmbed) return youTubeEmbed;
    const giphyEmbed = tryEmbedGiphyGif(cardEmbed, minimal);
    if (giphyEmbed) return giphyEmbed;
    const tenorEmbed = tryEmbedTenorGif(cardEmbed, minimal);
    if (tenorEmbed) return tenorEmbed;
    const twitterEmbed = tryEmbedTwitter(cardEmbed, minimal);
    if (twitterEmbed) return twitterEmbed;

    const thumb = typeof cardEmbed.thumb == "string" ? cardEmbed.thumb : cardEmbed.image;
    return html`<a class="overflow-x-clip text-black dark:text-white mt-2 border border-divider rounded flex" target="_blank" href="${cardEmbed.uri}">
        ${thumb ? html`<img src="${thumb}" class="w-28 h-28 object-cover" />` : nothing}
        <div class="flex flex-col p-2 justify-center">
            <span class="text-muted-fg text-xs">${new URL(cardEmbed.uri).host}</span>
            <span class="font-semibold text-sm line-clamp-2 break-normal">${cardEmbed.title}</span>
            <div class="text-sm line-clamp-2 break-normal">${cardEmbed.description}</div>
        </div>
    </a>`;
}

export function renderImagesEmbedSmall(images: AppBskyEmbedImages.ViewImage[]) {
    return html`<div class="mt-2 flex mx-2 justify-center">
        ${map(
            images,
            (image) => html`<div class="w-1/4 relative">
                <img src="${image.thumb}" class="px-1 w-28 h-28 object-cover" />
            </div>`
        )}
    </div>`;
}

export function renderImagesEmbed(images: AppBskyEmbedImages.ViewImage[], sensitive: boolean, minimal = false) {
    if (minimal) return renderImagesEmbedSmall(images);

    const unblur = (target: HTMLElement) => {
        if (sensitive) target.classList.toggle("blur-lg");
    };

    const openGallery = (ev: Event, imageIndex = 0) => {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        if (sensitive) {
            unblur(ev.target as HTMLElement);
            sensitive = false;
        } else {
            const galleryImages = images.map((image) => {
                return { url: image.fullsize, altText: image.alt };
            });
            document.body.append(dom(html`<image-gallery-overlay .images=${galleryImages} .imageIndex=${imageIndex}></image-gallery-overlay>`)[0]);
        }
    };

    const renderAlt = (image: ViewImage) => {
        return image.alt && image.alt.length > 0
            ? html`<div class="absolute bottom-2 left-2 rounded bg-black text-white p-1 text-xs">ALT</div>`
            : html`${nothing}`;
    };

    const renderImage = (image: ViewImage, index: number) => html`<div class="w-full h-full" @click=${(ev: MouseEvent) => openGallery(ev, index)}>
        <img src="${image.thumb}" alt="${image.alt}" class="relative w-full h-full object-cover rounded ${sensitive ? "blur-lg" : ""}" />
        ${renderAlt(image)}
    </div>`;

    const renderImages: ((images: AppBskyEmbedImages.ViewImage[]) => TemplateResult)[] = [
        (images: AppBskyEmbedImages.ViewImage[]) => {
            return html`<div class="w-full flex justify-center">
                <div class="relative">
                    <img src="${images[0].thumb}" alt="${images[0].alt}" class="max-h-[40vh] w-auto rounded ${sensitive ? "blur-lg" : ""}" />
                    ${renderAlt(images[0])}
                </div>
            </div>`;
        },
        (images: AppBskyEmbedImages.ViewImage[]) => {
            return html` <div class="relative w-full aspect-[2/1] flex gap-1">
                ${map(images, (image, index) => html`<div class="w-[50%] h-full">${renderImage(image, index)}</div>`)}
            </div>`;
        },
        (images: AppBskyEmbedImages.ViewImage[]) => {
            return html` <div class="relative flex gap-1">
                <div class="w-[66%] aspect-square rounded overflow-x-clip">${renderImage(images[0], 0)}</div>
                <div class="w-[33%] flex flex-col aspect-[1/2] gap-1">
                    <div class="w-full h-[50%]">${renderImage(images[1], 1)}</div>
                    <div class="w-full h-[50%]">${renderImage(images[2], 2)}</div>
                </div>
            </div>`;
        },
        (images: AppBskyEmbedImages.ViewImage[]) => {
            return html` <div class="relative w-full aspect-square flex gap-1">
                <div class="w-[50%] aspect-square flex flex-col gap-1">
                    <div class="w-full h-[50%]">${renderImage(images[0], 0)}</div>
                    <div class="w-full h-[50%]">${renderImage(images[2], 2)}</div>
                </div>
                <div class="w-[50%] aspect-square flex flex-col gap-1">
                    <div class="w-full h-[50%]">${renderImage(images[1], 1)}</div>
                    <div class="w-full h-[50%]">${renderImage(images[3], 2)}</div>
                </div>
            </div>`;
        },
    ];

    return html`
        <div class="mt-2 flex items-center justify-center" @click=${(ev: MouseEvent) => openGallery(ev)}>
            ${renderImages[images.length - 1](images)}
        </div>
    `;
}

export function renderRecordEmbed(recordEmbed: AppBskyEmbedRecord.View) {
    if (AppBskyEmbedRecord.isViewNotFound(recordEmbed.record)) {
        return itemPlaceholder(i18n("Deleted post"));
    }

    if (AppBskyEmbedRecord.isViewBlocked(recordEmbed.record)) {
        return itemPlaceholder(i18n("You have blocked the author or the author has blocked you."), html`${shieldIcon}`);
    }

    if (AppBskyFeedDefs.isGeneratorView(recordEmbed.record)) {
        const action = (action: GeneratorViewElementAction, generator: GeneratorView) => {
            if (action == "clicked") document.body.append(dom(html`<feed-overlay .feedUri=${generator.uri}></feed-overlay>`)[0]);
        };
        return html`<div class="mt-2 border border-divider rounded p-2">
            <generator-view .generator=${recordEmbed.record} .action=${action}></generator-view>
        </div>`;
    }

    if (AppBskyGraphDefs.isListView(recordEmbed.record)) {
        const action = (action: GeneratorViewElementAction, list: ListView) => {
            if (action == "clicked") document.body.append(dom(html`<list-overlay .listUri=${list.uri}></list-overlay>`)[0]);
        };
        return html`<div class="mt-2 border border-divider rounded p-2"><list-view .list=${recordEmbed.record} .action=${action}></list-view></div>`;
    }

    if (!AppBskyEmbedRecord.isViewRecord(recordEmbed.record)) return nothing;
    if (!AppBskyFeedPost.isRecord(recordEmbed.record.value)) return nothing;
    const record = recordEmbed.record.value;
    const rkey = splitAtUri(recordEmbed.record.uri).rkey;
    const author = recordEmbed.record.author;
    const embeds = recordEmbed.record.embeds && recordEmbed.record.embeds.length > 0 ? recordEmbed.record.embeds[0] : undefined;
    const sensitive = recordEmbed.record.labels?.some((label) => ["porn", "nudity", "sexual"].includes(label.val)) ?? false;
    return html`<div class="mt-2 border border-divider rounded p-2">${renderRecord(author, rkey, record, embeds, true, sensitive)}</div>`;
}

export function renderRecordWithMediaEmbed(recordWithMediaEmbed: AppBskyEmbedRecordWithMedia.View, sensitive: boolean, minimal = false) {
    const imagesEmbed = AppBskyEmbedImages.isView(recordWithMediaEmbed.media) ? recordWithMediaEmbed.media.images : undefined;
    const cardEmbed =
        AppBskyEmbedExternal.isView(recordWithMediaEmbed.media) || AppBskyEmbedExternal.isMain(recordWithMediaEmbed.media)
            ? recordWithMediaEmbed.media.external
            : undefined;
    return html`<div class="mt-2">
        ${cardEmbed ? renderCardEmbed(cardEmbed, minimal) : nothing} ${imagesEmbed ? renderImagesEmbed(imagesEmbed, sensitive, minimal) : nothing}
        ${!minimal ? renderRecordEmbed(recordWithMediaEmbed.record) : nothing}
    </div>`;
}

export function renderEmbed(embed: PostView["embed"] | AppBskyFeedPost.Record["embed"], sensitive: boolean, minimal = false) {
    const cardEmbed = AppBskyEmbedExternal.isView(embed) || AppBskyEmbedExternal.isMain(embed) ? embed.external : undefined;
    const imagesEmbed = AppBskyEmbedImages.isView(embed) ? embed.images : undefined;
    const recordEmbed = AppBskyEmbedRecord.isView(embed) ? embed : undefined;
    const recordWithMediaEmbed = AppBskyEmbedRecordWithMedia.isView(embed) ? embed : undefined;
    const cardDom = cardEmbed ? renderCardEmbed(cardEmbed, minimal) : undefined;
    return html`<div>
        ${cardEmbed ? cardDom : nothing} ${imagesEmbed ? renderImagesEmbed(imagesEmbed, sensitive, minimal) : nothing}
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
    timeLeft = false
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
                      ${prefix ? html`<span class="mr-1 font-semibold">${prefix}</span>` : nothing} ${renderProfile(author, smallAvatar)}
                      ${prefix == undefined
                          ? html`<a
                                class="self-start ${timeLeft
                                    ? "mt-1 ml-2"
                                    : "ml-auto"} text-right text-xs text-muted-fg whitespace-nowrap hover:underline"
                                href="#thread/${author.did}/${rkey}"
                                target="_blank"
                                @click=${(ev: Event) => {
                                    ev.preventDefault();
                                    ev.stopPropagation();
                                    document.body.append(dom(html`<thread-overlay .postUri=${combineAtUri(author.did, rkey)}></thread-overlay>`)[0]);
                                }}
                                >${getTimeDifference(new Date(record.createdAt).getTime())}</a
                            >`
                          : nothing}
                  </div>
                  ${subHeader ? subHeader : nothing}`
            : nothing}
        ${replyToProfile && showReplyto
            ? html`<div class="mt-1 flex gap-1 text-xs items-center text-muted-fg">
                  <i class="icon fill-muted-fg">${replyIcon}</i>
                  <span class="whitespace-nowrap">${i18n("Replying to")}</span>
                  ${renderProfileAvatar(replyToProfile, true)}
                  <a
                      class="line-clamp-1 hover:underline text-muted-fg"
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
    unmuted = false;

    @property()
    deleted = false;

    @property()
    centerButtons = false;

    @property()
    timeLeft = false;

    contentDom?: HTMLElement;

    unsubscribePost: () => void = () => {};
    unsubscribeQuote: () => void = () => {};
    unsubscribeModeration: () => void = () => {};

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
        this.unsubscribeModeration = State.subscribe("profile", (action, profile) => this.handleProfileUpdate(action, profile), this.post.author.did);
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

    handleProfileUpdate(action: EventAction, profile: ProfileView) {
        if (action == "updated_profile_moderation" && this.post) {
            this.post = { ...this.post, viewer: profile.viewer };
            this.post.author.viewer = profile.viewer;
            this.unmuted = false;
            this.requestUpdate();
        }
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this.unsubscribePost();
        this.unsubscribeQuote();
        this.unsubscribeModeration();
    }

    render() {
        if (!this.post || !AppBskyFeedPost.isRecord(this.post.record)) {
            return html`<div class="px-4 py-2">
                <loading-spinner></loading-spinner>
            </div>`;
        }

        if (this.deleted) {
            return itemPlaceholder(i18n("Deleted post"));
        }

        if (this.post.author.viewer?.blocking || this.post.author.viewer?.blockingByList) {
            return itemPlaceholder(
                html`<div class="flex items-center gap-2">
                    <span>${i18n("Post by blocked user")}</span><span class="text-xs">(${i18n("Click to view")})</span>
                </div>`,
                html`${shieldIcon}`,
                (ev: MouseEvent) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    document.body.append(dom(html`<profile-overlay .did=${this.post?.author.did}></profile-overlay>`)[0]);
                }
            );
        }

        if ((this.post.author.viewer?.muted || this.post.author.viewer?.mutedByList) && !this.unmuted) {
            return itemPlaceholder(
                html`${i18n("Post by muted user")}<span class="ml-2 text-xs"> (${i18n("Click to view")})</span>`,
                html`${shieldIcon}`,
                (ev: MouseEvent) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    this.unmuted = true;
                }
            );
        }

        const rkey = splitAtUri(this.post.uri)?.rkey;
        const author = this.post.author;
        if (!this.contentDom) {
            this.contentDom = dom(
                html`${renderRecord(
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
                    this.timeLeft
                )}`
            )[0];
        }
        return html`<div class="${this.animation} outline-none">
            ${this.contentDom}
            <div class="flex items-center ${this.centerButtons ? "justify-center" : ""} text-muted-fg fill-muted-fg gap-4 mt-2">
                <button @click=${() => this.replyCallback(this.post!)} class="flex gap-1 items-center">
                    <i class="icon !w-4 !h-4">${replyIcon}</i><span>${this.post.replyCount ?? 0}</span>
                </button>
                <button @click=${() => this.quoteCallback(this.post!)} class="flex gap-1 items-center">
                    <i class="icon !w-4 !h-4">${quoteIcon}</i><span>${State.getObject("numQuote", this.post.uri)?.numQuotes ?? 0}</span>
                </button>
                <icon-toggle
                    @change=${(ev: CustomEvent) => this.toggleRepost(ev)}
                    .icon=${html`<i class="icon !w-4 !h-4">${reblogIcon}</i>`}
                    class="h-4"
                    .value=${this.post.viewer?.repost ?? false}
                    .text=${"" + (this.post.repostCount ?? 0)}
                ></icon-toggle>
                <icon-toggle
                    @change=${(ev: CustomEvent) => this.toggleLike(ev)}
                    .icon=${html`<i class="icon !w-4 !h-4">${heartIcon}</i>`}
                    .iconFilled=${html`<i class="icon !w-4 !h-4">${heartFilledIcon}</i>`}
                    class="h-4"
                    .value=${this.post.viewer?.like ?? false}
                    .text=${"" + (this.post.likeCount ?? 0)}
                ></icon-toggle>
                <post-options .post=${this.post} .handleOption=${(option: PostOptions) => this.handleOption(option)}></post-options>
            </div>
        </div>`;
    }

    handleOption(option: PostOptions) {
        if (option == "delete") {
            this.deleteCallback(this.post!);
        }
    }

    async toggleRepost(ev: CustomEvent) {
        const toggle = ev.target as IconToggle;
        if (!Store.getUser()) return;
        if (!State.bskyClient) return;
        if (!this.post) return;
        if (!this.post.viewer) this.post.viewer = {};
        if (ev.detail.value) {
            toggle.innerText = (Number.parseInt(toggle.innerText) + 1).toString();
            this.requestUpdate();
            const response = await State.bskyClient!.repost(this.post.uri, this.post.cid);
            this.post.viewer.repost = response.uri;
            this.post.repostCount = this.post.repostCount ? this.post.repostCount + 1 : 1;
        } else {
            toggle.innerText = (Number.parseInt(toggle.innerText) - 1).toString();
            this.requestUpdate();
            if (this.post.viewer.repost) await State.bskyClient?.deleteRepost(this.post.viewer.repost);
            delete this.post.viewer.repost;
            this.post.repostCount = this.post.repostCount ? this.post.repostCount - 1 : 0;
        }
        State.notify("post", "updated", this.post);
    }

    likeUri: string | undefined;
    async toggleLike(ev: CustomEvent) {
        const toggle = ev.target as IconToggle;
        if (!Store.getUser()) return;
        if (!State.bskyClient) return;
        if (!this.post) return;
        if (!this.post.viewer) this.post.viewer = {};
        if (ev.detail.value) {
            toggle.innerText = (Number.parseInt(toggle.innerText) + 1).toString();
            this.requestUpdate();
            const response = await State.bskyClient!.like(this.post.uri, this.post.cid);
            this.post.viewer.like = response.uri;
            this.post.likeCount = this.post.likeCount ? this.post.likeCount + 1 : 1;
        } else {
            toggle.innerText = (Number.parseInt(toggle.innerText) - 1).toString();
            this.requestUpdate();
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
        return html`<div class="overflow-auto flex-1 whitespace-pre-wrap px-4 mt-4">${this.alt}</div>`;
    }
}

export function getBskyPostUrl(post: PostView) {
    const atUri = splitAtUri(post.uri);
    return `https://bsky.app/profile/${post.author.did}/post/${atUri.rkey}`;
}

type PostOptions =
    | "likes"
    | "quotes"
    | "reposts"
    | "mute_user"
    | "unmute_user"
    | "mute_thread"
    | "block_user"
    | "unblock_user"
    | "delete"
    | "open_thread"
    | "open_bluesky"
    | "copy_link";
type PostOptionsButton = { option: PostOptions; text: string; icon: TemplateResult; click: () => void; enabled: boolean };

@customElement("post-options")
export class PostOptionsElement extends PopupMenu {
    @property()
    post?: PostView;

    @property()
    handleOption: (option: "mute_user" | "mute_thread" | "block_user" | "delete") => void = () => {};

    protected renderButton(): TemplateResult {
        return html`<i slot="buttonText" class="icon w-6 h-6 fill-muted-fg">${moreIcon}</i>`;
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
                    waitForOverlayClosed(() => {
                        document.body.append(
                            dom(
                                html`<profiles-stream-overlay
                                    title="Reposts"
                                    .hash=${`reposts/${this.post?.author.did}/${this.post ? splitAtUri(this.post.uri).rkey : undefined}`}
                                    .stream=${new PostRepostsStream(this.post?.uri!)}
                                ></profile-stream-overlay>`
                            )[0]
                        );
                    });
                    this.close();
                },
            },
            {
                option: "likes",
                text: i18n("Likes"),
                icon: html`${heartIcon}`,
                enabled: (this.post.likeCount ?? 0) > 0,
                click: () => {
                    waitForOverlayClosed(() => {
                        document.body.append(
                            dom(
                                html`<profiles-stream-overlay
                                    title="Likes"
                                    .hash=${`likes/${this.post?.author.did}/${this.post ? splitAtUri(this.post.uri).rkey : undefined}`}
                                    .stream=${new PostLikesStream(this.post?.uri!)}
                                ></profiles-stream-overlay>`
                            )[0]
                        );
                    });
                    this.close();
                },
            },
            {
                option: "open_thread",
                text: i18n("Open Thread"),
                icon: html`${treeIcon}`,
                enabled: true,
                click: () => {
                    waitForOverlayClosed(() => {
                        document.body.append(dom(html`<thread-overlay .postUri=${this.post?.uri}></thread-overlay>`)[0]);
                    });
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
                enabled: did != this.post.author.did && !this.post.author.viewer?.muted && !this.post.author.viewer?.mutedByList,
                click: () => {
                    State.muteActor(this.post!.author.did);
                    this.close();
                },
            },
            {
                option: "unmute_user",
                text: i18n("Unmute User"),
                icon: html`${muteIcon}`,
                enabled: did != this.post.author.did && (this.post.author.viewer?.muted || this.post.author.viewer?.mutedByList != undefined),
                click: () => {
                    State.unmuteActor(this.post!.author.did);
                    this.close();
                },
            },
            {
                option: "block_user",
                text: i18n("Block User"),
                icon: html`${blockIcon}`,
                enabled: did != this.post.author.did && !this.post.author.viewer?.blocking && !this.post.author.viewer?.blockingByList,
                click: () => {
                    State.blockActor(this.post!.author.did);
                    this.close();
                },
            },
            {
                option: "unblock_user",
                text: i18n("Unblock User"),
                icon: html`${blockIcon}`,
                enabled:
                    did != this.post.author.did &&
                    (this.post.author.viewer?.blocking != undefined || this.post.author.viewer?.blockingByList != undefined),
                click: () => {
                    State.unblockActor(this.post!.author.did);
                    this.close();
                },
            },
            {
                option: "copy_link",
                text: i18n("Copy link"),
                icon: html`${cloudIcon}`,
                enabled: true,
                click: () => {
                    if (this.post) {
                        copyTextToClipboard(getBskyPostUrl(this.post));
                        toast(i18n("Copied link to clipboard"));
                    }
                    this.close();
                },
            },
            {
                option: "open_bluesky",
                text: i18n("Open in Bluesky"),
                icon: html`${cloudIcon}`,
                enabled: true,
                click: () => {
                    if (this.post) window.open(getBskyPostUrl(this.post), "_blank");
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
                class="px-4 h-10 hover:bg-primary hover:text-primary-fg hover:fill-[#fff] flex items-center gap-4"
                @click=${() => button.click()}
            >
                <i class="icon !w-4 !h-4">${button.icon}</i>
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
    thread?: ThreadViewPost["replies"];

    @property()
    showReplies = true;

    hasWiggled = false;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        const thread = this.thread;
        if (!AppBskyFeedDefs.isThreadViewPost(thread)) {
            // FIXME handle other thread types.
            return dom(html``)[0];
        }
        const uri = this.highlightUri;
        const isRoot = this.isRoot;

        const animation = this.hasWiggled ? "" : "animate-shake animate-delay-500";
        this.hasWiggled = true;
        const insertNewPost = (newPost: PostView, repliesDom: HTMLElement) => {
            const threadViewPost = {
                $type: "app.bsky.feed.defs#threadViewPost",
                post: newPost,
                replies: [],
            } as ThreadViewPost;
            const newPostDom = dom(
                html`<thread-view-post .highlightUri=${newPost.uri} .isRoot=${false} .thread=${threadViewPost}></thread-view-post>`
            )[0];
            if (repliesDom.children.length > 0) {
                repliesDom.children[0].before(newPostDom);
            } else {
                repliesDom.append(newPostDom);
            }
            waitForLitElementsToRender(newPostDom).then(() => {
                newPostDom.scrollIntoView({ behavior: "smooth", block: "center" });
            });
        };

        const reply = (post: PostView, repliesDom: HTMLElement) => {
            document.body.append(
                dom(html`<post-editor-overlay .replyTo=${post} .sent=${(post: PostView) => insertNewPost(post, repliesDom)}></post-editor-overly>`)[0]
            );
        };

        const toggleReplies = (ev: MouseEvent) => {
            if (window.getSelection() && window.getSelection()?.toString().length != 0) return;
            if (hasLinkOrButtonParent(ev.target as HTMLElement)) return;
            if (!thread.replies || thread.replies.length == 0) return;
            ev.stopPropagation();
            repliesDom.classList.toggle("hidden");
            showMoredom.classList.toggle("hidden");
        };

        // FIXME handle BlockedPost
        const postDom = dom(html`<div data-uri="${thread.post.uri}">
            ${AppBskyFeedDefs.isNotFoundPost(thread.parent) ? itemPlaceholder(i18n("Deleted post")) : nothing}
            <div
                class="${thread.post.uri == uri ? animation : ""} min-w-[350px] mb-2 ml-[-1px] ${!isRoot || (thread.post.uri == uri && isRoot)
                    ? "pl-2"
                    : ""} ${thread.post.uri == uri ? "border-l border-primary" : ""} flex flex-col pr-2"
            >
                <post-view
                    @click=${(ev: MouseEvent) => toggleReplies(ev)}
                    .post=${thread.post}
                    .quoteCallback=${(post: PostView) => quote(post)}
                    .replyCallback=${(post: PostView) => reply(post, repliesDom)}
                    .deleteCallback=${(post: PostView) => deletePost(post, postDom)}
                    .showReplyTo=${false}
                    .openOnClick=${false}
                    .timeLeft=${true}
                    class="cursor-pointer"
                ></post-view>
                <div
                    id="showMore"
                    @click=${(ev: MouseEvent) => toggleReplies(ev)}
                    class="hidden cursor-pointer self-start p-1 text-xs rounded bg-muted text-muted-fg"
                >
                    ${i18n("Show replies")}
                </div>
            </div>
            <div id="replies" class="${isRoot ? "ml-2" : "ml-4"}">
                ${map(thread.replies, (reply) => {
                    if (!AppBskyFeedDefs.isThreadViewPost(reply)) return html``;
                    return html`<div class="border-l border-divider dark:border-hinted">
                        <thread-view-post .highlightUri=${this.highlightUri} .isRoot=${false} .thread=${reply}></thread-view-post>
                    </div>`;
                })}
            </div>
        </div>`)[0];
        const repliesDom = postDom.querySelector("#replies") as HTMLElement;
        const showMoredom = postDom.querySelector("#showMore") as HTMLElement;
        if (!this.showReplies) toggleReplies(new MouseEvent("none"));
        return postDom;
    }
}

// FIXME detect if reader mode actually makes sense, and hide the reader mode button if not.
@customElement("thread-overlay")
export class ThreadOverlay extends HashNavOverlay {
    @property()
    postUri?: string;

    @state()
    isLoading = true;

    @state()
    error?: string | TemplateResult;

    @state()
    thread?: ThreadViewPost;

    @property()
    readerMode = false;

    canReaderMode = false;

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
        try {
            // FIXME go through State instead
            if (!State.bskyClient) {
                this.error = i18n("Not connected");
                return;
            }
            if (!this.postUri) {
                this.error = i18n("Post does not exist");
                return;
            }

            let atUri = splitAtUri(this.postUri);
            const postResponse = await State.bskyClient.getPost({ repo: atUri.repo, rkey: atUri.rkey });

            // First, try to get the thread from the root downwards. This will work 99% of the time.
            let threadResponse: AppBskyFeedGetPostThread.Response | undefined;
            let rootUri = postResponse.value?.reply ? postResponse.value.reply.root.uri : this.postUri;
            try {
                threadResponse = await State.bskyClient.getPostThread({
                    depth: 1000,
                    parentHeight: 1000,
                    uri: rootUri,
                });

                // OK, we got the root, but is our post part of the tree? If not
                // we need to walk up its parents.
                if (threadResponse.success) {
                    let found = false;
                    const findPost = (thread: ThreadViewPost | NotFoundPost | BlockedPost) => {
                        if (!AppBskyFeedDefs.isThreadViewPost(thread)) {
                            found = thread.uri == this.postUri;
                            return;
                        }

                        if (thread.post.uri == this.postUri) {
                            found = true;
                            return;
                        }
                        if (thread.replies) {
                            for (const reply of thread.replies) {
                                if (
                                    AppBskyFeedDefs.isThreadViewPost(reply) ||
                                    AppBskyFeedDefs.isNotFoundPost(reply) ||
                                    AppBskyFeedDefs.isBlockedPost(reply)
                                ) {
                                    findPost(reply);
                                }
                            }
                        }
                    };
                    if (
                        AppBskyFeedDefs.isThreadViewPost(threadResponse.data.thread) ||
                        AppBskyFeedDefs.isNotFoundPost(threadResponse.data.thread) ||
                        AppBskyFeedDefs.isBlockedPost(threadResponse.data.thread)
                    ) {
                        findPost(threadResponse.data.thread);
                    }
                    // Well, we didn't find the highlighted post in the thread, so
                    // we'll traverse up its parents instead. Likely, it's parented
                    // to a deleted post in the thread.
                    if (!found) {
                        threadResponse = undefined;
                    }
                }
            } catch (e) {
                // Happens if the post could not be found.
            }

            // Whoops, root couldn't be fetched.
            if (!threadResponse || !threadResponse.success) {
                // The post itself was the root, nothing we can do, bail
                if (!postResponse.value.reply) {
                    this.error = i18n("Post does not exist");
                    return;
                }

                // Try to walk up the tree, to find the oldest viable parent.
                let parentUri = postResponse.value.reply.parent.uri;
                let finalParentUri = this.postUri;
                while (true) {
                    const atUri = splitAtUri(parentUri);
                    try {
                        const parentResponse = await State.bskyClient.getPost({ repo: atUri.repo, rkey: atUri.rkey });
                        finalParentUri = parentUri;
                        if (!parentResponse.value.reply) {
                            break;
                        } else {
                            parentUri = parentResponse.value.reply.parent.uri;
                        }
                    } catch (e) {
                        // Happens if the post doesn't exist, so we know the last parentUri is the good one
                        break;
                    }
                }

                // OK, we re-anchored to some parent, let's try to fetch the thread
                threadResponse = await State.bskyClient.getPostThread({
                    depth: 1000,
                    parentHeight: 1000,
                    uri: finalParentUri,
                });
            }

            if (AppBskyFeedDefs.isNotFoundPost(threadResponse.data.thread)) {
                this.error = i18n("Post does not exist");
                return;
            }

            if (AppBskyFeedDefs.isBlockedPost(threadResponse.data.thread)) {
                if (threadResponse.data.thread.author.viewer?.blockedBy) {
                    this.error = i18n("Post author has blocked you");
                    return;
                }
                if (threadResponse.data.thread.author.viewer?.blocking || threadResponse.data.thread.author.viewer?.blockingByList) {
                    const author = threadResponse.data.thread.author;
                    const showProfile = (ev: MouseEvent) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        document.body.append(dom(html`<profile-overlay .did=${author.did}></profile-overlay>`)[0]);
                    };
                    this.error = html`<div class="flex items-center gap-2 cursor-pointer" @click=${(ev: MouseEvent) => showProfile(ev)}>
                        <i class="icon !w-5 !h-5 fill-muted-fg">${shieldIcon}</i><span>${i18n("You have blocked the post author")}</span
                        ><span class="text-xs">(${i18n("Click to view")})</span>
                    </div>`;
                    return;
                }

                this.error = i18n("You have blocked the author or the author has blocked you.");
                return;
            }

            if (!AppBskyFeedDefs.isThreadViewPost(threadResponse.data.thread)) {
                this.error = i18n("Post does not exist");
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
            collectPostUris(threadResponse.data.thread);
            await State.getNumQuotes(postUris);
            this.thread = threadResponse.data.thread;
            if (this.applyFilters(this.thread, true).length > 1) this.canReaderMode = true;
        } catch (e) {
            this.error = i18n("Post does not exist");
            return;
        } finally {
            this.isLoading = false;
        }
    }

    applyFilters(thread: ThreadViewPost, readerMode = false): ThreadViewPost[] {
        const copyThread = (thread: ThreadViewPost): ThreadViewPost => {
            const replies: ThreadViewPost["replies"] = thread.replies ? [] : undefined;
            if (thread.replies) {
                for (const reply of thread.replies) {
                    if (AppBskyFeedDefs.isThreadViewPost(reply)) {
                        replies?.push(copyThread(reply));
                    } else {
                        replies?.push(reply);
                    }
                }
            }
            return { ...thread, replies };
        };
        thread = copyThread(thread);
        const sortReplies = (thread: ThreadViewPost) => {
            const parentAuthor = thread.post.author;
            const dateSort = (a: ThreadViewPost, b: ThreadViewPost) => {
                const aRecord = date(a);
                const bRecord = date(b);
                if (aRecord && bRecord) return aRecord.getTime() - bRecord.getTime();
                return 0;
            };
            if (thread.replies) {
                const posts = thread.replies.filter((reply) => AppBskyFeedDefs.isThreadViewPost(reply)) as ThreadViewPost[];
                const highlightedPost = posts.filter((reply) => reply.post.uri == this.postUri);
                const authorPosts = posts.filter((reply) => reply.post.author.did == parentAuthor.did && !highlightedPost.includes(reply));
                authorPosts.sort(dateSort);
                const otherPosts = posts.filter((reply) => reply.post.author.did != parentAuthor.did && !highlightedPost.includes(reply));
                otherPosts.sort(dateSort);
                const other = thread.replies.filter((reply) => !AppBskyFeedDefs.isThreadViewPost(reply));
                thread.replies = [...authorPosts, ...otherPosts, ...other];
                for (const reply of thread.replies) {
                    if (AppBskyFeedDefs.isThreadViewPost(reply)) sortReplies(reply);
                }
                thread.replies = [...highlightedPost, ...thread.replies];
            }
        };
        sortReplies(thread);
        if (this.readerMode || readerMode) {
            const parentAuthor = thread.post.author;
            const threadPosts: ThreadViewPost[] = [];
            const collectThreadPosts = (replies: ThreadViewPost["replies"]) => {
                if (replies && replies.length > 0 && AppBskyFeedDefs.isThreadViewPost(replies[0]) && replies[0].post.author.did == parentAuthor.did) {
                    const opReply = replies[0];
                    threadPosts.push(opReply);
                    replies.splice(0, 1)[0];
                    collectThreadPosts(opReply.replies);
                }
            };
            collectThreadPosts(thread.replies);
            return [thread, ...threadPosts];
        }
        return [thread];
    }

    renderHeader() {
        return html`${renderTopbar(
            "Thread",
            html`<div class="ml-auto flex">
                <div class="flex">
                    ${this.canReaderMode
                        ? html`<icon-toggle
                              @change=${(ev: CustomEvent) => (this.readerMode = ev.detail.value)}
                              .icon=${html`<i class="icon !w-5 !h-5">${articleIcon}</i>`}
                              class="w-10 h-10"
                          ></icon-toggle>`
                        : nothing}
                </div>
                <div class="-ml-2">${this.closeButton()}</div>
            </div>`
        )}`;
    }

    renderContent() {
        const thread = this.thread ? this.applyFilters(this.thread) : undefined;

        // FIXME threads to test sorting and view modes with
        // http://localhost:8080/#thread/did:plc:k3a6s3ac4unrst44te7fd62m/3k7ths5azkx2z
        const result = dom(html`<div class="px-4">
            ${this.isLoading ? html`<loading-spinner></loading-spinner>` : nothing} ${this.error ? itemPlaceholder(this.error) : nothing}
            <div class="mt-2"></div>
            ${thread
                ? map(
                      thread,
                      (t, index) =>
                          html`<thread-view-post
                              .showReplies=${!this.readerMode}
                              .highlightUri=${this.readerMode ? "" : this.postUri}
                              .isRoot=${true}
                              .thread=${t}
                          ></thread-view-post>`
                  )
                : nothing}
        </div>`)[0];
        if (thread) {
            const scrollToUri = this.readerMode ? (thread ? thread[0].post.uri : "") : this.postUri;
            const root = this.renderRoot.children[0] as HTMLElement;
            waitForScrollHeightUnchanged(root, () => {
                const postViewDom = this.querySelector(`[data-uri="${scrollToUri}"]`);
                postViewDom?.querySelector("post-view")?.scrollIntoView({ behavior: "smooth", block: "center" });
            });
        }
        return html`${result}`;
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
        const repostedByClicked = (ev: Event) => {
            if (!AppBskyFeedDefs.isReasonRepost(feedViewPost.reason)) return;
            ev.preventDefault();
            ev.stopPropagation();
            document.body.append(dom(html`<profile-overlay .did=${feedViewPost.reason.by.did}></profile-overlay>`)[0]);
        };
        const repostedBy = AppBskyFeedDefs.isReasonRepost(feedViewPost.reason)
            ? html`<div class="mb-1 flex items-center gap-2 fill-muted-fg text-xs"><i class="icon !w-4 !h-4">${reblogIcon}</i>${renderProfileAvatar(
                  feedViewPost.reason.by,
                  true
              )}<a class="hover:underline truncate text-muted-fg" href="${getProfileUrl(feedViewPost.reason.by)}" @click=${repostedByClicked}>${
                  feedViewPost.reason.by.displayName ?? feedViewPost.reason.by.handle
              }</div>`
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
                ></post-view>
            </div>`)[0];
        } else {
            const parentDom = dom(html`<post-view
                .post=${feedViewPost.reply.parent}
                .quoteCallback=${(post: PostView) => quote(post)}
                .replyCallback=${(post: PostView) => reply(post)}
                .deleteCallback=${(post: PostView) => deletePost(post, parentDom)}
            ></post-view>`)[0];
            postDom = dom(html`<div class="ml-2 px-2 mt-2 border-l border-l-primary">
                <post-view
                    .post=${feedViewPost.post}
                    .quoteCallback=${(post: PostView) => quote(post)}
                    .replyCallback=${(post: PostView) => reply(post)}
                    .deleteCallback=${(post: PostView) => deletePost(post, postDom)}
                    .showReplyTo=${false}
                ></post-view>
            </div>`)[0];
            postDom = dom(html`<div class="flex flex-col">${repostedBy}${parentDom}${postDom}</div>`)[0];
        }
        return html`<div class="px-4 py-4 border-b border-divider">${postDom}</div>`;
    }
}
