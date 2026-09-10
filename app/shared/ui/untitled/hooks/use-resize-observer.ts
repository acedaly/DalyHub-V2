// Vendored from Untitled UI React (untitledui.com/react), MIT.
// Source: `src/hooks/use-resize-observer.ts`, retrieved 2026-09-10.
// Source revision: `0b78cd49beeb9d7ee37ed73cd85878cdb7ffa743`; sync marker: `c42bc4e33eba53dd58549bb6ba6045fe50338921`.
// Source licence: MIT for the open-source component source; Untitled UI React Pro materials remain subject to the purchased Pro license.
// Written by `scripts/vendor-untitled.mjs`; edit the manifest or the override
// layer in `~/shared/ui/untitled/overrides/` rather than this file, which is
// regenerated. Only the import specifiers differ from upstream.
import { useEffect } from "react";
import type { RefObject } from "@react-types/shared";

/**
 * Checks if the ResizeObserver API is supported.
 * @returns True if the ResizeObserver API is supported, false otherwise.
 */
function hasResizeObserver() {
    return typeof window.ResizeObserver !== "undefined";
}

/**
 * The options for the useResizeObserver hook.
 */
type useResizeObserverOptionsType<T> = {
    /**
     * The ref to the element to observe.
     */
    ref: RefObject<T | undefined | null> | undefined;
    /**
     * The box to observe.
     */
    box?: ResizeObserverBoxOptions;
    /**
     * The callback function to call when the size changes.
     */
    onResize: () => void;
};

/**
 * A hook that observes the size of an element and calls a callback function when the size changes.
 * @param options - The options for the hook.
 */
export function useResizeObserver<T extends Element>(options: useResizeObserverOptionsType<T>) {
    const { ref, box, onResize } = options;

    useEffect(() => {
        const element = ref?.current;
        if (!element) {
            return;
        }

        if (!hasResizeObserver()) {
            window.addEventListener("resize", onResize, false);

            return () => {
                window.removeEventListener("resize", onResize, false);
            };
        } else {
            const resizeObserverInstance = new window.ResizeObserver((entries) => {
                if (!entries.length) {
                    return;
                }

                onResize();
            });

            resizeObserverInstance.observe(element, { box });

            return () => {
                if (element) {
                    resizeObserverInstance.unobserve(element);
                }
            };
        }
    }, [onResize, ref, box]);
}
