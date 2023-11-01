import {
    AppBskyEmbedExternal,
    AppBskyEmbedImages,
    AppBskyEmbedRecord,
    AppBskyEmbedRecordWithMedia,
    AppBskyFeedDefs,
    AppBskyFeedPost,
    BskyAgent,
    RichText,
} from "@atproto/api";
import { ProfileViewBasic, ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { LitElement, TemplateResult, html, nothing, svg } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { map } from "lit/directives/map.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { PostSearch, processText } from "./bsky";
import { startEventStream } from "./firehose";
import { heartIcon, reblogIcon, replyIcon } from "./icons";
import { globalStyles } from "./styles";
import { contentLoader, dom, getDateString } from "./utils";
// @ts-ignore
import logoSvg from "./logo.svg";

const icons = {
    reblog: reblogIcon,
    reply: replyIcon,
    heart: heartIcon,
};

const defaultAvatar = svg`<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="none" data-testid="userAvatarFallback"><circle cx="12" cy="12" r="12" fill="#0070ff"></circle><circle cx="12" cy="9.5" r="3.5" fill="#fff"></circle><path stroke-linecap="round" stroke-linejoin="round" fill="#fff" d="M 12.058 22.784 C 9.422 22.784 7.007 21.836 5.137 20.262 C 5.667 17.988 8.534 16.25 11.99 16.25 C 15.494 16.25 18.391 18.036 18.864 20.357 C 17.01 21.874 14.64 22.784 12.058 22.784 Z"></path></svg>`;

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
                localStorage.setItem("a", this.account);
                localStorage.setItem("p", this.password);
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
        this.initialPosts = oldPosts;
        this.isLoading = false;
        this.isLive = true;
        const url = new URL(location.href);
        url.searchParams.set("hashtag", this.hashtag);
        history.replaceState(null, "", url.toString());
        this.requestUpdate();
    }

    render() {
        if (this.isLive) {
            const baseKey = this.account + "|" + this.hashtag!;
            if (localStorage.getItem(baseKey + "|root") && !this.askedReuse) {
                const root = localStorage.getItem(baseKey + "|root");
                const rootUrl = `https://bsky.app/profile/${this.account}/post/${root?.replace("at://", "").split("/")[2]}`;
                return html`<div class="w-full max-w-[590px] mx-auto h-full flex flex-col">
                    <div class="flex p-2 items-center border-b border-gray/50">
                        <a class="text-sm flex align-center justify-center text-primary font-bold text-center" href="/"
                            ><i class="w-[16px] h-[16px] inline-block fill-primary">${unsafeHTML(logoSvg)}</i><span class="ml-2">Skychat</span></a
                        >
                        <span class="flex-grow text-center">${this.hashtag}</span>
                        <theme-toggle absolute="false"></theme-toggle>
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
            content = html` <p class="text-center mx-auto w-[280px]">Explore & create hashtag threads on BlueSky</p>
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
                        : html` <p>Join the discussion by logging in and create your own thread for the hashtag.</p>
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
                              <p class="text-xs mt-0 pt-0">Your credentials will only be stored on your device.</p>`}
                    <button class="align-center rounded bg-primary text-white px-4 py-2" @click=${this.goLive}>Go live!</button>
                    ${this.accountProfile ? html`<button class="text-sm text-primary" @click=${this.logout}>Log out</button>` : nothing}
                </div>
                ${this.error
                    ? html`<div class="mx-auto mt-8 max-w-[300px] border border-gray bg-gray text-white p-4 rounded text-center">${this.error}</div>`
                    : nothing}`;
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

        this.load();
    }

    renderLive() {
        const loadOlderPosts = async () => {
            const posts = liveDom.querySelector("#posts")!;
            const load = posts.querySelector("#loadOlderPosts")! as HTMLElement;
            const olderPosts = await this.postSearch!.next();
            if (olderPosts instanceof Error || olderPosts.length == 0) {
                load.innerText = "No more older posts";
                return;
            }
            let first: HTMLElement | undefined;
            let last: HTMLElement | undefined;
            for (const post of olderPosts) {
                const postHtml = dom(html`<post-view .bskyClient=${this.bskyClient} .post=${post}></post-view>`)[0];
                posts.insertBefore(postHtml, load);
                if (!first) first = postHtml;
                last = postHtml;
            }

            if (first && last) {
                last.scrollIntoView();
                liveDom.scrollTop -= load.clientHeight;
                posts.insertBefore(load, first);
            }
        };

        const liveDom = dom(html`<main class="w-full h-full overflow-auto">
            <div class="mx-auto max-w-[600px] min-h-full flex flex-col">
                <div class="flex p-2 items-center bg-white dark:bg-black border-b border-gray/50 sticky top-0">
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
                    <button id="loadOlderPosts" @click=${loadOlderPosts} class="w-full text-center p-4">
                        Load older posts for <span class="text-primary">${this.hashtag}</span>
                    </button>
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
            <div id="catchup" class="w-full hidden fixed flex items-center">
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
                const postHtml = dom(html`<post-view .bskyClient=${this.bskyClient} .post=${post}></post-view>`)[0];
                liveDom.querySelector("#posts")!.append(postHtml);
            } catch (e) {
                console.error(e);
            }
        };

        for (const post of this.initialPosts) {
            renderPost(post);
        }

        // FIXME need a queue, so posts get inserted in the order they arrived in.
        const stream = startEventStream(
            async (post) => {
                try {
                    if (!post.text.toLowerCase().includes(this.hashtag!.replace("#", "").toLowerCase())) return;
                    const response = await this.bskyClient!.getPosts({
                        uris: [post.uri],
                    });
                    if (!response.success) throw Error(`Couldn't get post for ${post.uri}`);
                    renderPost(response.data.posts[0]);
                } catch (e) {
                    console.error(e);
                }
            },
            () => {
                this.error = `Error, failed to load more posts for hashtag ${this.hashtag}`;
            }
        );

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
    suggestions?: ProfileViewBasic[];
    insert?: { start: number; end: number };

    @query("#message")
    messageElement?: HTMLTextAreaElement;

    message: string = "";

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
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
            this.suggestions = [];
            this.insert = undefined;
        };

        return html` <div class="flex mx-auto w-full bg-white dark:bg-black rounded border border-gray/50">
            <div class="flex flex-col flex-grow">
                ${this.suggestions
                    ? html`<div class="flex flex-col border border-gray/50">
                          ${map(
                              this.suggestions,
                              (suggestion) => html` <button
                                  @click=${() => insertSuggestion(suggestion.handle)}
                                  class="flex items-center gap-2 p-2 border-bottom border-gray/50 hover:bg-primary hover:text-white"
                              >
                                  ${suggestion.avatar
                                      ? html`<img class="w-[1.5em] h-[1.5em] rounded-full" src="${suggestion.avatar}" />`
                                      : html`<i class="icon w-[1.5em] h-[1.5em]">${defaultAvatar}</i>`}
                                  <span>${suggestion.displayName ?? suggestion.handle}</span>
                                  <span class="ml-auto text-gray text-sm">${suggestion.displayName ? suggestion.handle : ""}</span>
                              </button>`
                          )}
                      </div>`
                    : nothing}
                <textarea
                    id="message"
                    @input=${this.input}
                    class="resize-none outline-none bg-transparent dark:text-white px-2 pt-2"
                    placeholder="Add a post to your thread about ${this.hashtag!}. The hashtag will be added automatically."
                ></textarea>
                <div class="flex gap-4 items-right">
                    <span
                        class="bg-transparent dark:text-gray ml-auto text-end text-xs flex items-center ${this.count > totalCount
                            ? "text-red dark:text-red"
                            : ""}"
                        >${this.count}/${totalCount}</span
                    >
                    <button
                        @click=${this.sendPost}
                        class="bg-primary text-white px-4 py-1 rounded-tl-lg disabled:bg-gray/70 disabled:text-white/70"
                        ?disabled=${!this.canPost}
                    >
                        Post
                    </button>
                </div>
            </div>
        </div>`;
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
        const totalCount = 300 - (1 + this.hashtag!.length);
        this.canPost = this.count > 0 && this.count <= totalCount;
        message.style.height = "auto";
        message.style.height = message.scrollHeight + "px";

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
                console.log(response.data.actors);
                this.suggestions = response.data.actors;
                this.insert = { start, end };
            },
            () => {
                console.log("Not in handle");
                this.suggestions = [];
                this.insert = undefined;
            }
        );
        this.message = message.value;
    }

    async sendPost() {
        try {
            this.canPost = false;
            this.messageElement!.disabled = true;
            this.requestUpdate();
            const richText = new RichText({ text: this.message + " " + this.hashtag! });
            try {
                await richText.detectFacets(this.bskyClient!);
            } catch (e) {
                // may explode if handles can't be resolved
            }
            const baseKey = this.account + "|" + this.hashtag!;
            const prevRoot = localStorage.getItem(baseKey + "|root") ? JSON.parse(localStorage.getItem(baseKey + "|root")!) : undefined;
            const prevReply = localStorage.getItem(baseKey + "|reply") ? JSON.parse(localStorage.getItem(baseKey + "|reply")!) : undefined;
            let record = {
                $type: "app.bsky.feed.post",
                text: richText.text,
                facets: richText.facets,
                createdAt: new Date().toISOString(),
            } as any;
            if (prevRoot) {
                record = {
                    ...record,
                    reply: {
                        root: prevRoot,
                        parent: prevReply ?? prevRoot,
                    },
                };
            }
            const response = await this.bskyClient?.post(record);
            if (!prevRoot) localStorage.setItem(baseKey + "|root", JSON.stringify(response));
            localStorage.setItem(baseKey + "|reply", JSON.stringify(response));
            this.messageElement!.value = "";
            this.count = 0;
            this.messageElement!.style.height = "auto";
            this.messageElement!.style.height = this.messageElement!.scrollHeight + "px";
        } catch (e) {
            alert("Couldn't publish post!");
        } finally {
            this.canPost = this.count > 0;
            this.messageElement!.disabled = false;
        }
    }
}

