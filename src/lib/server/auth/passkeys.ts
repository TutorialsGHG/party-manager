import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse
} from '@simplewebauthn/server';
import { config } from '../config/env';
import { APP_NAME } from '$lib/config';

export function getRpId(): string {
  try {
    const url = new URL(config.baseUrl);
    return url.hostname;
  } catch {
    return 'localhost';
  }
}

export async function createPasskeyRegistrationOptions(userId: string, userEmail: string) {
  const rpId = getRpId();
  return generateRegistrationOptions({
    rpName: APP_NAME,
    rpID: rpId,
    userName: userEmail,
    userID: new TextEncoder().encode(userId),
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred'
    }
  });
}

export async function checkPasskeyRegistration(
  response: any,
  expectedChallenge: string
): Promise<VerifiedRegistrationResponse> {
  const rpId = getRpId();
  return verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: config.origin,
    expectedRPID: rpId
  });
}

export async function createPasskeyAuthOptions(allowCredentialIds?: string[]) {
  const rpId = getRpId();
  return generateAuthenticationOptions({
    rpID: rpId,
    userVerification: 'preferred',
    allowCredentials: allowCredentialIds?.map((id) => ({
      id,
      transports: ['internal', 'hybrid', 'usb', 'ble', 'nfc']
    }))
  });
}

export async function checkPasskeyAuth(
  response: any,
  expectedChallenge: string,
  credentialPublicKey: Uint8Array,
  credentialCounter: number
): Promise<VerifiedAuthenticationResponse> {
  const rpId = getRpId();
  return verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: config.origin,
    expectedRPID: rpId,
    credential: {
      id: response.id,
      publicKey: credentialPublicKey as any,
      counter: credentialCounter
    }
  });
}