import Image from "next/image";
import Link from "next/link";

export function BrandLogo({ compact = false, href = "/" }: { compact?: boolean; href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center" aria-label="LaundryLink home">
      <Image src="/laundrylink-wordmark.png" alt="LaundryLink" width={395} height={100} priority className={compact ? "h-9 w-auto" : "h-11 w-auto"} />
    </Link>
  );
}

