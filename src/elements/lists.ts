import { AppBskyGraphList, BlobRef, BskyPreferences, RichText } from "@atproto/api";
import { FeedViewPost } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { ListItemView, ListPurpose, ListView } from "@atproto/api/dist/client/types/app/bsky/graph/defs";
import { HTMLTemplateResult, LitElement, PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { HashNavOverlay, QuillEditor, StreamView, renderTopbar } from ".";
import { i18n } from "../i18n";
import {
    blockIcon,
    cameraIcon,
    editIcon,
    errorIcon,
    imageIcon,
    infoIcon,
    linkIcon,
    listIcon,
    minusIcon,
    muteIcon,
    peopleIcon,
    pinIcon,
    plusIcon,
    shieldIcon,
    spinnerIcon,
} from "../icons";
import { FEED_CHECK_INTERVAL, State } from "../state";
import { Store } from "../store";
import { ListFeedPostsStream, ListItemsStream, ProfileViewStream, StreamPage, memoryStreamProvider } from "../streams";
import {
    ImageInfo,
    copyTextToClipboard,
    defaultFeed,
    dom,
    error,
    renderError,
    hasLinkOrButtonParent,
    loadImageFiles,
    splitAtUri,
    getNumber,
    downscaleImage,
} from "../utils";
import { renderRichText } from "./posts";
import { ProfileViewElement, getProfileUrl, renderProfileAvatar } from "./profiles";
import { toast } from "./toast";
import { repeat } from "lit-html/directives/repeat.js";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";
import { getSkychatListUrl } from "../bsky.js";

export type ListViewElementAction = "clicked" | "pinned" | "unpinned" | "saved" | "unsaved";
export type ListViewElementStyle = "topbar" | "minimal" | "full";

function renderListHeader(
    list: ListView,
    viewStyle: ListViewElementStyle,
    expandDetails: boolean = false,
    createdBy?: HTMLTemplateResult,
    isMembersOf = false
) {
    return html`<div class="flex items-center gap-2 ${viewStyle == "topbar" ? "flex-grow -ml-3" : ""}">
        ${list.avatar
            ? html`<img src="${list.avatar}" class="${viewStyle == "topbar" ? "w-8 h-8" : "w-10 h-10"} object-cover rounded-md fancy-shadow" />`
            : html`<div class="fancy-shadow">
                  <i class="icon ${viewStyle == "topbar" ? "!w-8 !h-8" : "!w-10 !h-10"} fancy-shadow">${defaultFeed}</i>
              </div>`}
        <div class="flex flex-col">
            <div class="font-semibold">${isMembersOf ? i18n("Members of")(list.name) : list.name}</div>
            ${viewStyle != "topbar" && expandDetails ? createdBy : nothing}
        </div>
    </div>`;
}

@customElement("list-view")
export class ListViewElement extends LitElement {
    @property()
    list?: ListView;

    @property()
    viewStyle: ListViewElementStyle = "full";

    @property()
    expandDetails = false;

    @property()
    editable = true;

    @property()
    editCheck?: (list: ListView) => boolean;

    @property()
    defaultActions = true;

    @property()
    action = (action: ListViewElementAction, list: ListView) => {};

    unsubscribe = () => {};

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        if (this.viewStyle == "full") this.expandDetails = true;
        this.unsubscribe = State.subscribe(
            "list",
            (action, payload) => {
                if (action == "updated") {
                    this.list = { ...payload };
                }
            },
            this.list?.uri
        );
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this.unsubscribe();
    }

    render() {
        if (!this.list) return html`${nothing}`;

        const list = this.list;
        const prefs = State.preferences?.feeds ?? {
            pinned: [],
            saved: [],
        };
        const muteAndBlockLists = State.muteAndBlockLists;
        const richText = new RichText({ text: list.description ?? "" });
        richText.detectFacetsWithoutResolution();

        const createdBy = html`<div class="flex gap-1 text-xs items-center font-normal text-muted-fg">
            <span class="whitespace-nowrap">${i18n("Created by")}</span>
            ${renderProfileAvatar(list.creator, true)}
            <a
                class="line-clamp-1 hover:underline text-muted-fg"
                href="${getProfileUrl(list.creator ?? "")}"
                target="_blank"
                @click=${(ev: Event) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    document.body.append(dom(html`<profile-overlay .did=${list.creator.did}></profile-overlay>`)[0]);
                }}
                >${list.creator.displayName ?? list.creator.handle}</a
            >
        </div>`;

        const defaultEditCheck = () =>
            !(prefs.saved?.includes(list.uri) || prefs.pinned?.includes(list.uri) || list.creator.did == Store.getUser()?.profile.did);

        const modListEditButtons = html`<div class="flex items-center">
            <icon-toggle
                @change=${(ev: CustomEvent) => this.toggleMute(ev)}
                .icon=${html`<i class="icon !w-6 !h-6">${muteIcon}</i>`}
                .value=${muteAndBlockLists.muteListUris.has(this.list.uri)}
                class="w-8 h-8"
            ></icon-toggle>
            <icon-toggle
                @change=${(ev: CustomEvent) => this.toggleBlock(ev)}
                .icon=${html`<i class="icon !w-6 !h-6">${blockIcon}</i>`}
                .value=${muteAndBlockLists.blockListUris.has(this.list.uri)}
                class="w-8 h-8"
            ></icon-toggle>
            ${this.list.creator.did == Store.getUser()?.profile.did
                ? html`<div class="flex items-center">
                      <button class="flex items-center justify-center w-8 h-8" @click=${() => this.editList()}>
                          <i class="icon !w-6 !h-6 fill-muted-fg">${editIcon}</i></button
                      ><icon-toggle
                          @change=${(ev: CustomEvent) => (!ev.detail.value ? this.addList() : this.removeList())}
                          .icon=${html`<i class="icon !w-6 !h-6">${minusIcon}</i>`}
                          .iconTrue=${html`<i class="icon !w-6 !h-6">${plusIcon}</i>`}
                          .value=${this.editCheck ? this.editCheck(list) : defaultEditCheck()}
                          class="w-8 h-8"
                      ></icon-toggle>
                  </div>`
                : nothing}
        </div>`;

        const listEditButtons = html`<div class="flex items-center">
            ${this.list.creator.did == Store.getUser()?.profile.did
                ? html`<button class="flex items-center justify-center w-8 h-8" @click=${() => this.editList()}>
                      <i class="icon !w-6 !h-6 fill-muted-fg">${editIcon}</i>
                  </button>`
                : nothing}
            <icon-toggle
                @change=${(ev: CustomEvent) => (!ev.detail.value ? this.addList() : this.removeList())}
                .icon=${html`<i class="icon !w-6 !h-6">${minusIcon}</i>`}
                .iconTrue=${html`<i class="icon !w-6 !h-6">${plusIcon}</i>`}
                .value=${this.editCheck ? this.editCheck(list) : defaultEditCheck()}
                class="w-8 h-8"
            ></icon-toggle>
        </div>`;

        const editButtons = html` ${this.list.purpose == "app.bsky.graph.defs#modlist" ? modListEditButtons : listEditButtons} `;

        const buttons = html`<div class="flex ml-auto">
            ${this.viewStyle != "full"
                ? html`<icon-toggle
                      @change=${(ev: CustomEvent) => (this.expandDetails = !this.expandDetails)}
                      .icon=${html`<i class="icon !w-6 !h-6">${infoIcon}</i>`}
                      .value=${this.expandDetails}
                      class="w-8 h-8"
                  ></icon-toggle>`
                : nothing}
            <button class="w-8 h-8 flex items-center justify-center" @click=${() => this.showMembers()}>
                <i class="icon fill-muted-fg !w-5 !h-5">${peopleIcon}</i>
            </button>
            ${this.editable && Store.getUser() ? editButtons : nothing}
        </div>`;

        const header = renderListHeader(this.list, this.viewStyle, this.expandDetails, createdBy);

        const details = html`${this.viewStyle == "topbar" && this.expandDetails ? createdBy : nothing}
            <div class="mt-1 flex flex-col">
                <div class="flex items-center">
                    <div class="self-start p-1 text-xs rounded bg-muted text-muted-fg flex items-center gap-1">
                        ${this.list.purpose == "app.bsky.graph.defs#curatelist"
                            ? html`<i class="icon !w-4 !h-4 fill-muted-fg">${listIcon}</i>${i18n("Curation list")}`
                            : html`<i class="icon !w-4 !h-4 fill-muted-fg">${shieldIcon}</i>${i18n("Moderation list")}`}
                    </div>
                    <button
                        class="flex items-center justify-center w-10 h-4"
                        @click=${() => {
                            copyTextToClipboard(getSkychatListUrl(list));
                            toast(i18n("Copied link to clipboard"));
                        }}
                    >
                        <i class="icon !w-5 !h-5 fill-muted-fg">${linkIcon}</i>
                    </button>
                    ${Store.getDevPrefs()?.enabled
                        ? html`<button
                              class="text-primary font-bold ml-2"
                              @click=${() => {
                                  copyTextToClipboard(list.uri);
                                  toast("Copied at-uri to clipboard");
                              }}
                          >
                              at-uri
                          </button>`
                        : nothing}
                    ${Store.getDevPrefs()?.enabled
                        ? html`<button
                              class="text-primary font-bold ml-2"
                              @click=${() => {
                                  copyTextToClipboard(JSON.stringify(list, null, 2));
                                  toast("Copied JSON to clipboard");
                                  console.log(list);
                              }}
                          >
                              JSON
                          </button>`
                        : nothing}
                </div>
                ${list.description ? renderRichText(richText) : nothing}
            </div>`;

        return html`<div
            class="flex flex-col cursor-pointer"
            @click=${(ev: Event) => {
                if (window.getSelection() && window.getSelection()?.toString().length != 0) return;
                if (hasLinkOrButtonParent(ev.target as HTMLElement)) return;
                ev.stopPropagation();
                this.action("clicked", list);
            }}
        >
            <div class="flex items-center">${header} ${buttons}</div>
            ${this.expandDetails
                ? this.viewStyle == "topbar"
                    ? html`<div
                          class="absolute animate-fade-down animate-duration-300 top-[40px] left-0 w-full bg-secondary text-secondary-fg font-normal px-4 pb-2 pt-2 rounded-md fancy-shadow"
                      >
                          ${details}
                      </div>`
                    : details
                : nothing}
        </div>`;
    }

    showMembers() {
        if (!this.list) return;
        document.body.append(dom(html`<list-members-overlay .list=${this.list} .listUri=${this.list.uri}></list-members-overlay>`)[0]);
    }

    toggleBlock(ev: CustomEvent) {
        if (!this.list) return;
        if (ev.detail.value) {
            State.subscribeBlockList(this.list);
        } else {
            State.unsubscribeBlockList(this.list);
        }
    }

    toggleMute(ev: CustomEvent) {
        if (!this.list) return;
        if (ev.detail.value) {
            State.subscribeMuteList(this.list);
        } else {
            State.unsubscribeMuteList(this.list);
        }
    }

    removeList() {
        if (!this.list) return;
        const isOwnList = this.list.creator.did == Store.getUser()?.profile.did;
        if (this.defaultActions) {
            State.removeSavedList(this.list.uri);
            if (isOwnList) {
                State.removeActorList(this.list.uri);
            }
        }
        this.requestUpdate();
        State.notify("list", "updated", this.list);
        this.action("unsaved", this.list);
    }

    addList() {
        if (!this.list) return;
        if (this.defaultActions) State.addSavedList(this.list.uri);
        this.list = { ...this.list };
        State.notify("list", "updated", this.list);
        this.action("saved", this.list);
    }

    editList() {
        if (!this.list) return;
        const isOwnList = this.list.creator.did == Store.getUser()?.profile.did;
        if (!isOwnList) return;
        document.body.append(
            dom(
                html`<list-editor
                    .listUri=${this.list.uri}
                    .list=${this.list}
                    .purpose=${this.list.purpose == "app.bsky.graph.defs#curatelist" ? "curation" : "moderation"}
                ></list-editor>`
            )[0]
        );
    }
}

