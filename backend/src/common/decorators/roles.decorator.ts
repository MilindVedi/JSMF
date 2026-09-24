import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'requiredRoles';

/** Restricts a route to callers holding at least one of the given role keys. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
