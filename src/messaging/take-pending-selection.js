/**
 * The one message this add-on sends: the popup asking the background for the
 * text a right-click parked against its compose tab.
 *
 * A module of its own because both ends need the same string and neither end
 * owns it - the background answers the message and the popup asks it, and a
 * literal at each end is two things to keep in step. It was two, and a test
 * that restated it made three.
 *
 * Namespaced with the add-on's own prefix because `runtime.onMessage` is a bus:
 * every listener in this extension hears every message sent to it, so the type
 * has to be recognisable rather than merely descriptive.
 */
export const TAKE_PENDING_SELECTION = "thundercode:take-pending-selection";
