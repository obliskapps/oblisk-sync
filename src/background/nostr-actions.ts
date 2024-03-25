import {
  Event,
  SimplePool,
  VerifiedEvent,
  finishEvent,
  generatePrivateKey,
  getPublicKey,
  nip04,
  nip19,
} from 'nostr-tools';

import { Session, SessionListViewItem } from '../shared/contracts';
import CryptoJS from 'crypto-js';

const projectName = "oblisk-sync";
const sessionReferenceListTag = `${projectName}/root`;
let _pool = new SimplePool();
let _userRelays: string[] = [];

export function signOut(
  appRelays: string[]): void {
  _pool.close(appRelays);
  _userRelays = [];
}


export function importAccount(nsec: string): {
  hexPub: string;
  hexPriv: string;
  nsec: string;
  npub: string;
} {
  const hexPriv = nip19.decode(nsec).data.toString();
  const hexPub = getPublicKey(hexPriv);
  const npub = nip19.npubEncode(hexPub);
  return {
    hexPriv: hexPriv,
    npub: npub,
    hexPub: hexPub,
    nsec: nsec
  }
}


export async function createAccount(
  appRelays: {
    [url: string]: { read: boolean, write: boolean }
  }): Promise<{
    hexPub: string;
    hexPriv: string;
    nsec: string;
    npub: string;
  }> {

  const hexPriv = generatePrivateKey();
  const hexPub = getPublicKey(hexPriv);

  const userDefaultRelays = {
    'wss://n.ok0.org': { read: true, write: true },
    'wss://relay.primal.net': { read: true, write: true },
    'wss://nostr.cheeserobot.org': { read: true, write: true },
    'wss://nostr.cercatrova.me': { read: true, write: true },
    'wss://nostr.swiss-enigma.ch': { read: true, write: true },
    'wss://relay.nostr.band': { read: true, write: true },
  }

  //kind 3 relays
  const profileEvent = finishEvent({
    content: JSON.stringify(userDefaultRelays),
    created_at: Math.floor(Date.now() / 1000),
    kind: 3,
    tags: []
  }, hexPriv);

  _pool.publish(Object.keys(appRelays), profileEvent);

  //broadcast user relays.nip65
  const nip65 = finishEvent({
    content: "",
    created_at: Math.floor(Date.now() / 1000),
    kind: 10002,
    tags: Object.entries(userDefaultRelays)
      .map(([key]) => ["r", key])
  }, hexPriv);

  _pool.publish(Object.keys(appRelays), nip65);

  return {
    hexPub: hexPub,
    hexPriv: hexPriv,
    npub: nip19.npubEncode(profileEvent.pubkey),
    nsec: nip19.nsecEncode(hexPriv)
  }
}

export async function loadObliskProfile(
  relays: string[],
  pubKey: string): Promise<{
    name: string | null,
    display_name: string | null,
    nip05: string | null,
    banner: string | null,
    picture: string | null,
    lud16: string | null,
    about: string | null
  } | null> {

  const userRelays = await _getUserWriteRelays(relays, pubKey);

  const metadata = await _pool.get(
    userRelays,
    {
      kinds: [0],
      authors: [pubKey]
    });

  return metadata == null ? null : JSON.parse(metadata.content);
}

export async function loadProfile(
  relays: string[],
  privkey: string): Promise<{
    name: string | null,
    display_name: string | null,
    nip05: string | null,
    banner: string | null,
    picture: string | null,
    lud16: string | null,
    about: string | null
  } | null> {

  _userRelays = [];
  const pubkey = getPublicKey(privkey);

  const userRelays = await _getUserWriteRelays(relays, pubkey);

  const metadata = await _pool.get(
    userRelays,
    {
      kinds: [0],
      authors: [pubkey]
    });

  return metadata == null ? null : JSON.parse(metadata.content);
}

export async function setProfile(
  relays: string[],
  privkey: string,
  profile: {
    _name: string | null,
    _displayName: string | null,
    _nip05: string | null,
    _banner: string | null,
    _picture: string | null
    _lnAddress: string | null,
    _about: string | null
  }): Promise<void> {
  await _updateProfile(relays, privkey, profile);
}


