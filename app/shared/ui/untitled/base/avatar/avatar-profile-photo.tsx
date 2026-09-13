// Vendored from Untitled UI React (untitledui.com/react), MIT.
// Source: `src/components/base/avatar/avatar-profile-photo.tsx`, retrieved via
// Untitled's public component API (`POST https://www.untitledui.com/react/api/components`,
// component `avatar`) on 2026-09-13 — the same route `charts-base` came through,
// and for the same reason: this environment has no licensed Untitled checkout
// and the CLI cannot complete its localhost OAuth callback here.
// Source licence: MIT for the open-source component source; Untitled UI React Pro materials remain subject to the purchased Pro license.
// Listed in `API_SOURCED` in `scripts/vendor-untitled.mjs`, so the checkout walk
// neither regenerates nor deletes it. Only the import specifiers differ from
// upstream; move it into `MANIFEST` the first time that script runs against a
// real licensed checkout.
import { useState } from "react";
import { User01 } from "@untitledui/icons";
import { cx } from "~/shared/ui/untitled/utils/cx";
import { type AvatarProps } from "./avatar";
import { AvatarOnlineIndicator, VerifiedTick } from "./base-components";

const styles = {
    sm: {
        root: "size-18 p-0.75",
        rootWithPlaceholder: "p-1",
        content: "outline-[0.5px] -outline-offset-[0.5px] before:border",
        icon: "size-9",
        initials: "text-display-sm font-semibold",
        badge: "bottom-0.5 right-0.5",
    },
    md: {
        root: "size-24 p-1",
        rootWithPlaceholder: "p-1.25",
        content: "shadow-xl outline-[0.75px] -outline-offset-[0.75px] before:border-[1.5px]",
        icon: "size-12",
        initials: "text-display-md font-semibold",
        badge: "bottom-1 right-1",
    },
    lg: {
        root: "size-40 p-1.5",
        rootWithPlaceholder: "p-1.75",
        content: "shadow-2xl outline-[0.75px] -outline-offset-[0.75px] before:border-[1.5px]",
        icon: "size-20",
        initials: "text-display-xl font-semibold",
        badge: "bottom-2 right-2",
    },
};

const tickSizeMap = {
    sm: "2xl",
    md: "3xl",
    lg: "4xl",
} as const;

interface AvatarProfilePhotoProps extends AvatarProps {
    size: "sm" | "md" | "lg";
}

export const AvatarProfilePhoto = ({
    size = "md",
    src,
    alt,
    initials,
    placeholder,
    placeholderIcon: PlaceholderIcon,
    verified,
    badge,
    status,
    className,
}: AvatarProfilePhotoProps) => {
    const [isFailed, setIsFailed] = useState(false);

    const renderMainContent = () => {
        if (src && !isFailed) {
            return (
                <div
                    className={cx(
                        "relative size-full overflow-hidden rounded-full outline-black/16 before:absolute before:inset-0 before:rounded-full before:border-white/32 before:mask-[linear-gradient(to_bottom,black_0%,transparent_25%,transparent_75%,black_100%)]",
                        styles[size].content,
                    )}
                >
                    <img src={src} alt={alt} onError={() => setIsFailed(true)} className="size-full object-cover" />
                </div>
            );
        }

        if (initials) {
            return (
                <div
                    className={cx(
                        "flex size-full items-center justify-center rounded-full bg-tertiary ring-1 ring-secondary_alt outline-transparent before:hidden",
                        styles[size].content,
                    )}
                >
                    <span className={cx("text-quaternary", styles[size].initials)}>{initials}</span>
                </div>
            );
        }

        if (PlaceholderIcon) {
            return (
                <div
                    className={cx(
                        "flex size-full items-center justify-center rounded-full bg-tertiary ring-1 ring-secondary_alt outline-transparent before:hidden",
                        styles[size].content,
                    )}
                >
                    <PlaceholderIcon className={cx("text-fg-quaternary", styles[size].icon)} />
                </div>
            );
        }

        return (
            <div
                className={cx(
                    "flex size-full items-center justify-center rounded-full bg-tertiary ring-1 ring-secondary_alt outline-transparent before:hidden",
                    styles[size].content,
                )}
            >
                {placeholder || <User01 className={cx("text-fg-quaternary", styles[size].icon)} />}
            </div>
        );
    };

    const renderBadgeContent = () => {
        if (status) {
            return <AvatarOnlineIndicator status={status} size={tickSizeMap[size]} className={styles[size].badge} />;
        }

        if (verified) {
            return <VerifiedTick size={tickSizeMap[size]} className={cx("absolute", styles[size].badge)} />;
        }

        return badge;
    };

    return (
        <div
            className={cx(
                "relative flex shrink-0 items-center justify-center rounded-full bg-primary ring-1 ring-secondary_alt",
                styles[size].root,
                (!src || isFailed) && styles[size].rootWithPlaceholder,
                className,
            )}
        >
            {renderMainContent()}
            {renderBadgeContent()}
        </div>
    );
};