@customElement("list-item-view")
export class ListItemViewElement extends LitElement {
    @property()
    listItem?: ListItemView;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    @property()
    actionButtons?: (profileElement: ProfileViewElement, profile: ProfileView) => TemplateResult;

    render() {
        if (!this.listItem) return html`<loading-spinner></loading-spinner>`;
        return html`<profile-view .profile=${this.listItem.subject} .actionButtons=${this.actionButtons}></profile-view>`;
    }
}

@customElement("list-overlay")
export class ListOverlay extends HashNavOverlay {
    @property()
    listUri?: string;

    @property()
    list?: ListView;

    @property()
    action = (action: ListViewElementAction, list: ListView) => {};

    @property()
    isLoading = true;

    @property()
    error?: string;

    getHash(): string {
        if (!this.listUri) return "list/unknown";
        const atUri = splitAtUri(this.listUri);
        return "list/" + atUri.repo + "/" + atUri.rkey;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.load();
    }

    async load() {
        try {
            if (!this.listUri) throw new Error();
            if (State.getObject("list", this.listUri)) {
                this.list = State.getObject("list", this.listUri);
            } else {
                const list = await State.getList(this.listUri);
                if (list instanceof Error) throw list;
                this.list = list;
            }
        } catch (e) {
            error("Could not load list feed" + this.listUri, e);
            this.error = i18n("Could not load list feed");
        } finally {
            this.isLoading = false;
        }
    }

