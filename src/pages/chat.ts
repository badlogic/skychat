import { AppBskyFeedPost } from "@atproto/api";
import { PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { LitElement, PropertyValueMap, html, nothing, svg } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { FirehosePost, startEventStream } from "../firehose";
import { dom, hasHashtag, onVisibleOnce, splitAtUri } from "../utils";
// @ts-ignore
import logoSvg from "../../html/logo.svg";
import "../elements";
import { PostEditor, renderTopbar } from "../elements";
import { routeHash } from "../elements/routing";
import { i18n } from "../i18n";
import { bellIcon, homeIcon } from "../icons";
import { State } from "../state";
import { Store } from "../store";
import { PostSearchStream } from "../streams";

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
    postSearch?: PostSearchStream;
    askedReuse = false;
    userScrolled = false;
    loadingOlder = false;
    newNotifications = false;
    seenAt = new Date();
    unsubscribe: () => void = () => {};

    constructor() {
        super();
        this.hashtag = new URL(location.href).searchParams.get("hashtag") ?? undefined;
    }

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        if (this.hashtag) this.load();
        else {
            location.href = "/chat-login.html";
        }
    }

    async load() {
        this.isLoading = true;
        try {
            if (!this.hashtag) {
                this.error = i18n("No hashtag given");
                return;
            }
            const user = Store.getUser();
            const loginResponse = await State.login(user?.account, user?.password);
            if (loginResponse instanceof Error) {
                alert(i18n("Couldn't log in with your BlueSky credentials"));
                location.href = "/chat-login.html";
                return;
            }
            this.postSearch = new PostSearchStream(this.hashtag.replace("#", ""));
            this.isLoading = false;
            this.isLive = true;
            this.unsubscribe = State.subscribe("unreadNotifications", (action, count) => {
                if (count > 0) {
                    this.bell?.classList.add("animate-wiggle-more", "animate-infinite", "animate-ease-in-out");
                    this.numNotifications?.classList.remove("hidden");
                    this.numNotifications!.innerText = "" + count;
                } else {
                    this.bell?.classList.remove("animate-wiggle-more", "animate-infinite", "animate-ease-in-out");
                    this.numNotifications?.classList.add("hidden");
                }
            });
        } finally {
            this.isLoading = false;
        }
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this.unsubscribe();
    }

    renderHeader() {
        const user = Store.getUser();
        const title = dom(html`<a
            class="flex-grow text-primary font-semibold pl-2 truncate"
            href="/chat.html?hashtag=${encodeURIComponent(this.hashtag!)}"
            >${this.hashtag}</a
        >`)[0];
        const buttons = html`${user
            ? html`<div class="flex items-center ml-auto">
                  <button
                      @click=${() => {
                          document.body.append(dom(html`<feed-stream-overlay></feed-stream-overlay>`)[0]);
                      }}
                      class="relative flex w-10 h-10 items-center justify-center"
                  >
                      <i class="icon !w-6 !h-6">${homeIcon}</i>
                  </button>
                  <button
                      @click=${() => {
                          document.body.append(dom(html`<notifications-stream-overlay></notifications-stream-overlay>`)[0]);
                          this.bell?.classList.remove("animate-wiggle-more", "animate-infinite", "animate-ease-in-out");
                          this.numNotifications?.classList.add("hidden");
                      }}
                      class="relative flex w-10 h-10 items-center justify-center"
                  >
                      <i id="bell" class="icon w-6 h-6">${bellIcon}</i>
                      <div
                          id="notifications"
                          class="hidden absolute right-1 top-1 rounded-full bg-primary text-primary-fg text-xs w-4 h-4 text-center"
                      ></div>
                  </button>
                  <theme-toggle absolute="false"></theme-toggle>
                  <button @click=${this.logout} class="flex w-10 h-10 items-center justify-center">
                      ${user.profile.avatar
                          ? html`<img class="w-6 max-w-[none] h-6 rounded-full" src="${user.profile.avatar}" />`
                          : html`<i class="icon !w-6 !h-6">${defaultAvatar}</i>`}
                  </button>
              </div>`
            : nothing}`;
        return renderTopbar(title, buttons);
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
                const rootUrl = `/#thread/${user.profile.did}/${splitAtUri(thread.root.uri).rkey}`;
                return html`<div class="w-full max-w-[640px] mx-auto h-full flex flex-col">
                    ${this.renderHeader()}
                    <div class="flex flex-col px-4">
                        <p class="text-center pt-[56px] mt-4">${unsafeHTML(i18n("You have an existing thread for ")(rootUrl, this.hashtag!))}</p>
                        <p class="text-center mt-4">${i18n("Do you want to add new posts to the existing thread, or start a new thread?")}</p>
                        <div class="flex flex-col mx-auto gap-4 mt-4">
                            <button
                                class="flex-shrink px-4 py-2 rounded bg-primary text-primary-fg"
                                @click=${() => {
                                    this.askedReuse = true;
                                    this.requestUpdate();
                                }}
                            >
                                ${i18n("Use existing thread")}
                            </button>
                            <button
                                class="flex-shrink px-4 py-2 rounded bg-primary text-primary-fg"
                                @click=${() => {
                                    this.askedReuse = true;
                                    delete user.hashTagThreads[this.hashtag!];
                                    Store.setUser(user);
                                    this.requestUpdate();
                                }}
                            >
                                ${i18n("Start new thread")}
                            </button>
                        </div>
                    </div>
                </div>`;
            } else {
                return this.renderLive();
            }
        }

        return html` <main class="flex flex-col justify-between m-auto max-w-[640px] px-4 h-full">
            <a class="text-2xl flex align-center justify-center text-primary font-semibold text-center my-8" href="/chat-login.html"
                ><i class="w-[32px] h-[32px] inline-block fill-primary">${unsafeHTML(logoSvg)}</i><span class="ml-2">Skychat Live</span></a
            >
            <div class="flex-grow flex flex-col">
                <p class="text-center">${i18n("Connecting")}</p>
                <div class="align-top"><loading-spinner></loading-spinner></div>
            </div>
            <div class="text-center text-xs italic my-4 pb-4">${unsafeHTML(i18n("footer"))}</div>
        </main>`;
    }

    renderLive() {
        const user = Store.getUser();
        const liveDom = dom(html`<main id="livedom" class="w-full h-full overflow-auto">
            <div class="mx-auto max-w-[640px] min-h-full flex flex-col">
                ${this.renderHeader()}
                <div id="posts" class="flex-grow">
                    <loading-spinner id="loadOlderPosts"></loading-spinner>
                </div>
                ${user
                    ? html` <post-editor class="sticky bottom-0 border-t border-primary bg-background" .hashtag=${this.hashtag}></post-editor> `
                    : nothing}
            </div>
            <div id="catchup" class="hidden fixed flex items-center">
                <button
                    @click=${() => {
                        this.userScrolled = false;
                        catchup.classList.add("hidden");
                        scrollElement.scrollTo({ top: scrollElement.scrollHeight });
                    }}
                    class="rounded-full bg-primary text-primary-fg px-2 py-1 text-sm"
                >
                    ${i18n("↓ Catch up ↓")}
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
                const posts = await State.getPosts([firehosePost.uri]);
                if (posts instanceof Error) throw new Error(`Couldn't get post for ${firehosePost.uri}`);
                const post = posts[0];
                if (AppBskyFeedPost.isRecord(post.record)) {
                    if (post.record.reply) {
                        const did = splitAtUri(post.record.reply.parent.uri).repo!;
                        await State.getProfiles([did]);
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
                            html`<div id="loadOlderPosts" class="reconnect w-full text-center p-4 border-b border-divider">
                                ${i18n("Reconnected. Some posts may be missing above.")}
                            </div>`
                        )[0]
                    );
            }
            first = false;
        };
        reconnectHandler();
    }

    async deletePost(post: PostView) {
        if (!State.isConnected()) return;
        const result = await State.deletePost(post.uri);
        if (result instanceof Error) {
            alert(i18n("Couldn't delete post"));
            return;
        }
    }

    renderPost(post: PostView, animation: string = "") {
        if (!this.liveDom || !this.editor) return;
        try {
            if (!AppBskyFeedPost.isRecord(post.record)) return;
            const isAnswer =
                post.record.reply?.parent.uri.includes(Store.getUser()?.profile.did ?? "") && !post.uri.includes(Store.getUser()?.profile.did ?? "");
            const postDom = dom(
                html`<div class="border-b border-divider px-4 py-2 ${isAnswer ? "bg-[#d8e4ff] dark:bg-[#001040]" : ""}">
                    <post-view
                        animation=${animation}
                        .post=${post}
                        .quoteCallback=${(post: PostView) => this.editor?.setQuote(post)}
                        .replyCallback=${(post: PostView) => this.editor?.setReply(post)}
                        .deleteCallback=${(post: PostView) => this.deletePost(post)}
                    ></post-view>
                </div>`
            )[0];
            this.liveDom.querySelector("#posts")!.append(postDom);
        } catch (e) {
            console.error(e);
        }
    }

    async loadOlderPosts() {
        if (this.loadingOlder) return;
        if (!this.liveDom) return;
        this.loadingOlder = true;
        const postsDom = this.liveDom.querySelector("#posts")!;
        const load = postsDom.querySelector("#loadOlderPosts")! as HTMLElement;
        const posts = await this.postSearch!.next();
        if (posts instanceof Error || posts.items.length == 0) {
            load.innerText = i18n("No older posts");
            load.classList.remove("animate-pulse");
            this.loadingOlder = false;
            return;
        }

        const fragment = dom(html`<div></div>`)[0];
        for (const post of posts.items) {
            const postDom = dom(html`<div class="border-b border-divider px-4 py-2 animate-fade">
                <post-view
                    .post=${post}
                    .quoteCallback=${(post: PostView) => this.editor?.setQuote(post)}
                    .replyCallback=${(post: PostView) => this.editor?.setReply(post)}
                    .deleteCallback=${(post: PostView) => this.deletePost(post)}
                    class="border-b border-divider"
                ></post-view>
            </div>`)[0];
            fragment.appendChild(postDom);
        }
        postsDom.insertBefore(fragment, postsDom.firstChild);
        this.liveDom.scrollTop = load.offsetTop - 2;
        postsDom.insertBefore(load, postsDom.firstChild);
        this.loadingOlder = false;
        onVisibleOnce(load! as HTMLElement, () => this.loadOlderPosts());
    }

    logout() {
        if (confirm(i18n("Log out?"))) {
            State.logout();
            location.href = "/chat-login.html";
        }
    }
}
