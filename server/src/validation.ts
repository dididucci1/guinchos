import { z } from "zod";

/** Texto opcional: vazio vira null. */
export const optText = (max = 500) =>
  z.string().trim().max(max).optional().nullable().transform((v) => v || null);

/** Data 'YYYY-MM-DD' opcional. */
export const optDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
  .optional()
  .nullable()
  .or(z.literal(""))
  .transform((v) => v || null);

/** Número inteiro opcional (aceita "" e null). */
export const optInt = (min = 0) =>
  z
    // "" e null primeiro: z.coerce transformaria "" em 0.
    .union([z.literal(""), z.null(), z.coerce.number().int("Use um número inteiro").min(min, `Valor mínimo: ${min}`)])
    .optional()
    .transform((v) => (v === "" || v == null ? null : v));

/** Valor em reais opcional. */
export const optMoney = z
  .union([z.literal(""), z.null(), z.coerce.number().min(0, "Valor não pode ser negativo")])
  .optional()
  .transform((v) => (v === "" || v == null ? null : v));

export const dateTime = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Data/hora inválida");
