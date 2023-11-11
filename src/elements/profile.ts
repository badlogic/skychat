import { RichText } from "@atproto/api";
import { ProfileView, ProfileViewDetailed } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { FeedViewPost, PostView } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { LitElement, PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { bskyClient } from "../bsky";
import { cacheProfile, profileCache } from "../profilecache";
import { Store } from "../store";
import { contentLoader, defaultAvatar, dom, getNumber, getProfileUrl, hasLinkOrButtonParent, renderAuthor } from "../utils";
import { ItemListLoaderResult, ItemsList, ItemsListLoader } from "./list";
import { HashNavOverlay, renderTopbar } from "./overlay";
import { renderPostText } from "./postview";
import { PopupMenu } from "./popup";
import { moreIcon } from "../icons";
import { ActorTimelineFilter, actorTimelineLoader } from "./feed";

@customElement("profile-overlay")
export class ProfileOverlay extends HashNavOverlay {
    @property()
    did?: string;

    @state()
    isLoading = true;

    @state()
    profile?: ProfileViewDetailed;

    @state()
    error?: string;

    @state()
    filter: ActorTimelineFilter = "posts_no_replies";

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

    renderHeader(): TemplateResult {
        return html`${renderTopbar("Profile", this.closeButton())}`;
    }

    renderContent(): TemplateResult {
        if (this.isLoading || this.error || !this.profile)
            return html`<div class="align-top pt-[40px]">${this.error ? this.error : contentLoader}</div>`;

        const user = Store.getUser();
        const profile = this.profile;
        const rt = new RichText({ text: this.profile.description ?? "" });
        rt.detectFacetsWithoutResolution();

        const showFollowers = (ev: Event) => {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            document.body.append(
                dom(
                    html`<profile-list-overlay
                        title="Followers"
                        .hash=${`followers/${profile.did}`}
                        .loader=${followersLoader(profile.did)}
                    ></profile-list-overlay>`
                )[0]
            );
        };

        const showFollowing = (ev: Event) => {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            document.body.append(
                dom(
                    html`<profile-list-overlay
                        title="Following"
                        .hash=${`following/${profile.did}`}
                        .loader=${followingLoader(profile.did)}
                    ></profile-list-overlay>`
                )[0]
            );
        };

        return html`<div>
            ${this.profile.banner
                ? html`<img src="${profile.banner}" class="h-[150px] w-full object-cover" />`
                : html`<div class="bg-blue-500 h-[150px] w-full"></div>`}
            <div class="flex px-4 mt-[-48px] items-end">
                ${profile.avatar
                    ? html`<img class="w-24 h-24 rounded-full" src="${profile.avatar}" />`
                    : html`<i class="icon w-24 h-24">${defaultAvatar}</i>`}
                <div class="ml-auto flex items-center gap-2">
                    ${profile.did != user?.profile.did
                        ? html`<button class="${profile.viewer?.following ? "bg-gray/50" : "bg-primary"} text-white rounded-full px-4 py-1 ml-auto">
                                  ${profile.viewer?.following ? "Unfollow" : "Follow"}
                              </button>
                              <profile-options .profile=${profile}></profile-options>`
                        : nothing}
                </div>
            </div>
            <div class="px-4">
                <div class="text-2xl">${this.profile.displayName ?? this.profile.handle}</div>
                <div class="flex items-center gap-2 mt-2">
                    ${profile.viewer?.followedBy ? html`<span class="p-1 text-xs rounded bg-gray/50 text-white">Follows you</span>` : nothing}
                    <span class="text-gray dark:text-lightgray text-sm">${profile.handle}</span>
                </div>
                <div class="mt-2 text-sm flex gap-2">
                    <a href="" target="_blank" @click=${showFollowers}
                        ><span class="font-bold">${getNumber(profile.followersCount)}</span> followers</a
                    >
                    <a href="" target="_blank" @click=${showFollowing}><span class="font-bold">${getNumber(profile.followsCount)}</span> following</a>
                    <span class="font-bold">${getNumber(profile.postsCount)}</span>
                </div>
                <div class="mt-1 leading-tight whitespace-pre-wrap">${renderPostText({ text: rt.text, facets: rt.facets, createdAt: "" })}</div>
            </div>
            <div class="mt-4 border-b border-gray/50">
                <button
                    class="${this.filter == "posts_no_replies" ? "border-b border-primary font-bold" : "text-gray dark:text-lightgray"} px-2 py-2"
                    @click=${() => (this.filter = "posts_no_replies")}
                >
                    Posts
                </button>
                <button
                    class="${this.filter == "posts_with_replies" ? "border-b border-primary font-bold" : "text-gray dark:text-lightgray"} px-2 py-2"
                    @click=${() => (this.filter = "posts_with_replies")}
                >
                    Posts & Replies
                </button>
                <button
                    class="${this.filter == "posts_with_media" ? "border-b border-primary font-bold" : "text-gray dark:text-lightgray"} px-2 py-2"
                    @click=${() => (this.filter = "posts_with_media")}
                >
                    Media
                </button>
                ${profile.did == user?.profile.did
                    ? html`<button
                          class="${this.filter == "likes" ? "border-b border-primary font-bold" : "text-gray dark:text-lightgray"} px-2 py-2"
                          @click=${() => (this.filter = "likes")}
                      >
                          Likes
                      </button>`
                    : nothing}
            </div>
            ${dom(
                html`<div class="min-h-[100dvh]"><skychat-feed .feedLoader=${actorTimelineLoader(profile.did, this.filter)}></skychat-feed></div>`
            )[0]}
        </div>`;
    }
}

@customElement("profile-options")
export class ProfileOptionsElement extends PopupMenu {
    @property()
    profile?: ProfileView;

    protected renderButton(): TemplateResult {
        return html`<i slot="buttonText" class="icon w-[1.2em] h-[1.2em] fill-gray">${moreIcon}</i>`;
    }
    protected renderContent(): TemplateResult {
        const createButton = (label: TemplateResult, click: () => void) => {
            return html`<button
                class="border-b border-gray/50 py-2 px-2 hover:bg-primary"
                @click=${() => {
                    this.close();
                    click();
                }}
            >
                ${label}
            </button>`;
        };

        return html` ${createButton(html`<span>Add to List</span>`, () => {})} ${createButton(html`<span>Mute</span>`, () => {})}
        ${createButton(html`<span>Block</span>`, () => {})} ${createButton(html`<span>Report</span>`, () => {})}`;
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
                            ? html`<div class="mt-1"><span class="p-1 text-xs rounded bg-gray/50 text-white">Follows you</span></div>`
                            : nothing}
                    </div>
                    ${this.profile.did != user?.profile.did
                        ? html`<button class="${this.following ? "bg-gray/50" : "bg-primary"} text-white rounded-full px-4 py-1 ml-auto">
                              ${this.following ? "Unfollow" : "Follow"}
                          </button>`
                        : nothing}
                </div>
                <div class="mt-1 leading-tight whitespace-pre-wrap">${renderPostText({ text: rt.text, facets: rt.facets, createdAt: "" })}</div>
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
        return html`<profile-view .profile=${item} .following=${item.viewer?.following}></profile-view>`;
    }
}

