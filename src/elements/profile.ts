import { ProfileView, ProfileViewBasic, ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { PropertyValueMap, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { bskyClient } from "../bsky";
import { cacheProfile, profileCache } from "../profilecache";
import { AtUri, contentLoader, dom, hasLinkOrButtonParent, onVisibleOnce, renderAuthor, renderTopbar } from "../utils";
import { HashNavCloseableElement } from "./closable";
import { closeIcon } from "../icons";
import { RichText } from "@atproto/api";
import { map } from "lit/directives/map.js";
import { PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { renderPostText } from "./postview";
import { Store } from "../store";

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
                            <i class="icon">${closeIcon}</i>
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

@customElement("profile-list-overlay")
export class ProfileListOverlay extends HashNavCloseableElement {
    @property()
    title: string = "";

    @property()
    hash: string = "";

    @property()
    postUri?: string;

    @property()
    isLoading = true;

    @property()
    error?: string;

    profiles?: ProfileViewBasic[];

    cursor?: string;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    getHash(): string {
        return this.hash;
    }

    loading = false;
    async loadOlderProfiles() {
        if (!bskyClient) return;
        if (this.loading) return;
        if (!this.postUri) return;
        try {
            this.loading = true;
            const response = await bskyClient.getLikes({ uri: this.postUri, cursor: this.cursor });
            if (!response.success) throw Error();
            const profiles: ProfileViewBasic[] = [];
            for (const like of response.data.likes) {
                profiles.push(like.actor);
            }
            this.profiles = profiles;
            this.cursor = response.data.cursor;
        } catch (e) {
            this.error = "Couldn't load profiles.";
        } finally {
            this.loading = false;
            this.isLoading = false;
        }
    }

    async load() {
        await this.loadOlderProfiles();
        this.isLoading = false;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.load();
    }

    render() {
        return html`<div class="fixed top-0 left-0 w-full h-full z-[1000] bg-white dark:bg-black overflow-auto">
            <div class="mx-auto max-w-[600px] h-full flex flex-col gap-2">
                ${renderTopbar(
                    this.title,
                    html`<button
                        @click=${() => this.close()}
                        class="ml-auto bg-primary text-white px-2 rounded disabled:bg-gray/70 disabled:text-white/70"
                    >
                        Close
                    </button>`
                )}
                <div class="px-4">
                    <div class="h-[40px]"></div>
                    ${this.isLoading ? html`<div>${contentLoader}</div>` : nothing} ${this.error ? html`<div>${this.error}</div>` : nothing}
                    ${this.profiles ? this.renderProfiles() : nothing}
                </div>
            </div>
        </div>`;
    }

    renderProfiles() {
        const profilesDom = dom(
            html`<div>
                ${map(this.profiles, (profile) => this.renderProfile(profile))}
                <div id="loader" class="w-full text-center p-4 animate-pulse">Loading more profiles</div>
            </div>`
        )[0];

        const loader = profilesDom.querySelector("#loader") as HTMLElement;
        const loadMore = async () => {
            await this.loadOlderProfiles();
            if (!this.profiles || this.profiles.length == 0) {
                loader.innerText = "No more profiles";
                loader.classList.remove("animate-pulse");
                return;
            }
            loader?.remove();
            for (const profile of this.profiles) {
                profilesDom.append(dom(this.renderProfile(profile))[0]);
            }
            profilesDom.append(loader);
            onVisibleOnce(loader, loadMore);
        };
        onVisibleOnce(loader, loadMore);
        return profilesDom;
    }

    renderProfile(profile: ProfileView) {
        const user = Store.getUser();
        const rt = new RichText({ text: profile.description ?? "" });
        rt.detectFacetsWithoutResolution();

        return html`<div
            class="border-b border-gray/50 px-4 py-2 cursor-pointer"
            @click=${(ev: Event) => {
                if (!bskyClient) return;
                if (hasLinkOrButtonParent(ev.target as HTMLElement)) return;
                ev.stopPropagation();
                document.body.append(dom(html`<profile-overlay .did=${profile.did}></profile-overlay>`)[0]);
            }}
        >
            <div class="flex flex-col">
                <div class="flex items-center">
                    <div class="flex flex-col">
                        ${renderAuthor(profile)}
                        ${profile.viewer?.followedBy
                            ? html`<div><span class="p-1 text-xs rounded bg-gray/50 text-white">Follows you</span></div>`
                            : nothing}
                    </div>
                    ${profile.did != user?.profile.did
                        ? html`<button class="${profile.viewer?.following ? "bg-gray" : "bg-primary"} text-white rounded px-2 ml-auto">
                              ${profile.viewer?.following ? "Unfollow" : "Follow"}
                          </button>`
                        : nothing}
                </div>
                <div class="text-sm pt-2 whitespace-pre-wrap">${renderPostText({ text: rt.text, facets: rt.facets, createdAt: "" })}</div>
            </div>
        </div>`;
    }
}
