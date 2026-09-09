import fs from "node:fs/promises";
import path from "node:path";

import { profilesDir } from "./pins.js";

/**
 * A fresh profile per run, and one that cannot update itself.
 *
 * The update prefs are not a precaution. A pinned build left alone upgrades
 * itself mid-run, which is how this was found: the published driver stack
 * ships app-update prefs from the Rust side but nothing Thunderbird-aware, and
 * mozbase's Thunderbird profile turns off *add-on* updates and the mail
 * provider wizard and says nothing at all about the application. So every
 * pref below is written here explicitly, and the enterprise policy beside the
 * binary (see provision.js) is the belt to their braces.
 *
 * `user.js` rather than `prefs.js`: Thunderbird re-applies it over `prefs.js`
 * at every startup, so nothing the application decides to write during a run
 * can take a pref back.
 */

/**
 * Two facts about the prefs geckodriver itself writes, since they decide what
 * has to be here. It writes its own defaults into a custom profile only for
 * keys the profile does not already set, so anything named here wins. And its
 * strongest one, `app.update.disabledForTesting`, is gated on Marionette
 * running - true under the driver, false for a hand-launched build, which is
 * why the policy file carries the real weight.
 */
const UPDATE_PREFS = {
  // Bites because Marionette is running. `app.update.enabled` is deliberately
  // absent: it was removed from Gecko in Firefox 63 and setting it does
  // nothing at all, which makes it worse than useless here - it reads like
  // cover that is not there.
  "app.update.disabledForTesting": true,
  "app.update.auto": false,
  "app.update.background.enabled": false,
  "app.update.checkInstallTime": false,
  "app.update.staging.enabled": false,
  "app.update.langpack.enabled": false,
  "extensions.update.enabled": false,
  "extensions.update.autoUpdateDefault": false,
  "extensions.installDistroAddons": false,
};

/**
 * First-run noise. A brand-new profile otherwise opens the account setup tab,
 * the mail provider dialog and the rights notification, any of which can be
 * the modal that a driven run waits behind forever.
 */
const FIRST_RUN_PREFS = {
  "mail.provider.enabled": false,
  "mail.provider.suppress_dialog_on_startup": true,
  "mailnews.start_page.enabled": false,
  "mailnews.start_page.url": "about:blank",
  "mailnews.start_page.override_url": "about:blank",
  "mailnews.start_page_override.mstone": "ignore",
  "mail.rights.version": 9999,
  "mail.shell.checkDefaultClient": false,
  "datareporting.policy.dataSubmissionEnabled": false,
  "mailnews.database.global.indexer.enabled": false,
  "mail.spotlight.firstRunDone": true,
  "mail.winsearch.firstRunDone": true,
  "mail.spellcheck.inline": false,
  "browser.warnOnQuit": false,
  "browser.sessionstore.resume_from_crash": false,
};

/**
 * Temporary installs never require a signature, and Thunderbird does not sign
 * add-ons at all - comm-central builds with signing off, so the pref is
 * honoured rather than locked. Set anyway, because the cost is one line and
 * the failure it would otherwise produce reads like a code problem.
 */
const ADDON_PREFS = {
  "xpinstall.signatures.required": false,
  "extensions.logging.enabled": true,
  // A driven run stops for no slow-script dialog. Both of these are gone from
  // the profile a person uses, so nothing here hides a hang from the harness:
  // the test's own timeout reports it instead of a modal nobody can see.
  "dom.max_script_run_time": 0,
  "dom.max_chrome_script_run_time": 0,
};

/**
 * A compose window needs an identity. Every entry point into the compose
 * service carries an `nsIMsgIdentity`, and with no accounts configured the
 * value handed over is null rather than an error, so the window either never
 * opens or opens without the one thing it is being opened for.
 *
 * This is Mozilla's own recipe, from comm-central's mozmill runner by way of
 * the add-on SDK, copied verbatim in shape: `account1` is Local Folders and
 * carries no identity, and the identity hangs off `account2`, a pop3 account
 * pointed at a hostname that does not resolve. It is preferred over creating
 * the account through `MailServices.accounts` from chrome context - which the
 * harness could do, having chrome context anyway - because an account that
 * exists before the first paint is what keeps the account setup tab from
 * opening in the first place. `ensureIdentity()` in session.js is the API
 * route, kept as the repair path for the day these pref names drift.
 */
