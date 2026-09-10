// Vendored from Untitled UI React (untitledui.com/react), MIT.
// Source: `src/components/application/command-menus/base-components/command-menu-footer.tsx`, retrieved 2026-09-10.
// Source revision: `0b78cd49beeb9d7ee37ed73cd85878cdb7ffa743`; sync marker: `c42bc4e33eba53dd58549bb6ba6045fe50338921`.
// Source licence: MIT for the open-source component source; Untitled UI React Pro materials remain subject to the purchased Pro license.
// Written by `scripts/vendor-untitled.mjs`; edit the manifest or the override
// layer in `~/shared/ui/untitled/overrides/` rather than this file, which is
// regenerated. Only the import specifiers differ from upstream.
import { ArrowDown, ArrowLeft, ArrowUp, CornerDownLeft, Settings01 } from "@untitledui/icons";
import { Button } from "~/shared/ui/untitled/base/buttons/button";
import { cx } from "~/shared/ui/untitled/utils/cx";
import { CommandMenuNavigationIcon } from "./command-menu-navigation-icon";

interface CommandMenuFooterProps {
    className?: string;
}

export const CommandMenuFooter = ({ className }: CommandMenuFooterProps) => (
    <footer
        className={cx(
            "absolute inset-x-0 bottom-0 flex items-center justify-between gap-x-3 bg-alpha-white/80 p-2 pl-4.5 ring-1 ring-secondary_alt backdrop-blur-lg max-md:hidden",
            className,
        )}
    >
        <div className="flex gap-4">
            <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                    <CommandMenuNavigationIcon type="icon" icon={ArrowUp} />
                    <CommandMenuNavigationIcon type="icon" icon={ArrowDown} />
                </div>
                <span className="text-sm font-semibold text-quaternary">to navigate</span>
            </div>
            <div className="flex items-center gap-2">
                <CommandMenuNavigationIcon type="icon" icon={CornerDownLeft} />
                <span className="text-sm font-semibold text-quaternary">to select</span>
            </div>
            <div className="flex items-center gap-2">
                <CommandMenuNavigationIcon type="text" label="esc" />
                <span className="text-sm font-semibold text-quaternary">to close</span>
            </div>
            <div className="flex items-center gap-2">
                <CommandMenuNavigationIcon type="icon" icon={ArrowLeft} />
                <span className="text-sm font-semibold text-quaternary">return to parent</span>
            </div>
        </div>
        <Button size="sm" color="tertiary" iconLeading={Settings01} />
    </footer>
);
