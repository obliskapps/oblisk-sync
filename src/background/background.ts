import {
    createAccount,
    deleteSession,
    getSession,
    getSessionsList,
    loadProfile,
    createSession,
    setProfile,
    updateSession,
    signOut,
    nip07GetHexPublicKey,
    nip07SignEvent,
    nip07GetUserRelays,
    nip07Decrypt,
    importAccount,
    loadObliskProfile,
    nip07Encrypt
} from "./nostr-actions";
import { actions, Tab, Session } from '../shared/contracts';
import browser from 'webextension-polyfill';
import CryptoJS from 'crypto-js';


const debounceDelayMiliseconds = 2000;
let sessionRestoring = false;
const tryMatchSessionOnOpen = true;
const obliskNpub = "npub1wdclne27pzhx3ydj4fztpkn66va2gm8s8e3prghcxr7ghe3gelfspqrgqt";
const obliskHexPub = "7371f9e55e08ae6891b2aa44b0da7ad33aa46cf03e6211a2f830fc8be628cfd3";

const storageKeys = {
    HEX_PRIV_KEY: "hexPrivKey",
    ACTIVE_SESSIONS: "activeSessions",
    LAST_TRACKED_SESSION_ID: "lastTrackedSessionId",
    RESTORE_LAST_SESSION: "restoreLastSession",
    ENABLE_NOSTR_SIGNER: "enableNostrSigner"
}

//default app relays to broadcast user relays. nip65
const appRelays = {
    'wss://relay.snort.social': { read: true, write: true },
    'wss://relay.damus.io': { read: true, write: true },
    'wss://relay.primal.net': { read: true, write: true },
    'wss://n.ok0.org': { read: true, write: true },
    'wss://nostr.cheeserobot.org': { read: true, write: true },
    'wss://nostr.cercatrova.me': { read: true, write: true },
    'wss://nostr.swiss-enigma.ch': { read: true, write: true },
    'wss://relay.nostr.band': { read: true, write: true },
    'wss://purplepag.es': { read: true, write: true },
    'wss://nostr.mutinywallet.com': { read: false, write: true }
};

const defaultBanner = 'https://nostr.build/i/nostr.build_b50139c838fdb4834486fdeb25687eef9d5ae2b961aac097a40770c3d584f614.jpg';

browser.runtime.onStartup.addListener(async function () {
    sessionRestoring = true;
    const window = await browser.windows.getCurrent();
    const windowId = window.id;
    const restoreSession = await getLocalAsync<boolean>(storageKeys.RESTORE_LAST_SESSION);

    if (!!restoreSession && !!windowId) {
        await restoreLastSessionAsync(windowId);
    }
    else if (tryMatchSessionOnOpen && !!windowId) {
        await tryMatchRestoredSession(windowId);
    }
    sessionRestoring = false;
});


browser.windows.onCreated.addListener(async function (window) {
    sessionRestoring = true;
    const windowId = window.id;

    if (tryMatchSessionOnOpen && !!windowId) {
        await tryMatchRestoredSession(windowId);
    }
    sessionRestoring = false;
});


browser.windows.onFocusChanged.addListener(async function (windowId) {
    if (windowId === browser.windows.WINDOW_ID_NONE) {
        return;
    }
    const savedSession = await getActiveSessionAsync(windowId);

    if (!!savedSession) {
        await browser.storage.local.set({
            [storageKeys.LAST_TRACKED_SESSION_ID]: savedSession!.sessionId
        });
    }

    setBadge(savedSession?.sessionName ?? null, false);
});

let timeoutId: number | null = null;

async function debouncedUpdateSession(windowId: number) {
    // Clear the existing timeout, if any
    if (timeoutId) {
        clearTimeout(timeoutId);
    }

    const savedSession = await getActiveSessionAsync(windowId);

    setBadge(savedSession?.sessionName ?? null, true);

    // Set a new timeout
    timeoutId = setTimeout(async () => {
        await updateSessionAsync(windowId);
        setBadge(savedSession?.sessionName ?? null, false);
    }, debounceDelayMiliseconds);
}

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (sessionRestoring || !tab.windowId || !(!!changeInfo.url && !!changeInfo.status)) {
        return;
    }
    await debouncedUpdateSession(tab.windowId);
});

