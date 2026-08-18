/**
 * Renders the CPVS logo, themed. Light theme shows the real multi-color
 * logo (navy/teal) as a plain <img>. Dark and Aether themes instead show a
 * CSS-masked <span> that reuses the same PNG's alpha channel as a stencil
 * and fills it with a solid theme color — white in dark (unchanged from
 * before), lime green (rgb(var(--primary-600)), #ADFF2F) in Aether.
 *
 * Both layers are always in the DOM; index.css toggles which one is
 * `display`ed per theme class (.dark / .theme-aether), so this component
 * itself doesn't need to know or check the current theme.
 *
 * The wrapper is sized explicitly via the source PNG's own aspect ratio
 * (1396x1023) rather than by its children's intrinsic size — necessary
 * because whichever layer is hidden for the active theme is `display: none`
 * (removed from flow), and the visible mask layer is `position: absolute`
 * (also out of flow), so nothing would otherwise give the wrapper a size.
 */
export default function Wordmark({ className = 'h-11' }: { className?: string }) {
  return (
    <span className={`relative inline-block aspect-[1396/1023] ${className}`}>
      <img src="/wordmark.png" alt="CPVS" className="wordmark-img absolute inset-0 h-full w-full object-contain" />
      <span className="wordmark-mask absolute inset-0 h-full w-full" aria-hidden="true" />
    </span>
  );
}
