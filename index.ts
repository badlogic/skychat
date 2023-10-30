import { LitElement, TemplateResult, html, nothing, svg } from "lit";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { customElement, query, state } from "lit/decorators.js";
import { BskyAuthor, BskyPost, BskyRecord, getAccount, getPost, processText } from "./bsky";
import { globalStyles } from "./styles";
// @ts-ignore
import logoSvg from "./logo.svg";
import { contentLoader, dom, getDateString, renderCard, renderGallery } from "./utils";
import { BskyAgent, RichText } from "@atproto/api";
import { Post, startEventStream } from "./firehose";
import { heartIcon, reblogIcon, replyIcon } from "./icons";

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
    initialPosts: Post[] = [];
    authorCache: Record<string, BskyAuthor> = {};

    constructor() {
        super();
        this.account = localStorage.getItem("a");
        this.password = localStorage.getItem("p");
        this.hashtag = null;
    }

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    async load() {
        this.isLoading = true;
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

        try {
            const response = await fetch(`https://search.bsky.social/search/posts?q=${encodeURIComponent(this.hashtag!)}`);
            if (response.status != 200) {
                throw Error();
            }
            const initialPosts: any[] = await response.json();
            for (const initialPost of initialPosts) {
                if (!this.authorCache[initialPost.user.did]) {
                    const author = await getAccount(initialPost.user.did);
                    if (author instanceof Error) continue;
                    this.authorCache[initialPost.user.did] = author;
                }
                this.initialPosts.push({
                    authorDid: initialPost.user.did,
                    rkey: initialPost.tid.split("/")[1],
                    createdAt: initialPost.post.createdAt / 1000000,
                    text: initialPost.post.text as string,
                    cid: initialPost.cid,
                } as Post);
            }
            this.initialPosts = this.initialPosts.sort((a, b) => (b.createdAt as number) - (a.createdAt as number)).reverse();
        } catch (e) {
            this.error = `Couldn't fetch posts for hashtag ${this.hashtag}`;
            this.isLoading = false;
            return;
        }

        this.isLoading = false;
        this.isLive = true;
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
                    <p>Optionally log-in with your BlueSky account to create your own thread</p>
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
        const liveDom = dom(html`<div class="w-full max-w-[590px] mx-auto h-full flex flex-col">
            <div class="flex p-2 items-center border-b border-gray/50">
                <a class="text-sm flex align-center justify-center text-primary font-bold text-center" href="/"
                    ><i class="w-[16px] h-[16px] inline-block fill-primary">${unsafeHTML(logoSvg)}</i><span class="ml-2">Skychat</span></a
                >
                <span class="flex-grow text-center">${this.hashtag}</span>
                <theme-toggle absolute="false"></theme-toggle>
            </div>
            <div id="catchup" class="w-full max-w-[590px] hidden absolute top-[3em] flex items-center">
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
            <div id="posts" class="flex-grow overflow-auto"></div>
            ${this.account
                ? html`
                      <div class="flex mx-auto w-full">
                          <div class="flex flex-col flex-grow">
                              <textarea
                                  id="message"
                                  class="resize-none outline-none bg-transparent px-2 pt-2 border-t border-gray/50"
                                  placeholder="Add a post to your thread about ${this.hashtag!}. The hashtag will be added automatically."
                              ></textarea>
                              <span id="count" class="text-end text-xs pr-2 pb-2"></span>
                          </div>
                          <button id="sendPost" class="bg-primary text-white px-4 disabled:bg-primary/70 disabled:text-white/70">Post</button>
                      </div>
                  `
                : nothing}
        </div>`)[0];

        if (this.bskyClient) {
            const totalCount = 300 - (1 + this.hashtag!.length);
            const count = liveDom.querySelector("#count")! as HTMLSpanElement;
            count.innerText = "0/" + totalCount;
            const message = liveDom.querySelector("#message")! as HTMLTextAreaElement;
            const sendPost = liveDom.querySelector("#sendPost")! as HTMLInputElement;

            message.addEventListener("input", () => {
                message.style.height = "auto";
                message.style.height = message.scrollHeight + "px";
                const text = message.value.trim();
                if (text.length == 0 || text.length > totalCount) {
                    sendPost.disabled = true;
                    count.classList.add("text-red");
                } else {
                    sendPost.disabled = false;
                    count.classList.remove("text-red");
                }
                count.innerText = text.length + "/" + totalCount;
            });

            sendPost.disabled = true;
            sendPost.addEventListener("click", async () => {
                try {
                    message.disabled = true;
                    sendPost.disabled = true;
                    const richText = new RichText({ text: message.value + " " + this.hashtag! });
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
                    message.value = "";
                    count.innerText = "0/" + totalCount;
                    sendPost.disabled = true;
                } catch (e) {
                    alert("Couldn't publish post!");
                } finally {
                    message.disabled = false;
                    sendPost.disabled = false;
                }
            });
        }

        const posts = liveDom.querySelector("#posts")!;
        const catchup = liveDom.querySelector("#catchup")!;
        let lastPostHtml: HTMLElement | undefined;
        let userScrolled = false;
        let lastScrollTop = posts.scrollTop;
        posts.addEventListener("scroll", (ev) => {
            if (lastScrollTop > posts.scrollTop) {
                userScrolled = true;
                catchup.classList.remove("hidden");
            }
            if (posts.scrollHeight - posts.scrollTop === posts.clientHeight) {
                userScrolled = false;
                catchup.classList.add("hidden");
            }
            lastScrollTop = posts.scrollTop;
        });

        const renderPost = async (post: Post) => {
            try {
                if (!post.text.toLowerCase().includes(this.hashtag!.toLowerCase())) return;
                const author = this.authorCache[post.authorDid] ?? (await getAccount(post.authorDid));
                this.authorCache[post.authorDid] = author;
                const postHtml = this.recordPartial(author, post.rkey, post);
                posts?.append(postHtml);
                lastPostHtml = postHtml;
                if (!userScrolled) postHtml.scrollIntoView({ behavior: "smooth" });
            } catch (e) {
                console.error(e);
            }
        };

        (async () => {
            for (const post of this.initialPosts) {
                await renderPost(post);
            }

            const stream = startEventStream(
                async (post) => {
                    renderPost(post);
                },
                () => {
                    this.error = `Error, failed to load more posts for hashtag ${this.hashtag}`;
                }
            );
        })();

        return liveDom;
    }

    defaultAvatar = svg`<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="none" data-testid="userAvatarFallback"><circle cx="12" cy="12" r="12" fill="#0070ff"></circle><circle cx="12" cy="9.5" r="3.5" fill="#fff"></circle><path stroke-linecap="round" stroke-linejoin="round" fill="#fff" d="M 12.058 22.784 C 9.422 22.784 7.007 21.836 5.137 20.262 C 5.667 17.988 8.534 16.25 11.99 16.25 C 15.494 16.25 18.391 18.036 18.864 20.357 C 17.01 21.874 14.64 22.784 12.058 22.784 Z"></path></svg>`;

    recordPartial(author: BskyAuthor, rkey: string, record: BskyRecord, isQuote = false) {
        const recordDom = dom(html`<div class="border-b border-gray/30 p-4">
            <div class="flex items-center gap-2">
                <a class="flex items-center gap-2" href="https://bsky.app/profile/${author.handle ?? author.did}" target="_blank">
                    ${author.avatar ? html`<img class="w-[2em] h-[2em] rounded-full" src="${author.avatar}" />` : this.defaultAvatar}
                    <span class="text-primary">${author.displayName ?? author.handle}</span>
                </a>
                <a class="text-xs text-primary/75" href="https://bsky.app/profile/${author.did}/post/${rkey}" target="_blank"
                    >${getDateString(new Date(record.createdAt))}</a
                >
            </div>
            <div class="${isQuote ? "italic" : ""} mt-1">${unsafeHTML(processText(record))}</div>
            ${this.bskyClient
                ? html`<div class="flex items-center gap-4 mt-1">
                      <a href="https://bsky.app/profile/${author.did}/post/${rkey}" target="_blank"
                          ><i class="icon min-w-[1.25em] min-h-[1.25em] fill-black dark:fill-white/50">${replyIcon}</i></a
                      >
                      <i id="repost" class="icon min-w-[1.25em] min-h-[1.25em] fill-black dark:fill-white/50">${reblogIcon}</i>
                      <i id="like" class="icon min-w-[1.25em] min-h-[1.25em] fill-black dark:fill-white/50">${heartIcon}</i>
                  </div>`
                : nothing}
        </div>`)[0];
        const reblog = recordDom.querySelector("#repost");
        let postCoords: { cid: string; uri: string } | undefined = undefined;
        let reblogged = false;
        let reblogUri: string | undefined = undefined;
        reblog?.addEventListener("click", async () => {
            if (!postCoords) {
                const response = await getPost(author.did, rkey);
                if (response instanceof Error) {
                    alert("Couldn't repost post");
                    return;
                }
                postCoords = response;
            }
            reblogged = !reblogged;
            if (reblogged) {
                reblog.classList.remove("fill-black");
                reblog.classList.remove("dark:fill-white/50");
                reblog.classList.add("fill-primary");
                reblog.classList.add("dark:fill-primary");
                const response = await this.bskyClient!.repost(postCoords.uri, postCoords.cid);
                reblogUri = response.uri;
            } else {
                reblog.classList.add("fill-black");
                reblog.classList.add("dark:fill-white/50");
                reblog.classList.remove("fill-primary");
                reblog.classList.remove("dark:fill-primary");
                if (reblogUri) this.bskyClient?.deleteRepost(reblogUri);
                reblogUri = undefined;
            }
        });
        const like = recordDom.querySelector("#like");
        let liked = false;
        let likeUri: string | undefined = undefined;
        like?.addEventListener("click", async () => {
            if (!postCoords) {
                const response = await getPost(author.did, rkey);
                if (response instanceof Error) {
                    alert("Couldn't like post");
                    return;
                }
                postCoords = response;
            }
            liked = !liked;
            if (liked) {
                like.classList.remove("fill-black");
                like.classList.remove("dark:fill-white/50");
                like.classList.add("fill-primary");
                like.classList.add("dark:fill-primary");
                likeUri = (await this.bskyClient!.like(postCoords.uri, postCoords.cid)).uri;
            } else {
                like.classList.add("fill-black");
                like.classList.add("dark:fill-white/50");
                like.classList.remove("fill-primary");
                like.classList.remove("dark:fill-primary");
                if (likeUri) this.bskyClient?.deleteLike(likeUri);
            }
        });
        return recordDom;
    }

    postPartial(post: BskyPost): HTMLElement {
        let images = post.embed?.images ? renderGallery(post.embed.images) : undefined;
        if (!images) images = post.embed?.media?.images ? renderGallery(post.embed.media.images) : undefined;
        let card = post.embed?.external ? renderCard(post.embed.external) : undefined;

        let quotedPost = post.embed?.record;
        if (quotedPost && quotedPost?.$type != "app.bsky.embed.record#viewRecord") quotedPost = quotedPost.record;
        const quotedPostAuthor = quotedPost?.author;
        const quotedPostUri = quotedPost?.uri;
        const quotedPostValue = quotedPost?.value;
        let quotedPostImages = quotedPost?.embeds[0]?.images ? renderGallery(quotedPost.embeds[0].images) : undefined;
        if (!quotedPostImages) quotedPostImages = quotedPost?.embeds[0]?.media?.images ? renderGallery(quotedPost.embeds[0].media.images) : undefined;
        let quotedPostCard = quotedPost?.embeds[0]?.external ? renderCard(quotedPost.embeds[0].external) : undefined;

        const postDom = dom(html`<div>
            <div class="flex flex-col py-4 post min-w-[280px] border-b border-gray/50">
                ${this.recordPartial(post.author, post.uri, post.record)} ${images ? html`<div class="mt-2">${images}</div>` : nothing}
                ${quotedPost
                    ? html`<div class="border border-gray/50 rounded p-4 mt-2">
                          ${this.recordPartial(quotedPostAuthor!, quotedPostUri!, quotedPostValue!, true)}
                          ${quotedPostImages ? html`<div class="mt-2">${quotedPostImages}</div>` : nothing}
                          ${quotedPostCard ? quotedPostCard : nothing}
                      </div>`
                    : nothing}
                ${card ? card : nothing}
                <div class="flex gap-2 font-bold mt-4 text-primary"><span>${post.repostCount} reposts</span><span>${post.likeCount} likes</span></div>
            </div>
        </div>`)[0];

        return postDom;
    }
}
