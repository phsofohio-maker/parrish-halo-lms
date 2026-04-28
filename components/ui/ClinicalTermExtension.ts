import { Mark, mergeAttributes } from '@tiptap/core';

export interface ClinicalTermAttributes {
  termId: string;
  term: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    clinicalTerm: {
      setClinicalTerm: (attrs: ClinicalTermAttributes) => ReturnType;
      unsetClinicalTerm: () => ReturnType;
    };
  }
}

export const ClinicalTerm = Mark.create({
  name: 'clinicalTerm',

  addAttributes() {
    return {
      termId: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-term-id'),
        renderHTML: (attrs: Record<string, any>) =>
          attrs.termId ? { 'data-term-id': attrs.termId } : {},
      },
      term: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-term'),
        renderHTML: (attrs: Record<string, any>) =>
          attrs.term ? { 'data-term': attrs.term } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-term-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { class: 'clinical-term' }),
      0,
    ];
  },

  addCommands() {
    return {
      setClinicalTerm:
        (attrs) =>
        ({ commands }) =>
          commands.setMark(this.name, attrs),
      unsetClinicalTerm:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});
