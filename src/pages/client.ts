import { LitElement, PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { defaultAvatar, dom, getScrollParent, renderError } from "../utils";
// @ts-ignore
import logoSvg from "../../html/logo.svg";
import { ButtonGroup, FeedsButton, GeneratorViewElementAction, NotificationsButton, OpenPostEditorButton, UpButton } from "../elements";
import { setupPushNotifications } from "../elements/notifications";
import { Overlay, renderTopbar } from "../elements/overlay";
import { routeHash } from "../elements/routing";
import { i18n } from "../i18n";
import { searchIcon, settingsIcon } from "../icons";
import { FEED_CHECK_INTERVAL, State } from "../state";
import { Store } from "../store";
import { ActorFeedStream, FeedPostsStream, PostSearchStream, StreamPage } from "../streams";
import { FeedViewPost, GeneratorView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { AppBskyFeedDefs, AppBskyFeedPost } from "@atproto/api";

const feedUris = [
    "at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot",
    "at://did:plc:kkf4naxqmweop7dv4l2iqqf5/app.bsky.feed.generator/verified-news",
    "at://did:plc:jfhpnnst6flqway4eaeqzj2a/app.bsky.feed.generator/for-science",
];

@customElement("skychat-client")
class SkychatClient extends LitElement {
    @state()
    error?: string;

    @state()
    isConnecting = false;

    @query("#account")
    accountElement?: HTMLInputElement;

    @query("#password")
    passwordElement?: HTMLInputElement;

    @query("#notifications")
    notifications?: HTMLElement;

    @query("#up")
    upButton?: UpButton;

    @query("#feeds")
    feedsButton?: FeedsButton;

    @query("#notifications")
    notificationsButton?: NotificationsButton;

    @query("#post")
    postButton?: OpenPostEditorButton;

    @state()
    selectedFeed = feedUris[0];
    selectedFeedName = i18n("Entertainment");

    lastAccount = "";
    lastPassword = "";
    isExplore = false;

    constructor() {
        super();
    }

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        if (Store.getUser()) {
            this.login();
        } else {
            if (location.hash && location.hash.length > 0) {
                this.explore();
            }
        }
    }

    render() {
        if (this.isConnecting) return this.renderConnecting();
        if (!State.isConnected()) {
            if (Store.getUser() || this.isExplore) {
                return this.renderConnecting();
            } else {
                return this.renderLogin();
            }
        }
        if (this.isExplore) {
            return this.renderExplore();
        } else {
            return this.renderMain();
        }
    }

    renderLogin() {
        const user = Store.getUser();
        const content = html`<p class="text-center mx-auto w-[280px]">${i18n("The better BlueSky app")}</p>
            <p class="text-center text-xs text-muted-fg mx-auto w-[280px]">${i18n("(Possibly, once it's done, work-in-progress :D)")}</p>
            <div class="mx-auto flex flex-col gap-4 mt-4 w-[280px]">
                ${this.error ? renderError(this.error) : nothing}
                <input
                    id="account"
                    class="bg-none border border-input outline-none rounded text-black px-2 py-2"
                    placeholder="${i18n("Account, e.g. badlogic.bsky.social")}"
                    value="${this.lastAccount}"
                />
                <input
                    id="password"
                    type="password"
                    class="bg-none border border-input outline-none rounded text-black px-2 py-2"
                    placeholder="${i18n("App password")}"
                    value="${this.lastPassword}"
                />
                <button class="btn rounded-full" @click=${this.login}>${i18n("Sign in")}</button>
                <button
                    class="align-center bg-transparent border border-primary rounded-full text-primary bg-primary px-4 py-1"
                    @click=${this.explore}
                >
                    ${i18n("Explore without an Account")}
                </button>
            </div>`;

        return html` <main class="flex flex-col m-auto max-w-[640px] px-4 h-full">
            <a class="text-2xl flex align-center justify-center text-primary font-semibold text-center my-8" href="/"
                ><i class="w-[32px] h-[32px] inline-block fill-primary">${unsafeHTML(logoSvg)}</i><span class="ml-2">Skychat</span></a
            >
            <div class="flex-grow flex flex-col">${content}</div>
            <div class="text-center text-xs italic my-4 pb-4">${unsafeHTML(i18n("footer"))}</div>
        </main>`;
    }

    renderConnecting() {
        return html` <main class="flex flex-col m-auto max-w-[640px] px-4 h-full">
            <a class="text-2xl flex align-center justify-center text-primary font-semibold text-center my-8" href="/"
                ><i class="w-[32px] h-[32px] inline-block fill-primary">${unsafeHTML(logoSvg)}</i><span class="ml-2">Skychat</span></a
            >
            <div class="flex-grow flex flex-col">
                <div class="animate-fade flex-grow flex flex-col">
                    <p class="text-center">${i18n("Connecting")}</p>
                    <div class="align-top"><loading-spinner></loading-spinner></div>
                </div>
            </div>
            <div class="text-center text-xs italic my-4 pb-4">${unsafeHTML(i18n("footer"))}</div>
        </main>`;
    }

    renderExplore() {
        if (!State.isConnected()) return html`<div>${i18n("Not connected")}</div>`;

        if (location.hash && location.hash.length > 0) {
            const hash = location.hash;
            const newHref = location.href;
            history.replaceState(null, "", location.href.split("#")[0]);
            setTimeout(() => {
                history.pushState(null, "", newHref);
                routeHash(hash);
            }, 100);
        }

        (async () => {
            const result = await new PostSearchStream("godzilla").next();
            const showPosts = () => {
                const postsDom = this.querySelector("#latestPosts");
                if (!postsDom) {
                    requestAnimationFrame(showPosts);
                    return;
                }
                postsDom.innerHTML = "";
                if (result instanceof Error) {
                    postsDom.append(dom(renderError("I'm a little error"))[0]);
                    return;
                }
                result.items.reverse();
                let count = 0;
                for (const post of result.items) {
                    if (AppBskyFeedPost.isRecord(post.record)) {
                        if (post.author.handle.includes("nowbreezing")) continue;
                        postsDom.append(
                            dom(
                                html`<post-view
                                    class="flex-none w-full border border-divider rounded-md fancy-shadow p-4"
                                    .post=${post}
                                    class="w-full"
                                ></post-view>`
                            )[0]
                        );
                    }
                    if (++count > 2) break;
                }
            };
            showPosts();

            const feedResult = await State.getGenerator(this.selectedFeed);
            const showFeedHeader = () => {
                const feedHeader = this.querySelector("#feedHeader");
                if (!feedHeader) {
                    requestAnimationFrame(showPosts);
                    return;
                }
                feedHeader.innerHTML = "";
                if (feedResult instanceof Error) {
                    feedHeader.append(dom(renderError("I'm a little error"))[0]);
                    return;
                }
                feedHeader.append(
                    dom(
                        html`<generator-view
                            .generator=${feedResult}
                            .editable=${false}
                            .action=${(action: GeneratorViewElementAction, generator: GeneratorView) =>
                                document.body.append(dom(html`<feed-overlay .feedUri=${generator.uri}></feed-overlay>`)[0])}
                            class="w-full"
                        ></generator-view>`
                    )[0]
                );
            };
            showFeedHeader();
        })();

        const feed = dom(html`<div class="max-w-[480px] mx-auto border-l border-r border-b border-divider rounded-md">
            <feed-stream-view
                .stream=${new FeedPostsStream(this.selectedFeed, false, FEED_CHECK_INTERVAL)}
                .newItems=${async (newItems: StreamPage<FeedViewPost> | Error) => {
                    if (newItems instanceof Error) {
                        this.error = i18n("Could not load newer items");
                    }
                }}
            ></feed-stream-view>
        </div>`)[0];

        const buttons = html`<div class="flex items-center ml-auto"><theme-toggle></theme-toggle></div>`;
        const topbar = renderTopbar(
            dom(
                html`<div class="flex items-center gap-2 ml-auto font-semibold">
                    <span>${i18n("Explore BlueSky with")}</span
                    ><a href="/" class="flex items-center gap-1"
                        ><i class="icon !w-5 !h-6 fill-primary">${unsafeHTML(logoSvg)}</i><span class="text-primary">Skychat</span></a
                    >
                </div>`
            )[0],
            buttons
        );

        const box1 = html`<div class="w-full flex flex-col items-center justify-center px-4">
            <div class="flex flex-col justify-center items-center mt-16">
                <h1 class="text-3xl">${unsafeHTML(i18n("explore-header"))}</h1>
                <span class="text-muted-fg text-xs">${unsafeHTML(i18n("(Viewed through Skychat)"))}</span>
            </div>

            <p class="text-center text-lg mt-12 max-w-[320px]">${unsafeHTML(i18n("explore-callout"))}</p>

            <div class="flex mt-8 gap-4 items-center justify-center">
                <a href="https://bsky.app" target="_blank"><button class="btn rounded-full min-w-[150px]">${i18n("Sign up")}</button></a>
                <a href="/"
                    ><button class="btn rounded-full min-w-[150px] bg-transparent text-primary hover:text-primary-fg border border-primary">
                        ${i18n("Sign in")}
                    </button></a
                >
            </div>
        </div>`;

        const box2 = html`<div class="flex flex-col px-4">
            <div class="flex flex-col justify-center items-center mt-16">
                <h1 class="text-3xl text-center">${i18n("Hello, Anyone There?")}</h1>
            </div>
            <div class="mt-6 px-4 flex flex-col">
                <div class="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-8">
                    <div class="flex flex-col items-center justify-center">
                        <p class="text-center text-lg max-w-[320px]">${unsafeHTML(i18n("explore-box-1-text-1"))}</p>
                        <button
                            class="mt-4 btn rounded-full min-w-[150px]"
                            @click=${() => {
                                document.body.append(dom(html`<search-overlay .showTypes=${[i18n("Users")]}></search-overlay>`)[0]);
                            }}
                        >
                            ${i18n("Search people")}
                        </button>
                    </div>
                    <div class="flex flex-col mt-4 sm:mt-0 gap-4 items-center justify-center">
                        <img
                            src="https://cdn.bsky.app/img/avatar/plain/did:plc:y4zs4cabaezzwx3bz2e5nnj2/bafkreihyuljtklac6pgvt4kbndezofm23wswyhdqmh77bgedrxhuigwbh4@jpeg"
                            class="w-32 h-42 rounded-full fancy-shadow cursor-pointer"
                            @click=${() => {
                                document.body.append(dom(html`<profile-overlay .did=${"georgetakei.bsky.social"}></profile-overlay>`)[0]);
                            }}
                        />
                        <button
                            class="btn rounded-full min-w-[150px] bg-transparent text-primary hover:text-primary-fg border border-primary"
                            @click=${() => {
                                document.body.append(dom(html`<profile-overlay .did=${"georgetakei.bsky.social"}></profile-overlay>`)[0]);
                            }}
                        >
                            ${i18n("I need George Takei in my life")}
                        </button>
                    </div>
                </div>
            </div>
            <span class="w-full text-muted-fg text-xs text-center mt-4"
                >${i18n("(You can view all users' followers, followings, posts, media, likes, feeds, and lists)")}
            </span>
        </div>`;

        const box3 = html`<div class="flex flex-col px-4">
            <div class="flex flex-col justify-center items-center mt-16">
                <h1 class="text-3xl">${i18n("My God, It's Full of Posts")}</h1>
            </div>
            <div class="w-full mt-6 flex flex-col">
                <div class="w-full flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-8">
                    <div class="w-full flex flex-col items-center justify-center">
                        <p class="text-center text-lg">${i18n("explore-box-2-text-1")}</p>
                        <p class="text-center text-lg mt-2">${unsafeHTML(i18n("explore-box-2-text-2"))}</p>
                        <button
                            class="mt-4 btn rounded-full min-w-[150px]"
                            @click=${() => {
                                document.body.append(dom(html`<search-overlay .showTypes=${[i18n("Posts")]}></search-overlay>`)[0]);
                            }}
                        >
                            ${i18n("Search posts")}
                        </button>
                        <div id="latestPosts" class="w-full mt-4 flex flex-col items-center justify-center gap-4 min-h-[100px] max-w-[480px]">
                            <loading-spinner></loading-spinner>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

        const box4 = html`<div class="w-full">
            <div class="flex flex-col justify-center items-center mt-16">
                <h1 class="text-3xl text-center">${i18n("Your Feeds, Your Choice")}</h1>
                <span class="text-muted-fg text-xs">${i18n("(or how I learned to love the algorithm)")}</span>
            </div>
            <div class="w-full rounded-md mt-6 px-4 flex flex-col">
                <div class="w-full flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-8">
                    <div class="w-full flex flex-col items-center justify-center">
                        <p class="text-center text-lg">${i18n("explore-box-3-text-1")}</p>
                        <p class="text-center text-lg mt-4">${unsafeHTML(i18n("explore-box-3-text-2"))}</p>
                        <p class="text-center text-lg mt-4">${i18n("explore-box-3-text-3")}</p>
                        <button
                            class="mt-4 btn rounded-full min-w-[150px]"
                            @click=${() => {
                                document.body.append(dom(html`<search-overlay .showTypes=${[i18n("Feeds")]}></search-overlay>`)[0]);
                            }}
                        >
                            ${i18n("Search feeds")}
                        </button>
                    </div>
                </div>
            </div>

            <div class="flex items-center justify-center mt-4">
                <button-group
                    id="type"
                    @change=${(ev: CustomEvent) => {
                        this.selectedFeed = feedUris[ev.detail.index];
                    }}
                    class="self-center !text-lg"
                    .values=${[i18n("Entertainment"), i18n("News"), i18n("Science")]}
                    .selected=${this.selectedFeedName}
                ></button-group>
            </div>

            <div class="text-muted-fg text-xs text-center mt-4">${i18n("(Click on a post to view the entire thread)")}</div>

            <div id="feedHeader" class="max-w-[480px] mt-4 mx-auto bg-muted text-muted-fg px-4 py-4 rounded-t-lg fancy-shadow"></div>
            ${feed}
        </div>`;

        const content = html` <div class="w-full animate-fade">${box1} ${box2} ${box3} ${box4}</div>`;
        return html`<div class="w-full flex flex-col">
            <div class="self-center w-full max-w-[640px]">${topbar}</div>
            <div class="mx-auto w-full max-w-[640px] flex flex-col">${content}</div>
            <div class="h-[100vh] w-full flex-grow"></div>
        </div> `;
    }

    renderMain() {
        if (!State.isConnected()) return html`<div>${i18n("Not connected")}</div>`;

        if (location.hash && location.hash.length > 0) {
            const hash = location.hash;
            const newHref = location.href;
            history.replaceState(null, "", location.href.split("#")[0]);
            setTimeout(() => {
                history.pushState(null, "", newHref);
                routeHash(hash);
            }, 100);
        }
        const user = Store.getUser();
        const buttons = html`<div class="ml-auto flex -mr-1">
            <button
                class="flex items-center justify-center w-10 h-10"
                @click=${() => document.body.append(dom(html`<search-overlay></search-overlay>`)[0])}
            >
                <i class="icon !w-5 !h-5">${searchIcon}</i>
            </button>
            <button
                class="flex items-center justify-center w-10 h-10"
                @click=${() => document.body.append(dom(html`<settings-overlay></settings-overlay>`)[0])}
            >
                <i class="icon !w-5 !h-5">${settingsIcon}</i>
            </button>
            <theme-toggle class="!w-10 !h-10"></theme-toggle>
            <button
                class="flex items-center justify-center w-10 h-10"
                @click=${() => document.body.append(dom(html`<profile-overlay .did=${user?.profile.did}></profile-overlay>`)[0])}
            >
                ${user?.profile.avatar
                    ? html`<img class="w-8 max-w-[none] h-8 rounded-full fancy-shadow" src="${user.profile.avatar}" />`
                    : html`<i class="icon !w-8 !h-8">${defaultAvatar}</i>`}
            </button>
        </div> `;
        const topbar = renderTopbar("Home", buttons);

        const content = html`<feed-stream-view
                .newItems=${async (newItems: StreamPage<FeedViewPost> | Error) => {
                    if (newItems instanceof Error) {
                        this.error = i18n("Could not load newer items");
                    }
                }}
                .stream=${new ActorFeedStream("home", undefined, true, FEED_CHECK_INTERVAL)}
            ></feed-stream-view>
            <open-post-editor-button></open-post-editor-button>
            <notifications-button></notifications-button>
            <feeds-button></feeds-button>
            <lists-button></lists-button>
            <up-button></up-button>`;
        return html`<div class="w-full h-full flex flex-col">
            <div class="self-center w-full max-w-[640px]">${topbar}</div>
            <div class="mx-auto w-full max-w-[640px] min-h-full flex flex-col">${content}</div>
        </div> `;
    }

    async explore() {
        this.isConnecting = true;
        this.requestUpdate();
        try {
            const result = await State.login();
            if (result instanceof Error) throw result;
            this.isExplore = true;
        } catch (e) {
            this.error = i18n("Couldn't log in with your BlueSky credentials"); // FIXME
            return;
        } finally {
            this.isConnecting = false;
        }
    }

    async login() {
        this.isConnecting = true;
        this.requestUpdate();
        try {
            const user = Store.getUser();
            let account = this.accountElement?.value ?? user?.account;
            let password = this.passwordElement?.value ?? user?.password;
            if (account) {
                account = account.trim().replace("@", "");
                if (account.length == 0) {
                    account = undefined;
                    password = undefined;
                } else {
                    if (!account.includes(".")) {
                        account += ".bsky.social";
                    }
                    if (!password) {
                        this.error = i18n("Please specify an app password for your account. You can get one in your BlueSky app's settings.");
                        return;
                    }
                }
            } else {
                account = undefined;
                password = undefined;
            }
            if (!account || !password) {
                this.error = i18n("Invalid account or password.");
                Store.setUser(undefined);
                return;
            }
            this.lastAccount = account;
            this.lastPassword = password;
            const response = await State.login(account, password);
            if (response instanceof Error) {
                this.error = response.message;
                Store.setUser(undefined);
                return;
            }
            setupPushNotifications();
        } catch (e) {
            console.error(e);
        } finally {
            this.isConnecting = false;
        }
    }

    logout() {
        State.logout();
        location.reload();
    }
}
