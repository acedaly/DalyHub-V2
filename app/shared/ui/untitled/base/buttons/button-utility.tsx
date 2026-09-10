// Vendored from Untitled UI React (untitledui.com/react), MIT.
// Source: `src/components/base/buttons/button-utility.tsx`, retrieved 2026-09-10.
// Source revision: `0b78cd49beeb9d7ee37ed73cd85878cdb7ffa743`; sync marker: `c42bc4e33eba53dd58549bb6ba6045fe50338921`.
// Source licence: MIT for the open-source component source; Untitled UI React Pro materials remain subject to the purchased Pro license.
// Written by `scripts/vendor-untitled.mjs`; edit the manifest or the override
// layer in `~/shared/ui/untitled/overrides/` rather than this file, which is
// regenerated. Only the import specifiers differ from upstream.
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, DetailedHTMLProps, FC, ReactNode } from "react";
import { isValidElement } from "react";
import type { Placement } from "react-aria";
import type { ButtonProps as AriaButtonProps, LinkProps as AriaLinkProps } from "react-aria-components";
import { Button as AriaButton, Link as AriaLink } from "react-aria-components";
import { Tooltip } from "~/shared/ui/untitled/base/tooltip/tooltip";
import { cx } from "~/shared/ui/untitled/utils/cx";
import { isReactComponent } from "~/shared/ui/untitled/utils/is-react-component";

export const styles = {
    secondary:
        "bg-primary text-fg-quaternary shadow-xs-skeuomorphic ring-1 ring-primary ring-inset hover:bg-primary_hover hover:text-fg-quaternary_hover disabled:shadow-xs",
    tertiary: "text-fg-quaternary hover:bg-primary_hover hover:text-fg-quaternary_hover",
};

/**
 * Common props shared between button and anchor variants
 */
export interface CommonProps {
    /** Disables the button and shows a disabled state */
    isDisabled?: boolean;
    /** The size variant of the button */
    size?: "xs" | "sm";
    /** The color variant of the button */
    color?: "secondary" | "tertiary";
    /** The icon to display in the button */
    icon?: FC<{ className?: string }> | ReactNode;
    /** The tooltip to display when hovering over the button */
    tooltip?: string;
    /** The placement of the tooltip */
    tooltipPlacement?: Placement;
}

/**
 * Props for the button variant (non-link)
 */
export interface ButtonProps extends CommonProps, DetailedHTMLProps<Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color" | "slot">, HTMLButtonElement> {
    /** Slot name for react-aria component */
    slot?: AriaButtonProps["slot"];
}

/**
 * Props for the link variant (anchor tag)
 */
interface LinkProps extends CommonProps, DetailedHTMLProps<Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "color">, HTMLAnchorElement> {
    /** Options for the configured client side router. */
    routerOptions?: AriaLinkProps["routerOptions"];
}

/** Union type of button and link props */
export type Props = ButtonProps | LinkProps;

export const ButtonUtility = ({
    tooltip,
    className,
    isDisabled,
    icon: Icon,
    size = "sm",
    color = "secondary",
    tooltipPlacement = "top",
    ...otherProps
}: Props) => {
    const href = "href" in otherProps ? otherProps.href : undefined;
    const Component = href ? AriaLink : AriaButton;

    let props = {};

    if (href) {
        props = {
            ...otherProps,

            href: isDisabled ? undefined : href,

            // Since anchor elements do not support the `disabled` attribute and state,
            // we need to specify `data-rac` and `data-disabled` in order to be able
            // to use the `disabled:` selector in classes.
            ...(isDisabled ? { "data-rac": true, "data-disabled": true } : {}),
        };
    } else {
        props = {
            ...otherProps,

            type: otherProps.type || "button",
            isDisabled,
        };
    }

    const content = (
        <Component
            aria-label={tooltip}
            {...props}
            className={cx(
                "group relative inline-flex h-max cursor-pointer items-center justify-center rounded-md p-1.5 outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                styles[color],

                // Icon styles
                "*:data-icon:pointer-events-none *:data-icon:shrink-0 *:data-icon:text-current *:data-icon:transition-inherit-all",
                size === "xs" ? "*:data-icon:size-4" : "*:data-icon:size-5",

                className,
            )}
        >
            {isReactComponent(Icon) && <Icon data-icon />}
            {isValidElement(Icon) && Icon}
        </Component>
    );

    if (tooltip) {
        return (
            <Tooltip title={tooltip} placement={tooltipPlacement} isDisabled={isDisabled} offset={size === "xs" ? 4 : 6}>
                {content}
            </Tooltip>
        );
    }

    return content;
};
