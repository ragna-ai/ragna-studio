import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { cose, isoBase64URL, isoCBOR } from '@simplewebauthn/server/helpers';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';

const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;
const FLAG_ATTESTED_CREDENTIAL = 0x40;
const ES256_CURVE = 'P-256';
const NO_AAGUID = Buffer.alloc(16);

export interface SoftwareAuthenticatorOptions {
  origin: string;
  rpID: string;
}

/** The part of the server's creation options the authenticator answers to. */
export interface CreationOptions {
  challenge: string;
  user: { id: string };
}

/** The part of the server's request options the authenticator answers to. */
export interface RequestOptions {
  challenge: string;
}

/** A passkey authenticator in plain code, so tests can run the full ceremony without a browser. */
export interface SoftwareAuthenticator {
  credentialID: string;
  register: (options: CreationOptions) => RegistrationResponseJSON;
  authenticate: (options: RequestOptions) => AuthenticationResponseJSON;
}

function toBase64URL(bytes: Buffer): string {
  return isoBase64URL.fromBuffer(new Uint8Array(bytes));
}

function sha256(data: Buffer | string): Buffer {
  return createHash('sha256').update(data).digest();
}

function counterBytes(counter: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(counter);
  return bytes;
}

class EcdsaSoftwareAuthenticator implements SoftwareAuthenticator {
  readonly credentialID = toBase64URL(randomBytes(32));
  private readonly keyPair = generateKeyPairSync('ec', { namedCurve: ES256_CURVE });
  private counter = 0;
  private userHandle: string | undefined;

  constructor(private readonly options: SoftwareAuthenticatorOptions) {}

  register(creationOptions: CreationOptions): RegistrationResponseJSON {
    this.userHandle = creationOptions.user.id;
    const clientDataJSON = this.clientData('webauthn.create', creationOptions.challenge);
    const attestationObject = isoCBOR.encode(
      new Map<string, string | Uint8Array | Map<string, string>>([
        ['fmt', 'none'],
        ['attStmt', new Map<string, string>()],
        ['authData', new Uint8Array(this.registrationAuthData())],
      ]),
    );

    return {
      id: this.credentialID,
      rawId: this.credentialID,
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: {},
      response: {
        clientDataJSON: toBase64URL(clientDataJSON),
        attestationObject: toBase64URL(Buffer.from(attestationObject)),
        transports: ['internal'],
      },
    };
  }

  authenticate(requestOptions: RequestOptions): AuthenticationResponseJSON {
    this.counter += 1;
    const clientDataJSON = this.clientData('webauthn.get', requestOptions.challenge);
    const authenticatorData = Buffer.concat([
      sha256(this.options.rpID),
      Buffer.from([FLAG_USER_PRESENT | FLAG_USER_VERIFIED]),
      counterBytes(this.counter),
    ]);
    const signature = sign('sha256', Buffer.concat([authenticatorData, sha256(clientDataJSON)]), {
      key: this.keyPair.privateKey,
      dsaEncoding: 'der',
    });

    return {
      id: this.credentialID,
      rawId: this.credentialID,
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: {},
      response: {
        clientDataJSON: toBase64URL(clientDataJSON),
        authenticatorData: toBase64URL(authenticatorData),
        signature: toBase64URL(signature),
        userHandle: this.userHandle,
      },
    };
  }

  private clientData(type: 'webauthn.create' | 'webauthn.get', challenge: string): Buffer {
    return Buffer.from(
      JSON.stringify({ type, challenge, origin: this.options.origin, crossOrigin: false }),
    );
  }

  private registrationAuthData(): Buffer {
    const credentialID = isoBase64URL.toBuffer(this.credentialID);
    const credentialIDLength = Buffer.alloc(2);
    credentialIDLength.writeUInt16BE(credentialID.length);

    return Buffer.concat([
      sha256(this.options.rpID),
      Buffer.from([FLAG_USER_PRESENT | FLAG_USER_VERIFIED | FLAG_ATTESTED_CREDENTIAL]),
      counterBytes(this.counter),
      NO_AAGUID,
      credentialIDLength,
      credentialID,
      this.publicKeyCose(),
    ]);
  }

  private publicKeyCose(): Buffer {
    const { x, y } = this.keyPair.publicKey.export({ format: 'jwk' });
    if (!x || !y) throw new Error('The software authenticator key has no coordinates.');
    return Buffer.from(
      isoCBOR.encode(
        new Map<number, number | Uint8Array>([
          [cose.COSEKEYS.kty, cose.COSEKTY.EC2],
          [cose.COSEKEYS.alg, cose.COSEALG.ES256],
          [cose.COSEKEYS.crv, cose.COSECRV.P256],
          [cose.COSEKEYS.x, isoBase64URL.toBuffer(x)],
          [cose.COSEKEYS.y, isoBase64URL.toBuffer(y)],
        ]),
      ),
    );
  }
}

export function createSoftwareAuthenticator(
  options: SoftwareAuthenticatorOptions,
): SoftwareAuthenticator {
  return new EcdsaSoftwareAuthenticator(options);
}
