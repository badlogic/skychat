import { ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { PropertyValueMap, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { bskyClient } from "../bsky";
import { cacheProfile, profileCache } from "../profilecache";
import { contentLoader, renderTopbar } from "../utils";
import { HashNavCloseableElement } from "./closable";

@customElement("profile-overlay")
export class ProfileOverlay extends HashNavCloseableElement {
    @property()
    did?: string;

    @state()
    isLoading = true;

    @state()
    profile?: ProfileViewDetailed;

    @state()
    error?: string;

    constructor() {
        super();
    }

    async load() {
        try {
            if (!bskyClient || !this.did) {
                this.error = "Couldn't load profile";
                return;
            }
            await cacheProfile(bskyClient, this.did);
            this.profile = profileCache[this.did];
            if (!this.profile) {
                this.error = "Couldn't load profile";
                return;
            }
        } finally {
            this.isLoading = false;
        }
    }

    getHash(): string {
        return "profile/" + this.did;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.load();
    }

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        if (this.isLoading || this.error)
            return html`<div class="fixed top-0 left-0 w-full h-full z-[1000] bg-white dark:bg-black overflow-auto">
                <div class="mx-auto max-w-[600px] h-full flex flex-col gap-2">
                    ${renderTopbar(
                        "Profile",
                        html`<button
                            @click=${() => this.close()}
                            class="ml-auto bg-primary text-white px-2 rounded disabled:bg-gray/70 disabled:text-white/70"
                        >
                            Close
                        </button>`
                    )}
                    <div class="align-top pt-[40px]">${this.error ? this.error : contentLoader}</div>
                </div>
            </div>`;

        return html`<div class="fixed top-0 left-0 w-full h-full z-[1000] bg-white dark:bg-black overflow-auto">
            <div class="mx-auto max-w-[600px] h-full flex flex-col gap-2">
                ${renderTopbar(
                    "Profile",
                    html`<button
                        @click=${() => this.close()}
                        class="ml-auto bg-primary text-white px-2 rounded disabled:bg-gray/70 disabled:text-white/70"
                    >
                        Close
                    </button>`
                )}
                <div></div>
            </div>
        </div>`;
    }
}