const ACCOUNT_PREFS = {
  "mail.account.account1.server": "server1",
  "mail.account.account2.identities": "id1",
  "mail.account.account2.server": "server2",
  "mail.accountmanager.accounts": "account1,account2",
  "mail.accountmanager.defaultaccount": "account2",
  "mail.accountmanager.localfoldersserver": "server1",
  "mail.identity.id1.fullName": "ThunderCode Harness",
  "mail.identity.id1.smtpServer": "smtp1",
  "mail.identity.id1.useremail": "harness@invalid.test",
  "mail.identity.id1.valid": true,
  // The add-on is about HTML mail, so the default identity composes HTML. The
  // plain-text composer is asked for per window rather than by flipping this.
  "mail.identity.id1.compose_html": true,
  "mail.root.none-rel": "[ProfD]Mail",
  "mail.root.pop3-rel": "[ProfD]Mail",
  "mail.server.server1.directory-rel": "[ProfD]Mail/Local Folders",
  "mail.server.server1.hostname": "Local Folders",
  "mail.server.server1.name": "Local Folders",
  "mail.server.server1.type": "none",
  "mail.server.server1.userName": "nobody",
  "mail.server.server2.type": "pop3",
  "mail.server.server2.hostname": "harness.invalid.test",
  "mail.server.server2.userName": "harness",
  "mail.server.server2.name": "harness@invalid.test",
  // The account is a prop, not a mailbox. Without these three it tries to
  // reach a host that does not resolve, on startup and then every ten
  // minutes, and the run pays for the DNS timeout.
  "mail.server.server2.login_at_startup": false,
  "mail.server.server2.check_new_mail": false,
  "mail.server.server2.download_on_biff": false,
  "mail.smtp.defaultserver": "smtp1",
  "mail.smtpserver.smtp1.hostname": "harness.invalid.test",
  "mail.smtpserver.smtp1.username": "harness",
  "mail.smtpservers": "smtp1",
};

export const PROFILE_PREFS = {
  ...UPDATE_PREFS,
  ...FIRST_RUN_PREFS,
  ...ADDON_PREFS,
  ...ACCOUNT_PREFS,
};

/** The prefs a test can assert are in force, without repeating their values. */
export const UPDATE_PREF_NAMES = Object.keys(UPDATE_PREFS);

/**
 * A session can add prefs of its own - `startThunderbird({ prefs })` merges
 * them over the set above - which is the only way to reach a pref that has to
 * be set before startup.
 *
 * One that looks tempting and is not: `extensions.webextensions.remote =
 * false`, to bring extension pages into the parent process so that a popup's
 * document could be read from chrome. It was tried. The popup panel's browser
 * then stays on `about:blank` and the popup never loads at all, so it buys
 * nothing and costs the process model the add-on actually ships in.
 */

function userJs(prefs) {
  const lines = Object.entries(prefs).map(
    ([name, value]) => `user_pref(${JSON.stringify(name)}, ${JSON.stringify(value)});`,
  );
  return `// Written by tests/thunderbird/harness/profile.js. Regenerated per run.\n${lines.join("\n")}\n`;
}

/**
 * Fresh means new: a directory that did not exist a moment ago, named after
 * the run, rather than a reused one with the last run's state cleared out of
 * it. Nothing survives a run except the download cache, so a test can never
 * pass because of something an earlier test left behind.
 */
export async function createProfile({ prefs = {} } = {}) {
  await fs.mkdir(profilesDir, { recursive: true });
  const dir = await fs.mkdtemp(path.join(profilesDir, "run-"));
  await fs.writeFile(path.join(dir, "user.js"), userJs({ ...PROFILE_PREFS, ...prefs }));
  return dir;
}
