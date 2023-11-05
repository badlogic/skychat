import { AppBskyFeedDefs, AppBskyFeedPost, BskyAgent } from "@atproto/api";
import { ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { LitElement, PropertyValueMap, TemplateResult, html, nothing, svg } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { PostSearch } from "../bsky";
import { FirehosePost, startEventStream } from "../firehose";
import { ImageInfo, contentLoader, dom, login, logout, onVisibleOnce } from "../utils";
// @ts-ignore
import logoSvg from "../../html/logo.svg";
import "../elements";
import { cacheProfile } from "../profilecache";

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

    constructor() {
        super();
    }

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        let content = html` <div class="animate-fade flex-grow flex flex-col">
            <p class="text-center">Connecting</p>
            <div class="align-top">${contentLoader}</div>
        </div>`;

        if (!this.isLoading) {
            const accountProfile = localStorage.getItem("profile") ? JSON.parse(localStorage.getItem("profile")!) : null;
            content = html`<p class="text-center mx-auto w-[280px]">Explore & create hashtag threads in real-time on BlueSky</p>
                <div class="mx-auto flex flex-col gap-4 mt-4 w-[280px]">
                    <input
                        id="hashtag"
                        class="bg-none border border-gray/75 outline-none rounded text-black px-2 py-2"
                        placeholder="Hashtag, e.g. #imzentrum"
                    />
                    ${accountProfile
                        ? html`<p>
                              You are logged in as
                              ${accountProfile.avatar
                                  ? html` <img class="inline-block max-w-[1em] max-h-[1em] rounded-full" src="${accountProfile.avatar}" /> `
                                  : html`<i class="icon w-[1.2em] h-[1.2em]">${defaultAvatar}</i>`}
                              ${accountProfile.displayName}
                          </p>`
                        : html`
                              <p class="text-center">
                                  Want to post and reply to other posts? Enter your username and an
                                  <a class="text-primary" href="https://bsky.app/settings/app-passwords">app password</a> below. (optional)
                              </p>
                              <input
                                  id="account"
                                  class="bg-none border border-gray/75 outline-none rounded text-black px-2 py-2"
                                  placeholder="Account, e.g. badlogic.bsky.social"
                              />
                              <input
                                  id="password"
                                  type="password"
                                  class="bg-none border border-gray/75 outline-none rounded text-black px-2 py-2"
                                  placeholder="App password"
                              />
                          `}
                    <button class="align-center rounded bg-primary text-white px-4 py-2" @click=${this.goLive}>Go live!</button>
                    ${!accountProfile
                        ? html`<p class="text-xs mt-0 pt-0 text-center">Your credentials will only be stored on your device.</p>`
                        : nothing}
                    ${accountProfile ? html`<button class="text-sm text-primary" @click=${this.logout}>Log out</button>` : nothing}
                </div>
                ${this.error
                    ? html`<div class="mx-auto mt-8 max-w-[300px] border border-gray bg-gray text-white p-4 rounded text-center">${this.error}</div>`
                    : nothing}
                <a class="text-xl text-primary text-center font-bold mt-16" href="help.html">How does it work?</a>
                <a class="text-xl text-primary text-center font-bold mt-8" href="trending.html">Trending hashtags</a>`;
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

    async goLive() {
        this.isLoading = true;
        this.requestUpdate();
        try {
            let hashtag = this.hashtagElement?.value ?? null;
            if (!hashtag) {
                this.error = "Please specify a hashtag";
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
                        this.error = "Please specify an app password for your account. You can get one in your BlueSky app's settings.";
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
        if (confirm("Log out?")) {
            logout();
            location.reload();
        }
    }
}
