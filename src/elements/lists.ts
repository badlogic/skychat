import { BskyPreferences, RichText } from "@atproto/api";
import { FeedViewPost } from "@atproto/api/dist/client/types/app/bsky/feed/defs";
import { ListView } from "@atproto/api/dist/client/types/app/bsky/graph/defs";
import { LitElement, PropertyValueMap, TemplateResult, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { HashNavOverlay, QuillEditor, renderTopbar } from ".";
import { i18n } from "../i18n";
import {
    blockIcon,
    cameraIcon,
    errorIcon,
    imageIcon,
    infoIcon,
    linkIcon,
    listIcon,
    minusIcon,
    muteIcon,
    pinIcon,
    plusIcon,
    shieldIcon,
} from "../icons";
import { FEED_CHECK_INTERVAL, State } from "../state";
import { Store } from "../store";
import { ListFeedPostsStream } from "../streams";
import { ImageInfo, copyTextToClipboard, defaultFeed, dom, error, hasLinkOrButtonParent, loadImageFiles, splitAtUri } from "../utils";
import { renderRichText } from "./posts";
import { getProfileUrl, renderProfileAvatar } from "./profiles";
import { toast } from "./toast";
import { repeat } from "lit-html/directives/repeat.js";
import { ProfileView } from "@atproto/api/dist/client/types/app/bsky/actor/defs";

export type ListViewElementAction = "clicked" | "pinned" | "unpinned" | "saved" | "unsaved";
export type ListViewElementStyle = "topbar" | "minimal" | "full";

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

        const editButtons =
            list.purpose == "app.bsky.graph.defs#curatelist"
                ? html` <div class="flex gap-2">
                      <icon-toggle
                          @change=${(ev: CustomEvent) => (!ev.detail.value ? this.addList() : this.removeList())}
                          .icon=${html`<i class="icon !w-5 !h-5">${minusIcon}</i>`}
                          .iconTrue=${html`<i class="icon !w-5 !h-5">${plusIcon}</i>`}
                          .value=${!(
                              prefs.saved?.includes(list.uri) ||
                              prefs.pinned?.includes(list.uri) ||
                              list.creator.did == Store.getUser()?.profile.did
                          )}
                          class="w-6 h-6"
                      ></icon-toggle>
                  </div>`
                : html`<div class="flex gap-2">
                      <icon-toggle
                          @change=${(ev: CustomEvent) => this.toggleMute(ev)}
                          .icon=${html`<i class="icon !w-5 !h-5">${muteIcon}</i>`}
                          .value=${muteAndBlockLists.muteListUris.has(this.list.uri)}
                          class="w-6 h-6"
                      ></icon-toggle>
                      <icon-toggle
                          @change=${(ev: CustomEvent) => this.toggleBlock(ev)}
                          .icon=${html`<i class="icon !w-5 !h-5">${blockIcon}</i>`}
                          .value=${muteAndBlockLists.blockListUris.has(this.list.uri)}
                          class="w-6 h-6"
                      ></icon-toggle>
                  </div>`;

        const buttons = html`<div class="flex gap-2 ml-auto">
            ${this.viewStyle != "full"
                ? html`<icon-toggle
                      @change=${(ev: CustomEvent) => (this.expandDetails = !this.expandDetails)}
                      .icon=${html`<i class="icon !w-6 !h-6">${infoIcon}</i>`}
                      .value=${this.expandDetails}
                  ></icon-toggle>`
                : nothing}
            ${this.editable ? editButtons : nothing}
        </div>`;

        const header = html`<div class="flex items-center gap-2 ${this.viewStyle == "topbar" ? "flex-grow -ml-3" : ""}">
            ${list.avatar
                ? html`<img
                      src="${list.avatar}"
                      class="${this.viewStyle == "topbar" ? "w-8 h-8" : "w-10 h-10"} object-cover rounded-md fancy-shadow"
                  />`
                : html`<div class="fancy-shadow">
                      <i class="icon ${this.viewStyle == "topbar" ? "!w-8 !h-8" : "!w-10 !h-10"} fancy-shadow">${defaultFeed}</i>
                  </div>`}
            <div class="flex flex-col">
                <div class="font-semibold">${list.name}</div>
                ${this.viewStyle != "topbar" && this.expandDetails ? createdBy : nothing}
            </div>
        </div>`;

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
                            copyTextToClipboard("https://bsky.app/profile/" + list.creator.did + "/lists/" + splitAtUri(list.uri).rkey);
                            toast(i18n("Copied link to clipboard"));
                        }}
                    >
                        <i class="icon !w-5 !h-5 fill-muted-fg">${linkIcon}</i>
                    </button>
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
        const isOwnList = this.list.creator.did == Store.getUser()?.profile.did;
        if (this.defaultActions) State.addSavedList(this.list.uri);
        this.list = { ...this.list };
        State.notify("list", "updated", this.list);
        this.action("saved", this.list);
    }
}

@customElement("list-overlay")
export class ListOverlay extends HashNavOverlay {
    @property()
    listUri?: string;