export async function deleteSession(
  appRelays: string[],
  privkey: string,
  sessionId: string): Promise<SessionListViewItem[]> {

  const pubkey = getPublicKey(privkey);

  const allRelays = await _getUserWriteRelays(appRelays, pubkey);

  //remove the session from the reference list
  const sessionsIndex = await _getSessionsReferenceList(allRelays, privkey);

  //put the content blank
  const event = finishEvent(
    {
      kind: 30078,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["d", _getSessionTag(sessionId)]],
      content: "",
    }, privkey);

  _pool.publish(allRelays, event);

  var updateSessionsIndex = sessionsIndex.filter(x => x.sessionId != sessionId);

  const updatedSessionIndex = await _updateSessionsReferenceList(
    _pool,
    allRelays,
    privkey,
    updateSessionsIndex);

  return updatedSessionIndex;
}


export async function updateSession(
  appRelays: string[],
  privkey: string,
  session: Session): Promise<void> {

  const pubkey = getPublicKey(privkey);

  const allRelays = await _getUserWriteRelays(appRelays, pubkey);

  var sessionEvent = await _saveSession(_pool, allRelays, privkey, session)

  let sessionsList = await _getSessionsReferenceList(allRelays, privkey);

  //if we are updating a session and dont have any session something is wrong
  if (sessionsList.length == 0) {
    throw new Error("Error updating session.")
  }

  sessionsList = sessionsList.filter(x => x.sessionId != session.id);

  const urls = session.tabs.map(tab => tab.url).join('|');

  sessionsList.push({
    name: session.name,
    sessionEventId: sessionEvent.id,
    totalTabs: session.tabs.length,
    sessionId: session.id,
    hash: CryptoJS.SHA256(urls).toString()
  });

  await _updateSessionsReferenceList(_pool, allRelays, privkey, sessionsList);
}


export async function getSession(
  appRelays: string[],
  privkey: string,
  sessionId: string): Promise<Session | null> {

  const pubkey = getPublicKey(privkey);

  const allRelays = await _getUserWriteRelays(appRelays, pubkey);

  let session = await _pool.get(
    [...allRelays],
    {
      kinds: [30078],
      authors: [pubkey],
      "#d": [_getSessionTag(sessionId)]
    });

  let decryptedSession: Session | null = null;
  if (!!session?.content) {
    const decriptedContent = await nip04.decrypt(privkey, pubkey, session.content);
    decryptedSession = JSON.parse(decriptedContent);
  }

  return decryptedSession;
}

export async function getSessionsList(
  appRelays: string[],
  privkey: string,
): Promise<SessionListViewItem[]> {
  const pubkey = getPublicKey(privkey);
  const allRelays = await _getUserWriteRelays(appRelays, pubkey);
  return await _getSessionsReferenceList(allRelays, privkey);
}

export async function createSession(
  appRelays: string[],
  privkey: string,
  session: Session): Promise<SessionListViewItem[]> {

  const pubkey = getPublicKey(privkey);

  const allRelays = await _getUserWriteRelays(appRelays, pubkey);

  const savedSessionEvent = await _saveSession(_pool, allRelays, privkey, session);

  let sessionsList = await _getSessionsReferenceList(allRelays, privkey);

  const urls = session.tabs.map(tab => tab.url).join('|');

  sessionsList.push({
    sessionEventId: savedSessionEvent.id,
    sessionId: session.id,
    name: session.name,
    totalTabs: session.tabs.length,
    hash: CryptoJS.SHA256(urls).toString()
  });

  const updatedSessionIndex = await _updateSessionsReferenceList(_pool, allRelays, privkey, sessionsList);

  return updatedSessionIndex;
}


//#region NIP05
export function nip07GetHexPublicKey(hexPriv: string): string {
  return getPublicKey(hexPriv);
}

export function nip07SignEvent(
  hexPriv: string,
  event: Event): VerifiedEvent {
  return finishEvent(event, hexPriv);
}

export async function nip07GetUserRelays(appRelays: string[], privkey: string): Promise<{
  [url: string]: { read: boolean, write: boolean }
}> {

  const pubKey = getPublicKey(privkey);

  const gossipRelays = await _pool.get(
    appRelays,
    {
      kinds: [10002],
      authors: [pubKey]
    });


  if (gossipRelays != null) {
    const relays = gossipRelays.tags.reduce<{
      [url: string]: { read: boolean, write: boolean }
    }>((acc, tag) => {
      const url = tag[1];
      const permissions = tag[2] || "";
      const read = permissions.includes("read");
      const write = permissions.includes("write");

      acc[url] = { read, write };
      return acc;
    }, {});

    return relays;
  }

  const contacts = await _pool.get(
    appRelays,
    {
      kinds: [3],
      authors: [pubKey]
    });

  let userRelays = contacts == null ? {} : JSON.parse(contacts.content);

  return userRelays;
}