browser.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    const windowId = removeInfo.windowId;

    if (removeInfo.isWindowClosing) {
        const session = await getActiveSessionAsync(windowId);

        if (!!session) {
            await browser.storage.local.set({
                [storageKeys.LAST_TRACKED_SESSION_ID]: session.sessionId
            });
        }

        return;
    }
    if (sessionRestoring || !removeInfo.windowId) {
        return;
    }

    await debouncedUpdateSession(removeInfo.windowId);
});

browser.tabs.onMoved.addListener(async (tabId, moveInfo) => {
    if (sessionRestoring || !moveInfo.windowId) {
        return;
    }
    await debouncedUpdateSession(moveInfo.windowId);
});


browser.runtime.onMessage.addListener(async (request): Promise<any> => {
    switch (request.action) {

        case actions.SAVE_SETTINGS: {
            browser.storage.local.set(
                {
                    [storageKeys.RESTORE_LAST_SESSION]: request.payload.restoreSession,
                    [storageKeys.ENABLE_NOSTR_SIGNER]: request.payload.enableSigner
                });
            return;
        }

        case actions.GET_NOSTR_SIGN_SETTING: {
            const enableNostrSigner = await getLocalAsync<boolean>(storageKeys.ENABLE_NOSTR_SIGNER);
            return {
                data: enableNostrSigner || false
            }
        }

        case actions.LOAD_SETTINGS: {
            const restoreLastSession = await getLocalAsync<boolean>(storageKeys.RESTORE_LAST_SESSION);
            const useAsSigner = await getLocalAsync<boolean>(storageKeys.ENABLE_NOSTR_SIGNER);
            return {
                enableSigner: useAsSigner || false,
                restoreSession: restoreLastSession || false
            };
        }

        case actions.IMPORT_ACCOUNT: {
            const keys = importAccount(request.payload.nsec);

            const useAsSigner = await getLocalAsync<boolean | null>(storageKeys.ENABLE_NOSTR_SIGNER);

            browser.storage.local.set({
                [storageKeys.HEX_PRIV_KEY]: useAsSigner ?? true,
                hexPub: keys.hexPub,
                [storageKeys.HEX_PRIV_KEY]: keys.hexPriv,
                nsec: keys.nsec,
                npub: keys.npub
            });

            const window = await browser.windows.getCurrent();
            const windowId = window.id;

            if (windowId) {
                tryMatchRestoredSession(windowId);
            }
            return;
        }

        case actions.SET_PROFILE: {
            const keys = await createAccount(appRelays);

            browser.storage.local.set({
                [storageKeys.ENABLE_NOSTR_SIGNER]: true,
                hexPub: keys.hexPub,
                [storageKeys.HEX_PRIV_KEY]: keys.hexPriv,
                nsec: keys.nsec,
                npub: keys.npub
            });

            await setProfile(
                Object.keys(appRelays),
                keys.hexPriv,
                request.payload.data
            );
            return;
        }

        case actions.UPDATE_PROFILE: {
            const hexPrivKey = await getAndEnsureLocalAsync<string>(storageKeys.HEX_PRIV_KEY);

            await setProfile(
                Object.keys(appRelays),
                hexPrivKey,
                request.payload.data
            );

            return;
        }

        case actions.GET_KEYS: {
            const keys: {
                npub: string,
                nsec: string
            } = await browser.storage.local.get(["npub", "nsec"]) as {
                npub: string;
                nsec: string;
            };

            return {
                npub: keys.npub,
                nsec: keys.nsec
            };
        }

        case actions.GET_PUBLIC_KEY: {
            const hexPrivKey = await getLocalAsync<string>(storageKeys.HEX_PRIV_KEY);

            return {
                data: hexPrivKey ? nip07GetHexPublicKey(hexPrivKey) : null
            }
        }

        case actions.SIGN_EVENT: {
            const hexPrivKey = await getLocalAsync<string>(storageKeys.HEX_PRIV_KEY);

            return {
                data: hexPrivKey ? nip07SignEvent(hexPrivKey, request.payload.event) : null
            }
        }

        case actions.GET_RELAYS: {
            const hexPrivKey = await getLocalAsync<string>(storageKeys.HEX_PRIV_KEY);
            return {
                data: hexPrivKey ? nip07GetUserRelays(Object.keys(appRelays), hexPrivKey) : null
            }
        }

        case actions.DECRYPT: {
            const hexPrivKey = await getAndEnsureLocalAsync<string>(storageKeys.HEX_PRIV_KEY);
            return {
                data: await nip07Decrypt(hexPrivKey, request.payload.pubKey, request.payload.cipherText)
            }
        }

        case actions.ENCRYPT: {
            const hexPrivKey = await getAndEnsureLocalAsync<string>(storageKeys.HEX_PRIV_KEY);
            return {
                data: await nip07Encrypt(hexPrivKey, request.payload.pubKey, request.payload.plainText)
            }
        }

        case actions.CHECK_USER_SESSION: {
            const hexPrivKey = await getLocalAsync<string>(storageKeys.HEX_PRIV_KEY);
            return {
                hasSession: !!hexPrivKey
            }
        }

        case actions.SIGN_OUT_SESSION: {
            signOut(Object.keys(appRelays));
            await browser.storage.local.clear();
            return;
        }

        case actions.LOAD_OBLISK_PROFILE: {
            const profile = await loadObliskProfile(
                Object.keys(appRelays),
                obliskHexPub);

            return {
                name: profile?.name || "",
                lud16: profile?.lud16 || null,
                profile: profile?.picture || `https://robohash.org/${obliskNpub}`,
            }
        }

        case actions.LOAD_HOME_PROFILE: {
            const hexPrivKey = await getAndEnsureLocalAsync<string>(storageKeys.HEX_PRIV_KEY);
            const npubResult = await browser.storage.local.get("npub");

            const profile = await loadProfile(
                Object.keys(appRelays),
                hexPrivKey);

            const session = await getActiveSessionAsync(request.payload.windowId);

            if (!session) {
                const window = await browser.windows.getCurrent();
                const windowId = window.id;
                if (windowId) {
                    tryMatchRestoredSession(windowId);
                }
            }

            return {
                session: !session ? "<Unsaved session>" : `@${session.sessionName}`,
                name: profile?.name || "",
                displayName: profile?.display_name || npubResult.npub,
                banner: profile?.banner || defaultBanner,
                profile: profile?.picture || `https://robohash.org/${npubResult.npub}`,
            }
        }

        case actions.LOAD_PROFILE_DATA: {
            const hexPrivKey = await getAndEnsureLocalAsync<string>(storageKeys.HEX_PRIV_KEY);

            const profile = await loadProfile(
                Object.keys(appRelays),
                hexPrivKey);

            return {
                profile: profile
            }
        }

        case actions.RESTORE_SESSION: {
            const hexPrivKey = await getAndEnsureLocalAsync<string>(storageKeys.HEX_PRIV_KEY);

            const session = await getSession(
                Object.keys(appRelays),
                hexPrivKey,
                request.payload.sessionId);

            if (session == null) {
                console.error("Requested session to restore not found.", request.action, request.payload.sessionId);
                throw new Error("Session not found.");
            }

            const sortedTabs = [...session.tabs].sort((a, b) => a.index - b.index);
            let newWindow: browser.Windows.Window | undefined;
            sessionRestoring = true;

            for (const tab of sortedTabs) {
                if (tab.index === 0) {
                    newWindow = await browser.windows.create({ url: tab.url || 'aboutdeleteSessionHandlerok:blank', state: 'maximized' });
                } else {
                    const newTab = await browser.tabs.create({
                        windowId: newWindow!.id,
                        url: tab.url,
                        active: false,
                        pinned: tab.pinned,
                        index: tab.index
                    });

                    if (tab.active) {
                        await browser.tabs.update(newTab.id, { active: true });
                    }
                }
            }

            await setActiveSessionAsync(
                newWindow?.id!,
                session.id,
                session.name);

            setBadge(session.name, false);

            sessionRestoring = false;

            return {
                sessionId: session.id,
                sessionName: session.name
            }
        }

        case actions.SAVE_UNTRACKED_SESSION: {
            const window: browser.Windows.Window = request.payload.window;

            const activeSession = await getActiveSessionAsync(request.payload.window.id);

            if (activeSession) {
                return;
            }

            const hexPrivKey = await getAndEnsureLocalAsync<string>(storageKeys.HEX_PRIV_KEY);

            const session: Session = {
                updatedOn: new Date(),
                id: new Date().getTime().toString(),
                name: Date.now().toString(36),
                tabs: window.tabs!.map(tab => {
                    return {
                        active: tab.active,
                        incognito: tab.incognito,
                        index: tab.index,
                        isInReaderMode: tab.isInReaderMode,
                        pinned: tab.pinned,
                        id: tab.id,
                        url: tab.url
                    }
                })
            }

            await createSession(
                Object.keys(appRelays),
                hexPrivKey,
                session);

            await setActiveSessionAsync(
                window.id!,
                session.id,
                session.name);

            return;
        }

        case actions.SAVE_NEW_SESSION: {
            const hexPrivKey = await getAndEnsureLocalAsync<string>(storageKeys.HEX_PRIV_KEY);

            const window: browser.Windows.Window = request.payload.window;

            const session: Session = {
                updatedOn: new Date(),
                id: new Date().getTime().toString(),
                name: request.payload.sessionName,
                tabs: window.tabs!.map(tab => {
                    return {
                        active: tab.active,
                        incognito: tab.incognito,
                        index: tab.index,
                        isInReaderMode: tab.isInReaderMode,
                        pinned: tab.pinned,
                        id: tab.id,
                        url: tab.url
                    }
                })
            }

            const sessionsList = await createSession(
                Object.keys(appRelays),
                hexPrivKey,
                session);

            await setActiveSessionAsync(
                window.id!,
                session.id,
                session.name);

            return {
                sessionsList: sessionsList
            }
        }

        case actions.LOAD_SESSIONS: {
            const hexPrivKey = await getAndEnsureLocalAsync<string>(storageKeys.HEX_PRIV_KEY);

            const sessionsList = await getSessionsList(
                Object.keys(appRelays),
                hexPrivKey!);

            return {
                sessionsList: sessionsList
            }
        }

        case actions.DELETE_SESSION: {
            const hexPrivKey = await getAndEnsureLocalAsync<string>(storageKeys.HEX_PRIV_KEY);

            const sessionsList = await deleteSession(
                Object.keys(appRelays),
                hexPrivKey,
                request.payload.sessionId);

            await deleteActiveSessionAsync(request.payload.sessionId);

            return {
                sessionsList: sessionsList
            }
        }
        default:
            return { success: false, message: 'Unrecognized action', data: null };
    }
});