    @property()
    list?: ListView;

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
        if (!this.list) return renderTopbar("List", this.closeButton(false), false);
        const list = this.list;
        const listName = html`<list-view class="flex-grow" .viewStyle=${"topbar"} .list=${list}></list-view>`;
        return renderTopbar(dom(listName)[0], this.closeButton(), false);
    }

    renderContent(): TemplateResult {
        if (this.error) return html`<div id="error" class="align-top p-4">${this.error}</div>`;
        if (this.isLoading) return html`<loading-spinner></loading-spinner>`;

        return html`<feed-stream-view
                .stream=${new ListFeedPostsStream(this.listUri!, true, FEED_CHECK_INTERVAL)}
                .newItems=${async (newItems: FeedViewPost[] | Error) => {
                    if (newItems instanceof Error) {
                        this.error = i18n("Could not load newer items");
                    }
                }}
            ></feed-stream-view
            ><open-post-editor-button id="post"></open-post-editor-button> <notifications-button id="notifications"></notifications-button>`;
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

    unsubscribe = () => {};

    getHash(): string {
        return "lists";
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.load();
        this.unsubscribe = State.subscribe("preferences", (action, payload) => {
            if (action == "updated" && !this.isOnTop()) {
                this.load(payload);
                console.log(payload);
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
        } catch (e) {
            error("Couldn't load preferences and lists", e);
            this.error = i18n("Couldn't load your lists");
        } finally {
            this.isLoading = false;
        }
    }

    renderHeader(): TemplateResult {
        return renderTopbar("Lists", this.closeButton(), false);
    }

    protected update(changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.update(changedProperties);
    }

    renderContent(): TemplateResult {
        if (this.error) return html`<div id="error" class="align-top p-4">${this.error}</div>`;
        if (this.isLoading) return html`<loading-spinner></loading-spinner>`;

        return html`<div class="flex flex-col">
            <div class="flex items-center justify-center py-4">
                <button @click=${() => this.newList()} class="btn rounded-full flex gap-2 items-center">${i18n("Create a new list")}</button>
            </div>
            <div class="px-4 flex items-center bg-muted text-muted-fg text-muted-fg">${i18n("Saved Lists")}</div>
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
                        ></generator-view>
                    </div>`
            )}
            ${this.ownLists.length > 0
                ? html`<div class="px-4 flex items-center bg-muted text-muted-fg">${i18n("Lists by me")}</div>
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
                                  ></generator-view>
                              </div>`
                      )}`
                : nothing}
        </div>`;
    }

    newList() {
        document.body.append(dom(html`<list-editor></list-editor>`)[0]);
    }

    async listAction(action: ListViewElementAction, list: ListView) {
        if (action == "unsaved") {
            this.lists = this.lists.filter((other) => other.uri != list.uri);
            this.ownLists = this.ownLists.filter((other) => other.uri != list.uri);
        }

        if (action == "clicked") {
            // this.close();
            // await waitForNavigation();
            document.body.append(dom(html`<list-overlay .listUri=${list.uri}></list-overlay>`)[0]);
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

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        this.load();
        setTimeout(() => {
            this.nameElement?.focus();
        }, 0);
    }

    async load() {
        try {
            if (!this.listUri || !this.list) return;
            const list = await State.getList(this.listUri);
            if (list instanceof Error) throw list;
            this.list = list;
            this.listUri = list.uri;
        } catch (e) {
            this.error = i18n("Could not load list");
        } finally {
            this.isLoading = false;
        }
    }

    getHash(): string {
        if (!this.list) return "list/new";
        return "list/edit/" + this.listUri;
    }

    renderHeader(): TemplateResult {
        const buttons = html`<div class="flex items-center ml-auto -mr-2 gap-2">
            <button class="text-muted-fg" @click=${() => this.close()}>${i18n("Cancel")}</button>
            <button class="btn py-1" style="height: initial;" @click=${() => this.save()}>${i18n("Save")}</button>
        </div> `;
        return renderTopbar(this.list ? "Edit List" : "New List", buttons, false);
    }

    save() {
        if (!this.nameElement || !this.descriptionElement) {
            this.close();
            return;
        }
        if (this.nameElement.value.trim().length == 0) {
            this.editError = i18n("Name is required");
            return;
        }
        this.close();
    }

    renderContent(): TemplateResult {
        if (this.error) return html`<div id="error" class="align-top p-4">${this.error}</div>`;
        if (this.isLoading) return html`<loading-spinner></loading-spinner>`;

        // FIXME all errors should look like the below
        return html`<div class="flex flex-col w-full h-full overflow-auto px-4 gap-2 mx-auto mt-4">
            ${
                this.editError
                    ? html`<div class="bg-red-500 w-full h-8 flex items-center px-4 text-[#fff] gap-2 rounded-md">
                          <i class="icon !w-6 !h-6 fill-[#fff]">${errorIcon}</i><span>${this.editError}</span>
                      </div>`
                    : nothing
            }
            <div class="flex gap-2 items-center">
                <div
                    class="flex-grow-0 flex-shrink-0 w-[66px] h-[66px] rounded overflow-x-clip flex items-center justify-center border border-divider"
                    @click=${() => this.addImage()}
                >
                    ${
                        this.imageToUpload
                            ? html`<img src="${this.imageToUpload.dataUri}" class="w-full h-full object-fill" />`
                            : html` <i class="icon !w-[32px] !h-[32px] dark:fill-[#fff]">${cameraIcon}</i> `
                    }
                </div>
                <div class="flex flex-col gap-2 w-full">
                    <div class="text-muted-fg">${i18n("Name")}</div>
                    <input id="name" class="textinput text-black dark:text-white" placeholder="${i18n("E.g. 'Cool people'")}" />
                </div>
            </div>
            <div id="description" class="text-muted-fg">${i18n("Description")}</div>
            <quill-text-editor class="h-36 border border-divider rounded"></quill-text-editor>
            <button class="btn self-end" @click=${() => this.addPeople()}>${i18n("Add people")}<button>
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

    addPeople() {
        const add = (actor: ProfileView) => {};
        document.body.append(dom(html`<actor-search-overlay .selectedActor=${(actor: ProfileView) => add(actor)}></actor-search-overlay>`)[0]);
    }
}
