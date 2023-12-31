import { PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { repeat } from "lit-html/directives/repeat.js";
import { customElement, property } from "lit/decorators.js";
import { HashNavOverlay, renderProfile, renderTopbar } from ".";
import { i18n } from "../i18n";
import { arrowRightIcon, bellIcon, brushIcon, shieldIcon } from "../icons";
import { State } from "../state";
import { Store, Theme } from "../store";
import { BlockedUsersStream, MutedUsersStream } from "../streams";
import { dom, error, renderError, renderUnderConstruction } from "../utils";
import { LabelPreference } from "@atproto/api";

type Version = { date: string; commit: string };

@customElement("settings-overlay")
export class SettingsOverlay extends HashNavOverlay {
    @property()
    version?: { date: string; commit: string };

    getHash(): string {
        return "settings";
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        (async () => {
            const response = await fetch("/version.json");
            if (!response) {
                error("Couldn't fetch version.json");
            }
            this.version = (await response.json()) as Version;
        })();
    }

    renderHeader(): TemplateResult {
        return html`${renderTopbar("Settings", this.closeButton())}`;
    }

    renderContent(): TemplateResult {
        // FIXME enable thread reader mode by default setting, see http://localhost:8080/#thread/did:plc:dgrar7gfp5c7qttox66fspkq/3kf2hop6gzu26
        const user = Store.getUser();
        const pushPrefs = Store.getPushPreferences();
        const pinchZoom = Store.getPinchZoom();
        return html`<div class="flex flex-col">
            ${user
                ? html`<div class="px-4 h-12 flex items-center font-semibold">${i18n("Logged in as")}</div>
                      <div class="px-4 flex gap-4">
                          ${renderProfile(user.profile)}
                          <button class="btn ml-auto" @click=${this.logout}>${i18n("Log out")}</button>
                      </div>`
                : nothing}
            <div class="mt-4 border-t border-divider"></div>
            <div class="px-4 h-12 flex items-center font-semibold gap-2"><i class="icon !w-5 !h-5">${brushIcon}</i>${i18n("User Interface")}</div>
            <button-group
                @change=${(ev: CustomEvent) => this.setTheme(ev.detail.value)}
                .values=${[i18n("Dark"), i18n("Light")]}
                .selected=${Store.getTheme() == "dark" ? "Dark" : "Light"}
                class="px-4 self-start"
            ></button-group>
            <slide-button
                class="px-4 mt-6"
                .checked=${pinchZoom}
                .text=${i18n("Allow pinch-zoom")}
                @changed=${(ev: CustomEvent) => {
                    Store.setPinchZoom(ev.detail.value);
                    togglePinchZoom(ev.detail.value);
                }}
            ></slide-button>
            <div class="mt-4 border-t border-divider"></div>
            <div class="px-4 h-12 flex items-center font-semibold gap-2"><i class="icon !w-5 !h-5">${shieldIcon}</i>${i18n("Moderation")}</div>
            <div class="px-4 flex flex-col gap-2">
                <button
                    class="border border-muted rounded-md pl-4 py-2 flex items-center fancy-shadow"
                    @click=${() => {
                        document.body.append(dom(html`<muted-words-overlay></muted-words-overlay>`)[0]);
                    }}
                >
                    <span>${i18n("Muted words")}</span><i class="icon !w-8 !h-8 fill-primary ml-auto">${arrowRightIcon}</i>
                </button>
                <button
                    class="border border-muted rounded-md pl-4 py-2 flex items-center fancy-shadow"
                    @click=${() => {
                        document.body.append(dom(html`<muted-users-overlay></muted-users-overlay>`)[0]);
                    }}
                >
                    <span>${i18n("Muted users")}</span><i class="icon !w-8 !h-8 fill-primary ml-auto">${arrowRightIcon}</i>
                </button>
                <button
                    class="border border-muted rounded-md pl-4 py-2 flex items-center fancy-shadow"
                    @click=${() => {
                        document.body.append(dom(html`<muted-threads-overlay .purpose=${"moderation"}></muted-threads-overlay>`)[0]);
                    }}
                >
                    <span>${i18n("Muted threads")}</span><i class="icon !w-8 !h-8 fill-primary ml-auto">${arrowRightIcon}</i>
                </button>
                <button
                    class="border border-muted rounded-md pl-4 py-2 flex items-center fancy-shadow"
                    @click=${() => {
                        document.body.append(dom(html`<blocked-users-overlay></blocked-users-overlay>`)[0]);
                    }}
                >
                    <span>${i18n("Blocked users")}</span><i class="icon !w-8 !h-8 fill-primary ml-auto">${arrowRightIcon}</i>
                </button>
                <button
                    class="border border-muted rounded-md pl-4 py-2 flex items-center fancy-shadow"
                    @click=${() => {
                        document.body.append(dom(html`<list-picker .purpose=${"moderation"}></list-picker>`)[0]);
                    }}
                >
                    <span>${i18n("Moderation lists")}</span><i class="icon !w-8 !h-8 fill-primary ml-auto">${arrowRightIcon}</i>
                </button>
                <button
                    class="border border-muted rounded-md pl-4 py-2 flex items-center fancy-shadow"
                    @click=${() => {
                        document.body.append(dom(html`<content-filtering-overlay></content-filtering-overlay>`)[0]);
                    }}
                >
                    <span>${i18n("Content filtering")}</span><i class="icon !w-8 !h-8 fill-primary ml-auto">${arrowRightIcon}</i>
                </button>
            </div>
            <div class="mt-4 border-t border-divider"></div>
            <div class="px-4 h-12 flex items-center font-semibold gap-2"><i class="icon !w-5 !h-5">${bellIcon}</i>${i18n("Push notifications")}</div>
            <slide-button
                class="px-4 mt-2"
                .checked=${pushPrefs?.enabled}
                .text=${i18n("Enabled")}
                @changed=${(ev: CustomEvent) => {
                    Store.setPushPreferences({ ...Store.getPushPreferences()!, enabled: ev.detail.value });
                }}
            ></slide-button>
            <slide-button
                class="px-4 mt-4"
                .checked=${pushPrefs?.newFollowers}
                .text=${i18n("New follower")}
                @changed=${(ev: CustomEvent) => {
                    Store.setPushPreferences({ ...Store.getPushPreferences()!, newFollowers: ev.detail.value });
                }}
            ></slide-button>
            <slide-button
                class="px-4 mt-4"
                .checked=${pushPrefs?.replies}
                .text=${i18n("Replies")}
                @changed=${(ev: CustomEvent) => {
                    Store.setPushPreferences({ ...Store.getPushPreferences()!, replies: ev.detail.value });
                }}
            ></slide-button>
            <slide-button
                class="px-4 mt-4"
                .checked=${pushPrefs?.quotes}
                .text=${i18n("Quotes")}
                @changed=${(ev: CustomEvent) => {
                    Store.setPushPreferences({ ...Store.getPushPreferences()!, quotes: ev.detail.value });
                }}
            ></slide-button>
            <slide-button
                class="px-4 mt-4"
                .checked=${pushPrefs?.reposts}
                .text=${i18n("Reposts")}
                @changed=${(ev: CustomEvent) => {
                    Store.setPushPreferences({ ...Store.getPushPreferences()!, reposts: ev.detail.value });
                }}
            ></slide-button>
            <slide-button
                class="px-4 mt-4"
                .checked=${pushPrefs?.mentions}
                .text=${i18n("Mentions")}
                @changed=${(ev: CustomEvent) => {
                    Store.setPushPreferences({ ...Store.getPushPreferences()!, mentions: ev.detail.value });
                }}
            ></slide-button>
            <slide-button
                class="px-4 mt-4"
                .checked=${pushPrefs?.likes}
                .text=${i18n("Likes")}
                @changed=${(ev: CustomEvent) => {
                    Store.setPushPreferences({ ...Store.getPushPreferences()!, likes: ev.detail.value });
                }}
            ></slide-button>
            <div class="mt-4 border-t border-divider"></div>
            <div class="px-4 mt-4 text-xs">
                Build: ${this.version?.date}<br />
                <a href="https://github.com/badlogic/skychat/commit/">${this.version?.commit}</a>
            </div>
            <slide-button
                class="px-4 mt-4 mb-4"
                .checked=${Store.getDevPrefs()?.enabled}
                .text=${"Dev mode"}
                @changed=${(ev: CustomEvent) => {
                    Store.setDevPrefs({ ...Store.getDevPrefs()!, enabled: ev.detail.value });
                    this.requestUpdate();
                }}
            ></slide-button>
            ${Store.getDevPrefs()?.enabled
                ? html`
                      <slide-button
                          class="px-4 mt-4 mb-4"
                          .checked=${Store.getDevPrefs()?.logEmbedRenders}
                          .text=${"Log embed renders"}
                          @changed=${(ev: CustomEvent) => {
                              Store.setDevPrefs({ ...Store.getDevPrefs()!, logEmbedRenders: ev.detail.value });
                          }}
                      ></slide-button>
                      <slide-button
                          class="px-4 mt-4 mb-4"
                          .checked=${Store.getDevPrefs()?.logPostViewRenders}
                          .text=${"Log PostView renders"}
                          @changed=${(ev: CustomEvent) => {
                              Store.setDevPrefs({ ...Store.getDevPrefs()!, logPostViewRenders: ev.detail.value });
                          }}
                      ></slide-button>
                      <slide-button
                          class="px-4 mt-4 mb-4"
                          .checked=${Store.getDevPrefs()?.logFeedViewPostRenders}
                          .text=${"Log FeedViewPost renders"}
                          @changed=${(ev: CustomEvent) => {
                              Store.setDevPrefs({ ...Store.getDevPrefs()!, logFeedViewPostRenders: ev.detail.value });
                          }}
                      ></slide-button>
                      <slide-button
                          class="px-4 mt-4 mb-4"
                          .checked=${Store.getDevPrefs()?.logThreadViewPostRenders}
                          .text=${"Log ThreadViewPost renders"}
                          @changed=${(ev: CustomEvent) => {
                              Store.setDevPrefs({ ...Store.getDevPrefs()!, logThreadViewPostRenders: ev.detail.value });
                          }}
                      ></slide-button>
                      <slide-button
                          class="px-4 mt-4 mb-4"
                          .checked=${Store.getDevPrefs()?.logStreamViewAppended}
                          .text=${"Log StreamView appends"}
                          @changed=${(ev: CustomEvent) => {
                              Store.setDevPrefs({ ...Store.getDevPrefs()!, logStreamViewAppended: ev.detail.value });
                          }}
                      ></slide-button>
                      <slide-button
                          class="px-4 mt-4 mb-4"
                          .checked=${Store.getDevPrefs()?.logStreamViewPrepended}
                          .text=${"Log StreamView prepend"}
                          @changed=${(ev: CustomEvent) => {
                              Store.setDevPrefs({ ...Store.getDevPrefs()!, logStreamViewPrepended: ev.detail.value });
                          }}
                      ></slide-button>
                  `
                : nothing}
        </div>`;
    }

    logout() {
        State.logout();
        location.href = "/";
    }

    setTheme(theme: Theme) {
        theme = i18n("Dark") == theme ? "dark" : "light";
        Store.setTheme(theme);
        if (theme == "dark") document.documentElement.classList.add("dark");
        else document.documentElement.classList.remove("dark");
    }
}

@customElement("muted-users-overlay")
export class MutedUsersOverlay extends HashNavOverlay {
    getHash(): string {
        return "muted";
    }
    renderHeader(): TemplateResult {
        return renderTopbar("Muted users", this.closeButton());
    }
    renderContent(): TemplateResult {
        return html`<profiles-stream-view .stream=${new MutedUsersStream()}></profiles-stream-view>`;
    }
}

@customElement("blocked-users-overlay")
export class BlockedUsersOverlay extends HashNavOverlay {
    getHash(): string {
        return "blocked";
    }
    renderHeader(): TemplateResult {
        return renderTopbar("Blocked users", this.closeButton());
    }
    renderContent(): TemplateResult {
        return html`<profiles-stream-view .stream=${new BlockedUsersStream()}></profiles-stream-view>`;
    }
}

@customElement("content-filtering-overlay")
export class ContentFilteringOverlay extends HashNavOverlay {
    unsubscribe = () => {};
    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.unsubscribe = State.subscribe("preferences", (action, payload) => {
            if (action == "updated") {
                this.requestUpdate();
            }
        });
    }

    getHash(): string {
        return "contentfilters";
    }

    renderHeader(): TemplateResult {
        return renderTopbar("Content filtering", this.closeButton());
    }

    renderContent() {
        if (!State.isConnected()) return renderError("Not connected");
        const prefs = State.preferences;
        if (!prefs) return renderError("Not connected");

        const renderLabelFilter = (title: string, subText: string, options: string[], selected: string, valueChanged = (option: number) => {}) => {
            return html`<div class="flex items-center gap-2 px-4 pb-4 border-b border-divider">
                <div class="flex flex-col">
                    <span>${title}</span>
                    <span class="text-xs text-muted-fg">${subText}</span>
                </div>
                ${options.length == 1
                    ? html`<span class="grow text-right text-muted-fg h-8">${options[0]}</span>`
                    : html`<div class="grow flex">
                          <button-group
                              class="ml-auto"
                              .values=${options}
                              .selected=${selected}
                              @change=${(ev: CustomEvent) => {
                                  valueChanged(ev.detail.index);
                              }}
                          ></button-group>
                      </div>`}
            </div>`;
        };

        const toOption = (option: LabelPreference | "show" | undefined) => {
            switch (option) {
                case "warn":
                    return i18n("Warn");
                case "hide":
                    return i18n("Hide");
                case "show":
                case "ignore":
                    return i18n("Show");
                default:
                    return i18n("Hide");
            }
        };
        const fromOption = (option: number) => {
            switch (option) {
                case 0:
                    return "hide";
                case 1:
                    return "warn";
                case 2:
                    return "ignore";
                default:
                    return "hide";
            }
        };
        const allOptions = [i18n("Hide"), i18n("Warn"), i18n("Show")];
        const hideOption = [i18n("Hide")];
        const filters = [
            renderLabelFilter(
                i18n("Explicit sexual images"),
                i18n("i.e. pornography"),
                prefs.adultContentEnabled ? allOptions : hideOption,
                toOption(prefs.contentLabels["nsfw"]),
                (option) => {
                    State.setContentLabelPref("nsfw", fromOption(option));
                }
            ),
            renderLabelFilter(
                i18n("Other Nudity"),
                i18n("Including non-sexual and artistic"),
                prefs.adultContentEnabled ? allOptions : hideOption,
                toOption(prefs.contentLabels["nudity"]),
                (option) => {
                    State.setContentLabelPref("nudity", fromOption(option));
                }
            ),
            renderLabelFilter(
                i18n("Sexually suggestive"),
                i18n("Does not include nudity"),
                prefs.adultContentEnabled ? allOptions : hideOption,
                toOption(prefs.contentLabels["suggestive"]),
                (option) => {
                    State.setContentLabelPref("suggestive", fromOption(option));
                }
            ),
            renderLabelFilter(
                i18n("Violent / Bloody"),
                i18n("Gore, self-harm, torture"),
                allOptions,
                toOption(prefs.contentLabels["gore"]),
                (option) => {
                    State.setContentLabelPref("gore", fromOption(option));
                }
            ),
            renderLabelFilter(
                i18n("Hate group iconography"),
                i18n("Images of terror groups, articles covering events, etc."),
                allOptions,
                toOption(prefs.contentLabels["hate"]),
                (option) => {
                    State.setContentLabelPref("hate", fromOption(option));
                }
            ),
            renderLabelFilter(i18n("Spam"), i18n("Excessive unwanted interactions"), allOptions, toOption(prefs.contentLabels["spam"]), (option) => {
                State.setContentLabelPref("spam", fromOption(option));
            }),
            renderLabelFilter(
                i18n("Impersonation"),
                i18n("Accounts falsely claiming to be people or orgs"),
                allOptions,
                toOption(prefs.contentLabels["impersonation"]),
                (option) => {
                    State.setContentLabelPref("impersonation", fromOption(option));
                }
            ),
        ];

        return html`<div class="flex flex-col w-full gap-4">
            <slide-button
                class="mt-6 px-4 pb-4 border-b border-divider"
                .checked=${prefs.adultContentEnabled}
                .text=${i18n("I'm an adult")}
                @changed=${(ev: CustomEvent) => {
                    State.setAdultContentEnabled(ev.detail.value);
                }}
            ></slide-button>
            ${repeat(filters, (filter) => filter)}
        </div>`;
    }
}