@customElement("profile-list-overlay")
export class ProfileListOverlay extends HashNavOverlay {
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

    renderHeader(): TemplateResult {
        return html` ${renderTopbar(this.title, this.closeButton())}`;
    }

    renderContent(): TemplateResult {
        return html`<profile-list .loader=${this.loader}></profile-list>`;
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

export function repostLoader(postUri?: string): ItemsListLoader<string, ProfileView> {
    return async (cursor?: string) => {
        if (!bskyClient) return new Error("Not connected");
        if (!postUri) return new Error("No post given");
        const result = await bskyClient.getRepostedBy({ cursor, uri: postUri });
        if (!result.success) {
            return new Error("Could not load reposts");
        }
        return { cursor: result.data.cursor, items: result.data.repostedBy };
    };
}

export function followersLoader(did: string): ItemsListLoader<string, ProfileView> {
    return async (cursor?: string) => {
        if (!bskyClient) return new Error("Not connected");
        if (!did) return new Error("No account given");
        const result = await bskyClient.getFollowers({ cursor, actor: did });
        if (!result.success) {
            return new Error("Could not load followers");
        }
        return { cursor: result.data.cursor, items: result.data.followers };
    };
}

export function followingLoader(did: string): ItemsListLoader<string, ProfileView> {
    return async (cursor?: string) => {
        if (!bskyClient) return new Error("Not connected");
        if (!did) return new Error("No account given");
        const result = await bskyClient.getFollows({ cursor, actor: did });
        if (!result.success) {
            return new Error("Could not load followings");
        }
        return { cursor: result.data.cursor, items: result.data.follows };
    };
}
