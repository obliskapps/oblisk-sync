import browser from 'webextension-polyfill';
import { actions } from '../shared/contracts';
import { nip07 } from './nip07';


(async function () {
    const response = await browser.runtime.sendMessage({ action: actions.GET_NOSTR_SIGN_SETTING });
    if (response.data) {
        const script = document.createElement('script');
        script.setAttribute('async', 'false');
        script.setAttribute('type', 'text/javascript');
        script.src = browser.runtime.getURL('dist/nip07/nip07.bundle.js');
        (document.head || document.documentElement).appendChild(script);
    }
})();


document.addEventListener(nip07.GET_PUBLIC_KEY, async function () {
    const response = await browser.runtime.sendMessage({ action: actions.GET_PUBLIC_KEY });

    document.dispatchEvent(
        new CustomEvent<string>(nip07.GET_PUBLIC_KEY_RESPONSE, {
            detail: response.data
        }));
});

document.addEventListener(nip07.SIGN_EVENT, async function (event) {
    const customEvent = event as CustomEvent<SignEventRequest>;

    // Extract the event details (payload)
    const eventDetails = customEvent.detail;

    const response = await browser.runtime.sendMessage({
        action: actions.SIGN_EVENT, payload: {
            event: eventDetails
        }
    });

    document.dispatchEvent(
        new CustomEvent<SignEventResponse>(nip07.SIGN_EVENT_RESPONSE, {
            detail: response.data
        }));
});

document.addEventListener(nip07.GET_RELAYS, async function () {

    const response = await browser.runtime.sendMessage({ action: actions.GET_RELAYS });

    document.dispatchEvent(
        new CustomEvent<GetRelaysResponse>(nip07.GET_RELAYS_RESPONSE, {
            detail: response.data
        }));
});

document.addEventListener(nip07.DECRYPT, async function (event) {

    const customEvent = event as CustomEvent<DecryptRequest>;
    const response = await browser.runtime.sendMessage({
        action: actions.DECRYPT, payload: {
            pubKey: customEvent.detail.pubkey,
            cipherText: customEvent.detail.cipherText
        }
    });

    document.dispatchEvent(
        new CustomEvent<GetRelaysResponse>(nip07.DECRYPT_RESPONSE, {
            detail: response.data
        }));
});