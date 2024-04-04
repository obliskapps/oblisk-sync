interface NostrEvent {
    created_at: number;
    kind: number; tags: string[][];
    content: string
}

interface NostrSignEventRequest extends NostrEvent {
}

interface NostrSignEventResponse extends NostrEvent {
    id: string,
    pubkey: string,
    sig: string
}

interface NostrGetRelaysResponse {
    [url: string]: { read: boolean, write: boolean }
}

interface NostrDecryptRequest {
    pubkey: string,
    cipherText: string
}

// Extend the global Window interface
interface Window {
    nostr?: {
        getPublicKey: () => Promise<string>;
        getRelays: () => Promise<NostrGetRelaysResponse>;
        signEvent: (event: NostrSignEventRequest) => Promise<NostrSignEventResponse>;
        nip04: {
            decrypt(pubkey: string, ciphertext: string): Promise<string>;
            encrypt(pubkey: string, plaintext: string): Promise<string>;
        }
    };
}