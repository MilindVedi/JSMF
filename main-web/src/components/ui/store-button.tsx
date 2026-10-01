import { cva, type VariantProps } from "class-variance-authority";

/**
 * The storefront's button styling, from the design: a tall pill with a
 * semibold label, and a small lift on the primary action.
 *
 * Deliberately separate from `@/components/ui/button` rather than a change to
 * it. The admin panel is built around that button at `h-8` — dense tables,
 * toolbars and row actions are spaced for it — so raising every button in the
 * app to `min-h-11` to match this design would re-space screens the design
 * never covered. Same tokens, same hover language, different proportions for
 * a different surface.
 *
 * Exported as class names rather than a component so it composes onto whatever
 * the markup already needs to be: a `<Link>`, an `<a>` to an external site, or
 * a real `<button>` that submits a form.
 */
export const storeButton = cva(
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:-translate-y-0.5",
        secondary:
          "border border-border bg-card text-foreground hover:border-primary/30 hover:bg-accent",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
      },
      size: {
        default: "h-11",
        sm: "min-h-9 h-9 px-4 text-xs",
        lg: "min-h-12 h-12 px-6",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export type StoreButtonVariants = VariantProps<typeof storeButton>;
