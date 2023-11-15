import {
    AppBskyEmbedExternal,
    AppBskyEmbedImages,
    AppBskyEmbedRecord,
    AppBskyEmbedRecordWithMedia,
    AppBskyFeedDefs,
    AppBskyFeedPost,
    AppBskyRichtextFacet,
    BlobRef,
    BskyAgent,
    RichText,
    RichtextNS,
} from "@atproto/api";
import { ProfileViewBasic } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { SelfLabels } from "@atproto/api/dist/client/types/com/atproto/label/defs";
import { LitElement, PropertyValueMap, TemplateResult, html, nothing, svg } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { map } from "lit/directives/map.js";
import { bskyClient, extractLinkCard } from "../bsky";
import { deleteIcon, editIcon, imageIcon, spinnerIcon } from "../icons";
import { Store } from "../store";
import {
    Caret,
    ImageInfo,
    dom,
    downloadImage,
    downscaleImage,
    getCaretCoordinates,
    isMobileBrowser,
    loadImageFile,
    loadImageFiles,
    splitAtUri,
} from "../utils";
import { renderEmbed, renderPostText, renderRecord } from "./posts";
import { CloseableElement, Overlay, navigationGuard, renderTopbar } from "./overlay";
import { i18n } from "../i18n";

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
    quote?: PostView;

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
    handleSuggestions?: ProfileViewBasic[];
    insert?: { start: number; end: number };

    @state()
    cardSuggestions?: AppBskyRichtextFacet.Link[];

    @state()
    isLoadingCard = false;

    @state()
    embed?: AppBskyEmbedExternal.Main;

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
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        document.removeEventListener("paste", this.pasteImage);
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        this.querySelector("#handles");
    }

    protected updated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        if (this.handlesElement) {
            const caret: Caret = this.messageElement
                ? getCaretCoordinates(this.messageElement.editable!, this.messageElement.editable!.selectionEnd)
                : { top: 0, left: 0, height: 32 };
            this.handlesElement.style.top = caret.top + 32 + "px";
        }
    }

    render() {
        const totalCount = 300 - (1 + (this.hashtag?.length ?? 0));
        const replaceSubstring = (original: string, startIndex: number, endIndex: number, replacement: string) => {
            if (startIndex < 0 || startIndex >= original.length || endIndex < startIndex || endIndex > original.length) {
                throw new Error("Invalid indices");
            }
            const prefix = original.substring(0, startIndex);
            const suffix = original.substring(endIndex);
            return prefix + replacement + suffix;
        };

        const insertSuggestion = (handle: string) => {
            if (!this.messageElement) return;
            if (!this.insert) return;
            this.messageElement.editable!.value = replaceSubstring(
                this.messageElement.editable!.value,
                this.insert.start,
                this.insert.end,
                handle + " "
            );
            this.message = this.messageElement?.editable!.value;
            this.handleSuggestions = [];
            this.insert = undefined;
            this.messageElement.editable?.focus();
            this.messageElement.requestUpdate();
        };

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

        return html` <div class="flex max-w-[600px] ${this.fullscreen ? "h-full" : ""} bg-white dark:bg-black">
            <div
                class="flex flex-col flex-grow relative"
                @drop=${(ev: DragEvent) => this.pasteImage(ev)}
                @dragover=${(ev: DragEvent) => ev.preventDefault()}
            >
                ${this.replyTo
                    ? html`<div class="flex flex-col border border-gray rounded mx-2 p-2 max-h-[10em] overflow-auto mt-2">
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
                              class="absolute right-4 top-4 bg-black rounded-full p-1"
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
                              <i class="icon w-4 h-4 ${this.isSending ? "fill-gray" : ""}">${deleteIcon}</i>
                          </button>
                      </div>`
                    : nothing}
                <text-editor
                    id="message"
                    class="${this.fullscreen ? "flex-grow" : "min-h-[120px]"}"
                    .onInput=${(ev: any) => this.input(ev)}
                    .fullscreen=${this.fullscreen}
                ></text-editor>
                ${!this.embed && this.imagesToUpload.length == 0 && (this.cardSuggestions?.length ?? 0 > 0)
                    ? html`<div class="flex flex-col my-2 mx-2 gap-2">
                          ${map(
                              this.cardSuggestions,
                              (card) =>
                                  html`<button
                                      @click=${() => this.addLinkCard(card)}
                                      class="border border-gray rounded py-1 px-4 flex items-center gap-2"
                                      ?disabled=${this.isSending}
                                  >
                                      <div class="whitespace-nowrap text-blue-500">${i18n("Add card")}</div>
                                      <div class="overflow-auto">${card.uri.length > 25 ? card.uri.substring(0, 25) + "..." : card.uri}</div>
                                  </button>`
                          )}
                      </div>`
                    : nothing}
                ${AppBskyEmbedExternal.isMain(this.embed)
                    ? html`<div class="flex relative px-2 items-center justify-center">
                          <div class="w-full">${renderEmbed(this.embed, false)}</div>
                          ${this.isLoadingCard ? html`<i class="absolute ml-2 icon w-6 h-6 animate-spin">${spinnerIcon}</i>` : nothing}
                          <button
                              class="absolute right-4 top-4"
                              @click=${(ev: Event) => {
                                  if (!ev.currentTarget) return;
                                  const target = ev.currentTarget as HTMLElement;
                                  target.parentElement?.classList.add("animate-jump-out");

                                  setTimeout(() => {
                                      this.embed = undefined;
                                      this.checkCanPost();
                                  }, 500);
                              }}
                              ?disabled=${this.isSending}
                          >
                              ${this.isLoadingCard ? nothing : html`<i class="icon w-4 h-4 ${this.isSending ? "fill-gray" : ""}">${deleteIcon}</i>`}
                          </button>
                      </div>`
                    : nothing}
                ${this.imagesToUpload.length > 0
                    ? html`<div class="flex mx-2">
                          ${map(
                              this.imagesToUpload,
                              (image) => html`<div class="w-1/4 relative">
                                  <img src="${image.dataUri}" class="animate-jump-in px-1 w-full h-[100px] object-cover" /><button
                                      class="absolute right-2 top-2 bg-black rounded-full p-1"
                                      @click=${(ev: Event) => {
                                          if (!ev.currentTarget) return;
                                          const target = ev.currentTarget as HTMLElement;
                                          this.imagesToUpload = this.imagesToUpload.filter((other) => image != other);
                                      }}
                                      ?disabled=${this.isSending}
                                  >
                                      <i class="icon w-4 h-4 ${this.isSending ? "fill-gray" : ""}">${deleteIcon}</i>
                                  </button>
                                  <button
                                      class="absolute left-2 top-2 bg-black rounded-full p-1"
                                      @click=${() => {
                                          document.body.append(dom(html`<image-editor .image=${image}></image-editor>`)[0]);
                                      }}
                                      ?disabled=${this.isSending}
                                  >
                                      <i class="icon w-4 h-4 ${this.isSending ? "fill-gray" : ""}">${editIcon}</i>
                                  </button>
                              </div>`
                          )}
                      </div>`
                    : nothing}
                ${this.quote
                    ? html`<div class="relative flex flex-col border border-gray rounded mx-2 p-2 max-h-[10em] overflow-auto mt-2">
                          ${renderRecord(
                              this.quote.author,
                              splitAtUri(this.quote.uri).rkey,
                              this.quote.record as AppBskyFeedPost.Record,
                              this.quote.embed,
                              true,
                              false,
                              i18n("Quoting"),
                              undefined,
                              undefined,
                              false,
                              false
                          )}
                          <button
                              class="absolute right-2 top-2 bg-black rounded-full p-1"
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
                              <i class="icon w-4 h-4 ${this.isSending ? "fill-gray" : ""}">${deleteIcon}</i>
                          </button>
                      </div>`
                    : nothing}
                ${this.isSending
                    ? html`<div class="flex items-center min-h-[48px]">
                          <div class="mx-auto flex items-center">
                              <span class="text-center">${i18n("Sending post")}</span>
                              <i class="ml-2 icon w-6 h-6 animate-spin">${spinnerIcon}</i>
                          </div>
                      </div>`
                    : html`<div class="flex items-center min-h-[48px]">
                    <button class="p-2 disabled:fill-gray" @click=${this.addImage} ?disabled=${this.embed || this.isSending}>
                        <i class="icon w-6 h-6 ${this.embed || this.isSending ? "fill-gray" : ""}">${imageIcon}</i>
                    </button>
                    ${
                        this.imagesToUpload.length > 0
                            ? html`<icon-toggle @change=${(ev: CustomEvent) => (this.sensitive = ev.detail.value)} icon="shield" class="h-6">
                              </icon-toggle>`
                            : nothing
                    }
                    </button>
                     <span
                        class="ml-auto mr-2 bg-transparent dark:text-gray text-end text-xs flex items-center ${
                            this.count > totalCount ? "text-red dark:text-red" : ""
                        }"
                        >${this.count}/${totalCount}</span
                    >
                    ${
                        this.cancelable
                            ? html`<button
                                  @click=${() => {
                                      this.remove();
                                      this.cancled();
                                  }}
                                  class="ml-2 text-gray/80 dark:text-white/80 my-2 mr-2 px-2 py-1"
                              >
                                  ${i18n("Cancel")}
                              </button>`
                            : nothing
                    }
                    <button
                        @click=${this.sendPost}
                        class="bg-primary text-white my-2 mr-2 px-4 py-1 rounded disabled:bg-gray/70 disabled:text-white/70"
                        ?disabled=${!this.canPost}
                    >
                        ${i18n("Post")}
                    </button>
                </div>
                ${
                    this.handleSuggestions && this.handleSuggestions.length > 0
                        ? html`<div id="handles" class="mx-auto flex flex-col bg-white dark:bg-black border border-gray rounded fixed max-w-[100vw]">
                              ${map(
                                  this.handleSuggestions,
                                  (suggestion) => html` <button
                                      @click=${() => insertSuggestion(suggestion.handle)}
                                      class="flex items-center gap-2 p-2 border-bottom border-gray hover:bg-primary hover:text-white"
                                  >
                                      ${suggestion.avatar
                                          ? html`<img class="w-6 h-6 rounded-full" src="${suggestion.avatar}" />`
                                          : html`<i class="icon w-6 h-6">${defaultAvatar}</i>`}
                                      <span class="truncate">${suggestion.displayName ?? suggestion.handle}</span>
                                      <span class="ml-auto text-gray text-sm">${suggestion.displayName ? suggestion.handle : ""}</span>
                                  </button>`
                              )}
                          </div>`
                        : nothing
                }
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
        });
        input.click();
        this.canPost = true;
    }

    async addLinkCard(card: AppBskyRichtextFacet.Link) {
        if (!bskyClient) return;
        let cardEmbed: AppBskyEmbedExternal.Main = {
            $type: "app.bsky.embed.external",
            external: {
                uri: card.uri,
                title: "",
                description: "",
            },
        };
        this.embed = cardEmbed;
        this.isLoadingCard = true;
        try {
            const linkCard = await extractLinkCard(card.uri);
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
                            const response = await bskyClient.com.atproto.repo.uploadBlob(imageData.data, {
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
                    uri: card.uri,
                    title: linkCard.title,
                    description: linkCard.description,
                    thumb: imageBlob,
                    image: linkCard.image,
                } as AppBskyEmbedExternal.External,
            };
            this.embed = cardEmbed;
            this.canPost = true;
        } catch (e) {
            console.log("Couldn't load card", e);
        } finally {
            this.isLoadingCard = false;
        }
    }

    isInHandle(text: string, cursorPosition: number, found: (match: string, start: number, end: number) => void, notFound: () => void) {
        const findTextAfterAt = (text: string, startIndex: number) => {
            let endIndex = startIndex;
            while (endIndex < text.length && !/\s/.test(text[endIndex])) {
                endIndex++;
            }
            return {
                text: text.slice(startIndex, endIndex),
                startIndex,
                endIndex,
            };
        };

        for (let i = cursorPosition - 1; i >= 0; i--) {
            if (/\s/.test(text[i])) break;
            if (text[i] === "@") {
                const result = findTextAfterAt(text, i + 1);
                const matchedText = result.text;
                const startIndex = result.startIndex;
                const endIndex = result.endIndex;
                found(matchedText, startIndex, endIndex);
                return;
            }
        }
        notFound();
    }

    input(ev: InputEvent) {
        const message = ev.target as HTMLTextAreaElement;
        this.count = message.value.length;
        this.checkCanPost();
        if (!this.fullscreen) {
            message.style.height = "auto";
            message.style.height = Math.min(16 * 15, message.scrollHeight) + "px";
        }

        this.isInHandle(
            message.value,
            message.selectionStart,
            async (match, start, end) => {
                if (match.length == 0) return;
                const response = await bskyClient?.app.bsky.actor.searchActorsTypeahead({
                    limit: 8,
                    q: match,
                });
                if (!response?.success) return;
                this.handleSuggestions = response.data.actors;
                this.insert = { start, end };
            },
            () => {
                this.handleSuggestions = [];
                this.insert = undefined;
            }
        );
        this.message = message.value;

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
        if (!bskyClient) return;
        try {
            this.isSending = true;
            this.canPost = false;
            this.requestUpdate();
            const richText = new RichText({ text: this.message + (this.hashtag ? ` ${this.hashtag}` : "") });
            try {
                await richText.detectFacets(bskyClient!);
            } catch (e) {
                // may explode if handles can't be resolved
            }

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
                const response = await bskyClient.com.atproto.repo.uploadBlob(data.data, {
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
            const quoteEmbed = this.quote ? { uri: this.quote.uri, cid: this.quote.cid } : undefined;
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

            const response = await bskyClient.post(record);
            let post: PostView | undefined;
            while (true) {
                const postResponse = await bskyClient.getPosts({ uris: [response.uri] });
                if (!postResponse.success) {
                    throw Error(i18n("Couldn't send post"));
                }
                if (postResponse.data.posts.length == 0) {
                    console.error("Sent post, but received null response, retrying");
                    continue;
                }
                post = postResponse.data.posts[0];
                break;
            }

            if (!this.replyTo && this.hashtag) {
                if (!hashTagThread) {
                    hashTagThread = { root: response, parent: response };
                    user.hashTagThreads[this.hashtag] = hashTagThread;
                }
                hashTagThread.parent = response;
                Store.setUser(user);
            }
            this.messageElement!.editable!.value = "";
            this.count = 0;
            this.messageElement!.style.height = "auto";
            this.messageElement!.style.height = this.messageElement!.scrollHeight + "px";
            this.embed = undefined;
            this.cardSuggestions = undefined;
            this.handleSuggestions = undefined;
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
                class="flex-1 break-words max-h-[11.5em] resize-none outline-none bg-transparent drop:bg-white dark:text-white disabled:text-gray dark:disabled:text-gray px-2 pt-2"
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
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        if (isMobileBrowser()) visualViewport?.removeEventListener("resize", this.resizeInner);
    }

    protected render() {
        const user = Store.getUser();
        if (!user || !bskyClient) return nothing;
        return html`<div class="fixed top-0 w-full h-full overflow-none backdrop-blur z-10">
            <div class="flex ${isMobileBrowser() ? "h-full" : "mt-1 border border-gray/20 rounded-md"} justify-center max-w-[600px] mx-auto">
                <post-editor
                    class="animate-fade animate-duration-[250ms] w-[600px]"
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

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        this.editable?.focus();
    }

    render() {
        return html`
            <div class="relative flex ${this.fullscreen ? "w-full h-full" : "min-h-[120px]"}">
                <div
                    id="highlights"
                    class="w-full h-full outline-none overflow-auto bg-transparent dark:text-white disabled:text-gray dark:disabled:text-gray p-4 break-words"
                    aria-hidden="true"
                ></div>
                <textarea
                    id="editable"
                    class="absolute top-0 left-0 w-full h-full overflow-hidden resize-none outline-none bg-transparent color-transparent text-transparent caret-black dark:caret-white p-4 break-words"
                    @input=${(ev: any) => this.handleInput(ev)}
                    @selectionchanged=${(ev: any) => this.handleInput(ev)}
                    @mouseup=${(ev: any) => this.handleInput(ev)}
                    @scroll="${this.syncScroll}"
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
        const rt = new RichText({ text });
        rt.detectFacetsWithoutResolution();
        if (this.highlights) {
            const textDom = dom(renderPostText(rt));
            this.highlights.innerHTML = "";
            for (const node of textDom) {
                this.highlights.append(node);
            }
        }
    }

    protected updated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        if (this.highlights && this.editable) {
            this.highlights.scrollTop = this.editable.scrollTop;
            this.highlights.style.height = this.editable.style.height;
            this.renderHighlights(this.editable.value);
        }
    }

    syncScroll() {
        if (this.highlights && this.editable) {
            this.highlights.scrollTop = this.editable.scrollTop;
            this.highlights.style.height = this.editable.style.height;
        }
    }
}
