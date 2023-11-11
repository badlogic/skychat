import { LitElement, PropertyValueMap, html, nothing } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { bellIcon, editIcon } from "../icons";
import { contentLoader, defaultAvatar, dom, waitForServiceWorkerActivation } from "../utils";
// @ts-ignore
import logoSvg from "../../html/logo.svg";
import { bskyClient, login, logout } from "../bsky";
import { Store } from "../store";
import { FirebaseOptions, initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { routeHash } from "../elements/routing";
import { setupWorkerNotifications } from "../elements/notifications";

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

    @query("#bell")
    bell?: HTMLElement;

    @query("#notifications")
    notifications?: HTMLElement;

    @query("#ping")
    ping?: HTMLElement;

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
        if (!bskyClient) {
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
        const content = html`<p class="text-center mx-auto w-[280px]">A BlueSky client</p>
            <div class="mx-auto flex flex-col gap-4 mt-4 w-[280px]">
                ${this.error ? html`<div class="mx-auto max-w-[300px] text-[#cc0000] font-bold text-center">${this.error}</div>` : nothing}
                <input
                    id="account"
                    class="bg-none border border-gray/75 outline-none rounded text-black px-2 py-2"
                    placeholder="Account, e.g. badlogic.bsky.social"
                    value="${this.lastAccount}"
                />
                <input
                    id="password"
                    type="password"
                    class="bg-none border border-gray/75 outline-none rounded text-black px-2 py-2"
                    placeholder="App password"
                    value="${this.lastPassword}"
                />
                <button class="align-center rounded bg-primary text-white px-4 py-2" @click=${this.login}>Sign in</button>
                ${!user ? html`<p class="text-xs mt-0 pt-0 text-center">Your credentials will only be stored on your device.</p>` : nothing}
                ${user ? html`<button class="text-sm text-primary" @click=${this.logout}>Log out</button>` : nothing}
            </div>
            <a class="text-xl text-primary text-center font-bold mt-16" href="help.html">How does it work?</a>`;

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

    renderConnecting() {
        return html` <main class="flex flex-col justify-between m-auto max-w-[728px] px-4 h-full leading-5">
            <theme-toggle></theme-toggle>
            <a class="text-2xl flex align-center justify-center text-primary font-bold text-center my-8" href="/"
                ><i class="w-[32px] h-[32px] inline-block fill-primary">${unsafeHTML(logoSvg)}</i><span class="ml-2">Skychat</span></a
            >
            <div class="flex-grow flex flex-col">
                <div class="animate-fade flex-grow flex flex-col">
                    <p class="text-center">Connecting</p>
                    <div class="align-top">${contentLoader}</div>
                </div>
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

    renderMain() {
        if (!bskyClient) return html`<div>Unexpected error: bskyClient is undefined in renderMain()</div>`;
        if (location.hash && location.hash.length > 0) {
            const hash = location.hash;
            history.replaceState(null, "", location.href.split("#")[0]);
            routeHash(hash);
        }

        const mainDom = dom(html`<main class="w-full h-full overflow-auto">
            <div class="mx-auto max-w-[600px] min-h-full flex flex-col">
                ${this.renderTopbar()}<skychat-feed
                    class="pt-[40px]"
                    .poll=${true}
                    .newItems=${() => {
                        if (document.querySelector("main")!.scrollTop > 0) {
                            this.ping?.classList.remove("hidden");
                        }
                    }}
                ></skychat-feed>
                <div class="fixed bottom-4 transform translate-x-[calc(min(100vw,600px)-4em)]">
                    <button
                        class="flex justify-center items-center w-12 h-12 border-primary bg-primary rounded-full"
                        @click=${() => this.showPostEditor()}
                    >
                        <i class="icon w-6 h-6 fill-white">${editIcon}</i>
                    </button>
                </div>
            </div>
        </main>`)[0];

        mainDom.addEventListener("scroll", () => {
            if (mainDom.scrollTop < 100) {
                this.ping?.classList.add("hidden");
            }
        });
        return mainDom;
    }

    showPostEditor() {
        document.body.append(dom(html`<post-editor-overlay></post-editor-overly>`)[0]);
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
                        this.error = "Please specify an app password for your account. You can get one in your BlueSky app's settings.";
                        return;
                    }
                }
            } else {
                account = undefined;
                password = undefined;
            }
            if (!account || !password) {
                this.error = "Invalid account or password.";
                Store.setUser(undefined);
                return;
            }
            this.lastAccount = account;
            this.lastPassword = password;
            const response = await login(account, password);
            if (response instanceof Error) {
                this.error = response.message;
                Store.setUser(undefined);
                return;
            }
            setupWorkerNotifications();
            this.setupCheckNotifications();
        } catch (e) {
            console.error(e);
        } finally {
            this.isConnecting = false;
        }
    }

    setupCheckNotifications() {
        const checkNotifications = async () => {
            try {
                if (!bskyClient?.session) return;
                const response = await bskyClient?.countUnreadNotifications();
                if (!response || !response.success) {
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
            } finally {
                setTimeout(checkNotifications, 5000);
            }
        };
        checkNotifications();
    }

    logout() {
        if (confirm("Log out?")) {
            logout();
            navigator.serviceWorker.controller?.postMessage("logout");
            location.reload();
        }
    }

    renderTopbar() {
        const user = Store.getUser();
        return html`<div class="fixed w-[600px] max-w-[100%] top-0 flex p-2 items-center bg-white dark:bg-black z-10">
            <a class="flex items-center text-primary font-bold text-center" href="/client.html"
                ><i class="flex justify-center w-6 h-6 inline-block fill-primary">${unsafeHTML(logoSvg)}</i></a
            >
            <button class="text-primary font-bold pl-2 relative pr-2" @click=${() => (this.querySelector("main")!.scrollTop = 0)}>
                <span>Home</span>
                <div
                    id="ping"
                    class="hidden animate-ping absolute top-0 right-0 rounded-full bg-primary text-white text-xs w-2 h-2 text-center"
                ></div>
            </button>
            <div class="ml-auto flex gap-2 ml-2">
                <button @click=${this.logout}>
                    ${user?.profile.avatar
                        ? html`<img class="w-6 max-w-[none] h-6 rounded-full" src="${user.profile.avatar}" />`
                        : html`<i class="icon w-6 h-6">${defaultAvatar}</i>`}
                </button>
                <button
                    @click=${async () => {
                        document.body.append(dom(html`<notifications-overlay></notifications-overlay>`)[0]);
                        this.bell?.classList.remove("animate-wiggle-more", "animate-infinite", "animate-ease-in-out");
                        this.notifications?.classList.add("hidden");

                        let response = await Notification.requestPermission();
                        if (response == "granted") {
                            setupWorkerNotifications();
                        }
                    }}
                    class="relative flex"
                >
                    <i id="bell" class="icon w-6 h-6">${bellIcon}</i>
                    <div
                        id="notifications"
                        class="hidden absolute right-[-0.5em] rounded-full bg-primary text-white text-xs w-4 h-4 text-center"
                    ></div>
                </button>
            </div>
            <theme-toggle class="ml-2" absolute="false"></theme-toggle>
        </div>`;
    }
}
