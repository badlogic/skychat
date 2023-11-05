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
import { ProfileViewBasic, ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { LitElement, PropertyValueMap, TemplateResult, css, html, nothing, svg } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { map } from "lit/directives/map.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { PostSearch, extractLinkCard, processText } from "./bsky";
import { FirehosePost, startEventStream } from "./firehose";
import { globalStyles } from "./styles";
import {
    IconToggle,
    ImageInfo,
    contentLoader,
    dom,
    downloadImage,
    downscaleImage,
    getDateString,
    loadImageFile,
    loadImageFiles,
    onVisibleOnce,
} from "./utils";
// @ts-ignore
import logoSvg from "./logo.svg";
import { bookmarkIcon, closeIcon, deleteIcon, editIcon, imageIcon, quoteIcon, replyIcon, shieldIcon } from "./icons";
import { SelfLabels } from "@atproto/api/dist/client/types/com/atproto/label/defs";
import { CloseableElement, escapeGuard, navigationGuard } from "./guards";

const defaultAvatar = svg`<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="none" data-testid="userAvatarFallback"><circle cx="12" cy="12" r="12" fill="#0070ff"></circle><circle cx="12" cy="9.5" r="3.5" fill="#fff"></circle><path stroke-linecap="round" stroke-linejoin="round" fill="#fff" d="M 12.058 22.784 C 9.422 22.784 7.007 21.836 5.137 20.262 C 5.667 17.988 8.534 16.25 11.99 16.25 C 15.494 16.25 18.391 18.036 18.864 20.357 C 17.01 21.874 14.64 22.784 12.058 22.784 Z"></path></svg>`;
const profileCache: Record<string, ProfileViewDetailed> = {};
async function cacheProfile(bskyClient: BskyAgent, did: string) {
    if (!profileCache[did]) {
        const profile = await bskyClient.app.bsky.actor.getProfile({ actor: did });
        if (profile?.success) {
            profileCache[did] = profile.data;
        }
    }
}

@customElement("skychat-app")
class App extends LitElement {
    static styles = [globalStyles];

    @state()
    error?: string;

    @state()
    isLoading = false;

    @state()
    isLive = false;

    @query("#account")
    accountElement?: HTMLInputElement;

    @query("#password")
    passwordElement?: HTMLInputElement;

    @query("#hashtag")
    hashtagElement?: HTMLInputElement;

    account: string | null;
    password: string | null;
    accountProfile: ProfileViewDetailed | null;
    hashtag: string | null;
    bskyClient?: BskyAgent;
    postSearch?: PostSearch;
    initialPosts: AppBskyFeedDefs.PostView[] = [];
    askedReuse = false;

    constructor() {
        super();
        this.account = localStorage.getItem("a");
        this.password = localStorage.getItem("p");
        this.accountProfile = localStorage.getItem("profile") ? JSON.parse(localStorage.getItem("profile")!) : null;
        this.hashtag = new URL(location.href).searchParams.get("hashtag") ?? null;
    }

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        if (this.hashtag) this.load();
    }

    async load() {
        this.isLoading = true;
        if (!this.hashtag) return;
        if (this.account && this.password) {
            this.bskyClient = new BskyAgent({ service: "https://bsky.social" });
            try {
                const response = await this.bskyClient.login({
                    identifier: this.account!,
                    password: this.password!,
                });
                if (!response.success) throw new Error();
                const profileResponse = await this.bskyClient.app.bsky.actor.getProfile({ actor: this.account });
                if (!profileResponse.success) {
                    throw new Error();
                }
                localStorage.setItem("profile", JSON.stringify(profileResponse.data));
                this.accountProfile = profileResponse.data;
            } catch (e) {
                this.error = "Couldn't log-in with your BlueSky credentials.";
                this.isLoading = false;
                return;
            }
        } else {
            this.bskyClient = new BskyAgent({ service: "https://api.bsky.app" });
        }
        this.postSearch = new PostSearch(this.bskyClient, this.hashtag.replace("#", ""));
        const oldPosts = await this.postSearch.next();
        if (oldPosts instanceof Error) {
            this.error = `Couldn't load old posts for hashtag ${this.hashtag}`;
            this.isLoading = false;
            return;
        }
        this.initialPosts = oldPosts.filter(
            (post) => AppBskyFeedPost.isRecord(post.record) && post.record.text.toLowerCase().includes(this.hashtag!.toLowerCase())
        );
        for (const post of this.initialPosts) {
            if (!AppBskyFeedPost.isRecord(post.record)) continue;
            if (!post.record.reply) continue;
            const did = post.record.reply.parent.uri.replace("at://", "").split("/")[0];
            await cacheProfile(this.bskyClient, did);
        }
        this.isLoading = false;
        this.isLive = true;
    }

    render() {
        if (this.isLive) {
            const baseKey = this.account + "|" + this.hashtag!;
            if (localStorage.getItem(baseKey + "|root") && !this.askedReuse) {
                const root = localStorage.getItem(baseKey + "|root");
                const rootUrl = `https://bsky.app/profile/${this.account}/post/${root?.replace("at://", "").split("/")[2]}`;
                return html`<div class="w-full max-w-[590px] mx-auto h-full flex flex-col">
                    <div class="flex p-2 items-center bg-white dark:bg-black sticky top-0 z-[100]">
                        <a class="flex items-center text-primary font-bold text-center" href="/"
                            ><i class="flex justify-center w-[16px] h-[16px] inline-block fill-primary">${unsafeHTML(logoSvg)}</i
                            ><span class="ml-2">Skychat</span></a
                        >
                        <span class="flex-grow text-primary font-bold pl-2"> > ${this.hashtag}</span>
                        ${this.accountProfile
                            ? this.accountProfile.avatar
                                ? html`<button @click=${this.logout}>
                                      <img class="max-w-[1em] max-h-[1em] rounded-full" src="${this.accountProfile.avatar}" />
                                  </button>`
                                : html`<i class="icon w-[1.2em] h-[1.2em]">${defaultAvatar}</i>`
                            : nothing}
                        <theme-toggle class="ml-2" absolute="false"></theme-toggle>
                    </div>
                    <p class="text-center mt-4">
                        You have an <a href="${rootUrl}" target="_blank" class="text-primary">existing thread</a> for ${this.hashtag}
                    </p>
                    <p class="text-center mt-4">Do you want to add new posts to the existing thread, or start a new thread?</p>
                    <div class="flex flex-col mx-auto gap-4 mt-4">
                        <button
                            class="px-4 py-2 rounded bg-primary text-white"
                            @click=${() => {
                                this.askedReuse = true;
                                this.requestUpdate();
                            }}
                        >
                            Use existing thread
                        </button>
                        <button
                            class="px-4 py-2 rounded bg-primary text-white"
                            @click=${() => {
                                this.askedReuse = true;
                                localStorage.removeItem(baseKey + "|root");
                                localStorage.removeItem(baseKey + "|reply");
                                this.requestUpdate();
                            }}
                        >
                            Start new thread
                        </button>
                    </div>
                </div>`;
            } else {
                return this.renderLive();
            }
        }

        let content: TemplateResult | HTMLElement = html``;
        if (this.isLoading) {
            content = html` <p class="text-center">Connecting</p>
                <div class="align-top">${contentLoader}</div>`;
        } else {
            content = html`
                <p class="text-center mx-auto w-[280px]">Explore & create hashtag threads live on BlueSky</p>
                <div class="mx-auto flex flex-col gap-4 mt-4 w-[280px]">
                    <input
                        id="hashtag"
                        class="bg-none border border-gray/75 outline-none rounded text-black px-2 py-2"
                        placeholder="Hashtag, e.g. #imzentrum"
                        value=${this.hashtag || nothing}
                    />
                    ${this.accountProfile
                        ? html`<p>
                              You are logged in as
                              ${this.accountProfile.avatar
                                  ? html` <img class="inline-block max-w-[1em] max-h-[1em] rounded-full" src="${this.accountProfile.avatar}" /> `
                                  : html`<i class="icon w-[1.2em] h-[1.2em]">${defaultAvatar}</i>`}
                              ${this.accountProfile.displayName}
                          </p>`
                        : html`
                              <p class="text-center">
                                  Want to post and reply to other posts? Enter your username and an
                                  <a class="text-primary" href="https://bsky.app/settings/app-passwords">app password</a> below. (optional)
                              </p>
                              <input
                                  id="account"
                                  class="bg-none border border-gray/75 outline-none rounded text-black px-2 py-2"
                                  placeholder="Account, e.g. badlogic.bsky.social"
                                  value=${this.account || nothing}
                              />
                              <input
                                  id="password"
                                  type="password"
                                  class="bg-none border border-gray/75 outline-none rounded text-black px-2 py-2"
                                  placeholder="App password"
                                  value=${this.password || nothing}
                              />
                          `}
                    <button class="align-center rounded bg-primary text-white px-4 py-2" @click=${this.goLive}>Go live!</button>
                    ${!this.accountProfile
                        ? html`<p class="text-xs mt-0 pt-0 text-center">Your credentials will only be stored on your device.</p>`
                        : nothing}
                    ${this.accountProfile ? html`<button class="text-sm text-primary" @click=${this.logout}>Log out</button>` : nothing}
                </div>
                ${this.error
                    ? html`<div class="mx-auto mt-8 max-w-[300px] border border-gray bg-gray text-white p-4 rounded text-center">${this.error}</div>`
                    : nothing}
                <a class="text-xl text-primary text-center font-bold mt-16" href="help.html">How does it work?</a>
                <a class="text-xl text-primary text-center font-bold mt-8" href="trending.html">Trending hashtags</a>
            `;
        }

        return html` <main class="flex flex-col justify-between m-auto max-w-[728px] px-4 h-full leading-5">
            <theme-toggle></theme-toggle>
            <a class="text-2xl flex align-center justify-center text-primary font-bold text-center my-8" href="/"
                ><i class="w-[32px] h-[32px] inline-block fill-primary">${unsafeHTML(logoSvg)}</i><span class="ml-2">Skychat</span></a
            >
            <div class="flex-grow flex flex-col">${content}</div>
            <div class="text-center text-xs italic my-4 pb-4">
                <a class="text-primary" href="https://skychat.social" target="_blank">Skychat</a>
                is lovingly made by
                <a class="text-primary" href="https://bsky.app/profile/badlogic.bsky.social" target="_blank">Mario Zechner</a><br />
                No data is collected, not even your IP address.<br />
                <a class="text-primary" href="https://github.com/badlogic/skychat" target="_blank">Source code</a>
            </div>
        </main>`;
    }

    goLive() {
        this.hashtag = this.hashtagElement?.value ?? null;
        if (!this.hashtag) {
            this.error = "Please specify a hashtag";
            return;
        }
        if (!this.hashtag.startsWith("#")) {
            this.hashtag = "#" + this.hashtag;
        }

        this.account = this.accountElement?.value ?? (this.account ? this.account : null);
        this.password = this.passwordElement?.value ?? (this.password ? this.password : null);
        if (this.account) {
            this.account = this.account.trim().replace("@", "");
            if (this.account.length == 0) {
                this.account = null;
                this.password = null;
            } else {
                if (!this.account.includes(".")) {
                    this.account += ".bsky.social";
                }
                if (!this.password) {
                    this.error = "Please specify an app password for your account. You can get one in your BlueSky app's settings.";
                    return;
                }
            }
        } else {
            this.account = null;
            this.password = null;
        }
        if (this.account && this.password) {
            localStorage.setItem("a", this.account);
            localStorage.setItem("p", this.password);
        }
        const url = new URL(location.href);
        url.searchParams.set("hashtag", this.hashtag);
        location.href = url.toString();
    }

    renderLive() {
        let loadingOlder = false;
        const loadOlderPosts = async () => {
            if (loadingOlder) return;
            loadingOlder = true;
            const posts = liveDom.querySelector("#posts")!;
            const load = posts.querySelector("#loadOlderPosts")! as HTMLElement;
            const olderPosts = await this.postSearch!.next();
            if (olderPosts instanceof Error || olderPosts.length == 0) {
                load.innerText = "No older posts";
                load.classList.remove("animate-pulse");
                loadingOlder = false;
                return;
            }
            let first: HTMLElement | undefined;
            let last: HTMLElement | undefined;
            const editor = liveDom.querySelector("post-editor");
            for (const post of olderPosts) {
                const postHtml = dom(html`<post-view .bskyClient=${this.bskyClient} .post=${post} .postEditor=${editor}></post-view>`)[0];
                posts.insertBefore(postHtml, load);
                if (!first) first = postHtml;
                last = postHtml;
            }

            if (first) {
                const f = first;
                const l = last;
                const initialScrollHeight = liveDom.scrollHeight;
                const adjustScroll = () => {
                    if (liveDom.scrollHeight != initialScrollHeight) {
                        load.remove();
                        posts.insertBefore(load, f);
                        liveDom.scrollTop = liveDom.scrollHeight - initialScrollHeight - load.clientHeight;
                        loadingOlder = false;
                    } else {
                        requestAnimationFrame(adjustScroll);
                    }
                };
                adjustScroll();
            }

            onVisibleOnce(load! as HTMLElement, () => loadOlderPosts());
        };

        const liveDom = dom(html`<main class="w-full h-full overflow-auto">
            <div class="mx-auto max-w-[600px] min-h-full flex flex-col">
                <div class="flex p-2 items-center bg-white dark:bg-black sticky top-0 z-[100]">
                    <a class="flex items-center text-primary font-bold text-center" href="/"
                        ><i class="flex justify-center w-[16px] h-[16px] inline-block fill-primary">${unsafeHTML(logoSvg)}</i
                        ><span class="ml-2">Skychat</span></a
                    >
                    <span class="flex-grow text-primary font-bold pl-2"> > ${this.hashtag}</span>
                    ${this.accountProfile
                        ? this.accountProfile.avatar
                            ? html`<button @click=${this.logout}>
                                  <img class="max-w-[1em] max-h-[1em] rounded-full" src="${this.accountProfile.avatar}" />
                              </button>`
                            : html`<i class="icon w-[1.2em] h-[1.2em]">${defaultAvatar}</i>`
                        : nothing}
                    <theme-toggle class="ml-2" absolute="false"></theme-toggle>
                </div>
                <div id="posts" class="flex-grow">
                    <div id="loadOlderPosts" class="w-full text-center p-4 animate-pulse">
                        Loading older posts for <span class="text-primary">${this.hashtag}</span>
                    </div>
                </div>
                ${this.account
                    ? html`
                          <post-editor
                              class="sticky bottom-0"
                              .account=${this.account}
                              .bskyClient=${this.bskyClient}
                              .hashtag=${this.hashtag}
                          ></post-editor>
                      `
                    : nothing}
            </div>
            <div id="catchup" class="w-full hidden fixed flex items-center z-[50]">
                <button
                    @click=${() => {
                        userScrolled = false;
                        catchup.classList.add("hidden");
                        scrollElement.scrollTo({ top: scrollElement.scrollHeight });
                    }}
                    class="mx-auto rounded bg-primary px-2 py-1 text-sm text-white"
                >
                    ↓ Catch up ↓
                </button>
            </div>
        </main>`)[0];

        const olderPosts = liveDom.querySelector("#loadOlderPosts")! as HTMLElement;
        onVisibleOnce(olderPosts! as HTMLElement, () => loadOlderPosts());

        const catchup = liveDom.querySelector("#catchup")! as HTMLElement;
        const editor = liveDom.querySelector("post-editor") as HTMLElement;
        let userScrolled = false;
        const scrollElement = liveDom;
        let lastScrollTop = scrollElement.scrollTop;
        let updateCatchupBottom = false;
        scrollElement.addEventListener("scroll", (ev) => {
            if (lastScrollTop > scrollElement.scrollTop) {
                userScrolled = true;
                catchup.classList.remove("hidden");
                updateCatchupBottom = true;
                const update = () => {
                    catchup.style.bottom = (editor?.clientHeight ?? 0) + 16 + "px";
                    if (updateCatchupBottom) requestAnimationFrame(update);
                };
                update();
            }
            if (scrollElement.scrollHeight - scrollElement.scrollTop < scrollElement.clientHeight * 1.05) {
                userScrolled = false;
                catchup.classList.add("hidden");
                updateCatchupBottom = false;
            }
            lastScrollTop = scrollElement.scrollTop;
        });

        let prevHeight = scrollElement.scrollHeight;
        const scrollOnHeightChange = () => {
            const height = scrollElement.scrollHeight;
            if (!userScrolled && height !== prevHeight) {
                prevHeight = height;
                scrollElement.scrollTo({ top: scrollElement.scrollHeight });
            }
            requestAnimationFrame(scrollOnHeightChange);
        };
        scrollOnHeightChange();

        const renderPost = (post: AppBskyFeedDefs.PostView) => {
            try {
                if (!AppBskyFeedPost.isRecord(post.record)) return;
                const postHtml = dom(html`<post-view .bskyClient=${this.bskyClient} .post=${post} .postEditor=${editor}></post-view>`)[0];
                liveDom.querySelector("#posts")!.append(postHtml);
            } catch (e) {
                console.error(e);
            }
        };

        const hasHashtag = (text: string, hashtag: string): boolean => {
            const tokens = text.split(/[ \t\n\r.,;!?'"]+/);
            for (const token of tokens) {
                if (token.toLowerCase() === hashtag.toLowerCase()) {
                    return true;
                }
            }
            return false;
        };

        for (const post of this.initialPosts) {
            if (AppBskyFeedPost.isRecord(post.record) && hasHashtag(post.record.text, this.hashtag!)) renderPost(post);
        }

        // FIXME need a queue, so posts get inserted in the order they arrived in.
        const postHandler = async (firehosePost: FirehosePost) => {
            try {
                if (!hasHashtag(firehosePost.text, this.hashtag!)) return;
                const response = await this.bskyClient!.getPosts({
                    uris: [firehosePost.uri],
                });
                if (!response.success) throw Error(`Couldn't get post for ${firehosePost.uri}`);
                const post = response.data.posts[0];
                if (AppBskyFeedPost.isRecord(post.record)) {
                    if (post.record.reply) {
                        const did = post.record.reply.parent.uri.replace("at://", "").split("/")[0];
                        await cacheProfile(this.bskyClient!, did);
                    }
                }
                renderPost(post);
            } catch (e) {
                console.error(e);
            }
        };
        let first = true;
        const reconnectHandler = async () => {
            console.log("Reconnecting");
            if (!first && !liveDom.querySelector(".reconnect")) {
                liveDom
                    .querySelector("#posts")!
                    .appendChild(
                        dom(
                            html`<div id="loadOlderPosts" class="reconnect w-full text-center p-4 border-t border-gray/50">
                                Reconnected. Some posts may be missing above.
                            </div>`
                        )[0]
                    );
            }
            first = false;
            startEventStream(postHandler, reconnectHandler);
        };
        reconnectHandler();

        return liveDom;
    }

    logout() {
        if (confirm("Log out?")) {
            localStorage.removeItem("a");
            localStorage.removeItem("p");
            localStorage.removeItem("profile");
            location.reload();
        }
    }
}

@customElement("post-editor")
export class PostEditor extends LitElement {
    static styles = [globalStyles];

    @property()
    bskyClient?: BskyAgent;

    @property()
    account?: string;

    @property()
    hashtag?: string;

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

    @state()
    private quote?: AppBskyFeedDefs.PostView;

    @state()
    private replyTo?: AppBskyFeedDefs.PostView;

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
        const totalCount = 300 - (1 + this.hashtag!.length);
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

        return html` <div class="flex max-w-[600px] bg-white dark:bg-black border-t border-primary border-dashed">
            <div class="flex max-w-full flex-col flex-grow relative">
                ${
                    this.handleSuggestions && this.handleSuggestions.length > 0
                        ? html`<div
                              class="flex flex-col bg-white dark:bg-black border border-gray absolute max-w-[100vw] z-[200]"
                              style="top: calc(${this.handleSuggestions.length} * -2.5em);"
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
                ${this.isSending ? html`<div class="p-2 text-sm animate-pulse">Sending post</div>` : nothing}
                ${
                    this.replyTo
                        ? html`<div class="flex flex-col border border-gray rounded mx-2 p-2 max-h-[10em] overflow-auto mt-2">
                              ${renderRecord(
                                  this.replyTo.uri,
                                  this.replyTo.author,
                                  this.replyTo.record as AppBskyFeedPost.Record,
                                  this.replyTo.embed,
                                  true,
                                  false,
                                  "Replying to"
                              )}
                              <button
                                  class="absolute right-4 top-4 z-[100] bg-black rounded-full p-1"
                                  @click=${() => {
                                      this.replyTo = undefined;
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
                            ? `Add a post to your thread about ${this.hashtag!}. The hashtag will be added automatically.`
                            : this.quote
                            ? `Write your quote. It will be added to your thread about ${this.hashtag!}.`
                            : `Write your reply. It will be added to the thread by ${
                                  this.replyTo!.author.displayName ?? this.replyTo!.author.handle
                              }.`
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
                              <div class="w-full">${renderEmbed(this.embed, false)}</div>
                              <button
                                  class="absolute right-4 top-4 z-[100]"
                                  @click=${() => {
                                      this.embed = undefined;
                                      this.checkCanPost();
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
                                      <img src="${image.dataUri}" class="px-1 w-full h-[100px] object-cover" /><button
                                          class="absolute right-2 top-2 z-[100] bg-black rounded-full p-1"
                                          @click=${() => {
                                              this.imagesToUpload = this.imagesToUpload.filter((other) => image != other);
                                              this.checkCanPost();
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
                                  this.quote.uri,
                                  this.quote.author,
                                  this.quote.record as AppBskyFeedPost.Record,
                                  this.quote.embed,
                                  true,
                                  false,
                                  "Quoting"
                              )}
                              <button
                                  class="absolute right-2 top-2 z-[100] bg-black rounded-full p-1"
                                  @click=${() => {
                                      this.quote = undefined;
                                  }}
                                  ?disabled=${this.isSending}
                              >
                                  <i class="icon w-4 h-4 ${this.isSending ? "fill-gray" : ""}">${deleteIcon}</i>
                              </button>
                          </div>`
                        : nothing
                }
                <div class="flex items-right">
                    <button class="p-2 disabled:fill-gray" @click=${this.addImage} ?disabled=${this.embed || this.isSending}>
                        <i class="icon w-6 h-6 ${this.embed || this.isSending ? "fill-gray" : ""}">${imageIcon}</i>
                    </button>
                    ${
                        this.imagesToUpload.length > 0
                            ? html`<icon-toggle @change=${(ev: CustomEvent) => (this.sensitive = ev.detail.value)} icon="shield"></icon-toggle>`
                            : nothing
                    }
                    </button>
                    <span
                        class="ml-auto bg-transparent dark:text-gray text-end text-xs flex items-center ${
                            this.count > totalCount ? "text-red dark:text-red" : ""
                        }"
                        >${this.count}/${totalCount}</span
                    >
                    <button
                        @click=${this.sendPost}
                        class="ml-2 bg-primary text-white my-2 mr-2 px-2 py-1 rounded disabled:bg-gray/70 disabled:text-white/70"
                        ?disabled=${!this.canPost || this.isSending}
                    >
                        Post
                    </button>
                </div>
            </div>
        </div>`;
    }

    checkCanPost() {
        const totalCount = 300 - (1 + this.hashtag!.length);
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
            const richText = new RichText({ text: this.message + " " + this.hashtag! });
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
        } catch (e) {
            console.error(e);
            alert("Couldn't publish post!");
        } finally {
            this.canPost = true;
            this.isSending = false;
        }
    }
}

function renderCardEmbed(cardEmbed: AppBskyEmbedExternal.ViewExternal | AppBskyEmbedExternal.External) {
    const thumb = typeof cardEmbed.thumb == "string" ? cardEmbed.thumb : cardEmbed.image;
    return html`<a class="w-full border rounded border-gray flex mb-2" target="_blank" href="${cardEmbed.uri}">
        ${thumb ? html`<img src="${thumb}" class="w-[100px] object-contain" />` : nothing}
        <div class="flex flex-col p-2 w-full">
            <span class="text-gray text-xs">${new URL(cardEmbed.uri).host}</span>
            <span class="font-bold text-sm">${cardEmbed.title}</span>
            <div class="text-sm line-clamp-2">${cardEmbed.description}</div>
        </div>
    </a>`;
}

function renderImagesEmbed(images: AppBskyEmbedImages.ViewImage[], sensitive: boolean) {
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

function renderRecordEmbed(recordEmbed: AppBskyEmbedRecord.View) {
    if (!AppBskyEmbedRecord.isViewRecord(recordEmbed.record)) return nothing;
    if (!AppBskyFeedPost.isRecord(recordEmbed.record.value)) return nothing;
    const record = recordEmbed.record.value;
    const rkey = recordEmbed.record.uri.replace("at://", "").split("/")[2];
    const author = recordEmbed.record.author;
    const postUrl = `https://bsky.app/profile/${author.did}/post/${rkey}`;
    const embeds = recordEmbed.record.embeds && recordEmbed.record.embeds.length > 0 ? recordEmbed.record.embeds[0] : undefined;
    const sensitive = recordEmbed.record.labels?.some((label) => ["porn", "nudity", "sexual"].includes(label.val)) ?? false;
    return html`<div class="border border-gray rounded p-2 mb-2">${renderRecord(postUrl, author, record, embeds, true, sensitive)}</div>`;
}
function renderRecordWithMediaEmbed(recordWithMediaEmbed: AppBskyEmbedRecordWithMedia.View, sensitive: boolean) {
    const imagesEmbed = AppBskyEmbedImages.isView(recordWithMediaEmbed.media) ? recordWithMediaEmbed.media.images : undefined;
    const cardEmbed =
        AppBskyEmbedExternal.isView(recordWithMediaEmbed.media) || AppBskyEmbedExternal.isMain(recordWithMediaEmbed.media)
            ? recordWithMediaEmbed.media.external
            : undefined;
    return html`<div class="mt-2">
        ${cardEmbed ? renderCardEmbed(cardEmbed) : nothing} ${imagesEmbed ? renderImagesEmbed(imagesEmbed, sensitive) : nothing}
        ${renderRecordEmbed(recordWithMediaEmbed.record)}
    </div>`;
}

function renderEmbed(embed: AppBskyFeedDefs.PostView["embed"] | AppBskyFeedPost.Record["embed"], sensitive: boolean) {
    const cardEmbed = AppBskyEmbedExternal.isView(embed) || AppBskyEmbedExternal.isMain(embed) ? embed.external : undefined;
    const imagesEmbed = AppBskyEmbedImages.isView(embed) ? embed.images : undefined;
    const recordEmbed = AppBskyEmbedRecord.isView(embed) ? embed : undefined;
    const recordWithMediaEmbed = AppBskyEmbedRecordWithMedia.isView(embed) ? embed : undefined;
    return html`<div class="mt-2">
        ${cardEmbed ? renderCardEmbed(cardEmbed) : nothing} ${imagesEmbed ? renderImagesEmbed(imagesEmbed, sensitive) : nothing}
        ${recordEmbed ? renderRecordEmbed(recordEmbed) : nothing}
        ${recordWithMediaEmbed ? renderRecordWithMediaEmbed(recordWithMediaEmbed, sensitive) : nothing}
    </div>`;
}

function renderRecord(
    postUrl: string,
    author: ProfileViewBasic | ProfileViewDetailed,
    record: AppBskyFeedPost.Record,
    embed: AppBskyFeedDefs.PostView["embed"] | undefined,
    smallAvatar: boolean,
    sensitive: boolean,
    prefix?: string
): TemplateResult {
    const replyToAuthorDid = record.reply?.parent.uri.replace("at://", "").split("/")[0];
    const replyToProfile = replyToAuthorDid ? profileCache[replyToAuthorDid] : undefined;
    return html` <div class="w-full flex items-center gap-2">
            ${prefix ? html`<span class="mr-1 font-bold">${prefix}</span>` : nothing}
            <a class="flex items-center gap-2" href="https://bsky.app/profile/${author.handle ?? author.did}" target="_blank">
                ${author.avatar
                    ? html`<img class="${smallAvatar ? "w-[1em] h-[1em]" : "w-[2em] h-[2em]"} rounded-full" src="${author.avatar}" />`
                    : defaultAvatar}
                <span class="${smallAvatar ? "text-sm" : ""} line-clamp-1 hover:underline">${author.displayName ?? author.handle}</span>
            </a>
            ${prefix == undefined
                ? html`<a class="flex-1 text-right text-xs text-gray whitespace-nowrap hover:underline" href="${postUrl}" target="_blank"
                      >${getDateString(new Date(record.createdAt))}</a
                  >`
                : nothing}
        </div>
        ${replyToProfile
            ? html`<div class="flex gap-1 text-xs items-center">
                  <i class="icon fill-gray">${replyIcon}</i>
                  <span>Replying to</span>
                  <a class="line-clamp-1 hover:underline" href="https://bsky.app/profile/${replyToAuthorDid}" target="_blank"
                      >${replyToProfile.displayName ?? replyToProfile.handle}</a
                  >
              </div>`
            : nothing}
        <div class="mt-1 break-words">${unsafeHTML(processText(record))}</div>
        ${embed ? renderEmbed(embed, sensitive) : nothing}`;
}

@customElement("post-view")
export class PostViewElement extends LitElement {
    static styles = [globalStyles];

    @property()
    bskyClient?: BskyAgent;

    @property()
    post?: AppBskyFeedDefs.PostView;

    @property()
    postEditor?: PostEditor;

    render() {
        if (!this.post || !AppBskyFeedPost.isRecord(this.post.record)) {
            return html`<div class="border-t border-gray/50 px-4 py-2">
                ${contentLoader}
                </div>
            </div>`;
        }

        const rkey = this.post.uri.replace("at://", "").split("/")[2];
        const author = this.post.author;
        const postUrl = `https://bsky.app/profile/${author.did}/post/${rkey}`;
        return html`<div class="border-t border-gray/50 px-4 py-2">
            ${renderRecord(
                postUrl,
                author,
                this.post.record,
                this.post.embed,
                false,
                this.post.labels?.some((label) => ["porn", "sexual", "nudity"].includes(label.val)) ?? false,
                undefined
            )}
            <div class="flex items-center gap-4 mt-1">
                <button @click=${this.reply} class="flex gap-1 items-center text-gray">
                    <i class="icon w-[1.2em] h-[1.2em] fill-gray dark:fill-white/50">${replyIcon}</i
                    ><span class="text-gray">${this.post.replyCount}</span>
                </button>
                <button @click=${this.quote} class="flex gap-1 items-center text-gray">
                    <i class="icon w-[1.2em] h-[1.2em] fill-gray dark:fill-white/50">${quoteIcon}</i>
                </button>
                <div class="flex gap-1 items-center text-gray">
                    <icon-toggle @change=${this.toggleRepost} icon="reblog" .value=${this.post.viewer?.repost ?? false}
                        >${this.post.repostCount ?? 0}</icon-toggle
                    >
                </div>
                <div class="flex gap-1 items-center text-gray">
                    <icon-toggle @change=${this.toggleLike} icon="heart" .value=${this.post.viewer?.like ?? false}
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
        if (this.postEditor) {
            this.postEditor.setQuote(this.post);
        }
    }

    async reply(ev: CustomEvent) {
        if (this.postEditor) {
            this.postEditor.setReply(this.post);
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

@customElement("image-editor")
export class ImageEditor extends CloseableElement {
    static styles = [globalStyles];

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

@customElement("alt-text")
export class AltText extends CloseableElement {
    static styles = [globalStyles];

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

import "./help";
import "./trending";
