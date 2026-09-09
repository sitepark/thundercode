/**
 * The strict browser fake, shared by every tier that needs one.
 *
 * `browser` is a global rather than a document, so all of this add-on except
 * the pipeline is reachable from a test that puts one there. What this file
 * adds to that is strictness: a namespace or a member the test did not stub
 * throws when it is reached and names what was asked for, so widening the
 * extension's API surface shows up as a failing test rather than as an
 * `undefined` that something further down the call quietly interprets.
 *
 * Built here rather than taken from a package. The maintained WebExtension
 * mocks know Chrome and Firefox, and none of them knows Thunderbird's
 * namespaces - `compose`, `composeAction`, `menus` - which is the same reason
 * the Firefox-oriented linter is being replaced rather than kept alongside.
 *
 * The stubs a test writes stay deliberately thin, for the reason
 * tests/node/settings.test.js already gave for its own: there is no store
 * behind `storage.local` here, and asserting on one would only be asserting
 * that this file works. What the fake records is which member was called, with
 * what, and what the caller did with the answer, and each of those is a
 * decision a module actually makes.
 *
 * It lives under tests/helpers/ rather than in either tier, because the pure
 * tier and the simulated-DOM tier are separate runner projects and both need
 * it. Only `*.test.js` is collected as a suite, so a helper directory here is
 * not a tier of its own.
 *
 *     let fake;
 *
 *     beforeEach(() => {
 *       fake = installBrowserFake({
 *         menus: { create: () => {}, onClicked: event() },
 *         runtime: { lastError: undefined, onMessage: event() },
 *       });
 *     });
 *
 *     afterEach(() => {
 *       vi.unstubAllGlobals();
 *     });
 */

import { vi } from "vitest";

const EVENT = Symbol("browser fake event");

/**
 * Declares an event object - `addListener`, `removeListener`, `hasListener` -
 * where a stub would otherwise name a function.
 *
 * The listeners a module registers are the seam for anything that does its
 * work at module scope, the background above all: there is nothing to call,
 * so a test drives it by firing what the import registered. `fire` below is
 * the other half.
 */
export const event = () => ({ [EVENT]: true });

/**
 * Members that are present and throw rather than absent, with the rule they
 * break as the message.
 *
 * `storage.sync` is the one the spec rules out, and it was already stubbed
 * this way by hand in the settings tests before this file existed: left in
 * rather than omitted so that "settings follow the profile around" cannot be
 * introduced quietly by someone who thinks it is an improvement. Absent, it
 * would read as an API this project has not got round to using. Present and
 * throwing, every test that reaches it fails at once.
 */
const RULED_OUT = {
  "storage.sync":
    "storage.sync is ruled out by the spec: settings must not follow the profile around",
};

const splitPath = (path) => {
  const at = path.lastIndexOf(".");
  return at === -1 ? ["", path] : [path.slice(0, at), path.slice(at + 1)];
};

const join = (path, name) => (path === "" ? name : `${path}.${name}`);

/**
 * Every object in a stub tree is a namespace, so `storage: { local: { … } }`
 * is strict at both levels. The rule is deliberately that blunt rather than
 * guessing from a stub's contents which objects are namespaces and which are
 * data.
 *
 * A member that carries data rather than API - `runtime.lastError` is the only
 * one in this add-on - is therefore declared as `undefined` and given its
 * value inside the test that wants one. That assignment is not turned into a
 * namespace, so the object a caller reads properties off stays an ordinary
 * object.
 */
const isNamespace = (value) =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  value[EVENT] !== true;

const ruledOut = (path, reason) =>
  new Proxy(
    {},
    {
      get: (_target, property) => {
        if (typeof property === "symbol") {
          return undefined;
        }
        throw new Error(
          `browser.${path}.${String(property)} was reached, and ${reason}.`,
        );
      },
    },
  );

/**
 * Installs a fake `browser` built from `stubs` and returns the handle a test
 * asserts through. The stubs are the whole declaration of what this test lets
 * the code under test touch.
 */
