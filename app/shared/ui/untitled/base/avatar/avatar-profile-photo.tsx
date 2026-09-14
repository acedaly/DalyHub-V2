// Adapted from Untitled UI React (https://www.untitledui.com/react)
// @ sha256:9267f71474e337b1faf908cad857a59d6993f733352e0dda0fe275d69eb61be5
// (4,437 bytes; declared runtime `tailwind-merge@^3.6.0`,
// `@untitledui/icons@^0.0.22`, `react-aria-components@^1.20.0`), MIT,
// retrieved 2026-09-13.
// Changes: `"use client"` removed (DalyHub has no React Server Components, and
// the directive is inert noise here); the two `@/…` import specifiers rewritten
// to DalyHub's `~/shared/ui/untitled/…` alias, which is what
// `scripts/vendor-untitled.mjs` does to every vendored file. Nothing else —
// no markup, class, prop or behaviour differs from upstream.
//
// ── Why a content hash rather than a commit ─────────────────────────────────
//
// Untitled publishes no public git history for the component source and its
// API returns no revision field, so there is no commit to cite. The SHA-256 of
// the retrieved bytes is the pin that is actually available and it is the
// stronger one for an audit: re-POST
// `{"components":["avatar"]}` to `https://www.untitledui.com/react/api/components`,
// hash `files[].code` for `components/base/avatar/avatar-profile-photo.tsx`,
// and either it matches this file's origin exactly or upstream has moved. The
// declared dependency versions above are upstream's own version statement for
// this component.
//
// Source path: `src/components/base/avatar/avatar-profile-photo.tsx`.
// Retrieved through the PUBLIC component API rather than a licensed checkout,
// which this environment does not have: the CLI cannot complete its localhost
// OAuth callback here. The API serves this component openly, not as PRO.
// Source licence: MIT for the open-source component source; Untitled UI React
// Pro materials remain subject to the purchased Pro license.
// Listed in `API_SOURCED` in `scripts/vendor-untitled.mjs`, so the checkout walk
// neither regenerates nor deletes it; move it into `MANIFEST` the first time
// that script runs against a real licensed checkout.
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
