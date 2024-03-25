export const nip07Actions = {
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

export interface EventPayload {
    uid: number;
    nostrEvent: any
}

export interface GetPublicKeyRequest extends EventPayload {
}

export interface GetPublicKeyResponse extends EventPayload {
}

export interface SignEventRequest extends EventPayload {
}

export interface SignEventResponse extends EventPayload {
}

export interface GetRelaysRequest extends EventPayload {
}

export interface GetRelaysResponse extends EventPayload {
}

export interface DecryptRequest extends EventPayload {
}

export interface DecryptResponse extends EventPayload {
}

window.nostr = {
    async getPublicKey() {

        var response = await createRequestHandler<GetPublicKeyRequest, GetPublicKeyResponse>(
            nip07Actions.GET_PUBLIC_KEY,
            nip07Actions.GET_PUBLIC_KEY_RESPONSE)({
                nostrEvent: null,
                uid: Date.now()
            });

        return response.nostrEvent;
    },
    async signEvent(event: NostrSignEventRequest) {

        var response = await createRequestHandler<SignEventRequest, SignEventResponse>(
            nip07Actions.SIGN_EVENT,
            nip07Actions.SIGN_EVENT_RESPONSE)({
                nostrEvent: event,
                uid: Date.now()
            });

        return response.nostrEvent;
    },
    async getRelays() {

        var response = await createRequestHandler<GetRelaysRequest, GetRelaysResponse>(
            nip07Actions.GET_RELAYS,
            nip07Actions.GET_RELAYS_RESPONSE)({
                nostrEvent: null,
                uid: Date.now()
            });

        return response.nostrEvent;
    },
    nip04: {
        async decrypt(pubkey, ciphertext) {

            var response = await createRequestHandler<DecryptRequest, DecryptResponse>(
                nip07Actions.DECRYPT,
                nip07Actions.DECRYPT_RESPONSE)({
                    nostrEvent: {
                        pubkey: pubkey, cipherText: ciphertext
                    },
                    uid: Date.now()
                });
            return response.nostrEvent;
        }
    }
};

function createRequestHandler<TRequest extends EventPayload, TResponse extends EventPayload>(
    requestEventName: string,
    responseEventName: string): (detail: TRequest) => Promise<TResponse> {
    return (detail: TRequest) => {
        return new Promise<TResponse>((resolve, reject) => {
            const uid = detail.uid;
            const handler = (event: Event) => {
                const customEvent = event as CustomEvent<TResponse>;
                if (customEvent.detail.uid === uid) {
                    document.removeEventListener(responseEventName, handler);
                    resolve(customEvent.detail);
                }
            };
            document.addEventListener(responseEventName, handler);
            document.dispatchEvent(new CustomEvent(requestEventName, { detail }));
        });
    };
}
