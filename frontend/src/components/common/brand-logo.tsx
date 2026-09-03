import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandLogo({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={compact ? "/raglense-mark.png" : "/raglense-logo.png"}
      alt="RAGLens"
      width={compact ? 44 : 260}
      height={compact ? 44 : 84}
      priority
      className={cn("object-contain", className)}
    />
  );
}
