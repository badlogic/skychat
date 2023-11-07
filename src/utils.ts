import { AppBskyActorDefs, AtpSessionData, AtpSessionEvent, BskyAgent } from "@atproto/api";
import { TemplateResult, html, render, svg } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";

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

export const defaultAvatar = svg`<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="none" data-testid="userAvatarFallback"><circle cx="12" cy="12" r="12" fill="#0070ff"></circle><circle cx="12" cy="9.5" r="3.5" fill="#fff"></circle><path stroke-linecap="round" stroke-linejoin="round" fill="#fff" d="M 12.058 22.784 C 9.422 22.784 7.007 21.836 5.137 20.262 C 5.667 17.988 8.534 16.25 11.99 16.25 C 15.494 16.25 18.391 18.036 18.864 20.357 C 17.01 21.874 14.64 22.784 12.058 22.784 Z"></path></svg>`;

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

export function isWithinLastNumDays(dateString: string, numDays: number): boolean {
    const currentDate = new Date();
    const targetDate = new Date(dateString);
    const timeDifference = currentDate.getTime() - targetDate.getTime();
    const daysDifference = timeDifference / (1000 * 60 * 60 * 24);
    return daysDifference <= numDays;
}

export function getTimeDifference(utcTimestamp: number): string {
    const now = Date.now();
    const timeDifference = now - utcTimestamp;

    const seconds = Math.floor(timeDifference / 1000);
    if (seconds < 60) {
        return seconds + "s";
    }

    const minutes = Math.floor(timeDifference / (1000 * 60));
    if (minutes < 60) {
        return minutes + "m";
    }

    const hours = Math.floor(timeDifference / (1000 * 60 * 60));
    if (hours < 24) {
        return hours + "h";
    }

    const days = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
    if (days < 30) {
        return days + "d";
    }

    const months = Math.floor(timeDifference / (1000 * 60 * 60 * 24 * 30));
    if (months < 12) {
        return months + "mo";
    }

    const years = Math.floor(timeDifference / (1000 * 60 * 60 * 24 * 365));
    return years + "y";
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

export type ImageInfo = {
    alt: string;
    dataUri: string;
    data: Uint8Array;
    mimeType: string;
};

function uint8ArrayToBase64(uint8Array: Uint8Array): string {
    let binary = "";
    uint8Array.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary);
}

export async function downloadImage(url: string): Promise<ImageInfo | Error> {
    try {
        const response = await fetch(url);
        if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const data = new Uint8Array(arrayBuffer);
            let mimeType = "image/png";
            if (response.headers.get("Content-Type")?.startsWith("image")) mimeType = response.headers.get("Content-Type")!;
            const dataUri = `data:${mimeType};base64,${uint8ArrayToBase64(data)}`;
            return { alt: "", dataUri, mimeType, data };
        } else {
            return new Error("Failed to download image:" + response.status + ", " + response.statusText);
        }
    } catch (error) {
        return new Error("Failed to downlaod image");
    }
}

export async function readFile(file: File) {
    return new Promise<{ dataUri: string; mimeType: string }>((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target && event.target.result) resolve({ dataUri: event.target.result as string, mimeType: file.type });
        };
        reader.readAsDataURL(file);
    });
}

export async function loadImageFile(file: File): Promise<ImageInfo> {
    const { dataUri, mimeType } = await readFile(file);
    const base64Data = dataUri.split(",")[1];
    const uint8Array = new Uint8Array(
        atob(base64Data)
            .split("")
            .map((char) => char.charCodeAt(0))
    );
    return { alt: "", dataUri, data: uint8Array, mimeType };
}

export async function loadImageFiles(imageFiles: FileList): Promise<ImageInfo[]> {
    const convertedDataArray: ImageInfo[] = [];
    for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        if (!file) continue;
        convertedDataArray.push(await loadImageFile(file));
    }
    return convertedDataArray;
}

