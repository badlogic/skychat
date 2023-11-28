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
import {
    ImageInfo,
    dom,
    downloadImage,
    downscaleImage,
    error,
    getCaretPosition,
    isMobileBrowser,
    loadImageFile,
    loadImageFiles,
    splitAtUri,
} from "../utils";
import { CloseableElement, Overlay, navigationGuard, renderTopbar } from "./overlay";
import { renderEmbed, renderRecord, renderRichText } from "./posts";

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

    @property()
    replyTo?: PostView;

    @property()
    hashtag?: string;

    @property()
    fullscreen = false;

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
    messageElement?: TextEditor;

    @query("#handles")
    handlesElement?: HTMLTextAreaElement;

    message: string = "";

    sensitive = false;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    connectedCallback(): void {
        super.connectedCallback();
        document.addEventListener("paste", this.pasteImage);
        document.body.classList.add("overflow-hidden");
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        document.removeEventListener("paste", this.pasteImage);
        document.body.classList.remove("overflow-hidden");
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        this.querySelector("#handles");
    }

    protected updated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        if (this.handlesElement) {
            const caret = this.messageElement ? getCaretPosition(this.messageElement.editable!) : { x: 0, y: 0 };
            this.handlesElement.style.top = caret.y + 32 + "px";
        }
    }

    insertSuggestion(handle: string) {
        if (!this.messageElement) return;

        const replaceSubstring = (original: string, startIndex: number, endIndex: number, replacement: string) => {
            if (startIndex < 0 || startIndex >= original.length || endIndex < startIndex || endIndex > original.length) {
                throw new Error("Invalid indices");
            }
            const prefix = original.substring(0, startIndex);
            const suffix = original.substring(endIndex);
            return prefix + replacement + suffix;
        };

        const start = (this.messageElement?.editable?.selectionStart ?? 0) - 1;
        const end = start + 1;
        this.messageElement.editable!.value = replaceSubstring(this.messageElement.editable!.value, start, end, handle + " ");
        this.message = this.messageElement?.editable!.value;
        this.messageElement.editable!.selectionStart = start + (handle + " ").length;
        this.messageElement.editable!.selectionEnd = start + (handle + " ").length;
        this.messageElement.editable!.focus();
        this.messageElement.requestUpdate();
    }

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
        } else if (this.replyTo) {
            placeholder = this.hashtag
                ? i18n("Write your reply. It will be added to the thread by ${this.replyTo.author.displayName ?? this.replyTo.author.handle}.")(
                      this.replyTo.author.displayName ?? this.replyTo.author.handle
                  )
                : i18n("Write your reply");
        } else {
            placeholder = this.hashtag
                ? i18n("Add a post to your thread about ${this.hashtag!}. The hashtag will be added automatically.")(this.hashtag!)
                : i18n("What's up?");
        }

        return html` <div class="flex max-w-[640px] ${this.fullscreen ? "h-full max-h-full" : ""}">
            <div
                class="flex flex-col flex-grow relative"
                @drop=${(ev: DragEvent) => this.pasteImage(ev)}
                @dragover=${(ev: DragEvent) => ev.preventDefault()}
            >
                ${this.replyTo
                    ? html`<div class="flex flex-col border border-divider rounded mx-2 p-2 max-h-[10em] overflow-auto mt-2">
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
                      </div>`
                    : nothing}
                <text-editor
                    id="message"
                    class="${this.fullscreen ? "flex-grow" : "min-h-[64px]"} max-w-[100vw]"
                    .onInput=${(ev: any) => this.input(ev)}
                    .fullscreen=${this.fullscreen}
                ></text-editor>
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
                          ${this.isLoadingCard ? html`<i class="absolute ml-2 icon !w-6 !h-6 fill-primary animate-spin">${spinnerIcon}</i>` : nothing}
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
                ${this.quote
                    ? html`<div class="relative flex flex-col border border-divider rounded mx-2 p-2 max-h-[10em] overflow-auto mt-2">
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
                      </div>`
                    : nothing}
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
            </div>
        </div>`;
    }

    checkCanPost() {
        const totalCount = 300 - (1 + (this.hashtag?.length ?? 0));
        this.canPost = (this.count > 0 && this.count <= totalCount) || this.imagesToUpload.length > 0 || this.embed != undefined;
    }

    setQuote(post: PostView | undefined) {
        this.quote = post;
        this.replyTo = undefined;
        this.messageElement?.focus();
    }

    setReply(post: PostView | undefined) {
        this.replyTo = post;
        this.quote = undefined;
        this.messageElement?.focus();
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

        if (url.startsWith("https://bsky.app/profile/")) {
            try {
                const atUri = splitAtUri(url.replaceAll("https://bsky.app/profile/", ""));
                let did = atUri.repo;
                if (!atUri.repo.startsWith("did:")) {
                    const response = await State.bskyClient!.app.bsky.actor.getProfile({ actor: did });
                    did = response.data.did;
                }
                if (url.includes("/post/")) {
                    const response = await State.getPosts(["at://" + did + "/app.bsky.feed.post/" + atUri.rkey]);
                    if (response instanceof Error) throw response;
                    this.quote = response[0];
                    return;
                }
                if (url.includes("/lists/")) {
                    const response = await State.getList("at://" + did + "/app.bsky.graph.list/" + atUri.rkey);
                    if (response instanceof Error) throw response;
                    this.quote = response;
                    return;
                }
                if (url.includes("/feed/")) {
                    const response = await State.getFeeds(["at://" + did + "/app.bsky.feed.generator/" + atUri.rkey]);
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
    input(ev: InputEvent) {
        const message = ev.target as HTMLTextAreaElement;
        this.count = message.value.length;
        this.checkCanPost();
        if (!this.fullscreen) {
            message.style.height = "auto";
            message.style.height = Math.min(16 * 15, message.scrollHeight) + "px";
        }
        this.message = message.value;
        if (message.selectionStart === message.selectionEnd && this.lastValue != this.message) {
            const position = message.selectionStart;
            const charBeforeCursor = message.value.charAt(position - 1);
            if (charBeforeCursor === "@") {
                document.body.append(
                    dom(
                        html`<actor-search-overlay
                            .selectedActor=${(actor: ProfileView) => this.insertSuggestion("@" + actor.handle.replace("@", ""))}
                            .cancled=${() => {
                                requestAnimationFrame(() => {
                                    message.focus();
                                });
                            }}
                        ></actor-search-overlay>`
                    )[0]
                );
            }
        }
        this.lastValue = message.value;

        const rt = new RichText({ text: message.value });
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
            const richText = new RichText({ text: this.message + (this.hashtag ? ` ${this.hashtag}` : "") });
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
            this.messageElement!.editable!.value = "";
            this.count = 0;
            this.messageElement!.style.height = "auto";
            this.messageElement!.style.height = this.messageElement!.scrollHeight + "px";
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
        document.body.classList.add("overflow-hidden");
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        if (isMobileBrowser()) visualViewport?.removeEventListener("resize", this.resizeInner);
        document.body.classList.remove("overflow-hidden");
    }

    protected render() {
        const user = Store.getUser();
        if (!user || !State.isConnected()) return nothing;
        return html`<div class="fixed top-0 w-full h-[100svh] max-h-full backdrop-blur z-10">
            <div
                class="flex ${isMobileBrowser()
                    ? "h-full"
                    : "mt-4 border border-divider rounded-md shadow dark:shadow-white/10 overflow-x-clip"} justify-center max-w-[640px] mx-auto bg-background"
            >
                <post-editor
                    class="animate-fade animate-duration-[250ms] w-[640px]"
                    .cancelable=${true}
                    .cancled=${() => this.close()}
                    .quote=${this.quote}
                    .replyTo=${this.replyTo}
                    .sent=${(post: PostView) => navigationGuard.afterNextPopstate.push(() => this.sent(post))}
                    .fullscreen=${isMobileBrowser()}
                ></post-editor>
            </div>
        </div>`;
    }
}

@customElement("actor-search-overlay")
export class ActorSearchOverlay extends Overlay {
    @query("#search")
    searchElement?: HTMLInputElement;

    @state()
    searchResult: ProfileView[] = [];

    @property()
    selectedActor = (actor: ProfileView) => {};

    @property()
    cancled = () => {};

    callCancel = true;

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.searchElement?.focus();
    }

    renderHeader(): TemplateResult {
        return html`<div class="sticky top-2 search bg-background flex items-center gap-2 fancy-shadow mt-2 mx-4">
            <i class="icon !w-5 !h-5 fill-muted-fg">${atIcon}</i>
            <input
                @input=${() => this.handleSearch()}
                id="search"
                class="flex-grow bg-transparent"
                placeholder="${i18n("Search for") + i18n("Users") + " ..."}"
                autocomplete="off"
            />
            <button
                @click=${() => {
                    this.close();
                }}
            >
                <i class="icon !w-5 !h-5 fill-muted-fg hover:fill-primary">${closeIcon}</i>
            </button>
        </div>`;
    }

    close() {
        super.close();
        if (this.callCancel) this.cancled();
    }

    renderContent(): TemplateResult {
        return html`<div class="px-4 mt-2 w-full flex flex-col bg-background rounded">
            ${map(
                this.searchResult,
                (actor) => html` <button
                    @click=${() => {
                        this.selectedActor(actor);
                        this.callCancel = false;
                        this.close();
                    }}
                    class="flex items-center gap-2 p-2 border-bottom border-muted hover:bg-primary hover:text-primary-fg"
                >
                    ${actor.avatar
                        ? html`<img class="w-6 h-6 rounded-full" src="${actor.avatar}" />`
                        : html`<i class="icon !w-6 !h-6">${defaultAvatar}</i>`}
                    <span class="truncate">${actor.displayName ?? actor.handle}</span>
                    <span class="ml-auto text-muted-fg text-sm line-clamp-1">${actor.displayName ? actor.handle : ""}</span>
                </button>`
            )}
        </div>`;
    }

    async handleSearch() {
        const response = await State.bskyClient?.app.bsky.actor.searchActorsTypeahead({
            limit: 25,
            q: this.searchElement!.value,
        });
        if (!response?.success) {
            this.searchResult = [];
        } else {
            this.searchResult = response.data.actors;
        }
    }
}

@customElement("text-editor")
export class TextEditor extends LitElement {
    @query("#editable")
    editable?: HTMLTextAreaElement;

    @query("#highlights")
    highlights?: HTMLDivElement;

    @property()
    fullscreen = false;

    @property()
    placeholder = "";

    @property()
    onInput: (ev: any) => void = () => {};

    @property()
    onKeydown: (ev: KeyboardEvent) => void = () => {};

    @property()
    onKeyup: (ev: KeyboardEvent) => void = () => {};

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        this.editable?.focus();
    }

    render() {
        return html`
            <div class="relative flex ${this.fullscreen ? "w-full h-full" : "min-h-[64px]"}">
                <div
                    id="highlights"
                    class="whitespace-pre-wrap flex-grow overflow-auto outline-none bg-transparent dark:text-white p-4 !break-words"
                    aria-hidden="true"
                ></div>
                <textarea
                    id="editable"
                    class="absolute overflow-none top-0 left-0 w-full h-full resize-none outline-none bg-transparent text-transparent caret-black dark:caret-white p-4 !break-words"
                    @input=${(ev: any) => this.handleInput(ev)}
                    @selectionchanged=${(ev: any) => this.handleInput(ev)}
                    @scroll="${this.syncScroll}"
                    @keydown=${(ev: KeyboardEvent) => this.onKeydown(ev)}
                    @keyup=${(ev: KeyboardEvent) => this.onKeyup(ev)}
                    placeholder="${this.placeholder}"
                ></textarea>
            </div>
        `;
    }

    handleInput(e: any) {
        const target = e.target as HTMLTextAreaElement;
        this.onInput(e);
        this.requestUpdate();
    }

    renderHighlights(text: string) {
        if (text[text.length - 1] == "\n") text += " ";
        const rt = new RichText({ text });
        rt.detectFacetsWithoutResolution();
        if (this.highlights) {
            const textDom = dom(renderRichText(rt));
            this.highlights.innerHTML = "";
            for (const node of textDom) {
                this.highlights.append(node);
            }
        }
    }

    protected updated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        if (this.highlights && this.editable) {
            this.renderHighlights(this.editable.value);
            this.syncScroll();
        }
    }

    syncScroll() {
        if (this.highlights && this.editable) {
            this.highlights.scrollTop = this.editable.scrollTop;
            this.highlights.style.height = this.editable.style.height;
        }
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

export async function deletePost(post: PostView, postDom: HTMLElement) {
    if (!State.isConnected()) return;
    const result = await State.deletePost(post.uri);
    if (result instanceof Error) {
        alert(i18n("Couldn't delete post"));
        return;
    }
}
