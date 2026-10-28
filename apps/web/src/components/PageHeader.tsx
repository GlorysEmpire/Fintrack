import { InfoTip } from "@/components/ui/info-tip";

/** A page title, with what the page is for behind an (i) button instead of a paragraph. */
export function PageHeader({
  title,
  info,
  infoLabel,
  children,
}: {
  title: string;
  /** The explanation for the (i) button; leave out when there is none */
  info?: React.ReactNode;
  infoLabel?: string;
  /** Actions or links shown to the right of the title */
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
        {info && <InfoTip label={infoLabel ?? `About ${title}`}>{info}</InfoTip>}
      </div>
      {children}
    </div>
  );
}