async function setActiveSessionAsync(
    windowId: number,
    sessionId: string,
    sessionName: string): Promise<void> {
    // Destructure the result to directly get activeSessions
    const { [storageKeys.ACTIVE_SESSIONS]: activeSessions = {} } = await browser.storage.local.get(storageKeys.ACTIVE_SESSIONS);

    // Update the activeSessions object
    activeSessions[windowId] = { sessionId, sessionName };

    // Save the updated activeSessions back to local storage
    await browser.storage.local.set({ [storageKeys.ACTIVE_SESSIONS]: activeSessions });

    await browser.storage.local.set({
        [storageKeys.LAST_TRACKED_SESSION_ID]: sessionId
    });
}


async function getActiveSessionAsync(windowId: number): Promise<{ sessionId: string; sessionName: string } | null> {
    const { [storageKeys.ACTIVE_SESSIONS]: activeSessions = {} } = await browser.storage.local.get(storageKeys.ACTIVE_SESSIONS);

    return activeSessions[windowId] || null;
}


async function deleteActiveSessionAsync(sessionId: string): Promise<void> {
    const activeSessionsData = await browser.storage.local.get(storageKeys.ACTIVE_SESSIONS);
    const activeSessions: { [windowId: number]: { sessionId: string; sessionName: string } } = activeSessionsData.activeSessions || {};
    Object.keys(activeSessions).forEach(windowId => {
        const nWindowId = Number(windowId);
        if (activeSessions[nWindowId].sessionId === sessionId) {
            delete activeSessions[nWindowId];
        }
    });

    await browser.storage.local.set({
        [storageKeys.ACTIVE_SESSIONS]: activeSessions
    });
}