export async function downscaleImage(imageData: ImageInfo, targetSizeInBytes = 960000): Promise<ImageInfo | Error> {
    const quality = imageData.mimeType === "image/jpeg" ? 0.7 : 1;
    const mimeType = imageData.mimeType === "image/jpeg" ? "image/jpeg" : "image/png";
    const maxIterations = 10;

    let finalData: Uint8Array = imageData.data;
    let finalDataUri: string = imageData.dataUri;

    if (targetSizeInBytes > imageData.data.length) return imageData;

    const img = new Image();
    img.src = imageData.dataUri;
    await new Promise((imgLoadResolve) => {
        img.onload = imgLoadResolve;
    });

    let lower = 0;
    let upper = 1;

    for (let i = 0; i < maxIterations; i++) {
        const middle = (lower + upper) / 2;
        let newWidth = img.width * middle;
        let newHeight = img.height * middle;

        const canvas = document.createElement("canvas");
        canvas.width = newWidth;
        canvas.height = newHeight;

        const ctx = canvas.getContext("2d");

        if (!ctx) {
            return new Error("Canvas context is not supported.");
        }

        ctx.drawImage(img, 0, 0, newWidth, newHeight);

        let scaledDataUri = canvas.toDataURL(mimeType, 1);

        let scaledData = new Uint8Array(
            atob(scaledDataUri.split(",")[1])
                .split("")
                .map((char) => char.charCodeAt(0))
        );

        if (scaledData.length > targetSizeInBytes) {
            upper = middle;
        } else {
            lower = middle;
            finalData = scaledData;
            finalDataUri = scaledDataUri;
        }
    }

    return { alt: imageData.alt, dataUri: finalDataUri, data: finalData, mimeType };
}

export function onVisibleOnce(target: Element, callback: () => void) {
    let callbackTriggered = false;

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    callbackTriggered = true;
                    callback();
                    observer.unobserve(entry.target);
                }
            });
        },
        {
            root: null,
            rootMargin: "200px",
            threshold: 0.01,
        }
    );
    observer.observe(target);
}

export async function login(account?: string, password?: string) {
    const persistSession = (evt: AtpSessionEvent, sess?: AtpSessionData) => {
        // store the session-data for reuse
        if (evt == "create" || evt == "update") {
            localStorage.setItem("s", JSON.stringify(sess));
        }
    };

    if (!account || !password) return new BskyAgent({ service: "https://api.bsky.app" });
    const bskyClient = new BskyAgent({ service: "https://bsky.social", persistSession });
    try {
        const session = localStorage.getItem("s") ? (JSON.parse(localStorage.getItem("s")!) as AtpSessionData) : undefined;
        let resumeSuccess = false;
        if (session) {
            const resume = await bskyClient.resumeSession(session);
            resumeSuccess = resume.success;
        }

        if (!resumeSuccess) {
            const response = await bskyClient.login({
                identifier: account,
                password,
            });
            if (!response.success) throw new Error();
        }
        const profileResponse = await bskyClient.app.bsky.actor.getProfile({ actor: account });
        if (!profileResponse.success) {
            throw new Error();
        }
        localStorage.setItem("profile", JSON.stringify(profileResponse.data));
        localStorage.setItem("a", account);
        localStorage.setItem("p", password);
        return bskyClient;
    } catch (e) {
        return new Error("Couldn't log-in with your BlueSky credentials.");
    }
}

export function logout() {
    localStorage.removeItem("profile");
    localStorage.removeItem("a");
    localStorage.removeItem("p");
    localStorage.removeItem("s");
}

export function hasHashtag(text: string, hashtag: string) {
    const tokens = text.split(/[ \t\n\r.,;!?'"]+/);
    for (const token of tokens) {
        if (token.toLowerCase() === hashtag.toLowerCase()) {
            return true;
        }
    }
    return false;
}

export function renderAuthor(author: AppBskyActorDefs.ProfileView, smallAvatar = false) {
    return html`<a class="flex items-center gap-2" href="${getProfileUrl(author.handle ?? author.did)}" target="_blank">
        ${author.avatar
            ? html`<img class="${smallAvatar ? "w-[1em] h-[1em]" : "w-[2em] h-[2em]"} rounded-full" src="${author.avatar}" />`
            : defaultAvatar}
        <span class="${smallAvatar ? "text-sm" : ""} font-bold line-clamp-1 hover:underline">${author.displayName ?? author.handle}</span>
    </a>`;
}

export function getProfileUrl(account: AppBskyActorDefs.ProfileView | string) {
    return `https://bsky.app/profile/${typeof account == "string" ? account : account.did}`;
}

export function deepEqual(a: any, b: any): boolean {
    if (a === b) {
        return true;
    }

    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
        return false;
    }

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) {
        return false;
    }

    for (const key of keysA) {
        if (!keysB.includes(key) || !deepEqual(a[key], b[key])) {
            return false;
        }
    }

    return true;
}