    renderHeader(): TemplateResult {
        if (!this.list) return renderTopbar("List", this.closeButton(false));
        const list = this.list;
        const listName = html`<list-view class="flex-grow" .viewStyle=${"topbar"} .list=${list} .action=${this.action}></list-view>`;
        return renderTopbar(dom(listName)[0], html`<div class="-ml-2">${this.closeButton()}</div>`);
    }

    renderContent(): TemplateResult {
        if (this.error) return html`<div id="error" class="align-top p-4">${this.error}</div>`;
        if (this.isLoading) return html`<loading-spinner></loading-spinner>`;

        return html`<feed-stream-view
            .stream=${new ListFeedPostsStream(this.listUri!, true, FEED_CHECK_INTERVAL)}
            .newItems=${async (newItems: StreamPage<FeedViewPost> | Error) => {
                if (newItems instanceof Error) {
                    this.error = i18n("Could not load newer items");
                }
            }}
        ></feed-stream-view>`;
    }
}

@customElement("list-members-overlay")
export class ListMembersOverlay extends HashNavOverlay {
    @property()
    listUri?: string;

    @property()
    list?: ListView;

    @property()
    isLoading = true;

    @property()
    error?: string;

    getHash(): string {
        if (!this.listUri) return "list/members/unknown";
        const atUri = splitAtUri(this.listUri);
        return "list/members/" + atUri.repo + "/" + atUri.rkey;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.load();
    }

