import Link from "next/link";

/** Placeholder brand for the drafts: a lowercase wordmark over a baseline rule
 * with a ball dot riding it. Sized in `em` so each variant scales it with
 * its own type. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" aria-label="Baseline home" className={`group inline-flex flex-col leading-none ${className}`}>
      <span className="font-display text-[1.6em] font-extrabold tracking-tight text-foreground">baseline</span>
      <span aria-hidden="true" className="relative mt-[0.18em] block h-[2px] w-full bg-foreground">
        <span className="absolute -top-[0.2em] left-0 h-[0.5em] w-[0.5em] rounded-full bg-accent transition-[left] duration-500 ease-out group-hover:left-[calc(100%-0.5em)] motion-reduce:transition-none" />
      </span>
    </Link>
  );
}
