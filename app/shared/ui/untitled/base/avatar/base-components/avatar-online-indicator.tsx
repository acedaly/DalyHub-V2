// Vendored from Untitled UI React (untitledui.com/react), MIT.
// Source: `src/components/base/avatar/base-components/avatar-online-indicator.tsx`, retrieved 2026-09-10.
// Source revision: `0b78cd49beeb9d7ee37ed73cd85878cdb7ffa743`; sync marker: `c42bc4e33eba53dd58549bb6ba6045fe50338921`.
// Source licence: MIT for the open-source component source; Untitled UI React Pro materials remain subject to the purchased Pro license.
// Written by `scripts/vendor-untitled.mjs`; edit the manifest or the override
// layer in `~/shared/ui/untitled/overrides/` rather than this file, which is
// regenerated. Only the import specifiers differ from upstream.
import { cx } from "~/shared/ui/untitled/utils/cx";

const sizes = {
    xs: "size-1.5",
    sm: "size-2",
    md: "size-2.5",
    lg: "size-3",
    xl: "size-3.5",
    "2xl": "size-4",
    "3xl": "size-4.5",
    "4xl": "size-5",
};

interface AvatarOnlineIndicatorProps {
    size: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl";
    status: "online" | "offline";
    className?: string;
}

export const AvatarOnlineIndicator = ({ size, status, className }: AvatarOnlineIndicatorProps) => (
    <span
        className={cx(
            "absolute right-0 bottom-0 flex justify-center rounded-full ring-[1.5px] ring-bg-primary",
            status === "online" ? "bg-fg-success-secondary" : "bg-utility-neutral-300",
            sizes[size],
            className,
        )}
        style={{
            backgroundImage:
                "radial-gradient(43.75% 43.75% at 50% 28.75%, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.00) 100%), radial-gradient(50% 50% at 50% 50%, rgba(255, 255, 255, 0.00) 74.66%, rgba(255, 255, 255, 0.18) 100%), radial-gradient(75% 75% at 50% 0%, rgba(255, 255, 255, 0.00) 0%, rgba(255, 255, 255, 0.00) 50%, rgba(255, 255, 255, 0.08) 99%, rgba(255, 255, 255, 0.00) 100%)",
        }}
    >
        {/* Reflection */}
        <svg viewBox="0 0 7.2 2.85" fill="none" className="mt-[10%] h-[20%] w-[60%]">
            <path
                d="M7.2 1.83107C7.2 2.84235 5.58823 2.19729 3.6 2.19729C1.61177 2.19729 0 2.84235 0 1.83107C0 0.8198 1.61177 0 3.6 0C5.58823 0 7.2 0.8198 7.2 1.83107Z"
                fill="url(#reflection-gradient)"
                fillOpacity="0.4"
            />
            <defs>
                <linearGradient id="reflection-gradient" x1="3.6" y1="0" x2="3.6" y2="2.4" gradientUnits="userSpaceOnUse">
                    <stop stopColor="white" />
                    <stop offset="1" stopColor="white" stopOpacity="0.1" />
                </linearGradient>
            </defs>
        </svg>
    </span>
);
