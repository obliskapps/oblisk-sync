import browser from 'webextension-polyfill';
import { actions } from '../shared/contracts';
import { DecryptRequest, DecryptResponse, EncryptRequest, EncryptResponse, GetPublicKeyRequest, GetPublicKeyResponse, GetRelaysRequest, GetRelaysResponse, SignEventRequest, SignEventResponse, nip07Actions } from './nip07';


(async function () {
    const response = await browser.runtime.sendMessage({ action: actions.GET_NOSTR_SIGN_SETTING });
    if (response.data) {
        const script = document.createElement('script');
        script.setAttribute('type', 'text/javascript');
        script.src = browser.runtime.getURL('nip07/nip07.bundle.js');
        script.async = false;
        script.id = "oblisk-sync-nip07";
        (document.head || document.documentElement).appendChild(script);
    }
})();

document.addEventListener(nip07Actions.GET_PUBLIC_KEY, async function (event) {
    const customEvent = event as CustomEvent<GetPublicKeyRequest>;
    const eventDetails = customEvent.detail;

    const response = await browser.runtime.sendMessage({ action: actions.GET_PUBLIC_KEY });

    document.dispatchEvent(
        new CustomEvent<GetPublicKeyResponse>(nip07Actions.GET_PUBLIC_KEY_RESPONSE, {
            detail: {
                nostrEvent: response.data,
                uid: eventDetails.uid
            }
        }));
});

document.addEventListener(nip07Actions.SIGN_EVENT, async function (event) {
    const customEvent = event as CustomEvent<SignEventRequest>;

    const eventDetails = customEvent.detail;

    const response = await browser.runtime.sendMessage({
        action: actions.SIGN_EVENT, payload: {
            event: eventDetails.nostrEvent
        }
    });

    document.dispatchEvent(
        new CustomEvent<SignEventResponse>(nip07Actions.SIGN_EVENT_RESPONSE, {
            detail: {
                nostrEvent: response.data,
                uid: eventDetails.uid
            }
        }));
});

document.addEventListener(nip07Actions.GET_RELAYS, async function (event) {
    const customEvent = event as CustomEvent<GetRelaysRequest>;
    const eventDetails = customEvent.detail;

    const response = await browser.runtime.sendMessage({ action: actions.GET_RELAYS });

    document.dispatchEvent(
        new CustomEvent<GetRelaysResponse>(nip07Actions.GET_RELAYS_RESPONSE, {
            detail: {
                nostrEvent: response.data,
                uid: eventDetails.uid
            }
        }));
});

document.addEventListener(nip07Actions.DECRYPT, async function (event) {
    const customEvent = event as CustomEvent<DecryptRequest>;
    const eventDetails = customEvent.detail;

    const response = await browser.runtime.sendMessage({
        action: actions.DECRYPT, payload: {
            pubKey: customEvent.detail.nostrEvent.pubkey,
            cipherText: customEvent.detail.nostrEvent.cipherText
        }
    });

    document.dispatchEvent(
        new CustomEvent<DecryptResponse>(nip07Actions.DECRYPT_RESPONSE, {
            detail: {
                nostrEvent: response.data,
                uid: eventDetails.uid
            }
        }));
});

document.addEventListener(nip07Actions.ENCRYPT, async function (event) {
    const customEvent = event as CustomEvent<EncryptRequest>;
    const eventDetails = customEvent.detail;

    const response = await browser.runtime.sendMessage({
        action: actions.ENCRYPT, payload: {
            pubKey: customEvent.detail.nostrEvent.pubKey,
            plainText: customEvent.detail.nostrEvent.plainText
        }
    });

    document.dispatchEvent(
        new CustomEvent<EncryptResponse>(nip07Actions.ENCRYPT_RESPONSE, {
            detail: {
                nostrEvent: response.data,
                uid: eventDetails.uid
            }
        }));
});