import { LitElement } from "lit";
import { customElement } from "lit/decorators";
import { globalStyles } from "./styles";

@customElement("sticky-area")
export class Sticky extends LitElement {
    static styles = [globalStyles];
}
