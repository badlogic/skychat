import { LitElement, PropertyValueMap, TemplateResult, css, html, nothing, render, svg } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { globalStyles } from "./styles";
import { map } from "lit-html/directives/map.js";

export function getTimeDifferenceString(inputDate: string): string {
    const currentDate = new Date();
    const inputDateTime = new Date(inputDate);

    const timeDifference = currentDate.getTime() - inputDateTime.getTime();
    const seconds = Math.floor(timeDifference / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const years = Math.floor(days / 365);

    if (years > 0) {
        return `${years}y}`;
    } else if (days > 0) {
        return `${days}d`;
    } else if (hours > 0) {
        return `${hours}h`;
    } else if (minutes > 0) {
        return `${minutes}m`;
    } else {
        return `${seconds}s`;
    }
}

@customElement("radio-button-group")
export class RadioButtonGroup extends LitElement {
    @property()
    selectedValue = "funny";
    @property()
    options = ["funny", "serious"];
    @property()
    disabled = false;

    static styles = [globalStyles];

    render() {
        return html`<div class="flex gap-2">
            ${this.options.map(
                (option) => html`
                    <label>
                        <input
                            type="radio"
                            name="radioGroup"
                            .value=${option}
                            .checked=${this.selectedValue === option}
                            @change=${this.handleRadioChange}
                            ${this.disabled ? "disabled" : ""}
                        />
                        ${this.capitalizeFirstLetter(option)}
                    </label>
                `
            )}
        </div>`;
    }

    capitalizeFirstLetter(str: string) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    handleRadioChange(e: Event) {
        const selectedValue = (e.target as HTMLInputElement).value;
        this.selectedValue = selectedValue;
        this.dispatchEvent(
            new CustomEvent("change", {
                detail: {
                    value: selectedValue,
                },
            })
        );
    }
}

@customElement("popup-overlay")
export class Popup extends LitElement {
    static styles = globalStyles;

    @property()
    buttonText = "Click me";

    @property()
    show = false;

    protected render(): TemplateResult {
        return html`<div class="relative">
            <div @click=${() => (this.show = !this.show)} class="rounded bg-black text-white p-1 text-xs">${this.buttonText}</div>
            ${this.show
                ? html`<div @click=${() => (this.show = !this.show)} class="absolute bg-black text-white p-4 rounded border border-gray/50">
                      <slot></slot>
                  </div>`
                : nothing}
        </div> `;
    }
}

export function dom(template: TemplateResult, container?: HTMLElement | DocumentFragment): HTMLElement[] {
    if (container) {
        render(template, container);
        return [];
    }

    const div = document.createElement(`div`);
    render(template, div);
    const children: Element[] = [];
    for (let i = 0; i < div.children.length; i++) {
        children.push(div.children[i]);
    }
    return children as HTMLElement[];
}

export function renderGallery(images: BskyImage[], expandGallery = true): HTMLElement {
    const galleryDom = dom(html`
        <div class="flex flex-col gap-2 mt-2">
            ${images.map(
                (img, index) => html`
                    <div class="relative flex flex-col items-center ${index && !expandGallery ? "hidden" : ""}">
                        <img class="max-h-[70vh] border border-none rounded" src="${img.thumb}" alt="${img.alt}" ) />
                        ${img.alt && img.alt.length > 0
                            ? html`<popup-overlay buttonText="ALT" text="${img.alt}" class="absolute left-1 bottom-1 cursor-pointer">
                                  <div class="w-[350px]">${img.alt}</div>
                              </popup-overlay>`
                            : nothing}
                    </div>
                `
            )}
            ${images.length > 1 && !expandGallery
                ? html`<div
                      id="toggle"
                      class="text-primary text-center"
                      @click=${(ev: Event) => {
                          imageDoms[0].click();
                          (ev.target as HTMLElement).innerText = `Show ${images.length - 1} more images`;
                      }}
                  >
                      Show ${images.length - 1} more images
                  </div>`
                : nothing}
        </div>
    `)[0];

    const imageDoms = galleryDom.querySelectorAll("img");
    const imageClickListener = () => {
        imageDoms.forEach((img, index) => {
            if (index == 0) return;
            img.parentElement!.classList.toggle("hidden");
        });
        if (imageDoms[1].classList.contains("hidden")) {
            imageDoms[0].scrollIntoView({
                behavior: "auto",
                block: "nearest",
            });
        } else {
            (galleryDom.querySelector("#toggle") as HTMLElement).remove();
        }
    };

    if (!expandGallery) {
        for (let i = 0; i < imageDoms.length; i++) {
            imageDoms[i].addEventListener("click", imageClickListener);
        }
    }
    return galleryDom;
}

