import { RichText } from "@atproto/api";
import { LitElement, html, css, TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import Quill from "quill";

let Inline = Quill.import("blots/inline");

class CustomClassBlot extends Inline {
    static create(value: any) {
        let node = super.create();
        node.classList.add(value);
        return node;
    }

    static formats(domNode: HTMLElement) {
        return domNode.classList.contains("text-blue-500") ? "text-blue-500" : undefined;
    }
}

CustomClassBlot.blotName = "customClass";
CustomClassBlot.tagName = "span";
Quill.register(CustomClassBlot);

export type QuillEditorCallback = (text: string, cursorStart: number, cursorEnd: number, insert: (s: string) => void) => void;

@customElement("quill-text-editor")
export class QuillEditor extends LitElement {
    private editor?: Quill;

    @property()
    onInput: QuillEditorCallback = () => {};

    @property()
    initialText?: string;

    protected createRenderRoot(): Element | ShadowRoot {
        return this;
    }

    firstUpdated() {
        this.editor = new Quill(this.querySelector("#editor")!, {
            modules: {
                toolbar: false,
            },
            theme: undefined,
        });

        this.editor.on("text-change", () => this.highlightText());
        if (this.initialText) this.editor.setText(this.initialText);
        this.editor.focus();
    }

    insertTextAtCursor(text: string) {
        if (!this.editor) return;
        const cursorPosition = this.editor.getSelection(true)!.index;
        this.editor.insertText(cursorPosition, text, "api");
        this.editor.setSelection({ index: cursorPosition + text.length, length: 0 });
    }

    highlightText() {
        if (!this.editor) return;
        const text = this.editor.getText();
        this.onInput(
            text,
            this.editor.getSelection(true)!.index,
            this.editor.getSelection(true)!.index + this.editor.getSelection(true)!.length,
            (text) => this.insertTextAtCursor(text)
        );
        const rt = new RichText({ text });
        rt.detectFacetsWithoutResolution();
        this.editor.removeFormat(0, text.length - 1, "silent");

        let currentIndex = 0;

        for (const segment of rt.segments()) {
            const segmentLength = segment.text.length;

            if (segment.isMention()) {
                this.editor.formatText(currentIndex, segmentLength, { customClass: "text-blue-500" }, "silent");
            } else if (segment.isLink()) {
                this.editor.formatText(currentIndex, segmentLength, { customClass: "text-blue-500" }, "silent");
            } else if (segment.isTag()) {
                this.editor.formatText(currentIndex, segmentLength, { customClass: "text-blue-500" }, "silent"); // Use a class to style tags differently
            }

            currentIndex += segmentLength;
        }
        this.editor.focus();
    }

    focus() {
        this.editor?.focus();
    }

    render() {
        return html`<div id="editor" class="w-full h-full bg-transparent text-black dark:text-white text-normal overflow-auto"></div>`;
    }

    setText(text: string) {
        this.editor?.setText(text, "user");
    }

    getText() {
        return this.editor?.getText() ?? "";
    }
}
