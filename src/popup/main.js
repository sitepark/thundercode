import { startPopup } from "./popup.js";

/**
 * The popup page's entry point, and the whole of the difference between
 * importing popup.js and running it.
 *
 * It is a file of its own so that popup.js can be imported without wiring
 * anything up. The wiring has to be startable more than once and against a
 * clock somebody else holds - that is what a test of the popup needs, and a
 * module that wires itself up on import can offer neither - so the one call
 * that does start it lives here, where the document is the page's own and the
 * clock is the window's.
 */
startPopup();