async function updateSessionAsync(windowId: number): Promise<void> {
    const savedSession = await getActiveSessionAsync(windowId);

    if (!savedSession) {
        return;
    }

    var tabs = await browser.tabs.query({ windowId: windowId });

    if (tabs.length === 0) {
        return;
    }

    const hexPrivKey = await getAndEnsureLocalAsync<string>(storageKeys.HEX_PRIV_KEY);

    const session = await getSession(
        Object.keys(appRelays),
        hexPrivKey,
        savedSession.sessionId);

    if (!session) {
        throw new Error("No session found");
    }

    await browser.storage.local.set({
        [storageKeys.LAST_TRACKED_SESSION_ID]: savedSession!.sessionId
    });

    const tabList: Tab[] = [];

    for (let tab of tabs) {
        tabList.push({
            active: tab.active,
            incognito: tab.incognito,
            index: tab.index,
            isInReaderMode: tab.isInReaderMode,
            pinned: tab.pinned,
            id: tab.id,
            url: tab.url
        });
    }

    const updatedSession: Session = {
        updatedOn: new Date(),
        id: session.id,
        name: session.name,
        tabs: tabList
    }

    try {
        await updateSession(
            Object.keys(appRelays),
            hexPrivKey,
            updatedSession);
    } catch (e) {
        console.log("Error updating session. Please check the app.")
        setErrorBadge();
    }
}