    async load() {
        try {
            if (!this.listUri) throw new Error();
            if (State.getObject("list", this.listUri)) {
                this.list = State.getObject("list", this.listUri);
            } else {
                const list = await State.getList(this.listUri);
                if (list instanceof Error) throw list;
                this.list = list;
            }
        } catch (e) {
            error("Could not load list feed" + this.listUri, e);
            this.error = i18n("Could not load list feed");
        } finally {
            this.isLoading = false;
        }
    }

    renderHeader(): TemplateResult {
        if (!this.list) return renderTopbar("List", this.closeButton(false));
        const list = this.list;
        const listHeader = renderListHeader(list, "topbar", false, undefined, true);
        return renderTopbar(dom(listHeader)[0], this.closeButton());
    }

    renderContent(): TemplateResult {
        if (this.error) return html`<div id="error" class="align-top p-4">${this.error}</div>`;
        if (this.isLoading) return html`<loading-spinner></loading-spinner>`;

        return html`<list-items-stream-view
            .stream=${new ListItemsStream((cursor?: string, limit?: number, notify?: boolean) => {
                return State.getListItems(this.listUri!, cursor, limit);
            })}
            .newItems=${async (newItems: StreamPage<ProfileView> | Error) => {
                if (newItems instanceof Error) {
                    this.error = i18n("Could not load newer items");
                }
            }}
        ></list-items-stream-view>`;
    }
}

@customElement("list-picker")
export class ListPicker extends HashNavOverlay {
    @property()
    isLoading = true;

    @property()
    error?: string;

    @property()
    lists: ListView[] = [];

