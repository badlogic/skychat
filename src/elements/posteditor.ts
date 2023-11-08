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
} from "@atproto/api";
import { ProfileViewBasic } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { SelfLabels } from "@atproto/api/dist/client/types/com/atproto/label/defs";
import { LitElement, PropertyValueMap, html, nothing, svg } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { map } from "lit/directives/map.js";
import { extractLinkCard } from "../bsky";
import { deleteIcon, editIcon, imageIcon } from "../icons";
import { renderEmbed, renderRecord } from "./postview";
import { ImageInfo, dom, downloadImage, downscaleImage, loadImageFile, loadImageFiles } from "../utils";
import { CloseableElement } from "./closable";
import { PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";

const defaultAvatar = svg`<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="none" data-testid="userAvatarFallback"><circle cx="12" cy="12" r="12" fill="#0070ff"></circle><circle cx="12" cy="9.5" r="3.5" fill="#fff"></circle><path stroke-linecap="round" stroke-linejoin="round" fill="#fff" d="M 12.058 22.784 C 9.422 22.784 7.007 21.836 5.137 20.262 C 5.667 17.988 8.534 16.25 11.99 16.25 C 15.494 16.25 18.391 18.036 18.864 20.357 C 17.01 21.874 14.64 22.784 12.058 22.784 Z"></path></svg>`;

@customElement("post-editor")
export class PostEditor extends LitElement {
    @property()
    bskyClient?: BskyAgent;

    @property()
    account?: string;

    @property()
    hashtag?: string;

    @property()
    cancelable = false;

    @property()
    cancled: () => void = () => {};

    @property()
    suggestBottom = false;

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
    embed?: AppBskyEmbedExternal.Main;

    @property()
    quote?: AppBskyFeedDefs.PostView;

    @property()
    replyTo?: AppBskyFeedDefs.PostView;

    @state()
    imagesToUpload: { alt: string; dataUri: string; data: Uint8Array; mimeType: string }[] = [];

    @query("#message")
    messageElement?: HTMLTextAreaElement;

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
        this.messageElement?.focus();
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
            this.messageElement.value = replaceSubstring(this.messageElement.value, this.insert.start, this.insert.end, handle);
            this.message = this.messageElement?.value;
            this.handleSuggestions = [];
            this.insert = undefined;
        };

        return html` <div class="flex max-w-[600px] bg-white dark:bg-black">
            <div class="flex max-w-full flex-col flex-grow relative">
                ${
                    this.replyTo
                        ? html`<div class="flex flex-col border border-gray rounded mx-2 p-2 max-h-[10em] overflow-auto mt-2">
                              ${renderRecord(
                                  this.bskyClient,
                                  this.replyTo.author,
                                  this.replyTo.uri.replace("at://", "").split("/")[2],
                                  this.replyTo.record as AppBskyFeedPost.Record,
                                  this.replyTo.embed,
                                  true,
                                  false,
                                  "Replying to"
                              )}
                              <button
                                  class="absolute right-4 top-4 z-[100] bg-black rounded-full p-1"
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
                        : nothing
                }
                <textarea
                    id="message"
                    @input=${this.input}
                    @drop=${(ev: DragEvent) => this.pasteImage(ev)}
                    @dragover=${(ev: DragEvent) => ev.preventDefault()}
                    class="resize-none outline-none bg-transparent dark:text-white disabled:text-gray dark:disabled:text-gray p-2"
                    placeholder="${
                        !this.quote && !this.replyTo
                            ? this.hashtag
                                ? `Add a post to your thread about ${this.hashtag!}. The hashtag will be added automatically.`
                                : "What's up?"
                            : this.quote
                            ? this.hashtag
                                ? `Write your quote. It will be added to your thread about ${this.hashtag!}.`
                                : "Write your quote."
                            : this.hashtag
                            ? `Write your reply. It will be added to the thread by ${
                                  this.replyTo!.author.displayName ?? this.replyTo!.author.handle
                              }.`
                            : "Write your reply"
                    }"
                    ?disabled=${this.isSending}
                ></textarea>
                ${
                    !this.embed && this.imagesToUpload.length == 0 && (this.cardSuggestions?.length ?? 0 > 0)
                        ? html`<div class="flex flex-col my-2 mx-2 gap-2">
                              ${map(
                                  this.cardSuggestions,
                                  (card) =>
                                      html`<button
                                          @click=${() => this.addLinkCard(card)}
                                          class="border border-gray rounded py-1 px-4 flex gap-2"
                                          ?disabled=${this.isSending}
                                      >
                                          <div class="min-w-[70px]">Add card</div>
                                          <div class="text-left truncate text-blue-500">${card.uri}</div>
                                      </button>`
                              )}
                          </div>`
                        : nothing
                }
                ${
                    AppBskyEmbedExternal.isMain(this.embed)
                        ? html`<div class="flex relative px-2">
                              <div class="w-full">${renderEmbed(this.bskyClient, this.embed, false)}</div>
                              <button
                                  class="absolute right-4 top-4 z-[100]"
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
                                  <i class="icon w-4 h-4 ${this.isSending ? "fill-gray" : ""}">${deleteIcon}</i>
                              </button>
                          </div>`
                        : nothing
                }
                ${
                    this.imagesToUpload.length > 0
                        ? html`<div class="flex mx-2">
                              ${map(
                                  this.imagesToUpload,
                                  (image) => html`<div class="w-1/4 relative">
                                      <img src="${image.dataUri}" class="animate-jump-in px-1 w-full h-[100px] object-cover" /><button
                                          class="absolute right-2 top-2 z-[100] bg-black rounded-full p-1"
                                          @click=${(ev: Event) => {
                                              if (!ev.currentTarget) return;
                                              const target = ev.currentTarget as HTMLElement;
                                              target.parentElement?.classList.add("animate-jump-out");

                                              setTimeout(() => {
                                                  this.imagesToUpload = this.imagesToUpload.filter((other) => image != other);
                                                  this.checkCanPost();
                                              }, 500);
                                          }}
                                          ?disabled=${this.isSending}
                                      >
                                          <i class="icon w-4 h-4 ${this.isSending ? "fill-gray" : ""}">${deleteIcon}</i>
                                      </button>
                                      <button
                                          class="absolute left-2 top-2 z-[100] bg-black rounded-full p-1"
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
                        : nothing
                }
                ${
                    this.quote
                        ? html`<div class="relative flex flex-col border border-gray rounded mx-2 p-2 max-h-[10em] overflow-auto mt-2">
                              ${renderRecord(
                                  this.bskyClient,
                                  this.quote.author,
                                  this.quote.uri.replace("at://", "").split("/")[2],
                                  this.quote.record as AppBskyFeedPost.Record,
                                  this.quote.embed,
                                  true,
                                  false,
                                  "Quoting"
                              )}
                              <button
                                  class="absolute right-2 top-2 z-[100] bg-black rounded-full p-1"
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
                        : nothing
                }
                <div class="flex items-center">
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
                        class="ml-auto bg-transparent dark:text-gray text-end text-xs flex items-center ${
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
                                  class="ml-2 bg-gray text-white my-2 mr-2 px-2 py-1 rounded disabled:bg-gray/70 disabled:text-white/70"
                              >
                                  Cancel
                              </button>`
                            : nothing
                    }
                    <button
                        @click=${this.sendPost}
                        class="ml-2 bg-primary text-white my-2 mr-2 px-2 py-1 rounded disabled:bg-gray/70 disabled:text-white/70"
                        ?disabled=${!this.canPost || this.isSending}
                    >
                        Post
                    </button>
                </div>
                ${
                    this.handleSuggestions && this.handleSuggestions.length > 0
                        ? html`<div
                              class="mx-auto flex flex-col bg-white dark:bg-black border border-gray rounded ${!this.suggestBottom
                                  ? "absolute"
                                  : "w-full"} max-w-[100vw] z-[200]"
                              style="${!this.suggestBottom ? `top: calc(${this.handleSuggestions.length} * -2.5em);` : ""}"
                          >
                              ${map(
                                  this.handleSuggestions,
                                  (suggestion) => html` <button
                                      @click=${() => insertSuggestion(suggestion.handle)}
                                      class="flex items-center gap-2 p-2 border-bottom border-gray hover:bg-primary hover:text-white"
                                  >
                                      ${suggestion.avatar
                                          ? html`<img class="w-[1.5em] h-[1.5em] rounded-full" src="${suggestion.avatar}" />`
                                          : html`<i class="icon w-[1.5em] h-[1.5em]">${defaultAvatar}</i>`}
                                      <span class="truncate">${suggestion.displayName ?? suggestion.handle}</span>
                                      <span class="ml-auto text-gray text-sm">${suggestion.displayName ? suggestion.handle : ""}</span>
                                  </button>`
                              )}
                          </div>`
                        : nothing
                }
            </div>
        </div>`;
    }

    checkCanPost() {
        const totalCount = 300 - (1 + (this.hashtag?.length ?? 0));
        this.canPost = (this.count > 0 && this.count <= totalCount) || this.imagesToUpload.length > 0 || this.embed != undefined;
    }

    setQuote(post: AppBskyFeedDefs.PostView | undefined) {
        this.quote = post;
        this.replyTo = undefined;
        this.messageElement?.focus();
    }

    setReply(post: AppBskyFeedDefs.PostView | undefined) {
        this.replyTo = post;
        this.quote = undefined;
        this.messageElement?.focus();
    }

    pasteImage = async (ev: ClipboardEvent | DragEvent) => {
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
            alert("You can only upload 4 images per post");
            return;
        }
        this.imagesToUpload = [...this.imagesToUpload, image];
        this.canPost = true;
    };

    async addImage() {
        if (this.imagesToUpload.length == 4) {
            alert("You can only upload 4 images per post");
            return;
        }
        const input = dom(html`<input type="file" id="file" accept=".jpg, .jpeg, .png" class="hidden" multiple />`)[0] as HTMLInputElement;
        document.body.append(input);
        input.addEventListener("change", async () => {
            if (!input.files || input.files.length == 0) return;
            const files = input.files;
            if (this.imagesToUpload.length + (files?.length ?? 0) > 4) {
                alert("You can only upload 4 images per post");
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
        if (!this.bskyClient) return;
        let cardEmbed: AppBskyEmbedExternal.Main = {
            $type: "app.bsky.embed.external",
            external: {
                uri: card.uri,
                title: "",
                description: "",
            },
        };
        this.embed = cardEmbed;
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
                        const response = await this.bskyClient.com.atproto.repo.uploadBlob(imageData.data, {
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
        message.style.height = "auto";
        message.style.height = Math.min(16 * 15, message.scrollHeight) + "px";

        this.isInHandle(
            message.value,
            message.selectionStart,
            async (match, start, end) => {
                if (match.length == 0) return;
                const response = await this.bskyClient?.app.bsky.actor.searchActorsTypeahead({
                    limit: 8,
                    q: match,
                });
                if (!response?.success) return;
                this.handleSuggestions = response.data.actors;
                this.insert = { start, end };
            },
            () => {
                console.log("Not in handle");
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
        if (!this.bskyClient) return;
        try {
            this.isSending = true;
            this.canPost = false;
            this.requestUpdate();
            const richText = new RichText({ text: this.message + (this.hashtag ? ` ${this.hashtag}` : "") });
            try {
                await richText.detectFacets(this.bskyClient!);
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
                const response = await this.bskyClient.com.atproto.repo.uploadBlob(data.data, {
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

            const mediaEmbed = this.embed ?? (imagesEmbed.images.length > 0 ? imagesEmbed : undefined);
            const quoteEmbed = this.quote ? { uri: this.quote.uri, cid: this.quote.cid } : undefined;
            let embed: AppBskyFeedPost.Record["embed"];
            if (quoteEmbed && mediaEmbed) {
                const recordWithMediaEmbed: AppBskyEmbedRecordWithMedia.Main = {
                    $type: "app.bsky.embed.recordWithMedia",
                    media: mediaEmbed,
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
                embed = mediaEmbed;
            }

            let record: AppBskyFeedPost.Record = {
                $type: "app.bsky.feed.post",
                text: richText.text,
                facets: richText.facets,
                createdAt: new Date().toISOString(),
                embed,
                labels,
            };

            const baseKey = this.account + "|" + this.hashtag!;
            const prevRoot = localStorage.getItem(baseKey + "|root") ? JSON.parse(localStorage.getItem(baseKey + "|root")!) : undefined;
            const prevReply = localStorage.getItem(baseKey + "|reply") ? JSON.parse(localStorage.getItem(baseKey + "|reply")!) : undefined;
            if (!this.replyTo) {
                if (prevRoot) {
                    record = {
                        ...record,
                        reply: {
                            root: prevRoot,
                            parent: prevReply ?? prevRoot,
                        },
                    };
                }
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

            const response = await this.bskyClient.post(record);

            if (!this.replyTo) {
                if (!prevRoot) localStorage.setItem(baseKey + "|root", JSON.stringify(response));
                localStorage.setItem(baseKey + "|reply", JSON.stringify(response));
            }
            this.messageElement!.value = "";
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
                this.remove();
                this.cancled();
            }
        } catch (e) {
            console.error(e);
            alert("Couldn't publish post!");
        } finally {
            this.canPost = true;
            this.isSending = false;
        }
    }
}

@customElement("image-editor")
export class ImageEditor extends CloseableElement {
    @property()
    image?: ImageInfo;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        const dataUri = this.image ? this.image.dataUri : "";
        const alt = this.image ? this.image.alt : "";
        return html`<div class="fixed top-0 left-0 w-full h-full z-[1000] bg-white dark:bg-black">
            <div class="mx-auto max-w-[600px] h-full flex flex-col p-4 gap-2">
                <div class="flex items-center">
                    <h1 class="text-lg text-primary font-bold">Edit image</h1>
                    <button
                        @click=${() => this.close()}
                        class="ml-auto bg-primary text-white px-2 py-1 rounded disabled:bg-gray/70 disabled:text-white/70"
                    >
                        Save
                    </button>
                </div>
                <img src="${dataUri}" class="object-contain max-h-[75svh]" />
                <textarea
                    id="message"
                    @input=${(ev: Event) => {
                        if (this.image) {
                            this.image.alt = (ev.target as HTMLInputElement)!.value;
                        }
                    }}
                    class="flex-1 max-h-[11.5em] resize-none outline-none bg-transparent drop:bg-white dark:text-white disabled:text-gray dark:disabled:text-gray px-2 pt-2"
                    placeholder="Add alt text to your image"
                >
${alt}</textarea
                >
            </div>
        </div>`;
    }
}

@customElement("post-editor-overlay")
export class PostEditorOverlay extends CloseableElement {
    @property()
    account?: string;

    @property()
    bskyClient?: BskyAgent;

    @property()
    quote?: PostView;

    @property()
    replyTo?: PostView;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected render() {
        if (!this.account || !this.bskyClient) return nothing;
        return html`<div class="absolute flex items-end top-0 w-full h-[100svh] backdrop-blur z-[2000] ">
            <post-editor
                class="border border-gray/50 animate-fade mx-auto w-[600px]"
                .account=${this.account!}
                .bskyClient=${this.bskyClient}
                .cancelable=${true}
                .cancled=${() => this.close()}
                .quote=${this.quote}
                .replyTo=${this.replyTo}
            ></post-editor>
        </div>`;
    }
}
