// Vendored from Untitled UI React (untitledui.com/react), MIT.
// Source: `src/components/application/empty-state/empty-state.tsx`, retrieved 2026-09-10.
// Source revision: `0b78cd49beeb9d7ee37ed73cd85878cdb7ffa743`; sync marker: `c42bc4e33eba53dd58549bb6ba6045fe50338921`.
// Source licence: MIT for the open-source component source; Untitled UI React Pro materials remain subject to the purchased Pro license.
// Written by `scripts/vendor-untitled.mjs`; edit the manifest or the override
// layer in `~/shared/ui/untitled/overrides/` rather than this file, which is
// regenerated. Only the import specifiers differ from upstream, plus:
//
// PATCHED by the vendoring script: Upstream's `EmptyState.FileTypeIcon` statically imports `FileIcon` from `@untitledui/file-icons`.
// `FileIcon` is a DISPATCHER — it maps a `type` string onto one of ~150 file-type
// glyphs — so it references the whole set and nothing in it can be tree-shaken,
// `sideEffects: false` notwithstanding. DalyHub renders no file-type icon anywhere:
// the only importer of that package in the repository was this sub-component.
// Measured on the V2 production build, it cost 429,066 uncompressed bytes (59,321
// gzipped) inside the OFFLINE SHELL PRECACHE — `/offline` renders an EmptyState,
// so every DalyHub install downloaded the whole file-icon set before it could
// boot offline. That is 21% of the precache for a component the product does
// not draw. Composing around it is not available: a module is the unit of import,
// so DalyHub's own EmptyState carries this graph whichever export it names.
// Removed here in five narrow edits (this one, the component, its type member,
// its assignment and a type import left with nothing to name); `@untitledui/file-icons`
// stays installed and documented, it is simply no longer bundled. Re-instating
// a file-type icon means importing the ONE glyph a surface draws, not the dispatcher.
//
// PATCHED by the vendoring script: …the `FileTypeIcon` component itself, and the props interface that reads
// its two types off `FileIcon` (see the removal note above).
//
// PATCHED by the vendoring script: …its member on the compound component's type (see the removal note above).
//
// PATCHED by the vendoring script: …and its assignment onto the compound component, which is the reference that
// kept the whole graph alive (see the removal note above). With this gone `ComponentProps`
// has no remaining use in the file, so the type import sheds it.
//
// PATCHED by the vendoring script: …the now-unused `ComponentProps` type import (see the removal note above).
//
// PATCHED by the vendoring script: Upstream's `EmptyState.Header` draws a decorative BACKGROUND PATTERN behind
// the empty state, defaulting to `circle`, through a dispatcher over four artworks
// — one of which, `grid-check`, is a single 139,635-byte SVG. Naming the dispatcher
// references all four, so the shell carries every pattern whichever one is
// asked for. DalyHub asks for none of them: its one shared EmptyState passed
// `pattern="none"` at the only call site in the product, because `PRODUCT_EXPERIENCE`
// Part V says an empty state is "calm and centred in its content region — never
// full-screen theatre", and a patterned backdrop is the theatre that rule rejects.
// So this is not a byte we might spend later: it implements the option the
// product has already decided against. Measured at 120,977 uncompressed bytes
// of the OFFLINE SHELL PRECACHE. The `pattern`/`patternSize` props go with
// the import, and the DalyHub call site drops its `pattern="none"`. `~/shared/ui/untitled/shared-assets/background-patterns`
// stays vendored and one import away for any surface that does want one.
//
// PATCHED by the vendoring script: …the `pattern` and `patternSize` props those two imports existed for, and
// the conditional that drew them (see the background-pattern note above).
//
// PATCHED by the vendoring script: …`Header`'s own signature, now that it has no pattern to place (see the background-pattern
// note above).
//
// PATCHED by the vendoring script: …and the render itself (see the background-pattern note above).
//
// PATCHED by the vendoring script: Upstream's `EmptyState.Illustration` renders one of four named Untitled artworks,
// and naming the component references all four. DalyHub does not use it and
// has said so in prose since the component was adopted: its own EmptyState
// takes an `illustration` ReactNode and renders it directly, with the comment
// "upstream's `Illustration` slot only takes one of its own named artworks,
// so a DalyHub illustration renders directly here". Measured at 76,062 uncompressed
// bytes of the OFFLINE SHELL PRECACHE for a slot the product routes around.
// `~/shared/ui/untitled/shared-assets/illustrations` stays vendored and one
// import away.
//
// PATCHED by the vendoring script: …the `Illustration` component itself (see the illustration note above).
//
// PATCHED by the vendoring script: …and `Header`'s detection of it. `hasIllustration` compares a child's type
// against `Illustration`, so in DalyHub it was ALREADY always false — removing
// it changes no rendered margin, and takes `Children` and `isValidElement`
// with it (see the illustration note above).
//
// PATCHED by the vendoring script: …its member on the compound component's type (see the illustration note above).
//
// PATCHED by the vendoring script: …its assignment onto the compound component (see the illustration note above).
//
// PATCHED by the vendoring script: …and the two React helpers `hasIllustration` was the only user of (see the
// illustration note above).
import type { ComponentPropsWithRef, ReactNode } from "react";
import { createContext, useContext } from "react";
import { SearchLg } from "@untitledui/icons";
import { FeaturedIcon as FeaturedIconbase } from "~/shared/ui/untitled/foundations/featured-icon/featured-icon";
import { cx } from "~/shared/ui/untitled/utils/cx";

