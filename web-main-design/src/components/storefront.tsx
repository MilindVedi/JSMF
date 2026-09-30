import { Link, useLocation } from "@tanstack/react-router";
import { ArrowRight, BookOpen, ExternalLink, Instagram, Library, LogIn, Menu, Play, Search, Send, Youtube } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { links } from "@/lib/jsmf-event";
import cardiology from "@/assets/resource-cardiology.jpg";
import biochem from "@/assets/resource-biochem.jpg";
import pathology from "@/assets/resource-pathology.jpg";
import jsmfBadge from "@/assets/jsmf-badge.png.asset.json";


export type Resource = {
  id: number; title: string; description: string; exam: string; subject: string;
  type: string; price: string; oldPrice: string; image: string; video?: boolean;
};

export const resources: Resource[] = [
  { id: 1, title: "Cardiovascular Systems & Hemodynamics", description: "Annotated diagrams and comparative tables for high-yield revision.", exam: "NEET-PG", subject: "Anatomy", type: "Rapid Revision", price: "₹799", oldPrice: "₹1,499", image: cardiology, video: true },
  { id: 2, title: "Metabolic Pathways & Inborn Errors", description: "Condensed cycles for rapid recall during the final stretch.", exam: "FMGE", subject: "Biochemistry", type: "Rapid Revision", price: "₹499", oldPrice: "₹999", image: biochem, video: true },
  { id: 3, title: "Systemic Pathology & Neoplasia", description: "Histological markers and staging patterns frequently seen in INI-CET.", exam: "INI-CET", subject: "Pathology", type: "PYQ Compilation", price: "₹1,299", oldPrice: "₹1,999", image: pathology },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  return <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-xl">
    <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
      <div className="flex items-center gap-8">
        <Link to="/" className="flex items-center gap-2.5 font-display text-base font-semibold text-brand-deep" aria-label="JSMF home">
          <img src={jsmfBadge.url} alt="" width={42} height={42} className="size-10 shrink-0 object-contain" />
          <span>JSMF</span>
        </Link>
        <nav className="hidden items-center gap-2 md:flex" aria-label="Main navigation">
          <Link to="/" className={`nav-link ${pathname === "/" ? "nav-link-active" : ""}`}>Home</Link>
          <Link to="/resources" className={`nav-link ${pathname === "/resources" ? "nav-link-active" : ""}`}><BookOpen size={16}/> Resources</Link>
          <Link to="/browse" className={`nav-link ${pathname === "/browse" ? "nav-link-active" : ""}`}><Search size={16}/> Browse</Link>
        </nav>

      </div>
      <div className="hidden items-center gap-2 md:flex">
        <Button asChild variant="ghost" size="sm"><Link to="/account/login">Sign in</Link></Button>
        <Button asChild size="sm"><Link to="/account/signup">Create account</Link></Button>
      </div>
      <button className="grid size-10 place-items-center rounded-full text-foreground md:hidden" onClick={() => setOpen(!open)} aria-label="Toggle navigation"><Menu size={20}/></button>
    </div>
    {open && <nav className="flex flex-col gap-2 border-t border-border bg-background p-4 md:hidden">
      <Link to="/" className="nav-link">Home</Link>
      <Link to="/resources" className="nav-link"><BookOpen size={16}/> Resources</Link>
      <Link to="/browse" className="nav-link"><Search size={16}/> Browse</Link>
      <Link to="/account/login" className="nav-link"><LogIn size={16}/> Sign in</Link>
      <Button asChild size="sm"><Link to="/account/signup">Create account</Link></Button>
    </nav>}

  </header>;
}

export function SiteFooter() {
  return <footer className="border-t border-border bg-card py-10">
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 lg:px-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="text-sm font-semibold text-brand-deep">Doctor-led preparation for NEET-PG, FMGE and INI-CET.</p>
        <SocialLinks />
      </div>
      <div className="flex flex-col gap-2 border-t border-border pt-5 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
        <p>© {new Date().getFullYear()} JSMF · Dr. Angad Rai</p>
        <p>JSMF is not affiliated with NBEMS, AIIMS, or any exam-conducting body.</p>
      </div>
    </div>
  </footer>;
}


export function StorefrontLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen flex-col bg-background"><SiteHeader/><main className="flex-1">{children}</main><SiteFooter/></div>;
}

export function ResourceCard({ resource }: { resource: Resource }) {
  return <article className="group overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-1 hover:border-primary/25 hover:shadow-editorial">
    <div className="relative aspect-[4/3] overflow-hidden bg-muted">
      <img src={resource.image} alt="" width={944} height={704} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"/>
      {resource.video && <span className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full bg-overlay px-2.5 py-1 text-[10px] font-bold text-overlay-foreground"><Play size={10} fill="currentColor"/> Video</span>}
    </div>
    <div className="p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase text-primary"><span>{resource.exam}</span><span className="text-border">•</span><span className="text-muted-foreground">{resource.subject}</span></div>
      <h3 className="min-h-14 font-display text-lg font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">{resource.title}</h3>
      <p className="mt-2 min-h-10 text-sm leading-relaxed text-muted-foreground">{resource.description}</p>
      <div className="mt-5 flex items-end justify-between border-t border-border pt-4">
        <div><span className="mr-2 font-display text-lg font-semibold text-brand-deep">{resource.price}</span><span className="text-xs text-muted-foreground line-through">{resource.oldPrice}</span></div>
        <span className="flex items-center gap-1 text-xs font-semibold text-primary">View <ArrowRight size={14}/></span>
      </div>
    </div>
  </article>;
}

export function FeaturedRow({ resource }: { resource: Resource }) {
  return <Link to="/browse" className="group flex gap-4 rounded-2xl border border-border bg-card p-3 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-editorial">
    <div className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-muted sm:size-28">
      <img src={resource.image} alt="" width={224} height={224} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"/>
      {resource.video && <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-overlay px-1.5 py-0.5 text-[9px] font-bold text-overlay-foreground"><Play size={9} fill="currentColor"/> Video</span>}
    </div>
    <div className="min-w-0 flex-1 py-0.5">
      <div className="flex flex-wrap items-center gap-2 text-[9px] font-bold uppercase tracking-wide text-primary"><span>{resource.exam}</span><span className="text-border">•</span><span className="text-muted-foreground">{resource.subject}</span></div>
      <h3 className="mt-1 font-display text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-primary sm:text-base">{resource.title}</h3>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{resource.description}</p>
      <div className="mt-2 flex items-center gap-2"><span className="font-display text-sm font-semibold text-brand-deep">{resource.price}</span><span className="text-[11px] text-muted-foreground line-through">{resource.oldPrice}</span></div>
    </div>
  </Link>;
}

export function SocialLinks() {
  return <div className="flex flex-wrap justify-center gap-3">
    <Button asChild variant="secondary" size="sm"><a href={links.telegram} target="_blank" rel="noreferrer"><Send size={15}/> Telegram <ExternalLink size={12}/></a></Button>
    <Button asChild variant="secondary" size="sm"><a href={links.youtube} target="_blank" rel="noreferrer"><Youtube size={15}/> YouTube <ExternalLink size={12}/></a></Button>
    <Button asChild variant="secondary" size="sm"><a href={links.instagram} target="_blank" rel="noreferrer"><Instagram size={15}/> Instagram <ExternalLink size={12}/></a></Button>
  </div>;
}


export function SearchIcon() { return <Search size={18}/>; }
export function LibraryIcon() { return <Library size={18}/>; }