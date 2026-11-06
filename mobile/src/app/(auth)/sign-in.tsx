import { SignInClassic } from "@/components/auth/sign-in-classic";
import { useSignInForm } from "@/components/auth/sign-in-form";
import { SignInHero } from "@/components/auth/sign-in-hero";

type SignInLook = "hero" | "classic";

/**
 * Which look the sign-in screen wears. Both share the form logic
 * (useSignInForm); "classic" is the plain card the other auth screens use.
 */
const LOOK = "hero" as SignInLook;

export default function SignInScreen() {
  const form = useSignInForm();
  return LOOK === "classic" ? <SignInClassic {...form} /> : <SignInHero {...form} />;
}
