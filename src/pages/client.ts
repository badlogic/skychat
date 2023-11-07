import { LitElement, PropertyValueMap, html, nothing } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { homeIcon, bellIcon } from "../icons";
import { contentLoader, defaultAvatar, dom, login, logout } from "../utils";
// @ts-ignore
import logoSvg from "../../html/logo.svg";
import { BskyAgent } from "@atproto/api";
import { ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";

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

    account: string | undefined;
    password: string | undefined;
    accountProfile: ProfileViewDetailed | null;
    bskyClient?: BskyAgent;

    constructor() {
        super();
        this.account = localStorage.getItem("a") ?? undefined;
        this.password = localStorage.getItem("p") ?? undefined;
        this.accountProfile = localStorage.getItem("profile") ? JSON.parse(localStorage.getItem("profile")!) : null;
    }

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        if (this.accountProfile) this.login();
    }

    render() {
        if (this.isConnecting) return this.renderConnecting();
        if (!this.bskyClient) {
            if (this.accountProfile) {
                return this.renderConnecting();
            } else {
                return this.renderLogin();
            }
        }
        return this.renderMain();
    }

    renderLogin() {
        const accountProfile = localStorage.getItem("profile") ? JSON.parse(localStorage.getItem("profile")!) : null;
        const account = localStorage.getItem("a");
        const password = localStorage.getItem("a");
        const content = html`<p class="text-center mx-auto w-[280px]">A BlueSky client</p>
            <div class="mx-auto flex flex-col gap-4 mt-4 w-[280px]">
                ${this.error ? html`<div class="mx-auto max-w-[300px] text-[#cc0000] font-bold text-center">${this.error}</div>` : nothing}
                <input
                    id="account"
                    class="bg-none border border-gray/75 outline-none rounded text-black px-2 py-2"
                    placeholder="Account, e.g. badlogic.bsky.social"
                    value="${account}"
                />
                <input
                    id="password"
                    type="password"
                    class="bg-none border border-gray/75 outline-none rounded text-black px-2 py-2"
                    placeholder="App password"
                    value="${password}"
                />
                <button class="align-center rounded bg-primary text-white px-4 py-2" @click=${this.login}>Sign in</button>
                ${!accountProfile ? html`<p class="text-xs mt-0 pt-0 text-center">Your credentials will only be stored on your device.</p>` : nothing}
                ${accountProfile ? html`<button class="text-sm text-primary" @click=${this.logout}>Log out</button>` : nothing}
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
        const mainDom = dom(html`<main class="w-full h-full overflow-auto">
            <div class="mx-auto max-w-[600px] min-h-full flex flex-col">
                ${this.renderTopbar()}<skychat-feed
                    class="pt-[40px]"
                    .bskyClient=${this.bskyClient}
                    .newPosts=${() => {
                        if (document.querySelector("main")!.scrollTop > 0) {
                            this.ping?.classList.remove("hidden");
                        }
                    }}
                ></skychat-feed>
            </div>
        </main>`)[0];

        mainDom.addEventListener("scroll", () => {
            if (mainDom.scrollTop < 100) {
                this.ping?.classList.add("hidden");
            }
        });
        return mainDom;
    }

    async login() {
        this.isConnecting = true;
        this.requestUpdate();
        try {
            let account = this.accountElement?.value ?? this.account;
            let password = this.passwordElement?.value ?? this.password;
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
            if (!account && !password) {
                this.error = "Invalid account or password.";
                this.accountProfile = null;
                return;
            }
            const bskyClient = await login(account, password);
            if (bskyClient instanceof Error) {
                this.error = bskyClient.message;
                this.accountProfile = null;
                return;
            }
            this.bskyClient = bskyClient;
            this.accountProfile = JSON.parse(localStorage.getItem("profile")!) as ProfileViewDetailed;
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
                if (!this.bskyClient?.session) return;
                const response = await this.bskyClient?.countUnreadNotifications();
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
            location.reload();
        }
    }

    renderTopbar() {
        return html`<div class="fixed w-[600px] max-w-[100%] top-0 flex p-2 items-center bg-white dark:bg-black z-[100]">
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
                    ${this.accountProfile?.avatar
                        ? html`<img class="w-6 max-w-[none] h-6 rounded-full" src="${this.accountProfile.avatar}" />`
                        : html`<i class="icon w-6 h-6">${defaultAvatar}</i>`}
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
            </div>
            <theme-toggle class="ml-2" absolute="false"></theme-toggle>
        </div>`;
    }
}
