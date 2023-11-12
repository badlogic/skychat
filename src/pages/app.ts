import { LitElement, html, nothing, svg } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { contentLoader } from "../utils";
// @ts-ignore
import logoSvg from "../../html/logo.svg";
import "../elements";
import { Store } from "../store";
import { login, logout } from "../bsky";
import { i18n } from "../i18n";

const defaultAvatar = svg`<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="none" data-testid="userAvatarFallback"><circle cx="12" cy="12" r="12" fill="#0070ff"></circle><circle cx="12" cy="9.5" r="3.5" fill="#fff"></circle><path stroke-linecap="round" stroke-linejoin="round" fill="#fff" d="M 12.058 22.784 C 9.422 22.784 7.007 21.836 5.137 20.262 C 5.667 17.988 8.534 16.25 11.99 16.25 C 15.494 16.25 18.391 18.036 18.864 20.357 C 17.01 21.874 14.64 22.784 12.058 22.784 Z"></path></svg>`;

@customElement("skychat-app")
export class App extends LitElement {
    @state()
    error?: string;

    @state()
    isLoading = false;

    @query("#account")
    accountElement?: HTMLInputElement;

    @query("#password")
    passwordElement?: HTMLInputElement;

    @query("#hashtag")
    hashtagElement?: HTMLInputElement;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        let content = html` <div class="animate-fade flex-grow flex flex-col">
            <p class="text-center">${i18n("Connecting")}</p>
            <div class="align-top">${contentLoader}</div>
        </div>`;

        if (!this.isLoading) {
            const user = Store.getUser();
            content = html`<p class="text-center mx-auto w-[280px]">${i18n("Explore & create hashtag threads in real-time on BlueSky")}</p>
                <div class="mx-auto flex flex-col gap-4 mt-4 w-[280px]">
                    ${this.error ? html`<div class="mx-auto max-w-[300px] text-[#cc0000] font-bold text-center">${this.error}</div>` : nothing}
                    <input
                        id="hashtag"
                        class="bg-none border border-gray/75 outline-none rounded text-black px-2 py-2"
                        placeholder="${i18n("Hashtag, e.g. #imzentrum")}"
                    />
                    ${user
                        ? html`<p>
                              ${i18n("You are logged in as")}
                              ${user.profile.avatar
                                  ? html` <img class="inline-block max-w-[1em] max-h-[1em] rounded-full" src="${user.profile.avatar}" /> `
                                  : html`<i class="icon w-[1.2em] h-[1.2em]">${defaultAvatar}</i>`}
                              ${user.profile.displayName}
                          </p>`
                        : html`
                              <p class="text-center">
                                  Want to post and reply to other posts? Enter your username and an
                                  <a class="text-primary" href="https://bsky.app/settings/app-passwords">app password</a> below. (optional)
                              </p>
                              <input
                                  id="account"
                                  class="bg-none border border-gray/75 outline-none rounded text-black px-2 py-2"
                                  placeholder="${i18n("Account, e.g. badlogic.bsky.social")}"
                              />
                              <input
                                  id="password"
                                  type="password"
                                  class="bg-none border border-gray/75 outline-none rounded text-black px-2 py-2"
                                  placeholder="${i18n("App password")}"
                              />
                          `}
                    <button class="align-center rounded bg-primary text-white px-4 py-2" @click=${this.goLive}>${i18n("Go live!")}</button>
                    ${!user
                        ? html`<p class="text-xs mt-0 pt-0 text-center">${i18n("Your credentials will only be stored on your device.")}</p>`
                        : nothing}
                    ${user ? html`<button class="text-sm text-primary" @click=${this.logout}>${i18n("Log out")}</button>` : nothing}
                </div>
                <a class="text-xl text-primary text-center font-bold mt-16" href="help.html">${i18n("How does it work?")}</a>
                <a class="text-xl text-primary text-center font-bold mt-8" href="trending.html">${i18n("Trending hashtags")}</a>`;
        }

        return html` <main class="flex flex-col justify-between m-auto max-w-[728px] px-4 h-full leading-5">
            <theme-toggle></theme-toggle>
            <a class="text-2xl flex align-center justify-center text-primary font-bold text-center my-8" href="/"
                ><i class="w-[32px] h-[32px] inline-block fill-primary">${unsafeHTML(logoSvg)}</i><span class="ml-2">Skychat</span></a
            >
            <div class="flex-grow flex flex-col">${content}</div>
            <div class="text-center text-xs italic my-4 pb-4">${i18n("footer")}</div>
        </main>`;
    }

    async goLive() {
        this.isLoading = true;
        this.requestUpdate();
        try {
            let hashtag = this.hashtagElement?.value ?? null;
            if (!hashtag) {
                this.error = i18n("Please specify a hashtag");
                return;
            }
            if (!hashtag.startsWith("#")) {
                hashtag = "#" + hashtag;
            }

            let account = this.accountElement?.value;
            let password = this.passwordElement?.value;
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
            const bskyClient = await login(account, password);
            if (bskyClient instanceof Error) {
                this.error = bskyClient.message;
            } else {
                location.href = "/chat.html?hashtag=" + encodeURIComponent(hashtag);
            }
        } finally {
            if (this.error) this.isLoading = false;
        }
    }

    logout() {
        if (confirm(i18n("Log out?"))) {
            logout();
            location.reload();
        }
    }
}
