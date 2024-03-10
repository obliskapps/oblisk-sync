export const nip07 = {
    GET_PUBLIC_KEY: 'get-public-key',
    GET_PUBLIC_KEY_RESPONSE: 'get-public-key-response',
    SIGN_EVENT: 'sign-event',
    SIGN_EVENT_RESPONSE: 'sign-event-response',
    GET_RELAYS: 'get-relays',
    GET_RELAYS_RESPONSE: 'get-relays-response',
    DECRYPT: 'decrypt',
    DECRYPT_RESPONSE: 'decrypt-response',
    SET_NIP07: 'set-nip07'
}

const requestGetPublicKey = createRequestHandler<void, string>(
    nip07.GET_PUBLIC_KEY,
    nip07.GET_PUBLIC_KEY_RESPONSE);

const requestSignEvent = createRequestHandler<SignEventRequest, SignEventResponse>(
    nip07.SIGN_EVENT,
    nip07.SIGN_EVENT_RESPONSE);

const requestGetRelays = createRequestHandler<void, GetRelaysResponse>(
    nip07.GET_RELAYS,
    nip07.GET_RELAYS_RESPONSE);

const requestDecrypt = createRequestHandler<DecryptRequest, string>(
    nip07.DECRYPT,
    nip07.DECRYPT_RESPONSE);


function createRequestHandler<T, R>(requestEventName: string, responseEventName: string): (detail: T) => Promise<R> {
    return (detail: T) => {
        return new Promise<R>((resolve, reject) => {
            const handler = (event: Event) => {
                const customEvent = event as CustomEvent<R>;
                document.removeEventListener(responseEventName, handler);
                resolve(customEvent.detail);
            };

            document.addEventListener(responseEventName, handler);
            document.dispatchEvent(new CustomEvent(requestEventName, { detail }));
        });
    };
}

window.nostr = {
    async getPublicKey() {
        return await requestGetPublicKey();
    },
    async signEvent(event: SignEventRequest) {
        return await requestSignEvent(event);
    },
    async getRelays() {
        return await requestGetRelays();
    },
    nip04: {
        async decrypt(pubkey, ciphertext) {
            return await requestDecrypt({ pubkey: pubkey, cipherText: ciphertext });
        }
    }
};
