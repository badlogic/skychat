import { ProfileView, ProfileViewBasic, ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { LitElement, PropertyValueMap, TemplateResult, html, nothing } from "lit";
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
import { ItemListLoaderResult, ItemsList, ItemsListLoader } from "./list";

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

@customElement("profile-view")
export class ProfileViewElement extends LitElement {
    @property()
    profile?: ProfileView;

    @property()
    following = false;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    render() {
        if (!this.profile) {
            return html`<div class="align-top">${contentLoader}</div>`;
        }

        const user = Store.getUser();
        const rt = new RichText({ text: this.profile.description ?? "" });
        rt.detectFacetsWithoutResolution();

        return html`<div
            class="cursor-pointer"
            @click=${(ev: Event) => {
                if (!bskyClient) return;
                if (!this.profile) return;
                if (hasLinkOrButtonParent(ev.target as HTMLElement)) return;
                ev.stopPropagation();
                document.body.append(dom(html`<profile-overlay .did=${this.profile.did}></profile-overlay>`)[0]);
            }}
        >
            <div class="flex flex-col">
                <div class="flex items-center">
                    <div class="flex flex-col">
                        ${renderAuthor(this.profile)}
                        ${this.profile.viewer?.followedBy
                            ? html`<div><span class="p-1 text-xs rounded bg-gray/50 text-white">Follows you</span></div>`
                            : nothing}
                    </div>
                    ${this.profile.did != user?.profile.did
                        ? html`<button class="${this.following ? "bg-gray" : "bg-primary"} text-white rounded px-2 ml-auto">
                              ${this.following ? "Unfollow" : "Follow"}
                          </button>`
                        : nothing}
                </div>
                <div class="text-sm pt-2 whitespace-pre-wrap">${renderPostText({ text: rt.text, facets: rt.facets, createdAt: "" })}</div>
            </div>
        </div>`;
    }
}

@customElement("profile-list")
export class ProfileList extends ItemsList<string, ProfileView> {
    @property()
    loader: (cursor?: string) => Promise<ItemListLoaderResult<string, ProfileView>> = async () => {
        return { items: [] };
    };

    async loadItems(cursor?: string): Promise<ItemListLoaderResult<string, ProfileView>> {
        return this.loader(cursor);
    }

    getItemKey(item: ProfileView): string {
        return item.did;
    }

    renderItem(item: ProfileView): TemplateResult {
        return html`<div class="border-b border-gray/50 px-4 py-2">
            <profile-view .profile=${item} .following=${item.viewer?.followedBy}></profile-view>
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
    loader: (cursor?: string) => Promise<ItemListLoaderResult<string, ProfileView>> = async () => {
        return { items: [] };
    };

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    getHash(): string {
        return this.hash;
    }

    render() {
        return html`<div class="fixed top-0 left-0 w-full h-full z-[1000] bg-white dark:bg-black overflow-auto">
            <div class="mx-auto max-w-[600px] h-full flex flex-col">
                ${renderTopbar(
                    this.title,
                    html`<button
                        @click=${() => this.close()}
                        class="ml-auto bg-primary text-white px-2 rounded disabled:bg-gray/70 disabled:text-white/70"
                    >
                        Close
                    </button>`
                )}
                <profile-list .loader=${this.loader}></profile-list>
            </div>
        </div>`;
    }
}

export function likesLoader(postUri?: string): ItemsListLoader<string, ProfileView> {
    return async (cursor?: string) => {
        if (!bskyClient) return new Error("Not connected");
        if (!postUri) return new Error("No post given");
        const result = await bskyClient.getLikes({ cursor, uri: postUri });
        if (!result.success) {
            return new Error("Could not load likes");
        }
        return { cursor: result.data.cursor, items: result.data.likes.map((like) => like.actor) };
    };
}

export function repostLoader(post?: PostView): ItemsListLoader<string, ProfileView> {
    return async (cursor?: string) => {
        if (!bskyClient) return new Error("Not connected");
        if (!post) return new Error("No post given");
        const result = await bskyClient.getRepostedBy({ cursor, uri: post.uri });
        if (!result.success) {
            return new Error("Could not load reposts");
        }
        return { cursor: result.data.cursor, items: result.data.repostedBy };
    };
}
