import {
    AppBskyEmbedExternal,
    AppBskyEmbedImages,
    AppBskyEmbedRecord,
    AppBskyEmbedRecordWithMedia,
    AppBskyFeedPost,
    AppBskyRichtextFacet,
    BlobRef,
    BskyAgent,
    ComAtprotoRepoStrongRef,
    RichText,
} from "@atproto/api";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { GeneratorView, PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { ListView } from "@atproto/api/dist/client/types/app/bsky/graph/defs";
import { SelfLabels } from "@atproto/api/dist/client/types/com/atproto/label/defs";
import { LitElement, PropertyValueMap, TemplateResult, html, nothing, svg } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { map } from "lit/directives/map.js";
import { extractLinkCard } from "../bsky";
import { i18n } from "../i18n";
import { atIcon, closeIcon, deleteIcon, editIcon, gifIcon, imageIcon, shieldIcon, spinnerIcon } from "../icons";
import { State } from "../state";
import { Store } from "../store";
import { AtUri, ImageInfo, dom, downloadImage, downscaleImage, error, isMobileBrowser, loadImageFile, loadImageFiles, splitAtUri } from "../utils";
import { CloseableElement, Overlay, navigationGuard, renderTopbar } from "./overlay";
import { renderEmbed, renderRecord, renderRichText } from "./posts";
import { QuillEditor } from "./text-editor";

const defaultAvatar = svg`<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="none" data-testid="userAvatarFallback"><circle cx="12" cy="12" r="12" fill="#0070ff"></circle><circle cx="12" cy="9.5" r="3.5" fill="#fff"></circle><path stroke-linecap="round" stroke-linejoin="round" fill="#fff" d="M 12.058 22.784 C 9.422 22.784 7.007 21.836 5.137 20.262 C 5.667 17.988 8.534 16.25 11.99 16.25 C 15.494 16.25 18.391 18.036 18.864 20.357 C 17.01 21.874 14.64 22.784 12.058 22.784 Z"></path></svg>`;

@customElement("post-editor")
export class PostEditor extends LitElement {
    @property()
    cancelable = false;

    @property()
    cancled: () => void = () => {};

    @property()
    sent: (post: PostView) => void = () => {};

    @property()
    quote?: PostView | ListView | GeneratorView;
    quoteRendered?: HTMLElement;

    @property()
    replyTo?: PostView;
    replyToRendered?: HTMLElement;

    @property()
    text = "";

    @property()
    hashtag?: string;

    @state()
    count = 0;

    @state()
    canPost = false;

    @state()
    isSending = false;

    @state()
    cardSuggestions?: AppBskyRichtextFacet.Link[];

    @state()
    isLoadingCard = false;

    @state()
    embed?: AppBskyEmbedExternal.Main;
    embedRendered?: HTMLElement;

    @state()
    imagesToUpload: { alt: string; dataUri: string; data: Uint8Array; mimeType: string }[] = [];

    @query("#message")
    editor?: QuillEditor;

    message: string = "";

    sensitive = false;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    connectedCallback(): void {
        super.connectedCallback();
        document.addEventListener("paste", this.pasteImage);
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        document.removeEventListener("paste", this.pasteImage);
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        this.querySelector("#handles");
    }

    protected willUpdate(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        if (_changedProperties.has("replyTo")) {
            this.replyToRendered = undefined;
        }
        if (_changedProperties.has("quote")) {
            this.quoteRendered = undefined;
        }
    }

    protected updated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {}

    render() {
        const totalCount = 300 - (1 + (this.hashtag?.length ?? 0));

        // FIXME add language detection via tinyld
        // FIXME add image captions via GPT-4, upload as blob to network, send only link to GPT-4
        // FIXME add translations via Google Translate
        // FIXME thread gates https://github.com/bluesky-social/social-app/pull/1954#issuecomment-1816823439

        let placeholder = "";
        if (this.quote) {
            placeholder = this.hashtag
                ? i18n("Write your quote. It will be added to your thread about ${this.hashtag!}.")(this.hashtag!)
                : i18n("Write your quote post.");
            if (!this.quoteRendered) {
                this.quoteRendered = dom(html`<div
                    class="relative flex flex-col border border-divider rounded mx-2 p-2 max-h-[10em] overflow-auto mt-2"
                >
                    ${(this.quote as any).uri.includes("app.bsky.feed.post")
                        ? renderRecord(
                              (this.quote as PostView).author,
                              splitAtUri(this.quote.uri).rkey,
                              this.quote.record as AppBskyFeedPost.Record,
                              (this.quote as PostView).embed,
                              true,
                              false,
                              i18n("Quoting"),
                              undefined,
                              undefined,
                              false,
                              false
                          )
                        : nothing}
                    ${(this.quote as any).uri.includes("app.bsky.feed.generator")
                        ? html`<generator-view .editable=${false} .minimal=${true} .generator=${this.quote}></generator-view>`
                        : nothing}
                    ${(this.quote as any).uri.includes("app.bsky.graph.list")
                        ? html`<list-view .editable=${false} .minimal=${true} .list=${this.quote}></list-view>`
                        : nothing}
                    <button
                        class="absolute right-2 top-2 bg-background rounded-full p-1"
                        @click=${(ev: Event) => {
                            if (!ev.currentTarget) return;
                            const target = ev.currentTarget as HTMLElement;
                            target.parentElement?.classList.add("animate-jump-out");

                            setTimeout(() => {
                                this.quote = undefined;
                            }, 500);
                        }}
                        ?disabled=${this.isSending}
                    >
                        <i class="icon !w-4 !h-4 ${this.isSending ? "fill-muted-fg" : "fill-primary"}">${deleteIcon}</i>
                    </button>
                </div>`)[0];
            }
        } else if (this.replyTo) {
            placeholder = this.hashtag
                ? i18n("Write your reply. It will be added to the thread by ${this.replyTo.author.displayName ?? this.replyTo.author.handle}.")(
                      this.replyTo.author.displayName ?? this.replyTo.author.handle
                  )
                : i18n("Write your reply");
            if (!this.replyToRendered) {
                this.replyToRendered = dom(html`<div class="flex flex-col border border-divider rounded mx-2 p-2 max-h-[10em] overflow-auto mt-2">
                    ${renderRecord(
                        this.replyTo.author,
                        splitAtUri(this.replyTo.uri).rkey,
                        this.replyTo.record as AppBskyFeedPost.Record,
                        this.replyTo.embed,
                        true,
                        false,
                        i18n("Replying to"),
                        undefined,
                        undefined,
                        false,
                        false
                    )}
                    <button
                        class="absolute right-4 top-4 bg-background rounded-full p-1"
                        @click=${(ev: Event) => {
                            if (!ev.currentTarget) return;
                            const target = ev.currentTarget as HTMLElement;
                            target.parentElement?.classList.add("animate-jump-out");

                            setTimeout(() => {
                                this.replyTo = undefined;
                            }, 500);
                        }}
                        ?disabled=${this.isSending}
                    >
                        <i class="icon !w-4 !h-4 ${this.isSending ? "fill-muted-fg" : "fill-primary"}">${deleteIcon}</i>
                    </button>
                </div>`)[0];
            }
        } else {
            placeholder = this.hashtag
                ? i18n("Add a post to your thread about ${this.hashtag!}. The hashtag will be added automatically.")(this.hashtag!)
                : i18n("What's up?");
        }

        return html` <div
            class="flex flex-col max-w-[640px] w-full h-full relative"
            @drop=${(ev: DragEvent) => this.pasteImage(ev)}
            @dragover=${(ev: DragEvent) => ev.preventDefault()}
        >
            ${this.replyToRendered}
            <quill-text-editor
                id="message"
                class="flex-grow max-w-[100vw] overflow-auto"
                .onInput=${(text: string, start: number, end: number, insert: (text: string) => void) => this.input(text, start, end, insert)}
                .initialText=${this.text}
            ></quill-text-editor>
            ${!this.embed && this.imagesToUpload.length == 0 && (this.cardSuggestions?.length ?? 0 > 0)
                ? html`<div class="flex flex-col my-2 mx-2 gap-2">
                      ${map(
                          this.cardSuggestions,
                          (card) =>
                              html`<button
                                  @click=${() => this.addLinkCard(card.uri)}
                                  class="border border-divider rounded py-1 px-4 flex items-center gap-2"
                                  ?disabled=${this.isSending}
                              >
                                  <div class="whitespace-nowrap text-primary">${i18n("Add card")}</div>
                                  <div class="overflow-auto">${card.uri.length > 25 ? card.uri.substring(0, 25) + "..." : card.uri}</div>
                              </button>`
                      )}
                  </div>`
                : nothing}
            ${AppBskyEmbedExternal.isMain(this.embed)
                ? html`<div class="flex relative px-2 items-center justify-center">
                      <div class="w-full">${this.embedRendered}</div>
                      ${this.isLoadingCard
                          ? html`<div class="absolute h-10 flex items-center">
                                <i class="ml-2 icon !w-6 !h-6 fill-primary animate-spin">${spinnerIcon}</i>
                            </div>`
                          : nothing}
                      <button
                          class="absolute right-4 top-4"
                          @click=${(ev: Event) => {
                              if (!ev.currentTarget) return;
                              const target = ev.currentTarget as HTMLElement;
                              target.parentElement?.classList.add("animate-jump-out");

                              setTimeout(() => {
                                  this.embed = undefined;
                                  this.embedRendered = undefined;
                                  this.checkCanPost();
                              }, 500);
                          }}
                          ?disabled=${this.isSending}
                      >
                          ${this.isLoadingCard
                              ? nothing
                              : html`<i class="icon !w-4 !h-4 ${this.isSending ? "fill-muted-fg" : "fill-primary"}">${deleteIcon}</i>`}
                      </button>
                  </div>`
                : nothing}
            ${this.imagesToUpload.length > 0
                ? html`<div class="flex mx-2">
                      ${map(
                          this.imagesToUpload,
                          (image) => html`<div class="w-1/4 relative">
                              <img src="${image.dataUri}" class="animate-jump-in px-1 w-full h-[100px] object-cover rounded" /><button
                                  class="absolute right-2 top-2 bg-background rounded-full p-1"
                                  @click=${(ev: Event) => {
                                      if (!ev.currentTarget) return;
                                      const target = ev.currentTarget as HTMLElement;
                                      this.imagesToUpload = this.imagesToUpload.filter((other) => image != other);
                                  }}
                                  ?disabled=${this.isSending}
                              >
                                  <i class="icon !w-4 !h-4 ${this.isSending ? "fill-muted-fg" : "fill-primary"}">${deleteIcon}</i>
                              </button>
                              <button
                                  class="absolute left-2 top-2 bg-background rounded-full p-1"
                                  @click=${() => {
                                      document.body.append(dom(html`<image-editor .image=${image}></image-editor>`)[0]);
                                  }}
                                  ?disabled=${this.isSending}
                              >
                                  <i class="icon !w-4 !h-4 ${this.isSending ? "fill-muted-fg" : "fill-primary"}">${editIcon}</i>
                              </button>
                          </div>`
                      )}
                  </div>`
                : nothing}
            ${this.quoteRendered}
            ${this.isSending
                ? html`<div class="flex items-center min-h-[48px]">
                      <div class="mx-auto flex items-center">
                          <span class="text-center">${i18n("Sending post")}</span>
                          <i class="ml-2 icon !w-6 !h-6 animate-spin fill-primary">${spinnerIcon}</i>
                      </div>
                  </div>`
                : html`<div class="pl-2 pr-4 py-1 flex items-center min-h-[48px]">
                    ${
                        !this.embed
                            ? html`<button class="p-2" @click=${this.addImage}>
                                  <i class="icon !w-6 !h-6 fill-primary">${imageIcon}</i>
                              </button>`
                            : nothing
                    }
                    ${
                        this.imagesToUpload.length > 0 && !this.embed
                            ? html`<icon-toggle
                                  @change=${(ev: CustomEvent) => (this.sensitive = ev.detail.value)}
                                  .icon=${html`<i class="icon !w-6 !h-6">${shieldIcon}</i>`}
                                  class="h-6"
                              >
                              </icon-toggle>`
                            : nothing
                    }
                    ${
                        this.imagesToUpload.length == 0 && !this.embed
                            ? html`<button class="p-2" @click=${this.addGif} ?disabled=${this.imagesToUpload.length > 0 || this.embed}>
                                  <i class="icon !w-6 !h-6 fill-primary">${gifIcon}</i>
                              </button>`
                            : nothing
                    }
                     <span
                        class="ml-auto mr-2 text-muted-fg text-end text-xs flex items-center ${this.count > totalCount ? "text-red-500" : ""}"
                        >${this.count}/${totalCount}</span
                    >
                    ${
                        this.cancelable
                            ? html`<button
                                  @click=${() => {
                                      this.remove();
                                      this.cancled();
                                  }}
                                  class="ml-2 text-muted-fg my-2 mr-2 px-2 py-1"
                              >
                                  ${i18n("Cancel")}
                              </button>`
                            : nothing
                    }
                    <button
                        @click=${this.sendPost}
                        class="btn"
                        ?disabled=${!this.canPost}
                    >
                        ${i18n("Post")}
                    </button>
                </div>
            </div>`}
        </div>`;
    }

    checkCanPost() {
        const totalCount = 300 - (1 + (this.hashtag?.length ?? 0));
        this.canPost = (this.count > 0 && this.count <= totalCount) || this.imagesToUpload.length > 0 || this.embed != undefined;
    }

    setQuote(post: PostView | undefined) {
        this.quote = post;
        this.replyTo = undefined;
        this.editor?.focus();
    }

    setReply(post: PostView | undefined) {
        this.replyTo = post;
        this.quote = undefined;
        this.editor?.focus();
    }

    pasteImage = async (ev: ClipboardEvent | DragEvent) => {
        if (ev instanceof ClipboardEvent && ev.clipboardData?.types.includes("text/plain")) {
            return;
        }

        if (this.embed) {
            alert(i18n("You can not add an image if you already have a link card"));
            ev.preventDefault();
            return;
        }
        const clipboardItems = ev instanceof ClipboardEvent ? ev.clipboardData?.items : ev.dataTransfer?.items;
        if (!clipboardItems || clipboardItems.length == 0) return;
        let foundItem: DataTransferItem | undefined;
        for (let i = 0; i < clipboardItems.length; i++) {
            const item = clipboardItems[i];
            if (item.kind != "file") continue;
            if (!["image/png", "image/jpeg"].includes(item.type)) continue;
            foundItem = item;
            break;
        }
        if (!foundItem) return;
        ev.preventDefault();
        const file = foundItem.getAsFile();
        if (!file) return;
        const image = await loadImageFile(file);
        if (this.imagesToUpload.length == 4) {
            alert(i18n("You can only upload 4 images per post"));
            return;
        }
        this.imagesToUpload = [...this.imagesToUpload, image];
        this.canPost = true;
    };

    async addImage() {
        if (this.imagesToUpload.length == 4) {
            alert(i18n("You can only upload 4 images per post"));
            return;
        }
        const input = dom(html`<input type="file" id="file" accept=".jpg, .jpeg, .png" class="hidden" multiple />`)[0] as HTMLInputElement;
        document.body.append(input);
        input.addEventListener("change", async () => {
            if (!input.files || input.files.length == 0) return;
            const files = input.files;
            if (this.imagesToUpload.length + (files?.length ?? 0) > 4) {
                alert(i18n("You can only upload 4 images per post"));
                return;
            }
            const images = await loadImageFiles(files);
            this.imagesToUpload = [...this.imagesToUpload, ...images];
            input.remove();
            this.canPost = true;
        });
        input.click();
    }

    async addGif() {
        document.body.append(dom(html`<image-search .selected=${(url: string) => this.addLinkCard(url)}></image-search>`)[0]);
    }

    async addLinkCard(url: string) {
        if (!State.isConnected()) return;

        let atUri: AtUri | undefined;
        if (url.startsWith("https://bsky.app/profile/")) {
            atUri = splitAtUri(url.replaceAll("https://bsky.app/profile/", ""));
        }

        if (url.includes(location.host) && url.includes("/#")) {
            const hash = url.split("#")[1];
            if (hash) {
                const tokens = hash.split("/");
                atUri = { repo: tokens[1], type: tokens[0], rkey: tokens[2] };
                if (atUri.type == "thread") atUri.type = "post";
                if (atUri.type == "list") atUri.type = "lists";
                if (atUri.type == "feed") atUri.type = "feed";
            }
        }

        if (atUri) {
            try {
                let did = atUri.repo;
                if (!atUri.repo.startsWith("did:")) {
                    const response = await State.bskyClient!.app.bsky.actor.getProfile({ actor: did });
                    did = response.data.did;
                }
                if (atUri.type == "post") {
                    const response = await State.getPosts(["at://" + did + "/app.bsky.feed.post/" + atUri.rkey]);
                    if (response instanceof Error) throw response;
                    this.quote = response[0];
                    return;
                }
                if (atUri.type == "lists") {
                    const response = await State.getList("at://" + did + "/app.bsky.graph.list/" + atUri.rkey);
                    if (response instanceof Error) throw response;
                    this.quote = response;
                    return;
                }
                if (atUri.type == "feed") {
                    const response = await State.getFeeds(["at://" + did + "/app.bsky.feed.generator/" + atUri.rkey]);
                    if (response instanceof Error) throw response;
                    this.quote = response[0];
                    return;
                }
            } catch (e) {
                error("Couldn't create card for at-uri", e);
            }
        }

        if (url.includes(location.host) && url.includes("/#")) {
            try {
                const tokens = url.split("#")[0].split("/");
                let did = tokens[1];
                let rkey = tokens[2];
                const response = await State.bskyClient!.app.bsky.actor.getProfile({ actor: did });
                did = response.data.did;

                if (url.includes("#thread/")) {
                    const response = await State.getPosts(["at://" + did + "/app.bsky.feed.post/" + rkey]);
                    if (response instanceof Error) throw response;
                    this.quote = response[0];
                    return;
                }
                if (url.includes("/lists/")) {
                    const response = await State.getList("at://" + did + "/app.bsky.graph.list/" + rkey);
                    if (response instanceof Error) throw response;
                    this.quote = response;
                    return;
                }
                if (url.includes("/feed/")) {
                    const response = await State.getFeeds(["at://" + did + "/app.bsky.feed.generator/" + rkey]);
                    if (response instanceof Error) throw response;
                    this.quote = response[0];
                    return;
                }
            } catch (e) {
                error("Couldn't load post", e);
            }
        }

        let cardEmbed: AppBskyEmbedExternal.Main = {
            $type: "app.bsky.embed.external",
            external: {
                uri: url,
                title: "",
                description: "",
            },
        };
        this.embed = cardEmbed;
        this.isLoadingCard = true;
        try {
            const linkCard = await extractLinkCard(url);
            if (linkCard instanceof Error) return;
            let imageBlob: BlobRef | undefined;
            if (linkCard.image && linkCard.image.length > 0) {
                const originalImageData = await downloadImage(linkCard.image);
                if (originalImageData instanceof Error) {
                    console.error(originalImageData);
                } else {
                    const imageData = await downscaleImage(originalImageData);
                    if (imageData instanceof Error) console.error(imageData);
                    else {
                        try {
                            const response = await State.bskyClient!.com.atproto.repo.uploadBlob(imageData.data, {
                                headers: { "Content-Type": imageData.mimeType },
                                encoding: "",
                            });
                            if (response.success) {
                                imageBlob = response.data.blob;
                            }
                        } catch (e) {
                            linkCard.image = "";
                        }
                    }
                }
            }
            cardEmbed = {
                $type: "app.bsky.embed.external",
                external: {
                    uri: url,
                    title: linkCard.title,
                    description: linkCard.description,
                    thumb: imageBlob,
                    image: linkCard.image,
                } as AppBskyEmbedExternal.External,
            };
            this.embed = cardEmbed;
            this.embedRendered = dom(renderEmbed(this.embed, false))[0];
            this.canPost = true;
        } catch (e) {
            console.log("Couldn't load card", e);
        } finally {
            this.isLoadingCard = false;
        }
    }

    lastValue = "";
    input(text: string, cursorStart: number, cursorEnd: number, insert: (text: string) => void) {
        this.count = text.length;
        this.checkCanPost();
        /*if (!this.fullscreen) {
            // FIXME
            this.editor!.style.height = "auto";
            this.editor!.style.height = Math.min(16 * 15, this.editor!.scrollHeight) + "px";
        }*/
        this.message = text;
        if (cursorStart == cursorEnd && this.lastValue != this.message) {
            const charBeforeCursor = text.charAt(cursorStart - 1);
            if (charBeforeCursor === "@") {
                document.body.append(
                    dom(
                        html`<actor-search-overlay
                            .selectedActor=${(actor: ProfileView) => insert(actor.handle.replace("@", "") + " ")}
                            .cancled=${() => {
                                requestAnimationFrame(() => {
                                    this.editor?.focus();
                                });
                            }}
                        ></actor-search-overlay>`
                    )[0]
                );
            }
        }
        this.lastValue = text;

        const rt = new RichText({ text });
        rt.detectFacetsWithoutResolution();
        if (rt.facets) {
            const cardSuggestions: AppBskyRichtextFacet.Link[] = [];
            for (const facet of rt.facets) {
                for (const feature of facet.features) {
                    if (AppBskyRichtextFacet.isLink(feature)) {
                        cardSuggestions.push(feature);
                    }
                }
            }
            this.cardSuggestions = cardSuggestions.length > 0 ? cardSuggestions : undefined;
        } else {
            this.cardSuggestions = undefined;
        }
    }

    async sendPost() {
        const user = Store.getUser();
        if (!user) return;
        if (!State.isConnected) return;
        try {
            this.isSending = true;
            this.canPost = false;
            this.requestUpdate();
            const text = (this.message + (this.hashtag ? ` ${this.hashtag}` : "")).trimEnd();
            const richText = new RichText({ text });
            await State.detectFacets(richText!);

            const imagesEmbed: AppBskyEmbedImages.Main = {
                $type: "app.bsky.embed.images",
                images: [],
            };
            for (const image of this.imagesToUpload) {
                const start = performance.now();
                const data = await downscaleImage(image);
                if (data instanceof Error) throw data;
                console.log(
                    "Downscaling image took: " + (performance.now() - start) / 1000 + ", old: " + image.data.length + ", new: " + data.data.length
                );
                const response = await State.bskyClient!.com.atproto.repo.uploadBlob(data.data, {
                    headers: { "Content-Type": image.mimeType },
                    encoding: "",
                });
                if (response.success) {
                    imagesEmbed.images.push({ alt: image.alt, image: response.data.blob });
                } else {
                    throw new Error();
                }
            }
            const labels: SelfLabels | undefined = this.sensitive
                ? { $type: "com.atproto.label.defs#selfLabels", values: [{ val: "porn" }] }
                : undefined;

            const externalOrMediaEmbed = this.embed ?? (imagesEmbed.images.length > 0 ? imagesEmbed : undefined);
            let quoteEmbed: ComAtprotoRepoStrongRef.Main | undefined;
            if (this.quote) quoteEmbed = { uri: (this.quote as any).uri, cid: (this.quote as any).cid };
            let embed: AppBskyFeedPost.Record["embed"];
            if (quoteEmbed && externalOrMediaEmbed) {
                const recordWithMediaEmbed: AppBskyEmbedRecordWithMedia.Main = {
                    $type: "app.bsky.embed.recordWithMedia",
                    media: externalOrMediaEmbed,
                    record: {
                        record: quoteEmbed,
                    },
                };
                embed = recordWithMediaEmbed;
            } else if (quoteEmbed) {
                const recordEmbed: AppBskyEmbedRecord.Main = {
                    $type: "app.bsky.embed.record",
                    record: quoteEmbed,
                };
                embed = recordEmbed;
            } else {
                embed = externalOrMediaEmbed;
            }

            let record: AppBskyFeedPost.Record = {
                $type: "app.bsky.feed.post",
                text: richText.text,
                facets: richText.facets,
                createdAt: new Date().toISOString(),
                embed,
                labels,
            };

            let hashTagThread = !this.replyTo && this.hashtag ? user.hashTagThreads[this.hashtag] : undefined;
            if (hashTagThread) {
                record = {
                    ...record,
                    reply: hashTagThread,
                };
            }

            if (this.replyTo && AppBskyFeedPost.isRecord(this.replyTo.record)) {
                const parent = {
                    uri: this.replyTo.uri,
                    cid: this.replyTo.cid,
                };

                const root = this.replyTo.record.reply ? this.replyTo.record.reply.root : parent;
                record = {
                    ...record,
                    reply: {
                        root,
                        parent,
                    },
                };
            }

            const post = await State.createPost(record);
            if (post instanceof Error) throw post;

            if (!this.replyTo && this.hashtag) {
                if (!hashTagThread) {
                    hashTagThread = { root: post, parent: post };
                    user.hashTagThreads[this.hashtag] = hashTagThread;
                }
                hashTagThread.parent = post;
                Store.setUser(user);
            }
            this.count = 0;
            this.editor!.setText("");
            this.editor!.style.height = "auto";
            this.editor!.style.height = this.editor!.scrollHeight + "px";
            this.embed = undefined;
            this.embedRendered = undefined;
            this.cardSuggestions = undefined;
            this.imagesToUpload.length = 0;
            this.replyTo = undefined;
            this.quote = undefined;
            if (this.cancelable) {
                this.cancled();
                this.remove();
            }
            this.sent(post);
        } catch (e) {
            console.error(e);
            alert(i18n("Couldn't send post"));
        } finally {
            this.canPost = true;
            this.isSending = false;
        }
    }
}

@customElement("image-editor")
export class ImageEditor extends Overlay {
    @property()
    image?: ImageInfo;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    renderHeader(): TemplateResult {
        return html`${renderTopbar("Edit Image", this.closeButton())}`;
    }

    renderContent(): TemplateResult {
        const dataUri = this.image ? this.image.dataUri : "";
        const alt = this.image ? this.image.alt : "";
        return html`<img src="${dataUri}" class="object-contain max-h-[75svh]" />
            <textarea
                id="message"
                @input=${(ev: Event) => {
                    if (this.image) {
                        this.image.alt = (ev.target as HTMLInputElement)!.value;
                    }
                }}
                class="flex-1 break-words max-h-[11.5em] resize-none outline-none bg-transparent px-2 pt-2"
                placeholder="${i18n("Add alt text to your image")}"
            >
${alt}</textarea
            >`;
    }
}

@customElement("post-editor-overlay")
export class PostEditorOverlay extends CloseableElement {
    @property()
    text = "";

    @property()
    bskyClient?: BskyAgent;

    @property()
    quote?: PostView;

    @property()
    replyTo?: PostView;

    @property()
    sent: (post: PostView) => void = () => {};

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    resizeInner = (ev: any) => {
        (this.renderRoot.querySelector("post-editor") as HTMLElement).style.height = visualViewport?.height + "px";
    };
    reszie = (ev: any) => this.resizeInner(ev);

    connectedCallback(): void {
        super.connectedCallback();
        if (isMobileBrowser()) visualViewport?.addEventListener("resize", this.resizeInner);
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        if (isMobileBrowser()) visualViewport?.removeEventListener("resize", this.resizeInner);
    }

    protected render() {
        const user = Store.getUser();
        if (!user || !State.isConnected()) return nothing;
        return html`<div class="fixed top-0 left-0 w-full h-[100svh] max-h-full backdrop-blur z-10">
            <div
                class="flex ${isMobileBrowser()
                    ? "h-full"
                    : "min-h-[200px] max-h-[80vh] mt-4 border pt-2 border-divider rounded-md shadow dark:shadow-white/10 overflow-x-clip"} justify-center max-w-[640px] mx-auto bg-background"
            >
                <post-editor
                    class="animate-fade animate-duration-[250ms] w-[640px]"
                    .cancelable=${true}
                    .cancled=${() => this.close()}
                    .quote=${this.quote}
                    .replyTo=${this.replyTo}
                    .sent=${(post: PostView) => navigationGuard.afterNextPopstate.push(() => this.sent(post))}
                    .fullscreen=${isMobileBrowser()}
                    .text=${this.text}
                ></post-editor>
            </div>
        </div>`;
    }
}

@customElement("test-editor")
export class TextEditor extends LitElement {
    constructor() {
        super();
        // Bind the handlers to keep 'this' reference
        this.handleViewportResize = this.handleViewportResize.bind(this);
    }

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        document.body.classList.add("overflow-hidden");
        if (window.visualViewport) {
            // If Visual Viewport API is supported, listen for its resize events
            window.visualViewport.addEventListener("resize", this.handleViewportResize);
        } else {
            // Fallback: Listen for window resize events and focus events on the input
            window.addEventListener("resize", this.handleFallbackResize);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        document.body.classList.remove("overflow-hidden");
        if (window.visualViewport) {
            window.visualViewport.removeEventListener("resize", this.handleViewportResize);
        } else {
            window.removeEventListener("resize", this.handleFallbackResize);
        }
    }

    render() {
        return html`
            <div class="absolute top-0 left-0 w-full h-full backdrop-blur z-10 flex flex-col" id="overlay">
                <post-editor class="flex-grow h-full"></post-editor>
            </div>
        `;
    }

    handleViewportResize() {
        // Adjust the overlay size based on the visual viewport
        const overlay = this.querySelector("#overlay") as HTMLElement;
        overlay.style.height = `${window.visualViewport!.height}px`;
        document.body.style.height = `${window.visualViewport!.height}px`;
        document.documentElement.style.height = `${window.visualViewport!.height}px`;
    }

    handleFallbackResize() {
        // Fallback resize handler for browsers without Visual Viewport API
        const overlay = this.querySelector("#overlay") as HTMLElement;
        overlay.style.height = "100vh"; // Full viewport height
        document.body.style.height = "";
        document.documentElement.style.height = "";
    }

    private _onSubmit() {
        // Handle the submit action
    }
}

export function showPost(post: PostView) {
    document.body.append(dom(html`<thread-overlay .postUri=${post.uri}></post-editor-overly>`)[0]);
}

export function quote(post: PostView) {
    document.body.append(dom(html`<post-editor-overlay .quote=${post} .sent=${(newPost: PostView) => showPost(newPost)}></post-editor-overly>`)[0]);
}

export function reply(post: PostView) {
    document.body.append(dom(html`<post-editor-overlay .replyTo=${post} .sent=${(newPost: PostView) => showPost(newPost)}></post-editor-overly>`)[0]);
}

export async function deletePost(post: PostView) {
    if (!State.isConnected()) return;
    const result = await State.deletePost(post.uri);
    if (result instanceof Error) {
        alert(i18n("Couldn't delete post"));
        return;
    }
}
