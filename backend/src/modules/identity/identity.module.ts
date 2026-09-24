import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminInvitationService } from './application/admin-invitation.service';
import { AuthService } from './application/auth.service';
import { OAuthService } from './application/oauth.service';
import { TokenService } from './application/token.service';
import { VerificationCodeService } from './application/verification-code.service';
import { PasswordHasher } from './domain/password-hasher.port';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { GoogleOAuthClient } from './infrastructure/google-oauth.client';
import { JwtKeyProvider } from './infrastructure/jwt-key-provider';
import {
  AdminInvitationController,
  AdminTeamController,
} from './http/admin-team.controller';
import { AuthController } from './http/auth.controller';
import { OAuthController } from './http/oauth.controller';

/**
 * The platform-wide identity module — not a PDF-platform feature.
 *
 * It owns users, roles, sessions and third-party sign-in for every JSMF
 * application: when the PYQ app gets its real backend it becomes another module
 * in this same service and consumes this one, rather than growing a second user
 * table or its own Google integration. Exported (and @Global) because every
 * other module authorises against it.
 *
 * Structured to be extractable: nothing here reaches into another module's
 * tables, tokens are signed asymmetrically, and the front-end a sign-in returns
 * to is chosen from an allowlist rather than hardcoded — so lifting this into
 * its own service later is a deployment change rather than a rewrite. See
 * docs/identity/01-architecture.md.
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController, AdminTeamController, AdminInvitationController, OAuthController],
  providers: [
    AuthService,
    TokenService,
    JwtKeyProvider,
    VerificationCodeService,
    AdminInvitationService,
    OAuthService,
    GoogleOAuthClient,
    // The hasher is bound to its port, not injected concretely, so replacing
    // Argon2 later touches this line and nothing else.
    { provide: PasswordHasher, useClass: Argon2PasswordHasher },
  ],
  exports: [AuthService, TokenService, PasswordHasher, VerificationCodeService],
})
export class IdentityModule {}
