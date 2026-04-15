import { type z } from "zod";

export type OutputDefinition<T> = {
  type: "object" | "array" | "text";
  schema?: z.ZodType<T>;
};

export const Output = {
  object<T>({ schema }: { schema: z.ZodType<T> }): OutputDefinition<T> {
    return { type: "object", schema };
  },
  array<T>({ element }: { element: z.ZodType<T> }): OutputDefinition<T[]> {
    return { type: "array", schema: element.array() as z.ZodType<T[]> };
  },
  text(): OutputDefinition<string> {
    return { type: "text" };
  },
};