export const installBrowserFake = (stubs = {}) => {
  const calls = new Map();
  const reads = new Map();
  const listeners = new Map();

  const record = (path, args) => {
    const recorded = calls.get(path) ?? [];
    recorded.push(args);
    calls.set(path, recorded);
  };

  const recording =
    (path, implementation) =>
    (...args) => {
      record(path, args);
      return implementation(...args);
    };

  const captured = (path) => {
    listeners.set(path, []);
    return namespace(path, {
      addListener: (listener) => {
        listeners.get(path).push(listener);
      },
      removeListener: (listener) => {
        const registered = listeners.get(path);
        const at = registered.indexOf(listener);
        if (at !== -1) {
          registered.splice(at, 1);
        }
      },
      hasListener: (listener) => listeners.get(path).includes(listener),
    });
  };

  const namespace = (path, declared) => {
    const members = {};

    for (const [name, value] of Object.entries(declared)) {
      const memberPath = join(path, name);
      const reason = RULED_OUT[memberPath];
      if (reason) {
        throw new Error(`browser.${memberPath} cannot be stubbed: ${reason}.`);
      }
      members[name] = build(memberPath, value);
    }

    for (const [forbiddenPath, reason] of Object.entries(RULED_OUT)) {
      const [parent, name] = splitPath(forbiddenPath);
      if (parent === path) {
        members[name] = ruledOut(forbiddenPath, reason);
      }
    }

    return new Proxy(members, {
      get: (target, property) => {
        if (typeof property === "symbol") {
          return target[property];
        }
        const memberPath = join(path, property);
        reads.set(memberPath, (reads.get(memberPath) ?? 0) + 1);
        if (!Object.hasOwn(target, property)) {
          throw new Error(
            `browser.${memberPath} was reached, but this test did not stub it.`,
          );
        }
        return target[property];
      },

      // Overriding one member for one assertion, rather than re-installing a
      // whole fake, is the idiom the settings tests already use. The override
      // is recorded like any other stub, so what a test reassigns is still
      // observable through `calls`.
      set: (target, property, value) => {
        const memberPath = join(path, property);
        if (!Object.hasOwn(target, property)) {
          throw new Error(
            `browser.${memberPath} was assigned, but this test did not stub it.`,
          );
        }
        target[property] =
          typeof value === "function" ? recording(memberPath, value) : value;
        return true;
      },
    });
  };

  const build = (path, value) => {
    if (typeof value === "function") {
      return recording(path, value);
    }
    if (value?.[EVENT] === true) {
      return captured(path);
    }
    if (isNamespace(value)) {
      return namespace(path, value);
    }
    return value;
  };

  vi.stubGlobal("browser", namespace("", stubs));

  return {
    /**
     * Every call to `browser.<path>`, oldest first, as the argument lists they
     * were made with: `[[{ windowId: 7 }]]` is one call with one argument.
     */
    calls: (path) => [...(calls.get(path) ?? [])],

    /**
     * How many times `browser.<path>` has been read.
     *
     * For the members whose whole purpose is that somebody looks at them.
     * `runtime.lastError` is the one: reading it is what tells the platform an
     * error was handled, so a test that wants to know an error was swallowed
     * rather than ignored has to be able to see the read.
     */
    reads: (path) => reads.get(path) ?? 0,

    /**
     * Delivers an event to the listeners the code under test registered, and
     * answers with what each of them returned - so a listener that declines by
     * returning `undefined` is distinguishable from one that answers with a
     * promise.
     *
     * Firing an event nobody is listening to throws rather than passing
     * quietly, since a test that fires into the void asserts nothing.
     */
    fire: (path, ...args) => {
      const registered = listeners.get(path);
      if (!registered) {
        throw new Error(`browser.${path} was not stubbed as an event.`);
      }
      if (registered.length === 0) {
        throw new Error(`browser.${path} has no listener to fire.`);
      }
      return registered.map((listener) => listener(...args));
    },

    /**
     * Drops every registered listener, keeping the recorded calls.
     *
     * What it models is an event page being suspended: its scope goes, and the
     * listeners it registered go with it. Without this, a test that wakes the
     * background twice dispatches to two live copies of it and reads the older
     * one's answer.
     */
    forgetListeners: () => {
      for (const registered of listeners.values()) {
        registered.length = 0;
      }
    },
  };
};
