import { LitElement, PropertyValueMap, html, nothing } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { defaultAvatar, dom } from "../utils";
// @ts-ignore
import logoSvg from "../../html/logo.svg";
import { FeedsButton, NotificationsButton, OpenPostEditorButton, UpButton } from "../elements";
import { setupPushNotifications } from "../elements/notifications";
import { renderTopbar } from "../elements/overlay";
import { routeHash } from "../elements/routing";
import { i18n } from "../i18n";
import { searchIcon, settingsIcon } from "../icons";
import { State } from "../state";
import { Store } from "../store";
import { ActorFeedStream } from "../streams";

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

    lastAccount = "";
    lastPassword = "";

    constructor() {
        super();
    }

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        if (Store.getUser()) this.login();
    }

    render() {
        if (this.isConnecting) return this.renderConnecting();
        if (!State.isConnected()) {
            if (Store.getUser()) {
                return this.renderConnecting();
            } else {
                return this.renderLogin();
            }
        }
        return this.renderMain();
    }

    renderLogin() {
        const user = Store.getUser();
        const content = html`<p class="text-center mx-auto w-[280px]">${i18n("The better BlueSky app")}</p>
            <div class="mx-auto flex flex-col gap-4 mt-4 w-[280px]">
                ${this.error ? html`<div class="mx-auto max-w-[300px] text-[#cc0000] font-bold text-center">${this.error}</div>` : nothing}
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
                <button class="align-center rounded bg-primary text-primary-fg px-4 py-2" @click=${this.login}>${i18n("Sign in")}</button>
                ${!user
                    ? html`<p class="text-xs mt-0 pt-0 text-center">${i18n("Your credentials will only be stored on your device.")}</p>`
                    : nothing}
                ${user ? html`<button class="text-sm text-primary" @click=${this.logout}>${i18n("Log out")}</button>` : nothing}
            </div>`;

        return html` <main class="flex flex-col justify-between m-auto max-w-[600px] px-4 h-full">
            <a class="text-2xl flex align-center justify-center text-primary font-bold text-center my-8" href="/"
                ><i class="w-[32px] h-[32px] inline-block fill-primary">${unsafeHTML(logoSvg)}</i><span class="ml-2">Skychat</span></a
            >
            <div class="flex-grow flex flex-col">${content}</div>
            <div class="text-center text-xs italic my-4 pb-4">${i18n("footer")}</div>
        </main>`;
    }

    renderConnecting() {
        return html` <main class="flex flex-col justify-between m-auto max-w-[600px] px-4 h-full">
            <a class="text-2xl flex align-center justify-center text-primary font-bold text-center my-8" href="/"
                ><i class="w-[32px] h-[32px] inline-block fill-primary">${unsafeHTML(logoSvg)}</i><span class="ml-2">Skychat</span></a
            >
            <div class="flex-grow flex flex-col">
                <div class="animate-fade flex-grow flex flex-col">
                    <p class="text-center">${i18n("Connecting")}</p>
                    <div class="align-top"><loading-spinner></loading-spinner></div>
                </div>
            </div>
            <div class="text-center text-xs italic my-4 pb-4">${i18n("footer")}</div>
        </main>`;
    }

    renderMain() {
        if (!State.isConnected()) return html`<div>${i18n("Not connected")}</div>`;
        if (location.hash && location.hash.length > 0) {
            const hash = location.hash;
            const newHref = location.href;
            history.replaceState(null, "", location.href.split("#")[0]);
            history.pushState(null, "", newHref);
            routeHash(hash);
        }

        const mainDom = dom(html`<main class="w-full h-full overflow-auto">
            <div class="mx-auto max-w-[600px] min-h-full flex flex-col">
                ${this.renderTopbar()}<feed-stream-view
                    .newItems=${() => {
                        if (mainDom.scrollTop > 0) {
                            if (!this.upButton) return;
                            this.upButton.classList.remove("hidden");
                            this.upButton.highlight = true;
                        }
                    }}
                    .stream=${new ActorFeedStream("home", undefined, true, 15000)}
                ></feed-stream-view>
                <open-post-editor-button id="post"></open-post-editor-button>
                <notifications-button id="notifications"></notifications-button>
                <feeds-button id="feeds"></feeds-button>
                <search-button id="search"></search-button>
                <up-button id="up" @click=${() => mainDom.scrollTo({ top: 0, behavior: "smooth" })}></up-button>
            </div>
        </main>`)[0];

        return mainDom;
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

    renderTopbar() {
        const user = Store.getUser();
        const feed = dom(html` <span class="text-left font-bold">${i18n("Home")}</span> `)[0];
        const buttons = html`<div class="ml-auto flex fill-primary">
            <button
                class="flex items-center justify-center w-10 h-10"
                @click=${() => document.body.append(dom(html`<search-overlay></search-overlay>`)[0])}
            >
                <i class="icon w-5 h-5">${searchIcon}</i>
            </button>
            <button
                class="flex items-center justify-center w-10 h-10"
                @click=${() => document.body.append(dom(html`<settings-overlay></settings-overlay>`)[0])}
            >
                <i class="icon w-5 h-5">${settingsIcon}</i>
            </button>
            <theme-toggle class="w-10 h-10"></theme-toggle>
            <button
                class="flex items-center justify-center w-10 h-10"
                @click=${() => document.body.append(dom(html`<profile-overlay .did=${user?.profile.did}></profile-overlay>`)[0])}
            >
                ${user?.profile.avatar
                    ? html`<img class="w-8 max-w-[none] h-8 rounded-full" src="${user.profile.avatar}" />`
                    : html`<i class="icon w-8 h-8">${defaultAvatar}</i>`}
            </button>
        </div> `;
        return renderTopbar(feed, buttons);
    }
}
