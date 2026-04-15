import { type z } from "zod";

export type OutputDefinition<T> = {
  type: "object";
  schema: z.ZodType<T>;
};

export const Output = {
  object<T>({ schema }: { schema: z.ZodType<T> }): OutputDefinition<T> {
    return { type: "object", schema };
  },
};
