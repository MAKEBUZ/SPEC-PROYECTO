import type { PoolClient } from 'pg';
import type { TokenPurpose } from '../db/identity.js';

export interface TokenDelivery {
  tokenId: string;
  accountId: string;
  recipient: string;
  purpose: TokenPurpose;
  secret: string;
  issuedAt: Date;
  expiresAt: Date;
}
// Implementations must enqueue using this transaction, protect the secret at
// rest and deliver only after commit. No direct SMTP/SES call is allowed here.
// The durable encrypted adapter and superseded-token worker are T020.
export interface TokenDeliveryQueue {
  enqueue(client: PoolClient, delivery: TokenDelivery): Promise<void>;
}
