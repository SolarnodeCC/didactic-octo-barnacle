import { z } from "zod";

/** ISO 4217 currency code, for example `USD` or `EUR`. */
export const CurrencyCodeSchema = z.string().regex(/^[A-Z]{3}$/, "expected an ISO 4217 code");

/** `Money` of docs/kt/agents/contract-conventions.md: an amount and its currency. */
export const MoneySchema = z
  .object({
    Amount: z.number().finite(),
    Currency: CurrencyCodeSchema,
  })
  .strict();

export type Money = z.infer<typeof MoneySchema>;