interface RootContextProps {
    size?: "sm" | "md" | "lg";
}

const RootContext = createContext<RootContextProps>({ size: "lg" });

interface RootProps extends ComponentPropsWithRef<"div">, RootContextProps {}

const Root = ({ size = "lg", ...props }: RootProps) => {
    return (
        <RootContext.Provider value={{ size }}>
            <div {...props} className={cx("mx-auto flex w-full max-w-lg flex-col items-center justify-center", props.className)} />
        </RootContext.Provider>
    );
};

const FeaturedIcon = ({ color = "gray", theme = "modern", icon = SearchLg, size, ...props }: ComponentPropsWithRef<typeof FeaturedIconbase>) => {
    const { size: rootSize } = useContext(RootContext);

    return <FeaturedIconbase {...props} {...{ color, theme, icon }} size={!size && rootSize === "lg" ? "xl" : size || "lg"} />;
};

interface HeaderProps extends ComponentPropsWithRef<"div"> {}

const Header = ({ ...props }: HeaderProps) => {
    const { size } = useContext(RootContext);

    return (
        <header
            {...props}
            className={cx("relative mb-4", (size === "md" || size === "lg") && "mb-5", props.className)}
        >
            {props.children}
        </header>
    );
};

const Content = (props: ComponentPropsWithRef<"div">) => {
    const { size } = useContext(RootContext);

    return (
        <main
            {...props}
            className={cx(
                "z-10 mb-6 flex w-full max-w-88 flex-col items-center justify-center gap-1",
                (size === "md" || size === "lg") && "mb-8 gap-2",
                props.className,
            )}
        />
    );
};

const Footer = (props: ComponentPropsWithRef<"div">) => {
    return <footer {...props} className={cx("z-10 flex gap-3", props.className)} />;
};

const Title = (props: ComponentPropsWithRef<"h1">) => {
    const { size } = useContext(RootContext);

    return (
        <h1
            {...props}
            className={cx(
                "text-md font-semibold text-primary",
                size === "md" && "text-lg font-semibold",
                size === "lg" && "text-xl font-semibold",
                props.className,
            )}
        />
    );
};

const Description = (props: ComponentPropsWithRef<"p">) => {
    const { size } = useContext(RootContext);

    return <p {...props} className={cx("text-center text-sm text-tertiary", size === "lg" && "text-md", props.className)} />;
};

interface AvatarRadiusProps extends ComponentPropsWithRef<"div"> {
    avatars?: Array<{ src: string; alt?: string }>;
}

/**
 * Predefined avatar slots positioned on concentric circle rings.
 * Each slot defines: ring radius, CSS angle (0°=top, clockwise), and avatar size class.
 */
const avatarSlots = [
    { ring: 80, angle: 330, size: "size-8" },
    { ring: 80, angle: 56, size: "size-8" },
    { ring: 144, angle: 82, size: "size-7" },
    { ring: 144, angle: 299, size: "size-7" },
    { ring: 144, angle: 241, size: "size-7" },
    { ring: 176, angle: 64, size: "size-6" },
    { ring: 176, angle: 270, size: "size-6" },
    { ring: 144, angle: 112, size: "size-7" },
    { ring: 80, angle: 249, size: "size-8" },
] as const;