export function renderCard(card: BskyExternalCard) {
    return html` <a href="${card.uri}" class="inline-block w-full border border-gray/50 rounded mt-2" target="_blank">
        <div class="flex">
            ${card.thumb
                ? html`<div>
                      <img src="${card.thumb}" class="!w-[240px] !max-h-full !h-full !object-cover !rounded-r-none" />
                  </div>`
                : nothing}
            <div class="flex flex-col p-4 overflow-hidden">
                <span class="font-bold text-sm text-color">${card.title ? card.title : card.uri}</span>
                <span class="py-2 text-color text-sm text-ellipsis overflow-hidden">${card.description.split("\n")[0]}</span>
                <span class="text-xs text-color/50 text-ellipsis overflow-hidden">${new URL(card.uri).host}</span>
            </div>
        </div>
    </a>`;
}

export const contentLoader = html`<div class="flex space-x-4 animate-pulse w-[80%] max-w-[300px] m-auto py-4">
    <div class="rounded-full bg-gray/50 dark:bg-gray h-10 w-10"></div>
    <div class="flex-1 space-y-6 py-1">
        <div class="h-2 bg-gray/50 dark:bg-gray rounded"></div>
        <div class="space-y-3">
            <div class="grid grid-cols-3 gap-4">
                <div class="h-2 bg-gray/50 dark:bg-gray rounded col-span-2"></div>
                <div class="h-2 bg-gray/50 dark:bg-gray rounded col-span-1"></div>
            </div>
            <div class="h-2 bg-gray/50 dark:bg-gray rounded"></div>
        </div>
    </div>
</div>`;

// @ts-ignore
import sunIconSvg from "remixicon/icons/Weather/sun-line.svg";
// @ts-ignore
import moonIconSvg from "remixicon/icons/Weather/moon-line.svg";
import { BskyExternalCard, BskyImage } from "./bsky";

function icon(svg: string) {
    return html`<i class="flex w-[1.2em] h-[1.2em] border-white fill-primary">${unsafeHTML(svg)}</i>`;
}

@customElement("theme-toggle")
export class ThemeToggle extends LitElement {
    static style = [globalStyles];

    @state()
    theme = "dark";

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    connectedCallback(): void {
        super.connectedCallback();
        this.theme = localStorage.getItem("theme") ?? "dark";
        this.setTheme(this.theme);
    }

    setTheme(theme: string) {
        localStorage.setItem("theme", theme);
        if (theme == "dark") document.documentElement.classList.add("dark");
        else document.documentElement.classList.remove("dark");
    }

    toggleTheme() {
        this.theme = this.theme == "dark" ? "light" : "dark";
        this.setTheme(this.theme);
    }

    render() {
        const moonIcon = icon(moonIconSvg);
        const sunIcon = icon(sunIconSvg);

        return html`<button class="absolute top-0 right-0 p-4 fill-primary" @click=${this.toggleTheme}>
            ${this.theme == "dark" ? moonIcon : sunIcon}
        </button>`;
    }
}
export function isWithinLastNumDays(dateString: string, numDays: number): boolean {
    const currentDate = new Date();
    const targetDate = new Date(dateString);
    const timeDifference = currentDate.getTime() - targetDate.getTime();
    const daysDifference = timeDifference / (1000 * 60 * 60 * 24);
    return daysDifference <= numDays;
}

export function getYearMonthDate(dateString: string): string {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");

    return `${year}-${month}-${day}`;
}

export function generateDates(numDays: number): string[] {
    const dateArray: string[] = [];

    for (let i = 0; i < numDays; i++) {
        const currentDate = new Date();
        currentDate.setDate(currentDate.getDate() - i);

        const year = currentDate.getFullYear();
        const month = (currentDate.getMonth() + 1).toString().padStart(2, "0");
        const day = currentDate.getDate().toString().padStart(2, "0");

        dateArray.push(`${year}-${month}-${day}`);
    }

    return dateArray.reverse();
}

export function generateHours(): string[] {
    const hours: string[] = [];
    for (let i = 0; i < 24; i++) {
        hours.push((i < 10 ? "0" : "") + i + ":00");
    }
    return hours;
}

export function generateWeekdays(): string[] {
    return ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
}

export function replaceSpecialChars(inputString: string): string {
    const pattern = /[,!?(){}[\]<>;:'"\/\\|&^*%$#@~_+=-]/g;
    const result = inputString.replace(pattern, " ");
    return result;
}
