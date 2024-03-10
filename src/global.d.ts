interface NostrEvent {
    created_at: number;
    kind: number; tags: string[][];
    content: string
}

interface SignEventRequest extends NostrEvent {

}

interface SignEventResponse extends NostrEvent {
    id: string,
    pubkey: string,
    sig: string
}

interface GetRelaysResponse {
    [url: string]: { read: boolean, write: boolean }
}

interface DecryptRequest {
    pubkey: string,
    cipherText: string
}

// Extend the global Window interface
interface Window {
    nostr?: {
        getPublicKey: () => Promise<string>;
        getRelays: () => Promise<GetRelaysResponse>;
        signEvent: (event: SignEventRequest) => Promise<SignEventResponse>;
        nip04: {
            decrypt(pubkey: string, ciphertext: string): Promise<string>
        }
    };
}