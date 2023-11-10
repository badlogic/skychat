import { AppBskyFeedDefs, AppBskyFeedPost, BskyAgent } from "@atproto/api";
import { ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { LitElement, PropertyValueMap, html, nothing, svg } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { PostSearch, bskyClient, login, logout } from "../bsky";
import { FirehosePost, startEventStream } from "../firehose";
import { contentLoader, dom, getProfileUrl, hasHashtag, onVisibleOnce, splitAtUri } from "../utils";
// @ts-ignore
import logoSvg from "../../html/logo.svg";
import "../elements";
import { PostEditor, routeHash } from "../elements";
import { bellIcon, homeIcon } from "../icons";
import { cacheProfile } from "../profilecache";
import { Store } from "../store";

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
    numNotifications?: HTMLElement;

    hashtag: string | undefined;
    postSearch?: PostSearch;
    askedReuse = false;
    userScrolled = false;
    loadingOlder = false;
    newNotifications = false;
    seenAt = new Date();

    constructor() {
        super();
        this.hashtag = new URL(location.href).searchParams.get("hashtag") ?? undefined;
    }

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        if (this.hashtag) this.load();
    }

    async load() {
        this.isLoading = true;
        try {
            if (!this.hashtag) {
                this.error = "No hashtag given.";
                return;
            }
            const user = Store.getUser();
            const loginResponse = await login(user?.account, user?.password);
            if (loginResponse instanceof Error) {
                alert("Couldn't log in with your BlueSky credentials");
                location.href = "/";
                return;
            }
            this.postSearch = new PostSearch(this.hashtag.replace("#", ""));
            this.isLoading = false;
            this.isLive = true;
            const checkNotifications = async () => {
                if (!Store.getUser()) return;
                const response = await bskyClient?.countUnreadNotifications();
                if (!response || !response.success) {
                    console.log("No notifications");
                    return;
                }
                if (response.data?.count > 0) {
                    this.bell?.classList.add("animate-wiggle-more", "animate-infinite", "animate-ease-in-out");
                    this.numNotifications?.classList.remove("hidden");
                    this.numNotifications!.innerText = "" + response.data.count;
                } else {
                    this.bell?.classList.remove("animate-wiggle-more", "animate-infinite", "animate-ease-in-out");
                    this.numNotifications?.classList.add("hidden");
                }
            };
            checkNotifications();
            setInterval(checkNotifications, 15000);
        } finally {
            this.isLoading = false;
        }
    }

    renderHeader() {
        const user = Store.getUser();
        return html`<div class="fixed w-[600px] max-w-[100%] top-0 flex p-2 items-center bg-white dark:bg-black z-[100]">
            <a class="flex items-center text-primary font-bold text-center" href="/"
                ><i class="flex justify-center w-6 h-6 inline-block fill-primary">${unsafeHTML(logoSvg)}</i></a
            >
            <a class="flex-grow text-primary font-bold pl-2 truncate" href="/chat.html?hashtag=${encodeURIComponent(this.hashtag!)}"
                >${this.hashtag}</a
            >
            ${user
                ? html`<div class="flex gap-2 ml-2">
                      <button @click=${this.logout}>
                          ${user.profile.avatar
                              ? html`<img class="w-6 max-w-[none] h-6 rounded-full" src="${user.profile.avatar}" />`
                              : html`<i class="icon w-6 h-6">${defaultAvatar}</i>`}
                      </button>
                      <button
                          @click=${() => {
                              document.body.append(dom(html`<skychat-feed-overlay></skychat-feed-overlay>`)[0]);
                          }}
                          class="relative flex"
                      >
                          <i class="icon w-6 h-6">${homeIcon}</i>
                      </button>
                      <button
                          @click=${() => {
                              document.body.append(dom(html`<notifications-overlay></notifications-overlay>`)[0]);
                              this.bell?.classList.remove("animate-wiggle-more", "animate-infinite", "animate-ease-in-out");
                              this.numNotifications?.classList.add("hidden");
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
        if (location.hash && location.hash.length > 0) {
            const hash = location.hash;
            history.replaceState(null, "", location.href.split("#")[0]);
            routeHash(hash);
        }

        if (this.isLive) {
            const user = Store.getUser();
            if (user && user.hashTagThreads[this.hashtag ?? ""] && !this.askedReuse) {
                const thread = user.hashTagThreads[this.hashtag!];
                const rootUrl = `/client.html#thread/${user.profile.did}/${splitAtUri(thread.root.uri).rkey}`;
                return html`<div class="w-full max-w-[600px] mx-auto h-full flex flex-col">
                    ${this.renderHeader()}
                    <p class="text-center pt-[40px] mt-4">
                        You have an <a href="${rootUrl}" class="text-primary">existing thread</a> for ${this.hashtag}
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
                                delete user.hashTagThreads[this.hashtag!];
                                Store.setUser(user);
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

        return html` <main class="flex flex-col justify-between m-auto max-w-[600px] px-4 pt-[40px] h-full leading-5">
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
        const user = Store.getUser();
        const liveDom = dom(html`<main id="livedom" class="w-full h-full overflow-auto">
            <div class="mx-auto max-w-[600px] min-h-full flex flex-col">
                ${this.renderHeader()}
                <div id="posts" class="flex-grow pt-[40px]">
                    <div id="loadOlderPosts" class="w-full text-center p-4 animate-pulse">
                        Loading older posts for <span class="text-primary">${this.hashtag}</span>
                    </div>
                </div>
                ${user
                    ? html` <post-editor class="sticky bottom-0 border-t border-primary border-dashed" .hashtag=${this.hashtag}></post-editor> `
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
                const response = await bskyClient!.getPosts({
                    uris: [firehosePost.uri],
                });
                if (!response.success) throw Error(`Couldn't get post for ${firehosePost.uri}`);
                const post = response.data.posts[0];
                if (AppBskyFeedPost.isRecord(post.record)) {
                    if (post.record.reply) {
                        const did = splitAtUri(post.record.reply.parent.uri).repo!;
                        await cacheProfile(bskyClient!, did);
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

        for (const post of olderPosts) {
            const postHtml = dom(html`<div class="border-t border-gray/50">
                <post-view
                    .post=${post}
                    .quoteCallback=${(post: AppBskyFeedDefs.PostView) => this.editor?.setQuote(post)}
                    .replyCallback=${(post: AppBskyFeedDefs.PostView) => this.editor?.setReply(post)}
                    class="border-t border-gray/50"
                ></post-view>
            </div>`)[0];
            posts.insertBefore(postHtml, load);
        }

        const loaderHeight = load.clientHeight;
        if (posts.children.length > 0) {
            load.remove();
            posts.insertBefore(load, posts.children[0]);
        }

        const initialScrollHeight = this.liveDom.scrollHeight;
        const adjustScroll = () => {
            if (!this.liveDom) return;
            if (this.liveDom.scrollHeight != initialScrollHeight) {
                this.liveDom.scrollTop = this.liveDom.scrollHeight - initialScrollHeight - (initialOffset == 0 ? 0 : loaderHeight);
                this.loadingOlder = false;
            } else {
                requestAnimationFrame(adjustScroll);
            }
        };
        adjustScroll();

        this.loadingOlder = false;
        onVisibleOnce(load! as HTMLElement, () => this.loadOlderPosts());
    }

    logout() {
        if (confirm("Log out?")) {
            logout();
            location.href = "/";
        }
    }
}