const RING_RADII = [48, 80, 112, 144, 176];

const AvatarRadius = ({ avatars = [], ...props }: AvatarRadiusProps) => {
    return (
        <div
            aria-hidden="true"
            {...props}
            className={cx("pointer-events-none absolute top-1/2 left-1/2 size-120 -translate-x-1/2 -translate-y-1/2", props.className)}
            style={{
                maskImage: "radial-gradient(circle, black 10%, transparent 70%)",
                WebkitMaskImage: "radial-gradient(circle, black 10%, transparent 70%)",
                ...props.style,
            }}
        >
            {RING_RADII.map((radius) => (
                <div
                    key={radius}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-secondary"
                    style={{ width: radius * 2, height: radius * 2 }}
                />
            ))}

            {avatars.slice(0, avatarSlots.length).map((avatar, i) => {
                const slot = avatarSlots[i];
                const rad = (slot.angle * Math.PI) / 180;
                const x = Math.sin(rad) * slot.ring;
                const y = -Math.cos(rad) * slot.ring;

                return (
                    <div
                        key={i}
                        className={cx("absolute top-1/2 left-1/2 rounded-full bg-primary p-px shadow-xs ring-[0.5px] ring-black/10", slot.size)}
                        style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))` }}
                    >
                        <img src={avatar.src} alt="" className="size-full rounded-full object-cover outline-[0.5px] -outline-offset-[0.5px] outline-black/16" />
                    </div>
                );
            })}
        </div>
    );
};

interface AvatarRowProps extends ComponentPropsWithRef<"div"> {
    avatars?: Array<{ src: string; alt?: string }>;
    children?: ReactNode;
}

/** Avatar sizes per root size — ordered smallest to largest (left edge → center). */
const rowStyles = {
    sm: ["size-8 rounded-md", "size-9 rounded-[7px]", "size-10 rounded-lg", "size-11 rounded-[9px]"],
    md: ["size-10 rounded-lg", "size-11 rounded-[9px]", "size-12 rounded-[10px]"],
    lg: ["size-10 rounded-lg", "size-11 rounded-[9px]", "size-12 rounded-[10px]"],
} as const;

const AvatarRow = ({ avatars = [], children, ...props }: AvatarRowProps) => {
    const { size: rootSize } = useContext(RootContext);
    const sizeKey = rootSize || "md";
    const sizes = rowStyles[sizeKey];
    const count = sizes.length;
    const leftAvatars = avatars.slice(0, count);
    const rightAvatars = avatars.slice(count, count * 2);

    const renderAvatar = (avatar: { src: string; alt?: string }, sizeClass: string, key: number) => (
        <div
            key={key}
            className={cx(
                "relative shrink-0 overflow-hidden outline-[0.5px] -outline-offset-[0.5px] outline-black/16 before:absolute before:inset-0 before:rounded-[inherit] before:border before:border-white/32 before:mask-[linear-gradient(to_bottom,black_0%,transparent_25%,transparent_75%,black_100%)]",
                sizeClass,
            )}
        >
            <img src={avatar.src} alt={avatar.alt || ""} className="size-full object-cover" />
        </div>
    );

    return (
        <div
            aria-hidden="true"
            {...props}
            className={cx("-m-1 flex items-center justify-center p-1", sizeKey === "sm" ? "gap-4" : sizeKey === "md" ? "gap-5" : "gap-6", props.className)}
            style={{
                maskImage: "radial-gradient(circle, black 5%, transparent 105%)",
                WebkitMaskImage: "radial-gradient(circle, black 5%, transparent 105%)",
                ...props.style,
            }}
        >
            <div className={cx("flex items-center", sizeKey === "sm" ? "gap-3" : "gap-4")}>
                {leftAvatars.map((avatar, i) => renderAvatar(avatar, sizes[i], i))}
            </div>

            {children}

            <div className={cx("flex items-center", sizeKey === "sm" ? "gap-3" : "gap-4")}>
                {rightAvatars.map((avatar, i) => renderAvatar(avatar, sizes[count - 1 - i], i + count))}
            </div>
        </div>
    );
};

interface AvatarGridProps extends ComponentPropsWithRef<"div"> {
    avatars?: Array<{ src: string; alt?: string }>;
}

const gridStyles = {
    sm: { avatar: "size-8 rounded-md", inner: "rounded-[5px]", gap: "gap-2 pl-2", rowGap: "gap-2" },
    md: { avatar: "size-10 rounded-lg", inner: "rounded-[7px]", gap: "gap-3 pl-3", rowGap: "gap-3" },
    lg: { avatar: "size-12 rounded-[10px]", inner: "rounded-[9px]", gap: "gap-3 pl-3", rowGap: "gap-3" },
} as const;

const AvatarGrid = ({ avatars = [], ...props }: AvatarGridProps) => {
    const { size: rootSize } = useContext(RootContext);
    const sizeKey = rootSize || "md";
    const config = gridStyles[sizeKey];
    const mid = Math.ceil(avatars.length / 2);
    const row1Base = avatars.slice(0, mid);
    const row2Base = avatars.slice(mid);

    const row1 = [...row1Base, ...row1Base, ...row1Base];
    const row2 = [...row2Base, ...row2Base, ...row2Base];

    const renderGridAvatar = (avatar: { src: string; alt?: string }, key: number) => (
        <div key={key} className={cx("shrink-0 bg-primary p-px shadow-xs ring-[0.75px] ring-black/10", config.avatar)}>
            <div
                className={cx(
                    "relative size-full overflow-hidden outline-[0.5px] -outline-offset-[0.5px] outline-black/16 before:absolute before:inset-0 before:rounded-[inherit] before:border before:border-white/32 before:mask-[linear-gradient(to_bottom,black_0%,transparent_25%,transparent_75%,black_100%)]",
                    config.inner,
                )}
            >
                <img src={avatar.src} alt={avatar.alt || ""} className="size-full object-cover" />
            </div>
        </div>
    );

    return (
        <div
            aria-hidden="true"
            {...props}
            className={cx("-m-1 flex max-w-lg flex-col items-center overflow-x-clip p-1", config.rowGap, props.className)}
            style={{
                maskImage: "radial-gradient(circle, black 10%, transparent 100%)",
                WebkitMaskImage: "radial-gradient(circle, black 10%, transparent 100%)",
                ...props.style,
            }}
        >
            <div className="flex">
                <div className={cx("flex w-auto max-w-none shrink-0 animate-marquee [animation-duration:240s] motion-reduce:animate-none", config.gap)}>
                    {row1.map((avatar, i) => renderGridAvatar(avatar, i))}
                </div>
                <div className={cx("flex w-auto max-w-none shrink-0 animate-marquee [animation-duration:240s] motion-reduce:animate-none", config.gap)}>
                    {row1.map((avatar, i) => renderGridAvatar(avatar, i))}
                </div>
            </div>
            <div className="flex">
                <div
                    className={cx(
                        "flex w-auto max-w-none shrink-0 animate-marquee [animation-delay:-120s] [animation-duration:240s] direction-reverse motion-reduce:-translate-x-1/2 motion-reduce:animate-none",
                        config.gap,
                    )}
                >
                    {row2.map((avatar, i) => renderGridAvatar(avatar, i + mid))}
                </div>
                <div
                    className={cx(
                        "flex w-auto max-w-none shrink-0 animate-marquee [animation-delay:-120s] [animation-duration:240s] direction-reverse motion-reduce:-translate-x-1/2 motion-reduce:animate-none",
                        config.gap,
                    )}
                >
                    {row2.map((avatar, i) => renderGridAvatar(avatar, i + mid))}
                </div>
            </div>
        </div>
    );
};

const EmptyState = Root as typeof Root & {
    Title: typeof Title;
    Header: typeof Header;
    Footer: typeof Footer;
    Content: typeof Content;
    Description: typeof Description;
    FeaturedIcon: typeof FeaturedIcon;
    AvatarRadius: typeof AvatarRadius;
    AvatarRow: typeof AvatarRow;
    AvatarGrid: typeof AvatarGrid;
};

EmptyState.Title = Title;
EmptyState.Header = Header;
EmptyState.Footer = Footer;
EmptyState.Content = Content;
EmptyState.Description = Description;
EmptyState.FeaturedIcon = FeaturedIcon;
EmptyState.AvatarRadius = AvatarRadius;
EmptyState.AvatarRow = AvatarRow;
EmptyState.AvatarGrid = AvatarGrid;

export { EmptyState };