function renderCardEmbed(cardEmbed: AppBskyEmbedExternal.ViewExternal) {
    return html`<a class="border rounded border-gray/50 flex mb-2" target="_blank" href="${cardEmbed.uri}">
        ${cardEmbed.thumb ? html`<img src="${cardEmbed.thumb}" class="w-[100px]" />` : nothing}
        <div class="flex flex-col p-2">
            <span class="text-gray text-xs">${new URL(cardEmbed.uri).host}</span>
            <span class="font-bold text-sm">${cardEmbed.title}</span>
            <div class="text-sm line-clamp-2">${cardEmbed.description}</div>
        </div>
    </a>`;
}

function renderImagesEmbed(images: AppBskyEmbedImages.ViewImage[]) {
    return html`<div class="flex flex-col gap-2 items-center mb-2">
        ${map(images, (image) => {
            return html`<img src="${image.thumb}" class="max-h-[30svh] rounded" />`;
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
    return html`<div class="border border-gray/50 rounded p-2 mb-2">${renderRecord(postUrl, author, record, embeds, true)}</div>`;
}
function renderRecordWithMediaEmbed(recordWithMediaEmbed: AppBskyEmbedRecordWithMedia.View) {
    return nothing;
}

function renderRecord(
    postUrl: string,
    author: ProfileViewBasic | ProfileViewDetailed,
    record: AppBskyFeedPost.Record,
    embed?: AppBskyFeedDefs.PostView["embed"],
    smallAvatar = false
): TemplateResult {
    const cardEmbed = AppBskyEmbedExternal.isView(embed) ? embed.external : undefined;
    const imagesEmbed = AppBskyEmbedImages.isView(embed) ? embed.images : undefined;
    const recordEmbed = AppBskyEmbedRecord.isView(embed) ? embed : undefined;
    const recordWithMediaEmbed = AppBskyEmbedRecordWithMedia.isView(embed) ? embed : undefined;
    return html` <div class="flex items-center gap-2">
            <a class="flex items-center gap-2" href="https://bsky.app/profile/${author.handle ?? author.did}" target="_blank">
                ${author.avatar
                    ? html`<img class="${smallAvatar ? "w-[1em] h-[1em]" : "w-[2em] h-[2em]"} rounded-full" src="${author.avatar}" />`
                    : defaultAvatar}
                <span class="text-primary">${author.displayName ?? author.handle}</span>
            </a>
            <a class="ml-auto text-xs text-primary/75" href="${postUrl}" target="_blank">${getDateString(new Date(record.createdAt))}</a>
        </div>
        <div class="mt-1 break-words">${unsafeHTML(processText(record))}</div>
        ${cardEmbed ? renderCardEmbed(cardEmbed) : nothing} ${imagesEmbed ? renderImagesEmbed(imagesEmbed) : nothing}
        ${recordEmbed ? renderRecordEmbed(recordEmbed) : nothing} ${recordWithMediaEmbed ? renderRecordWithMediaEmbed(recordWithMediaEmbed) : nothing}`;
}

@customElement("post-view")
export class PostViewElement extends LitElement {
    static styles = [globalStyles];

    @property()
    bskyClient?: BskyAgent;

    @property()
    post?: AppBskyFeedDefs.PostView;

    render() {
        if (!this.post || !AppBskyFeedPost.isRecord(this.post.record)) {
            return html`<div class="border-t border-gray/30 px-4 py-2">
                ${contentLoader}
                </div>
            </div>`;
        }

        const rkey = this.post.uri.replace("at://", "").split("/")[2];
        const author = this.post.author;
        const postUrl = `https://bsky.app/profile/${author.did}/post/${rkey}`;
        return html`<div class="border-t border-gray/30 px-4 py-2">
            ${renderRecord(postUrl, author, this.post.record, this.post.embed)}
            <div class="flex items-center gap-4 mt-1">
                <a href="${postUrl}" target="_blank" class="flex items-center cursor-pointer gap-1"
                    ><i class="icon w-[1.2em] h-[1.2em] fill-gray dark:fill-white/50">${replyIcon}</i
                    ><span class="text-gray">${this.post.replyCount}</span></a
                >
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

    canLikeAndRepost(toggle: IconToggle) {
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

    async toggleRepost(ev: CustomEvent) {
        const toggle = ev.target as IconToggle;
        if (!this.canLikeAndRepost(toggle)) return;
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
        if (!this.canLikeAndRepost(toggle)) return;
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

@customElement("icon-toggle")
export class IconToggle extends LitElement {
    static styles = [globalStyles];

    @property()
    value = false;

    @property()
    icon?: string;

    render() {
        return html` <div
            class="flex items-center cursor-pointer gap-1 ${this.value ? "text-primary dark:text-primary" : "text-gray dark:text-white/50"}"
            @click=${this.toggle}
        >
            <i class="icon w-[1.2em] h-[1.2em] ${this.value ? "fill-primary dark:fill-primary" : "fill-gray dark:fill-white/50"}"
                >${icons[this.icon as "reblog" | "heart"] ?? ""}</i
            ><slot></slot>
        </div>`;
    }

    toggle() {
        this.value = !this.value;
        this.dispatchEvent(
            new CustomEvent("change", {
                detail: {
                    value: this.value,
                },
            })
        );
    }
}
