import { z } from "zod";

export const AuthorSchema = z.object({
  Id: z.string().min(1),
  DisplayName: z.string().min(1),
  Orcid: z.string().min(1).nullable(),
});

export type Author = z.infer<typeof AuthorSchema>;

export const AuthorshipSchema = z.object({
  PublicationId: z.string().min(1),
  AuthorId: z.string().min(1),
  Position: z.number().int().nonnegative(),
  Affiliations: z.array(z.string().min(1)),
});

export type Authorship = z.infer<typeof AuthorshipSchema>;
