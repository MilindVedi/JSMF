import { BadRequestException } from '@nestjs/common';
import { LegalDocumentType } from '@prisma/client';

/** URLs say `terms`, `privacy`, `refund`; the enum says TERMS, PRIVACY, REFUND. Either is accepted. */
export function parseDocumentType(raw: string): LegalDocumentType {
  const type = raw.toUpperCase() as LegalDocumentType;
  if (!Object.values(LegalDocumentType).includes(type)) {
    throw new BadRequestException('Document type must be terms, privacy or refund');
  }
  return type;
}