    @property()
    ownLists: ListView[] = [];

    @property()
    purpose: "curation" | "moderation" = "curation";

    unsubscribe = () => {};

    getHash(): string {
        return this.purpose == "curation" ? "lists" : "modlists";
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.load();
        this.unsubscribe = State.subscribe("preferences", (action, payload) => {
            if (action == "updated" && !this.isOnTop()) {
                this.load(payload);
            }
        });
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this.unsubscribe();
    }

    async load(prefs?: BskyPreferences | Error) {
        try {
            if (prefs instanceof Error) {
                this.error = i18n("Couldn't load your feeds");
                throw prefs;
            }

            const user = Store.getUser();

            if (this.purpose == "curation") {
                prefs = prefs ?? State.preferences;
                if (prefs) {
                    this.lists = (prefs.feeds.saved ?? [])
                        .map((listUri) => State.getObject("list", listUri))
                        .filter((list) => list != undefined)
                        .filter((list) => list?.creator.did != user?.profile.did) as ListView[];
                } else {
                    prefs = await State.getPreferences();
                    if (prefs instanceof Error) {
                        this.error = i18n("Couldn't load your lists");
                        throw prefs;
                    }
                    const savedUris = (prefs.feeds.saved ?? []).filter((feed) => feed.includes("app.bsky.graph.list"));
                    const response = await State.getLists(savedUris);
                    if (response instanceof Error) {
                        this.error = i18n("Couldn't load your lists");
                        return;
                    }
                    this.lists = response;
                }

                if (user) {
                    (async () => {
                        const lists: ListView[] = [];
                        let cursor: string | undefined;
                        while (true) {
                            const response = await State.getActorLists(user.profile.did, cursor);
                            if (response instanceof Error) {
                                this.error = i18n("Couldn't load your lists");
                                return;
                            }
                            if (response.items.length == 0) break;
                            lists.push(...response.items);
                            cursor = response.cursor;
                        }
                        this.ownLists = lists.filter((list) => list.purpose == "app.bsky.graph.defs#curatelist");
                    })();
                }
            } else {
                const muteAndBlockLists = await State.getMuteAndBlockLists();
                if (muteAndBlockLists instanceof Error) throw muteAndBlockLists;

                this.lists = [...muteAndBlockLists.muteLists, ...muteAndBlockLists.blockLists].filter(
                    (list) => list?.creator.did != user?.profile.did
                ) as ListView[];

                if (user) {
                    (async () => {
                        const lists: ListView[] = [];
                        let cursor: string | undefined;
                        while (true) {
                            const response = await State.getActorLists(user.profile.did, cursor);
                            if (response instanceof Error) {
                                this.error = i18n("Couldn't load your lists");
                                return;
                            }
                            if (response.items.length == 0) break;
                            lists.push(...response.items);
                            cursor = response.cursor;
                        }
                        this.ownLists = lists.filter((list) => list.purpose == "app.bsky.graph.defs#modlist");
                    })();
                }
            }
        } catch (e) {
            error("Couldn't load preferences and lists", e);
            this.error = i18n("Couldn't load your lists");
        } finally {
            this.isLoading = false;
        }
    }

    renderHeader(): TemplateResult {
        return renderTopbar(this.purpose == "curation" ? "Lists" : "Moderation Lists", this.closeButton());
    }

    protected update(changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.update(changedProperties);
    }