// FIXME
@customElement("muted-words-overlay")
export class MutedWordsOverlay extends HashNavOverlay {
    getHash(): string {
        return "mutedwords";
    }

    renderHeader(): TemplateResult {
        return renderTopbar("Muted Words", this.closeButton());
    }

    renderContent() {
        return renderUnderConstruction();
    }
}

// FIXME
@customElement("muted-threads-overlay")
export class MutedThreadsOverlay extends HashNavOverlay {
    getHash(): string {
        return "mutedthreads";
    }

    renderHeader(): TemplateResult {
        return renderTopbar("Muted Threads", this.closeButton());
    }

    renderContent() {
        return renderUnderConstruction();
    }
}

function preventPinchZoom(event: TouchEvent): void {
    if (event.touches.length > 1) {
        event.preventDefault();
    }
}
document.addEventListener("touchstart", preventPinchZoom, { passive: false });

export function togglePinchZoom(enable: boolean): void {
    if (enable) {
        document.removeEventListener("touchstart", preventPinchZoom);
    } else {
        document.addEventListener("touchstart", preventPinchZoom, { passive: false });
    }
}

const theme = Store.getTheme();
if (theme == "dark") document.documentElement.classList.add("dark");
else document.documentElement.classList.remove("dark");

const pinchZoom = Store.getPinchZoom();
togglePinchZoom(pinchZoom ?? true);
