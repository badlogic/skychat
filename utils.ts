import { LitElement, TemplateResult, html, nothing, render } from "lit";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { customElement, property, state } from "lit/decorators.js";
import { globalStyles } from "./styles";

export function getDateString(inputDateTime: Date): string {
    const hours = inputDateTime.getHours();
    const minutes = inputDateTime.getMinutes();
    const seconds = inputDateTime.getSeconds();

    const paddedMinutes = String(minutes).padStart(2, "0");
    const paddedSeconds = String(seconds).padStart(2, "0");

    const year = inputDateTime.getFullYear();
    const month = new String(inputDateTime.getMonth() + 1).padStart(2, "0");
    const day = new String(inputDateTime.getDate()).padStart(2, "0");

    const currDate = new Date();
    const printYear =
        currDate.getFullYear() != inputDateTime.getFullYear() ||
        currDate.getMonth() != inputDateTime.getMonth() ||
        currDate.getDay() != inputDateTime.getDay();

    return hours + ":" + paddedMinutes + ":" + paddedSeconds + (printYear ? ` ${year}-${month}-${day}` : "");
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

function icon(svg: string) {
    return html`<i class="flex w-[1.2em] h-[1.2em] border-white fill-primary">${unsafeHTML(svg)}</i>`;
}

@customElement("theme-toggle")
export class ThemeToggle extends LitElement {
    static style = [globalStyles];

    @state()
    theme = "dark";

    @property()
    absolute = true;

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

        return html`<button
            class="${this.absolute == true ? "absolute top-0 right-0 p-4 fill-primary" : "flex items-center p4 fill-primary"}"
            @click=${this.toggleTheme}
        >
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