async function tryMatchRestoredSession(windowId: number): Promise<void> {
    const tabs = await browser.tabs.query({ windowId });
    const urls = tabs.map(tab => tab.url).join('|');
    const urlHash = CryptoJS.SHA256(urls).toString();

    const hexPrivKey = await getAndEnsureLocalAsync<string>(storageKeys.HEX_PRIV_KEY);

    const sessionsList = await getSessionsList(
        Object.keys(appRelays),
        hexPrivKey
    );

    const matchingSession = sessionsList.find(x => x.hash == urlHash);

    if (matchingSession) {
        await setActiveSessionAsync(windowId, matchingSession.sessionId, matchingSession.name);
    }
}

async function restoreLastSessionAsync(windowId: number) {
    const lastTrackedSessionId = await getLocalAsync<string>(storageKeys.LAST_TRACKED_SESSION_ID);
    if (!lastTrackedSessionId) {
        return;
    }

    const hexPrivKey = await getAndEnsureLocalAsync<string>(storageKeys.HEX_PRIV_KEY);

    const session = await getSession(
        Object.keys(appRelays),
        hexPrivKey,
        lastTrackedSessionId);

    await browser.storage.local.remove(storageKeys.LAST_TRACKED_SESSION_ID);

    if (!!session && session.tabs) {
        await setActiveSessionAsync(windowId, session.id, session.name);
        await restoreTabsAsync(windowId, session.tabs);
    }
}

async function restoreTabsAsync(windowId: number, tabs: Tab[]) {
    // Restore all the tabs from the session
    for (let tabInfo of tabs) {
        await browser.tabs.create({
            windowId: windowId,
            url: tabInfo.url,
            active: false // To open all tabs in the background
        });
    }

    // Activate the first tab of the restored session
    if (tabs.length > 0) {
        await browser.tabs.update(tabs[0].id, { active: true });
    }
}

function setErrorBadge(): void {
    browser.action.setBadgeText({ text: '<!>' });
    browser.action.setBadgeBackgroundColor({ color: "#FF0000" });
}

function setBadge(sessionName: string | null, pendingChanges: boolean): void {
    if (!!sessionName) {
        const c = getColorFromId(sessionName);
        if (pendingChanges) {
            browser.action.setBadgeBackgroundColor({ color: "#555" });
            browser.action.setBadgeText({ text: ' ' });
        } else {
            browser.action.setBadgeText({ text: ' ' });
            browser.action.setBadgeBackgroundColor({ color: c });
        }

    } else {
        browser.action.setBadgeText({ text: '<->' });
        browser.action.setBadgeBackgroundColor({ color: "#555" });
    }
}

function getColorFromId(id: string) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
        hash = hash & hash; // Convert to 32bit integer
    }

    // Adjusted hash manipulation for a broader color spectrum
    const hue = Math.abs(hash % 360); // Hue: Full spectrum (0 to 359)
    const saturation = 60 + Math.abs((hash % 40)); // Saturation: 60% to 100%
    let lightness = 40 + Math.abs((hash % 50)); // Lightness: 40% to 90%

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}



async function getAndEnsureLocalAsync<T>(key: string): Promise<T> {
    const result = await browser.storage.local.get(key);

    if (!result) {
        throw new Error(`Key "${key}" was expected but not found in local storage.`);
    }

    return result[key];
}

async function getLocalAsync<T>(key: string): Promise<T | null> {
    const result = await browser.storage.local.get(key);

    return result[key] ?? null;
}



