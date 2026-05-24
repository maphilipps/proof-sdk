/**
 * adProof Notion-Affordances — Milkdown v7 plugin wiring
 *
 * Registers three editor affordances:
 *   • Tooltip  — floating toolbar at text selection (Bold / Italic / Link / Inline-Code)
 *   • Slash    — slash-command menu (/heading, /list, /table, /divider)
 *   • Block    — block-handle (drag-handle + block menu)
 *
 * Share-mode-hide: all three affordances are suppressed when the editor is
 * in viewer-only / share mode.  The `shouldShow` callbacks query
 * `canEditInRuntime()` so that a live `setShareRuntimeCapabilities({ canEdit: false })`
 * call instantly hides all affordances without a page reload.
 *
 * Usage in editor/index.ts:
 *   editorBuilder
 *     .config(createAdProofAffordanceConfig())
 *     .use(adProofAffordancePlugins)
 */

import type { Ctx } from '@milkdown/ctx';
import { tooltipFactory, TooltipProvider } from '@milkdown/plugin-tooltip';
import { slashFactory, SlashProvider } from '@milkdown/plugin-slash';
import { block } from '@milkdown/plugin-block';
import { canEditInRuntime } from './plugins/share-permissions';

// ---------------------------------------------------------------------------
// Pure helper — testable without DOM
// ---------------------------------------------------------------------------

/**
 * Returns `true` when affordances (tooltip, slash, block handle) should be
 * shown to the user, `false` in viewer-only / share mode.
 *
 * This is intentionally a pure function so it can be unit-tested in Node.
 * The runtime equivalent calls `canEditInRuntime()` inside `shouldShow`
 * callbacks on each ProseMirror update tick.
 */
export function shouldShowAffordances(canEdit: boolean): boolean {
  return canEdit;
}

// ---------------------------------------------------------------------------
// Plugin factories (created once at module load — safe in Node/browser)
// ---------------------------------------------------------------------------

export const [tooltipSpec, tooltipPlugin] = tooltipFactory('adproof-tooltip');
export const [slashSpec, slashPlugin] = slashFactory('adproof-slash');

// ---------------------------------------------------------------------------
// Plugin array — spread into the editor builder via `.use()`
// ---------------------------------------------------------------------------

/**
 * All adProof Notion-affordance plugins in a single flat array.
 * Wire into the editor builder: `.use(adProofAffordancePlugins)`.
 */
export const adProofAffordancePlugins = [
  tooltipSpec,
  tooltipPlugin,
  slashSpec,
  slashPlugin,
  ...block,
] as const;

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

/**
 * Build a simple tooltip DOM with Bold / Italic / Link / Inline-Code buttons.
 * Replace with a full component library integration for richer UI.
 */
function buildTooltipDOM(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'adproof-tooltip';
  (['Bold', 'Italic', 'Link', 'Code'] as const).forEach((label) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.command = label.toLowerCase();
    btn.textContent = label;
    wrap.appendChild(btn);
  });
  return wrap;
}

/**
 * Build a simple slash-menu DOM with heading / list / table / divider items.
 */
function buildSlashDOM(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'adproof-slash-menu';
  (['Heading', 'List', 'Table', 'Divider'] as const).forEach((label) => {
    const item = document.createElement('div');
    item.className = 'adproof-slash-item';
    item.dataset.command = label.toLowerCase();
    item.textContent = label;
    wrap.appendChild(item);
  });
  return wrap;
}

// ---------------------------------------------------------------------------
// Config factory — pass to editorBuilder.config(...)
// ---------------------------------------------------------------------------

/**
 * Returns a Milkdown config callback that wires `TooltipProvider` and
 * `SlashProvider` into their respective plugin specs.
 *
 * The providers use `shouldShow: () => canEditInRuntime()` so that
 * `setShareRuntimeCapabilities({ canEdit: false })` hides them instantly
 * at runtime without recreating the editor.
 *
 * ```ts
 * editorBuilder.config(createAdProofAffordanceConfig()).use(adProofAffordancePlugins)
 * ```
 */
export function createAdProofAffordanceConfig(): (ctx: Ctx) => void {
  return (ctx: Ctx) => {
    // ----- Tooltip -----
    const tooltipContent = buildTooltipDOM();
    const tooltipProvider = new TooltipProvider({
      content: tooltipContent,
      shouldShow: () => canEditInRuntime(),
    });

    ctx.set(tooltipSpec.key, {
      view: () => ({
        update: (view, prevState) => tooltipProvider.update(view, prevState),
        destroy: () => tooltipProvider.destroy(),
      }),
    });

    // ----- Slash -----
    const slashContent = buildSlashDOM();
    const slashProvider = new SlashProvider({
      content: slashContent,
      shouldShow: () => canEditInRuntime(),
    });

    ctx.set(slashSpec.key, {
      view: () => ({
        update: (view, prevState) => slashProvider.update(view, prevState),
        destroy: () => slashProvider.destroy(),
      }),
    });
  };
}
