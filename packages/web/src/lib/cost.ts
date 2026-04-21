// request_logs.cost_usd는 micro-USD(정수)로 저장. 표시는 소수 4자리 USD.
const MICRO_USD = 1_000_000;
const COST_DECIMALS = 4;

export function microUsdToUsd(microUsd: number): number {
  return microUsd / MICRO_USD;
}

export function formatUsd(usd: number): string {
  return `$${usd.toFixed(COST_DECIMALS)}`;
}

export function formatMicroUsd(microUsd: number): string {
  return formatUsd(microUsdToUsd(microUsd));
}