    renderContent(): TemplateResult {
        if (this.error) return html`<div id="error" class="align-top p-4">${this.error}</div>`;
        if (this.isLoading) return html`<loading-spinner></loading-spinner>`;

        return html`<div class="flex flex-col">
            <div class="flex items-center justify-center py-4">
                <button @click=${() => this.newList()} class="btn rounded-full flex gap-2 items-center">${i18n("New List")}</button>
            </div>
            <div class="px-4 flex items-center text-muted-fg text-muted-fg">${i18n("Saved Lists")}</div>
            <div class="mb-2">
                ${this.lists.length == 0 ? html`<div class="py-4 rounded text-center">${i18n("You don't have saved lists")}</div>` : nothing}
                ${repeat(
                    this.lists,
                    (list) => list.uri,
                    (list) =>
                        html`<div class="px-4 py-2">
                            <list-view
                                .list=${list}
                                .viewStyle=${"minimal"}
                                .action=${(action: ListViewElementAction, list: ListView) => this.listAction(action, list)}
                                .editable=${true}
                                .defaultActions=${true}
                            ></list-view>
                        </div>`
                )}
            </div>
            ${this.ownLists.length > 0
                ? html`<div class="px-4 flex items-center text-muted-fg">${i18n("Lists by me")}</div>
                      ${repeat(
                          this.ownLists,
                          (list) => list.uri,
                          (list) =>
                              html`<div class="px-4 py-2">
                                  <list-view
                                      .list=${list}
                                      .viewStyle=${"minimal"}
                                      .action=${(action: ListViewElementAction, list: ListView) => this.listAction(action, list)}
                                      .editable=${true}
                                      .defaultActions=${true}
                                  ></list-view>
                              </div>`
                      )}`
                : nothing}
        </div>`;
    }

    newList() {
        document.body.append(
            dom(
                html`<list-editor
                    .purpose=${this.purpose}
                    .saved=${(list: ListView) => {
                        if (this.ownLists.find((other) => other.uri == list.uri)) return;
                        this.ownLists.unshift(list);
                        this.ownLists = [...this.ownLists];
                    }}
                ></list-editor>`
            )[0]
        );
    }

    async listAction(action: ListViewElementAction, list: ListView) {
        if (action == "unsaved") {
            this.lists = this.lists.filter((other) => other.uri != list.uri);
            this.ownLists = this.ownLists.filter((other) => other.uri != list.uri);
        }

        if (action == "clicked") {
            const overlayDom = dom(
                html`<list-overlay
                    .listUri=${list.uri}
                    .action=${(action: ListViewElementAction, list: ListView) => {
                        this.listAction(action, list);
                        overlayDom.close();
                    }}
                ></list-overlay>`
            )[0] as ListOverlay;
            document.body.append(overlayDom);
        }
    }
}

@customElement("list-editor")
export class ListEditor extends HashNavOverlay {
    @property()
    listUri?: string;

    @property()
    list?: ListView;

    @property()
    saved = (list: ListView) => {};

    @property()
    purpose: "curation" | "moderation" = "curation";

    @property()
    isLoading = true;

    @query("#name")
    nameElement?: HTMLInputElement;

    @query("#description")
    descriptionElement?: QuillEditor;

    @state()
    error?: string;

    @state()
    editError?: string;

    @state()
    imageToUpload?: ImageInfo;

    @state()
    isLoadingMembers = true;
    members: ListItemView[] = [];
    addedMembers: ProfileView[] = [];

    @state()
    canSave = false;

