import { AppBskyFeedDefs, AppBskyFeedPost, BskyAgent } from "@atproto/api";
import { ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { LitElement, PropertyValueMap, TemplateResult, html, nothing, svg } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { PostSearch } from "../bsky";
import { FirehosePost, startEventStream } from "../firehose";
import { ImageInfo, contentLoader, dom, getProfileUrl, hasHashtag, login, logout, onVisibleOnce } from "../utils";
// @ts-ignore
import logoSvg from "../../html/logo.svg";
import "../elements";
import { cacheProfile } from "../profilecache";
import { bellIcon, homeIcon } from "../icons";
import { PostEditor } from "../elements";

const defaultAvatar = svg`<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="none" data-testid="userAvatarFallback"><circle cx="12" cy="12" r="12" fill="#0070ff"></circle><circle cx="12" cy="9.5" r="3.5" fill="#fff"></circle><path stroke-linecap="round" stroke-linejoin="round" fill="#fff" d="M 12.058 22.784 C 9.422 22.784 7.007 21.836 5.137 20.262 C 5.667 17.988 8.534 16.25 11.99 16.25 C 15.494 16.25 18.391 18.036 18.864 20.357 C 17.01 21.874 14.64 22.784 12.058 22.784 Z"></path></svg>`;

@customElement("skychat-chat")
export class Chat extends LitElement {
    @state()
    error?: string;

    @state()
    isLoading = false;

    @state()
    isLive = false;

    @query("#livedom")
    liveDom?: HTMLElement;

    @query("post-editor")
    editor?: PostEditor;

    @query("#bell")
    bell?: HTMLElement;
    @query("#notifications")
    notifications?: HTMLElement;

    account: string | undefined;
    password: string | undefined;
    accountProfile: ProfileViewDetailed | null;
    hashtag: string | null;
    bskyClient?: BskyAgent;
    postSearch?: PostSearch;
    askedReuse = false;
    userScrolled = false;
    loadingOlder = false;
    newNotifications = false;
    seenAt = new Date();

    constructor() {
        super();
        this.account = localStorage.getItem("a") ?? undefined;
        this.password = localStorage.getItem("p") ?? undefined;
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
        const loginResponse = await login(this.account, this.password);
        if (loginResponse instanceof Error) {
            alert("Couldn't log in with your BlueSky credentials");
            location.href = "/";
            return;
        }
        this.bskyClient = loginResponse;
        this.postSearch = new PostSearch(this.bskyClient, this.hashtag.replace("#", ""));
        this.isLoading = false;
        this.isLive = true;
        const checkNotifications = async () => {
            if (!this.bskyClient?.session) return;
            const response = await this.bskyClient?.countUnreadNotifications();
            if (!response || !response.success) {
                console.log("No notifications");
                return;
            }
            if (response.data?.count > 0) {
                this.bell?.classList.add("animate-wiggle-more", "animate-infinite", "animate-ease-in-out");
                this.notifications?.classList.remove("hidden");
                this.notifications!.innerText = "" + response.data.count;
            } else {
                this.bell?.classList.remove("animate-wiggle-more", "animate-infinite", "animate-ease-in-out");
                this.notifications?.classList.add("hidden");
            }
        };
        checkNotifications();
        setInterval(checkNotifications, 15000);
    }

    renderHeader() {
        return html`<div class="fixed w-[600px] max-w-[100%] top-0 flex p-2 items-center bg-white dark:bg-black z-[100]">
            <a class="flex items-center text-primary font-bold text-center" href="/"
                ><i class="flex justify-center w-6 h-6 inline-block fill-primary">${unsafeHTML(logoSvg)}</i></a
            >
            <a class="flex-grow text-primary font-bold pl-2 truncate" href="/chat.html?hashtag=${encodeURIComponent(this.hashtag!)}"
                >${this.hashtag}</a
            >
            ${this.accountProfile
                ? html`<div class="flex gap-2 ml-2">
                      <button @click=${this.logout}>
                          ${this.accountProfile.avatar
                              ? html`<img class="w-6 max-w-[none] h-6 rounded-full" src="${this.accountProfile.avatar}" />`
                              : html`<i class="icon w-6 h-6">${defaultAvatar}</i>`}
                      </button>
                      <button
                          @click=${() => {
                              document.body.append(dom(html`<skychat-feed-overlay .bskyClient=${this.bskyClient}></skychat-feed-overlay>`)[0]);
                          }}
                          class="relative flex"
                      >
                          <i class="icon w-6 h-6">${homeIcon}</i>
                      </button>
                      <button
                          @click=${() => {
                              document.body.append(dom(html`<skychat-notifications .bskyClient=${this.bskyClient}></skychat-notifications>`)[0]);
                              this.bell?.classList.remove("animate-wiggle-more", "animate-infinite", "animate-ease-in-out");
                              this.notifications?.classList.add("hidden");
                          }}
                          class="relative flex"
                      >
                          <i id="bell" class="icon w-6 h-6">${bellIcon}</i>
                          <div
                              id="notifications"
                              class="hidden absolute right-[-0.5em] rounded-full bg-primary text-white text-xs w-4 h-4 text-center"
                          ></div>
                      </button>
                  </div>`
                : nothing}
            <theme-toggle class="ml-2" absolute="false"></theme-toggle>
        </div>`;
    }

    render() {
        if (this.isLive) {
            const baseKey = this.account + "|" + this.hashtag!;
            if (localStorage.getItem(baseKey + "|root") && !this.askedReuse) {
                const root = localStorage.getItem(baseKey + "|root");
                const rootUrl = `${getProfileUrl(this.account ?? "")}/post/${root?.replace("at://", "").split("/")[2]}`;
                return html`<div class="w-full max-w-[600px] mx-auto h-full flex flex-col">
                    ${this.renderHeader()}
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

        return html` <main class="flex flex-col justify-between m-auto max-w-[728px] px-4 h-full leading-5">
            <theme-toggle></theme-toggle>
            <a class="text-2xl flex align-center justify-center text-primary font-bold text-center my-8" href="/"
                ><i class="w-[32px] h-[32px] inline-block fill-primary">${unsafeHTML(logoSvg)}</i><span class="ml-2">Skychat</span></a
            >
            <div class="flex-grow flex flex-col">
                <p class="text-center">Connecting</p>
                <div class="align-top">${contentLoader}</div>
            </div>
            <div class="text-center text-xs italic my-4 pb-4">
                <a class="text-primary" href="https://skychat.social" target="_blank">Skychat</a>
                is lovingly made by
                <a class="text-primary" href="https://bsky.app/profile/badlogic.bsky.social" target="_blank">Mario Zechner</a><br />
                No data is collected, not even your IP address.<br />
                <a class="text-primary" href="https://github.com/badlogic/skychat" target="_blank">Source code</a>
            </div>
        </main>`;
    }

    renderLive() {
        const liveDom = dom(html`<main id="livedom" class="w-full h-full overflow-auto">
            <div class="mx-auto max-w-[600px] min-h-full flex flex-col">
                ${this.renderHeader()}
                <div id="posts" class="flex-grow pt-[40px]">
                    <div id="loadOlderPosts" class="w-full text-center p-4 animate-pulse">
                        Loading older posts for <span class="text-primary">${this.hashtag}</span>
                    </div>
                </div>
                ${this.account
                    ? html`
                          <post-editor
                              class="sticky bottom-0 border-t border-primary border-dashed"
                              .account=${this.account}
                              .bskyClient=${this.bskyClient}
                              .hashtag=${this.hashtag}
                          ></post-editor>
                      `
                    : nothing}
            </div>
            <div id="catchup" class="bg-gray hidden fixed flex items-center z-[50]">
                <button
                    @click=${() => {
                        this.userScrolled = false;
                        catchup.classList.add("hidden");
                        scrollElement.scrollTo({ top: scrollElement.scrollHeight });
                    }}
                    class="rounded bg-primary px-2 py-1 text-sm text-white"
                >
                    ↓ Catch up ↓
                </button>
            </div>
        </main>`)[0];

        const olderPosts = liveDom.querySelector("#loadOlderPosts")! as HTMLElement;
        onVisibleOnce(olderPosts! as HTMLElement, () => this.loadOlderPosts());

        const catchup = liveDom.querySelector("#catchup")! as HTMLElement;
        const editor = liveDom.querySelector("post-editor") as HTMLElement;
        const scrollElement = liveDom;
        let lastScrollTop = scrollElement.scrollTop;
        let updateCatchupBottom = false;
        scrollElement.addEventListener("scroll", (ev) => {
            if (lastScrollTop > scrollElement.scrollTop) {
                this.userScrolled = true;
                catchup.classList.remove("hidden");
                updateCatchupBottom = true;
                const update = () => {
                    catchup.style.bottom = (editor?.clientHeight ?? 0) + 16 + "px";
                    catchup.style.left = window.innerWidth / 2 - catchup.clientWidth / 2 + "px";
                    if (updateCatchupBottom) requestAnimationFrame(update);
                };
                update();
            }
            if (scrollElement.scrollHeight - scrollElement.scrollTop < scrollElement.clientHeight * 1.05) {
                this.userScrolled = false;
                catchup.classList.add("hidden");
                updateCatchupBottom = false;
            }
            lastScrollTop = scrollElement.scrollTop;
        });

        this.setupAutoScroll(liveDom);
        this.setupFirehose();
        return liveDom;
    }

    setupAutoScroll(liveDom: HTMLElement) {
        const scrollElement = liveDom;
        let prevHeight = scrollElement.scrollHeight;
        const scrollOnHeightChange = () => {
            const height = scrollElement.scrollHeight;
            if (!this.userScrolled && height !== prevHeight) {
                prevHeight = height;
                scrollElement.scrollTo({ top: scrollElement.scrollHeight });
            }
            requestAnimationFrame(scrollOnHeightChange);
        };
        scrollOnHeightChange();
    }

    setupFirehose() {
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
                this.renderPost(post, "animate-fade-left");
            } catch (e) {
                console.error(e);
            }
        };

        let first = true;
        const reconnectHandler = async () => {
            console.log("Reconnecting");
            startEventStream(postHandler, reconnectHandler);
            if (!first && this.liveDom && !this.liveDom.querySelector(".reconnect")) {
                this.liveDom
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
        };
        reconnectHandler();
    }

    renderPost(post: AppBskyFeedDefs.PostView, animation: string = "") {
        if (!this.liveDom || !this.editor) return;
        try {
            if (!AppBskyFeedPost.isRecord(post.record)) return;
            const postHtml = dom(
                html`<div class="border-t border-gray/50">
                    <post-view
                        animation=${animation}
                        .bskyClient=${this.bskyClient}
                        .post=${post}
                        .quoteCallback=${(post: AppBskyFeedDefs.PostView) => this.editor?.setQuote(post)}
                        .replyCallback=${(post: AppBskyFeedDefs.PostView) => this.editor?.setReply(post)}
                    ></post-view>
                </div>`
            )[0];
            this.liveDom.querySelector("#posts")!.append(postHtml);
        } catch (e) {
            console.error(e);
        }
    }

    async loadOlderPosts() {
        if (this.loadingOlder) return;
        if (!this.liveDom) return;
        this.loadingOlder = true;
        const posts = this.liveDom.querySelector("#posts")!;
        const load = posts.querySelector("#loadOlderPosts")! as HTMLElement;
        let initialOffset = this.postSearch?.offset;
        const olderPosts = await this.postSearch!.next();
        if (olderPosts instanceof Error || olderPosts.length == 0) {
            load.innerText = "No older posts";
            load.classList.remove("animate-pulse");
            this.loadingOlder = false;
            return;
        }
        let first: HTMLElement | undefined;
        let last: HTMLElement | undefined;
        for (const post of olderPosts) {
            const postHtml = dom(html`<div class="border-t border-gray/50">
                <post-view
                    .bskyClient=${this.bskyClient}
                    .post=${post}
                    .quoteCallback=${(post: AppBskyFeedDefs.PostView) => this.editor?.setQuote(post)}
                    .replyCallback=${(post: AppBskyFeedDefs.PostView) => this.editor?.setReply(post)}
                    class="border-t border-gray/50"
                ></post-view>
            </div>`)[0];
            posts.insertBefore(postHtml, load);
            if (!first) first = postHtml;
            last = postHtml;
        }

        if (first) {
            const f = first;
            const initialScrollHeight = this.liveDom.scrollHeight;
            const adjustScroll = () => {
                if (!this.liveDom) return;
                if (this.liveDom.scrollHeight != initialScrollHeight) {
                    load.remove();
                    posts.insertBefore(load, f);
                    this.liveDom.scrollTop = this.liveDom.scrollHeight - initialScrollHeight - (initialOffset == 0 ? 0 : load.clientHeight);
                    this.loadingOlder = false;
                } else {
                    requestAnimationFrame(adjustScroll);
                }
            };
            adjustScroll();
        }

        onVisibleOnce(load! as HTMLElement, () => this.loadOlderPosts());
    }

    logout() {
        if (confirm("Log out?")) {
            logout();
            location.href = "/";
        }
    }
}
