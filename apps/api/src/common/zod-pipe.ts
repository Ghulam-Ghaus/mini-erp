import { BadRequestException } from '@nestjs/common';
import { z, type ZodType } from 'zod';

/**
 * Validates input data against a shared Zod schema and throws a clean 400 BadRequestException.
 */
export function parseWithZod<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const messages = result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
      return `${path}${issue.message}`;
    });
    throw new BadRequestException({
      message: messages,
      error: z.prettifyError(result.error),
    });
  }
  return result.data;
}