export async function nip07Decrypt(
  privkey: string,
  pubkey: string,
  cyphertext: string): Promise<string> {
  return await nip04.decrypt(privkey, pubkey, cyphertext);
}

//#endregion


//#region private
function _getSessionTag(sessionId: string): string {
  return `${projectName}/session/${sessionId}`;
}

async function _saveSession(
  pool: SimplePool,
  allRelays: string[],
  privkey: string,
  session: Session): Promise<Event> {
  const pubkey = getPublicKey(privkey);

  const encriptedSession = await nip04.encrypt(privkey, pubkey, JSON.stringify(session));

  const event = finishEvent(
    {
      kind: 30078,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["d", _getSessionTag(session.id)]],
      content: encriptedSession,
    }, privkey);

  pool.publish(allRelays, event);

  return event;
}


async function _getSessionsReferenceList(
  allRelays: string[],
  privkey: string): Promise<SessionListViewItem[]> {

  const pubkey = getPublicKey(privkey);

  const sessionsIndex = await _pool.get(
    allRelays,
    {
      kinds: [30078],
      authors: [pubkey],
      "#d": [sessionReferenceListTag]
    });

  let sessionsList: SessionListViewItem[] = [];

  if (!!sessionsIndex) {
    const decriptedContent = await nip04.decrypt(privkey, pubkey, sessionsIndex.content);
    sessionsList = JSON.parse(decriptedContent);
  }

  return sessionsList;
}

async function _updateSessionsReferenceList(
  pool: SimplePool,
  allRelays: string[],
  privkey: string,
  updatedSessionsIndex: SessionListViewItem[]): Promise<SessionListViewItem[]> {

  const pubkey = getPublicKey(privkey);

  const encriptedSessionList = await nip04.encrypt(privkey, pubkey, JSON.stringify(updatedSessionsIndex));

  const sessionIndexEvent = finishEvent({
    kind: 30078,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["d", sessionReferenceListTag]],
    content: encriptedSessionList,
  }, privkey);

  pool.publish(allRelays, sessionIndexEvent);
  return updatedSessionsIndex;
}

async function _updateProfile(
  relays: string[],
  privkey: string,
  profile: {
    _name: string | null,
    _displayName: string | null,
    _nip05: string | null,
    _banner: string | null,
    _picture: string | null
    _lnAddress: string | null,
    _about: string | null
  }): Promise<void> {

  const pubkey = getPublicKey(privkey);

  const userWriteRelays = await _getUserWriteRelays(relays, pubkey);

  const userWriteRelaysArray = Array.from(userWriteRelays);

  let metadata = await _pool.get(userWriteRelaysArray,
    {
      kinds: [0],
      authors: [pubkey]
    });

  let content = metadata == null ? {} : JSON.parse(metadata.content);

  content = {
    ...content,
    name: profile._name,
    display_name: profile._displayName,
    nip05: profile._nip05,
    banner: profile._banner,
    picture: profile._picture,
    lud16: profile._lnAddress,
    about: profile._about
  };

  const event = finishEvent({
    content: JSON.stringify(content),
    created_at: Math.floor(Date.now() / 1000),
    kind: 0,
    tags: []
  }, privkey);

  _pool.publish(userWriteRelaysArray, event);
}

async function _getUserWriteRelays(
  appRelays: string[],
  pubKey: string): Promise<string[]> {

  if (_userRelays.length > 0) {
    return _userRelays;
  }

  const gossipRelays = await _pool.get(
    appRelays,
    {
      kinds: [10002],
      authors: [pubKey]
    });

  if (gossipRelays != null) {
    const gossipWriteRelays = gossipRelays.tags.filter(x => !x[2] || x[2].includes("write")).map(x => x[1])
    _userRelays = gossipWriteRelays;
    return _userRelays;
  }

  const relays = await _pool.get(
    appRelays,
    {
      kinds: [3],
      authors: [pubKey]
    });

  const parsedRelays: Record<string, {
    read: boolean,
    write: boolean
  }> = JSON.parse(relays!.content);

  const writeRelaysUrls = Object.entries(parsedRelays).filter(x => x[1].write).map(x => x[0]);
  _userRelays = writeRelaysUrls;
  return _userRelays;
}
//#endregion