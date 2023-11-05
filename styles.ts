import { unsafeCSS } from "lit";

// @ts-ignore
import globalCssTxt from "./styles-bundle.css";

export const globalStyles = [unsafeCSS(globalCssTxt)];
