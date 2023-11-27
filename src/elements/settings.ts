import { PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { HashNavOverlay, renderProfile, renderTopbar } from ".";
import { i18n } from "../i18n";
import { Store, Theme } from "../store";
import { State } from "../state";
import { dom, error } from "../utils";
import { arrowRightIcon, bellIcon, brushIcon, shieldIcon } from "../icons";
import { BlockedUsersStream, MutedUsersStream } from "../streams";

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
        return html`<div class="px-4 flex flex-col">
            ${user
                ? html`<div class="h-12 flex items-center font-semibold">${i18n("Logged in as")}</div>
                      <div class="flex gap-4">
                          ${renderProfile(user.profile)}
                          <button class="btn ml-auto" @click=${this.logout}>${i18n("Log out")}</button>
                      </div>`
                : nothing}
            <div class="mt-4 border-t border-divider"></div>
            <div class="h-12 flex items-center font-semibold gap-2"><i class="icon !w-5 !h-5">${brushIcon}</i>${i18n("Design")}</div>
            <button-group
                @change=${(ev: CustomEvent) => this.setTheme(ev.detail.value)}
                .values=${[i18n("Dark"), i18n("Light")]}
                .selected=${Store.getTheme() == "dark" ? "Dark" : "Light"}
                class="self-start"
            ></button-group>
            <div class="mt-4 border-t border-divider"></div>
            <div class="h-12 flex items-center font-semibold gap-2"><i class="icon !w-5 !h-5">${shieldIcon}</i>${i18n("Moderation")}</div>
            <div class="flex flex-col gap-2">
                <button class="border border-muted rounded-md pl-4 py-2 flex items-center fancy-shadow">
                    <span>Muted words</span><i class="icon !w-8 !h-8 fill-primary ml-auto">${arrowRightIcon}</i>
                </button>
                <button
                    class="border border-muted rounded-md pl-4 py-2 flex items-center fancy-shadow"
                    @click=${() => {
                        document.body.append(dom(html`<muted-users-overlay></muted-users-overlay>`)[0]);
                    }}
                >
                    <span>Muted users</span><i class="icon !w-8 !h-8 fill-primary ml-auto">${arrowRightIcon}</i>
                </button>
                <button
                    class="border border-muted rounded-md pl-4 py-2 flex items-center fancy-shadow"
                    @click=${() => {
                        document.body.append(dom(html`<blocked-users-overlay></blocked-users-overlay>`)[0]);
                    }}
                >
                    <span>Blocked users</span><i class="icon !w-8 !h-8 fill-primary ml-auto">${arrowRightIcon}</i>
                </button>
                <button class="border border-muted rounded-md pl-4 py-2 flex items-center fancy-shadow">
                    <span>Moderation lists</span><i class="icon !w-8 !h-8 fill-primary ml-auto">${arrowRightIcon}</i>
                </button>
            </div>
            <div class="mt-4 border-t border-divider"></div>
            <div class="h-12 flex items-center font-semibold gap-2"><i class="icon !w-5 !h-5">${bellIcon}</i>${i18n("Push notifications")}</div>
            <slide-button
                class="mt-2"
                .checked=${pushPrefs?.enabled}
                .text=${i18n("Enabled")}
                @changed=${(ev: CustomEvent) => {
                    Store.setPushPreferences({ ...Store.getPushPreferences()!, enabled: ev.detail.value });
                }}
            ></slide-button>
            <slide-button
                class="mt-4"
                .checked=${pushPrefs?.newFollowers}
                .text=${i18n("New follower")}
                @changed=${(ev: CustomEvent) => {
                    Store.setPushPreferences({ ...Store.getPushPreferences()!, newFollowers: ev.detail.value });
                }}
            ></slide-button>
            <slide-button
                class="mt-4"
                .checked=${pushPrefs?.replies}
                .text=${i18n("Replies")}
                @changed=${(ev: CustomEvent) => {
                    Store.setPushPreferences({ ...Store.getPushPreferences()!, replies: ev.detail.value });
                }}
            ></slide-button>
            <slide-button
                class="mt-4"
                .checked=${pushPrefs?.quotes}
                .text=${i18n("Quotes")}
                @changed=${(ev: CustomEvent) => {
                    Store.setPushPreferences({ ...Store.getPushPreferences()!, quotes: ev.detail.value });
                }}
            ></slide-button>
            <slide-button
                class="mt-4"
                .checked=${pushPrefs?.reposts}
                .text=${i18n("Reposts")}
                @changed=${(ev: CustomEvent) => {
                    Store.setPushPreferences({ ...Store.getPushPreferences()!, reposts: ev.detail.value });
                }}
            ></slide-button>
            <slide-button
                class="mt-4"
                .checked=${pushPrefs?.mentions}
                .text=${i18n("Mentions")}
                @changed=${(ev: CustomEvent) => {
                    Store.setPushPreferences({ ...Store.getPushPreferences()!, mentions: ev.detail.value });
                }}
            ></slide-button>
            <slide-button
                class="mt-4"
                .checked=${pushPrefs?.likes}
                .text=${i18n("Likes")}
                @changed=${(ev: CustomEvent) => {
                    Store.setPushPreferences({ ...Store.getPushPreferences()!, likes: ev.detail.value });
                }}
            ></slide-button>
            <div class="mt-4 border-t border-divider"></div>
            <div class="mt-4 text-xs">
                Build: ${this.version?.date}<br />
                <a href="https://github.com/badlogic/skychat/commit/">${this.version?.commit}</a>
            </div>
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

let theme = Store.getTheme();
if (theme == "dark") document.documentElement.classList.add("dark");
else document.documentElement.classList.remove("dark");
