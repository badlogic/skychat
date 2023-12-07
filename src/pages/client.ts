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

        const explainer = html` <div class="max-w-[480px] flex flex-col">
            <div class="flex flex-col justify-center items-center mt-16">
                <h1 class="text-3xl text-center">Well, hello there</h1>
            </div>
            <p class="mt-6">
                It appears a
                <a href="#thread/did:plc:oky5czdrnfjpqslsw2a5iclo/3kfvqvteu532v">prominent BlueSky/atproto related person</a>
                has given you a link to this place.
            </p>
            <p class="mt-4"><a href="#profile/badlogic.bsky.social">I'm</a> glad you're here!</p>
            <p class="mt-4">
                To explore BlueSky without an account, click the "Explore BlueSky without an account" button above (duh). You can look at
                <b>people's profiles</b>, <b>search posts</b>, or <b>explore feeds</b>.
            </p>
            <p class="mt-4">
                You can also use Skychat as a full-blown replacement for the official BlueSky app. Just sign-in above with an
                <a href="https://bsky.app/settings/app-passwords">app password</a>.
            </p>
            <div class="flex flex-col justify-center items-center mt-16">
                <h1 class="text-3xl text-center">Why would I use Skychat instead of the official app?</h1>
            </div>
            <p class="mt-6">
                Glad you asked! The BlueSky team isn't just working on the official app, but a gazillion things. They also have quality standards (no,
                really). As such, they can not move as fast as a single person in their bed room.
            </p>
            <p class="mt-4">Here's what Skychat can do, which the official app can not do (yet);</p>
            <div class="flex flex-col">
                <a class="text-primary mt-4" target="_blank"  href="https://skychat.social/#thread/did:plc:z72i7hdynmk6r22z27h6tvur/3kftdjdm3hd23"
                    >Show how many people quoted a post and the quoting posts themselves<br><span class="text-xs text-muted-fg"
                        >(Click the three dots, then "Quotes")</span
                    ></a
                >
                <a class="text-primary mt-4" target="_blank"  href="https://skychat.social/#profile/did:plc:y4zs4cabaezzwx3bz2e5nnj2"
                    >Show you a person's likes <br /><span class="text-xs text-muted-fg"
                        >(just click the "Likes" tab to view Mr. Takei's likes)</span
                    >
                </a>
                <a class="text-primary mt-4"  target="_blank" href="https://skychat.social/#thread/did:plc:7syfakzcriq44mwbdbc7jwvn/3kfuv2thxnt2j"
                    >Show GIFs/videos from Giphy, Tenor, and Imgur inline <br /><span class="text-xs text-muted-fg"
                        >(Either click the GIF icon when composing a post, or paste a link into your post, then click "Add card")</span
                    ></a
                >
                <a class="text-primary mt-4" target="_blank"  href="https://skychat.social/#thread/did:plc:zbhgvr7v4egikpn3xtzrcm7z/3kfvj6lotsu2s"
                    >Show YouTube videos inline <br /><span class="text-xs text-muted-fg"
                        >(Paste a link into your post, then click "Add card")</span
                    ></a
                >
                <div class="mt-4"
                    >Drag & drop, or copy images from your clipboard directly into the post editor</span
                    ></div
                >
                <a class="text-primary mt-4" target="_blank" href="https://www.youtube.com/shorts/u2znw3Gcv7w"
                    >Threaded by default, including a thread reader mode</a
                >
                <a class="text-primary mt-4" target="_blank" href="https://www.youtube.com/shorts/3Yn4v44qplg"
                    >Collapse/expand replies in a thread via a simple tap/click</a
                >
                <a class="text-primary mt-4" target="_blank" href="https://www.youtube.com/shorts/yfNiRPSOwHg"
                    >(Push-)notification filters</a
                >
                <a class="text-primary mt-4" target="_blank" href="https://www.youtube.com/shorts/Tugudta2Tts"
                    >Easily search your own posts (or those of a specific person)</a
                >
                <a class="text-primary mt-4" target="_blank" href="https://www.youtube.com/watch?v=t9-egFJtNQ4">
                    All the little numbers (likes or reply counts) update across the entire UI in real-time
                </a>
                <a class="text-primary mt-4" target="_blank" href="https://www.youtube.com/watch?v=wGhO1gv5pQQ"
                    >Dev mode, get any at-uri and response JSON directly from within the UI</a
                >
                <div class="text-primary mt-4">
                    Install it as an app on <a href="https://www.youtube.com/shorts/Aj0B6fu0ai4">Android</a>, <a href="https://www.youtube.com/shorts/QMsncxVM48c">iOS (16+)</a>, or your PC and Mac
                </div>
            </div>
            <p class="mt-4">I'm currently working on implementing the last few features to have feature parity with the official client. Then I'll add the following features. Some of them will be paid features, as they require me to pay money for hosting or third party services.</p>
            <div class="text-primary mt-4">Muted words and threads</div>
            <div class="text-primary mt-4">End-to-end encrypted private messages</div>
            <div class="text-primary mt-4">Private bookmarks ($$$)</div>
            <div class="text-primary mt-4">Private curation lists ($$$)</div>
            <div class="text-primary mt-4">Analytics ($$$)</div>
            <div class="text-primary mt-4">Post scheduling ($$$)</div>
            <div class="text-primary mt-4">Image alt-text generation ($$$)</div>
            <p class="mt-4">
                Skychat is only a few weeks in the making, I haven't even officially released it yet!
            </p>
            <p class="mt-4">
             It gets updated daily with new features and bug fixes. And new bugs. If you find any, <a href="https://skychat.social/#profile/badlogic.bsky.social" target="_blank">hit me up on BlueSky</a> and tell me what you found.</a>
            </p>
        </div>`;

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
            </div>
            ${explainer}`;

        return html` <main class="flex flex-col m-auto max-w-[640px] px-4 h-full items-center">
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
            <theme-toggle class="!w-10 !h-10"></theme-toggle>
            <button
                class="flex md:hidden items-center justify-center w-10 h-10"
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
            <nav-buttons></nav-buttons>`;
        return html`<div class="w-full flex flex-col">
            <div class="self-center w-full max-w-[640px]">${topbar}</div>
            <div class="mx-auto w-full max-w-[640px] flex flex-col">${content}</div>
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
