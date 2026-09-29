import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccountRecoveryService } from './application/account-recovery.service';
import { AdminInvitationService } from './application/admin-invitation.service';
import { AuthService } from './application/auth.service';
import { OAuthService } from './application/oauth.service';
import { PhoneSignInService } from './application/phone-sign-in.service';
import { TokenService } from './application/token.service';
import { VerificationCodeService } from './application/verification-code.service';
import { VerificationDeliveryService } from './application/verification-delivery.service';
import { PasswordHasher } from './domain/password-hasher.port';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { EmailVerificationChannel } from './infrastructure/email-verification.channel';
import { SmsVerificationChannel } from './infrastructure/sms-verification.channel';
import { WhatsAppVerificationChannel } from './infrastructure/whatsapp-verification.channel';
import { GoogleOAuthClient } from './infrastructure/google-oauth.client';
import { JwtKeyProvider } from './infrastructure/jwt-key-provider';
import {
  AdminInvitationController,
  AdminTeamController,
} from './http/admin-team.controller';
import { AuthController } from './http/auth.controller';
import { OAuthController } from './http/oauth.controller';
import { PhoneAuthController } from './http/phone-auth.controller';

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
  controllers: [
    AuthController,
    PhoneAuthController,
    AdminTeamController,
    AdminInvitationController,
    OAuthController,
  ],
  providers: [
    AuthService,
    TokenService,
    JwtKeyProvider,
    VerificationCodeService,
    // Delivery is assembled from channels, the same way storage, payments and
    // mail are assembled from drivers. SMS was added exactly that way — a class
    // and one line in the registry — and nothing that sends a code changed.
    EmailVerificationChannel,
    WhatsAppVerificationChannel,
    SmsVerificationChannel,
    VerificationDeliveryService,
    AccountRecoveryService,
    PhoneSignInService,
    AdminInvitationService,
    OAuthService,
    GoogleOAuthClient,
    // The hasher is bound to its port, not injected concretely, so replacing
    // Argon2 later touches this line and nothing else.
    { provide: PasswordHasher, useClass: Argon2PasswordHasher },
  ],
  exports: [
    AuthService,
    TokenService,
    PasswordHasher,
    VerificationCodeService,
    AccountRecoveryService,
  ],
})
export class IdentityModule {}
