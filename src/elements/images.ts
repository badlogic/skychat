import { customElement, property } from "lit/decorators.js";
import { CloseableElement } from "./overlay";
import { PropertyValueMap, html, nothing } from "lit";
import { arrowLeftIcon, arrowRightIcon, downloadIcon } from "../icons";
import { dom, downloadImageAsFile } from "../utils";

@customElement("image-gallery-overlay")
export class ImageGalleryOverlay extends CloseableElement {
    @property()
    images: { url: string; altText?: string }[] = [];

    @property()
    imageIndex = 0;

    @property()
    isScrolling = false;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    protected firstUpdated(_changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
        super.firstUpdated(_changedProperties);
        (this.renderRoot.children[0] as HTMLElement).addEventListener("scroll", () => {
            this.isScrolling = true;
            this.debounceScroll();
        });
        if (this.imageIndex > 0) {
            const galleryContainer = this.renderRoot.children[0] as HTMLElement;
            galleryContainer.scrollLeft = galleryContainer.clientWidth * this.imageIndex;
        }
    }

    render() {
        return html`
            <div
                class="fixed top-0 left-0 w-screen h-screen flex overflow-x-auto snap-x snap-mandatory backdrop-blur z-10 fill-primary"
                @click=${() => this.close()}
            >
                ${this.images.map(
                    (image, index) => html`
                        <div class="flex-none w-full h-full relative snap-center flex justify-center items-center">
                            ${this.images.length > 1 && index > 0 && !this.isScrolling
                                ? html`<button @click=${(ev: MouseEvent) =>
                                      this.scrollPrevious(
                                          ev
                                      )} class="animate-fade animate-duration-500 absolute left-4 top-4 h-full flex"><i class="icon !w-8 !h-8">${arrowLeftIcon}</button>`
                                : nothing}
                            ${this.images.length > 1 && index < this.images.length - 1 && !this.isScrolling
                                ? html`<button @click=${(ev: MouseEvent) =>
                                      this.scrollNext(
                                          ev
                                      )} class="animate-fade animate-duration-500 absolute right-4 top-4 h-full flex"><i class="icon !w-8 !h-8">${arrowRightIcon}</button>`
                                : nothing}
                            <img src="${image.url}" alt="${image.altText ?? ""}" class="max-w-full max-h-full object-contain" />
                            ${!this.isScrolling
                                ? html`<div class="absolute bottom-4 left-4 w-full flex items-center gap-4">
                                      ${image.altText
                                          ? html`<button
                                                class="animate-fade animate-duration-500  bg-black text-white py-1 px-2 text-xs rounded"
                                                @click="${(ev: MouseEvent) => this.showAltText(ev, image.altText ?? "")}"
                                            >
                                                ALT
                                            </button>`
                                          : nothing}
                                      <button
                                          @click=${(ev: MouseEvent) => this.download(ev, image)}
                                          class="animate-fade animate-duration-500 flex gap-1 items-center justify-center w-8 h-8 bg-black rounded"
                                      >
                                          <i class="icon !w-5 !h-5 fill-white">${downloadIcon}</i>
                                      </button>
                                  </div>`
                                : nothing}
                        </div>
                    `
                )}
            </div>
        `;
    }

    scrollNext(ev: MouseEvent) {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        const galleryContainer = this.renderRoot.children[0] as HTMLElement;

        if (galleryContainer) {
            galleryContainer.scrollTo({ left: galleryContainer.scrollLeft + galleryContainer.clientWidth, behavior: "smooth" });
            this.isScrolling = true;
            this.debounceScroll();
        }
    }

    scrollPrevious(ev: MouseEvent) {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        const galleryContainer = this.renderRoot.children[0] as HTMLElement;

        if (galleryContainer) {
            galleryContainer.scrollTo({ left: galleryContainer.scrollLeft - galleryContainer.clientWidth, behavior: "smooth" });
            this.isScrolling = true;
            this.debounceScroll();
        }
    }

    scrollTimeout = 0;
    debounceScroll() {
        clearTimeout(this.scrollTimeout);
        this.scrollTimeout = window.setTimeout(() => {
            this.isScrolling = false;
        }, 300);
    }

    showAltText(ev: MouseEvent, altText: string) {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        document.body.append(dom(html`<alt-text alt=${altText}></alt-text>`)[0]);
    }

    download(ev: MouseEvent, image: { url: string; altText?: string }) {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        downloadImageAsFile(image.url, "image.jpeg");
    }
}
