import { unsafeCSS } from "lit";

// @ts-ignore
import globalCssTxt from "../../html/build/styles-bundle.css";

export const globalStyles = [unsafeCSS(globalCssTxt)];
