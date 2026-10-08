// Mirrors apps/api/src/services/credit.service.ts's response shapes.
// Credits belong to the account, not a
// workspace, so these are user-global, unlike most other feature types here.

export type CreditUsageFeature = 'chat' | 'workflow' | 'team';

export interface CreditBalance {
  balanceCredits: number;
  balanceMicroCredits: string;
}

export interface CreditBalanceResponse {
  credit: CreditBalance;
}

export interface CreditUsage {
  id: string;
  feature: CreditUsageFeature;
  provider: string;
  modelDisplayName: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number | null;
  credits: number;
  createdAt: string;
}

export interface CreditUsageManyResponse {
  usages: CreditUsage[];
  meta: {
    totalCount: number;
  };
}
