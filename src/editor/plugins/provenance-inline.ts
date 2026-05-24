/**
 * Provenance Inline Decoration Plugin (adProof)
 *
 * Liest proofAuthored-Marks und legt farbige Inline-Decorations
 * (CSS-Klassen) auf die entsprechenden Text-Ranges.
 *
 * Klassen:
 *   prov-human   → menschlich verfasster Text (mint-transparent)
 *   prov-ai-free → KI ohne Quellennachweis (lavender-transparent)
 *
 * ai-with-source-Klasse folgt in #17 (INT-2), wenn Sources-Index verfügbar.
 */
import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey, type EditorState } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import type { Node as ProseMirrorNode } from '@milkdown/kit/prose/model';

const provenanceInlineKey = new PluginKey<DecorationSet>('provenance-inline');

function byToClass(by: string | undefined): string {
  if (!by || by.startsWith('human:') || by === 'human') return 'prov-human';
  if (by.startsWith('ai:') || by === 'ai') return 'prov-ai-free';
  return 'prov-human'; // unbekannte Origin → konservativ human
}

function buildDecorations(state: EditorState): DecorationSet {
  const markType = state.schema.marks.proofAuthored;
  if (!markType) return DecorationSet.empty;

  const decorations: Decoration[] = [];

  state.doc.descendants((node: ProseMirrorNode, pos: number) => {
    if (!node.isInline) return;
    const authoredMark = node.marks.find(m => m.type === markType);
    if (!authoredMark) return;

    const by = typeof authoredMark.attrs.by === 'string' ? authoredMark.attrs.by : undefined;
    decorations.push(
      Decoration.inline(pos, pos + node.nodeSize, { class: byToClass(by) })
    );
  });

  return DecorationSet.create(state.doc, decorations);
}

export const provenanceInlinePlugin = $prose(() => {
  return new Plugin<DecorationSet>({
    key: provenanceInlineKey,
    state: {
      init: (_, state) => buildDecorations(state),
      apply(tr, pluginState, _oldState, newState) {
        if (!tr.docChanged) return pluginState;
        return buildDecorations(newState);
      },
    },
    props: {
      decorations(state) {
        return provenanceInlineKey.getState(state) ?? DecorationSet.empty;
      },
    },
  });
});

export default provenanceInlinePlugin;
