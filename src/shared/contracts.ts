export const actions = {
    IMPORT_ACCOUNT: 'import-account',
    SAVE_SETTINGS: 'save-settings',
    LOAD_SETTINGS: 'load-settings',
    SET_PROFILE: 'set-profile',
    UPDATE_PROFILE: 'update-profile',
    GET_KEYS: 'get-keys',
    GET_PUBLIC_KEY: 'get-public-key',
    SIGN_EVENT: 'sign-event',
    GET_RELAYS: 'get-relays',
    DECRYPT: 'decrypt',
    LOAD_HOME_PROFILE: 'load-home-profile',
    LOAD_OBLISK_PROFILE:'load-oblisk-profile',
    LOAD_PROFILE_DATA: 'load-profile-data',
    CHECK_USER_SESSION: 'check-user-session',
    GET_NOSTR_SIGN_SETTING:'get-nostr-sign-setting',
    SIGN_OUT_SESSION: 'sign-out-session',
    SAVE_NEW_SESSION: 'save-new-session',
    SAVE_UNTRACKED_SESSION: 'save-untracked-session',
    RESTORE_SESSION: 'restore-session',
    LOAD_SESSIONS: 'load-sessions',
    DELETE_SESSION: 'delete-session'
};

export interface SessionListViewItem {
    sessionEventId: string,
    sessionId: string,
    name: string;
    totalTabs: number;
    hash: string;
}

export interface Session {
    id: string
    name: string;
    tabs: Tab[]
    updatedOn: Date
}

export interface Tab {
    id?: number;
    index: number;
    active: boolean;
    pinned: boolean;
    url?: string;
    incognito: boolean;
    isInReaderMode?: boolean;
}