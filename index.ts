import { LitElement, PropertyValueMap, TemplateResult, html, nothing, svg } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { customElement, property, query, state } from "lit/decorators.js";
import { AuthorCache, BskyAuthor, BskyPost, BskyRecord, Post, PostSearch, getAccount, getPost, processText } from "./bsky";
import { globalStyles } from "./styles";
// @ts-ignore
import logoSvg from "./logo.svg";
import { contentLoader, dom, getDateString, renderCard, renderGallery } from "./utils";
import { BskyAgent, RichText } from "@atproto/api";
import { startEventStream } from "./firehose";
import { heartIcon, reblogIcon, replyIcon } from "./icons";

const icons = {
    reblog: reblogIcon,
    reply: replyIcon,
    heart: heartIcon,
};

const authorCache = new AuthorCache();
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

    @query("#save")
    saveElement?: HTMLInputElement;

    account: string | null;
    password: string | null;
    hashtag: string | null;
    bskyClient?: BskyAgent;
    postSearch?: PostSearch;
    initialPosts: Post[] = [];

    constructor() {
        super();
        this.account = localStorage.getItem("a");
        this.password = localStorage.getItem("p");
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
            } catch (e) {
                this.error = "Couldn't log-in with your BlueSky credentials.";
                this.isLoading = false;
                return;
            }
        }
        this.postSearch = new PostSearch(this.hashtag.replace("#", ""));
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

    askedReuse = false;
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
                    <p>Join the discussion by logging in and create your own thread for the hashtag.</p>
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
                    <label><input id="save" type="checkbox" checked="true" /> Remember me</label>
                    <p class="text-xs mt-0 pt-0">Your credentials will only be stored on your device.</p>
                    <button class="align-center rounded bg-primary text-white px-4 py-2" @click=${this.goLive}>Go live!</button>
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

        this.account = this.accountElement?.value ?? null;
        this.password = this.passwordElement?.value ?? null;
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

        if (this.saveElement?.checked == true && this.account && this.password) {
            localStorage.setItem("a", this.account);
            localStorage.setItem("p", this.password);
        }

        if (this.saveElement?.checked == false) {
            localStorage.removeItem("a");
            localStorage.removeItem("p");
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
            for (const post of olderPosts) {
                const postHtml = dom(html`<post-view .bskyClient=${this.bskyClient} .post=${post}></post-view>`)[0];
                if (!first) first = postHtml;
                posts.insertBefore(postHtml, load);
            }
            if (first) {
                load.remove();
                posts.insertBefore(load, first);
                load.scrollIntoView({ behavior: "smooth", inline: "nearest" });
            }
        };

        const liveDom = dom(html`<main class="w-full h-full overflow-auto">
            <div class="mx-auto max-w-[600px] min-h-full flex flex-col">
                <div class="flex p-2 items-center bg-white dark:bg-black border-b border-gray/50 sticky top-0">
                    <a class="text-sm flex align-center justify-center text-primary font-bold text-center" href="/"
                        ><i class="w-[16px] h-[16px] inline-block fill-primary">${unsafeHTML(logoSvg)}</i><span class="ml-2">Skychat</span></a
                    >
                    <span class="flex-grow text-primary font-bold pl-2"> > ${this.hashtag}</span>
                    <theme-toggle absolute="false"></theme-toggle>
                </div>
                <div id="posts" class="flex-grow">
                    <button id="loadOlderPosts" @click=${loadOlderPosts} class="w-full text-center p-4 text-primary">
                        Load older posts for ${this.hashtag}
                    </button>
                </div>
                ${this.account
                    ? html`<post-editor
                          class="sticky bottom-0"
                          .account=${this.account}
                          .bskyClient=${this.bskyClient}
                          .hashtag=${this.hashtag}
                      ></post-editor> `
                    : nothing}
            </div>
            <div id="catchup" class="w-full hidden absolute flex items-center">
                <button
                    @click=${() => {
                        userScrolled = false;
                        catchup.classList.add("hidden");
                        lastPostHtml?.scrollIntoView();
                    }}
                    class="mx-auto rounded bg-primary px-2 py-1 text-sm text-white"
                >
                    ↓ Catch up ↓
                </button>
            </div>
        </main>`)[0];

        const catchup = liveDom.querySelector("#catchup")! as HTMLElement;
        const editor = liveDom.querySelector("post-editor")! as HTMLElement;
        let lastPostHtml: HTMLElement | undefined;
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
                    catchup.style.bottom = editor.clientHeight + 16 + "px";
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

        const renderPost = (post: Post) => {
            try {
                const posts = liveDom.querySelector("#posts")!;
                if (!post.text.toLowerCase().includes(this.hashtag!.replace("#", "").toLowerCase())) return;
                const postHtml = dom(html`<post-view .bskyClient=${this.bskyClient} .post=${post}></post-view>`)[0];
                posts?.append(postHtml);
                lastPostHtml = postHtml;
                if (!userScrolled) {
                    requestAnimationFrame(() => (scrollElement.scrollTop = scrollElement.scrollHeight));
                }
            } catch (e) {
                console.error(e);
            }
        };

        const ps = [...this.initialPosts];
        const next = () => {
            const post = ps.shift();
            if (post) {
                renderPost(post);
                setTimeout(() => next(), Math.random() * 50);
            }
        };
        next();

        const stream = startEventStream(
            async (post) => {
                renderPost(post);
            },
            () => {
                this.error = `Error, failed to load more posts for hashtag ${this.hashtag}`;
            }
        );

        return liveDom;
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

    @query("#message")
    messageElement?: HTMLTextAreaElement;

    message: string = "";

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        const totalCount = 300 - (1 + this.hashtag!.length);
        return html` <div class="flex mx-auto w-full bg-white dark:bg-black rounded border border-gray/50">
            <div class="flex flex-col flex-grow">
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

    input(ev: InputEvent) {
        const message = ev.target as HTMLTextAreaElement;
        this.count = message.value.trim().length;
        const totalCount = 300 - (1 + this.hashtag!.length);
        this.canPost = this.count > 0 && this.count <= totalCount;
        message.style.height = "auto";
        message.style.height = message.scrollHeight + "px";
        this.message = message.value.trim();
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

@customElement("post-view")
export class PostView extends LitElement {
    static styles = [globalStyles];

    @property()
    bskyClient?: BskyAgent;

    @property()
    post?: Post;

    @state()
    author?: BskyAuthor;

    protected update(changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.update(changedProperties);
        if (changedProperties.has("post") && this.post) {
            const post = this.post;
            (async () => {
                const author = await authorCache.get(post.authorDid);
                if (author instanceof Error) {
                    this.author = {
                        did: post.authorDid,
                        displayName: "unknown",
                        followersCount: 0,
                        followsCount: 0,
                    };
                } else {
                    this.author = author;
                }
                this.postRef = undefined;
                this.requestUpdate();
            })();
        }
    }

    render() {
        if (!this.post || !this.author) {
            return html`<div class="border-t border-gray/30 px-4 py-2">
                ${contentLoader}
                </div>
            </div>`;
        }

        const post = this.post;
        const author = this.author;
        const postUrl = `https://bsky.app/profile/${author.did}/post/${post.rkey}`;
        return html`<div class="border-t border-gray/30 px-4 py-2">
            <div class="flex items-center gap-2">
                <a class="flex items-center gap-2" href="https://bsky.app/profile/${author.handle ?? author.did}" target="_blank">
                    ${author.avatar ? html`<img class="w-[2em] h-[2em] rounded-full" src="${author.avatar}" />` : defaultAvatar}
                    <span class="text-primary">${author.displayName ?? author.handle}</span>
                </a>
                <a class="ml-auto text-xs text-primary/75" href="${postUrl}" target="_blank">${getDateString(new Date(post.createdAt))}</a>
            </div>
            <div class="mt-1">${unsafeHTML(processText(post))}</div>
            ${this.bskyClient
                ? html`<div class="flex items-center gap-4 mt-1">
                      <a href="${postUrl}" target="_blank"><i class="icon w-[1.2em] h-[1.2em] fill-gray dark:fill-white/50">${replyIcon}</i></a>
                      <icon-toggle @change=${this.toggleRepost} icon="reblog"></icon-toggle>
                      <icon-toggle @change=${this.toggleLike} icon="heart"></icon-toggle>
                  </div>`
                : nothing}
        </div>`;
    }

    postRef: { cid: string; uri: string } | undefined;
    async getPostRef(post: Post) {
        if (this.postRef) return this.postRef;
        const response = await getPost(post.authorDid, post.rkey);
        if (response instanceof Error) {
            alert("Couldn't repost post");
            return undefined;
        }
        this.postRef = response;
        return this.postRef;
    }

    repostUri: string | undefined;
    async toggleRepost(ev: CustomEvent) {
        if (!this.post) return;
        const postRef = await this.getPostRef(this.post);
        if (!postRef) return;
        if (ev.detail.value) {
            const response = await this.bskyClient!.repost(postRef.uri, postRef.cid);
            this.repostUri = response.uri;
        } else {
            if (this.repostUri) this.bskyClient?.deleteRepost(this.repostUri);
            this.repostUri = undefined;
        }
    }

    likeUri: string | undefined;
    async toggleLike(ev: CustomEvent) {
        if (!this.post) return;
        const postRef = await this.getPostRef(this.post);
        if (!postRef) return;
        if (ev.detail.value) {
            this.likeUri = (await this.bskyClient!.like(postRef.uri, postRef.cid)).uri;
        } else {
            if (this.likeUri) this.bskyClient?.deleteLike(this.likeUri);
            this.likeUri = undefined;
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

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        return html`<i
            class="icon w-[1.2em] h-[1.2em] ${this.value ? "fill-primary dark:fill-primary" : "fill-gray dark:fill-white/50"}"
            @click=${this.toggle}
            >${icons[this.icon as "reblog" | "heart"] ?? ""}</i
        >`;
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