    @state()
    isSaving = false;

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.load();
        setTimeout(() => {
            this.nameElement?.focus();
        }, 0);
    }

    async load() {
        try {
            if (!this.listUri) return;
            this.canSave = true;
            const list = this.list ? this.list : await State.getList(this.listUri);
            if (list instanceof Error) throw list;
            let cursor: string | undefined;
            this.list = list;
            this.listUri = list.uri;
            this.isLoading = false;
            this.requestUpdate();

            const members: ListItemView[] = [];
            while (true) {
                const response = await State.getListItems(this.listUri, cursor);
                if (response instanceof Error) throw response;
                if (response.items.length == 0) break;
                members.push(...response.items);
                cursor = response.cursor;
            }
            this.members = members;
            this.isLoadingMembers = false;
        } catch (e) {
            this.error = i18n("Could not load list");
        } finally {
            this.isLoading = false;
            this.isLoadingMembers = false;
        }
    }

    getHash(): string {
        if (!this.listUri) return "list/new";
        const atUri = splitAtUri(this.listUri);
        return "list/edit/" + atUri.repo + "/" + atUri.rkey;
    }

    renderHeader(): TemplateResult {
        const buttons = html`<div class="flex items-center ml-auto -mr-2 gap-4">
            ${this.isSaving
                ? html`<span>${i18n("Saving list")}</span><i class="-ml-2 icon !w-6 !h-6 animate-spin fill-primary">${spinnerIcon}</i>`
                : html`<button class="text-muted-fg" @click=${() => this.close()}>${i18n("Cancel")}</button>
                      <button class="btn" ?disabled=${!this.canSave} @click=${() => this.save()}>${i18n("Save")}</button>`}
        </div> `;
        return renderTopbar(
            this.listUri
                ? this.purpose == "curation"
                    ? "Edit List"
                    : "Edit Moderation List"
                : this.purpose == "curation"
                ? "New List"
                : "New Moderation List",
            buttons
        );
    }

    renderContent(): TemplateResult {
        if (this.error) return html`<div id="error" class="align-top p-4">${this.error}</div>`;
        if (this.isLoading) return html`<loading-spinner></loading-spinner>`;

        return html`<div class="flex flex-col w-full h-full overflow-auto gap-2 mx-auto mt-4">
            ${this.editError ? renderError(this.editError) : nothing}
            <div class="flex gap-2 items-center px-4 ">
                <div
                    class="cursor-pointer flex-grow-0 flex-shrink-0 w-[66px] h-[66px] rounded overflow-x-clip flex items-center justify-center border border-divider"
                    @click=${() => this.addImage()}
                >
                    ${this.imageToUpload
                        ? html`<img src="${this.imageToUpload.dataUri}" class="w-full h-full object-cover" />`
                        : this.list?.avatar
                        ? html`<img src="${this.list.avatar}" class="w-full h-full object-cover" />`
                        : html` <i class="icon !w-[32px] !h-[32px] dark:fill-[#fff]">${cameraIcon}</i> `}
                </div>
                <div class="flex flex-col gap-2 w-full">
                    <div class="text-muted-fg">${i18n("Name")}</div>
                    <input
                        id="name"
                        class="textinput text-black dark:text-white"
                        placeholder="${i18n("E.g. 'Cool people'")}"
                        value=${this.list?.name ?? ""}
                        @input=${() => (this.canSave = (this.nameElement?.value.length ?? 0) > 0)}
                    />
                </div>
            </div>

            <div class="px-4 text-muted-fg">${i18n("Description")}</div>

            <div class="mx-4 border border-divider rounded h-36 flex">
                <quill-text-editor id="description" .initialText=${this.list?.description ?? ""} class="w-full h-full"></quill-text-editor>
            </div>

            ${this.isLoadingMembers
                ? html`${this.isLoadingMembers ? html`<loading-spinner></loading-spinner>` : nothing}`
                : html`<div class="flex items-center px-4 pt-4 pb-4 border-b border-divider">
                    <span>${getNumber(this.members.length + this.addedMembers.length)} ${i18n("people")}</span>
                <button class="btn ml-auto" @click=${() => this.addPeople()}>${i18n("Add people")}<button>
            </div>
            <div id="addedMembers">
            </div>
            <list-items-stream-view
                .stream=${new ListItemsStream(memoryStreamProvider(this.members))}
                .newItems=${async (newItems: StreamPage<ProfileView> | Error) => {
                    if (newItems instanceof Error) {
                        this.error = i18n("Could not load newer items");
                    }
                }}
                .showEndOfList=${false}
                .actionButtons=${(profileElement: ProfileViewElement, profile: ProfileView) =>
                    html`<button class="ml-auto self-start" @click=${() =>
                        this.removeMember(profileElement, profile)}><i class="icon !w-6 !h-6 fill-muted-fg">${minusIcon}</button>`}
            ></list-items-stream-view>`}
        </div>`;
    }

    addImage() {
        const input = dom(html`<input type="file" id="file" accept=".jpg, .jpeg, .png" class="hidden" multiple />`)[0] as HTMLInputElement;
        document.body.append(input);
        input.addEventListener("change", async () => {
            if (!input.files || input.files.length == 0) return;
            const files = input.files;
            this.imageToUpload = (await loadImageFiles(files))[0];
            input.remove();
        });
        input.click();
    }

    async removeMember(profileElement: ProfileViewElement, actor: ProfileView) {
        const existingListItem = this.members.find((other) => other.subject.did == actor.did);
        if (existingListItem && this.listUri) {
            State.removeActorListMembers(this.listUri, [existingListItem.uri]);
        }
        this.members = this.members.filter((other) => other.subject.did != actor.did);
        this.addedMembers = this.addedMembers.filter((other) => other.did != actor.did);
        profileElement.parentElement?.parentElement?.remove();
        this.requestUpdate();
    }

    addPeople() {
        const add = async (actor: ProfileView) => {
            if (this.listUri) {
                const addedListItems = await State.addActorListMembers(this.listUri, [actor.did]);
                if (addedListItems instanceof Error) {
                    this.error = i18n("Couldn't add user to list");
                } else {
                    this.members.unshift({ subject: actor, uri: addedListItems[0] });
                }
            } else {
                this.addedMembers.push(actor);
            }
            const addedMembersElement = this.querySelector("#addedMembers");
            if (addedMembersElement) {
                addedMembersElement.append(
                    dom(
                        StreamView.renderWrapped(
                            html`<profile-view
                                .profile=${actor}
                                .actionButtons=${(profileElement: ProfileViewElement, profile: ProfileView) =>
                                    html`<button class="ml-auto self-start" @click=${() =>
                                        this.removeMember(profileElement, profile)}><i class="icon !w-6 !h-6 fill-muted-fg">${minusIcon}</button>`}
                            ></profile-view>`
                        )
                    )[0]
                );
                this.requestUpdate();
            }
        };
        document.body.append(
            dom(
                html`<actor-search-overlay
                    .selectedActor=${(actor: ProfileView) => add(actor)}
                    .filter=${(actor: ProfileView) => {
                        let found = false;
                        found ||= this.addedMembers.some((other) => other.did == actor.did);
                        found ||= this.members.some((other) => other.did == actor.did);
                        return !found;
                    }}
                ></actor-search-overlay>`
            )[0]
        );
    }

    async save() {
        try {
            this.isSaving = true;
            this.requestUpdate();
            if (!this.nameElement || !this.descriptionElement) {
                this.close();
                return;
            }
            if (this.nameElement.value.trim().length == 0) {
                this.editError = i18n("Name is required");
                return;
            }

            let image: BlobRef | undefined;
            if (this.imageToUpload) {
                const start = performance.now();
                const data = await downscaleImage(this.imageToUpload);
                if (data instanceof Error) throw data;
                console.log(
                    "Downscaling image took: " +
                        (performance.now() - start) / 1000 +
                        ", old: " +
                        this.imageToUpload.data.length +
                        ", new: " +
                        data.data.length
                );
                const response = await State.bskyClient!.com.atproto.repo.uploadBlob(data.data, {
                    headers: { "Content-Type": this.imageToUpload.mimeType },
                    encoding: "",
                });
                if (!response.success) throw Error();
                image = response.data.blob;
            }

            const rt = new RichText({ text: this.descriptionElement.getText() ?? "" });
            rt.detectFacetsWithoutResolution();
            const record: AppBskyGraphList.Record = {
                createdAt: new Date().toISOString(),
                name: this.nameElement.value.trim(),
                purpose: this.purpose == "curation" ? "app.bsky.graph.defs#curatelist" : "app.bsky.graph.defs#modlist",
                avatar: image,
                description: this.descriptionElement.getText(),
                descriptionFacets: rt.facets,
                labels: undefined,
            };

            if (!this.listUri) {
                const list = await State.createActorList(record);
                if (list instanceof Error) {
                    this.error = i18n("Couldn't save list");
                    return;
                }
                const members = await State.addActorListMembers(
                    list.uri,
                    this.addedMembers.map((profile) => profile.did)
                );
                if (members instanceof Error) throw members;
                this.saved(list);
            } else {
                const { repo, type, rkey } = splitAtUri(this.listUri);
                const listResponse = await State.bskyClient?.com.atproto.repo.getRecord({ collection: type, repo, rkey });
                if (listResponse?.success == false) throw new Error();
                if (!record.avatar) record.avatar = (listResponse?.data.value as any)?.avatar;
                const list = await State.updateActorList(this.listUri, record);
                if (list instanceof Error) {
                    this.error = i18n("Couldn't save list");
                    return;
                }
                this.saved(list);
            }

            this.close();
        } catch (e) {
            this.error = i18n("Couldn't save list");
            return;
        } finally {
            this.isSaving = false;
        }
    }
}
